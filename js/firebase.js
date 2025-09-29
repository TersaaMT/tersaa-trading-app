import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.0.0/firebase-app.js';
        import { getFirestore, collection, addDoc, getDocs } from 'https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js';
        
        const firebaseConfig = {
            apiKey: "AIzaSyDCoJorMymAl8rijf3q7fLxVnw9ERtIDdA",
            authDomain: "mini-app-d344f.firebaseapp.com",
            projectId: "mini-app-d344f",
            storageBucket: "mini-app-d344f.firebasestorage.app",
            messagingSenderId: "459391636486",
            appId: "1:459391636486:web:fcebe891bbb14e5dfd5f87"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        window.db = db;
        window.firestoreUtils = { collection, addDoc, getDocs };