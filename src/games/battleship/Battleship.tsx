import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { BattleshipMatch, initialBattleshipState } from './BattleshipMatch'

const game = gameBySlug('battleship')!

export function Battleship() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Match',
        initial: '1',
        choices: [
          { value: '1', label: 'One battle' },
          { value: '3', label: 'Best of 3' },
        ],
      }}
      initialState={(choice) => ({ ...initialBattleshipState(choice === '3' ? 3 : 1) })}
      renderGame={(room, me, exit) => <BattleshipMatch room={room} me={me} exit={exit} />}
    />
  )
}
