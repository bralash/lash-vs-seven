/**
 * Uno, two to four players. 108 cards: in each of four colours one 0, two each of 1–9, two Skips,
 * two Reverses and two Draw Twos; and four Wilds and four Wild Draw Fours. Seven each, one card
 * turned up to start the discard pile.
 *
 * On your turn play a card that matches the top of the pile by colour or by number/symbol, or any
 * Wild (you name the colour). Can't or won't play: draw one, and play it straight away if it fits.
 * Skip skips the next player, Reverse turns the direction round (with two players it's a Skip), and
 * a Draw Two / Wild Draw Four makes the next player draw — unless they stack: a +2 on a +2, a +4 on
 * a +2 or a +4, and the total passes on until someone can't add to it and draws the lot.
 *
 * Down to one card you call "Uno!" (or call it ahead, on your turn with two). Forget, and anyone who
 * catches you before the next player moves makes you draw two. First to empty their hand wins.
 *
 * House choices: a Wild Draw Four can be played any time (no challenge); the turned-up card only sets
 * the colour (a Wild turned up means anything goes for the first player); the match is one round.
 *
 * Two ways to hold the cards:
 *  - one device (pass & play, Ops): every hand and the stock sit in the state as card numbers.
 *  - online: no hand ever enters the room. The deck is locked and shuffled by every phone in turn
 *    (deal.ts), and a card goes to a player when every other phone takes its lock off that slot
 *    (a request, `reqs`). The room only holds which slots each player has (`held`) and the cards
 *    played face up. When the stock runs low the discards are locked and shuffled again as a new pile.
 *    At the end every key is shown and each phone checks the shuffles and every card played.
 */

export const DECK = 108
export const HAND = 7

/* ── Cards ─────────────────────────────────────────────────────────── */

export type Kind = 'num' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
export const COLOURS = ['red', 'yellow', 'green', 'blue'] as const
export const COLOUR_NAMES = ['Red', 'Yellow', 'Green', 'Blue'] as const

/** k < 100: colour = k ÷ 25, then 0, 1,1, 2,2 … 9,9, Skip ×2, Reverse ×2, Draw Two ×2. 100–103 Wild, 104–107 Wild Draw Four. */
export const colourOf = (k: number) => (k < 100 ? Math.floor(k / 25) : -1)
export function kindOf(k: number): Kind {
  if (k >= 104) return 'wild4'
  if (k >= 100) return 'wild'
  const r = k % 25
  return r <= 18 ? 'num' : r <= 20 ? 'skip' : r <= 22 ? 'reverse' : 'draw2'
}
/** the number on a number card, or -1 */
export const numberOf = (k: number) => {
  if (k >= 100) return -1
  const r = k % 25
  return r === 0 ? 0 : r <= 18 ? ((r - 1) >> 1) + 1 : -1
}
/** what a card shows, for matching: '0'…'9', 'skip', 'reverse', 'draw2', 'wild', 'wild4' */
export const faceOf = (k: number) => (kindOf(k) === 'num' ? String(numberOf(k)) : kindOf(k))
export const isWild = (k: number) => k >= 100
const FACE_NAMES: Record<string, string> = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', wild: 'Wild', wild4: 'Wild Draw Four' }
export const cardLabel = (k: number) => (isWild(k) ? FACE_NAMES[kindOf(k)] : `${COLOUR_NAMES[colourOf(k)]} ${FACE_NAMES[faceOf(k)] ?? faceOf(k)}`)
export const validCard = (k: unknown): k is number => Number.isInteger(k) && (k as number) >= 0 && (k as number) < DECK

/** hand order: by colour, then face; wilds last */
export const byCard = (a: number, b: number) => a - b

/* ── State ─────────────────────────────────────────────────────────── */

/** A slot in a locked pile, online: "p_i" (pile p, position i). */
export type Slot = string
export const slotOf = (p: number, i: number): Slot => `${p}_${i}`
export const parseSlot = (s: Slot) => s.split('_').map(Number) as [number, number]

/** A pile of cards as locked by every phone: the deck, then the discards shuffled back in. */
export interface Pile {
  size: number
  /** the cards that went into it, face up (piles after the first; the first is the whole deck) */
  cards?: number[]
  /** how many phones have locked and shuffled it so far */
  locked?: number
}

/** Cards on their way to a player (or face up to everyone, `to` −1): every phone in `need` takes its lock off them, in order. */
export interface Req {
  to: number
  slots: Slot[]
  /** the phones still to unlock them, next first (gone once empty) */
  need?: number[]
  /** how many have so far */
  k?: number
}

