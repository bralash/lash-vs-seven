import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { owareBrain } from './bot'
import { OwareDemo } from './OwareDemo'
import { OwareMatch, initialOwareState } from './OwareMatch'

const game = gameBySlug('oware')!

export function Oware() {
  return (
    <Lobby
      game={game}
      bot={owareBrain}
      rulesDemo={(onRule) => <OwareDemo onRule={onRule} />}
      initialState={() => ({ ...initialOwareState() })}
      renderGame={(room, me, exit) => <OwareMatch room={room} me={me} exit={exit} />}
    />
  )
}
