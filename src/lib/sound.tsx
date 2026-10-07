import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { KEYS, load, save } from './storage'

export type Cue = 'tap' | 'join' | 'start' | 'error' | 'find' | 'findBig' | 'tick' | 'end'

// Short synthesized cues — no audio files to load.
const CUES: Record<Cue, { type: OscillatorType; notes: number[]; gap: number; len: number; vol: number }> = {
  tap: { type: 'square', notes: [660], gap: 0, len: 0.05, vol: 0.04 },
  find: { type: 'sine', notes: [659.25, 880], gap: 0.06, len: 0.16, vol: 0.12 },
  findBig: { type: 'sine', notes: [523.25, 659.25, 783.99, 1046.5], gap: 0.06, len: 0.2, vol: 0.13 },
  tick: { type: 'square', notes: [1200], gap: 0, len: 0.04, vol: 0.03 },
  end: { type: 'triangle', notes: [784, 587.33, 392], gap: 0.12, len: 0.3, vol: 0.14 },
  join: { type: 'sine', notes: [523.25, 659.25, 783.99], gap: 0.08, len: 0.18, vol: 0.12 },
  start: { type: 'sine', notes: [392, 523.25, 659.25, 1046.5], gap: 0.07, len: 0.2, vol: 0.12 },
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

  const play = useCallback(
    (cue: Cue) => {
      if (muted) return
      try {
        ctxRef.current ??= new AudioContext()
        const ctx = ctxRef.current
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
    [muted],
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