export interface Play {
  s: number
  c: number
  /** where the card came from, online */
  slot?: Slot
  /** the colour named with a Wild */
  col?: number
}

/** The last thing that happened, for the status line. */
export interface Last {
  s: number
  what: 'play' | 'draw' | 'owe' | 'keep' | 'catch' | 'uno' | 'dry'
  /** cards drawn */
  n?: number
  /** caught by */
  by?: number
}

export interface Live {
  /** who's dealt in, in seat order */
  seats: number[]
  /** deals so far, counting deals made again: each gets fresh keys */
  deal: number
  phase: 'deal' | 'play' | 'done'
  /** plays first this deal */
  first: number
  turn: number
  /** 1 round the table in seat order, −1 the other way */
  dir: number
  /** played cards, the turned-up card first (the top is the last); empty arrays drop out of the database */
  discard?: number[]
  /** the colour to match; missing when a Wild was turned up to start (anything goes) */
  colour?: number | null
  /** cards the player to move has to draw unless they stack */
  owe?: number
  /** this seat drew on its turn and may play that card (`drawn`) or keep it */
  drew?: number | null
  /** the card drawn (one device) or its slot (online) */
  drawn?: number | Slot | null
  plays?: Play[]
  /** down to one card without calling Uno: anyone can catch them until the next player moves */
  uno?: number | null
  /** called Uno ahead, with two cards on their turn */
  called?: number[]
  last?: Last | null
  winner?: number
  /** this deal was made again: who for, and why */
  redeal?: { who: number; why: 'left' | 'forfeit' } | null

  /* one device */
  hands?: number[][]
  stock?: number[]

  /* online */
  piles?: Pile[]
  /** the next card to draw: [pile, position] */
  at?: [number, number]
  reqs?: Req[]
  /** each seat's slots (`s0`…`s3`) */
  held?: Record<string, Slot[]>
  /** revealed once the round is over: each seat's key for every pile */
  keys?: Record<string, string[]>
}

export const sk = (s: number) => `s${s}`
export const discardOf = (l: Live) => l.discard ?? []
export const topOf = (l: Live) => discardOf(l).at(-1)
export const playsOf = (l: Live) => l.plays ?? []
export const reqsOf = (l: Live) => l.reqs ?? []
export const pilesOf = (l: Live) => l.piles ?? []
const heldOf = (l: Live, s: number) => l.held?.[sk(s)] ?? []
export const isOpen = (l: Live) => !!l.hands

/** how many cards a seat holds */
export const countOf = (l: Live, s: number) => (l.hands ? (l.hands[s] ?? []).length : heldOf(l, s).length)

/** the next seat `k` steps on from `s` in the direction of play */
export function stepFrom(l: Live, s: number, k = 1): number {
  const n = l.seats.length
  const i = Math.max(0, l.seats.indexOf(s))
  return l.seats[(((i + l.dir * k) % n) + n) % n]
}

/** The deal's chain: starts after the first player and ends with them. */
export function chainOf(l: Live): number[] {
  const i = Math.max(0, l.seats.indexOf(l.first))
  return [...l.seats.slice(i + 1), ...l.seats.slice(0, i + 1)]
}

export function freshLive(seats: number[], first: number, deal = 0): Live {
  return { seats, deal: deal + 1, phase: 'deal', first, turn: first, dir: 1 }
}

/* ── One device: deal in the open ──────────────────────────────────── */

export function shuffled<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
export const fullDeck = () => Array.from({ length: DECK }, (_, k) => k)

/** `deck`: the 108 cards, shuffled. */
export function dealOpen(l: Live, deck: number[]): Live | undefined {
  if (l.phase !== 'deal' || deck.length !== DECK) return undefined
  const hands: number[][] = Array.from({ length: Math.max(...l.seats) + 1 }, () => [])
  l.seats.forEach((s, i) => (hands[s] = deck.slice(i * HAND, (i + 1) * HAND).sort(byCard)))
  const at = l.seats.length * HAND
  const start = deck[at]
  return { ...l, hands, stock: deck.slice(at + 1), discard: [start], colour: isWild(start) ? null : colourOf(start), phase: 'play', turn: l.first }
}

/* ── Online: the deal ──────────────────────────────────────────────── */

