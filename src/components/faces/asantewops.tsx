import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Yaa Asantewops (she), after Nana Yaa Asantewaa, the queen mother of Ejisu who led the Asante
 * War of the Golden Stool in 1900 when the men held back. A tall kente headwrap rising above her
 * head, gold hoops and a string of gold beads. Her hoops sway while she weighs her move, the Golden
 * Stool shines beside her when she wins, and when she loses her headwrap comes loose. She throws an
 * Asante stool, and it lands on your head.
 */

const SKIN = '#6e4126'
const LIP = '#e2a77f'
const IRIS = '#fbf7ee'
const GOLD = '#f2c94c'
const GOLD_DK = '#c9971c'
const GREEN = '#1f8a4c'
const RED = '#d23a2c'
const WOOD = '#9a5b2e'

type Own = { /** her gold hoops sway while she thinks */ sway?: boolean; /** the Golden Stool shines beside her */ stool?: boolean; /** her headwrap's come loose */ loose?: boolean }

/** An Asante stool (a 40×40 box): curved seat, a carved middle post and four side posts, a flat base. */
function stool(fill: string, trim: string) {
  return (
    <g stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
      <rect x="6" y="29" width="28" height="5" fill={fill} />
      <rect x="9" y="17" width="3.5" height="12" fill={fill} />
      <rect x="27.5" y="17" width="3.5" height="12" fill={fill} />
      <path d="M15 17h10l-2 6 2 6H15l2-6z" fill={fill} />
      <path d="M5 9q15 10 30 0l1 5q-16 10-32 0z" fill={fill} />
      <path d="M9 13q11 6 22 0" stroke={trim} strokeWidth="1.5" fill="none" />
    </g>
  )
}

/** Her wooden stool, for her throw. */
export function StoolArt() {
  return stool(WOOD, '#d9955a')
}

/** The Golden Stool, bells hanging off its sides, with rays behind it, for her War of the Golden Stool (match/Ultimates.tsx). */
export function GoldenStoolArt({ size }: { size: number }) {
  return (
    <svg viewBox="-10 -10 60 60" width={size} height={size}>
      <g className="ult__rays" stroke={GOLD} strokeWidth="2.5" opacity=".8">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6
          return <path key={i} d={`M${20 + Math.cos(a) * 22} ${21 + Math.sin(a) * 22}L${20 + Math.cos(a) * 29} ${21 + Math.sin(a) * 29}`} />
        })}
      </g>
      {stool(GOLD, '#fff6c9')}
      {/* the bells on chains either side */}
      <g stroke={INK} strokeWidth="1.4">
        <path d="M6 14v8M34 14v8" />
        <path d="M3 22h6l-1 4H4zM31 22h6l-1 4h-4z" fill={GOLD_DK} />
      </g>
    </svg>
  )
}

/** One of her warriors running, shield up and spear out (a 30×40 box), for the charge in her Ultimate. */
export function WarriorArt({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 30 40" width={size * 0.75} height={size}>
      <g fill="#2a1a10" stroke="#2a1a10" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="15" cy="6" r="4" stroke="none" />
        <path d="M15 11l-2 13M13 24l-6 12M13 24l7 11M14 14l8 4M14 14l-7 5" strokeWidth="3.5" fill="none" />
        <path d="M2 2l26 20" strokeWidth="1.6" fill="none" />
      </g>
      <ellipse cx="22" cy="18" rx="5" ry="8" fill={GOLD} stroke="#2a1a10" strokeWidth="2" />
      <path d="M22 11v14" stroke={RED} strokeWidth="1.6" />
    </svg>
  )
}

