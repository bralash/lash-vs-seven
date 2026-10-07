import { ref, set } from 'firebase/database'
import { createContext, useContext, useMemo } from 'react'
import { db } from '../lib/firebase'
import { roomPath, startMatch } from '../lobby/rooms'
import { applyMove } from './turns'

/**
 * How a turn-based match screen changes the game. Online, every change goes to the room in the
 * database; in pass-and-play the whole match lives in memory on this device. Match screens call
 * useSession() and never need to know which one they're in, except for wording ("Your turn" vs
 * "Seven's turn") via `local`.
 */
export interface Session {
  local: boolean
  /** change state.live — the mutator returns the next position, or undefined to refuse */
  move: <T>(mutate: (live: T) => T | undefined) => Promise<boolean>
  /** this player wants a rematch */
  ready: (playerId: string) => void
  /** replace the whole match state (the host deals a rematch) */
  start: (state: Record<string, unknown>) => void
}

const LocalSession = createContext<Session | null>(null)
/** Wraps a pass-and-play match so its screens use the in-memory session. */
export const LocalSessionProvider = LocalSession.Provider

export function useSession(game: string, code: string): Session {
  const local = useContext(LocalSession)
  return useMemo<Session>(
    () =>
      local ?? {
        local: false,
        move: (mutate) => applyMove(game, code, mutate),
        ready: (id) => {
          set(ref(db, `${roomPath(game, code)}/state/ready/${id}`), true).catch(() => {})
        },
        start: (state) => {
          startMatch(game, code, state).catch(() => {})
        },
      },
    [local, game, code],
  )
}
