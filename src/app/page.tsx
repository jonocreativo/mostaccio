"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "@/firebase";
import {
  Inbox,
  ExternalLink,
  User,
  Mail,
  Search,
  Plus,
  Check,
  X,
  Layers,
  Activity,
  Workflow,
  Sparkles,
  Link2,
  Link2Off,
  AlertCircle,
  Eye,
  RefreshCw,
  Clock
} from "lucide-react";

interface Message {
  messageId: string;
  sender: string;
  recipient: string;
  subject: string;
  date: string;
  body: string;
}

interface CaseFlow {
  threadId: string;
  subject: string;
  sender: string;
  recipient: string;
  hasUnread: boolean;
  messages: Message[];
}

interface Case {
  id: string;
  title: string;
  status: "activo" | "resuelto";
  createdAt: string;
  updatedAt: string;
  inicial?: CaseFlow;
  levantamiento?: CaseFlow;
}

export default function AssistantPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"todos" | "activos" | "resueltos" | "huerfanos">("todos");
  const [isLoading, setIsLoading] = useState(true);
  const [isLinkingModalOpen, setIsLinkingModalOpen] = useState(false);
  const [caseToLink, setCaseToLink] = useState<Case | null>(null);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"cases">("cases");

  // Escuchar la colección de 'cases' en Firestore en tiempo real
  useEffect(() => {
    const q = query(collection(db, "cases"), orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData: Case[] = [];
      snapshot.forEach((doc) => {
        casesData.push({
          id: doc.id,
          ...doc.data()
        } as Case);
      });
      setCases(casesData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error al escuchar casos:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const selectedCase = cases.find(c => c.id === selectedCaseId) || null;

  // Registrar un log de simulación
  const addSimLog = (msg: string) => {
    setSimulationLogs(prev => [
      `[${new Date().toLocaleTimeString()}] ${msg}`,
      ...prev.slice(0, 15)
    ]);
  };

  // Cambiar el estado del caso (Activo / Resuelto)
  const toggleCaseStatus = async (item: Case) => {
    try {
      const caseRef = doc(db, "cases", item.id);
      const newStatus = item.status === "activo" ? "resuelto" : "activo";
      await updateDoc(caseRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      addSimLog(`Caso '${item.title}' cambiado a ${newStatus.toUpperCase()}`);
    } catch (error) {
      console.error("Error al cambiar estado del caso:", error);
    }
  };

  // Marcar movimiento como leído (individual para inicial o levantamiento)
  const markAsRead = async (caseItem: Case, flowType: "inicial" | "levantamiento") => {
    try {
      const caseRef = doc(db, "cases", caseItem.id);
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (flowType === "inicial" && caseItem.inicial) {
        updateData["inicial.hasUnread"] = false;
      } else if (flowType === "levantamiento" && caseItem.levantamiento) {
        updateData["levantamiento.hasUnread"] = false;
      }

      await updateDoc(caseRef, updateData);
      addSimLog(`Movimiento en correo ${flowType} de '${caseItem.title}' marcado como leído.`);
    } catch (error) {
      console.error("Error al marcar como leído:", error);
    }
  };

  // Marcar ambos flujos como leídos
  const markAllAsRead = async (caseItem: Case) => {
    try {
      const caseRef = doc(db, "cases", caseItem.id);
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };
      if (caseItem.inicial) updateData["inicial.hasUnread"] = false;
      if (caseItem.levantamiento) updateData["levantamiento.hasUnread"] = false;

      await updateDoc(caseRef, updateData);
      addSimLog(`Todo el movimiento de '${caseItem.title}' marcado como leído.`);
    } catch (error) {
      console.error("Error al limpiar movimientos:", error);
    }
  };

  // Eliminar un caso
  const handleDeleteCase = async (caseId: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar este caso del asistente?")) {
      try {
        await deleteDoc(doc(db, "cases", caseId));
        if (selectedCaseId === caseId) setSelectedCaseId(null);
        addSimLog(`Caso eliminado: ${caseId}`);
      } catch (error) {
        console.error("Error al eliminar caso:", error);
      }
    }
  };

  // Desvincular levantamiento
  const handleUnlinkLevantamiento = async (caseItem: Case) => {
    if (!caseItem.levantamiento) return;
    if (confirm("¿Estás seguro de que deseas desvincular el correo de levantamiento de este caso inicial? Se convertirá en un levantamiento independiente.")) {
      try {
        const batch = writeBatch(db);

        // 1. Crear el levantamiento como caso huérfano usando su propio threadId
        const orphanRef = doc(db, "cases", caseItem.levantamiento.threadId);
        batch.set(orphanRef, {
          id: caseItem.levantamiento.threadId,
          title: caseItem.levantamiento.subject || "Levantamiento Desvinculado",
          status: "activo",
          createdAt: caseItem.createdAt,
          updatedAt: new Date().toISOString(),
          levantamiento: caseItem.levantamiento
        });

        // 2. Quitar el levantamiento del caso inicial
        const caseRef = doc(db, "cases", caseItem.id);
        const updatedCase = { ...caseItem };
        delete updatedCase.levantamiento;

        batch.update(caseRef, {
          updatedAt: new Date().toISOString(),
          levantamiento: null
        });

        await batch.commit();
        addSimLog(`Levantamiento desvinculado de '${caseItem.title}'. Creado caso huérfano.`);
      } catch (error) {
        console.error("Error al desvincular levantamiento:", error);
      }
    }
  };

  // Vincular un levantamiento huérfano a un caso inicial
  const handleLinkLevantamiento = async (inicialCase: Case, levantamientoCase: Case) => {
    if (!levantamientoCase.levantamiento) return;
    try {
      const batch = writeBatch(db);

      // 1. Añadir el flujo de levantamiento al caso inicial
      const caseRef = doc(db, "cases", inicialCase.id);
      batch.update(caseRef, {
        updatedAt: new Date().toISOString(),
        levantamiento: {
          ...levantamientoCase.levantamiento,
          hasUnread: true // Forzar alerta para denotar la vinculación exitosa
        }
      });

      // 2. Eliminar el caso huérfano original
      const orphanRef = doc(db, "cases", levantamientoCase.id);
      batch.delete(orphanRef);

      await batch.commit();
      setIsLinkingModalOpen(false);
      setCaseToLink(null);
      addSimLog(`Levantamiento '${levantamientoCase.title}' vinculado exitosamente a '${inicialCase.title}'.`);
    } catch (error) {
      console.error("Error al vincular levantamiento:", error);
    }
  };

  // SIMULACIONES PARA LA DEMO / PRUEBAS EN TIEMPO REAL
  const simulateNewCase = async () => {
    try {
      const mockThreadId = "inicial_" + Math.random().toString(36).substring(2, 11);
      const mockMessageId = "msg_ini_" + Math.random().toString(36).substring(2, 11);
      const caseRef = doc(db, "cases", mockThreadId);

      const subjects = [
        "Reclamación por retraso en despacho de mercancía",
        "Revisión de contrato de arrendamiento local comercial",
        "Consulta sobre propiedad intelectual y registro de marca",
        "Disputa de términos en acuerdo de confidencialidad NDA"
      ];
      const senders = [
        "Carlos Mendoza <carlos.m@empresa.cl>",
        "Isabel Silva <isabel.silva@inmobiliaria.com>",
        "Jaime Duarte <jduarte@agenciadigital.com>",
        "Valeria Rojas <vrojas@legaltech.io>"
      ];
      const bodies = [
        "Estimados,\n\nEscribo porque aún no tenemos respuesta sobre el retraso en el despacho del cargamento del lunes pasado. El cliente nos está cobrando multas y necesitamos que el área correspondiente nos apoye.\n\nAtentamente,\nCarlos Mendoza.",
        "Hola Mostaccio,\n\nAdjunto el borrador del nuevo contrato de arrendamiento para la oficina 504. Necesitamos la revisión legal antes del viernes para poder firmar con la contraparte.\n\nSaludos,\nIsabel.",
        "Hola equipo,\n\nQueremos iniciar el registro de la nueva marca 'Mostaccio App'. ¿Qué documentos necesitamos preparar y cuánto tiempo toma la gestión legal ante la oficina de patentes?\n\nGracias,\nJaime.",
        "Estimado Asistente,\n\nLa contraparte nos envió modificaciones al contrato de confidencialidad NDA. No estamos de acuerdo con la cláusula 5 sobre propiedad cruzada. ¿Podrían revisar el impacto legal de esta modificación?\n\nQuedo atenta,\nValeria."
      ];

      const index = Math.floor(Math.random() * subjects.length);

      await setDoc(caseRef, {
        id: mockThreadId,
        title: subjects[index],
        status: "activo",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        inicial: {
          threadId: mockThreadId,
          subject: subjects[index],
          sender: senders[index],
          recipient: "asistente@mostaccio.com",
          hasUnread: true,
          messages: [
            {
              messageId: mockMessageId,
              sender: senders[index],
              recipient: "asistente@mostaccio.com",
              subject: subjects[index],
              date: new Date().toISOString(),
              body: bodies[index]
            }
          ]
        }
      });

      setSelectedCaseId(mockThreadId);
      addSimLog(`[Simulación] Correo Inicial Creado: "${subjects[index]}"`);
    } catch (e) {
      console.error(e);
    }
  };

  const simulateNewOrphanLevantamiento = async () => {
    try {
      const mockThreadId = "levantamiento_" + Math.random().toString(36).substring(2, 11);
      const mockMessageId = "msg_lev_" + Math.random().toString(36).substring(2, 11);
      const caseRef = doc(db, "cases", mockThreadId);

      const subjects = [
        "Fwd: Reclamación por retraso en despacho de mercancía (Levantamiento Legal)",
        "Fwd: Revisión de contrato de arrendamiento local comercial - Caso #903",
        "Fwd: Consulta sobre propiedad intelectual y registro de marca - Fwd: Marca",
        "Fwd: Disputa de términos en acuerdo de confidencialidad NDA [Levantamiento]"
      ];
      const body = "Estimados área Legal,\n\nLes reenvío el caso del mandante para que lo revisemos con urgencia. Favor darnos sus comentarios de riesgo para responder al cliente.\n\nSlds,\nAsistente Mostaccio.";

      const index = Math.floor(Math.random() * subjects.length);

      await setDoc(caseRef, {
        id: mockThreadId,
        title: subjects[index],
        status: "activo",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        levantamiento: {
          threadId: mockThreadId,
          subject: subjects[index],
          sender: "Asistente Mostaccio <asistente@mostaccio.com>",
          recipient: "legal@corporativo.com",
          hasUnread: true,
          messages: [
            {
              messageId: mockMessageId,
              sender: "Asistente Mostaccio <asistente@mostaccio.com>",
              recipient: "legal@corporativo.com",
              subject: subjects[index],
              date: new Date().toISOString(),
              body: body
            }
          ]
        }
      });

      setSelectedCaseId(mockThreadId);
      addSimLog(`[Simulación] Levantamiento Huérfano Creado: "${subjects[index]}"`);
    } catch (e) {
      console.error(e);
    }
  };

  const simulateClientResponse = async () => {
    if (!selectedCase || !selectedCase.inicial) {
      alert("Por favor selecciona un caso con correo inicial activo.");
      return;
    }
    try {
      const mockMessageId = "msg_resp_cli_" + Math.random().toString(36).substring(2, 11);
      const caseRef = doc(db, "cases", selectedCase.id);

      const newResponse = {
        messageId: mockMessageId,
        sender: selectedCase.inicial.sender,
        recipient: "asistente@mostaccio.com",
        subject: `Re: ${selectedCase.inicial.subject}`,
        date: new Date().toISOString(),
        body: "Hola,\n\nEscribo para saber si tienen novedades sobre la consulta enviada. Es urgente para nosotros.\n\nGracias!"
      };

      await updateDoc(caseRef, {
        updatedAt: new Date().toISOString(),
        "inicial.messages": [...selectedCase.inicial.messages, newResponse],
        "inicial.hasUnread": true
      });

      addSimLog(`[Simulación] Nueva respuesta del cliente en "${selectedCase.title}"`);
    } catch (e) {
      console.error(e);
    }
  };

  const simulateLegalResponse = async () => {
    if (!selectedCase || !selectedCase.levantamiento) {
      alert("Por favor selecciona un caso que tenga un correo de levantamiento vinculado.");
      return;
    }
    try {
      const mockMessageId = "msg_resp_leg_" + Math.random().toString(36).substring(2, 11);
      const caseRef = doc(db, "cases", selectedCase.id);

      const newResponse = {
        messageId: mockMessageId,
        sender: "Área Legal <legal@corporativo.com>",
        recipient: "asistente@mostaccio.com",
        subject: `Re: ${selectedCase.levantamiento.subject}`,
        date: new Date().toISOString(),
        body: "Estimado,\n\nHemos revisado los antecedentes comerciales y legales del caso. El riesgo es bajo. Procedan a enviar la respuesta estándar bajo el anexo B del contrato marco.\n\nSaludos,\nFiscalía Legal."
      };

      await updateDoc(caseRef, {
        updatedAt: new Date().toISOString(),
        "levantamiento.messages": [...selectedCase.levantamiento.messages, newResponse],
        "levantamiento.hasUnread": true
      });

      addSimLog(`[Simulación] Nueva respuesta legal en "${selectedCase.title}"`);
    } catch (e) {
      console.error(e);
    }
  };

  const simulateAutoLinkedFlow = async () => {
    try {
      const baseSubject = "Contrato de Prestación de Servicios IT 2026";
      const threadIdIni = "auto_ini_" + Math.random().toString(36).substring(2, 11);
      const threadIdLev = "auto_lev_" + Math.random().toString(36).substring(2, 11);
      const msgIdIni = "msg_ai_" + Math.random().toString(36).substring(2, 11);
      const msgIdLev = "msg_al_" + Math.random().toString(36).substring(2, 11);

      // 1. Crear el caso inicial
      await setDoc(doc(db, "cases", threadIdIni), {
        id: threadIdIni,
        title: baseSubject,
        status: "activo",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        inicial: {
          threadId: threadIdIni,
          subject: baseSubject,
          sender: "Andres Soto <asoto@proveedor-it.cl>",
          recipient: "asistente@mostaccio.com",
          hasUnread: true,
          messages: [
            {
              messageId: msgIdIni,
              sender: "Andres Soto <asoto@proveedor-it.cl>",
              recipient: "asistente@mostaccio.com",
              subject: baseSubject,
              date: new Date().toISOString(),
              body: "Hola,\n\nAdjuntamos la propuesta de contrato de servicios de desarrollo IT. Esperamos sus comentarios.\n\nSlds."
            }
          ]
        }
      });
      addSimLog(`[Auto-Vincular] 1. Recibido Correo Inicial: "${baseSubject}"`);

      // 2. Simular un delay corto y disparar el webhook del levantamiento con un asunto similar
      setTimeout(async () => {
        try {
          const response = await fetch("/api/webhook/gmail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              threadId: threadIdLev,
              messageId: msgIdLev,
              sender: "Asistente Mostaccio <asistente@mostaccio.com>",
              recipient: "legal@corporativo.com",
              subject: `Fwd: ${baseSubject} (Revisar Cláusulas)`,
              date: new Date().toISOString(),
              body: "Hola legal, favor revisar y visar contrato IT.",
              type: "levantamiento"
            })
          });
          const resJson = await response.json();
          addSimLog(`[Auto-Vincular] 2. Webhook procesó Levantamiento. Acción: ${resJson.action}`);
          setSelectedCaseId(threadIdIni);
        } catch (err) {
          console.error("Error en simulación de webhook:", err);
        }
      }, 800);

    } catch (e) {
      console.error(e);
    }
  };

  // Filtrado y búsqueda
  const filteredCases = cases.filter(item => {
    const titleMatch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.inicial && item.inicial.sender.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.levantamiento && item.levantamiento.sender.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!titleMatch) return false;

    if (filterType === "activos") {
      return item.status === "activo";
    }
    if (filterType === "resueltos") {
      return item.status === "resuelto";
    }
    if (filterType === "huerfanos") {
      return !item.inicial && !!item.levantamiento;
    }
    return true;
  });

  const hasGlobalAlerts = cases.some(c => (c.inicial?.hasUnread) || (c.levantamiento?.hasUnread));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans text-xs">

      {/* ESTILOS CSS INLINE PARA ANIMACIONES EXCLUSIVAS */}
      <style jsx global>{`
        @keyframes glow-pulse-violet {
          0%, 100% {
            box-shadow: inset 0 0 15px rgba(139, 92, 246, 0.15), 0 0 5px rgba(139, 92, 246, 0.1);
            border-color: rgba(139, 92, 246, 0.4);
          }
          50% {
            box-shadow: inset 0 0 25px rgba(139, 92, 246, 0.35), 0 0 15px rgba(139, 92, 246, 0.25);
            border-color: rgba(139, 92, 246, 0.8);
          }
        }
        @keyframes glow-pulse-amber {
          0%, 100% {
            box-shadow: inset 0 0 15px rgba(245, 158, 11, 0.15), 0 0 5px rgba(245, 158, 11, 0.1);
            border-color: rgba(245, 158, 11, 0.4);
          }
          50% {
            box-shadow: inset 0 0 25px rgba(245, 158, 11, 0.35), 0 0 15px rgba(245, 158, 11, 0.25);
            border-color: rgba(245, 158, 11, 0.8);
          }
        }
        @keyframes orbit-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-4px) scale(1.02); }
        }
        .animate-glow-violet {
          animation: glow-pulse-violet 2s infinite ease-in-out;
        }
        .animate-glow-amber {
          animation: glow-pulse-amber 2s infinite ease-in-out;
        }
        .animate-orbit-cw {
          animation: orbit-rotate 10s infinite linear;
        }
        .animate-orbit-ccw {
          animation: orbit-rotate 15s infinite linear reverse;
        }
        .animate-float {
          animation: float-slow 4s infinite ease-in-out;
        }
      `}</style>

      {/* MENÚ LATERAL DE NAVEGACIÓN */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/40 flex flex-col h-full shrink-0">
        {/* Header de la barra lateral */}
        <div className="p-6 border-b border-slate-800 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {/* Ojo del Asistente (Widget SVG Animado) */}
            <div className="relative w-8 h-8 flex items-center justify-center bg-slate-950 rounded-lg border border-slate-800 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <svg className="w-6 h-6" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(71, 85, 105, 0.4)" strokeWidth="1" strokeDasharray="5,3" className="animate-orbit-cw origin-center" />
                <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(99, 102, 241, 0.3)" strokeWidth="1.5" strokeDasharray="30,8" className="animate-orbit-ccw origin-center" />
                <circle
                  cx="50"
                  cy="50"
                  r="10"
                  fill={hasGlobalAlerts ? "url(#sidebarAlertGrad)" : "url(#sidebarActiveGrad)"}
                  className={`origin-center ${hasGlobalAlerts ? 'animate-pulse' : ''}`}
                  style={{ transformOrigin: 'center' }}
                />
                <defs>
                  <linearGradient id="sidebarActiveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="sidebarAlertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
              </svg>
              {hasGlobalAlerts && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-violet-500 rounded-full animate-ping" />
              )}
            </div>
            <div>
              <div className="flex flex-col">
                <span className="font-mono text-xs font-black tracking-widest bg-gradient-to-r from-violet-400 to-amber-300 bg-clip-text text-transparent uppercase leading-tight">
                  MOSTACCIO
                </span>
                <span className="text-[8px] text-slate-500 font-mono tracking-wider">ASISTENTE DE CASOS</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-full font-mono text-[9px] text-slate-400 w-fit">
            <span className={`w-1.5 h-1.5 rounded-full ${hasGlobalAlerts ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
            <span>ESTADO: {hasGlobalAlerts ? 'ALERTAS' : 'SINTONIZADO'}</span>
          </div>
        </div>

        {/* Opciones del menú */}
        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setActiveTab("cases")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-mono text-[10px] transition-all ${
              activeTab === "cases"
                ? "bg-slate-800 text-slate-100 border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Inbox className="w-4 h-4 text-violet-400" />
              <span>VER CASOS</span>
            </div>
            {hasGlobalAlerts && (
              <span className="bg-violet-500 text-white font-bold text-[8px] px-2 py-0.5 rounded-full">
                NUEVO
              </span>
            )}
          </button>
        </nav>

        {/* Footer del menú lateral */}
        <div className="p-4 border-t border-slate-850 text-center text-[9px] text-slate-600 font-mono">
          v0.1.0 &copy; Mostaccio
        </div>
      </aside>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {activeTab === "cases" && (
          <>
            {/* CABECERA SIMPLIFICADA DE CASOS */}
            <header className="border-b border-slate-850 bg-slate-900/20 py-3.5 px-6 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-400" />
                <span className="font-mono text-xs font-bold text-slate-200">BANDEJA DE CASOS</span>
                <span className="text-[10px] text-slate-500 font-mono">({filteredCases.length} activos)</span>
              </div>
              <div className="text-[9px] text-slate-500 font-mono">
                Vinculación inteligente de correos
              </div>
            </header>

            {/* ÁREA DE CONTENIDO DE CASOS */}
            <div className="flex flex-1 overflow-hidden">

        {/* PANEL IZQUIERDO: PILAS / CARDS */}
        <aside className="w-80 md:w-1/2 max-w-xl border-r border-slate-800 flex flex-col h-full bg-slate-900/20 shrink-0">

          <div className="p-4 border-b border-slate-800 bg-slate-900/40 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por asunto, cliente o legal..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-md py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-violet-500 focus:bg-slate-950 transition-colors placeholder-slate-600"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { id: "todos", label: "Todos" },
                { id: "activos", label: "Activos" },
                { id: "resueltos", label: "Resueltos" },
                { id: "huerfanos", label: "Levantamientos" }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id as any)}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono border transition-all shrink-0 ${filterType === f.id
                      ? "bg-slate-200 text-slate-950 border-slate-200 font-bold"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                    }`}
                >
                  {f.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/45">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500 font-mono">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 opacity-50" />
                <span>Sincronizando con base de datos...</span>
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="p-8 text-center text-slate-600 border border-dashed border-slate-800 rounded-lg bg-slate-900/10">
                <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-700 stroke-[1.5]" />
                <p className="font-mono text-[10px]">No se encontraron pilas en esta sección</p>
              </div>
            ) : (
              filteredCases.map((c) => {
                const isSelected = c.id === selectedCaseId;
                const hasUnreadInicial = c.inicial?.hasUnread;
                const hasUnreadLevantamiento = c.levantamiento?.hasUnread;
                const isOrphan = !c.inicial && !!c.levantamiento;

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className={`group cursor-pointer rounded-lg border transition-all duration-300 relative overflow-hidden flex flex-col ${isSelected
                        ? "bg-slate-900/90 border-slate-500 shadow-[0_0_15px_rgba(139,92,246,0.15)] scale-[1.01]"
                        : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                      }`}
                  >
                    <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
                      <span className="font-semibold text-slate-200 truncate pr-2 max-w-[75%]">
                        {c.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOrphan && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">
                            HUÉRFANO
                          </span>
                        )}
                        <span className={`text-[8px] font-mono px-1 py-0.2 rounded ${c.status === "activo"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-slate-800 text-slate-500 border border-slate-700"
                          }`}>
                          {c.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 divide-x divide-slate-800/80">
                      <div
                        className={`p-3 space-y-1.5 transition-all relative ${hasUnreadInicial ? "bg-violet-950/20 animate-glow-violet" : ""
                          }`}
                      >
                        {hasUnreadInicial && (
                          <div className="absolute top-2 right-2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
                            <span className="text-[8px] font-mono text-violet-400 font-bold">NUEVO</span>
                          </div>
                        )}

                        <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                          Inicial (Cliente)
                        </div>
                        {c.inicial ? (
                          <>
                            <div className="font-bold text-slate-300 truncate">
                              {c.inicial.sender.split("<")[0].trim()}
                            </div>
                            <div className="text-slate-400 line-clamp-1 text-[10px]">
                              {c.inicial.messages[c.inicial.messages.length - 1]?.body}
                            </div>
                            <div className="text-[8px] text-slate-500 font-mono">
                              {new Date(c.inicial.messages[c.inicial.messages.length - 1]?.date || c.updatedAt).toLocaleDateString("es-ES", {
                                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="py-2 text-slate-600 italic text-[10px] flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 stroke-[1.5]" />
                            Falta correo inicial
                          </div>
                        )}
                      </div>

                      <div
                        className={`p-3 space-y-1.5 transition-all relative ${hasUnreadLevantamiento ? "bg-amber-950/20 animate-glow-amber" : ""
                          }`}
                      >
                        {hasUnreadLevantamiento && (
                          <div className="absolute top-2 right-2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            <span className="text-[8px] font-mono text-amber-400 font-bold">NUEVO</span>
                          </div>
                        )}

                        <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                          Levantamiento (Legal)
                        </div>
                        {c.levantamiento ? (
                          <>
                            <div className="font-bold text-slate-300 truncate">
                              {c.levantamiento.recipient.split("<")[0].trim() || "Área Legal"}
                            </div>
                            <div className="text-slate-400 line-clamp-1 text-[10px]">
                              {c.levantamiento.messages[c.levantamiento.messages.length - 1]?.body}
                            </div>
                            <div className="text-[8px] text-slate-500 font-mono">
                              {new Date(c.levantamiento.messages[c.levantamiento.messages.length - 1]?.date || c.updatedAt).toLocaleDateString("es-ES", {
                                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="py-2 h-full flex flex-col justify-center items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCaseToLink(c);
                                setIsLinkingModalOpen(true);
                              }}
                              className="px-2 py-1 bg-slate-950 border border-slate-800 hover:border-slate-600 hover:text-slate-100 rounded text-[9px] text-slate-400 font-mono flex items-center gap-1 transition-all"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              VINCULAR
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {(hasUnreadInicial || hasUnreadLevantamiento) && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          markAllAsRead(c);
                        }}
                        className="bg-slate-900 border-t border-slate-800 text-[8px] font-mono text-center text-slate-400 py-1 hover:text-white hover:bg-slate-800 transition-colors uppercase tracking-wider"
                      >
                        Limpiar alertas de movimiento
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* PANEL DERECHO: VISTA EN PARALELO / DETALLE DE CASO */}
        <main className="flex-1 flex flex-col h-full bg-slate-950/70 overflow-hidden">
          {selectedCase ? (
            <div className="flex flex-col h-full overflow-hidden">

              <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center gap-4 shrink-0">
                <div className="space-y-1 max-w-[70%]">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${selectedCase.status === "activo"
                        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                        : "border-slate-700 text-slate-500 bg-slate-800"
                      }`}>
                      {selectedCase.status.toUpperCase()}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">ID: {selectedCase.id}</span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-100 leading-tight truncate">
                    {selectedCase.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {((selectedCase.inicial?.hasUnread) || (selectedCase.levantamiento?.hasUnread)) && (
                    <button
                      onClick={() => markAllAsRead(selectedCase)}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px] py-1.5 px-2.5 rounded transition-all flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Marcar Leído
                    </button>
                  )}

                  <button
                    onClick={() => toggleCaseStatus(selectedCase)}
                    className={`font-mono text-[10px] py-1.5 px-3 rounded transition-all border ${selectedCase.status === "activo"
                        ? "bg-slate-200 text-slate-950 hover:bg-white border-slate-200"
                        : "bg-slate-900 text-slate-300 hover:bg-slate-800 border-slate-700"
                      }`}
                  >
                    {selectedCase.status === "activo" ? "RESOLVER CASO" : "REABRIR CASO"}
                  </button>

                  <button
                    onClick={() => handleDeleteCase(selectedCase.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded transition-all"
                    title="Eliminar caso"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">

                <div className="flex flex-col h-full overflow-hidden bg-slate-950/20">
                  <div className="p-3 border-b border-slate-800 bg-slate-900/15 flex justify-between items-center shrink-0">
                    <span className="font-mono text-[9px] text-violet-400 font-bold flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-violet-400" />
                      FLUJO INICIAL (CLIENTE)
                    </span>
                    {selectedCase.inicial?.hasUnread && (
                      <button
                        onClick={() => markAsRead(selectedCase, "inicial")}
                        className="text-[8px] font-mono px-2 py-0.5 bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/25 rounded transition-all"
                      >
                        MARCAR LEÍDO
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {selectedCase.inicial ? (
                      selectedCase.inicial.messages.map((message, index) => (
                        <div
                          key={message.messageId || index}
                          className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-lg space-y-3 hover:border-slate-700/60 transition-all shadow-sm"
                        >
                          <div className="flex justify-between items-start gap-2 border-b border-slate-800/50 pb-2 text-[10px]">
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-200">{message.sender}</div>
                              <div className="text-[9px] text-slate-500 font-mono">Para: {message.recipient}</div>
                            </div>
                            <span className="text-[8px] text-slate-500 font-mono whitespace-nowrap">
                              {new Date(message.date).toLocaleString("es-ES")}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {message.body}
                          </div>

                          {!message.messageId.startsWith("msg_") && (
                            <div className="pt-2 flex justify-end">
                              <a
                                href={`https://mail.google.com/mail/u/0/#inbox/${message.messageId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-[8px] font-mono text-slate-400 hover:text-slate-200 px-2 py-1 rounded transition-colors"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                VER EN GMAIL
                              </a>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col justify-center items-center p-8 text-center text-slate-600">
                        <AlertCircle className="w-8 h-8 mb-2 stroke-[1.5] text-slate-700" />
                        <p className="font-mono text-[10px]">Este caso solo tiene el flujo de levantamiento.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col h-full overflow-hidden bg-slate-950/20">
                  <div className="p-3 border-b border-slate-800 bg-slate-900/15 flex justify-between items-center shrink-0">
                    <span className="font-mono text-[9px] text-amber-400 font-bold flex items-center gap-1">
                      <Workflow className="w-3.5 h-3.5 text-amber-400" />
                      FLUJO LEVANTAMIENTO (LEGAL)
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedCase.levantamiento && (
                        <button
                          onClick={() => handleUnlinkLevantamiento(selectedCase)}
                          className="text-[8px] font-mono px-2 py-0.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-red-400 hover:border-red-500/20 rounded transition-all flex items-center gap-1"
                          title="Desvincular levantamiento del correo inicial"
                        >
                          <Link2Off className="w-2.5 h-2.5" />
                          DESVINCULAR
                        </button>
                      )}
                      {selectedCase.levantamiento?.hasUnread && (
                        <button
                          onClick={() => markAsRead(selectedCase, "levantamiento")}
                          className="text-[8px] font-mono px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 rounded transition-all"
                        >
                          MARCAR LEÍDO
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {selectedCase.levantamiento ? (
                      selectedCase.levantamiento.messages.map((message, index) => (
                        <div
                          key={message.messageId || index}
                          className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-lg space-y-3 hover:border-slate-700/60 transition-all shadow-sm"
                        >
                          <div className="flex justify-between items-start gap-2 border-b border-slate-800/50 pb-2 text-[10px]">
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-200">{message.sender}</div>
                              <div className="text-[9px] text-slate-500 font-mono">Para: {message.recipient}</div>
                            </div>
                            <span className="text-[8px] text-slate-500 font-mono whitespace-nowrap">
                              {new Date(message.date).toLocaleString("es-ES")}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {message.body}
                          </div>

                          {!message.messageId.startsWith("msg_") && (
                            <div className="pt-2 flex justify-end">
                              <a
                                href={`https://mail.google.com/mail/u/0/#inbox/${message.messageId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-[8px] font-mono text-slate-400 hover:text-slate-200 px-2 py-1 rounded transition-colors"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                VER EN GMAIL
                              </a>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col justify-center items-center p-8 text-center bg-slate-900/5 border border-dashed border-slate-800 rounded-lg m-2">
                        <Link2 className="w-8 h-8 mb-2 stroke-[1.5] text-slate-700" />
                        <h4 className="font-bold text-slate-300 text-xs mb-1">Sin Correo de Levantamiento</h4>
                        <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed mb-4">
                          No se ha registrado un reenvío para levantar este caso al área legal. Sincroniza desde Gmail o asocia un levantamiento huérfano.
                        </p>
                        <button
                          onClick={() => {
                            setCaseToLink(selectedCase);
                            setIsLinkingModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 rounded text-[10px] font-mono transition-all flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          VINCULAR LEVANTAMIENTO EXISTENTE
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center p-8 bg-slate-950/20 select-none">
              <div className="max-w-md text-center space-y-6">

                <div className="w-16 h-16 mx-auto bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center rounded-2xl shadow-[0_0_30px_rgba(99,102,241,0.25)] border border-violet-400/20 animate-float">
                  <Eye className="w-8 h-8 stroke-[1.5]" />
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-slate-200 uppercase tracking-widest text-xs">
                    Asistente Listo
                  </h3>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                    Selecciona una pila de la izquierda para desplegar el panel de doble flujo o usa el simulador inferior para generar actividad interactiva.
                  </p>
                </div>

                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={simulateNewCase}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded font-mono text-[9px] transition-all"
                  >
                    Simular Correo Cliente
                  </button>
                  <button
                    onClick={simulateAutoLinkedFlow}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded font-mono text-[9px] transition-all flex items-center gap-1 shadow-md shadow-violet-900/30"
                  >
                    <Sparkles className="w-3 h-3" />
                    Simular Flujo Completo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SIMULADOR DE EVENTOS INTEGRADO */}
          <div className="border-t border-slate-800 bg-slate-950 p-4 shrink-0">
            <div className="flex items-center justify-between mb-3 border-b border-slate-900 pb-2">
              <span className="font-mono text-[9px] text-emerald-400 font-bold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                SIMULADOR DE EVENTOS DE CORREO
              </span>
              <button
                onClick={() => setSimulationLogs([])}
                className="text-[8px] font-mono text-slate-600 hover:text-slate-400"
              >
                LIMPIAR BITÁCORA
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  onClick={simulateNewCase}
                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-left hover:border-slate-700 transition-all group"
                >
                  <div className="font-bold text-slate-300 text-[10px] group-hover:text-slate-100 flex items-center gap-1">
                    <Plus className="w-3 h-3 text-violet-400" />
                    1. Correo Inicial
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">Llega correo de cliente</div>
                </button>

                <button
                  onClick={simulateNewOrphanLevantamiento}
                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-left hover:border-slate-700 transition-all group"
                >
                  <div className="font-bold text-slate-300 text-[10px] group-hover:text-slate-100 flex items-center gap-1">
                    <Plus className="w-3 h-3 text-amber-400" />
                    2. Levantamiento
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">Reenvío a legal sin asociar</div>
                </button>

                <button
                  onClick={simulateAutoLinkedFlow}
                  className="p-2 bg-violet-950/20 hover:bg-violet-950/40 border border-violet-900/40 rounded text-left transition-all group col-span-2 sm:col-span-1"
                >
                  <div className="font-bold text-violet-300 text-[10px] group-hover:text-violet-200 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Auto-Vincular
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">Enlace automático inteligente</div>
                </button>

                <button
                  onClick={simulateClientResponse}
                  disabled={!selectedCase || !selectedCase.inicial}
                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-left hover:border-slate-700 transition-all group disabled:opacity-40 disabled:hover:bg-slate-900"
                >
                  <div className="font-bold text-slate-300 text-[10px] group-hover:text-slate-100 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-violet-400 animate-pulse" />
                    Mov. Cliente
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">Simula respuesta de cliente</div>
                </button>

                <button
                  onClick={simulateLegalResponse}
                  disabled={!selectedCase || !selectedCase.levantamiento}
                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-left hover:border-slate-700 transition-all group disabled:opacity-40 disabled:hover:bg-slate-900"
                >
                  <div className="font-bold text-slate-300 text-[10px] group-hover:text-slate-100 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-amber-400 animate-pulse" />
                    Mov. Legal
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">Simula respuesta de legal</div>
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-900 p-2 rounded h-24 overflow-y-auto font-mono text-[8px] text-slate-400 space-y-1">
                {simulationLogs.length === 0 ? (
                  <span className="text-slate-600 block italic">Listo para simular eventos de correo...</span>
                ) : (
                  simulationLogs.map((log, i) => (
                    <div key={i} className="truncate">{log}</div>
                  ))
                )}
              </div>

            </div>
          </div>

        </main>
      </div>
    </>
  )}
</div>

      {/* MODAL DE VINCULACIÓN MANUAL */}
      {isLinkingModalOpen && caseToLink && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-md overflow-hidden shadow-2xl">

            <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
              <span className="font-bold text-slate-200 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-violet-400" />
                Vincular Levantamiento Legal
              </span>
              <button
                onClick={() => {
                  setIsLinkingModalOpen(false);
                  setCaseToLink(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">

              <div className="bg-slate-950 p-3 rounded border border-slate-850 space-y-1">
                <span className="text-[8px] font-mono text-slate-500 uppercase">Caso Inicial (Destino):</span>
                <h4 className="font-bold text-slate-200 text-xs">{caseToLink.title}</h4>
                {caseToLink.inicial && (
                  <p className="text-[9px] text-slate-400 font-mono">Remitente: {caseToLink.inicial.sender}</p>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-[8px] font-mono text-slate-400 uppercase tracking-wider block">
                  Levantamientos Independientes Detectados:
                </span>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {cases.filter(c => !c.inicial && !!c.levantamiento).length === 0 ? (
                    <div className="p-6 text-center text-slate-500 bg-slate-950/40 border border-dashed border-slate-800 rounded">
                      <AlertCircle className="w-5 h-5 mx-auto mb-1 stroke-[1.5]" />
                      <p className="text-[9px]">No hay correos de levantamiento huérfanos registrados.</p>
                      <p className="text-[8px] text-slate-600 mt-1">Usa el simulador para crear uno.</p>
                    </div>
                  ) : (
                    cases
                      .filter(c => !c.inicial && !!c.levantamiento)
                      .map((orphan) => (
                        <div
                          key={orphan.id}
                          onClick={() => handleLinkLevantamiento(caseToLink, orphan)}
                          className="p-2.5 bg-slate-950 border border-slate-800/80 hover:border-violet-500/50 hover:bg-slate-900/60 rounded cursor-pointer transition-all flex justify-between items-center group"
                        >
                          <div className="space-y-0.5 max-w-[80%]">
                            <h5 className="font-bold text-slate-200 text-[10px] group-hover:text-violet-300 truncate">
                              {orphan.title}
                            </h5>
                            <p className="text-[8px] text-slate-500 truncate">
                              Enviado a: {orphan.levantamiento?.recipient}
                            </p>
                          </div>
                          <span className="text-[8px] font-mono bg-violet-950 text-violet-400 border border-violet-900/40 px-1.5 py-0.5 rounded opacity-80 group-hover:opacity-100 transition-opacity">
                            VINCULAR
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>

            </div>

            <div className="px-4 py-3 bg-slate-950/30 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => {
                  setIsLinkingModalOpen(false);
                  setCaseToLink(null);
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 rounded font-mono text-[9px] transition-all"
              >
                CANCELAR
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