const fullyLocked = (l: Live, p: Pile) => (p.locked ?? 0) >= chainOf(l).length
/** a pile still being locked and shuffled, if any */
export const lockingPile = (l: Live) => pilesOf(l).findIndex((p) => !fullyLocked(l, p))

/** A phone has locked and shuffled pile `p` (its result is in the vault). After the deck's last lock, the hands go out. */
export function postLock(l: Live, seat: number, p: number): Live | undefined {
  const piles = l.piles ? [...l.piles] : [{ size: DECK, locked: 0 }]
  const pile = piles[p]
  const chain = chainOf(l)
  const locked = pile?.locked ?? 0
  if (!pile || l.phase === 'done' || chain[locked] !== seat || (p === 0 && l.phase !== 'deal')) return undefined
  piles[p] = { ...pile, locked: locked + 1 }
  const next: Live = { ...l, piles }
  if (p > 0 || locked + 1 < chain.length) return next
  // the deck is ready: seven slots each in seat order, the next one turned up for everyone
  const n = l.seats.length
  const held: Record<string, Slot[]> = {}
  const reqs: Req[] = []
  l.seats.forEach((s, j) => {
    held[sk(s)] = Array.from({ length: HAND }, (_, i) => slotOf(0, j * HAND + i))
    reqs.push({ to: s, slots: held[sk(s)], need: chain.filter((x) => x !== s), k: 0 })
  })
  reqs.push({ to: -1, slots: [slotOf(0, n * HAND)], need: chain, k: 0 })
  return { ...next, held, reqs, at: [0, n * HAND + 1] }
}

/** the requests waiting on this phone to unlock their cards */
export const waitingOn = (l: Live, seat: number) => reqsOf(l).flatMap((r, id) => ((r.need ?? [])[0] === seat ? [id] : []))
export const reqDone = (r: Req) => !(r.need ?? []).length

/**
 * A phone has taken its lock off the cards of requests `ids` (results in the vault). The phone that
 * finishes the turned-up card also reads it: `start`.
 */
export function postStrip(l: Live, seat: number, ids: number[], start?: number): Live | undefined {
  if (l.phase === 'done' || !ids.length) return undefined
  const reqs = [...reqsOf(l)]
  let next: Live = l
  for (const id of ids) {
    const r = reqs[id]
    if (!r || (r.need ?? [])[0] !== seat) return undefined
    const need = (r.need ?? []).slice(1)
    reqs[id] = { ...r, need, k: (r.k ?? 0) + 1 }
    if (r.to === -1 && !need.length) {
      if (!validCard(start)) return undefined
      next = { ...next, discard: [start], colour: isWild(start) ? null : colourOf(start) }
    }
  }
  next = { ...next, reqs }
  if (next.phase === 'deal' && next.discard?.length && reqs.every(reqDone)) next = { ...next, phase: 'play', turn: next.first }
  return next
}

/** online: up to `n` slots off the top of the stock, and where the stock will be after. `wait`: a pile is still being shuffled. */
function take(l: Live, n: number): { slots: Slot[]; at: [number, number]; wait: boolean } {
  const piles = pilesOf(l)
  let [p, i] = l.at ?? [0, 0]
  const slots: Slot[] = []
  while (slots.length < n) {
    if (piles[p] && i < piles[p].size) slots.push(slotOf(p, i++))
    else if (piles[p + 1] && fullyLocked(l, piles[p + 1])) ((p += 1), (i = 0))
    else break
  }
  return { slots, at: [p, i], wait: lockingPile(l) >= 0 }
}

/** cards left to draw */
export function stockLeft(l: Live): number {
  if (l.hands) return (l.stock ?? []).length
  const piles = pilesOf(l)
  const [p, i] = l.at ?? [0, 0]
  let left = Math.max(0, (piles[p]?.size ?? 0) - i)
  for (let q = p + 1; q < piles.length; q++) if (fullyLocked(l, piles[q])) left += piles[q].size
  return left
}

/** online: when the stock runs low, the discards under the top card go into a new pile to be locked and shuffled */
function refill(l: Live): Live {
  if (l.hands || l.phase !== 'play' || lockingPile(l) >= 0) return l
  const d = discardOf(l)
  if (d.length < 2 || stockLeft(l) >= Math.max(12, l.owe ?? 0)) return l
  return { ...l, piles: [...pilesOf(l), { size: d.length - 1, cards: d.slice(0, -1), locked: 0 }], discard: d.slice(-1) }
}

