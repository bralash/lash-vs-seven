import { KEYS, load } from '../lib/storage'
import type { LocalMatch } from '../lobby/LocalGame'
import { floorOf } from './floors'

type InitialState = (choice?: string, all?: string[], seats?: number[]) => Record<string, unknown>

/**
 * A Tower floor's match against its guardian: the floor's game options, its level, and its twist
 * applied to the opening position. `wins` carries the score on floors that take more than one game.
 */
export function towerMatch(n: number, initialState: InitialState | undefined, wins: [number, number] = [0, 0]): LocalMatch {
  const f = floorOf(n)!
  const name = load(KEYS.name)?.trim().slice(0, 16) || 'You'
  const state = structuredClone(initialState?.(f.choices?.[0], f.choices, [0, 1]) ?? {})
  const live = state.live as Record<string, unknown> | undefined
  if (live && f.oppFirst) {
    // she opens: every game keeps who opens in `starter` and whose move it is in `turn`
    if ('starter' in live) live.starter = 1
    if ('turn' in live) live.turn = 1
  }
  if (live && f.twoColours) {
    // Ludo dealt with two colours each: you give up your second one
    const colors = live.colors as string[][]
    const tokens = live.tokens as Record<string, number[]>
    const [keep, ...drop] = colors[0]
    colors[0] = [keep]
    for (const c of drop) delete tokens[c]
  }
  return { names: [name, f.guardianName], state, startedAt: Date.now(), bot: f.level, tower: { floor: n, wins } }
}
