import { useMemo, useState } from 'react'
import { useCrewLook } from '../components/OpsFace'
import { floorsFor, TOP } from '../tower/floors'
import { TowerMap } from '../tower/TowerMap'
import { Hearts } from '../tower/TowerSheet'
import '../styles/tower.css'

/*
 * Dev-only sandbox (route: /dev/towermap): the Tower page's road map (tower/TowerMap.tsx) with
 * controls for the floor you're on, hearts, champion, season, and the width of the screen.
 */

const WIDTHS = [375, 390, 768, 1200]

export default function TowerMapLab() {
  const [season, setSeason] = useState(681)
  const floors = useMemo(() => floorsFor(season), [season])
  const [at, setAt] = useState(4)
  const [hearts, setHearts] = useState(2)
  const [champ, setChamp] = useState(false)
  const [width, setWidth] = useState(390)
  const me = useCrewLook() ?? 'bot'
  const got = useMemo(() => Object.fromEntries(Array.from({ length: at - 1 }, (_, i) => [String(i + 1), true as const])), [at])

  return (
    <div className="page tm-lab">
      <div className="tm-controls">
        <label>
          At floor <b>{at}</b>
          <input type="range" min={1} max={TOP} value={at} onChange={(e) => setAt(Number(e.target.value))} />
        </label>
        <span className="tm-controls__group">
          Hearts
          {[0, 1, 2, 3].map((n) => (
            <button key={n} type="button" className={`tm-chipbtn${hearts === n ? ' is-on' : ''}`} onClick={() => setHearts(n)}>
              {n}
            </button>
          ))}
        </span>
        <span className="tm-controls__group">
          Season
          {[681, 682, 683].map((s) => (
            <button key={s} type="button" className={`tm-chipbtn${season === s ? ' is-on' : ''}`} onClick={() => setSeason(s)}>
              {s - 680}
            </button>
          ))}
        </span>
        <span className="tm-controls__group">
          Width
          {WIDTHS.map((w) => (
            <button key={w} type="button" className={`tm-chipbtn${width === w ? ' is-on' : ''}`} onClick={() => setWidth(w)}>
              {w}
            </button>
          ))}
        </span>
        <label className="tm-controls__group">
          <input type="checkbox" checked={champ} onChange={(e) => setChamp(e.target.checked)} /> Champion
        </label>
      </div>

      <div className="tm-frame" style={{ width: `min(${width}px, 100%)` }}>
        <header className="tm-head">
          <h1 className="tm-title">Ops’ Tower</h1>
          <div className="tm-status">
            <span>
              Floor <b>{champ ? TOP : at}</b>/{TOP}
            </span>
            <Hearts n={hearts} size={18} />
          </div>
        </header>
        <TowerMap key={`${season}:${width}`} floors={floors} climb={{ at: champ ? TOP : at, champ, got }} me={me} onPlay={(f) => alert(`Play floor ${f.n}: ${f.gameName}`)} />
      </div>
    </div>
  )
}
