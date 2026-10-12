import { squash, type Brain, type OpsSense } from '../../match/bot'
import { scored, tally, type ShootoutLive } from './engine'

/*
 * Ops plays Shootout inside the match screen (her shot when she lets go, her dive at the strike,
 * from your habits), so the turn-by-turn brain has nothing to do.
 */
export const shootoutBrain: Brain = () => null

const live = (s: Record<string, unknown>) => (s as { live?: ShootoutLive }).live

/** How Ops reads a shootout, for her reactions: who's ahead, each kick, the end. */
export const shootoutSense: OpsSense = {
  key: (s) => {
    const l = live(s)
    return l ? `${(s as { match?: number }).match}:${l.n}` : ''
  },
  // both pick at once: nobody waits on anybody
  turn: () => null,
  standing: (s) => {
    const l = live(s)
    if (!l || l.result) return null
    const { goals } = tally(l.log ?? [], l.first)
    return squash(goals[1] - goals[0], 3)
  },
  ended: (s) => {
    const l = live(s)
    return l?.result ? { winner: l.result.winner, final: true } : null
  },
  moment: (prev, next) => {
    const a = live(prev)
    const k = live(next)?.last
    if (!a || !k || a.last?.n === k.n) return null
    const goal = scored(k.outcome)
    if (k.shooter === 1) return goal ? 'took' : 'lost'
    if (goal) return 'lost'
    return k.outcome === 'saved' || k.outcome === 'tips' ? { moment: 'took', said: 'Saved!' } : 'took'
  },
}