/* ── Play ──────────────────────────────────────────────────────────── */

/** Can card `c` go on the pile now? (Not counting whose turn it is, or a card just drawn.) */
export function fits(l: Live, c: number): boolean {
  const top = topOf(l)
  if (top === undefined) return false
  if (l.owe) return kindOf(c) === 'wild4' || (kindOf(top) === 'draw2' && kindOf(c) === 'draw2')
  if (isWild(c) || l.colour === null || l.colour === undefined) return true
  return colourOf(c) === l.colour || faceOf(c) === faceOf(top)
}

/** which of `hand` `s` may play right now */
export function playable(l: Live, s: number, hand: number[], drawnCard?: number | null): number[] {
  if (l.phase !== 'play' || l.turn !== s) return []
  if (l.drew === s) return drawnCard !== undefined && drawnCard !== null && fits(l, drawnCard) ? [drawnCard] : []
  return hand.filter((c) => fits(l, c))
}

/** anyone other than the uncalled player moving closes the window to catch them */
const closeUno = (l: Live, s: number): Live => (l.uno !== null && l.uno !== undefined && l.uno !== s ? { ...l, uno: null } : l)

/**
 * `s` plays card `c` (from `slot`, online), naming `col` if it's a Wild. One device checks the card is
 * in their hand; online that waits for the end-of-round check.
 */
export function play(l0: Live, s: number, c: number, opt: { slot?: Slot; col?: number } = {}): Live | undefined {
  if (l0.phase !== 'play' || l0.turn !== s || !validCard(c) || !fits(l0, c)) return undefined
  if (isWild(c) && !(Number.isInteger(opt.col) && opt.col! >= 0 && opt.col! < 4)) return undefined
  let l = closeUno(l0, s)
  if (l.hands) {
    const hand = l.hands[s] ?? []
    if (!hand.includes(c)) return undefined
    if (l.drew === s && l.drawn !== c) return undefined
    const hands = [...l.hands]
    hands[s] = hand.filter((x) => x !== c)
    l = { ...l, hands }
  } else {
    const slot = opt.slot
    if (!slot || !heldOf(l, s).includes(slot)) return undefined
    if (l.drew === s && l.drawn !== slot) return undefined
    // its cards have to have reached them
    if (!reqsOf(l).some((r) => r.to === s && r.slots.includes(slot) && reqDone(r))) return undefined
    l = { ...l, held: { ...l.held, [sk(s)]: heldOf(l, s).filter((x) => x !== slot) } }
  }
  const p: Play = { s, c, ...(l.hands ? {} : { slot: opt.slot }), ...(isWild(c) ? { col: opt.col } : {}) }
  l = { ...l, plays: [...playsOf(l), p], discard: [...discardOf(l), c], colour: isWild(c) ? opt.col! : colourOf(c), drew: null, drawn: null, last: { s, what: 'play' } }

  const left = countOf(l, s)
  const called = (l.called ?? []).filter((x) => x !== s)
  if (left === 0) return { ...l, phase: 'done', winner: s, uno: null, called }
  l = { ...l, called, uno: left === 1 && !(l0.called ?? []).includes(s) ? s : l.uno === s ? null : l.uno }

  const k = kindOf(c)
  if (k === 'reverse') {
    l = { ...l, dir: -l.dir }
    l = { ...l, turn: l.seats.length === 2 ? s : stepFrom(l, s) }
  } else if (k === 'skip') l = { ...l, turn: stepFrom(l, s, 2) }
  else if (k === 'draw2' || k === 'wild4') l = { ...l, owe: (l.owe ?? 0) + (k === 'draw2' ? 2 : 4), turn: stepFrom(l, s) }
  else l = { ...l, turn: stepFrom(l, s) }
  return refill(l)
}

/** `s` draws `n` cards. Undefined while the next pile is still being shuffled and there aren't enough. */
function give(l: Live, s: number, n: number): { l: Live; got: (number | Slot)[] } | undefined {
  if (l.hands) {
    let stock = l.stock ?? []
    let discard = discardOf(l)
    if (stock.length < n && discard.length > 1) {
      stock = [...stock, ...shuffled(discard.slice(0, -1))]
      discard = discard.slice(-1)
    }
    const got = stock.slice(0, n)
    const hands = [...l.hands]
    hands[s] = [...(hands[s] ?? []), ...got].sort(byCard)
    return { l: { ...l, hands, stock: stock.slice(n), discard }, got }
  }
  const t = take(l, n)
  if (t.slots.length < n && t.wait) return undefined
  if (!t.slots.length) return { l, got: [] }
  const need = chainOf(l).filter((x) => x !== s)
  const reqs = [...reqsOf(l), { to: s, slots: t.slots, need, k: 0 }]
  return { l: { ...l, reqs, at: t.at, held: { ...l.held, [sk(s)]: [...heldOf(l, s), ...t.slots] } }, got: t.slots }
}

