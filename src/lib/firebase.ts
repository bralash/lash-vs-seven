import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

// Public web config for the lash-vs-seven project (recovered from legacy/js/lvs-utils.js).
// Web API keys are identifiers, not secrets — access is governed by Realtime DB rules.
const app = initializeApp({
  apiKey: 'AIzaSyByYiN4eBZtRSTwaB3H64djW_lXpifVaqY',
  authDomain: 'lash-vs-seven.firebaseapp.com',
  databaseURL: 'https://lash-vs-seven-default-rtdb.firebaseio.com',
  projectId: 'lash-vs-seven',
  storageBucket: 'lash-vs-seven.firebasestorage.app',
  messagingSenderId: '982561165284',
  appId: '1:982561165284:web:a081dd682f2a04c21741f1',
})

export const db = getDatabase(app)
