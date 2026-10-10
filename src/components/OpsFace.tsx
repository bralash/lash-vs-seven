import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { KEYS, load, save } from '../lib/storage'
import '../styles/opsfaces.css'
import { Kratops } from './faces/kratops'
import { Ghops } from './faces/ghops'
import { Hulkops } from './faces/hulkops'
import { DROP, Head, INK, heart, star } from './faces/parts'
import { Opstimus } from './faces/opstimus'
import { Spidops } from './faces/spidops'
import { Thanops } from './faces/thanops'
import { PAINT_FILTERS, WearLayers, paintOf, type Wear } from './faces/wardrobe'

// The faces. Ops, the computer opponent, always wears Screen (OPS_LOOK, reserved for her). The rest
// are the Crew: the characters players wear on their score cards, picked (and bought) in the Locker
// at /locker and saved on the device. Every look has the five base moods; Screen and the characters
// (Kratops, Thanops, Spidops, Opstimus, Hulkops, Ghops: drawn in faces/) also have a face for every reaction, and the other looks
// borrow the nearest base mood.

export type BaseMood = 'idle' | 'think' | 'win' | 'lose' | 'draw'
/** Faces she pulls when she sends a reaction mid-match (drawn for the Screen look; the others fall back). */
export type ReactMood =
  | 'hello' | 'wait' | 'sleep' | 'smug' | 'sorry' | 'nervous' | 'panic' | 'ouch'
  | 'gotcha' | 'wow' | 'pity' | 'lucky' | 'unlucky' | 'gg' | 'salty'
  /** when you poke or pet her (PokeOps) */
  | 'love' | 'giggle' | 'angry'
export type OpsMood = BaseMood | ReactMood
export type OpsStyle = 'screen' | 'bot' | 'cyclops' | 'die' | 'prime' | 'warrior' | 'titan' | 'spider' | 'brute' | 'ghost'

/** Ops' own face: always hers, never worn by a player. */
export const OPS_LOOK: OpsStyle = 'screen'

/** How a look is talked about: Ops is the opponent, but each face is a character with their own pronouns. */
export interface Pronouns {
  /** she / he */
  they: string
  /** her / him */
  them: string
  /** her / his */
  their: string
}
const SHE: Pronouns = { they: 'she', them: 'her', their: 'her' }
/** Ops is always she */
export const OPS_PRONOUNS = SHE
const HE: Pronouns = { they: 'he', them: 'him', their: 'his' }

export const OPS_STYLES: { id: OpsStyle; name: string; blurb: string; pronouns: Pronouns; /** chips to unlock it; the robot faces are free */ price?: number }[] = [
  { id: 'screen', name: 'Screen', blurb: 'A little monitor with pixel eyes. Thinking shows a loading bar.', pronouns: SHE },
  { id: 'bot', name: 'Bot', blurb: 'Classic robot head in Seven blue: antenna, round eyes, grille mouth.', pronouns: SHE },
  { id: 'cyclops', name: 'Cyclops', blurb: 'One big camera eye that watches the board.', pronouns: SHE },
  { id: 'die', name: 'Die', blurb: 'A die whose pips are her eyes. Thinking rolls through the faces.', pronouns: SHE },
  { id: 'prime', name: 'Opstimus', blurb: 'A robot leader in a blue helmet with tall antennae and bright blue eyes. His battle mask slides shut when he means business; he throws Energon cubes, and for his ultimate he turns into a truck.', pronouns: HE, price: 400 },
  { id: 'warrior', name: 'Kratops', blurb: 'Ash-grey god of war with a red stripe of war paint. He doesn’t throw tomatoes: he throws his axe, and it comes back.', pronouns: HE, price: 300 },
  { id: 'titan', name: 'Thanops', blurb: 'A purple titan with a ridged chin and a gold gauntlet. Six stones glow when he’s winning; he snaps when he wins, and when he loses they fall out.', pronouns: HE, price: 400 },
  { id: 'spider', name: 'Spidops', blurb: 'A red mask with a web over it and two big white lenses that do all his frowning. His spider-sense buzzes when he’s worried; he shoots webs, and when he loses he hangs upside down.', pronouns: HE, price: 500 },
  { id: 'brute', name: 'Hulkops', blurb: 'A huge green brute with a black mop of hair and fists like boulders. He pounds his fists when he’s cross and throws chunks of rubble; when he loses he shrinks back into a pale little scientist in glasses.', pronouns: HE, price: 600 },
  { id: 'ghost', name: 'Ghops', blurb: 'A soldier in a black balaclava with a white skull on it; only his eyes show. His headset blinks while he thinks, the shades go on when he wins, and he throws flashbangs. Few words.', pronouns: HE, price: 800 },
]

