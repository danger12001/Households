import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** False until .env.local (or the deploy secrets) provide a Firebase web config. */
export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

const app = initializeApp(firebaseConfigured ? firebaseConfig : { apiKey: 'unset', projectId: 'unset' })

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export const db = initializeFirestore(app, {
  // Optional fields are left undefined in forms; drop them instead of throwing.
  ignoreUndefinedProperties: true,
  // Offline cache so the app opens instantly and survives patchy Wi-Fi.
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // experimentalAutoDetectLongPolling: some networks (corporate VPNs/proxies,
  // certain security software) silently hang Firestore's default streaming
  // transport with no error. Long-polling fallback avoids that.
  experimentalAutoDetectLongPolling: true,
})
