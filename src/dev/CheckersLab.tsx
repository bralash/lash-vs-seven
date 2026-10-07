import { useState } from 'react'
import { CheckersBoard } from '../games/checkers/Board'
import { freshLive, legalSteps, play, type Live } from '../games/checkers/engine'
import '../styles/checkers.css'

// Dev-only sandbox for the Checkers board (route: /dev/checkers): play both sides, set up jumps, jump ahead.

/** Plays greedy steps (captures first, then the first move) until `keep` turns are left or the game ends. */
export function autoplay(live: Live, turns: number, seed = 3): Live {
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  let l = live
  for (let n = 0; !l.result && n < turns; n++) {
    const steps = legalSteps(l)
    const pick = steps[Math.floor(rand() * steps.length)]
    l = play(l, l.turn, pick.from, pick.to) ?? l
  }
  return l
}

const put = (cells: Record<number, string>, turn: 0 | 1 = 0): Live => {
  const b = '.'.repeat(64).split('')
  for (const [i, v] of Object.entries(cells)) b[Number(i)] = v
  return { board: b.join(''), turn, starter: 0, quiet: 0 }
}

const SETUPS: Record<string, Live> = {
  // an orange man with a double jump available (and a backwards capture)
  'double jump': put({ 51: '0', 42: '1', 26: '1', 60: '1', 7: '1' }),
  // an orange king that captures from a distance
  'flying king': put({ 56: '2', 35: '1', 3: '1', 10: '1' }),
  // one step from being crowned
  crowning: put({ 10: '0', 1: '.', 62: '1', 40: '1' }),
}

export default function CheckersLab() {
  const [live, setLive] = useState<Live>(freshLive(0))
  const [flipped, setFlipped] = useState(false)
  const btn = { fontSize: 14, padding: '8px 12px' }
  return (
    <main className="page">
      <div className="ckm" style={{ paddingTop: 24 }}>
        <p className="label">
          Board lab · turn {live.turn}
          {live.chain !== undefined ? ' · keep jumping' : ''} · quiet {live.quiet}
          {live.result ? ` · winner ${live.result.winner}` : ''}
        </p>
        <div className="ck-stage">
          <CheckersBoard live={live} mySeat={live.turn} myTurn={!live.result} flipped={flipped} onStep={(f, t) => setLive((l) => play(l, l.turn, f, t) ?? l)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          <button type="button" className="btn" data-act="new" style={btn} onClick={() => setLive(freshLive(0))}>New</button>
          {Object.keys(SETUPS).map((k) => (
            <button key={k} type="button" className="btn" data-act={k} style={btn} onClick={() => setLive(SETUPS[k])}>{k}</button>
          ))}
          <button type="button" className="btn" data-act="mid" style={btn} onClick={() => setLive(autoplay(freshLive(0), 24))}>Mid-game</button>
          <button type="button" className="btn" data-act="end" style={btn} onClick={() => setLive((l) => autoplay(l, 999))}>Finish</button>
          <button type="button" className="btn" data-act="flip" style={btn} onClick={() => setFlipped((f) => !f)}>Flip {flipped ? 'off' : 'on'}</button>
        </div>
      </div>
    </main>
  )
}
