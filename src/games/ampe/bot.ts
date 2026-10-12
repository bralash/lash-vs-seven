import { squash, type Brain, type OpsSense } from '../../match/bot'
import type { AmpeLive } from './engine'

/*
 * Ops plays Ampe inside the match screen (her foot is picked on the kick, from your habits), so
 * the turn-by-turn brain has nothing to do.
 */
export const ampeBrain: Brain = () => null

const live = (s: Record<string, unknown>) => (s as { live?: AmpeLive }).live

/** How Ops reads a match, for her reactions: who's ahead, exchanges won and lost, the end. */
export const ampeSense: OpsSense = {
  key: (s) => {
    const l = live(s)
    return l ? `${(s as { match?: number }).match}:${l.n}:${l.points.join('-')}` : ''
  },
  // both pick at once: nobody waits on anybody
  turn: () => null,
  standing: (s) => {
    const l = live(s)
    if (!l || l.result) return null
    return squash(l.points[1] - l.points[0], 4)
  },
  ended: (s) => {
    const l = live(s)
    return l?.result ? { winner: l.result.winner, final: true } : null
  },
  moment: (prev, next) => {
    const a = live(prev)
    const b = live(next)
    if (!a || !b) return null
    if (b.points[1] > a.points[1]) return b.leader === 1 && a.leader === 0 ? { moment: 'took', said: 'My lead' } : 'took'
    if (b.points[0] > a.points[0]) return 'lost'
    return null
  },
}
