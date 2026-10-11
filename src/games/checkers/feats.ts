import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import { START, count, type Live } from './engine'

/** Pieces each side starts with. */
const PIECES = count(START, 0)
/** Pieces taken in one move for Triple jump. */
const TRIPLE = 3

export const CHECKERS_FEATS: FeatDef[] = [
  { id: 'checkers:shutout', game: 'checkers', name: 'Shutout', blurb: 'Won a game without losing a piece.' },
  { id: 'checkers:triple', game: 'checkers', name: 'Triple jump', blurb: `Captured ${TRIPLE} or more pieces in one move.` },
]

/** The feats each seat earned in a finished match (one game). */
export function checkersFeats(live: Live): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  const add = (s: Seat, id: string) => out[s].push(`checkers:${id}`)
  for (const s of [0, 1] as Seat[]) if ((live.best?.[s] ?? 0) >= TRIPLE) add(s, 'triple')
  const w = live.result?.winner
  if (w !== undefined && w !== -1 && count(live.board, w) === PIECES) add(w, 'shutout')
  return out
}
