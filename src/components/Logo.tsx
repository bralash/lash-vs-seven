import { Link } from 'react-router-dom'

export function LogoMark({ className = 'logo__mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="34" height="34" fill="#121016" />
      <rect x="1" y="1" width="34" height="34" fill="#ffd23f" stroke="#121016" strokeWidth="2.5" />
      <text x="18" y="25.5" textAnchor="middle" fontFamily="Bowlby One, Arial Black, sans-serif" fontSize="15" fill="#121016">VS</text>
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