/** The Crew: every face a player can wear (all but Ops' own). */
export const CREW_STYLES = OPS_STYLES.filter((s) => s.id !== OPS_LOOK)
/** the free robots, for anyone who was wearing Screen before it became Ops' alone */
const FREE_CREW = CREW_STYLES.filter((s) => !s.price).map((s) => s.id)

/** What a look costs in chips (0: free). */
export const priceOf = (look: OpsStyle) => OPS_STYLES.find((s) => s.id === look)?.price ?? 0

/* ── The player's pick: their Crew character ── */

/** Looks that were replaced, and who took their place (Visor made way for Opstimus). */
const RETIRED: Record<string, OpsStyle> = { visor: 'prime' }
/** A stored or sent look as one we still draw, or null if it isn't one. */
export function asLook(v: unknown): OpsStyle | null {
  if (typeof v === 'string' && v in RETIRED) return RETIRED[v]
  return OPS_STYLES.some((s) => s.id === v) ? (v as OpsStyle) : null
}
/** A look a player can wear: Screen is Ops' (an old phone may still send it), so it doesn't count. */
export function asCrew(v: unknown): OpsStyle | null {
  const look = asLook(v)
  return look === OPS_LOOK ? null : look
}

const lookListeners = new Set<() => void>()
function readLook(): OpsStyle | null {
  const raw = asLook(load(KEYS.opsLook))
  // picked Screen before it was Ops' alone: swap it for one of the free robots, once
  if (raw === OPS_LOOK) {
    const swap = FREE_CREW[Math.floor(Math.random() * FREE_CREW.length)]
    save(KEYS.opsLook, swap)
    return swap
  }
  return raw
}
function subscribeLook(fn: () => void) {
  lookListeners.add(fn)
  window.addEventListener('storage', fn)
  return () => {
    lookListeners.delete(fn)
    window.removeEventListener('storage', fn)
  }
}
/** The character this player picked in the Locker, or null if they never picked one (then each match hands them one). Updates live. */
export function useCrewLook(): OpsStyle | null {
  return useSyncExternalStore(subscribeLook, readLook, () => null)
}
/** The same, outside React. */
export const pickedCrewLook = readLook
/** The pronouns for a look (she for the robot faces, he for Kratops…). */
export const pronounsOf = (look: OpsStyle): Pronouns => OPS_STYLES.find((s) => s.id === look)?.pronouns ?? SHE

export function setCrewLook(look: OpsStyle) {
  if (look === OPS_LOOK) return
  save(KEYS.opsLook, look)
  lookListeners.forEach((fn) => fn())
}

function Screen({ mood }: { mood: OpsMood }) {
  const px = 'var(--hit)'
  if (mood in REACT_FACES)
    return (
      <Head fill="#17151c">
        {REACT_FACES[mood as ReactMood](px)}
        <text x="47" y="80" className="opsf-tag">OPS</text>
      </Head>
    )
  return (
    <Head fill="#17151c">
      <rect x="15" y="16" width="64" height="50" fill="#25222c" />
      {mood === 'think' ? (
        <g className="opsf-screen__load">
          {[0, 1, 2, 3, 4].map((k) => (
            <rect key={k} x={22 + k * 10} y="36" width="7" height="9" fill={px} style={{ '--k': k } as CSSProperties} />
          ))}
        </g>
      ) : (
        <g className="opsf-eyes">
          {mood === 'win' ? (
            <path d="M28 40l6-7 6 7M54 40l6-7 6 7" stroke={px} strokeWidth="4" fill="none" />
          ) : mood === 'lose' ? (
            <path d="M28 30l11 11M39 30L28 41M55 30l11 11M66 30L55 41" stroke={px} strokeWidth="4" />
          ) : mood === 'draw' ? (
            <path d="M28 37h11M55 37h11" stroke={px} strokeWidth="4" />
          ) : (
            <>
              <rect x="30" y="29" width="8" height="11" fill={px} />
              <rect x="56" y="29" width="8" height="11" fill={px} />
            </>
          )}
        </g>
      )}
      {mood !== 'think' && (
        <path
          d={mood === 'win' ? 'M34 52q13 10 26 0' : mood === 'lose' ? 'M34 57q4-5 8 0t8 0 8 0' : 'M37 54h20'}
          stroke={px}
          strokeWidth="4"
          fill="none"
        />
      )}
      <text x="47" y="80" className="opsf-tag">OPS</text>
    </Head>
  )
}

