import { useSyncExternalStore, type ReactNode } from 'react'
import { load, save } from '../../lib/storage'
import type { OpsStyle } from '../OpsFace'
import { INK, star } from './parts'

/*
 * The wardrobe: things a character wears over their face, bought in the shop and put on in the
 * Locker. Three slots, one item each: a hat on top of the head, something round the neck (over the
 * chin and below), and paint, which recolours the whole head. Every head shares the same 100×100 box
 * and the same 80-wide square, so each item is drawn once and fits every character; only the top of
 * the head moves (Bot's antenna and Opstimus' crest push it down).
 */

export type Slot = 'hat' | 'neck' | 'paint'
export type ItemId = 'party' | 'snapback' | 'kufi' | 'crown' | 'kente' | 'jersey' | 'tux' | 'fugu' | 'gold'

export interface Item {
  id: ItemId
  slot: Slot
  name: string
  /** chips; 0 is free for everyone (the starter hat) */
  price: number
  blurb: string
}

export const ITEMS: Item[] = [
  { id: 'party', slot: 'hat', name: 'Party hat', price: 0, blurb: 'Everyone gets one. Pom-pom included.' },
  { id: 'snapback', slot: 'hat', name: 'Snapback', price: 200, blurb: 'Peak to the side, always.' },
  { id: 'kufi', slot: 'hat', name: 'Kufi', price: 200, blurb: 'A white cap, stitched in gold.' },
  { id: 'crown', slot: 'hat', name: 'Crown', price: 600, blurb: 'Gold, three points, three stones.' },
  { id: 'kente', slot: 'neck', name: 'Kente scarf', price: 400, blurb: 'Gold, green and red, woven in blocks.' },
  { id: 'jersey', slot: 'neck', name: 'Black Stars jersey', price: 500, blurb: 'Red, gold and green trim and the black star.' },
  { id: 'tux', slot: 'neck', name: 'Tux', price: 500, blurb: 'Black lapels and a bow tie, for the big matches.' },
  { id: 'fugu', slot: 'neck', name: 'Fugu smock', price: 400, blurb: 'Hand-woven stripes in indigo and white.' },
  { id: 'gold', slot: 'paint', name: 'Gold paint', price: 800, blurb: 'The whole head, solid gold.' },
]
export const SLOTS: { id: Slot; name: string }[] = [
  { id: 'hat', name: 'Hats' },
  { id: 'neck', name: 'Round the neck' },
  { id: 'paint', name: 'Paint' },
]
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]))
export const itemOf = (id: string) => BY_ID.get(id as ItemId)
export const isItem = (v: unknown): v is ItemId => typeof v === 'string' && BY_ID.has(v as ItemId)

/** What a character has on: at most one item per slot, as item ids. */
export type Wear = ItemId[]

/** A sent or stored list ("crown,kente") as items we still draw, one per slot. */
export function asWear(v: unknown): Wear {
  const ids = typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : []
  const seen = new Set<Slot>()
  const out: Wear = []
  for (const id of ids) {
    const it = itemOf(String(id))
    if (it && !seen.has(it.slot)) {
      seen.add(it.slot)
      out.push(it.id)
    }
  }
  return out
}
/** for the room entry */
export const wearString = (w: Wear) => w.join(',')

/* ── What this player wears: saved on the device, like their character ── */

const KEY = 'lvs_wear'
const listeners = new Set<() => void>()
let cache: { raw: string | null; wear: Wear } = { raw: null, wear: [] }
function readWear(): Wear {
  const raw = load(KEY)
  if (raw !== cache.raw) cache = { raw, wear: asWear(raw) }
  return cache.wear
}
function subscribe(fn: () => void) {
  listeners.add(fn)
  window.addEventListener('storage', fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', fn)
  }
}
/** What I'm wearing (updates live). */
export const useWear = () => useSyncExternalStore(subscribe, readWear, () => [] as Wear)
export const myWear = readWear
/** Put an item on (taking off whatever was in its slot), or take it off. */
export function setWorn(id: ItemId, on: boolean) {
  const it = itemOf(id)!
  const rest = readWear().filter((x) => itemOf(x)!.slot !== it.slot)
  save(KEY, wearString(on ? [...rest, id] : rest))
  listeners.forEach((fn) => fn())
}

