import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { othelloBrain } from './bot'
import { OthelloMatch, initialOthelloState } from './OthelloMatch'

const game = gameBySlug('othello')!

export function Othello() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Move hints',
        initial: 'on',
        choices: [
          { value: 'on', label: 'Show moves' },
          { value: 'off', label: 'No hints' },
        ],
      }}
      initialState={(choice) => ({ ...initialOthelloState(choice !== 'off') })}
      bot={othelloBrain}
      renderGame={(room, me, exit) => <OthelloMatch room={room} me={me} exit={exit} />}
    />
  )
}
