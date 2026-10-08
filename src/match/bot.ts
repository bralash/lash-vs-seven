/**
 * Ops, the computer opponent. A game that supports it gives the Lobby a Brain; the match then runs
 * on this device like pass & play, with you in seat 0 and Ops in seat 1. Ops' games never touch
 * the rivalry record, which is about people.
 */

export type Level = 'easy' | 'medium' | 'hard'

export const BOT_NAME = 'Ops'
export const BOT_SEAT = 1
export const LEVELS: { value: Level; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]
export const levelLabel = (l: Level) => LEVELS.find((x) => x.value === l)?.label ?? l

/**
 * Looks at the whole match state and, when it's Ops' move, returns the change to make (the same
 * kind of mutator a player's tap passes to session.move). Returns null when there's nothing to do.
 */
export type Brain = (state: Record<string, unknown>, level: Level) => ((live: never) => unknown) | null

/** One item from a list, at random. */
export const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

/** A score of any size squashed into −1…1, where `scale` counts as a clear lead (about 0.76). */
export const squash = (v: number, scale: number) => Math.tanh(v / scale)

/** Something the last move did that Ops might react to. */
export type Moment = 'took' | 'lost' | 'lucky' | 'unlucky'
/** A moment with its own words, for when the usual one ("Yes!", "Rigged") would be too vague. */
export type Said = { moment: Moment; said: string }

/**
 * How Ops reads a match, so she can react to it (src/match/OpsReactions.tsx). A game opts in by
 * passing one to the Lobby as `sense`, next to its `bot`.
 */
export interface OpsSense {
  /** changes whenever a move is made or a game starts; anything else (ready flags) isn't news.
   *  Left out, it's the match number and the whole live state. */
  key?: (state: Record<string, unknown>) => string
  /** whose move it is, or null when nobody's (a game just ended) */
  turn: (state: Record<string, unknown>) => 0 | 1 | null
  /** her feel for the game in play, from −1 (you're well ahead) to 1 (she is); null when no game is on */
  standing: (state: Record<string, unknown>) => number | null
  /** the game that just finished, if one did: who won it, and whether that settles the match */
  ended: (state: Record<string, unknown>) => { winner: 0 | 1 | -1; final: boolean } | null
  /** a capture, a lucky roll… that the move from `prev` to `next` made; games without them leave it out */
  moment?: (prev: Record<string, unknown>, next: Record<string, unknown>) => Moment | Said | null
}
