import { onValue, ref, set } from 'firebase/database'
import { useEffect, useRef, useState } from 'react'
import { Smile } from '../components/Icons'
import { Portal } from '../components/Portal'
import { db } from '../lib/firebase'
import { useSound } from '../lib/sound'
import { roomPath } from '../lobby/rooms'

/** Tap-only reactions, sent during an online match. Keys are what goes over the wire. */
export const REACTIONS = [
  { k: 'fire', e: '🔥', label: 'Fire' },
  { k: 'lol', e: '😂', label: 'LOL' },
  { k: 'wow', e: '😱', label: 'No way' },
  { k: 'grr', e: '😤', label: 'Grr' },
  { k: 'gg', e: '🤝', label: 'GG' },
  { k: 'hurry', e: '⏳', label: 'Hurry up' },
] as const
const BY_KEY = Object.fromEntries(REACTIONS.map((r) => [r.k, r]))

/** a reaction stays on screen this long */
const SHOW_MS = 2400
/** one reaction per this long, so nobody can spam the other screen */
const COOLDOWN_MS = 1200

interface Pop {
  id: number
  k: string
  mine: boolean
}

/**
 * The top-bar button, its tray, and the stickers that pop over the game. Each player writes only
 * their latest reaction to matches/{game}/{code}/react/{uid}; the other screen shows it when it changes.
 */
export function Reactions({ game, code, pid, other }: { game: string; code: string; pid: string; other: string | null }) {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(80)
  const [pops, setPops] = useState<Pop[]>([])
  const seen = useRef<Record<string, number> | null>(null)
  const sentAt = useRef(0)
  const nextId = useRef(0)
  const { play } = useSound()

  const pop = (k: string, mine: boolean) => {
    const id = nextId.current++
    setPops((p) => [...p.slice(-2), { id, k, mine }])
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), SHOW_MS)
  }

  useEffect(
    () =>
      onValue(ref(db, `${roomPath(game, code)}/react`), (snap) => {
        const all = (snap.val() ?? {}) as Record<string, { k: string; n: number }>
        const before = seen.current
        seen.current = Object.fromEntries(Object.entries(all).map(([u, r]) => [u, r.n]))
        if (!before) return // what was already there when we arrived isn't news
        for (const [u, r] of Object.entries(all)) {
          if (u === pid || r.n === before[u] || !BY_KEY[r.k]) continue
          pop(r.k, false)
          play('tap')
          navigator.vibrate?.(40)
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, code, pid],
  )

  // Escape closes the tray
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = (k: string) => {
    setOpen(false)
    const now = Date.now()
    if (now - sentAt.current < COOLDOWN_MS) return
    sentAt.current = now
    pop(k, true)
    set(ref(db, `${roomPath(game, code)}/react/${pid}`), { k, n: now }).catch(() => {})
  }

  return (
    <div className="react">
      <button
        type="button"
        className="icon-btn"
        onClick={(e) => {
          setTop(e.currentTarget.getBoundingClientRect().bottom + 12)
          setOpen((o) => !o)
        }}
        aria-label="Send a reaction"
        aria-expanded={open}
      >
        <Smile />
      </button>
      {open && (
        <Portal>
          <button type="button" className="react__scrim" aria-label="Close reactions" onClick={() => setOpen(false)} />
          <div className="react__tray" role="menu" aria-label="Reactions" style={{ top }}>
            {REACTIONS.map((r) => (
              <button key={r.k} type="button" role="menuitem" className="react__pick" onClick={() => send(r.k)}>
                <span className="react__emoji" aria-hidden="true">{r.e}</span>
                <span className="react__label">{r.label}</span>
              </button>
            ))}
          </div>
        </Portal>
      )}
      <Portal>
        <div className="react__pops" aria-live="polite">
          {pops.map((p) => {
            const r = BY_KEY[p.k]
            return (
              <div key={p.id} className={`react__pop react__pop--${p.mine ? 'mine' : 'theirs'}`}>
                <span className="react__emoji" aria-hidden="true">{r.e}</span>
                <span className="react__who">{p.mine ? 'You' : (other ?? 'Opponent')}</span>
                <span className="react__said">{r.label}</span>
              </div>
            )
          })}
        </div>
      </Portal>
    </div>
  )
}