function Bot({ mood }: { mood: OpsMood }) {
  const eye = (cx: number) =>
    mood === 'win' ? (
      <path key={cx} d={`M${cx - 8} ${54}q8-10 16 0`} stroke={INK} strokeWidth="4" fill="none" />
    ) : (
      <g key={cx}>
        <circle cx={cx} cy="52" r="10" fill="#fff" stroke={INK} strokeWidth="3.5" />
        {mood === 'lose' ? (
          <path d={`M${cx - 5} 48l10 8M${cx + 5} 48l-10 8`} stroke={INK} strokeWidth="3" />
        ) : (
          <circle className="opsf-pupil" cx={cx} cy={mood === 'draw' ? 55 : 52} r="4.5" fill={INK} />
        )}
      </g>
    )
  return (
    <g className="opsf-bot">
      <g className="opsf-bot__antenna">
        <path d={mood === 'lose' ? 'M47 26V16l8-5' : 'M47 26V12'} stroke={INK} strokeWidth="4" fill="none" />
        <circle cx={mood === 'lose' ? 56 : 47} cy={mood === 'lose' ? 10 : 9} r="5" fill="var(--hit)" stroke={INK} strokeWidth="3" />
      </g>
      <Head fill="var(--seven)" y={26}>
        {eye(33)}
        {eye(61)}
        <rect x="31" y="70" width="32" height="10" fill="var(--paper)" stroke={INK} strokeWidth="3" />
        {mood === 'win' ? (
          <path d="M35 72q12 10 24 0" stroke={INK} strokeWidth="3" fill="none" />
        ) : (
          [39, 47, 55].map((x) => <path key={x} d={`M${x} 70v10`} stroke={INK} strokeWidth="2.5" />)
        )}
      </Head>
    </g>
  )
}

function Cyclops({ mood }: { mood: OpsMood }) {
  return (
    <Head fill="var(--paper)">
      {mood === 'win' ? (
        <path d="M27 44q20-20 40 0" stroke={INK} strokeWidth="5" fill="none" />
      ) : (
        <g>
          <circle cx="47" cy="42" r="21" fill="#fff" stroke={INK} strokeWidth="4" />
          {mood === 'lose' ? (
            <path className="opsf-spiral" d="M47 42m-3 0a3 3 0 1 1 6 0a6 6 0 1 1-12 0a9 9 0 1 1 18 0a12 12 0 1 1-24 0" stroke={INK} strokeWidth="2.5" fill="none" />
          ) : (
            <g className="opsf-iris">
              <circle cx="47" cy="42" r="10" fill="var(--seven)" />
              <circle cx="47" cy="42" r="4.5" fill={INK} />
              <circle cx="51" cy="38" r="2" fill="#fff" />
            </g>
          )}
          {/* the lid: blinks; half-shut for a draw */}
          <rect className={`opsf-lid${mood === 'draw' ? ' opsf-lid--half' : ''}`} x="24" y="19" width="46" height="23" fill="var(--paper)" />
          <path className={`opsf-lid-line${mood === 'draw' ? ' opsf-lid--half' : ''}`} d="M26 42h42" stroke={INK} strokeWidth="4" />
        </g>
      )}
      <path d={mood === 'win' ? 'M37 70q10 7 20 0' : mood === 'lose' ? 'M38 73q9-6 18 0' : 'M40 71h14'} stroke={INK} strokeWidth="4" fill="none" />
    </Head>
  )
}

// pip positions for each die face (in a 3×3 grid, 0–8)
const FACES = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]]
const pipAt = (k: number) => ({ cx: 27 + (k % 3) * 20, cy: 26 + Math.floor(k / 3) * 20 })

