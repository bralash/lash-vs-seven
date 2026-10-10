import { big, encode, hex, keyOk, lock, shuffle, unlockWith } from '../spar/deal'
import { DECK, parseSlot, type Pile, type Play, type Req } from './engine'

/**
 * Uno's mental-poker deal, on Spar's commutative locks (spar/deal.ts): a card m locked with key e is
 * m^e mod p, and locks come off in any order.
 *
 *  - Every phone in turn locks every card of a pile with its own key and reshuffles it. The first pile
 *    is the whole deck; later piles are the discards, shuffled back in when the stock runs low. Each
 *    pile gets fresh keys (the discards are face up, so old keys would give the new order away).
 *  - A card goes to a player when every other phone takes its lock off that slot. Only the owner's
 *    lock is left, and they take it off on their own phone. The turned-up card has every lock taken off.
 *  - When the round is over every key is shown, and each phone re-checks each pile and every card
 *    played (`verify`).
 *
 * Keys here are 256 bits, not Spar's 1024: a pile is 108 cards, and short keys lock it about four
 * times faster on a phone. Removing a lock still needs the full-size inverse.
 */

function randomBig(bytes: number) {
  return crypto.getRandomValues(new Uint8Array(bytes)).reduce((n, b) => (n << 8n) | BigInt(b), 0n)
}

/** A fresh 256-bit lock: odd and far below q, so it has an inverse mod p − 1. Hex. */
export function newKey(): string {
  for (;;) {
    const e = randomBig(32) | 1n
    if (e > 2n) return hex(e)
  }
}

const ALL = Array.from({ length: DECK }, (_, k) => k)
const DECODE = new Map(ALL.map((k) => [hex(encode(k)), k]))

/** A pile's first lock: `cards` locked with my key, shuffled. */
export const lockCards = (cards: number[], key: string) => shuffle(cards.map((k) => hex(lock(encode(k), key))))
/** Every next phone: lock again and reshuffle. */
export const relock = (deck: string[], key: string) => shuffle(deck.map((c) => hex(lock(big(c), key))))
/** Take my lock off some cards. */
export const strip = (cards: string[], key: string) => cards.map((c) => hex(unlockWith(big(c), key)))
/** A card with only my lock left → its number (or undefined if it isn't one). */
export const readCard = (c: string, key: string) => DECODE.get(hex(unlockWith(big(c), key)))
/** A card with every lock off. */
export const openCard = (c: string) => DECODE.get(c)

export interface DealRecord {
  piles: Pile[]
  /** each pile as the last phone locked it */
  decks: string[][]
  /** every request, and its cards once every lock but the owner's was off */
  reqs: { req: Req; cards: string[] | null }[]
  plays: Play[]
  /** the chain that locked the piles */
  chain: number[]
  /** by seat: one key per pile */
  keys: { [seat: number]: string[] }
}

/**
 * With every key out: were the shuffles honest, and was every card played really the one dealt to
 * that player in that slot? Returns null when it all checks out, or what went wrong (and whose fault).
 */
export function verify(r: DealRecord): { s: number; why: string } | null {
  for (const s of r.chain) if (!(r.keys[s]?.length === r.piles.length && r.keys[s].every(keyOk))) return { s, why: 'showed a bad key' }
  // each pile: exactly its cards under every lock; `full[p]` maps a fully locked value back to its card
  const full: Map<string, number>[] = []
  for (let p = 0; p < r.piles.length; p++) {
    const cards = p === 0 ? ALL : (r.piles[p].cards ?? [])
    // lock by lock: short keys make that quicker than one lock with their (full-size) product
    const m = new Map(cards.map((k) => [hex(r.chain.reduce((x, s) => lock(x, r.keys[s][p]), encode(k))), k]))
    const deck = r.decks[p] ?? []
    if (deck.length !== cards.length || new Set(deck).size !== deck.length || !deck.every((c) => m.has(c))) return { s: r.chain[0], why: 'the shuffle doesn’t check out' }
    full.push(m)
  }
  // every card handed out: the right card for its slot
  const dealt = new Map<string, { to: number; c: number }>()
  for (const { req, cards } of r.reqs) {
    if (!cards || (req.need ?? []).length) continue
    for (let j = 0; j < req.slots.length; j++) {
      const [p, i] = parseSlot(req.slots[j])
      const c = req.to === -1 ? openCard(cards[j]) : readCard(cards[j], r.keys[req.to]?.[p] ?? '1')
      if (c === undefined || full[p]?.get(r.decks[p][i]) !== c) return { s: req.to === -1 ? r.chain[0] : req.to, why: 'the unlocking doesn’t check out' }
      dealt.set(req.slots[j], { to: req.to, c })
    }
  }
  for (const pl of r.plays) {
    const d = pl.slot ? dealt.get(pl.slot) : undefined
    if (!d || d.to !== pl.s || d.c !== pl.c) return { s: pl.s, why: 'played a card that wasn’t in their hand' }
  }
  return null
}
