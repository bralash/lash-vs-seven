import type { Seat } from '../../lobby/rooms'
import { big, encode, hex, keyOk, lock, shuffle, unlockWith } from '../spar/deal'

/**
 * Memory: a face-down board of pairs. Flip two; a pair is yours and you go again, otherwise both
 * turn back over and it's the other player's turn. Most pairs wins; level is a draw.
 *
 * Cards are numbered 0…n−1 and card k belongs to pair ⌊k/2⌋ (so the two halves of a pair look
 * different while face down and locked).
 *
 * Online, nobody may know the layout, so the board is dealt like Spar's deck: the dealer locks every
 * card and shuffles (`deckA`), the other player locks them all again and shuffles (`deckB`). To turn
 * a card over, the flipper asks; the other phone takes its lock off that one slot (`part`); the
 * flipper's phone takes its own off, reads the card and puts it face up for both. At the end both
 * keys come out and each phone re-checks the deal and every card shown.
 *
 * On one device (pass & play, or against Ops) the layout simply sits in `layout`; Ops never reads it.
 */
export const SIZES = [4, 6] as const
export type Size = (typeof SIZES)[number]

export const pairOf = (c: number) => c >> 1
export const cardsFor = (size: number) => size * size

export interface Flip {
  i: number
  c: number
  s: Seat
}

export interface Live {
  size: Size
  starter: Seat
  turn: Seat
  phase: 'deal' | 'play' | 'done'
  /** slot owners: '.' still face down, '0'/'1' found by that seat */
  found: string
  scores: [number, number]
  /** the cards turned over this turn (after a miss: the two that missed, until they're turned back) */
  up?: Flip[]
  /** the last two turned over didn't match; they go back face down before the next flip */
  miss?: boolean
  /** every card turned over so far, in order (anyone saw them — Ops' memory works from this) */
  log?: Flip[]
  /** one device: where every card is */
  layout?: number[]
  /** online deal: who locks first, and the two locked decks */
  dealer?: Seat
  deckA?: string[]
  deckB?: string[]
  /** online: a flip waiting for the other phone to take its lock off */
  ask?: { s: Seat; i: number }
  /** online: that slot with only the flipper's lock left on it */
  part?: { s: Seat; i: number; x: string }
  /** both keys, once the game is over */
  keys?: { s0?: string; s1?: string }
  result?: { winner: Seat | -1; forfeit?: boolean }
}

export const other = (s: Seat) => (1 - s) as Seat
const pairsIn = (size: number) => cardsFor(size) / 2

/** One device: the layout is shuffled right here. */
export function freshLocal(size: Size, starter: Seat): Live {
  return { size, starter, turn: starter, phase: 'play', found: '.'.repeat(cardsFor(size)), scores: [0, 0], layout: shuffle(Array.from({ length: cardsFor(size) }, (_, k) => k)) }
}

/** Online: the board starts as a deal between the two phones. */
export function freshOnline(size: Size, starter: Seat): Live {
  return { size, starter, turn: starter, phase: 'deal', dealer: starter, found: '.'.repeat(cardsFor(size)), scores: [0, 0] }
}

/** Can `seat` turn over slot `i` right now? */
export function canFlip(live: Live, seat: Seat, i: number): boolean {
  if (live.phase !== 'play' || live.turn !== seat || live.ask || live.part) return false
  if (i < 0 || i >= cardsFor(live.size) || live.found[i] !== '.') return false
  const up = live.miss ? [] : (live.up ?? [])
  return up.length < 2 && !up.some((f) => f.i === i)
}

/** Turn the missed pair back over (the next flip does it anyway; Ops does it on its own first). */
export function hideMiss(live: Live): Live | undefined {
  if (!live.miss) return undefined
  const { up: _u, miss: _m, ...rest } = live
  return rest
}

/** Card `c` is now face up at slot `i`. With two up: a pair is kept (go again), a miss passes the turn. */
export function reveal(live: Live, seat: Seat, i: number, c: number): Live | undefined {
  if (!canFlip(live, seat, i) || c < 0 || c >= cardsFor(live.size)) return undefined
  const base = live.miss ? hideMiss(live)! : live
  const flip = { i, c, s: seat }
  const up = [...(base.up ?? []), flip]
  const log = [...(base.log ?? []), flip]
  if (up.length < 2) return { ...base, up, log }
  const [a, b] = up
  if (pairOf(a.c) !== pairOf(b.c)) return { ...base, up, log, miss: true, turn: other(seat) }
  const found = base.found.split('')
  found[a.i] = found[b.i] = String(seat)
  const scores: [number, number] = [...base.scores]
  scores[seat]++
  const { up: _u, ...rest } = base
  const next: Live = { ...rest, log, found: found.join(''), scores }
  if (scores[0] + scores[1] < pairsIn(live.size)) return next
  return { ...next, phase: 'done', result: { winner: scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1 } }
}

