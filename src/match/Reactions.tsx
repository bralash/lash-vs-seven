import { onValue, ref, set } from 'firebase/database'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Smile } from '../components/Icons'
import { OpsFace, type OpsMood } from '../components/OpsFace'
import { Portal } from '../components/Portal'
import { db } from '../lib/firebase'
import { useSound } from '../lib/sound'
import { roomPath } from '../lobby/rooms'
import { isItem, launch, ThrowLayer, throwsIn } from './Throws'

/** Tap-only reactions, sent during an online match. Keys are what goes over the wire. */
export const REACTIONS = [
  { k: 'fire', e: '🔥', label: 'Fire' },
  { k: 'lol', e: '😂', label: 'LOL' },
  { k: 'wow', e: '😱', label: 'No way' },
  { k: 'grr', e: '😤', label: 'Grr' },
  { k: 'gg', e: '🤝', label: 'GG' },
  { k: 'hurry', e: '⏳', label: 'Hurry up' },
] as const
export type ReactionKey = (typeof REACTIONS)[number]['k']
const BY_KEY = Object.fromEntries(REACTIONS.map((r) => [r.k, r])) as Record<string, (typeof REACTIONS)[number]>

/** a reaction stays on screen this long */
const SHOW_MS = 2400
/** one reaction per this long, so nobody can spam the other screen */
const COOLDOWN_MS = 1200

/** One sticker on screen: an emoji, or (from Ops) her face pulling a mood. */
export interface Pop {
  id: number
  mine: boolean
  said: string
  e?: string
  face?: OpsMood
  /** who sent it, when more than one other player could have */
  who?: string
}

/** The stickers currently showing, and a way to add one (it removes itself after SHOW_MS). */
export function usePops() {
  const [pops, setPops] = useState<Pop[]>([])
  const nextId = useRef(0)
  const pop = useCallback((p: Omit<Pop, 'id'>) => {
    const id = nextId.current++
    setPops((all) => [...all.slice(-2), { ...p, id }])
    setTimeout(() => setPops((all) => all.filter((x) => x.id !== id)), SHOW_MS)
  }, [])
  return { pops, pop }
}

/** Shows your own pick at once, then hands it on — at most one per COOLDOWN_MS. */
export function useSend(pop: (p: Omit<Pop, 'id'>) => void, deliver: (k: ReactionKey) => void) {
  const sentAt = useRef(0)
  return (k: ReactionKey) => {
    const now = Date.now()
    if (now - sentAt.current < COOLDOWN_MS) return
    sentAt.current = now
    const r = BY_KEY[k]
    pop({ mine: true, e: r.e, said: r.label })
    deliver(k)
  }
}

/** The top-bar button and its tray of reactions. */
export function ReactionButton({ onPick }: { onPick: (k: ReactionKey) => void }) {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(80)

  // Escape closes the tray
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
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
              <button
                key={r.k}
                type="button"
                role="menuitem"
                className="react__pick"
                onClick={() => {
                  setOpen(false)
                  onPick(r.k)
                }}
              >
                <span className="react__emoji" aria-hidden="true">{r.e}</span>
                <span className="react__label">{r.label}</span>
              </button>
            ))}
          </div>
        </Portal>
      )}
    </>
  )
}

/** The stickers that pop over the game. */
export function Pops({ pops, other }: { pops: Pop[]; other: string | null }) {
  return (
    <Portal>
      <div className="react__pops" aria-live="polite">
        {pops.map((p) => (
          <div key={p.id} className={`react__pop react__pop--${p.mine ? 'mine' : 'theirs'}${p.face ? ' react__pop--ops' : ''}`}>
            {p.face ? (
              <span className="react__face" aria-hidden="true">
                <OpsFace mood={p.face} size={56} />
              </span>
            ) : (
              <span className="react__emoji" aria-hidden="true">{p.e}</span>
            )}
            <span className="react__who">{p.mine ? 'You' : (p.who ?? other ?? 'Opponent')}</span>
            <span className="react__said">{p.said}</span>
          </div>
        ))}
      </div>
    </Portal>
  )
}

/**
 * Reactions in an online match. Each player writes only their latest reaction to
 * matches/{game}/{code}/react/{uid}; the other screen shows it when it changes. Something thrown at
 * a score card goes the same way, with `at` saying whose face it's for.
 */
export function Reactions({ game, code, pid, other, names }: { game: string; code: string; pid: string; other: string | null; names?: Record<string, string> }) {
  const { pops, pop } = usePops()
  const namesRef = useRef(names)
  namesRef.current = names
  const seen = useRef<Record<string, number> | null>(null)
  const { play } = useSound()

  useEffect(
    () =>
      onValue(ref(db, `${roomPath(game, code)}/react`), (snap) => {
        const all = (snap.val() ?? {}) as Record<string, { k: string; n: number; at?: string }>
        const before = seen.current
        seen.current = Object.fromEntries(Object.entries(all).map(([u, r]) => [u, r.n]))
        if (!before) return // what was already there when we arrived isn't news
        for (const [u, r] of Object.entries(all)) {
          if (u === pid || r.n === before[u]) continue
          if (isItem(r.k) && r.at) {
            if (throwsIn(game)) launch(u, r.at, r.k) // something thrown at someone's Ops
            continue
          }
          const known = BY_KEY[r.k]
          if (!known) continue
          pop({ mine: false, e: known.e, said: known.label, who: namesRef.current?.[u] })
          play('tap')
          navigator.vibrate?.(40)
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, code, pid],
  )

  const send = useSend(pop, (k) => {
    set(ref(db, `${roomPath(game, code)}/react/${pid}`), { k, n: Date.now() }).catch(() => {})
  })

  return (
    <div className="react">
      <ReactionButton onPick={send} />
      <Pops pops={pops} other={other} />
      {throwsIn(game) && (
        <ThrowLayer
          me={pid}
          deliver={(at, k) => set(ref(db, `${roomPath(game, code)}/react/${pid}`), { k, n: Date.now(), at }).catch(() => {})}
        />
      )}
    </div>
  )
}
