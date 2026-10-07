const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Have more discs showing your colour than your opponent when the board is full or no moves remain.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Black moves first. Players alternate placing one disc per turn.</li>
    <li>A move is only valid if it <strong>flanks</strong> at least one opponent disc — your new disc and an existing disc of yours must form a straight line with opponent discs sandwiched between them.</li>
    <li>All flanked opponent discs flip to your colour.</li>
    <li>If you have no valid move, your turn is skipped.</li>
  </ol>
</div>
<div class="rs">
  <h3>How to Win</h3>
  <p>When neither player can move, count discs. The player with the most discs wins.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Corners are the most powerful squares — a disc placed there can never be flipped.</div>
`;

// ============================================================
// OTHELLO CORE LOGIC
// ============================================================
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

function getFlips(board, r, c, p) {
  if (board[r * 8 + c] !== -1) return [];
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === 1 - p) {
      line.push(nr * 8 + nc);
      nr += dr; nc += dc;
    }
    if (line.length && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === p) {
      flips.push(...line);
    }
  }
  return flips;
}

function getValidMoves(board, p) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8), c = i % 8;
    if (getFlips(board, r, c, p).length) moves.push(i);
  }
  return moves;
}

function applyMove(board, r, c, p) {
  const b = [...board];
  const flips = getFlips(b, r, c, p);
  b[r * 8 + c] = p;
  for (const i of flips) b[i] = p;
  return b;
}

function initialBoard() {
  const b = Array(64).fill(-1);
  b[27] = 1; b[28] = 0; b[35] = 0; b[36] = 1;
  return b;
}

function countPieces(board, p) {
  return board.filter(v => v === p).length;
}

function checkGameOver(board) {
  if (getValidMoves(board, 0).length === 0 && getValidMoves(board, 1).length === 0) {
    const c0 = countPieces(board, 0);
    const c1 = countPieces(board, 1);
    if (c0 > c1) return 0;
    if (c1 > c0) return 1;
    return 2; // tie
  }
  return -1;
}

// ============================================================
// SOUND ENGINE
// ============================================================
function _ctx() { return audioCtx(); }

function playPlace() {
  if (isMuted()) return;
  try {
    const ctx  = _ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (_) {}
}

function playFlipBurst() {
  if (isMuted()) return;
  try {
    const ctx = _ctx();
    const now = ctx.currentTime;
    [220, 330, 440].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.04;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  } catch (_) {}
}

function playChime() {
  if (isMuted()) return;
  try {
    const ctx = _ctx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch (_) {}
}

function playYourTurn() {
  if (isMuted()) return;
  try {
    const ctx = _ctx();
    const now = ctx.currentTime;
    [500, 750].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  } catch (_) {}
}

// ============================================================
// MULTIPLAYER STATE
// ============================================================
const mp = {
  active:  false,
  started: false,
  myIdx:   0,
  role:    null,
  ref:     null,
  code:    null,
};

// ============================================================
// GAME STATE
// ============================================================
const state = {
  board:      [],
  current:    0,
  winner:     -1,  // -1=ongoing, 0=p0 wins, 1=p1 wins, 2=tie
  players:    ['Player 1', 'Player 2'],
  validMoves: [],
};

// ============================================================
// RENDER
// ============================================================
function renderBoard() {
  const boardEl   = document.getElementById('othello-board');
  boardEl.innerHTML = '';

  const showMoves = state.winner === -1 && (!mp.active || state.current === mp.myIdx);
  const valid     = showMoves ? new Set(state.validMoves) : new Set();

  for (let i = 0; i < 64; i++) {
    const cell = document.createElement('div');
    cell.className = 'ot-cell';

    const v = state.board[i];
    if (v === 0 || v === 1) {
      const piece = document.createElement('div');
      piece.className = 'ot-piece p' + v;
      cell.appendChild(piece);
    } else if (valid.has(i)) {
      cell.classList.add('has-move');
      const dot = document.createElement('div');
      dot.className = 'ot-dot';
      cell.appendChild(dot);
    }

    if (valid.has(i)) {
      cell.addEventListener('click', () => onCellClick(i));
    }

    boardEl.appendChild(cell);
  }

  updateHUD();
}

function updateHUD() {
  const c0 = countPieces(state.board, 0);
  const c1 = countPieces(state.board, 1);
  document.getElementById('count-val-0').textContent = c0;
  document.getElementById('count-val-1').textContent = c1;
  document.getElementById('turn-label').textContent  = `${state.players[state.current]}'s Turn`;
  const dot = document.getElementById('turn-dot');
  if (dot) dot.className = 'turn-dot p' + state.current;
}

function setMsg(text, cls) {
  const bar = document.getElementById('message-bar');
  bar.className   = 'msg-bar' + (cls ? ' ' + cls : '');
  bar.textContent = text;
}