/** One device: turn over slot `i` straight from the layout. */
export function flipLocal(live: Live, seat: Seat, i: number): Live | undefined {
  return live.layout ? reveal(live, seat, i, live.layout[i]) : undefined
}

/* ── Online: the deal ───────────────────────────────────────────────── */

/** The dealer locks every card with their key and shuffles. */
export function postDeckA(live: Live, seat: Seat, key: string): Live | undefined {
  if (live.phase !== 'deal' || seat !== live.dealer || live.deckA) return undefined
  const deckA = shuffle(Array.from({ length: cardsFor(live.size) }, (_, k) => hex(lock(encode(k), key))))
  return { ...live, deckA }
}

/** The other player locks them all again and shuffles: nobody knows the layout now. Play starts. */
export function postDeckB(live: Live, seat: Seat, key: string): Live | undefined {
  if (live.phase !== 'deal' || seat === live.dealer || !live.deckA || live.deckB) return undefined
  const deckB = shuffle(live.deckA.map((c) => hex(lock(big(c), key))))
  return { ...live, deckB, phase: 'play' }
}

/* ── Online: turning a card over ────────────────────────────────────── */

/** The flipper asks for slot `i` (turning a missed pair back over first). */
export function ask(live: Live, seat: Seat, i: number): Live | undefined {
  const base = live.miss ? hideMiss(live)! : live
  if (!canFlip(base, seat, i)) return undefined
  return { ...base, ask: { s: seat, i } }
}

/** The other phone takes its lock off the asked slot. */
export function answerAsk(live: Live, key: string): Live | undefined {
  const a = live.ask
  if (!a || !live.deckB) return undefined
  const { ask: _a, ...rest } = live
  return { ...rest, part: { ...a, x: hex(unlockWith(big(live.deckB[a.i]), key)) } }
}

/** Which card a fully unlocked number is, or null. */
function decode(n: bigint, size: number): number | null {
  for (let k = 0; k < cardsFor(size); k++) if (encode(k) === n) return k
  return null
}

/** The flipper's phone takes its own lock off and puts the card face up. */
export function readPart(live: Live, key: string): Live | undefined {
  const p = live.part
  if (!p) return undefined
  const c = decode(unlockWith(big(p.x), key), live.size)
  if (c === null) return undefined
  const { part: _p, ...rest } = live
  return reveal(rest, p.s, p.i, c)
}

/** A phone lost its key (the page was opened somewhere else) and can't take its lock off: the other player takes the game. */
export function forfeit(live: Live, seat: Seat): Live | undefined {
  if (live.phase === 'done') return undefined
  const { ask: _a, part: _p, ...rest } = live
  return { ...rest, phase: 'done', result: { winner: other(seat), forfeit: true } }
}

/** At the end each phone shows its key. */
export function postKey(live: Live, seat: Seat, key: string): Live | undefined {
  if (live.phase !== 'done' || live.keys?.[`s${seat}`]) return undefined
  return { ...live, keys: { ...live.keys, [`s${seat}`]: key } }
}

/**
 * With both keys out: was it all honest? The dealer's deck must be every card under their lock, the
 * second deck exactly the first relocked, and every card shown what that slot really held.
 * Returns the layout, or why not.
 */
export function verifyBoard(live: Live): { layout: number[] } | { error: string } | null {
  const k0 = live.keys?.s0
  const k1 = live.keys?.s1
  if (!k0 || !k1 || !live.deckA || !live.deckB || live.dealer === undefined) return null
  if (!keyOk(k0) || !keyOk(k1)) return { error: 'bad key' }
  const n = cardsFor(live.size)
  const ka = live.dealer === 0 ? k0 : k1
  const kb = live.dealer === 0 ? k1 : k0
  const wantA = new Set(Array.from({ length: n }, (_, k) => hex(lock(encode(k), ka))))
  if (live.deckA.length !== n || new Set(live.deckA).size !== n || !live.deckA.every((c) => wantA.has(c))) return { error: 'the first shuffle' }
  const wantB = new Set(live.deckA.map((c) => hex(lock(big(c), kb))))
  if (live.deckB.length !== n || new Set(live.deckB).size !== n || !live.deckB.every((c) => wantB.has(c))) return { error: 'the second shuffle' }
  const layout = live.deckB.map((c) => decode(unlockWith(unlockWith(big(c), ka), kb), live.size))
  if (layout.some((c) => c === null)) return { error: 'a card' }
  if ((live.log ?? []).some((f) => layout[f.i] !== f.c)) return { error: 'a card shown' }
  return { layout: layout as number[] }
}
