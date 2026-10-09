import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { KEYS, load, save } from './storage'

export type Cue = 'tap' | 'join' | 'start' | 'error' | 'find' | 'findBig' | 'tick' | 'end' | 'whoosh' | 'splat' | 'boom' | 'snap' | 'buzz' | 'thwip' | 'horn' | 'taunt' | 'clack' | 'pong' | 'ping' | 'smash' | 'cue' | 'clink' | 'pot'

// Short synthesized cues — no audio files to load.
const CUES: Record<Cue, { type: OscillatorType; notes: number[]; gap: number; len: number; vol: number }> = {
  tap: { type: 'square', notes: [660], gap: 0, len: 0.05, vol: 0.04 },
  find: { type: 'sine', notes: [659.25, 880], gap: 0.06, len: 0.16, vol: 0.12 },
  findBig: { type: 'sine', notes: [523.25, 659.25, 783.99, 1046.5], gap: 0.06, len: 0.2, vol: 0.13 },
  tick: { type: 'square', notes: [1200], gap: 0, len: 0.04, vol: 0.03 },
  end: { type: 'triangle', notes: [784, 587.33, 392], gap: 0.12, len: 0.3, vol: 0.14 },
  join: { type: 'sine', notes: [523.25, 659.25, 783.99], gap: 0.08, len: 0.18, vol: 0.12 },
  start: { type: 'sine', notes: [392, 523.25, 659.25, 1046.5], gap: 0.07, len: 0.2, vol: 0.12 },
  whoosh: { type: 'sine', notes: [420, 760], gap: 0.05, len: 0.08, vol: 0.05 },
  splat: { type: 'sawtooth', notes: [150, 70], gap: 0.04, len: 0.12, vol: 0.08 },
  boom: { type: 'sawtooth', notes: [110, 70, 45], gap: 0.06, len: 0.22, vol: 0.12 },
  snap: { type: 'square', notes: [2200, 1400], gap: 0.02, len: 0.04, vol: 0.06 },
  buzz: { type: 'sawtooth', notes: [90, 95, 88], gap: 0.07, len: 0.09, vol: 0.05 },
  thwip: { type: 'triangle', notes: [1800, 900, 520], gap: 0.025, len: 0.05, vol: 0.07 },
  horn: { type: 'square', notes: [233, 294, 233, 294], gap: 0.16, len: 0.15, vol: 0.06 },
  taunt: { type: 'square', notes: [660, 520, 660, 520], gap: 0.09, len: 0.07, vol: 0.05 },
  // table tennis: the racket, and the ball off the table
  pong: { type: 'triangle', notes: [520], gap: 0, len: 0.05, vol: 0.09 },
  ping: { type: 'sine', notes: [1500], gap: 0, len: 0.04, vol: 0.06 },
  // pool: the cue on the ball, two balls meeting, one dropping
  cue: { type: 'triangle', notes: [340], gap: 0, len: 0.05, vol: 0.08 },
  clink: { type: 'sine', notes: [2300], gap: 0, len: 0.035, vol: 0.07 },
  pot: { type: 'triangle', notes: [190, 120], gap: 0.05, len: 0.1, vol: 0.12 },
  smash: { type: 'square', notes: [420, 210], gap: 0.02, len: 0.09, vol: 0.12 },
  // a chip landing on the pile
  clack: { type: 'square', notes: [1900, 1300], gap: 0.012, len: 0.025, vol: 0.05 },
  error: { type: 'sawtooth', notes: [180, 140], gap: 0.09, len: 0.14, vol: 0.06 },
}

interface SoundApi {
  muted: boolean
  toggle: () => void
  play: (cue: Cue) => void
}

const SoundContext = createContext<SoundApi | null>(null)

export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState(() => load(KEYS.sound) === 'off')
  const ctxRef = useRef<AudioContext | null>(null)

  /**
   * The audio, awake. Phones put it to sleep (screen locked, another app, a call, the mic for a voice
   * note) and it can start asleep when the first sound isn't from a tap; it never wakes by itself.
   */
  const wake = useCallback(() => {
    let ctx = ctxRef.current
    if (!ctx || ctx.state === 'closed') ctx = ctxRef.current = new AudioContext()
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
    return ctx
  }, [])
  // every tap or key wakes it (browsers only let a tap do that), and so does coming back to the page
  useEffect(() => {
    if (muted) return
    const onTap = () => {
      try {
        wake()
      } catch {
        /* audio unavailable */
      }
    }
    const onShow = () => document.visibilityState === 'visible' && ctxRef.current && onTap()
    window.addEventListener('pointerdown', onTap, true)
    window.addEventListener('keydown', onTap, true)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      window.removeEventListener('pointerdown', onTap, true)
      window.removeEventListener('keydown', onTap, true)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [muted, wake])

  const play = useCallback(
    (cue: Cue) => {
      if (muted) return
      try {
        const ctx = wake()
        const { type, notes, gap, len, vol } = CUES[cue]
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = type
          osc.frequency.value = freq
          osc.connect(gain).connect(ctx.destination)
          const t = ctx.currentTime + i * gap
          gain.gain.setValueAtTime(vol, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + len)
          osc.start(t)
          osc.stop(t + len + 0.02)
        })
      } catch {
        /* audio unavailable */
      }
    },
    [muted, wake],
  )

  const toggle = useCallback(() => {
    setMuted((m) => {
      save(KEYS.sound, m ? 'on' : 'off')
      return !m
    })
  }, [])

  const api = useMemo(() => ({ muted, toggle, play }), [muted, toggle, play])
  return <SoundContext.Provider value={api}>{children}</SoundContext.Provider>
}

export function useSound() {
  const api = useContext(SoundContext)
  if (!api) throw new Error('useSound must be used inside <SoundProvider>')
  return api
}
