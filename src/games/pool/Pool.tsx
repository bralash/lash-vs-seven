import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { poolSense } from './bot'
import { PoolMatch, initialPoolState } from './PoolMatch'

const game = gameBySlug('pool')!

export function Pool() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Match',
        initial: '2',
        // value = frames needed to win
        choices: [
          { value: '1', label: 'Single frame' },
          { value: '2', label: 'Best of 3' },
          { value: '3', label: 'Best of 5' },
        ],
      }}
      initialState={(choice) => ({ ...initialPoolState(Number(choice ?? 2)) })}
      sense={poolSense}
      renderGame={(room, me, exit) => <PoolMatch room={room} me={me} exit={exit} />}
    />
  )
}
