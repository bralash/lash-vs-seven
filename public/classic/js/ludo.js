const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Race all four of your tokens from the starting yard to the home triangle before your opponents.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Roll the dice on your turn. A <strong>6</strong> lets you move a token out of the yard onto the board.</li>
    <li>Move any one active token clockwise around the board by the number rolled.</li>
    <li>Rolling a 6 earns a bonus roll.</li>
  </ol>
</div>
<div class="rs">
  <h3>Captures &amp; Safe Squares</h3>
  <p>Landing on an opponent's token sends it back to their yard. Starred squares are <strong>safe zones</strong> — no captures are possible there.</p>
</div>
<div class="rs">
  <h3>Winning</h3>
  <p>Move all four tokens into the home triangle. A token needs an exact roll to enter.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Spread your tokens out — having multiple tokens active makes you harder to block and target.</div>
`;

/* ============================================================
   LUDO — Lash vs Seven
   ============================================================ */

// ─── CONSTANTS ──────────────────────────────────────────────

const CELL = 1000/15; // px per grid cell (SVG is 1000×1000, grid is 15×15)

// 52-square outer track: each entry [col, row], clockwise from Red's exit
const TRACK = [
  [1,6],[2,6],[3,6],[4,6],[5,6],           // 0-4:   left arm upper
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],     // 5-10:  top arm left col (going up)
  [7,0],[8,0],                              // 11-12: top edge
  [8,1],[8,2],[8,3],[8,4],[8,5],           // 13-17: top arm right col (going down)
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],// 18-23: right arm upper
  [14,7],[14,8],                            // 24-25: right edge
  [13,8],[12,8],[11,8],[10,8],[9,8],       // 26-30: right arm lower
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],// 31-36: bottom arm right col
  [7,14],[6,14],                            // 37-38: bottom edge
  [6,13],[6,12],[6,11],[6,10],[6,9],       // 39-43: bottom arm left col
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],     // 44-49: left arm lower
  [0,7],[0,6],                              // 50-51: left edge
];

// Color offsets into TRACK (where each color's exit square lives)
const COLOR_OFFSET = { red: 0, blue: 13, green: 26, yellow: 39 };

// Home columns: 5 squares leading to center finish (token positions 52-56; 57 = finish)
const HOME_COL = {
  red:    [[1,7],[2,7],[3,7],[4,7],[5,7]],
  blue:   [[7,1],[7,2],[7,3],[7,4],[7,5]],
  green:  [[13,7],[12,7],[11,7],[10,7],[9,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]],
};

// Home circle / board marker colors — reduced vibrance
const HOME_COLOR = {
  red:    '#FFAAA9',
  blue:   '#74BAF0',
  green:  '#5DCFB8',
  yellow: '#FDDC98',
};

// Token colors — darker, muted shades
const TOKEN_COLOR = {
  red:    '#C06060',
  blue:   '#3878C0',
  green:  '#2A9880',
  yellow: '#D09428',
};

// Corner home zone top-left pixel origin for each color
// Red=top-left, Blue=top-right, Green=bottom-right, Yellow=bottom-left
const CORNER_ORIGIN = {
  red:    [0, 0],
  blue:   [CELL*9, 0],
  green:  [CELL*9, CELL*9],
  yellow: [0, CELL*9],
};

// Yard spot pixel centers — 2×2 grid centered on each home circle (circle centers: 200,200 / 800,200 / 800,800 / 200,800)
const YARD_POS = {
  red:    [[160,160],[240,160],[160,240],[240,240]],
  blue:   [[760,160],[840,160],[760,240],[840,240]],
  green:  [[760,760],[840,760],[760,840],[840,840]],
  yellow: [[160,760],[240,760],[160,840],[240,840]],
};

// Finished token offsets in center per color
const FINISH_OFFSET = {
  red:    [-33,-33],
  blue:   [ 33,-33],
  green:  [ 33, 33],
  yellow: [-33, 33],
};

// Which colors belong to each player (set on game start)
let PLAYER_COLORS = [['yellow'], ['blue']];

// Die pip configuration for faces 1-6
// Pip slots: a=top-left, b=top-right, c=mid-left, d=center, e=mid-right, f=bot-left, g=bot-right
const DIE_PIPS = {
  1: ['d'],
  2: ['a','g'],
  3: ['a','d','g'],
  4: ['a','b','f','g'],
  5: ['a','b','d','f','g'],
  6: ['a','b','c','e','f','g'],
};

// Diagonal opposite pairs (the two valid quick-mode pairings)
const OPPOSITE_COLOR = { red:'green', green:'red', blue:'yellow', yellow:'blue' };

// ─── MODULE STATE ────────────────────────────────────────────

let mode      = 'local';    // 'local' | 'online'
let gameMode  = 'quick';    // 'quick' | 'full'
let myIdx     = 0;
let isHost    = false;
let roomRef   = null;
let roomCode  = null;
let names     = ['Player 1', 'Player 2'];
let animating = false;
let selectedOnlineMode = 'quick';
let selectedToken = null; // { color, idx } — awaiting forward/back choice
let p1Color   = 'yellow';   // local P1 color (P2 auto-gets opposite)
let hostColor = 'yellow';   // online host's chosen color

// Game state
let tokens  = {};        // { red:[pos,pos,pos,pos], blue:..., green:..., yellow:... }
let current = 0;         // whose turn: 0 or 1
let winner  = -1;        // -1 = playing, 0 = P0, 1 = P1
let diceVal = 0;         // current die value (0 = not yet rolled)
let rolled  = false;     // has current player rolled this turn?
let bonusRolls = 0;      // pending bonus rolls

// ─── UI HELPERS ──────────────────────────────────────────────

function setMsg(text) {
  const el = document.getElementById('game-msg');
  if (el) el.textContent = text;
}

function setOnlineMsg(text, err) {
  const el = document.getElementById('online-msg');
  if (!el) return;
  el.textContent = text;
  el.className   = 'form-msg' + (err ? ' error' : '');
}

function setDieMsg(text) {
  const el = document.getElementById('die-msg');
  if (el) el.textContent = text;
}

function updateTurnUI() {
  const dot   = document.getElementById('turn-dot');
  const label = document.getElementById('turn-label');
  if (!dot || !label || winner !== -1) return;
  const colors = PLAYER_COLORS[current];
  dot.style.background = TOKEN_COLOR[colors[0]];
  const isMyTurn = mode === 'local' || current === myIdx;
  label.textContent = isMyTurn
    ? (mode === 'local' ? names[current] + "'s Turn" : 'Your Turn')
    : names[current] + "'s Turn";
}

function updateScoreUI() {
  for (let p = 0; p < 2; p++) {
    const colors = PLAYER_COLORS[p];
    const total  = colors.length * 4;
    const home   = colors.reduce((sum, c) =>
      sum + tokens[c].filter(pos => pos === 57).length, 0);
    const el = document.getElementById('score-home-' + p);
    if (el) el.textContent = home + '/' + total;
    // Update swatch
    const swatch = document.getElementById('swatch-' + p);
    if (swatch) {
      swatch.innerHTML = colors.map(c =>
        `<div class="score-dot ${c}"></div>`
      ).join('');
    }
  }
}

// ─── MODE SELECTION ──────────────────────────────────────────

function setMode(m) {
  gameMode = m;
  document.getElementById('mode-quick').classList.toggle('active', m === 'quick');
  document.getElementById('mode-full').classList.toggle('active', m === 'full');
  const hint = document.getElementById('mode-hint');
  if (hint) hint.textContent = m === 'quick'
    ? '4 tokens each · ~20 min'
    : '8 tokens each · ~40 min';
  // Show inline color picker only in quick mode
  const icp = document.getElementById('local-inline-cp');
  if (icp) icp.style.display = m === 'quick' ? '' : 'none';
}

function setOnlineMode(m) {
  selectedOnlineMode = m;
  document.getElementById('online-mode-quick').classList.toggle('active', m === 'quick');
  document.getElementById('online-mode-full').classList.toggle('active', m === 'full');
  const icp = document.getElementById('online-inline-cp');
  const res = document.getElementById('online-cp-result');
  if (icp) icp.style.display = m === 'quick' ? '' : 'none';
  if (res) res.style.display = m === 'quick' ? '' : 'none';
}

// ─── COLOR PICKER ────────────────────────────────────────────

function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function _updateIcpGrid(icpId, chosenColor) {
  const opp = OPPOSITE_COLOR[chosenColor];
  document.querySelectorAll('#' + icpId + ' .icp-btn').forEach(btn => {
    btn.classList.remove('icp-active', 'icp-opp');
    if (btn.dataset.color === chosenColor) btn.classList.add('icp-active');
    else if (btn.dataset.color === opp) btn.classList.add('icp-opp');
  });
}

function pickColor(c) {
  p1Color = c;
  const opp = OPPOSITE_COLOR[c];
  _updateIcpGrid('local-inline-cp', c);
  // Update P2 label to show auto-assigned opposite color
  const dot2 = document.getElementById('cp-dot-p2');
  const lbl2 = document.getElementById('cp-p2-label');
  if (dot2) dot2.className = 'cp-dot-sm ' + opp;
  if (lbl2) lbl2.textContent = capFirst(opp);
}

function pickOnlineColor(c) {
  hostColor = c;
  const opp = OPPOSITE_COLOR[c];
  _updateIcpGrid('online-inline-cp', c);
  const dot = document.getElementById('online-cp-dot');
  if (dot) dot.className = 'cp-dot-sm ' + c;
  const lbl = document.getElementById('online-cp-label');
  const oppLbl = document.getElementById('online-cp-opp');
  if (lbl) lbl.textContent = capFirst(c);
  if (oppLbl) oppLbl.textContent = capFirst(opp);
}

// ─── SVG BOARD ───────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function drawBoard() {
  const svg = document.getElementById('ludo-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const S  = CELL;
  const SZ = S * 15;

  const activeColors = PLAYER_COLORS.flat();

  // ── 0. Defs — token inset shadow gradient + drop shadow filter ──
  const defs = svgEl('defs');

  const shadowGrad = svgEl('linearGradient', {
    id: 'token-inset-shadow', x1: '0', y1: '0', x2: '0', y2: '1',
    gradientUnits: 'objectBoundingBox',
  });
  const _gs1 = svgEl('stop', { offset: '60%', 'stop-color': '#000000', 'stop-opacity': '0' });
  const _gs2 = svgEl('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '0.25' });
  shadowGrad.appendChild(_gs1); shadowGrad.appendChild(_gs2);
  defs.appendChild(shadowGrad);

  const dropShadowFilter = svgEl('filter', {
    id: 'token-drop-shadow', x: '-30%', y: '-30%', width: '160%', height: '185%',
  });
  dropShadowFilter.appendChild(svgEl('feDropShadow', {
    dx: 0, dy: 5, stdDeviation: 4, 'flood-color': '#000000', 'flood-opacity': 0.28,
  }));
  defs.appendChild(dropShadowFilter);

  // Specular highlight — upper-left radial glow, fades to transparent
  const hlGrad = svgEl('radialGradient', {
    id: 'token-highlight',
    cx: '38%', cy: '28%', r: '60%',
    gradientUnits: 'objectBoundingBox',
  });
  hlGrad.appendChild(svgEl('stop', { offset: '0%',   'stop-color': '#ffffff', 'stop-opacity': '0.42' }));
  hlGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': '0' }));
  defs.appendChild(hlGrad);

  svg.appendChild(defs);

  // ── 1. Board background ──
  svg.appendChild(svgEl('rect', { width: 1000, height: 1000, fill: '#1e272e' }));

  // ── 2. Corner home areas ──
  for (const color of ['red', 'green', 'blue', 'yellow']) {
    const [ox, oy] = CORNER_ORIGIN[color];
    const isActive = activeColors.includes(color);
    const fillC = isActive ? HOME_COLOR[color] : '#C5BDB8';
    const hcx = ox + S * 3;
    const hcy = oy + S * 3;

    // Solid filled background circle — sized to contain all 4 yard spots
    svg.appendChild(svgEl('circle', {
      cx: hcx, cy: hcy, r: S * 2.002,
      fill: fillC, opacity: isActive ? 1 : 0.28,
    }));
    // Subtle border ring
    svg.appendChild(svgEl('circle', {
      cx: hcx, cy: hcy, r: S * 2.002,
      fill: 'none',
      stroke: fillC, 'stroke-width': 3,
      'stroke-opacity': isActive ? 0.25 : 0.08,
    }));
  }

  // ── 3. Track circles — 52 circular ring markers ──
  const exitSet = new Set(activeColors.map(c => COLOR_OFFSET[c]));
  TRACK.forEach(([col, row], i) => {
    const cx = col * S + S / 2;
    const cy = row * S + S / 2;
    if (exitSet.has(i)) {
      // Exit / safe square — filled with player color
      const exitColor = activeColors.find(c => COLOR_OFFSET[c] === i);
      svg.appendChild(svgEl('circle', {
        cx, cy, r: 26,
        fill: HOME_COLOR[exitColor], opacity: 0.85,
      }));
    } else {
      svg.appendChild(svgEl('circle', {
        cx, cy, r: 26,
        fill: 'rgba(255,255,255,0.07)', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 2.5,
      }));
    }
    // Absolute track index label
    const lbl = svgEl('text', {
      x: cx, y: cy + 6,
      'text-anchor': 'middle',
      'font-size': 14,
      'font-family': 'sans-serif',
      'font-weight': '700',
      fill: 'rgba(255,255,255,0.40)',
      'pointer-events': 'none',
    });
    lbl.textContent = i;
    svg.appendChild(lbl);
  });



  // ── 5. Home column path — filled circles leading to center ──
  const homeColEntries = [
    { color: 'red',    cells: HOME_COL.red    },
    { color: 'blue',   cells: HOME_COL.blue   },
    { color: 'green',  cells: HOME_COL.green  },
    { color: 'yellow', cells: HOME_COL.yellow },
  ];
  for (const { color, cells } of homeColEntries) {
    const isActive = activeColors.includes(color);
    for (const [col, row] of cells) {
      svg.appendChild(svgEl('circle', {
        cx: col * S + S / 2, cy: row * S + S / 2, r: 26,
        fill: isActive ? HOME_COLOR[color] : '#C5BDB8',
        opacity: isActive ? 0.9 : 0.32,
      }));
    }
  }

  // ── 6. Center — four circular petals (flower design) ──
  const cCX = S * 7.5;
  const cCY = S * 7.5;
  const cR  = S * 0.98;
  const pD  = cR * 0.52;  // petal center offset from board center
  const pR  = cR * 0.34;  // petal radius

  const petalDefs = [
    { color: 'green',  dx:  1, dy:  0 },
    { color: 'yellow', dx:  0, dy:  1 },
    { color: 'red',    dx: -1, dy:  0 },
    { color: 'blue',   dx:  0, dy: -1 },
  ];

  for (const { color, dx, dy } of petalDefs) {
    const isActive = activeColors.includes(color);
    svg.appendChild(svgEl('circle', {
      cx: cCX + dx * pD,
      cy: cCY + dy * pD,
      r:  pR,
      fill: isActive ? HOME_COLOR[color] : '#C5BDB8',
      opacity: isActive ? 0.95 : 0.32,
    }));
  }

  // Outer ring border
  svg.appendChild(svgEl('circle', {
    cx: cCX, cy: cCY, r: cR,
    fill: 'none', stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 5,
  }));

  // ── 7. Token layer ──
  svg.appendChild(svgEl('g', { id: 'token-layer' }));
}

// ─── TOKEN RENDERING ─────────────────────────────────────────

// Returns pixel [x, y] center for a token given its color and position
function tokenPixel(color, tokenIdx) {
  const pos = tokens[color][tokenIdx];

  if (pos === 0) {
    // In home yard
    return YARD_POS[color][tokenIdx];
  }

  if (pos === 57) {
    // Finished — cluster near center
    const [dx, dy] = FINISH_OFFSET[color];
    return [CELL * 7.5 + dx, CELL * 7.5 + dy];
  }

  if (pos >= 52) {
    // In home column
    const [col, row] = HOME_COL[color][pos - 52];
    return [col * CELL + CELL / 2, row * CELL + CELL / 2];
  }

  // On outer track — adjust for color's offset
  const trackPos = (pos - 1 + COLOR_OFFSET[color]) % 52;
  const [col, row] = TRACK[trackPos];
  return [col * CELL + CELL / 2, row * CELL + CELL / 2];
}

// Same as tokenPixel but takes a position value directly (doesn't read tokens[])
function tokenPixelAtPos(color, pos) {
  if (pos === 0) return YARD_POS[color][0];
  if (pos === 57) {
    const [dx, dy] = FINISH_OFFSET[color];
    return [CELL * 7.5 + dx, CELL * 7.5 + dy];
  }
  if (pos >= 52) {
    const [col, row] = HOME_COL[color][pos - 52];
    return [col * CELL + CELL / 2, row * CELL + CELL / 2];
  }
  const trackPos = (pos - 1 + COLOR_OFFSET[color]) % 52;
  const [col, row] = TRACK[trackPos];
  return [col * CELL + CELL / 2, row * CELL + CELL / 2];
}

// Back-kick is ONLY available when going backward would capture an opponent —
// either by landing directly on them, or via a line-kick from the landing square.
function canBackKickCapture(color, idx, roll) {
  const pos = tokens[color][idx];
  if (pos <= 0 || pos >= 52) return false;

  const absStart = (pos - 1 + COLOR_OFFSET[color]) % 52;
  const bkAbsPos = (absStart - roll + 52) % 52;

  // The one outer-track square this color never visits (its "skip square") has no
  // valid position mapping, so landing there is not allowed.
  if ((bkAbsPos - COLOR_OFFSET[color] + 52) % 52 === 51) return false;

  // Check backward path + landing square for blockades in absolute space
  for (let step = 1; step <= roll; step++) {
    const stepAbs = (absStart - step + 52) % 52;
    if (isBlockadeAt(stepAbs)) return false;
  }

  const partnerAbs = getLineKickPartner(bkAbsPos);
  for (const vc of ['red', 'green', 'blue', 'yellow']) {
    if (PLAYER_COLORS[current].includes(vc)) continue;
    for (let i = 0; i < tokens[vc].length; i++) {
      const va = absoluteTrackPos(vc, i);
      if (va === -1) continue;
      if (va === bkAbsPos) return true;
      if (partnerAbs !== -1 && va === partnerAbs) return true;
    }
  }
  return false;
}

// Group tokens by [x,y] pixel position (for stacking offset)
function groupByPosition(colorList) {
  const groups = {}; // key → [{color, idx}]
  for (const color of colorList) {
    for (let i = 0; i < tokens[color].length; i++) {
      const [px, py] = tokenPixel(color, i);
      const key = `${px},${py}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ color, idx: i, px, py });
    }
  }
  return groups;
}

