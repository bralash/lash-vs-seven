import { onValue, ref, set } from 'firebase/database'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Smile } from '../components/Icons'
import { OpsFace, type OpsMood } from '../components/OpsFace'
import { Portal } from '../components/Portal'
import { db } from '../lib/firebase'
import { useSound } from '../lib/sound'
import { roomPath } from '../lobby/rooms'
import { useWallet } from './chips'
import { TauntLayer, visit } from './Taunts'
import { mission } from './missions'
import { isItem, launch, ThrowLayer, throwsIn } from './Throws'
import { UltLayer, unleash } from './Ultimates'

interface Sticker {
  k: string
  e: string
  label: string
}

/** Tap-only reactions, sent during an online match. Keys are what goes over the wire. */
export const REACTIONS = [
  { k: 'fire', e: '🔥', label: 'Fire' },
  { k: 'lol', e: '😂', label: 'LOL' },
  { k: 'wow', e: '😱', label: 'No way' },
  { k: 'grr', e: '😤', label: 'Grr' },
  { k: 'gg', e: '🤝', label: 'GG' },
  { k: 'hurry', e: '⏳', label: 'Hurry up' },
] as const

/** Sticker packs from the shop: six more in the tray each. Every phone knows them all, so anyone can receive one. */
export const PACKS = [
  {
    id: 'ghana',
    name: 'Ghana pack',
    price: 200,
    stickers: [
      { k: 'chale', e: '🤙', label: 'Chale' },
      { k: 'herh', e: '🫵', label: 'Herh!' },
      { k: 'ei', e: '😳', label: 'Ei!' },
      { k: 'ayekoo', e: '👏', label: 'Ayekoo' },
      { k: 'sharp', e: '👌', label: 'Sharp' },
      { k: 'smallsmall', e: '🤏', label: 'Small small' },
    ],
  },
  {
    id: 'football',
    name: 'Football pack',
    price: 200,
    stickers: [
      { k: 'goal', e: '⚽', label: 'Goal!' },
      { k: 'offside', e: '🚩', label: 'Offside!' },
      { k: 'redcard', e: '🟥', label: 'Red card' },
      { k: 'var', e: '📺', label: 'VAR' },
      { k: 'owngoal', e: '🙈', label: 'Own goal' },
      { k: 'fulltime', e: '⏱️', label: 'Full time' },
    ],
  },
] as const
export type PackId = (typeof PACKS)[number]['id']
export const isPack = (v: unknown): v is PackId => PACKS.some((p) => p.id === v)
export type ReactionKey = (typeof REACTIONS)[number]['k'] | (typeof PACKS)[number]['stickers'][number]['k']
const BY_KEY: Record<string, Sticker> = Object.fromEntries(([...REACTIONS, ...PACKS.flatMap((p): readonly Sticker[] => p.stickers)] as Sticker[]).map((r) => [r.k, r]))
/** a reaction by its key (any pack), if it's one we know */
export const reactionOf = (k: string): Sticker | undefined => BY_KEY[k]

/** the tray's last tab, kept for the page */
let lastTab: 'base' | PackId = 'base'

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

/** A watcher sends a reaction to the watchers' channel (see Spectators), where it shows when the room echoes it back. */
export function useCheer(game: string, code: string, pid: string) {
  const sentAt = useRef(0)
  return (k: ReactionKey) => {
    const now = Date.now()
    if (now - sentAt.current < COOLDOWN_MS) return
    sentAt.current = now
    set(ref(db, `${roomPath(game, code)}/wreact/${pid}`), { k, n: now }).catch(() => {})
  }
}

/** The top-bar button and its tray of reactions, with a tab per sticker pack you own. */
export function ReactionButton({ onPick }: { onPick: (k: ReactionKey) => void }) {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(80)
  const wallet = useWallet()
  const packs = PACKS.filter((p) => wallet?.owned?.[p.id])
  const [tab, setTab] = useState(lastTab)
  const shown: readonly Sticker[] = packs.find((p) => p.id === tab)?.stickers ?? REACTIONS
  const pickTab = (t: typeof tab) => {
    lastTab = t
    setTab(t)
  }

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
            {packs.length > 0 && (
              <div className="react__tabs" role="group" aria-label="Sticker packs">
                {[{ id: 'base' as const, name: 'Classic' }, ...packs].map((p) => (
                  <button key={p.id} type="button" aria-pressed={shown === (p.id === 'base' ? REACTIONS : packs.find((x) => x.id === p.id)?.stickers)} className="react__tab" onClick={() => pickTab(p.id)}>
                    {p.name.replace(' pack', '')}
                  </button>
                ))}
              </div>
            )}
            {shown.map((r) => (
              <button
                key={r.k}
                type="button"
                role="menuitem"
                className="react__pick"
                onClick={() => {
                  setOpen(false)
                  onPick(r.k as ReactionKey)
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
 * a score card goes the same way, with `at` saying whose face it's for. A watcher (`watching`) sees all of
 * it, but sends only to the watchers' channel (see Spectators) and throws nothing.
 */
export function Reactions({ game, code, pid, other, names, watching }: { game: string; code: string; pid: string; other: string | null; names?: Record<string, string>; watching?: boolean }) {
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
          if (r.k === 'taunt' && r.at) {
            if (throwsIn(game)) visit(u, r.at, r.n) // someone's Ops off to taunt a card
            continue
          }
          if (r.k === 'ult') {
            if (throwsIn(game)) unleash(u, false) // someone fired their ultimate
            continue
          }
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
    mission({ k: 'sticker' })
  })

  const cheer = useCheer(game, code, pid)

  if (watching) {
    return (
      <div className="react">
        <ReactionButton onPick={cheer} />
        <Pops pops={pops} other={other} />
        {throwsIn(game) && (
          <>
            <ThrowLayer me={pid} view />
            <TauntLayer me={pid} />
            <UltLayer me={pid} />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="react">
      <ReactionButton onPick={send} />
      <Pops pops={pops} other={other} />
      {throwsIn(game) && (
        <>
          <ThrowLayer
            me={pid}
            deliver={(at, k) => {
              set(ref(db, `${roomPath(game, code)}/react/${pid}`), { k, n: Date.now(), at }).catch(() => {})
              mission({ k: 'throw' })
            }}
          />
          <TauntLayer me={pid} deliver={(at, n) => {
              set(ref(db, `${roomPath(game, code)}/react/${pid}`), { k: 'taunt', n, at }).catch(() => {})
              mission({ k: 'taunt' })
            }}
          />
          <UltLayer me={pid} deliver={() => {
              set(ref(db, `${roomPath(game, code)}/react/${pid}`), { k: 'ult', n: Date.now() }).catch(() => {})
              mission({ k: 'ult' })
            }}
          />
        </>
      )}
    </div>
  )
}
