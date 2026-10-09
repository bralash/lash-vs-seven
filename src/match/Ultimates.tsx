import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { OpsMood } from '../components/OpsFace'
import { ReticleArt } from '../components/faces/ghops'
import { FistArt } from '../components/faces/hulkops'
import { TruckArt } from '../components/faces/opstimus'
import { WebArt } from '../components/faces/spidops'
import { GauntletArt } from '../components/faces/thanops'
import { Portal } from '../components/Portal'
import { useSound } from '../lib/sound'
import { KEYS, load, save } from '../lib/storage'
import type { Room } from '../lobby/rooms'
import type { OpsSense } from './bot'
import { ItemArt, throwsIn, type Item } from './Throws'

/*
 * Ultimates: win a game in the match (a round of Spar, a game of a best-of-3; in a one-game match,
 * the match itself) and the meter under your Ops fills and glows. Tap your own face to fire it at
 * everyone else: a 2–3 second show on every phone, picked by the face you wear. Kratops' Spartan
 * Rage slams his axe into the middle of the screen and cracks it; Thanops' Snap lights the six
 * stones and dusts half the board, which then puts itself back; Spidops' Thwip shoots a web from
 * his card and nets the whole board; Opstimus turns into his truck and roars across the board,
 * horn blaring, leaving tyre tracks; Hulkops' Smash brings a giant fist down on the board, which jumps
 * and shakes with a shockwave; Ghops calls in an Airstrike: a red reticle locks onto the board, then
 * three blasts shake it. The robot faces fizz the screen
 * into static. Looks only: the game underneath never changes and taps go straight through. One
 * use per win. Online it rides the reactions channel (k = 'ult'); anyone can mute incoming ones.
 */

export type Ult = 'rage' | 'snap' | 'thwip' | 'rollout' | 'smash' | 'airstrike' | 'static'
export const ULTS: Record<Ult, { name: string; said: string }> = {
  rage: { name: 'Spartan Rage', said: 'BOY.' },
  snap: { name: 'The Snap', said: 'Perfectly balanced.' },
  thwip: { name: 'Thwip', said: 'Thwip! Gotcha.' },
  rollout: { name: 'Roll Out', said: 'Opsbots, roll out!' },
  smash: { name: 'Hulk Smash', said: 'HULK SMASH!' },
  airstrike: { name: 'Airstrike', said: 'Danger close.' },
  static: { name: 'Static', said: 'Bzzt.' },
}
export const ultOf = (look: string | null | undefined): Ult => (look === 'warrior' ? 'rage' : look === 'titan' ? 'snap' : look === 'spider' ? 'thwip' : look === 'prime' ? 'rollout' : look === 'brute' ? 'smash' : look === 'ghost' ? 'airstrike' : 'static')

/** how long each show runs, and when it lands (the hit on the faces, the shake, the dust) */
const SHOW_MS: Record<Ult, number> = { rage: 2700, snap: 3300, thwip: 2600, rollout: 2800, smash: 2600, airstrike: 2900, static: 1700 }
const IMPACT_MS: Record<Ult, number> = { rage: 420, snap: 1400, thwip: 520, rollout: 750, smash: 480, airstrike: 1000, static: 150 }
/** what the faces it lands on wear, like a throw */
const MARK: Record<Ult, Item | null> = { rage: 'axe', snap: 'stone', thwip: 'web', rollout: null, smash: 'rubble', airstrike: 'flash', static: null }
/** the firing card's face while it plays */
export const FIRE_MOOD: Record<Ult, OpsMood> = { rage: 'angry', snap: 'sorry', thwip: 'gotcha', rollout: 'gotcha', smash: 'angry', airstrike: 'smug', static: 'gotcha' }

interface Show {
  n: number
  ult: Ult
  from: string
  who: string
  /** fired on this phone */
  mine: boolean
  /** this phone turned incoming ultimates off: just the chip */
  quiet: boolean
}

/* ── one store for the page ── */

let scope = ''
let on = false
let muted = load(KEYS.ults) === 'off'
const charged = new Set<string>()
const firing = new Map<string, Ult>()
const struck = new Map<string, { n: number; item: Item }>()
let show: Show | null = null
let firer: { me: string | null; deliver: () => void } | null = null
let nextN = 0
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
const heard = new Set<(from: string) => void>()
/** Hear every ultimate fired (Ops answers yours). */
export function onUnleash(f: (from: string) => void) {
  heard.add(f)
  return () => void heard.delete(f)
}

