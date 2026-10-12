import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { get, getDatabase, ref, runTransaction } from 'firebase/database'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Chip } from '../components/Chip'
import { ArrowLeft } from '../components/Icons'
import { OPS_STYLES, OpsFace } from '../components/OpsFace'
import { ITEMS as WEAR } from '../components/faces/wardrobe'
import type { Gift } from '../components/GiftSheet'
import { Portal } from '../components/Portal'
import { TopBar } from '../components/TopBar'
import { codeOf, db } from '../lib/firebase' // makes sure the default app exists before we copy its config
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
  gifts?: Record<string, Gift>
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

/* the Everyone list: rows per page, what to show and in what order */
const PAGE = 25
type Climb = NonNullable<Wallet['tower']>
type Row = { w: Wallet; climb: Climb | null; name: string }
const FILTERS: Record<string, { label: string; keep: (w: Wallet, climb: Climb | null, now: number) => boolean }> = {
  all: { label: 'Everyone', keep: () => true },
  today: { label: 'Active today', keep: (w, _, now) => !!w.seen && now - w.seen < DAY },
  week: { label: 'Active this week', keep: (w, _, now) => !!w.seen && now - w.seen < 7 * DAY },
  new: { label: 'New this week', keep: (w, _, now) => !!w.first && now - w.first < 7 * DAY },
  tower: { label: 'In the Tower', keep: (_, climb) => !!climb },
  idle: { label: 'Not seen in 30 days', keep: (w, _, now) => !w.seen || now - w.seen >= 30 * DAY },
}
const SORTS: Record<string, { label: string; by: (a: Row, b: Row) => number }> = {
  seen: { label: 'Last seen', by: (a, b) => (b.w.seen ?? 0) - (a.w.seen ?? 0) },
  chips: { label: 'Most chips', by: (a, b) => (b.w.chips ?? 0) - (a.w.chips ?? 0) },
  tower: { label: 'Highest in the Tower', by: (a, b) => Number(!!b.climb?.champ) - Number(!!a.climb?.champ) || (b.climb?.at ?? 0) - (a.climb?.at ?? 0) },
  newest: { label: 'Newest', by: (a, b) => (b.w.first ?? 0) - (a.w.first ?? 0) },
  name: { label: 'Name', by: (a, b) => (a.name || '~').localeCompare(b.name || '~') },
}

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

/**
 * Chips into a player's wallet, with a message they see on their homepage. One transaction, so the
 * chips and the message land together; the rules let only the admin add a gift.
 */
async function sendChips(uid: string, n: number, msg: string) {
  const at = ref(adminDb, `wallets/${uid}`)
  await get(at) // so the transaction starts from the real wallet
  const id = `g${Date.now().toString(36)}`
  const res = await runTransaction(
    at,
    (cur: Wallet | null) => {
      if (!cur) return cur // an empty first pass: the server retries with the real wallet
      return { ...cur, chips: (cur.chips ?? 0) + n, gifts: { ...cur.gifts, [id]: { n, msg, at: Date.now() } } }
    },
    { applyLocally: false },
  )
  if (!res.snapshot.child(`gifts/${id}`).exists()) throw new Error('That player has no wallet yet.')
}

const AMOUNTS = [50, 100, 250, 500]

function SendChips({ uid, who, onClose, onSent }: { uid: string; who: string; onClose: () => void; onSent: () => void }) {
  const [n, setN] = useState('100')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const amount = Math.floor(Number(n))
  const ok = amount >= 1 && amount <= 10000
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setErr('')
    sendChips(uid, amount, msg.trim().slice(0, 200))
      .then(() => {
        onSent()
        onClose()
      })
      .catch((x) => setErr(String(x?.message ?? x).includes('ermission') ? 'The database said no. Have the new rules been deployed?' : String(x?.message ?? x)))
      .finally(() => setBusy(false))
  }
  return (
    <Portal>
      <div className="admin-modal" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <form className="admin-send" role="dialog" aria-labelledby="send-title" onSubmit={submit}>
          <h2 id="send-title">Send chips to {who}</h2>
          <p className="admin-send__code">Code {codeOf(uid)}</p>
          <div className="admin-send__amounts" role="group" aria-label="Amount">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" className={`admin-send__amt${amount === a ? ' admin-send__amt--on' : ''}`} onClick={() => setN(String(a))}>
                <Chip v={a >= 100 ? 100 : 25} size={18} /> {a}
              </button>
            ))}
          </div>
          <label className="admin-send__field">
            <span>Chips (up to 10,000)</span>
            <input type="number" inputMode="numeric" min={1} max={10000} value={n} onChange={(e) => setN(e.target.value)} />
          </label>
          <label className="admin-send__field">
            <span>Message (they see it on their homepage)</span>
            <textarea rows={3} maxLength={200} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Well played at the Tower!" />
            <small>{msg.length}/200</small>
          </label>
          {err && <p className="admin__err">{err}</p>}
          <div className="admin-send__actions">
            <button type="submit" className="btn btn--primary" disabled={!ok || busy}>
              {busy ? 'Sending…' : ok ? `Send ${amount.toLocaleString('en-GB')} chips` : 'Send'}
            </button>
            <button type="button" className="link-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </Portal>
  )
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
            {data && <Stats data={data} onSent={refresh} />}
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

