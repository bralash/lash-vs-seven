import { onValue, ref } from 'firebase/database'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { roomPath, type Room } from './rooms'

type RoomState =
  | { status: 'loading' }
  | { status: 'ready'; room: Room }
  | { status: 'gone' }
  | { status: 'error' }

/** Live subscription to rooms/{game}/{code}. */
export function useRoom(game: string, code: string | null): RoomState {
  const [state, setState] = useState<RoomState>({ status: 'loading' })

  useEffect(() => {
    if (!code) return
    setState({ status: 'loading' })
    return onValue(
      ref(db, roomPath(game, code)),
      (snap) => setState(snap.exists() ? { status: 'ready', room: snap.val() as Room } : { status: 'gone' }),
      () => setState({ status: 'error' }),
    )
  }, [game, code])

  return state
}
