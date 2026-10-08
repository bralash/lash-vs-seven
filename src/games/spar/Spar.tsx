import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { sparBrain, sparSense } from './bot'
import { TARGETS } from './engine'
import { SparMatch, initialSparState } from './SparMatch'

const game = gameBySlug('spar')!

export function Spar() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Play to',
        initial: '10',
        choices: TARGETS.map((t) => ({ value: String(t), label: `${t} points` })),
      }}
      bot={sparBrain}
      sense={sparSense}
      initialState={(choice) => ({ ...initialSparState(Number(choice) || 10) })}
      renderGame={(room, me, exit) => <SparMatch room={room} me={me} exit={exit} />}
    />
  )
}
