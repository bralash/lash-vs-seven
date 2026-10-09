import type { ReactNode } from 'react'
import type { BaseMood, ReactMood } from '../OpsFace'

/*
 * The pieces every Ops face is drawn from (a 100×100 box): the square head, and for the character
 * looks a kit of brows, eyes and mouths, so a new character is a head, a few features of its own
 * and a table saying which pieces each mood uses.
 */

export const INK = 'var(--ink)'

/** The square head every style shares: hard offset shadow, thick ink edge. */
export function Head({ fill, y = 8, children }: { fill: string; y?: number; children?: ReactNode }) {
  return (
    <>
      <rect x="13" y={y + 6} width="80" height={88 - y} fill={INK} />
      <rect x="7" y={y} width="80" height={88 - y} fill={fill} stroke={INK} strokeWidth="4" />
      {children}
    </>
  )
}

/** A sweat drop on the top-right corner of the head. */
export const DROP = <path className="opsf-drop" d="M84 4q-6 8-6 12a6 6 0 0 0 12 0q0-4-6-12z" fill="#8ec5ff" stroke={INK} strokeWidth="2.5" />
/** A heart centred on (cx, cy), r across from the middle to each lobe's edge. */
export const heart = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy + r}L${cx - r} ${cy - r * 0.1}A${r / 2} ${r / 2} 0 0 1 ${cx} ${cy - r * 0.55}A${r / 2} ${r / 2} 0 0 1 ${cx + r} ${cy - r * 0.1}Z`
/** A four-point star centred on (cx, cy). */
export const star = (cx: number, cy: number, r: number) => {
  const k = r * 0.3
  return `M${cx} ${cy - r}L${cx + k} ${cy - k} ${cx + r} ${cy} ${cx + k} ${cy + k} ${cx} ${cy + r} ${cx - k} ${cy + k} ${cx - r} ${cy} ${cx - k} ${cy - k}Z`
}

/* ── Props around the head, shared by the character looks ── */

export const BLUSH = (
  <>
    <rect x="18" y="47" width="9" height="4" fill="#ff7aa8" opacity=".9" />
    <rect x="67" y="47" width="9" height="4" fill="#ff7aa8" opacity=".9" />
  </>
)
export const STEAM = (
  <g className="opsf-steam" fill="var(--slot)" stroke={INK} strokeWidth="2.5">
    <circle cx="6" cy="10" r="5" />
    <circle cx="93" cy="6" r="5" />
  </g>
)
export const ZZ = (
  <g className="opsf-zz" fill={INK} fontFamily="var(--mono)" fontWeight="700">
    <text x="80" y="10" fontSize="13">z</text>
    <text x="90" y="0" fontSize="18">Z</text>
  </g>
)
export const SPARKLE = <path className="opsf-sparkle" d={star(91, 10, 9)} fill="var(--hit)" stroke={INK} strokeWidth="2.5" />
export const RAIN = (
  <>
    <path className="opsf-rain" d="M32 18v6M44 20v6M56 18v6" stroke="#8ec5ff" strokeWidth="2.5" />
    <path d="M26 15a7 7 0 0 1 4-12 9 9 0 0 1 17-1 7 7 0 0 1 11 6 6 6 0 0 1 0 7z" fill="var(--dim)" stroke={INK} strokeWidth="2.5" />
  </>
)
export const VEIN = <path className="opsf-vein" d="M84 6v5h-5M90 6v5h5M84 20v-5h-5M90 20v-5h5" stroke="var(--strike)" strokeWidth="3" fill="none" />
export const HEARTS = (
  <g className="opsf-hearts" fill="#ff5c8a" stroke={INK} strokeWidth="2.5">
    <path d={heart(88, 12, 7)} />
    <path d={heart(8, 20, 5)} />
  </g>
)
/** A hand waving from the right of the head, in the character's colour. */
export const wave = (fill: string) => (
  <g className="opsf-wave">
    <rect x="84" y="28" width="15" height="18" fill={fill} stroke={INK} strokeWidth="3" />
    <path d="M88 28v-6M94 28v-7" stroke={INK} strokeWidth="3" />
  </g>
)

/* ── Features: brows, eyes (centred on x 32 and 62, y 40) and a mouth (around y 67) ── */

export type Brow = 'angry' | 'furious' | 'flat' | 'raised' | 'sad' | 'one' | 'think'
export type Eyes = 'glare' | 'happy' | 'shut' | 'wide' | 'x' | 'side' | 'small' | 'line' | 'wink' | 'squint' | 'heart' | 'star'
export type Mouth = 'flat' | 'frown' | 'smile' | 'roar' | 'grin' | 'o' | 'zig' | 'smirk' | 'grit'

export const BROWS: Record<Brow, string> = {
  angry: 'M24 28l14 6M70 28l-14 6',
  furious: 'M23 25l15 9M71 25l-15 9',
  flat: 'M24 31h13M57 31h13',
  raised: 'M24 27l13-3M70 27l-13-3',
  sad: 'M24 33l13-4M70 33l-13-4',
  one: 'M24 31h13M57 25l13 4',
  think: 'M24 32l13 3M57 27l13 1',
}

export function brows(b: Brow, width = 5) {
  return <path className="opsf-char__brow" d={BROWS[b]} stroke={INK} strokeWidth={b === 'furious' ? width + 1 : width} strokeLinecap="square" fill="none" />
}

/** The eyes; `iris` colours the open ones (gold for Kratops, blue for Thanops…). */
export function eyes(e: Eyes, iris: string): ReactNode {
  const pair = (f: (cx: number) => ReactNode) => (
    <>
      {f(32)}
      {f(62)}
    </>
  )
  switch (e) {
    case 'glare':
      return pair((cx) => <rect key={cx} className="opsf-char__eye" x={cx - 4} y="37" width="8" height="6" fill={iris} stroke={INK} strokeWidth="2" />)
    case 'happy':
      return <path d="M27 43l5-5 5 5M57 43l5-5 5 5" stroke={INK} strokeWidth="4" fill="none" />
    case 'shut':
      return <path d="M27 40q5 4 10 0M57 40q5 4 10 0" stroke={INK} strokeWidth="3.5" fill="none" />
    case 'wide':
      return pair((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="40" r="6" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <circle cx={cx} cy="40" r="2.5" fill={INK} />
        </g>
      ))
    case 'x':
      return <path d="M28 36l8 8M36 36l-8 8M58 36l8 8M66 36l-8 8" stroke={INK} strokeWidth="3.5" />
    case 'side':
      return <g className="opsf-glance">{pair((cx) => <rect key={cx} x={cx - 3} y="37" width="7" height="6" fill={iris} stroke={INK} strokeWidth="2" />)}</g>
    case 'small':
      return pair((cx) => <rect key={cx} x={cx - 2} y="38" width="4" height="4" fill={INK} />)
    case 'line':
      return <path d="M27 40h10M57 40h10" stroke={INK} strokeWidth="4" />
    case 'wink':
      return (
        <>
          <rect x="28" y="37" width="8" height="6" fill={iris} stroke={INK} strokeWidth="2" />
          <path d="M57 41q5-5 10 0" stroke={INK} strokeWidth="4" fill="none" />
        </>
      )
    case 'squint':
      return <path d="M27 36l9 4-9 4M67 36l-9 4 9 4" stroke={INK} strokeWidth="3.5" fill="none" />
    case 'heart':
      return pair((cx) => <path key={cx} className="opsf-beat" d={heart(cx, 41, 6)} fill="#ff5c8a" stroke={INK} strokeWidth="1.5" />)
    case 'star':
      return pair((cx) => <path key={cx} className="opsf-stars" d={star(cx, 40, 8)} fill="#f2c94c" stroke={INK} strokeWidth="1.5" />)
  }
}

/** The mouth; `line` is its stroke (light on a beard, dark on skin). */
export function mouth(m: Mouth, line: string): ReactNode {
  switch (m) {
    case 'flat':
      return <path d="M38 67h18" stroke={line} strokeWidth="4" />
    case 'frown':
      return <path d="M38 71q9-7 18 0" stroke={line} strokeWidth="4" fill="none" />
    case 'smile':
      return <path d="M38 65q9 7 18 0" stroke={line} strokeWidth="4" fill="none" />
    case 'smirk':
      return <path d="M39 68q9 2 16-5" stroke={line} strokeWidth="4" fill="none" />
    case 'o':
      return <ellipse cx="47" cy="68" rx="5" ry="5" fill="#5a1515" stroke={line} strokeWidth="2.5" />
    case 'zig':
      return <path d="M37 68l3-3 3 3 3-3 3 3 3-3 3 3" stroke={line} strokeWidth="3" fill="none" />
    case 'grin':
      return <path d="M37 63h20q-2 9-10 9t-10-9z" fill="#fff" stroke={INK} strokeWidth="2" />
    case 'grit':
      return (
        <>
          <rect x="37" y="63" width="20" height="8" fill="#fff" stroke={INK} strokeWidth="2" />
          <path d="M42 63v8M47 63v8M52 63v8M37 67h20" stroke={INK} strokeWidth="1.5" />
        </>
      )
    case 'roar':
      return (
        <>
          <path d="M36 62h22l-3 13H39z" fill="#5a1515" stroke={INK} strokeWidth="3" />
          <path d="M38 62h18v4H38z" fill="#fff" />
        </>
      )
  }
}

/** One mood for a character look: which features, plus anything drawn on top or washed over. */
export interface Face<X = never> {
  brow: Brow
  eyes: Eyes
  mouth: Mouth
  extra?: ReactNode
  /** a wash over the face: red when cross, dark when asleep */
  wash?: string
  /** something of the character's own (Thanops' gauntlet…) */
  own?: X
}

/** A character's full table: its five base moods and a face for every reaction. */
export type Faces<X = never> = Record<BaseMood, Face<X>> & Record<ReactMood, Face<X>>
