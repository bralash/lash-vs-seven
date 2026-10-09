import { onValue, ref, remove, set } from 'firebase/database'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Mic } from '../components/Icons'
import { Portal } from '../components/Portal'
import { db } from '../lib/firebase'
import { KEYS, load, save } from '../lib/storage'
import { roomPath, type Room } from '../lobby/rooms'

/*
 * Voice notes in an online match: hold the mic, talk (10 seconds at most), let go and it plays on the
 * other phones. Each player keeps only their latest clip at matches/{game}/{code}/voice/{uid}; it's
 * deleted 30 seconds after it was sent, when the match's results show, and with the room. Every game,
 * online only (nobody to talk to against Ops or in pass & play).
 */

const MAX_MS = 10_000
/** shorter than this is a tap, not a note */
const MIN_MS = 600
/** a clip is deleted this long after it was sent (it's been heard by then) */
const KEEP_MS = 30_000
/** one note per this long */
const COOLDOWN_MS = 5000
/** what the database takes for one clip (base64); a 10-second clip is well under */
const MAX_CHARS = 160_000

interface Clip {
  /** base64 audio */
  a: string
  /** its type, e.g. audio/mp4 */
  t: string
  /** when it was sent */
  n: number
  /** how long, ms */
  d: number
}

/** AAC first: every phone can play it. WebM/Opus where a browser can't record AAC. */
function recordType() {
  if (typeof MediaRecorder === 'undefined') return null
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

/* ── Playback: one audio element for the page, unlocked by the first tap so later clips can play by themselves ── */

let player: HTMLAudioElement | null = null
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='
function unlock() {
  if (player) return
  player = new Audio()
  player.src = SILENCE
  player.play().catch(() => {})
}
function play(c: Clip) {
  player ??= new Audio()
  player.src = `data:${c.t};base64,${c.a}`
  return player.play()
}

/** Who to wipe after a match: my own clip, and (from the host) the whole room's. */
export function clearVoice(room: Room, me: string) {
  const path = `${roomPath(room.game, room.code)}/voice`
  remove(ref(db, room.hostId === me ? path : `${path}/${me}`)).catch(() => {})
}

type Heard = { id: number; who: string; clip: Clip; playing: boolean; blocked: boolean }

/** `listen`: a watcher hears the players' notes but has no mic */
export function VoiceNotes({ game, code, pid, names, listen }: { game: string; code: string; pid: string; names?: Record<string, string>; listen?: boolean }) {
  const base = `${roomPath(game, code)}/voice`
  const [rec, setRec] = useState<{ start: number } | null>(null)
  const [now, setNow] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [heard, setHeard] = useState<Heard | null>(null)
  const [auto, setAuto] = useState(() => load(KEYS.voice) !== 'off')
  const autoRef = useRef(auto)
  autoRef.current = auto
  const namesRef = useRef(names)
  namesRef.current = names
  const live = useRef<{ rec: MediaRecorder; stream: MediaStream; start: number; stop: ReturnType<typeof setTimeout> } | null>(null)
  const want = useRef(false)
  const sentAt = useRef(0)
  const wipe = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seen = useRef<Record<string, number> | null>(null)
  const nextId = useRef(0)

  // the first tap anywhere unlocks playback, so a note can play without its own tap
  useEffect(() => {
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  // a note says something for a few seconds
  const say = (s: string) => {
    setNote(s)
    setTimeout(() => setNote((n) => (n === s ? null : n)), 2200)
  }

  // someone else's new clip: play it (or offer to), show who's talking
  useEffect(
    () =>
      onValue(ref(db, base), (snap) => {
        const all = (snap.val() ?? {}) as Record<string, Clip>
        const before = seen.current
        seen.current = Object.fromEntries(Object.entries(all).map(([u, c]) => [u, c.n]))
        if (!before) return // what was already there when we arrived isn't news
        for (const [u, c] of Object.entries(all)) {
          if (u === pid || c.n === before[u] || !c.a || Date.now() - c.n > KEEP_MS) continue
          const h: Heard = { id: nextId.current++, who: namesRef.current?.[u] ?? 'Opponent', clip: c, playing: false, blocked: false }
          setHeard(h)
          navigator.vibrate?.(40)
          if (autoRef.current) start(h)
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, pid],
  )

  const start = (h: Heard) => {
    setHeard({ ...h, playing: true, blocked: false })
    play(h.clip)
      .then(() => {
        player!.onended = () => setHeard((x) => (x?.id === h.id ? { ...x, playing: false } : x))
      })
      .catch(() => setHeard((x) => (x?.id === h.id ? { ...x, playing: false, blocked: true } : x)))
  }

  // the sticker goes a few seconds after the clip ends
  useEffect(() => {
    if (!heard || heard.playing) return
    const t = setTimeout(() => setHeard((x) => (x?.id === heard.id ? null : x)), heard.blocked ? 12_000 : 5000)
    return () => clearTimeout(t)
  }, [heard])

  // the recording timer
  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [rec])

  // leaving the match: stop recording, take my clip with me
  useEffect(
    () => () => {
      want.current = false
      const l = live.current
      if (l) {
        clearTimeout(l.stop)
        l.rec.onstop = null
        if (l.rec.state !== 'inactive') l.rec.stop()
        l.stream.getTracks().forEach((t) => t.stop())
      }
      clearTimeout(wipe.current)
      remove(ref(db, `${base}/${pid}`)).catch(() => {})
    },
    [base, pid],
  )

  const send = (blob: Blob, type: string, ms: number) => {
    const reader = new FileReader()
    reader.onload = () => {
      const a = String(reader.result).split(',')[1] ?? ''
      if (!a) return
      if (a.length > MAX_CHARS) return say('Too long, try a shorter one')
      sentAt.current = Date.now()
      set(ref(db, `${base}/${pid}`), { a, t: type || blob.type || 'audio/mp4', n: Date.now(), d: Math.round(ms) } satisfies Clip)
        .then(() => {
          say('Sent')
          clearTimeout(wipe.current)
          wipe.current = setTimeout(() => remove(ref(db, `${base}/${pid}`)).catch(() => {}), KEEP_MS)
        })
        .catch(() => say('Couldn’t send it'))
    }
    reader.readAsDataURL(blob)
  }

  const begin = async () => {
    if (live.current) return
    const type = recordType()
    if (type === null) return say('This browser can’t record')
    if (Date.now() - sentAt.current < COOLDOWN_MS) return say('Hang on a sec')
    want.current = true
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      want.current = false
      return say('Allow the mic to send voice notes')
    }
    // let go while the phone was asking for the mic: nothing to record yet
    if (!want.current) {
      stream.getTracks().forEach((t) => t.stop())
      return say('Mic ready: hold to talk')
    }
    let r: MediaRecorder
    try {
      r = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 })
    } catch {
      want.current = false
      stream.getTracks().forEach((t) => t.stop())
      return say('Couldn’t start the mic')
    }
    const chunks: Blob[] = []
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const t0 = Date.now()
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const ms = Date.now() - t0
      if (ms < MIN_MS) return say('Hold to talk')
      send(new Blob(chunks, { type: r.mimeType || type }), r.mimeType || type, ms)
    }
    try {
      r.start()
    } catch {
      want.current = false
      stream.getTracks().forEach((t) => t.stop())
      return say('Couldn’t start the mic')
    }
    live.current = { rec: r, stream, start: t0, stop: setTimeout(finish, MAX_MS) }
    setRec({ start: t0 })
    setNow(t0)
    navigator.vibrate?.(20)
  }

  function finish() {
    want.current = false
    const l = live.current
    live.current = null
    setRec(null)
    if (!l) return
    clearTimeout(l.stop)
    if (l.rec.state !== 'inactive') l.rec.stop()
  }

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    begin()
  }

  const secs = rec ? Math.min(MAX_MS, now - rec.start) / 1000 : 0

  return (
    <>
      {!listen && (
        <button
          type="button"
          className={`icon-btn voice__btn${rec ? ' voice__btn--on' : ''}`}
          aria-label="Hold to send a voice note"
          aria-pressed={!!rec}
          onPointerDown={down}
          onPointerUp={finish}
          onPointerCancel={finish}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (e.preventDefault(), begin())}
          onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && finish()}
        >
          <Mic />
        </button>
      )}
      <Portal>
        <div className="voice__pops" aria-live="polite">
          {rec && (
            <div className="voice__pop voice__pop--rec">
              <span className="voice__dot" aria-hidden="true" />
              <span className="voice__said">Recording {Math.floor(secs)}s</span>
              <span className="voice__hint">Let go to send · {Math.ceil(MAX_MS / 1000 - secs)}s left</span>
            </div>
          )}
          {!rec && note && <div className="voice__pop voice__pop--note">{note}</div>}
          {heard && (
            <div className={`voice__pop voice__pop--theirs${heard.playing ? ' voice__pop--playing' : ''}`}>
              <button type="button" className="voice__play" onClick={() => start(heard)} aria-label={`Play ${heard.who}’s voice note`}>
                {heard.playing ? (
                  <span className="voice__wave" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  '▶'
                )}
              </button>
              <span className="voice__who">{heard.who} · {Math.round(heard.clip.d / 1000) || 1}s</span>
              <span className="voice__said">{heard.playing ? 'Talking…' : heard.blocked ? 'Tap to play' : 'Voice note'}</span>
              <button
                type="button"
                className="voice__auto"
                onClick={() => {
                  const next = !auto
                  setAuto(next)
                  save(KEYS.voice, next ? 'on' : 'off')
                  if (!next) player?.pause()
                }}
              >
                {auto ? 'Mute notes' : 'Auto-play'}
              </button>
            </div>
          )}
        </div>
      </Portal>
    </>
  )
}