const FACES: Faces<Own> = {
  idle: { brow: 'flat', eyes: 'glare', mouth: 'smirk' },
  think: { brow: 'think', eyes: 'side', mouth: 'flat', own: { sway: true } },
  win: { brow: 'raised', eyes: 'happy', mouth: 'grin', own: { stool: true } },
  lose: { brow: 'sad', eyes: 'x', mouth: 'frown', own: { loose: true } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'raised', eyes: 'glare', mouth: 'smile' },
  wait: { brow: 'one', eyes: 'side', mouth: 'flat', own: { sway: true } },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'flat', wash: '#000', extra: ZZ },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk', own: { stool: true } },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'smirk', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP, own: { sway: true } },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP, own: { sway: true } },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'grin', extra: SPARKLE, own: { stool: true } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'smile', own: { stool: true } },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN, own: { loose: true } },
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

/** the headwrap's outline: wrapped high, rising well above the head */
const WRAP = 'M6 23Q0 -8 18 -18Q47 -32 76 -18Q94 -8 88 23Q47 15 6 23z'

export function Asantewops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const own = f.own ?? {}
  return (
    <>
      <Head fill={SKIN}>
        <clipPath id="opsf-queen-clip">
          <rect x="9" y="10" width="76" height="84" />
        </clipPath>
        <g clipPath="url(#opsf-queen-clip)">
          {/* gold beads round her neck */}
          <path d="M14 94q33-12 66 0" stroke={INK} strokeWidth="1.5" fill="none" />
          {[18, 27, 37, 47, 57, 67, 76].map((x, i) => (
            <circle key={x} cx={x} cy={93 - (i === 0 || i === 6 ? 1 : i === 3 ? 5.5 : 4)} r="3.4" fill={GOLD} stroke={INK} strokeWidth="1.5" />
          ))}
          {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
        </g>
        {brows(f.brow, 5)}
        <g className="opsf-eyes">{eyes(f.eyes, IRIS)}</g>
        {mouth(f.mouth, LIP)}
        {/* a tear when she loses */}
        {own.loose && <path d="M66 46q-3 5-3 7a3 3 0 0 0 6 0q0-2-3-7z" fill="#8ec5ff" stroke={INK} strokeWidth="1.5" />}
      </Head>
      {/* gold hoops at her ears, swaying while she thinks */}
      <g className={own.sway ? 'opsf-sway' : undefined} fill="none" stroke={INK} strokeWidth="5">
        <circle cx="6" cy="60" r="6" />
        <circle cx="88" cy="60" r="6" />
      </g>
      <g className={own.sway ? 'opsf-sway' : undefined} fill="none" stroke={GOLD} strokeWidth="2.5">
        <circle cx="6" cy="60" r="6" />
        <circle cx="88" cy="60" r="6" />
      </g>
      {/* the kente headwrap: gold with green and red bands, a fold at the front; it slips when she loses */}
      <g transform={own.loose ? 'rotate(-9 47 14)' : undefined}>
        <clipPath id="opsf-queen-wrap">
          <path d={WRAP} />
        </clipPath>
        <path d={WRAP} fill={GOLD} />
        <g clipPath="url(#opsf-queen-wrap)">
          {[6, 26, 46, 66, 86].map((x) => (
            <g key={x}>
              <rect x={x} y="-34" width="7" height="60" fill={GREEN} />
              <rect x={x + 2.5} y="-34" width="2" height="60" fill={RED} />
            </g>
          ))}
          {[-20, -10, 0, 10].map((y) => (
            <path key={y} d={`M0 ${y}h96`} stroke={INK} strokeWidth="1.6" strokeDasharray="5 15" />
          ))}
        </g>
        <path d={WRAP} fill="none" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M37 -2q10-18 20 0q-10 8-20 0z" fill={GOLD} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M47 -15v12" stroke={RED} strokeWidth="2" />
        {/* the loose end hanging down past her cheek */}
        {own.loose && <path d="M10 20q-8 18-2 38l6-2q-4-16 2-34z" fill={GOLD} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />}
      </g>
      {/* the Golden Stool shining in the corner when she's winning */}
      {own.stool && (
        <g className="opsf-shine" transform="translate(-16 68) scale(.7)">
          <circle cx="20" cy="21" r="22" fill="#fff6c9" opacity=".7" />
          {stool(GOLD, '#fff6c9')}
        </g>
      )}
      {f.extra}
    </>
  )
}

