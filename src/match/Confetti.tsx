import { useEffect, useMemo, type CSSProperties } from 'react'
import { Chip } from '../components/Chip'
import type { ChipValue } from './chips'
import { KEYS, load } from '../lib/storage'
import { useSound } from '../lib/sound'
import { useWinPick, type WinId } from './flair'

const COLORS = ['#ffd23f', '#ff5a1f', '#2d5bff', '#121016', '#fbf7ee']
const GHANA = ['#ce1126', '#fcd116', '#006b3f']

/**
 * What plays when you win: the confetti, or the win you picked from the shop (flair.tsx). Every game's
 * results screen shows this for the winner. `win` shows a given one (the shop's "Tap to try").
 * Hidden entirely for reduced-motion users.
 */
export function Confetti({ win }: { win?: WinId | null } = {}) {
  const picked = useWinPick()
  const w = win === undefined ? picked : win
  if (w === 'chiprain') return <ChipRain />
  if (w === 'akwaaba') return <Akwaaba />
  if (w === 'fireworks') return <Fireworks />
  if (w === 'banner') return <Banner />
  return <Bits colors={COLORS} n={70} />
}

/** the classic burst of paper */
function Bits({ colors, n }: { colors: string[]; n: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 2.2 + Math.random() * 1.6,
        drift: (Math.random() - 0.5) * 220,
        spin: (Math.random() - 0.5) * 1080,
        w: 6 + Math.random() * 8,
        color: colors[i % colors.length],
      })),
    [colors, n],
  )
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: `${b.left}%`,
            width: b.w,
            height: b.w * 0.55,
            background: b.color,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            ['--drift' as string]: `${b.drift}px`,
            ['--spin' as string]: `${b.spin}deg`,
          }}
        />
      ))}
    </div>
  )
}

/** plays a few sounds on the way in */
function useCues(cues: [Parameters<ReturnType<typeof useSound>['play']>[0], number][]) {
  const { play } = useSound()
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ids = cues.map(([c, at]) => setTimeout(() => play(c), at))
    return () => ids.forEach(clearTimeout)
    // once, on the way in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** casino chips pour down and clack */
function ChipRain() {
  const vs: ChipValue[] = [1, 5, 25, 100, 500]
  const chips = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        v: vs[i % vs.length],
        left: Math.random() * 96,
        delay: Math.random() * 1.4,
        dur: 1.6 + Math.random() * 1.2,
        spin: (Math.random() - 0.5) * 720,
        size: 22 + Math.random() * 16,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useCues([0, 1, 2, 3, 4, 5, 6, 7].map((k) => ['clack', 500 + k * 170]))
  return (
    <div className="confetti win-chips" aria-hidden="true">
      {chips.map((c, i) => (
        <span key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ['--spin' as string]: `${c.spin}deg` } as CSSProperties}>
          <Chip v={c.v} size={c.size} />
        </span>
      ))}
    </div>
  )
}

/** Ghana's colours round the black star, to the talking drums */
function Akwaaba() {
  useCues([['drums', 150], ['drums', 1000]])
  return (
    <>
      <Bits colors={GHANA} n={90} />
      <div className="confetti win-star" aria-hidden="true">
        <svg viewBox="-50 -50 100 100">
          <polygon points="0,-46 11,-15 44,-14 18,6 27,38 0,19 -27,38 -18,6 -44,-14 -11,-15" />
        </svg>
      </div>
    </>
  )
}

/** rockets up, then bursts */
function Fireworks() {
  const bursts = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: 12 + Math.random() * 76,
        y: 14 + Math.random() * 36,
        delay: 0.15 + i * 0.42 + Math.random() * 0.2,
        color: ['#ffd23f', '#ff5a1f', '#2d5bff', '#ff2bd6', '#1f9d55'][i % 5],
      })),
    [],
  )
  useCues(bursts.map((b) => ['boom', (b.delay + 0.55) * 1000]))
  return (
    <div className="confetti win-fireworks" aria-hidden="true">
      {bursts.map((b, i) => (
        <span key={i} className="win-fireworks__burst" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${b.delay}s`, ['--c' as string]: b.color } as CSSProperties}>
          <span className="win-fireworks__trail" style={{ animationDelay: `${b.delay}s` }} />
          {Array.from({ length: 16 }, (_, k) => {
            const a = (k / 16) * Math.PI * 2
            return <i key={k} style={{ animationDelay: `${b.delay + 0.55}s`, ['--dx' as string]: `${Math.cos(a) * 90}px`, ['--dy' as string]: `${Math.sin(a) * 90}px` } as CSSProperties} />
          })}
        </span>
      ))}
    </div>
  )
}

/** a banner with your name drops in, to a trumpet */
function Banner() {
  const name = load(KEYS.name) || 'You'
  useCues([['trumpet', 250]])
  return (
    <>
      <Bits colors={['#ffd23f', '#121016', '#fbf7ee']} n={40} />
      <div className="confetti win-banner" aria-hidden="true">
        <div className="win-banner__cloth">
          <span className="win-banner__top">Champion</span>
          <span className="win-banner__name">{name}</span>
        </div>
      </div>
    </>
  )
}
