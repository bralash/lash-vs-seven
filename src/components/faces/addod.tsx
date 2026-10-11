import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Addo D (he), after Nana Addo Dankwa Akufo-Addo, president of Ghana 2017–2025. A clean bald head,
 * his big round dark-rimmed glasses, a dark suit with a gold tie and a little
 * Ghana flag on the lapel. While he thinks he looks at you over the top of his glasses, when he
 * wins he flashes his V for victory, and when he loses his glasses go crooked and crack. He throws
 * a Free SHS textbook.
 */

const SKIN = '#7a4b2f'
const LIP = '#e8b48c'
const IRIS = '#fbf7ee'
const SUIT = '#1f2a44'
const TIE = '#f2c94c'
const FRAME = '#15120f'

type Own = { /** looking over the top of his glasses */ over?: boolean; /** the V for victory */ vee?: boolean; /** glasses crooked and cracked */ cracked?: boolean }

/** A Free SHS textbook (a 40×40 box), for his throw. */
export function BookArt() {
  return (
    <g stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
      <path d="M7 10h24v24H7z" fill="#fbf7ee" />
      <path d="M5 8h24v24H5z" fill="#1f8a4c" />
      <path d="M9 8v24" stroke={TIE} strokeWidth="2" />
      <text x="19.5" y="24" textAnchor="middle" fontSize="8" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#fbf7ee" stroke="none">SHS</text>
      <path d="M29 12h2M29 18h2M29 24h2M29 30h2" stroke="#c9c2b0" strokeWidth="1.2" />
    </g>
  )
}

/** A classroom chalkboard with FREE SHS chalked on it, for his Free SHS (match/Ultimates.tsx). */
export function ChalkboardArt({ width }: { width: number }) {
  return (
    <svg viewBox="0 0 120 80" width={width} height={width * (80 / 120)}>
      <rect x="4" y="4" width="112" height="66" fill="#8a5a2b" stroke={INK} strokeWidth="3" />
      <rect x="10" y="10" width="100" height="54" fill="#2f5d46" stroke={INK} strokeWidth="2" />
      <text x="60" y="34" textAnchor="middle" fontSize="17" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#f4f1e8" opacity=".95">FREE</text>
      <text x="60" y="55" textAnchor="middle" fontSize="17" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#f4f1e8" opacity=".95">SHS</text>
      <path d="M16 58q8-3 16 0M86 18q8-2 16 1" stroke="#f4f1e8" strokeWidth="1.2" fill="none" opacity=".5" />
      <rect x="14" y="70" width="92" height="5" fill="#6b431f" stroke={INK} strokeWidth="2" />
      <rect x="24" y="68" width="10" height="3" fill="#f4f1e8" />
    </svg>
  )
}

/** A graduation cap (a 40×30 box), tossed in the air in his Ultimate. */
export function CapArt({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 40 30" width={size} height={size * 0.75}>
      <path d="M20 4L38 11 20 18 2 11z" fill="#15120f" stroke="#15120f" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 14v7q10 5 20 0v-7l-10 4z" fill="#2a2622" />
      <path d="M33 13v9" stroke={TIE} strokeWidth="1.6" />
      <circle cx="33" cy="23" r="1.8" fill={TIE} />
    </svg>
  )
}

const FACES: Faces<Own> = {
  idle: { brow: 'flat', eyes: 'glare', mouth: 'smile' },
  think: { brow: 'raised', eyes: 'side', mouth: 'flat', own: { over: true } },
  win: { brow: 'raised', eyes: 'happy', mouth: 'grin', own: { vee: true } },
  lose: { brow: 'sad', eyes: 'x', mouth: 'frown', own: { cracked: true } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'raised', eyes: 'happy', mouth: 'smile', own: { vee: true } },
  wait: { brow: 'one', eyes: 'side', mouth: 'flat', own: { over: true } },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'flat', wash: '#000', extra: ZZ },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk', own: { over: true } },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'smirk', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP, own: { over: true } },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP, own: { cracked: true } },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'grin', extra: SPARKLE, own: { vee: true } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o', own: { over: true } },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown', own: { over: true } },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'smile', own: { vee: true } },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN, own: { cracked: true } },
  gg: { brow: 'flat', eyes: 'happy', mouth: 'smile', own: { vee: true } },
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

