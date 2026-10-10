import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Trotrops (he), a trotro mate: the one hanging out of the sliding door of the minibus, calling the
 * stops and counting the fares. Short hair, a folded cedi note tucked behind his ear, a towel over
 * his head against the sun. He shouts the stops while he thinks, counts his money when he wins,
 * and when he loses his tro breaks down and smokes. He throws small-small coins.
 */

const SKIN = '#7a4a2e'
const HAIR = '#1e1713'
const LIP = '#e8b48c'
const IRIS = '#fbf7ee'
const NOTE = '#5fae6b'
const TOWEL = '#f2c94c'

type Own = { /** calling the stops: shout lines from his mouth */ calling?: boolean; /** the tro's broken down: smoke and soot */ broken?: boolean; /** a fan of notes: fares counted */ counting?: boolean }

/** Small-small coins, three of them (a 40×40 box), for his throw. */
export function CoinsArt() {
  const coin = (x: number, y: number, r: number) => (
    <g>
      <circle cx={x} cy={y} r={r} fill="#d9a62a" stroke={INK} strokeWidth="2" />
      <circle cx={x} cy={y} r={r - 3} fill="none" stroke="#f6dc7a" strokeWidth="1.5" />
    </g>
  )
  return (
    <>
      {coin(14, 24, 8)}
      {coin(27, 15, 7)}
      {coin(27, 29, 6)}
    </>
  )
}

/** A trotro from the side, its sliding door open with the mate leaning out, for his Kwaaa! (match/Ultimates.tsx). */
export function TrotroArt({ width }: { width: number }) {
  return (
    <svg viewBox="0 0 124 70" width={width} height={width * (70 / 124)}>
      {/* luggage on the roof rack */}
      <rect x="20" y="4" width="20" height="9" fill="#c47a3a" stroke={INK} strokeWidth="2" />
      <rect x="42" y="2" width="14" height="11" fill="#3a7bff" stroke={INK} strokeWidth="2" />
      <rect x="58" y="6" width="22" height="7" fill="#e5333b" stroke={INK} strokeWidth="2" />
      <path d="M14 14h76" stroke={INK} strokeWidth="2.5" />
      {/* the body: cream, a yellow stripe, the cab sloping down at the front (right) */}
      <path d="M8 15h86l18 16v22H8z" fill="#f1e9d6" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="8" y="38" width="104" height="5" fill={TOWEL} />
      <path d="M94 17l14 13H94z" fill="#bfe6ff" stroke={INK} strokeWidth="2" />
      {[14, 30].map((x) => (
        <rect key={x} x={x} y="19" width="13" height="11" fill="#bfe6ff" stroke={INK} strokeWidth="2" />
      ))}
      {/* the sliding door, open, and the mate leaning out of it */}
      <rect x="48" y="18" width="18" height="33" fill="#3d332b" stroke={INK} strokeWidth="2" />
      <g className="ult__mate">
        <rect x="58" y="16" width="14" height="14" fill={SKIN} stroke={INK} strokeWidth="2" />
        <path d="M58 16h14v4H58z" fill={HAIR} />
        <path d="M63 25h5" stroke={INK} strokeWidth="2" />
        <path d="M71 27l9-5" stroke={SKIN} strokeWidth="4" strokeLinecap="round" />
        <path d="M71 27l9-5" stroke={INK} strokeWidth="1" strokeLinecap="round" opacity=".5" />
      </g>
      {/* the slogan on the back */}
      <text x="12" y="49" fontSize="5.5" fontWeight="800" fontFamily="system-ui, sans-serif" fill={INK}>NO CONDITION IS PERMANENT</text>
      {[26, 92].map((x) => (
        <g key={x}>
          <circle cx={x} cy="56" r="10" fill={INK} />
          <circle cx={x} cy="56" r="4" fill="#c9cdd2" />
        </g>
      ))}
    </svg>
  )
}

const FACES: Faces<Own> = {
  idle: { brow: 'flat', eyes: 'glare', mouth: 'smirk' },
  think: { brow: 'raised', eyes: 'side', mouth: 'o', own: { calling: true } },
  win: { brow: 'raised', eyes: 'star', mouth: 'grin', own: { counting: true } },
  lose: { brow: 'sad', eyes: 'x', mouth: 'frown', own: { broken: true } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'raised', eyes: 'happy', mouth: 'roar', own: { calling: true } },
  wait: { brow: 'flat', eyes: 'side', mouth: 'o', own: { calling: true } },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'flat', wash: '#000', extra: ZZ },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk', own: { counting: true } },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'smirk', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'roar', extra: DROP, own: { calling: true } },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'grin', extra: SPARKLE, own: { counting: true } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'smile', own: { counting: true } },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN, own: { broken: true } },
  gg: { brow: 'flat', eyes: 'happy', mouth: 'smile' },
  salty: { brow: 'furious', eyes: 'glare', mouth: 'grit', wash: 'var(--strike)', extra: STEAM, own: { broken: true } },
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
    own: { calling: true },
  },
}

