import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCxlSOlPRwTj1RsU40pYzUpHQb1b1RB6gU",
  authDomain: "timetrack-va.firebaseapp.com",
  projectId: "timetrack-va",
  storageBucket: "timetrack-va.firebasestorage.app",
  messagingSenderId: "254367153848",
  appId: "1:254367153848:web:268b355b80d3005cb37e4d"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);