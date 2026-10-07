const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Complete more boxes than your opponent by drawing the final side of each square.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Players take turns drawing one line between two adjacent dots.</li>
    <li>When you draw the <strong>4th side</strong> of a box, you claim it — your initial appears inside.</li>
    <li>Completing a box earns a bonus turn — keep going until you draw a line that doesn't complete a box.</li>
  </ol>
</div>
<div class="rs">
  <h3>How to Win</h3>
  <p>When all lines have been drawn, count claimed boxes. Most boxes wins.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Never draw the 3rd side of a box — that hands your opponent an easy score.</div>
`;

/* ============================================================
   DOTS & BOXES — Lash vs Seven
   ============================================================ */

const DOTS = 5;          // 5×5 dot grid
const BOXES = DOTS - 1;  // 4×4 box grid = 16 total boxes
const TOTAL_BOXES = BOXES * BOXES;
const CELL = 60;
const PAD  = 36;
const SVG_SIZE = 2 * PAD + BOXES * CELL; // 312

const P0_COLOR = '#e17055';
const P1_COLOR = '#74b9ff';
const NS = 'http://www.w3.org/2000/svg';

// ─── FIREBASE ────────────────────────────────────────────────

// ─── STATE ────────────────────────────────────────────────────
let state = null;
const mp = { active: false, myIdx: 0, ref: null, code: null, isHost: false };

let hoverLine  = null;
let animLine   = null;
let animBoxes  = [];
let hoverGroup = null;

// ─── INIT ────────────────────────────────────────────────────
function initState(names) {
  state = {
    hLines: Array.from({ length: DOTS }, () => Array(BOXES).fill(0)),
    vLines: Array.from({ length: BOXES }, () => Array(DOTS).fill(0)),
    boxes:  Array.from({ length: BOXES }, () => Array(BOXES).fill(-1)),
    scores: [0, 0],
    current: 0,
    winner: -1,
    names: names || ['Player 1', 'Player 2'],
  };
}

// ─── FIREBASE ENCODING ───────────────────────────────────────
function encodeForFirebase() {
  return {
    hLines:  state.hLines.flat(),
    vLines:  state.vLines.flat(),
    boxes:   state.boxes.flat().map(v => v === -1 ? 9 : v),
    scores:  state.scores,
    current: state.current,
    winner:  state.winner === -1 ? 9 : state.winner,
  };
}

function decodeFromFirebase(data) {
  function toArr(v, len) {
    if (Array.isArray(v)) return v.map(Number);
    const a = [];
    for (let i = 0; i < len; i++) a.push(v[i] !== undefined ? Number(v[i]) : 0);
    return a;
  }
  const hFlat = toArr(data.hLines, DOTS * BOXES);
  const vFlat = toArr(data.vLines, BOXES * DOTS);
  const bFlat = toArr(data.boxes, BOXES * BOXES).map(v => v === 9 ? -1 : v);

  for (let r = 0; r < DOTS; r++)
    for (let c = 0; c < BOXES; c++)
      state.hLines[r][c] = hFlat[r * BOXES + c];

  for (let r = 0; r < BOXES; r++)
    for (let c = 0; c < DOTS; c++)
      state.vLines[r][c] = vFlat[r * DOTS + c];

  for (let r = 0; r < BOXES; r++)
    for (let c = 0; c < BOXES; c++)
      state.boxes[r][c] = bFlat[r * BOXES + c];

  state.scores  = toArr(data.scores, 2);
  state.current = Number(data.current);
  state.winner  = Number(data.winner) === 9 ? -1 : Number(data.winner);
}

// ─── GAME LOGIC ──────────────────────────────────────────────
function isLineTaken(type, r, c) {
  return type === 'h' ? state.hLines[r][c] !== 0 : state.vLines[r][c] !== 0;
}

function isBoxComplete(br, bc) {
  if (state.boxes[br][bc] !== -1) return false;
  return (
    state.hLines[br][bc] &&
    state.hLines[br + 1][bc] &&
    state.vLines[br][bc] &&
    state.vLines[br][bc + 1]
  );
}

function checkBoxes(type, r, c) {
  const newly = [];
  if (type === 'h') {
    if (r > 0       && isBoxComplete(r - 1, c)) newly.push({ r: r - 1, c });
    if (r < BOXES   && isBoxComplete(r, c))     newly.push({ r, c });
  } else {
    if (c > 0       && isBoxComplete(r, c - 1)) newly.push({ r, c: c - 1 });
    if (c < BOXES   && isBoxComplete(r, c))     newly.push({ r, c });
  }
  return newly;
}

function drawLine(type, r, c) {
  if (!state || state.winner !== -1) return;
  if (mp.active && state.current !== mp.myIdx) return;
  if (isLineTaken(type, r, c)) return;

  const drawer = state.current + 1; // 1 = P0, 2 = P1
  if (type === 'h') state.hLines[r][c] = drawer;
  else              state.vLines[r][c] = drawer;

  animLine = { type, r, c };

  const completed = checkBoxes(type, r, c);
  completed.forEach(({ r: br, c: bc }) => {
    state.boxes[br][bc] = state.current;
    state.scores[state.current]++;
  });
  animBoxes = completed.map(({ r: br, c: bc }) => `${br},${bc}`);

  playDraw();
  if (completed.length > 0) setTimeout(playCapture, 160);

  const allFilled = state.scores[0] + state.scores[1] === TOTAL_BOXES;
  if (allFilled) {
    if      (state.scores[0] > state.scores[1]) state.winner = 0;
    else if (state.scores[1] > state.scores[0]) state.winner = 1;
    else                                         state.winner = 2;
  } else if (completed.length === 0) {
    state.current = 1 - state.current;
  }

  hoverLine = null;
  renderBoard();
  updateUI(completed.length > 0 && !allFilled);

  setTimeout(() => { animLine = null; animBoxes = []; }, 420);

  if (mp.active) syncToFirebase();
  if (state.winner !== -1) setTimeout(showWin, 650);
}

// ─── SVG HELPERS ─────────────────────────────────────────────
function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
}

function dotPos(r, c) {
  return [PAD + c * CELL, PAD + r * CELL];
}

// ─── RENDER ──────────────────────────────────────────────────
function renderBoard() {
  const svg = document.getElementById('dots-board');
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);

  // ── Layer 1: box fills ──
  for (let r = 0; r < BOXES; r++) {
    for (let c = 0; c < BOXES; c++) {
      const owner = state.boxes[r][c];
      if (owner < 0) continue;
      const [x, y] = dotPos(r, c);
      const isNew = animBoxes.includes(`${r},${c}`);
      const rect = el('rect', {
        x, y, width: CELL, height: CELL,
        fill: owner === 0 ? P0_COLOR : P1_COLOR,
        opacity: owner === 0 ? '0.22' : '0.28',
        class: isNew ? 'db-box-new' : '',
      });
      svg.appendChild(rect);

      const txt = el('text', {
        x: x + CELL / 2, y: y + CELL / 2 + 6,
        'text-anchor': 'middle',
        fill: owner === 0 ? P0_COLOR : P1_COLOR,
        'font-size': '18',
        'font-family': 'Oswald, sans-serif',
        'font-weight': '700',
        opacity: '0.5',
        class: isNew ? 'db-text-new' : '',
      });
      txt.textContent = state.names[owner][0].toUpperCase();
      svg.appendChild(txt);
    }
  }

  // ── Layer 2: hover group (updated independently) ──
  hoverGroup = el('g');
  svg.appendChild(hoverGroup);

  // ── Layer 3: drawn lines ──
  for (let r = 0; r < DOTS; r++) {
    for (let c = 0; c < BOXES; c++) {
      if (!state.hLines[r][c]) continue;
      const [x1, y1] = dotPos(r, c);
      const [x2, y2] = dotPos(r, c + 1);
      const isNew = animLine && animLine.type === 'h' && animLine.r === r && animLine.c === c;
      const lineColor = state.hLines[r][c] === 1 ? P0_COLOR : P1_COLOR;
      svg.appendChild(el('line', {
        x1, y1, x2, y2,
        stroke: lineColor, 'stroke-width': '5', 'stroke-linecap': 'round',
        class: isNew ? 'db-line-draw' : '',
      }));
    }
  }
  for (let r = 0; r < BOXES; r++) {
    for (let c = 0; c < DOTS; c++) {
      if (!state.vLines[r][c]) continue;
      const [x1, y1] = dotPos(r, c);
      const [x2, y2] = dotPos(r + 1, c);
      const isNew = animLine && animLine.type === 'v' && animLine.r === r && animLine.c === c;
      const lineColor = state.vLines[r][c] === 1 ? P0_COLOR : P1_COLOR;
      svg.appendChild(el('line', {
        x1, y1, x2, y2,
        stroke: lineColor, 'stroke-width': '5', 'stroke-linecap': 'round',
        class: isNew ? 'db-line-draw' : '',
      }));
    }
  }

  // ── Layer 4: dots ──
  for (let r = 0; r < DOTS; r++) {
    for (let c = 0; c < DOTS; c++) {
      const [cx, cy] = dotPos(r, c);
      svg.appendChild(el('circle', { cx, cy, r: '5', fill: '#1A0D04' }));
    }
  }

  // ── Layer 5: hit areas (only on my turn) ──
  const myTurn = !mp.active || state.current === mp.myIdx;
  if (state.winner !== -1 || !myTurn) return;

  for (let r = 0; r < DOTS; r++) {
    for (let c = 0; c < BOXES; c++) {
      if (state.hLines[r][c]) continue;
      const [x, y] = dotPos(r, c);
      const hit = el('rect', { x: x + 6, y: y - 13, width: CELL - 12, height: 26, fill: 'transparent', cursor: 'pointer' });
      const lr = r, lc = c;
      hit.addEventListener('click', () => drawLine('h', lr, lc));
      hit.addEventListener('mouseenter', () => { hoverLine = { type: 'h', r: lr, c: lc }; renderHover(hoverLine); });
      hit.addEventListener('mouseleave', () => { hoverLine = null; renderHover(null); });
      svg.appendChild(hit);
    }
  }
  for (let r = 0; r < BOXES; r++) {
    for (let c = 0; c < DOTS; c++) {
      if (state.vLines[r][c]) continue;
      const [x, y] = dotPos(r, c);
      const hit = el('rect', { x: x - 13, y: y + 6, width: 26, height: CELL - 12, fill: 'transparent', cursor: 'pointer' });
      const lr = r, lc = c;
      hit.addEventListener('click', () => drawLine('v', lr, lc));
      hit.addEventListener('mouseenter', () => { hoverLine = { type: 'v', r: lr, c: lc }; renderHover(hoverLine); });
      hit.addEventListener('mouseleave', () => { hoverLine = null; renderHover(null); });
      svg.appendChild(hit);
    }
  }
}

function renderHover(line) {
  if (!hoverGroup) return;
  hoverGroup.innerHTML = '';
  if (!line || state.winner !== -1) return;
  const myTurn = !mp.active || state.current === mp.myIdx;
  if (!myTurn || isLineTaken(line.type, line.r, line.c)) return;
  const { type, r, c } = line;
  const [x1, y1] = dotPos(r, c);
  const [x2, y2] = type === 'h' ? dotPos(r, c + 1) : dotPos(r + 1, c);
  hoverGroup.appendChild(el('line', {
    x1, y1, x2, y2,
    stroke: state.current === 0 ? P0_COLOR : P1_COLOR,
    'stroke-width': '5', 'stroke-linecap': 'round', opacity: '0.38',
  }));
}

// ─── UI UPDATES ──────────────────────────────────────────────
function updateUI(capturedThisTurn = false) {
  const dot   = document.getElementById('turn-dot');
  const label = document.getElementById('turn-label');
  const bar   = document.getElementById('message-bar');

  dot.className = 'turn-dot' + (state.current === 1 ? ' p1' : '');

  if (state.winner !== -1) {
    bar.textContent = '';
    bar.className = 'msg-bar';
    return;
  }

  const name = state.names[state.current];
  label.textContent = name + "'s Turn";

  if (mp.active && state.current !== mp.myIdx) {
    bar.textContent = 'Waiting for ' + name + '…';
    bar.className = 'msg-bar';
  } else if (capturedThisTurn) {
    bar.textContent = 'Box captured! Go again.';
    bar.className = 'msg-bar capture-msg';
  } else {
    bar.textContent = 'Click a line to draw it';
    bar.className = 'msg-bar';
  }

  document.getElementById('score-0').textContent = state.scores[0];
  document.getElementById('score-1').textContent = state.scores[1];
  document.getElementById('name-0').textContent  = state.names[0];
  document.getElementById('name-1').textContent  = state.names[1];
}

// ─── LOCAL GAME ──────────────────────────────────────────────
function startGame() {
  const n1 = document.getElementById('p1-name').value.trim() || 'Player 1';
  const n2 = document.getElementById('p2-name').value.trim() || 'Player 2';
  lvsSaveNames(n1, n2);
  mp.active = false;
  document.getElementById('my-color-badge').style.display = 'none';
  document.getElementById('restart-btn').style.display = '';
  initState([n1, n2]);
  showScreen('game');
  renderBoard();
  updateUI();
}

function handleRestart() {
  if (mp.active) return;
  initState(state.names);
  animLine = null; animBoxes = [];
  hoverLine = null; hoverGroup = null;
  renderBoard();
  updateUI();
}

function playAgain() {
  if (mp.active) {
    const btn = document.getElementById('win-again-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
    mp.ref.update({ ['ready' + mp.myIdx]: true });
    return;
  }
  const names = state ? state.names : ['Player 1', 'Player 2'];
  initState(names);
  animLine = null; animBoxes = [];
  hoverLine = null; hoverGroup = null;
  showScreen('game');
  renderBoard();
  updateUI();
}

function backToLobby() {
  lvsOnlineStop();
  if (mp.ref) {
    mp.ref.off();
    if (mp.code) db.ref('dots-rooms/' + mp.code).update({ status: 'done' }).catch(() => {});
  }
  mp.active = false; mp.ref = null; mp.code = null; mp.isHost = false;
  localStorage.removeItem('lvs_db_room');
  localStorage.removeItem('lvs_db_role');
  document.getElementById('my-color-badge').style.display = 'none';
  showScreen('lobby');
}

// ─── WIN SCREEN ──────────────────────────────────────────────
function downloadResultCard() {
  lvsDownloadCard({
    game: 'Dots & Boxes',
    names: state.names,
    scores: state.scores,
    scoreLabel: 'boxes',
    winner: state.winner,
  });
}

function showWin() {
  const wrap = document.getElementById('win-box-wrap');
  const lbl  = document.getElementById('win-label');
  const name = document.getElementById('win-name');
  const sub  = document.getElementById('win-sub');

  wrap.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'win-box';

  if (state.winner === 2) {
    box.style.background = 'linear-gradient(135deg, ' + P0_COLOR + ' 50%, ' + P1_COLOR + ' 50%)';
    lbl.textContent  = 'It\'s a Draw!';
    name.textContent = state.names[0] + ' & ' + state.names[1];
  } else {
    box.style.background = state.winner === 0 ? P0_COLOR : P1_COLOR;
    lbl.textContent  = 'Winner';
    name.textContent = state.names[state.winner];
  }
  wrap.appendChild(box);
  sub.textContent = 'Boxes: ' + state.scores[0] + ' – ' + state.scores[1];

  window._lvsWinPlayers = { names: state.names.slice(), winner: state.winner };
  showScreen('win');
  launchConfetti();
}

// ─── MULTIPLAYER ─────────────────────────────────────────────

function setOnlineMsg(msg, isErr = false) {
  const el = document.getElementById('online-msg');
  el.textContent = msg;
  el.className = 'online-msg' + (isErr ? ' error' : '');
}

function createRoom() {
  const name = document.getElementById('online-name').value.trim();
  if (!name) { setOnlineMsg('Enter your name first.', true); return; }
  lvsSaveNames(name, null);

  const code    = randomCode();
  const hostIdx = Math.floor(Math.random() * 2);
  mp.code   = code;
  mp.myIdx  = hostIdx;
  mp.isHost = true;

  const roomData = { host: name, guest: null, hostIdx, status: 'waiting' };
  db.ref('dots-rooms/' + code).set(roomData)
    .then(() => {
      localStorage.setItem('lvs_db_room', code);
      localStorage.setItem('lvs_db_role', 'host');
      document.getElementById('waiting-code').textContent = code;
      showScreen('waiting');

      mp.ref = db.ref('dots-rooms/' + code);
      mp.ref.on('value', snap => {
        const d = snap.val();
        if (d && d.status === 'playing') startOnlineGame(d);
      });
    })
    .catch(() => setOnlineMsg('Could not create room. Try again.', true));
}

function joinRoom() {
  const name = document.getElementById('online-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { setOnlineMsg('Enter your name first.', true); return; }
  if (code.length !== 4) { setOnlineMsg('Enter a 4-letter room code.', true); return; }
  lvsSaveNames(name, null);

  db.ref('dots-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d)                   { setOnlineMsg('Room not found.', true); return; }
    if (d.status !== 'waiting') { setOnlineMsg('That room is already in progress.', true); return; }

    mp.code   = code;
    mp.myIdx  = 1 - d.hostIdx;
    mp.isHost = false;

    localStorage.setItem('lvs_db_room', code);
    localStorage.setItem('lvs_db_role', 'guest');

    db.ref('dots-rooms/' + code).update({ guest: name, status: 'playing' })
      .then(() => startOnlineGame({ ...d, guest: name, status: 'playing' }));
  }).catch(() => setOnlineMsg('Could not join room. Try again.', true));
}

function startOnlineGame(data) {
  const names = data.hostIdx === 0
    ? [data.host, data.guest]
    : [data.guest, data.host];

  mp.active  = true;
  mp.isHost  = localStorage.getItem('lvs_db_role') === 'host';
  initState(names);

  const badge = document.getElementById('my-color-badge');
  badge.textContent = 'YOU: ' + (mp.myIdx === 0 ? 'ORANGE' : 'DARK');
  badge.className   = 'my-badge p' + mp.myIdx;
  badge.style.display = 'flex';
  document.getElementById('restart-btn').style.display = 'none';

  showScreen('game');
  renderBoard();
  updateUI();
  if (mp.ref) mp.ref.off();
  mp.ref = db.ref('dots-rooms/' + mp.code);
  lvsOnlineStart(mp.ref, mp.myIdx, backToLobby);
  mp.ref.on('value', snap => {
    const d = snap.val();
    if (d && d.status === 'playing' && d.hLines) { lvsOnlineUpdate(d); handleOnlineUpdate(d); }
    if (d && d.status === 'done' && state.winner === -1) backToLobby();
    if (d && d.ready0 === true && d.ready1 === true && mp.isHost) {
      const tmpNames = state ? state.names : ['Player 1', 'Player 2'];
      initState(tmpNames);
      animLine = null; animBoxes = [];
      const payload = encodeForFirebase();
      payload.ready0 = false;
      payload.ready1 = false;
      mp.ref.update(payload).catch(() => {});
    }
  });
}

function handleOnlineUpdate(d) {
  if (!state) return;
  decodeFromFirebase(d);
  animLine = null; animBoxes = [];
  // Opponent triggered a rematch — return to game screen
  if (state.winner === -1 && document.getElementById('screen-win').classList.contains('active')) {
    showScreen('game');
  }
  renderBoard();
  updateUI();
  if (state.winner !== -1) setTimeout(showWin, 300);
}

function syncToFirebase() {
  if (!mp.ref) return;
  const payload = encodeForFirebase();
  mp.ref.update(payload).catch(() => {});
}

function copyCode() {
  const btn = document.getElementById('copy-btn');
  lvsCopyLink(mp.code, btn, 'Copy Link');
}

// ─── RECONNECT ───────────────────────────────────────────────
(function tryReconnect() {
  const code = localStorage.getItem('lvs_db_room');
  const role = localStorage.getItem('lvs_db_role');
  if (!code || !role) return;

  db.ref('dots-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d || d.status !== 'playing') {
      localStorage.removeItem('lvs_db_room');
      localStorage.removeItem('lvs_db_role');
      return;
    }
    mp.code   = code;
    mp.myIdx  = role === 'host' ? d.hostIdx : 1 - d.hostIdx;
    mp.isHost = role === 'host';
    startOnlineGame(d);
  }).catch(() => {});
})();

// ─── SOUND ───────────────────────────────────────────────────

function playDraw() {
  if (isMuted()) return;
  try {
    const ctx = audioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
    osc.start(); osc.stop(ctx.currentTime + 0.13);
  } catch (_) {}
}

function playCapture() {
  if (isMuted()) return;
  try {
    const ctx = audioCtx();
    const freqs = [523.25, 659.25, 783.99];
    freqs.forEach((f, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.13, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t); osc.stop(t + 0.22);
    });
  } catch (_) {}
}

// ─── CONFETTI ────────────────────────────────────────────────
