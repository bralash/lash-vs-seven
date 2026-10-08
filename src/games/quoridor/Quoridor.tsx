import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { quoridorBrain, quoridorSense } from './bot'
import { QuoridorMatch, initialQuoridorState } from './QuoridorMatch'

const game = gameBySlug('quoridor')!

export function Quoridor() {
  return (
    <Lobby
      game={game}
      bot={quoridorBrain}
      sense={quoridorSense}
      initialState={() => ({ ...initialQuoridorState() })}
      renderGame={(room, me, exit) => <QuoridorMatch room={room} me={me} exit={exit} />}
    />
  )
}
