import { squash, type Brain, type OpsSense } from '../../match/bot'
import type { Live } from './engine'
import type { PPState } from './PingPongMatch'

/*
 * Ops plays table tennis live, inside the match screen (her racket follows the ball and engine's
 * opsReturn decides each return), so there's nothing for the turn-by-turn brain to do: it never moves.
 */
export const ppBrain: Brain = () => null

const live = (s: Record<string, unknown>) => (s as unknown as PPState).live as Live | undefined

/** How Ops reads a match, for her reactions: who's ahead in the game, points won and lost, games ending. */
export const ppSense: OpsSense = {
  key: (s) => {
    const l = live(s)
    return l ? `${(s as unknown as PPState).match}:${l.game}:${l.points.join('-')}` : ''
  },
  // nobody waits on a turn in a rally
  turn: () => null,
  standing: (s) => {
    const l = live(s)
    if (!l || l.result) return null
    return squash(l.points[1] - l.points[0] + (l.games[1] - l.games[0]) * 4, 5)
  },
  ended: (s) => {
    const l = live(s)
    return l?.result ? { winner: l.result.winner, final: l.result.final } : null
  },
  moment: (prev, next) => {
    const a = live(prev)
    const b = live(next)
    if (!a || !b || a.game !== b.game) return null
    if (b.points[1] > a.points[1]) return b.last?.why === 'winner' ? { moment: 'took', said: 'Too good' } : 'took'
    if (b.points[0] > a.points[0]) return b.last?.why === 'winner' ? { moment: 'lost', said: 'Missed it' } : 'lost'
    return null
  },
}
