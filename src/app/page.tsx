"use client";

import { useState, useEffect, useRef } from "react";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth, googleProvider, db } from "@/firebase";
import { collection, onSnapshot, updateDoc, deleteDoc, doc, deleteField } from "firebase/firestore";

// Interfaces para tipado robusto de datos
interface Message {
  messageId: string;
  sender: string;
  recipient: string;
  subject: string;
  date: string;
  body: string;
}

interface EmailGroup {
  threadId: string;
  subject: string;
  sender: string;
  recipient: string;
  hasUnread: boolean;
  date?: string;
  messages: Message[];
}

interface Case {
  id: string;
  title: string;
  status: string; // 'activo' | 'resuelto'
  createdAt: string;
  updatedAt: string;
  inicial?: EmailGroup;
  levantamiento?: EmailGroup;
  postMortem?: string;
  pinned?: boolean;
  starred?: boolean;
}

interface AppNotification {
  id: string;
  message: string;
  timestamp: string;
  type: "new_thread" | "new_orphan" | "archived" | "reopened" | "linked";
  read: boolean;
}

interface ToastMessage {
  id: string;
  message: string;
  type: "new_thread" | "new_orphan" | "archived" | "reopened" | "linked";
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"threads">("threads");

  // Nickname states
  const [nickname, setNickname] = useState("");
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [tempNickname, setTempNickname] = useState("");

  // Case title edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");

  // Post-mortem states
  const [isEditingPostMortem, setIsEditingPostMortem] = useState(false);
  const [tempPostMortem, setTempPostMortem] = useState("");

  // Obtener mensajes cronológicos combinando inicial y levantamiento
  const getChronologicalMessages = (c: Case) => {
    const list: { msg: Message; type: "inicial" | "levantamiento" }[] = [];
    if (c.inicial?.messages) {
      c.inicial.messages.forEach(m => list.push({ msg: m, type: "inicial" }));
    }
    if (c.levantamiento?.messages) {
      c.levantamiento.messages.forEach(m => list.push({ msg: m, type: "levantamiento" }));
    }
    return list.sort((a, b) => new Date(a.msg.date).getTime() - new Date(b.msg.date).getTime());
  };

  // Firestore states
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [isLinkingOrphanId, setIsLinkingOrphanId] = useState<string | null>(null);
  const [activeLinkInitialCaseId, setActiveLinkInitialCaseId] = useState<string | null>(null);
  const [activeMenuCaseId, setActiveMenuCaseId] = useState<string | null>(null);
  const [linkSearchTerm, setLinkSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"activo" | "resuelto" | "huerfanos">("activo");

  // Estados de Notificaciones
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Referencias para seguimiento en tiempo real
  const prevCasesRef = useRef<Case[]>([]);
  const isFirstLoadRef = useRef(true);

  // Estado para controlar qué mensajes están expandidos en el modal
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({});

  // Helper para alternar la expansión de un mensaje largo
  const toggleMessageExpand = (messageId: string) => {
    setExpandedMessageIds(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  // Helper para dar formato básico (negrita y saltos de línea) al texto del correo
  const renderFormattedBody = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const parts = [];
      const boldRegex = /\*([^*]+)\*/g;
      let match;
      let lastIndex = 0;
      
      while ((match = boldRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index));
        }
        parts.push(
          <strong key={match.index} className="font-bold text-zinc-900 dark:text-zinc-50">
            {match[1]}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      
      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex));
      }
      
