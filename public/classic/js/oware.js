const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Capture more seeds than your opponent. There are 48 seeds in total — the first to capture 25 or more wins.</p>
</div>
<div class="rs">
  <h3>Setup</h3>
  <p>The board has two rows of 6 pits. Each pit starts with 4 seeds. The row closest to you is your side.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Pick up all seeds from one of your pits and sow them one by one counter-clockwise into consecutive pits.</li>
    <li>Skip your original pit if sowing loops all the way around.</li>
  </ol>
</div>
<div class="rs">
  <h3>Capturing</h3>
  <p>If your last seed lands in an opponent's pit and brings it to exactly <strong>2 or 3 seeds</strong>, capture all seeds from that pit — and continue capturing backward through consecutive pits that also total 2 or 3.</p>
  <p><strong>Grand slam rule:</strong> You cannot capture if doing so would empty all of your opponent's pits.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Large pits (12+ seeds) lap the board — use them to seed your own side and set up future captures.</div>
`;

// ============================================================
// OWARE — Lash vs Seven
//
// Board:  12 pits  |  0–5 = P0 (bottom)  |  6–11 = P1 (top)
// Seeds:  48 total, 4 per pit at start, no store pits
// Sowing: counter-clockwise  →  index + 1 mod 12
// Capture: after sowing, if last seed lands on an opponent pit
//          with exactly 2 or 3 seeds, capture it; then check
//          the pit before it (going backwards) and keep
//          capturing while opponent pits have 2 or 3.
// Grand slam: a move that would starve the opponent is illegal
//             unless every legal move does so.
// Win:    first to capture ≥ 25 of the 48 seeds.
// ============================================================

// ── Pure game logic ──────────────────────────────────────────

function ownerOf(pit) { return pit < 6 ? 0 : 1; }

function initialPits() { return Array(12).fill(4); }

// Counter-clockwise sow sequence from pitIdx.
// When count ≥ 12 (a lap) the source pit is skipped on the way round.
function sowSequence(pitIdx, count) {
  const seq = [];
  const skipSelf = count >= 12;
  let slot = pitIdx;
  for (let i = 0; i < count; i++) {
    do { slot = (slot + 1) % 12; } while (skipSelf && slot === pitIdx);
    seq.push(slot);
  }
  return seq;
}

// Simulate sowing without mutating original.
function simulateSow(pits, pitIdx) {
  const p = [...pits];
  const count = p[pitIdx];
  p[pitIdx] = 0;
  const skipSelf = count >= 12;
  let slot = pitIdx;
  for (let i = 0; i < count; i++) {
    do { slot = (slot + 1) % 12; } while (skipSelf && slot === pitIdx);
    p[slot]++;
  }
  return p;
}

// Legal moves for player: own non-empty pits, grand-slam moves removed if possible.
function getLegalMoves(pits, player) {
  const start = player * 6;
  const moves = [];
  for (let i = start; i < start + 6; i++) {
    if (pits[i] > 0) moves.push(i);
  }
  if (!moves.length) return [];

  const oppStart = player === 0 ? 6 : 0;
  const safe = moves.filter(pitIdx => {
    const sim = simulateSow(pits, pitIdx);
    for (let j = oppStart; j < oppStart + 6; j++) {
      if (sim[j] > 0) return true;
    }
    return false; // this move starves opponent
  });
  return safe.length > 0 ? safe : moves; // if every move starves, all are legal
}

// Apply capture chain from lastSlot backwards through opponent pits with 2 or 3.
// Returns { pits, captured } (new objects, no mutation).
function applyCapture(pits, captured, lastSlot, player) {
  const p = [...pits];
  const c = [...captured];
  let slot = lastSlot;
  while (ownerOf(slot) !== player && (p[slot] === 2 || p[slot] === 3)) {
    c[player] += p[slot];
    p[slot] = 0;
    slot = (slot - 1 + 12) % 12;
  }
  return { pits: p, captured: c };
}

// Returns 0, 1, or -1.
function checkWin(captured) {
  if (captured[0] >= 25) return 0;
  if (captured[1] >= 25) return 1;
  return -1;
}

// Called when current player has no legal moves.
// Both players collect remaining seeds from their own side.
function finishGame(pits, captured) {
  const p = [...pits];
  const c = [...captured];
  for (let i = 0;  i < 6;  i++) { c[0] += p[i]; p[i] = 0; }
  for (let i = 6; i < 12; i++) { c[1] += p[i]; p[i] = 0; }
  return { pits: p, captured: c };
}

function decodeArr(raw, len) {
  return [...Array(len)].map((_, i) => raw && raw[i] !== undefined ? Number(raw[i]) : 0);
}

// ── Sound engine ──────────────────────────────────────────────

function playTick() {
  if (isMuted()) return;
  try {
    const ctx  = audioCtx();
    const buf  = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4) * 0.4;
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    src.connect(gain); gain.connect(ctx.destination);
    src.start();
  } catch (_) {}
}

function playCaptureSound() {
  if (isMuted()) return;
  try {
    const ctx = audioCtx(), now = ctx.currentTime;
    [350, 500, 700, 900].forEach((freq, i) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t); osc.stop(t + 0.18);
    });
  } catch (_) {}
}

function playChime() {
  if (isMuted()) return;
  try {
    const ctx = audioCtx(), now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.35);
    });
  } catch (_) {}
}

function playYourTurn() {
  if (isMuted()) return;
  try {
    const ctx = audioCtx(), now = ctx.currentTime;
    [500, 750].forEach((freq, i) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.start(t); osc.stop(t + 0.28);
    });
  } catch (_) {}
}

// ── Animation helpers ─────────────────────────────────────────

let animating = false;

function flashPit(idx, cls) {
  const el = document.getElementById('pit-' + idx);
  if (!el) return;
  el.classList.remove('receiving', 'emptied', 'captured');
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el && el.classList.remove(cls), 450);
}

// Seed layout per count:
//   1-3  → single row  (cols = count)
//   4    → 2×2 grid
//   5-6  → 3-col grid  (5 → 3+2, 6 → 3+3)
//   7-8  → 3-col grid  (7 → 3+3+1, 8 → 3+3+2)
//   9+   → plain number
function seedLayout(count) {
  const fs = document.body.classList.contains('is-fullscreen');
  if (fs) {
    if (count <= 3) return { cols: count, size: '42px' };
    if (count === 4) return { cols: 2,    size: '36px' };
    return                  { cols: 3,    size: '30px' };
  }
  if (count <= 3) return { cols: count, size: '15px' };
  if (count === 4) return { cols: 2,    size: '13px' };
  return                  { cols: 3,    size: '11px' };
}

function updatePitDisplay(idx) {
  const el = document.getElementById('pit-' + idx);
  if (!el) return;
  const count   = state.pits[idx];
  const countEl = el.querySelector('.pit-count');
  const seedsEl = el.querySelector('.pit-seeds');

  if (count > 0 && count <= 9) {
    if (countEl) countEl.style.display = 'none';
    if (seedsEl) {
      seedsEl.innerHTML = '';
      const { cols, size } = seedLayout(count);
      seedsEl.style.gridTemplateColumns = `repeat(${cols}, ${size})`;
      seedsEl.style.setProperty('--s', size);
      for (let i = 0; i < count; i++) {
        const s = document.createElement('div');
        s.className = 'stone';
        seedsEl.appendChild(s);
      }
    }
  } else {
    if (countEl) { countEl.style.display = ''; countEl.textContent = count; }
    if (seedsEl) { seedsEl.innerHTML = ''; seedsEl.style.gridTemplateColumns = ''; }
  }
}

function updateScoreDisplay() {
  const el0 = document.getElementById('score-0');
  const el1 = document.getElementById('score-1');
  if (el0) el0.textContent = state.captured[0];
  if (el1) el1.textContent = state.captured[1];
}

// ── Multiplayer state ─────────────────────────────────────────

const mp = {
  active:  false,
  started: false,
  myIdx:   0,
  role:    null,
  ref:     null,
  code:    null,
};

// ── Game state ────────────────────────────────────────────────

const state = {
  pits:     initialPits(),
  captured: [0, 0],
  current:  0,
  winner:   -1,
  players:  ['Player 1', 'Player 2'],
};

// ── Move execution ────────────────────────────────────────────

function onPitClick(pitIdx) {
  if (animating || state.winner !== -1) return;
  if (mp.active && state.current !== mp.myIdx) return;
  if (state.pits[pitIdx] === 0) return;
  if (ownerOf(pitIdx) !== state.current) return;
  if (!getLegalMoves(state.pits, state.current).includes(pitIdx)) return;

  animating = true;
  updateClickable();

  const count    = state.pits[pitIdx];
  const seq      = sowSequence(pitIdx, count);
  const interval = Math.max(80, 155 - count * 3);

  // Lift seeds from source pit
  state.pits[pitIdx] = 0;
  updatePitDisplay(pitIdx);
  flashPit(pitIdx, 'emptied');

  // Drop one seed at a time
  seq.forEach((slot, i) => {
    setTimeout(() => {
      state.pits[slot]++;
      updatePitDisplay(slot);
      flashPit(slot, 'receiving');
      playTick();

      if (i === seq.length - 1) {
        setTimeout(() => resolveAfterSow(slot), 300);
      }
    }, (i + 1) * interval);
  });
}

function resolveAfterSow(lastSlot) {
  const player = state.current;

  // Determine which pits will be captured before applying
  const captured_pits = [];
  let slot = lastSlot;
  while (ownerOf(slot) !== player && (state.pits[slot] === 2 || state.pits[slot] === 3)) {
    captured_pits.push(slot);
    slot = (slot - 1 + 12) % 12;
  }

  if (captured_pits.length > 0) {
    captured_pits.forEach(s => flashPit(s, 'captured'));
    playCaptureSound();

    setTimeout(() => {
      const result = applyCapture(state.pits, state.captured, lastSlot, player);
      state.pits     = result.pits;
      state.captured = result.captured;
      for (let i = 0; i < 12; i++) updatePitDisplay(i);
      updateScoreDisplay();
      setTimeout(() => finishTurn(), 280);
    }, 420);
  } else {
    finishTurn();
  }
}

function finishTurn() {
  // Check if someone just hit 25+
  const earlyWinner = checkWin(state.captured);
  if (earlyWinner !== -1) {
    state.winner = earlyWinner;
    endGame();
    return;
  }

  // Hand off to opponent
  state.current = 1 - state.current;

  // If new current player has no moves, game ends
  if (getLegalMoves(state.pits, state.current).length === 0) {
    const result = finishGame(state.pits, state.captured);
    state.pits     = result.pits;
    state.captured = result.captured;
    for (let i = 0; i < 12; i++) updatePitDisplay(i);
    updateScoreDisplay();
    const c = state.captured;
    state.winner = c[0] > c[1] ? 0 : c[1] > c[0] ? 1 : 2;
    endGame();
    return;
  }

  animating = false;
  if (mp.active) syncToFirebase();
  renderBoard();
  updateTurnMsg();
  if (mp.active && state.current === mp.myIdx) playYourTurn();
}

function endGame() {
  animating = false;
  if (mp.active) syncToFirebase();
  renderBoard();
  setTimeout(() => showWinScreen(), 900);
}

// ── Render ────────────────────────────────────────────────────

function renderBoard() {
  for (let i = 0; i < 12; i++) updatePitDisplay(i);
  updateScoreDisplay();
  updateClickable();
  updateHUD();
}

function updateClickable() {
  const legal = (state.winner === -1 && !animating)
    ? getLegalMoves(state.pits, state.current)
    : [];

  for (let i = 0; i < 12; i++) {
    const el = document.getElementById('pit-' + i);
    if (!el) continue;
    const isLegal = legal.includes(i) && (!mp.active || mp.myIdx === state.current);
    el.classList.toggle('clickable', isLegal);
  }
}

function updateHUD() {
  document.getElementById('turn-label').textContent = `${state.players[state.current]}'s Turn`;
  const dot = document.getElementById('turn-dot');
  if (dot) dot.className = 'turn-dot' + (state.current === 1 ? ' p1' : '');
}

