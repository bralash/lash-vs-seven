import { useEffect, useRef } from 'react'
import { OPS_LOOK, type OpsMood } from '../components/OpsFace'
import { useSound } from '../lib/sound'
import { BOT_NAME, type Level, type Moment, type OpsSense } from './bot'
import { Pops, ReactionButton, usePops, useSend, type ReactionKey } from './Reactions'
import { lineFor, linesFor, type LineKey } from './opsLines'
import { TauntLayer, visit, WALK_MS } from './Taunts'
import { itemFrom, launch, ThrowLayer, type Item } from './Throws'
import { onUnleash, UltLayer, unleash, useUlt } from './Ultimates'

/*
 * Ops reacts the way a person does in an online match: a sticker pops up with her name and a
 * word, only with her face pulling the mood instead of an emoji. She speaks up at big moments
 * only (a swing in who's ahead, a capture, a game won or lost, you taking ages) and answers the
 * reactions you send her. Each moment has a key (`line`), so a character look (Kratops, Thanops)
 * says its own words there; the face stays the same.
 */

type Say = { face: OpsMood; said: string; line?: LineKey }

/** quiet for at least this long between unprompted reactions */
const GAP_MS = 8000
/** …and even then she lets some moments pass, so it doesn't feel scripted */
const CHANCE = 0.7
/** your turn: she glances at the clock after this long, then dozes off */
const WAIT_MS = 15_000
const SLEEP_MS = 45_000
/** how big a one-move swing in standing counts as a blunder or a great move */
const SWING = 0.45
/** she comes to taunt your card at most this often */
const VISIT_GAP_MS = 30_000
/** visiting back: once yours has gone home */
const TAUNT_BACK_MS = 3800 - WALK_MS

const HELLO: Record<Level, Say> = {
  easy: { face: 'hello', said: 'Hi!', line: 'hello_easy' },
  medium: { face: 'hello', said: 'Let’s go', line: 'hello_medium' },
  hard: { face: 'hello', said: 'Bring it', line: 'hello_hard' },
}

const MOMENT: Record<Moment, Say> = {
  took: { face: 'gotcha', said: 'Mine', line: 'took' },
  lost: { face: 'ouch', said: 'Rude', line: 'lost' },
  lucky: { face: 'lucky', said: 'Yes!', line: 'lucky' },
  unlucky: { face: 'unlucky', said: 'Rigged', line: 'unlucky' },
}

/** where a standing sits: −2 losing badly, −1 behind, 0 level, 1 ahead, 2 crushing */
const band = (s: number) => (s >= 0.6 ? 2 : s >= 0.25 ? 1 : s <= -0.6 ? -2 : s <= -0.25 ? -1 : 0)

/** what a new band makes her say, if anything */
function bandSay(from: number, to: number): Say | null {
  if (to === from) return null
  if (to === 2) return { face: 'sorry', said: 'Sorry…', line: 'crushing' }
  if (to === 1 && from < 1) return { face: 'smug', said: 'Hehe', line: 'ahead' }
  if (to === -2) return { face: 'panic', said: 'No no no', line: 'losing' }
  if (to === -1 && from > -1) return { face: 'nervous', said: 'Uh oh', line: 'behind' }
  return null
}

/** Her answer to a reaction you send, given how the game stands (s, from her side) and whose turn it is. */
function reply(k: ReactionKey, s: number, herTurn: boolean): Say {
  switch (k) {
    case 'fire':
      return s >= 0.25
        ? { face: 'smug', said: 'Cute', line: 'fire_ahead' }
        : s <= -0.25
          ? { face: 'nervous', said: 'Uh oh', line: 'fire_behind' }
          : { face: 'smug', said: 'We’ll see', line: 'fire_level' }
    case 'lol':
      return s <= -0.25 ? { face: 'ouch', said: 'Rude', line: 'lol_behind' } : { face: 'smug', said: 'Hehe', line: 'lol' }
    case 'wow':
      return s >= 0.25 ? { face: 'sorry', said: 'Sorry…', line: 'wow_ahead' } : { face: 'wow', said: 'Me too', line: 'wow' }
    case 'grr':
      return s >= 0.25 ? { face: 'gotcha', said: 'Mine', line: 'grr_ahead' } : { face: 'pity', said: 'Easy now', line: 'grr' }
    case 'gg':
      return { face: 'gg', said: 'GG', line: 'gg' }
    case 'hurry':
      return herTurn ? { face: 'think', said: 'Patience', line: 'hurry_mine' } : { face: 'wait', said: 'Your go!', line: 'hurry_yours' }
  }
}

/**
 * Something thrown at her card, by how fed up she is (the index; like a poke, it wears off). Past
 * the last row she throws one back.
 */
