import type { Seat } from '../../lobby/rooms'
import { BANKS, type Theme } from './words'

/** Pause on the finished grid before the results take over. */
export const RESULT_MS = 2600
/** The generator works on this square; the finished puzzle is cropped to the words it holds. */
const SPACE = 11
const MAX_WORDS = 18
const MIN_WORDS = 10

export type Dir = 'A' | 'D'

export interface Word {
  word: string
  clue: string
  r: number
  c: number
  dir: Dir
  num: number
}

export interface Puzzle {
  rows: number
  cols: number
  words: Word[]
}

/* ── Building a puzzle ────────────────────────────────────────────────── */

const shuffle = <T,>(a: T[], rand: () => number) => {
  const out = a.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function attempt(theme: Theme, rand: () => number): Puzzle {
  const bank = shuffle(BANKS[theme], rand)
  const grid: (string | null)[][] = Array.from({ length: SPACE }, () => Array(SPACE).fill(null))
  // which directions already run through each square, so two words never share one the same way
  const ways: string[][] = Array.from({ length: SPACE }, () => Array(SPACE).fill(''))
  const placed: Omit<Word, 'num'>[] = []
  const at = (r: number, c: number) => (r >= 0 && r < SPACE && c >= 0 && c < SPACE ? grid[r][c] : null)

  // a word fits if it stays on the grid, has empty squares at both ends, agrees with every letter it
  // crosses, and never sits alongside another word (which would spell nonsense across the gap)
  const fits = (word: string, r: number, c: number, dir: Dir) => {
    const dr = dir === 'D' ? 1 : 0
    const dc = dir === 'A' ? 1 : 0
    const endR = r + dr * (word.length - 1)
    const endC = c + dc * (word.length - 1)
    if (r < 0 || c < 0 || endR >= SPACE || endC >= SPACE) return false
    if (at(r - dr, c - dc) !== null || at(endR + dr, endC + dc) !== null) return false
    let crossings = 0
    for (let i = 0; i < word.length; i++) {
      const rr = r + dr * i
      const cc = c + dc * i
      const cur = grid[rr][cc]
      if (cur === word[i]) {
        if (ways[rr][cc].includes(dir)) return false
        crossings++
        continue
      }
      if (cur !== null) return false
      // a new square: nothing on either side across the word's direction
      if (at(rr + dc, cc + dr) !== null || at(rr - dc, cc - dr) !== null) return false
    }
    return placed.length === 0 || (crossings > 0 && crossings < word.length)
  }

  const place = (e: { word: string; clue: string }, r: number, c: number, dir: Dir) => {
    for (let i = 0; i < e.word.length; i++) {
      const rr = r + (dir === 'D' ? i : 0)
      const cc = c + (dir === 'A' ? i : 0)
      grid[rr][cc] = e.word[i]
      ways[rr][cc] += dir
    }
    placed.push({ word: e.word, clue: e.clue, r, c, dir })
  }

  const tryPlace = (e: { word: string; clue: string }) => {
    const options: { r: number; c: number; dir: Dir; score: number }[] = []
    for (const p of placed) {
      const dir: Dir = p.dir === 'A' ? 'D' : 'A'
      for (let i = 0; i < p.word.length; i++) {
        for (let j = 0; j < e.word.length; j++) {
          if (p.word[i] !== e.word[j]) continue
          const r = p.dir === 'A' ? p.r - j : p.r + i
          const c = p.dir === 'A' ? p.c + i : p.c - j
          if (!fits(e.word, r, c, dir)) continue
          // prefer the middle, so the grid grows compact rather than straggly
          const mr = r + (dir === 'D' ? e.word.length / 2 : 0) - SPACE / 2
          const mc = c + (dir === 'A' ? e.word.length / 2 : 0) - SPACE / 2
          options.push({ r, c, dir, score: -(Math.abs(mr) + Math.abs(mc)) })
        }
      }
    }
    if (!options.length) return false
    options.sort((a, b) => b.score - a.score)
    const pick = options[Math.floor(rand() * Math.min(4, options.length))]
    place(e, pick.r, pick.c, pick.dir)
    return true
  }

  const usable = bank.filter((e) => e.word.length >= 3 && e.word.length <= SPACE - 2)
  const first = usable[0]
  place(first, Math.floor(SPACE / 2), Math.floor((SPACE - first.word.length) / 2), 'A')
  for (let pass = 0; pass < 3 && placed.length < MAX_WORDS; pass++) {
    for (const e of usable) {
      if (placed.length >= MAX_WORDS) break
      if (!placed.some((p) => p.word === e.word)) tryPlace(e)
    }
  }
  return finish(placed)
}

/** Crops to the words' bounding box and numbers the starting squares in reading order. */
function finish(placed: Omit<Word, 'num'>[]): Puzzle {
  const ends = placed.map((p) => [p.r + (p.dir === 'D' ? p.word.length - 1 : 0), p.c + (p.dir === 'A' ? p.word.length - 1 : 0)])
  const top = Math.min(...placed.map((p) => p.r))
  const left = Math.min(...placed.map((p) => p.c))
  const rows = Math.max(...ends.map((e) => e[0])) - top + 1
  const cols = Math.max(...ends.map((e) => e[1])) - left + 1
  const moved = placed.map((p) => ({ ...p, r: p.r - top, c: p.c - left }))
  const starts = [...new Set(moved.map((p) => p.r * cols + p.c))].sort((a, b) => a - b)
  const words = moved
    .map((p) => ({ ...p, num: starts.indexOf(p.r * cols + p.c) + 1 }))
    .sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'A' ? -1 : 1))
  return { rows, cols, words }
}

