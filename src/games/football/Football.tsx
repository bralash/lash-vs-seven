import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { footballBrain, footballSense } from './bot'
import { FootballMatch, initialFootballState } from './FootballMatch'

const game = gameBySlug('football')!

export function Football() {
  return (
    <Lobby
      game={game}
      initialState={() => ({ ...initialFootballState() })}
      bot={footballBrain}
      sense={footballSense}
      renderGame={(room, me, exit) => <FootballMatch room={room} me={me} exit={exit} />}
    />
  )
}
