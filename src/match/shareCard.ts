// Draws the shareable result card (1080×1350, portrait — fits WhatsApp status / Instagram)
// on a canvas in the player's browser. No server involved.

export type Seat01 = 0 | 1

export interface CardPlayer {
  name: string
  seat: Seat01
  /** the big number on their card (points, rounds, games…) */
  score: string
  /** small caption under the score */
  meta: string
}

export type CardDetail =
  /** Word Hunt: the 4×4 board with one word's path lit up, plus a few stats on the right */
  | { kind: 'grid'; letters: string[]; path: number[]; word: string; points: string; stats: [string, string][] }
  /** Anagram Race: one row per round */
  | { kind: 'rounds'; rows: { word: string; seat: Seat01 | null; note: string }[] }
  /** Tic-Tac-Toe: the deciding board and its strike, plus stats */
  | { kind: 'ttt'; board: string; line?: number[]; stats: [string, string][] }
  /** Connect Four: the deciding 7×6 board with the winning four struck through, plus stats */
  | { kind: 'c4'; board: string; line?: number[]; stats: [string, string][] }
  /** Checkers: the final board (kings crowned), the last square moved to marked, plus stats */
  | { kind: 'checkers'; board: string; last?: number; stats: [string, string][] }
  /** Sudoku: the solved grid, clues in ink and the rest in the winner's colour, plus stats */
  | { kind: 'sudoku'; puzzle: string; solution: string; seat: Seat01; stats: [string, string][] }
  /** Othello: the final board, with the last square played marked, plus stats */
  | { kind: 'othello'; board: string; last?: number; stats: [string, string][] }
  /** Dots & Boxes: the final board with every box in its owner's colour, plus stats */
  | { kind: 'dots'; size: number; lines: string; boxes: string; initials: [string, string]; stats: [string, string][] }

export interface CardInput {
  game: string
  /** index into players, or -1 for a draw */
  winner: number
  players: [CardPlayer, CardPlayer]
  /** e.g. "2 — 1" */
  scoreLine: string
  /** the line under the winner's name, when "WINS 2 — 1" doesn't fit the game (e.g. "SOLVED IN 6:42") */
  headline?: string
  detail: CardDetail
  /** shown in the footer, e.g. "lash-vs-seven.web.app/wordhunt" */
  link: string
}

const W = 1080
const H = 1350
const M = 72 // outer margin

const C = {
  paper: '#f3ead8',
  paper2: '#e8dcc2',
  slot: '#fbf7ee',
  ink: '#121016',
  soft: '#3b3742',
  dim: '#6f6a7a',
  hit: '#ffd23f',
  hitDeep: '#f5b800',
  lash: '#ff5a1f',
  seven: '#2d5bff',
  board: '#17151c',
  tileEdge: '#cbbd9f',
}
const SEAT = [C.lash, C.seven]
const DISPLAY = '"Bowlby One", "Arial Black", Impact, sans-serif'
const MONO = '"DM Mono", ui-monospace, Menlo, monospace'

type Ctx = CanvasRenderingContext2D

/* ── primitives ────────────────────────────────────────────────────────── */

/** A flat box with the site's hard offset shadow and ink border. */
function block(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, shadow = 10, border = 5) {
  if (shadow) {
    ctx.fillStyle = C.ink
    ctx.fillRect(x + shadow, y + shadow, w, h)
  }
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
  if (border) {
    ctx.lineWidth = border
    ctx.strokeStyle = C.ink
    ctx.strokeRect(x + border / 2, y + border / 2, w - border, h - border)
  }
}

function font(size: number, family = DISPLAY, weight = 400) {
  return `${weight} ${size}px ${family}`
}

/** Largest font size (≤ max) at which `text` fits in `width`. */
function fit(ctx: Ctx, text: string, width: number, max: number, family = DISPLAY, weight = 400) {
  let size = max
  ctx.font = font(size, family, weight)
  while (size > 12 && ctx.measureText(text).width > width) {
    size -= 2
    ctx.font = font(size, family, weight)
  }
  return size
}

