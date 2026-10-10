import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMoved } from './missions'
import '../styles/missions.css'

/** Under a match's result: the missions it moved on ("Winner 2/3"), and any it finished. */
export function MissionLine() {
  const [since] = useState(() => Date.now() - 1000)
  const moved = useMoved(since)
  if (!moved.length) return null
  return (
    <ul className="mt-missions" aria-label="Missions this match moved on">
      {moved.map((m) =>
        m.done ? (
          <li key={m.id} className="mt-mission mt-mission--done">
            <Link to="/missions">
              <b>{m.name}</b> done · collect +{m.reward}
            </Link>
          </li>
        ) : (
          <li key={m.id} className="mt-mission">
            <b>{m.name}</b>
            <span className="mt-mission__bar" aria-hidden="true">
              <span style={{ width: `${(m.n / m.target) * 100}%` }} />
            </span>
            {m.n}/{m.target}
          </li>
        ),
      )}
    </ul>
  )
}
