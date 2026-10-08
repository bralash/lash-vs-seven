import type { CSSProperties } from 'react'
import { layout, squares, type Puzzle } from './engine'

/**
 * The grid. `colours` says who claimed each square ('.' open, '#' blacked out); claimed squares show
 * their letter. The selected word is lit, with the draft being spelled pencilled into its open squares.
 * `reveal` (the end of a game cut short) shows the letters nobody claimed, greyed.
 */
export function Grid({
  puzzle,
  colours,
  selected,
  draft,
  fresh,
  reveal,
  onTap,
}: {
  puzzle: Puzzle
  colours: string
  selected: number
  draft: string
  /** squares of the word just claimed, for the stamp-in */
  fresh?: number[]
  reveal?: boolean
  onTap?: (i: number) => void
}) {
  const sqs = layout(puzzle)
  const lit = selected >= 0 ? squares(puzzle, selected) : []
  return (
    <div
      className="cw-grid"
      style={{ '--cols': puzzle.cols, '--rows': puzzle.rows } as CSSProperties}
      role="grid"
      aria-label={`Crossword, ${puzzle.words.length} words`}
    >
      {sqs.map((sq, i) => {
        if (!sq) return <span key={i} className="cw-sq cw-sq--block" aria-hidden="true" />
        const who = colours[i]
        const k = lit.indexOf(i)
        const pencil = k >= 0 && who === '.' ? draft[k]?.trim() : ''
        const shown = who !== '.' ? sq.letter : pencil || (reveal ? sq.letter : '')
        return (
          <button
            key={i}
            type="button"
            className={[
              'cw-sq',
              who === '0' || who === '1' ? `cw-sq--${who}` : '',
              k >= 0 ? 'cw-sq--lit' : '',
              pencil ? 'cw-sq--pencil' : '',
              reveal && who === '.' ? 'cw-sq--missed' : '',
              fresh?.includes(i) ? 'cw-sq--new' : '',
            ].join(' ')}
            onClick={() => onTap?.(i)}
            tabIndex={-1}
            aria-label={`${sq.num ? `${sq.num}, ` : ''}${shown || 'blank'}`}
          >
            {sq.num > 0 && <span className="cw-sq__num">{sq.num}</span>}
            <span className="cw-sq__l">{shown}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The answer being spelled: fixed letters (from words already claimed across it) and the draft. */
export function AnswerTiles({ known, draft, cursor, shake }: { known: string; draft: string; cursor: number; shake?: number }) {
  return (
    <div key={shake} className={`cw-answer${shake ? ' cw-answer--wrong' : ''}`} aria-label={`Answer: ${Array.from(known, (c, i) => (c !== ' ' ? c : draft[i]?.trim() || 'blank')).join(' ')}`}>
      {Array.from(known, (c, i) => {
        const fixed = c !== ' '
        const l = fixed ? c : draft[i]?.trim()
        return (
          <span key={i} className={`cw-tile${fixed ? ' cw-tile--fixed' : l ? ' cw-tile--set' : ''}${i === cursor ? ' cw-tile--cursor' : ''}`}>
            {l}
          </span>
        )
      })}
    </div>
  )
}

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

/** Tap to spell; ⌫ takes the last letter back. Pass and Submit sit underneath. */
export function Keys({
  canType,
  canAct,
  full,
  onKey,
  onBack,
  onPass,
  onSubmit,
}: {
  canType: boolean
  canAct: boolean
  full: boolean
  onKey: (l: string) => void
  onBack: () => void
  onPass: () => void
  onSubmit: () => void
}) {
  return (
    <div className="cw-keys" role="group" aria-label="Letters">
      {ROWS.map((row, r) => (
        <div key={row} className="cw-keys__row">
          {row.split('').map((l) => (
            <button key={l} type="button" className="cw-key" disabled={!canType} onClick={() => onKey(l)}>
              {l}
            </button>
          ))}
          {r === 2 && (
            <button type="button" className="cw-key cw-key--back" disabled={!canType} onClick={onBack} aria-label="Delete letter">
              ⌫
            </button>
          )}
        </div>
      ))}
      <div className="cw-keys__row cw-keys__row--act">
        <button type="button" className="btn cw-act cw-act--pass" disabled={!canAct} onClick={onPass}>
          Pass
        </button>
        <button type="button" className="btn btn--primary cw-act" disabled={!canAct || !full} onClick={onSubmit}>
          Submit <span className="keycap">↵</span>
        </button>
      </div>
    </div>
  )
}

/** Across and Down, claimed clues struck through in the claimer's colour. Wide screens only. */
export function ClueLists({ puzzle, owners, selected, onPick }: { puzzle: Puzzle; owners: string; selected: number; onPick: (w: number) => void }) {
  return (
    <div className="cw-lists">
      {(['A', 'D'] as const).map((dir) => (
        <section key={dir} className="cw-list">
          <h2 className="label">{dir === 'A' ? 'Across' : 'Down'}</h2>
          <ol>
            {puzzle.words.map((x, w) =>
              x.dir !== dir ? null : (
                <li key={w}>
                  <button
                    type="button"
                    className={`cw-clue${owners[w] !== '.' ? ` cw-clue--${owners[w]}` : ''}${w === selected ? ' cw-clue--on' : ''}`}
                    onClick={() => onPick(w)}
                  >
                    <b>{x.num}</b> {x.clue} <span className="cw-clue__len">({x.word.length})</span>
                  </button>
                </li>
              ),
            )}
          </ol>
        </section>
      ))}
    </div>
  )
}
