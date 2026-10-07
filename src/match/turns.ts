import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { roomPath } from '../lobby/rooms'

/**
 * Turn-based games keep their whole live position at state/live and change it only through
 * this transaction. The mutator sees the latest server copy and returns the next position,
 * or undefined to refuse (not your turn, square taken, game over…). Because the database
 * retries the mutator on conflict, two quick taps or two players moving at once can never
 * both land — one wins, the other is re-checked against the new position and refused.
 */
export async function applyMove<T>(game: string, code: string, mutate: (live: T) => T | undefined): Promise<boolean> {
  const res = await runTransaction(ref(db, `${roomPath(game, code)}/state/live`), (cur: T | null) =>
    // null only means "not in the local cache yet": hand it back so the server replies with the real value
    cur === null ? cur : mutate(cur),
  )
  return res.committed
}
