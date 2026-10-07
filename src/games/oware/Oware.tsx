import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { OwareMatch, initialOwareState } from './OwareMatch'

const game = gameBySlug('oware')!

export function Oware() {
  return (
    <Lobby
      game={game}
      initialState={() => ({ ...initialOwareState() })}
      renderGame={(room, me, exit) => <OwareMatch room={room} me={me} exit={exit} />}
    />
  )
}
