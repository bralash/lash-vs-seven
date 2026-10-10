import { onValue, ref, set } from 'firebase/database'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Smile } from '../components/Icons'
import { OpsFace, hasOwnReactions, pickedCrewLook, type OpsMood, type OpsStyle } from '../components/OpsFace'
import { myWear, type Wear } from '../components/faces/wardrobe'
import { Portal } from '../components/Portal'
import { db } from '../lib/firebase'
import { useSound } from '../lib/sound'
import { load, save } from '../lib/storage'
import { roomPath, type Room } from '../lobby/rooms'
import { useWallet } from './chips'
import { looksFor, wearsFor } from './looks'
import { TauntLayer, visit } from './Taunts'
import { mission } from './missions'
import { isItem, launch, ThrowLayer, throwsIn } from './Throws'
import { UltLayer, unleash } from './Ultimates'

export interface Sticker {
  k: string
  /** the emoji; for a face sticker, what stands in where no face can be drawn */
  e: string
  label: string
  /** a face sticker: the sender's own character pulls this face */
  face?: OpsMood
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

/**
 * Sticker packs from the shop: six more in the tray each, on a tab of their own (`icon`). Every phone
 * knows them all, so anyone can receive one. Keys go over the wire: 12 characters at most.
 */
export const PACKS = [
  {
    id: 'ghana',
    name: 'Ghana pack',
    icon: '🤙',
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
    icon: '⚽',
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
  {
    id: 'trash',
    name: 'Trash talk pack',
    icon: '😎',
    price: 200,
    stickers: [
      { k: 'tooeasy', e: '😎', label: 'Too easy' },
      { k: 'sitdown', e: '🪑', label: 'Sit down' },
      { k: 'isthatall', e: '🥱', label: 'Is that all?' },
      { k: 'lucky', e: '🍀', label: 'Lucky!' },
      { k: 'calculated', e: '🧮', label: 'Calculated' },
      { k: 'rematch', e: '🔁', label: 'Rematch?' },
    ],
  },
  {
    id: 'chopbar',
    name: 'Chop bar pack',
    icon: '🍛',
    price: 200,
    stickers: [
      { k: 'jollof', e: '🍛', label: 'Jollof' },
      { k: 'kelewele', e: '🍌', label: 'Kelewele' },
      { k: 'waakye', e: '🫘', label: 'Waakye' },
      { k: 'banku', e: '🐟', label: 'Banku & tilapia' },
      { k: 'hungry', e: '🤤', label: 'I’m hungry' },
      { k: 'chopmoney', e: '💸', label: 'Chop money' },
    ],
  },
  {
    id: 'pidgin',
    name: 'Pidgin pack',
    icon: '💬',
    price: 200,
    stickers: [
      { k: 'wahala', e: '😩', label: 'Wahala' },
      { k: 'abeg', e: '🥺', label: 'Abeg' },
      { k: 'charley', e: '👋', label: 'Charley!' },
      { k: 'ebiyou', e: '🤨', label: 'Ebi you?' },
      { k: 'makeisee', e: '👀', label: 'Make I see' },
      { k: 'ideycome', e: '🏃', label: 'I dey come' },
    ],
  },
  {
    id: 'church',
    name: 'Church pack',
    icon: '🙏',
    price: 200,
    stickers: [
      { k: 'amen', e: '🙏', label: 'Amen' },
      { k: 'hallelujah', e: '🙌', label: 'Hallelujah' },
      { k: 'bloodjesus', e: '🩸', label: 'Blood of Jesus!' },
      { k: 'testimony', e: '🎤', label: 'Testimony' },
      { k: 'godwhen', e: '🥹', label: 'God when?' },
      { k: 'jesus', e: '🫨', label: 'Jesus!' },
    ],
  },
  {
    id: 'gamenight',
    name: 'Game night pack',
    icon: '🎲',
    price: 200,
    stickers: [
      { k: 'thinking', e: '🤔', label: 'Thinking…' },
      { k: 'sweating', e: '😅', label: 'Sweating' },
      { k: 'bigbrain', e: '🧠', label: 'Big brain' },
      { k: 'oops', e: '🫢', label: 'Oops' },
      { k: 'onemore', e: '☝️', label: 'One more' },
      { k: 'niceone', e: '👍', label: 'Nice one' },
    ],
  },
  {
    id: 'faces',
    name: 'Face pack',
    icon: '😏',
    price: 400,
    /** sent with your own character pulling the face, on everyone's screen */
    faces: true,
    stickers: [
      { k: 'f_smug', e: '😏', label: 'Hehe', face: 'smug' },
      { k: 'f_gotcha', e: '😼', label: 'Gotcha', face: 'gotcha' },
      { k: 'f_love', e: '😍', label: 'Love it', face: 'love' },
      { k: 'f_panic', e: '😰', label: 'Help!', face: 'panic' },
      { k: 'f_salty', e: '🧂', label: 'Salty', face: 'salty' },
      { k: 'f_sleep', e: '😴', label: 'Boring', face: 'sleep' },
    ],
  },
] as const
export type PackId = (typeof PACKS)[number]['id']
export const isPack = (v: unknown): v is PackId => PACKS.some((p) => p.id === v)
export type ReactionKey = (typeof REACTIONS)[number]['k'] | (typeof PACKS)[number]['stickers'][number]['k']
const ALL: readonly Sticker[] = [...REACTIONS, ...PACKS.flatMap((p): readonly Sticker[] => p.stickers)]
const BY_KEY: Record<string, Sticker> = Object.fromEntries(ALL.map((r) => [r.k, r]))
const PACK_OF: Record<string, PackId> = Object.fromEntries(PACKS.flatMap((p) => p.stickers.map((s) => [s.k, p.id])))
/** a reaction by its key (any pack), if it's one we know */
export const reactionOf = (k: string): Sticker | undefined => BY_KEY[k]

/** Who's pulling a face sticker: the sender's character and what they have on. */
export interface FaceOf {
  look: OpsStyle
  wear?: Wear
}
/** your own face, when nothing better is known (a match against Ops): the Locker pick */
const myFace = (): FaceOf => ({ look: pickedCrewLook() ?? 'bot', wear: pickedCrewLook() ? myWear() : undefined })

/** A sticker's picture: its emoji, or for a face sticker that character pulling the face (the free robots have only five faces, so they show the emoji). */
export function StickerArt({ s, who, size = 30 }: { s: Sticker; who?: FaceOf | null; size?: number }) {
  if (s.face && who && hasOwnReactions(who.look)) return <OpsFace look={who.look} mood={s.face} size={size} wear={who.wear} />
  return (
    <span className="react__emoji" aria-hidden="true" style={size !== 30 ? { fontSize: size } : undefined}>
      {s.e}
    </span>
  )
}

/* ── Recently sent: the tray's first tab, so the usual few are always one tap away ── */
const RECENT_KEY = 'lvs_recent_stickers'
const RECENT_MAX = 6
const readRecent = () => (load(RECENT_KEY) ?? '').split(',').filter((k) => k in BY_KEY)
function noteRecent(k: string) {
  save(RECENT_KEY, [k, ...readRecent().filter((x) => x !== k)].slice(0, RECENT_MAX).join(','))
}

type Tab = 'recent' | 'base' | PackId
/** the tray's last tab, kept for the page */
let lastTab: Tab | null = null

/** a reaction stays on screen this long */
const SHOW_MS = 2400
/** one reaction per this long, so nobody can spam the other screen */
const COOLDOWN_MS = 1200

/** One sticker on screen: an emoji, or a face (Ops' own, or the sender's character from the face pack). */
export interface Pop {
  id: number
  mine: boolean
  said: string
  e?: string
  face?: OpsMood
  /** whose face pulls it (Ops's own when left out) */
  look?: OpsStyle
  wear?: Wear
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

/** A sticker as a pop: a face sticker shows `who` pulling the face (an emoji if nobody's known). */
export function popOf(s: Sticker, who: FaceOf | null | undefined): Pick<Pop, 'e' | 'face' | 'look' | 'wear' | 'said'> {
  return s.face && who && hasOwnReactions(who.look) ? { face: s.face, look: who.look, wear: who.wear, said: s.label } : { e: s.e, said: s.label }
}

/** Shows your own pick at once, then hands it on — at most one per COOLDOWN_MS. `me`: your face, for face stickers. */
export function useSend(pop: (p: Omit<Pop, 'id'>) => void, deliver: (k: ReactionKey) => void, me?: FaceOf | null) {
  const sentAt = useRef(0)
  return (k: ReactionKey) => {
    const now = Date.now()
    if (now - sentAt.current < COOLDOWN_MS) return
    sentAt.current = now
    noteRecent(k)
    pop({ mine: true, ...popOf(BY_KEY[k], me ?? myFace()) })
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
    noteRecent(k)
    set(ref(db, `${roomPath(game, code)}/wreact/${pid}`), { k, n: now }).catch(() => {})
  }
}

/**
 * The top-bar button and its tray of reactions. With no packs it's the six classics. With packs, a
 * strip of tabs that scrolls sideways (one icon each, the open one named) sits on top: Recent (your
 * last six, from anywhere), Classic, then each pack you own. `me`: your face, for the face pack;
 * `faces={false}` leaves the face pack out (watchers have no face on the board).
 */
export function ReactionButton({ onPick, me, faces = true }: { onPick: (k: ReactionKey) => void; me?: FaceOf | null; faces?: boolean }) {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(80)
  const wallet = useWallet()
  const packs = PACKS.filter((p) => wallet?.owned?.[p.id] && (faces || !('faces' in p)))
  const owned = new Set<string>(packs.map((p) => p.id))
  const canSend = (k: string) => !PACK_OF[k] || owned.has(PACK_OF[k])
  const [recent, setRecent] = useState(readRecent)
  const recents = recent.filter(canSend).map((k) => BY_KEY[k])
  const [tab, setTab] = useState<Tab>(() => lastTab ?? (recents.length ? 'recent' : 'base'))
  const face = me ?? myFace()
  const tabs: { id: Tab; name: string; icon: React.ReactNode }[] = [
    ...(recents.length ? [{ id: 'recent' as const, name: 'Recent', icon: '🕘' }] : []),
    { id: 'base', name: 'Classic', icon: '🔥' },
    ...packs.map((p) => ({ id: p.id, name: p.name.replace(' pack', ''), icon: 'faces' in p && hasOwnReactions(face.look) ? <OpsFace look={face.look} mood="smug" size={22} wear={face.wear} /> : p.icon })),
  ]
  const current = tabs.some((t) => t.id === tab) ? tab : 'base'
  const shown: readonly Sticker[] = current === 'recent' ? recents : (packs.find((p) => p.id === current)?.stickers ?? REACTIONS)
  const pickTab = (t: Tab) => {
    lastTab = t
    setTab(t)
  }
  const stripRef = useRef<HTMLDivElement>(null)

  // Escape closes the tray
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  // opening: the open tab scrolled into view
  useEffect(() => {
    if (open) stripRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [open, current])

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={(e) => {
          setTop(e.currentTarget.getBoundingClientRect().bottom + 12)
          setRecent(readRecent())
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
              <div className="react__tabs" role="group" aria-label="Sticker packs" ref={stripRef}>
                {tabs.map((t) => (
                  <button key={t.id} type="button" aria-pressed={t.id === current} aria-label={t.name} title={t.name} className="react__tab" onClick={() => pickTab(t.id)}>
                    <span className="react__tab-icon" aria-hidden="true">{t.icon}</span>
                    {t.id === current && <span className="react__tab-name">{t.name}</span>}
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
                <StickerArt s={r} who={face} size={r.face ? 34 : 30} />
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
                <OpsFace look={p.look} mood={p.face} size={56} wear={p.wear} />
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

  // everyone's character, as on their score cards: a face sticker shows the sender pulling the face
  const [faces, setFaces] = useState<Record<string, FaceOf>>({})
  const facesRef = useRef(faces)
  facesRef.current = faces
  useEffect(() => {
    // just the players and when the room was made (the random looks are seeded by it), not every move
    let players: Room['players'] | null = null
    let createdAt: number | null = null
    const update = () => {
      if (!players || createdAt === null) return
      const room = { game, code, createdAt, players } as Room
      const looks = looksFor(room)
      const wears = wearsFor(room)
      setFaces(Object.fromEntries(Object.entries(looks).map(([id, look]) => [id, { look, wear: wears[id] }])))
    }
    const offP = onValue(ref(db, `${roomPath(game, code)}/players`), (s) => ((players = s.val()), update()))
    const offC = onValue(ref(db, `${roomPath(game, code)}/createdAt`), (s) => ((createdAt = s.val()), update()))
    return () => (offP(), offC())
  }, [game, code])

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
          pop({ mine: false, ...popOf(known, facesRef.current[u]), who: namesRef.current?.[u] })
          play('tap')
          navigator.vibrate?.(40)
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, code, pid],
  )

  const send = useSend(
    pop,
    (k) => {
      set(ref(db, `${roomPath(game, code)}/react/${pid}`), { k, n: Date.now() }).catch(() => {})
      mission({ k: 'sticker' })
    },
    faces[pid],
  )

  const cheer = useCheer(game, code, pid)

  if (watching) {
    return (
      <div className="react">
        <ReactionButton onPick={cheer} faces={false} />
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
      <ReactionButton onPick={send} me={faces[pid]} />
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
