import { squash, type Brain, type OpsSense } from '../../match/bot'
import type { RingLive } from './engine'

/*
 * Ops runs her ring inside the match screen (her taps are worked out when each game starts), so
 * the turn-by-turn brain has nothing to do.
 */
export const ringBrain: Brain = () => null

const live = (s: Record<string, unknown>) => (s as { live?: RingLive }).live

/** How Ops reads a match, for her reactions: games won and lost, and the end of each game. */
export const ringSense: OpsSense = {
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
  // every game won charges an Ultimate (and gets a word from her), so each one is its own ending
  ended: (s) => {
    const l = live(s)
    if (l?.result) return { winner: l.result.winner, final: true, tag: `g${l.last?.g ?? l.g}` }
    if (l?.last && l.last.winner !== -1) return { winner: l.last.winner, final: false, tag: `g${l.last.g}` }
    return null
  },
}
