import { BOT_SEAT, pick, squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import { cardsFor, flipLocal, hideMiss, pairOf, type Live } from './engine'
import type { MemoryState } from './MemoryMatch'

/**
 * Ops at Memory. She never reads the layout: she only knows the cards she has seen turned over
 * (`log`, the same cards you saw), and like a person she forgets them. Each card she's seen fades
 * with every flip since: half of them are gone after HALF_LIFE flips. Once forgotten, a card stays
 * forgotten until it's turned over again.
 *
 * With a pair she remembers, she takes it. Otherwise she turns over a card she doesn't know (never
 * seen, or forgotten), and if its partner is one she remembers, she goes straight to it.
 */
const HALF_LIFE: Record<Level, number> = { easy: 3, medium: 8, hard: 18 }

/** A fixed number in [0, 1) for each sighting, so a card she forgot stays forgotten. */
function chance(n: number, i: number, salt: number) {
  const x = Math.sin(n * 12.9898 + i * 78.233 + salt * 37.719) * 43758.5453
  return x - Math.floor(x)
}

/** The cards she remembers right now: slot → card, for slots still face down. */
export function remembered(live: Live, level: Level): Map<number, number> {
  const log = live.log ?? []
  const salt = log[0]?.c ?? 0
  const last = new Map<number, number>() // slot → index of its latest sighting
  log.forEach((f, n) => last.set(f.i, n))
  const out = new Map<number, number>()
  for (const [i, n] of last) {
    if (live.found[i] !== '.') continue
    const age = log.length - 1 - n
    if (chance(n, i, salt) < 0.5 ** (age / HALF_LIFE[level])) out.set(i, log[n].c)
  }
  return out
}

/** The slot Ops turns over next. */
export function choose(live: Live, level: Level): number {
  const up = live.miss ? [] : (live.up ?? [])
  const known = remembered(live, level)
  const open = Array.from({ length: cardsFor(live.size) }, (_, i) => i).filter((i) => live.found[i] === '.' && !up.some((f) => f.i === i))
  const unknown = open.filter((i) => !known.has(i))
  const partner = (c: number, not: number) => [...known].find(([i, k]) => i !== not && pairOf(k) === pairOf(c))?.[0]

  if (up.length === 1) {
    const p = partner(up[0].c, up[0].i)
    if (p !== undefined && open.includes(p)) return p
    return pick(unknown.length ? unknown : open)
  }
  // a pair she remembers both halves of
  for (const [i, c] of known) if (partner(c, i) !== undefined) return i
  return pick(unknown.length ? unknown : open)
}

export const memoryBrain: Brain = (state, level) => {
  const live = (state as unknown as MemoryState).live
  if (!live || live.phase !== 'play' || live.turn !== BOT_SEAT || !live.layout) return null
  // after a miss she first turns the two back over (so you get a look at them), then flips
  if (live.miss) return (cur: Live) => hideMiss(cur)
  const i = choose(live, level)
  return (cur: Live) => flipLocal(cur, BOT_SEAT, i)
}

/** How the game looks to Ops, for her reactions: pairs found against the pairs still out there. */
export const memorySense: OpsSense = {
  turn: (state) => {
    const live = (state as unknown as MemoryState).live
    return !live || live.phase !== 'play' ? null : live.turn
  },
  standing: (state) => {
    const live = (state as unknown as MemoryState).live
    if (!live || live.phase !== 'play') return null
    const left = cardsFor(live.size) / 2 - live.scores[0] - live.scores[1]
    // a lead counts for more the fewer pairs are left to catch up with
    return squash((live.scores[BOT_SEAT] - live.scores[0]) / Math.max(1, left), 0.8)
  },
  ended: (state) => {
    const r = (state as unknown as MemoryState).live?.result
    return r ? { winner: r.winner, final: true } : null
  },
}
