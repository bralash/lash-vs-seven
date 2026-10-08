import type { Seat } from '../../lobby/rooms'

/**
 * Battleword: each player hides a 5-letter word and races to crack the other's, one guess a turn,
 * with Wordle-style colour clues.
 *
 * The words never go into the shared room. Each owner's device keeps its own word and *answers*
 * every guess at it (guess → `pending`, then the owner's device writes the colours). When locking
 * in, each owner publishes `commit` = SHA-256 of "word:salt"; when the game ends both reveal word
 * and salt, and the other device checks the reveal and every answer against it.
 *
 * Turns go in rounds (the starter, then the other). Cracking it first only wins once the round is
 * complete: if the starter cracks it, the other gets their matching guess, and cracking it too is a
 * draw. Six guesses each; if neither cracks it, it's a draw.
 */
export const LEN = 5
export const MAX_GUESSES = 6
/** every square green */
export const SOLVED = '22222'

/** One guess and its colours: '2' right letter in the right spot, '1' in the word elsewhere, '0' not in it. */
export interface Guess {
  w: string
  p: string
}

type BySeat<T> = { s0?: T; s1?: T }
const key = (s: Seat) => `s${s}` as const

export interface Live {
  starter: Seat
  /** setting: both are picking words; playing; done */
  phase: 'setting' | 'playing' | 'done'
  turn: Seat
  /** each owner's commitment to their word */
  commits?: BySeat<string>
  /** each seat's guesses at the *other* seat's word (the database drops empty arrays: read with `?? []`) */
  tries?: BySeat<Guess[]>
  /** a guess waiting for the owner's device to answer it */
  pending?: { s: Seat; w: string }
  /** each owner's word and salt, revealed once the game is over */
  reveal?: BySeat<{ word: string; salt: string }>
  result?: { winner: Seat | -1; reason: 'cracked' | 'out' | 'forfeit' }
}

export const other = (s: Seat) => (1 - s) as Seat
export const triesOf = (live: Live, s: Seat): Guess[] => live.tries?.[key(s)] ?? []
export const cracked = (gs: Guess[]) => gs.some((g) => g.p === SOLVED)

export function freshLive(starter: Seat): Live {
  return { starter, phase: 'setting', turn: starter }
}

/** Colours for `guess` against `word`: greens first, then yellows left to right while unmatched letters remain. */
export function score(guess: string, word: string): string {
  const out = Array<string>(LEN).fill('0')
  const pool: (string | null)[] = word.split('')
  for (let i = 0; i < LEN; i++)
    if (guess[i] === word[i]) {
      out[i] = '2'
      pool[i] = null
    }
  for (let i = 0; i < LEN; i++) {
    if (out[i] !== '0') continue
    const j = pool.indexOf(guess[i])
    if (j !== -1) {
      out[i] = '1'
      pool[j] = null
    }
  }
  return out.join('')
}

/** An owner locks their word in: only the commitment goes public. Play starts once both have. */
export function lock(live: Live, seat: Seat, commit: string): Live | undefined {
  if (live.phase !== 'setting' || live.commits?.[key(seat)]) return undefined
  const commits = { ...live.commits, [key(seat)]: commit }
  const both = !!(commits.s0 && commits.s1)
  return { ...live, commits, ...(both ? { phase: 'playing' as const, turn: live.starter } : {}) }
}

/** The player on turn guesses. It waits as `pending` until the other's device answers. */
export function guess(live: Live, seat: Seat, word: string): Live | undefined {
  if (live.phase !== 'playing' || live.turn !== seat || live.pending || !/^[A-Z]{5}$/.test(word)) return undefined
  if (triesOf(live, seat).length >= MAX_GUESSES) return undefined
  return { ...live, pending: { s: seat, w: word } }
}

/** The owner's device answers the pending guess with its colours, and the turn moves on. */
export function answer(live: Live, pattern: string): Live | undefined {
  const pend = live.pending
  if (live.phase !== 'playing' || !pend || !/^[012]{5}$/.test(pattern)) return undefined
  const s = pend.s
  const o = other(s)
  const mine = [...triesOf(live, s), { w: pend.w, p: pattern }]
  const { pending: _p, ...rest } = live
  const next: Live = { ...rest, tries: { ...live.tries, [key(s)]: mine } }
  // the starter opens each round; it's only settled once the other has had their guess too
  if (s === live.starter) return { ...next, turn: o }
  const sc = cracked(mine)
  const oc = cracked(triesOf(live, o))
  if (sc || oc) return { ...next, phase: 'done', result: { winner: sc && oc ? -1 : sc ? s : o, reason: 'cracked' } }
  if (mine.length >= MAX_GUESSES) return { ...next, phase: 'done', result: { winner: -1, reason: 'out' } }
  return { ...next, turn: o }
}

/** An owner can't answer (their word was lost on this device): the guesser takes the game. */
export function forfeit(live: Live, owner: Seat): Live | undefined {
  if (live.phase !== 'playing' || !live.pending || live.pending.s === owner) return undefined
  const { pending: _p, ...rest } = live
  return { ...rest, phase: 'done', result: { winner: other(owner), reason: 'forfeit' } }
}

/** At the end each owner shows their word, so the other can check it. */
export function reveal(live: Live, owner: Seat, word: string, salt: string): Live | undefined {
  if (live.phase !== 'done' || live.reveal?.[key(owner)]) return undefined
  return { ...live, reveal: { ...live.reveal, [key(owner)]: { word, salt } } }
}
export const revealed = (live: Live, owner: Seat) => live.reveal?.[key(owner)]

/* ── The commitment ─────────────────────────────────────────────────── */

export async function commitOf(word: string, salt: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${word}:${salt}`))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function newSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Was this owner honest? Their revealed word must match their commitment, and every colour they
 * gave the other player's guesses must be what that word really scores.
 */
export async function verify(live: Live, owner: Seat): Promise<boolean | null> {
  const r = revealed(live, owner)
  const commit = live.commits?.[key(owner)]
  if (!r || !commit) return null
  if ((await commitOf(r.word, r.salt)) !== commit) return false
  return triesOf(live, other(owner)).every((g) => score(g.w, r.word) === g.p)
}

/** What every guess so far says about the letters: the best colour each letter has shown. */
export function letterStates(gs: Guess[]): Record<string, '2' | '1' | '0'> {
  const out: Record<string, '2' | '1' | '0'> = {}
  for (const g of gs)
    for (let i = 0; i < LEN; i++) {
      const l = g.w[i]
      const p = g.p[i] as '2' | '1' | '0'
      if (!out[l] || p > out[l]) out[l] = p
    }
  return out
}