function setMuted(m: boolean) {
  muted = m
  save(KEYS.ults, m ? 'off' : null)
  notify()
}

function faceEl(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-ops-face="${CSS.escape(id)}"]`)) if (el.getBoundingClientRect().width > 0) return el
  return null
}

/**
 * Fills the meter of whoever wins a game in this match. Mounted by the match's room (online, pass &
 * play and against Ops); games without a sense, and race games, have no ultimates.
 */
export function useUltEarn(room: Room, sense: OpsSense | undefined) {
  const live = !!sense && throwsIn(room.game)
  const key = `${room.game}:${room.code}:${room.createdAt}`
  useEffect(() => {
    if (scope !== key) {
      scope = key
      charged.clear()
      firing.clear()
      struck.clear()
    }
    on = live
    notify()
    return () => {
      on = false
      notify()
    }
  }, [key, live])

  const end = live && room.state ? sense!.ended(room.state) : null
  const winner = end && end.winner >= 0 ? Object.entries(room.players ?? {}).find(([, p]) => p.seat === end.winner)?.[0] : undefined
  const seen = useRef<boolean | null>(null)
  useEffect(() => {
    const was = seen.current
    seen.current = !!end
    // only a game seen ending (not one that had already ended when this phone arrived)
    if (was === false && end && winner && !charged.has(winner)) {
      charged.add(winner)
      notify()
    }
  }, [end, winner])
}

/** useUltEarn as a component, for screens that return early. */
export function UltEarn({ room, sense }: { room: Room; sense: OpsSense | undefined }) {
  useUltEarn(room, sense)
  return null
}

/** For a score card: is this player's ultimate on, charged, playing; and a way to fire it from this phone. */
export function useUlt(id: string | undefined) {
  useVersion()
  if (!id || !on) return null
  const ready = charged.has(id)
  const f = firer
  return {
    charged: ready,
    firing: firing.get(id) ?? null,
    fire: ready && f && (f.me === id || f.me === null) && !show ? () => (unleash(id, true), f.deliver()) : null,
  }
}

/** What an ultimate left on this face, if anything (it wears it like a throw). */
export function useStruck(id: string | undefined) {
  useVersion()
  return id ? struck.get(id) : undefined
}

/** Play one: fired on this phone (`mine`), or heard from another (online) or Ops. */
export function unleash(from: string, mine: boolean) {
  charged.delete(from)
  const el = faceEl(from)
  const ult = ultOf(el?.dataset.opsLook)
  const n = ++nextN
  // pass & play shares one screen, so there's nobody to mute it for
  const quiet = !mine && muted && firer?.me !== null
  show = { n, ult, from, who: el?.dataset.opsName ?? 'Someone', mine, quiet }
  firing.set(from, ult)
  notify()
  heard.forEach((f) => f(from))
  const item = MARK[ult]
  if (item && !quiet)
    setTimeout(() => {
      const targets = new Set([...document.querySelectorAll<HTMLElement>('[data-ops-face]')].map((e) => e.dataset.opsFace!).filter((t) => t !== from))
      for (const t of targets) struck.set(t, { n, item })
      notify()
    }, IMPACT_MS[ult])
  setTimeout(() => {
    if (show?.n === n) show = null
    if (firing.get(from) === ult) firing.delete(from)
    for (const [t, s] of struck) if (s.n === n) struck.delete(t)
    notify()
  }, SHOW_MS[ult])
}

/**
 * Turns ultimates on for the screen it's mounted in, next to the ThrowLayer. `me`: whose card can
 * fire from this phone (null in pass & play: any charged card); `deliver` tells the others.
 */
export function UltLayer({ me, deliver }: { me: string | null; deliver?: () => void }) {
  useVersion()
  const send = useRef(deliver)
  send.current = deliver
  useEffect(() => {
    const mine = { me, deliver: () => send.current?.() }
    firer = mine
    notify()
    return () => {
      if (firer === mine) firer = null
      show = null
      notify()
    }
  }, [me])
  const s = show
  if (!s) return null
  return (
    <Portal>
      {!s.quiet && <Play key={s.n} s={s} />}
      {!s.mine && me !== null && <Chip key={`c${s.n}`} s={s} />}
    </Portal>
  )
}

/** Who fired what, on the other phones, with the switch to turn them off. */
function Chip({ s }: { s: Show }) {
  useVersion()
  return (
    <div className="ult__chip" role="status">
      <span>
        <b>{s.who}</b> used {ULTS[s.ult].name}
      </span>
      <button type="button" onClick={() => setMuted(!muted)}>
        {muted ? 'Show ultimates' : 'Mute ultimates'}
      </button>
    </div>
  )
}

/* ── the shows ── */

const visible = (els: HTMLCollection | Element[]) =>
  [...els].filter((k) => {
    const r = k.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  })

/** an element's pieces: its children, or, when those are rows (or columns) of the same kind, theirs */
function piecesOf(el: Element): Element[] {
  const kids = visible(el.children)
  const kind = kids[0]?.getAttribute('class')
  if (kids.length >= 2 && kids.every((k) => k.getAttribute('class') === kind && k.children.length >= 2)) {
    const flat = kids.flatMap((k) => visible(k.children))
    if (flat.length > kids.length) return flat
  }
  return kids
}

/**
 * The board, as best we can tell without asking each game: the element on the page with the most
 * pieces (cells, pits, cards, tiles), leaving out the score cards and the top bar. A game can point
 * at its own with data-ult-board.
 */
function findBoard(): { board: Element; pieces: Element[] } | null {
  const marked = document.querySelector('[data-ult-board]')
  if (marked) return { board: marked, pieces: piecesOf(marked) }
  const root = document.querySelector('main') ?? document.body
  let best: { board: Element; pieces: Element[] } | null = null
  for (const el of root.querySelectorAll('*')) {
    if (el.children.length < 2 || el.closest('.mt-score, .topbar, .react, .throw, .ult, .mt-banner, button')) continue
    const pieces = piecesOf(el)
    if (pieces.length >= 4 && pieces.length > (best?.pieces.length ?? 0)) best = { board: el, pieces }
  }
  return best
}

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Spot {
  x: number
  y: number
}
interface Geo {
  /** where it lands: the middle of the board, or of the screen */
  at: Spot
  /** the firing card's face, if it's on screen */
  from: Spot | null
  /** Snap: the half of the board turning to dust, and the specks they shed */
  bits: { x: number; y: number; d: number; c: string }[]
  /** Thwip: how wide the net is (a bit wider than the board) */
  span: number
}

const centre = (r: DOMRect): Spot => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

function Play({ s }: { s: Show }) {
  const { play } = useSound()
  const [geo, setGeo] = useState<Geo | null>(null)
  const axe = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    const found = findBoard()
    const br = found?.board.getBoundingClientRect()
    const at = br && br.width > 40 ? centre(br) : { x: innerWidth / 2, y: innerHeight / 2 }
    const fe = faceEl(s.from)
    const from = fe ? centre(fe.getBoundingClientRect()) : null
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (ms: number, f: () => void) => timers.push(setTimeout(f, ms))
    const app = document.getElementById('root')
    let bits: Geo['bits'] = []
    let dusted: Element[] = []

    if (s.ult === 'rage') {
      play('whoosh')
      later(IMPACT_MS.rage, () => {
        play('boom')
        navigator.vibrate?.([80, 40, 120])
        if (!calm) app?.animate([{ translate: '0 0' }, { translate: '-9px 5px' }, { translate: '8px -6px' }, { translate: '-6px 3px' }, { translate: '4px -2px' }, { translate: '0 0' }], { duration: 480, easing: 'ease-out' })
      })
    }
    if (s.ult === 'snap') {
      // half the board, picked at random
      const kids = found?.pieces ?? []
      dusted = shuffle(kids).slice(0, Math.floor(kids.length / 2))
      bits = dusted.slice(0, 40).flatMap((k) => {
        const r = k.getBoundingClientRect()
        return [0, 1, 2].map((i) => ({ x: r.left + Math.random() * r.width, y: r.top + Math.random() * r.height, d: i * 70 + Math.random() * 200, c: i % 2 ? '#8a7f6e' : '#b9ad98' }))
      })
      // the stones light one by one, then the snap
      for (let i = 0; i < 6; i++) later(320 + i * 150, () => play(i === 5 ? 'find' : 'tick'))
      later(IMPACT_MS.snap, () => {
        play('snap')
        navigator.vibrate?.(60)
        for (const k of dusted) {
          ;(k as HTMLElement).style.setProperty('--ult-d', `${Math.round(Math.random() * 300)}ms`)
          k.classList.add('ult-dust')
        }
      })
      later(SHOW_MS.snap - 200, () => dusted.forEach((k) => k.classList.remove('ult-dust')))
    }
    if (s.ult === 'thwip') {
      play('thwip')
      later(IMPACT_MS.thwip, () => {
        play('splat')
        navigator.vibrate?.(40)
      })
    }
    if (s.ult === 'rollout') {
      play('horn')
      // the shake as he thunders past the middle
      later(IMPACT_MS.rollout, () => {
        play('boom')
        navigator.vibrate?.([60, 30, 60])
        if (!calm) app?.animate([{ translate: '0 0' }, { translate: '0 4px' }, { translate: '0 -3px' }, { translate: '0 2px' }, { translate: '0 0' }], { duration: 420, easing: 'ease-out' })
      })
    }
    if (s.ult === 'smash') {
      play('whoosh')
      // every piece of the board jumps when the fist lands, then settles
      const pieces = found?.pieces ?? []
      later(IMPACT_MS.smash, () => {
        play('boom')
        navigator.vibrate?.([120, 40, 160])
        if (!calm) {
          app?.animate([{ translate: '0 0' }, { translate: '0 12px' }, { translate: '-6px -8px' }, { translate: '5px 5px' }, { translate: '-3px -2px' }, { translate: '0 0' }], { duration: 560, easing: 'ease-out' })
          for (const k of pieces) {
            ;(k as HTMLElement).style.setProperty('--ult-d', `${Math.round(Math.random() * 120)}ms`)
            k.classList.add('ult-jump')
          }
        }
      })
      later(IMPACT_MS.smash + 900, () => pieces.forEach((k) => k.classList.remove('ult-jump')))
      dusted = pieces
    }
    if (s.ult === 'airstrike') {
      // the reticle beeps as it locks on, then three blasts
      for (let i = 0; i < 4; i++) later(150 + i * 200, () => play('tick'))
      for (let i = 0; i < 3; i++)
        later(IMPACT_MS.airstrike + i * 220, () => {
          play('boom')
          navigator.vibrate?.(70)
          if (!calm) app?.animate([{ translate: '0 0' }, { translate: `${i % 2 ? 7 : -7}px 5px` }, { translate: '-4px -4px' }, { translate: '0 0' }], { duration: 300, easing: 'ease-out' })
        })
    }
    if (s.ult === 'static') {
      play('buzz')
      navigator.vibrate?.([30, 30, 30, 30, 30])
      if (!calm) app?.classList.add('ult-glitch')
      later(1000, () => app?.classList.remove('ult-glitch'))
    }
    const span = Math.min(Math.max(br && br.width > 40 ? Math.max(br.width, br.height) * 1.15 : 0, 220), Math.max(innerWidth, innerHeight) * 1.1)
    setGeo({ at, from, bits, span })

    return () => {
      timers.forEach(clearTimeout)
      app?.classList.remove('ult-glitch')
      dusted.forEach((k) => k.classList.remove('ult-dust', 'ult-jump'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // the axe: out of his card, spinning, into the middle of the screen; and home again at the end
  useLayoutEffect(() => {
    if (!geo || s.ult !== 'rage' || !axe.current) return
    const { at, from } = geo
    const o = from ?? { x: at.x, y: innerHeight + 80 }
    const pos = (p: Spot, rot: number, sc: number) => ({ transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${sc})` })
    const el = axe.current
    const a = el.animate([pos(o, 0, 0.3), pos(at, 1060, 1.15), pos(at, 1060 - 8, 1)], { duration: IMPACT_MS.rage + 120, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' })
    const back = setTimeout(() => el.animate([pos(at, 1052, 1), pos(o, 0, 0.3)], { duration: 420, easing: 'ease-in', fill: 'forwards' }), SHOW_MS.rage - 480)
    return () => {
      a.cancel()
      clearTimeout(back)
    }
  }, [geo, s.ult])

  const cracks = useMemo(() => crackPaths(), [])
  if (!geo) return null
  const vars = { '--x': `${geo.at.x}px`, '--y': `${geo.at.y}px`, '--ms': `${SHOW_MS[s.ult]}ms` } as CSSProperties
  const said = (
    <div className="ult__said">
      <span className="ult__by">
        {s.mine ? 'You' : s.who} · {ULTS[s.ult].name}
      </span>
      <strong>{ULTS[s.ult].said}</strong>
    </div>
  )

  return (
    <div className={`ult ult--${s.ult}`} style={vars} aria-hidden="true">
      {s.ult === 'rage' && (
        <>
          <div className="ult__flash" />
          <svg className="ult__crack" width="100%" height="100%">
            <g transform={`translate(${geo.at.x} ${geo.at.y})`}>
              {cracks.map((d, i) => (
                <g key={i} style={{ '--i': i } as CSSProperties}>
                  <path d={d} pathLength={1} stroke="var(--ink)" strokeWidth="5" />
                  <path d={d} pathLength={1} stroke="#fff" strokeWidth="1.5" />
                </g>
              ))}
            </g>
          </svg>
          <span ref={axe} className="ult__axe">
            <ItemArt item="axe" size={150} />
          </span>
        </>
      )}
      {s.ult === 'snap' && (
        <>
          <div className="ult__flash ult__flash--white" />
          {geo.bits.map((b, i) => (
            <span key={i} className="ult__speck" style={{ left: b.x, top: b.y, background: b.c, '--d': `${b.d}ms` } as CSSProperties} />
          ))}
          <span className="ult__gauntlet">
            <GauntletArt size={150} />
          </span>
        </>
      )}
      {s.ult === 'thwip' && (
        <>
          {/* the strand: out of his card to the middle of the board (from below if his card's off screen) */}
          <svg className="ult__strand" width="100%" height="100%">
            <path d={`M${geo.from?.x ?? geo.at.x} ${geo.from?.y ?? innerHeight + 20}L${geo.at.x} ${geo.at.y}`} pathLength={1} stroke="var(--ink)" strokeWidth="5" />
            <path d={`M${geo.from?.x ?? geo.at.x} ${geo.from?.y ?? innerHeight + 20}L${geo.at.x} ${geo.at.y}`} pathLength={1} stroke="#fff" strokeWidth="2" />
          </svg>
          <span className="ult__web" style={{ '--w': `${geo.span}px` } as CSSProperties}>
            <WebArt size={geo.span} />
          </span>
        </>
      )}
      {s.ult === 'rollout' && (
        <>
          {/* tyre tracks left behind, then the truck itself, left to right across the board */}
          <span className="ult__tracks" />
          <span className="ult__truck">
            <TruckArt width={Math.min(260, innerWidth * 0.6)} />
          </span>
        </>
      )}
      {s.ult === 'smash' && (
        <>
          {/* the fist comes down from above the screen, a shockwave rings out from where it lands */}
          <span className="ult__ring" />
          <span className="ult__fist">
            <FistArt size={Math.min(220, innerWidth * 0.5)} />
          </span>
        </>
      )}
      {s.ult === 'airstrike' && (
        <>
          <span className="ult__reticle">
            <ReticleArt size={Math.min(geo.span, 300)} />
          </span>
          {/* three blasts around the middle of the board */}
          {[[-0.22, -0.12], [0.2, 0.06], [-0.04, 0.2]].map(([dx, dy], i) => (
            <span key={i} className="ult__blast" style={{ '--bx': `${dx * geo.span}px`, '--by': `${dy * geo.span}px`, '--i': i } as CSSProperties} />
          ))}
          <div className="ult__flash ult__flash--blast" />
        </>
      )}
      {s.ult === 'static' && (
        <svg className="ult__noise" width="100%" height="100%">
          <filter id="ult-noise">
            <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="1">
              <animate attributeName="seed" values="1;7;3;9;5;2" dur=".3s" repeatCount="indefinite" />
            </feTurbulence>
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#ult-noise)" />
        </svg>
      )}
      {said}
    </div>
  )
}

/** jagged cracks out from where the axe lands (drawn around 0,0) */
function crackPaths() {
  const reach = Math.max(innerWidth, innerHeight) * 0.55
  const out: string[] = []
  const rays = 9
  for (let i = 0; i < rays; i++) {
    let ang = (i / rays) * Math.PI * 2 + Math.random() * 0.5
    let x = 0
    let y = 0
    let d = 'M0 0'
    const len = reach * (0.45 + Math.random() * 0.55)
    const steps = 6
    for (let k = 0; k < steps; k++) {
      ang += (Math.random() - 0.5) * 0.7
      const seg = len / steps
      x += Math.cos(ang) * seg
      y += Math.sin(ang) * seg
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`
      // now and then a short branch off the side
      if (k > 1 && Math.random() < 0.35) {
        const b = ang + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.5)
        out.push(`M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(b) * seg * 1.2).toFixed(1)} ${(Math.sin(b) * seg * 1.2).toFixed(1)}`)
      }
    }
    out.push(d)
  }
  return out
}
