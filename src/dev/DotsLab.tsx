import { useState } from 'react'
import { DotsBoard } from '../games/dots/Board'
import { SIZES, freshLive, lineCount, play, type Live } from '../games/dots/engine'
import '../styles/dots.css'

// Dev-only sandbox for the Dots & Boxes board (route: /dev/dots): play both sides, or jump ahead.

/** Plays random lines (taking any box on offer) until only `keep` lines are left. */
export function autoplay(live: Live, keep: number, seed = 7): Live {
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  let l = live
  while (!l.result && [...l.lines].filter((v) => v === '.').length > keep) {
    const free = [...l.lines].map((v, i) => (v === '.' ? i : -1)).filter((i) => i >= 0)
    const takes = free.filter((i) => play(l, l.turn, i)?.closed)
    const pick = takes.length ? takes[0] : free[Math.floor(rand() * free.length)]
    l = play(l, l.turn, pick) ?? l
  }
  return l
}

export default function DotsLab() {
  const [live, setLive] = useState<Live>(freshLive(5, 0))
  const btn = { fontSize: 14, padding: '8px 12px' }

  return (
    <main className="page">
      <div className="dbm" style={{ paddingTop: 24 }}>
        <p className="label">
          Board lab · {live.size}×{live.size} · turn {live.turn} · {[...live.lines].filter((v) => v === '.').length} lines left
          {live.result ? ` · winner ${live.result.winner}` : ''}
        </p>
        <div className="db-stage">
          <DotsBoard
            live={live}
            mySeat={live.turn}
            myTurn={!live.result}
            initials={['E', 'S']}
            onPlay={(i) => setLive((l) => play(l, l.turn, i) ?? l)}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {SIZES.map((n) => (
            <button key={n} type="button" className="btn" data-size={n} style={btn} onClick={() => setLive(freshLive(n, 0))}>
              New {n}×{n}
            </button>
          ))}
          <button type="button" className="btn" data-act="mid" style={btn} onClick={() => setLive(autoplay(freshLive(live.size, 0), Math.round(lineCount(live.size) * 0.3)))}>
            Mid-game
          </button>
          <button type="button" className="btn" data-act="end" style={btn} onClick={() => setLive((l) => autoplay(l, 0))}>
            Finish
          </button>
        </div>
      </div>
    </main>
  )
}
