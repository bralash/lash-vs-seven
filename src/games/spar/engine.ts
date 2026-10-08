import { HAND } from './deal'

/**
 * Spar, two to four players. 36 cards (6 to Ace in four suits), five each, play goes round in seat
 * order, follow suit if you can, no trumps: the highest card of the led suit takes the trick. Only the
 * last trick scores: 1 point, or 3 if it's won with a 6 and 2 with a 7. Win the last two tricks with
 * 6s/7s and both count (6 + 7 = 5, 6 + 6 = 6, 7 + 7 = 4). First to the target wins.
 *
 * Seats are the room's (0–3); `seats` lists who's still playing. Someone leaving mid-round can't be
 * played around — their key locks every card — so the round is dealt again without them (`drop`).
 *
 * Online, the hands never enter the room — see deal.ts. The room holds the deck as the phones lock it,
 * the dealt cards as they unlock them, and the cards played. On one device the hands sit in `hands`.
 */
export const TRICKS = HAND
export const TARGETS = [5, 10, 15] as const

/** Cards are numbers 0–35: suit = k ÷ 9, rank = k mod 9 (0 is the 6, 8 the Ace). */
export const suitOf = (k: number) => Math.floor(k / 9)
export const rankOf = (k: number) => k % 9
export const SUITS = ['♠', '♥', '♦', '♣'] as const
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
export const rankLabel = (k: number) => RANKS[rankOf(k)]
export const cardLabel = (k: number) => `${rankLabel(k)}${SUITS[suitOf(k)]}`
export const isRed = (k: number) => suitOf(k) === 1 || suitOf(k) === 2

/** What a card is worth if it wins the last trick: dry 6 = 3, 7 = 2, otherwise 0 (a plain 1-point finish). */
const bonus = (k: number) => (rankOf(k) === 0 ? 3 : rankOf(k) === 1 ? 2 : 0)

export interface Play {
  s: number
  c: number
}

export interface Round {
  /** leads the first trick, and is the last phone in the deal's chain */
  leader: number
  /** who's dealt in, in seat order (missing on rounds from before 3–4 players: seats 0 and 1) */
  seats?: number[]
  /** the deck as the last phone in the chain locked and shuffled it, and how many have */
  deck?: string[]
  locked?: number
  /** five cards per player in seat order, as the phones take their locks off the others' */
  dealt?: string[]
  stripped?: number
  /** pass & play only: every hand, by seat, on this device */
  hands?: number[][]
  plays?: Play[]
  /** revealed once the round is over (`s0`…`s3`), so every phone can check the deal */
  keys?: Record<string, string>
  winner?: number
  points?: number
  /** forfeit: a player's key was lost on their device, so they couldn't see or play their hand */
  forfeitBy?: number
}

/** One finished round, kept for the results. */
export interface Past {
  winner: number
  points: number
  /** the winner's scoring cards (the last trick, or the last two when they add up) */
  cards?: number[]
  forfeit?: boolean
}

export interface Live {
  target: number
  /** rounds played to a finish so far (the one on now is round + 1) */
  round: number
  /** deals so far, counting rounds dealt again — each deal gets fresh keys */
  deal?: number
  /** deal: the phones are shuffling; play; done: this round is over */
  phase: 'deal' | 'play' | 'done'
  /** whose move it is (during the deal: whose phone has to act next) */
  turn: number
  /** by seat */
  scores: number[]
  /** who's still playing, in seat order (missing on matches from before 3–4 players: 0 and 1) */
  seats?: number[]
  cur: Round
  /** (the database drops empty arrays — read as `past ?? []`) */
  past?: Past[]
  /** the round on now was dealt again: who for, and why */
  redeal?: { who: number; why: 'left' | 'forfeit' }
}

export const sk = (s: number) => `s${s}`
export const seatsOf = (live: Live) => live.seats ?? [0, 1]
/** who was dealt into the round on now */
export const roundSeats = (live: Live) => live.cur.seats ?? seatsOf(live)
export const dealNo = (live: Live) => live.deal ?? live.round

/** the next seat round the table after `s` (which may itself have just left) */
export function nextSeat(seats: number[], s: number): number {
  return seats.find((x) => x > s) ?? seats[0]
}

/** The deal's chain: starts after the leader and ends with them. */
export function chainOf(live: Live): number[] {
  const seats = roundSeats(live)
  const i = seats.indexOf(live.cur.leader)
  return [...seats.slice(i + 1), ...seats.slice(0, i + 1)]
}

function newRound(live: Live, seats: number[], leader: number): Live {
  const next: Live = { ...live, seats, phase: 'deal', deal: dealNo(live) + 1, cur: { leader, seats } }
  delete next.redeal
  return { ...next, turn: chainOf(next)[0] }
}

export function freshLive(target: number, seats: number[], leader: number): Live {
  const scores = Array.from({ length: Math.max(...seats) + 1 }, () => 0)
  const live: Live = { target, round: 0, deal: 0, phase: 'deal', turn: 0, scores, seats, cur: { leader, seats } }
  return { ...live, turn: chainOf(live)[0] }
}

