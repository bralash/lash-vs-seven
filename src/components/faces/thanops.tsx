import type { Lines } from '../../match/opsLines'
import type { CSSProperties } from 'react'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Thanops (he): a purple titan with a ridged chin, and his gold gauntlet with its six stones. The
 * stones carry his mood: dim at rest, lighting one by one while he thinks, blazing when he's ahead,
 * a snap when he wins, a red glow when he's cross, and falling out when he loses.
 */

const SKIN = '#9a6cc2'
const SHADE = '#7a4fa3'
const LINE = '#43255e'
const IRIS = '#6fc3ff'
const GOLD = '#f0b92e'
const GOLD_DEEP = '#c9971c'

/** knuckles left to right, then the thumb, then the big one on the back of the hand */
const STONES = [
  { cx: 5, cy: 6, r: 2.4, fill: '#3a7bff' },
  { cx: 11, cy: 6, r: 2.4, fill: '#e5333b' },
  { cx: 17, cy: 6, r: 2.4, fill: '#9b4dff' },
  { cx: 23, cy: 6, r: 2.4, fill: '#ffd23f' },
  { cx: -0.5, cy: 16.5, r: 2.4, fill: '#ff8c1a' },
  { cx: 14, cy: 16, r: 3.6, fill: '#2fbf5b' },
]

type Pose = 'rest' | 'raise' | 'wave' | 'snap' | 'clench'
type Stones = 'dim' | 'lit' | 'cycle' | 'gone' | 'falling'
type Gauntlet = { pose: Pose; stones: Stones }

const AT: Record<Pose, string> = {
  rest: 'translate(68 66)',
  // raised: out past the right edge of the head, clear of his eye
  raise: 'translate(77 26) scale(.82) rotate(-8 14 16)',
  wave: 'translate(77 24) scale(.82)',
  snap: 'translate(77 22) scale(.82) rotate(-12 14 16)',
  clench: 'translate(76 30) scale(.85)',
}

function Gauntlet({ pose, stones }: Gauntlet) {
  const empty = stones === 'gone' || stones === 'falling'
  return (
    <g className={`opsf-gauntlet opsf-gauntlet--${pose}`} transform={AT[pose]}>
      <g className={pose === 'wave' ? 'opsf-wave' : undefined}>
        {pose === 'clench' && <circle className="opsf-gauntlet__glow" cx="14" cy="14" r="18" fill="var(--strike)" opacity=".35" />}
        {/* cuff, back of the hand, knuckles, thumb */}
        <rect x="2" y="22" width="24" height="10" fill={GOLD_DEEP} stroke={INK} strokeWidth="2.5" />
        <rect x="2" y="8" width="24" height="16" fill={GOLD} stroke={INK} strokeWidth="2.5" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={2 + i * 6} y={pose === 'clench' ? 4 : 1} width="6" height="9" fill={GOLD} stroke={INK} strokeWidth="2" />
        ))}
        <rect x="-4" y="12" width="7" height="9" fill={GOLD} stroke={INK} strokeWidth="2" />
        {STONES.map((s, i) => (
          <circle
            key={i}
            className={`opsf-stone opsf-stone--${stones}`}
            style={{ '--i': i } as CSSProperties}
            cx={s.cx}
            cy={s.cy + (pose === 'clench' && i < 4 ? 3 : 0)}
            r={s.r}
            fill={empty ? '#4b3d16' : s.fill}
            stroke={INK}
            strokeWidth="1.2"
          />
        ))}
        {/* the snap: a burst off the fingertips */}
        {pose === 'snap' && <path className="opsf-snap" d="M8 -4l-2-6M14 -5v-7M20 -4l2-6M26 0l6-3" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />}
      </g>
      {/* stones that fell out, tumbling down past the cuff */}
      {stones === 'falling' &&
        STONES.slice(0, 4).map((s, i) => (
          <circle key={i} className="opsf-stone-fall" style={{ '--i': i } as CSSProperties} cx={s.cx - 4} cy={30} r="2.6" fill={s.fill} stroke={INK} strokeWidth="1.2" />
        ))}
    </g>
  )
}

const FACES: Faces<Gauntlet> = {
  idle: { brow: 'flat', eyes: 'glare', mouth: 'flat', own: { pose: 'rest', stones: 'dim' } },
  think: { brow: 'think', eyes: 'side', mouth: 'flat', own: { pose: 'rest', stones: 'cycle' } },
  win: { brow: 'angry', eyes: 'glare', mouth: 'smirk', own: { pose: 'snap', stones: 'lit' } },
  lose: { brow: 'sad', eyes: 'shut', mouth: 'frown', own: { pose: 'rest', stones: 'falling' } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat', own: { pose: 'rest', stones: 'dim' } },

  hello: { brow: 'flat', eyes: 'glare', mouth: 'smirk', own: { pose: 'wave', stones: 'lit' } },
  wait: { brow: 'flat', eyes: 'side', mouth: 'flat', own: { pose: 'rest', stones: 'dim' } },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'o', wash: '#000', extra: ZZ, own: { pose: 'rest', stones: 'dim' } },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk', own: { pose: 'raise', stones: 'lit' } },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'grin', extra: DROP, own: { pose: 'snap', stones: 'lit' } },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP, own: { pose: 'rest', stones: 'dim' } },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP, own: { pose: 'rest', stones: 'falling' } },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o', own: { pose: 'rest', stones: 'dim' } },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'smile', extra: SPARKLE, own: { pose: 'raise', stones: 'lit' } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o', own: { pose: 'raise', stones: 'lit' } },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown', own: { pose: 'rest', stones: 'dim' } },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'grin', own: { pose: 'raise', stones: 'lit' } },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN, own: { pose: 'rest', stones: 'gone' } },
  gg: { brow: 'flat', eyes: 'happy', mouth: 'smile', own: { pose: 'wave', stones: 'dim' } },
  salty: { brow: 'furious', eyes: 'glare', mouth: 'grit', wash: 'var(--strike)', extra: STEAM, own: { pose: 'clench', stones: 'lit' } },
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
    own: { pose: 'rest', stones: 'lit' },
  },
  giggle: { brow: 'raised', eyes: 'squint', mouth: 'grin', extra: BLUSH, own: { pose: 'rest', stones: 'dim' } },
  angry: {
    brow: 'furious',
    eyes: 'glare',
    mouth: 'grit',
    wash: 'var(--strike)',
    extra: (
      <>
        {VEIN}
        {STEAM}
      </>
    ),
    own: { pose: 'clench', stones: 'lit' },
  },
}

