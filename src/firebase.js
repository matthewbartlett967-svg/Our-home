import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyCgek3HUTfwFtdSoxThYMphpC6cK_Jcu0s",
  authDomain: "our-home-8df86.firebaseapp.com",
  projectId: "our-home-8df86",
  storageBucket: "our-home-8df86.firebasestorage.app",
  messagingSenderId: "876707730533",
  appId: "1:876707730533:web:4b5afd45746b544784228c"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
