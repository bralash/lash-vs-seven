import { memo } from 'react'
import { BAR, CUP, LENGTH, R, WALL, WIDTH, wallsOf, type Area, type Hole } from './physics'

/*
 * A hole from above, in the site's flat ink look: a green on the dark board, ink walls, yellow
 * bumpers, sand and water, the cup with its flag. 300 px to the course's width, PAD px round it.
 */

export const S = 300
export const PAD = 10
export const VW = WIDTH * S + PAD * 2
export const VH = LENGTH * S + PAD * 2
export const X = (x: number) => PAD + x * S
export const Y = (y: number) => PAD + y * S

function AreaShape({ a, ...rest }: { a: Area } & React.SVGProps<SVGRectElement & SVGCircleElement>) {
  return a.length === 4 ? <rect x={X(a[0])} y={Y(a[1])} width={a[2] * S} height={a[3] * S} {...rest} /> : <circle cx={X(a[0])} cy={Y(a[1])} r={a[2] * S} {...rest} />
}

export const CourseArt = memo(function CourseArt({ hole }: { hole: Hole }) {
  const pts = hole.green.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')
  const clip = `golf-green-${hole.id}`
  return (
    <>
      <defs>
        <pattern id="golf-mow" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="28" height="28" fill="#3ea85a" />
          <rect width="14" height="28" fill="#46b562" />
        </pattern>
        <pattern id="golf-sand" width="9" height="9" patternUnits="userSpaceOnUse">
          <rect width="9" height="9" fill="#efd28c" />
          <circle cx="2" cy="2" r="1" fill="#c9a654" />
          <circle cx="6.5" cy="6.5" r="0.9" fill="#d9b86a" />
        </pattern>
        <pattern id="golf-water" width="26" height="12" patternUnits="userSpaceOnUse">
          <rect width="26" height="12" fill="#2f8fd8" />
          <path d="M0 7 q6.5 -5 13 0 t13 0" fill="none" stroke="#8fd0ff" strokeWidth="2" />
        </pattern>
        <clipPath id={clip}>
          <polygon points={pts} />
        </clipPath>
        <radialGradient id="golf-gloss" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity=".75" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </radialGradient>
      </defs>
      <rect width={VW} height={VH} fill="var(--board)" />
      {/* the green, with a hard shadow under it */}
      <polygon points={pts} fill="#000" opacity={0.35} transform="translate(5 6)" />
      <polygon points={pts} fill="url(#golf-mow)" />
      <g clipPath={`url(#${clip})`}>
        {hole.sand?.map((a, k) => <AreaShape key={k} a={a} fill="url(#golf-sand)" stroke="#b08a3a" strokeWidth={2} />)}
        {hole.water?.map((a, k) => <AreaShape key={k} a={a} fill="url(#golf-water)" stroke="var(--ink)" strokeWidth={2.5} />)}
      </g>
      {/* the tee */}
      <rect x={X(hole.tee[0]) - 13} y={Y(hole.tee[1]) - 13} width={26} height={26} fill="#f3ead8" opacity={0.35} />
      {/* the cup */}
      <circle cx={X(hole.cup[0])} cy={Y(hole.cup[1])} r={CUP * S + 3} fill="#f3ead8" />
      <circle cx={X(hole.cup[0])} cy={Y(hole.cup[1])} r={CUP * S} fill="#111" />
      {/* the walls: ink, with a paper line along the top */}
      <g strokeLinecap="round">
        {wallsOf(hole).map((w, k) => (
          <g key={k}>
            <line x1={X(w[0])} y1={Y(w[1])} x2={X(w[2])} y2={Y(w[3])} stroke="var(--ink)" strokeWidth={WALL * 2 * S + 2} />
            <line x1={X(w[0])} y1={Y(w[1])} x2={X(w[2])} y2={Y(w[3])} stroke="#f3ead8" strokeWidth={1.6} opacity={0.6} />
          </g>
        ))}
      </g>
      {hole.bumpers?.map(([x, y, r], k) => (
        <g key={k}>
          <circle cx={X(x) + 3} cy={Y(y) + 4} r={r * S} fill="#000" opacity={0.35} />
          <circle cx={X(x)} cy={Y(y)} r={r * S} fill="#ffd23f" stroke="var(--ink)" strokeWidth={3} />
          <circle cx={X(x)} cy={Y(y)} r={r * S * 0.45} fill="none" stroke="var(--ink)" strokeWidth={2} opacity={0.5} />
        </g>
      ))}
    </>
  )
})

/** The flag over the cup: drawn above the balls, faded while a ball is close so it never hides one. */
export function Flag({ hole, faint }: { hole: Hole; faint?: boolean }) {
  const x = X(hole.cup[0])
  const y = Y(hole.cup[1])
  return (
    <g pointerEvents="none" opacity={faint ? 0.3 : 1} style={{ transition: 'opacity .2s' }}>
      <line x1={x} y1={y} x2={x} y2={y - 46} stroke="var(--ink)" strokeWidth={3} />
      <path d={`M ${x} ${y - 46} l 24 7 l -24 7 z`} fill="var(--strike)" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
    </g>
  )
}

/** The moving blocker: an ink bar with hazard stripes. Its ends are set from outside, each frame. */
export const BAR_W = BAR * 2 * S

/** A ball in a seat's colour, drawn at the origin. */
export function Ball({ seat }: { seat: 0 | 1 }) {
  const r = R * S
  return (
    <>
      <ellipse cx={2.5} cy={3.5} rx={r} ry={r * 0.9} fill="#000" opacity={0.35} />
      <circle r={r} fill={seat === 0 ? 'var(--lash)' : 'var(--seven)'} stroke="var(--ink)" strokeWidth={2} />
      <circle r={r} fill="url(#golf-gloss)" />
    </>
  )
}
