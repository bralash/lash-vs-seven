import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { ppBrain, ppSense } from './bot'
import { PingPongMatch, initialPPState } from './PingPongMatch'

const game = gameBySlug('pingpong')!

export function PingPong() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Match',
        initial: '2',
        // value = games needed to win
        choices: [
          { value: '1', label: 'Single game' },
          { value: '2', label: 'Best of 3' },
          { value: '3', label: 'Best of 5' },
        ],
      }}
      initialState={(choice) => ({ ...initialPPState(Number(choice ?? 2)) })}
      bot={ppBrain}
      sense={ppSense}
      renderGame={(room, me, exit) => <PingPongMatch room={room} me={me} exit={exit} />}
    />
  )
}
