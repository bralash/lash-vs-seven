import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { ShootoutMatch, initialShootoutState } from './ShootoutMatch'
import { ShootoutDemo } from './HowTo'
import { shootoutBrain, shootoutSense } from './bot'

const game = gameBySlug('shootout')!

export function Shootout() {
  return (
    <Lobby
      game={game}
      initialState={() => ({ ...initialShootoutState() })}
      // shooting (drag, let go) and keeping (tap where you'll dive), acted out
      rulesDemo={() => <ShootoutDemo />}
      bot={shootoutBrain}
      sense={shootoutSense}
      renderGame={(room, me, exit) => <ShootoutMatch room={room} me={me} exit={exit} />}
    />
  )
}
