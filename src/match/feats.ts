import { BATTLESHIP_FEATS } from '../games/battleship/feats'

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

const ALL: FeatDef[] = [...BATTLESHIP_FEATS]
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
