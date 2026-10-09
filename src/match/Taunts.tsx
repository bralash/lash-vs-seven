import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type MouseEvent } from 'react'
import { OpsFace, type OpsMood, type OpsStyle } from '../components/OpsFace'
import { Portal } from '../components/Portal'
import { useSound } from '../lib/sound'
import { linesFor } from './opsLines'

/*
 * Hold your own Ops on your score card and it hops out, walks over to someone else's card and
 * taunts them for a couple of seconds: Kratops shouts in their face, Thanops snaps, Spidops hangs
 * upside down and waves, Opstimus salutes, Hulkops pounds his fists, the robots dance. A speech bubble says it in the
 * character's words. The face being visited goes angry and shakes until the visitor walks home.
 * Looks only; the game underneath never changes. With more than one other card, you tap whose to
 * visit after the hold. Online it goes over the reactions channel (k = 'taunt', `at` = whose card),
 * and `n` (the time it was sent) picks the line, so every phone shows the same words. Against Ops,
 * she answers back, and now and then she comes to visit you.
 */

/** hold this long to send your Ops out */
const HOLD_MS = 500
/** one visit per this long */
const COOLDOWN_MS = 10_000
/** the walk there, the taunt, the walk home */
export const WALK_MS = 900
const TAUNT_MS = 2200
const BACK_MS = 800
const VISIT_MS = WALK_MS + TAUNT_MS + BACK_MS
/** tap a card within this long of being asked whose to visit */
const PICK_MS = 5000

interface Visit {
  n: number
  from: string
  to: string
  look: OpsStyle
  name: string
  /** started on this phone */
  mine: boolean
}

/** what each character does when it gets there (anything not listed: the robots' dance) */
const ACT: Partial<Record<OpsStyle, { mood: OpsMood; act: string }>> = {
  warrior: { mood: 'angry', act: 'shout' },
  titan: { mood: 'win', act: 'snap' },
  spider: { mood: 'hello', act: 'hang' },
  prime: { mood: 'hello', act: 'salute' },
  brute: { mood: 'angry', act: 'pound' },
}
const DANCE = { mood: 'giggle' as OpsMood, act: 'dance' }

/** Ops' usual words, for looks without their own */
const USUAL = ['Nyah nyah', 'Hiii', 'Nice score. Not', 'Just visiting', 'Boo!']

/** The line for a visit: the same on every phone, picked by when it was sent. */
export function tauntLine(look: OpsStyle, n: number) {
  const own = linesFor(look).taunt
  const pool = own?.length ? own : USUAL
  return pool[Math.abs(Math.floor(n)) % pool.length]
}

/* ── one store for the page ── */

interface Layer {
  me: string | null
  send: (to: string) => void
}
let layer: Layer | null = null
let visits: Visit[] = []
let holding: string | null = null
/** after a hold with more than one card to pick from: who's going */
let picking: string | null = null
let pickTimer: ReturnType<typeof setTimeout> | undefined
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
const arrivals = new Set<(v: Visit) => void>()

function faceEl(id: string | null): HTMLElement | null {
  const sel = id === null ? '[data-ops-face][data-ops-turn]' : `[data-ops-face="${CSS.escape(id)}"]`
  for (const el of document.querySelectorAll<HTMLElement>(sel)) if (el.getBoundingClientRect().width > 0) return el
  return null
}
/** everyone else with a face on screen */
function others(me: string) {
  const ids = new Set<string>()
  for (const el of document.querySelectorAll<HTMLElement>('[data-ops-face]')) {
    const id = el.dataset.opsFace!
    if (id !== me && el.getBoundingClientRect().width > 0) ids.add(id)
  }
  return [...ids]
}

/** Send `from`'s Ops over to `to`'s card (online: heard from another phone; vs Ops: her own visits too). */
export function visit(from: string, to: string, n: number, mine = false) {
  if (from === to || visits.some((v) => v.from === from)) return
  const el = faceEl(from)
  if (!el || !faceEl(to)) return
  const v: Visit = { n, from, to, look: (el.dataset.opsLook ?? 'screen') as OpsStyle, name: el.dataset.opsName ?? 'Someone', mine }
  visits = [...visits, v]
  notify()
  setTimeout(() => arrivals.forEach((f) => f(v)), WALK_MS)
  setTimeout(() => {
    visits = visits.filter((x) => x !== v)
    notify()
  }, VISIT_MS)
}

function stopPicking() {
  clearTimeout(pickTimer)
  picking = null
  notify()
}

/**
 * For a score card: whether its Ops is out visiting or being visited, a way to hold it (your own
 * card) and, while you're picking whose card to visit, a way to pick this one.
 */
export function useTaunt(id: string | undefined, theirGo: boolean) {
  useVersion()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  const l = layer
  if (!id || !l) return null
  const away = visits.some((v) => v.from === id)
  const visitedBy = visits.find((v) => v.to === id) ?? null
  const mineToHold = l.me === id || (l.me === null && theirGo)

  const start = (e: PointerEvent) => {
    if (e.button !== 0) return
    held.current = false
    clearTimeout(timer.current)
    holding = id
    notify()
    timer.current = setTimeout(() => {
      held.current = true
      holding = null
      const to = others(id)
      if (to.length === 1) l.send(to[0])
      else if (to.length > 1) {
        picking = id
        clearTimeout(pickTimer)
        pickTimer = setTimeout(stopPicking, PICK_MS)
      }
      navigator.vibrate?.(30)
      notify()
    }, HOLD_MS)
  }
  const end = () => {
    clearTimeout(timer.current)
    if (holding === id) {
      holding = null
      notify()
    }
  }
  return {
    away,
    holding: holding === id,
    /** the face being visited: who by, so it can glare at them */
    visitedBy,
    hold: mineToHold
      ? {
          onPointerDown: start,
          onPointerUp: end,
          onPointerLeave: end,
          onPointerCancel: end,
          onContextMenu: (e: MouseEvent) => e.preventDefault(),
          // a hold that sent the Ops out isn't also a tap (no ultimate fired by accident)
          onClickCapture: (e: MouseEvent) => {
            if (!held.current) return
            held.current = false
            e.preventDefault()
            e.stopPropagation()
          },
        }
      : null,
    /** while picking: send your Ops here */
    pick: picking && picking !== id ? () => (l.send(id), stopPicking()) : null,
  }
}

