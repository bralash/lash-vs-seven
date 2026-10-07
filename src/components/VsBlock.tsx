import type { CSSProperties } from 'react'
import '../styles/vs.css'

/**
 * The yellow VS block as a small character for the site's in-between moments (waiting, countdown,
 * turns, results, someone leaving). Pure CSS motion, keyed by `mood`; change `key` to replay.
 */
export type VsMood =
  | 'idle'
  | 'wait'
  | 'joined'
  | 'count'
  | 'turn'
  | 'win'
  | 'draw'
  | 'left'
  | 'loading'

export function VsBlock({
  mood = 'idle',
  side,
  eyes = false,
  label = 'VS',
  size = 120,
}: {
  mood?: VsMood
  /** whose moment it is: 0 = Lash (left, orange), 1 = Seven (right, blue) */
  side?: 0 | 1
  /** two dot eyes above the letters — the "character" version */
  eyes?: boolean
  /** what's printed on the block: "VS", or a countdown digit */
  label?: string
  size?: number
}) {
  return (
    <div
      className={`vsb vsb--${mood}${eyes ? ' vsb--eyes' : ''}`}
      data-side={side}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      <div className="vsb__body">
        {eyes && (
          <span className="vsb__eyes">
            <i />
            <i />
          </span>
        )}
        <span className="vsb__label" key={label}>{label}</span>
      </div>
      {mood === 'win' && (
        <span className="vsb__burst">
          {Array.from({ length: 8 }, (_, i) => (
            <b key={i} style={{ '--a': `${i * 45}deg` } as CSSProperties} />
          ))}
        </span>
      )}
    </div>
  )
}