function Die({ mood }: { mood: OpsMood }) {
  return (
    <Head fill="#fff">
      {mood === 'think' ? (
        <g className="opsf-die__roll">
          {FACES.map((f, i) => (
            <g key={i} style={{ '--i': i } as CSSProperties}>
              {f.map((k) => (
                <circle key={k} {...pipAt(k)} r="6" fill={INK} />
              ))}
            </g>
          ))}
        </g>
      ) : mood === 'win' ? (
        <>
          <path d="M23 34l6-6 6 6M59 34l6-6 6 6" stroke={INK} strokeWidth="4.5" fill="none" />
          <g>{[6, 7, 8].map((k) => <circle key={k} cx={pipAt(k).cx} cy={pipAt(k).cy - 4 + (k === 7 ? 5 : 0)} r="5" fill={INK} />)}</g>
        </>
      ) : mood === 'lose' ? (
        <>
          <circle cx="47" cy="46" r="7" fill={INK} />
          <path d="M23 26l8 6M71 26l-8 6" stroke={INK} strokeWidth="4" />
        </>
      ) : (
        <>
          <g className="opsf-eyes">
            {mood === 'draw' ? (
              <path d="M21 32h12M61 32h12" stroke={INK} strokeWidth="5" />
            ) : (
              <>
                <circle cx="27" cy="32" r="6.5" fill={INK} />
                <circle cx="67" cy="32" r="6.5" fill={INK} />
              </>
            )}
          </g>
          {[6, 7, 8].map((k) => (
            <circle key={k} cx={pipAt(k).cx} cy={pipAt(k).cy - 2} r="3.5" fill={INK} opacity=".85" />
          ))}
        </>
      )}
    </Head>
  )
}

/* ── Reaction faces (Screen look) ───────────────────────────────────────── */

