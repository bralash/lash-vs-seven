import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { Portal } from '../components/Portal'
import { useSound } from '../lib/sound'

/*
 * Tap someone's Ops on their score card and something flies at it: a tomato, a rock or a paper
 * ball, picked at random. It lands with a splat and the face winces for a moment. Online it goes
 * over the reactions channel so every phone sees it fly from the thrower's card; against Ops she
 * takes it personally. Race games leave it out (no pelting someone mid-sprint). Whoever wears the
 * Warrior look throws her axe instead, and it spins back to their card.
 */

export const ITEMS = ['tomato', 'rock', 'paper', 'axe'] as const
/** what anyone but the Warrior picks from */
const JUNK: Item[] = ['tomato', 'rock', 'paper']
export type Item = (typeof ITEMS)[number]
export const isItem = (k: unknown): k is Item => ITEMS.includes(k as Item)

/** games played as a race against the clock: nothing to throw */
const RACES = new Set(['wordhunt', 'anagram', 'sudoku'])
export const throwsIn = (game: string) => !RACES.has(game)

/** one throw per this long */
const COOLDOWN_MS = 2000
const FLY_MS = 520
/** the face winces and the splat stays this long */
const HIT_MS = 1400

interface Flight {
  id: number
  item: Item
  from: string | null
  to: string
  /** thrown on this phone (only those answer to `onHit`) */
  mine: boolean
  /** an axe on its way home: no hit when it lands */
  back?: boolean
}
interface Hit {
  n: number
  item: Item
}
interface Layer {
  /** whose card throws from this phone (null in pass & play: whoever's go it is) */
  me: string | null
  throwAt: (to: string) => void
}

/* ── one store for the page: the mounted layer, flights in the air, faces just hit ── */

let layer: Layer | null = null
let flights: Flight[] = []
const hits = new Map<string, Hit>()
let nextId = 0
let version = 0
const listeners = new Set<() => void>()
const notify = () => {
  version++
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}
const useVersion = () => useSyncExternalStore(subscribe, () => version)
const landers = new Set<(f: Flight) => void>()

/** Send something flying from one card's Ops to another's (from null: the card whose go it is). */
export function launch(from: string | null, to: string, item: Item, mine = false, back = false) {
  // pass & play: pin down whose go it is now, so an axe knows whose card to fly back to
  from ??= (faceEl(null) as HTMLElement | null)?.dataset.opsFace ?? null
  const f: Flight = { id: nextId++, item, from, to, mine, back }
  if (!faceRect(to) || matchMedia('(prefers-reduced-motion: reduce)').matches) land(f)
  else {
    flights = [...flights, f]
    notify()
  }
}

function land(f: Flight) {
  flights = flights.filter((x) => x.id !== f.id)
  if (f.back) return notify()
  // the axe comes back to whoever threw it
  if (f.item === 'axe' && faceRect(f.from)) setTimeout(() => launch(f.to, f.from!, 'axe', false, true), 250)
  const n = nextId++
  hits.set(f.to, { n, item: f.item })
  notify()
  setTimeout(() => {
    if (hits.get(f.to)?.n === n) hits.delete(f.to)
    notify()
  }, HIT_MS)
  landers.forEach((l) => l(f))
}

/** What this card throws: her axe if they wear the Warrior, otherwise whatever comes to hand. */
export function itemFrom(id: string | null): Item {
  const el = faceEl(id)
  if (el instanceof HTMLElement && el.dataset.opsLook === 'warrior') return 'axe'
  return JUNK[Math.floor(Math.random() * JUNK.length)]
}

function faceEl(id: string | null): Element | null {
  const sel = id === null ? '[data-ops-face][data-ops-turn]' : `[data-ops-face="${CSS.escape(id)}"]`
  for (const el of document.querySelectorAll(sel)) if (el.getBoundingClientRect().width > 0) return el
  return null
}

/** the face on a visible score card (a match can draw its scoreboard twice: HUD and results) */
function faceRect(id: string | null): DOMRect | null {
  return faceEl(id)?.getBoundingClientRect() ?? null
}

/** For a score card: a way to throw at this player, if there's a layer and they aren't you. */
export function useThrowAt(id: string | undefined, theirGo: boolean) {
  useVersion()
  if (!layer || !id || id === layer.me || (layer.me === null && theirGo)) return null
  const l = layer
  return () => l.throwAt(id)
}

/** What just hit this player's face, if anything. */
export function useHit(id: string | undefined) {
  useVersion()
  return id ? hits.get(id) : undefined
}

/**
 * Turns throwing on for the match it's mounted in. `deliver` hands your throw to the others
 * (online); `onHit` hears every landing, `mine` when it was thrown on this phone.
 */
export function ThrowLayer({ me, deliver, onHit }: { me: string | null; deliver?: (to: string, item: Item) => void; onHit?: (f: Flight) => void }) {
  useVersion()
  const { play } = useSound()
  const thrownAt = useRef(0)
  const props = useRef({ me, deliver, onHit, play })
  props.current = { me, deliver, onHit, play }

  useEffect(() => {
    const mine: Layer = {
      me,
      throwAt: (to) => {
        const now = Date.now()
        if (now - thrownAt.current < COOLDOWN_MS) return
        thrownAt.current = now
        const item = itemFrom(props.current.me)
        props.current.play('whoosh')
        launch(props.current.me, to, item, true)
        props.current.deliver?.(to, item)
      },
    }
    layer = mine
    const onLand = (f: Flight) => {
      if (f.back) return
      props.current.play('splat')
      if (f.to === props.current.me && !f.mine) navigator.vibrate?.(60)
      props.current.onHit?.(f)
    }
    landers.add(onLand)
    notify()
    return () => {
      if (layer === mine) layer = null
      landers.delete(onLand)
      flights = []
      hits.clear()
      notify()
    }
  }, [me])

  return (
    <Portal>
      <div className="throw" aria-hidden="true">
        {flights.map((f) => (
          <Flying key={f.id} f={f} />
        ))}
      </div>
    </Portal>
  )
}

