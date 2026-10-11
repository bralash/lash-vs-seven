import type { FeatDef } from '../../match/feats'
import { N, count, type Live } from './engine'

export const OTHELLO_FEATS: FeatDef[] = [
  { id: 'othello:wipeout', game: 'othello', name: 'Wipeout', blurb: 'Won with not one disc left on the other side.' },
  { id: 'othello:cornerking', game: 'othello', name: 'Corner king', blurb: 'Won holding all four corners.' },
]

const CORNERS = [0, N - 1, N * (N - 1), N * N - 1]

/** The feats each seat earned in a finished game (read off the final board). */
export function othelloFeats(live: Live): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  const w = live.result?.winner
  if (w !== 0 && w !== 1) return out
  if (count(live.board, w === 0 ? 1 : 0) === 0) out[w].push('othello:wipeout')
  if (CORNERS.every((i) => live.board[i] === String(w))) out[w].push('othello:cornerking')
  return out
}
