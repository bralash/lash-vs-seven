/**
 * The mental-poker deal: two to four phones shuffle and deal one deck without anyone seeing anyone
 * else's hand. (Memory reuses the locks, shuffle and card encoding below for its face-down board.)
 *
 * Commutative (SRA / Pohlig–Hellman) locks: a card m locked with key e is m^e mod p, and locks can be
 * added and removed in any order. Each card is a quadratic residue, so locking can't leak anything
 * through its Legendre symbol.
 *
 *  1. The phones take turns in a chain: the first locks all 35 cards (no Ace of Spades) with its key and shuffles, and
 *     each next one locks every card again and reshuffles (`deck`). Once every phone has, nobody can
 *     tell which card is where — as long as any one of them shuffled honestly.
 *  2. The first five cards go to the first player in seat order, the next five to the next, and so on
 *     (`dealt`). In a second turn round the chain, each phone takes its lock off everyone else's
 *     cards, so each hand ends up under its owner's lock only. The owner removes it privately.
 *  3. Played cards go into the room face up. When the round ends every key is revealed and each
 *     phone re-checks the deal and every card played (`verifyDeal`).
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

/** Card numbers 0–35 are 6 to Ace in each suit (k mod 9 = 8 is an Ace); 8 is the Ace of Spades, which isn't played (house rule): 35 cards. */
const ALL_36 = Array.from({ length: 36 }, (_, k) => k)
export const ACE_OF_SPADES = 8
export const CARDS = ALL_36.filter((k) => k !== ACE_OF_SPADES)
export const DECK_SIZE = CARDS.length
/** decks from rounds dealt under earlier rules, by size: all 36, and briefly 32 with no Aces at all */
const OLD_DECKS: Record<number, number[]> = { 36: ALL_36, 32: ALL_36.filter((k) => k % 9 !== 8) }
export const HAND = 5

/** card k → its number in the group: (k + 2)², always a quadratic residue */
export const encode = (k: number) => (BigInt(k + 2) * BigInt(k + 2)) % P

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

export const hex = (n: bigint) => n.toString(16)
export const big = (h: string) => BigInt('0x' + h)

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
export const keyOk = (k: string) => /^[0-9a-f]{1,300}$/.test(k) && inverse(big(k), P1) !== null

export const lock = (x: bigint, key: string) => modpow(x, big(key), P)
export const unlockWith = (x: bigint, key: string) => modpow(x, inverse(big(key), P1)!, P)

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Number(randomBig(4) % BigInt(i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Step 1, first phone in the chain: every card locked with my key, shuffled. */
export function lockDeck(key: string): string[] {
  return shuffle(CARDS.map((k) => hex(lock(encode(k), key))))
}

/** Step 1, every next phone: lock every card again and shuffle. */
export function relockDeck(deck: string[], key: string): string[] {
  return shuffle(deck.map((c) => hex(lock(big(c), key))))
}

/** Which of the dealt cards belong to the player at `pos` in seat order. */
export const slotsOf = (pos: number) => Array.from({ length: HAND }, (_, i) => pos * HAND + i)
const ownerOf = (slot: number) => Math.floor(slot / HAND)

/** Step 2: take my lock off everyone else's cards (mine stay as they are). */
export function stripLocks(dealt: string[], myPos: number, myKey: string): string[] {
  const undo = inverse(big(myKey), P1)!
  return dealt.map((c, i) => (ownerOf(i) === myPos ? c : hex(modpow(big(c), undo, P))))
}

const DECODE = new Map(ALL_36.map((k) => [encode(k), k]))

/** Step 2, privately: remove my own lock from my five, once everyone else has removed theirs → card numbers. */
export function readHand(mine: string[], myKey: string): number[] | null {
  const hand = mine.map((c) => DECODE.get(unlockWith(big(c), myKey)))
  return hand.every((k) => k !== undefined) ? (hand as number[]) : null
}

export interface DealRecord {
  /** the deck after every phone locked and shuffled it */
  deck: string[]
  /** the dealt cards once every phone took its lock off the others' */
  dealt: string[]
  /** each player's key, in seat order, revealed when the round ends */
  keys: string[]
}

/**
 * With every key out: was the deal honest? Returns each player's hand (card numbers, in seat order),
 * or the reason it wasn't. The deck must be exactly the 35 cards under everyone's locks, and each
 * player's five must be the cards in those slots of the deck with only their own lock left on.
 */
export function verifyDeal(d: DealRecord): { hands: number[][] } | { error: string } {
  const n = d.keys.length
  if (!d.keys.every(keyOk)) return { error: 'bad key' }
  const cards = OLD_DECKS[d.deck?.length] ?? CARDS
  if (d.deck?.length !== cards.length || d.dealt?.length !== HAND * n) return { error: 'short deck' }
  // every lock at once: the keys multiply (mod p − 1)
  const all = d.keys.reduce((e, k) => (e * big(k)) % P1, 1n)
  const full = (k: number) => hex(modpow(encode(k), all, P))
  const expect = new Set(cards.map(full))
  if (new Set(d.deck).size !== cards.length || !d.deck.every((c) => expect.has(c))) return { error: 'shuffle' }
  const hands: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < HAND * n; i++) {
    const card = DECODE.get(unlockWith(big(d.dealt[i]), d.keys[ownerOf(i)]))
    if (card === undefined || full(card) !== d.deck[i]) return { error: 'unlock' }
    hands[ownerOf(i)].push(card)
  }
  return { hands }
}
