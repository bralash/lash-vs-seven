import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { dashBrain, dashSense } from './bot'
import { DashMatch, initialDashState } from './DashMatch'

const game = gameBySlug('dash')!

export function Dash() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Match',
        initial: '2',
        choices: [
          { value: '1', label: 'One race' },
          { value: '2', label: 'Best of 3' },
          { value: '3', label: 'Best of 5' },
        ],
      }}
      initialState={(choice) => ({ ...initialDashState(Number(choice ?? 2)) })}
      bot={dashBrain}
      sense={dashSense}
      renderGame={(room, me, exit) => <DashMatch room={room} me={me} exit={exit} />}
    />
  )
}
