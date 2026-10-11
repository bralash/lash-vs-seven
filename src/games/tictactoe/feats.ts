import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import type { Live } from './engine'

export const TICTACTOE_FEATS: FeatDef[] = [
  { id: 'tictactoe:flawless', game: 'tictactoe', name: 'Flawless series', blurb: 'Won a series of two or more games without losing one.' },
  { id: 'tictactoe:ironwall', game: 'tictactoe', name: 'Iron wall', blurb: 'Drew three games in a row in one series.' },
]

/** The feats each seat earned in a finished series. `target` is the wins needed to take it. */
export function tictactoeFeats(live: Live, target: number): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  const s = [live.scores.s0, live.scores.s1]
  for (const w of [0, 1] as Seat[]) {
    // draws are fine; at least two games won and none lost
    if (s[w] >= target && s[w] >= 2 && s[w === 0 ? 1 : 0] === 0) out[w].push('tictactoe:flawless')
  }
  // a wall is built by both sides
  if (live.wall) for (const p of out) p.push('tictactoe:ironwall')
  return out
}