function setMsg(text, cls) {
  const bar = document.getElementById('message-bar');
  bar.className   = 'msg-bar' + (cls ? ' ' + cls : '');
  bar.textContent = text;
}

function updateTurnMsg() {
  if (mp.active) {
    setMsg(state.current === mp.myIdx
      ? 'Your turn — pick a pit'
      : `Waiting for ${state.players[state.current]}…`);
  } else {
    setMsg(`${state.players[state.current]}'s turn — pick a pit`);
  }
}

function setOnlineMsg(text, isError) {
  const el = document.getElementById('online-msg');
  if (!el) return;
  el.textContent = text;
  el.className   = 'form-msg' + (isError ? ' error' : '');
}

// ── Local game flow ───────────────────────────────────────────

function startGame() {
  const p1 = document.getElementById('p1-name').value.trim() || 'Player 1';
  const p2 = document.getElementById('p2-name').value.trim() || 'Player 2';
  lvsSaveNames(p1, p2);
  resetState(p1, p2);
  showScreen('game');
  updateTurnMsg();
  lvsFsShow();
}

function resetState(p1, p2) {
  state.players  = [p1 || state.players[0], p2 || state.players[1]];
  state.pits     = initialPits();
  state.captured = [0, 0];
  state.current  = 0;
  state.winner   = -1;
  animating      = false;

  document.getElementById('name-0').textContent = state.players[0];
  document.getElementById('name-1').textContent = state.players[1];
  document.getElementById('my-color-badge').style.display = 'none';
  document.getElementById('restart-btn').style.display    = '';
  lvsFsHide();

  renderBoard();
}