const SCREEN = <rect x="15" y="16" width="64" height="50" fill="#25222c" />
const HAPPY_EYES = 'M28 39l6-7 6 7M54 39l6-7 6 7'
const SMILE = 'M34 51q13 10 26 0'
const GRIN = 'M32 49h30q-3 11-15 11t-15-11z'
/** Pink cheeks. */
const BLUSH = (
  <>
    <rect x="20" y="44" width="8" height="4" fill="#ff7aa8" opacity=".9" />
    <rect x="66" y="44" width="8" height="4" fill="#ff7aa8" opacity=".9" />
  </>
)
const REACT_FACES: Record<ReactMood, (px: string) => ReactNode> = {
  hello: (px) => (
    <>
      {SCREEN}
      <path d={HAPPY_EYES} stroke={px} strokeWidth="4" fill="none" />
      <path d={SMILE} stroke={px} strokeWidth="4" fill="none" />
      <g className="opsf-wave">
        <rect x="84" y="28" width="15" height="18" fill="var(--slot)" stroke={INK} strokeWidth="3" />
        <path d="M88 28v-6M94 28v-7" stroke={INK} strokeWidth="3" />
      </g>
    </>
  ),
  wait: (px) => (
    <>
      {SCREEN}
      <g className="opsf-glance">
        <rect x="30" y="31" width="8" height="9" fill={px} />
        <rect x="56" y="31" width="8" height="9" fill={px} />
      </g>
      <path d="M46 55h12" stroke={px} strokeWidth="4" />
    </>
  ),
  sleep: (px) => (
    <>
      {SCREEN}
      <path d="M28 37q6 5 12 0M54 37q6 5 12 0" stroke={px} strokeWidth="4" fill="none" />
      <rect x="44" y="51" width="7" height="6" fill={px} />
      <rect x="15" y="16" width="64" height="50" fill="#000" opacity=".4" />
      <g className="opsf-zz" fill={INK} fontFamily="var(--mono)" fontWeight="700">
        <text x="80" y="10" fontSize="13">z</text>
        <text x="90" y="0" fontSize="18">Z</text>
      </g>
    </>
  ),
  smug: (px) => (
    <>
      {SCREEN}
      <path d="M28 38h12" stroke={px} strokeWidth="4" />
      <rect x="56" y="32" width="8" height="8" fill={px} />
      <path d="M53 26l13-4" stroke={px} strokeWidth="4" />
      <path d="M36 54q14 5 24-7" stroke={px} strokeWidth="4" fill="none" />
    </>
  ),
  sorry: (px) => (
    <>
      {SCREEN}
      <path d="M28 28l11-5M66 28l-11-5" stroke={px} strokeWidth="3.5" />
      <path d={HAPPY_EYES} stroke={px} strokeWidth="4" fill="none" />
      <path d={GRIN} fill={px} />
      {DROP}
    </>
  ),
  nervous: (px) => (
    <>
      {SCREEN}
      <rect x="31" y="31" width="6" height="8" fill={px} />
      <rect x="57" y="31" width="6" height="8" fill={px} />
      <path d="M31 55q4-5 8 0t8 0 8 0 8 0" stroke={px} strokeWidth="4" fill="none" />
      {DROP}
    </>
  ),
  panic: (px) => (
    <>
      {SCREEN}
      <rect x="28" y="28" width="9" height="14" fill={px} />
      <rect x="58" y="30" width="9" height="12" fill={px} />
      <rect x="40" y="49" width="15" height="10" fill={px} />
      <g className="opsf-glitch">
        <rect x="15" y="24" width="64" height="3" fill="var(--seven)" />
        <rect x="15" y="44" width="40" height="3" fill="var(--lash)" />
        <rect x="35" y="60" width="44" height="2" fill="var(--paper-2)" />
      </g>
    </>
  ),
  ouch: (px) => (
    <>
      {SCREEN}
      <path d="M28 30l11 11M39 30L28 41M55 30l11 11M66 30L55 41" stroke={px} strokeWidth="4" />
      <ellipse cx="47" cy="55" rx="5" ry="4" stroke={px} strokeWidth="4" fill="none" />
    </>
  ),
  gotcha: (px) => (
    <>
      {SCREEN}
      <rect x="30" y="29" width="8" height="11" fill={px} />
      <path d="M54 37q6-6 12 0" stroke={px} strokeWidth="4" fill="none" />
      <path d={SMILE} stroke={px} strokeWidth="4" fill="none" />
      <path className="opsf-sparkle" d={star(91, 10, 9)} fill="var(--hit)" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  wow: (px) => (
    <>
      {SCREEN}
      <circle cx="34" cy="35" r="7" stroke={px} strokeWidth="4" fill="none" />
      <circle cx="60" cy="35" r="7" stroke={px} strokeWidth="4" fill="none" />
      <rect x="32" y="33" width="4" height="4" fill={px} />
      <rect x="58" y="33" width="4" height="4" fill={px} />
      <circle cx="47" cy="55" r="4" stroke={px} strokeWidth="3.5" fill="none" />
    </>
  ),
  pity: (px) => (
    <>
      {SCREEN}
      <path d="M29 30l9 6-9 6M65 30l-9 6 9 6" stroke={px} strokeWidth="4" fill="none" />
      <path d="M38 56q4-4 8 0t8 0" stroke={px} strokeWidth="4" fill="none" />
    </>
  ),
  lucky: (px) => (
    <>
      {SCREEN}
      <path className="opsf-stars" d={star(34, 35, 9)} fill={px} />
      <path className="opsf-stars" d={star(60, 35, 9)} fill={px} />
      <path d={GRIN} fill={px} />
    </>
  ),
  unlucky: (px) => (
    <>
      {SCREEN}
      <path d="M28 38l12 3M66 38l-12 3" stroke={px} strokeWidth="4" />
      <path d="M36 59q11-9 22 0" stroke={px} strokeWidth="4" fill="none" />
      <path className="opsf-rain" d="M32 18v6M44 20v6M56 18v6" stroke="#8ec5ff" strokeWidth="2.5" />
      <path d="M26 15a7 7 0 0 1 4-12 9 9 0 0 1 17-1 7 7 0 0 1 11 6 6 6 0 0 1 0 7z" fill="var(--dim)" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  gg: (px) => (
    <>
      {SCREEN}
      <path d="M29 38l5-5 5 5M55 38l5-5 5 5" stroke={px} strokeWidth="4" fill="none" />
      <path d="M38 52q9 6 18 0" stroke={px} strokeWidth="4" fill="none" />
      <rect x="21" y="45" width="7" height="4" fill="var(--lash)" opacity=".85" />
      <rect x="66" y="45" width="7" height="4" fill="var(--lash)" opacity=".85" />
    </>
  ),
  salty: (px) => (
    <>
      {SCREEN}
      <rect x="15" y="16" width="64" height="50" fill="var(--strike)" opacity=".28" />
      <path d="M28 26l12 5M66 26l-12 5" stroke={px} strokeWidth="4" />
      <rect x="30" y="33" width="8" height="7" fill={px} />
      <rect x="56" y="33" width="8" height="7" fill={px} />
      <path d="M35 56l4-3 4 3 4-3 4 3 4-3 4 3" stroke={px} strokeWidth="3.5" fill="none" />
      <g className="opsf-steam" fill="var(--slot)" stroke={INK} strokeWidth="2.5">
        <circle cx="6" cy="10" r="5" />
        <circle cx="93" cy="6" r="5" />
      </g>
    </>
  ),
  love: () => (
    <>
      {SCREEN}
      <path className="opsf-beat" d={heart(34, 36, 7)} fill="#ff5c8a" />
      <path className="opsf-beat" d={heart(60, 36, 7)} fill="#ff5c8a" />
      <path d={SMILE} stroke="var(--hit)" strokeWidth="4" fill="none" />
      {BLUSH}
      <g className="opsf-hearts" fill="#ff5c8a" stroke={INK} strokeWidth="2.5">
        <path d={heart(88, 12, 7)} />
        <path d={heart(8, 20, 5)} />
      </g>
    </>
  ),
  giggle: (px) => (
    <>
      {SCREEN}
      <path d="M28 35l10 4-10 4M66 35l-10 4 10 4" stroke={px} strokeWidth="4" fill="none" />
      <path d={GRIN} fill={px} />
      {BLUSH}
    </>
  ),
  angry: (px) => (
    <>
      {SCREEN}
      <rect x="15" y="16" width="64" height="50" fill="var(--strike)" opacity=".5" />
      <path d="M27 26l13 8M67 26l-13 8" stroke={px} strokeWidth="4.5" />
      <rect x="30" y="35" width="9" height="6" fill={px} />
      <rect x="55" y="35" width="9" height="6" fill={px} />
      <path d="M35 59q12-9 24 0" stroke={px} strokeWidth="4" fill="none" />
      <path className="opsf-vein" d="M84 6v5h-5M90 6v5h5M84 20v-5h-5M90 20v-5h5" stroke="var(--strike)" strokeWidth="3" fill="none" />
      <g className="opsf-steam" fill="var(--slot)" stroke={INK} strokeWidth="2.5">
        <circle cx="6" cy="10" r="6" />
        <circle cx="14" cy="2" r="4" />
      </g>
    </>
  ),
}

/** Looks with their own face for every reaction (the rest borrow a base mood). */
const OWN_REACTIONS = new Set<OpsStyle>(['screen', 'warrior', 'titan', 'spider', 'prime', 'brute', 'ghost'])
export const hasOwnReactions = (look: OpsStyle) => OWN_REACTIONS.has(look)

/** The other looks only know the five base moods, so reactions borrow the nearest one. */
const BASE: Record<ReactMood, BaseMood> = {
  hello: 'win', wait: 'idle', sleep: 'idle', smug: 'win', sorry: 'win', nervous: 'lose', panic: 'lose', ouch: 'lose',
  gotcha: 'win', wow: 'draw', pity: 'draw', lucky: 'win', unlucky: 'lose', gg: 'win', salty: 'lose',
  love: 'win', giggle: 'win', angry: 'lose',
}

const DRAW: Record<OpsStyle, (p: { mood: OpsMood }) => ReactNode> = { screen: Screen, bot: Bot, cyclops: Cyclops, die: Die, prime: Opstimus, warrior: Kratops, titan: Thanops, spider: Spidops, brute: Hulkops, ghost: Ghops }

/**
 * A face: Ops' own unless `look` says which character, with anything from the wardrobe on (`wear`:
 * a hat and a neck piece drawn over it, paint as a filter on the face alone). Hats and neck pieces
 * reach out of the box, so the svg lets them spill over. Moods animate in CSS; remount (change `key`)
 * to replay a one-shot mood.
 */
export function OpsFace({ look = OPS_LOOK, mood = 'idle', size = 96, wear }: { look?: OpsStyle; mood?: OpsMood; size?: number; wear?: Wear }) {
  const Face = DRAW[look]
  const name = look === OPS_LOOK ? 'Ops' : (OPS_STYLES.find((s) => s.id === look)?.name ?? 'Ops')
  if (!OWN_REACTIONS.has(look) && mood in BASE) mood = BASE[mood as ReactMood]
  const paint = wear ? paintOf(wear) : null
  return (
    <svg
      className={`opsf opsf--${look} opsf--${mood}${paint ? ` opsf--paint-${paint}` : ''}${wear?.length ? ' opsf--worn' : ''}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${name}, ${mood}`}
    >
      {paint && PAINT_FILTERS}
      <g className="opsf__body">
        <g className="opsf__paint" filter={paint ? `url(#opsw-${paint})` : undefined}>
          <Face mood={mood} />
        </g>
        {!!wear?.length && <WearLayers look={look} wear={wear} />}
      </g>
    </svg>
  )
}