/* ── Drawing ───────────────────────────────────────────────────────── */

/** where the top edge of each head is (most are at 8) */
const TOP: Partial<Record<OpsStyle, number>> = { bot: 26, prime: 15 }
const K = { gold: '#f5b800', goldHi: '#ffd23f', red: '#e8291c', green: '#1f9d55', ink: INK, white: '#fbf7ee' }

function Hat({ id, t }: { id: ItemId; t: number }) {
  switch (id) {
    case 'party':
      return (
        <g className="opsw-hat">
          <path d={`M47 ${t - 30}L33 ${t + 6}H61Z`} fill="#ff5c8a" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d={`M42 ${t - 16}L52 ${t - 18}M38 ${t - 4}L56 ${t - 7}`} stroke={K.goldHi} strokeWidth="4" />
          <circle cx="47" cy={t - 31} r="5" fill={K.goldHi} stroke={INK} strokeWidth="2.5" />
        </g>
      )
    case 'snapback':
      return (
        <g className="opsw-hat">
          <path d={`M17 ${t + 7}Q17 ${t - 17} 47 ${t - 17}Q77 ${t - 17} 77 ${t + 7}Z`} fill="var(--seven)" stroke={INK} strokeWidth="3" />
          <path d={`M47 ${t - 17}V${t + 7}`} stroke={INK} strokeWidth="2" opacity=".5" />
          <path d={`M70 ${t + 2}H97Q98 ${t + 9} 90 ${t + 9}H70Z`} fill="var(--seven)" stroke={INK} strokeWidth="3" />
          <circle cx="47" cy={t - 17} r="3" fill={K.white} stroke={INK} strokeWidth="2" />
          <rect x="30" y={t - 7} width="16" height="7" fill={K.white} stroke={INK} strokeWidth="2" />
        </g>
      )
    case 'kufi':
      return (
        <g className="opsw-hat">
          <path d={`M21 ${t + 7}V${t - 3}Q21 ${t - 13} 47 ${t - 13}Q73 ${t - 13} 73 ${t - 3}V${t + 7}Z`} fill={K.white} stroke={INK} strokeWidth="3" />
          <path d={`M23 ${t}H71`} stroke={K.gold} strokeWidth="3" strokeDasharray="4 3" />
          {[31, 39, 47, 55, 63].map((x) => (
            <circle key={x} cx={x} cy={t - 6} r="1.6" fill={K.gold} />
          ))}
        </g>
      )
    case 'crown':
      return (
        <g className="opsw-hat">
          <path d={`M23 ${t + 7}V${t - 15}L35 ${t - 4}L47 ${t - 21}L59 ${t - 4}L71 ${t - 15}V${t + 7}Z`} fill={K.goldHi} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <rect x="23" y={t} width="48" height="7" fill={K.gold} stroke={INK} strokeWidth="2.5" />
          <circle cx="35" cy={t + 3.5} r="2.6" fill={K.red} />
          <circle cx="47" cy={t + 3.5} r="2.6" fill="var(--seven)" />
          <circle cx="59" cy={t + 3.5} r="2.6" fill={K.green} />
          <circle cx="47" cy={t - 21} r="3" fill={K.red} stroke={INK} strokeWidth="2" />
        </g>
      )
    default:
      return null
  }
}

