import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { hangmanBrain, hangmanSense } from './bot'
import { HangmanMatch, initialHangmanState } from './HangmanMatch'

const game = gameBySlug('hangman')!

export function Hangman() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Hints',
        initial: 'off',
        choices: [
          { value: 'off', label: 'No hints' },
          { value: 'on', label: 'Setter adds a hint' },
        ],
      }}
      bot={hangmanBrain}
      sense={hangmanSense}
      initialState={(choice) => ({ ...initialHangmanState(choice === 'on') })}
      renderGame={(room, me, exit) => <HangmanMatch room={room} me={me} exit={exit} />}
    />
  )
}
