import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { get, getDatabase, ref } from 'firebase/database'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip } from '../components/Chip'
import { ArrowLeft } from '../components/Icons'
import { OPS_STYLES, OpsFace } from '../components/OpsFace'
import { ITEMS as WEAR } from '../components/faces/wardrobe'
import { TopBar } from '../components/TopBar'
import { db } from '../lib/firebase' // makes sure the default app exists before we copy its config
import { gameBySlug } from '../games/registry'
import { BONUS_ID, missionsFor, POOL, weekOf } from '../match/missions'
import { SHOP_THROWS } from '../match/Throws'
import { floorsFor, seasonName, seasonOf, TOP } from '../tower/floors'
import { Hearts } from '../tower/TowerSheet'
import '../styles/admin.css'

/*
 * /admin: who's where in Ops' Tower, and how the site is doing. Only ADMIN_EMAIL gets in: the
 * database rules let that Google account (and nobody else) read every wallet and room. It signs
 * in on a second Firebase app, so the anonymous player account on this device is left alone.
 */

const ADMIN_EMAIL = 'emmanuelasaber@gmail.com'
void db
const adminApp = getApps().find((a) => a.name === 'admin') ?? initializeApp(getApp().options, 'admin')
const adminAuth = getAuth(adminApp)
const adminDb = getDatabase(adminApp)

interface Wallet {
  chips?: number
  name?: string
  seen?: number
  first?: number
  owned?: Record<string, true>
  tower?: { s: number; at: number; hearts: number; best: number; champ?: boolean; got?: Record<string, true> }
  missions?: { w: number; got?: Record<string, true>; n?: Record<string, number> }
}
interface RoomLite {
  status?: string
  createdAt?: number
  startedAt?: number
  players?: Record<string, { name?: string; online?: boolean }>
}
interface Data {
  wallets: Record<string, Wallet>
  rooms: { game: string; code: string; room: RoomLite }[]
  at: number
}

const DAY = 864e5

function ago(t?: number, now = Date.now()) {
  if (!t) return '—'
  const s = Math.max(0, (now - t) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

const NAMES: Record<string, string> = Object.fromEntries([
  ...OPS_STYLES.map((s) => [s.id, s.name]),
  ...WEAR.map((i) => [i.id, i.name]),
  ...SHOP_THROWS.map((t) => [t.id, t.name]),
])
const nameOf = (id: string) => NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
const KIND = (id: string) => (OPS_STYLES.some((s) => s.id === id) ? 'Characters' : WEAR.some((i) => i.id === id) ? 'Wardrobe' : SHOP_THROWS.some((t) => t.id === id) ? 'Throwables' : 'Sticker packs')

async function load(): Promise<Data> {
  const [w, m] = await Promise.all([get(ref(adminDb, 'wallets')), get(ref(adminDb, 'matches'))])
  const rooms: Data['rooms'] = []
  const all = (m.val() ?? {}) as Record<string, Record<string, RoomLite>>
  for (const [game, codes] of Object.entries(all)) for (const [code, room] of Object.entries(codes ?? {})) rooms.push({ game, code, room })
  return { wallets: (w.val() ?? {}) as Record<string, Wallet>, rooms, at: Date.now() }
}

export function AdminPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => onAuthStateChanged(adminAuth, setUser), [])
  const ok = !!user && user.email === ADMIN_EMAIL && user.emailVerified

  const refresh = useCallback(() => {
    setBusy(true)
    setErr('')
    load()
      .then(setData)
      .catch((e) => setErr(String(e?.message ?? e).includes('ermission') ? 'The database said no. Have the new rules been deployed?' : String(e?.message ?? e)))
      .finally(() => setBusy(false))
  }, [])
  useEffect(() => {
    if (ok) refresh()
  }, [ok, refresh])

  const signInGoogle = () => {
    setErr('')
    const p = new GoogleAuthProvider()
    p.setCustomParameters({ prompt: 'select_account' })
    signInWithPopup(adminAuth, p).catch((e) => {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') signInWithRedirect(adminAuth, p)
      else if (e?.code === 'auth/operation-not-allowed') setErr('Google sign-in is off. Turn it on in the Firebase console: Authentication → Sign-in method → Google.')
      else if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') setErr(e?.message ?? 'Sign-in failed')
    })
  }

  return (
    <div className="page screen-in">
      <TopBar
        left={
          <>
            <Link to="/" className="icon-btn" aria-label="All games">
              <ArrowLeft />
            </Link>
            <span className="topbar__title">Admin</span>
          </>
        }
      />
      <main className="admin">
        {user === undefined ? (
          <p className="hint">Checking who you are…</p>
        ) : !user ? (
          <section className="admin__gate">
            <h1 className="admin__title">Admin</h1>
            <p>Sign in with the admin Google account to see the stats.</p>
            <button type="button" className="btn btn--primary" onClick={signInGoogle}>
              Sign in with Google
            </button>
          </section>
        ) : !ok ? (
          <section className="admin__gate">
            <h1 className="admin__title">Not this one</h1>
            <p>{user.email} can’t see the admin page.</p>
            <button type="button" className="btn" onClick={() => signOut(adminAuth)}>
              Use another account
            </button>
          </section>
        ) : (
          <>
            <header className="admin__head">
              <div>
                <h1 className="admin__title">Admin</h1>
                <p className="admin__sub">{data ? `Updated ${ago(data.at)}` : 'Loading…'}</p>
              </div>
              <div className="admin__actions">
                <button type="button" className="btn btn--primary" onClick={refresh} disabled={busy}>
                  {busy ? 'Loading…' : 'Refresh'}
                </button>
                <button type="button" className="link-btn" onClick={() => signOut(adminAuth)}>
                  Sign out
                </button>
              </div>
            </header>
            {data && <Stats data={data} />}
          </>
        )}
        {err && <p className="admin__err">{err}</p>}
      </main>
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="admin-tile">
      <span className="admin-tile__label">{label}</span>
      <b className="admin-tile__value">{value}</b>
      {note && <span className="admin-tile__note">{note}</span>}
    </div>
  )
}

