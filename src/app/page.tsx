"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth, googleProvider } from "@/firebase";

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

  // Load saved theme or system preference on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  // Monitor auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  // Grayscale variables based on theme
  const bgMain = theme === "light" ? "bg-white" : "bg-black";
  const bgSecondary = theme === "light" ? "bg-gray-50" : "bg-zinc-950";
  const textMain = theme === "light" ? "text-black" : "text-white";
  const textSecondary = theme === "light" ? "text-gray-500" : "text-zinc-400";
  const borderMain = theme === "light" ? "border-gray-200" : "border-zinc-800";
  const hoverBg = theme === "light" ? "hover:bg-gray-100" : "hover:bg-zinc-900";
  const activeBg = theme === "light" ? "bg-gray-100" : "bg-zinc-900";
  const shadowStyle = theme === "light" ? "shadow-[1px_1px_0px_0px_#000000]" : "shadow-[1px_1px_0px_0px_#ffffff]";

  // Character width for alignment in monospace font (text-xs is approx 7.2px per character)
  const charWidth = 7.2;

  // 1. CARGANDO SESIÓN
  if (authLoading) {
    return (
      <div className={`flex h-screen w-screen items-center justify-center ${bgMain} ${textMain} font-mono text-xs`}>
        <div className="flex flex-col items-center gap-3">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" />
          </svg>
          <span className="uppercase tracking-widest">Sincronizando sesión...</span>
        </div>
      </div>
    );
  }

  // 2. PANTALLA DE INICIO DE SESIÓN (LOGIN)
  if (!user) {
    return (
      <div className={`flex h-screen w-screen items-center justify-center ${bgMain} ${textMain} transition-colors duration-250 p-4`}>
        <div className={`w-full max-w-sm border ${borderMain} ${bgSecondary} ${shadowStyle} rounded-md p-8 text-center space-y-6`}>
          <div className="flex flex-col items-center gap-3">
            <img src="/logo.webp" alt="Logo" className="w-8 h-8 object-contain dark:invert" />
            <div className="space-y-1">
              <span className="font-mono text-sm font-black tracking-widest uppercase block">
                MOSTACCIO
              </span>
              <p className={`text-xs ${textSecondary} font-mono uppercase tracking-wider`}>
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
              className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-black text-white dark:bg-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 text-xs font-mono font-bold uppercase rounded-md transition-all shadow-sm`}
            >
              {/* Grayscale Google Logo SVG */}
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
        <div className={`p-6 border-b ${borderMain} flex items-center justify-between`}>
          <div className="flex items-center gap-2.5">
            <img src="/logo.webp" alt="Logo" className="w-5 h-5 object-contain dark:invert" />
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
                {/* SVG Icon: Moon */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="text-[10px] font-mono font-bold uppercase pr-1">Oscuro</span>
              </>
            ) : (
              <>
                {/* SVG Icon: Sun */}
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
            {/* Saludo y Editor de Apodo en Línea */}
            <div className="flex items-center text-xs font-mono select-none">
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

            {/* Foto de Perfil (Avatar / Google Photo) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileOpen(!isProfileOpen);
              }}
              className={`w-8 h-8 rounded-full border-2 ${borderMain} flex items-center justify-center overflow-hidden hover:scale-105 transition-all`}
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

            {/* Mini menú de Configuración / Cerrar Sesión */}
            {isProfileOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-10 w-52 border ${borderMain} ${bgMain} ${shadowStyle} rounded-md p-1 z-50`}
              >
                {/* Info de usuario en el menú */}
                <div className={`px-3 py-2 border-b ${borderMain} text-[10px] space-y-0.5`}>
                  <p className="font-bold truncate">{user.displayName || "Usuario Mostaccio"}</p>
                  <p className={`truncate text-[9px] ${textSecondary}`}>{user.email}</p>
                </div>

                <button
                  onClick={() => {
                    alert("Configuración abierta");
                    setIsProfileOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 mt-1 text-left text-xs font-mono rounded hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors`}
                >
                  {/* SVG Icon: Gear */}
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Configuración</span>
                </button>
                
                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono rounded hover:bg-gray-100 dark:hover:bg-zinc-900 text-red-650 dark:text-red-400 transition-colors`}
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
