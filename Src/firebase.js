// ============================================================
//  STEP 1: Paste your Firebase config here
//  Go to: console.firebase.google.com
//  → Your project → Project Settings → Your apps → SDK setup
// ============================================================

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBTYwqmjep0x3jTfVnfrfh077dOAB1j-4E",
  authDomain: "our-home-e059f.firebaseapp.com",
  projectId: "our-home-e059f",
  storageBucket: "our-home-e059f.firebasestorage.app",
  messagingSenderId: "872814620415",
  appId: "1:872814620415:web:60155d87b571c2922ea6ca"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
