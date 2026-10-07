import type { Seat } from '../../lobby/rooms'
import { PEERS, boxOf, colOf, rowOf } from './engine'

interface BoardProps {
  /** the clues ('.' where the player fills in) */
  puzzle: string
  /** clues plus the player's entries */
  grid: string
  /** pencil marks per cell, as bitmasks (bit d = digit d) */
  notes: number[]
  selected: number
  /** cells whose digit clashes with another in its row, column or box */
  clashes: Set<number>
  seat: Seat
  /** board locked (countdown, finished…) */
  locked?: boolean
  onSelect: (cell: number) => void
}

/**
 * The 9×9 grid. Tapping a cell selects it; its row, column and box are shaded, and every cell with
 * the same digit is marked so you can scan for where a number can still go. Clashes show in red.
 */
export function SudokuBoard({ puzzle, grid, notes, selected, clashes, seat, locked, onSelect }: BoardProps) {
  const selDigit = selected >= 0 ? grid[selected] : '.'
  const peers = selected >= 0 ? new Set(PEERS[selected]) : new Set<number>()

  return (
    <div className={`su-board${locked ? ' su-board--locked' : ''}`} role="grid" aria-label="Sudoku grid">
      {grid.split('').map((v, i) => {
        const given = puzzle[i] !== '.'
        const cls = [
          'su-cell',
          given ? 'su-cell--given' : v !== '.' ? `su-cell--mine su-cell--${seat}` : '',
          i === selected ? 'su-cell--sel' : peers.has(i) ? 'su-cell--peer' : '',
          v !== '.' && v === selDigit && i !== selected ? 'su-cell--same' : '',
          clashes.has(i) ? 'su-cell--clash' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={i}
            type="button"
            className={cls}
            data-i={i}
            data-box={boxOf(i)}
            // every fourth track is a thin spacer, which draws the thicker lines between the 3×3 boxes
            style={{ gridColumn: colOf(i) + Math.floor(colOf(i) / 3) + 1, gridRow: rowOf(i) + Math.floor(rowOf(i) / 3) + 1 }}
            onClick={() => !locked && onSelect(i)}
            aria-label={`Row ${rowOf(i) + 1}, column ${colOf(i) + 1}: ${v === '.' ? 'empty' : v}${given ? ', clue' : ''}`}
          >
            {v !== '.' ? (
              <span className="su-digit">{v}</span>
            ) : notes[i] ? (
              <span className="su-notes" aria-hidden="true">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                  <i key={d}>{notes[i] & (1 << d) ? d : ''}</i>
                ))}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

interface PadProps {
  /** how many of each digit (1–9) are on the board */
  counts: number[]
  notesMode: boolean
  seat: Seat
  disabled?: boolean
  onDigit: (d: number) => void
  onErase: () => void
  onToggleNotes: () => void
}

/** Digits 1–9 (each shows how many are left to place), plus Notes and Erase. */
export function NumberPad({ counts, notesMode, seat, disabled, onDigit, onErase, onToggleNotes }: PadProps) {
  return (
    <div className={`su-pad su-pad--${seat}`}>
      <div className="su-pad__digits">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
          const left = 9 - counts[d]
          return (
            <button
              key={d}
              type="button"
              className={`su-key${left <= 0 ? ' su-key--done' : ''}`}
              onClick={() => onDigit(d)}
              disabled={disabled}
              aria-label={`${d}${left > 0 ? `, ${left} left` : ', all placed'}`}
            >
              <span className="su-key__d">{d}</span>
              <span className="su-key__left" aria-hidden="true">{left > 0 ? left : '✓'}</span>
            </button>
          )
        })}
      </div>
      <div className="su-pad__tools">
        <button type="button" className={`su-tool${notesMode ? ' su-tool--on' : ''}`} onClick={onToggleNotes} disabled={disabled} aria-pressed={notesMode}>
          <PencilIcon /> Notes {notesMode ? 'on' : 'off'}
        </button>
        <button type="button" className="su-tool" onClick={onErase} disabled={disabled}>
          <EraseIcon /> Erase
        </button>
      </div>
    </div>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
      <path d="M4 20l1-5L16 4l4 4L9 19z" />
      <path d="M13 7l4 4" />
    </svg>
  )
}

function EraseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
      <path d="M9 5h11v14H9l-6-7z" />
      <path d="M12 9l5 6M17 9l-5 6" />
    </svg>
  )
}
