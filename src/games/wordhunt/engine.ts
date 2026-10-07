import { inDictionary } from '../../lib/dictionary'
import { WORDS } from './words'

export const SIZE = 4
export const CELLS = SIZE * SIZE
export const ROUND_MS = 80_000
export const COUNTDOWN_MS = 3_000
export const MIN_LEN = 3
export const MAX_LEN = 8

const WORD_SET = new Set(WORDS)
const PREFIX_SET = new Set<string>()
for (const w of WORDS) for (let i = 1; i <= w.length; i++) PREFIX_SET.add(w.slice(0, i))

/** Common words: used to build grids and the "nobody found" list, so those stay recognisable. */
const isCommon = (w: string) => WORD_SET.has(w)
const isPrefix = (p: string) => PREFIX_SET.has(p)
/** Accepted answers: any common word, or anything in the full dictionary once it has loaded. */
export const isWord = (w: string) => isCommon(w) || inDictionary(w)

const SCORE_TABLE = [0, 0, 0, 100, 400, 800, 1400, 1800]
export function score(word: string) {
  if (word.length < MIN_LEN) return 0
  return SCORE_TABLE[word.length] ?? 2200
}
export const totalScore = (words: readonly string[]) => words.reduce((s, w) => s + score(w), 0)

// Letter frequencies weighted toward common English letters (from the original game).
const LETTER_POOL = (
  'EEEEEEEEEEEEETTTTTTTTAAAAAAAAAAOOOOOOOOIIIIIIINNNNNNN' +
  'SSSSSSSRRRRRRRHHHHHHDDDDDDLLLLCCCUUUMMMWWWWBBFFGGYYP'
).split('')

export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE

export function neighbours(i: number): number[] {
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const r = rowOf(i) + dr
      const c = colOf(i) + dc
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) out.push(r * SIZE + c)
    }
  return out
}

export const isAdjacent = (a: number, b: number) =>
  a !== b && Math.abs(rowOf(a) - rowOf(b)) <= 1 && Math.abs(colOf(a) - colOf(b)) <= 1

/** Every common word that can be traced on the grid (drives grid quality and the "nobody found" list). */
export function solve(grid: readonly string[]): Set<string> {
  const found = new Set<string>()
  const visited = new Array<boolean>(CELLS).fill(false)
  const dfs = (i: number, word: string) => {
    if (!isPrefix(word)) return
    if (word.length >= MIN_LEN && isCommon(word)) found.add(word)
    if (word.length >= MAX_LEN) return
    for (const n of neighbours(i)) {
      if (visited[n]) continue
      visited[n] = true
      dfs(n, word + grid[n])
      visited[n] = false
    }
  }
  for (let i = 0; i < CELLS; i++) {
    visited[i] = true
    dfs(i, grid[i])
    visited[i] = false
  }
  return found
}

/** Random grid with at least `minWords` findable words. */
export function generateGrid(minWords = 12): string[] {
  let best: string[] = []
  let bestCount = -1
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = Array.from({ length: CELLS }, () => LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)])
    const count = solve(grid).size
    if (count >= minWords) return grid
    if (count > bestCount) {
      best = grid
      bestCount = count
    }
  }
  return best
}

/** A tile path that spells `word` on the grid (used to light up the best word on the share card). */
export function pathOf(grid: readonly string[], word: string): number[] | null {
  const used = new Array<boolean>(CELLS).fill(false)
  const path: number[] = []
  const dfs = (i: number, k: number): boolean => {
    if (grid[i] !== word[k]) return false
    used[i] = true
    path.push(i)
    if (k === word.length - 1) return true
    for (const n of neighbours(i)) if (!used[n] && dfs(n, k + 1)) return true
    used[i] = false
    path.pop()
    return false
  }
  for (let i = 0; i < CELLS; i++) if (dfs(i, 0)) return path
  return null
}
