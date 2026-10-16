import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { dotrushBrain, dotrushSense } from './bot'
import { DotRushMatch, initialDotRushState } from './DotRushMatch'

const game = gameBySlug('dotrush')!

export function DotRush() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Moves',
        initial: '30',
        choices: [
          { value: '20', label: '20 each' },
          { value: '30', label: '30 each' },
          { value: '40', label: '40 each' },
        ],
      }}
      initialState={(choice) => ({ ...initialDotRushState(Number(choice ?? 30)) })}
      bot={dotrushBrain}
      sense={dotrushSense}
      renderGame={(room, me, exit) => <DotRushMatch room={room} me={me} exit={exit} />}
    />
  )
}
