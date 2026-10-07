import { Portal } from '../../components/Portal'

interface Props {
  round: number
  /** seconds remaining, or 0 for the "GO!" beat */
  n: number
  names: [string, string]
  seconds: number
}

/** Fullscreen blackout before each round — also hides the grid so nobody gets a head start. */
export function Countdown({ round, n, names, seconds }: Props) {
  const go = n <= 0
  return (
    <Portal lockScroll>
      <div className={`wh-countdown${go ? ' wh-countdown--go' : ''}`} role="status" aria-live="assertive">
        <p className="label">Round {round}</p>
        <p className="wh-countdown__vs" aria-hidden={go}>
          <span className="p0">{names[0]}</span>
          <i>vs</i>
          <span className="p1">{names[1]}</span>
        </p>
        <span key={n} className="wh-countdown__n">{go ? 'Go!' : n}</span>
        <p className="wh-countdown__sub">Same grid · {seconds} seconds · most points wins</p>
      </div>
    </Portal>
  )
}