function Flying({ f }: { f: Flight }) {
  const el = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const to = faceRect(f.to)
    if (!el.current || !to) return land(f)
    const from = faceRect(f.from)
    const x0 = from ? from.left + from.width / 2 : innerWidth / 2
    const y0 = from ? from.top + from.height / 2 : innerHeight - 40
    const x1 = to.left + to.width / 2
    const y1 = to.top + to.height / 2
    // a lob: up over the straight line, higher the further it goes
    // …but never off the top of the screen (the cards sit near it)
    const lift = Math.min(160, 50 + Math.hypot(x1 - x0, y1 - y0) * 0.35, Math.max(16, Math.min(y0, y1) - 20))
    const spin = (f.item === 'axe' ? 1080 : f.item === 'paper' ? 300 : f.item === 'rock' ? 540 : 200) * (f.back ? -1 : 1)
    const frames = Array.from({ length: 11 }, (_, i) => {
      const t = i / 10
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t - lift * 4 * t * (1 - t)
      const s = 1.25 - 0.45 * t
      return { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${spin * t}deg) scale(${s})` }
    })
    const a = el.current.animate(frames, { duration: FLY_MS, easing: 'linear', fill: 'forwards' })
    let done = false
    a.onfinish = () => {
      done = true
      land(f)
    }
    return () => {
      if (!done) a.cancel()
    }
  }, [f])
  return (
    <span ref={el} className="throw__item">
      <ItemArt item={f.item} />
    </span>
  )
}

const INK = 'var(--ink)'

export function ItemArt({ item, size = 34 }: { item: Item; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size}>
      {item === 'tomato' && (
        <>
          <circle cx="20" cy="22" r="14" fill="#e5483b" stroke={INK} strokeWidth="2.5" />
          <path d="M20 9l-5-3 3 5-6 0 6 3 2 4 2-4 6-3-6 0 3-5z" fill="#3fa34d" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M11 20q1-5 6-7" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".7" />
        </>
      )}
      {item === 'rock' && (
        <>
          <path d="M8 24l4-11 10-5 10 5 2 12-7 8-13 0z" fill="#9a9a9a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M14 18l5 2M24 14l1 6M18 28l6-2" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {item === 'axe' && (
        <>
          <path d="M9 33L29 13" stroke="#7a4a26" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M9 33L29 13" stroke={INK} strokeWidth="1.5" strokeDasharray="2 4" />
          <path d="M23 9q9-4 14 2q-6 0-6 8q-6-1-8-10z" fill="#c9d6e3" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M34 10q2 3 0 7" stroke="#7fd3ff" strokeWidth="2" fill="none" />
        </>
      )}
      {item === 'paper' && (
        <>
          <path d="M7 20l5-10 9-3 10 4 3 10-4 10-10 3-9-4z" fill="#fbfaf5" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M12 10l6 9-8 4M21 7l-3 12 10 4M31 11l-3 12M20 19l-4 14" stroke={INK} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

/** What's left on a face for a moment: a red splat, a bonk star or paper bits. */
export function Splat({ hit }: { hit: Hit }) {
  return (
    <span className={`throw__splat throw__splat--${hit.item}`} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        {hit.item === 'tomato' && (
          <path
            d="M20 6c3 0 3 6 6 5s5-5 7-2-3 6-1 8 7 0 7 4-6 3-6 6 4 6 1 8-5-3-7-1-1 7-5 7-2-6-5-6-6 5-8 2 3-5 1-8-7-1-7-4 6-3 6-6-5-5-2-7 5 2 7 0 2-6 6-6z"
            fill="#e5483b"
            stroke={INK}
            strokeWidth="2"
            strokeLinejoin="round"
            opacity=".9"
          />
        )}
        {hit.item === 'rock' && <path d="M20 3l4 10 11-3-7 9 9 6-11 1 1 11-7-8-7 8 1-11-11-1 9-6-7-9 11 3z" fill="var(--hit)" stroke={INK} strokeWidth="2" strokeLinejoin="round" />}
        {hit.item === 'axe' && (
          <g stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none">
            <path d="M8 8l24 24" stroke="#c4262e" strokeWidth="4" />
            <path d="M20 4l2 6M34 16l-6 2M6 22l6-2M18 34l2-6" />
          </g>
        )}
        {hit.item === 'paper' && (
          <g fill="#fbfaf5" stroke={INK} strokeWidth="1.8" strokeLinejoin="round">
            <path d="M4 10l7-3 2 6-6 2z" />
            <path d="M28 4l7 4-4 5-5-3z" />
            <path d="M30 28l6 2-2 6-6-3z" />
            <path d="M5 30l6-1 1 6-6 1z" />
          </g>
        )}
      </svg>
    </span>
  )
}
