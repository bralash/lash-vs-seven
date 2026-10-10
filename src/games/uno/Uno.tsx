import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { unoBrain, unoSense } from './bot'
import { UnoMatch, initialUnoState } from './UnoMatch'

const game = gameBySlug('uno')!

export function Uno() {
  return (
    <Lobby
      game={game}
      bot={unoBrain}
      sense={unoSense}
      initialState={(_choice, _all, seats) => ({ ...initialUnoState(1, seats) })}
      renderGame={(room, me, exit) => <UnoMatch room={room} me={me} exit={exit} />}
    />
  )
}
