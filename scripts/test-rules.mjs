// Checks the deployed Realtime Database rules for matches/ against the live project.
// Signs up three throwaway anonymous users (host, guest, stranger), walks a room through its
// lifecycle, and asserts every allowed / forbidden write. Cleans up the room and the users.
//
//   node scripts/test-rules.mjs
//
// Needs Anonymous sign-in enabled in Firebase Auth.

const API_KEY = 'AIzaSyByYiN4eBZtRSTwaB3H64djW_lXpifVaqY'
const DB = 'https://lash-vs-seven-default-rtdb.firebaseio.com'
const GAME = 'wordhunt'
const CODE = 'QZQZ'
const ROOM = `matches/${GAME}/${CODE}`

async function anon() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  const j = await r.json()
  if (j.error) throw new Error(`anonymous sign-up failed: ${j.error.message}`)
  return { uid: j.localId, token: j.idToken }
}

async function dropUser(u) {
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: u.token }),
  })
}

const SERVER_TS = { '.sv': 'timestamp' }

async function call(user, method, path, body, params = '') {
  const auth = user ? `auth=${user.token}` : ''
  const qs = [auth, params].filter(Boolean).join('&')
  const r = await fetch(`${DB}/${path}.json${qs ? `?${qs}` : ''}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return r.ok
}

let pass = 0
let fail = 0
async function expect(label, allowed, attempt) {
  const ok = await attempt
  const good = ok === allowed
  good ? pass++ : fail++
  console.log(`${good ? 'ok  ' : 'FAIL'}  ${allowed ? 'allow' : 'deny '}  ${label}${good ? '' : `  (got ${ok ? 'allowed' : 'denied'})`}`)
}

const [host, guest, stranger, third] = await Promise.all([anon(), anon(), anon(), anon()])
const H = host.uid
const G = guest.uid
const T = third.uid
const MROOM = `matches/spar/QZQX` // a room for up to three

try {
  await call(host, 'DELETE', ROOM) // leftovers from an aborted run

  // ── create / join ────────────────────────────────────────────────────
  await expect('signed-out visitor reads a room', false, call(null, 'GET', ROOM))
  await expect('stranger creates a room claiming to be someone else', false,
    call(stranger, 'PUT', ROOM, { game: GAME, code: CODE, status: 'waiting', hostId: H, createdAt: SERVER_TS, seats: { s0: H } }))
  await expect('host creates the room', true,
    call(host, 'PUT', ROOM, {
      game: GAME, code: CODE, status: 'waiting', hostId: H, createdAt: SERVER_TS,
      seats: { s0: H }, players: { [H]: { name: 'Lash', seat: 0, online: true, joinedAt: SERVER_TS } },
    }))
  await expect('host adds a junk field to the room', false, call(host, 'PUT', `${ROOM}/junk`, 1))
  await expect('stranger reads the room (has the code)', true, call(stranger, 'GET', ROOM))
  await expect('guest takes the empty seat', true, call(guest, 'PUT', `${ROOM}/seats/s1`, G))
  await expect('stranger steals the taken seat', false, call(stranger, 'PUT', `${ROOM}/seats/s1`, stranger.uid))
  await expect('stranger takes a third seat in a two-seat room', false, call(stranger, 'PUT', `${ROOM}/seats/s2`, stranger.uid))
  await expect('guest writes their own player entry', true,
    call(guest, 'PUT', `${ROOM}/players/${G}`, { name: 'Seven', seat: 1, online: true, joinedAt: SERVER_TS }))
  await expect('stranger adds themselves as a player', false,
    call(stranger, 'PUT', `${ROOM}/players/${stranger.uid}`, { name: 'Sneak', seat: 1, online: true }))
  await expect('guest renames the host', false, call(guest, 'PATCH', `${ROOM}/players/${H}`, { name: 'LOL' }))
  await expect('guest uses a 40-character name', false, call(guest, 'PATCH', `${ROOM}/players/${G}`, { name: 'x'.repeat(40) }))
  await expect('stranger deletes a waiting room', false, call(stranger, 'DELETE', ROOM))
  await expect('guest closes the host\'s waiting room', false, call(guest, 'DELETE', ROOM))

  // ── match ────────────────────────────────────────────────────────────
  await expect('guest starts the match (host only)', false, call(guest, 'PATCH', ROOM, { status: 'playing' }))
  await expect('host starts the match', true,
    call(host, 'PATCH', ROOM, { status: 'playing', startedAt: SERVER_TS, state: { grid: ['A'], round: 1 } }))
  await expect('guest records their own words', true, call(guest, 'PUT', `${ROOM}/state/found/${G}`, ['TEA']))
  await expect('guest edits the host\'s words', false, call(guest, 'PUT', `${ROOM}/state/found/${H}`, []))
  await expect('host edits the guest\'s words', false, call(host, 'PUT', `${ROOM}/state/found/${G}`, ['ZZZ']))
  await expect('host "resets" state with fake words for the guest', false,
    call(host, 'PUT', `${ROOM}/state`, { grid: ['B'], round: 2, found: { [G]: ['FAKE'] } }))
  await expect('host deals a clean rematch', true, call(host, 'PUT', `${ROOM}/state`, { grid: ['B'], round: 2 }))
  await expect('guest claims round 1', true, call(guest, 'PUT', `${ROOM}/state/solved/r0`, { by: G, word: 'TEA', at: 1 }))
  await expect('host overwrites the guest\'s round', false, call(host, 'PUT', `${ROOM}/state/solved/r0`, { by: H, word: 'TEA', at: 0 }))
  await expect('host claims a round in the guest\'s name', false, call(host, 'PUT', `${ROOM}/state/solved/r1`, { by: G, word: 'X', at: 1 }))
  await expect('guest sends a reaction', true, call(guest, 'PUT', `${ROOM}/react/${G}`, { k: 'fire', n: 1 }))
  await expect('host sends a reaction as the guest', false, call(host, 'PUT', `${ROOM}/react/${G}`, { k: 'gg', n: 2 }))
  await expect('guest sends a reaction with a junk field', false, call(guest, 'PUT', `${ROOM}/react/${G}`, { k: 'gg', n: 3, x: 1 }))
  await expect('guest sends an essay as a reaction', false, call(guest, 'PUT', `${ROOM}/react/${G}`, { k: 'x'.repeat(40), n: 4 }))
  await expect('stranger sends a reaction', false, call(stranger, 'PUT', `${ROOM}/react/${stranger.uid}`, { k: 'lol', n: 5 }))
  await expect('stranger readies up', false, call(stranger, 'PUT', `${ROOM}/state/ready/${stranger.uid}`, true))
  await expect('stranger ends the match', false, call(stranger, 'PATCH', ROOM, { status: 'abandoned' }))
  await expect('stranger deletes a live match', false, call(stranger, 'DELETE', ROOM))

  // ── leaving ──────────────────────────────────────────────────────────
  await expect('guest leaves → match abandoned', true,
    call(guest, 'PATCH', ROOM, { status: 'abandoned', leftBy: G, endReason: 'left', endedAt: SERVER_TS }))
  await expect('host flips it back to playing', false, call(host, 'PATCH', ROOM, { status: 'playing' }))
  await expect('host rewrites who left', false, call(host, 'PATCH', ROOM, { leftBy: H }))
  await expect('stranger deletes the abandoned room', false, call(stranger, 'DELETE', ROOM))
  await expect('host (a player) deletes the abandoned room', true, call(host, 'DELETE', ROOM))

  // ── listing & stale rooms ────────────────────────────────────────────
  await expect('stranger lists every room', false, call(stranger, 'GET', `matches/${GAME}`))
  await expect('stranger lists rooms with a query', false,
    call(stranger, 'GET', `matches/${GAME}`, undefined, `orderBy="createdAt"&limitToFirst=20`))
  const OLD = `matches/${GAME}/QZQY`
  await call(host, 'PUT', OLD, {
    game: GAME, code: 'QZQY', status: 'waiting', hostId: H, createdAt: Date.now() - 2 * 86400000,
    seats: { s0: H }, players: { [H]: { name: 'Lash', seat: 0, online: false, joinedAt: 1 } },
  })
  await expect('stranger deletes a fresh waiting room', false, call(stranger, 'DELETE', ROOM))
  await expect('anyone cleans up a room over a day old', true, call(stranger, 'DELETE', OLD))

  // ── more than two: seats, carrying on after someone leaves, host handover ──
  await call(host, 'DELETE', MROOM)
  await expect('host creates a room with a silly seat count', false,
    call(host, 'PUT', MROOM, { game: 'spar', code: 'QZQX', status: 'waiting', hostId: H, createdAt: SERVER_TS, seatCount: 9, seats: { s0: H } }))
  await expect('host creates a room for three', true,
    call(host, 'PUT', MROOM, {
      game: 'spar', code: 'QZQX', status: 'waiting', hostId: H, createdAt: SERVER_TS, seatCount: 3,
      seats: { s0: H }, players: { [H]: { name: 'Lash', seat: 0, online: true, joinedAt: SERVER_TS } },
    }))
  await expect('guest takes seat 1', true, call(guest, 'PUT', `${MROOM}/seats/s1`, G))
  await expect('guest grabs seat 2 as well', false, call(guest, 'PUT', `${MROOM}/seats/s2`, G))
  await expect('third player takes seat 2', true, call(third, 'PUT', `${MROOM}/seats/s2`, T))
  await expect('stranger takes a fourth seat in a room for three', false, call(stranger, 'PUT', `${MROOM}/seats/s3`, stranger.uid))
  await expect('guest joins as a player', true, call(guest, 'PUT', `${MROOM}/players/${G}`, { name: 'Seven', seat: 1, online: true, joinedAt: SERVER_TS }))
  await expect('third joins claiming seat 1', false, call(third, 'PUT', `${MROOM}/players/${T}`, { name: 'Esi', seat: 1, online: true, joinedAt: SERVER_TS }))
  await expect('third joins as a player in seat 2', true, call(third, 'PUT', `${MROOM}/players/${T}`, { name: 'Esi', seat: 2, online: true, joinedAt: SERVER_TS }))
  await expect('someone marks a player out before the match', false, call(guest, 'PUT', `${MROOM}/out/${T}`, 'left'))
  await expect('host starts the match', true, call(host, 'PATCH', MROOM, { status: 'playing', startedAt: SERVER_TS, state: { live: { n: 1 } } }))
  await expect('host changes the seat count mid-match', false, call(host, 'PUT', `${MROOM}/seatCount`, 4))
  await expect('third player makes a move', true, call(third, 'PUT', `${MROOM}/state/live`, { n: 2 }))
  await expect('stranger marks someone out', false, call(stranger, 'PUT', `${MROOM}/out/${T}`, 'left'))
  await expect('guest takes over hosting while the host is in', false, call(guest, 'PUT', `${MROOM}/hostId`, G))
  await expect('host leaves; the match carries on', true, call(host, 'PATCH', MROOM, { [`out/${H}`]: 'left', [`players/${H}/online`]: false }))
  await expect('someone un-leaves the host', false, call(guest, 'PUT', `${MROOM}/out/${H}`, 'dropped'))
  await expect('out with a made-up reason', false, call(guest, 'PUT', `${MROOM}/out/${T}`, 'bored'))
  await expect('guest makes the third player the host', false, call(guest, 'PUT', `${MROOM}/hostId`, T))
  await expect('guest takes over hosting once the host is out', true, call(guest, 'PUT', `${MROOM}/hostId`, G))
  await expect('new host deals a rematch', true, call(guest, 'PATCH', MROOM, { status: 'playing', startedAt: SERVER_TS, state: { live: { n: 0 } } }))
  await expect('old host takes hosting back', false, call(host, 'PUT', `${MROOM}/hostId`, H))
  await expect('third drops out; the last one ends it', true, call(guest, 'PUT', `${MROOM}/out/${T}`, 'dropped'))
  await expect('guest ends the match', true, call(guest, 'PATCH', MROOM, { status: 'abandoned', leftBy: T, endReason: 'disconnected', endedAt: SERVER_TS }))
  await expect('a player deletes the abandoned room', true, call(third, 'DELETE', MROOM))
} finally {
  await call(host, 'DELETE', ROOM).catch(() => {})
  await call(host, 'DELETE', `matches/${GAME}/QZQY`).catch(() => {})
  await call(host, 'DELETE', MROOM).catch(() => {})
  await Promise.all([host, guest, stranger, third].map(dropUser))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
