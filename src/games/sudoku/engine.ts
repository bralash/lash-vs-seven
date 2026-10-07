/**
 * Sudoku. Grids are 81-char strings, row by row: '1'–'9', or '.' for empty.
 * Puzzles are generated on the host's device at start, always with exactly one solution.
 */

export type Difficulty = 'easy' | 'medium' | 'hard'
/** Clues left in the puzzle (same as the legacy game). */
export const CLUES: Record<Difficulty, number> = { easy: 36, medium: 30, hard: 24 }
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
export const COUNTDOWN_MS = 3_000
/** Pause on the finished board before the results take over. */
export const RESULT_MS = 1800

export const rowOf = (i: number) => Math.floor(i / 9)
export const colOf = (i: number) => i % 9
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)

/** Every cell that shares a row, column or box with i (not i itself). */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const out: number[] = []
  for (let k = 0; k < 81; k++) if (k !== i && (rowOf(k) === rowOf(i) || colOf(k) === colOf(i) || boxOf(k) === boxOf(i))) out.push(k)
  return out
})

const ALL = 0b1111111110 // bits 1–9

/**
 * Backtracking over bitmasks, always branching on the cell with the fewest candidates — fast
 * enough to count solutions hundreds of times while carving out a hard puzzle.
 * Calls onSolution for each solution found and stops once it returns false.
 */
function search(cells: number[], onSolution: (cells: number[]) => boolean, order: (n: number[]) => number[] = (n) => n): boolean {
  const rows = new Array(9).fill(0)
  const cols = new Array(9).fill(0)
  const boxes = new Array(9).fill(0)
  for (let i = 0; i < 81; i++) {
    const v = cells[i]
    if (!v) continue
    const bit = 1 << v
    if (rows[rowOf(i)] & bit || cols[colOf(i)] & bit || boxes[boxOf(i)] & bit) return true // contradiction: no solutions
    rows[rowOf(i)] |= bit
    cols[colOf(i)] |= bit
    boxes[boxOf(i)] |= bit
  }
  const step = (): boolean => {
    let best = -1
    let bestMask = 0
    let bestCount = 10
    for (let i = 0; i < 81; i++) {
      if (cells[i]) continue
      const mask = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)])
      let n = 0
      for (let m = mask; m; m &= m - 1) n++
      if (n < bestCount) {
        best = i
        bestMask = mask
        bestCount = n
        if (n <= 1) break
      }
    }
    if (best < 0) return onSolution(cells)
    if (bestCount === 0) return true
    const digits: number[] = []
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d)
    const r = rowOf(best)
    const c = colOf(best)
    const b = boxOf(best)
    for (const d of order(digits)) {
      const bit = 1 << d
      cells[best] = d
      rows[r] |= bit
      cols[c] |= bit
      boxes[b] |= bit
      const go = step()
      cells[best] = 0
      rows[r] &= ~bit
      cols[c] &= ~bit
      boxes[b] &= ~bit
      if (!go) return false
    }
    return true
  }
  return step()
}

const toCells = (grid: string) => grid.split('').map((ch) => (ch === '.' ? 0 : Number(ch)))
const toGrid = (cells: number[]) => cells.map((v) => (v ? String(v) : '.')).join('')

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** How many solutions a grid has, counting no further than `limit`. */
export function countSolutions(grid: string, limit = 2): number {
  let n = 0
  search(toCells(grid), () => ++n < limit)
  return n
}

export function solve(grid: string): string | null {
  let out: string | null = null
  search(toCells(grid), (cells) => {
    out = toGrid(cells)
    return false
  })
  return out
}

/**
 * A fresh puzzle and its solution. Some grids can't be carved down to the target without losing
 * uniqueness, so a few attempts are made and the one with the fewest clues is kept (each takes ~ms).
 */
export function generate(difficulty: Difficulty, rand: () => number = Math.random): { puzzle: string; solution: string } {
  let best = carve(difficulty, rand)
  for (let k = 0; k < 8 && clueCount(best.puzzle) > CLUES[difficulty]; k++) {
    const next = carve(difficulty, rand)
    if (clueCount(next.puzzle) < clueCount(best.puzzle)) best = next
  }
  return best
}

const clueCount = (grid: string) => grid.replace(/\./g, '').length

/** One attempt: removes clues one at a time, keeping only removals that leave a single solution. */
function carve(difficulty: Difficulty, rand: () => number): { puzzle: string; solution: string } {
  let solution = ''
  search(new Array(81).fill(0), (cells) => {
    solution = toGrid(cells)
    return false
  }, (digits) => shuffled(digits, rand))

  const cells = toCells(solution)
  let filled = 81
  for (const i of shuffled([...Array(81).keys()], rand)) {
    if (filled <= CLUES[difficulty]) break
    const keep = cells[i]
    cells[i] = 0
    if (countSolutions(toGrid(cells)) === 1) filled--
    else cells[i] = keep
  }
  return { puzzle: toGrid(cells), solution }
}

/** Cells whose digit repeats in their row, column or box. */
export function conflicts(grid: string): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < 81; i++) {
    if (grid[i] === '.') continue
    for (const p of PEERS[i]) if (grid[p] === grid[i]) out.add(i)
  }
  return out
}

/** Full and clash-free — with a unique-solution puzzle, that can only be the solution. */
export const isSolved = (grid: string) => !grid.includes('.') && conflicts(grid).size === 0

/** "4:07" / "1:02:33" from milliseconds. */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