/**
 * Turns taunting on for the match it's mounted in, next to the ThrowLayer. `me`: whose card can
 * be held on this phone (null in pass & play: whoever's go it is); `deliver` tells the others;
 * `onArrive` hears every visitor arriving (Ops answers hers).
 */
export function TauntLayer({ me, deliver, onArrive }: { me: string | null; deliver?: (to: string, n: number) => void; onArrive?: (v: Visit) => void }) {
  useVersion()
  const { play } = useSound()
  const sentAt = useRef(0)
  const props = useRef({ me, deliver, onArrive, play })
  props.current = { me, deliver, onArrive, play }

  useEffect(() => {
    const mine: Layer = {
      me,
      send: (to) => {
        const now = Date.now()
        if (now - sentAt.current < COOLDOWN_MS) return
        const from = props.current.me ?? faceEl(null)?.dataset.opsFace ?? null
        if (!from) return
        sentAt.current = now
        visit(from, to, now, true)
        props.current.deliver?.(to, now)
      },
    }
    layer = mine
    const onLand = (v: Visit) => {
      props.current.play('taunt')
      if (v.to === props.current.me) navigator.vibrate?.([40, 40, 40])
      props.current.onArrive?.(v)
    }
    arrivals.add(onLand)
    notify()
    return () => {
      if (layer === mine) layer = null
      arrivals.delete(onLand)
      visits = []
      stopPicking()
    }
  }, [me])

  return (
    <Portal>
      <div className="taunt" aria-hidden="true">
        {visits.map((v) => (
          <Visitor key={v.n + v.from} v={v} />
        ))}
      </div>
      {picking && (
        <div className="taunt__pick" role="status">
          <span>Tap whose card to visit</span>
          <button type="button" onClick={stopPicking}>
            Cancel
          </button>
        </div>
      )}
    </Portal>
  )
}

/** The Ops on its trip: hops over, taunts with a bubble, hops home. */
function Visitor({ v }: { v: Visit }) {
  const el = useRef<HTMLDivElement>(null)
  const { play } = useSound()
  const [stage, setStage] = useState<'walk' | 'taunt' | 'back'>('walk')
  const [geo, setGeo] = useState<{ size: number; below: boolean } | null>(null)
  const { mood, act } = ACT[v.look] ?? DANCE

  useLayoutEffect(() => {
    const a = faceEl(v.from)?.getBoundingClientRect()
    const b = faceEl(v.to)?.getBoundingClientRect()
    if (!a || !b || !el.current) return
    const size = a.width
    const x0 = a.left + a.width / 2
    const y0 = a.top + a.height / 2
    // stand beside their face, on the side it came from (unless that's off the screen)
    let side = x0 <= b.left + b.width / 2 ? -1 : 1
    const bx = b.left + b.width / 2
    if (bx + side * size * 1.15 < size / 2 || bx + side * size * 1.15 > innerWidth - size / 2) side = -side
    const x1 = bx + side * size * 1.15
    const y1 = b.top + b.height / 2
    setGeo({ size, below: y1 < 140 })

    const at = (x: number, y: number) => `translate(${x}px, ${y}px) translate(-50%, -50%)`
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    /** little hops from one spot to another */
    const hops = (fx: number, fy: number, tx: number, ty: number) =>
      Array.from({ length: 9 }, (_, i) => {
        const t = i / 8
        return { transform: at(fx + (tx - fx) * t, fy + (ty - fy) * t - (i % 2 ? Math.min(14, size * 0.35) : 0)) }
      })
    const there = el.current.animate(calm ? [{ transform: at(x1, y1) }] : hops(x0, y0, x1, y1), { duration: WALK_MS, easing: 'linear', fill: 'forwards' })
    play('whoosh')
    const t1 = setTimeout(() => setStage('taunt'), WALK_MS)
    let home: Animation | undefined
    const t2 = setTimeout(() => {
      setStage('back')
      home = el.current?.animate(calm ? [{ transform: at(x0, y0) }] : hops(x1, y1, x0, y0), { duration: BACK_MS, easing: 'linear', fill: 'forwards' })
    }, WALK_MS + TAUNT_MS)
    return () => {
      there.cancel()
      home?.cancel()
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const face: OpsMood = stage === 'taunt' ? mood : stage === 'walk' ? 'smug' : 'gotcha'
  return (
    <div ref={el} className={`taunt__ops${stage === 'taunt' ? ` taunt__ops--${act}` : ''}`} style={{ '--s': `${geo?.size ?? 40}px` } as CSSProperties}>
      <OpsFace look={v.look} mood={face} size={geo?.size ?? 40} />
      {stage === 'taunt' && (
        <span className={`taunt__said${geo?.below ? ' taunt__said--below' : ''}`}>
          <b>{v.mine ? 'You' : v.name}</b> {tauntLine(v.look, v.n)}
        </span>
      )}
    </div>
  )
}
