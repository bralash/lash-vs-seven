import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import { HOLES_PER_MATCH, cardOf, parOf, type Live } from './rules'

export const GOLF_FEATS: FeatDef[] = [
  { id: 'golf:ace', game: 'golf', name: 'Ace', blurb: 'A hole in one.' },
  { id: 'golf:clean', game: 'golf', name: 'Clean card', blurb: 'Par or better on all five holes.' },
]

/** The feats each seat earned in a finished match. */
export function golfFeats(live: Live): [string[], string[]] {
  return ([0, 1] as Seat[]).map((s) => {
    const c = cardOf(live, s)
    const out: string[] = []
    if (c.includes(1)) out.push('golf:ace')
    if (c.length >= HOLES_PER_MATCH && c.slice(0, HOLES_PER_MATCH).every((n, at) => n <= parOf(live, at))) out.push('golf:clean')
    return out
  }) as [string[], string[]]
}
