import type { Seat } from '../../lobby/rooms'

/**
 * Hangman, two rounds: each player sets a word once and guesses once.
 *
 * The word never goes into the shared room. The setter's device keeps it and *answers* each guess
 * (guess → `pending`, then the setter's device fills in the letters). When the word is locked in,
 * the setter publishes `commit` = SHA-256 of "word:salt"; when the round ends they reveal word and
 * salt, and the guesser's device checks both against what it was told along the way.
 */
export const MAX_WRONG = 6
export const ROUNDS = 2
export const MIN_LEN = 3
export const MAX_LEN = 20

export interface Round {
  setter: Seat
  length: number
  hint?: string
  commit: string
  /** the word as the guesser sees it: letters found so far, '_' for the rest */
  masked: string
  /** every letter tried, in order */
  guessed?: string
  wrong: number
  /** a letter the guesser has tried that the setter's device hasn't answered yet */
  pending?: string
  /** revealed when the round ends */
  word?: string
  salt?: string
  outcome?: 'escaped' | 'hanged' | 'forfeit'
}

export interface Live {
  starter: Seat
  round: number
  /** setting: the setter is choosing; guessing; done: this round is over */
  phase: 'setting' | 'guessing' | 'done'
  /** whose move it is (on a shared device, whose hands the phone is in) */
  turn: Seat
  /** (the database drops empty arrays — read as `rounds ?? []`) */
  rounds?: Round[]
}

const other = (s: Seat) => (1 - s) as Seat
export const setterOf = (live: Live): Seat => (live.round % 2 === 0 ? live.starter : other(live.starter))
export const current = (live: Live): Round | undefined => (live.rounds ?? [])[live.round]

export function freshLive(starter: Seat): Live {
  return { starter, round: 0, phase: 'setting', turn: starter }
}

/** Letters only, 3–20 of them. Returns the cleaned word or an error message. */
export function checkWord(raw: string): { word: string } | { error: string } {
  const word = raw.trim().toUpperCase()
  if (!word) return { error: 'Pick or type a word' }
  if (/[^A-Z]/.test(word)) return { error: 'Letters only — no spaces or symbols' }
  if (word.length < MIN_LEN) return { error: `At least ${MIN_LEN} letters` }
  if (word.length > MAX_LEN) return { error: `At most ${MAX_LEN} letters` }
  return { word }
}

/** The setter locks a word in: only its length (and the commitment) goes public. */
export function lock(live: Live, seat: Seat, r: { length: number; commit: string; hint?: string }): Live | undefined {
  if (live.phase !== 'setting' || setterOf(live) !== seat) return undefined
  const round: Round = { setter: seat, length: r.length, commit: r.commit, masked: '_'.repeat(r.length), wrong: 0 }
  if (r.hint) round.hint = r.hint
  const rounds = [...(live.rounds ?? [])]
  rounds[live.round] = round
  return { ...live, rounds, phase: 'guessing', turn: other(seat) }
}

/** The guesser tries a letter. It waits as `pending` until the setter's device answers. */
export function guess(live: Live, seat: Seat, letter: string): Live | undefined {
  const r = current(live)
  if (!r || live.phase !== 'guessing' || seat === r.setter || r.pending) return undefined
  if (!/^[A-Z]$/.test(letter) || (r.guessed ?? '').includes(letter)) return undefined
  return withRound(live, { ...r, pending: letter })
}

/** The setter's device answers the pending letter from the secret word. */
export function answer(live: Live, word: string, salt: string): Live | undefined {
  const r = current(live)
  if (!r || live.phase !== 'guessing' || !r.pending || word.length !== r.length) return undefined
  const l = r.pending
  const masked = word
    .split('')
    .map((c, i) => (c === l ? c : r.masked[i]))
    .join('')
  const hit = word.includes(l)
  const { pending: _p, ...rest } = r
  const next: Round = { ...rest, guessed: (r.guessed ?? '') + l, masked, wrong: r.wrong + (hit ? 0 : 1) }
  const solved = !masked.includes('_')
  if (solved || next.wrong >= MAX_WRONG) {
    next.outcome = solved ? 'escaped' : 'hanged'
    next.word = word
    next.salt = salt
    return { ...withRound(live, next), phase: 'done' }
  }
  return withRound(live, next)
}

/** The setter can't answer (their word was lost on this device) — the guesser gets the round. */
export function forfeit(live: Live, seat: Seat): Live | undefined {
  const r = current(live)
  if (!r || live.phase !== 'guessing' || seat !== r.setter) return undefined
  const { pending: _p, ...rest } = r
  return { ...withRound(live, { ...rest, outcome: 'forfeit' }), phase: 'done' }
}

/** After round 1: on to the other player's word. */
export function nextRound(live: Live): Live | undefined {
  if (live.phase !== 'done' || live.round + 1 >= ROUNDS) return undefined
  const round = live.round + 1
  const next: Live = { ...live, round, phase: 'setting' }
  next.turn = setterOf(next)
  return next
}

export const matchOver = (live: Live) => live.phase === 'done' && live.round + 1 >= ROUNDS

/** Who won a finished round: the guesser if they got the word, otherwise the setter. */
export const roundWinner = (r: Round): Seat | null => (!r.outcome ? null : r.outcome === 'hanged' ? r.setter : other(r.setter))

export function wins(live: Live): [number, number] {
  const w: [number, number] = [0, 0]
  for (const r of live.rounds ?? []) {
    const s = roundWinner(r)
    if (s !== null) w[s]++
  }
  return w
}

function withRound(live: Live, r: Round): Live {
  const rounds = [...(live.rounds ?? [])]
  rounds[live.round] = r
  return { ...live, rounds }
}

/* ── The commitment ─────────────────────────────────────────────────── */

export async function commitOf(word: string, salt: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${word}:${salt}`))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function newSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Was the setter honest? The revealed word must match the commitment, and every answer given
 * during the round must fit it.
 */
export async function verify(r: Round): Promise<boolean> {
  if (!r.word || !r.salt) return true // forfeits reveal nothing
  if ((await commitOf(r.word, r.salt)) !== r.commit) return false
  const guessed = r.guessed ?? ''
  const fits = r.word.split('').every((c, i) => (guessed.includes(c) ? r.masked[i] === c : r.masked[i] === '_'))
  const wrong = guessed.split('').filter((l) => !r.word!.includes(l)).length
  return fits && wrong === r.wrong
}
