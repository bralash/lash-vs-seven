import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { golfBrain, golfSense } from './bot'
import { GolfMatch, initialGolfState } from './GolfMatch'

const game = gameBySlug('golf')!

export function Golf() {
  return (
    <Lobby
      game={game}
      initialState={() => ({ ...initialGolfState() })}
      bot={golfBrain}
      sense={golfSense}
      renderGame={(room, me, exit) => <GolfMatch room={room} me={me} exit={exit} />}
    />
  )
}
