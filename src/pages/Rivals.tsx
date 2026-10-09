import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { gameBySlug } from '../games/registry'
import { useSound } from '../lib/sound'
import { featById } from '../match/feats'
import { groupLead, lastGame, listGroups, listRivals, standingLine, standings, type Group, type Rival, type Tally } from '../match/rivalry'

const gameName = (slug: string) => gameBySlug(slug)?.name ?? slug
const playable = (slug: string | undefined) => !!slug && gameBySlug(slug)?.status === 'live'

function ago(t: number) {
  const mins = Math.round((Date.now() - t) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return new Date(t).toLocaleDateString(undefined, { weekday: 'short' })
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Who's on which side of the score. Pass & play records are kept from the side of the name that sorts first. */
function sides(r: Rival & { key: string }): { local: boolean; me: string; them: string } {
  if (!r.key.startsWith('local:')) return { local: false, me: 'You', them: r.name }
  const [a, b] = r.name.split(' & ')
  const aFirst = (a ?? '').trim().toLowerCase() <= (b ?? '').trim().toLowerCase()
  return { local: true, me: aFirst ? a : b, them: aFirst ? b : a }
}

function leadLine({ w, l }: Tally, me: string, them: string) {
  if (w === l) return 'All square'
  const you = me === 'You'
  return w > l ? `${me} ${you ? 'lead' : 'leads'}` : `${them} leads`
}

type Entry = { kind: 'rival'; r: Rival & { key: string } } | { kind: 'group'; g: Group & { key: string } }
const updated = (e: Entry) => (e.kind === 'rival' ? e.r.updatedAt : e.g.updatedAt)

/** "You, Seven & Esi" — you first, then the others */
function groupName(g: Group) {
  const names = Object.entries(g.members)
    .sort(([a], [b]) => (a === g.you ? -1 : b === g.you ? 1 : 0))
    .map(([k, n]) => (k === g.you ? 'You' : n))
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

const allEntries = () =>
  [...listRivals().map((r): Entry => ({ kind: 'rival', r })), ...listGroups().map((g): Entry => ({ kind: 'group', g }))].sort((a, b) => updated(b) - updated(a))

/** For the homepage tile: how many rivals, and the latest one's score ("Kofi 4–2"). Null with none yet. */
export function rivalsSummary(): { count: number; latest: string } | null {
  const [e, ...rest] = allEntries()
  if (!e) return null
  if (e.kind === 'group') {
    const g = e.g
    const local = g.key.startsWith('localgroup:')
    return { count: rest.length + 1, latest: local ? `${Object.keys(g.members).length} players` : groupName(g) }
  }
  const { me, them } = sides(e.r)
  const { w, l } = e.r.total
  return { count: rest.length + 1, latest: `${me === 'You' ? them : `${me} vs ${them}`} ${w}–${l}` }
}

/**
 * "Your rivals" (/rivals): everyone you've finished a match against, with a one-tap rematch.
 * People you play in a three or four are one card for the group, not a card each.
 */
export function Rivals() {
  const [entries] = useState<Entry[]>(allEntries)
  const [open, setOpen] = useState<string | null>(null)
  const navigate = useNavigate()
  const { play } = useSound()

  if (!entries.length) return <p className="hint rivals__empty">Finish a match against someone and they show up here, with a one-tap rematch.</p>

  // online: the lobby opens a room straight away and names who it's for; pass & play: just the game
  const go = (slug: string, who: string | null) => {
    play('tap')
    navigate(`/${slug}`, who ? { state: { challenge: who } } : undefined)
  }
  const challenge = (slug: string, r: Rival & { key: string }, local: boolean) => go(slug, local ? null : r.name)

  return (
    <section className="rivals" aria-label="Your rivals">
      <ul className="rivals__list">
        {entries.map((e, i) => {
          if (e.kind === 'group') return <GroupCard key={e.g.key} g={e.g} first={i === 0} open={open === e.g.key} onToggle={() => setOpen(open === e.g.key ? null : e.g.key)} onGo={go} />
          const r = e.r
          const { local, me, them } = sides(r)
          const { w, l, d } = r.total
          const last = lastGame(r)
          const streak = r.streak && r.streak.n >= 2 ? `${r.streak.who === 'me' ? me : them} won ${r.streak.n} in a row` : null
          const games = Object.entries(r.byGame).sort((x, y) => y[1].w + y[1].l + y[1].d - (x[1].w + x[1].l + x[1].d))
          const isOpen = open === r.key
          const feats = Object.entries(r.feats ?? {}).filter(([id]) => featById(id))
          return (
            <li key={r.key} className={`rival${isOpen ? ' rival--open' : ''}`}>
              <button
                type="button"
                className="rival__main"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.key)}
              >
                <span className="rival__name">
                  {local ? (
                    <>
                      {me} <span className="rival__vs">vs</span> {them}
                    </>
                  ) : (
                    them
                  )}
                </span>
                <span className="rival__score" aria-label={`${w} wins, ${l} losses${d ? `, ${d} draws` : ''}`}>
                  {w}
                  <i>–</i>
                  {l}
                </span>
                <span className="rival__meta">
                  <b>{leadLine(r.total, me, them)}</b>
                  {streak && <span>{streak}</span>}
                  {last && <span>{gameName(last)} · {ago(r.updatedAt)}</span>}
                  {local && <span>Pass & play</span>}
                </span>
              </button>
              {playable(last) && (
                <button type="button" className={`btn rival__go${i === 0 ? ' btn--primary' : ''}`} onClick={() => challenge(last!, r, local)}>
                  {local ? 'Play' : 'Challenge'}
                </button>
              )}
              {isOpen && (
                <ul className="rival__games" aria-label={`Record against ${them}, by game`}>
                  {games.map(([slug, t]) => (
                    <li key={slug}>
                      <button
                        type="button"
                        className="rival__game"
                        disabled={!playable(slug)}
                        onClick={() => challenge(slug, r, local)}
                        aria-label={`${gameName(slug)}: ${t.w}–${t.l}${t.d ? `, ${t.d} drawn` : ''}. ${local ? 'Play' : 'Challenge'} in ${gameName(slug)}`}
                      >
                        <span>{gameName(slug)}</span>
                        <b>
                          {t.w}–{t.l}
                          {t.d ? <small> ({t.d} drawn)</small> : null}
                        </b>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {isOpen && feats.length > 0 && (
                <ul className="rival__feats" aria-label={`Feats against each other`}>
                  {feats.map(([id, t]) => {
                    const def = featById(id)!
                    return (
                      <li key={id} className="rival__feat" title={def.blurb}>
                        <b>{def.name}</b>
                        <span>
                          {[t.me && `${me} ×${t.me}`, t.them && `${them} ×${t.them}`].filter(Boolean).join(' · ')}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** A group of three or four: matches won by each, most first, and the record in each game when opened. */
function GroupCard({ g, first, open, onToggle, onGo }: { g: Group & { key: string }; first: boolean; open: boolean; onToggle: () => void; onGo: (slug: string, who: string | null) => void }) {
  const local = g.key.startsWith('localgroup:')
  const table = standings(g.wins, g.members, g.you)
  const last = lastGroupGame(g)
  const s = g.streak && g.streak.n >= 2 ? g.streak : null
  const streaker = s && (s.who === g.you ? 'You' : g.members[s.who])
  const others = Object.entries(g.members).filter(([k]) => k !== g.you).map(([, n]) => n)
  const who = local ? null : `${others.slice(0, -1).join(', ')} & ${others.at(-1)}`
  const games = Object.entries(g.byGame).sort((x, y) => y[1].played - x[1].played)
  return (
    <li className={`rival rival--group${open ? ' rival--open' : ''}`}>
      <button type="button" className="rival__main" aria-expanded={open} onClick={onToggle}>
        <span className="rival__name">{groupName(g)}</span>
        <span className="rival__score" aria-label={`Wins: ${standingLine(table)}`}>
          {table.map(([k, , w], j) => (
            <span key={k}>
              {j > 0 && <i>–</i>}
              {w}
            </span>
          ))}
        </span>
        <span className="rival__meta">
          <b>{groupLead(table)}</b>
          <span>{standingLine(table)}</span>
          {s && <span>{streaker} won {s.n} in a row</span>}
          {last && <span>{gameName(last)} · {ago(g.updatedAt)}</span>}
          <span>{local ? 'Pass & play · ' : ''}{Object.keys(g.members).length} players</span>
        </span>
      </button>
      {playable(last) && (
        <button type="button" className={`btn rival__go${first ? ' btn--primary' : ''}`} onClick={() => onGo(last!, who)}>
          {local ? 'Play' : 'Challenge'}
        </button>
      )}
      {open && (
        <ul className="rival__games" aria-label="The group's record, by game">
          {games.map(([slug, t]) => (
            <li key={slug}>
              <button type="button" className="rival__game" disabled={!playable(slug)} onClick={() => onGo(slug, who)}>
                <span>
                  {gameName(slug)} · {t.played} played
                </span>
                <b>{standingLine(standings(t.wins, g.members, g.you))}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

const lastGroupGame = (g: Group) => g.last ?? Object.entries(g.byGame).sort((a, b) => b[1].played - a[1].played)[0]?.[0]
