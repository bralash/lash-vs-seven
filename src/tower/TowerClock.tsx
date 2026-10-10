import { useEffect, useRef, useState } from 'react'
import { Portal } from '../components/Portal'
import { useSound } from '../lib/sound'
import { CLOCKS } from './clock'

/**
 * The Tower's move clock: a ring that runs down while it's your move, ticking for the last three
 * seconds. Run out and a random move is played for you (`onOut` gets it).
 */
export function TowerClock({ game, state, secs, onOut }: { game: string; state: Record<string, unknown>; secs: number; onOut: (move: (live: never) => unknown) => void }) {
  const clock = CLOCKS[game]
  const key = clock?.yours(state) ?? null
  const [left, setLeft] = useState(secs)
  const { play } = useSound()
  const stateRef = useRef(state)
  stateRef.current = state
  const outRef = useRef(onOut)
  outRef.current = onOut

  useEffect(() => {
    setLeft(secs)
    if (!key || !clock) return
    const ends = Date.now() + secs * 1000
    let last = secs
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((ends - Date.now()) / 1000))
      if (s === last) return
      last = s
      setLeft(s)
      if (s > 0 && s <= 3) play('tick')
      if (s === 0) {
        clearInterval(t)
        const move = clock.auto(stateRef.current)
        if (move) {
          play('buzz')
          outRef.current(move)
        }
      }
    }, 100)
    return () => clearInterval(t)
  }, [key, secs, clock, play])

  if (!clock || !key) return null
  const frac = left / secs
  return (
    <Portal>
      <div className={`tw-clock${left <= 3 ? ' tw-clock--late' : ''}`} role="timer" aria-label={`${left} seconds to move`}>
        <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
          <circle cx="22" cy="22" r="18" className="tw-clock__track" />
          <circle cx="22" cy="22" r="18" className="tw-clock__run" style={{ strokeDasharray: `${frac * 113.1} 113.1` }} />
        </svg>
        <b>{left}</b>
        <span>{left === 0 ? 'Too slow!' : 'Your move'}</span>
      </div>
    </Portal>
  )
}