function updateTurnMsg() {
  if (mp.active) {
    setMsg(state.current === mp.myIdx
      ? 'Your turn — place a disc'
      : `Waiting for ${state.players[state.current]}…`);
  } else {
    setMsg(`${state.players[state.current]}'s turn — place a disc`);
  }
}

function setOnlineMsg(text, isError) {
  const el = document.getElementById('online-msg');
  el.textContent = text;
  el.className   = 'online-msg' + (isError ? ' error' : '');
}

// ============================================================
// CELL CLICK
// ============================================================
function onCellClick(i) {
  if (state.winner !== -1) return;
  if (mp.active && state.current !== mp.myIdx) return;
  if (!state.validMoves.includes(i)) return;

  const r = Math.floor(i / 8), c = i % 8;
  const flips   = getFlips(state.board, r, c, state.current);
  const newBoard = applyMove(state.board, r, c, state.current);
  state.board   = newBoard;

  playPlace();
  if (flips.length >= 3) setTimeout(playFlipBurst, 70);

  const winner = checkGameOver(newBoard);
  if (winner !== -1) {
    state.winner     = winner;
    state.validMoves = [];
    if (mp.active) syncToFirebase();
    renderBoard();
    setTimeout(() => showWinScreen(), 800);
    return;
  }

  const next      = 1 - state.current;
  const nextMoves = getValidMoves(newBoard, next);

  if (nextMoves.length > 0) {
    state.current    = next;
    state.validMoves = nextMoves;
  } else {
    // Next player must pass — current player keeps their turn
    state.validMoves = getValidMoves(newBoard, state.current);
  }

  if (mp.active) {
    syncToFirebase();
    renderBoard();
    updateTurnMsg();
  } else {
    renderBoard();
    // Show pass message when next player has no moves
    if (nextMoves.length === 0) {
      const passedName = state.players[next];
      setMsg(`${passedName} has no valid moves — ${state.players[state.current]} plays again!`, 'pass-msg');
    } else {
      updateTurnMsg();
    }
  }
}

// ============================================================
// LOCAL GAME FLOW
// ============================================================
function startGame() {
  const p1 = document.getElementById('p1-name').value.trim() || 'Player 1';
  const p2 = document.getElementById('p2-name').value.trim() || 'Player 2';
  lvsSaveNames(p1, p2);
  state.players = [p1, p2];

  const board = initialBoard();
  state.board      = board;
  state.current    = 0;
  state.winner     = -1;
  state.validMoves = getValidMoves(board, 0);

  document.getElementById('name-0').textContent       = p1;
  document.getElementById('name-1').textContent       = p2;
  document.getElementById('my-color-badge').style.display = 'none';
  document.getElementById('restart-btn').style.display    = '';

  renderBoard();
  showScreen('game');
  updateTurnMsg();
}

function resetGame() {
  const board = initialBoard();
  state.board      = board;
  state.current    = 0;
  state.winner     = -1;
  state.validMoves = getValidMoves(board, 0);
  renderBoard();
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
    if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
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
  mp.active  = false;
  mp.started = false;
  mp.ref     = null;
  mp.code    = null;

  localStorage.removeItem('lvs_ot_room');
  localStorage.removeItem('lvs_ot_role');

  state.winner     = -1;
  state.validMoves = [];
  document.getElementById('my-color-badge').style.display = 'none';
  showScreen('lobby');
}

// ============================================================
// WIN SCREEN
// ============================================================
function showWinScreen() {
  const w    = state.winner;
  const c0   = countPieces(state.board, 0);
  const c1   = countPieces(state.board, 1);
  const wrap = document.getElementById('win-piece-wrap');
  wrap.innerHTML = '';

  if (w === 2) {
    // Tie: show both discs
    const d0 = document.createElement('div');
    d0.className = 'ot-piece p0 win-disc';
    const d1 = document.createElement('div');
    d1.className = 'ot-piece p1 win-disc';
    wrap.appendChild(d0);
    wrap.appendChild(d1);
    document.getElementById('win-label').textContent = 'Draw!';
    document.getElementById('win-name').textContent  = 'Equal Discs';
    document.getElementById('win-sub').textContent   = `${c0} \u2013 ${c1}`;
  } else {
    const disc = document.createElement('div');
    disc.className = 'ot-piece p' + w + ' win-disc';
    wrap.appendChild(disc);
    document.getElementById('win-label').textContent = 'Winner';
    document.getElementById('win-name').textContent  = state.players[w];
    document.getElementById('win-sub').textContent   =
      `${w === 0 ? c0 : c1} \u2013 ${w === 0 ? c1 : c0} discs`;
  }

  window._lvsWinPlayers = { names: state.players.slice(), winner: w === 2 ? -1 : w };
  if (w !== 2) launchConfetti();
  showScreen('win');
}

// ============================================================
// ONLINE FLOW
// ============================================================

