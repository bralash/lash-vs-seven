import { useEffect, useState } from 'react'
import type { Seat } from '../../lobby/rooms'
import { OwareBoard, sowMs, useSowing } from './Board'
import { play, type Live } from './engine'
import '../../styles/oware.css'

/**
 * A ~30s walk-through for How to play: the real board and engine play one short scene per rule,
 * each a position set up to show it. You're orange, along the bottom, and make every move.
 */
interface Beat {
  /** which rule (in the game's rules list) this scene shows */
  rule: number
  caption: string
  /** pits 0–5 are yours (left to right), 6–11 theirs (right to left along the top) */
  pits: number[]
  captured: [number, number]
  pit: number
  /** shown once the move has played out */
  after: string
}

const BEATS: Beat[] = [
  {
    rule: 0,
    caption: 'Pick a pit on your side.',
    pits: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    captured: [0, 0],
    pit: 3,
    after: 'Its seeds drop one by one, counter-clockwise, round into their row.',
  },
  {
    rule: 1,
    caption: 'Your last seed lands in their row…',
    pits: [2, 3, 1, 0, 4, 2, 1, 2, 1, 3, 4, 2],
    captured: [12, 11],
    pit: 4,
    after: '…making a 2. Take it, plus the 3 and the 2 behind it: 7 seeds!',
  },
  {
    rule: 2,
    caption: 'Their side is empty. Only one pit can reach them…',
    pits: [3, 1, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0],
    captured: [20, 18],
    pit: 5,
    after: '…so you must sow it. Keep them fed.',
  },
  {
    rule: 3,
    caption: 'You have 23. One more capture…',
    pits: [1, 0, 0, 0, 0, 1, 2, 0, 0, 1, 0, 0],
    captured: [23, 20],
    pit: 5,
    after: '26 of the 48 seeds. First to 25 wins!',
  },
]

/** a beat: the position appears, the pit is pointed at, then it's sown */
const POINT_MS = 1300
const SOW_MS = 2000
const BEAT_MS = 7000

type Phase = 'show' | 'point' | 'sown' | 'after'

const setup = (b: Beat, k: number): Live => ({
  pits: b.pits,
  captured: b.captured,
  turn: 0 as Seat,
  starter: 0 as Seat,
  moves: k * 2, // a fresh count per scene, so the board shows it as a new position, not a move
  quiet: 0,
})

export function OwareDemo({ onRule }: { onRule?: (rule: number) => void }) {
  const [run, setRun] = useState(0)
  const [k, setK] = useState(0)
  const [done, setDone] = useState(false)
  // the phase belongs to one scene, so a new scene never starts with the last one's phase
  const scene = `${run}:${k}`
  const [at, setAt] = useState<{ scene: string; phase: Phase }>({ scene, phase: 'show' })
  const phase: Phase = at.scene === scene ? at.phase : 'show'
  const beat = BEATS[k]
  const before = setup(beat, k + run * BEATS.length)
  const live = phase === 'sown' || phase === 'after' ? play(before, 0, beat.pit)! : before
  const view = useSowing(live)

  useEffect(() => {
    onRule?.(beat.rule)
    const setPhase = (phase: Phase) => setAt({ scene, phase })
    const timers = [
      window.setTimeout(() => setPhase('point'), POINT_MS),
      window.setTimeout(() => setPhase('sown'), SOW_MS),
      window.setTimeout(() => setPhase('after'), SOW_MS + sowMs(play(setup(beat, 0), 0, beat.pit)!) + 150),
      window.setTimeout(() => (k + 1 < BEATS.length ? setK(k + 1) : setDone(true)), BEAT_MS),
    ]
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, onRule])

  const replay = () => {
    setDone(false)
    setK(0)
    setRun((r) => r + 1)
  }

  const settled = phase === 'after'
  return (
    <figure className="ow-demo" aria-label="Oware, played out">
      <div className="ow-demo__score">
        <span className="ow-demo__who ow-demo__who--1">Them · {live.captured[1]}</span>
        <span className="ow-demo__who ow-demo__who--0">You · {live.captured[0]}</span>
      </div>
      <OwareBoard live={live} view={view} bottom={0} active={phase === 'point' ? 0 : null} hint={phase === 'point' ? beat.pit : null} onSow={() => {}} />
      <figcaption className="ow-demo__cap" aria-live="polite">
        <span className="ow-demo__step">{k + 1}/{BEATS.length}</span>
        <span>{settled ? beat.after : beat.caption}</span>
      </figcaption>
      {done && (
        <button type="button" className="btn ow-demo__replay" onClick={replay}>
          ↻ Replay
        </button>
      )}
    </figure>
  )
}
