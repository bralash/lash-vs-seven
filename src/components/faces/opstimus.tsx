import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Opstimus (he): a robot leader with a blue helmet, a crest on his forehead, two tall antennae and
 * a silver face with bright blue eyes. His battle mask carries his mood: it slides shut over his
 * mouth when he's thinking, cross or on the attack, and opens when he smiles, talks or loses.
 * When he wins, his eyes blaze and the crest lights up.
 */

const HELMET = '#2f5fd0'
const HELMET_DEEP = '#1f3f94'
const SILVER = '#cfd6df'
const PLATE = '#a9b3c0'
const RED = '#d8262e'
const EYE = '#5fd4ff'

type Mask = { /** the battle mask over his mouth */ shut?: boolean; /** the crest glows */ glow?: boolean }

/** The battle mask: a silver plate over the mouth with vents down it. */
const PLATE_SHUT = (
  <g className="opsf-plate">
    <path d="M30 56h34l-4 30H34z" fill={PLATE} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
    <path d="M41 60v20M47 60v22M53 60v20" stroke={INK} strokeWidth="2" />
  </g>
)

const FACES: Faces<Mask> = {
  idle: { brow: 'angry', eyes: 'glare', mouth: 'flat', own: { shut: true } },
  think: { brow: 'think', eyes: 'side', mouth: 'flat', own: { shut: true } },
  win: { brow: 'raised', eyes: 'glare', mouth: 'smile', own: { glow: true } },
  lose: { brow: 'sad', eyes: 'shut', mouth: 'frown' },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'raised', eyes: 'glare', mouth: 'smile', extra: <Salute /> },
  wait: { brow: 'flat', eyes: 'side', mouth: 'flat', own: { shut: true } },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'o', wash: '#000', extra: ZZ, own: { shut: true } },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk' },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'grin', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'smile', extra: SPARKLE, own: { glow: true } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'grin', own: { glow: true } },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN },
  gg: { brow: 'flat', eyes: 'happy', mouth: 'smile', extra: <Salute /> },
  salty: { brow: 'furious', eyes: 'glare', mouth: 'grit', wash: 'var(--strike)', extra: STEAM, own: { shut: true } },
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
    mouth: 'grit',
    wash: 'var(--strike)',
    extra: (
      <>
        {VEIN}
        {STEAM}
      </>
    ),
    own: { shut: true, glow: true },
  },
}

/** a blue hand raised to the side of the helmet */
function Salute() {
  return (
    <g className="opsf-wave">
      <rect x="84" y="28" width="15" height="18" fill={HELMET} stroke={INK} strokeWidth="3" />
      <path d="M86 28v-7M91 28v-8M96 28v-7" stroke={INK} strokeWidth="3" />
      <rect x="84" y="40" width="15" height="6" fill={SILVER} stroke={INK} strokeWidth="2" />
    </g>
  )
}

