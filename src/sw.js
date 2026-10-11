// The offline worker. vite.config.ts fills in VERSION and FILES at build time and serves this as /sw.js.
// Pages: the network first (so a new deploy shows up straight away), the saved app when there's
// no connection. Built files: the saved copy first, since their names change whenever they do.
// The database, sign-in and voice notes go straight to the network, as before.

const CACHE = 'lvs-__VERSION__'
const FONTS = 'lvs-fonts'
const FILES = __FILES__
const PAGE_WAIT_MS = 4000

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') e.respondWith(page(req))
    else e.respondWith(saved(req, CACHE))
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(saved(req, FONTS))
  }
})

/** Every route is the same app (index.html): fetch it, or fall back to the saved one when offline or slow. */
async function page(req) {
  const cache = await caches.open(CACHE)
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put('/', res.clone())
    return res
  })
  net.catch(() => {}) // offline is handled below
  const late = new Promise((r) => setTimeout(r, PAGE_WAIT_MS))
  try {
    const res = await Promise.race([net, late])
    if (res) return res
  } catch {
    // offline: fall through to the saved page
  }
  return (await cache.match('/')) ?? net
}

/** The saved copy if there is one, otherwise fetch it and save it for next time. */
async function saved(req, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(req, { ignoreSearch: name === CACHE })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone())
  return res
}
