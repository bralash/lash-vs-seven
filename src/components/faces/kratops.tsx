import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, wave, type Faces } from './parts'

/* Kratops (he): ash-grey head, a red war-paint stripe over the left eye, a scar, a heavy brow, a goatee. */

const ASH = '#d7d3cb'
const BEARD = '#2b2420'
const GOLD = '#f2c94c'

const FACES: Faces = {
  idle: { brow: 'angry', eyes: 'glare', mouth: 'flat' },
  think: { brow: 'think', eyes: 'side', mouth: 'flat' },
  win: { brow: 'angry', eyes: 'glare', mouth: 'roar' },
  lose: { brow: 'sad', eyes: 'shut', mouth: 'frown' },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'flat', eyes: 'glare', mouth: 'smirk', extra: wave(ASH) },
  wait: { brow: 'flat', eyes: 'side', mouth: 'flat' },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'o', wash: '#000', extra: ZZ },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk' },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'grin', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'smile', extra: SPARKLE },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'grin' },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN },
  gg: { brow: 'flat', eyes: 'happy', mouth: 'smile' },
  salty: { brow: 'furious', eyes: 'glare', mouth: 'grit', wash: 'var(--strike)', extra: STEAM },
  love: {
    brow: 'raised',
    eyes: 'heart',
    mouth: 'smile',
    extra: (
      <>
        {BLUSH}
        {HEARTS}
      </>
    ),
  },
  giggle: { brow: 'raised', eyes: 'squint', mouth: 'grin', extra: BLUSH },
  angry: {
    brow: 'furious',
    eyes: 'glare',
    mouth: 'roar',
    wash: 'var(--strike)',
    extra: (
      <>
        {VEIN}
        {STEAM}
      </>
    ),
  },
}

export function Kratops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  return (
    <Head fill={ASH}>
      <clipPath id="opsf-warrior-clip">
        <rect x="9" y="10" width="76" height="84" />
      </clipPath>
      <g clipPath="url(#opsf-warrior-clip)">
        {/* the stripe: over the scalp, down through the left eye, into the beard */}
        <path d="M26 6h13l-2 58h-9z" fill="#c4262e" />
        {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
        <path d="M27 58q20-5 40 0l-1 18q-6 14-19 18q-13-4-19-18z" fill={BEARD} />
        <path d="M33 56q14-4 28 0" stroke={BEARD} strokeWidth="5" fill="none" />
      </g>
      {brows(f.brow)}
      {/* a scar across the right brow */}
      <path d="M66 22l-6 18" stroke="#9c948a" strokeWidth="2.5" />
      <g className="opsf-eyes">{eyes(f.eyes, GOLD)}</g>
      {mouth(f.mouth, ASH)}
      {f.extra}
    </Head>
  )
}
