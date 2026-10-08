import { useEffect, useId, useState } from 'react'
import { playerId } from '../lib/firebase'
import { useSound } from '../lib/sound'
import { STAKE_IDEAS, STAKE_MAX, type StakeFormat } from '../match/stakes'
import { acceptStake, seatedPlayers, setStake, type Room } from './rooms'

const FORMATS: { value: StakeFormat; label: string; blurb: string }[] = [
  { value: 'winner', label: 'Winner takes all', blurb: 'Everyone else owes the winner' },
  { value: 'last', label: 'Last place pays', blurb: 'Last place owes everyone else' },
]

/**
 * The waiting room's stakes: the host can play for something (off by default); everyone else has to
 * agree before the match can start. The app only keeps score of who owes whom.
 */
export function StakePanel({ room }: { room: Room }) {
  const pid = playerId()
  const isHost = room.hostId === pid
  const stake = room.stake
  const many = seatedPlayers(room).length > 2
  const { play } = useSound()
  const [open, setOpen] = useState(!!stake)
  const [draft, setDraft] = useState(stake?.text ?? '')
  const id = useId()
  useEffect(() => setDraft(room.stake?.text ?? ''), [room.stake?.text])

  const waitingOn = seatedPlayers(room).filter((p) => p && p.id !== room.hostId && room.stakeOk?.[p.id] !== stake?.text)
  const format = stake?.format ?? 'winner'
  const formatLabel = many ? ` · ${FORMATS.find((f) => f.value === format)!.label}` : ''

  if (!isHost) {
    if (!stake) return null
    const agreed = room.stakeOk?.[pid] === stake.text
    return (
      <div className="stake stake--guest" role="group" aria-label="Stakes">
        <span className="label">Playing for</span>
        <p className="stake__text">{stake.text}</p>
        {many && <p className="hint">{FORMATS.find((f) => f.value === format)!.blurb}</p>}
        <p className="hint">Pressing Leave mid-match counts as a loss</p>
        <button
          type="button"
          className={`btn btn--block${agreed ? '' : ' btn--primary'}`}
          disabled={agreed}
          onClick={() => {
            play('tap')
            acceptStake(room.game, room.code, stake.text).catch(() => {})
          }}
        >
          {agreed ? '✓ You’re in' : 'I’m in'}
        </button>
      </div>
    )
  }

  const save = (text: string, f: StakeFormat = format) => {
    const clean = text.trim().slice(0, STAKE_MAX)
    if (!clean) return
    play('tap')
    setStake(room.game, room.code, { text: clean, format: f }).catch(() => {})
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--block stake__toggle" onClick={() => setOpen(true)}>
        Play for stakes
      </button>
    )
  }

  return (
    <div className="stake" role="group" aria-label="Stakes">
      <div className="stake__head">
        <label className="label" htmlFor={id}>Playing for</label>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setOpen(false)
            setDraft('')
            if (stake) setStake(room.game, room.code, null).catch(() => {})
          }}
        >
          No stakes
        </button>
      </div>
      <form
        className="stake__field"
        onSubmit={(e) => {
          e.preventDefault()
          save(draft)
        }}
      >
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() && draft.trim() !== stake?.text && save(draft)}
          placeholder="₵10, waakye, drinks…"
          maxLength={STAKE_MAX}
          autoComplete="off"
          enterKeyHint="done"
        />
        <button type="submit" className="btn" disabled={!draft.trim() || draft.trim() === stake?.text}>
          Set
        </button>
      </form>
      <div className="stake__ideas">
        {STAKE_IDEAS.map((t) => (
          <button key={t} type="button" className="stake__idea" aria-pressed={stake?.text === t} onClick={() => save(t)}>
            {t}
          </button>
        ))}
      </div>
      {many && (
        <div className="seg" role="group" aria-label="Who pays">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="seg__btn"
              aria-pressed={format === f.value}
              onClick={() => stake && save(stake.text, f.value)}
              disabled={!stake}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <p className="hint" aria-live="polite">
        {!stake
          ? 'Pick or type what you’re playing for'
          : waitingOn.length
            ? `Waiting for ${waitingOn.map((p) => p!.name).join(' & ')} to agree${formatLabel}`
            : seatedPlayers(room).filter(Boolean).length > 1
              ? `Everyone’s in${formatLabel}`
              : `Whoever joins has to agree${formatLabel}`}
      </p>
    </div>
  )
}
