import type { FeatDef } from '../../match/feats'
import { totalScore } from './engine'

/** A word this long or longer for Long one. */
const LONG = 7

export const WORDHUNT_FEATS: FeatDef[] = [
  { id: 'wordhunt:long', game: 'wordhunt', name: 'Long one', blurb: `Found a word of ${LONG} or more letters.` },
  { id: 'wordhunt:landslide', game: 'wordhunt', name: 'Landslide', blurb: 'Won with at least twice the next-best score.' },
]

/**
 * The feats each seat earned in a finished round. `words` is each seat's word list (empty for an
 * empty seat); `finished` the seats still in at the end, who are the only ones who can win.
 */
export function wordhuntFeats(words: string[][], finished: number[]): string[][] {
  const out = words.map(() => new Set<string>())
  words.forEach((list, s) => {
    if (list.some((w) => w.length >= LONG)) out[s].add('wordhunt:long')
  })
  const scores = words.map(totalScore)
  const ranked = [...finished].sort((a, b) => scores[b] - scores[a])
  const [top, next] = ranked
  if (top !== undefined && next !== undefined && scores[top] > 0 && scores[top] >= 2 * scores[next]) out[top].add('wordhunt:landslide')
  return out.map((s) => [...s])
}
