import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, eyes, mouth, type Brow, type Eyes, type Faces } from './parts'

/*
 * Spidops (he): a red mask with a web over it and two big white lenses. A mask has no brows, so
 * the lenses do the work: the brow in each mood tilts and squashes them instead. His spider-sense
 * buzzes round his head when he's thinking or worried, he shoots a web from his hand when he's
 * pleased, and when he loses he hangs upside down from a thread.
 */

const MASK = '#d8262e'
const WEB = '#7d0d14'
const LINE = '#4a070c'

/** A spider's web around (0, 0): `spokes` threads out to radius r, and `rings` sagging rings between them. */
export function webPath(r: number, spokes = 8, rings = 4) {
  const at = (rad: number, a: number) => `${(Math.cos(a) * rad).toFixed(1)} ${(Math.sin(a) * rad).toFixed(1)}`
  const angle = (i: number) => (i / spokes) * Math.PI * 2 - Math.PI / 2
  let d = ''
  for (let i = 0; i < spokes; i++) d += `M0 0L${at(r, angle(i))}`
  for (let k = 1; k <= rings; k++) {
    const rad = (r * k) / (rings + 0.4)
    d += `M${at(rad, angle(0))}`
    for (let i = 0; i < spokes; i++) d += `Q${at(rad * 0.8, (angle(i) + angle(i + 1)) / 2)} ${at(rad, angle(i + 1))}`
  }
  return d
}

/** The web on his mask, drawn once. */
const MASK_WEB = webPath(62, 10, 4)

/* ── the lenses: centred on x 30 and 64, y 40; the right one is the left mirrored ── */

const LENS = 'M-11 -5Q-2 -11 9 1Q5 8 -3 7Q-12 5 -11 -5Z'
const LENS_HAPPY = 'M-11 -1Q-1 -11 9 1Q-1 -4 -11 -1Z'

/** how each brow tilts (degrees) and squashes (height) the [left, right] lens */
const TILT: Record<Brow, [number, number, number, number]> = {
  flat: [0, 0, 1, 1],
  angry: [12, 12, 0.75, 0.75],
  furious: [18, 18, 0.6, 0.6],
  raised: [-4, -4, 1.15, 1.15],
  sad: [-14, -14, 0.9, 0.9],
  one: [0, -6, 0.85, 1.15],
  think: [8, -4, 0.7, 1.05],
}

/** these the kit already draws well enough over a mask (in white) */
const KIT = new Set<Eyes>(['x', 'squint', 'heart', 'star'])

function lens(e: Eyes, cx: number, side: 1 | -1, rot: number, sy: number) {
  const at = `translate(${cx} 40) scale(${side} 1) rotate(${rot})`
  if (e === 'shut') return <path key={cx} transform={at} d="M-10 0Q0 4 9 1" stroke={INK} strokeWidth="3.5" fill="none" />
  if (e === 'line') return <path key={cx} transform={at} d="M-10 0H9" stroke={INK} strokeWidth="3.5" />
  const shape = e === 'happy' ? LENS_HAPPY : LENS
  const s = e === 'wide' ? 1.1 : e === 'small' ? 0.7 : 1
  const h = sy * (e === 'wide' ? 1.15 : e === 'small' ? 0.6 : e === 'side' ? 0.7 : e === 'glare' ? 0.9 : 1)
  return <path key={cx} className="opsf-lens" transform={`${at} scale(${s} ${s * h})`} d={shape} fill="#fff" stroke={INK} strokeWidth={3 / s} strokeLinejoin="round" />
}

function lenses(e: Eyes, b: Brow) {
  if (KIT.has(e)) return eyes(e, '#fff')
  const [rl, rr, sl, sr] = TILT[b]
  const pair = (
    <>
      {lens(e, 30, 1, rl, sl)}
      {lens(e === 'wink' ? 'shut' : e, 64, -1, rr, sr)}
    </>
  )
  return e === 'side' ? <g className="opsf-glance">{pair}</g> : pair
}

/* ── his own bits: spider-sense, the web-shooting hand, the thread he hangs from ── */

