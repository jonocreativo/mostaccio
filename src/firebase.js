import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore"; // Importamos la base de datos
import { getAuth, GoogleAuthProvider } from "firebase/auth"; // Importamos Auth de Firebase

// Configuración de Firebase (Se recomienda mover esto a variables de entorno (.env) más adelante)
const firebaseConfig = {
    apiKey: "AIzaSyB-7hdTsC9P62VC7GXIfY_ZKLrE6k-EYWE",
    authDomain: "mostaccio-a30ee.firebaseapp.com",
    projectId: "mostaccio-a30ee",
    storageBucket: "mostaccio-a30ee.firebasestorage.app",
    messagingSenderId: "1057267223270",
    appId: "1:1057267223270:web:f4fb00e6a886ec7de90927",
    measurementId: "G-RX56EQG0PM"
};

// Inicializamos la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// Inicializamos Analytics de forma segura (solo se ejecutará en el cliente/navegador)
let analytics;
isSupported().then((supported) => {
    if (supported) {
        analytics = getAnalytics(app);
    }
});

// Exportamos la base de datos para poder importarla desde cualquier otro archivo
export const db = getFirestore(app);

// Inicializamos y exportamos Auth y el proveedor de Google
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Exportamos también la aplicación y analytics por si se necesitan en otros archivos
export { app, analytics };