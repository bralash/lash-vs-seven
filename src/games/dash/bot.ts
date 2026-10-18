import { squash, type Brain, type OpsSense } from '../../match/bot'
import type { DashLive } from './engine'

/*
 * Ops runs her race inside the match screen (her taps are worked out when each race starts), so
 * the turn-by-turn brain has nothing to do.
 */
export const dashBrain: Brain = () => null

const live = (s: Record<string, unknown>) => (s as { live?: DashLive }).live

/** How Ops reads a match, for her reactions: races won and lost, and the end of each race. */
export const dashSense: OpsSense = {
  key: (s) => {
    const l = live(s)
    return l ? `${(s as { match?: number }).match}:${l.g}:${l.wins.join('-')}` : ''
  },
  // both run at once: nobody waits on anybody
  turn: () => null,
  standing: (s) => {
    const l = live(s)
    if (!l || l.result) return null
    return squash(l.wins[1] - l.wins[0], 1.2)
  },
  // every race won charges an Ultimate, so each one is its own ending
  ended: (s) => {
    const l = live(s)
    if (l?.result) return { winner: l.result.winner, final: true, tag: `g${l.last?.g ?? l.g}` }
    if (l?.last && l.last.winner !== -1) return { winner: l.last.winner, final: false, tag: `g${l.last.g}` }
    return null
  },
}