/** A fresh puzzle from the theme's bank: the fullest of a few tries. */
export function makePuzzle(theme: Theme, rand: () => number = Math.random): Puzzle {
  let best: Puzzle | null = null
  for (let i = 0; i < 12; i++) {
    const p = attempt(theme, rand)
    if (!best || p.words.length > best.words.length) best = p
    if (best.words.length >= MIN_WORDS + 4) break
  }
  return best!
}

/* ── Reading a puzzle ─────────────────────────────────────────────────── */

/** The squares a word covers, as indexes into a rows×cols grid. */
export function squares(p: Puzzle, w: number): number[] {
  const x = p.words[w]
  return Array.from(x.word, (_, i) => (x.r + (x.dir === 'D' ? i : 0)) * p.cols + x.c + (x.dir === 'A' ? i : 0))
}

export interface Square {
  letter: string
  /** clue number printed in the corner, 0 for none */
  num: number
  /** the across and down words through this square, -1 for none */
  across: number
  down: number
}

/** Every square of the grid; null for the blacked-out ones. */
export function layout(p: Puzzle): (Square | null)[] {
  const out: (Square | null)[] = Array(p.rows * p.cols).fill(null)
  p.words.forEach((x, w) => {
    squares(p, w).forEach((i, k) => {
      const sq = out[i] ?? { letter: x.word[k], num: 0, across: -1, down: -1 }
      if (k === 0) sq.num = x.num
      if (x.dir === 'A') sq.across = w
      else sq.down = w
      out[i] = sq
    })
  })
  return out
}

/* ── Playing ──────────────────────────────────────────────────────────── */

export interface Live {
  /** one character per word: '.' open, '0' / '1' claimed by that seat */
  owners: string
  /** word indexes in the order they were claimed (a shared square keeps the first claimer's colour) */
  order?: number[]
  turn: Seat
  starter: Seat
  /** counts every answer and pass, so screens can react to each one */
  moves: number
  /** the latest answer or pass */
  last?: { seat: Seat; w: number; guess?: string; ok?: boolean }
  /** passes in a row — two back to back end the game */
  passes: number
  result?: { winner: Seat | -1; reason: 'full' | 'passed' }
}

export const count = (owners: string, seat: Seat) => owners.split('').filter((v) => v === String(seat)).length

export function freshLive(p: Puzzle, starter: Seat): Live {
  return { owners: '.'.repeat(p.words.length), turn: starter, starter, moves: 0, passes: 0 }
}

const winnerOf = (owners: string): Seat | -1 => {
  const a = count(owners, 0)
  const b = count(owners, 1)
  return a === b ? -1 : a > b ? 0 : 1
}

/**
 * Answer a word — a pure function of the position, used inside the database transaction.
 * Right claims it and keeps the turn; wrong passes the turn.
 */
export function answer(live: Live, p: Puzzle, seat: Seat, w: number, guess: string): Live | undefined {
  if (live.result || live.turn !== seat || live.owners[w] !== '.' || guess.length !== p.words[w]?.word.length) return undefined
  const ok = guess === p.words[w].word
  const next: Live = { ...live, moves: live.moves + 1, passes: 0, last: { seat, w, guess, ok } }
  if (!ok) return { ...next, turn: (1 - seat) as Seat }
  next.owners = live.owners.slice(0, w) + String(seat) + live.owners.slice(w + 1)
  next.order = [...(live.order ?? []), w]
  if (!next.owners.includes('.')) next.result = { winner: winnerOf(next.owners), reason: 'full' }
  return next
}

/** Pass the turn. If the other player passed just before, the game ends on the words claimed so far. */
export function pass(live: Live, seat: Seat): Live | undefined {
  if (live.result || live.turn !== seat) return undefined
  const { last: _drop, ...rest } = live
  const next: Live = { ...rest, turn: (1 - seat) as Seat, moves: live.moves + 1, passes: live.passes + 1, last: { seat, w: -1 } }
  if (next.passes >= 2) next.result = { winner: winnerOf(live.owners), reason: 'passed' }
  return next
}

/** Who coloured each square: the first claimer of a word through it ('.' none yet, '#' blacked out). */
export function colours(p: Puzzle, live: Live): string {
  const out: string[] = layout(p).map((sq) => (sq ? '.' : '#'))
  for (const w of live.order ?? []) for (const i of squares(p, w)) if (out[i] === '.') out[i] = live.owners[w]
  return out.join('')
}