// Small offset so stacked tokens don't perfectly overlap
const STACK_OFFSETS = [[0,0],[-16,0],[16,0],[0,-16]];

function renderTokens() {
  const layer = document.getElementById('token-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const allColors = PLAYER_COLORS.flat();
  const groups = groupByPosition(allColors);
  const isMyTurn = mode === 'local' || (winner === -1 && current === myIdx);
  const myColors = PLAYER_COLORS[current];
  const sel = selectedToken; // snapshot

  for (const members of Object.values(groups)) {
    members.forEach(({ color, idx, px, py }, stackIdx) => {
      const pos = tokens[color][idx];
      const [ox, oy] = STACK_OFFSETS[stackIdx] || [0, 0];
      const cx = px + ox, cy = py + oy;

      const isOwn    = myColors.includes(color);
      const canMove  = isOwn && isMyTurn && rolled && winner === -1 && pos !== 57 && !animating;
      const canSelect = canMove && isValidMove(color, idx, diceVal);
      const isSelected = sel && sel.color === color && sel.idx === idx;

      // Simple disc — matches the hero-token style (solid fill + inset bottom shadow)
      const fill = TOKEN_COLOR[color];
      const op   = pos === 57 ? 0.55 : 1;
      const r    = 22;

      // Token disc group — drop shadow only for active (non-finished) tokens
      const tokenG = svgEl('g', pos !== 57 ? { filter: 'url(#token-drop-shadow)' } : {});
      tokenG.appendChild(svgEl('circle', { cx, cy, r, fill, opacity: op }));
      // Bottom-inset shadow (darkens lower edge)
      tokenG.appendChild(svgEl('circle', { cx, cy, r, fill: 'url(#token-inset-shadow)', opacity: op }));
      // Specular highlight (brightens upper-left, completes the 3D read)
      tokenG.appendChild(svgEl('circle', { cx, cy, r, fill: 'url(#token-highlight)', opacity: op }));
      layer.appendChild(tokenG);

      // Invisible click hitbox
      const exitBlocked = canMove && !canSelect && pos === 0 && diceVal === 6;
      const hitCursor = canSelect ? 'pointer' : exitBlocked ? 'not-allowed' : 'default';
      const hitbox = svgEl('circle', { cx, cy, r: r + 10, fill: 'transparent', cursor: hitCursor });
      if (canSelect) hitbox.addEventListener('click', () => handleTokenClick(color, idx));
      if (exitBlocked) hitbox.addEventListener('click', () => setMsg('Exit blocked — move the token off your entry square first'));
      layer.appendChild(hitbox);

      // Finished mark
      if (pos === 57) {
        const t = svgEl('text', { x: cx, y: cy + 7, 'text-anchor': 'middle', 'font-size': 20, fill: 'rgba(255,255,255,0.9)', 'font-family': 'sans-serif' });
        t.textContent = '✓';
        layer.appendChild(t);
      }
    });
  }

  // Destination choice dots for selected token
  if (sel && !animating) _renderDestDots(sel.color, sel.idx);
}

function _renderDestDots(color, idx) {
  const layer = document.getElementById('token-layer');
  if (!layer) return;
  const pos = tokens[color][idx];

  // Forward destination
  const fwdRaw = pos === 0 ? 1 : pos + diceVal;
  const fwdPos = fwdRaw > 57 ? 57 - (fwdRaw - 57) : fwdRaw;
  _addDestDot(layer, ...tokenPixelAtPos(color, fwdPos), color, idx, 'forward');

  // Backward destination — only when there's an opponent to capture
  if (canBackKickCapture(color, idx, diceVal)) {
    const bkAbs = ((pos - 1 + COLOR_OFFSET[color]) % 52 - diceVal + 52) % 52;
    const bkRel = (bkAbs - COLOR_OFFSET[color] + 52) % 52 + 1;
    _addDestDot(layer, ...tokenPixelAtPos(color, bkRel), color, idx, 'backward');
  }
}

function _addDestDot(layer, cx, cy, color, idx, dir) {
  const isBack = dir === 'backward';

  // Outer glow
  layer.appendChild(svgEl('circle', { cx, cy, r: 38, fill: TOKEN_COLOR[color], opacity: isBack ? 0.15 : 0.25 }));

  // Clickable dot
  const dot = svgEl('circle', {
    cx, cy, r: 29,
    fill: isBack ? '#ffffff' : TOKEN_COLOR[color],
    stroke: TOKEN_COLOR[color], 'stroke-width': 5,
    cursor: 'pointer', opacity: 0.95,
  });
  dot.classList.add('dest-dot-pulse');
  dot.addEventListener('click', () => handleDestinationClick(color, idx, dir));
  layer.appendChild(dot);

  // Arrow label
  const t = svgEl('text', {
    x: cx, y: cy + 11, 'text-anchor': 'middle',
    'font-size': 29, 'font-weight': 'bold', 'font-family': 'sans-serif',
    fill: isBack ? TOKEN_COLOR[color] : '#ffffff',
    'pointer-events': 'none',
  });
  t.textContent = isBack ? '←' : '→';
  layer.appendChild(t);
}

// ─── HOME PULSE ──────────────────────────────────────────────

function showHomePulse() {
  clearHomePulse();
  const svg = document.getElementById('ludo-svg');
  if (!svg) return;

  const S   = 1000 / 15;
  const hR  = S * 2.002;
  const group = svgEl('g', { id: 'home-pulse-layer' });
  let added = false;

  for (const color of PLAYER_COLORS[current]) {
    if (!tokens[color].some(p => p === 0)) continue;
    if (isEnemyBlockadeAt(COLOR_OFFSET[color])) continue;

    const [ox, oy] = CORNER_ORIGIN[color];
    const hcx = ox + S * 3;
    const hcy = oy + S * 3;

    for (let i = 0; i < 3; i++) {
      const ring = svgEl('circle', {
        cx: hcx, cy: hcy, r: hR,
        fill: 'none',
        stroke: HOME_COLOR[color],
        'stroke-width': 5,
        opacity: 0,
      });
      const delay = `${i * 0.45}s`;
      const dur   = '1.35s';

      const animR = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      animR.setAttribute('attributeName', 'r');
      animR.setAttribute('from', hR);
      animR.setAttribute('to',   hR * 1.5);
      animR.setAttribute('dur',  dur);
      animR.setAttribute('begin', delay);
      animR.setAttribute('repeatCount', 'indefinite');
      ring.appendChild(animR);

      const animO = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      animO.setAttribute('attributeName', 'opacity');
      animO.setAttribute('values',   '0;0.8;0');
      animO.setAttribute('keyTimes', '0;0.25;1');
      animO.setAttribute('dur',  dur);
      animO.setAttribute('begin', delay);
      animO.setAttribute('repeatCount', 'indefinite');
      ring.appendChild(animO);

      group.appendChild(ring);
      added = true;
    }
  }

  if (!added) return;
  const tokenLayer = document.getElementById('token-layer');
  tokenLayer ? svg.insertBefore(group, tokenLayer) : svg.appendChild(group);
}

function clearHomePulse() {
  document.getElementById('home-pulse-layer')?.remove();
}

// ─── DIE ─────────────────────────────────────────────────────

function renderDie(val) {
  const pips = DIE_PIPS[val] || [];
  ['a','b','c','d','e','f','g'].forEach(id => {
    const el = document.getElementById('pip-' + id);
    if (el) el.classList.toggle('on', pips.includes(id));
  });
}

function rollDie() {
  if (animating || winner !== -1) return;
  if (mode === 'online' && current !== myIdx) return;
  if (rolled && bonusRolls === 0) return;

  selectedToken = null;

  const die = document.getElementById('die');
  if (!die) return;
  const dieWrap = die.parentElement;

  animating = true;
  dieWrap.classList.add('rolling');

  // Show random faces during shake
  let ticks = 0;
  const tickInterval = setInterval(() => {
    renderDie(Math.floor(Math.random() * 6) + 1);
    ticks++;
    if (ticks >= 8) {
      clearInterval(tickInterval);
      const result = Math.floor(Math.random() * 6) + 1;
      diceVal = result;
      rolled  = true;
      if (bonusRolls > 0) bonusRolls--;

      renderDie(result);
      dieWrap.classList.remove('rolling');
      animating = false;

      afterRoll(result);
    }
  }, 50);
}

// ─── GAME LOGIC ──────────────────────────────────────────────

// Returns true if 2+ tokens of the same color occupy absPos on the outer track
function isBlockadeAt(absPos) {
  for (const c of ['red', 'green', 'blue', 'yellow']) {
    if (countColorAt(c, absPos) >= 2) return true;
  }
  return false;
}

// True only when an OPPONENT has a 2-token blockade at absPos.
// Own-team stacks do NOT block yard entry — you can add to your own stack.
function isEnemyBlockadeAt(absPos) {
  for (const c of ['red', 'green', 'blue', 'yellow']) {
    if (PLAYER_COLORS[current].includes(c)) continue;
    if (countColorAt(c, absPos) >= 2) return true;
  }
  return false;
}

function isValidMove(color, idx, roll) {
  if (!roll) return false;
  const pos = tokens[color][idx];

  if (pos === 57) return false; // already home
  if (pos === 0) {
    if (roll !== 6) return false;
    // Can't exit only if an opponent has a 2-token blockade on the entry square.
    // Own tokens already there are fine — the new token joins the stack.
    return !isEnemyBlockadeAt(COLOR_OFFSET[color]);
  }

  // Home column: must reach home exactly — no overshoot
  if (pos >= 52) {
    return (pos + roll) <= 57;
  }

  // Outer track
  const newPos = pos + roll;
  // Overshoot bounce (dead code for dice 1-6 but kept for safety)
  if (newPos > 57) {
    const bounced = 57 - (newPos - 57);
    return bounced > pos;
  }

  // Check every step on the outer track portion of the path for blockades.
  // Steps into the home column (>= 52) are per-color lanes — no blockades.
  const trackEnd = Math.min(newPos, 51);
  for (let step = pos + 1; step <= trackEnd; step++) {
    const stepAbs = (step - 1 + COLOR_OFFSET[color]) % 52;
    if (isBlockadeAt(stepAbs)) return false;
  }

  return true;
}

function anyValidMove(roll) {
  for (const color of PLAYER_COLORS[current]) {
    for (let i = 0; i < tokens[color].length; i++) {
      if (isValidMove(color, i, roll)) return true;
    }
  }
  return false;
}

function afterRoll(roll) {
  setMsg('');
  if (!anyValidMove(roll)) {
    clearHomePulse();
    setDieMsg('No valid moves');
    setTimeout(() => endTurn(), 900);
    return;
  }
  if (roll === 6) {
    showHomePulse();
    // Yard token exists but can't exit — tell the player why
    for (const color of PLAYER_COLORS[current]) {
      if (tokens[color].some(p => p === 0) && isEnemyBlockadeAt(COLOR_OFFSET[color])) {
        setMsg('Exit blocked — move the token off your entry square first');
        break;
      }
    }
  } else {
    clearHomePulse();
  }
  const msg = roll === 6 ? 'Six! Pick a token' : 'Pick a token';
  setDieMsg(msg);
  renderTokens(); // re-render with selectable highlights
}

function handleTokenClick(color, idx) {
  if (!rolled || animating || winner !== -1) return;
  if (!PLAYER_COLORS[current].includes(color)) return;
  if (!isValidMove(color, idx, diceVal)) return;

  // Back-kick choice only when going backward would actually capture someone
  if (canBackKickCapture(color, idx, diceVal)) {
    // Toggle selection on re-click; otherwise select this token
    if (selectedToken && selectedToken.color === color && selectedToken.idx === idx) {
      selectedToken = null;
    } else {
      selectedToken = { color, idx };
    }
    renderTokens();
  } else {
    // No back-kick available — move forward immediately
    selectedToken = null;
    executeMove(color, idx, diceVal, 'forward');
  }
}

function handleDestinationClick(color, idx, dir) {
  if (!selectedToken || selectedToken.color !== color || selectedToken.idx !== idx) return;
  selectedToken = null;
  executeMove(color, idx, diceVal, dir);
}

// Build ordered list of positions to step through for animation
function computeMovePath(fromPos, roll, dir, color) {
  if (fromPos === 0) return [1]; // yard release → exit square (one hop)
  if (dir === 'backward') {
    // Work in absolute space so the path wraps correctly around the circular track.
    // The one "skip square" per color (the outer-track square it never visits forward)
    // has no valid relative mapping, so we silently skip it — one less animation frame.
    const absStart = (fromPos - 1 + COLOR_OFFSET[color]) % 52;
    const steps = [];
    for (let step = 1; step <= roll; step++) {
      const absPos = (absStart - step + 52) % 52;
      const relPos = (absPos - COLOR_OFFSET[color] + 52) % 52 + 1;
      if (relPos <= 51) steps.push(relPos);
    }
    return steps;
  }
  // forward
  const rawEnd = fromPos + roll;
  const steps  = [];
  for (let p = fromPos + 1; p <= rawEnd; p++) {
    steps.push(p > 57 ? 57 - (p - 57) : p);
  }
  return steps;
}

// Animate a token through a series of positions, calling onComplete when done
function animateTokenMove(color, idx, steps, onComplete) {
  let i = 0;
  function tick() {
    if (i >= steps.length) { onComplete(); return; }
    tokens[color][idx] = steps[i++];
    renderTokens();
    setTimeout(tick, 70);
  }
  tick();
}

function executeMove(color, idx, roll, dir = 'forward') {
  clearHomePulse();
  animating = true;
  selectedToken = null;

  const oldPos = tokens[color][idx];
  let newPos;
  if (dir === 'backward') {
    const absStart = (oldPos - 1 + COLOR_OFFSET[color]) % 52;
    const bkAbs = (absStart - roll + 52) % 52;
    newPos = (bkAbs - COLOR_OFFSET[color] + 52) % 52 + 1;
  } else {
    const rawEnd = oldPos === 0 ? 1 : oldPos + roll;
    newPos = rawEnd > 57 ? 57 - (rawEnd - 57) : rawEnd;
  }

  const steps = computeMovePath(oldPos, roll, dir, color);

  playMove();

  animateTokenMove(color, idx, steps, () => {
    tokens[color][idx] = newPos; // lock to final position

    // Only a six earns a bonus roll — captures do not
    const earnedBonus = (roll === 6);

    checkCapture(color, idx, newPos); // capture at landing square
    checkLineKick(color, idx, newPos); // line kick from landing square

    // Show captures immediately before doing anything else
    renderTokens();

    const totalNeeded = PLAYER_COLORS[current].length * 4;
    const totalHome   = PLAYER_COLORS[current].reduce((sum, c) =>
      sum + tokens[c].filter(p => p === 57).length, 0);

    if (totalHome === totalNeeded) {
      winner = current;
      animating = false;
      renderTokens();
      updateScoreUI();
      if (mode === 'local') setTimeout(() => endGame(winner), 800);
      else db.ref('ludo-rooms/' + roomCode).update(statePayload());
      return;
    }

    rolled = false;
    if (earnedBonus) {
      bonusRolls++;
      setDieMsg('Bonus roll!');
    }

    renderTokens();
    updateScoreUI();
    updateTurnUI();
    animating = false;

    if (earnedBonus) {
      rolled = false;
      renderTokens();
      // Bonus: endTurn won't run, so push now — current is still correct (same player)
      if (mode === 'online') {
        db.ref('ludo-rooms/' + roomCode).update(statePayload());
      }
      return;
    }

    endTurn();
  });
}

// Returns [trackPos] for a token's absolute outer-track position (or -1 if not on outer track)
function absoluteTrackPos(color, idx) {
  const pos = tokens[color][idx];
  if (pos === 0 || pos >= 52) return -1;
  return (pos - 1 + COLOR_OFFSET[color]) % 52;
}

function checkCapture(moverColor, moverIdx, atPos) {
  if (atPos === 0 || atPos >= 52) return false; // yard or home col: safe

  const absPos = (atPos - 1 + COLOR_OFFSET[moverColor]) % 52;

  let captured = false;
  for (const victimColor of ['red', 'green', 'blue', 'yellow']) {
    if (PLAYER_COLORS[current].includes(victimColor)) continue; // same player
    for (let i = 0; i < tokens[victimColor].length; i++) {
      const victimAbsPos = absoluteTrackPos(victimColor, i);
      if (victimAbsPos === -1) continue;
      if (victimAbsPos !== absPos) continue;
      if (countColorAt(victimColor, victimAbsPos) >= 2) continue; // victim is a blockade
      sendHome(victimColor, i);
      captured = true;
    }
  }
  return captured;
}

function checkLineKick(moverColor, moverIdx, newPos) {
  if (newPos === 0 || newPos >= 52) return false;
  const absPos = (newPos - 1 + COLOR_OFFSET[moverColor]) % 52;

  // Find the line-kick partner of this track position
  const partnerPos = getLineKickPartner(absPos);
  if (partnerPos === -1) return false;

  let captured = false;
  for (const victimColor of ['red', 'green', 'blue', 'yellow']) {
    if (PLAYER_COLORS[current].includes(victimColor)) continue;
    for (let i = 0; i < tokens[victimColor].length; i++) {
      const victimAbs = absoluteTrackPos(victimColor, i);
      if (victimAbs !== partnerPos) continue;
      if (countColorAt(victimColor, victimAbs) >= 2) continue; // victim is a blockade

      // Capture: send victim home, mover teleports to victim's old spot
      sendHome(victimColor, i);
      tokens[moverColor][moverIdx] = victimAbs - COLOR_OFFSET[moverColor] + 1;
      if (tokens[moverColor][moverIdx] <= 0) tokens[moverColor][moverIdx] += 52;
      captured = true;
    }
  }
  return captured;
}

function getLineKickPartner(absPos) {
  const [col, row] = TRACK[absPos];
  // Left arm (row 6 ↔ row 8, cols 0-5)
  if (row === 6 && col <= 5) {
    const p = TRACK.findIndex(([c,r]) => c === col && r === 8);
    return p !== -1 ? p : -1;
  }
  if (row === 8 && col <= 5) {
    const p = TRACK.findIndex(([c,r]) => c === col && r === 6);
    return p !== -1 ? p : -1;
  }
  // Top arm (col 6 ↔ col 8, rows 0-5)
  if (col === 6 && row <= 5) {
    const p = TRACK.findIndex(([c,r]) => c === 8 && r === row);
    return p !== -1 ? p : -1;
  }
  if (col === 8 && row <= 5) {
    const p = TRACK.findIndex(([c,r]) => c === 6 && r === row);
    return p !== -1 ? p : -1;
  }
  // Right arm (row 6 ↔ row 8, cols 9-14)
  if (row === 6 && col >= 9) {
    const p = TRACK.findIndex(([c,r]) => c === col && r === 8);
    return p !== -1 ? p : -1;
  }
  if (row === 8 && col >= 9) {
    const p = TRACK.findIndex(([c,r]) => c === col && r === 6);
    return p !== -1 ? p : -1;
  }
  // Bottom arm (col 6 ↔ col 8, rows 9-14)
  if (col === 6 && row >= 9) {
    const p = TRACK.findIndex(([c,r]) => c === 8 && r === row);
    return p !== -1 ? p : -1;
  }
  if (col === 8 && row >= 9) {
    const p = TRACK.findIndex(([c,r]) => c === 6 && r === row);
    return p !== -1 ? p : -1;
  }
  return -1;
}

// Count tokens of a specific color at absPos (blockade = same color only)
function countColorAt(color, absPos) {
  let count = 0;
  for (let i = 0; i < tokens[color].length; i++) {
    if (absoluteTrackPos(color, i) === absPos) count++;
  }
  return count;
}

function sendHome(color, idx) {
  tokens[color][idx] = 0;
  playCapture();
}

function endTurn() {
  clearHomePulse();
  selectedToken = null;
  rolled = false;
  bonusRolls = 0;
  current = 1 - current; // flip first — statePayload() must read the new current
  diceVal = 0;
  renderDie(0);
  renderTokens();
  updateTurnUI();
  setDieMsg('Tap die to roll');
  setMsg('');
  if (mode === 'online') {
    db.ref('ludo-rooms/' + roomCode).update(statePayload());
  }
}

function statePayload() {
  return {
    tokens: JSON.stringify(tokens),
    current, winner, diceVal, rolled, bonusRolls,
  };
}

// ─── GAME INIT ───────────────────────────────────────────────

function initTokens() {
  const all = { red:[0,0,0,0], blue:[0,0,0,0], green:[0,0,0,0], yellow:[0,0,0,0] };
  tokens = all;
}

// Rotate the board 180° for online players whose color is at the top (Red or Blue)
// so their color always appears at the bottom of their screen.
function applyBoardPerspective() {
  const svg = document.getElementById('ludo-svg');
  if (!svg) return;
  if (mode === 'online') {
    const myColor = PLAYER_COLORS[myIdx][0];
    const topColors = ['red', 'blue'];
    svg.style.transform = topColors.includes(myColor) ? 'rotate(180deg)' : '';
  } else {
    // Rotate so P1's chosen color always appears at the bottom-left corner
    // Board layout: red=TL, blue=TR, green=BR, yellow=BL
    const CORNER_ROTATION = { yellow: 0, red: -90, blue: 180, green: 90 };
    const angle = CORNER_ROTATION[p1Color] ?? 0;
    svg.style.transform = angle ? `rotate(${angle}deg)` : '';
  }
}

function initGame() {
  initTokens();
  current    = 0;
  winner     = -1;
  diceVal    = 0;
  rolled     = false;
  bonusRolls = 0;
  animating  = false;

  const p1Pair = [p1Color, OPPOSITE_COLOR[p1Color]];
  const p2Pair = ['red','green','blue','yellow'].filter(c => !p1Pair.includes(c));
  PLAYER_COLORS = gameMode === 'full'
    ? [p1Pair, p2Pair]
    : [[p1Color], [OPPOSITE_COLOR[p1Color]]];

  document.getElementById('score-name-0').textContent = names[0];
  document.getElementById('score-name-1').textContent = names[1];
  updateScoreUI();

  showScreen('game');
  drawBoard();
  renderTokens();
  renderDie(0);
  updateTurnUI();
  setDieMsg('Tap die to roll');
  setMsg('');
  applyBoardPerspective();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── LOCAL GAME ──────────────────────────────────────────────

function startLocal() {
  const n0 = document.getElementById('p1-name').value.trim() || 'Player 1';
  const n1 = document.getElementById('p2-name').value.trim() || 'Player 2';
  lvsSaveNames(n0, n1);
  names   = [n0, n1];
  mode    = 'local';
  myIdx   = 0;
  initGame();
  lvsFsShow();
}

function handleRestart() {
  if (mode === 'local') { initGame(); return; }
  if (!isHost) { setMsg('Only the host can restart'); return; }
  initTokens();
  db.ref('ludo-rooms/' + roomCode).update({
    tokens: JSON.stringify(tokens),
    current: 0, winner: -1, diceVal: 0, rolled: false, bonusRolls: 0,
  });
}

// ─── WIN SCREEN ──────────────────────────────────────────────

function endGame(w) {
  window._lvsWinPlayers = { names: names.slice(), winner: w };

  const row  = document.getElementById('win-token-row');
  const name = document.getElementById('win-name');
  const sub  = document.getElementById('win-sub');

  if (row) {
    row.innerHTML = PLAYER_COLORS[w].map(c =>
      `<div class="win-token ${c}"></div>`
    ).join('');
  }
  if (name) name.textContent = (mode === 'online' && w === myIdx)
    ? 'You win! 🎉' : names[w] + ' wins!';
  if (sub) sub.textContent = 'All tokens home';

  launchConfetti();
  showScreen('win');

  const btn = document.getElementById('win-again-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Play Again'; }
}

function downloadResultCard() {
  lvsDownloadCard({ game: 'Ludo', names, winner });
}

// ─── PLAY AGAIN ──────────────────────────────────────────────

function playAgain() {
  if (mode === 'local') { initGame(); return; }
  const btn = document.getElementById('win-again-btn');
  lvsReadyUp(btn);
  db.ref('ludo-rooms/' + roomCode).update({ ['ready' + myIdx]: true });
}

// ─── ONLINE: CREATE ROOM ─────────────────────────────────────

function createRoom() {
  const name = document.getElementById('online-name').value.trim();
  if (!name) { setOnlineMsg('Enter your name first.', true); return; }

  const code    = randomCode();
  const hostIdx = Math.floor(Math.random() * 2);
  roomCode = code; myIdx = hostIdx; isHost = true;
  gameMode = selectedOnlineMode;
  localStorage.setItem('lvs_ludo_room', code);
  localStorage.setItem('lvs_ludo_role', 'host');
  lvsSaveNames(name, '');

  initTokens();
  const hc = selectedOnlineMode === 'full' ? 'red' : hostColor;
  PLAYER_COLORS = gameMode === 'full'
    ? [['red','yellow'], ['blue','green']]
    : [[hc], [OPPOSITE_COLOR[hc]]];

  db.ref('ludo-rooms/' + code).set({
    host: name, guest: null, hostIdx,
    gameMode, hostColor: hc,
    tokens: JSON.stringify(tokens),
    current: 0, winner: -1, diceVal: 0, rolled: false, bonusRolls: 0,
    status: 'waiting',
  }).then(() => {
    document.getElementById('waiting-code').textContent = code;
    showScreen('waiting');
    attachListener();
  }).catch(() => setOnlineMsg('Could not create room.', true));
}

// ─── ONLINE: JOIN ROOM ────────────────────────────────────────

function joinRoom() {
  const name = document.getElementById('online-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { setOnlineMsg('Enter your name first.', true); return; }
  if (code.length !== 4) { setOnlineMsg('Enter a 4-letter code.', true); return; }

  db.ref('ludo-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d)                     { setOnlineMsg('Room not found.', true); return; }
    if (d.status !== 'waiting') { setOnlineMsg('Game already started.', true); return; }
    if (d.guest)                { setOnlineMsg('Room is full.', true); return; }

    roomCode = code; myIdx = 1 - (d.hostIdx || 0); isHost = false;
    gameMode = d.gameMode || 'quick';
    localStorage.setItem('lvs_ludo_room', code);
    localStorage.setItem('lvs_ludo_role', 'guest');
    lvsSaveNames(name, '');

    db.ref('ludo-rooms/' + code).update({ guest: name, status: 'playing' })
      .then(() => attachListener())
      .catch(() => setOnlineMsg('Could not join room.', true));
  }).catch(() => setOnlineMsg('Could not reach server.', true));
}

// ─── FIREBASE LISTENER ───────────────────────────────────────

function attachListener() {
  if (roomRef) roomRef.off();
  roomRef = db.ref('ludo-rooms/' + roomCode);
  roomRef.on('value', snap => {
    const d = snap.val();
    if (!d) return;

    if (d.status === 'waiting') return;
    lvsOnlineUpdate(d);

    const hostIdx = d.hostIdx || 0;
    names[hostIdx]     = d.host;
    names[1 - hostIdx] = d.guest || '…';
    mode     = 'online';
    gameMode = d.gameMode || 'quick';

    const active = document.querySelector('.screen.active')?.id;
    if (active === 'screen-waiting' || active === 'screen-online') {
      lvsOnlineStart(roomRef, myIdx, backToLobby);
      initGame();
    }

    // Sync state
    // Discard stale partial pushes: rolled:true is only valid in a win state.
    if (d.rolled === true && (d.winner == null || d.winner === -1)) return;

    const prevWinner = winner;
    tokens     = JSON.parse(d.tokens || '{}') || {};
    current    = d.current ?? 0;
    winner     = d.winner ?? -1;
    diceVal    = d.diceVal ?? 0;
    rolled     = d.rolled ?? false;
    bonusRolls = d.bonusRolls ?? 0;

    // Ensure all colors exist
    ['red','green','blue','yellow'].forEach(c => {
      if (!tokens[c]) tokens[c] = [0,0,0,0];
    });

    const onlineHC = d.hostColor || 'yellow';
    PLAYER_COLORS = gameMode === 'full'
      ? [['red','yellow'], ['blue','green']]
      : [[onlineHC],       [OPPOSITE_COLOR[onlineHC]]];

    applyBoardPerspective();
    if (diceVal) renderDie(diceVal);
    updateScoreUI();
    renderTokens();
    updateTurnUI();

    const iAmCurrent = current === myIdx;
    if (rolled && iAmCurrent) {
      setDieMsg(diceVal === 6 ? 'Six! Pick a token' : 'Pick a token');
    } else if (!rolled && iAmCurrent) {
      setDieMsg('Tap die to roll');
    } else if (rolled) {
      setDieMsg(names[current] + ' is moving…');
    } else {
      setDieMsg(names[current] + ' is rolling…');
    }

    if (winner !== -1 && prevWinner === -1) {
      setTimeout(() => endGame(winner), 800);
    }

    if (winner === -1 && prevWinner !== -1 &&
        document.getElementById('screen-win').classList.contains('active')) {
      showScreen('game');
      setMsg('');
    }

    if (lvsReadyBoth(d) && isHost) {
      initTokens();
      db.ref('ludo-rooms/' + roomCode).update({
        tokens: JSON.stringify(tokens),
        current:0, winner:-1, diceVal:0, rolled:false, bonusRolls:0,
        ready0: false, ready1: false,
      });
    }

    const btn = document.getElementById('win-again-btn');
    if (lvsIsEndScreen() && btn) lvsReadyUI(d, btn);
  });
}

// ─── NAVIGATION ──────────────────────────────────────────────

function backToLobby() {
  lvsFsHide();
  lvsOnlineStop();
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (roomCode) {
    db.ref('ludo-rooms/' + roomCode).update({ status: 'done' }).catch(() => {});
  }
  localStorage.removeItem('lvs_ludo_room');
  localStorage.removeItem('lvs_ludo_role');
  roomCode = null;
  showScreen('lobby');
}

function copyCode() {
  lvsCopyLink(roomCode, document.getElementById('waiting-copy-btn'), 'Copy Link');
}

// ─── RECONNECT ────────────────────────────────────────────────

(function tryReconnect() {
  const code = localStorage.getItem('lvs_ludo_room');
  const role = localStorage.getItem('lvs_ludo_role');
  if (!code || !role) return;
  db.ref('ludo-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d || d.status === 'done' || d.status === 'waiting') {
      localStorage.removeItem('lvs_ludo_room');
      localStorage.removeItem('lvs_ludo_role');
      return;
    }
    roomCode = code;
    isHost   = role === 'host';
    myIdx    = isHost ? (d.hostIdx || 0) : 1 - (d.hostIdx || 0);
    attachListener();
  }).catch(() => {});
})();

// ─── SOUND ───────────────────────────────────────────────────

function playMove() {
  if (isMuted()) return;
  try {
    const ctx  = audioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(); osc.stop(ctx.currentTime + 0.19);
  } catch (_) {}
}

function playCapture() {
  if (isMuted()) return;
  try {
    const ctx  = audioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth'; osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(); osc.stop(ctx.currentTime + 0.26);
  } catch (_) {}
}
