import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth'
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
export const auth = getAuth(app)

let signingIn: Promise<string> | null = null

/**
 * Every player gets a silent anonymous account; its uid is their player id, and the
 * database rules only let a uid change its own seat, words and ready flag.
 * Firebase keeps the account in the browser, so the id survives reloads.
 */
export function signIn(): Promise<string> {
  signingIn ??= new Promise<string>((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) {
        stop()
        resolve(user.uid)
        return
      }
      // no saved account yet — make one
      signInAnonymously(auth).catch((err) => {
        stop()
        reject(err)
      })
    })
  }).catch((err) => {
    signingIn = null // let a later attempt retry
    throw err
  })
  return signingIn
}

/** The signed-in player's id. Only call once signIn() has resolved (the lobby waits for it). */
export function playerId(): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('playerId() called before sign-in finished')
  return uid
}
