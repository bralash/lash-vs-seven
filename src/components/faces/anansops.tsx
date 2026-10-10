import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Anansops (he), after Kwaku Ananse, the spider of the Akan tales who tricked the Sky God out of
 * all the world's stories. A dark brown spider's head with a sly grin, four little extra eyes in a
 * row above his two big ones, and bent legs poking out of both sides. He rubs his front legs
 * together while he schemes, the little eyes glint gold when he wins, and when he loses he's
 * tangled in his own web. He throws a ball of sticky gum (the gum doll of the tale).
 */

const BODY = '#5b3a24'
const LIP = '#f0d3a2'
const IRIS = '#e0a526'
const GOLD = '#f2c94c'

type Own = { /** the front legs rub together */ scheme?: boolean; /** the little eyes glint gold */ glint?: boolean; /** caught in his own web */ tangled?: boolean }

/** A ball of sticky gum, dripping (a 40×40 box), for his throw. */
export function GumArt() {
  return (
    <>
      <path d="M9 21q0-12 11-12q12 0 12 11q0 5-3 8q0 5-2 5q-2 0-2-3q-3 2-6 2q0 6-2 6q-3 0-2-7q-6-3-6-10z" fill="#d9902a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M14 17q2-4 6-5" stroke="#ffe0a3" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="25" cy="22" r="1.6" fill="#ffe0a3" />
    </>
  )
}

/** The clay pot of all the world's wisdom, for his Web of Tales (match/Ultimates.tsx). */
export function PotArt({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <ellipse cx="50" cy="22" rx="24" ry="7" fill={GOLD} stroke={INK} strokeWidth="3" />
      <path d="M28 24q-20 18-14 44q6 22 36 22t36-22q6-26-14-44" fill="#b4652f" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 50q28 10 56 0M20 62q30 10 60 0" stroke="#7a3f1a" strokeWidth="3" fill="none" />
      <path d="M30 44l6 6 6-6 6 6 6-6 6 6 6-6 6 6" stroke={GOLD} strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      <path d="M30 34q-4 12 0 22" stroke="#e6a06a" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

const FACES: Faces<Own> = {
  idle: { brow: 'one', eyes: 'glare', mouth: 'smirk' },
  think: { brow: 'think', eyes: 'side', mouth: 'smirk', own: { scheme: true } },
  win: { brow: 'raised', eyes: 'happy', mouth: 'grin', own: { glint: true } },
  lose: { brow: 'sad', eyes: 'x', mouth: 'frown', own: { tangled: true } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'raised', eyes: 'glare', mouth: 'grin' },
  wait: { brow: 'one', eyes: 'side', mouth: 'smirk', own: { scheme: true } },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'flat', wash: '#000', extra: ZZ },
  smug: { brow: 'one', eyes: 'wink', mouth: 'smirk', own: { glint: true, scheme: true } },
  sorry: { brow: 'sad', eyes: 'happy', mouth: 'smirk', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP, own: { scheme: true } },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'o' },
  gotcha: { brow: 'angry', eyes: 'wink', mouth: 'grin', extra: SPARKLE, own: { glint: true } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'star', mouth: 'smile', own: { glint: true } },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN, own: { tangled: true } },
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

/** a bent leg out of the side of his head: from the head, up to the knee, down to the foot */
const leg = (y: number, side: -1 | 1, k = 0) => {
  const x0 = side < 0 ? 10 : 84
  return `M${x0} ${y}L${x0 + side * 15} ${y - 12 + k}L${x0 + side * 19} ${y + 10 + k}`
}

