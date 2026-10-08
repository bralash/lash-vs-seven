import type { CSSProperties, ReactNode } from 'react'
import '../styles/opsfaces.css'

// Faces for Ops, the computer opponent. OPS_LOOK is the one in use; the rest are kept so it can be
// swapped later (compare them all at /dev/ops).

export type OpsMood = 'idle' | 'think' | 'win' | 'lose' | 'draw'
export type OpsStyle = 'screen' | 'bot' | 'cyclops' | 'die' | 'visor'

/** The face Ops wears on the site. */
export const OPS_LOOK: OpsStyle = 'screen'

export const OPS_STYLES: { id: OpsStyle; name: string; blurb: string }[] = [
  { id: 'screen', name: 'Screen', blurb: 'A little monitor with pixel eyes. Thinking shows a loading bar.' },
  { id: 'bot', name: 'Bot', blurb: 'Classic robot head in Seven blue: antenna, round eyes, grille mouth.' },
  { id: 'cyclops', name: 'Cyclops', blurb: 'One big camera eye that watches the board.' },
  { id: 'die', name: 'Die', blurb: 'A die whose pips are her eyes. Thinking rolls through the faces.' },
  { id: 'visor', name: 'Visor', blurb: 'Dark head with a yellow visor; a light sweeps across while she thinks.' },
]

const INK = 'var(--ink)'

/** The square head every style shares: hard offset shadow, thick ink edge. */
function Head({ fill, y = 8, children }: { fill: string; y?: number; children?: ReactNode }) {
  return (
    <>
      <rect x="13" y={y + 6} width="80" height={88 - y} fill={INK} />
      <rect x="7" y={y} width="80" height={88 - y} fill={fill} stroke={INK} strokeWidth="4" />
      {children}
    </>
  )
}

function Screen({ mood }: { mood: OpsMood }) {
  const px = 'var(--hit)'
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

function Visor({ mood }: { mood: OpsMood }) {
  const band = mood === 'lose' ? 'var(--dim)' : 'var(--hit)'
  return (
    <Head fill="#17151c">
      <rect x="15" y="27" width="64" height="22" fill={band} stroke={INK} strokeWidth="3" />
      <clipPath id="opsf-visor-clip">
        <rect x="16.5" y="28.5" width="61" height="19" />
      </clipPath>
      {(mood === 'idle' || mood === 'think') && (
        <rect
          className={`opsf-visor__sweep${mood === 'think' ? ' opsf-visor__sweep--fast' : ''}`}
          clipPath="url(#opsf-visor-clip)"
          x="16"
          y="28"
          width="14"
          height="20"
          fill="#fff"
          opacity=".75"
        />
      )}
      {mood === 'win' && <path d="M26 42l6-7 6 7M56 42l6-7 6 7" stroke={INK} strokeWidth="4" fill="none" />}
      {mood === 'draw' && <path d="M26 38h12M56 38h12" stroke={INK} strokeWidth="4" />}
      {mood === 'lose' && <path d="M40 27l6 9-5 5 7 8" stroke={INK} strokeWidth="2.5" fill="none" />}
      {/* vents for a mouth; a grin when she wins */}
      {mood === 'win' ? (
        <path d="M33 62q14 10 28 0" stroke="var(--hit)" strokeWidth="4" fill="none" />
      ) : (
        [35, 43, 51, 59].map((x) => <rect key={x} x={x} y="60" width="4" height={mood === 'lose' ? 6 : 12} fill="var(--paper-2)" />)
      )}
    </Head>
  )
}

const DRAW: Record<OpsStyle, (p: { mood: OpsMood }) => ReactNode> = { screen: Screen, bot: Bot, cyclops: Cyclops, die: Die, visor: Visor }

/** Ops' face. Moods animate in CSS; remount (change `key`) to replay a one-shot mood. */
export function OpsFace({ look = OPS_LOOK, mood = 'idle', size = 96 }: { look?: OpsStyle; mood?: OpsMood; size?: number }) {
  const Face = DRAW[look]
  return (
    <svg className={`opsf opsf--${look} opsf--${mood}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Ops, ${mood}`}>
      <g className="opsf__body">
        <Face mood={mood} />
      </g>
    </svg>
  )
}
