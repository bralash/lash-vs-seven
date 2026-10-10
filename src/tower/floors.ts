import type { OpsStyle } from '../components/OpsFace'
import type { Level } from '../match/bot'

/*
 * Ops' Tower: ten floors, each a match against a guardian (a Crew character played by that game's
 * Ops brain), with Ops herself, in her own Screen face, at the top: three games, win two, on a
 * clock. Seasons are calendar months (UTC). Season 1 (October 2026) is the line-up below; every
 * later season deals floors 2–9 out again (games and guardians shuffled; each game keeps its twist,
 * each floor keeps its level and reward), so there's a new climb each month.
 */

export type Twist =
  /** the guardian opens */
  | { kind: 'first' }
  /** seconds per move, yours; run out and a random move is played for you */
  | { kind: 'clock'; secs: number }
  /** the guardian fires its Ultimate whenever it scores (looks only) */
  | { kind: 'barrage' }
  /** Ludo: the guardian plays two colours, you one */
  | { kind: 'colours' }
  /** wins needed, counted across matches */
  | { kind: 'firstTo'; n: number }

export interface Floor {
  n: number
  /** the game's slug (its route); the boss floor plays `games` in turn */
  game: string
  games?: string[]
  gameName: string
  guardian: OpsStyle
  guardianName: string
  level: Level
  twists: Twist[]
  /** chips for the first clear each season */
  reward: number
  /** losing all your hearts above this floor drops you back here */
  checkpoint?: boolean
  /** the game's match options, as its setup screen would pick them */
  choices?: string[]
}

/** a game as a floor: its options and the twist it brings */
interface Fight {
  game: string
  gameName: string
  choices?: string[]
  twists: Twist[]
}

const FIGHTS: Record<string, Fight> = {
  tictactoe: { game: 'tictactoe', gameName: 'Tic-tac-toe', choices: ['2'], twists: [] },
  connect4: { game: 'connect4', gameName: 'Connect Four', choices: ['1'], twists: [{ kind: 'first' }] },
  hangman: { game: 'hangman', gameName: 'Hangman', choices: ['off'], twists: [{ kind: 'clock', secs: 15 }] },
  dots: { game: 'dots', gameName: 'Dots', choices: ['4'], twists: [{ kind: 'barrage' }] },
  ludo: { game: 'ludo', gameName: 'Ludo', choices: ['full', 'yellow'], twists: [{ kind: 'colours' }] },
  uno: { game: 'uno', gameName: 'Uno', twists: [{ kind: 'firstTo', n: 2 }] },
  battleship: { game: 'battleship', gameName: 'Battleship', choices: ['1'], twists: [{ kind: 'barrage' }] },
  othello: { game: 'othello', gameName: 'Othello', twists: [{ kind: 'clock', secs: 10 }] },
  checkers: { game: 'checkers', gameName: 'Checkers', twists: [{ kind: 'barrage' }] },
}

const NAMES: Partial<Record<OpsStyle, string>> = {
  bot: 'Bot', cyclops: 'Cyclops', die: 'Die', prime: 'Opstimus', warrior: 'Kratops', titan: 'Thanops', spider: 'Spidops',
  brute: 'Hulkops', ghost: 'Ghops', anansi: 'Anansops', trotro: 'Trotrops', bat: 'Batops', queen: 'Yaa Asantewops',
}
const LEVELS: Level[] = ['easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard', 'hard']
const REWARDS = [10, 20, 30, 40, 50, 60, 70, 85, 100]
const CHECKPOINTS = new Set([4, 7])

const BOSS: Floor = {
  n: 10,
  game: 'connect4',
  games: ['connect4', 'othello', 'quoridor'],
  gameName: 'Connect Four · Othello · Quoridor',
  guardian: 'screen',
  guardianName: 'Ops',
  level: 'hard',
  twists: [{ kind: 'firstTo', n: 2 }, { kind: 'clock', secs: 20 }],
  reward: 300,
  checkpoint: false,
}

