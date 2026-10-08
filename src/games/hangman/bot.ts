import { BOT_SEAT, pick, type Brain, type Level, type OpsSense } from '../../match/bot'
import { wordsOfLength } from '../../lib/dictionary'
import { TARGETS } from '../anagram/words'
import { MAX_WRONG, current, guess, matchOver, roundWinner, wins, type Live, type Round } from './engine'
import type { HangmanState } from './HangmanMatch'

/**
 * Ops at Hangman. Guessing, she only knows what the board shows anyone: the word's length, the
 * letters found and the letters that missed. Medium and Hard go through the dictionary for the
 * words that still fit and try the letter most of them share: Hard always the best one, Medium one
 * of the best three, Easy one of the best six with the odd stray guess. If no word she knows fits
 * (a name, a word longer than 8 letters), she falls back on how common each letter is.
 *
 * Her working is shown on screen as she goes, so it's plain she's narrowing a list, not peeking.
 */

/** English letters, most common first. */
const COMMON = 'EARIOTNSLCUDPMHGBFYWKVXZJQ'
const SLIP: Record<Level, number> = { easy: 0.3, medium: 0.1, hard: 0 }
/** how many of the best letters she picks among */
const TOP: Record<Level, number> = { easy: 6, medium: 3, hard: 1 }

/** Dictionary words that fit the board so far, or null before the dictionary loads. */
export function fitting(r: Round): string[] | null {
  const list = wordsOfLength(r.length)
  if (!list) return null
  const tried = r.guessed ?? ''
  const wrong = [...tried].filter((l) => !r.masked.includes(l))
  return list.filter((w) => {
    for (let i = 0; i < w.length; i++) {
      const m = r.masked[i]
      // a found letter shows everywhere it's in the word, so an open square is none of the tried letters
      if (m === '_' ? tried.includes(w[i]) : w[i] !== m) return false
    }
    return !wrong.some((l) => w.includes(l))
  })
}

/** Letters not tried yet, scored by how many of the fitting words have them. */
function scored(words: string[], tried: string): [string, number][] {
  const n = new Map<string, number>()
  for (const w of words) for (const l of new Set(w)) if (!tried.includes(l)) n.set(l, (n.get(l) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])
}

export interface Working {
  /** how many dictionary words still fit (null until the dictionary loads) */
  fit: number | null
  letter: string
}

/** Ops' next letter, and what she based it on. */
export function think(r: Round, level: Level): Working {
  const tried = r.guessed ?? ''
  const open = [...COMMON].filter((l) => !tried.includes(l))
  const words = fitting(r)
  const fit = words?.length ?? 0
  const ranked = words && words.length ? scored(words, tried) : []
  if (!ranked.length) return { fit, letter: open[0] }
  if (level !== 'hard') {
    // one of the better letters, not always the best, and now and then a stray one
    const letter = Math.random() < SLIP[level] ? pick(open.slice(0, 10)) : pick(ranked.slice(0, TOP[level]))[0]
    return { fit, letter }
  }
  const top = ranked.filter(([, c]) => c === ranked[0][1])
  return { fit, letter: pick(top)[0] }
}

export const hangmanBrain: Brain = (state, level) => {
  const live = (state as unknown as HangmanState).live
  const r = live && current(live)
  if (!r || live.phase !== 'guessing' || r.setter === BOT_SEAT || r.pending) return null
  const { letter } = think(r, level)
  return (cur: Live) => guess(cur, BOT_SEAT, letter)
}

/* ── Ops' own words ─────────────────────────────────────────────────── */

/** Hangman traps: short, few vowels, rare letters. */
const HARD = [
  'JAZZ', 'FJORD', 'NYMPH', 'QUIZ', 'ZEPHYR', 'RHYTHM', 'GLYPH', 'CRYPT', 'JINX', 'LYMPH',
  'PSYCH', 'SPHINX', 'WALTZ', 'FIZZ', 'BUZZ', 'JUMBO', 'KAYAK', 'ONYX', 'OXYGEN', 'PIXEL',
  'VORTEX', 'WHIZ', 'ZIGZAG', 'JUKEBOX', 'FUZZY', 'JOCKEY', 'QUARTZ', 'ZOMBIE', 'VODKA', 'LYNX',
  'MYTH', 'HYMN', 'BANJO', 'KIWI', 'POLKA', 'YACHT', 'SQUAWK', 'TWELFTH', 'JIGSAW', 'MATRIX',
  'GAZEBO', 'HAIKU', 'IVORY', 'WAXY', 'FOXY', 'PUZZLE', 'JOVIAL', 'ZIPPY', 'GYM', 'FEZ',
  'JIG', 'WRY', 'BOXCAR', 'SKY', 'VEX', 'QUAY', 'ZAP', 'BUZZWORD', 'KNAPSACK',
]
const RARE = /[BFGHJKMPQVWXYZ]/

/** The word Ops sets: plain everyday words on Easy, something with a rarer letter on Medium, a trap on Hard. */
export function opsWord(level: Level): string {
  if (level === 'hard') return pick(HARD)
  const pool = TARGETS.filter((w) => (level === 'medium' ? RARE.test(w) : !RARE.test(w)))
  return pick(pool.length ? pool : [...TARGETS])
}

/** How the guesser is doing in a round, −1…1: squares found against chances used. */
function outlook(r: Round): number {
  const found = [...r.masked].filter((c) => c !== '_').length / r.length
  return found - r.wrong / MAX_WRONG
}

/** How the match looks to Ops, for her reactions: rounds won, then how the round in play is going. */
export const hangmanSense: OpsSense = {
  turn: (state) => {
    const live = (state as unknown as HangmanState).live
    return !live || live.phase === 'done' ? null : live.turn
  },
  standing: (state) => {
    const live = (state as unknown as HangmanState).live
    if (!live || live.phase === 'done') return null
    const [you, her] = wins(live)
    const r = current(live)
    const now = r && live.phase === 'guessing' ? (r.setter === BOT_SEAT ? -outlook(r) : outlook(r)) : 0
    return Math.max(-1, Math.min(1, 0.5 * (her - you) + 0.7 * now))
  },
  ended: (state) => {
    const live = (state as unknown as HangmanState).live
    const r = live && current(live)
    const w = r ? roundWinner(r) : null
    if (!live || live.phase !== 'done' || w === null) return null
    return { winner: w, final: matchOver(live) }
  },
  moment: (prev, next) => {
    const pl = (prev as unknown as HangmanState).live
    const nl = (next as unknown as HangmanState).live
    const a = pl && current(pl)
    const b = nl && current(nl)
    if (!a || !b || pl.round !== nl.round || b.outcome) return null
    // one letter that opened two or more squares
    const opened = [...b.masked].filter((c, i) => c !== '_' && a.masked[i] === '_').length
    if (opened < 2) return null
    return b.setter === BOT_SEAT ? 'lost' : 'took'
  },
}
