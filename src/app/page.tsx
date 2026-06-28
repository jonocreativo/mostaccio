"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth, googleProvider, db } from "@/firebase";
import { collection, onSnapshot, updateDoc, deleteDoc, doc } from "firebase/firestore";

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

  // Firestore states
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [isLinkingOrphanId, setIsLinkingOrphanId] = useState<string | null>(null);
  const [linkSearchTerm, setLinkSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"activo" | "resuelto">("activo");

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

  // Escucha en tiempo real de los casos en Firestore
  useEffect(() => {
    if (!user) return;
    const casesRef = collection(db, "cases");
    const unsubscribe = onSnapshot(casesRef, (snapshot) => {
      const list: Case[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Case);
      });
      setCases(list);
    }, (error) => {
      console.error("Error al escuchar Firestore:", error);
    });
    return () => unsubscribe();
  }, [user]);

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
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Clasificación de hilos
  const activeCases = cases.filter(c => c.status === "activo" && c.inicial);
  const archivedCases = cases.filter(c => c.status === "resuelto" && c.inicial);
  const orphanCases = cases.filter(c => c.status === "activo" && !c.inicial && c.levantamiento);

  const displayedCases = filterStatus === "activo" ? activeCases : archivedCases;

  // Grayscale variables based on theme (Bordes suaves y grises para un diseño elegante)
  const bgMain = theme === "light" ? "bg-white" : "bg-black";
  const bgSecondary = theme === "light" ? "bg-gray-50" : "bg-zinc-950";
  const textMain = theme === "light" ? "text-black" : "text-white";
  const textSecondary = theme === "light" ? "text-gray-400" : "text-zinc-500";
  const borderMain = theme === "light" ? "border-gray-200" : "border-zinc-850";
  const hoverBg = theme === "light" ? "hover:bg-gray-50" : "hover:bg-zinc-900";
  const activeBg = theme === "light" ? "bg-gray-100" : "bg-zinc-900";
  
  // Component specific colors (Flat 2.0 theme dynamic values con bordes suaves de 1px)
  const cardHeaderBg = theme === "light" ? "bg-gray-50/50 border-b" : "bg-zinc-900/60 border-b";
  const cardLeftBg = theme === "light" ? "bg-white" : "bg-zinc-950";
  const cardRightBg = theme === "light" ? "bg-gray-50/50" : "bg-zinc-900/20";
  const innerCardBg = theme === "light" ? "bg-white border" : "bg-zinc-950 border";
  const modalHeaderBg = theme === "light" ? "bg-white border-b" : "bg-zinc-950 border-b";
  const modalFooterBg = theme === "light" ? "bg-white border-t" : "bg-zinc-950 border-t";
  const modalBodyBg = theme === "light" ? "bg-white" : "bg-zinc-900/20";
  const messageItemBg = theme === "light" ? "bg-gray-50/40 border" : "bg-zinc-950 border";
  const messageBodyBg = theme === "light" ? "bg-white border" : "bg-zinc-900/30 border";
  const metaBoxBg = theme === "light" ? "bg-gray-50/40 border text-gray-800" : "bg-zinc-950 border text-zinc-300";
  const badgeStyleBlue = theme === "light" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-blue-900/20 text-blue-450 border border-blue-900/30";
  const badgeStylePurple = theme === "light" ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-purple-900/20 text-purple-450 border border-purple-900/30";
  const badgeStyleYellow = theme === "light" ? "bg-yellow-50 text-yellow-700 border border-yellow-200" : "bg-yellow-900/20 text-yellow-450 border border-yellow-900/30";
  const labelHeaderStyle = theme === "light" ? "text-black" : "text-white";
  const gmailLinkStyle = theme === "light" ? "text-gray-500 hover:text-black underline" : "text-zinc-400 hover:text-white underline";
  const inputBg = theme === "light" ? "bg-gray-50" : "bg-zinc-900";
  const modalOverlayBg = theme === "light" ? "bg-black/15" : "bg-black/75";
  const modalContainerBg = theme === "light" ? "bg-white" : "bg-zinc-950";

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
      <div className={`flex h-screen w-screen items-center justify-center ${bgMain} ${textMain} transition-colors duration-250 p-4`}>
        <div className={`w-full max-w-sm border ${borderMain} ${bgSecondary} rounded-md p-8 text-center space-y-6`}>
          <div className="flex flex-col items-center gap-3">
            <img src="/logo.webp" alt="Logo" className="w-8 h-8 object-contain" style={theme === "dark" ? { filter: "brightness(0) invert(1)" } : undefined} />
            <div className="space-y-1">
              <span className="text-sm font-black tracking-widest uppercase block">
                MOSTACCIO
              </span>
              <p className={`text-[10px] ${textSecondary} uppercase tracking-wider`}>
                Gestión de Casos & Hilos
              </p>
            </div>
          </div>

          <div className={`border-t ${borderMain} pt-6 space-y-4`}>
            <p className="text-xs">
              Ingresa con tu cuenta de Google para comenzar a gestionar tus hilos de conversación.
            </p>

            <button
              onClick={handleGoogleLogin}
              className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-black text-white dark:bg-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 text-xs font-bold uppercase rounded-md transition-all border ${borderMain}`}
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
    <div className={`flex h-screen w-screen overflow-hidden ${bgMain} ${textMain} font-sans text-sm transition-colors duration-250`}>
      
      {/* BARRA LATERAL (SIDEBAR) */}
      <aside className={`w-64 border-r ${borderMain} ${bgSecondary} flex flex-col h-full shrink-0 z-10`}>
        {/* Logo / Cabecera */}
        <div className={`p-6 border-b ${borderMain} flex items-center justify-center`}>
          <img src="/logo.webp" alt="Logo" className="h-10 w-auto object-contain" style={theme === "dark" ? { filter: "brightness(0) invert(1)" } : undefined} />
        </div>

        {/* Opciones de Navegación */}
        <nav className="flex-1 p-4 space-y-1.5">
          <button
            onClick={() => setActiveTab("threads")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium text-left transition-all ${
              activeTab === "threads" 
                ? `${activeBg} font-bold` 
                : `${textSecondary} ${hoverBg}`
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
        <div className={`p-4 border-t ${borderMain} flex items-center justify-between`}>
          <span className={`text-[10px] uppercase ${textSecondary}`}>TEMA</span>
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-2 p-1.5 rounded-md border ${borderMain} ${bgMain} ${hoverBg} transition-all`}
            title="Cambiar tema"
          >
            {theme === "light" ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="text-[10px] font-bold uppercase pr-1">Oscuro</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <span className="text-[10px] font-bold uppercase pr-1">Claro</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* CABECERA (HEADER) */}
        <header className={`h-16 border-b ${borderMain} px-6 flex justify-between items-center z-10 shrink-0`}>
          <div>
            <h1 className="font-bold text-sm tracking-tight uppercase">
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

            {/* Foto de Perfil */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileOpen(!isProfileOpen);
              }}
              className={`w-8 h-8 rounded-full border ${borderMain} flex items-center justify-center overflow-hidden hover:scale-105 transition-all`}
              aria-label="Perfil de usuario"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || "User"} className="w-full h-full object-cover" />
              ) : (
                <svg className={`w-full h-full ${theme === "light" ? "bg-gray-150 text-black" : "bg-zinc-800 text-white"}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </button>

            {/* Menú de Perfil */}
            {isProfileOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-10 w-52 border ${borderMain} ${bgMain} rounded-md p-1 z-50`}
              >
                <div className={`px-3 py-2 border-b ${borderMain} text-[10px] space-y-0.5`}>
                  <p className="font-bold truncate">{user.displayName || "Usuario Mostaccio"}</p>
                  <p className={`truncate text-[9px] ${textSecondary}`}>{user.email}</p>
                </div>

                <button
                  onClick={() => {
                    alert("Configuración abierta");
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-left text-xs rounded hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1-2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Configuración</span>
                </button>
                
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded hover:bg-gray-100 dark:hover:bg-zinc-900 text-red-650 dark:text-red-400 transition-colors"
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
        <div className={`border-b ${borderMain} px-8 py-3 flex flex-wrap gap-4 items-center justify-between bg-transparent shrink-0`}>
          <div className={`flex border ${borderMain} rounded overflow-hidden text-xs`}>
            <button
              onClick={() => setFilterStatus("activo")}
              className={`px-3 py-1.5 font-bold uppercase transition-all ${
                filterStatus === "activo" 
                  ? "bg-black text-white dark:bg-white dark:text-black" 
                  : "bg-transparent hover:bg-gray-50 dark:hover:bg-zinc-900"
              }`}
            >
              Activos ({activeCases.length})
            </button>
            <button
              onClick={() => setFilterStatus("resuelto")}
              className={`px-3 py-1.5 font-bold uppercase transition-all border-l ${borderMain} ${
                filterStatus === "resuelto" 
                  ? "bg-black text-white dark:bg-white dark:text-black" 
                  : "bg-transparent hover:bg-gray-50 dark:hover:bg-zinc-900"
              }`}
            >
              Archivados ({archivedCases.length})
            </button>
          </div>
        </div>

        {/* CONTENIDO PRINCIPAL LAYOUT DE HILOS */}
        <main className="flex-1 overflow-y-auto p-8 flex flex-col lg:flex-row gap-8">
          
          {/* COLUMNA DE CARDS DE HILOS */}
          <div className="flex-1 space-y-6">
            {displayedCases.length === 0 ? (
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
                    className={`px-4 py-2 bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-[10px] font-bold uppercase rounded border ${borderMain} transition-all`}
                  >
                    Generar Hilos de Prueba
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {displayedCases.map((c) => {
                  const hasUnread = c.inicial?.hasUnread || c.levantamiento?.hasUnread;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCase(c)}
                      className={`group relative cursor-pointer border ${borderMain} ${bgSecondary} rounded-md transition-all flex flex-col overflow-hidden`}
                    >
                      {/* Cabecera de la Tarjeta */}
                      <div className={`p-4 flex items-start justify-between gap-3 ${cardHeaderBg}`}>
                        <div className="space-y-0.5 min-w-0">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${textSecondary}`}>
                            CASO: {c.id.substring(0, 8)}...
                          </span>
                          <h4 className={`font-bold text-xs uppercase truncate pr-4 ${labelHeaderStyle}`} title={c.title}>
                            {c.title || "Sin asunto"}
                          </h4>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Notificación no leído */}
                          {hasUnread && (
                            <span className="flex h-2 w-2 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 dark:bg-blue-400"></span>
                            </span>
                          )}
                          
                          {/* Botón rápido para archivar */}
                          {c.status === "activo" ? (
                            <button
                              onClick={(e) => archiveCase(c.id, e)}
                              className={`p-1 rounded border ${borderMain} bg-transparent ${hoverBg} transition-colors`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="21 8 21 21 3 21 3 8" />
                                <rect x="1" y="3" width="22" height="5" />
                                <line x1="10" y1="12" x2="14" y2="12" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={(e) => unarchiveCase(c.id, e)}
                              className={`p-1 rounded border ${borderMain} bg-transparent ${hoverBg} transition-colors`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Visualización Doble (Flujo del caso) */}
                      <div className={`flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x ${borderMain}`}>
                        {/* Correo Inicial (Izquierda) */}
                        <div className={`p-4 flex flex-col justify-between space-y-3 ${cardLeftBg}`}>
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold tracking-widest text-blue-600 dark:text-blue-400 uppercase block">
                              Inicial (Cliente)
                            </span>
                            <p className={`text-xs truncate font-medium ${labelHeaderStyle}`}>
                              {c.inicial?.sender ? c.inicial.sender.split("<")[0].trim() : "Desconocido"}
                            </p>
                            <p className={`text-[10px] ${textSecondary} truncate`}>
                              {c.inicial?.subject}
                            </p>
                          </div>
                          
                          <div className="flex items-center justify-between text-[9px] uppercase">
                            <span className={textSecondary}>
                              {formatDateTime(c.inicial?.messages?.[0]?.date || c.createdAt)}
                            </span>
                            <a
                              href={`https://mail.google.com/mail/u/0/#search/${c.inicial?.threadId}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`${gmailLinkStyle} hover:font-bold`}
                            >
                              Gmail ↗
                            </a>
                          </div>
                        </div>

                        {/* Correo Levantamiento / Derivado (Derecha) */}
                        <div className={`p-4 flex flex-col justify-between space-y-3 ${cardRightBg}`}>
                          {c.levantamiento ? (
                            <>
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold tracking-widest text-purple-600 dark:text-purple-400 uppercase block">
                                  Derivado (Legal/Mandante)
                                </span>
                                <p className={`text-xs truncate font-medium ${labelHeaderStyle}`}>
                                  {c.levantamiento.recipient ? c.levantamiento.recipient.split("<")[0].trim() : "Desconocido"}
                                </p>
                                <p className={`text-[10px] ${textSecondary} truncate`}>
                                  {c.levantamiento.subject}
                                </p>
                              </div>

                              <div className="flex items-center justify-between text-[9px] uppercase">
                                <span className={textSecondary}>
                                  {formatDateTime(c.levantamiento.messages?.[0]?.date || c.updatedAt)}
                                </span>
                                <a
                                  href={`https://mail.google.com/mail/u/0/#search/${c.levantamiento.threadId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className={`${gmailLinkStyle} hover:font-bold`}
                                >
                                  Gmail ↗
                                </a>
                              </div>
                            </>
                          ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-4 text-center space-y-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                              <span className={`text-[10px] uppercase font-bold tracking-wider ${textSecondary}`}>
                                Pendiente Derivación
                              </span>
                              <span className="text-[9px] text-gray-400 max-w-[150px]">
                                Reenvía el correo inicial para vincularlo automáticamente.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* COLUMNA LATERAL (LEVANTAMIENTOS HUÉRFANOS) */}
          {orphanCases.length > 0 && (
            <aside className="w-full lg:w-80 shrink-0">
              <div className={`border ${borderMain} ${bgSecondary} rounded-md p-5 space-y-4`}>
                <div className={`flex items-center justify-between pb-2 border-b ${borderMain}`}>
                  <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <span>Huérfanos ({orphanCases.length})</span>
                  </h3>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${badgeStyleYellow}`}>
                    Sin Vincular
                  </span>
                </div>

                <p className={`text-[10px] ${textSecondary}`}>
                  Correos de levantamiento/derivación detectados que no pudieron asociarse automáticamente.
                </p>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {orphanCases.map((oc) => (
                    <div 
                      key={oc.id}
                      className={`p-3 rounded text-xs space-y-3 ${innerCardBg}`}
                    >
                      <div className="space-y-1">
                        <p className={`font-bold truncate uppercase text-[11px] ${labelHeaderStyle}`} title={oc.title}>
                          {oc.title}
                        </p>
                        <p className={`text-[10px] ${textSecondary} truncate`}>
                          De: {oc.levantamiento?.sender?.split("<")[0] || "Desconocido"}
                        </p>
                        <p className={`text-[10px] ${textSecondary} truncate`}>
                          Para: {oc.levantamiento?.recipient?.split("<")[0] || "Desconocido"}
                        </p>
                      </div>

                      <div className={`flex items-center justify-between border-t ${borderMain} pt-2`}>
                        <span className={`text-[9px] uppercase ${textSecondary}`}>
                          {formatDateTime(oc.createdAt)}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <a
                            href={`https://mail.google.com/mail/u/0/#search/${oc.levantamiento?.threadId}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`text-[9px] uppercase hover:font-bold ${gmailLinkStyle}`}
                          >
                            Gmail
                          </a>
                          
                          <button
                            onClick={() => setIsLinkingOrphanId(oc.id)}
                            className="px-2 py-1 bg-black text-white dark:bg-white dark:text-black rounded text-[9px] font-bold uppercase hover:opacity-80 transition-opacity border border-black dark:border-white"
                          >
                            Vincular
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          )}

        </main>
      </div>

      {/* MODAL: DETALLES DEL HILO */}
      {selectedCase && (
        <div 
          className={`fixed inset-0 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in ${modalOverlayBg}`}
          onClick={() => setSelectedCase(null)}
        >
          <div 
            className={`w-full max-w-4xl border ${borderMain} rounded-lg overflow-hidden flex flex-col max-h-[90vh] ${modalContainerBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className={`p-6 flex items-start justify-between gap-4 ${modalHeaderBg}`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {/* Corregido contraste del ID de caso para modo claro/oscuro */}
                  <span className={`px-2 py-0.5 border ${borderMain} rounded text-[9px] font-bold uppercase ${
                    theme === "light" ? "bg-gray-100 text-gray-700" : "bg-zinc-900 text-zinc-300"
                  }`}>
                    ID: {selectedCase.id}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${borderMain} ${
                    selectedCase.status === "activo" 
                      ? "bg-green-50 text-green-700 dark:bg-green-950/35 dark:text-green-400" 
                      : "bg-gray-50 text-gray-600 dark:bg-zinc-950/35 dark:text-zinc-400"
                  }`}>
                    {selectedCase.status}
                  </span>
                </div>
                <h3 className={`font-extrabold text-base uppercase pr-6 ${labelHeaderStyle}`}>
                  {selectedCase.title || "Caso sin asunto"}
                </h3>
              </div>

              {/* Botón de cerrar minimalista (Solo X) */}
              <button 
                onClick={() => setSelectedCase(null)}
                className={`w-8 h-8 flex items-center justify-center rounded border ${borderMain} ${hoverBg} transition-colors font-bold text-sm shrink-0`}
                title="Cerrar"
              >
                X
              </button>
            </div>

            {/* Contenido del Modal (Ultra-minimalista sin textos ni títulos gritones, flechas roja y verde) */}
            <div className={`flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x ${borderMain} gap-6 md:gap-0 ${modalBodyBg}`}>
              
              {/* Lado Inicial (Cliente) */}
              <div className="md:pr-6 space-y-4">
                <div className={`flex items-center justify-between border-b ${borderMain} pb-2`}>
                  {/* Icono de flecha hacia abajo en rojo */}
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7" />
                  </svg>
                  {selectedCase.inicial?.hasUnread && (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${badgeStyleBlue}`}>
                      Nuevo
                    </span>
                  )}
                </div>

                {selectedCase.inicial ? (
                  <div className="space-y-4">
                    {/* Metadatos directos sin títulos redundantes ni gritones */}
                    <div className={`p-4 rounded space-y-2 text-xs ${metaBoxBg}`}>
                      <p className={`font-semibold break-all ${labelHeaderStyle}`}>{selectedCase.inicial.sender}</p>
                      <p className="break-all text-gray-500 dark:text-zinc-400">{selectedCase.inicial.recipient}</p>
                      <p className="text-gray-400 dark:text-zinc-500 text-[10px]">
                        {formatDateTime(selectedCase.inicial.messages?.[0]?.date || selectedCase.createdAt)}
                      </p>
                    </div>

                    {/* Historial de Mensajes sin título redundante */}
                    <div className="space-y-2.5">
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {selectedCase.inicial.messages?.map((msg, index) => (
                          <div 
                            key={msg.messageId || index}
                            className={`p-3 rounded text-xs space-y-2 ${messageItemBg}`}
                          >
                            <div className="flex items-center justify-between text-[9px] uppercase text-gray-400">
                              <span>Mensaje #{index + 1}</span>
                              <span>{formatDateTime(msg.date)}</span>
                            </div>
                            <p className={`font-semibold text-[11px] truncate ${labelHeaderStyle}`}>
                              {msg.subject}
                            </p>
                            {msg.body && (
                              <p className={`text-[10px] ${textSecondary} line-clamp-2 leading-relaxed p-1.5 rounded ${messageBodyBg}`}>
                                {msg.body}
                              </p>
                            )}
                            <div className="text-right">
                              <a
                                href={`https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(msg.messageId)}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-block text-[9px] uppercase hover:font-bold ${gmailLinkStyle}`}
                              >
                                Abrir en Gmail ↗
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className={`text-xs ${textSecondary} italic`}>No hay información.</p>
                )}
              </div>

              {/* Lado Levantamiento (Derivado) */}
              <div className="md:pl-6 pt-6 md:pt-0 space-y-4">
                <div className={`flex items-center justify-between border-b ${borderMain} pb-2`}>
                  {/* Icono de flecha hacia arriba en verde */}
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 11l7-7 7 7" />
                  </svg>
                  {selectedCase.levantamiento?.hasUnread && (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${badgeStylePurple}`}>
                      Nuevo
                    </span>
                  )}
                </div>

                {selectedCase.levantamiento ? (
                  <div className="space-y-4">
                    {/* Metadatos directos sin títulos redundantes ni gritones */}
                    <div className={`p-4 rounded space-y-2 text-xs ${metaBoxBg}`}>
                      <p className={`font-semibold break-all ${labelHeaderStyle}`}>{selectedCase.levantamiento.recipient}</p>
                      <p className="break-all text-gray-500 dark:text-zinc-400">{selectedCase.levantamiento.sender}</p>
                      <p className="text-gray-400 dark:text-zinc-500 text-[10px]">
                        {formatDateTime(selectedCase.levantamiento.messages?.[0]?.date || selectedCase.updatedAt)}
                      </p>
                    </div>

                    {/* Historial de Mensajes sin título redundante */}
                    <div className="space-y-2.5">
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {selectedCase.levantamiento.messages?.map((msg, index) => (
                          <div 
                            key={msg.messageId || index}
                            className={`p-3 rounded text-xs space-y-2 ${messageItemBg}`}
                          >
                            <div className="flex items-center justify-between text-[9px] uppercase text-gray-400">
                              <span>Mensaje #{index + 1}</span>
                              <span>{formatDateTime(msg.date)}</span>
                            </div>
                            <p className={`font-semibold text-[11px] truncate ${labelHeaderStyle}`}>
                              {msg.subject}
                            </p>
                            {msg.body && (
                              <p className={`text-[10px] ${textSecondary} line-clamp-2 leading-relaxed p-1.5 rounded ${messageBodyBg}`}>
                                {msg.body}
                              </p>
                            )}
                            <div className="text-right">
                              <a
                                href={`https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(msg.messageId)}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-block text-[9px] uppercase hover:font-bold ${gmailLinkStyle}`}
                              >
                                Abrir en Gmail ↗
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`h-48 border border-dashed ${borderMain} rounded flex flex-col items-center justify-center p-6 text-center space-y-3 bg-white/5`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                    <p className={`text-[10px] ${textSecondary} max-w-xs`}>
                      No se ha registrado derivación todavía.
                    </p>
                    
                    {orphanCases.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectedCase(null);
                          setIsLinkingOrphanId(orphanCases[0].id);
                        }}
                        className="px-3 py-1 bg-black text-white dark:bg-white dark:text-black rounded text-[9px] font-bold uppercase hover:opacity-85 transition-opacity border border-black dark:border-white"
                      >
                        Vincular
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Footer del Modal */}
            <div className={`p-6 flex flex-wrap gap-4 items-center justify-between ${modalFooterBg}`}>
              <div>
                {(selectedCase.inicial?.hasUnread || selectedCase.levantamiento?.hasUnread) && (
                  <button
                    onClick={() => markAsRead(selectedCase.id)}
                    className={`px-4 py-2 border ${borderMain} font-bold text-xs uppercase rounded hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors`}
                  >
                    Marcar como leído
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                {selectedCase.status === "activo" ? (
                  <button
                    onClick={() => archiveCase(selectedCase.id)}
                    className="px-4 py-2 bg-red-650 hover:bg-red-700 dark:bg-red-950 dark:hover:bg-red-900 text-white text-xs font-bold uppercase rounded transition-colors"
                  >
                    Archivar Caso
                  </button>
                ) : (
                  <button
                    onClick={() => unarchiveCase(selectedCase.id)}
                    className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black text-xs font-bold uppercase rounded hover:opacity-85 transition-opacity border border-black dark:border-white"
                  >
                    Reabrir Caso
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VINCULACIÓN MANUAL */}
      {isLinkingOrphanId && (
        <div 
          className={`fixed inset-0 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in ${modalOverlayBg}`}
          onClick={() => {
            setIsLinkingOrphanId(null);
            setLinkSearchTerm("");
          }}
        >
          <div 
            className={`w-full max-w-md border ${borderMain} rounded-lg overflow-hidden flex flex-col ${modalContainerBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-5 border-b ${borderMain} ${cardLeftBg}`}>
              <h3 className={`font-extrabold text-sm uppercase ${labelHeaderStyle}`}>
                Vincular correo derivado
              </h3>
              <p className={`text-[10px] ${textSecondary} mt-1`}>
                Selecciona el caso inicial con el cual deseas emparejar esta derivación.
              </p>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto max-h-96">
              {/* Buscador */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider block">
                  Buscar caso inicial
                </label>
                <input 
                  type="text" 
                  value={linkSearchTerm}
                  onChange={(e) => setLinkSearchTerm(e.target.value)}
                  placeholder="Asunto, remitente o ID del caso..."
                  className={`w-full px-3 py-2 border ${borderMain} ${inputBg} ${textMain} text-xs rounded outline-none focus:ring-1 focus:ring-black dark:focus:ring-white`}
                />
              </div>

              {/* Lista de casos iniciales activos que no tienen levantamiento aún */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider block">
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
                          className={`p-3 rounded cursor-pointer ${hoverBg} transition-colors flex items-center justify-between ${innerCardBg}`}
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

            <div className={`p-4 border-t ${borderMain} text-right ${cardLeftBg}`}>
              <button
                onClick={() => {
                  setIsLinkingOrphanId(null);
                  setLinkSearchTerm("");
                }}
                className={`px-3 py-1.5 border ${borderMain} rounded text-xs font-bold uppercase ${hoverBg} transition-colors`}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