const floor = (n: number, f: Fight, guardian: OpsStyle): Floor => ({
  n,
  ...f,
  guardian,
  guardianName: NAMES[guardian] ?? 'Ops',
  level: LEVELS[n - 1],
  reward: REWARDS[n - 1],
  checkpoint: CHECKPOINTS.has(n),
})

/** Season 1 (October 2026): the line-up the Tower opened with. */
const FIRST_SEASON = 681
const SEASON_ONE: [string, OpsStyle][] = [
  ['tictactoe', 'bot'],
  ['connect4', 'cyclops'],
  ['hangman', 'die'],
  ['dots', 'warrior'],
  ['ludo', 'brute'],
  ['uno', 'trotro'],
  ['battleship', 'ghost'],
  ['othello', 'bat'],
  ['checkers', 'spider'],
]

function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs]
  let s = (seed * 2654435761) >>> 0 || 1
  for (let i = out.length - 1; i > 0; i--) {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const cache = new Map<number, Floor[]>()
/** The ten floors of a season. Tic-tac-toe always opens; the rest are dealt out by the month. */
export function floorsFor(season: number): Floor[] {
  const hit = cache.get(season)
  if (hit) return hit
  let deal: [string, OpsStyle][]
  if (season <= FIRST_SEASON) deal = SEASON_ONE
  else {
    const games = shuffle(SEASON_ONE.slice(1).map(([g]) => g), season)
    const crew = shuffle(Object.keys(NAMES) as OpsStyle[], season * 7 + 3)
    deal = [['tictactoe', crew[0]], ...games.map((g, i): [string, OpsStyle] => [g, crew[i + 1]])]
  }
  const out = [...deal.map(([g, look], i) => floor(i + 1, FIGHTS[g], look)), BOSS]
  cache.set(season, out)
  return out
}

/** months since 1970 (UTC): the Tower's season */
export const seasonOf = (t = Date.now()) => {
  const d = new Date(t)
  return (d.getUTCFullYear() - 1970) * 12 + d.getUTCMonth()
}
/** "October" */
export const seasonName = (s: number) => new Date(Date.UTC(1970 + Math.floor(s / 12), s % 12, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
/** days left in this season */
export const seasonDaysLeft = (s: number, now = Date.now()) => Math.max(1, Math.ceil((Date.UTC(1970 + Math.floor((s + 1) / 12), (s + 1) % 12, 1) - now) / 864e5))

export const floorOf = (n: number, season = seasonOf()) => floorsFor(season).find((f) => f.n === n)
export const TOP = 10
export const HEARTS = 3

/** the floor you drop back to from `n` when the hearts run out */
export const checkpointBelow = (n: number) => Math.max(1, ...[...CHECKPOINTS].filter((c) => c <= n))

/** a floor's twist of this kind, if it has one */
export const twistOf = <K extends Twist['kind']>(f: Floor | undefined, kind: K) => f?.twists.find((t): t is Extract<Twist, { kind: K }> => t.kind === kind)

/** wins needed against the guardian */
export const winsNeeded = (f: Floor | undefined) => twistOf(f, 'firstTo')?.n ?? 1

/** the game to play next on a floor, given the score so far (the boss floor moves through its three) */
export const gameAt = (f: Floor, wins: [number, number]) => (f.games ? f.games[Math.min(f.games.length - 1, wins[0] + wins[1])] : f.game)

/** "Kratops’", "Bot’s" */
const possessive = (name: string) => (name.endsWith('s') ? `${name}’` : `${name}’s`)

/** the twist in a few words, for the floor card */
export function twistLine(f: Floor): string {
  return f.twists
    .map((t) => {
      switch (t.kind) {
        case 'first':
          return `${f.guardianName} moves first`
        case 'clock':
          return `${t.secs}-second clock`
        case 'barrage':
          return `${possessive(f.guardianName)} Ultimate on every score`
        case 'colours':
          return `${f.guardianName} plays 2 colours, you play 1`
        case 'firstTo':
          return f.games ? `Win ${t.n} of ${f.games.length}` : `First to ${t.n} wins`
      }
    })
    .join(' · ')
}
