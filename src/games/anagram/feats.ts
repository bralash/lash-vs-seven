import type { FeatDef } from '../../match/feats'
import { ROUNDS, type RoundTimes } from './engine'

export const ANAGRAM_FEATS: FeatDef[] = [
  { id: 'anagram:fullhouse', game: 'anagram', name: 'Full house', blurb: `Won all ${ROUNDS} rounds of a match.` },
  { id: 'anagram:comeback', game: 'anagram', name: 'Comeback', blurb: 'Lost the first round and still won the match.' },
]

/**
 * The feats each seat earned in a finished match. `players` is by seat (null for an empty seat),
 * `winner` the winning seat or -1 on a draw. Losing a round means someone else solved it first.
 */
export function anagramFeats(rounds: RoundTimes[], players: ({ id: string } | null)[], winner: number): string[][] {
  const out = players.map(() => [] as string[])
  const p = winner >= 0 ? players[winner] : null
  if (!p) return out
  if (rounds.every((x) => x.solve?.by === p.id)) out[winner].push('anagram:fullhouse')
  const first = rounds[0]?.solve
  if (first && first.by !== p.id) out[winner].push('anagram:comeback')
  return out
}
