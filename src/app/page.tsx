"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"threads">("threads");

  // Load saved theme or system preference on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

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

  // Grayscale variables based on theme
  const bgMain = theme === "light" ? "bg-white" : "bg-black";
  const bgSecondary = theme === "light" ? "bg-gray-50" : "bg-zinc-950";
  const textMain = theme === "light" ? "text-black" : "text-white";
  const textSecondary = theme === "light" ? "text-gray-500" : "text-zinc-400";
  const borderMain = theme === "light" ? "border-gray-200" : "border-zinc-800";
  const hoverBg = theme === "light" ? "hover:bg-gray-100" : "hover:bg-zinc-900";
  const activeBg = theme === "light" ? "bg-gray-100" : "bg-zinc-900";
  const shadowStyle = theme === "light" ? "shadow-[1px_1px_0px_0px_#000000]" : "shadow-[1px_1px_0px_0px_#ffffff]";

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${bgMain} ${textMain} font-sans text-sm transition-colors duration-250`}>
      
      {/* BARRA LATERAL (SIDEBAR) */}
      <aside className={`w-64 border-r ${borderMain} ${bgSecondary} flex flex-col h-full shrink-0 z-10`}>
        {/* Logo / Cabecera */}
        <div className={`p-6 border-b ${borderMain} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-black tracking-widest uppercase">
              MOSTACCIO
            </span>
          </div>
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
            {/* SVG Icon: Hilos (Threads list) */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <span>Hilos</span>
          </button>
        </nav>

        {/* Interruptor de Tema (Theme Switcher) */}
        <div className={`p-4 border-t ${borderMain} flex items-center justify-between`}>
          <span className={`text-xs font-mono uppercase ${textSecondary}`}>TEMA</span>
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-2 p-1.5 rounded-md border ${borderMain} ${bgMain} ${hoverBg} transition-all`}
            title="Cambiar tema"
          >
            {theme === "light" ? (
              <>
                {/* SVG Icon: Moon (Dark Mode option) */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="text-[10px] font-mono font-bold uppercase pr-1">Oscuro</span>
              </>
            ) : (
              <>
                {/* SVG Icon: Sun (Light Mode option) */}
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
                <span className="text-[10px] font-mono font-bold uppercase pr-1">Claro</span>
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
            {/* Foto de Perfil (Avatar SVG) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileOpen(!isProfileOpen);
              }}
              className={`w-8 h-8 rounded-full border-2 ${borderMain} flex items-center justify-center overflow-hidden hover:scale-105 transition-all`}
              aria-label="Perfil de usuario"
            >
              <svg className={`w-full h-full ${theme === "light" ? "bg-gray-150 text-black" : "bg-zinc-800 text-white"}`} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </button>

            {/* Mini menú de Configuración / Cerrar Sesión */}
            {isProfileOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-10 w-48 border ${borderMain} ${bgMain} ${shadowStyle} rounded-md p-1 z-50`}
              >
                <button
                  onClick={() => {
                    alert("Configuración abierta");
                    setIsProfileOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono rounded hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors`}
                >
                  {/* SVG Icon: Gear (Settings) */}
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Configuración</span>
                </button>
                <button
                  onClick={() => {
                    alert("Sesión cerrada");
                    setIsProfileOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono rounded hover:bg-gray-100 dark:hover:bg-zinc-900 text-red-600 dark:text-red-400 transition-colors`}
                >
                  {/* SVG Icon: Log out */}
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

        {/* CONTENIDO (En blanco por ahora) */}
        <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center">
          <div className={`p-8 border ${borderMain} ${bgSecondary} ${shadowStyle} rounded-md max-w-md w-full text-center space-y-4`}>
            <div className={`w-12 h-12 rounded-full border ${borderMain} ${bgMain} flex items-center justify-center mx-auto`}>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="font-bold uppercase tracking-wide text-xs">Sin hilos activos</h2>
            <p className={`text-xs ${textSecondary}`}>
              Aquí se mostrarán tus hilos de conversación y correos vinculados de Mostaccio.
            </p>
            <button
              onClick={() => alert("Crear nuevo hilo")}
              className="px-4 py-2 bg-black hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-white text-xs font-mono font-bold uppercase rounded-md transition-all shadow-sm"
            >
              Nuevo Hilo
            </button>
          </div>
        </main>

      </div>
    </div>
  );
}
