import { Link } from 'react-router-dom'
import { ArrowLeft } from '../components/Icons'
import { OPS_STYLES, OpsFace, setOpsLook, useOpsLook, type BaseMood } from '../components/OpsFace'
import { PokeOps } from '../components/PokeOps'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import '../styles/lobby.css'
import '../styles/opsroom.css'

/**
 * Ops' room (/ops): pick the face she wears in every game on this device. The wardrobe (outfits,
 * hats, colours) is a teaser for now.
 */

const MOODS: { id: BaseMood; label: string }[] = [
  { id: 'idle', label: 'Waiting' },
  { id: 'think', label: 'Thinking' },
  { id: 'win', label: 'Wins' },
  { id: 'lose', label: 'Loses' },
  { id: 'draw', label: 'Draw' },
]

const SOON = [
  { title: 'Outfits', body: 'Kente, a tux, a football kit…' },
  { title: 'Hats & specs', body: 'Crowns, caps, shades.' },
  { title: 'Colours', body: 'Paint her head and screen.' },
]

export function OpsRoom() {
  const look = useOpsLook()
  const { play } = useSound()
  const current = OPS_STYLES.find((s) => s.id === look) ?? OPS_STYLES[0]

  return (
    <div className="page screen-in">
      <TopBar
        left={
          <>
            <Link to="/" className="icon-btn" aria-label="All games">
              <ArrowLeft />
            </Link>
            <span className="topbar__title">Ops’ room</span>
          </>
        }
      />

      <main className="lobby__main lobby__main--wide opsroom">
        <div className="lobby__hero">
          <div className="opsroom__star">
            <PokeOps size={132} />
          </div>
          <p className="label">Your computer opponent</p>
          <h1 className="lobby__title">Pick your Ops</h1>
          <p className="hint">She wears it in every game on this device · tap her, or hold to pet</p>
        </div>

        <section className="opsroom__section" aria-labelledby="looks-title">
          <h2 id="looks-title" className="opsroom__h">Her face</h2>
          <div className="opsroom__looks" role="radiogroup" aria-labelledby="looks-title">
            {OPS_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === look}
                className="opsroom__look"
                onClick={() => {
                  if (s.id !== look) play('tap')
                  setOpsLook(s.id)
                }}
              >
                {s.id === look && <span className="stamp stamp--live opsroom__picked">Picked</span>}
                <OpsFace look={s.id} size={84} />
                <span className="opsroom__name">{s.name}</span>
                <span className="opsroom__blurb">{s.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="opsroom__section" aria-labelledby="moods-title">
          <h2 id="moods-title" className="opsroom__h">{current.name} in a game</h2>
          <ul className="opsroom__moods">
            {MOODS.map((m) => (
              <li key={`${look}-${m.id}`}>
                <OpsFace mood={m.id} size={60} />
                <span>{m.label}</span>
              </li>
            ))}
          </ul>
          {look !== 'screen' && (
            <p className="hint opsroom__note">Screen has all 18 of her reaction faces. {current.name} shows the nearest of these five for now.</p>
          )}
        </section>

        <section className="opsroom__section" aria-labelledby="wardrobe-title">
          <h2 id="wardrobe-title" className="opsroom__h">Her wardrobe</h2>
          <ul className="opsroom__soon">
            {SOON.map((w) => (
              <li key={w.title} className="opsroom__soon-card">
                <span className="stamp">Soon</span>
                <span className="opsroom__name">{w.title}</span>
                <span className="opsroom__blurb">{w.body}</span>
              </li>
            ))}
          </ul>
          <p className="hint">Dressing her up is coming soon</p>
        </section>
      </main>
    </div>
  )
}
