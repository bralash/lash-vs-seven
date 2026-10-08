import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { ludoBrain } from './bot'
import { COLORS, type Color } from './engine'
import { COLOR_NAME } from './Board'
import { LudoMatch, initialLudoState } from './LudoMatch'

const game = gameBySlug('ludo')!

export function Ludo() {
  return (
    <Lobby
      game={game}
      option={[
        {
          label: 'Colours',
          initial: 'quick',
          choices: [
            { value: 'quick', label: '1 colour each' },
            { value: 'full', label: '2 colours each' },
          ],
        },
        {
          // player 1 takes this colour (and, with 2 colours each, the one diagonally across)
          label: 'Player 1 plays',
          initial: 'yellow',
          choices: COLORS.map((c) => ({ value: c, label: COLOR_NAME[c] })),
        },
      ]}
      bot={ludoBrain}
      initialState={(_, all) => ({ ...initialLudoState(all?.[0] === 'full' ? 'full' : 'quick', (all?.[1] as Color) ?? 'yellow') })}
      renderGame={(room, me, exit) => <LudoMatch room={room} me={me} exit={exit} />}
    />
  )
}