function Bars({ rows }: { rows: { label: React.ReactNode; n: number; key: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <ul className="admin-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="admin-bars__label">{r.label}</span>
          <span className="admin-bars__track">
            <span className="admin-bars__fill" style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <b>{r.n}</b>
        </li>
      ))}
    </ul>
  )
}

function Stats({ data }: { data: Data }) {
  const now = data.at
  const season = seasonOf(now)
  const floors = floorsFor(season)
  const week = weekOf(now)
  const [q, setQ] = useState('')

  // names from rooms, for players who haven't opened the app since names were saved
  const roomNames = useMemo(() => {
    const out: Record<string, string> = {}
    for (const { room } of data.rooms) for (const [uid, p] of Object.entries(room.players ?? {})) if (p?.name && !out[uid]) out[uid] = p.name
    return out
  }, [data])

  const players = useMemo(
    () =>
      Object.entries(data.wallets).map(([uid, w]) => {
        const climb = w.tower && w.tower.s === season ? w.tower : null
        return { uid, w, name: w.name || roomNames[uid] || '', climb }
      }),
    [data, season, roomNames],
  )
  const label = (p: (typeof players)[number]) => p.name || `Player ${p.uid.slice(0, 5)}`

  /* players & activity */
  const active = (ms: number) => players.filter((p) => p.w.seen && now - p.w.seen < ms).length
  const newThisWeek = players.filter((p) => p.w.first && now - p.w.first < 7 * DAY).length
  const named = players.filter((p) => p.name).length

  /* tower */
  const climbers = players.filter((p) => p.climb).sort((a, b) => Number(!!b.climb!.champ) - Number(!!a.climb!.champ) || b.climb!.at - a.climb!.at || b.climb!.best - a.climb!.best)
  const champs = climbers.filter((p) => p.climb!.champ)
  const perFloor = floors.map((f) => ({ key: String(f.n), n: climbers.filter((p) => p.climb!.at === f.n && !p.climb!.champ).length, label: <>{f.n} · {f.n === TOP ? 'Ops' : f.guardianName}</> })).reverse()
  const highest = climbers.reduce((m, p) => Math.max(m, p.climb!.best), 0)

  /* chips & store */
  const chips = players.map((p) => p.w.chips ?? 0)
  const totalChips = chips.reduce((s, n) => s + n, 0)
  const rich = [...players].sort((a, b) => (b.w.chips ?? 0) - (a.w.chips ?? 0)).slice(0, 10)
  const owned: Record<string, number> = {}
  for (const p of players) for (const id of Object.keys(p.w.owned ?? {})) owned[id] = (owned[id] ?? 0) + 1
  const byKind: Record<string, { id: string; n: number }[]> = {}
  for (const [id, n] of Object.entries(owned)) (byKind[KIND(id)] ??= []).push({ id, n })

  /* games & missions */
  const games: Record<string, { rooms: number; live: number; day: number }> = {}
  for (const { game, room } of data.rooms) {
    const g = (games[game] ??= { rooms: 0, live: 0, day: 0 })
    g.rooms++
    if (room.status === 'playing' && Object.values(room.players ?? {}).some((p) => p?.online)) g.live++
    if ((room.startedAt ?? room.createdAt ?? 0) > now - DAY) g.day++
  }
  const gameRows = Object.entries(games).sort((a, b) => b[1].day - a[1].day || b[1].rooms - a[1].rooms)
  const liveNow = gameRows.reduce((s, [, g]) => s + g.live, 0)
  const weekMissions = missionsFor(week)
  const claimed = (id: string) => players.filter((p) => p.w.missions?.w === week && p.w.missions.got?.[id]).length
  const onMissions = players.filter((p) => p.w.missions?.w === week).length

  /* everyone */
  const everyone = [...players]
    .filter((p) => !q || label(p).toLowerCase().includes(q.toLowerCase()) || p.uid.startsWith(q))
    .sort((a, b) => (b.w.seen ?? 0) - (a.w.seen ?? 0))

  return (
    <>
      <section className="admin-sec">
        <h2>Players</h2>
        <div className="admin-tiles">
          <Tile label="Players" value={players.length} note={`${named} with a name`} />
          <Tile label="Active today" value={active(DAY)} />
          <Tile label="Active this week" value={active(7 * DAY)} />
          <Tile label="New this week" value={newThisWeek} />
        </div>
        <p className="admin__fine">Names and “last seen” are saved when a player opens the updated app; until then they show as “Player …” (or their name from an open room).</p>
      </section>

      <section className="admin-sec">
        <h2>Ops’ Tower · {seasonName(season)}</h2>
        <div className="admin-tiles">
          <Tile label="Climbing" value={climbers.length} />
          <Tile label="Champions" value={champs.length} />
          <Tile label="Highest floor" value={highest || '—'} />
          <Tile label="Lost hearts now" value={climbers.filter((p) => p.climb!.hearts < 3).length} />
        </div>
        <h3>Players on each floor</h3>
        <Bars rows={champs.length ? [{ key: 'champ', n: champs.length, label: <>👑 Champion</> }, ...perFloor] : perFloor} />
        <h3>Who’s where</h3>
        {climbers.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Floor</th>
                  <th>Hearts</th>
                  <th>Best</th>
                  <th>Seen</th>
                </tr>
              </thead>
              <tbody>
                {climbers.map((p) => {
                  const f = floors[p.climb!.at - 1]
                  return (
                    <tr key={p.uid}>
                      <td>{label(p)}</td>
                      <td>
                        <span className="admin-floor">
                          <OpsFace look={f.guardian} mood="idle" size={26} />
                          {p.climb!.champ ? 'Champion' : `${f.n} · ${f.n === TOP ? 'Ops' : f.guardianName}`}
                        </span>
                      </td>
                      <td>
                        <Hearts n={p.climb!.hearts} size={13} />
                      </td>
                      <td>{p.climb!.best}</td>
                      <td>{ago(p.w.seen, now)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">Nobody has climbed this season yet.</p>
        )}
      </section>

      <section className="admin-sec">
        <h2>Chips &amp; store</h2>
        <div className="admin-tiles">
          <Tile label="Chips held" value={totalChips.toLocaleString('en-GB')} />
          <Tile label="Average" value={players.length ? Math.round(totalChips / players.length) : 0} />
          <Tile label="Items owned" value={Object.values(owned).reduce((s, n) => s + n, 0)} />
        </div>
        <h3>Richest</h3>
        <ol className="admin-list">
          {rich.map((p) => (
            <li key={p.uid}>
              <span>{label(p)}</span>
              <b>
                <Chip v={25} size={16} /> {(p.w.chips ?? 0).toLocaleString('en-GB')}
              </b>
            </li>
          ))}
        </ol>
        {Object.entries(byKind)
          .sort()
          .map(([kind, rows]) => (
            <div key={kind}>
              <h3>{kind}</h3>
              <Bars rows={rows.sort((a, b) => b.n - a.n).map((r) => ({ key: r.id, n: r.n, label: nameOf(r.id) }))} />
            </div>
          ))}
      </section>

      <section className="admin-sec">
        <h2>Games &amp; missions</h2>
        <div className="admin-tiles">
          <Tile label="Playing now" value={liveNow} note="rooms with someone online" />
          <Tile label="Rooms, last 24 h" value={gameRows.reduce((s, [, g]) => s + g.day, 0)} />
          <Tile label="On missions" value={onMissions} note="this week" />
        </div>
        <h3>Rooms by game (last 24 h)</h3>
        {gameRows.length ? <Bars rows={gameRows.map(([game, g]) => ({ key: game, n: g.day, label: <>{gameBySlug(game)?.name ?? game}{g.live ? <span className="admin-live">{g.live} live</span> : null}</> }))} /> : <p className="hint">No rooms right now.</p>}
        <h3>This week’s missions: claimed</h3>
        <Bars
          rows={[...weekMissions.map((m) => ({ key: m.id, n: claimed(m.id), label: m.name })), { key: BONUS_ID, n: claimed(BONUS_ID), label: 'All three (bonus)' }]}
        />
        <p className="admin__fine">Rooms are cleared out after a day, so these only cover recent play. {POOL.length} missions in the rotation.</p>
      </section>

      <section className="admin-sec">
        <h2>Everyone</h2>
        <input className="admin-search" type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Chips</th>
                <th>Tower</th>
                <th>Owns</th>
                <th>Seen</th>
              </tr>
            </thead>
            <tbody>
              {everyone.map((p) => (
                <tr key={p.uid}>
                  <td>
                    {label(p)}
                    {!p.w.name && p.name && <span className="admin-dim"> (room)</span>}
                  </td>
                  <td>{(p.w.chips ?? 0).toLocaleString('en-GB')}</td>
                  <td>{p.climb ? (p.climb.champ ? '👑' : p.climb.at) : '—'}</td>
                  <td>{Object.keys(p.w.owned ?? {}).length}</td>
                  <td>{ago(p.w.seen, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
