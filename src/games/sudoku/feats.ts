import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import type { Seated } from '../../match/types'
import type { SudokuState } from './SudokuMatch'

/** Pass & play: win by less than this for Photo finish. */
const CLOSE_MS = 10_000
/** Online the loser stops when the winner finishes: Photo finish if they had this many squares or fewer left. */
const CLOSE_CELLS = 2

export const SUDOKU_FEATS: FeatDef[] = [
  { id: 'sudoku:clean', game: 'sudoku', name: 'No mistakes', blurb: 'Finished the puzzle without a wrong entry.' },
  { id: 'sudoku:photo', game: 'sudoku', name: 'Photo finish', blurb: `Won by less than 10 seconds, or with the other player ${CLOSE_CELLS} squares from done.` },
]

/**
 * The feats each seat earned in a finished match. Online it's a race that ends at the first finish
 * (`solved.win`); in pass & play both players solve it and their times are compared (`live.times`).
 * Rooms from before wrong entries were tracked have no `clean`: nobody gets No mistakes there.
 */
export function sudokuFeats(st: SudokuState, seats: [Seated | null, Seated | null], winner: Seat | -1): [string[], string[]] {
  const out: [string[], string[]] = [[], []]
  const win = st.solved?.win
  if (win) {
    if (winner === -1) return out
    if (win.clean) out[winner].push('sudoku:clean')
    const loser = seats[winner === 0 ? 1 : 0]
    const need = [...st.puzzle].filter((v) => v === '.').length
    const theirs = (loser && st.progress?.[loser.id]) || 0
    if (need - theirs <= CLOSE_CELLS) out[winner].push('sudoku:photo')
    return out
  }
  const { times, clean } = st.live
  for (const s of [0, 1] as Seat[]) if (clean?.[`s${s}`] && times?.[`s${s}`] !== undefined) out[s].push('sudoku:clean')
  if (winner !== -1 && times?.s0 !== undefined && times.s1 !== undefined && Math.abs(times.s0 - times.s1) < CLOSE_MS) out[winner].push('sudoku:photo')
  return out
}
