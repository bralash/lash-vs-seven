import type { OpsStyle } from '../components/OpsFace'
import type { Level } from '../match/bot'

/*
 * Ops' Tower: ten floors, each a match against a guardian (a Crew character played by that game's
 * Ops brain), with Ops herself, in her own Screen face, at the top. Season 1's floors; seasons turn
 * over monthly (the climb resets, each floor pays again).
 *
 * Step 3 of docs/tower-and-missions-plan.md builds floors 1–6; the clock and barrage twists and
 * floors 7–10 come in step 4 (until then floors 3 and 4 play without their twist).
 */

export interface Floor {
  n: number
  /** the game's slug (its route) */
  game: string
  gameName: string
  guardian: OpsStyle
  guardianName: string
  level: Level
  /** the twist, in a few words ('' for none) */
  twist: string
  /** chips for the first clear each season */
  reward: number
  /** losing all your hearts above this floor drops you back here */
  checkpoint?: boolean
  /** the game's match options, as its setup screen would pick them */
  choices?: string[]
  /** wins needed against the guardian, counted across matches (default 1) */
  firstTo?: number
  /** the guardian opens */
  oppFirst?: boolean
  /** Ludo: the guardian plays two colours, you one */
  twoColours?: boolean
  /** built yet (floors 7–10 open in step 4) */
  open: boolean
}

export const FLOORS: Floor[] = [
  { n: 1, game: 'tictactoe', gameName: 'Tic-tac-toe', guardian: 'bot', guardianName: 'Bot', level: 'easy', twist: '', reward: 10, choices: ['2'], open: true },
  { n: 2, game: 'connect4', gameName: 'Connect Four', guardian: 'cyclops', guardianName: 'Cyclops', level: 'medium', twist: 'She moves first', reward: 20, choices: ['1'], oppFirst: true, open: true },
  { n: 3, game: 'hangman', gameName: 'Hangman', guardian: 'die', guardianName: 'Die', level: 'medium', twist: '', reward: 30, choices: ['off'], open: true },
  { n: 4, game: 'dots', gameName: 'Dots', guardian: 'warrior', guardianName: 'Kratops', level: 'medium', twist: '', reward: 40, checkpoint: true, choices: ['4'], open: true },
  { n: 5, game: 'ludo', gameName: 'Ludo', guardian: 'brute', guardianName: 'Hulkops', level: 'medium', twist: 'He plays 2 colours, you play 1', reward: 50, choices: ['full', 'yellow'], twoColours: true, open: true },
  { n: 6, game: 'uno', gameName: 'Uno', guardian: 'trotro', guardianName: 'Trotrops', level: 'hard', twist: 'First to 2 wins', reward: 60, firstTo: 2, open: true },
  { n: 7, game: 'battleship', gameName: 'Battleship', guardian: 'ghost', guardianName: 'Ghops', level: 'hard', twist: 'Flashbang', reward: 70, checkpoint: true, open: false },
  { n: 8, game: 'othello', gameName: 'Othello', guardian: 'bat', guardianName: 'Batops', level: 'hard', twist: '10-second clock', reward: 85, open: false },
  { n: 9, game: 'checkers', gameName: 'Checkers', guardian: 'spider', guardianName: 'Spidops', level: 'hard', twist: 'Web over the board', reward: 100, open: false },
  { n: 10, game: 'connect4', gameName: 'Connect Four · Othello · Quoridor', guardian: 'screen', guardianName: 'Ops', level: 'hard', twist: 'Win 2 of 3 on a 20-second clock', reward: 300, open: false },
]

export const floorOf = (n: number) => FLOORS.find((f) => f.n === n)
export const TOP = FLOORS.length
export const HEARTS = 3

/** the floor you drop back to from `n` when the hearts run out */
export const checkpointBelow = (n: number) => Math.max(1, ...FLOORS.filter((f) => f.checkpoint && f.n <= n).map((f) => f.n))

/** months since 1970 (UTC): the Tower's season */
export const seasonOf = (t = Date.now()) => {
  const d = new Date(t)
  return (d.getUTCFullYear() - 1970) * 12 + d.getUTCMonth()
}
/** "October" */
export const seasonName = (s: number) => new Date(Date.UTC(1970 + Math.floor(s / 12), s % 12, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
/** days left in this season */
export const seasonDaysLeft = (s: number, now = Date.now()) => Math.max(1, Math.ceil((Date.UTC(1970 + Math.floor((s + 1) / 12), (s + 1) % 12, 1) - now) / 864e5))
