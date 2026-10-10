import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import { GumArt } from '../components/faces/anansops'
import { StoolArt } from '../components/faces/asantewops'
import { BatarangArt } from '../components/faces/batops'
import { CoinsArt } from '../components/faces/trotrops'
import { FlashArt } from '../components/faces/ghops'
import { RubbleArt } from '../components/faces/hulkops'
import { WebArt, webPath } from '../components/faces/spidops'
import type { OpsStyle } from '../components/OpsFace'
import { Portal } from '../components/Portal'
import { useSound } from '../lib/sound'
import { load, save } from '../lib/storage'

/*
 * Tap someone's Ops on their score card and something flies at it: a tomato, a rock or a paper
 * ball, picked at random. It lands with a splat and the face winces for a moment. Online it goes
 * over the reactions channel so every phone sees it fly from the thrower's card; against Ops she
 * takes it personally. Word Hunt and Sudoku leave it out (no pelting someone mid-sprint); Anagram keeps it. Whoever wears the
 * Kratops look throws his axe instead, and it spins back to their card; Thanops snaps and throws
 * a stone from his gauntlet, and whoever it hits turns to dust for a moment; Spidops shoots a ball
 * of web that wraps whoever it hits; Opstimus throws a glowing Energon cube that zaps the face pink; Hulkops hurls a chunk of rubble that
 * squashes the face flat for a moment; Ghops lobs a flashbang that blinds the face white; Anansops flings a
 * ball of sticky gum that gums the face up and stretches it; Trotrops pelts it with small-small coins;
 * Batops' batarang spins in and sticks, quivering; Yaa Asantewops' stool lands on the head and sits there.
 *
 * The shop sells throwables (SHOP_THROWS) that anyone can throw instead: a chalewote slipper that
 * slaps the face round, a water balloon that soaks it, a custard pie that covers it, a Fan Ice that
 * freezes it and a kenkey ball that lands with a thud. Which one you throw is picked on this device
 * (useThrowPick); the thrower's phone decides, so the others just see what comes flying.
 */

export const ITEMS = ['tomato', 'rock', 'paper', 'axe', 'stone', 'web', 'cube', 'rubble', 'flash', 'gum', 'coins', 'batarang', 'stool', 'slipper', 'balloon', 'pie', 'fanice', 'kenkey'] as const
/** what anyone but the characters picks from */
const JUNK: Item[] = ['tomato', 'rock', 'paper']
export type Item = (typeof ITEMS)[number]
export const isItem = (k: unknown): k is Item => ITEMS.includes(k as Item)

/* ── Throwables on sale, and which one this device throws ── */

export type ShopThrow = 'slipper' | 'balloon' | 'pie' | 'fanice' | 'kenkey'
export const SHOP_THROWS: { id: ShopThrow; name: string; price: number; blurb: string }[] = [
  { id: 'slipper', name: 'Chalewote slipper', price: 250, blurb: 'Spins in flat and slaps the face round.' },
  { id: 'balloon', name: 'Water balloon', price: 250, blurb: 'Bursts on impact. Soaked, dripping, blue.' },
  { id: 'pie', name: 'Custard pie', price: 250, blurb: 'Straight in the face, then it slides off slowly.' },
  { id: 'fanice', name: 'Fan Ice', price: 250, blurb: 'A cold sachet of ice cream. Brain freeze included.' },
  { id: 'kenkey', name: 'Kenkey ball', price: 250, blurb: 'Wrapped in husk, heavy, lands with a thud.' },
]
const SHOP_IDS = new Set<string>(SHOP_THROWS.map((t) => t.id))
export const isShopThrow = (v: unknown): v is ShopThrow => typeof v === 'string' && SHOP_IDS.has(v)

/** each character's own throw (anyone else grabs a tomato, a rock or a paper ball) */
const OWN: Partial<Record<OpsStyle, Item>> = { warrior: 'axe', titan: 'stone', spider: 'web', prime: 'cube', brute: 'rubble', ghost: 'flash', anansi: 'gum', trotro: 'coins', bat: 'batarang', queen: 'stool' }
export const ownThrow = (look: OpsStyle | null | undefined): Item | null => (look && OWN[look]) || null

const PICK_KEY = 'lvs_throw'
const pickers = new Set<() => void>()
const readPick = (): ShopThrow | null => {
  const v = load(PICK_KEY)
  return isShopThrow(v) ? v : null
}
const subscribePick = (f: () => void) => {
  pickers.add(f)
  window.addEventListener('storage', f)
  return () => {
    pickers.delete(f)
    window.removeEventListener('storage', f)
  }
}
/** What this device throws: a bought throwable, or null for your character's own throw. */
export const useThrowPick = () => useSyncExternalStore(subscribePick, readPick, () => null)
export function setThrowPick(id: ShopThrow | null) {
  save(PICK_KEY, id)
  pickers.forEach((f) => f())
}

