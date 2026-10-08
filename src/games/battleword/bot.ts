import { BOT_SEAT, pick, squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import { LEN, cracked, guess, other, score, triesOf, type Guess, type Live } from './engine'
import { ANSWERS } from './words'
import type { BattlewordState } from './BattlewordMatch'

/**
 * Ops at Battleword. She only knows what the board shows anyone: her guesses and the colours your
 * device gave them. She keeps the list of words she knows (the same list secret words come from)
 * that still fit every clue, and guesses from it.
 *
 * Hard picks the guess that splits what's left into the most, smallest groups (so the next clue
 * tells her the most), thinking for up to 140ms. Medium guesses any word that still fits. Easy
 * forgets the grey letters from before her last guess, and now and then guesses a word she likes
 * the look of.
 */
const BUDGET_MS = 140
const SLIP: Record<Level, number> = { easy: 0.15, medium: 0, hard: 0 }
/** a strong first guess, so Hard doesn't spend her opening thinking */
const OPENER = 'SLATE'

/** Easy's sloppier memory of an older clue: greens in place and yellows somewhere else, greys forgotten. */
const roughFit = (g: Guess, w: string) =>
  w !== g.w && [...g.p].every((c, i) => (c === '2' ? w[i] === g.w[i] : c === '1' ? w[i] !== g.w[i] && w.includes(g.w[i]) : true))

/** The words she knows that fit every clue so far (Easy forgets the greys from before her last guess). */
export function fitting(gs: Guess[], level: Level = 'hard'): string[] {
  return ANSWERS.filter((w) => gs.every((g, i) => (level === 'easy' && i < gs.length - 1 ? roughFit(g, w) : score(g.w, w) === g.p)))
}

/** How many words each possible guess would leave, on average: lower means a more telling guess. */
function expectedLeft(guessWord: string, words: string[]): number {
  const groups = new Map<string, number>()
  for (const w of words) {
    const p = score(guessWord, w)
    groups.set(p, (groups.get(p) ?? 0) + 1)
  }
  let sum = 0
  for (const n of groups.values()) sum += n * n
  // a guess that might be the word itself is worth a little extra
  return sum / words.length - (words.includes(guessWord) ? 1 / words.length : 0)
}

/** Ops' next guess. */
export function choose(gs: Guess[], level: Level): string {
  const tried = new Set(gs.map((g) => g.w))
  if (level === 'hard' && !gs.length) return OPENER
  const left = fitting(gs, level).filter((w) => !tried.has(w))
  if (!left.length || Math.random() < SLIP[level]) return pick(ANSWERS.filter((w) => !tried.has(w)))
  if (level !== 'hard' || left.length <= 2) return pick(left)
  // try the words still in play first (one of them could be it), then others, while there's time
  const deadline = performance.now() + BUDGET_MS
  const pool = [...left, ...ANSWERS.filter((w) => !tried.has(w) && !left.includes(w))]
  let best = left[0]
  let bestScore = Infinity
  for (const w of pool) {
    if (performance.now() > deadline) break
    const s = expectedLeft(w, left)
    if (s < bestScore) {
      bestScore = s
      best = w
    }
  }
  return best
}

export const battlewordBrain: Brain = (state, level) => {
  const live = (state as unknown as BattlewordState).live
  if (!live || live.phase !== 'playing' || live.turn !== BOT_SEAT || live.pending) return null
  const w = choose(triesOf(live, BOT_SEAT), level)
  return (cur: Live) => guess(cur, BOT_SEAT, w)
}

/* ── Ops' own word ──────────────────────────────────────────────────── */

/** how many known words differ from `w` in just one square (…IGHT, …ATCH: a trap) */
const neighbours = (w: string) => ANSWERS.filter((x) => x !== w && [...x].filter((c, i) => c !== w[i]).length === 1).length
const repeats = (w: string) => new Set(w).size < LEN

/**
 * The word Ops hides: on Easy one with five different letters and few look-alikes, on Medium any
 * word she knows, on Hard a trap (a word with many look-alikes, or a doubled letter).
 */
export function opsWord(level: Level): string {
  if (level === 'medium') return pick([...ANSWERS])
  for (let tries = 0; tries < 400; tries++) {
    const w = pick([...ANSWERS])
    if (level === 'easy' ? !repeats(w) && neighbours(w) <= 2 : neighbours(w) >= 5 || (repeats(w) && neighbours(w) >= 2)) return w
  }
  return pick([...ANSWERS])
}

/* ── Her read of the game, for reactions ─────────────────────────────── */

/**
 * How the race looks to Ops: how many words still fit her clues against how many fit yours (your
 * clues are on the board for anyone to see; she never reads your word).
 */
export const battlewordSense: OpsSense = {
  turn: (state) => {
    const live = (state as unknown as BattlewordState).live
    return !live || live.phase !== 'playing' ? null : live.turn
  },
  standing: (state) => {
    const live = (state as unknown as BattlewordState).live
    if (!live || live.phase !== 'playing') return null
    const hers = triesOf(live, BOT_SEAT)
    const yours = triesOf(live, other(BOT_SEAT))
    if (cracked(hers)) return 1
    if (cracked(yours)) return -1
    const left = (gs: Guess[]) => Math.max(1, fitting(gs).length)
    return squash(Math.log2(left(yours)) - Math.log2(left(hers)), 3)
  },
  ended: (state) => {
    const r = (state as unknown as BattlewordState).live?.result
    return r ? { winner: r.winner, final: true } : null
  },
  moment: (prev, next) => {
    const a = (prev as unknown as BattlewordState).live
    const b = (next as unknown as BattlewordState).live
    if (!a?.pending || b?.pending || b.phase !== 'playing') return null
    // a guess that came back with four greens
    const s = a.pending.s
    const g = triesOf(b, s).at(-1)
    if (!g || [...g.p].filter((c) => c === '2').length !== 4) return null
    return s === BOT_SEAT ? { moment: 'lucky', said: 'So close' } : { moment: 'lost', said: 'Uh oh' }
  },
}
