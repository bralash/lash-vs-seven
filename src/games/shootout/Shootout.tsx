import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { ShootoutMatch, initialShootoutState } from './ShootoutMatch'
import { shootoutBrain, shootoutSense } from './bot'

const game = gameBySlug('shootout')!

export function Shootout() {
  return (
    <Lobby
      game={game}
      initialState={() => ({ ...initialShootoutState() })}
      bot={shootoutBrain}
      sense={shootoutSense}
      renderGame={(room, me, exit) => <ShootoutMatch room={room} me={me} exit={exit} />}
    />
  )
}
