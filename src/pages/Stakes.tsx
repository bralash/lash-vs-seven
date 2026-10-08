import { gameBySlug } from '../games/registry'
import { useSound } from '../lib/sound'
import { markPaid, useDebts, type Debt } from '../match/stakes'

const gameName = (slug: string) => gameBySlug(slug)?.name ?? slug

/**
 * "Stakes" on the homepage: what you owe and what you're owed from matches played for stakes. A debt
 * is settled (and drops off) once both of you tick it — the payer says they paid, the other that they
 * got it. Nothing changes hands through the app.
 */
export function Stakes() {
  const { me, debts } = useDebts()
  if (!me || !debts.length) return null
  const mine = debts.filter((d) => d.from === me).length
  const theirs = debts.length - mine
  return (
    <section className="stakes" aria-labelledby="stakes-title">
      <h2 id="stakes-title" className="rivals__title">Stakes</h2>
      <p className="hint">{[mine && `You owe ${mine}`, theirs && `${theirs} owed to you`].filter(Boolean).join(' · ')}</p>
      <ul className="stakes__list">
        {debts.map((d) => (
          <DebtRow key={d.id} d={d} me={me} />
        ))}
      </ul>
    </section>
  )
}

function DebtRow({ d, me }: { d: Debt; me: string }) {
  const { play } = useSound()
  const iOwe = d.from === me
  const other = iOwe ? d.toName : d.fromName
  const otherId = iOwe ? d.to : d.from
  const ticked = !!d.paid?.[me]
  const theyTicked = !!d.paid?.[otherId]
  const status = ticked
    ? `Waiting for ${other} to ${iOwe ? 'confirm' : 'say they paid'}`
    : theyTicked
      ? iOwe ? `${other} says you’re square` : `${other} says they paid`
      : null
  return (
    <li className={`debt${iOwe ? ' debt--owe' : ''}`}>
      <div className="debt__main">
        <span className="debt__who">{iOwe ? `You owe ${other}` : `${other} owes you`}</span>
        <span className="debt__what">
          {d.stake}
          {d.part ? <small> · split {d.part} ways</small> : null}
        </span>
        <span className="debt__meta">
          {gameName(d.game)}
          {status && <b> · {status}</b>}
        </span>
      </div>
      <button
        type="button"
        className={`btn debt__btn${!ticked && theyTicked ? ' btn--primary' : ''}`}
        aria-pressed={ticked}
        onClick={() => {
          play('tap')
          markPaid(d.id, !ticked)
        }}
      >
        {ticked ? 'Undo' : iOwe ? 'I paid' : 'Got it'}
      </button>
    </li>
  )
}