/** What Yaa Asantewops says: a queen mother at war, proud, commanding, a few words of Twi. */
export const ASANTEWOPS_LINES: Lines = {
  taunt: ['Bow to the queen mother', 'Is this how you fight?', 'Asante kotoko!'],
  taunted: ['You dare come to my court?', 'Go back and sit down'],
  ulted: ['I have faced bigger armies', 'Is that all?'],
  hello_easy: ['Akwaaba. Sit, my child', 'Come, I will go easy'],
  hello_medium: ['Let us see what you carry', 'Show me your strength'],
  hello_hard: ['I went to war for less', 'The queen mother does not lose'],
  took: ['Mine now', 'Kneel', 'One more for Ejisu'],
  lost: ['A small loss. The war goes on', 'Hmm. Noted', 'Ei, you dare?'],
  lucky: ['The ancestors are with me', 'Nyame is smiling'],
  unlucky: ['The gods test me', 'Hmph. Again'],
  crushing: ['Lay down your arms', 'Surrender is no shame'],
  ahead: ['As expected', 'Steady, steady'],
  losing: ['I never retreat', 'The battle is not over'],
  behind: ['Now I am awake', 'Gather the warriors'],
  blunder: ['A soldier’s mistake', 'I saw that from Kumasi'],
  brilliant: ['Ei! A worthy enemy', 'You fight well, my child'],
  hurry: ['A queen does not wait', 'The drums are growing tired'],
  sleep: ['Wake me when you are ready', 'Even queens rest'],
  fire_ahead: ['Cool your temper', 'Anger loses wars'],
  fire_behind: ['Enjoy it. It will not last', 'I am coming'],
  fire_level: ['Careful, now', 'Steady hands win'],
  lol_behind: ['Laugh now', 'Hm. We shall see'],
  lol: ['Hahaha', 'You amuse me'],
  wow_ahead: ['Did you doubt me?', 'This is how it is done'],
  wow: ['Ei!', 'Now that is something'],
  grr_ahead: ['Calm yourself', 'Breathe, child'],
  grr: ['Patience', 'Do not shout at your elders'],
  gg: ['Ayekoo', 'A good fight'],
  hurry_mine: ['A queen thinks first', 'Let me consider'],
  hurry_yours: ['Your move', 'I am waiting'],
  win_final_hard: ['The Stool stays with Asante', 'Bow. It is finished'],
  win_final: ['Victory to Ejisu', 'Ayekoo, to me'],
  lose_final_hard: ['We fight again tomorrow', 'You won a battle. Not the war'],
  lose_final: ['Well fought. Medaase', 'I salute you'],
  draw_final: ['Neither of us bends', 'An honest peace'],
  hit_1: ['A stool?', 'Hm', 'Missed me'],
  hit_2: ['Respect your elders', 'Ei, stop that'],
  hit_3: ['You have chosen war', 'Enough, I said'],
  throw_back: ['Sit down!', 'Have a seat', 'Catch, child'],
  poke_1: ['Yes?', 'Hm?'],
  poke_2: ['Hands off the queen', 'Careful'],
  poke_3: ['Do you know who I am?', 'Ei'],
  poke_4: ['I am warning you', 'Small small'],
  poke_5: ['One more…', 'Try me'],
  poke_6: ['ENOUGH!', 'Call the warriors!'],
  sulk: ['…', 'The queen is not speaking', 'Hmph'],
  pet: ['Medaase', 'Good child', 'Hm, nice'],
  results_win: ['Another victory for Ejisu', 'Again?'],
  results_lose: ['Well fought, my child', 'Next time, war'],
  results_draw: ['Even', 'A fair fight'],
}
