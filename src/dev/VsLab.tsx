import { useEffect, useState, type ReactNode } from 'react'
import { VsBlock, type VsMood } from '../components/VsBlock'
import '../styles/vslab.css'

// Dev-only sandbox (route: /dev/vs): the VS block's moments, each with a replay.

const COUNT = ['3', '2', '1', 'GO']

export default function VsLab() {
  const [eyes, setEyes] = useState(false)
  const [n, setN] = useState(0) // bump to replay the one-shot moments
  const [side, setSide] = useState<0 | 1>(0)
  const [count, setCount] = useState(0)

  // turn: swap sides every 1.6s; countdown: tick every 0.8s, rest, repeat
  useEffect(() => {
    const t = setInterval(() => setSide((s) => (s ? 0 : 1)), 1600)
    const c = setInterval(() => setCount((k) => (k + 1) % (COUNT.length + 2)), 800)
    return () => {
      clearInterval(t)
      clearInterval(c)
    }
  }, [])

  const card = (title: string, where: string, mood: VsMood, extra: { side?: 0 | 1; label?: string } = {}, foot?: ReactNode) => (
    <section className="vslab__card">
      <div className="vslab__stage">
        <VsBlock key={`${mood}-${n}-${mood === 'win' ? extra.side : ''}`} mood={mood} eyes={eyes} {...extra} />
      </div>
      <h2>{title}</h2>
      <p>{where}</p>
      {foot}
    </section>
  )

  return (
    <main className="page vslab">
      <header className="vslab__head">
        <p className="label">VS block lab</p>
        <h1>The VS block’s moments</h1>
        <div className="vslab__tools">
          <button type="button" className={`btn${eyes ? '' : ' btn--primary'}`} onClick={() => setEyes(false)}>Plain</button>
          <button type="button" className={`btn${eyes ? ' btn--primary' : ''}`} onClick={() => setEyes(true)}>With eyes</button>
          <button type="button" className="btn" onClick={() => setN((k) => k + 1)}>↻ Replay all</button>
        </div>
      </header>

      <div className="vslab__grid">
        {card('Waiting', 'Room code screen, until the other player joins', 'wait')}
        {card('They joined', 'The moment the guest takes the second seat', 'joined')}
        {card('Countdown', 'Replaces the big 3 · 2 · 1 before a round', 'count', { label: COUNT[Math.min(count, COUNT.length - 1)] })}
        {card('Whose turn', 'Turn games: leans toward the player to move', 'turn', { side })}
        {card('Lash wins', 'Results, stamped in the winner’s colour', 'win', { side: 0 })}
        {card('Seven wins', 'Same, for the other seat', 'win', { side: 1 })}
        {card('Draw', 'Results when nobody wins — a shrug', 'draw')}
        {card('They left', '“Seven left the match” screen', 'left')}
        {card('Loading', 'Drawing the share card, joining a room', 'loading')}
        {card('Idle', 'Homepage / header — barely moving', 'idle')}
      </div>

      <section className="vslab__inline">
        <p className="label">In context · lobby</p>
        <div className="vslab__room">
          <VsBlock key={`room-${n}`} mood="wait" eyes={eyes} size={72} />
          <div>
            <p className="vslab__code">ROOM QKDM</p>
            <p>Waiting for Seven to join…</p>
          </div>
        </div>
      </section>
    </main>
  )
}
