import { useState } from 'react'
import { Payout } from './Payout'
import type { RivalryView } from './useRivalry'

/** The all-time head-to-head under a match's result, any feats earned in it, and the chips it paid. */
export function RivalryLine({ r }: { r: RivalryView | null }) {
  const [open, setOpen] = useState<string | null>(null)
  // against Ops there's no record, but a win still pays
  if (!r) return <Payout />
  const shown = r.feats.find((f) => `${f.id}:${f.who}` === open)
  return (
    <div className="mt-rivalry">
      {r.stakes && (
        <ul className="mt-stakes" aria-label="Stakes">
          {r.stakes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className="mt-rivalry__line">{r.line}</p>
      {(r.streak || r.split) && <p className="mt-rivalry__meta">{[r.streak, r.split].filter(Boolean).join(' · ')}</p>}
      <Payout />
      {r.feats.length > 0 && (
        <>
          <ul className="mt-feats" aria-label="Feats this match">
            {r.feats.map((f) => {
              const key = `${f.id}:${f.who}`
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`mt-feat${f.first ? ' mt-feat--first' : ''}`}
                    aria-expanded={open === key}
                    onClick={() => setOpen(open === key ? null : key)}
                  >
                    <b>{f.name}</b>
                    <span>
                      {f.who} · {f.note}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {shown && <p className="mt-feats__why">{shown.blurb}</p>}
        </>
      )}
    </div>
  )
}
