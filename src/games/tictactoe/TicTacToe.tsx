import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { TttMatch, initialTttState } from './TttMatch'

const game = gameBySlug('tictactoe')!

export function TicTacToe() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Series',
        initial: '2',
        // value = games needed to win the series
        choices: [
          { value: '2', label: 'Best of 3' },
          { value: '3', label: 'Best of 5' },
          { value: '4', label: 'Best of 7' },
        ],
      }}
      initialState={(choice) => ({ ...initialTttState(Number(choice ?? 2)) })}
      renderGame={(room, me, exit) => <TttMatch room={room} me={me} exit={exit} />}
    />
  )
}
