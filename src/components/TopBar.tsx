import type { ReactNode } from 'react'
import { useSound } from '../lib/sound'
import { SoundOff, SoundOn } from './Icons'

interface Props {
  left: ReactNode
  /** extra buttons rendered before the sound toggle */
  right?: ReactNode
  /** rendered after the sound toggle, in the far corner (e.g. Leave) */
  end?: ReactNode
}

export function TopBar({ left, right, end }: Props) {
  const { muted, toggle } = useSound()
  return (
    <header className="topbar">
      <div className="topbar__side">{left}</div>
      <div className="topbar__side">
        {right}
        <button
          type="button"
          className="icon-btn"
          onClick={toggle}
          aria-label={muted ? 'Sound off' : 'Sound on'}
          aria-pressed={!muted}
        >
          {muted ? <SoundOff /> : <SoundOn />}
        </button>
        {end}
      </div>
    </header>
  )
}
