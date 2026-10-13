import { ANAGRAM_FEATS } from '../games/anagram/feats'
import { BATTLESHIP_FEATS } from '../games/battleship/feats'
import { BATTLEWORD_FEATS } from '../games/battleword/feats'
import { CHECKERS_FEATS } from '../games/checkers/feats'
import { CONNECT4_FEATS } from '../games/connect4/feats'
import { CROSSWORD_FEATS } from '../games/crossword/feats'
import { DOTS_FEATS } from '../games/dots/feats'
import { HANGMAN_FEATS } from '../games/hangman/feats'
import { LUDO_FEATS } from '../games/ludo/feats'
import { MEMORY_FEATS } from '../games/memory/feats'
import { OTHELLO_FEATS } from '../games/othello/feats'
import { OWARE_FEATS } from '../games/oware/feats'
import { PINGPONG_FEATS } from '../games/pingpong/feats'
import { PONG_FEATS } from '../games/pong/feats'
import { AMPE_FEATS } from '../games/ampe/feats'
import { POOL_FEATS } from '../games/pool/feats'
import { QUORIDOR_FEATS } from '../games/quoridor/feats'
import { SHOOTOUT_FEATS } from '../games/shootout/feats'
import { RING_FEATS } from '../games/ring/feats'
import { SPAR_FEATS } from '../games/spar/feats'
import { SUDOKU_FEATS } from '../games/sudoku/feats'
import { TICTACTOE_FEATS } from '../games/tictactoe/feats'
import { UNO_FEATS } from '../games/uno/feats'
import { WORDHUNT_FEATS } from '../games/wordhunt/feats'

/**
 * Feats: moments worth bragging about, kept per rival ("Untouched against Seven") alongside the
 * head-to-head record. Each game defines its own and reports who earned which when a match ends.
 */

export interface FeatDef {
  /** "<game>:<feat>" */
  id: string
  game: string
  name: string
  /** what it takes, in one line */
  blurb: string
}

const ALL: FeatDef[] = [
  ...AMPE_FEATS,
  ...ANAGRAM_FEATS,
  ...BATTLESHIP_FEATS,
  ...BATTLEWORD_FEATS,
  ...CHECKERS_FEATS,
  ...CONNECT4_FEATS,
  ...CROSSWORD_FEATS,
  ...DOTS_FEATS,
  ...HANGMAN_FEATS,
  ...LUDO_FEATS,
  ...MEMORY_FEATS,
  ...OTHELLO_FEATS,
  ...OWARE_FEATS,
  ...PINGPONG_FEATS,
  ...PONG_FEATS,
  ...POOL_FEATS,
  ...QUORIDOR_FEATS,
  ...SHOOTOUT_FEATS,
  ...RING_FEATS,
  ...SPAR_FEATS,
  ...SUDOKU_FEATS,
  ...TICTACTOE_FEATS,
  ...UNO_FEATS,
  ...WORDHUNT_FEATS,
]
const BY_ID = new Map(ALL.map((f) => [f.id, f]))

export const featById = (id: string) => BY_ID.get(id)

/** A game's feats in their defined order (for listing them in its rules). */
export const featsOfGame = (game: string) => ALL.filter((f) => f.game === game)

/** "1st", "2nd", "3rd", "11th"… */
export function ordinal(n: number) {
  const t = n % 100
  const s = t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${s}`
}

/** A game's rules with a closing Feats step listing what there is to earn (games without feats are unchanged). */
export function withFeats<T extends { title: string; body: string }>(game: string, rules: T[]): T[] {
  const feats = featsOfGame(game)
  if (!feats.length) return rules
  const list = feats.map((f) => `${f.name} — ${f.blurb.charAt(0).toLowerCase()}${f.blurb.slice(1, -1)}`).join('; ')
  return [...rules, { title: 'Feats', body: `Brag-worthy moments, kept against each rival (not against Ops): ${list}.` } as T]
}