type Hand = 'thwip' | 'wave'
type Own = { sense?: boolean; hand?: Hand; hang?: boolean }

const SENSE = (
  <g className="opsf-sense" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round">
    <path d="M5 34l-4-4 4-4-4-4" />
    <path d="M89 34l4-4-4-4 4-4" />
    <path d="M37 4l3-3 3 3 3-3 3 3 3-3 3 3" />
  </g>
)

/** a red glove on the right of the head, middle fingers down: the web-shooter sign */
function Glove({ hand }: { hand: Hand }) {
  return (
    <g className={hand === 'wave' ? 'opsf-wave' : 'opsf-thwip'}>
      {hand === 'thwip' && <path className="opsf-thwip__web" d="M86 20L84 2M86 20L76 4M86 20L94 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
      <rect x="83" y="32" width="15" height="14" fill={MASK} stroke={INK} strokeWidth="3" />
      <rect x="83" y="20" width="5" height="13" fill={MASK} stroke={INK} strokeWidth="2.5" />
      <rect x="93" y="22" width="5" height="11" fill={MASK} stroke={INK} strokeWidth="2.5" />
      <path d="M88 32v-3h5v3" fill={MASK} stroke={INK} strokeWidth="2" />
      <circle cx="90.5" cy="40" r="2.2" fill="#fff" stroke={INK} strokeWidth="1.5" />
    </g>
  )
}

const FACES: Faces<Own> = {
  idle: { brow: 'flat', eyes: 'glare', mouth: 'flat' },
  think: { brow: 'think', eyes: 'side', mouth: 'flat', own: { sense: true } },
  win: { brow: 'raised', eyes: 'happy', mouth: 'grin', own: { hand: 'thwip' } },
  lose: { brow: 'sad', eyes: 'shut', mouth: 'frown', own: { hang: true } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'raised', eyes: 'glare', mouth: 'smile', own: { hand: 'wave' } },
  wait: { brow: 'flat', eyes: 'side', mouth: 'flat' },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'o', wash: '#000', extra: ZZ },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk' },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'grin', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP, own: { sense: true } },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP, own: { sense: true } },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'smile', extra: SPARKLE, own: { hand: 'thwip' } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'grin' },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN },
  gg: { brow: 'flat', eyes: 'happy', mouth: 'smile', own: { hand: 'thwip' } },
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

export function Spidops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const face = (
    <>
      <Head fill={MASK}>
        <clipPath id="opsf-spider-clip">
          <rect x="9" y="10" width="76" height="84" />
        </clipPath>
        <g clipPath="url(#opsf-spider-clip)">
          <path d={MASK_WEB} transform="translate(47 46)" stroke={WEB} strokeWidth="1.4" fill="none" opacity=".75" />
          {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
        </g>
        {lenses(f.eyes, f.brow)}
        {mouth(f.mouth, LINE)}
      </Head>
      {f.extra}
      {f.own?.sense && SENSE}
      {f.own?.hand && <Glove hand={f.own.hand} />}
    </>
  )
  if (!f.own?.hang) return face
  // lost: hanging upside down from a thread, swaying
  return (
    <g className="opsf-hang">
      <path d="M50 -10V8" stroke="#fff" strokeWidth="1.5" />
      <path d="M50 -10V8" stroke={INK} strokeWidth=".6" />
      <g transform="rotate(180 50 51)">{face}</g>
    </g>
  )
}

/** A web, big, for his ultimate (match/Ultimates.tsx) and for faces a web lands on. */
export function WebArt({ size, className }: { size: number | string; className?: string }) {
  return (
    <svg className={className} viewBox="-52 -52 104 104" width={size} height={size}>
      <path d={webPath(50, 12, 5)} stroke={INK} strokeWidth="3.5" fill="none" strokeLinejoin="round" />
      <path d={webPath(50, 12, 5)} stroke="#fff" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
    </svg>
  )
}

/** What Spidops says: quick, cheerful, never stops talking, a bad joke for every moment. */
export const SPIDOPS_LINES: Lines = {
  taunt: ['Hey, neighbour!', 'Mind if I hang here?', 'Peekaboo!'],
  taunted: ['Hey, my card!', 'Not cool, neighbour'],
  ulted: ['Hey! I was using that face', 'Rude. Fair, but rude'],
  hello_easy: ['Friendly neighbourhood Ops!', 'Hey there, neighbour'],
  hello_medium: ['Let’s swing into it', 'Ready when you are'],
  hello_hard: ['My spider-sense says you’re in trouble', 'With great power… comes me winning'],
  took: ['Thwip! Mine', 'Webbed it', 'Gotcha, little guy'],
  lost: ['Ow. Okay. Ow', 'Didn’t see that one', 'My spider-sense was on mute'],
  lucky: ['Parker luck? Not today', 'Ha! Lucky web'],
  unlucky: ['Classic Parker luck', 'Of course. Of course it did'],
  crushing: ['Just your friendly neighbourhood landslide', 'Is this a bad time to quip?'],
  ahead: ['Swinging along nicely', 'Look ma, no hands'],
  losing: ['This is fine. Totally fine', 'Did someone cut my web?'],
  behind: ['Just warming up the shooters', 'Plot twist incoming'],
  blunder: ['Ooh. My spider-sense tingled for you', 'You sure about that one?'],
  brilliant: ['Okay, that was amazing', 'Spectacular! Can I say that?'],
  hurry: ['I could’ve swung across town by now', 'Tick tock, neighbour'],
  sleep: ['Hanging around… zzz', 'Wake me if a villain shows up'],
  fire_ahead: ['Hot! Like a burning building', 'Careful, you’ll set off the sprinklers'],
  fire_behind: ['Okay, okay, you’re on fire', 'Somebody call the fire brigade'],
  fire_level: ['Fire? I’ll web it out', 'Bring it on'],
  lol_behind: ['Laugh now, web later', 'Glad someone’s having fun'],
  lol: ['I’m funnier, but okay', 'Ha! Good one'],
  wow_ahead: ['I know, right?', 'Thank you, thank you'],
  wow: ['Right?! Me too', 'Whoa'],
  grr_ahead: ['Easy, tiger', 'Don’t go villain on me'],
  grr: ['Hey, no growling at the hero', 'Deep breaths, neighbour'],
  gg: ['GG! High five! …Thwip', 'Good game, neighbour'],
  hurry_mine: ['Thinking! Thinking!', 'Hold your webs'],
  hurry_yours: ['Your swing, neighbour', 'Go go go'],
  win_final_hard: ['Thwip! And that’s the game', 'Spider-sense never lies'],
  win_final: ['Another day saved', 'Good game! Same time tomorrow?'],
  lose_final_hard: ['I demand a rematch. Politely', 'That’s it, I’m hanging upside down to think'],
  lose_final: ['You got me, neighbour', 'Hey, nice moves'],
  draw_final: ['A draw! Nobody gets webbed', 'Even Steven. Even Peter'],
  hit_1: ['Hey!', 'Ow, the mask!', 'That’s not very neighbourly'],
  hit_2: ['Okay, now I’m sticky AND hurt', 'Do you mind?'],
  hit_3: ['Right, that’s it', 'Web incoming'],
  throw_back: ['Thwip!', 'Return to sender', 'Catch!'],
  poke_1: ['Hey!', 'Hi!'],
  poke_2: ['Yes, it’s really me', 'That tickles'],
  poke_3: ['My spider-sense says stop', 'Okay, okay'],
  poke_4: ['Poking a spider? Bold', 'I have eight… no, two hands'],
  poke_5: ['Last warning, neighbour', 'Web’s loaded'],
  poke_6: ['THWIP', 'That’s it, you’re webbed'],
  sulk: ['…', 'Not talking. Hanging', 'Go poke a pigeon'],
  pet: ['Aww, thanks neighbour', 'Okay, that was nice', 'Spidey approves'],
  results_win: ['Nice try, neighbour', 'Rematch? I’ll go easy. Maybe'],
  results_lose: ['You’re pretty amazing', 'I’ll get you next time'],
  results_draw: ['Even! Nobody gets webbed', 'Perfect tie. Like my suit'],
}
