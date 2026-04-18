import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(
  import.meta.env.VITE_USE_FIREBASE === 'true' &&
  firebaseConfig.apiKey &&
  firebaseConfig.projectId
);

const app = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth = firebaseEnabled && app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();

export async function firebaseLogin(email: string, password: string) {
  if (!auth) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, password);
}

export async function firebaseRegister(email: string, password: string) {
  if (!auth) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function firebaseGoogleLogin() {
  if (!auth) throw new Error('Firebase not configured');
  return signInWithPopup(auth, googleProvider);
}

export async function firebaseLogout() {
  if (!auth) return;
  await signOut(auth);
}

export function firebaseOnAuthStateChanged(cb: (user: FirebaseUser | null) => void) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, cb);
}
