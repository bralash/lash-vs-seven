import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Ghops (he): a soldier in a black balaclava with a white skull printed over it; only his eyes show,
 * through a band of skin smudged with black paint. A headset hangs on one side, its comms light
 * blinking while he thinks. Shades go on when he wins; the skull cracks when he loses. He throws
 * flashbangs.
 */

const MASK = '#26262b'
const BONE = '#ece8de'
const SKIN = '#c9a27e'
const PAINT = '#3a302b'
const IRIS = '#8fb8d8'

type Own = { /** shades on */ shades?: boolean; /** the skull print cracked */ cracked?: boolean; /** the comms light blinks */ comms?: boolean }

/** A flashbang: a grey canister with its lever and pin (a 40×40 box), for his throw. */
export function FlashArt() {
  return (
    <>
      <rect x="12" y="12" width="16" height="22" fill="#8b9097" stroke={INK} strokeWidth="2.5" />
      <path d="M12 18h16M12 28h16" stroke={INK} strokeWidth="1.5" />
      <rect x="15" y="7" width="10" height="6" fill="#5c6168" stroke={INK} strokeWidth="2" />
      <path d="M25 9q8 1 6 12" stroke={INK} strokeWidth="2.5" fill="none" />
      <circle cx="11" cy="7" r="3.5" fill="none" stroke="#c9971c" strokeWidth="2" />
    </>
  )
}

/** The reticle that locks onto the board for his Airstrike (match/Ultimates.tsx). */
export function ReticleArt({ size }: { size: number }) {
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} fill="none">
      <circle r="40" stroke="#e8291c" strokeWidth="3" />
      <circle r="22" stroke="#e8291c" strokeWidth="2" strokeDasharray="6 5" />
      <path d="M-48 0h20M28 0h20M0 -48v20M0 28v20" stroke="#e8291c" strokeWidth="3" />
      <circle r="3" fill="#e8291c" />
    </svg>
  )
}

const FACES: Faces<Own> = {
  idle: { brow: 'flat', eyes: 'glare', mouth: 'flat' },
  think: { brow: 'think', eyes: 'side', mouth: 'flat', own: { comms: true } },
  win: { brow: 'flat', eyes: 'glare', mouth: 'smirk', own: { shades: true } },
  lose: { brow: 'sad', eyes: 'shut', mouth: 'frown', own: { cracked: true } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'raised', eyes: 'glare', mouth: 'smirk', own: { comms: true } },
  wait: { brow: 'flat', eyes: 'side', mouth: 'flat', own: { comms: true } },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'flat', wash: '#000', extra: ZZ },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk', own: { shades: true } },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'smirk', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP, own: { comms: true } },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP, own: { comms: true } },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'smirk', extra: SPARKLE, own: { shades: true } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'smile' },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN, own: { cracked: true } },
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
  giggle: { brow: 'raised', eyes: 'squint', mouth: 'smile', extra: BLUSH },
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
  },
}

export function Ghops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const own = f.own ?? {}
  return (
    <Head fill={MASK}>
      <clipPath id="opsf-ghost-clip">
        <rect x="9" y="10" width="76" height="84" />
      </clipPath>
      <g clipPath="url(#opsf-ghost-clip)">
        {/* the skull print: the dome of the forehead, the nose, the rows of teeth */}
        <path d="M22 20q25-14 50 0" stroke={BONE} strokeWidth="3" fill="none" />
        <path d="M43 54h8l-4 8z" fill={BONE} />
        <path d="M30 78h34v10H30z" fill={BONE} />
        <path d="M36 78v10M41 78v10M47 78v10M53 78v10M58 78v10M30 83h34" stroke={MASK} strokeWidth="1.5" />
        {own.cracked && <path d="M58 16l-6 10 5 6-7 12M34 80l4 6" stroke={MASK} strokeWidth="2.5" fill="none" />}
        {/* the eye holes: skin, smudged with black paint */}
        <rect x="9" y="22" width="76" height="28" fill={SKIN} />
        <path d="M18 30h22v16H18zM54 30h22v16H54z" fill={PAINT} opacity=".55" />
        {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
      </g>
      {brows(f.brow, 5)}
      <g className="opsf-eyes">{eyes(f.eyes, IRIS)}</g>
      {/* shades over the eye holes */}
      {own.shades && (
        <g className="opsf-shades">
          <path d="M20 34h22l-2 10H22zM52 34h22l-2 10H54z" fill={INK} />
          <path d="M42 36h10M10 36h10M74 36h10" stroke={INK} strokeWidth="3" />
          <path d="M25 37l5-2M57 37l5-2" stroke="#fff" strokeWidth="2" />
        </g>
      )}
      {mouth(f.mouth, BONE)}
      {/* the headset: an earpiece on the left, the mic boom, the comms light */}
      <rect x="2" y="34" width="8" height="16" fill="#4a4d52" stroke={INK} strokeWidth="2.5" />
      <path d="M8 48q4 16 22 18" stroke={INK} strokeWidth="2.5" fill="none" />
      <circle className={own.comms ? 'opsf-comms' : undefined} cx="6" cy="38" r="2" fill={own.comms ? '#5dff7a' : '#2f6b3a'} />
      {f.extra}
    </Head>
  )
}