/** `s` draws on their turn: the stacked total if there is one (and the turn passes), otherwise one card they may play. */
export function draw(l0: Live, s: number): Live | undefined {
  if (l0.phase !== 'play' || l0.turn !== s || l0.drew === s) return undefined
  const l = closeUno(l0, s)
  const owe = l.owe ?? 0
  const g = give(l, s, owe || 1)
  if (!g) return undefined
  // having picked up, they're no longer on one card
  const base: Live = { ...g.l, uno: g.l.uno === s ? null : g.l.uno, called: (l.called ?? []).filter((x) => x !== s) }
  if (owe) return refill({ ...base, owe: 0, turn: stepFrom(l, s), last: { s, what: 'owe', n: g.got.length } })
  if (!g.got.length) return { ...base, turn: stepFrom(l, s), last: { s, what: 'dry' } }
  const drawn = g.got[0]
  const next: Live = { ...base, drew: s, drawn, last: { s, what: 'draw', n: 1 } }
  // one device knows the card: if it can't be played the turn just passes
  if (l.hands && !fits(next, drawn as number)) return refill({ ...next, drew: null, drawn: null, turn: stepFrom(l, s) })
  return refill(next)
}

/** `s` keeps the card they drew, and the turn passes. */
export function keep(l: Live, s: number): Live | undefined {
  if (l.phase !== 'play' || l.turn !== s || l.drew !== s) return undefined
  return refill({ ...l, drew: null, drawn: null, turn: stepFrom(l, s), last: { s, what: 'keep' } })
}

/** `s` calls Uno: on one card (before anyone catches them), or ahead with two on their turn. */
export function callUno(l: Live, s: number): Live | undefined {
  if (l.phase !== 'play') return undefined
  const n = countOf(l, s)
  if (n === 1 && l.uno === s) return { ...l, uno: null, last: { s, what: 'uno' } }
  if (n === 2 && l.turn === s && !(l.called ?? []).includes(s)) return { ...l, called: [...(l.called ?? []), s], last: { s, what: 'uno' } }
  return undefined
}

/** `by` catches `s` on one card without having called Uno: `s` draws two. */
export function catchUno(l: Live, by: number, s: number): Live | undefined {
  if (l.phase !== 'play' || l.uno !== s || by === s || !l.seats.includes(by)) return undefined
  const g = give(l, s, 2)
  if (!g) return undefined
  return refill({ ...g.l, uno: null, last: { s, what: 'catch', n: g.got.length, by } })
}

/* ── Leaving, lost keys, the end ───────────────────────────────────── */

/** Deal again for `seats` (someone left, or lost their keys). */
function redeal(l: Live, seats: number[], who: number, why: 'left' | 'forfeit'): Live {
  const first = seats.includes(l.first) ? l.first : (seats.find((x) => x > l.first) ?? seats[0])
  return { ...freshLive(seats, first, l.deal), redeal: { who, why } }
}

/** A player has left: the rest are dealt again. (After the round nothing changes: the end-of-round check needs everyone dealt in.) */
export function drop(l: Live, seat: number): Live | undefined {
  if (l.phase === 'done' || !l.seats.includes(seat)) return undefined
  const rest = l.seats.filter((s) => s !== seat)
  if (rest.length < 2) return { ...l, seats: rest }
  return redeal(l, rest, seat, 'left')
}

/** `seat`'s keys aren't on their device any more, so nobody can get cards to them: deal again. */
export function forfeit(l: Live, seat: number): Live | undefined {
  if (l.phase === 'done' || !l.seats.includes(seat)) return undefined
  return redeal(l, l.seats, seat, 'forfeit')
}

/** After the round: a phone shows its keys (one per pile) so the others can check everything. */
export function revealKeys(l: Live, seat: number, keys: string[]): Live | undefined {
  if (l.phase !== 'done' || l.keys?.[sk(seat)] || keys.length !== pilesOf(l).length) return undefined
  return { ...l, keys: { ...l.keys, [sk(seat)]: keys } }
}
