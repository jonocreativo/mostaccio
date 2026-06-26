import { NextResponse } from "next/server";
import { db } from "@/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit
} from "firebase/firestore";

// Función para limpiar prefijos comunes de correos electrónicos y comparar asuntos
function cleanSubject(subject: string): string {
  if (!subject) return "";
  return subject
    .replace(/^(re:|fwd:|rv:|tr:)\s*/i, "")
    .trim()
    .toLowerCase();
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { threadId, messageId, sender, recipient, subject, date, body, type } = payload;

    if (!threadId || !messageId) {
      return NextResponse.json(
        { error: "Falta threadId o messageId en la petición" },
        { status: 400 }
      );
    }

    // Determinar el tipo de correo
    // Si viene explícitamente en el payload, usamos ese.
    // Si no, podemos intentar inferirlo por etiquetas o por default es "inicial".
    const mailType: "inicial" | "levantamiento" = type === "levantamiento" ? "levantamiento" : "inicial";

    const messageData = {
      messageId,
      sender: sender || "",
      recipient: recipient || "",
      subject: subject || "",
      date: date || new Date().toISOString(),
      body: body || "",
    };

    if (mailType === "inicial") {
      // 1. CORREO INICIAL (Cliente)
      // Usamos el threadId de Gmail del correo inicial como ID del documento del caso
      const caseRef = doc(db, "cases", threadId);
      const caseSnap = await getDoc(caseRef);

      if (!caseSnap.exists()) {
        // Creamos un caso nuevo
        await setDoc(caseRef, {
          id: threadId,
          title: subject || "Sin Asunto",
          status: "activo",
          createdAt: date || new Date().toISOString(),
          updatedAt: date || new Date().toISOString(),
          inicial: {
            threadId,
            subject: subject || "Sin Asunto",
            sender: sender || "Remitente Desconocido",
            recipient: recipient || "",
            hasUnread: true,
            messages: [messageData],
          }
        });

        return NextResponse.json({
          success: true,
          action: "case_created_with_inicial",
          caseId: threadId
        });
      } else {
        // El caso ya existe. Añadimos el mensaje a la conversación inicial si no es duplicado.
        const caseData = caseSnap.data();
        const existingMessages = caseData.inicial?.messages || [];
        const isDuplicate = existingMessages.some((msg: any) => msg.messageId === messageId);

        if (isDuplicate) {
          return NextResponse.json({
            success: true,
            action: "duplicate_skipped",
            caseId: threadId
          });
        }

        await updateDoc(caseRef, {
          updatedAt: new Date().toISOString(),
          "inicial.messages": [...existingMessages, messageData],
          "inicial.hasUnread": true
        });

        return NextResponse.json({
          success: true,
          action: "inicial_message_appended",
          caseId: threadId
        });
      }
    } else {
      // 2. CORREO DE LEVANTAMIENTO (Mandante / Legal)
      // Buscamos si ya existe algún caso que contenga este threadId de levantamiento
      const casesRef = collection(db, "cases");
      const q = query(casesRef, where("levantamiento.threadId", "==", threadId), limit(1));
      const querySnap = await getDocs(q);

      if (!querySnap.empty) {
        // Ya existe el caso asociado a este levantamiento. Agregamos el mensaje.
        const caseDoc = querySnap.docs[0];
        const caseData = caseDoc.data();
        const existingMessages = caseData.levantamiento?.messages || [];
        const isDuplicate = existingMessages.some((msg: any) => msg.messageId === messageId);

        if (isDuplicate) {
          return NextResponse.json({
            success: true,
            action: "duplicate_skipped",
            caseId: caseDoc.id
          });
        }

        await updateDoc(doc(db, "cases", caseDoc.id), {
          updatedAt: new Date().toISOString(),
          "levantamiento.messages": [...existingMessages, messageData],
          "levantamiento.hasUnread": true
        });

        return NextResponse.json({
          success: true,
          action: "levantamiento_message_appended",
          caseId: caseDoc.id
        });
      }

      // Si no existe un caso con este threadId de levantamiento, intentamos buscar una coincidencia inteligente
      // Buscamos casos activos que NO tengan levantamiento asociado
      const qActiveWithoutLevantamiento = query(
        casesRef,
        where("status", "==", "activo")
      );
      const activeCasesSnap = await getDocs(qActiveWithoutLevantamiento);
      let matchedCaseId: string | null = null;
      let cleanedLevantamientoSubject = cleanSubject(subject);

      for (const caseDoc of activeCasesSnap.docs) {
        const caseData = caseDoc.data();
        // Solo evaluar casos que no tengan levantamiento asociado
        if (!caseData.levantamiento) {
          const cleanedInicialSubject = cleanSubject(caseData.inicial?.subject || "");

          // Coincidencia si un asunto contiene al otro (limpios de prefijos)
          if (
            cleanedInicialSubject && cleanedLevantamientoSubject &&
            (cleanedLevantamientoSubject.includes(cleanedInicialSubject) ||
              cleanedInicialSubject.includes(cleanedLevantamientoSubject))
          ) {
            matchedCaseId = caseDoc.id;
            break; // Coincidencia encontrada
          }
        }
      }

      if (matchedCaseId) {
        // Se encontró una coincidencia inteligente. Vinculamos el levantamiento a este caso.
        const matchedCaseRef = doc(db, "cases", matchedCaseId);
        await updateDoc(matchedCaseRef, {
          updatedAt: new Date().toISOString(),
          levantamiento: {
            threadId,
            subject: subject || "Levantamiento Legal",
            sender: sender || "Remitente Desconocido",
            recipient: recipient || "",
            hasUnread: true,
            messages: [messageData]
          }
        });

        return NextResponse.json({
          success: true,
          action: "levantamiento_auto_linked",
          caseId: matchedCaseId
        });
      } else {
        // No hay coincidencia. Creamos un "Caso Huérfano" (solo tiene levantamiento)
        // El usuario podrá vincularlo manualmente en la interfaz.
        const orphanCaseRef = doc(db, "cases", threadId);
        await setDoc(orphanCaseRef, {
          id: threadId,
          title: subject || "Levantamiento Legal (Sin Vincular)",
          status: "activo",
          createdAt: date || new Date().toISOString(),
          updatedAt: date || new Date().toISOString(),
          levantamiento: {
            threadId,
            subject: subject || "Levantamiento Legal",
            sender: sender || "Remitente Desconocido",
            recipient: recipient || "",
            hasUnread: true,
            messages: [messageData]
          }
        });

        return NextResponse.json({
          success: true,
          action: "orphan_levantamiento_created",
          caseId: threadId
        });
      }
    }
  } catch (error: any) {
    console.error("Error en webhook de Gmail:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 }
    );
  }
}