function resetGame() {
  resetState(state.players[0], state.players[1]);
  showScreen('game');
  updateTurnMsg();
}

function handleRestart() {
  if (mp.active) { backToLobby(); return; }
  resetGame();
}

function playAgain() {
  if (mp.active) {
    const btn = document.getElementById('win-again-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting…'; }
    mp.ref.update({ ['ready' + mp.myIdx]: true });
    return;
  }
  resetGame();
}

function backToLobby() {
  lvsOnlineStop();
  if (mp.ref) {
    mp.ref.off();
    if (state.winner === -1) mp.ref.update({ status: 'done' }).catch(() => {});
  }
  Object.assign(mp, { active: false, started: false, ref: null, code: null });
  animating    = false;
  state.winner = -1;

  localStorage.removeItem('lvs_ow_room');
  localStorage.removeItem('lvs_ow_role');

  document.getElementById('my-color-badge').style.display = 'none';
  showScreen('lobby');
}

// ── Win screen ────────────────────────────────────────────────

function showWinScreen() {
  const w  = state.winner;
  const c0 = state.captured[0];
  const c1 = state.captured[1];

  const wrap = document.getElementById('win-stone-wrap');
  wrap.innerHTML = '';

  if (w !== 2) {
    const stone = document.createElement('div');
    stone.className = 'win-stone p' + w;
    wrap.appendChild(stone);
  } else {
    ['p0', 'p1'].forEach(cls => {
      const s = document.createElement('div');
      s.className = 'win-stone ' + cls;
      wrap.appendChild(s);
    });
  }

  if (w === 2) {
    document.getElementById('win-label').textContent = 'Draw!';
    document.getElementById('win-name').textContent  = 'Equal Seeds';
  } else {
    document.getElementById('win-label').textContent = 'Winner';
    document.getElementById('win-name').textContent  = state.players[w];
  }
  document.getElementById('win-sub').textContent = `${c0} – ${c1} seeds`;

  if (w !== 2) launchConfetti();
  showScreen('win');
}