function createRoom() {
  const name    = document.getElementById('online-name').value.trim() || 'Player';
  lvsSaveNames(name, null);
  const code    = randomCode();
  const hostIdx = Math.floor(Math.random() * 2);
  const ref     = db.ref('othello-rooms/' + code);

  mp.active  = true;
  mp.started = false;
  mp.role    = 'host';
  mp.myIdx   = hostIdx;
  mp.ref     = ref;
  mp.code    = code;

  ref.set({
    host:    name,
    guest:   null,
    status:  'waiting',
    hostIdx,
    board:   initialBoard(),
    current: 0,
    winner:  -1,
    ready0:  false,
    ready1:  false,
  });

  localStorage.setItem('lvs_ot_room', code);
  localStorage.setItem('lvs_ot_role', 'host');

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

  if (code.length < 4) {
    setOnlineMsg('Enter a 4-letter room code', true);
    return;
  }

  setOnlineMsg('Joining\u2026', false);

  const ref = db.ref('othello-rooms/' + code);
  ref.once('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'waiting') {
      setOnlineMsg('Room not found \u2014 double-check the code', true);
      return;
    }

    mp.active  = true;
    mp.started = true;
    mp.role    = 'guest';
    mp.myIdx   = 1 - data.hostIdx;
    mp.ref     = ref;
    mp.code    = code;

    ref.update({ guest: name, status: 'playing' });

    localStorage.setItem('lvs_ot_room', code);
    localStorage.setItem('lvs_ot_role', 'guest');

    playChime();
    startOnlineGame({ ...data, guest: name });
  });
}

function decodeBoard(raw) {
  return [...Array(64)].map((_, i) => (raw[i] !== undefined ? Number(raw[i]) : -1));
}

function startOnlineGame(data) {
  const players = ['', ''];
  players[data.hostIdx]     = data.host;
  players[1 - data.hostIdx] = data.guest || '\u2026';

  const board   = data.board ? decodeBoard(data.board) : initialBoard();
  const current = data.current || 0;
  const winner  = data.winner !== undefined && data.winner !== null ? Number(data.winner) : -1;

  state.players    = players;
  state.board      = board;
  state.current    = current;
  state.winner     = winner;
  state.validMoves = winner === -1 ? getValidMoves(board, current) : [];

  document.getElementById('name-0').textContent = players[0];
  document.getElementById('name-1').textContent = players[1];

  const badge = document.getElementById('my-color-badge');
  badge.textContent    = mp.myIdx === 0 ? 'You: Orange' : 'You: Dark';
  badge.className      = 'my-badge p' + mp.myIdx;
  badge.style.display  = 'flex';

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
  const prevCurrent = state.current;
  const prevWinner  = state.winner;

  const players = ['', ''];
  players[d.hostIdx]     = d.host;
  players[1 - d.hostIdx] = d.guest || '\u2026';

  const board   = d.board ? decodeBoard(d.board) : initialBoard();
  const current = d.current || 0;
  const winner  = d.winner !== undefined && d.winner !== null ? Number(d.winner) : -1;

  state.players    = players;
  state.board      = board;
  state.current    = current;
  state.winner     = winner;
  state.validMoves = winner === -1 ? getValidMoves(board, current) : [];

  if (winner === -1 && current === mp.myIdx && prevCurrent !== mp.myIdx) {
    playYourTurn();
  }

  document.getElementById('name-0').textContent = players[0];
  document.getElementById('name-1').textContent = players[1];

  renderBoard();

  if (winner !== -1) {
    setTimeout(() => showWinScreen(), 800);
    return;
  }

  // Rematch reset — return to game screen
  if (prevWinner !== -1 && document.getElementById('screen-win').classList.contains('active')) {
    const btn = document.getElementById('win-again-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Play Again'; }
    showScreen('game');
  }

  if (d.ready0 === true && d.ready1 === true && mp.role === 'host') {
    mp.ref.update({
      board:   initialBoard(),
      current: 0,
      winner:  -1,
      status:  'playing',
      ready0:  false,
      ready1:  false,
    });
  }

  updateTurnMsg();
}

function syncToFirebase() {
  if (!mp.active || !mp.ref) return;
  mp.ref.update({
    board:   state.board,
    current: state.current,
    winner:  state.winner,
  });
}

function copyCode() {
  const btn = document.getElementById('copy-btn');
  lvsCopyLink(mp.code, btn, 'Copy Link');
}

// ============================================================
// RECONNECT ON REFRESH
// ============================================================
(function tryReconnect() {
  const code = localStorage.getItem('lvs_ot_room');
  const role = localStorage.getItem('lvs_ot_role');
  if (!code || !role) return;

  db.ref('othello-rooms/' + code).once('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'playing') {
      localStorage.removeItem('lvs_ot_room');
      localStorage.removeItem('lvs_ot_role');
      return;
    }

    mp.active  = true;
    mp.started = true;
    mp.role    = role;
    mp.myIdx   = role === 'host' ? data.hostIdx : 1 - data.hostIdx;
    mp.ref     = db.ref('othello-rooms/' + code);
    mp.code    = code;

    startOnlineGame(data);
  });
})();

// ============================================================
// CONFETTI
// ============================================================
