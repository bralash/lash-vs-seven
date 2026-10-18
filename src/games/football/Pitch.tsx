import { memo } from 'react'
import { DEPTH, LENGTH, MOUTH, WIDTH } from './physics'

/*
 * The pitch from above: mown stripes, white lines, a goal with a net at each end. It looks the same
 * turned round, so a player at the top end sees it the same way (only the discs are flipped).
 * 300 px to the pitch's width, with PAD px of grass round it.
 */

export const S = 300
export const PAD = 14
export const VW = WIDTH * S + PAD * 2
export const VH = (LENGTH + DEPTH * 2) * S + PAD * 2
export const X = (x: number) => PAD + x * S
export const Y = (y: number) => PAD + (y + DEPTH) * S

export const PitchArt = memo(function PitchArt() {
  const stripes = 10
  return (
    <>
      <defs>
        <radialGradient id="fb-gloss" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity=".7" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".35" />
        </radialGradient>
      </defs>
      <rect width={VW} height={VH} fill="#1c6b34" />
      {Array.from({ length: stripes }, (_, k) => (
        <rect key={k} x={X(0)} y={Y((LENGTH / stripes) * k)} width={WIDTH * S} height={(LENGTH / stripes) * S} fill={k % 2 ? '#2a8a45' : '#2f9a4d'} />
      ))}
      <g fill="none" stroke="#fff" strokeWidth={3} opacity={0.9}>
        <rect x={X(0)} y={Y(0)} width={WIDTH * S} height={LENGTH * S} />
        <line x1={X(0)} x2={X(WIDTH)} y1={Y(LENGTH / 2)} y2={Y(LENGTH / 2)} />
        <circle cx={X(0.5)} cy={Y(LENGTH / 2)} r={0.16 * S} />
        {[0, LENGTH].map((ey) => {
          const s = ey === 0 ? 1 : -1
          return (
            <g key={ey}>
              <rect x={X(0.2)} y={ey === 0 ? Y(0) : Y(LENGTH - 0.26)} width={0.6 * S} height={0.26 * S} />
              <rect x={X(0.34)} y={ey === 0 ? Y(0) : Y(LENGTH - 0.1)} width={0.32 * S} height={0.1 * S} />
              <path d={`M ${X(0.38)} ${Y(ey + s * 0.26)} A ${0.12 * S} ${0.12 * S} 0 0 ${ey === 0 ? 0 : 1} ${X(0.62)} ${Y(ey + s * 0.26)}`} />
            </g>
          )
        })}
      </g>
      <circle cx={X(0.5)} cy={Y(LENGTH / 2)} r={4} fill="#fff" />
      {[0, LENGTH].map((ey) => (
        <g key={ey}>
          <rect x={X(0.5 - MOUTH / 2)} y={ey === 0 ? Y(-DEPTH) : Y(LENGTH)} width={MOUTH * S} height={DEPTH * S} fill="#e9eef2" stroke="var(--ink)" strokeWidth={3} />
          <g stroke="#9aa6b0" strokeWidth={1}>
            {Array.from({ length: 9 }, (_, k) => {
              const x = X(0.5 - MOUTH / 2 + (MOUTH / 9) * (k + 0.5))
              return <line key={k} x1={x} x2={x} y1={ey === 0 ? Y(-DEPTH) : Y(LENGTH)} y2={ey === 0 ? Y(0) : Y(LENGTH + DEPTH)} />
            })}
          </g>
          <line x1={X(0.5 - MOUTH / 2)} x2={X(0.5 + MOUTH / 2)} y1={Y(ey)} y2={Y(ey)} stroke="#fff" strokeWidth={6} />
          {[0.5 - MOUTH / 2, 0.5 + MOUTH / 2].map((px) => (
            <circle key={px} cx={X(px)} cy={Y(ey)} r={4.5} fill="#fff" stroke="var(--ink)" strokeWidth={2} />
          ))}
        </g>
      ))}
    </>
  )
})

/** A disc in its side's colour, drawn at the origin. */
export function Disc({ seat, r }: { seat: 0 | 1; r: number }) {
  return (
    <>
      <ellipse cx={4} cy={6} rx={r} ry={r * 0.92} fill="#000" opacity={0.3} />
      <circle r={r} fill={seat === 0 ? 'var(--lash)' : 'var(--seven)'} stroke="var(--ink)" strokeWidth={3} />
      <circle r={r * 0.62} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={3} />
      <circle r={r} fill="url(#fb-gloss)" />
    </>
  )
}

/** The ball, drawn at the origin. */
export function Ball({ r }: { r: number }) {
  return (
    <>
      <ellipse cx={3} cy={5} rx={r} ry={r * 0.9} fill="#000" opacity={0.3} />
      <circle r={r} fill="#fff" stroke="var(--ink)" strokeWidth={2.5} />
      <path d="M0,-4 l4,3 -1.5,5 h-5 l-1.5,-5 z" fill="var(--ink)" />
      <circle r={r} fill="url(#fb-gloss)" />
    </>
  )
}
