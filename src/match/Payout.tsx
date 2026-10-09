import { useEffect, useState } from 'react'
import { Chip } from '../components/Chip'
import { useSound } from '../lib/sound'
import { chipsFor, usePayout } from './chips'

/** how long apart the chips drop in */
const DROP_MS = 140

/**
 * Under a match's result: the chips it paid, dropping in one by one with a clack, and what for.
 * Shows only a payout that came in since this results screen opened.
 */
export function Payout() {
  const [since] = useState(() => Date.now() - 1000)
  const p = usePayout(since)
  const { play } = useSound()
  const pile = p ? chipsFor(p.total) : []
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!p) return
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (calm || !p.fresh) {
      setShown(pile.length)
      return
    }
    setShown(0)
    const timers = pile.map((_, i) =>
      setTimeout(() => {
        setShown(i + 1)
        play('clack')
      }, 250 + i * DROP_MS),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.key, p?.at])

  if (!p) return null
  return (
    <div className="payout" role="status">
      <div className="payout__pile" aria-hidden="true">
        {pile.slice(0, shown).map((v, i) => (
          <span key={i} className="payout__chip">
            <Chip v={v} size={34} />
          </span>
        ))}
      </div>
      <p className="payout__total">
        +{p.total} chips{!p.fresh && <span> · already paid</span>}
      </p>
      {p.lines.length > 0 && <p className="payout__lines">{p.lines.map((l) => `${l.label} ${l.n}`).join(' · ')}</p>}
    </div>
  )
}