const HIT_ROWS: Record<Item, Say[]>[] = [
  { flash: [{ face: 'wow', said: 'My eyes!' }, { face: 'ouch', said: 'Can’t see!' }], rubble: [{ face: 'wow', said: 'Rubble?!' }, { face: 'ouch', said: 'Flattened' }], cube: [{ face: 'wow', said: 'Energon?!' }, { face: 'ouch', said: 'Zzzt!' }], web: [{ face: 'panic', said: 'Sticky!' }, { face: 'ouch', said: 'I’m all webbed' }], stone: [{ face: 'wow', said: 'Is that… a stone?' }, { face: 'ouch', said: 'Ow, shiny' }], tomato: [{ face: 'ouch', said: 'Eww' }, { face: 'wow', said: 'A tomato?!' }], rock: [{ face: 'ouch', said: 'Ow!' }, { face: 'ouch', said: 'Bonk' }], paper: [{ face: 'giggle', said: 'Missed… no wait' }, { face: 'smug', said: 'That tickled' }], axe: [{ face: 'panic', said: 'AN AXE?!' }, { face: 'wow', said: 'Is that… mine?' }] },
  { flash: [{ face: 'salty', said: 'Still seeing spots' }, { face: 'nervous', said: 'Ears ringing' }], rubble: [{ face: 'salty', said: 'I’m a pancake' }, { face: 'nervous', said: 'That was a wall' }], cube: [{ face: 'salty', said: 'I’m all tingly' }, { face: 'nervous', said: 'Too much energy' }], web: [{ face: 'salty', said: 'Get it off!' }, { face: 'nervous', said: 'So sticky' }], stone: [{ face: 'nervous', said: 'I felt that' }, { face: 'salty', said: 'Put it back' }], tomato: [{ face: 'salty', said: 'My face!' }, { face: 'salty', said: 'Rude' }], rock: [{ face: 'salty', said: 'Hey!' }, { face: 'nervous', said: 'That hurt' }], paper: [{ face: 'salty', said: 'Really?' }, { face: 'nervous', said: 'Okay, okay' }], axe: [{ face: 'nervous', said: 'Not the axe' }, { face: 'salty', said: 'Overkill' }] },
  { flash: [{ face: 'angry', said: 'NO MORE FLASHES' }], rubble: [{ face: 'angry', said: 'NO MORE WALLS' }], cube: [{ face: 'angry', said: 'OVERLOAD' }], web: [{ face: 'angry', said: 'UNWEB ME' }], stone: [{ face: 'angry', said: 'ENOUGH' }], tomato: [{ face: 'angry', said: 'Stop that' }], rock: [{ face: 'angry', said: 'Seriously?' }], paper: [{ face: 'angry', said: 'Quit it' }], axe: [{ face: 'angry', said: 'ENOUGH' }] },
]
/** each row's line key: a character says its own words for how fed up it is, whatever it was hit with */
const HITS = HIT_ROWS.map(
  (row, i) => Object.fromEntries(Object.entries(row).map(([k, says]) => [k, says.map((x) => ({ ...x, line: `hit_${i + 1}` as LineKey }))])) as Record<Item, Say[]>,
)
const BACK: Say[] = [
  { face: 'gotcha', said: 'Take that', line: 'throw_back' },
  { face: 'smug', said: 'Your turn', line: 'throw_back' },
  { face: 'gotcha', said: 'Ha!', line: 'throw_back' },
]
/** every this long without a throw takes one off how fed up she is */
const HIT_COOL_MS = 4000
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

/** What she says when a game ends. */
function endSay(winner: 0 | 1 | -1, final: boolean, level: Level): Say | null {
  if (!final) return winner === 1 ? MOMENT.took : winner === 0 ? MOMENT.lost : null
  if (winner === 0) return level === 'hard' ? { face: 'salty', said: 'Again?', line: 'lose_final_hard' } : { face: 'gg', said: 'GG', line: 'lose_final' }
  if (winner === 1) return level === 'hard' ? { face: 'smug', said: 'Too easy', line: 'win_final_hard' } : { face: 'gg', said: 'GG', line: 'win_final' }
  return { face: 'gg', said: 'GG', line: 'draw_final' }
}

/**
 * The reaction button and stickers for a match against Ops. Mount it fresh for each match (key it
 * by the match's start) so she says hello once.
 */
