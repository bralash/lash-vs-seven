import { pick, squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import { movesOf, options, replay, type Dot, type DotLive } from './engine'

/*
 * Ops plays her own copy of the board inside the match screen, at a person's pace, so the
 * turn-by-turn brain has nothing to do.
 */
export const dotrushBrain: Brain = () => null

/** how long she looks before each line (ms): [least, most] */
export const OPS_THINK: Record<Level, [number, number]> = {
  easy: [3000, 5200],
  medium: [2500, 4200],
  hard: [2000, 3400],
}

/**
 * Her next line. Hard takes the most dots she can see (loops and bombs included); Medium one of her
 * five best; Easy mostly a short line, now and then a good one.
 */
export function opsLine(dots: Dot[], level: Level): number[] {
  const all = options(dots).sort((a, b) => b.take - a.take || a.path.length - b.path.length)
  if (!all.length) return []
  if (level === 'hard') return all[0].path
  if (level === 'medium') return pick(all.slice(0, 5)).path
  if (Math.random() < 0.2) return pick(all.slice(0, 3)).path
  const short = all.filter((o) => o.take <= 4)
  return pick(short.length ? short : all).path
}

const live = (s: Record<string, unknown>) => (s as { live?: DotLive }).live

/** How Ops reads a match, for her reactions. */
export const dotrushSense: OpsSense = {
  key: (s) => {
    const l = live(s)
    return l ? `${(s as { match?: number }).match}:${movesOf(l, 0).length}:${movesOf(l, 1).length}:${l.result ? 'r' : ''}` : ''
  },
  // both play at once: nobody waits on anybody
  turn: () => null,
  standing: (s) => {
    const l = live(s)
    if (!l || l.result || !l.start) return null
    const [a, b] = [replay(l.seed, movesOf(l, 0)), replay(l.seed, movesOf(l, 1))]
    return squash(b.score - a.score, 20)
  },
  ended: (s) => {
    const l = live(s)
    return l?.result ? { winner: l.result.winner, final: true } : null
  },
}
