import { useEffect, useRef, useState } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ResultActions } from '../../match/ResultActions'
import { VsBlock } from '../../components/VsBlock'
import { RivalryLine } from '../../match/RivalryLine'
import { useRivalry } from '../../match/useRivalry'
import type { CardInput } from '../../match/shareCard'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { FleetPlacer, FleetStatus, WatersGrid, cellName, loadSecret, saveSecret, type Secret } from './Board'
import {
  CELLS,
  FLEET,
  answer,
  cellsOf,
  commitOf,
  concede,
  decode,
  encode,
  fire,
  freshLive,
  lock,
  matchOver,
  matchWinner,
  newSalt,
  norm,
  nextGame,
  reveal,
  shipName,
  verify,
  type Layout,
  type Live,
  type Waters,
} from './engine'
import '../../styles/battleship.css'

const GAME = 'battleship'
/** The final reveal stays up this long before the results. */
const RESULT_MS = 3600
/** pass & play: the shot's result shows this long before the phone changes hands */
const SETTLE_MS = 1400
/** a shot's "Hit at B4" line stays this long */
const FLASH_MS = 1800
/** phones: the sea on screen changes this long after the turn does, so the last shot is seen landing */
const SWITCH_MS = 1100

export interface BattleshipState {
  best: 1 | 3
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialBattleshipState(best: 1 | 3 = 1, match = 1): BattleshipState {
  // who fires first alternates between matches
  return { best, match, live: freshLive(best, (match % 2 === 1 ? 0 : 1) as Seat) }
}

type Sea = 'theirs' | 'yours'
const other = (s: Seat) => (1 - s) as Seat
const afloat = (w: Waters) => FLEET.length - (w.sunk ?? []).length

export function BattleshipMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as BattleshipState
  const live = norm(st.live)
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const local = session.local
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`
  const mine = (s: Seat) => !local && s === me.seat

  // each fleet lives only on its owner's device (both, in pass & play)
  const secretId = (s: Seat) => `${room.code}:${room.createdAt}:${st.match}:${live.game}:${s}`
  const [mem, setMem] = useState<Record<string, Secret>>({})
  const secretOf = (s: Seat): Secret | null => (local || s === me.seat ? (mem[secretId(s)] ?? loadSecret(secretId(s))) : null)
  const layoutOf = (s: Seat): Layout | null => {
    const sec = secretOf(s)
    return sec ? decode(sec.layout) : null
  }

  const wide = useWide()
  const over = matchOver(live)
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  /* ── placing ── */
  const lockFleet = async (seat: Seat, layout: Layout) => {
    const salt = newSalt()
    const enc = encode(layout)
    const commit = await commitOf(enc, salt)
    saveSecret(secretId(seat), { layout: enc, salt })
    setMem((m) => ({ ...m, [secretId(seat)]: { layout: enc, salt } }))
    sound('start')
    session.move<Live>((cur) => lock(cur, seat, commit)).catch(() => {})
  }

  /* ── firing ── */
  const shotsTotal = (live.waters[0].shots ?? []).length + (live.waters[1].shots ?? []).length
  // pass & play: after a shot, the shooter sees what it did before the phone changes hands
  const [shownTotal, setShownTotal] = useState(shotsTotal)
  useEffect(() => {
    if (shownTotal === shotsTotal) return
    const t = setTimeout(() => setShownTotal(shotsTotal), local ? SETTLE_MS : 0)
    return () => clearTimeout(t)
  }, [shotsTotal, shownTotal, local])
  const settling = local && shownTotal !== shotsTotal

  const fireAt = (cell: number) => {
    const shooter = live.turn
    const target = other(shooter)
    if (local) {
      const lay = layoutOf(target)
      const sec = secretOf(target)
      if (!lay || !sec) return
      session.move<Live>((cur) => {
        const f = fire(cur, shooter, cell)
        return f && answer(f, target, lay, sec.salt)
      })
    } else {
      sound('tick')
      session.move<Live>((cur) => fire(cur, me.seat, cell)).catch(() => {})
    }
  }

  // online: my device answers each shot at my fleet as it arrives
  const myPending = live.waters[me.seat].pending
  const mySecret = local ? null : secretOf(me.seat)
  useEffect(() => {
    if (local || myPending === undefined || !mySecret) return
    const lay = decode(mySecret.layout)
    if (!lay) return
    session.move<Live>((cur) => answer(cur, me.seat, lay, mySecret.salt)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPending, mySecret?.layout, local, me.seat, session])

  // when a game ends, each fleet still hidden is shown (the loser's already is)
  const done = live.phase === 'done'
  useEffect(() => {
    if (!done) return
    for (const s of [0, 1] as Seat[]) {
      if (live.waters[s].layout || !(local || s === me.seat)) continue
      const sec = secretOf(s)
      const lay = sec && decode(sec.layout)
      if (sec && lay) session.move<Live>((cur) => reveal(cur, s, lay, sec.salt)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, live.waters[0].layout, live.waters[1].layout, local, me.seat, session])

  // phones show one sea: theirs on your shot, yours on theirs (pass & play: always the shooter's target).
  // The tabs peek at the other one until the turn moves on.
  const autoSea: Sea = local || live.turn === me.seat ? 'theirs' : 'yours'
  const [sea, setSea] = useState<Sea>(autoSea)
  const [peek, setPeek] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => {
      setSea(autoSea)
      setPeek(false)
    }, SWITCH_MS)
    return () => clearTimeout(t)
  }, [autoSea, live.turn])

  // the shooter waits on the other phone's answer; say so if it's slow
  const oppPending = live.waters[other(me.seat)].pending
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (local || oppPending === undefined) return
    const t = setTimeout(() => setSlow(true), 2500)
    return () => clearTimeout(t)
  }, [oppPending, local])

  // what each answered shot did: a line under the scores, and a sound
  const [flash, setFlash] = useState<{ text: string; kind: 'miss' | 'hit' | 'sunk' } | null>(null)
  const seen = useRef([(live.waters[0].shots ?? []).length, (live.waters[1].shots ?? []).length])
  useEffect(() => {
    for (const t of [0, 1] as Seat[]) {
      const w = live.waters[t]
      const n = (w.shots ?? []).length
      if (n <= seen.current[t]) {
        seen.current[t] = n
        continue
      }
      seen.current[t] = n
      const cell = w.shots![n - 1]
      const shooter = other(t)
      const youShot = local || shooter === me.seat
      const sunkNow = (w.sunk ?? []).find((s) => s.cells.includes(cell))
      const hit = (w.hits ?? []).includes(cell)
      let text: string
      if (sunkNow) {
        const ship = shipName(sunkNow.id)
        text = local ? `${name(shooter)} sank ${name(t)}’s ${ship}!` : youShot ? `You sank their ${ship}!` : `${name(shooter)} sank your ${ship}`
        sound(youShot ? 'findBig' : 'end')
      } else if (hit) {
        text = `${local || youShot ? 'Hit' : `${name(shooter)} hit you`} at ${cellName(cell)}`
        sound(youShot ? 'find' : 'error')
      } else {
        text = `${local || youShot ? 'Miss' : `${name(shooter)} missed`} at ${cellName(cell)}`
        sound('tap')
      }
      setFlash({ text, kind: sunkNow ? 'sunk' : hit ? 'hit' : 'miss' })
    }
  }, [live.waters, local, me.seat, sound]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(t)
  }, [flash])

  // at the end of a game: does each revealed fleet match what was locked in, and every answer?
  const [honest, setHonest] = useState<[boolean | null, boolean | null]>([null, null])
  const layouts = `${live.waters[0].layout ?? ''}|${live.waters[1].layout ?? ''}`
  useEffect(() => {
    setHonest([null, null])
    if (!done) return
    let alive = true
    Promise.all([verify(live.waters[0]), verify(live.waters[1])]).then(([a, b]) => alive && setHonest([a, b]))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, layouts])

  // pass & play: the phone changes hands before each fleet is placed and before each shot
  const [handed, setHanded] = useState<string | null>(null)
  const placer: Seat = live.waters[live.starter].commit ? other(live.starter) : live.starter
  const coverKey = live.phase === 'placing' ? `place:${live.game}:${placer}` : live.phase === 'firing' ? `fire:${live.game}:${shotsTotal}` : null
  const cover = local && inMatch && coverKey !== null && handed !== coverKey && !settling

  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} value={live.wins[0]} meta={live.best === 3 ? 'games won' : 'won'} />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} value={live.wins[1]} meta={live.best === 3 ? 'games won' : 'won'} />
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  const meta = (s: Seat) => `${afloat(live.waters[s])} ship${afloat(live.waters[s]) === 1 ? '' : 's'} left`
  const hud = (
    <div className="mt-hud">
      <ScoreCard p={seats[0]} you={mine(0)} active={local && inMatch && live.phase === 'firing' && live.turn === 0} value={live.best === 3 ? live.wins[0] : afloat(live.waters[0])} meta={live.best === 3 ? meta(0) : 'ships left'} />
      <div className="bs-game">
        <span className="label">{live.best === 3 ? 'Game' : 'Battle'}</span>
        <strong>{live.best === 3 ? `${live.game + 1}/3` : 'VS'}</strong>
      </div>
      <ScoreCard p={seats[1]} you={mine(1)} active={local && inMatch && live.phase === 'firing' && live.turn === 1} value={live.best === 3 ? live.wins[1] : afloat(live.waters[1])} meta={live.best === 3 ? meta(1) : 'ships left'} />
    </div>
  )
  const away = awaySecs !== null && opp && <p className="mt-banner" role="status">{opp.name} disconnected · ending the match in {awaySecs}s unless they’re back</p>

  if (cover) {
    const who = live.phase === 'placing' ? placer : live.turn
    return (
      <main className="bsm screen-in">
        {hud}
        <div className="bs-cover">
          <VsBlock mood="wait" eyes size={72} />
          <p className="label">Pass the phone</p>
          <h1 className="bs-cover__title">{name(who)}’s {live.phase === 'placing' ? 'fleet' : 'shot'}</h1>
          <p>{live.phase === 'placing' ? `${name(other(who))}, look away while ${name(who)} places their ships.` : `${name(other(who))}, no peeking at ${name(who)}’s fleet.`}</p>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => setHanded(coverKey)}>
            I’m {name(who)} <span className="keycap">↵</span>
          </button>
        </div>
      </main>
    )
  }

  /* ── placing ── */
  if (live.phase === 'placing') {
    const seat = local ? placer : me.seat
    const placed = !!live.waters[seat].commit
    return (
      <main className="bsm screen-in">
        {hud}
        {!placed ? (
          <>
            <p className="bs-status bs-status--you" role="status">{local ? `${name(seat)}, place your fleet` : 'Place your fleet'}</p>
            <FleetPlacer key={secretId(seat)} who={local ? `${name(seat)}’s` : undefined} onLock={(l) => lockFleet(seat, l)} />
          </>
        ) : (
          <div className="bs-cover">
            <VsBlock mood="wait" eyes size={72} />
            <h1 className="bs-cover__title">{name(other(seat))} is placing their ships…</h1>
            {secretOf(seat) ? (
              <p>Your fleet is locked in. The first shot is {live.starter === me.seat ? 'yours' : `${name(live.starter)}’s`}.</p>
            ) : (
              <LostFleet onConcede={() => session.move<Live>((cur) => concede(cur, me.seat)).catch(() => {})} oppName={name(other(seat))} />
            )}
          </div>
        )}
        {away}
      </main>
    )
  }

  /* ── firing / game over ── */
  // whose eyes the screen is for: online, yours; in pass & play the shooter (still the last one while their result shows)
  const view: Seat = local ? (settling ? other(live.turn) : live.turn) : me.seat
  const foe = other(view)
  const myTurn = !done && live.turn === view && !settling
  const lost = !local && !done && !secretOf(me.seat)
  const canFire = myTurn && live.waters[foe].pending === undefined && (!local || !!layoutOf(foe)) && !lost
  const ownLayout = layoutOf(view) ?? (live.waters[view].layout ? decode(live.waters[view].layout!) : null)
  const foeLayout = done && live.waters[foe].layout ? decode(live.waters[foe].layout!) : null

  const status = done
    ? live.forfeit
      ? `${name(live.winner!)} takes game ${live.game + 1}`
      : `${local ? name(live.winner!) : live.winner === me.seat ? 'You' : name(live.winner!)} sank the whole fleet!`
    : flash
      ? flash.text
      : local
        ? `${name(live.turn)}’s shot`
        : live.turn === me.seat
          ? oppPending !== undefined
            ? slow
              ? `Waiting for ${name(foe)}’s phone…`
              : 'Firing…'
            : 'Your shot · tap a square'
          : `${name(live.turn)} is aiming…`

  // wide screens and the final reveal show both seas; phones one at a time, with tabs to look at the other
  const single = !wide && !done
  const shown: Sea = peek ? (sea === 'theirs' ? 'yours' : 'theirs') : sea
  const theirsName = local ? `${name(foe)}’s waters` : 'Their waters'
  const yoursName = local ? `${name(view)}’s fleet` : 'Your fleet'
  const tabs = (
    <div className="bs-tabs" role="tablist" aria-label="Which sea">
      {(['theirs', 'yours'] as Sea[]).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={shown === k}
          className={`bs-tab${shown === k ? ' bs-tab--on' : ''}${k === 'theirs' && canFire && shown !== k ? ' bs-tab--call' : ''}`}
          onClick={() => {
            if (shown === k) return
            sound('tap')
            setPeek(k !== sea)
          }}
        >
          {k === 'theirs' ? theirsName : yoursName}
        </button>
      ))}
    </div>
  )
  const theirs = (
    <section className="bs-panel" aria-label={theirsName}>
      <header className="bs-panel__head">
        {single ? tabs : <span className="label">{theirsName}</span>}
        <FleetStatus sunk={live.waters[foe].sunk ?? []} label={`${name(foe)}’s ships`} />
      </header>
      <WatersGrid
        ships={foeLayout ?? undefined}
        sunk={live.waters[foe].sunk}
        shots={live.waters[foe].shots}
        hits={live.waters[foe].hits}
        pending={live.waters[foe].pending}
        armed={canFire}
        onTap={canFire ? fireAt : undefined}
        label={`${name(foe)}’s waters`}
      />
    </section>
  )
  const yours = (
    <section className="bs-panel" aria-label={yoursName}>
      <header className="bs-panel__head">
        {single ? tabs : <span className="label">{yoursName}</span>}
        <FleetStatus sunk={live.waters[view].sunk ?? []} label={`${name(view)}’s ships`} />
      </header>
      <WatersGrid
        ships={ownLayout ?? undefined}
        sunk={live.waters[view].sunk}
        shots={live.waters[view].shots}
        hits={live.waters[view].hits}
        pending={live.waters[view].pending}
        label={local ? `${name(view)}’s fleet` : 'Your fleet'}
      />
    </section>
  )

  const cheat = done && honest.some((h) => h === false)
  return (
    <main className={`bsm bsm--play screen-in${done ? ' bsm--done' : ''}`}>
      {hud}
      <p
        className={`bs-status${canFire ? ' bs-status--you' : ''}${flash ? ` bs-status--${flash.kind}` : ''}${done ? ' bs-status--result' : ''}`}
        role="status"
      >
        {status}
      </p>
      <div className="bs-boards">
        {single ? (
          shown === 'theirs' ? theirs : yours
        ) : (
          <>
            {theirs}
            {yours}
          </>
        )}
      </div>

      {done && (
        <div className="bs-reveal">
          {cheat && (
            <p className="bs-warn">
              {[0, 1]
                .filter((s) => honest[s] === false)
                .map((s) => `${name(s as Seat)}’s fleet doesn’t match the answers given or the one locked in.`)
                .join(' ')}
            </p>
          )}
          {!cheat && honest.every((h) => h !== null) && (live.waters[0].layout || live.waters[1].layout) && <p className="hint">✓ Fleets match what was locked in</p>}
          {!over && (
            <button type="button" className="btn btn--primary btn--lg" onClick={() => session.move<Live>((cur) => nextGame(cur)).catch(() => {})}>
              Next game <span className="keycap">↵</span>
            </button>
          )}
        </div>
      )}
      {lost && <LostFleet onConcede={() => session.move<Live>((cur) => concede(cur, me.seat)).catch(() => {})} oppName={name(foe)} />}
      {away}
    </main>
  )
}

function LostFleet({ onConcede, oppName }: { onConcede: () => void; oppName: string }) {
  return (
    <div className="bs-reveal">
      <p className="bs-warn">Your fleet isn’t on this device any more (the match was opened somewhere else), so you can’t answer shots.</p>
      <button type="button" className="btn" onClick={onConcede}>
        Give {oppName} this game
      </button>
    </div>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: BattleshipState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = norm(st.live)
  const winner = matchWinner(live)
  const iWon = session.local ? winner !== -1 : winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]
  const played = live.played ?? []

  const cheered = useRef(false)
  useEffect(() => {
    if (iWon && !cheered.current) {
      cheered.current = true
      sound('findBig')
    }
  }, [iWon, sound])

  const ready = st.ready ?? {}
  const imReady = !!ready[me.id]
  const oppReady = !!(opp && ready[opp.id])
  const oppGone = room.status === 'abandoned' || !opp?.online

  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialBattleshipState(st.best, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.best, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)

  // totals across the match, by seat
  const sum = (k: 'shots' | 'hits') => [0, 1].map((s) => played.reduce((n, g) => n + g[k][s], 0))
  const shots = sum('shots')
  const hits = sum('hits')
  const run = [0, 1].map((s) => Math.max(0, ...played.map((g) => g.run[s])))
  const rate = (s: number) => (shots[s] ? Math.round((hits[s] / shots[s]) * 100) : 0)
  const w = live.wins

  // the share card shows the last game: the loser's waters as the winner left them
  const lastWin = played[played.length - 1]?.winner ?? (winner === -1 ? 0 : winner)
  const shotAt = live.waters[other(lastWin)]
  const shipCells = new Set((shotAt.layout ? decode(shotAt.layout) : null)?.flatMap((p) => cellsOf(p)!) ?? (shotAt.sunk ?? []).flatMap((s) => s.cells))
  const hitSet = new Set(shotAt.hits ?? [])
  const missSet = new Set(shotAt.shots ?? [])
  const board = Array.from({ length: CELLS }, (_, i) => (hitSet.has(i) ? 'x' : missSet.has(i) ? 'o' : shipCells.has(i) ? 's' : '.')).join('')

  // ships each player sank in the last game (a single game's score)
  const sank = [0, 1].map((s) => (live.waters[other(s as Seat)].sunk ?? []).length)
  const scoreLine = live.best === 3 ? `${w[0]} — ${w[1]}` : `${sank[0]} — ${sank[1]}`
  const card: CardInput = {
    game: 'Battleship',
    winner,
    scoreLine,
    headline: live.best === 1 ? `IN ${shots[winner === -1 ? 0 : winner]} SHOTS` : undefined,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({
      name: names[k],
      seat: k as 0 | 1,
      score: String(live.best === 3 ? w[k] : sank[k]),
      meta: live.best === 3 ? 'games won' : 'ships sunk',
    })) as CardInput['players'],
    detail: {
      kind: 'battleship',
      board,
      seat: lastWin,
      stats: [
        ['Shots', `${shots[0]} · ${shots[1]}`],
        ['Hit rate', `${rate(0)}% · ${rate(1)}%`],
        ['Best run', `${run[0]} · ${run[1]}`],
      ],
    },
  }

  return (
    <main className="bsm bsm-results screen-in">
      {iWon && <Confetti />}
      <div className="bsm-results__head">
        {winner !== -1 && <VsBlock mood="win" side={winner} eyes size={64} />}
        <p className="label">Match {st.match} · Battleship{live.best === 3 ? ' · best of 3' : ''}</p>
        <h1 className={`bsm-results__title${iWon ? ' bsm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${names[winner]} wins`}
        </h1>
      </div>

      <table className="bs-stats">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Stat</span></th>
            <th scope="col">{names[0]}</th>
            <th scope="col">{names[1]}</th>
          </tr>
        </thead>
        <tbody>
          {live.best === 3 && (
            <tr>
              <th scope="row">Games</th>
              <td>{w[0]}</td>
              <td>{w[1]}</td>
            </tr>
          )}
          <tr>
            <th scope="row">Shots</th>
            <td>{shots[0]}</td>
            <td>{shots[1]}</td>
          </tr>
          <tr>
            <th scope="row">Hit rate</th>
            <td>{rate(0)}%</td>
            <td>{rate(1)}%</td>
          </tr>
          <tr>
            <th scope="row">Best run</th>
            <td>{run[0]}</td>
            <td>{run[1]}</td>
          </tr>
        </tbody>
      </table>
      {played.some((g) => g.forfeit) && <p className="hint">A game was conceded when a fleet was lost from its device.</p>}

      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Battleship', GAME, names, winner, scoreLine)}
        oppName={opp?.name}
        imReady={imReady}
        oppReady={oppReady}
        oppGone={oppGone}
        onReady={() => (sound('tap'), session.ready(me.id))}
        onLeave={exit.now}
      />
    </main>
  )
}

/** Wide enough for both seas side by side (matches the stylesheet's breakpoint). */
function useWide() {
  const query = '(width >= 900px)'
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}