/* ── The deal (online) ──────────────────────────────────────────────── */

/** A phone locks and shuffles the deck, in its turn round the chain. After the last, the cards are dealt. */
export function postLock(live: Live, seat: number, deck: string[]): Live | undefined {
  const r = live.cur
  const chain = chainOf(live)
  const locked = r.locked ?? 0
  if (live.phase !== 'deal' || r.dealt || chain[locked] !== seat || deck?.length !== 36) return undefined
  if (locked + 1 < chain.length) return { ...live, cur: { ...r, deck, locked: locked + 1 }, turn: chain[locked + 1] }
  return { ...live, cur: { ...r, deck, locked: locked + 1, dealt: deck.slice(0, HAND * chain.length), stripped: 0 }, turn: chain[0] }
}

/** A phone takes its lock off everyone else's cards, in its turn. After the last, play starts. */
export function postStrip(live: Live, seat: number, dealt: string[]): Live | undefined {
  const r = live.cur
  const chain = chainOf(live)
  const stripped = r.stripped ?? 0
  if (live.phase !== 'deal' || !r.dealt || chain[stripped] !== seat || dealt?.length !== r.dealt.length) return undefined
  if (stripped + 1 < chain.length) return { ...live, cur: { ...r, dealt, stripped: stripped + 1 }, turn: chain[stripped + 1] }
  return { ...live, cur: { ...r, dealt, stripped: stripped + 1 }, phase: 'play', turn: r.leader }
}

/** The deal is done: everyone's cards have only their owner's lock left. */
export const dealt = (live: Live) => !!live.cur.dealt && (live.cur.stripped ?? 0) >= roundSeats(live).length

/** Pass & play: one phone deals every hand in the open. */
export function dealLocal(live: Live, hands: number[][]): Live | undefined {
  if (live.phase !== 'deal') return undefined
  return { ...live, cur: { ...live.cur, hands }, phase: 'play', turn: live.cur.leader }
}

/** Five cards for each of `seats`, by seat (other seats get none). */
export function shuffledHands(seats: number[]): number[][] {
  const deck = Array.from({ length: 36 }, (_, k) => k)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const hands: number[][] = Array.from({ length: Math.max(...seats) + 1 }, () => [])
  seats.forEach((s, i) => (hands[s] = deck.slice(i * HAND, (i + 1) * HAND).sort(byCard)))
  return hands
}

/** sorting a hand: by suit, then rank */
export const byCard = (a: number, b: number) => a - b

/* ── Play ───────────────────────────────────────────────────────────── */

export const playsOf = (r: Round) => r.plays ?? []

/** Trick `t` of a round with `n` players: its lead and the cards played to it so far. */
export function trickAt(plays: Play[], t: number, n: number): Play[] {
  return plays.slice(t * n, t * n + n)
}

/** The highest card of the led suit takes it. */
export function trickWinner(trick: Play[]): number {
  let best = trick[0]
  for (const p of trick) if (suitOf(p.c) === suitOf(best.c) && rankOf(p.c) > rankOf(best.c)) best = p
  return best.s
}

/** Which cards of `hand` can be played now: anything when leading, otherwise the led suit if you have it. */
export function playable(hand: number[], plays: Play[], n: number): number[] {
  if (plays.length % n === 0) return hand
  const led = suitOf(plays[plays.length - (plays.length % n)].c)
  const follow = hand.filter((c) => suitOf(c) === led)
  return follow.length ? follow : hand
}

/** What's left in a seat's hand, given the five dealt. */
export const remaining = (hand: number[], plays: Play[], seat: number) => hand.filter((c) => !plays.some((p) => p.s === seat && p.c === c))

/**
 * Play a card. `hand` is the player's own dealt hand when this device knows it; online the other
 * phones can't check it, so that waits for the end-of-round check.
 */
export function play(live: Live, seat: number, card: number, hand?: number[]): Live | undefined {
  const r = live.cur
  const plays = playsOf(r)
  const seats = roundSeats(live)
  const n = seats.length
  if (live.phase !== 'play' || live.turn !== seat || !Number.isInteger(card) || card < 0 || card > 35) return undefined
  if (plays.some((p) => p.c === card)) return undefined
  if (hand && !playable(remaining(hand, plays, seat), plays, n).includes(card)) return undefined
  const next = [...plays, { s: seat, c: card }]
  const cur = { ...r, plays: next }
  if (next.length % n !== 0) return { ...live, cur, turn: nextSeat(seats, seat) }
  const won = trickWinner(next.slice(-n))
  if (next.length < TRICKS * n) return { ...live, cur, turn: won }
  return finish({ ...live, cur })
}

