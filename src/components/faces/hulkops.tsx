import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Hulkops (he): a huge green brute with a black mop of hair, a heavy brow and a square jaw. His fists
 * carry his mood: one raised when he's pleased, both pounding when he's cross. When he loses he
 * shrinks back into a pale little scientist in glasses, and he throws chunks of rubble.
 */

const SKIN = '#5fae3a'
const SHADE = '#3f8424'
const LINE = '#1f4a12'
const IRIS = '#b8ff5c'
/** the scientist he shrinks back into */
const PALE = '#f0d2b4'
const PALE_SHADE = '#d9b08c'
const HAIR = '#1d1a17'

type Pose = 'rest' | 'raise' | 'wave' | 'pound'
type Own = { /** his fists */ fist?: Pose; /** shrunk back into the scientist */ banner?: boolean }

/** One big green fist, knuckles up (a 30×26 box). */
function Fist({ fill = SKIN }: { fill?: string }) {
  return (
    <>
      <rect x="2" y="8" width="24" height="16" fill={fill} stroke={INK} strokeWidth="2.5" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={2 + i * 6} y="2" width="6" height="9" fill={fill} stroke={INK} strokeWidth="2" />
      ))}
      <rect x="-4" y="12" width="8" height="9" fill={fill} stroke={INK} strokeWidth="2" />
      <path d="M8 16h12" stroke={LINE} strokeWidth="1.5" />
    </>
  )
}

function Fists({ pose }: { pose: Pose }) {
  if (pose === 'rest') return null
  if (pose === 'pound')
    return (
      <>
        <g className="opsf-pound" transform="translate(-2 70) scale(.8)">
          <Fist />
        </g>
        <g className="opsf-pound opsf-pound--2" transform="translate(76 70) scale(.8)">
          <Fist />
        </g>
      </>
    )
  return (
    <g transform="translate(78 24) scale(.8) rotate(-8 14 14)">
      <g className={pose === 'wave' ? 'opsf-wave' : 'opsf-flex'}>
        <Fist />
      </g>
    </g>
  )
}

/** The fist on its own, big, for Hulk Smash (match/Ultimates.tsx). */
export function FistArt({ size }: { size: number }) {
  return (
    <svg viewBox="-6 0 34 26" width={size} height={size * (26 / 34)}>
      <Fist />
    </svg>
  )
}

/** A chunk of rubble with a bit of rebar sticking out, for his throw (a 40×40 box). */
export function RubbleArt() {
  return (
    <>
      <path d="M6 22l5-12 12-4 11 6 1 12-8 9-15 1z" fill="#a39a8c" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M11 10l6 8-6 6M23 6l-2 12 12 6M17 18l4 15" stroke="#6d665c" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      <path d="M30 9l6-6" stroke="#8a4b2a" strokeWidth="2.5" strokeLinecap="round" />
    </>
  )
}

const FACES: Faces<Own> = {
  idle: { brow: 'angry', eyes: 'glare', mouth: 'grit' },
  think: { brow: 'think', eyes: 'side', mouth: 'flat' },
  win: { brow: 'angry', eyes: 'glare', mouth: 'roar', own: { fist: 'raise' } },
  lose: { brow: 'sad', eyes: 'small', mouth: 'frown', own: { banner: true } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'raised', eyes: 'glare', mouth: 'grin', own: { fist: 'wave' } },
  wait: { brow: 'flat', eyes: 'side', mouth: 'grit' },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'o', wash: '#000', extra: ZZ },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk', own: { fist: 'raise' } },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'grin', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP, own: { banner: true } },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP, own: { banner: true } },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'roar', extra: SPARKLE, own: { fist: 'raise' } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'grin', own: { fist: 'raise' } },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN },
  gg: { brow: 'flat', eyes: 'happy', mouth: 'smile', own: { fist: 'wave' } },
  salty: { brow: 'furious', eyes: 'glare', mouth: 'grit', wash: 'var(--strike)', extra: STEAM, own: { fist: 'pound' } },
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
    own: { fist: 'pound' },
  },
}

export function Hulkops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const banner = !!f.own?.banner
  return (
    <Head fill={banner ? PALE : SKIN}>
      <clipPath id="opsf-brute-clip">
        <rect x="9" y="10" width="76" height="84" />
      </clipPath>
      <g clipPath="url(#opsf-brute-clip)">
        {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
        {/* the heavy brow, the square jaw, a scar over one eye (the scientist has none of it) */}
        {!banner && (
          <>
            <path d="M18 34h58" stroke={SHADE} strokeWidth="4" />
            <path d="M9 78h76v16H9z" fill={SHADE} />
            <path d="M68 26l6 14" stroke={LINE} strokeWidth="2" />
          </>
        )}
        {banner && <path d="M30 82q17 6 34 0" stroke={PALE_SHADE} strokeWidth="3" fill="none" />}
      </g>
      {/* the mop of hair: wild and spiky on him, tidy and thin on the scientist */}
      {banner ? (
        <path d="M7 8h80v9q-10-5-20-2t-20-1-20 2-20-2z" fill="#6b5641" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      ) : (
        <path className="opsf-mop" d="M3 22l6-10-3-9 10 5 6-8 6 7 8-8 6 8 8-7 6 8 9-5 4 9 10-2-5 10 3 6-9-3-4 8-8-5-8 6-8-6-8 6-8-6-8 5-4-8z" fill={HAIR} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      )}
      {brows(f.brow, banner ? 4 : 7)}
      <g className="opsf-eyes">{eyes(f.eyes, banner ? '#7a5a3a' : IRIS)}</g>
      {/* the scientist's glasses */}
      {banner && (
        <g fill="none" stroke={INK} strokeWidth="2.5">
          <rect x="22" y="33" width="20" height="14" />
          <rect x="52" y="33" width="20" height="14" />
          <path d="M42 39h10M22 38l-12-3M72 38l12-3" />
        </g>
      )}
      {mouth(f.mouth, banner ? '#7a3a2a' : LINE)}
      {f.extra}
      {f.own?.fist && <Fists pose={f.own.fist} />}
    </Head>
  )
}

