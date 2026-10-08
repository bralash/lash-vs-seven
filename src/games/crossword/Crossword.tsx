import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { CrosswordMatch, initialCrosswordState } from './CrosswordMatch'
import { THEMES, THEME_LABEL, type Theme } from './words'

const game = gameBySlug('crossword')!

export function Crossword() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Clues',
        initial: 'ghana',
        choices: THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] })),
      }}
      initialState={(choice) => ({ ...initialCrosswordState((THEMES as readonly string[]).includes(choice ?? '') ? (choice as Theme) : 'ghana') })}
      renderGame={(room, me, exit) => <CrosswordMatch room={room} me={me} exit={exit} />}
    />
  )
}
