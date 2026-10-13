import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { ringBrain, ringSense } from './bot'
import { RingMatch, initialRingState } from './RingMatch'

const game = gameBySlug('ring')!

export function Ring() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Match',
        initial: '2',
        choices: [
          { value: '1', label: 'One game' },
          { value: '2', label: 'Best of 3' },
          { value: '3', label: 'Best of 5' },
        ],
      }}
      initialState={(choice) => ({ ...initialRingState(Number(choice ?? 2)) })}
      bot={ringBrain}
      sense={ringSense}
      renderGame={(room, me, exit) => <RingMatch room={room} me={me} exit={exit} />}
    />
  )
}
