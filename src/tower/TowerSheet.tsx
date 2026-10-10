import { useEffect, useRef } from 'react'
import { Chip } from '../components/Chip'
import { OpsFace } from '../components/OpsFace'
import { Portal } from '../components/Portal'
import { useSound } from '../lib/sound'
import { floorOf, HEARTS } from './floors'
import type { Outcome } from './tower'
import '../styles/tower.css'

export type SheetState =
  /** a game of a longer floor is over, the floor isn't: the score so far */
  | { kind: 'next'; wins: [number, number] }
  /** a draw: go again, nothing lost */
  | { kind: 'draw' }
  /** saving the result */
  | { kind: 'saving'; won: boolean }
  | { kind: 'done'; out: Outcome }
  | { kind: 'error'; won: boolean }

export function Hearts({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="tw-hearts" aria-label={`${n} of ${HEARTS} hearts`}>
      {Array.from({ length: HEARTS }, (_, i) => (
        <svg key={i} viewBox="0 0 24 22" width={size} height={size * 0.92} className={i < n ? 'tw-heart' : 'tw-heart tw-heart--gone'} aria-hidden="true">
          <path d="M12 21 2.6 11.6A5.6 5.6 0 0 1 12 4.3a5.6 5.6 0 0 1 9.4 7.3Z" />
        </svg>
      ))}
    </span>
  )
}

/**
 * Over a Tower floor's result: cleared (and its chips), a heart lost, or out of hearts and back
 * to the checkpoint. The board stays visible above it.
 */
export function TowerSheet({ floor, sheet, onAgain, onTower, onRetry }: { floor: number; sheet: SheetState; onAgain: () => void; onTower: () => void; onRetry: () => void }) {
  const f = floorOf(floor)!
  const { play } = useSound()
  const sounded = useRef(false)
  useEffect(() => {
    if (sheet.kind !== 'done' || sounded.current) return
    sounded.current = true
    play(sheet.out.won ? 'findBig' : 'error')
  }, [sheet, play])

  let face: 'win' | 'lose' | 'hello' = 'hello'
  let title = ''
  let line = ''
  let body = null
  let actions = null

  if (sheet.kind === 'next') {
    title = `${sheet.wins[0]} – ${sheet.wins[1]}`
    line = `First to ${f.firstTo} against ${f.guardianName}. Next game!`
    actions = (
      <button type="button" className="btn btn--primary btn--block" onClick={onAgain}>
        Next game
      </button>
    )
  } else if (sheet.kind === 'draw') {
    title = 'A draw'
    line = 'Nobody falls on a draw. Go again.'
    actions = (
      <button type="button" className="btn btn--primary btn--block" onClick={onAgain}>
        Go again
      </button>
    )
  } else if (sheet.kind === 'saving') {
    title = sheet.won ? `Floor ${floor} cleared!` : `${f.guardianName} holds the floor`
    line = 'Saving your climb…'
  } else if (sheet.kind === 'error') {
    title = 'Couldn’t save that'
    line = 'Check your connection and try again.'
    actions = (
      <button type="button" className="btn btn--primary btn--block" onClick={onRetry}>
        Try again
      </button>
    )
  } else {
    const { out } = sheet
    if (out.won) {
      face = 'lose'
      title = floor === 10 ? 'Ops is beaten!' : `Floor ${floor} cleared!`
      line = out.paid ? `${f.guardianName} steps aside.` : `${f.guardianName} steps aside. (Chips for this floor were paid earlier this season.)`
      body = out.paid ? (
        <p className="tw-sheet__chips">
          <Chip v={out.paid >= 100 ? 100 : out.paid >= 25 ? 25 : 5} size={34} /> +{out.paid} chips
        </p>
      ) : null
      actions = (
        <button type="button" className="btn btn--primary btn--block" onClick={onTower}>
          {floor === 10 ? 'Back to the Tower' : `Climb to floor ${floor + 1}`}
        </button>
      )
    } else if (out.fell) {
      face = 'win'
      title = 'Out of hearts'
      line = `Back down to floor ${out.fell}, hearts filled up. Climb again!`
      actions = (
        <button type="button" className="btn btn--primary btn--block" onClick={onTower}>
          Back to the Tower
        </button>
      )
    } else {
      face = 'win'
      title = `${f.guardianName} wins this one`
      line = `You lost a heart. ${out.climb.hearts} left.`
      body = <Hearts n={out.climb.hearts} size={26} />
      actions = (
        <>
          <button type="button" className="btn btn--primary btn--block" onClick={onAgain}>
            Try again
          </button>
          <button type="button" className="link-btn" onClick={onTower}>
            Back to the Tower
          </button>
        </>
      )
    }
  }

  const tone = sheet.kind === 'done' ? (sheet.out.won ? 'won' : 'lost') : 'mid'
  return (
    <Portal>
      <div className={`tw-sheet tw-sheet--${tone}`} role="dialog" aria-label={title}>
        <div className="tw-sheet__face" aria-hidden="true">
          <OpsFace look={f.guardian} mood={face} size={64} />
        </div>
        <div className="tw-sheet__main">
          <p className="tw-sheet__floor">
            Ops’ Tower · Floor {floor}
          </p>
          <h2 className="tw-sheet__title">{title}</h2>
          <p className="tw-sheet__line">{line}</p>
          {body}
        </div>
        <div className="tw-sheet__actions">{actions}</div>
      </div>
    </Portal>
  )
}
