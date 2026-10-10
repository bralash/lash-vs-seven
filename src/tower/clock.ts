import { pick } from '../match/bot'
import { play as c4Play, COLS, dropRow, type Live as C4Live } from '../games/connect4/engine'
import { current, guess, type Live as HangLive } from '../games/hangman/engine'
import { legalMoves as othelloMoves, play as othelloPlay, type Live as OthLive } from '../games/othello/engine'
import { legalMoves as quorMoves, move as quorMove, type Live as QuorLive } from '../games/quoridor/engine'

/*
 * The Tower's clock twist: you get so many seconds a move. Each clock game says when it's your move
 * (a key that changes with every move, so the clock restarts) and, when time runs out, what random
 * move to play for you. You're always seat 0 against the guardian.
 */

type State = Record<string, unknown>
export interface ClockGame {
  /** a key for "your move, this one", or null while it isn't your move */
  yours: (state: State) => string | null
  /** a random legal move for you, as a session.move mutator */
  auto: (state: State) => ((live: never) => unknown) | null
}

const live = <T,>(state: State) => state.live as T | undefined

const LETTERS = 'ETAOINSRHLDCUMFPGWYBVKXJQZ'

export const CLOCKS: Record<string, ClockGame> = {
  connect4: {
    yours: (s) => {
      const l = live<C4Live>(s)
      return l && !l.result && l.turn === 0 ? `${l.game}:${l.board}` : null
    },
    auto: (s) => {
      const l = live<C4Live>(s)
      if (!l) return null
      const open = Array.from({ length: COLS }, (_, c) => c).filter((c) => dropRow(l.board, c) >= 0)
      if (!open.length) return null
      const col = pick(open)
      return ((cur: C4Live) => c4Play(cur, 0, col)) as (live: never) => unknown
    },
  },
  othello: {
    yours: (s) => {
      const l = live<OthLive>(s)
      return l && !l.result && l.turn === 0 && othelloMoves(l.board, 0).length ? `${l.board}` : null
    },
    auto: (s) => {
      const l = live<OthLive>(s)
      const moves = l ? othelloMoves(l.board, 0) : []
      if (!moves.length) return null
      const i = pick(moves)
      return ((cur: OthLive) => othelloPlay(cur, 0, i)) as (live: never) => unknown
    },
  },
  quoridor: {
    yours: (s) => {
      const l = live<QuorLive>(s)
      return l && !l.result && l.turn === 0 ? `${l.pos.join(',')}:${(l.walls ?? []).length}` : null
    },
    auto: (s) => {
      const l = live<QuorLive>(s)
      const moves = l ? quorMoves(l) : []
      if (!moves.length) return null
      const to = pick(moves)
      return ((cur: QuorLive) => quorMove(cur, 0, to)) as (live: never) => unknown
    },
  },
  hangman: {
    // only while you're guessing her word (setting yours isn't timed)
    yours: (s) => {
      const l = live<HangLive>(s)
      const r = l && current(l)
      return l && r && l.phase === 'guessing' && r.setter === 1 && !r.pending && !r.outcome ? `${l.round}:${r.guessed ?? ''}` : null
    },
    auto: (s) => {
      const l = live<HangLive>(s)
      const r = l && current(l)
      if (!r) return null
      const left = [...LETTERS].filter((c) => !(r.guessed ?? '').includes(c))
      if (!left.length) return null
      // a common letter more often than not
      const letter = pick(left.slice(0, Math.min(left.length, 8)))
      return ((cur: HangLive) => guess(cur, 0, letter)) as (live: never) => unknown
    },
  },
}
