import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { dotsBrain } from './bot'
import { DotsMatch, initialDotsState, sizeLabel } from './DotsMatch'
import { SIZES } from './engine'

const game = gameBySlug('dots')!

export function DotsAndBoxes() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Board',
        initial: '5',
        // value = boxes per side
        choices: SIZES.map((n) => ({ value: String(n), label: sizeLabel(n) })),
      }}
      initialState={(choice) => ({ ...initialDotsState(Number(choice ?? 5)) })}
      bot={dotsBrain}
      renderGame={(room, me, exit) => <DotsMatch room={room} me={me} exit={exit} />}
    />
  )
}
