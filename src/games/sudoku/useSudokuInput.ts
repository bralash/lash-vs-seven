import { useCallback, useEffect, useMemo, useState } from 'react'
import { PEERS, conflicts } from './engine'

interface Saved {
  grid: string
  notes: number[]
}

function loadSaved(key: string, puzzle: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(key)
    const s = raw ? (JSON.parse(raw) as Saved) : null
    // only trust a save that belongs to this exact puzzle
    return s && s.grid.length === 81 && [...puzzle].every((v, i) => v === '.' || s.grid[i] === v) ? s : null
  } catch {
    return null
  }
}

/**
 * One player's work on a puzzle: their entries, pencil marks and selection. Kept in this tab's
 * storage under `key`, so a refresh mid-solve picks up where you were.
 */
export function useSudokuInput(puzzle: string, key: string, active: boolean) {
  const [state, setState] = useState<Saved>(() => loadSaved(key, puzzle) ?? { grid: puzzle, notes: new Array(81).fill(0) })
  const [selected, setSelected] = useState(-1)
  const [notesMode, setNotesMode] = useState(false)

  // a new puzzle (rematch, or the next player in pass-and-play) starts clean
  const [forKey, setForKey] = useState(key)
  if (forKey !== key) {
    setForKey(key)
    setState(loadSaved(key, puzzle) ?? { grid: puzzle, notes: new Array(81).fill(0) })
    setSelected(-1)
    setNotesMode(false)
  }

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* no storage: still playable */
    }
  }, [key, state])

  const { grid, notes } = state
  const clashes = useMemo(() => conflicts(grid), [grid])
  const counts = useMemo(() => {
    const c = new Array(10).fill(0)
    for (const v of grid) if (v !== '.') c[Number(v)]++
    return c
  }, [grid])

  /** Put a digit in the selected cell (or toggle it as a note); 0 erases. */
  const enter = useCallback(
    (d: number) => {
      if (!active || selected < 0 || puzzle[selected] !== '.') return
      const i = selected
      setState((s) => {
        if (d === 0) {
          if (s.grid[i] === '.' && !s.notes[i]) return s
          const notes = s.notes.slice()
          notes[i] = 0
          return { grid: s.grid.slice(0, i) + '.' + s.grid.slice(i + 1), notes }
        }
        if (notesMode) {
          if (s.grid[i] !== '.') return s
          const notes = s.notes.slice()
          notes[i] ^= 1 << d
          return { ...s, notes }
        }
        if (s.grid[i] === String(d)) return s
        const notes = s.notes.slice()
        notes[i] = 0
        // placing a digit clears it from the pencil marks it now rules out
        for (const p of PEERS[i]) notes[p] &= ~(1 << d)
        return { grid: s.grid.slice(0, i) + d + s.grid.slice(i + 1), notes }
      })
    },
    [active, selected, puzzle, notesMode],
  )

  // desktop keyboard: digits, Backspace/Delete, arrows, N for notes
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (/^[1-9]$/.test(e.key)) enter(Number(e.key))
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') enter(0)
      else if (e.key === 'n' || e.key === 'N') setNotesMode((m) => !m)
      else if (e.key.startsWith('Arrow')) {
        setSelected((i) => {
          if (i < 0) return 40
          const r = Math.floor(i / 9)
          const c = i % 9
          if (e.key === 'ArrowUp') return r > 0 ? i - 9 : i
          if (e.key === 'ArrowDown') return r < 8 ? i + 9 : i
          if (e.key === 'ArrowLeft') return c > 0 ? i - 1 : i
          return c < 8 ? i + 1 : i
        })
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, enter])

  return { grid, notes, selected, setSelected, notesMode, setNotesMode, enter, clashes, counts }
}
