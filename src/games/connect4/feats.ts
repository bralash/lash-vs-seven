import type { FeatDef } from '../../match/feats'
import type { Live } from './engine'

export const CONNECT4_FEATS: FeatDef[] = [
  { id: 'connect4:quick', game: 'connect4', name: 'Quick four', blurb: 'Won a game having dropped five discs or fewer.' },
  { id: 'connect4:lastslot', game: 'connect4', name: 'Last slot', blurb: 'Won a game with the board one disc from full.' },
]

const IDS: Record<string, string> = { q: 'connect4:quick', l: 'connect4:lastslot' }

/** The feats each seat earned in a finished series (kept game by game in `live.got`). */
export function connect4Feats(live: Live): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  const got = live.got ?? ''
  for (let i = 0; i + 1 < got.length; i += 2) {
    const id = IDS[got[i]]
    const seat = got[i + 1] === '1' ? 1 : 0
    if (id && !out[seat].includes(id)) out[seat].push(id)
  }
  return out
}