export function OpsReactions({ sense, state, level }: { sense: OpsSense; state: Record<string, unknown>; level: Level }) {
  const { pops, pop } = usePops()
  const { play } = useSound()
  const saidAt = useRef(0)
  const prev = useRef<{ state: Record<string, unknown>; key: string; standing: number | null } | null>(null)
  const replyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stateRef = useRef(state)
  stateRef.current = state
  // she always plays (and talks) as herself
  const lines = linesFor(OPS_LOOK)

  const say = (s: Say, buzz = true) => {
    saidAt.current = Date.now()
    pop({ mine: false, face: s.face, said: lineFor(lines, s.line, s.said) })
    play('tap')
    if (buzz) navigator.vibrate?.(40)
  }
  /** an unprompted reaction: only when she's been quiet a while, and not always */
  const maybe = (s: Say | null) => {
    if (s && Date.now() - saidAt.current >= GAP_MS && Math.random() < CHANCE) say(s)
  }
  const sayRef = useRef(say)
  sayRef.current = say
  const maybeRef = useRef(maybe)
  maybeRef.current = maybe

  // hello, once the board is up
  useEffect(() => {
    const t = setTimeout(() => sayRef.current(HELLO[level], false), 900) // no buzz: the page may not have been tapped yet
    return () => {
      clearTimeout(t)
      clearTimeout(replyTimer.current)
    }
  }, [level])

  // each move: a finished game, a capture, a blunder or a great move, or a swing in who's ahead
  const key = sense.key?.(state) ?? `${state.match}:${JSON.stringify(state.live)}`
  useEffect(() => {
    const was = prev.current
    const standing = sense.standing(state)
    prev.current = { state, key, standing }
    if (!was || was.key === key) return

    const end = sense.ended(state)
    if (end) {
      if (!sense.ended(was.state)) {
        const s = endSay(end.winner, end.final, level)
        if (s) say(s) // always worth a word
      }
      return
    }
    if (standing === null || was.standing === null) return
    const youMoved = sense.turn(was.state) === 0
    const moment = sense.moment?.(was.state, state)
    const swing = standing - was.standing
    maybe(
      (moment && (typeof moment === 'string' ? MOMENT[moment] : { face: MOMENT[moment.moment].face, said: moment.said })) ||
        (youMoved && swing >= SWING ? { face: 'pity', said: 'Oof', line: 'blunder' } : null) ||
        (youMoved && swing <= -SWING ? { face: 'wow', said: 'No way', line: 'brilliant' } : null) ||
        bandSay(band(was.standing), band(standing)),
    )
    // pulling ahead (or taking something of yours), now and then she comes over to rub it in
    const gloat = moment === 'took' || (band(standing) >= 1 && band(was.standing) < 1)
    if (gloat && Date.now() - visitedAt.current > VISIT_GAP_MS && Math.random() < 0.3) visitRef.current(1500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // your turn and nothing happening: she glances at the clock, then nods off
  const yourTurn = sense.turn(state) === 0 && !sense.ended(state)
  useEffect(() => {
    if (!yourTurn) return
    const a = setTimeout(() => maybeRef.current({ face: 'wait', said: 'Hurry up', line: 'hurry' }), WAIT_MS)
    const b = setTimeout(() => sayRef.current({ face: 'sleep', said: 'Zzz', line: 'sleep' }), SLEEP_MS)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [yourTurn, key])

  // you throw something at her card: a word back, and if you keep it up, something back
  const fed = useRef({ count: 0, at: 0 })
  const backTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(backTimer.current), [])
  const onHit = ({ to, mine, item }: { to: string; mine: boolean; item: Item }) => {
    if (to !== 'p1' || !mine) return
    const f = fed.current
    const now = Date.now()
    f.count = Math.max(0, f.count - Math.floor((now - f.at) / HIT_COOL_MS)) + 1
    f.at = now
    const row = Math.ceil(f.count / 2) - 1
    if (row < HITS.length) {
      sayRef.current(pick(HITS[row][item]))
      return
    }
    f.count = 0
    clearTimeout(backTimer.current)
    backTimer.current = setTimeout(() => {
      const item = itemFrom('p1')
      launch('p1', 'p0', item)
      sayRef.current(pick(BACK))
    }, 700)
  }

  // your character comes over to taunt her: she glares, says so, and sometimes pays you a visit back
  const visitedAt = useRef(0)
  const visitTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(visitTimer.current), [])
  const visitYou = (delay: number) => {
    clearTimeout(visitTimer.current)
    visitTimer.current = setTimeout(() => {
      visitedAt.current = Date.now()
      visit('p1', 'p0', Date.now())
    }, delay)
  }
  const onArrive = ({ from, to }: { from: string; to: string }) => {
    if (from !== 'p0' || to !== 'p1') return
    sayRef.current({ face: 'angry', said: 'Go back to your card!', line: 'taunted' })
    if (Math.random() < 0.4) visitYou(TAUNT_BACK_MS)
  }
  const visitRef = useRef(visitYou)
  visitRef.current = visitYou

  // she wins a game: her ultimate charges, and a few seconds later she fires it at you
  const hers = useUlt('p1')?.charged
  useEffect(() => {
    if (!hers) return
    const t = setTimeout(() => unleash('p1', false), 2500 + Math.random() * 2500)
    return () => clearTimeout(t)
  }, [hers])
  // …and fire yours at her, and she has something to say about it once it's over
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const off = onUnleash((from) => {
      if (from !== 'p0') return
      clearTimeout(t)
      t = setTimeout(() => sayRef.current({ face: 'salty', said: 'Not fair!', line: 'ulted' }), 3000)
    })
    return () => {
      off()
      clearTimeout(t)
    }
  }, [])

  // you react, she answers a moment later
  const send = useSend(pop, (k) => {
    clearTimeout(replyTimer.current)
    replyTimer.current = setTimeout(() => {
      const now = stateRef.current
      sayRef.current(reply(k, sense.standing(now) ?? 0, sense.turn(now) === 1))
    }, 900 + Math.random() * 600)
  })

  return (
    <div className="react">
      <ReactionButton onPick={send} />
      <Pops pops={pops} other={BOT_NAME} />
      <ThrowLayer me="p0" onHit={onHit} />
      <TauntLayer me="p0" onArrive={onArrive} />
      <UltLayer me="p0" />
    </div>
  )
}
