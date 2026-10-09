import { squash, type OpsSense } from '../../match/bot'
import type { PoolState } from './PoolMatch'
import { left, type Live } from './rules'

const live = (s: Record<string, unknown>) => (s as unknown as PoolState).live as Live | undefined

/**
 * How a pool match reads, for ultimates (and Ops' reactions once she plays): who's ahead in the
 * frame (fewer of your balls left is better, frames won count most), and frames ending.
 */
export const poolSense: OpsSense = {
  key: (s) => {
    const l = live(s)
    return l ? `${(s as unknown as PoolState).match}:${l.frame}:${l.shot?.n ?? 0}` : ''
  },
  turn: (s) => {
    const l = live(s)
    return l && !l.result ? l.turn : null
  },
  standing: (s) => {
    const l = live(s)
    if (!l || l.result) return null
    const g = l.groups
    const balls = g ? left(l.pos, g[0]) - left(l.pos, g[1]) : 0
    return squash(balls + (l.scores.s1 - l.scores.s0) * 4, 5)
  },
  ended: (s) => {
    const l = live(s)
    if (!l?.result) return null
    const st = s as unknown as PoolState
    const w = l.result.winner
    return { winner: w, final: l.scores[`s${w}`] >= st.target }
  },
}