/** Points for the round: the last trick's winner scores. */
export function scoreRound(plays: Play[], n: number): { winner: number; points: number; cards: number[] } {
  const last = trickAt(plays, TRICKS - 1, n)
  const w = trickWinner(last)
  const c5 = last.find((p) => p.s === w)!.c
  if (!bonus(c5)) return { winner: w, points: 1, cards: [c5] }
  const fourth = trickAt(plays, TRICKS - 2, n)
  const c4 = fourth.find((p) => p.s === w)!.c
  if (trickWinner(fourth) === w && bonus(c4)) return { winner: w, points: bonus(c4) + bonus(c5), cards: [c4, c5] }
  return { winner: w, points: bonus(c5), cards: [c5] }
}

function finish(live: Live): Live {
  const { winner, points, cards } = scoreRound(playsOf(live.cur), roundSeats(live).length)
  const scores = [...live.scores]
  scores[winner] += points
  return {
    ...live,
    phase: 'done',
    scores,
    cur: { ...live.cur, winner, points },
    past: [...(live.past ?? []), { winner, points, cards }],
  }
}

/**
 * A player's key is gone (the page was opened on another device), so they can't see their cards.
 * One-on-one, they give up the round and the other player scores 1. With three or four, the round
 * is dealt again and it costs them a point (if they have one).
 */
export function forfeit(live: Live, seat: number): Live | undefined {
  const seats = roundSeats(live)
  if (live.phase === 'done' || !seats.includes(seat)) return undefined
  const scores = [...live.scores]
  if (seats.length > 2) {
    scores[seat] = Math.max(0, scores[seat] - 1)
    return { ...newRound({ ...live, scores }, seatsOf(live), live.cur.leader), redeal: { who: seat, why: 'forfeit' } }
  }
  const winner = seats.find((s) => s !== seat)!
  scores[winner] += 1
  return {
    ...live,
    phase: 'done',
    scores,
    cur: { ...live.cur, winner, points: 1, forfeitBy: seat },
    past: [...(live.past ?? []), { winner, points: 1, forfeit: true }],
  }
}

/**
 * A player has left the match. Their score stays on the board, but they're out: a round in progress
 * is dealt again for the rest (with the next player leading if it was theirs to lead).
 */
export function drop(live: Live, seat: number): Live | undefined {
  const seats = seatsOf(live)
  if (!seats.includes(seat)) return undefined
  const rest = seats.filter((s) => s !== seat)
  if (live.phase === 'done' || rest.length < 2) return { ...live, seats: rest }
  const leader = rest.includes(live.cur.leader) ? live.cur.leader : nextSeat(rest, live.cur.leader)
  return { ...newRound(live, rest, leader), redeal: { who: seat, why: 'left' } }
}

/** After the round: the key goes public so the other phones can check everything. */
export function revealKey(live: Live, seat: number, key: string): Live | undefined {
  if (live.phase !== 'done' || live.cur.keys?.[sk(seat)]) return undefined
  return { ...live, cur: { ...live.cur, keys: { ...live.cur.keys, [sk(seat)]: key } } }
}

export const matchOver = (live: Live) => live.phase === 'done' && Math.max(...live.scores) >= live.target

/** The match's winner (by seat), or -1 while level at the top. */
export function leaderOf(scores: number[], seats: number[]): number {
  const top = Math.max(...seats.map((s) => scores[s]))
  const at = seats.filter((s) => scores[s] === top)
  return at.length === 1 ? at[0] : -1
}

/** Next round: whoever took the last one leads (or, if they've left, the next player round). */
export function nextRound(live: Live): Live | undefined {
  if (live.phase !== 'done' || matchOver(live) || live.cur.winner === undefined) return undefined
  const seats = seatsOf(live)
  const leader = seats.includes(live.cur.winner) ? live.cur.winner : nextSeat(seats, live.cur.winner)
  return newRound({ ...live, round: live.round + 1 }, seats, leader)
}

/* ── The end-of-round check ─────────────────────────────────────────── */

/**
 * With every hand known (by seat): was every card played really in that hand, and did each player
 * follow suit whenever they could?
 */
export function checkPlays(plays: Play[], hands: number[][], n: number): { s: number; why: string } | null {
  for (let i = 0; i < plays.length; i++) {
    const { s, c } = plays[i]
    const before = plays.slice(0, i)
    const left = remaining(hands[s] ?? [], before, s)
    if (!left.includes(c)) return { s, why: `played ${cardLabel(c)}, which wasn’t in their hand` }
    if (!playable(left, before, n).includes(c)) return { s, why: `didn’t follow suit with ${cardLabel(c)}` }
  }
  return null
}

/** How the round was scored, for the round-over line. */
export function finishLabel(p: Past): string {
  if (p.forfeit) return 'forfeit'
  const cs = p.cards ?? []
  if (cs.length === 2) return `${cs.map(rankLabel).join(' + ')} double`
  const c = cs[0]
  if (c === undefined) return ''
  return rankOf(c) === 0 ? 'dry 6' : rankOf(c) === 1 ? 'with a 7' : 'last trick'
}
