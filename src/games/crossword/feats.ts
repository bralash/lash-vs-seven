import type { Seat } from '../../lobby/rooms'
import type { FeatDef } from '../../match/feats'
import { count, type Live, type Puzzle } from './engine'

/** The loser placed fewer answers than this for Clean sheet. */
const CLEAN = 3

export const CROSSWORD_FEATS: FeatDef[] = [
  { id: 'crossword:bigword', game: 'crossword', name: 'Big word', blurb: 'Placed the longest answer in the puzzle.' },
  { id: 'crossword:clean', game: 'crossword', name: 'Clean sheet', blurb: `Won with the other side placing fewer than ${CLEAN} answers.` },
]

/** The feats each seat earned in a finished match (one puzzle). */
export function crosswordFeats(puzzle: Puzzle, live: Live): [string[], string[]] {
  const out: [Set<string>, Set<string>] = [new Set(), new Set()]
  const add = (s: Seat, id: string) => out[s].add(`crossword:${id}`)
  // ties for the longest: any of them counts
  const longest = Math.max(...puzzle.words.map((x) => x.word.length))
  puzzle.words.forEach((x, w) => {
    const o = live.owners[w]
    if (x.word.length === longest && (o === '0' || o === '1')) add(Number(o) as Seat, 'bigword')
  })
  const win = live.result?.winner
  if (win !== undefined && win !== -1 && count(live.owners, (1 - win) as Seat) < CLEAN) add(win, 'clean')
  return [[...out[0]], [...out[1]]]
}
