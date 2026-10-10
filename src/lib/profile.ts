import { ref, runTransaction } from 'firebase/database'
import { db, signIn } from './firebase'
import { KEYS, load } from './storage'

/*
 * Who a wallet belongs to, for the admin page: wallets/{uid}/name (the name you play under),
 * seen (when you last opened the app) and first (when we first saw you). Written when the app
 * opens and when you change your name; nothing in the game reads them.
 */

let last: string | null = null

export function touchProfile() {
  const name = load(KEYS.name)?.trim().slice(0, 24) || ''
  // once per page load, plus again whenever the name changes
  if (last === name) return
  last = name
  signIn()
    .then((uid) =>
      runTransaction(
        ref(db, `wallets/${uid}`),
        (cur: Record<string, unknown> | null) => {
          // a wallet starts at 0 chips, as payOut would make it; the server retries this with the
          // real wallet if one exists, so nothing in it is lost
          const w = cur ?? { chips: 0 }
          const now = Date.now()
          return { ...w, chips: w.chips ?? 0, ...(name ? { name } : {}), seen: now, first: (w.first as number | undefined) ?? now }
        },
        { applyLocally: false },
      ),
    )
    .catch(() => {})
}
