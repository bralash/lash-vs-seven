import { PokeOps } from '../components/PokeOps'
import { VsBlock } from '../components/VsBlock'
import { BOT_SEAT } from './bot'
import { useVsOps } from './session'

/**
 * The character at the top of a Results screen: the VS block stamped in the winner's colour (none on
 * a draw), or, against Ops, her face winning, losing or shrugging (poke her).
 */
export function ResultMark({ winner }: { winner: 0 | 1 | -1 }) {
  const vsOps = useVsOps()
  if (vsOps) return <PokeOps rest={winner === -1 ? 'draw' : winner === BOT_SEAT ? 'win' : 'lose'} size={72} />
  return winner === -1 ? null : <VsBlock mood="win" side={winner} eyes size={64} />
}
