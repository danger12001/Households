import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { auth, googleProvider } from '../firebase'

interface AuthContextValue {
  user: User | null
  /** Lowercased email, only once it is verified - the identity household access is keyed on. */
  email: string | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
  refreshUser: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Bumped after reload() so a newly verified email re-renders consumers.
  const [, setVersion] = useState(0)

  useEffect(() => {
    getRedirectResult(auth).catch((error) => {
      console.error('Google redirect sign-in failed:', error)
    })
    return onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
  }, [])

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      // Some mobile browsers block popups outright; fall back to a full redirect.
      if (error instanceof FirebaseError && error.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      throw error
    }
  }

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }

  const signUpWithEmail = async (name: string, email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await updateProfile(credential.user, { displayName: name.trim() })
    await sendEmailVerification(credential.user)
  }

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim())
  }

  const resendVerification = async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser)
  }

  const refreshUser = async () => {
    if (!auth.currentUser) return
    await auth.currentUser.reload()
    // Force a fresh ID token so Firestore rules see email_verified = true.
    await auth.currentUser.getIdToken(true)
    setUser(auth.currentUser)
    setVersion((v) => v + 1)
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
  }

  const email = user?.emailVerified && user.email ? user.email.toLowerCase() : null

  return (
    <AuthContext.Provider
      value={{
        user,
        email,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        resendVerification,
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/** Human-readable message for Firebase auth errors. */
export function authErrorMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) return 'Something went wrong. Please try again.'
  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/invalid-email':
      return 'That email address looks wrong.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.'
    case 'auth/unauthorized-domain':
      return 'This site is not in Firebase Auth > Settings > Authorized domains.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase Auth.'
    default:
      return error.message
  }
}