/** What Hulkops says: loud, short words, always about smashing, and himself in the third person. */
export const HULKOPS_LINES: Lines = {
  taunt: ['HULK SMASH!', 'PUNY HUMAN', 'HULK STRONGEST THERE IS', 'RAAAGH!'],
  taunted: ['GET OUT OF HULK FACE', 'HULK NOT LIKE THAT'],
  ulted: ['HULK NOT HURT', 'HULK… ANGRIER NOW'],
  hello_easy: ['Hulk play nice. Maybe', 'Hulk say hi'],
  hello_medium: ['Hulk ready', 'Hulk play now'],
  hello_hard: ['HULK SMASH YOU', 'Puny human pick wrong game'],
  took: ['HULK SMASH!', 'Mine now', 'Hulk take that'],
  lost: ['HULK ANGRY', 'RAAGH', 'Hulk not like that'],
  lucky: ['Hulk lucky AND strong', 'HA!'],
  unlucky: ['Dice scared of Hulk', 'Hulk smash dice'],
  crushing: ['HULK STRONGEST THERE IS', 'Puny human. Puny'],
  ahead: ['Hulk winning', 'Hulk on top'],
  losing: ['Hulk getting ANGRY', 'Hulk… need moment'],
  behind: ['Hulk not done', 'Grrr'],
  blunder: ['HA! Puny move', 'Hulk see that'],
  brilliant: ['…Hulk impressed', 'Smart human. Hulk not like smart'],
  hurry: ['HULK WAITING', 'Move or Hulk smash clock'],
  sleep: ['Hulk tired', 'Hulk sleep now. Quiet'],
  fire_ahead: ['Hulk on fire too', 'Burn, puny human'],
  fire_behind: ['Fire not scare Hulk', 'Hulk put out fire. With fist'],
  fire_level: ['Hulk hot too', 'GRR'],
  lol_behind: ['STOP LAUGHING', 'Hulk not funny?'],
  lol: ['Hulk laugh too. HA', 'Why laugh?'],
  wow_ahead: ['Yes. Hulk amazing', 'Hulk know'],
  wow: ['WHOA', 'Hulk see it too'],
  grr_ahead: ['Hulk grr louder. GRRR', 'Little grr. Cute'],
  grr: ['Don’t make Hulk angry', 'You not like Hulk when angry'],
  gg: ['GG. Hulk say GG', 'Good game. Hulk hug you'],
  hurry_mine: ['Hulk thinking. Hard', 'Wait. Hulk count'],
  hurry_yours: ['YOUR TURN', 'Go go go'],
  win_final_hard: ['HULK STRONGEST THERE IS', 'HULK SMASH!'],
  win_final: ['Hulk win!', 'Good game, puny human'],
  lose_final_hard: ['AGAIN. HULK SAY AGAIN', 'HULK NOT DONE'],
  lose_final: ['…Bruce need lie down', 'Hulk lose. Hulk sad'],
  draw_final: ['Nobody smash', 'Hulk and human equal. Hmph'],
  hit_1: ['Tickle', 'Hulk not feel', 'Ha. Again'],
  hit_2: ['Stop that', 'Hulk getting angry'],
  hit_3: ['HULK SMASH!', 'THAT IT'],
  throw_back: ['HULK THROW!', 'CATCH', 'Rocks for you'],
  poke_1: ['Hm?', 'Hulk feel that'],
  poke_2: ['Stop poke Hulk', 'What'],
  poke_3: ['Hulk warning you', 'Grrr'],
  poke_4: ['HULK. SAYS. STOP', 'Last time'],
  poke_5: ['Hulk turning greener', 'GRRRR'],
  poke_6: ['RAAAAGH!', 'HULK SMASH FINGER'],
  sulk: ['Hulk not talk to you', 'Hmph', 'Hulk want be alone'],
  pet: ['…Hulk like', 'Hulk calm now', 'Nice human'],
  results_win: ['Hulk best', 'Again? Hulk smash again'],
  results_lose: ['Hulk need nap', 'Next time Hulk smash'],
  results_draw: ['Nobody win. Hulk confused', 'Even'],
}