function Stats({ data, onSent }: { data: Data; onSent: () => void }) {
  const now = data.at
  const [sendTo, setSendTo] = useState<{ uid: string; who: string } | null>(null)
  const [sent, setSent] = useState('')
  const season = seasonOf(now)
  const floors = floorsFor(season)
  const week = weekOf(now)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<keyof typeof FILTERS>('all')
  const [sort, setSort] = useState<keyof typeof SORTS>('seen')
  const [page, setPage] = useState(0)
  // a new search, filter or order starts from the first page
  useEffect(() => setPage(0), [q, filter, sort])

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

  /* gifts sent */
  const gifts = players
    .flatMap((p) => Object.entries(p.w.gifts ?? {}).map(([id, g]) => ({ ...g, id, uid: p.uid, who: label(p) })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 50)

  /* everyone: search by name or by the code the player reads off their Shop page, narrowed and sorted, a page at a time */
  const needle = q.trim().toLowerCase()
  const shown = FILTERS[filter].keep
  const everyone = [...players]
    .filter((p) => (!needle || label(p).toLowerCase().includes(needle) || codeOf(p.uid).toLowerCase() === needle) && shown(p.w, p.climb, now))
    .sort(SORTS[sort].by)
  const pages = Math.max(1, Math.ceil(everyone.length / PAGE))
  const onPage = Math.min(page, pages - 1)
  const rows = everyone.slice(onPage * PAGE, onPage * PAGE + PAGE)

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
        <h2>Gifts sent</h2>
        {gifts.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>To</th>
                  <th>Chips</th>
                  <th>Message</th>
                  <th>Seen</th>
                </tr>
              </thead>
              <tbody>
                {gifts.map((g) => (
                  <tr key={g.uid + g.id}>
                    <td>{ago(g.at, now)}</td>
                    <td>
                      {g.who} <span className="admin-dim">{codeOf(g.uid)}</span>
                    </td>
                    <td>{g.n.toLocaleString('en-GB')}</td>
                    <td className="admin-table__msg">{g.msg || '—'}</td>
                    <td>{g.seen ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">No gifts yet. Send chips from the list below.</p>
        )}
      </section>

      <section className="admin-sec">
        <h2>Everyone</h2>
        <p className="admin__fine">To send chips, ask the player for the code under their chips on the Shop page and search for it here.</p>
        <div className="admin-find">
          <input className="admin-search" type="search" placeholder="Search by name or code" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="admin-find__pick">
            Show
            <select value={filter} onChange={(e) => setFilter(e.target.value as keyof typeof FILTERS)}>
              {Object.entries(FILTERS).map(([k, f]) => (
                <option key={k} value={k}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-find__pick">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {sent && <p className="admin__ok">{sent}</p>}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Code</th>
                <th>Chips</th>
                <th>Tower</th>
                <th>Owns</th>
                <th>Seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-dim">
                    Nobody matches.
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.uid}>
                  <td>
                    {label(p)}
                    {!p.w.name && p.name && <span className="admin-dim"> (room)</span>}
                  </td>
                  <td className="admin-code">{codeOf(p.uid)}</td>
                  <td>{(p.w.chips ?? 0).toLocaleString('en-GB')}</td>
                  <td>{p.climb ? (p.climb.champ ? '👑' : p.climb.at) : '—'}</td>
                  <td>{Object.keys(p.w.owned ?? {}).length}</td>
                  <td>{ago(p.w.seen, now)}</td>
                  <td>
                    <button type="button" className="admin-give" onClick={() => setSendTo({ uid: p.uid, who: label(p) })}>
                      <Chip v={25} size={14} /> Send
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-pager">
          <button type="button" className="btn" disabled={onPage === 0} onClick={() => setPage(onPage - 1)}>
            ← Previous
          </button>
          <span>
            {everyone.length ? `${onPage * PAGE + 1}–${onPage * PAGE + rows.length} of ${everyone.length}` : '0 players'}
            {pages > 1 && ` · page ${onPage + 1} of ${pages}`}
          </span>
          <button type="button" className="btn" disabled={onPage >= pages - 1} onClick={() => setPage(onPage + 1)}>
            Next →
          </button>
        </div>
      </section>
      {sendTo && (
        <SendChips
          uid={sendTo.uid}
          who={sendTo.who}
          onClose={() => setSendTo(null)}
          onSent={() => {
            setSent(`Sent to ${sendTo.who} (${codeOf(sendTo.uid)}).`)
            onSent()
          }}
        />
      )}
    </>
  )
}
