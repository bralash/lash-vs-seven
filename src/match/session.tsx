import { ref, set } from 'firebase/database'
import { createContext, useContext, useMemo } from 'react'
import { db } from '../lib/firebase'
import { roomPath, startMatch } from '../lobby/rooms'
import { applyMove } from './turns'
import type { Level } from './bot'

/**
 * How a turn-based match screen changes the game. Online, every change goes to the room in the
 * database; in pass-and-play the whole match lives in memory on this device. Match screens call
 * useSession() and never need to know which one they're in, except for wording ("Your turn" vs
 * "Seven's turn") via `local`.
 */
export interface Session {
  local: boolean
  /** watching someone else's online match: every change is refused, and nothing is recorded */
  watching?: boolean
  /** playing Ops on this device: worded like an online match (you vs Ops), but nothing is recorded */
  bot?: boolean
  /** how hard Ops plays, in a game against her */
  level?: Level
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

/** A watcher's session: the match plays out on screen, but this phone never changes it. */
export const WATCH_SESSION: Session = {
  local: false,
  watching: true,
  move: () => Promise.resolve(false),
  ready: () => {},
  start: () => {},
}

/** True while watching someone else's match. */
export const useWatching = () => !!useContext(LocalSession)?.watching

/** True inside a game against Ops. */
export const useVsOps = () => !!useContext(LocalSession)?.bot
/** How hard Ops plays, inside a game against her. */
export const useOpsLevel = () => useContext(LocalSession)?.level

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
