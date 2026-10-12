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

/*
 * Knocks: a ball on a bat or a table is a click of noise ringing through a few short resonances, not a
 * beep. Each is a burst of noise through band-pass filters (the hollow "tok") plus quickly dying tones
 * (the ring of the ball and the body of the bat or table), nudged a little each time so no two hits
 * sound the same, with a touch of hall echo.
 */
interface Knock {
  /** [frequency, how long it rings in s, loudness] */
  modes: [number, number, number][]
  /** the click: band-passed noise around these frequencies */
  click: { freqs: number[]; q: number; len: number; vol: number }
  /** how much of it comes back off the walls */
  room: number
}
const KNOCKS: Partial<Record<Cue, Knock>> = {
  // the ball off the rubber: a soft, woody "tok"
  pong: { modes: [[1050, 0.035, 0.05], [2400, 0.02, 0.025], [420, 0.05, 0.03]], click: { freqs: [1400, 3200], q: 2.2, len: 0.018, vol: 0.5 }, room: 0.16 },
  // the ball off the table: brighter and hollower, with the thump of the top under it
  ping: { modes: [[3100, 0.03, 0.035], [5200, 0.015, 0.015], [190, 0.06, 0.04]], click: { freqs: [3600, 6500], q: 3, len: 0.012, vol: 0.45 }, room: 0.2 },
  // a smash: a hard crack off the bat
  smash: { modes: [[900, 0.04, 0.09], [2100, 0.025, 0.05], [300, 0.07, 0.06]], click: { freqs: [1800, 4200], q: 1.2, len: 0.025, vol: 0.9 }, room: 0.24 },
}

let noiseBuf: AudioBuffer | null = null
const echoes = new WeakMap<BaseAudioContext, AudioNode>()
/** a short hall: two quiet reflections off the walls, the second a little duller */
function hallOf(ctx: BaseAudioContext) {
  let into = echoes.get(ctx)
  if (into) return into
  const input = ctx.createGain()
  for (const [delay, gain, cut] of [[0.045, 0.5, 5000], [0.11, 0.3, 2500]] as const) {
    const d = ctx.createDelay(0.5)
    d.delayTime.value = delay
    const g = ctx.createGain()
    g.gain.value = gain
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cut
    input.connect(d).connect(f).connect(g).connect(ctx.destination)
  }
  into = input
  echoes.set(ctx, into)
  return into
}
function knock(ctx: BaseAudioContext, k: Knock) {
  const t = ctx.currentTime
  const vary = () => 0.93 + Math.random() * 0.14
  const out = ctx.createGain()
  // level with the app's other sounds
  out.gain.value = 0.5 * vary()
  out.connect(ctx.destination)
  const send = ctx.createGain()
  send.gain.value = k.room
  out.connect(send).connect(hallOf(ctx))
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate)
    const ch = noiseBuf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
  }
  const pitch = vary()
  for (const f of k.click.freqs) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f * pitch
    bp.Q.value = k.click.q
    const g = ctx.createGain()
    g.gain.setValueAtTime(k.click.vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + k.click.len)
    src.connect(bp).connect(g).connect(out)
    src.start(t)
    src.stop(t + k.click.len + 0.01)
  }
  for (const [f, len, vol] of k.modes) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    // a hit's pitch drops a touch as it rings out
    osc.frequency.setValueAtTime(f * pitch * 1.04, t)
    osc.frequency.exponentialRampToValueAtTime(f * pitch, t + len)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + len + 0.02)
  }
}

interface SoundApi {
  muted: boolean
  toggle: () => void
  play: (cue: Cue) => void
}

const SoundContext = createContext<SoundApi | null>(null)

/**
 * What kind of audio this page makes, on an iPhone (Safari 17+). By default the silent switch mutes
 * the game's sounds (they're made in code, not played from a file); 'playback' plays them through
 * it, like a video. The mic needs 'play-and-record' while a voice note is being recorded.
 */
export function setAudioSession(type: 'playback' | 'play-and-record') {
  const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!s || s.type === type) return
  try {
    s.type = type
  } catch {
    /* not this browser */
  }
}

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
  const unlocked = useRef<AudioContext | null>(null)
  /** a tap's wake: also a silent blip, which is what actually unlocks the audio on an iPhone */
  const unlock = useCallback(() => {
    setAudioSession('playback')
    const ctx = wake()
    if (ctx.state === 'running' && unlocked.current === ctx) return
    const blip = ctx.createBufferSource()
    blip.buffer = ctx.createBuffer(1, 1, 22050)
    blip.connect(ctx.destination)
    blip.start(0)
    if (ctx.state === 'running') unlocked.current = ctx
  }, [wake])
  // every tap or key wakes it (browsers only let a tap do that), and so does coming back to the page
  useEffect(() => {
    if (muted) return
    const onTap = () => {
      try {
        unlock()
      } catch {
        /* audio unavailable */
      }
    }
    const onShow = () => document.visibilityState === 'visible' && ctxRef.current && onTap()
    // an iPhone only lets the end of a touch (or a click) start audio, not the touch going down
    window.addEventListener('pointerdown', onTap, true)
    window.addEventListener('touchend', onTap, true)
    window.addEventListener('click', onTap, true)
    window.addEventListener('keydown', onTap, true)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      window.removeEventListener('pointerdown', onTap, true)
      window.removeEventListener('touchend', onTap, true)
      window.removeEventListener('click', onTap, true)
      window.removeEventListener('keydown', onTap, true)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [muted, unlock])

  const play = useCallback(
    (cue: Cue) => {
      if (muted) return
      try {
        const ctx = wake()
        const k = KNOCKS[cue]
        if (k) return knock(ctx, k)
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
