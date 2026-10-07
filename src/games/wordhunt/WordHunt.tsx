import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { WordHuntMatch, initialWordHuntState } from './WordHuntMatch'

const game = gameBySlug('wordhunt')!

export function WordHunt() {
  return (
    <Lobby
      game={game}
      initialState={() => ({ ...initialWordHuntState() })}
      renderGame={(room, me, requestLeave) => <WordHuntMatch room={room} me={me} requestLeave={requestLeave} />}
    />
  )
}
