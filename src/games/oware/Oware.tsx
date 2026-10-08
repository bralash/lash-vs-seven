import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { owareBrain } from './bot'
import { OwareMatch, initialOwareState } from './OwareMatch'

const game = gameBySlug('oware')!

export function Oware() {
  return (
    <Lobby
      game={game}
      bot={owareBrain}
      initialState={() => ({ ...initialOwareState() })}
      renderGame={(room, me, exit) => <OwareMatch room={room} me={me} exit={exit} />}
    />
  )
}
