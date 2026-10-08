import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { gameBySlug } from '../games/registry'
import { useSound } from '../lib/sound'
import { lastGame, listRivals, type Rival, type Tally } from '../match/rivalry'

/** rivals shown before "Show all" */
const FIRST = 4

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

/** "Your rivals" on the homepage: everyone you've finished a match against, with a one-tap rematch. */
export function Rivals() {
  const [rivals] = useState(listRivals)
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const navigate = useNavigate()
  const { play } = useSound()

  if (!rivals.length) return null
  const shown = all ? rivals : rivals.slice(0, FIRST)

  const challenge = (slug: string, r: Rival & { key: string }, local: boolean) => {
    play('tap')
    // online: the lobby opens a room straight away and names who it's for; pass & play: just the game
    navigate(`/${slug}`, local ? undefined : { state: { challenge: r.name } })
  }

  return (
    <section className="rivals" aria-labelledby="rivals-title">
      <h2 id="rivals-title" className="rivals__title">Your rivals</h2>
      <ul className="rivals__list">
        {shown.map((r) => {
          const { local, me, them } = sides(r)
          const { w, l, d } = r.total
          const last = lastGame(r)
          const streak = r.streak && r.streak.n >= 2 ? `${r.streak.who === 'me' ? me : them} won ${r.streak.n} in a row` : null
          const games = Object.entries(r.byGame).sort((x, y) => y[1].w + y[1].l + y[1].d - (x[1].w + x[1].l + x[1].d))
          const isOpen = open === r.key
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
                <button type="button" className={`btn rival__go${r === rivals[0] ? ' btn--primary' : ''}`} onClick={() => challenge(last!, r, local)}>
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
            </li>
          )
        })}
      </ul>
      {rivals.length > FIRST && (
        <button type="button" className="link-btn rivals__more" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${rivals.length}`}
        </button>
      )}
    </section>
  )
}