      return (
        <span key={idx} className="block min-h-[1.2em]">
          {parts.length > 0 ? parts : line}
        </span>
      );
    });
  };

  // Load saved theme or system preference on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  // Sincronizar tema con la clase .dark global de Tailwind en el DOM
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Monitor auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Close notifications dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setIsNotificationsOpen(false);
    };
    if (isNotificationsOpen) {
      window.addEventListener("click", handleOutsideClick);
    }
    return () => {
      window.removeEventListener("click", handleOutsideClick);
    };
  }, [isNotificationsOpen]);

  // Función para disparar notificaciones persistentes y toasts flotantes
  const triggerNotification = (message: string, type: AppNotification["type"]) => {
    const id = Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();

    // 1. Notificación persistente
    const newNotification: AppNotification = {
      id,
      message,
      timestamp,
      type,
      read: false
    };
    setNotifications(prev => [newNotification, ...prev]);

    // 2. Toast temporal (duración 6s)
    const newToast: ToastMessage = {
      id,
      message,
      type
    };
    setToasts(prev => [...prev, newToast]);

    // Autodestruir el toast después de 6 segundos (duración de la animación)
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  // Escucha en tiempo real de los casos en Firestore
  useEffect(() => {
    if (!user) return;
    const casesRef = collection(db, "cases");
    const unsubscribe = onSnapshot(casesRef, (snapshot) => {
      const list: Case[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Case);
      });

      // Lógica de detección de cambios en tiempo real para notificaciones y toasts
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
      } else {
        snapshot.docChanges().forEach((change) => {
          const docId = change.doc.id;
          const data = change.doc.data() as Case;
          const prevCases = prevCasesRef.current;

          if (change.type === "added") {
            const isOrphan = !data.inicial && data.levantamiento;
            const message = isOrphan 
              ? `Nuevo huérfano detectado: ${data.levantamiento?.subject || data.title}`
              : `Nuevo hilo creado: ${data.inicial?.subject || data.title}`;
            const notificationType = isOrphan ? "new_orphan" : "new_thread";

            triggerNotification(message, notificationType);
          } else if (change.type === "modified") {
            const prev = prevCases.find(c => c.id === docId);
            if (prev) {
              if (prev.status === "activo" && data.status === "resuelto") {
                triggerNotification(`Hilo archivado: ${data.inicial?.subject || data.title}`, "archived");
              } else if (prev.status === "resuelto" && data.status === "activo") {
                triggerNotification(`Hilo reabierto: ${data.inicial?.subject || data.title}`, "reopened");
              }
              if (!prev.levantamiento && data.levantamiento) {
                triggerNotification(`Derivación vinculada al hilo: ${data.inicial?.subject || data.title}`, "linked");
              }
            }
          }
        });
      }

      setCases(list);
      prevCasesRef.current = list;
    }, (error) => {
      console.error("Error al escuchar Firestore:", error);
    });
    return () => unsubscribe();
  }, [user]);

  // Sync selected case title when DB changes
  useEffect(() => {
    if (selectedCase) {
      const current = cases.find(c => c.id === selectedCase.id);
      if (current) {
        if (current.title !== selectedCase.title) {
          setSelectedCase(current);
        }
        // Also sync postMortem if it changed in Firestore
        if (current.postMortem !== selectedCase.postMortem) {
          setSelectedCase(current);
        }
      }
    }
  }, [cases, selectedCase]);

  // Sync post-mortem note when selectedCase is opened
  useEffect(() => {
    if (selectedCase) {
      setTempPostMortem(selectedCase.postMortem || "");
      setIsEditingPostMortem(!selectedCase.postMortem);
    }
  }, [selectedCase?.id]);

  // Load nickname from localStorage once user is loaded
  useEffect(() => {
    if (user) {
      const savedNickname = localStorage.getItem(`nickname_${user.uid}`);
      if (savedNickname) {
        setNickname(savedNickname);
      } else {
        const defaultNickname = user.displayName ? user.displayName.split(" ")[0] : "USUARIO";
        setNickname(defaultNickname);
      }
    }
  }, [user]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setIsProfileOpen(false);
    };
    if (isProfileOpen) {
      window.addEventListener("click", handleOutsideClick);
    }
    return () => {
      window.removeEventListener("click", handleOutsideClick);
    };
  }, [isProfileOpen]);

  // Close active dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuCaseId(null);
    };
    if (activeMenuCaseId) {
      window.addEventListener("click", handleOutsideClick);
    }
    return () => {
      window.removeEventListener("click", handleOutsideClick);
    };
  }, [activeMenuCaseId]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Hubo un error al iniciar sesión:", error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsProfileOpen(false);
      setNickname("");
    } catch (error: any) {
      console.error("Error al cerrar sesión:", error.message);
    }
  };

  const saveNickname = () => {
    const trimmed = tempNickname.trim();
    if (trimmed && user) {
      setNickname(trimmed);
      localStorage.setItem(`nickname_${user.uid}`, trimmed);
    }
    setIsEditingNickname(false);
  };

  const handleNicknameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      saveNickname();
    } else if (e.key === "Escape") {
      setIsEditingNickname(false);
    }
  };

  // Case title save action
  const saveCaseTitle = async () => {
    if (!selectedCase) return;
    const trimmed = tempTitle.trim();
    if (trimmed && trimmed !== selectedCase.title) {
      try {
        const caseRef = doc(db, "cases", selectedCase.id);
        await updateDoc(caseRef, {
          title: trimmed,
          updatedAt: new Date().toISOString()
        });
        setSelectedCase(prev => prev ? { ...prev, title: trimmed } : null);
      } catch (err) {
        console.error("Error al guardar título del caso:", err);
      }
    }
    setIsEditingTitle(false);
  };

  // Save post-mortem action
  const savePostMortem = async (caseId: string, text: string) => {
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        postMortem: text.trim(),
        updatedAt: new Date().toISOString()
      });
      setSelectedCase(prev => prev ? { ...prev, postMortem: text.trim() } : null);
      setIsEditingPostMortem(false);
    } catch (err) {
      console.error("Error al guardar post-mortem:", err);
    }
  };

  // Delete post-mortem action
  const deletePostMortem = async (caseId: string) => {
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        postMortem: "",
        updatedAt: new Date().toISOString()
      });
      setSelectedCase(prev => prev ? { ...prev, postMortem: "" } : null);
      setTempPostMortem("");
      setIsEditingPostMortem(true);
    } catch (err) {
      console.error("Error al eliminar post-mortem:", err);
    }
  };

  // Toggle case status action (activo / resuelto)
  const toggleCaseStatus = async (caseId: string, newStatus: string) => {
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      setSelectedCase(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (err) {
      console.error("Error al actualizar estado del caso:", err);
    }
  };

  // Acciones sobre los casos
  const markAsRead = async (caseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        "inicial.hasUnread": false,
        "levantamiento.hasUnread": false
      });
      // Actualizar el estado local para el modal si está abierto
      if (selectedCase && selectedCase.id === caseId) {
        setSelectedCase((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            inicial: prev.inicial ? { ...prev.inicial, hasUnread: false } : undefined,
            levantamiento: prev.levantamiento ? { ...prev.levantamiento, hasUnread: false } : undefined
          };
        });
      }
    } catch (err) {
      console.error("Error al marcar como leído:", err);
    }
  };

  const archiveCase = async (caseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        status: "resuelto"
      });
      if (selectedCase?.id === caseId) {
        setSelectedCase(null);
      }
    } catch (err) {
      console.error("Error al archivar caso:", err);
    }
  };

  const unarchiveCase = async (caseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        status: "activo"
      });
      if (selectedCase?.id === caseId) {
        setSelectedCase(null);
      }
    } catch (err) {
      console.error("Error al desarchivar caso:", err);
    }
  };

  // Vinculación manual de un caso huérfano con uno inicial
  const handleLinkOrphan = async (inicialCaseId: string) => {
    if (!isLinkingOrphanId) return;
    const orphanCase = cases.find(c => c.id === isLinkingOrphanId);
    if (!orphanCase || !orphanCase.levantamiento) return;

    try {
      // 1. Vincular el objeto levantamiento del huérfano al caso inicial
      const inicialRef = doc(db, "cases", inicialCaseId);
      await updateDoc(inicialRef, {
        levantamiento: orphanCase.levantamiento,
        updatedAt: new Date().toISOString()
      });

      // 2. Eliminar el caso huérfano de la colección
      const orphanRef = doc(db, "cases", isLinkingOrphanId);
      await deleteDoc(orphanRef);

      // Limpiar estados locales
      setIsLinkingOrphanId(null);
      setLinkSearchTerm("");
    } catch (err) {
      console.error("Error al vincular el caso huérfano:", err);
      alert("No se pudo realizar la vinculación manual.");
    }
  };

  // Toggle pin status
  const togglePinCase = async (caseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetCase = cases.find(c => c.id === caseId);
    if (!targetCase) return;
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        pinned: !targetCase.pinned,
        updatedAt: new Date().toISOString()
      });
      setActiveMenuCaseId(null);
    } catch (err) {
      console.error("Error al fijar/desfijar caso:", err);
    }
  };

  // Toggle star/flag status
  const toggleStarCase = async (caseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetCase = cases.find(c => c.id === caseId);
    if (!targetCase) return;
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        starred: !targetCase.starred,
        updatedAt: new Date().toISOString()
      });
      setActiveMenuCaseId(null);
    } catch (err) {
      console.error("Error al destacar caso:", err);
    }
  };

  // Delete case definitively
  const deleteCase = async (caseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("¿Estás seguro de que deseas eliminar este hilo definitivamente?")) return;
    try {
      const caseRef = doc(db, "cases", caseId);
      await deleteDoc(caseRef);
      setActiveMenuCaseId(null);
    } catch (err) {
      console.error("Error al eliminar el caso:", err);
    }
  };

  // Unlink levantamiento from a case
  const unlinkCase = async (caseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetCase = cases.find(c => c.id === caseId);
    if (!targetCase || !targetCase.levantamiento) return;
    if (!confirm("¿Estás seguro de que deseas desvincular la derivación de este caso? Esto lo convertirá en un hilo huérfano.")) return;
    try {
      const { setDoc, doc } = await import("firebase/firestore");
      
      // 1. Create a new orphan case with the levantamiento data
      const newOrphanId = `orphan_${targetCase.levantamiento.threadId}_${Date.now()}`;
      await setDoc(doc(db, "cases", newOrphanId), {
        title: targetCase.levantamiento.subject,
        status: "activo",
        createdAt: targetCase.levantamiento.messages?.[0]?.date || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        levantamiento: targetCase.levantamiento
      });

      // 2. Remove the levantamiento from the initial case
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        levantamiento: deleteField(),
        updatedAt: new Date().toISOString()
      });
      setActiveMenuCaseId(null);
    } catch (err) {
      console.error("Error al desvincular caso:", err);
    }
  };

  // Link manual from initial case side
  const handleLinkOrphanToInitial = async (orphanCaseId: string) => {
    if (!activeLinkInitialCaseId) return;
    const orphanCase = cases.find(c => c.id === orphanCaseId);
    if (!orphanCase || !orphanCase.levantamiento) return;

    try {
      // 1. Vincular el objeto levantamiento al caso inicial
      const inicialRef = doc(db, "cases", activeLinkInitialCaseId);
      await updateDoc(inicialRef, {
        levantamiento: orphanCase.levantamiento,
        updatedAt: new Date().toISOString()
      });

      // 2. Eliminar el caso huérfano
      const orphanRef = doc(db, "cases", orphanCaseId);
      await deleteDoc(orphanRef);

      // Limpiar estados
      setActiveLinkInitialCaseId(null);
      setLinkSearchTerm("");
    } catch (err) {
      console.error("Error al vincular derivación al caso inicial:", err);
      alert("No se pudo realizar la vinculación manual.");
    }
  };

  // Generador de datos de prueba local en Firestore
  const generateMockThreads = async () => {
    try {
      const { setDoc, doc } = await import("firebase/firestore");
      
      // Hilo 1: Caso de Facturación (Completo)
      await setDoc(doc(db, "cases", "thread_mock_facturacion"), {
        title: "Error de facturación en la suscripción anual",
        status: "activo",
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
        inicial: {
          threadId: "thread_mock_facturacion",
          subject: "Error de facturación en la suscripción anual",
          sender: "Juan Pérez <juan.perez@cliente.com>",
          recipient: "soporte@mostaccio.com",
          hasUnread: true,
          messages: [
            {
              messageId: "msg_inicial_1",
              sender: "Juan Pérez <juan.perez@cliente.com>",
              recipient: "soporte@mostaccio.com",
              subject: "Error de facturación en la suscripción anual",
              date: new Date(Date.now() - 3600000 * 2).toISOString(),
              body: "Hola soporte, he notado un cobro doble en mi tarjeta para la suscripción anual. Por favor revisar."
            }
          ]
        },
        levantamiento: {
          threadId: "thread_derivado_facturacion",
          subject: "Fwd: Error de facturación en la suscripción anual - Derivación Caso #1023",
          sender: "soporte@mostaccio.com",
          recipient: "finanzas@mostaccio.com",
          hasUnread: false,
          messages: [
            {
              messageId: "msg_derivado_1",
              sender: "soporte@mostaccio.com",
              recipient: "finanzas@mostaccio.com",
              subject: "Fwd: Error de facturación en la suscripción anual - Derivación Caso #1023",
              date: new Date(Date.now() - 3600000).toISOString(),
              body: "Hola finanzas, les derivo este caso del cliente Juan Pérez para reembolso del cobro duplicado."
            }
          ]
        }
      });

      // Hilo 2: Acuerdo Comercial (Pendiente de derivación)
      await setDoc(doc(db, "cases", "thread_mock_compras"), {
        title: "Propuesta de Acuerdo Comercial y Precios 2026",
        status: "activo",
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        inicial: {
          threadId: "thread_mock_compras",
          subject: "Propuesta de Acuerdo Comercial y Precios 2026",
          sender: "María Gómez <m.gomez@proveedor.com>",
          recipient: "compras@mostaccio.com",
          hasUnread: false,
          messages: [
            {
              messageId: "msg_inicial_2",
              sender: "María Gómez <m.gomez@proveedor.com>",
              recipient: "compras@mostaccio.com",
              subject: "Propuesta de Acuerdo Comercial y Precios 2026",
              date: new Date(Date.now() - 3600000 * 4).toISOString(),
              body: "Estimados compras, adjunto la propuesta de precios y el borrador del acuerdo para el próximo año."
            }
          ]
        }
      });

      // Huérfano: Correo de Derivación sin vincular (Para vincular a Hilo 2)
      await setDoc(doc(db, "cases", "thread_mock_huerfano_legal"), {
        title: "Revisión urgente de cláusula de rescisión",
        status: "activo",
        createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
        levantamiento: {
          threadId: "thread_mock_huerfano_legal",
          subject: "Revisión urgente de cláusula de rescisión - Contrato Proveedores",
          sender: "compras@mostaccio.com",
          recipient: "legal@mostaccio.com",
          hasUnread: true,
          messages: [
            {
              messageId: "msg_huerfano_1",
              sender: "compras@mostaccio.com",
              recipient: "legal@mostaccio.com",
              subject: "Revisión urgente de cláusula de rescisión - Contrato Proveedores",
              date: new Date(Date.now() - 3600000 * 3).toISOString(),
              body: "Hola legal, por favor revisar si la cláusula 5 de rescisión en el borrador de contratos 2026 es aceptable."
            }
          ]
        }
      });

    } catch (err) {
      console.error("Error al generar hilos ficticios:", err);
      alert("No se pudieron generar los hilos ficticios.");
    }
  };

  // Auxiliares para formatear la fecha
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Auxiliares para extraer nombre y correo de los campos de remitente/destinatario
  const cleanSenderName = (senderStr?: string) => {
    if (!senderStr) return "";
    if (senderStr.includes("<")) {
      return senderStr.split("<")[0].trim();
    }
    return senderStr;
  };

  const cleanSenderEmail = (senderStr?: string) => {
    if (!senderStr) return "";
    const match = senderStr.match(/<([^>]+)>/);
    return match ? match[1] : senderStr;
  };

  // Helper to sort cases: pinned first, then chronological (newest first)
  const sortCases = (list: Case[]) => {
    return [...list].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const dateA = a.inicial?.messages?.[0]?.date || a.createdAt;
      const dateB = b.inicial?.messages?.[0]?.date || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  };

  // Clasificación de hilos
  const activeCases = sortCases(cases.filter(c => c.status === "activo" && c.inicial));
  const archivedCases = sortCases(cases.filter(c => c.status === "resuelto" && c.inicial));
  const orphanCases = cases.filter(c => c.status === "activo" && !c.inicial && c.levantamiento);

  const displayedCases = filterStatus === "activo" ? activeCases : archivedCases;

  // Grayscale variables based on theme (Bordes suaves y grises para un diseño flat y minimalista de alto contraste)
  const bgMain = theme === "light" ? "bg-[#F8F9FA]" : "bg-[#0B0B0C]";
  const bgSecondary = theme === "light" ? "bg-white" : "bg-[#161618]";
  const textMain = theme === "light" ? "text-zinc-900" : "text-zinc-50";
  const textSecondary = theme === "light" ? "text-zinc-500" : "text-zinc-400";
  const borderMain = theme === "light" ? "border-zinc-200/40" : "border-zinc-800/45";
  const hoverBg = theme === "light" ? "hover:bg-zinc-100/50" : "hover:bg-zinc-800/40";
  const activeBg = theme === "light" ? "bg-zinc-100" : "bg-zinc-800";
  
  // Component specific colors (Modern SaaS/macOS dynamic values)
  const cardHeaderBg = theme === "light" ? "bg-zinc-50/30" : "bg-zinc-900/30";
  const cardLeftBg = theme === "light" 
    ? "bg-[#F99243]/[0.03] group-hover:bg-[#F99243]/[0.06]" 
    : "bg-[#F99243]/[0.015] group-hover:bg-[#F99243]/[0.03]";
  const cardRightBg = theme === "light" 
    ? "bg-[#1A1615]/[0.02] group-hover:bg-[#1A1615]/[0.04]" 
    : "bg-[#1A1615]/75 group-hover:bg-[#1A1615]/90";
  const innerCardBg = theme === "light" ? "bg-white border border-zinc-200/40" : "bg-[#161618] border border-zinc-800/45";
  const modalHeaderBg = theme === "light" ? "bg-white" : "bg-[#161618]";
  const modalFooterBg = theme === "light" ? "bg-white" : "bg-[#161618]";
  const modalBodyBg = theme === "light" ? "bg-zinc-50/30" : "bg-[#0B0B0C]/30";
  const messageItemBg = theme === "light" ? "bg-zinc-50 border border-zinc-200/40" : "bg-zinc-900 border border-zinc-800/50";
  
  const badgeStyleBlue = theme === "light" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-blue-950/30 text-blue-300 border border-blue-900/30";
  const badgeStylePurple = theme === "light" ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-purple-950/30 text-purple-300 border border-purple-900/30";
  const badgeStyleYellow = theme === "light" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-amber-950/30 text-amber-300 border border-amber-900/30";
  
  const labelHeaderStyle = theme === "light" ? "text-zinc-900" : "text-zinc-50";
  const gmailLinkStyle = theme === "light" ? "text-zinc-400 hover:text-zinc-800 transition-colors" : "text-zinc-500 hover:text-zinc-100 transition-colors";
  const inputBg = theme === "light" ? "bg-zinc-100/70" : "bg-zinc-800/80";
  const modalOverlayBg = theme === "light" ? "bg-zinc-950/20 backdrop-blur-lg" : "bg-zinc-950/80 backdrop-blur-lg";
  const modalContainerBg = theme === "light" ? "bg-white" : "bg-[#161618]";

  // Dynamic explicit theme styles for button contrast and subheaders (Segmented Controls)
  const filterActiveStyle = theme === "light" 
    ? "bg-white text-zinc-900 shadow-xs font-semibold" 
    : "bg-zinc-700 text-zinc-50 shadow-xs font-semibold";
  const filterInactiveStyle = theme === "light" 
    ? "text-zinc-500 hover:text-zinc-900" 
    : "text-zinc-400 hover:text-zinc-100";

  const primaryButtonStyle = theme === "light"
    ? "bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs transition-all duration-200 active:scale-[0.98] font-semibold"
    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 shadow-xs transition-all duration-200 active:scale-[0.98] font-semibold";
  const secondaryButtonStyle = theme === "light"
    ? "border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 shadow-xs transition-all duration-200 active:scale-[0.98] font-semibold"
    : "border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 shadow-xs transition-all duration-200 active:scale-[0.98] font-semibold";
  const dangerButtonStyle = theme === "light"
    ? "bg-red-50 hover:bg-red-100 text-red-650 border border-red-200/60 shadow-xs transition-all duration-200 active:scale-[0.98] font-semibold"
    : "bg-red-950/20 hover:bg-red-950/40 text-red-300 border border-red-900/30 shadow-xs transition-all duration-200 active:scale-[0.98] font-semibold";

  const linkButtonStyle = theme === "light"
    ? "bg-zinc-800 hover:bg-zinc-700 text-white transition-all duration-200 active:scale-[0.98]"
    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 transition-all duration-200 active:scale-[0.98]";

  // Monospace font character width (text-xs is approx 7.2px per character)
  const charWidth = 7.2;

  // 1. PANTALLA DE CARGANDO SESIÓN
  if (authLoading) {
    return (
      <div className={`flex h-screen w-screen items-center justify-center ${bgMain} ${textMain} text-xs`}>
        <div className="flex flex-col items-center gap-3">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" />
          </svg>
          <span className="uppercase tracking-widest text-[10px]">Sincronizando sesión...</span>
        </div>
      </div>
    );
  }

  // 2. PANTALLA DE INICIO DE SESIÓN
  if (!user) {
    return (
      <div className={`flex h-screen w-screen items-center justify-center ${bgMain} ${textMain} relative overflow-hidden transition-colors duration-300 p-4`}>
        {/* Gradientes decorativos de fondo al estilo SaaS Moderno */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-red-500/5 blur-[100px] pointer-events-none dark:bg-red-950/10" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[60%] rounded-full bg-green-500/5 blur-[100px] pointer-events-none dark:bg-green-950/10" />
        
        <div className={`relative z-10 w-full max-w-sm border border-zinc-200/20 dark:border-zinc-800/15 ${bgSecondary} rounded-3xl p-8 text-center space-y-6 shadow-xl shadow-zinc-200/20 dark:shadow-black/60`}>
          <div className="flex flex-col items-center gap-3">
            <img src="/logo.webp" alt="Logo" className="w-10 h-10 object-contain" style={theme === "dark" ? { filter: "brightness(0) invert(1)" } : undefined} />
            <div className="space-y-1">
              <span className="text-base font-semibold tracking-widest uppercase block">
                MOSTACCIO
              </span>
              <p className={`text-[9px] ${textSecondary} uppercase tracking-widest font-semibold`}>
                Gestión de Casos & Hilos
              </p>
            </div>
          </div>

          <div className="pt-2 space-y-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Ingresa con tu cuenta de Google para comenzar a gestionar tus hilos de conversación.
            </p>

            <button
              onClick={handleGoogleLogin}
              className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 ${primaryButtonStyle} text-xs font-bold uppercase rounded-lg transition-all`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continuar con Google</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. PANTALLA PRINCIPAL (DASHBOARD)
  return (
    <div className={`flex h-screen w-screen overflow-hidden ${bgMain} ${textMain} font-sans text-sm transition-colors duration-300 p-3.5`}>
      
      {/* BARRA LATERAL (SIDEBAR) */}
      <aside className="w-56 flex flex-col h-full shrink-0 z-10 p-2 space-y-6">
        {/* Branding minimalista */}
        <div className="px-4 pt-4 flex items-center justify-start">
          <span className="text-[11px] font-bold tracking-widest text-zinc-400 dark:text-zinc-500 uppercase select-none">
            Mostaccio
          </span>
        </div>

        {/* Opciones de Navegación */}
        <nav className="flex-1 px-2 space-y-1">
          <button
            onClick={() => setActiveTab("threads")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-xs text-left transition-all duration-200 ${
              activeTab === "threads" 
                ? "bg-white dark:bg-[#161618] text-zinc-900 dark:text-zinc-50 shadow-xs font-semibold" 
                : `${textSecondary} hover:bg-zinc-200/40 dark:hover:bg-zinc-800/30`
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <span>Hilos</span>
          </button>
        </nav>

        {/* Interruptor de Tema */}
        <div className="px-4 py-2 flex items-center justify-between">
          <span className={`text-[9px] uppercase font-bold tracking-wider ${textSecondary}`}>TEMA</span>
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-2 p-1.5 rounded-xl border ${borderMain} bg-white dark:bg-[#161618] ${hoverBg} transition-all duration-200`}
            title="Cambiar tema"
          >
            {theme === "light" ? (
              <>
                <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="text-[9px] font-bold uppercase pr-1 text-zinc-600">Oscuro</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span className="text-[9px] font-bold uppercase pr-1 text-zinc-300">Claro</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* CONTENEDOR PRINCIPAL FLOTANTE */}
      <div className={`flex-1 flex flex-col h-full overflow-hidden ${bgSecondary} rounded-2xl border ${borderMain} shadow-xs transition-all duration-300`}>
        
        {/* CABECERA (HEADER) */}
        <header className="h-16 px-8 flex justify-between items-center shrink-0">
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-zinc-800 dark:text-zinc-100">
              {activeTab === "threads" ? "Hilos de Conversación" : ""}
            </h1>
          </div>

          <div className="flex items-center gap-4 relative">
            {/* Saludo y Editor de Apodo */}
            <div className="flex items-center text-xs select-none">
              <span className={textSecondary}>HOLA,&nbsp;</span>
              {isEditingNickname ? (
                <div 
                  className="relative flex items-center"
                  style={{ width: `${Math.max(tempNickname.length, 1) * charWidth + 8}px` }}
                >
                  <input
                    type="text"
                    value={tempNickname}
                    onChange={(e) => setTempNickname(e.target.value)}
                    onKeyDown={handleNicknameKeyDown}
                    onBlur={saveNickname}
                    style={{ width: `${Math.max(tempNickname.length, 1) * charWidth}px` }}
                    className={`bg-transparent border-none outline-none font-bold text-xs uppercase ${textMain} caret-transparent font-mono p-0 m-0`}
                    autoFocus
                    maxLength={15}
                  />
                  {/* Blinking custom typing cursor */}
                  <span 
                    className="w-[1.5px] h-3 bg-current animate-blink absolute pointer-events-none"
                    style={{ left: `${Math.max(tempNickname.length, 1) * charWidth}px` }}
                  />
                </div>
              ) : (
                <div 
                  onClick={() => {
                    setTempNickname(nickname);
                    setIsEditingNickname(true);
                  }}
                  className="relative flex items-center cursor-pointer hover:underline decoration-dotted"
                  style={{ width: `${Math.max(nickname.length, 1) * charWidth + 8}px` }}
                >
                  <span className={`font-bold text-xs uppercase ${textMain} font-mono p-0 m-0`}>
                    {nickname}
                  </span>
                  {/* Permanent blinking custom cursor in read mode */}
                  <span 
                    className="w-[1.5px] h-3 bg-current animate-blink absolute pointer-events-none"
                    style={{ left: `${Math.max(nickname.length, 1) * charWidth}px` }}
                  />
                </div>
              )}
            </div>

            {/* Campana de Notificaciones */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsNotificationsOpen(!isNotificationsOpen);
                }}
                className={`p-1.5 rounded-lg border ${borderMain} bg-white dark:bg-[#161618] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all active:scale-95 relative flex items-center justify-center`}
                title="Notificaciones"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-650 dark:bg-red-500 rounded-full" />
                )}
              </button>

              {/* Dropdown de Notificaciones */}
              {isNotificationsOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute right-0 top-9 w-80 border ${borderMain} bg-white dark:bg-[#161618] rounded-2xl p-2.5 z-50 shadow-xl animate-dropdown-in origin-top-right`}
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100/60 dark:border-zinc-800/20 select-none">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textSecondary}`}>
                      Notificaciones
                    </span>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => {
                          setNotifications([]);
                          setIsNotificationsOpen(false);
                        }}
                        className="text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-850 dark:hover:text-zinc-150 transition-colors"
                      >
                        Limpiar todo
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto mt-1.5 space-y-0.5 pr-1">
                    {notifications.length === 0 ? (
                      <p className={`text-xs ${textSecondary} text-center py-6 italic`}>
                        Sin notificaciones recientes
                      </p>
                    ) : (
                      notifications.map((notif) => {
                        // Marcar como leída después de abrir el dropdown
                        if (!notif.read) {
                          setTimeout(() => {
                            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                          }, 1500);
                        }

                        // Punto de color basado en el tipo de notificación
                        let dotColor = "bg-blue-500";
                        if (notif.type === "new_orphan") {
                          dotColor = "bg-amber-500"; // Yellow/orange for new orphan
                        } else if (notif.type === "archived") {
                          dotColor = "bg-zinc-400"; // Gray for archived
                        } else if (notif.type === "reopened") {
                          dotColor = "bg-emerald-500"; // Green for reopened
                        } else if (notif.type === "linked") {
                          dotColor = "bg-indigo-500"; // Indigo/purple for linked
                        }

                        return (
                          <div
                            key={notif.id}
                            className={`flex gap-3.5 p-2.5 rounded-xl border border-transparent transition-opacity items-center ${
                              notif.read ? "opacity-70" : "bg-zinc-50/70 dark:bg-zinc-900/40 font-medium"
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="text-[11px] leading-snug break-words text-zinc-850 dark:text-zinc-200">
                                {notif.message}
                              </p>
                              <span className={`text-[8px] font-mono block ${textSecondary}`}>
                                {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Foto de Perfil */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileOpen(!isProfileOpen);
              }}
              className={`w-8 h-8 rounded-full border ${borderMain} flex items-center justify-center overflow-hidden hover:scale-105 transition-all duration-200`}
              aria-label="Perfil de usuario"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || "User"} className="w-full h-full object-cover" />
              ) : (
                <svg className={`w-full h-full ${theme === "light" ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-100"}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </button>

            {/* Menú de Perfil */}
            {isProfileOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-11 w-52 border ${borderMain} ${bgSecondary} rounded-2xl p-1.5 z-50 shadow-xl shadow-zinc-200/30 dark:shadow-black/70`}
              >
                <div className={`px-3 py-2 border-b ${borderMain} text-[10px] space-y-0.5`}>
                  <p className="font-bold text-zinc-850 dark:text-zinc-100 truncate">{user.displayName || "Usuario Mostaccio"}</p>
                  <p className={`truncate text-[9px] ${textSecondary}`}>{user.email}</p>
                </div>

                <button
                  onClick={() => {
                    alert("Configuración abierta");
                    setIsProfileOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 mt-1.5 text-left text-xs rounded-xl ${hoverBg} transition-colors duration-150`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1-2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Configuración</span>
                </button>
                
                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-xl ${hoverBg} text-red-650 dark:text-red-400 transition-colors duration-150`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* SUB-HEADER / FILTROS */}
        <div className="px-8 py-3 flex flex-wrap gap-4 items-center justify-between shrink-0">
          <div className="flex bg-zinc-200/60 dark:bg-zinc-800/50 p-0.5 rounded-lg text-xs select-none shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)] dark:shadow-none">
            <button
              onClick={() => setFilterStatus("activo")}
              className={`px-4 py-1 rounded-md text-xs transition-all duration-150 ${
                filterStatus === "activo" ? filterActiveStyle : filterInactiveStyle
              }`}
            >
              Activos ({activeCases.length})
            </button>
            <button
              onClick={() => setFilterStatus("resuelto")}
              className={`px-4 py-1 rounded-md text-xs transition-all duration-150 ${
                filterStatus === "resuelto" ? filterActiveStyle : filterInactiveStyle
              }`}
            >
              Archivados ({archivedCases.length})
            </button>
            <button
              onClick={() => setFilterStatus("huerfanos")}
              className={`px-4 py-1 rounded-md text-xs flex items-center gap-1.5 transition-all duration-150 ${
                filterStatus === "huerfanos" ? filterActiveStyle : filterInactiveStyle
              }`}
            >
              <span>Huérfanos</span>
              {orphanCases.length > 0 && (
                <span className="w-1.5 h-1.5 bg-red-650 dark:bg-red-500 rounded-full shrink-0" />
              )}
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-8">
          
          {/* COLUMNA DE CARDS DE HILOS */}
          <div className="space-y-6">
            {filterStatus === "huerfanos" ? (
              orphanCases.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                  <div className={`w-12 h-12 rounded-full border ${borderMain} ${bgSecondary} flex items-center justify-center`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2m0 0V6" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold uppercase tracking-wider text-xs">Sin hilos huérfanos</h3>
                    <p className={`text-xs ${textSecondary} mt-1 max-w-xs`}>
                      No hay correos de derivación huérfanos sin vincular en este momento.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {orphanCases.map((oc) => (
                    <div 
                      key={oc.id}
                      className={`p-5 rounded-2xl text-xs space-y-4 ${innerCardBg} shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <p className={`font-semibold uppercase text-xs ${labelHeaderStyle} truncate flex-1`} title={oc.title}>
                            {oc.title}
                          </p>
                          <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${badgeStyleYellow}`}>
                            Huérfano
                          </span>
                        </div>
                        <div className={`text-[10px] ${textSecondary} space-y-0.5`}>
                          <p className="truncate"><span className="font-medium">De:</span> {oc.levantamiento?.sender || "Desconocido"}</p>
                          <p className="truncate"><span className="font-medium">Para:</span> {oc.levantamiento?.recipient || "Desconocido"}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-100/60 dark:border-zinc-800/20">
                        <span className={`text-[9px] font-mono ${textSecondary}`}>
                          {formatDateTime(oc.createdAt)}
                        </span>
                        
                        <div className="flex items-center gap-2.5">
                          <a
                            href={`https://mail.google.com/mail/u/0/#all/${oc.levantamiento?.threadId}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold hover:font-semibold ${gmailLinkStyle}`}
                          >
                            <span>Gmail</span>
                            <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                          
                          <button
                            onClick={() => setIsLinkingOrphanId(oc.id)}
                            className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase border ${linkButtonStyle} active:scale-95 transition-all`}
                          >
                            Vincular
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : displayedCases.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                <div className={`w-12 h-12 rounded-full border ${borderMain} ${bgSecondary} flex items-center justify-center`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2m0 0V6" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold uppercase tracking-wider text-xs">Sin hilos en esta pestaña</h3>
                  <p className={`text-xs ${textSecondary} mt-1 max-w-xs mb-4`}>
                    Los correos que etiquetes en tu Gmail aparecerán automáticamente aquí.
                  </p>
                  <button
                    onClick={generateMockThreads}
                    className={`px-4 py-2 text-[10px] font-bold uppercase rounded border ${borderMain} ${primaryButtonStyle} transition-all`}
                  >
                    Generar Hilos de Prueba
                  </button>
                </div>
              </div>
            ) : (
              <div className={`flex flex-col border ${borderMain} bg-white dark:bg-[#161618] rounded-2xl shadow-xs`}>
                {displayedCases.map((c) => {
                  const hasUnread = c.inicial?.hasUnread || c.levantamiento?.hasUnread;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCase(c)}
                      className={`group relative cursor-pointer border-b ${borderMain} last:border-b-0 bg-transparent hover:bg-zinc-50/70 dark:hover:bg-zinc-800/20 transition-colors duration-150 grid grid-cols-2 items-stretch h-12 first:rounded-t-2xl last:rounded-b-2xl ${
                        activeMenuCaseId === c.id ? "z-30" : "z-10"
                      }`}
                    >
                      {/* Bloque Izquierdo (Input / Correo Inicial) */}
                      <div className={`flex items-center justify-between px-5 h-full border-r ${borderMain} min-w-0 transition-colors duration-150 group-first:rounded-tl-2xl group-last:rounded-bl-2xl`}>
                        {/* Fecha y hora + iconos de estado en línea */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className={`text-[10px] font-mono ${textSecondary}`}>
                            {formatDateTime(c.inicial?.messages?.[0]?.date || c.createdAt)}
                          </span>
                          
                          {/* Contenedor de iconos activos (fijado, destacado, etc.) */}
                          <div className="flex items-center gap-1.5">
                            {c.pinned && (
                              <svg className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <title>Fijado</title>
                                <line x1="12" y1="17" x2="12" y2="22" />
                                <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.71A2 2 0 0 1 15 9.05V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.05a2 2 0 0 1-.78 1.25l-2.78 3.71A2 2 0 0 0 5 15.24V17z" />
                              </svg>
                            )}
                            {c.starred && (
                              <svg className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <title>Destacado</title>
                                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                              </svg>
                            )}
                          </div>
                        </div>

                        {/* Asunto a la derecha */}
                        <span 
                          className={`text-xs truncate pl-4 text-right ${
                            hasUnread ? "font-semibold text-zinc-900 dark:text-zinc-50" : `font-medium ${labelHeaderStyle}`
                          }`}
                          title={c.inicial?.subject || c.title}
                        >
                          {c.inicial?.subject || c.title || "Sin asunto"}
                        </span>
                      </div>

                      {/* Bloque Derecho (Output / Correo Derivado) */}
                      <div className={`flex items-center justify-between px-5 h-full min-w-0 transition-colors duration-150 relative group-first:rounded-tr-2xl group-last:rounded-br-2xl ${
                        !c.levantamiento 
                          ? 'bg-amber-500/[0.015] dark:bg-amber-500/[0.005] group-hover:bg-amber-500/[0.04] dark:group-hover:bg-amber-500/[0.02]' 
                          : cardRightBg
                      }`}>
                        {c.levantamiento ? (
                          <span 
                            className={`text-xs truncate pr-4 text-left ${
                              hasUnread ? "font-semibold text-zinc-900 dark:text-zinc-50" : `font-medium ${labelHeaderStyle}`
                            }`}
                            title={c.levantamiento.subject}
                          >
                            {c.levantamiento.subject}
                          </span>
                        ) : (
                          <span className="text-xs italic text-zinc-400 dark:text-zinc-500 font-medium truncate">
                            Pendiente Derivación
                          </span>
                        )}

                        {/* Controles de la derecha (Fijos y Hover) */}
                        <div className="flex items-center gap-3 shrink-0 pl-4">
                          {/* Fecha / -- (Permanente) */}
                          <span className={`text-[10px] font-mono ${textSecondary}`}>
                            {c.levantamiento 
                              ? formatDateTime(c.levantamiento.messages?.[0]?.date || c.updatedAt)
                              : "--"
                            }
                          </span>

                          {/* Botón de tres puntitos (Fijo) */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuCaseId(activeMenuCaseId === c.id ? null : c.id);
                              }}
                              className={`p-1.5 rounded-lg border ${borderMain} bg-white dark:bg-[#161618] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all active:scale-95`}
                              title="Opciones"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="5" r="1.5" />
                                <circle cx="12" cy="19" r="1.5" />
                              </svg>
                            </button>

                            {/* Dropdown Menu (Animación suave, blanco/negro) */}
                            {activeMenuCaseId === c.id && (
                              <div 
                                className="absolute right-0 top-8 w-52 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161618] rounded-xl p-1.5 z-50 shadow-lg animate-dropdown-in origin-top-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Opción 1: Fijar arriba */}
                                <button
                                  onClick={(e) => togglePinCase(c.id, e)}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs rounded-lg transition-colors ${hoverBg} ${textMain}`}
                                >
                                  <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="17" x2="12" y2="22" />
                                    <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.71A2 2 0 0 1 15 9.05V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.05a2 2 0 0 1-.78 1.25l-2.78 3.71A2 2 0 0 0 5 15.24V17z" />
                                  </svg>
                                  <span>{c.pinned ? "Desfijar de arriba" : "Fijar arriba"}</span>
                                </button>

                                {/* Opción 2: Destacar (Banderita / Penguin tail) */}
                                <button
                                  onClick={(e) => toggleStarCase(c.id, e)}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs rounded-lg transition-colors ${hoverBg} ${textMain}`}
                                >
                                  <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill={c.starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                                  </svg>
                                  <span>{c.starred ? "Quitar destacado" : "Destacar"}</span>
                                </button>

                                {/* Opción 3: Archivar / Reabrir */}
                                <button
                                  onClick={(e) => {
                                    if (c.status === "activo") {
                                      archiveCase(c.id, e);
                                    } else {
                                      unarchiveCase(c.id, e);
                                    }
                                    setActiveMenuCaseId(null);
                                  }}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs rounded-lg transition-colors ${hoverBg} ${textMain}`}
                                >
                                  {c.status === "activo" ? (
                                    <>
                                      <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="21 8 21 21 3 21 3 8" />
                                        <rect x="1" y="3" width="22" height="5" />
                                        <line x1="10" y1="12" x2="14" y2="12" />
                                      </svg>
                                      <span>Archivar hilo</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                      </svg>
                                      <span>Reabrir hilo</span>
                                    </>
                                  )}
                                </button>

                                {/* Opción 4: Match / Vinculación */}
                                {c.levantamiento ? (
                                  <button
                                    onClick={(e) => unlinkCase(c.id, e)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs rounded-lg transition-colors ${hoverBg} ${textMain}`}
                                  >
                                    <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M18.84 12.2a4.5 4.5 0 0 0-6.36-6.36l-1.42 1.42a4.5 4.5 0 0 0 6.36 6.36l1.42-1.42Z" />
                                      <path d="M12.8 17.8a4.5 4.5 0 0 1-6.36-6.36l1.42-1.42a4.5 4.5 0 0 1 6.36 6.36l-1.42 1.42Z" />
                                      <line x1="16" y1="8" x2="8" y2="16" />
                                    </svg>
                                    <span>Desvincular derivación</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedCase(null);
                                      setIsLinkingOrphanId(null);
                                      setActiveLinkInitialCaseId(c.id);
                                      setActiveMenuCaseId(null);
                                    }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs rounded-lg transition-colors ${hoverBg} ${textMain}`}
                                  >
                                    <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                    </svg>
                                    <span>Vincular derivación</span>
                                  </button>
                                )}

                                <div className={`my-1 border-t ${borderMain}`} />

                                {/* Opción 5: Eliminar */}
                                <button
                                  onClick={(e) => deleteCase(c.id, e)}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs rounded-lg transition-colors ${hoverBg} hover:bg-zinc-100 dark:hover:bg-zinc-800 ${textMain}`}
                                >
                                  <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    <line x1="10" y1="11" x2="10" y2="17" />
                                    <line x1="14" y1="11" x2="14" y2="17" />
                                  </svg>
                                  <span>Eliminar hilo</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* MODAL: DETALLES DEL HILO */}
          {selectedCase && (() => {
            const chronologicalMessages = getChronologicalMessages(selectedCase);
            return (
          <div 
            className={`fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in ${modalOverlayBg}`}
            onClick={() => setSelectedCase(null)}
          >
            <div 
              className={`w-full max-w-4xl border border-zinc-200/20 dark:border-zinc-800/15 rounded-3xl overflow-hidden flex flex-col max-h-[90vh] ${modalContainerBg} shadow-2xl shadow-zinc-200/20 dark:shadow-black/60`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header del Modal */}
              <div className={`p-6 pb-4 flex items-start justify-between gap-4 border-b ${borderMain} ${modalHeaderBg}`}>
                <div className="space-y-2 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 border ${borderMain} rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      theme === "light" ? "bg-zinc-100 text-zinc-650" : "bg-zinc-800 text-zinc-300"
                    }`}>
                      ID: {selectedCase.id.substring(0, 8)}...
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                      selectedCase.status === "activo" 
                        ? (theme === "light" ? "bg-emerald-50 text-emerald-700 border-emerald-250" : "bg-emerald-950/30 text-emerald-400 border-emerald-900/30")
                        : (theme === "light" ? "bg-zinc-100 text-zinc-650 border-zinc-250" : "bg-zinc-800/80 text-zinc-400 border-zinc-700")
                    }`}>
                      {selectedCase.status}
                    </span>
                  </div>
                  
                  {/* Título de caso editable con clic directo */}
                  {isEditingTitle ? (
                    <input
                      type="text"
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      onBlur={saveCaseTitle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveCaseTitle();
                        if (e.key === "Escape") setIsEditingTitle(false);
                      }}
                      className={`bg-transparent border ${borderMain} px-3 py-2 rounded-xl outline-none font-semibold text-base uppercase ${textMain} w-full focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600`}
                      autoFocus
                    />
                  ) : (
                    <h3 
                      onClick={() => {
                        setTempTitle(selectedCase.title || "");
                        setIsEditingTitle(true);
                      }}
                      className={`font-semibold text-base uppercase ${labelHeaderStyle} cursor-pointer hover:underline decoration-dotted inline-block`}
                      title="Haz clic para renombrar el caso"
                    >
                      {selectedCase.title || "Caso sin asunto"}
                    </h3>
                  )}
                </div>

                {/* Botón de cerrar minimalista (Solo X) */}
                <button 
                  onClick={() => setSelectedCase(null)}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl border ${borderMain} ${hoverBg} transition-all duration-150 font-semibold text-xs shrink-0 active:scale-95`}
                  title="Cerrar"
                >
                  ✕
                </button>
              </div>

              {/* Contenido del Modal (Split Layout) */}
              <div className={`flex-1 grid grid-cols-1 md:grid-cols-3 overflow-hidden ${modalBodyBg}`}>
                
                {/* COLUMNA 1 y 2: Chat Cronológico (Estilo WhatsApp Minimalista) */}
                <div className="md:col-span-2 flex flex-col h-[55vh] md:h-[60vh] overflow-hidden bg-zinc-50/20 dark:bg-zinc-950/10">
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
                    {chronologicalMessages.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                        <p className={`text-xs ${textSecondary} italic`}>No hay mensajes en esta conversación.</p>
                      </div>
                    ) : (
                      chronologicalMessages.map(({ msg, type }) => {
                        const isInicial = type === "inicial";
                        return (
                          <div 
                            key={msg.messageId}
                            className={`flex flex-col w-full ${isInicial ? "items-start" : "items-end"}`}
                          >
                            <div 
                              className={`max-w-[85%] p-3.5 shadow-2xs ${
                                isInicial 
                                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl rounded-tl-sm border border-zinc-200/50 dark:border-zinc-800/40 border-l-2 border-l-[#F99243]/70" 
                                  : (theme === "light" 
                                      ? "bg-[#1A1615]/[0.04] text-zinc-900 rounded-2xl rounded-tr-sm border border-[#1A1615]/10" 
                                      : "bg-[#1A1615] text-zinc-100 rounded-2xl rounded-tr-sm border border-zinc-800/60")
                              }`}
                            >
                              {/* Remitente y Fecha */}
                              <div className="flex justify-between items-baseline gap-4 mb-2 border-b border-zinc-100/60 dark:border-zinc-800/25 pb-1 select-none">
                                <span className="font-bold text-[9px] tracking-wide text-zinc-400 dark:text-zinc-500 uppercase truncate max-w-[150px]">
                                  {cleanSenderName(msg.sender)}
                                </span>
                                <span className="text-[8px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0">
                                  {formatDateTime(msg.date)}
                                </span>
                              </div>

                              {/* Asunto */}
                              <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                                Asunto: {msg.subject}
                              </p>

                              {/* Cuerpo */}
                              <div className="text-xs leading-relaxed break-words text-zinc-800 dark:text-zinc-200 space-y-1">
                                {(() => {
                                  const needsTruncation = msg.body.length > 400;
                                  const isExpanded = !!expandedMessageIds[msg.messageId];
                                  const textToRender = needsTruncation && !isExpanded 
                                    ? msg.body.substring(0, 380) + "..." 
                                    : msg.body;

                                  return (
                                    <>
                                      <div>{renderFormattedBody(textToRender)}</div>
                                      {needsTruncation && (
                                        <button
                                          onClick={() => toggleMessageExpand(msg.messageId)}
                                          className="mt-2 text-[10px] font-bold uppercase text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors duration-150 select-none block"
                                        >
                                          {isExpanded ? "Mostrar menos" : "Mostrar más"}
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>

                              {/* Enlace de Gmail */}
                              <div className="mt-2.5 pt-1 border-t border-zinc-100/60 dark:border-zinc-800/20 text-right">
                                <a
                                  href={`https://mail.google.com/mail/u/0/#all/${(isInicial ? selectedCase.inicial?.threadId : selectedCase.levantamiento?.threadId) || selectedCase.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold hover:font-bold ${gmailLinkStyle}`}
                                >
                                  <span>Ver en Gmail</span>
                                  <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                  </svg>
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* COLUMNA 3: Opciones y Post-Mortem */}
                <div className="flex flex-col h-[55vh] md:h-[60vh] p-6 space-y-6 bg-white dark:bg-[#161618] border-l border-zinc-200/30 dark:border-zinc-800/40 overflow-y-auto">
                  
                  {/* Selector de Estado */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block">
                      Estado del caso
                    </span>
                    <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg text-xs select-none">
                      <button
                        onClick={() => toggleCaseStatus(selectedCase.id, "activo")}
                        className={`flex-1 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
                          selectedCase.status === "activo"
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-xs"
                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                        }`}
                      >
                        Activo
                      </button>
                      <button
                        onClick={() => toggleCaseStatus(selectedCase.id, "resuelto")}
                        className={`flex-1 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
                          selectedCase.status === "resuelto"
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-xs"
                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                        }`}
                      >
                        Resuelto
                      </button>
                    </div>
                  </div>

                  {/* Marcar como leído si tiene pendientes */}
                  {(selectedCase.inicial?.hasUnread || selectedCase.levantamiento?.hasUnread) && (
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block">
                        Acciones
                      </span>
                      <button
                        onClick={() => markAsRead(selectedCase.id)}
                        className={`w-full py-2 text-xs font-bold uppercase rounded-lg transition-colors ${secondaryButtonStyle}`}
                      >
                        Marcar como leído
                      </button>
                    </div>
                  )}

                  {/* Alerta de Derivación Pendiente */}
                  {!selectedCase.levantamiento && (
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block">
                        Derivación
                      </span>
                      <div className="p-4 rounded-xl bg-amber-500/[0.02] dark:bg-amber-500/[0.01] border border-dashed border-amber-500/20 text-center space-y-2.5">
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          Pendiente de vincular derivación
                        </p>
                        {orphanCases.length > 0 && (
                          <button
                            onClick={() => {
                              setSelectedCase(null);
                              setIsLinkingOrphanId(orphanCases[0].id);
                            }}
                            className={`w-full py-1.5 rounded-lg text-[9px] font-bold uppercase border ${linkButtonStyle}`}
                          >
                            Vincular ahora
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sección de Post-Mortem */}
                  <div className="space-y-3 pt-4 border-t border-zinc-150 dark:border-zinc-800/60">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block">
                      Post-Mortem / Precedente
                    </span>

                    {isEditingPostMortem ? (
                      <div className="space-y-3">
                        <textarea
                          value={tempPostMortem}
                          onChange={(e) => setTempPostMortem(e.target.value)}
                          placeholder="Describe la solución, causa raíz o notas para futuros casos similares..."
                          className={`w-full h-36 p-3 text-xs border ${borderMain} ${inputBg} ${textMain} rounded-xl outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-650 resize-none transition-all`}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => savePostMortem(selectedCase.id, tempPostMortem)}
                            className={`flex-1 py-1.5 text-[9px] font-bold uppercase rounded-lg ${primaryButtonStyle}`}
                          >
                            Guardar Nota
                          </button>
                          {selectedCase.postMortem && (
                            <button
                              onClick={() => {
                                setTempPostMortem(selectedCase.postMortem || "");
                                setIsEditingPostMortem(false);
                              }}
                              className={`px-3 py-1.5 text-[9px] font-bold uppercase rounded-lg ${secondaryButtonStyle}`}
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className={`p-4 rounded-xl border ${borderMain} bg-zinc-50/40 dark:bg-zinc-900/20 shadow-2xs`}>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                            {selectedCase.postMortem}
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setIsEditingPostMortem(true)}
                            className="text-[9px] uppercase font-bold text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("¿Estás seguro de que deseas eliminar esta nota de post-mortem?")) {
                                deletePostMortem(selectedCase.id);
                              }
                            }}
                            className="text-[9px] uppercase font-bold text-red-650 hover:text-red-800 transition-colors"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

              </div>

            </div>
          </div>
        );
      })()}

      {/* MODAL: VINCULACIÓN MANUAL */}
      {isLinkingOrphanId && (
        <div 
          className={`fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in ${modalOverlayBg}`}
          onClick={() => {
            setIsLinkingOrphanId(null);
            setLinkSearchTerm("");
          }}
        >
          <div 
            className={`w-full max-w-md border border-zinc-200/20 dark:border-zinc-800/15 rounded-3xl overflow-hidden flex flex-col ${modalContainerBg} shadow-2xl shadow-zinc-200/20 dark:shadow-black/60`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-5 pb-2 ${modalHeaderBg}`}>
              <h3 className={`font-extrabold text-sm uppercase tracking-wider ${labelHeaderStyle}`}>
                Vincular correo derivado
              </h3>
              <p className={`text-[10px] ${textSecondary} mt-1`}>
                Selecciona el caso inicial con el cual deseas emparejar esta derivación.
              </p>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto max-h-96">
              {/* Buscador */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider block text-zinc-500 dark:text-zinc-400">
                  Buscar caso inicial
                </label>
                <input 
                  type="text" 
                  value={linkSearchTerm}
                  onChange={(e) => setLinkSearchTerm(e.target.value)}
                  placeholder="Asunto, remitente o ID del caso..."
                  className={`w-full px-3.5 py-2 border ${borderMain} ${inputBg} ${textMain} text-xs rounded-xl outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-650 transition-all`}
                />
              </div>

              {/* Lista de casos iniciales activos que no tienen levantamiento aún */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider block text-zinc-500 dark:text-zinc-400">
                  Casos Iniciales Disponibles
                </span>
                
                {(() => {
                  const availableInicialCases = activeCases.filter(
                    c => !c.levantamiento && 
                    (c.title.toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                     c.inicial?.sender.toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                     c.id.toLowerCase().includes(linkSearchTerm.toLowerCase()))
                  );

                  if (availableInicialCases.length === 0) {
                    return (
                      <p className={`text-[10px] ${textSecondary} italic py-4 text-center`}>
                        No se encontraron casos iniciales activos sin derivar.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {availableInicialCases.map((c) => (
                        <div 
                          key={c.id}
                          onClick={() => handleLinkOrphan(c.id)}
                          className={`p-3.5 rounded-xl cursor-pointer ${hoverBg} transition-all duration-150 flex items-center justify-between ${innerCardBg} shadow-2xs hover:shadow-xs`}
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <p className={`font-bold text-[11px] truncate uppercase ${labelHeaderStyle}`}>
                              {c.title}
                            </p>
                            <p className={`text-[9px] ${textSecondary} truncate`}>
                              De: {c.inicial?.sender?.split("<")[0]}
                            </p>
                          </div>
                          <span className={`text-[9px] uppercase shrink-0 font-bold hover:underline ${labelHeaderStyle}`}>
                            Seleccionar →
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className={`p-4 border-t ${borderMain} text-right ${modalFooterBg}`}>
              <button
                onClick={() => {
                  setIsLinkingOrphanId(null);
                  setLinkSearchTerm("");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${secondaryButtonStyle}`}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VINCULACIÓN MANUAL DESDE EL CASO INICIAL */}
      {activeLinkInitialCaseId && (
        <div 
          className={`fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in ${modalOverlayBg}`}
          onClick={() => {
            setActiveLinkInitialCaseId(null);
            setLinkSearchTerm("");
          }}
        >
          <div 
            className={`w-full max-w-md border border-zinc-200/20 dark:border-zinc-800/15 rounded-3xl overflow-hidden flex flex-col ${modalContainerBg} shadow-2xl shadow-zinc-200/20 dark:shadow-black/60`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-5 pb-2 ${modalHeaderBg}`}>
              <h3 className={`font-extrabold text-sm uppercase tracking-wider ${labelHeaderStyle}`}>
                Vincular correo derivado
              </h3>
              <p className={`text-[10px] ${textSecondary} mt-1`}>
                Selecciona la derivación huérfana con la cual deseas emparejar este caso.
              </p>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto max-h-96">
              {/* Buscador */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider block text-zinc-500 dark:text-zinc-400">
                  Buscar derivación huérfana
                </label>
                <input 
                  type="text" 
                  value={linkSearchTerm}
                  onChange={(e) => setLinkSearchTerm(e.target.value)}
                  placeholder="Asunto, remitente o ID del caso..."
                  className={`w-full px-3.5 py-2 border ${borderMain} ${inputBg} ${textMain} text-xs rounded-xl outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-650 transition-all`}
                />
              </div>

              {/* Lista de huérfanos */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider block text-zinc-500 dark:text-zinc-400">
                  Derivaciones Huérfanas Disponibles
                </span>
                
                {(() => {
                  const availableOrphans = orphanCases.filter(
                    oc => oc.title.toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                    oc.levantamiento?.sender.toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                    oc.id.toLowerCase().includes(linkSearchTerm.toLowerCase())
                  );

                  if (availableOrphans.length === 0) {
                    return (
                      <p className={`text-[10px] ${textSecondary} italic py-4 text-center`}>
                        No se encontraron derivaciones huérfanas activas.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {availableOrphans.map((oc) => (
                        <div 
                          key={oc.id}
                          onClick={() => handleLinkOrphanToInitial(oc.id)}
                          className={`p-3.5 rounded-xl cursor-pointer ${hoverBg} transition-all duration-150 flex items-center justify-between ${innerCardBg} shadow-2xs hover:shadow-xs`}
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <p className={`font-bold text-[11px] truncate uppercase ${labelHeaderStyle}`}>
                              {oc.title}
                            </p>
                            <p className={`text-[9px] ${textSecondary} truncate`}>
                              De: {oc.levantamiento?.sender?.split("<")[0]}
                            </p>
                          </div>
                          <span className={`text-[9px] uppercase shrink-0 font-bold hover:underline ${labelHeaderStyle}`}>
                            Vincular →
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className={`p-4 border-t ${borderMain} text-right ${modalFooterBg}`}>
              <button
                onClick={() => {
                  setActiveLinkInitialCaseId(null);
                  setLinkSearchTerm("");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${secondaryButtonStyle}`}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENEDOR DE TOASTS EMERGENTES */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm pointer-events-none">
        {toasts.map((toast) => {
          let icon = (
            <svg className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          );
          if (toast.type === "new_orphan") {
            icon = (
              <svg className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            );
          } else if (toast.type === "archived") {
            icon = (
              <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            );
          } else if (toast.type === "reopened") {
            icon = (
              <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            );
          } else if (toast.type === "linked") {
            icon = (
              <svg className="w-4 h-4 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            );
          }

          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start gap-3.5 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161618] shadow-xl animate-toast min-w-[280px]"
            >
              <div className="mt-0.5">{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {toast.type === "new_thread" && "Nuevo Hilo"}
                  {toast.type === "new_orphan" && "Caso Huérfano"}
                  {toast.type === "archived" && "Hilo Archivado"}
                  {toast.type === "reopened" && "Hilo Reabierto"}
                  {toast.type === "linked" && "Caso Vinculado"}
                </p>
                <p className="text-xs font-semibold leading-snug text-zinc-850 dark:text-zinc-100 mt-0.5 break-words">
                  {toast.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
