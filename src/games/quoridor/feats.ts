import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import { other, pathLeft, wallsUsed, type Live } from './engine'

export const QUORIDOR_FEATS: FeatDef[] = [
  { id: 'quoridor:nowalls', game: 'quoridor', name: 'No walls needed', blurb: 'Won a game without placing a wall.' },
  { id: 'quoridor:photo', game: 'quoridor', name: 'Photo finish', blurb: 'Won a game with the other pawn one step from home.' },
]

/** The feats each seat earned in a finished match (one game). */
export function quoridorFeats(live: Live): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  const w = live.result?.winner
  if (w === undefined) return out
  const add = (s: Seat, id: string) => out[s].push(`quoridor:${id}`)
  if (wallsUsed(live, w) === 0) add(w, 'nowalls')
  if (pathLeft(live, other(w)) === 1) add(w, 'photo')
  return out
}
