import { Link } from 'react-router-dom'

/** The mark: an L (Lash) and a 7 (Seven) locked into a square, on a 64-unit grid with the tile at 2–56.
 *  Shared with the share card (Path2D), and mirrored by public/favicon.svg. */
export const MARK_L = 'M11 11H21V38H31V48H11Z'
/** the 7 is the L turned half a circle: Lash and Seven are the same piece, facing off */
export const MARK_7 = 'M47 48H37V21H27V11H47Z'

export function LogoMark({ className = 'logo__mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 62 62" aria-hidden="true">
      <rect x="8" y="8" width="54" height="54" fill="#121016" />
      <rect x="2" y="2" width="54" height="54" fill="#ffd23f" stroke="#121016" strokeWidth="4" />
      <g fill="#121016" transform="translate(2.5 2.5)">
        <path d={MARK_L} />
        <path d={MARK_7} />
      </g>
      <g stroke="#121016" strokeWidth="2.5">
        <path d={MARK_L} fill="#ff5a1f" />
        <path d={MARK_7} fill="#2d5bff" />
      </g>
    </svg>
  )
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Lash vs Seven — all games">
      <LogoMark />
      <span className="logo__word" aria-hidden="true">
        <span>Lash <span className="vs">vs</span></span>
        <span>Seven</span>
      </span>
    </Link>
  )
}