// ── Online flow ───────────────────────────────────────────────

function createRoom() {
  const name    = document.getElementById('online-name').value.trim() || 'Player';
  lvsSaveNames(name, null);
  const code    = randomCode();
  const hostIdx = Math.floor(Math.random() * 2);
  const ref     = db.ref('oware-rooms/' + code);

  Object.assign(mp, { active: true, started: false, role: 'host', myIdx: hostIdx, ref, code });

  ref.set({
    host:     name,
    guest:    null,
    status:   'waiting',
    hostIdx,
    pits:     initialPits(),
    captured: [0, 0],
    current:  0,
    winner:   -1,
    ready0:   false,
    ready1:   false,
  });

  localStorage.setItem('lvs_ow_room', code);
  localStorage.setItem('lvs_ow_role', 'host');

  document.getElementById('waiting-code').textContent = code;
  document.getElementById('copy-btn').textContent     = 'Copy Link';
  showScreen('waiting');

  ref.on('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'playing') return;
    if (!mp.started) { mp.started = true; playChime(); startOnlineGame(data); }
  });
}

function joinRoom() {
  const name = document.getElementById('online-name').value.trim() || 'Player';
  lvsSaveNames(name, null);
  const code = document.getElementById('join-code').value.trim().toUpperCase();

  if (code.length < 4) { setOnlineMsg('Enter a 4-letter room code', true); return; }
  setOnlineMsg('Joining…', false);

  const ref = db.ref('oware-rooms/' + code);
  ref.once('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'waiting') {
      setOnlineMsg('Room not found — double-check the code', true);
      return;
    }
    Object.assign(mp, {
      active: true, started: true, role: 'guest',
      myIdx: 1 - data.hostIdx, ref, code,
    });
    ref.update({ guest: name, status: 'playing' });
    localStorage.setItem('lvs_ow_room', code);
    localStorage.setItem('lvs_ow_role', 'guest');
    playChime();
    startOnlineGame({ ...data, guest: name });
  });
}

