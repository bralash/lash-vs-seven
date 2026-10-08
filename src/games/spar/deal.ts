/**
 * The mental-poker deal: two phones shuffle and deal one deck without either seeing the other's hand.
 *
 * Commutative (SRA / Pohlig–Hellman) locks: a card m locked with key e is m^e mod p, and locks can be
 * added and removed in any order. Each card is a quadratic residue, so locking can't leak anything
 * through its Legendre symbol.
 *
 *  1. The dealer locks all 36 cards with key a and shuffles them → `deckA`.
 *  2. The other player locks every card again with key b and shuffles → `deckB`.
 *     Nobody can tell which card is where now.
 *  3. Each player takes the lock off the *opponent's* five cards (`unlock`), so those are left
 *     under the opponent's lock only. The opponent removes their own lock privately and sees their hand.
 *  4. Played cards go into the room face up. When the round ends both keys are revealed and each
 *     phone re-checks the whole deal and every card played (`verifyDeal`).
 *
 * p is the 1024-bit safe prime from RFC 2409 (Oakley group 2): p = 2q + 1 with q prime.
 */
const P = BigInt(
  '0x' +
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A0879' +
    '8E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B' +
    '0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE65381FFFFFFFFFFFFFFFF',
)
const P1 = P - 1n
const Q = P1 / 2n

export const DECK_SIZE = 36
export const HAND = 5

/** card k → its number in the group: (k + 2)², always a quadratic residue */
const encode = (k: number) => (BigInt(k + 2) * BigInt(k + 2)) % P

function modpow(b: bigint, e: bigint, m: bigint) {
  let r = 1n
  b %= m
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m
    b = (b * b) % m
    e >>= 1n
  }
  return r
}

function inverse(a: bigint, m: bigint) {
  let [r0, r1, s0, s1] = [m, a % m, 0n, 1n]
  while (r1 !== 0n) {
    const q = r0 / r1
    ;[r0, r1] = [r1, r0 - q * r1]
    ;[s0, s1] = [s1, s0 - q * s1]
  }
  return r0 === 1n ? ((s0 % m) + m) % m : null
}

const hex = (n: bigint) => n.toString(16)
const big = (h: string) => BigInt('0x' + h)

function randomBig(bytes: number) {
  return crypto.getRandomValues(new Uint8Array(bytes)).reduce((n, b) => (n << 8n) | BigInt(b), 0n)
}

/** A fresh lock: odd, and not a multiple of q, so it can be undone. Returned as hex. */
export function newKey(): string {
  for (;;) {
    const e = randomBig(128) % P1
    if (e > 2n && e & 1n && e % Q !== 0n) return hex(e)
  }
}

/** a valid key has an inverse mod p − 1 */
const keyOk = (k: string) => /^[0-9a-f]{1,300}$/.test(k) && inverse(big(k), P1) !== null

const lock = (x: bigint, key: string) => modpow(x, big(key), P)
const unlockWith = (x: bigint, key: string) => modpow(x, inverse(big(key), P1)!, P)

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Number(randomBig(4) % BigInt(i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Step 1 (dealer): every card locked with my key, shuffled. */
export function lockDeck(key: string): string[] {
  return shuffle(Array.from({ length: DECK_SIZE }, (_, k) => hex(lock(encode(k), key))))
}

/** Step 2 (the other player): lock every card again and shuffle. */
export function relockDeck(deckA: string[], key: string): string[] {
  return shuffle(deckA.map((c) => hex(lock(big(c), key))))
}

/** Which slots of the final deck are dealt to a seat. */
export const slotsOf = (seat: 0 | 1) => Array.from({ length: HAND }, (_, i) => seat * HAND + i)

/** Step 3: take my lock off the opponent's five cards. */
export function unlockFor(deckB: string[], oppSeat: 0 | 1, myKey: string): string[] {
  return slotsOf(oppSeat).map((i) => hex(unlockWith(big(deckB[i]), myKey)))
}

const DECODE = new Map(Array.from({ length: DECK_SIZE }, (_, k) => [encode(k), k]))

/** Step 3, privately: remove my own lock from the five the opponent unlocked for me → card numbers. */
export function readHand(unlocked: string[], myKey: string): number[] | null {
  const hand = unlocked.map((c) => DECODE.get(unlockWith(big(c), myKey)))
  return hand.every((k) => k !== undefined) ? (hand as number[]) : null
}

export interface DealRecord {
  dealer: 0 | 1
  deckA: string[]
  deckB: string[]
  /** unlock[s]: seat s's five cards, with the opponent's lock taken off */
  unlock: [string[], string[]]
  /** keys[s]: seat s's key, revealed when the round ends */
  keys: [string, string]
}

/**
 * With both keys out: was the deal honest? Returns both hands (card numbers), or the reason it wasn't.
 * The dealer's deck must be exactly the 36 cards under their lock, the second deck exactly the
 * first one relocked, and each unlock exactly the slots it claims to be.
 */
export function verifyDeal(d: DealRecord): { hands: [number[], number[]] } | { error: string } {
  const other = (1 - d.dealer) as 0 | 1
  if (!keyOk(d.keys[0]) || !keyOk(d.keys[1])) return { error: 'bad key' }
  if (d.deckA?.length !== DECK_SIZE || d.deckB?.length !== DECK_SIZE) return { error: 'short deck' }
  const ka = d.keys[d.dealer]
  const kb = d.keys[other]
  const expectA = new Set(Array.from({ length: DECK_SIZE }, (_, k) => hex(lock(encode(k), ka))))
  if (new Set(d.deckA).size !== DECK_SIZE || !d.deckA.every((c) => expectA.has(c))) return { error: 'dealer’s deck' }
  const expectB = new Set(d.deckA.map((c) => hex(lock(big(c), kb))))
  if (new Set(d.deckB).size !== DECK_SIZE || !d.deckB.every((c) => expectB.has(c))) return { error: 'second shuffle' }
  const hands: [number[], number[]] = [[], []]
  for (const s of [0, 1] as const) {
    const oppKey = d.keys[1 - s]
    const want = unlockFor(d.deckB, s, oppKey)
    if (want.some((c, i) => c !== d.unlock[s]?.[i])) return { error: 'unlock' }
    const hand = readHand(d.unlock[s], d.keys[s])
    if (!hand) return { error: 'hand' }
    hands[s] = hand
  }
  return { hands }
}
