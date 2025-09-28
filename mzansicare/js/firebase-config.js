// Firebase configuration for MzansiCare with enhanced error handling
const firebaseConfig = {
    apiKey: "AIzaSyAGu5Erx-tKk6LSVh9tZtkA_AxX3S9eq0w",
    authDomain: "mzansicare-70aa8.firebaseapp.com",
    projectId: "mzansicare-70aa8",
    storageBucket: "mzansicare-70aa8.firebasestorage.app",
    messagingSenderId: "3358617793",
    appId: "1:3358617793:web:92ee78082ff7820ba92440"
};

// Initialize Firebase
let app;
try {
    app = firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized successfully for MzansiCare');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
}

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// Google Auth Provider with additional scopes
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// Enhanced error handling for persistence
db.enablePersistence()
    .then(() => {
        console.log('✅ Firestore persistence enabled');
    })
    .catch((err) => {
        console.warn('⚠️ Firestore persistence warning:', err);
    });

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        console.log('✅ Auth persistence set to local');
    })
    .catch((error) => {
        console.error('❌ Auth persistence error:', error);
    });

// Test Firebase connection
function testFirebaseConnection() {
    console.log('🧪 Testing Firebase connection...');
    console.log('Firebase App:', app ? '✅ Loaded' : '❌ Failed');
    console.log('Auth Service:', auth ? '✅ Loaded' : '❌ Failed');
    console.log('Firestore Service:', db ? '✅ Loaded' : '❌ Failed');
}

// Run connection test when DOM is loaded
document.addEventListener('DOMContentLoaded', testFirebaseConnection);