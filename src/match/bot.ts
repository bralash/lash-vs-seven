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