export function Trotrops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const own = f.own ?? {}
  return (
    <Head fill={SKIN}>
      <clipPath id="opsf-trotro-clip">
        <rect x="9" y="10" width="76" height="84" />
      </clipPath>
      <g clipPath="url(#opsf-trotro-clip)">
        {/* the towel over his head against the sun, its fringe over the brow */}
        <path d="M9 10h76v12q-38 6-76 0z" fill={TOWEL} />
        <path d="M14 22v4M22 23v4M30 24v4M38 24v4M46 24v4M54 24v4M62 24v4M70 23v4M78 22v4" stroke={TOWEL} strokeWidth="2.5" />
        <path d="M9 16h76" stroke="#e5333b" strokeWidth="2.5" />
        {/* short hair showing at the sides */}
        <path d="M9 22h7v14H9zM78 22h7v14h-7z" fill={HAIR} />
        {/* soot when the tro has broken down */}
        {own.broken && <path d="M18 52q6-4 10 1M62 56q6-5 12 0M40 84q8-3 14 1" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" opacity=".5" />}
        {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
      </g>
      {brows(f.brow, 5)}
      <g className="opsf-eyes">{eyes(f.eyes, IRIS)}</g>
      {mouth(f.mouth, LIP)}
      {/* the folded cedi note tucked behind his ear */}
      <g transform="rotate(-24 88 34)">
        <rect x="82" y="26" width="16" height="9" fill={NOTE} stroke={INK} strokeWidth="2" />
        <circle cx="90" cy="30.5" r="2.2" fill="none" stroke={INK} strokeWidth="1.2" />
      </g>
      {/* calling the stops: shout lines out of the side of his mouth */}
      {own.calling && (
        <g className="opsf-call" stroke={INK} strokeWidth="3" strokeLinecap="round">
          <path d="M62 62l10-4M63 68h11M62 74l10 4" />
        </g>
      )}
      {/* counted fares: a fan of notes in the corner */}
      {own.counting && (
        <g className="opsf-fan" stroke={INK} strokeWidth="1.8">
          <rect x="4" y="66" width="18" height="10" fill={NOTE} transform="rotate(-30 13 71)" />
          <rect x="4" y="68" width="18" height="10" fill="#7cc487" transform="rotate(-10 13 73)" />
          <rect x="4" y="70" width="18" height="10" fill={NOTE} transform="rotate(12 13 75)" />
        </g>
      )}
      {/* the tro broke down: smoke rising off the top */}
      {own.broken && (
        <g className="opsf-smoke" fill="#9a9a9a" stroke={INK} strokeWidth="2">
          <circle cx="70" cy="6" r="6" />
          <circle cx="80" cy="0" r="4.5" />
          <circle cx="62" cy="1" r="3.5" />
        </g>
      )}
      {f.extra}
    </Head>
  )
}

/** What Trotrops says: a trotro mate, loud, quick, always about the fare and the next stop. */
export const TROTROPS_LINES: Lines = {
  taunt: ['Circle! Circle!', 'Bus stop! You dey get down?', 'Your change? No change'],
  taunted: ['Chale, I’m working', 'Sit down, passenger'],
  ulted: ['Ei, who taught you that?', 'My tro has seen worse'],
  hello_easy: ['Enter, enter, there’s space', 'Akwaaba, passenger'],
  hello_medium: ['Kaneshie! Kaneshie!', 'One more, then we move'],
  hello_hard: ['Hold tight, we’re flying', 'This tro has no brakes'],
  took: ['Your fare, please', 'Ching ching', 'Next stop!'],
  lost: ['Herh!', 'Driver, stop!', 'Pothole!'],
  lucky: ['God is king', 'No condition is permanent'],
  unlucky: ['Flat tyre', 'Police checkpoint'],
  crushing: ['Full car! We dey go', 'Overtaking everyone'],
  ahead: ['Smooth road', 'Small small, we’re ahead'],
  losing: ['The tro is smoking', 'Traffic, traffic'],
  behind: ['We’ll overtake', 'Shortcut coming'],
  blunder: ['Ei, you missed your stop', 'Wrong car, chale'],
  brilliant: ['Sharp! Sharp!', 'Ayekoo'],
  hurry: ['Move, we are late', 'Driver no go wait'],
  sleep: ['Sleeping at the station', 'Wake me at Circle'],
  fire_ahead: ['Calm down, passenger', 'No fighting in my car'],
  fire_behind: ['Enjoy your ride', 'Yoo, I hear'],
  fire_level: ['Hold tight', 'Long road ahead'],
  lol_behind: ['Laugh, I’m still driving', 'Hehe, ok'],
  lol: ['Hahaha', 'Chale!'],
  wow_ahead: ['Told you, fastest tro', 'Ching ching'],
  wow: ['Ei!', 'Herh!'],
  grr_ahead: ['Relax, sit down', 'Take it easy'],
  grr: ['Easy, easy', 'Me, I’m calm'],
  gg: ['Safe journey', 'Ayekoo'],
  hurry_mine: ['Counting the change', 'One minute, one minute'],
  hurry_yours: ['Your stop, get down', 'Move small, move small'],
  win_final_hard: ['Last stop! Everybody down', 'Full car, full pocket'],
  win_final: ['We have arrived', 'Thank you for riding'],
  lose_final_hard: ['The tro has broken down', 'Push! Somebody push!'],
  lose_final: ['You paid well', 'Fair fare'],
  draw_final: ['Same fare, same stop', 'Nobody wins in traffic'],
  hit_1: ['Is that my change?', 'Ei', 'Coins? Thanks'],
  hit_2: ['Stop it, eh', 'I’ll charge you'],
  hit_3: ['Get down from my car!', 'Ei! Enough'],
  throw_back: ['Your change!', 'Small small coins!', 'Keep the change'],
  poke_1: ['Yes, passenger?', 'Eh?'],
  poke_2: ['Don’t touch the door', 'Careful'],
  poke_3: ['Sit down', 'Hmm'],
  poke_4: ['I’ll charge you double', 'Small small'],
  poke_5: ['One more and you walk', 'Try me'],
  poke_6: ['GET DOWN!', 'Driver, stop the car!'],
  sulk: ['…', 'I’m at the station', 'Not talking'],
  pet: ['Medaase', 'Ok, ok', 'Hehe, nice'],
  results_win: ['Next trip?', 'Enter, enter'],
  results_lose: ['Well driven', 'Next trip I’ll win'],
  results_draw: ['Even fare', 'Same road'],
}
