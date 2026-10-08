import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { battlewordBrain, battlewordSense } from './bot'
import { BattlewordMatch, initialBattlewordState } from './BattlewordMatch'

const game = gameBySlug('battleword')!

export function Battleword() {
  return (
    <Lobby
      game={game}
      bot={battlewordBrain}
      sense={battlewordSense}
      initialState={() => ({ ...initialBattlewordState() })}
      renderGame={(room, me, exit) => <BattlewordMatch room={room} me={me} exit={exit} />}
    />
  )
}
