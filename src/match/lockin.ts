/*
 * Lock-ins: a secret pick sent as a SHA-256 of the pick and a random salt, and shown (pick and salt)
 * later, when the other phone can check it against the hash. Ampe's feet and Shootout's shots and
 * dives use them, so nobody can see the other's pick and then choose.
 */

/** the SHA-256 of some text, in hex */
export async function hashOf(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** a fresh random salt, so a pick can't be guessed from its hash */
export const newSalt = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')