function Neck({ id }: { id: ItemId }) {
  switch (id) {
    case 'kente':
      return (
        <g className="opsw-neck">
          <path d="M5 83H89V97H5Z" fill={K.goldHi} stroke={INK} strokeWidth="3" />
          {[5, 23, 41, 59, 77].map((x, i) => (
            <rect key={x} x={x + 2} y="85" width="10" height="10" fill={i % 2 ? K.green : K.red} />
          ))}
          <path d="M5 90H89" stroke={INK} strokeWidth="1.5" opacity=".6" />
          {/* the end hanging down */}
          <path d="M66 95L64 113H78L80 95Z" fill={K.goldHi} stroke={INK} strokeWidth="3" />
          <rect x="66" y="101" width="12" height="5" fill={K.green} />
          <path d="M65 113V117M69 113V117M73 113V117M77 113V117" stroke={INK} strokeWidth="2" />
        </g>
      )
    case 'jersey':
      return (
        <g className="opsw-neck">
          <path d="M-2 112V96Q-2 88 12 88H82Q96 88 96 96V112Z" fill={K.white} stroke={INK} strokeWidth="3" />
          <path d="M33 88L47 102L61 88" fill="none" stroke={K.red} strokeWidth="5" />
          <path d="M33 88L47 102L61 88" fill="none" stroke={K.goldHi} strokeWidth="2" />
          <path d={star(74, 100, 7)} fill={INK} />
          <path d="M-2 100H10M84 100H96" stroke={K.green} strokeWidth="4" />
        </g>
      )
    case 'tux':
      return (
        <g className="opsw-neck">
          <path d="M-2 112V96Q-2 88 12 88H82Q96 88 96 96V112Z" fill="#17151c" stroke={INK} strokeWidth="3" />
          <path d="M28 88L47 114L66 88Z" fill={K.white} stroke={INK} strokeWidth="2.5" />
          <path d="M31 87L45 94L31 101ZM63 87L49 94L63 101Z" fill="#17151c" stroke={K.white} strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="43" y="90" width="8" height="8" fill="#17151c" stroke={K.white} strokeWidth="1.5" />
          <circle cx="47" cy="106" r="1.8" fill="#17151c" />
        </g>
      )
    case 'fugu':
      return (
        <g className="opsw-neck">
          <defs>
            <pattern id="opsw-fugu" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#2c3e8f" />
              <rect width="3" height="8" fill={K.white} />
            </pattern>
          </defs>
          <path d="M-2 112V96Q-2 88 12 88H82Q96 88 96 96V112Z" fill="url(#opsw-fugu)" stroke={INK} strokeWidth="3" />
          <path d="M35 88Q47 100 59 88" fill={K.white} stroke={INK} strokeWidth="2.5" />
          <path d="M40 91Q47 97 54 91" fill="none" stroke={K.goldHi} strokeWidth="2" />
        </g>
      )
    default:
      return null
  }
}

/** The layers over a face: paint goes on as a class on the face, the neck and hat drawn on top. */
export function WearLayers({ look, wear }: { look: OpsStyle; wear: Wear }) {
  const hat = wear.find((w) => itemOf(w)?.slot === 'hat')
  const neck = wear.find((w) => itemOf(w)?.slot === 'neck')
  const out: ReactNode[] = []
  if (neck) out.push(<Neck key="neck" id={neck} />)
  if (hat) out.push(<Hat key="hat" id={hat} t={TOP[look] ?? 8} />)
  return <>{out}</>
}

/** the paint on, if any (a class for the face) */
export const paintOf = (wear: Wear) => wear.find((w) => itemOf(w)?.slot === 'paint') ?? null

/**
 * Gold paint: the face in greys, then every grey mapped onto a gold ramp (ink stays ink, mid tones
 * go deep gold, light ones bright gold), so a blue robot and a white die both come out solid gold.
 */
export const PAINT_FILTERS = (
  <defs>
    <filter id="opsw-gold" colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0.07 0.76 0.98 1" />
        <feFuncG type="table" tableValues="0.06 0.52 0.78 0.93" />
        <feFuncB type="table" tableValues="0.09 0.02 0.12 0.5" />
      </feComponentTransfer>
    </filter>
  </defs>
)
