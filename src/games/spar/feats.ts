import type { FeatDef } from '../../match/feats'
import { rankOf, type Live } from './engine'

export const SPAR_FEATS: FeatDef[] = [
  { id: 'spar:sweep', game: 'spar', name: 'Clean sweep', blurb: 'Took every trick in a round.' },
  { id: 'spar:sixshot', game: 'spar', name: 'Six shot', blurb: 'Won the last trick of a round with a 6.' },
]

/**
 * The feats each seat (0–3) earned in a finished match, from the rounds kept in `past` — only the
 * cards played, never a hand. A forfeited round counts for neither.
 */
export function sparFeats(live: Live): string[][] {
  const out: Set<string>[] = [0, 1, 2, 3].map(() => new Set())
  for (const p of live.past ?? []) {
    if (p.forfeit || !out[p.winner]) continue
    if (p.sweep) out[p.winner].add('spar:sweep')
    // the last of the scoring cards is the one that took the last trick
    const last = p.cards?.at(-1)
    if (last !== undefined && rankOf(last) === 0) out[p.winner].add('spar:sixshot')
  }
  return out.map((s) => [...s])
}