/** What Ghops says: few words, British, all radio talk. */
export const GHOPS_LINES: Lines = {
  taunt: ['Boo.', 'You didn’t see me', 'Ghost was here'],
  taunted: ['Bold. Very bold', 'Back off, mate'],
  ulted: ['Felt that', 'Noted'],
  hello_easy: ['Alright, mate', 'Eyes on'],
  hello_medium: ['Ghost, on comms', 'Let’s get to work'],
  hello_hard: ['You won’t see me coming', 'Comms are hot'],
  took: ['Target down', 'Clean', 'Tango down'],
  lost: ['Contact', 'Took a hit', 'Bloody hell'],
  lucky: ['Lucky shot', 'I’ll take it'],
  unlucky: ['Comms are down', 'Not ideal'],
  crushing: ['Mission’s going well', 'Area secure'],
  ahead: ['Ahead of schedule', 'Holding position'],
  losing: ['Need backup', 'This is bad'],
  behind: ['Regrouping', 'Fall back'],
  blunder: ['Sloppy', 'You left yourself open'],
  brilliant: ['Not bad, mate', 'Didn’t see that'],
  hurry: ['We’re burning daylight', 'Any day now'],
  sleep: ['Resting my eyes', 'Wake me when it’s time'],
  fire_ahead: ['Easy, rookie', 'Cool it'],
  fire_behind: ['Fair', 'Enjoy it'],
  fire_level: ['Steady', 'Long way to go'],
  lol_behind: ['Laugh it up', 'Funny, is it?'],
  lol: ['Heh', 'Not bad'],
  wow_ahead: ['Told you', 'That’s the job'],
  wow: ['Huh', 'Didn’t expect that'],
  grr_ahead: ['Keep calm', 'Breathe, mate'],
  grr: ['Easy', 'Stay frosty'],
  gg: ['Good work', 'GG, mate'],
  hurry_mine: ['Patience', 'Thinking'],
  hurry_yours: ['Your move', 'Go, go'],
  win_final_hard: ['Mission complete', 'Ghost, out'],
  win_final: ['Good game, mate', 'Job done'],
  lose_final_hard: ['Again. Now', 'We go again'],
  lose_final: ['Well played', 'You got me'],
  draw_final: ['Stalemate', 'Call it even'],
  hit_1: ['Flashbang? Cute', 'Hm', 'Missed'],
  hit_2: ['Knock it off', 'Careful'],
  hit_3: ['Right. That’s it', 'You’re done'],
  throw_back: ['Flash out!', 'Catch', 'Your turn'],
  poke_1: ['Oi', 'What'],
  poke_2: ['Hands off', 'Don’t'],
  poke_3: ['Last warning', 'Hm'],
  poke_4: ['I said don’t', 'Back off'],
  poke_5: ['One more', 'Try me'],
  poke_6: ['Right, mate', 'ENOUGH'],
  sulk: ['…', 'Going dark', 'Radio silence'],
  pet: ['…Cheers', 'Fine', 'Not bad'],
  results_win: ['Debrief later', 'Again?'],
  results_lose: ['Good shooting', 'Next time'],
  results_draw: ['Even', 'Stalemate'],
}
