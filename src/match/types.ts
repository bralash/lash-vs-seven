import type { Player } from '../lobby/rooms'

/** A player together with their id, as returned by playersBySeat(). */
export type Seated = Player & { id: string }
