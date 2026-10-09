import { CHIPS, type ChipValue } from '../match/chips'

const BY_V = Object.fromEntries(CHIPS.map((c) => [c.v, c])) as Record<ChipValue, (typeof CHIPS)[number]>
const INK = 'var(--ink)'

/** A casino chip: thick ink rim, eight notches round the edge, a dashed inner ring, the value. */
export function Chip({ v, size = 32, label }: { v: ChipValue; size?: number; label?: string }) {
  const c = BY_V[v]
  const fs = String(v).length > 2 ? 22 : 28
  return (
    <svg className="cchip" viewBox="-52 -52 104 104" width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle r="48" fill={c.face} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="-6" y="-48" width="12" height="15" fill={c.notch} transform={`rotate(${i * 45})`} />
      ))}
      {/* thinner rim when small, or the ink swamps the colour */}
      <circle r="48" fill="none" stroke={INK} strokeWidth={size < 32 ? 3 : 5} />
      <circle r="30" fill={c.face} stroke={c.notch} strokeWidth="3" strokeDasharray="7 5" />
      <circle r="24" fill="none" stroke={INK} strokeWidth="2" opacity=".35" />
      <text y={fs * 0.36} textAnchor="middle" fontFamily="var(--display)" fontSize={fs} fill={c.text}>
        {v}
      </text>
    </svg>
  )
}

/** A small pile of chips, overlapping, for a balance. */
export function ChipStack({ size = 30 }: { size?: number }) {
  const pile: ChipValue[] = [5, 1, 25]
  return (
    <span className="chip-stack" style={{ width: size * 1.8, height: size * 1.15 }} aria-hidden="true">
      {pile.map((v, i) => (
        <span key={i} className="chip-stack__chip" style={{ left: i * size * 0.4, top: i % 2 ? 0 : size * 0.15 }}>
          <Chip v={v} size={size} />
        </span>
      ))}
    </span>
  )
}
