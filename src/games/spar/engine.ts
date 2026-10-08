import type { Seat } from '../../lobby/rooms'
import { HAND } from './deal'

/**
 * Spar, two players. 36 cards (6 to Ace in four suits), five each, follow suit if you can, no trumps.
 * Only the last trick scores: 1 point, or 3 if it's won with a 6 and 2 with a 7. Win the last two
 * tricks with 6s/7s and both count (6 + 7 = 5, 6 + 6 = 6, 7 + 7 = 4). First to the target wins.
 *
 * Online, the hands never enter the room — see deal.ts. The room holds the locked decks, each
 * player's unlocked-for-you cards, and the cards played. On one device the hands sit in `hands`.
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
  s: Seat
  c: number
}

export interface Round {
  /** leads the first trick; the other player shuffles first */
  leader: Seat
  deckA?: string[]
  deckB?: string[]
  /** each seat's five cards with the opponent's lock off (the database keeps arrays as-is) */
  unlock?: { s0?: string[]; s1?: string[] }
  /** pass & play only: both hands, on this device */
  hands?: number[][]
  plays?: Play[]
  /** revealed once the round is over, so both phones can check the deal */
  keys?: { s0?: string; s1?: string }
  winner?: Seat
  points?: number
  /** forfeit: a player's key was lost on their device, so they couldn't see or play their hand */
  forfeitBy?: Seat
}

/** One finished round, kept for the results. */
export interface Past {
  winner: Seat
  points: number
  /** the winner's scoring cards (the last trick, or the last two when they add up) */
  cards?: number[]
  forfeit?: boolean
}

export interface Live {
  target: number
  round: number
  /** deal: the phones are shuffling; play; done: this round is over */
  phase: 'deal' | 'play' | 'done'
  /** whose move it is (during the deal: whose phone has to act next) */
  turn: Seat
  scores: [number, number]
  cur: Round
  /** (the database drops empty arrays — read as `past ?? []`) */
  past?: Past[]
}

export const other = (s: Seat) => (1 - s) as Seat
export const dealerOf = (r: Round) => other(r.leader)
const sk = (s: Seat) => (s === 0 ? 's0' : 's1') as 's0' | 's1'

export function freshLive(target: number, leader: Seat): Live {
  return { target, round: 0, phase: 'deal', turn: other(leader), scores: [0, 0], cur: { leader } }
}

/* ── The deal (online) ──────────────────────────────────────────────── */

export function postDeckA(live: Live, seat: Seat, deckA: string[]): Live | undefined {
  const r = live.cur
  if (live.phase !== 'deal' || seat !== dealerOf(r) || r.deckA) return undefined
  return { ...live, cur: { ...r, deckA }, turn: other(seat) }
}

export function postDeckB(live: Live, seat: Seat, deckB: string[]): Live | undefined {
  const r = live.cur
  if (live.phase !== 'deal' || seat === dealerOf(r) || !r.deckA || r.deckB) return undefined
  return { ...live, cur: { ...r, deckB } }
}

/** A player takes their lock off the opponent's five. Once both have, play starts. */
export function postUnlock(live: Live, seat: Seat, cards: string[]): Live | undefined {
  const r = live.cur
  const opp = other(seat)
  if (live.phase !== 'deal' || !r.deckB || r.unlock?.[sk(opp)]) return undefined
  const unlock = { ...r.unlock, [sk(opp)]: cards }
  const dealt = !!(unlock.s0 && unlock.s1)
  return { ...live, cur: { ...r, unlock }, ...(dealt ? { phase: 'play' as const, turn: r.leader } : {}) }
}

/** Pass & play: one phone deals both hands in the open. */
export function dealLocal(live: Live, hands: number[][]): Live | undefined {
  if (live.phase !== 'deal') return undefined
  return { ...live, cur: { ...live.cur, hands }, phase: 'play', turn: live.cur.leader }
}

export function shuffledHands(): number[][] {
  const deck = Array.from({ length: 36 }, (_, k) => k)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return [deck.slice(0, HAND).sort(byCard), deck.slice(HAND, HAND * 2).sort(byCard)]
}

/** sorting a hand: by suit, then rank */
export const byCard = (a: number, b: number) => a - b

/* ── Play ───────────────────────────────────────────────────────────── */

export const playsOf = (r: Round) => r.plays ?? []

/** The trick in progress (or the one just finished): its lead and, if played, the reply. */
export function trickAt(plays: Play[], t: number): Play[] {
  return plays.slice(t * 2, t * 2 + 2)
}

/** The reply beats the lead only by following suit higher. */
export function trickWinner(trick: Play[]): Seat {
  const [lead, reply] = trick
  return reply && suitOf(reply.c) === suitOf(lead.c) && rankOf(reply.c) > rankOf(lead.c) ? reply.s : lead.s
}