function startOnlineGame(data) {
  const players = ['', ''];
  players[data.hostIdx]     = data.host;
  players[1 - data.hostIdx] = data.guest || '…';

  state.players  = players;
  state.pits     = decodeArr(data.pits, 12);
  state.captured = decodeArr(data.captured, 2);
  state.current  = data.current  || 0;
  state.winner   = data.winner !== undefined ? Number(data.winner) : -1;
  animating      = false;

  document.getElementById('name-0').textContent = players[0];
  document.getElementById('name-1').textContent = players[1];

  const badge = document.getElementById('my-color-badge');
  badge.textContent   = mp.myIdx === 0 ? 'You: Bottom' : 'You: Top';
  badge.className     = 'my-badge p' + mp.myIdx;
  badge.style.display = 'flex';
  document.getElementById('restart-btn').style.display = 'none';

  renderBoard();
  showScreen('game');
  updateTurnMsg();
  lvsOnlineStart(mp.ref, mp.myIdx, backToLobby);

  mp.ref.off();
  mp.ref.on('value', snap => {
    const d = snap.val();
    if (!d || d.status !== 'playing') return;
    lvsOnlineUpdate(d);
    handleOnlineUpdate(d);
  });
}

function handleOnlineUpdate(d) {
  if (animating) return;
  const prevCurrent = state.current;
  const prevWinner  = state.winner;

  const players = ['', ''];
  players[d.hostIdx]     = d.host;
  players[1 - d.hostIdx] = d.guest || '…';

  state.players  = players;
  state.pits     = decodeArr(d.pits, 12);
  state.captured = decodeArr(d.captured, 2);
  state.current  = d.current  || 0;
  state.winner   = d.winner !== undefined ? Number(d.winner) : -1;

  if (state.winner === -1 && state.current === mp.myIdx && prevCurrent !== mp.myIdx) {
    playYourTurn();
  }

  document.getElementById('name-0').textContent = players[0];
  document.getElementById('name-1').textContent = players[1];
  renderBoard();

  if (state.winner !== -1) {
    setTimeout(() => showWinScreen(), 800);
    return;
  }

  // Handle play-again handshake
  if (prevWinner !== -1 && document.getElementById('screen-win').classList.contains('active')) {
    const btn = document.getElementById('win-again-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Play Again'; }
    showScreen('game');
  }

  if (d.ready0 === true && d.ready1 === true && mp.role === 'host') {
    mp.ref.update({
      pits:     initialPits(),
      captured: [0, 0],
      current:  0,
      winner:   -1,
      status:   'playing',
      ready0:   false,
      ready1:   false,
    });
  }

  updateTurnMsg();
}

function syncToFirebase() {
  if (!mp.active || !mp.ref) return;
  mp.ref.update({
    pits:     state.pits,
    captured: state.captured,
    current:  state.current,
    winner:   state.winner,
  });
}

function copyCode() {
  lvsCopyLink(mp.code, document.getElementById('copy-btn'), 'Copy Link');
}

// ── Reconnect on page refresh ─────────────────────────────────

(function tryReconnect() {
  const code = localStorage.getItem('lvs_ow_room');
  const role = localStorage.getItem('lvs_ow_role');
  if (!code || !role) return;

  db.ref('oware-rooms/' + code).once('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'playing') {
      localStorage.removeItem('lvs_ow_room');
      localStorage.removeItem('lvs_ow_role');
      return;
    }
    Object.assign(mp, {
      active:  true,
      started: true,
      role,
      myIdx:   role === 'host' ? data.hostIdx : 1 - data.hostIdx,
      ref:     db.ref('oware-rooms/' + code),
      code,
    });
    startOnlineGame(data);
  });
})();

// ── Fullscreen ────────────────────────────────────────────────
// Re-render seeds at the new size whenever entering/leaving fullscreen
function lvsFsOnChange() { renderBoard(); }
