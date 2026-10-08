import { BOT_SEAT, pick, squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import { TRICKS, matchOver, play, playable, playsOf, remaining, scoreRound, suitOf, trickWinner, type Live, type Play } from './engine'
import type { SparState } from './SparMatch'
import { CARDS } from './deal'

/** Ops only plays one-on-one, so there are always two seats: 0 (you) and 1 (her). */
type Seat = number
const other = (s: Seat) => 1 - s

/**
 * Ops at Spar. She only ever looks at her own hand and the cards on the table — never yours. To
 * choose, she guesses your hand many times over (any cards she hasn't seen, minus suits you've shown
 * you're out of), plays each guess out perfectly, and takes the card that does best on average.
 */
const SLIP: Record<Level, number> = { easy: 0.4, medium: 0.1, hard: 0 }
/** guesses per decision; Hard keeps guessing until its time is up */
const GUESSES: Record<Level, number> = { easy: 4, medium: 24, hard: 400 }
const BUDGET_MS = 140

/** Points from `seat`'s side once all five tricks are down: theirs if they took it, minus the other's. */
function value(plays: Play[], seat: Seat): number {
  const { winner, points } = scoreRound(plays, 2)
  return winner === seat ? points : -points
}

/** Play the rest of the round out perfectly, both hands known (alpha-beta, it's tiny). */
function solve(hands: number[][], plays: Play[], turn: Seat, seat: Seat, alpha: number, beta: number): number {
  if (plays.length === TRICKS * 2) return value(plays, seat)
  const maxing = turn === seat
  let best = maxing ? -Infinity : Infinity
  for (const c of playable(hands[turn], plays, 2)) {
    const next = [...plays, { s: turn, c }]
    const h = hands.map((x, s) => (s === turn ? x.filter((y) => y !== c) : x))
    const nextTurn = next.length % 2 === 1 ? other(turn) : trickWinner(next.slice(-2))
    const v = solve(h, next, nextTurn, seat, alpha, beta)
    if (maxing) {
      best = Math.max(best, v)
      alpha = Math.max(alpha, v)
    } else {
      best = Math.min(best, v)
      beta = Math.min(beta, v)
    }
    if (alpha >= beta) break
  }
  return best
}

/** Suits the other player can't have: they didn't follow when one was led. */
function voids(plays: Play[], them: Seat): Set<number> {
  const out = new Set<number>()
  for (let t = 0; t * 2 + 1 < plays.length; t++) {
    const [lead, reply] = plays.slice(t * 2, t * 2 + 2)
    if (reply.s === them && suitOf(reply.c) !== suitOf(lead.c)) out.add(suitOf(lead.c))
  }
  return out
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** A hand the other player could be holding, given everything `seat` has seen. */
function guess(dealt: number[], plays: Play[], seat: Seat): number[] {
  const them = other(seat)
  const seen = new Set([...dealt, ...plays.map((p) => p.c)])
  const unseen = CARDS.filter((k) => !seen.has(k))
  const n = TRICKS - plays.filter((p) => p.s === them).length
  const out = voids(plays, them)
  const fits = unseen.filter((k) => !out.has(suitOf(k)))
  return shuffle(fits.length >= n ? fits : unseen).slice(0, n)
}

/** The cards that score best on average over the guesses. */
export function bestCards(dealt: number[], plays: Play[], seat: Seat, level: Level): number[] {
  const mine = remaining(dealt, plays, seat)
  const options = playable(mine, plays, 2)
  if (options.length === 1) return options
  const totals = options.map(() => 0)
  const deadline = performance.now() + BUDGET_MS
  for (let g = 0; g < GUESSES[level] && (g < 4 || performance.now() < deadline); g++) {
    const theirs = guess(dealt, plays, seat)
    options.forEach((c, i) => {
      const next = [...plays, { s: seat, c }]
      const hands: number[][] = []
      hands[seat] = mine.filter((x) => x !== c)
      hands[other(seat)] = theirs
      const turn = next.length % 2 === 1 ? other(seat) : trickWinner(next.slice(-2))
      totals[i] += solve(hands, next, turn, seat, -Infinity, Infinity)
    })
  }
  const top = Math.max(...totals)
  return options.filter((_, i) => totals[i] === top)
}

export const sparBrain: Brain = (state, level) => {
  const live = (state as unknown as SparState).live
  if (!live || live.phase !== 'play' || live.turn !== BOT_SEAT) return null
  const dealt = live.cur.hands?.[BOT_SEAT]
  if (!dealt) return null
  const plays = playsOf(live.cur)
  const options = playable(remaining(dealt, plays, BOT_SEAT), plays, 2)
  if (!options.length) return null
  const c = Math.random() < SLIP[level] ? pick(options) : pick(bestCards(dealt, plays, BOT_SEAT, level))
  return (cur: Live) => play(cur, BOT_SEAT, c, dealt)
}

/**
 * How the match looks to Ops, for her reactions. She never reads your hand, so mid-round she goes by
 * the points table only; a round won or lost is what she reacts to.
 */
export const sparSense: OpsSense = {
  turn: (state) => {
    const live = (state as unknown as SparState).live
    return !live || live.phase !== 'play' ? null : (live.turn as 0 | 1)
  },
  standing: (state) => {
    const live = (state as unknown as SparState).live
    if (!live || live.phase === 'done') return null
    return squash((2 * (live.scores[BOT_SEAT] - live.scores[0])) / live.target, 1)
  },
  ended: (state) => {
    const live = (state as unknown as SparState).live
    if (!live || live.phase !== 'done' || live.cur.winner === undefined) return null
    return { winner: live.cur.winner as 0 | 1, final: matchOver(live) }
  },
}
