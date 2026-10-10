import type { Lines } from '../../match/opsLines'
import type { OpsMood } from '../OpsFace'
import { BLUSH, DROP, HEARTS, Head, INK, RAIN, SPARKLE, STEAM, VEIN, ZZ, brows, eyes, mouth, type Faces } from './parts'

/*
 * Batops (he), after Batman: a black cowl with two pointed ears, blank white lenses for eyes, and
 * his jaw showing below it. His lenses narrow into a detective's squint while he thinks; a little
 * bat-signal lights up behind him when he wins; when he loses the cowl slips crooked and he looks
 * like he hasn't slept in a week. He throws a batarang.
 */

const COWL = '#2b2d35'
const SKIN = '#e0b48f'
const LENS = '#f4f6fa'
const SIGNAL = '#ffd23f'

type Own = { /** the bat-signal lit up behind him */ signal?: boolean; /** the cowl's slipped and he's exhausted */ slipped?: boolean; /** the detective's squint: narrowed lenses */ squint?: boolean }

/** The bat shape, centred on 0,0 about 40 wide (the signal, the batarang, the swarm). */
export const BAT_PATH = 'M0 -4q2-4 3-6l1 4q5-1 9-5q-1 6 7 9q-6 1-8 6q-3-3-6-1q-2 3-6 5q-4-2-6-5q-3-2-6 1q-2-5-8-6q8-3 7-9q4 4 9 5l1-4q1 2 3 6z'

/** A batarang (a 40×40 box), for his throw. */
export function BatarangArt() {
  return <path d={BAT_PATH} transform="translate(20 20) scale(.85)" fill="#3a3d47" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
}

/** The bat-signal: a yellow disc with the bat on it, for his Night Fall (match/Ultimates.tsx). */
export function SignalArt({ size }: { size: number }) {
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size}>
      <circle r="46" fill={SIGNAL} stroke={INK} strokeWidth="3" opacity=".92" />
      <path d={BAT_PATH} transform="scale(1.9)" fill={INK} />
    </svg>
  )
}