function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, opts: { family?: string; weight?: number; align?: CanvasTextAlign; spacing?: number } = {}) {
  ctx.font = font(size, opts.family ?? DISPLAY, opts.weight ?? 400)
  ctx.fillStyle = color
  ctx.textAlign = opts.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  ;(ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${opts.spacing ?? 0}px`
  ctx.fillText(s, x, y)
  ;(ctx as Ctx & { letterSpacing?: string }).letterSpacing = '0px'
}

function ellipsize(ctx: Ctx, s: string, width: number) {
  if (ctx.measureText(s).width <= width) return s
  let t = s
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1)
  return `${t}…`
}

/** A letter tile like the game boards: paper face, darker bottom edge, lit top edge. */
function tile(ctx: Ctx, x: number, y: number, size: number, lit: boolean) {
  const edge = Math.max(4, size * 0.08)
  ctx.fillStyle = lit ? C.hit : C.slot
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = lit ? C.hitDeep : C.tileEdge
  ctx.fillRect(x, y + size - edge, size, edge)
}
function tileLetter(ctx: Ctx, x: number, y: number, size: number, letter: string) {
  text(ctx, letter, x + size / 2, y + size * 0.7, size * 0.52, C.ink, { align: 'center' })
}

function avatar(ctx: Ctx, cx: number, cy: number, r: number, name: string, seat: Seat01) {
  ctx.fillStyle = C.ink
  ctx.beginPath()
  ctx.arc(cx + 5, cy + 5, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = SEAT[seat]
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = C.ink
  ctx.stroke()
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  text(ctx, initials || '?', cx, cy + r * 0.36, r * 0.95, C.paper, { align: 'center' })
}

function stamp(ctx: Ctx, label: string, x: number, y: number, size: number, bg: string, fg: string, angle: number) {
  ctx.save()
  ctx.font = font(size)
  const w = ctx.measureText(label).width + size * 0.9
  const h = size * 1.45
  ctx.translate(x, y)
  ctx.rotate(angle)
  block(ctx, -w / 2, -h / 2, w, h, bg, 0, 4)
  text(ctx, label, 0, h * 0.2, size, fg, { align: 'center' })
  ctx.restore()
}

/* ── card ──────────────────────────────────────────────────────────────── */

export async function drawShareCard(input: CardInput): Promise<Blob> {
  // the card uses the site's webfonts — make sure they're ready before drawing
  await Promise.all([
    document.fonts.load(font(100)),
    document.fonts.load(font(30, MONO, 500)),
    document.fonts.load(font(30, MONO, 400)),
  ]).catch(() => {})

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // paper + dot grain
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(18,16,22,0.09)'
  for (let y = 9; y < H; y += 22) for (let x = 9; x < W; x += 22) ctx.fillRect(x, y, 3, 3)

  // header: logo + game stamp
  block(ctx, M, M, 72, 72, C.hit, 7, 4)
  text(ctx, 'VS', M + 36, M + 49, 28, C.ink, { align: 'center' })
  text(ctx, 'LASH VS', M + 96, M + 32, 30, C.ink)
  text(ctx, 'SEVEN', M + 96, M + 66, 30, C.ink)
  stamp(ctx, input.game.toUpperCase(), W - M - 150, M + 38, 34, C.ink, C.paper, -0.04)

  // headline: the winner's name on a yellow sticker, then the score
  const draw = input.winner < 0
  const winnerName = draw ? 'DRAW' : input.players[input.winner].name.toUpperCase()
  text(ctx, draw ? 'NOBODY BLINKED' : 'MATCH RESULT', W / 2, 262, 26, C.soft, { family: MONO, weight: 500, align: 'center', spacing: 5 })
  const headSize = fit(ctx, winnerName, W - 2 * M - 80, 150)
  ctx.font = font(headSize)
  const nameW = Math.min(ctx.measureText(winnerName).width, W - 2 * M - 80)
  ctx.save()
  ctx.translate(W / 2, 372)
  ctx.rotate(-0.025)
  block(ctx, -nameW / 2 - 34, -headSize * 0.62, nameW + 68, headSize * 1.14, draw ? C.slot : C.hit, 12, 6)
  text(ctx, winnerName, 0, headSize * 0.33, headSize, C.ink, { align: 'center' })
  ctx.restore()
  text(ctx, input.headline ?? (draw ? input.scoreLine : `WINS ${input.scoreLine}`), W / 2, 548, 64, C.ink, { align: 'center' })

  // player cards
  const cardY = 610
  const cardH = 210
  const cardW = (W - 2 * M - 48) / 2
  input.players.forEach((p, i) => {
    const x = M + i * (cardW + 48)
    const won = input.winner === i
    block(ctx, x, cardY, cardW, cardH, won ? '#fff6d6' : C.slot, 10, 5)
    ctx.fillStyle = SEAT[p.seat]
    ctx.fillRect(x + 5, cardY + 5, cardW - 10, 16)
    avatar(ctx, x + 70, cardY + 112, 44, p.name, p.seat)
    ctx.font = font(34)
    text(ctx, ellipsize(ctx, p.name.toUpperCase(), cardW - 150), x + 132, cardY + 88, 34, C.ink)
    text(ctx, p.score, x + 132, cardY + 160, 64, C.ink)
    text(ctx, p.meta.toUpperCase(), x + 132, cardY + 192, 20, C.dim, { family: MONO, weight: 500, spacing: 2 })
    if (won) stamp(ctx, 'WINNER', x + cardW - 70, cardY + 4, 22, C.ink, C.hit, 0.06)
  })

  // game highlight panel
  const px = M
  const py = 880
  const pw = W - 2 * M
  const ph = 300
  block(ctx, px, py, pw, ph, C.board, 12, 0)
  drawDetail(ctx, input.detail, px, py, pw, ph, input.players)

  // footer
  text(ctx, 'THINK YOU CAN BEAT ME?', M, 1262, 40, C.ink)
  text(ctx, input.link, M, 1302, 26, C.soft, { family: MONO, weight: 500 })
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  text(ctx, date.toUpperCase(), W - M, 1302, 22, C.dim, { family: MONO, weight: 500, align: 'right', spacing: 2 })

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
}

function drawDetail(ctx: Ctx, d: CardDetail, x: number, y: number, w: number, h: number, players: [CardPlayer, CardPlayer]) {
  const pad = 34
  if (d.kind === 'grid') {
    const size = 54
    const gap = 9
    const gx = x + pad
    const gy = y + (h - (size * 4 + gap * 3)) / 2
    const at = (i: number) => [gx + (i % 4) * (size + gap), gy + Math.floor(i / 4) * (size + gap)]
    d.letters.forEach((_, i) => tile(ctx, at(i)[0], at(i)[1], size, d.path.includes(i)))
    // the word's path runs between the tile faces and the letters, so every letter stays readable
    if (d.path.length > 1) {
      ctx.strokeStyle = C.lash
      ctx.lineWidth = 8
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      d.path.forEach((i, k) => {
        const cx = gx + (i % 4) * (size + gap) + size / 2
        const cy = gy + Math.floor(i / 4) * (size + gap) + size / 2
        if (k === 0) ctx.moveTo(cx, cy)
        else ctx.lineTo(cx, cy)
      })
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    d.letters.forEach((l, i) => tileLetter(ctx, at(i)[0], at(i)[1], size, l))
    const rx = gx + size * 4 + gap * 3 + 56
    text(ctx, 'BEST WORD', rx, y + 74, 22, C.paper2, { family: MONO, weight: 500, spacing: 4 })
    const ws = fit(ctx, d.word, x + w - pad - rx - 150, 70)
    text(ctx, d.word, rx, y + 74 + ws + 6, ws, C.hit)
    ctx.font = font(ws)
    const wordW = ctx.measureText(d.word).width
    text(ctx, d.points, rx + wordW + 20, y + 74 + ws, 30, C.paper, { family: MONO, weight: 500 })
    statRow(ctx, d.stats, rx, y + h - 96, 250)
    return
  }
  if (d.kind === 'rounds') {
    const rowH = (h - pad * 2) / Math.max(5, d.rows.length)
    d.rows.forEach((r, i) => {
      const ry = y + pad + i * rowH
      text(ctx, String(i + 1), x + pad, ry + rowH * 0.7, 26, C.dim, { family: MONO, weight: 500 })
      text(ctx, r.word, x + pad + 54, ry + rowH * 0.72, 34, C.paper, { spacing: 2 })
      const who = r.seat === null ? 'NOBODY' : players[r.seat].name.toUpperCase()
      ctx.font = font(22, MONO, 500)
      const label = ellipsize(ctx, `${who} · ${r.note}`, 330)
      const lw = ctx.measureText(label).width + 28
      const bx = x + w - pad - lw
      ctx.fillStyle = r.seat === null ? '#2f2b38' : SEAT[r.seat]
      ctx.fillRect(bx, ry + rowH * 0.18, lw, rowH * 0.64)
      text(ctx, label, bx + 14, ry + rowH * 0.6, 22, r.seat === null ? C.dim : C.paper, { family: MONO, weight: 500 })
    })
    return
  }
  if (d.kind === 'checkers') {
    drawCheckers(ctx, d, x, y, h, pad)
    return
  }
  if (d.kind === 'sudoku') {
    drawSudoku(ctx, d, x, y, h, pad)
    return
  }
  if (d.kind === 'othello') {
    drawOthello(ctx, d, x, y, h, pad)
    return
  }
  if (d.kind === 'dots') {
    drawDots(ctx, d, x, y, h, pad)
    return
  }
  if (d.kind === 'c4') {
    drawC4(ctx, d, x, y, h, pad)
    return
  }
  // ttt
  const size = 70
  const gap = 10
  const gx = x + pad + 8
  const gy = y + (h - (size * 3 + gap * 2)) / 2
  for (let i = 0; i < 9; i++) {
    const cx = gx + (i % 3) * (size + gap)
    const cy = gy + Math.floor(i / 3) * (size + gap)
    const lit = !!d.line?.includes(i)
    tile(ctx, cx, cy, size, lit)
    const v = d.board[i]
    if (v === '.') continue
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.strokeStyle = SEAT[Number(v)]
    ctx.globalAlpha = d.line && !lit ? 0.35 : 1
    ctx.beginPath()
    if (v === '0') {
      ctx.moveTo(cx + 18, cy + 18)
      ctx.lineTo(cx + size - 18, cy + size - 18)
      ctx.moveTo(cx + size - 18, cy + 18)
      ctx.lineTo(cx + 18, cy + size - 18)
    } else {
      ctx.arc(cx + size / 2, cy + size / 2, size * 0.27, 0, Math.PI * 2)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (d.line) {
    const centre = (i: number) => [gx + (i % 3) * (size + gap) + size / 2, gy + Math.floor(i / 3) * (size + gap) + size / 2]
    const [x1, y1] = centre(d.line[0])
    const [x2, y2] = centre(d.line[2])
    const len = Math.hypot(x2 - x1, y2 - y1)
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 11
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1 - ux * 24, y1 - uy * 24)
    ctx.lineTo(x2 + ux * 24, y2 + uy * 24)
    ctx.stroke()
  }
  statLines(ctx, d.stats, gx + size * 3 + gap * 2 + 64, y + 86)
}

/** The part of a circle not covered by the same circle shifted by dy: a crescent, for shading. */
function crescent(ctx: Ctx, cx: number, cy: number, r: number, dy: number, colour: string) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.arc(cx, cy + dy, r, 0, Math.PI * 2)
  ctx.fillStyle = colour
  ctx.fill('evenodd')
  ctx.restore()
}

/** A game disc like the in-game ones: flat colour, a highlight on top, a shade underneath (rim drawn by the caller). */
function disc(ctx: Ctx, cx: number, cy: number, r: number, colour: string) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = colour
  ctx.fill()
  crescent(ctx, cx, cy, r, 3, 'rgba(255, 255, 255, .35)')
  crescent(ctx, cx, cy, r, -4, 'rgba(18, 16, 22, .2)')
}

/** Connect Four, drawn like the in-game board. */
function drawC4(ctx: Ctx, d: Extract<CardDetail, { kind: 'c4' }>, x: number, y: number, h: number, pad: number) {
  // framed board, recessed paper holes, rimmed discs, yellow-rimmed winners
  const cell = 38
  const gap = 6
  const inset = 12
  const bw = cell * 7 + gap * 6 + inset * 2
  const bh = cell * 6 + gap * 5 + inset * 2
  const bx = x + pad
  const by = y + (h - bh) / 2
  ctx.fillStyle = '#211e28'
  ctx.fillRect(bx, by, bw, bh)
  ctx.strokeStyle = '#2b2833'
  ctx.lineWidth = 3
  ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3)

  const centre = (i: number) => [
    bx + inset + (i % 7) * (cell + gap) + cell / 2,
    by + inset + Math.floor(i / 7) * (cell + gap) + cell / 2,
  ]
  const r = cell / 2
  const dr = cell * 0.44
  for (let i = 0; i < 42; i++) {
    const [cx, cy] = centre(i)
    const v = d.board[i]
    const win = !!d.line?.includes(i)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = win ? C.hit : C.paper2
    ctx.fill()
    if (!win) crescent(ctx, cx, cy, r, 3, 'rgba(18, 16, 22, .28)')
    if (v === '.') continue
    disc(ctx, cx, cy, dr, SEAT[Number(v)])
    ctx.beginPath()
    if (win) {
      ctx.arc(cx, cy, dr - 1, 0, Math.PI * 2)
      ctx.strokeStyle = C.hit
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, dr + 2, 0, Math.PI * 2)
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 2
    } else {
      ctx.arc(cx, cy, dr - 1, 0, Math.PI * 2)
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 2.5
    }
    ctx.stroke()
  }
  if (d.line) {
    const [x1, y1] = centre(d.line[0])
    const [x2, y2] = centre(d.line[d.line.length - 1])
    const len = Math.hypot(x2 - x1, y2 - y1)
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    // same as in the game: a paper line with an ink edge, so it reads over the coloured discs
    ctx.lineCap = 'round'
    for (const [colour, width] of [[C.ink, 11], [C.slot, 5]] as const) {
      ctx.strokeStyle = colour
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(x1 - ux * 13, y1 - uy * 13)
      ctx.lineTo(x2 + ux * 13, y2 + uy * 13)
      ctx.stroke()
    }
  }
  statLines(ctx, d.stats, bx + bw + 56, y + 86)
}

/** Dots & Boxes: the final board drawn like the in-game one — coloured lines, tinted boxes with initials. */
function drawDots(ctx: Ctx, d: Extract<CardDetail, { kind: 'dots' }>, x: number, y: number, h: number, pad: number) {
  const n = d.size
  const frame = 12
  const s = h - 2 * 21 // board side, frame included
  const bx = x + pad
  const by = y + (h - s) / 2
  ctx.fillStyle = '#211e28'
  ctx.fillRect(bx, by, s, s)
  ctx.strokeStyle = '#2b2833'
  ctx.lineWidth = 3
  ctx.strokeRect(bx + 1.5, by + 1.5, s - 3, s - 3)
  const px = bx + frame
  const py = by + frame
  const ps = s - 2 * frame
  ctx.fillStyle = C.paper
  ctx.fillRect(px, py, ps, ps)

  // same proportions as the in-game SVG: 100 units a box, 26 of margin
  const k = ps / (n * 100 + 52)
  const u = 100 * k
  const ox = px + 26 * k
  const oy = py + 26 * k
  const h0 = n * (n + 1)

  // boxes: a light tint of the owner's colour with their initial, like the in-game board
  for (let b = 0; b < n * n; b++) {
    const v = d.boxes[b]
    if (v === '.') continue
    const seat = Number(v)
    const cx = ox + (b % n) * u
    const cy = oy + Math.floor(b / n) * u
    ctx.fillStyle = tint(SEAT[seat], seat === 0 ? 0.24 : 0.22)
    ctx.fillRect(cx, cy, u, u)
    const size = Math.round(44 * k)
    text(ctx, d.initials[seat], cx + u / 2, cy + u / 2 + size * 0.36, size, SEAT[seat], { align: 'center' })
  }

  // every line in the colour of whoever drew it
  ctx.lineWidth = 11 * k
  ctx.lineCap = 'butt'
  for (let i = 0; i < d.lines.length; i++) {
    if (d.lines[i] === '.') continue
    const horizontal = i < h0
    const j = horizontal ? i : i - h0
    const r = horizontal ? Math.floor(j / n) : Math.floor(j / (n + 1))
    const c = horizontal ? j % n : j % (n + 1)
    const x1 = ox + c * u
    const y1 = oy + r * u
    ctx.strokeStyle = SEAT[Number(d.lines[i])]
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(horizontal ? x1 + u : x1, horizontal ? y1 : y1 + u)
    ctx.stroke()
  }

  const dot = 22 * k
  ctx.fillStyle = C.ink
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) ctx.fillRect(ox + c * u - dot / 2, oy + r * u - dot / 2, dot, dot)

  statLines(ctx, d.stats, bx + s + 56, y + 86)
}

/** A seat colour mixed into the paper colour, as CSS color-mix(in srgb, colour amount, paper) does. */
function tint(hex: string, amount: number) {
  const rgb = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
  const a = rgb(hex)
  const p = rgb(C.paper)
  return `rgb(${a.map((v, k) => Math.round(v * amount + p[k] * (1 - amount))).join(', ')})`
}

/** Othello: the final 8×8 board drawn like the in-game one, the last square played in yellow. */
function drawOthello(ctx: Ctx, d: Extract<CardDetail, { kind: 'othello' }>, x: number, y: number, h: number, pad: number) {
  const cell = 30
  const gap = 3
  const inset = 10
  const side = cell * 8 + gap * 7 + inset * 2
  const bx = x + pad
  const by = y + (h - side) / 2
  ctx.fillStyle = '#211e28'
  ctx.fillRect(bx, by, side, side)
  ctx.strokeStyle = '#2b2833'
  ctx.lineWidth = 3
  ctx.strokeRect(bx + 1.5, by + 1.5, side - 3, side - 3)
  for (let i = 0; i < 64; i++) {
    const cx = bx + inset + (i % 8) * (cell + gap)
    const cy = by + inset + Math.floor(i / 8) * (cell + gap)
    const last = i === d.last
    ctx.fillStyle = last ? C.hit : C.paper
    ctx.fillRect(cx, cy, cell, cell)
    ctx.fillStyle = last ? C.hitDeep : C.tileEdge
    ctx.fillRect(cx, cy + cell - 2, cell, 2)
    const v = d.board[i]
    if (v === '.') continue
    const r = cell * 0.42
    disc(ctx, cx + cell / 2, cy + cell / 2, r, SEAT[Number(v)])
    ctx.beginPath()
    ctx.arc(cx + cell / 2, cy + cell / 2, r - 1, 0, Math.PI * 2)
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 2
    ctx.stroke()
  }
  statLines(ctx, d.stats, bx + side + 56, y + 86)
}

/** Sudoku: the solved grid — clues in ink, the squares the winner filled in their colour. */
function drawSudoku(ctx: Ctx, d: Extract<CardDetail, { kind: 'sudoku' }>, x: number, y: number, h: number, pad: number) {
  const cell = 27
  const thin = 2
  const thick = 5
  const frame = 8
  const side = cell * 9 + thin * 6 + thick * 2 + frame * 2
  const bx = x + pad
  const by = y + (h - side) / 2
  ctx.fillStyle = '#211e28'
  ctx.fillRect(bx, by, side, side)
  // position of column/row k, with thicker gaps between the 3×3 boxes
  const at = (k: number) => frame + k * cell + (k - Math.floor(k / 3)) * thin + Math.floor(k / 3) * thick
  for (let i = 0; i < 81; i++) {
    const cx = bx + at(i % 9)
    const cy = by + at(Math.floor(i / 9))
    const given = d.puzzle[i] !== '.'
    ctx.fillStyle = given ? C.paper2 : C.paper
    ctx.fillRect(cx, cy, cell, cell)
    text(ctx, d.solution[i], cx + cell / 2, cy + cell / 2 + 7, 20, given ? C.ink : SEAT[d.seat], { align: 'center' })
  }
  statLines(ctx, d.stats, bx + side + 56, y + 86)
}

/** Checkers: the final board drawn like the in-game one — crowned pieces wear a crown. */
function drawCheckers(ctx: Ctx, d: Extract<CardDetail, { kind: 'checkers' }>, x: number, y: number, h: number, pad: number) {
  const cell = 31
  const frame = 9
  const side = cell * 8 + frame * 2
  const bx = x + pad
  const by = y + (h - side) / 2
  ctx.fillStyle = '#211e28'
  ctx.fillRect(bx, by, side, side)
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8)
    const c = i % 8
    const cx = bx + frame + c * cell
    const cy = by + frame + r * cell
    const dark = (r + c) % 2 === 1
    ctx.fillStyle = i === d.last ? C.hit : dark ? '#3a3542' : C.paper
    ctx.fillRect(cx, cy, cell, cell)
    const v = d.board[i]
    if (v === '.') continue
    const seat = Number(v) % 2
    const king = v === '2' || v === '3'
    const rad = cell * 0.4
    disc(ctx, cx + cell / 2, cy + cell / 2, rad, SEAT[seat])
    ctx.beginPath()
    ctx.arc(cx + cell / 2, cy + cell / 2, rad - 1, 0, Math.PI * 2)
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 2
    ctx.stroke()
    if (king) {
      // the same crown as the board: five points, drawn in paper
      const s = rad * 1.1
      const ox = cx + cell / 2 - s / 2
      const oy = cy + cell / 2 - s / 2
      const pts = [[3, 18], [5, 7], [9.5, 12], [12, 5], [14.5, 12], [19, 7], [21, 18]]
      ctx.beginPath()
      pts.forEach(([px, py], k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, ox + (px / 24) * s, oy + (py / 24) * s))
      ctx.closePath()
      ctx.fillStyle = C.slot
      ctx.fill()
    }
  }
  statLines(ctx, d.stats, bx + side + 56, y + 86)
}

/** Label/value pairs stacked vertically on the dark panel. */
function statLines(ctx: Ctx, stats: [string, string][], x: number, y: number) {
  stats.forEach(([label, value], i) => {
    const sy = y + i * 92
    text(ctx, label.toUpperCase(), x, sy, 20, C.paper2, { family: MONO, weight: 500, spacing: 4 })
    text(ctx, value.toUpperCase(), x, sy + 46, 40, C.paper)
  })
}

/** Label/value pairs side by side, for panels with less height to spare. */
function statRow(ctx: Ctx, stats: [string, string][], x: number, y: number, colW: number) {
  stats.forEach(([label, value], i) => {
    const sx = x + i * colW
    text(ctx, label.toUpperCase(), sx, y, 20, C.paper2, { family: MONO, weight: 500, spacing: 3 })
    text(ctx, value.toUpperCase(), sx, y + 46, 40, C.paper)
  })
}
