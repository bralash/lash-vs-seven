import { useState, type CSSProperties } from 'react'
import { useSound } from '../lib/sound'
import { chipsFor, type ChipValue } from '../match/chips'
import { Chip } from './Chip'
import { Portal } from './Portal'

interface Flight {
  id: number
  v: ChipValue
  x: number
  y: number
  dx: number
  dy: number
  delay: number
}

/**
 * Chips flying from one element to another (collecting a mission: from the button into your pile),
 * with a clack as each lands. `fly` starts one; render `layer` somewhere on the page.
 */
export function useChipFlight() {
  const [flights, setFlights] = useState<Flight[]>([])
  const { play } = useSound()

  const fly = (from: Element | null | undefined, to: Element | null | undefined, amount: number) => {
    const a = from?.getBoundingClientRect()
    const b = to?.getBoundingClientRect()
    if (!a || !b || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const vs = chipsFor(amount, 7)
    const x = a.left + a.width / 2 - 15
    const y = a.top + a.height / 2 - 15
    const stamp = Date.now()
    setFlights(
      vs.map((v, i) => ({
        id: stamp + i,
        v,
        x: x + (i - vs.length / 2) * 10,
        y,
        dx: b.left + b.width / 2 - 15 - x - (i - vs.length / 2) * 10,
        dy: b.top + b.height / 2 - 15 - y,
        delay: i * 80,
      })),
    )
    vs.forEach((_, i) => setTimeout(() => play('clack'), 560 + i * 80))
    setTimeout(() => setFlights([]), 900 + vs.length * 80)
  }

  const layer = flights.length ? (
    <Portal>
      {flights.map((f) => (
        <span
          key={f.id}
          className="chip-fly"
          aria-hidden="true"
          style={{ left: f.x, top: f.y, '--dx': `${f.dx}px`, '--dy': `${f.dy}px`, animationDelay: `${f.delay}ms` } as CSSProperties}
        >
          <Chip v={f.v} size={30} />
        </span>
      ))}
    </Portal>
  ) : null

  return { fly, layer }
}
