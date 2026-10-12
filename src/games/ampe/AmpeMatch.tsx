import { useCallback, useEffect, useRef, useState } from 'react'
import { useServerOffset } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { MatchEnded } from '../../match/MatchEnded'
import { ResultActions } from '../../match/ResultActions'
import { ResultMark } from '../../match/ResultMark'
import { RivalryLine } from '../../match/RivalryLine'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import { shareLink, shareMessage } from '../../match/share'
import type { CardInput } from '../../match/shareCard'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { useRivalry } from '../../match/useRivalry'
import { REVEAL_WAIT_MS, SHOW_MS, beatOf, commitOf, freshLive, honest, key, lockIn, newSalt, opsFoot, revealIn, type AmpeLive, type Foot, type Reveal, type Seat } from './engine'
import { ampeFeats } from './feats'
import orangeSheet from './sprites/player.png'
import blueSheet from './sprites/player-blue.png'
import '../../styles/ampe.css'

const GAME = 'ampe'

export interface AmpeState {
  /** points to win */
  target: number
  match: number
  live: AmpeLive
  ready?: Record<string, boolean>
}

export function initialAmpeState(target = 10, match = 1): AmpeState {
  // the lead opens with seat 1 in every other match
  return { target, match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

/** the poses on the sprite sheet: [row, column]; every kick on the sheet goes left, and is mirrored for a right foot */
type Pose = readonly [number, number]
const P = {
  ready: [0, 0],
  crouch: [0, 1],
  jump: [0, 2],
  clap: [0, 3],
  down: [0, 4],
  land: [0, 5],
  kick: [1, 1],
  kickClap: [1, 2],
  bigKick: [1, 3],
  hop: [3, 0],
  cheer: [3, 1],
  laugh: [3, 2],
  ohNo: [3, 3],
  sulk: [3, 4],
  sat: [3, 5],
} as const
const COLS = 6
const ROWS = 4

/** what a player is doing at server time t: the jump-clap-kick of the exchange, then the kick and how it went */
function poseOf(l: AmpeLive, seat: Seat, t: number, over: boolean): { pose: Pose; flip: boolean } {
  const last = l.last
  const kickAt = l.start - SHOW_MS
  // the exchange just settled: feet out, then the reaction
  if (last && (over || t < l.start) && t >= kickAt - 200) {
    const foot = last.feet[seat]
    const won = last.winner === seat
    const e = t - kickAt
    if (over && e > 700) return { pose: won ? (Math.floor(t / 360) % 2 ? P.cheer : P.hop) : P.sat, flip: false }
    if (foot === 0) return { pose: P.sulk, flip: false }
    if (e < 650) return { pose: e < 120 ? P.kick : P.bigKick, flip: foot === 1 }
    if (last.winner === -1) return { pose: P.ready, flip: false }
    return won ? { pose: Math.floor(t / 300) % 2 ? P.hop : P.cheer, flip: false } : { pose: P.ohNo, flip: false }
  }
  if (!l.start || over) return { pose: P.ready, flip: false }
  const u = (t - l.start) / beatOf(l.n)
  if (u < 0) return { pose: P.ready, flip: false }
  if (u < 0.14) return { pose: P.crouch, flip: false }
  if (u < 0.38) return { pose: P.jump, flip: false }
  if (u < 0.66) return { pose: P.clap, flip: false }
  if (u < 0.92) return { pose: P.down, flip: false }
  // landed, feet about to go out: waiting on the reveal
  return { pose: P.land, flip: false }
}

const WORDS = ['Jump', 'Clap', 'Kick!'] as const
const wordAt = (u: number) => (u < 0.38 ? WORDS[0] : u < 0.72 ? WORDS[1] : WORDS[2])

export function AmpeMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as AmpeState
  const live = st.live
  const session = useSession(GAME, room.code)
  const vsOps = !!session.bot
  const online = !session.local && !vsOps
  const level = session.level ?? 'medium'
  const { play: sound } = useSound()
  const seats = playersBySeat(room)
  const mine = me.seat as Seat
  const theirs = (1 - mine) as Seat
  const opp = seats[theirs]
  const oppName = opp?.name ?? 'Ops'
  const nameOf = (s: Seat) => (s === mine ? 'You' : oppName)

  const over = !!live.result
  const showResults = useHold(over, 2600)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, online ? opp : null, inMatch)
  const offset = useServerOffset()
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const now = useCallback(() => Date.now() + offsetRef.current, [])

  const liveRef = useRef(live)
  liveRef.current = live
  /** your pick for an exchange, kept on this phone until the kick */
  const pick = useRef<{ n: number; foot: Foot; salt: string } | null>(null)
  const [picked, setPicked] = useState<{ n: number; foot: Foot } | null>(null)
  /**
   * Online: the pick that's actually locked in (the last lock-in that landed). Lock-ins go one after
   * another, and the kick waits for any still on its way, so the foot revealed is always the one locked in.
   */
  const locked = useRef<{ n: number; foot: Foot; salt: string } | null>(null)
  const sending = useRef<Promise<unknown>>(Promise.resolve())
  /** your feet so far (Ops reads them) */
  const history = useRef<Foot[]>([])
  const figEls = useRef<(HTMLDivElement | null)[]>([null, null])
  const wordEl = useRef<HTMLParagraphElement>(null)
  const [banner, setBanner] = useState<{ text: string; mine: boolean; n: number } | null>(null)

  // the first exchange: the host (or this phone, against Ops) sets it going
  useEffect(() => {
    if (live.start || over || !(me.isHost || vsOps || session.local)) return
    session.move<AmpeLive>((cur) => (cur.start || cur.result ? undefined : { ...cur, start: now() + 1800 })).catch(() => {})
  }, [live.start, over, me.isHost, vsOps, session, now])

  /** a tap on a side of the screen: your foot for this exchange (you can change it until the kick) */
  const tap = useCallback(
    (foot: Foot) => {
      const l = liveRef.current
      if (l.result || !l.start) return
      const t = now()
      // from the moment the last exchange shows until this one's kick
      if (t >= l.start + beatOf(l.n) || t < l.start - SHOW_MS + 300) return
      const salt = newSalt()
      pick.current = { n: l.n, foot, salt }
      setPicked({ n: l.n, foot })
      sound('tap')
      if (online) {
        const n = l.n
        sending.current = sending.current
          .then(async () => {
            const c = await commitOf(n, foot, salt)
            if (await session.move<AmpeLive>((cur) => lockIn(cur, n, mine, c))) locked.current = { n, foot, salt }
          })
          .catch(() => {})
      }
    },
    [now, online, session, mine, sound],
  )

  // keys on a computer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'ArrowLeft' || e.key === 'a') tap(-1)
      else if (e.key === 'ArrowRight' || e.key === 'd') tap(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tap])

  // the kick: your foot goes in (and Ops', who picks hers now); online, a phone that never answers gets no foot
  useEffect(() => {
    if (!live.start || over) return
    const n = live.n
    const kickIn = live.start + beatOf(n) - now()
    const mineNow = (): Reveal => {
      const p = pick.current
      return p && p.n === n ? { foot: p.foot, salt: p.salt } : { foot: 0 }
    }
    const kick = setTimeout(() => {
      const r = mineNow()
      if (vsOps) {
        const ops = opsFoot(level, history.current, liveRef.current.leader === theirs)
        history.current.push(r.foot)
        session.move<AmpeLive>((cur) => revealIn(cur, n, { [key(mine)]: { foot: r.foot }, [key(theirs)]: { foot: ops } }, st.target, now())).catch(() => {})
      } else {
        // reveal what's locked in, once any lock-in on its way has landed (or been turned away)
        sending.current = sending.current.then(() => {
          const p = locked.current
          const r: Reveal = p && p.n === n ? { foot: p.foot, salt: p.salt } : { foot: 0 }
          history.current.push(r.foot)
          return session.move<AmpeLive>((cur) => revealIn(cur, n, { [key(mine)]: r }, st.target, now()))
        }).catch(() => {})
      }
    }, Math.max(0, kickIn))
    const claim = online
      ? setTimeout(() => {
          session.move<AmpeLive>((cur) => (cur.n === n && !cur.reveal?.[key(theirs)] ? revealIn(cur, n, { [key(theirs)]: { foot: 0 } }, st.target, now()) : undefined)).catch(() => {})
        }, Math.max(0, kickIn) + REVEAL_WAIT_MS)
      : undefined
    return () => {
      clearTimeout(kick)
      if (claim) clearTimeout(claim)
    }
  }, [live.n, live.start, over, vsOps, online, level, session, st.target, mine, theirs, now])

  // an exchange settled: the sound, the banner; online, check the other player's kick was the one they locked in
  const seen = useRef(live.last?.n ?? 0)
  useEffect(() => {
    const last = live.last
    if (!last || last.n === seen.current) return
    seen.current = last.n
    const lead = (s: Seat) => (s === mine ? 'you' : oppName)
    const iWon = last.winner === mine
    sound(last.winner === -1 ? 'tick' : iWon ? 'find' : 'error')
    const feetSaid = last.why === 'match' ? 'Same foot' : last.why === 'apart' ? 'Different feet' : null
    let text: string
    if (last.winner === -1) text = 'Nobody kicked · again'
    else if (last.why === 'slow') text = last.feet[mine] === 0 ? 'Too slow · pick before the kick' : `${oppName} didn’t kick in time`
    else text = `${feetSaid} · ${iWon ? 'your point' : `${oppName}’s point`}`
    if (last.winner !== -1 && last.winner !== last.leader && !live.result) text += ` · ${lead(last.winner as Seat) === 'you' ? 'you lead' : `${oppName} leads`}`
    const n = Date.now()
    setBanner({ text, mine: iWon, n })
    setTimeout(() => setBanner((b) => (b?.n === n ? null : b)), SHOW_MS - 100)
    if (online)
      honest(last, theirs).then((ok) => {
        if (!ok) session.move<AmpeLive>((cur) => (cur.result ? undefined : { ...cur, result: { winner: mine, why: 'foul' } })).catch(() => {})
      })
  }, [live.last, live.result, mine, theirs, oppName, online, session, sound])

  // the frame loop: both figures, and the beat's word
  useEffect(() => {
    if (showResults) return
    let raf = 0
    let clapped = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const l = liveRef.current
      const t = now()
      for (const s of [0, 1] as Seat[]) {
        const el = figEls.current[s === mine ? 0 : 1]
        if (!el) continue
        const { pose, flip } = poseOf(l, s, t, !!l.result)
        el.style.backgroundPosition = `${(pose[1] / (COLS - 1)) * 100}% ${(pose[0] / (ROWS - 1)) * 100}%`
        el.style.transform = flip ? 'scaleX(-1)' : ''
      }
      const w = wordEl.current
      if (w) {
        const u = l.start ? (t - l.start) / beatOf(l.n) : -1
        const word = !l.result && u >= 0 && u < 1.05 ? wordAt(u) : ''
        if (w.textContent !== word) {
          w.textContent = word
          w.classList.toggle('ampe-word--kick', word === 'Kick!')
          if (word === WORDS[1] && clapped !== l.n) {
            clapped = l.n
            sound('snap')
          }
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [showResults, now, mine, sound])

  /* ── screens ── */

  const card = (s: Seat) => (
    <ScoreCard p={seats[s]} you={s === mine} turn={!over && live.leader === s} value={live.points[s]} meta={live.leader === s ? 'Leads · wants a match' : 'Wants different feet'} />
  )
  if (abandoned && !over) {
    return (
      <MatchEnded
        room={room}
        me={me}
        seats={seats}
        exit={exit}
        scoreboard={
          <>
            {card(0)}
            <span className="mt-ended__vs" aria-hidden="true">vs</span>
            {card(1)}
          </>
        }
      />
    )
  }
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  const iLead = live.leader === mine
  const myPick = picked && picked.n === live.n ? picked.foot : 0
  const figure = (s: Seat) => (
    <div className={`ampe-spot ampe-spot--${s === mine ? 'me' : 'them'}`}>
      <p className={`ampe-tag${live.leader === s ? ' ampe-tag--lead' : ''}`}>{live.leader === s ? `${nameOf(s)} lead${s === mine ? '' : 's'}` : nameOf(s)}</p>
      <div ref={(el) => void (figEls.current[s === mine ? 0 : 1] = el)} className="ampe-fig" style={{ backgroundImage: `url(${s === 0 ? orangeSheet : blueSheet})` }} aria-hidden="true" />
    </div>
  )

  return (
    <main className="ampe">
      <div className="mt-hud">
        {card(0)}
        <div className="ampe-to">
          <span className="label">First to</span>
          <span className="ampe-to__n">{st.target}</span>
        </div>
        {card(1)}
      </div>
      <p className={`ampe-status${iLead ? ' ampe-status--lead' : ''}`} role="status">
        {over ? (live.result?.why === 'foul' ? 'Their kick didn’t match their lock-in' : '') : iLead ? 'You lead · kick the same foot as them' : `${oppName} leads · kick the other foot`}
      </p>

      <div
        className="ampe-stage"
        onPointerDown={(e) => {
          e.preventDefault()
          tap(e.clientX < window.innerWidth / 2 ? -1 : 1)
        }}
      >
        <p ref={wordEl} className="ampe-word" aria-live="off" />
        <div className="ampe-floor">
          {figure(mine)}
          {figure(theirs)}
        </div>
        <span className={`ampe-side ampe-side--l${myPick === -1 ? ' ampe-side--on' : ''}`} aria-hidden="true">
          L
        </span>
        <span className={`ampe-side ampe-side--r${myPick === 1 ? ' ampe-side--on' : ''}`} aria-hidden="true">
          R
        </span>
        {banner && (
          <div key={banner.n} className={`ampe-banner${banner.mine ? ' ampe-banner--mine' : ''}`} aria-hidden="true">
            {banner.text}
          </div>
        )}
        {live.n <= 2 && !over && <p className="ampe-hint">Tap left or right before the kick · your foot stays secret till then</p>}
      </div>
      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
    </main>
  )
}

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: AmpeState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const p = st.live.points
  const winner = (st.live.result?.winner ?? (p[0] >= p[1] ? 0 : 1)) as Seat
  const iWon = winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]

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
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialAmpeState(st.target, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.target, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'You', seats[1]?.name ?? 'Ops']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, ampeFeats(st.live))
  const scoreLine = `${p[0]} — ${p[1]}`
  const card: CardInput = {
    game: 'Ampe',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(p[k]), meta: 'points' })) as CardInput['players'],
    // each player's longest run of exchanges won
    detail: { kind: 'rounds', rows: [0, 1].map((k) => ({ word: names[k], seat: k as Seat, note: `best run ${(st.live.run ?? [0, 0])[k]}` })) },
  }

  return (
    <main className="ampe ampe-results screen-in">
      {iWon && <Confetti />}
      <div className="ampe-results__head">
        <ResultMark winner={winner} />
        <p className="label">
          Match {st.match} · first to {st.target}
        </p>
        <h1 className={`ampe-results__title${iWon ? ' ampe-results__title--win' : ''}`}>{iWon ? 'You win' : `${seats[winner]?.name ?? 'Ops'} wins`}</h1>
        <p className="ampe-results__line">
          {p[0]} <span>—</span> {p[1]}
        </p>
        {st.live.result?.why === 'foul' && <p className="ampe-results__note">A kick didn’t match its lock-in</p>}
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} value={p[0]} meta="Points" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={me.seat === 1} value={p[1]} meta="Points" />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Ampe', GAME, names, winner, scoreLine)}
        oppName={opp?.name}
        imReady={imReady}
        oppReady={oppReady}
        oppGone={!session.bot && (room.status === 'abandoned' || !opp?.online)}
        onReady={() => {
          sound('tap')
          session.ready(me.id)
        }}
        onLeave={exit.now}
      />
    </main>
  )
}
