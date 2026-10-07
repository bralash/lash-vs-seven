import { useMemo } from 'react'

const COLORS = ['#ffd23f', '#ff5a1f', '#2d5bff', '#121016', '#fbf7ee']

/** One-shot CSS confetti burst; hidden entirely for reduced-motion users. */
export function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 2.2 + Math.random() * 1.6,
        drift: (Math.random() - 0.5) * 220,
        spin: (Math.random() - 0.5) * 1080,
        w: 6 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
      })),
    [],
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
