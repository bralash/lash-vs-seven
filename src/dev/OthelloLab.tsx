import { useState } from 'react'
import { OthelloBoard } from '../games/othello/Board'
import { freshLive, legalMoves, play, type Live } from '../games/othello/engine'
import '../styles/othello.css'

// Dev-only sandbox for the Othello board (route: /dev/othello): play both sides, or jump ahead.

/** Plays greedy moves (most flips, first on ties) until `keep` squares are left empty. */
export function autoplay(live: Live, keep: number): Live {
  let l = live
  while (!l.result && [...l.board].filter((v) => v === '.').length > keep) {
    const moves = legalMoves(l.board, l.turn)
    const scored = moves.map((m) => [m, play(l, l.turn, m)?.flipped?.length ?? 0] as const)
    // a little variety: alternate between the biggest and the smallest capture
    scored.sort((a, b) => (l.turn === 0 ? b[1] - a[1] : a[1] - b[1]))
    l = play(l, l.turn, scored[0][0]) ?? l
  }
  return l
}

export default function OthelloLab() {
  const [live, setLive] = useState<Live>(freshLive(0))
  const [hints, setHints] = useState(true)
  const btn = { fontSize: 14, padding: '8px 12px' }

  return (
    <main className="page">
      <div className="otm" style={{ paddingTop: 24 }}>
        <p className="label">
          Board lab · turn {live.turn}
          {live.passed !== undefined ? ` · ${live.passed} passed` : ''}
          {live.result ? ` · winner ${live.result.winner}` : ''}
        </p>
        <div className="ot-stage">
          <OthelloBoard live={live} mySeat={live.turn} myTurn={!live.result} hints={hints} onPlay={(i) => setLive((l) => play(l, l.turn, i) ?? l)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          <button type="button" className="btn" data-act="new" style={btn} onClick={() => setLive(freshLive(0))}>New</button>
          <button type="button" className="btn" data-act="mid" style={btn} onClick={() => setLive(autoplay(freshLive(0), 30))}>Mid-game</button>
          <button type="button" className="btn" data-act="end" style={btn} onClick={() => setLive((l) => autoplay(l, 0))}>Finish</button>
          <button type="button" className="btn" data-act="hints" style={btn} onClick={() => setHints((h) => !h)}>Hints {hints ? 'on' : 'off'}</button>
        </div>
      </div>
    </main>
  )
}