/** games played as a race against the clock: nothing to throw */
// Anagram is in: the user wants rivals pelted mid-round (2026-10-10)
const RACES = new Set(['wordhunt', 'sudoku'])
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
  /** a watcher's phone: shows what's thrown, throws nothing */
  view?: boolean
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

/** What this card throws: Kratops his axe, Thanops a stone, Spidops a web, Opstimus a cube, Hulkops rubble, Ghops a flashbang, Anansops gum, Trotrops coins, Batops a batarang, Yaa Asantewops a stool, anyone else whatever comes to hand. */
export function itemFrom(id: string | null): Item {
  const el = faceEl(id)
  const own = el instanceof HTMLElement ? ownThrow(el.dataset.opsLook as OpsStyle) : null
  return own ?? JUNK[Math.floor(Math.random() * JUNK.length)]
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
  if (!layer || layer.view || !id || id === layer.me || (layer.me === null && theirGo)) return null
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
export function ThrowLayer({ me, deliver, onHit, view }: { me: string | null; deliver?: (to: string, item: Item) => void; onHit?: (f: Flight) => void; view?: boolean }) {
  useVersion()
  const { play } = useSound()
  const thrownAt = useRef(0)
  const props = useRef({ me, deliver, onHit, play })
  props.current = { me, deliver, onHit, play }

  useEffect(() => {
    const mine: Layer = {
      me,
      view,
      throwAt: (to) => {
        const now = Date.now()
        if (now - thrownAt.current < COOLDOWN_MS) return
        thrownAt.current = now
        // a throwable picked in the shop, thrown from your own card (pass & play: what each card has)
        const item = (props.current.me !== null && readPick()) || itemFrom(props.current.me)
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
  }, [me, view])

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
    const spin = (SPIN[f.item] ?? 200) * (f.back ? -1 : 1)
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
      <ItemArt item={f.item} id={f.id} />
    </span>
  )
}

/** how far each thing turns on its way (degrees) */
const SPIN: Partial<Record<Item, number>> = { axe: 1080, stone: 720, web: 160, cube: 450, rubble: 380, flash: 600, gum: 260, coins: 700, batarang: 1440, stool: 500, paper: 300, rock: 540, slipper: 900, balloon: 40, pie: 0, fanice: 420, kenkey: 300 }

const INK = 'var(--ink)'

/** the six stones' colours; which one flies is picked from the flight, so it's random per throw */
const STONE = ['#3a7bff', '#e5333b', '#9b4dff', '#ffd23f', '#ff8c1a', '#2fbf5b']
const stoneOf = (id = 0) => id % STONE.length

export function ItemArt({ item, size = 34, id }: { item: Item; size?: number; id?: number }) {
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
      {item === 'stone' && (
        <>
          <circle className="throw__glow" cx="20" cy="20" r="14" fill={STONE[stoneOf(id)]} opacity=".35" />
          <path d="M20 8l10 7-3 13H13L10 15z" fill={STONE[stoneOf(id)]} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M15 15l5-4 4 3" stroke="#fff" strokeWidth="2" fill="none" opacity=".8" />
        </>
      )}
      {item === 'web' && (
        <>
          <circle cx="20" cy="20" r="13" fill="#f4f1ea" stroke={INK} strokeWidth="2.5" />
          <path d={webPath(13, 6, 2)} transform="translate(20 20)" stroke={INK} strokeWidth=".9" fill="none" />
        </>
      )}
      {item === 'cube' && (
        <>
          <circle className="throw__glow" cx="20" cy="21" r="15" fill="#ff5fc8" opacity=".35" />
          {/* an Energon cube: top, left and right faces, glowing pink */}
          <path d="M20 7l12 6-12 6-12-6z" fill="#ffb3e6" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M8 13l12 6v14L8 27z" fill="#ff5fc8" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M32 13l-12 6v14l12-6z" fill="#e0249f" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M11 17l6 3M23 20l6-3" stroke="#fff" strokeWidth="1.5" opacity=".8" />
        </>
      )}
      {item === 'rubble' && <RubbleArt />}
      {item === 'flash' && <FlashArt />}
      {item === 'gum' && <GumArt />}
      {item === 'coins' && <CoinsArt />}
      {item === 'batarang' && <BatarangArt />}
      {item === 'stool' && <StoolArt />}
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
      {item === 'slipper' && (
        <>
          {/* a chalewote: a flat rubber sole and a blue thong strap */}
          <path d="M14 6q8-3 12 4q3 8 0 16q-2 9-8 10q-7 0-8-9q-1-8 1-14q1-5 3-7z" fill="#ff5a1f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M15 9q5-2 8 3q2 6 0 13q-1 7-5 8" stroke="#ffb08a" strokeWidth="2" fill="none" opacity=".8" />
          <path d="M19 12L12 20M19 12l7 7" stroke="#2d5bff" strokeWidth="4" strokeLinecap="round" />
          <circle cx="19" cy="12" r="2.2" fill="#2d5bff" stroke={INK} strokeWidth="1.5" />
        </>
      )}
      {item === 'balloon' && (
        <>
          <path d="M20 4q12 0 12 13q0 11-12 15q-12-4-12-15q0-13 12-13z" fill="#4ab3ff" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M17 32l3 4 3-4z" fill="#2d8fe0" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M13 13q2-5 7-6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".8" />
        </>
      )}
      {item === 'pie' && (
        <>
          {/* a foil tin piled with custard under a cream top */}
          <path d="M5 24h30l-4 9H9z" fill="#c9d0d8" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M11 24l1 9M17 24v9M23 24v9M29 24l-1 9" stroke={INK} strokeWidth="1" opacity=".35" />
          <path d="M5 24q0-7 7-8q2-5 8-5q6 0 8 5q7 1 7 8z" fill="#ffe7a3" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M11 19q3-3 6 0q3-3 6 0q3-3 6 0" stroke="#fffaf0" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="20" cy="12" r="2.6" fill="#e5333b" stroke={INK} strokeWidth="1.5" />
        </>
      )}
      {item === 'fanice' && (
        <>
          {/* a sachet of ice cream: a white pouch, sealed ends, a stripe across */}
          <path d="M9 8h22l-1 26H10z" fill="#fbfaf5" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M10 11h20M10.5 31h19" stroke={INK} strokeWidth="1.2" strokeDasharray="2 2" />
          <path d="M9.6 17h20.8l-.3 8H9.9z" fill="#e5333b" stroke={INK} strokeWidth="1.5" />
          <path d="M14 21h12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M34 10l3-2M35 15h3M33 5l2-3" stroke="#7fd3ff" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {item === 'kenkey' && (
        <>
          {/* a ball of kenkey in dried corn husk, tied at the top */}
          <path d="M20 9q11 1 12 13q0 11-12 12q-12-1-12-12q1-12 12-13z" fill="#d9c08a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M13 14q-2 8 1 17M20 10q-3 11 0 23M27 14q2 8-1 17" stroke="#a88a4e" strokeWidth="1.6" fill="none" />
          <path d="M17 9q3-6 6 0" stroke={INK} strokeWidth="2.2" fill="#d9c08a" strokeLinejoin="round" />
          <path d="M16 4l4 5 4-5" stroke="#a88a4e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

/** What's left on a face for a moment: a red splat, a bonk star, paper bits, dust, a web, a pink zap, cracks or a flash. */
export function Splat({ hit }: { hit: Hit }) {
  if (hit.item === 'web')
    return (
      <span className="throw__splat throw__splat--web" aria-hidden="true">
        <WebArt size="100%" />
      </span>
    )
  return (
    <span className={`throw__splat throw__splat--${hit.item}`} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        {hit.item === 'batarang' && (
          <g>
            {/* the batarang stuck in at an angle, quivering, with a bonk line or two */}
            <g className="throw__stuck">
              <BatarangArt />
            </g>
            <path d="M4 8l5 3M36 8l-5 3M6 32l5-2" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )}
        {hit.item === 'stool' && (
          <g>
            {/* the stool sitting on top of the head, stars going round */}
            <g className="throw__perch" transform="translate(10 -9) scale(.5)">
              <StoolArt />
            </g>
            <g className="throw__stars" fill="var(--hit)" stroke={INK} strokeWidth="1.2">
              <path d="M7 12l1.5 3 3 .5-2.2 2 .6 3-2.9-1.5-2.9 1.5.6-3-2.2-2 3-.5z" />
              <path d="M33 10l1.5 3 3 .5-2.2 2 .6 3-2.9-1.5-2.9 1.5.6-3-2.2-2 3-.5z" />
            </g>
          </g>
        )}
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
        {hit.item === 'stone' && (
          <g className="throw__dust">
            {[[10, 12], [28, 8], [34, 22], [6, 26], [22, 30], [16, 20], [30, 32], [12, 4]].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="4" height="4" fill={i % 2 ? '#8a7f6e' : '#b9ad98'} style={{ '--i': i } as CSSProperties} />
            ))}
          </g>
        )}
        {hit.item === 'axe' && (
          <g stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none">
            <path d="M8 8l24 24" stroke="#c4262e" strokeWidth="4" />
            <path d="M20 4l2 6M34 16l-6 2M6 22l6-2M18 34l2-6" />
          </g>
        )}
        {hit.item === 'rubble' && (
          <g stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M20 20l-8-10-4 2M20 20l10-12M20 20l14 4 3 6M20 20l-4 14M20 20l-14 3" />
            <rect x="6" y="30" width="5" height="5" fill="#a39a8c" />
            <rect x="29" y="31" width="4" height="4" fill="#a39a8c" />
          </g>
        )}
        {hit.item === 'coins' && (
          <g className="throw__coins" stroke={INK} strokeWidth="1.6">
            {/* coins bouncing off the face every which way, with a glint */}
            {[[6, 10], [30, 6], [34, 26], [8, 30], [20, 34]].map(([x, y], i) => (
              <ellipse key={i} cx={x} cy={y} rx="4.5" ry={i % 2 ? 2.2 : 4.5} fill="#d9a62a" style={{ '--i': i } as CSSProperties} />
            ))}
            <path d="M20 8l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#fff6c9" />
          </g>
        )}
        {hit.item === 'gum' && (
          <g fill="#d9902a" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" opacity=".88">
            {/* a gob of gum stuck on the face, with strings dripping off it */}
            <path d="M8 14q2-9 12-8q11-1 13 8q4 6-1 11q-1 6-5 4l-1 9q-2 3-3-1l-1-7q-3 2-6 0l-1 6q-2 3-3 0l0-7q-6-1-5-8q-3-4 1-7z" />
            <path className="throw__drips" d="M14 18q3-3 6-1M24 14q3 0 4 3" stroke="#ffe0a3" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        )}
        {hit.item === 'flash' && <path d="M20 1l4 12 12-5-7 11 10 6-12 2 2 12-9-8-9 8 2-12-12-2 10-6-7-11 12 5z" fill="#fff" stroke="#ffd23f" strokeWidth="2" strokeLinejoin="round" />}
        {hit.item === 'cube' && (
          <g fill="none" stroke="#ff5fc8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 2l-3 8 5 2-3 8M38 18l-8 1 1 5-8 1M4 24l8-2 0 5 7-1M24 38l-2-8-5 1-1-7" />
            <circle cx="20" cy="20" r="6" fill="#ffb3e6" stroke={INK} strokeWidth="2" />
          </g>
        )}
        {hit.item === 'slipper' && (
          <g>
            {/* the print of the sole, and slap lines */}
            <path d="M17 9q7-2 9 5q2 8-1 14q-2 6-6 6q-5-1-5-8q-1-7 1-12q1-4 2-5z" fill="#ff5a1f" opacity=".6" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M3 12l7 3M2 21h8M4 30l6-3M37 12l-7 3M38 21h-8M36 30l-6-3" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )}
        {hit.item === 'balloon' && (
          <g fill="#4ab3ff" stroke={INK} strokeWidth="1.8" strokeLinejoin="round">
            <path d="M20 4l3 8 8-5-3 9 9 1-8 5 6 7-9-2 0 9-6-7-6 7 0-9-9 2 6-7-8-5 9-1-3-9 8 5z" opacity=".85" />
            <g className="throw__drips" strokeWidth="1.2">
              <path d="M10 30q2 4 0 6q-2-2 0-6z" />
              <path d="M20 32q2 4 0 6q-2-2 0-6z" />
              <path d="M30 29q2 4 0 6q-2-2 0-6z" />
            </g>
          </g>
        )}
        {hit.item === 'pie' && (
          <g stroke={INK} strokeWidth="1.8" strokeLinejoin="round">
            <path d="M5 16q0-10 9-10q3-4 7-2q5-3 9 1q7 0 7 9q4 5 0 10q1 8-6 9q-2 5-6 1q-4 4-8 0q-6 3-8-3q-6-2-4-8q-4-4 0-7z" fill="#fff4cf" />
            <path d="M11 14q4-3 7 0q3-3 7 0q3-3 6 1" stroke="#ffe7a3" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="21" cy="21" r="2.6" fill="#e5333b" />
          </g>
        )}
        {hit.item === 'fanice' && (
          <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
            <path d="M9 12q4-7 11-6q8-1 11 6q5 4 1 9q-2 5-6 3l-1 7q-2 3-3-1l-1-5q-3 3-6 0l-1 8q-2 3-3 0l-1-8q-5 0-5-5q-3-5 4-8z" fill="#ffd9e8" />
            <path d="M2 6l4 3M38 6l-4 3M3 34l4-3M37 34l-4-3" stroke="#7fd3ff" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )}
        {hit.item === 'kenkey' && (
          <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
            <path d="M6 8l5-1 1 5-5 1zM29 5l6 2-2 5-5-2zM31 29l5 2-2 5-5-2zM5 30l5-1 1 5-5 1zM17 33h5v5h-5z" fill="#f2e6c9" />
            <path d="M14 3q3 4 1 9M28 34q-4-2-6 2" stroke="#a88a4e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
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
