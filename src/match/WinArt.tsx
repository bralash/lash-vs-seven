import { Chip } from '../components/Chip'
import type { WinId } from './flair'
import '../styles/match.css'

/** A small picture of a win from the shop, for its card (null: the everyday confetti). */
export function WinArt({ id, size = 64 }: { id: WinId | null; size?: number }) {
  return (
    <span className={`win-art win-art--${id ?? 'confetti'}`} style={{ width: size, height: size }} aria-hidden="true">
      {id === 'chiprain' ? (
        <>
          <Chip v={25} size={size * 0.42} />
          <Chip v={100} size={size * 0.36} />
          <Chip v={5} size={size * 0.4} />
        </>
      ) : id === 'akwaaba' ? (
        <svg viewBox="-50 -50 100 100" width={size * 0.6}>
          <polygon points="0,-46 11,-15 44,-14 18,6 27,38 0,19 -27,38 -18,6 -44,-14 -11,-15" fill="#121016" />
        </svg>
      ) : id === 'fireworks' ? (
        <svg viewBox="-50 -50 100 100" width={size * 0.8}>
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k / 12) * Math.PI * 2
            return <line key={k} x1={Math.cos(a) * 12} y1={Math.sin(a) * 12} x2={Math.cos(a) * 40} y2={Math.sin(a) * 40} stroke={['#ffd23f', '#ff5a1f', '#2d5bff', '#ff2bd6'][k % 4]} strokeWidth="6" strokeLinecap="round" />
          })}
        </svg>
      ) : id === 'banner' ? (
        <span className="win-art__banner">Champ</span>
      ) : (
        Array.from({ length: 9 }, (_, k) => <i key={k} style={{ background: ['#ffd23f', '#ff5a1f', '#2d5bff', '#121016'][k % 4], left: `${10 + ((k * 37) % 80)}%`, top: `${10 + ((k * 53) % 75)}%`, rotate: `${k * 40}deg` }} />)
      )}
    </span>
  )
}