export function Opstimus({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const glow = f.own?.glow
  return (
    <>
      {/* the antennae, up either side of the helmet */}
      <path d="M3 40V6l6-5v39zM91 40V6l-6-5v39z" fill={HELMET} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <Head fill={HELMET} y={15}>
        {/* the silver face inside the helmet, cheek lines down to the jaw */}
        <path d="M20 30L47 38 74 30V84L64 92H30L20 84z" fill={SILVER} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M22 50l8 18M72 50l-8 18" stroke={PLATE} strokeWidth="2.5" />
        {f.wash && <path d="M20 30L47 38 74 30V84L64 92H30L20 84z" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
        {/* the crest on his forehead */}
        <path className={glow ? 'opsf-crest opsf-crest--glow' : 'opsf-crest'} d="M40 15h14l-3 16-4 5-4-5z" fill={glow ? '#ffd23f' : HELMET_DEEP} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="9" y="58" width="8" height="18" fill={RED} stroke={INK} strokeWidth="2" />
        <rect x="77" y="58" width="8" height="18" fill={RED} stroke={INK} strokeWidth="2" />
      </Head>
      {brows(f.brow, 6)}
      <g className={glow ? 'opsf-eyes opsf-eyes--blaze' : 'opsf-eyes'}>{eyes(f.eyes, EYE)}</g>
      {f.own?.shut ? PLATE_SHUT : mouth(f.mouth, INK)}
      {f.extra}
    </>
  )
}

/** His truck, side on and facing right, for Roll Out (match/Ultimates.tsx). */
export function TruckArt({ width }: { width: number }) {
  return (
    <svg viewBox="0 0 124 62" width={width} height={width * (62 / 124)}>
      {/* exhaust stack, sleeper, cab and hood */}
      <rect x="34" y="2" width="5" height="34" fill={SILVER} stroke={INK} strokeWidth="2" />
      <rect x="6" y="14" width="30" height="32" fill={RED} stroke={INK} strokeWidth="2.5" />
      <rect x="36" y="10" width="40" height="36" fill={RED} stroke={INK} strokeWidth="2.5" />
      <rect x="44" y="15" width="24" height="13" fill="#bfe6ff" stroke={INK} strokeWidth="2" />
      <rect x="76" y="24" width="38" height="22" fill={RED} stroke={INK} strokeWidth="2.5" />
      {/* flames down the hood */}
      <path d="M80 34q6-6 10 0q5-7 10-1q4-5 8 1" stroke="#ffb020" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* the blue skirt along the bottom, the grille, the bumper */}
      <rect x="6" y="40" width="108" height="8" fill={HELMET} stroke={INK} strokeWidth="2" />
      <rect x="112" y="24" width="8" height="22" fill={SILVER} stroke={INK} strokeWidth="2" />
      <path d="M114 28v14M117 28v14" stroke={INK} strokeWidth="1.2" />
      {[24, 54, 98].map((x) => (
        <g key={x}>
          <circle cx={x} cy="50" r="10" fill={INK} />
          <circle cx={x} cy="50" r="4" fill={SILVER} />
        </g>
      ))}
    </svg>
  )
}

/** What Opstimus says: noble, calm, speeches for every occasion. */
export const OPSTIMUS_LINES: Lines = {
  taunt: ['Surrender your card', 'I salute your… effort', 'Inspection time'],
  taunted: ['Return to your post', 'Stand down, soldier'],
  ulted: ['Is that all you have?', 'I have been hit by worse'],
  hello_easy: ['Greetings, friend', 'Let us have a fair fight'],
  hello_medium: ['Opsbots, roll out!', 'Freedom is the right of all players'],
  hello_hard: ['One shall stand. One shall fall', 'Prepare yourself'],
  took: ['For the Opsbots!', 'Taken. With honour', 'A just strike'],
  lost: ['A fair hit', 'I will recover', 'Regroup'],
  lucky: ['The Matrix guides me', 'Fortune favours the brave'],
  unlucky: ['Even leaders stumble', 'A setback, nothing more'],
  crushing: ['Surrender is an option', 'Till all are mine'],
  ahead: ['Hold the line', 'Steady. Advance'],
  losing: ['I will not fall here', 'This is far from over'],
  behind: ['We fight on', 'Transform and adapt'],
  blunder: ['A soldier learns from mistakes', 'Are you certain of that?'],
  brilliant: ['A move worthy of a Prime', 'Impressive, soldier'],
  hurry: ['The battlefield waits for no one', 'Time to transform, friend'],
  sleep: ['Recharging…', 'Stand by mode'],
  fire_ahead: ['Fire does not frighten me', 'I was forged in fire'],
  fire_behind: ['You burn bright. For now', 'Noted, soldier'],
  fire_level: ['Then let the battle burn', 'We shall see'],
  lol_behind: ['Laugh. I will rise', 'Mockery is no strategy'],
  lol: ['I do not understand humour', 'Ha. Ha'],
  wow_ahead: ['Leadership', 'As planned'],
  wow: ['Remarkable', 'I did not compute that'],
  grr_ahead: ['Anger clouds judgement', 'Stay calm, soldier'],
  grr: ['Keep your head', 'Breathe. Focus'],
  gg: ['A noble battle', 'You fought with honour'],
  hurry_mine: ['A leader thinks before acting', 'Calculating'],
  hurry_yours: ['Your move, soldier', 'Roll out'],
  win_final_hard: ['One shall stand. I stand', 'Victory, with honour'],
  win_final: ['A fine battle', 'Until all are one'],
  lose_final_hard: ['I will return', 'This battle is yours. Not the war'],
  lose_final: ['You fought well, friend', 'I salute you'],
  draw_final: ['Neither falls today', 'An honourable draw'],
  hit_1: ['Armour holds', 'Hm.', 'Dented'],
  hit_2: ['Stand down', 'That is enough, soldier'],
  hit_3: ['You leave me no choice', 'Battle mask on'],
  throw_back: ['Energon, incoming', 'Catch, soldier', 'Return fire!'],
  poke_1: ['Yes, soldier?', 'Report'],
  poke_2: ['I am listening', 'Speak'],
  poke_3: ['That is my armour', 'Please refrain'],
  poke_4: ['I am losing patience', 'Stand down'],
  poke_5: ['Final warning', 'Mask on'],
  poke_6: ['ENOUGH', 'Opsbots, attack!'],
  sulk: ['…', 'Transforming away', 'I need a moment'],
  pet: ['…Thank you, friend', 'Kindness. Rare and valued', 'Till all are one'],
  results_win: ['Rest, soldier. Then again', 'You fought bravely'],
  results_lose: ['Well earned', 'I salute you'],
  results_draw: ['An honourable draw', 'Neither falls'],
}
