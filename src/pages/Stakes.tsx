import { gameBySlug } from '../games/registry'
import { useSound } from '../lib/sound'
import { markPaid, useDebts, type Debt } from '../match/stakes'

const gameName = (slug: string) => gameBySlug(slug)?.name ?? slug

/** For the homepage tile: what's open ("You owe 1 · 2 owed to you"), and how many wait on you to tick. */
export function stakesSummary(me: string, debts: Debt[]) {
  const mine = debts.filter((d) => d.from === me).length
  const theirs = debts.length - mine
  return {
    line: [mine && `You owe ${mine}`, theirs && `${theirs} owed to you`].filter(Boolean).join(' · '),
    // the other side has ticked theirs and it's down to you
    waiting: debts.filter((d) => !d.paid?.[me] && d.paid?.[d.from === me ? d.to : d.from]).length,
  }
}

/**
 * "Stakes" (/stakes): what you owe and what you're owed from matches played for stakes. A debt
 * is settled (and drops off) once both of you tick it — the payer says they paid, the other that they
 * got it. Nothing changes hands through the app.
 */
export function Stakes() {
  const { me, debts } = useDebts()
  if (!me) return null
  if (!debts.length) return <p className="hint rivals__empty">Nothing owed either way. Play a match for stakes and who owes whom shows up here until you both tick it off.</p>
  return (
    <section className="stakes" aria-label="Stakes">
      <p className="hint">{stakesSummary(me, debts).line}</p>
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