/** Which cards of `hand` can be played now: anything when leading, otherwise the led suit if you have it. */
export function playable(hand: number[], plays: Play[]): number[] {
  if (plays.length % 2 === 0) return hand
  const led = suitOf(plays[plays.length - 1].c)
  const follow = hand.filter((c) => suitOf(c) === led)
  return follow.length ? follow : hand
}

/** What's left in a seat's hand, given the five dealt. */
export const remaining = (hand: number[], plays: Play[], seat: Seat) => hand.filter((c) => !plays.some((p) => p.s === seat && p.c === c))

/**
 * Play a card. `hand` is the player's own dealt hand when this device knows it; online the opponent's
 * device can't check their hand, so that waits for the end-of-round check.
 */
export function play(live: Live, seat: Seat, card: number, hand?: number[]): Live | undefined {
  const r = live.cur
  const plays = playsOf(r)
  if (live.phase !== 'play' || live.turn !== seat || !Number.isInteger(card) || card < 0 || card > 35) return undefined
  if (plays.some((p) => p.c === card)) return undefined
  if (hand && !playable(remaining(hand, plays, seat), plays).includes(card)) return undefined
  const next = [...plays, { s: seat, c: card }]
  const cur = { ...r, plays: next }
  if (next.length % 2 === 1) return { ...live, cur, turn: other(seat) }
  const won = trickWinner(next.slice(-2))
  if (next.length < TRICKS * 2) return { ...live, cur, turn: won }
  return finish({ ...live, cur })
}

/** Points for the round: the last trick's winner scores. */
export function scoreRound(plays: Play[]): { winner: Seat; points: number; cards: number[] } {
  const last = trickAt(plays, TRICKS - 1)
  const w = trickWinner(last)
  const c5 = last.find((p) => p.s === w)!.c
  if (!bonus(c5)) return { winner: w, points: 1, cards: [c5] }
  const fourth = trickAt(plays, TRICKS - 2)
  const c4 = fourth.find((p) => p.s === w)!.c
  if (trickWinner(fourth) === w && bonus(c4)) return { winner: w, points: bonus(c4) + bonus(c5), cards: [c4, c5] }
  return { winner: w, points: bonus(c5), cards: [c5] }
}

function finish(live: Live): Live {
  const { winner, points, cards } = scoreRound(playsOf(live.cur))
  const scores = [...live.scores] as [number, number]
  scores[winner] += points
  return {
    ...live,
    phase: 'done',
    scores,
    cur: { ...live.cur, winner, points },
    past: [...(live.past ?? []), { winner, points, cards }],
  }
}

/** A player's key is gone (opened on another device): they give up the round, the opponent scores 1. */
export function forfeit(live: Live, seat: Seat): Live | undefined {
  if (live.phase === 'done') return undefined
  const winner = other(seat)
  const scores = [...live.scores] as [number, number]
  scores[winner] += 1
  return {
    ...live,
    phase: 'done',
    scores,
    cur: { ...live.cur, winner, points: 1, forfeitBy: seat },
    past: [...(live.past ?? []), { winner, points: 1, forfeit: true }],
  }
}

/** After the round: the key goes public so the other phone can check everything. */
export function revealKey(live: Live, seat: Seat, key: string): Live | undefined {
  if (live.phase !== 'done' || live.cur.keys?.[sk(seat)]) return undefined
  return { ...live, cur: { ...live.cur, keys: { ...live.cur.keys, [sk(seat)]: key } } }
}

export const matchOver = (live: Live) => live.phase === 'done' && Math.max(...live.scores) >= live.target

/** Next round: whoever took the last one leads. */
export function nextRound(live: Live): Live | undefined {
  if (live.phase !== 'done' || matchOver(live) || live.cur.winner === undefined) return undefined
  const leader = live.cur.winner
  return { ...live, round: live.round + 1, phase: 'deal', turn: other(leader), cur: { leader } }
}

/* ── The end-of-round check ─────────────────────────────────────────── */

/**
 * With both hands known: was every card played really in that hand, and did each player follow suit
 * whenever they could?
 */
export function checkPlays(plays: Play[], hands: number[][]): { s: Seat; why: string } | null {
  for (let i = 0; i < plays.length; i++) {
    const { s, c } = plays[i]
    const before = plays.slice(0, i)
    const left = remaining(hands[s], before, s)
    if (!left.includes(c)) return { s, why: `played ${cardLabel(c)}, which wasn’t in their hand` }
    if (!playable(left, before).includes(c)) return { s, why: `didn’t follow suit with ${cardLabel(c)}` }
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
