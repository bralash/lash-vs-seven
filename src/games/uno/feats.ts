import type { FeatDef } from '../../match/feats'
import { countOf, type Live } from './engine'

/**
 * Going out within this many of your own turns for Fast hands. Seven cards take at least seven turns
 * to play, so the 6 first asked for can't happen: 8 leaves room for one draw (or a stray card).
 */
const FAST = 8
/** cards someone else has to be holding when you go out, for Escape */
const BIG = 10

export const UNO_FEATS: FeatDef[] = [
  { id: 'uno:fast', game: 'uno', name: 'Fast hands', blurb: `Went out within ${FAST} of your own turns.` },
  { id: 'uno:escape', game: 'uno', name: 'Escape', blurb: `Went out while another player held ${BIG} cards or more.` },
]

/**
 * The feats each seat (0–3) earned in a finished match (one round). Only public counts: turns taken
 * (`tc`, kept by the engine) and how many cards each player holds — never what's in a hand.
 */
export function unoFeats(g: Live): string[][] {
  const out: string[][] = [[], [], [], []]
  const w = g.winner
  if (g.phase !== 'done' || w === undefined || w < 0 || !out[w]) return out
  const turns = g.tc?.[w]
  if (turns !== undefined && turns <= FAST) out[w].push('uno:fast')
  if (g.seats.some((s) => s !== w && countOf(g, s) >= BIG)) out[w].push('uno:escape')
  return out
}
