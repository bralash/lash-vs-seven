import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { c4Brain } from './bot'
import { C4Match, initialC4State } from './C4Match'

const game = gameBySlug('connect4')!

export function ConnectFour() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Series',
        initial: '2',
        // value = games needed to win
        choices: [
          { value: '1', label: 'Single game' },
          { value: '2', label: 'Best of 3' },
          { value: '3', label: 'Best of 5' },
        ],
      }}
      initialState={(choice) => ({ ...initialC4State(Number(choice ?? 2)) })}
      bot={c4Brain}
      renderGame={(room, me, exit) => <C4Match room={room} me={me} exit={exit} />}
    />
  )
}
