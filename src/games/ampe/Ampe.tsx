import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { AmpeMatch, initialAmpeState } from './AmpeMatch'
import { ampeBrain, ampeSense } from './bot'

const game = gameBySlug('ampe')!

export function Ampe() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'First to',
        initial: '10',
        choices: [
          { value: '5', label: '5 points' },
          { value: '10', label: '10 points' },
          { value: '15', label: '15 points' },
        ],
      }}
      initialState={(choice) => ({ ...initialAmpeState(Number(choice ?? 10)) })}
      bot={ampeBrain}
      sense={ampeSense}
      renderGame={(room, me, exit) => <AmpeMatch room={room} me={me} exit={exit} />}
    />
  )
}
