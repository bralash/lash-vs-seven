import { useState } from 'react'
import { OPS_STYLES, OpsFace, type OpsMood, type OpsStyle } from '../components/OpsFace'
import '../styles/vslab.css'
import '../styles/match.css'

// Dev-only sandbox (route: /dev/ops): candidate faces for Ops, every mood, and in context.

const MOODS: { id: OpsMood; label: string; where: string }[] = [
  { id: 'idle', label: 'Idle', where: 'Setup, lobby button' },
  { id: 'think', label: 'Thinking', where: 'While Ops picks a move' },
  { id: 'win', label: 'Ops wins', where: 'Results' },
  { id: 'lose', label: 'Ops loses', where: 'Results' },
  { id: 'draw', label: 'Draw', where: 'Results' },
]

const REACTS: { id: OpsMood; label: string; where: string }[] = [
  { id: 'hello', label: 'Hi! / Bring it', where: 'Match starts' },
  { id: 'wait', label: 'Hurry up', where: 'Your turn, 15s' },
  { id: 'sleep', label: 'Zzz', where: 'Your turn, 45s' },
  { id: 'smug', label: 'Hehe', where: 'She pulls ahead' },
  { id: 'sorry', label: 'Sorry…', where: 'She’s crushing you' },
  { id: 'nervous', label: 'Uh oh', where: 'You pull ahead' },
  { id: 'panic', label: 'No no no', where: 'She’s losing badly' },
  { id: 'ouch', label: 'Rude', where: 'You capture / win a game' },
  { id: 'gotcha', label: 'Mine', where: 'She captures / wins a game' },
  { id: 'wow', label: 'No way', where: 'You play a great move' },
  { id: 'pity', label: 'Oof', where: 'You blunder' },
  { id: 'lucky', label: 'Yes!', where: 'Good roll or deal' },
  { id: 'unlucky', label: 'Rigged', where: 'Bad roll or deal' },
  { id: 'gg', label: 'GG', where: 'Match ends' },
  { id: 'salty', label: 'Again?', where: 'She loses on Hard' },
  { id: 'love', label: 'Aww', where: 'You hold her (lobby / results)' },
  { id: 'giggle', label: 'Hehe', where: 'You poke her once or twice' },
  { id: 'angry', label: 'STOP.', where: 'You keep poking her' },
]

export default function OpsLab() {
  const [n, setN] = useState(0)
  const [pick, setPick] = useState<OpsStyle>('screen')

  return (
    <main className="page vslab">
      <header className="vslab__head">
        <p className="label">Ops lab</p>
        <h1>A face for Ops</h1>
        <p>Five candidates, each in every mood. Pick one below to see it in place.</p>
        <div className="vslab__tools">
          <button type="button" className="btn" onClick={() => setN((k) => k + 1)}>↻ Replay</button>
        </div>
      </header>

      {OPS_STYLES.map((s, i) => (
        <section key={s.id} className="vslab__inline">
          <p className="label">
            {i + 1} · {s.name} — <span style={{ textTransform: 'none', letterSpacing: 0 }}>{s.blurb}</span>
          </p>
          <div className="vslab__grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {MOODS.map((m) => (
              <div key={m.id} className="vslab__card">
                <div className="vslab__stage" style={{ height: 150 }}>
                  <OpsFace key={`${s.id}-${m.id}-${n}`} look={s.id} mood={m.id} size={104} />
                </div>
                <h2>{m.label}</h2>
                <p>{m.where}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="vslab__inline">
        <p className="label">Reactions · the faces on her stickers mid-match (Screen look)</p>
        <div className="vslab__grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {REACTS.map((m) => (
            <div key={m.id} className="vslab__card">
              <div className="vslab__stage" style={{ height: 130 }}>
                <OpsFace key={`r-${m.id}-${n}`} mood={m.id} size={88} />
              </div>
              <h2>{m.label}</h2>
              <p>{m.where}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="vslab__inline">
        <p className="label">In context</p>
        <div className="seg" role="group" aria-label="Face">
          {OPS_STYLES.map((s) => (
            <button key={s.id} type="button" className="seg__btn" aria-pressed={pick === s.id} onClick={() => setPick(s.id)}>
              {s.name}
            </button>
          ))}
        </div>

        <div className="vslab__grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          <div className="vslab__card">
            <p className="label">Lobby</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '12px 0' }}>
              <button type="button" className="btn btn--block">Pass &amp; play</button>
              <button type="button" className="btn btn--block" style={{ gap: 10 }}>
                <OpsFace key={`btn-${pick}-${n}`} look={pick} size={30} /> Play Ops
              </button>
            </div>
          </div>

          <div className="vslab__card">
            <p className="label">Match · Ops’ turn</p>
            <div className="mt-hud" style={{ padding: '12px 0' }}>
              <div className="mt-score mt-score--0">
                <span className="mt-score__name">Lash<em> · you</em></span>
                <span className="mt-score__n">3</span>
              </div>
              <div style={{ display: 'grid', placeItems: 'center', padding: '4px 10px', background: 'var(--board)', boxShadow: 'var(--shadow-sm)' }}>
                <OpsFace key={`hud-${pick}-${n}`} look={pick} mood="think" size={52} />
              </div>
              <div className="mt-score mt-score--1">
                <span className="mt-score__name">Ops</span>
                <span className="mt-score__n">2</span>
              </div>
            </div>
            <p style={{ fontFamily: 'var(--display)', textTransform: 'uppercase', textAlign: 'center' }}>Ops is thinking…</p>
          </div>

          <div className="vslab__card">
            <p className="label">Results · Ops wins</p>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 8, padding: '12px 0' }}>
              <OpsFace key={`res-${pick}-${n}`} look={pick} mood="win" size={72} />
              <h2 style={{ fontSize: 44 }}>Ops wins</h2>
              <p style={{ fontFamily: 'var(--display)', fontSize: 24 }}>1 — 2</p>
            </div>
          </div>

          <div className="vslab__card">
            <p className="label">Results · you win</p>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 8, padding: '12px 0' }}>
              <OpsFace key={`lose-${pick}-${n}`} look={pick} mood="lose" size={72} />
              <h2 style={{ fontSize: 44, background: 'var(--hit)', border: 'var(--edge) solid var(--ink)', padding: '0 .15em', transform: 'rotate(-2deg)' }}>You win</h2>
              <p style={{ fontFamily: 'var(--display)', fontSize: 24 }}>2 — 0</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
