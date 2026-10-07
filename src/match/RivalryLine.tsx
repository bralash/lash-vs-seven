import type { RivalryView } from './useRivalry'

/** The all-time head-to-head under a match's result. */
export function RivalryLine({ r }: { r: RivalryView | null }) {
  if (!r) return null
  return (
    <div className="mt-rivalry">
      <p className="mt-rivalry__line">{r.line}</p>
      {(r.streak || r.split) && <p className="mt-rivalry__meta">{[r.streak, r.split].filter(Boolean).join(' · ')}</p>}
    </div>
  )
}
