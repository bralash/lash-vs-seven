import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { memoryBrain, memorySense } from './bot'
import type { Size } from './engine'
import { MemoryMatch, initialMemoryState } from './MemoryMatch'

const game = gameBySlug('memory')!

export function Memory() {
  return (
    <Lobby
      game={game}
      option={{
        label: 'Board',
        initial: '4',
        choices: [
          { value: '4', label: '4×4 · 8 pairs' },
          { value: '6', label: '6×6 · 18 pairs' },
        ],
      }}
      bot={memoryBrain}
      sense={memorySense}
      initialState={(choice) => ({ ...initialMemoryState(Number(choice ?? 4) as Size) })}
      renderGame={(room, me, exit) => <MemoryMatch room={room} me={me} exit={exit} />}
    />
  )
}