export function Anansops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const own = f.own ?? {}
  return (
    <>
      {/* the legs behind the head: two a side, the front pair rubbing when he schemes */}
      <g stroke={INK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={leg(62, -1)} />
        <path d={leg(62, 1)} />
        <g className={own.scheme ? 'opsf-scheme' : undefined}>
          <path d={leg(36, -1)} />
          <path d={leg(36, 1)} />
        </g>
      </g>
      <Head fill={BODY}>
        <clipPath id="opsf-anansi-clip">
          <rect x="9" y="10" width="76" height="84" />
        </clipPath>
        <g clipPath="url(#opsf-anansi-clip)">
          {/* fine hairs at the corners, like a spider's */}
          <path d="M14 22l-3-3M80 22l3-3M14 74l-3 3M80 74l3 3" stroke={INK} strokeWidth="2" />
          {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
        </g>
        {/* four little eyes in a row above the big two; they glint gold when he's pleased */}
        <g className={own.glint ? 'opsf-glint' : undefined}>
          {[34, 43, 52, 61].map((x) => (
            <g key={x}>
              <circle cx={x} cy="17" r="3.6" fill={own.glint ? '#fff6c9' : IRIS} stroke={INK} strokeWidth="1.6" />
              <circle cx={x} cy="17.4" r="1.4" fill={INK} />
            </g>
          ))}
        </g>
        {brows(f.brow, 5)}
        <g className="opsf-eyes">{eyes(f.eyes, IRIS)}</g>
        {mouth(f.mouth, LIP)}
        {/* two little fangs under the mouth */}
        <path d="M40 75l2.5 6 2.5-6M49 75l2.5 6 2.5-6" fill="#fbf7ee" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
        {/* tangled in his own web */}
        {own.tangled && (
          <g stroke="#fbf7ee" strokeWidth="1.6" fill="none" opacity=".9">
            <path d="M9 14L85 80M85 18L12 90M9 50h76M47 10v84" />
            <path d="M30 34q17-8 34 0q8 17 0 34q-17 8-34 0q-8-17 0-34z" />
            <path d="M38 42q9-4 18 0q4 9 0 18q-9 4-18 0q-4-9 0-18z" />
          </g>
        )}
      </Head>
      {f.extra}
    </>
  )
}

/** What Anansops says: the trickster storyteller, sly, a little Ghanaian, always sure he's the cleverest. */
export const ANANSOPS_LINES: Lines = {
  taunt: ['Let me tell you a story…', 'Kwaku Ananse sends greetings', 'This one ends with you losing'],
  taunted: ['You think you can trick ME?', 'Ei, small boy'],
  ulted: ['Clever. Not clever enough', 'I have heard this tale before'],
  hello_easy: ['Come, sit. I’ll be gentle', 'Akwaaba, my friend'],
  hello_medium: ['Every story has a winner', 'Shall we begin the tale?'],
  hello_hard: ['I tricked the Sky God himself', 'You walked into my web'],
  took: ['All according to plan', 'Hehehe', 'Another thread in my web'],
  lost: ['A small setback', 'Ei!', 'Who taught you that?'],
  lucky: ['The gods like me today', 'Fortune favours the clever'],
  unlucky: ['Somebody cut my thread', 'Hmm. Not in the story'],
  crushing: ['This is my favourite part', 'The web is closing'],
  ahead: ['Going as I planned', 'Patience, patience'],
  losing: ['The story is not finished', 'Every trickster has a bad day'],
  behind: ['Let me think of something', 'Wait, I have a plan'],
  blunder: ['Ha! I saw that coming', 'Right into my web'],
  brilliant: ['Ei, you are clever', 'Who told you my trick?'],
  hurry: ['Even the tortoise is faster', 'The night is getting old'],
  sleep: ['Spinning dreams', 'Wake me for the ending'],
  fire_ahead: ['Calm down, my friend', 'Anger makes you sloppy'],
  fire_behind: ['Enjoy it while it lasts', 'The tale turns'],
  fire_level: ['Careful now', 'Who will trick who?'],
  lol_behind: ['Laugh. I am planning', 'Hehe. We’ll see'],
  lol: ['Hehehe', 'You are funny'],
  wow_ahead: ['Told you, I’m the clever one', 'As written'],
  wow: ['Ei!', 'Now that’s a twist'],
  grr_ahead: ['Take it easy', 'Breathe, my friend'],
  grr: ['Patience', 'Sharp, sharp. Calm down'],
  gg: ['A fine tale', 'Ayekoo'],
  hurry_mine: ['Let me think', 'Good tricks take time'],
  hurry_yours: ['Your move, my friend', 'The story waits for you'],
  win_final_hard: ['And so all wisdom stayed with Ananse', 'The end. I win'],
  win_final: ['And that is how the story goes', 'Ayekoo. To me'],
  lose_final_hard: ['Tell no one about this', 'Again. I have a new trick'],
  lose_final: ['Well played. This time', 'You tricked the trickster'],
  draw_final: ['A story with no ending', 'We are both clever'],
  hit_1: ['Is that gum?', 'Hmm', 'Missed me'],
  hit_2: ['Stop it, eh', 'That’s sticky'],
  hit_3: ['Now you have done it', 'Ei! Enough'],
  throw_back: ['Gum for you!', 'Catch, my friend', 'Stuck now?'],
  poke_1: ['Eh?', 'Yes?'],
  poke_2: ['Don’t touch the web', 'Careful'],
  poke_3: ['Ei, stop', 'Hmm'],
  poke_4: ['I am warning you', 'Small small'],
  poke_5: ['One more and…', 'Try me'],
  poke_6: ['ENOUGH!', 'Ananse is vexed'],
  sulk: ['…', 'I’m in my web', 'Not talking'],
  pet: ['Medaase', 'Fine, fine', 'Hehe, nice'],
  results_win: ['Another story for my pot', 'Again?'],
  results_lose: ['Well played, my friend', 'Next time, a new trick'],
  results_draw: ['Even', 'A good tale'],
}
