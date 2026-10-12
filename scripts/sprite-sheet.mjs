// Cuts a ChatGPT pose sheet (art/<game>-chatgpt/sheet.png, already see-through) into a game's sprite
// atlas: every pose in an equal cell with its ground shadow at the same spot, plus a copy with the one
// colour on the figure (the bat, the shorts) turned seat 2's blue.
//   node scripts/sprite-sheet.mjs pong
//   node scripts/sprite-sheet.mjs ampe
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'

/** seat 2's blue (#2d5bff), as a hue */
const BLUE_HUE = 227

const SHEETS = {
  pong: {
    src: 'art/pingpong-chatgpt/sheet.png',
    out: 'src/games/pong/sprites/player.png',
    blue: 'src/games/pong/sprites/player-blue.png',
    cols: 6,
    // the sheet's rows aren't evenly spaced: the bands each row of poses sits in
    rows: [[0, 225], [225, 430], [430, 628], [628, 840], [840, 1024]],
    /** output cell, and where the middle of the shadow goes in it */
    cell: { w: 256, h: 224 },
    foot: { x: 128, y: 210 },
    /** poses that reach far to one side: their shadow sits off centre so the whole pose fits (row,col → x) */
    footX: { '1,4': 104 },
  },
  ampe: {
    src: 'art/ampe-chatgpt/sheet.png',
    out: 'src/games/ampe/sprites/player.png',
    blue: 'src/games/ampe/sprites/player-blue.png',
    cols: 6,
    rows: [[0, 300], [300, 528], [528, 752], [752, 1024]],
    cell: { w: 256, h: 256 },
    foot: { x: 128, y: 242 },
    footX: {},
  },
}

function decode(buf) {
  let p = 8
  let w = 0, h = 0, type = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const kind = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      if (data[8] !== 8 || data[12] !== 0) throw new Error('need 8-bit, non-interlaced')
      type = data[9]
    } else if (kind === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const bpp = { 2: 3, 6: 4 }[type]
  if (!bpp) throw new Error(`colour type ${type}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const px = Buffer.alloc(w * h * 4)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0
      line[i] = (line[i] + pred) & 255
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      line.copy(px, o, x * bpp, x * bpp + 3)
      px[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255
    }
    prev = line
  }
  return { w, h, px }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (b) => {
  let c = 0xffffffff
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(kind, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(kind, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
function encode(w, h, px) {
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function toBlue(r, g, b) {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255
  const l = (mx + mn) / 2
  const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1))
  if (s < 0.3) return [r, g, b]
  const c = (1 - Math.abs(2 * l - 1)) * s
  const h = BLUE_HUE / 60
  const x = c * (1 - Math.abs((h % 2) - 1))
  const [r1, g1, b1] = h < 4 ? [0, x, c] : [x, 0, c]
  const m = l - c / 2
  return [r1, g1, b1].map((v) => Math.round((v + m) * 255))
}

function cut(cfg) {
  const src = decode(readFileSync(cfg.src))
  const at = (x, y) => (y * src.w + x) * 4
  const pixel = (o) => [...src.px.subarray(o, o + 4)]
  /** the ground shadow: half see-through grey (the lines are dark and solid, the body solid white) */
  const isShadow = (o) => {
    const [r, g, b, a] = src.px.subarray(o, o + 4)
    return a > 40 && a < 170 && r > 60 && Math.max(r, g, b) - Math.min(r, g, b) < 14
  }
  const { w: CW, h: CH } = cfg.cell
  const colW = src.w / cfg.cols
  const W = CW * cfg.cols
  const H = CH * cfg.rows.length
  const out = Buffer.alloc(W * H * 4)
  const report = []
  cfg.rows.forEach(([y0, y1], row) => {
    for (let col = 0; col < cfg.cols; col++) {
      const x0 = Math.round(col * colW)
      const x1 = Math.round((col + 1) * colW)
      // the shadow: the lowest band of grey in the cell
      let sx0 = 1e9, sx1 = -1, sy0 = 1e9, sy1 = -1
      for (let y = y1 - 1; y >= y0; y--)
        for (let x = x0; x < x1; x++)
          if (isShadow(at(x, y)) && (sy1 < 0 || y > sy1 - 26)) {
            sx0 = Math.min(sx0, x); sx1 = Math.max(sx1, x)
            sy0 = Math.min(sy0, y); sy1 = Math.max(sy1, y)
          }
      const cx = Math.round((sx0 + sx1) / 2)
      const cy = Math.round((sy0 + sy1) / 2)
      const dx = col * CW + (cfg.footX[`${row},${col}`] ?? cfg.foot.x) - cx
      const dy = row * CH + cfg.foot.y - cy
      let clipped = 0
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const px = pixel(at(x, y))
          if (px[3] < 8) continue
          const tx = x + dx, ty = y + dy
          if (tx < col * CW || tx >= (col + 1) * CW || ty < row * CH || ty >= (row + 1) * CH) {
            clipped++
            continue
          }
          Buffer.from(px).copy(out, (ty * W + tx) * 4)
        }
      report.push(`${row},${col}: shadow ${sx1 - sx0}×${sy1 - sy0} at ${cx},${cy}${clipped ? ` · ${clipped} px clipped` : ''}`)
    }
  })
  writeFileSync(cfg.out, encode(W, H, out))
  // the bat or shorts are the only coloured things: turn them blue, keeping how light they are
  const blue = Buffer.from(out)
  for (let o = 0; o < blue.length; o += 4) if (blue[o + 3]) blue.set(toBlue(blue[o], blue[o + 1], blue[o + 2]), o)
  writeFileSync(cfg.blue, encode(W, H, blue))
  console.log(report.join('\n'))
  console.log(`${cfg.out}: ${W}×${H}`)
}

const which = process.argv[2]
if (!SHEETS[which]) {
  console.error(`which sheet? ${Object.keys(SHEETS).join(' | ')}`)
  process.exit(1)
}
cut(SHEETS[which])
