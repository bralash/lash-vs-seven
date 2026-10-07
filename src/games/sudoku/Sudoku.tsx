import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { DIFFICULTY_LABEL, type Difficulty } from './engine'
import { SudokuMatch, initialSudokuState } from './SudokuMatch'

const game = gameBySlug('sudoku')!
const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

export function Sudoku() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Difficulty',
        initial: 'medium',
        choices: LEVELS.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] })),
      }}
      initialState={(choice) => ({ ...initialSudokuState((choice as Difficulty) ?? 'medium') })}
      renderGame={(room, me, exit) => <SudokuMatch room={room} me={me} exit={exit} />}
    />
  )
}
