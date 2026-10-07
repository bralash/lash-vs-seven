import { inDictionary } from '../../lib/dictionary'
import { WORDS } from '../wordhunt/words'
import { TARGETS } from './words'

export const ROUNDS = 5
export const ROUND_MS = 60_000
/** Pause after each round showing the word (and its definition) before the next one starts. */
export const REVEAL_MS = 4_000
export const COUNTDOWN_MS = 3_000
/** Word length per round: a gentle ramp from 5 to 7 letters. */
const LENGTHS = [5, 5, 6, 6, 7]

/** Any real word with the same letters is a correct answer (RAISE counts for ARISE). */
const CURATED = new Set([...WORDS, ...TARGETS])
const isReal = (w: string) => CURATED.has(w) || inDictionary(w)
const letters = (w: string) => [...w].sort().join('')

export function isAnswer(attempt: string, target: string) {
  return attempt.length === target.length && letters(attempt) === letters(target) && isReal(attempt)
}

function shuffle<T>(a: T[]): T[] {
  const out = [...a]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Jumbles a word so the result is never itself a valid answer (no free points). */
export function scramble(word: string): string {
  let best = word
  for (let i = 0; i < 50; i++) {
    best = shuffle([...word]).join('')
    if (!isReal(best)) return best
  }
  return best
}

export function pickTargets(): string[] {
  const used = new Set<string>()
  return LENGTHS.map((len) => {
    const pool = TARGETS.filter((w) => w.length === len && !used.has(w))
    const w = pool[Math.floor(Math.random() * pool.length)]
    used.add(w)
    return w
  })
}

/* ── Timeline ──────────────────────────────────────────────────────────────
 * Every round's start/end is derived from the match start time plus when each
 * round was solved, so both players compute the same phase independently —
 * nobody has to "advance" the game, and a lagging host can't stall it. */

export interface Solve {
  by: string
  word: string
  /** server time it was solved */
  at: number
}
/** keyed "r0".."r4" — numeric keys would make Firebase turn this into a sparse array */
export type SolveMap = Record<string, Solve>
export const roundKey = (r: number) => `r${r}`

export interface RoundTimes {
  start: number
  end: number
  revealEnd: number
  solve: Solve | null
}

export function timeline(startedAt: number, solved: SolveMap | undefined): RoundTimes[] {
  const rounds: RoundTimes[] = []
  let t = startedAt + COUNTDOWN_MS
  for (let r = 0; r < ROUNDS; r++) {
    const limit = t + ROUND_MS
    const s = solved?.[roundKey(r)]
    const solve = s && s.at <= limit ? s : null
    const end = solve ? Math.max(solve.at, t) : limit
    rounds.push({ start: t, end, revealEnd: end + REVEAL_MS, solve })
    t = end + REVEAL_MS
  }
  return rounds
}

export type Phase = 'countdown' | 'play' | 'reveal' | 'results'

export function phaseAt(now: number, rounds: RoundTimes[]): { phase: Phase; r: number } {
  if (now < rounds[0].start) return { phase: 'countdown', r: 0 }
  for (let r = 0; r < rounds.length; r++) {
    if (now < rounds[r].end) return { phase: 'play', r }
    if (now < rounds[r].revealEnd) return { phase: 'reveal', r }
  }
  return { phase: 'results', r: rounds.length - 1 }
}
