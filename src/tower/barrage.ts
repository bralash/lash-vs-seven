import type { Live as ShipsLive } from '../games/battleship/engine'
import { count as pieces, type Live as CheckersLive } from '../games/checkers/engine'
import { count as boxes, type Live as DotsLive } from '../games/dots/engine'

/*
 * The Tower's barrage twist: the guardian fires its Ultimate every time it scores. Each barrage
 * game says what a score is (the reactions' "moments" are rarer on purpose, so they can't be used).
 * Seat 1 is always the guardian.
 */

type State = Record<string, unknown>
const live = <T,>(s: State) => s.live as T | undefined

export const SCORED: Record<string, (prev: State, next: State) => boolean> = {
  // a box closed by the guardian
  dots: (a, b) => {
    const x = live<DotsLive>(a)
    const y = live<DotsLive>(b)
    return !!x && !!y && boxes(y.boxes, 1) > boxes(x.boxes, 1)
  },
  // a hit in your waters
  battleship: (a, b) => {
    const x = live<ShipsLive>(a)
    const y = live<ShipsLive>(b)
    return !!x && !!y && x.game === y.game && (y.waters[0].hits ?? []).length > (x.waters[0].hits ?? []).length
  },
  // one of your pieces taken
  checkers: (a, b) => {
    const x = live<CheckersLive>(a)
    const y = live<CheckersLive>(b)
    return !!x && !!y && pieces(y.board, 0) < pieces(x.board, 0)
  },
}