export function Thanops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  return (
    <Head fill={SKIN}>
      <clipPath id="opsf-titan-clip">
        <rect x="9" y="10" width="76" height="84" />
      </clipPath>
      <g clipPath="url(#opsf-titan-clip)">
        {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
        {/* a heavy brow ridge, and the ridged chin */}
        <path d="M30 20h34M35 14h24" stroke={SHADE} strokeWidth="3" />
        <path d="M30 76q17 8 34 0v18H30z" fill={SHADE} />
        <path d="M39 80v10M45 82v11M51 82v11M57 80v10" stroke={LINE} strokeWidth="2.5" />
      </g>
      {brows(f.brow, 6)}
      <g className="opsf-eyes">{eyes(f.eyes, IRIS)}</g>
      {mouth(f.mouth, LINE)}
      {f.extra}
      {f.own && <Gauntlet {...f.own} />}
    </Head>
  )
}

/** What Thanops says: calm, patient, everything is about balance. */
export const THANOPS_LINES: Lines = {
  hello_easy: ['Hello, little one', 'Shall we?'],
  hello_medium: ['Let us find balance', 'Shall we begin?'],
  hello_hard: ['I am inevitable', 'You should have gone home'],
  took: ['Balanced', 'A small price', 'Into the gauntlet'],
  lost: ['That… cost me', 'A sacrifice', 'Hm. Bold'],
  lucky: ['Fate agrees', 'As foretold'],
  unlucky: ['Even fate resists', 'A stone short'],
  crushing: ['Perfectly balanced', 'It was always going to end this way'],
  ahead: ['As it should be', 'The stones are pleased'],
  losing: ['Impossible…', 'This does not put a smile on my face'],
  behind: ['A setback', 'Interesting'],
  blunder: ['That was a mistake', 'You should have aimed higher'],
  brilliant: ['Clever, little one', 'Unexpected'],
  hurry: ['Time is a stone too', 'I can wait. Can you?'],
  sleep: ['Resting, as a titan does', 'Wake me for the snap'],
  fire_ahead: ['Burn out, then', 'Fire changes nothing'],
  fire_behind: ['Enjoy it', 'For now'],
  fire_level: ['We shall see', 'Balance will decide'],
  lol_behind: ['Laugh. It changes nothing', 'Mock me while you can'],
  lol: ['Amusing', 'Laughter. How small'],
  wow_ahead: ['Inevitable', 'You see it now'],
  wow: ['Unexpected', 'Even I did not foresee that'],
  grr_ahead: ['Rage. How small', 'Accept it'],
  grr: ['Calm yourself', 'Breathe, little one'],
  gg: ['Well played, child', 'You were a worthy test'],
  hurry_mine: ['Balance takes time', 'Patience'],
  hurry_yours: ['Your move', 'The stones are waiting'],
  win_final_hard: ['*snap*', 'Perfectly balanced'],
  win_final: ['Balanced, as all things should be', 'A fine game'],
  lose_final_hard: ['Again. I insist', 'This is not the end'],
  lose_final: ['You have earned a stone', 'Hm. Well played'],
  draw_final: ['Perfect balance', 'As it should be'],
  hit_1: ['A tickle', 'Hm.', 'Was that meant to hurt?'],
  hit_2: ['You are testing me', 'Careful, little one'],
  hit_3: ['Enough', 'You will get the snap'],
  throw_back: ['*snap*', 'Catch, little one', 'Balance restored'],
  poke_1: ['Hm?', 'Little one…'],
  poke_2: ['Curious, are you?', 'Yes?'],
  poke_3: ['Careful', 'Hm.'],
  poke_4: ['Don’t', 'I am counting'],
  poke_5: ['One more', 'My fingers are ready'],
  poke_6: ['I will snap you', 'ENOUGH'],
  sulk: ['…', 'You are dust to me', 'Gone. Like half of everything'],
  pet: ['…Fine', 'Balance', 'A rare kindness'],
  results_win: ['Good effort, little one', 'Again?'],
  results_lose: ['A rare loss', 'Savour it'],
  results_draw: ['Balanced', 'Perfectly even'],
}