export function AddoD({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const own = f.own ?? {}
  // the glasses slide down his nose when he looks over them, and go crooked when he loses
  const specs = own.cracked ? 'rotate(-8 47 42) translate(0 2)' : own.over ? 'translate(0 7)' : undefined
  return (
    <>
      <Head fill={SKIN}>
        <clipPath id="opsf-addo-clip">
          <rect x="9" y="10" width="76" height="84" />
        </clipPath>
        <g clipPath="url(#opsf-addo-clip)">
          {/* a shine on his bald head */}
          <path d="M28 17q12-6 26-3" stroke="#a87553" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M62 15l4 1" stroke="#a87553" strokeWidth="3.5" strokeLinecap="round" />
          {/* the suit: dark lapels, white collar, gold tie, a flag on the lapel */}
          <path d="M9 94V84q14-2 24 4l14 6zM85 94V84q-14-2-24 4L47 94z" fill={SUIT} />
          <path d="M33 88l14 6 14-6-6-4H39z" fill="#fbf7ee" stroke={INK} strokeWidth="1.5" />
          <path d="M44 89h6l-1 5h-4z" fill={TIE} stroke={INK} strokeWidth="1.2" />
          <g transform="translate(70 87)">
            <rect width="7" height="1.6" fill="#d23a2c" />
            <rect y="1.6" width="7" height="1.6" fill={TIE} />
            <rect y="3.2" width="7" height="1.6" fill="#1f8a4c" />
          </g>
          {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
        </g>
        {brows(f.brow, 4)}
        <g className="opsf-eyes">{eyes(f.eyes, IRIS)}</g>
        {mouth(f.mouth, LIP)}
        {/* his big round dark-rimmed glasses */}
        <g transform={specs}>
          <g fill="rgb(255 255 255 / .08)" stroke={FRAME} strokeWidth="3.2">
            <circle cx="32" cy="41" r="9" />
            <circle cx="62" cy="41" r="9" />
          </g>
          <path d="M41 39q6-3 12 0M23 39l-14-3M71 39l14-3" stroke={FRAME} strokeWidth="3" fill="none" />
          {own.cracked && <path d="M57 36l5 6-3 3 5 3" stroke="#fbf7ee" strokeWidth="1.4" fill="none" />}
        </g>
      </Head>
      {/* V for victory beside his head */}
      {own.vee && (
        <g className="opsf-vee" stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M86 18l-3-14 5-1 3 13zM92 17l2-14 5 1-2 14z" fill={SKIN} />
          <rect x="83" y="16" width="15" height="14" rx="3" fill={SKIN} />
          <path d="M86 23h9" stroke={INK} strokeWidth="1.5" />
          <rect x="84" y="30" width="13" height="8" fill={SUIT} />
        </g>
      )}
      {f.extra}
    </>
  )
}

/** What Addo D says: the statesman, formal and warm, with the lines Ghana knows him for. */
export const ADDOD_LINES: Lines = {
  taunt: ['Fellow Ghanaians'],
  taunted: ['I have been through tougher campaigns', 'Order, order'],
  ulted: ['Noted, my brother', 'I have survived worse'],
  hello_easy: ['Akwaaba, my good friend', 'Let us play in peace'],
  hello_medium: ['Fellow citizen, shall we?', 'Every vote counts'],
  hello_hard: ['The battle is in our hands', 'Third time is the charm, I know it well'],
  took: ['Another policy delivered', 'Promise kept', 'Free, like SHS'],
  lost: ['A temporary setback', 'We will review it', 'Hmm. Noted'],
  lucky: ['Ghana is blessed', 'God bless our homeland'],
  unlucky: ['We shall overcome', 'The opposition is lucky'],
  crushing: ['A landslide', 'One touch!'],
  ahead: ['Steady progress', 'On course, as promised'],
  losing: ['We do not give up', 'The battle is still ours'],
  behind: ['Time for a new agenda', 'Let me consult my advisers'],
  blunder: ['That one, you will explain', 'My brother, what was that?'],
  brilliant: ['Excellent. Truly excellent', 'A worthy citizen'],
  hurry: ['The nation is waiting', 'Delay is costly'],
  sleep: ['Wake me for the swearing-in', 'Mm. Long cabinet meeting'],
  fire_ahead: ['Calm, my friend', 'Temper, temper'],
  fire_behind: ['Enjoy it while it lasts', 'The people will decide'],
  fire_level: ['Careful now', 'It is a close race'],
  lol_behind: ['Laugh. I am planning', 'We shall see at the polls'],
  lol: ['Hahaha', 'Very good, very good'],
  wow_ahead: ['As I said I would', 'Promise and fulfil'],
  wow: ['Wonderful', 'Now that is development'],
  grr_ahead: ['Peace, my friend', 'No need for violence'],
  grr: ['Let us be civil', 'Decorum, please'],
  gg: ['Ayekoo', 'Well contested'],
  hurry_mine: ['I am considering', 'Due process'],
  hurry_yours: ['Your move, fellow citizen', 'The floor is yours'],
  win_final_hard: ['The battle was in my hands', 'A resounding victory'],
  win_final: ['Thank you, fellow Ghanaians', 'Victory, as promised'],
  lose_final_hard: ['I will contest again', 'We go to the next round'],
  lose_final: ['I accept the results', 'Congratulations, my brother'],
  draw_final: ['A hung parliament', 'Shared power, then'],
  hit_1: ['A textbook?', 'Hm', 'Missed me'],
  hit_2: ['Read it, don’t throw it', 'That is government property'],
  hit_3: ['This is unacceptable', 'Enough, I say'],
  throw_back: ['Free SHS for you!', 'Go and learn', 'Catch, student'],
  poke_1: ['Yes?', 'Fellow citizen?'],
  poke_2: ['Mind the protocol', 'Careful'],
  poke_3: ['Do you know who I am?', 'Eh?'],
  poke_4: ['Security!', 'I am warning you'],
  poke_5: ['One more and…', 'Try me'],
  poke_6: ['ENOUGH!', 'Call the police!'],
  sulk: ['…', 'No comment', 'Speak to my press secretary'],
  pet: ['Medaase', 'Thank you, thank you', 'Very kind'],
  results_win: ['Another term?', 'The people have spoken'],
  results_lose: ['Well contested, my brother', 'Next election'],
  results_draw: ['Even', 'A fair contest'],
}