const FACES: Faces<Own> = {
  idle: { brow: 'angry', eyes: 'glare', mouth: 'flat' },
  think: { brow: 'think', eyes: 'line', mouth: 'flat', own: { squint: true } },
  win: { brow: 'angry', eyes: 'glare', mouth: 'smirk', own: { signal: true } },
  lose: { brow: 'sad', eyes: 'small', mouth: 'frown', own: { slipped: true } },
  draw: { brow: 'flat', eyes: 'line', mouth: 'flat' },

  hello: { brow: 'flat', eyes: 'glare', mouth: 'smirk' },
  wait: { brow: 'think', eyes: 'side', mouth: 'flat', own: { squint: true } },
  sleep: { brow: 'flat', eyes: 'shut', mouth: 'flat', wash: '#000', extra: ZZ, own: { slipped: true } },
  smug: { brow: 'one', eyes: 'glare', mouth: 'smirk', own: { signal: true } },
  sorry: { brow: 'sad', eyes: 'line', mouth: 'smirk', extra: DROP },
  nervous: { brow: 'sad', eyes: 'small', mouth: 'zig', extra: DROP },
  panic: { brow: 'raised', eyes: 'wide', mouth: 'o', extra: DROP },
  ouch: { brow: 'sad', eyes: 'x', mouth: 'grit' },
  gotcha: { brow: 'angry', eyes: 'glare', mouth: 'smirk', extra: SPARKLE, own: { signal: true } },
  wow: { brow: 'raised', eyes: 'wide', mouth: 'o' },
  pity: { brow: 'sad', eyes: 'line', mouth: 'frown' },
  lucky: { brow: 'raised', eyes: 'glare', mouth: 'smirk', own: { signal: true } },
  unlucky: { brow: 'sad', eyes: 'small', mouth: 'frown', extra: RAIN, own: { slipped: true } },
  gg: { brow: 'flat', eyes: 'glare', mouth: 'smile' },
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

export function Batops({ mood }: { mood: OpsMood }) {
  const f = FACES[mood]
  const own = f.own ?? {}
  return (
    <>
      {/* the bat-signal lighting up behind him */}
      {own.signal && (
        <g className="opsf-signal">
          <ellipse cx="78" cy="8" rx="16" ry="10" fill={SIGNAL} stroke={INK} strokeWidth="2" />
          <path d={BAT_PATH} transform="translate(78 8) scale(.5)" fill={INK} />
        </g>
      )}
      <g transform={own.slipped ? 'rotate(-7 47 50)' : undefined}>
        {/* the ears of the cowl, sticking up past the head */}
        <path d="M13 14l4-18 11 18zM81 14l-4-18-11 18z" fill={COWL} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <Head fill={COWL}>
          <clipPath id="opsf-bat-clip">
            <rect x="9" y="10" width="76" height="84" />
          </clipPath>
          <g clipPath="url(#opsf-bat-clip)">
            {/* his jaw below the cowl: the mask comes down to a point by each cheek */}
            <path d="M9 94V62l14-4 10 6h28l10-6 14 4v32z" fill={SKIN} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
            {f.wash && <rect x="9" y="10" width="76" height="84" fill={f.wash} opacity={f.wash === '#000' ? 0.3 : 0.22} />}
          </g>
          {brows(f.brow, 5)}
          {/* blank white lenses: narrowed to slits when he's working it out */}
          <g className="opsf-eyes" transform={own.squint ? 'translate(0 40) scale(1 .5) translate(0 -40)' : undefined}>
            {eyes(f.eyes, LENS)}
          </g>
          {/* no sleep in a week */}
          {own.slipped && <path d="M26 47q6 3 12 0M56 47q6 3 12 0" stroke="#7d8496" strokeWidth="2.5" fill="none" />}
          {mouth(f.mouth, '#8a4f3a')}
        </Head>
      </g>
      {f.extra}
    </>
  )
}

/** What Batops says: few words, low voice, very serious about everything. */
export const BATOPS_LINES: Lines = {
  taunt: ['I’m always watching', 'Where’s the move? WHERE IS IT?', 'You’re not ready'],
  taunted: ['Bold. Foolish', 'I work alone'],
  ulted: ['I’ve trained for worse', 'Noted. For the file'],
  hello_easy: ['I’ll go easy. Barely', 'Let’s see what you’ve got'],
  hello_medium: ['I’m Batops', 'The night is young'],
  hello_hard: ['I have a plan for everyone', 'Prepare yourself'],
  took: ['Justice', 'Predictable', 'Case closed'],
  lost: ['Hm', 'A setback', 'I let that happen'],
  lucky: ['Planned. Mostly', 'Always be prepared'],
  unlucky: ['Even I bleed', 'Not part of the plan'],
  crushing: ['This city is mine', 'It’s over'],
  ahead: ['Exactly as calculated', 'Stay focused'],
  losing: ['I don’t give up', 'Contingency plan'],
  behind: ['Recalculating', 'I’ve been in worse alleys'],
  blunder: ['Sloppy', 'I saw that coming a mile away'],
  brilliant: ['Not bad. For a civilian', 'Impressive'],
  hurry: ['Time is a luxury', 'Criminals don’t wait'],
  sleep: ['Batops never sleeps', 'Just resting my eyes'],
  fire_ahead: ['Anger is a weapon. Use it better', 'Control yourself'],
  fire_behind: ['Enjoy the moment', 'It won’t last'],
  fire_level: ['Steady', 'Stay sharp'],
  lol_behind: ['Laugh while you can', 'Funny. For now'],
  lol: ['Heh', 'That was almost funny'],
  wow_ahead: ['As planned', 'Detective work'],
  wow: ['Didn’t see that coming', 'Hm. Interesting'],
  grr_ahead: ['Fear is a tool', 'Calm down'],
  grr: ['Easy', 'Breathe'],
  gg: ['Well fought', 'Respect'],
  hurry_mine: ['Analysing', 'Patience'],
  hurry_yours: ['Your move. Choose wisely', 'I’m waiting'],
  win_final_hard: ['Justice is served', 'I’m Batops'],
  win_final: ['Good fight', 'The city is safe'],
  lose_final_hard: ['This isn’t over', 'I’ll be back. Tonight'],
  lose_final: ['You earned that', 'Well played'],
  draw_final: ['Stalemate', 'We’ll meet again'],
  hit_1: ['Is that all?', 'Hm', 'Missed'],
  hit_2: ['Don’t', 'Careful'],
  hit_3: ['You’ve made an enemy', 'ENOUGH'],
  throw_back: ['Batarang!', 'Catch', 'Return to sender'],
  poke_1: ['What', 'Hm?'],
  poke_2: ['Don’t touch the cowl', 'Hands off'],
  poke_3: ['Stop', 'I’m warning you'],
  poke_4: ['Last chance', 'Back off'],
  poke_5: ['One more', 'Try me'],
  poke_6: ['WHERE IS IT?!', 'ENOUGH'],
  sulk: ['…', 'Brooding', 'Leave me in the dark'],
  pet: ['…Thanks', 'Fine', 'Don’t tell anyone'],
  results_win: ['Another night', 'Again?'],
  results_lose: ['Good fight', 'I’ll study this'],
  results_draw: ['Even', 'Next time'],
}
