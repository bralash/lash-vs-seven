import { Lobby } from '../../lobby/Lobby'
import { ppBrain, ppSense } from '../pingpong/bot'
import { gameBySlug } from '../registry'
import { PongMatch, initialPongState } from './PongMatch'

const game = gameBySlug('pong')!

// Ops plays it live in the match screen, and reads a match the same way as Table Tennis (same state shape)
export function Pong() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Match',
        initial: '1',
        // value = games needed to win
        choices: [
          { value: '1', label: 'Single game' },
          { value: '2', label: 'Best of 3' },
          { value: '3', label: 'Best of 5' },
        ],
      }}
      initialState={(choice) => ({ ...initialPongState(Number(choice ?? 1)) })}
      bot={ppBrain}
      sense={ppSense}
      renderGame={(room, me, exit) => <PongMatch room={room} me={me} exit={exit} />}
    />
  )
}
