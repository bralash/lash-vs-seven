import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { checkersBrain } from './bot'
import { CheckersMatch, initialCheckersState } from './CheckersMatch'

const game = gameBySlug('checkers')!

export function Checkers() {
  return (
    <Lobby
      game={game}
      bot={checkersBrain}
      initialState={() => ({ ...initialCheckersState() })}
      renderGame={(room, me, exit) => <CheckersMatch room={room} me={me} exit={exit} />}
    />
  )
}
