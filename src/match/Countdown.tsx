import { Fragment } from 'react'
import { Portal } from '../components/Portal'

interface Props {
  /** small line above the names, e.g. "Round 2" or "Match 3" */
  label: string
  /** seconds remaining, or 0 for the "GO!" beat */
  n: number
  /** two, or up to four in games for more */
  names: string[]
  /** one line under the number, e.g. "Same grid · 80 seconds · most points wins" */
  subtitle: string
}

/** Fullscreen blackout before a round — also hides the board so nobody gets a head start. */
export function Countdown({ label, n, names, subtitle }: Props) {
  const go = n <= 0
  return (
    <Portal lockScroll>
      <div className={`mt-countdown${go ? ' mt-countdown--go' : ''}`} role="status" aria-live="assertive">
        <p className="label">{label}</p>
        <p className="mt-countdown__vs" aria-hidden={go}>
          {names.map((name, k) => (
            <Fragment key={k}>
              {k > 0 && <i>vs</i>}
              <span className={`p${k}`}>{name}</span>
            </Fragment>
          ))}
        </p>
        {/* capped: for a moment after "start" the server time is still a local estimate and can read 4 */}
        <span key={n} className="mt-countdown__n">{go ? 'Go!' : Math.min(n, 3)}</span>
        <p className="mt-countdown__sub">{subtitle}</p>
      </div>
    </Portal>
  )
}
