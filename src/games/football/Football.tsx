import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { footballBrain, footballSense } from './bot'
import { FootballMatch, initialFootballState } from './FootballMatch'

const game = gameBySlug('football')!

export function Football() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Match',
        initial: '2',
        // value = goals needed to win
        choices: [
          { value: '1', label: 'First to 1' },
          { value: '2', label: 'First to 2' },
          { value: '3', label: 'First to 3' },
        ],
      }}
      initialState={(choice) => ({ ...initialFootballState(Number(choice ?? 2)) })}
      bot={footballBrain}
      sense={footballSense}
      renderGame={(room, me, exit) => <FootballMatch room={room} me={me} exit={exit} />}
    />
  )
}
