const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Be the first to connect four of your pieces in a line — horizontally, vertically, or diagonally.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Players take turns dropping a piece into any column.</li>
    <li>Pieces fall to the lowest available row in that column.</li>
    <li>A full column cannot be played.</li>
  </ol>
</div>
<div class="rs">
  <h3>How to Win</h3>
  <p>Connect four of your pieces in any straight line. First to do it wins.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Control the centre columns — they give you the most potential connections in every direction.</div>
`;

/* ============================================================
   CONNECT FOUR — Lash vs Seven
   ============================================================ */

const ROWS = 6, COLS = 7;

// ─── module state ───────────────────────────────────────────────
let mode     = 'local';    // 'local' | 'online'
let myIdx    = 0;
let isHost   = false;
let roomRef  = null;
let roomCode = null;
let gd       = null;
let animating = false;
let hoveredCol = -1;

// Local game state (also mirrors Firebase snapshot in online mode)
let board    = [];  // flat [ROWS*COLS], 0=empty, 1=P0, 2=P1
let current  = 0;   // whose turn: 0 or 1
let winner   = -1;  // -1=playing, 0=P0, 1=P1, 2=draw
let names    = ['Player 1', 'Player 2'];
let scores   = [0, 0];
let lastDrop = -1;  // index of last dropped cell for animation

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

// ─── board helpers ─────────────────────────────────────────────
function emptyBoard() {
  return Array(ROWS * COLS).fill(0);
}

function getDropRow(b, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r * COLS + col] === 0) return r;
  }
  return -1;
}

function findWinningCells(b, player) {
  const p = player + 1;
  const dirs = [[0,1],[1,0],[1,1],[-1,1]];
  for (const [dr, dc] of dirs) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cells = [];
        for (let k = 0; k < 4; k++) {
          const nr = r + dr*k, nc = c + dc*k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (b[nr*COLS + nc] !== p) break;
          cells.push(nr*COLS + nc);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

function isBoardFull(b) {
  return b.every(v => v !== 0);
}

// ─── render ────────────────────────────────────────────────────
function buildBoard() {
  const boardEl   = document.getElementById('c4-board');
  const previewEl = document.getElementById('c4-preview');
  boardEl.innerHTML   = '';
  previewEl.innerHTML = '';

  // Preview cells
  for (let c = 0; c < COLS; c++) {
    const prev = document.createElement('div');
    prev.className = 'c4-preview-cell';
    prev.dataset.col = c;
    const arrow = document.createElement('div');
    arrow.className = 'c4-arrow';
    prev.appendChild(arrow);
    previewEl.appendChild(prev);
  }

  // Board cells (row-major for CSS grid)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className  = 'c4-cell';
      cell.id         = `c4-${r}-${c}`;
      cell.dataset.col = c;
      boardEl.appendChild(cell);
    }
  }

  attachBoardListeners();
}

function renderBoard(winCells) {
  const isMyTurn = mode === 'local' || (winner === -1 && current === myIdx);
  const boardEl  = document.getElementById('c4-board');

  boardEl.classList.toggle('my-turn', isMyTurn && winner === -1);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx  = r * COLS + c;
      const cell = document.getElementById(`c4-${r}-${c}`);
      if (!cell) continue;
      const val = board[idx];
      cell.className = 'c4-cell';
      if (val === 1) cell.classList.add('p0');
      else if (val === 2) cell.classList.add('p1');
      if (idx === lastDrop) {
        const bRect = boardEl?.getBoundingClientRect();
        const cRect = cell.getBoundingClientRect();
        if (bRect && cRect.height) {
          // Distance from board's top edge to this cell (piece enters from above)
          const dist = Math.round(cRect.top - bRect.top + cRect.height);
          // Duration: sqrt-proportional to distance so deeper rows feel heavier
          const dur  = Math.max(160, Math.round(Math.sqrt(dist) * 17));
          cell.style.setProperty('--drop-dist', dist + 'px');
          cell.style.setProperty('--drop-dur',  dur  + 'ms');
        }
        cell.classList.add('dropping');
      }
      if (hoveredCol >= 0 && c === hoveredCol) cell.classList.add('hover-col');
      if (winCells && winCells.includes(idx)) cell.classList.add('winning');
    }
  }

  // Preview row
  updatePreview();
  // Turn dot & label
  updateTurnUI();
}

function updatePreview() {
  const isMyTurn = mode === 'local' || (winner === -1 && current === myIdx);
  const previewEl = document.getElementById('c4-preview');
  if (!previewEl) return;
  previewEl.querySelectorAll('.c4-preview-cell').forEach(cell => {
    const col = parseInt(cell.dataset.col);
    const colFull = getDropRow(board, col) === -1;
    cell.classList.remove('active', 'p0', 'p1');
    if (!colFull && isMyTurn && winner === -1 && col === hoveredCol) {
      cell.classList.add('active', current === 0 ? 'p0' : 'p1');
    }
  });
}

function updateTurnUI() {
  const dot   = document.getElementById('turn-dot');
  const label = document.getElementById('turn-label');
  if (!dot || !label) return;
  if (winner !== -1) return;
  dot.style.background = current === 0 ? 'var(--p0)' : 'var(--p1)';
  const isMyTurn = mode === 'local' || current === myIdx;
  label.textContent = isMyTurn
    ? (mode === 'local' ? names[current] + "'s Turn" : 'Your Turn')
    : names[current] + "'s Turn";
}

function updateScoreUI() {
  document.getElementById('score-num-0').textContent = scores[0];
  document.getElementById('score-num-1').textContent = scores[1];
}

// ─── board event listeners ──────────────────────────────────────
function attachBoardListeners() {
  const boardEl   = document.getElementById('c4-board');
  const previewEl = document.getElementById('c4-preview');

  boardEl.addEventListener('click', e => {
    const cell = e.target.closest('.c4-cell');
    if (!cell) return;
    handleDrop(parseInt(cell.dataset.col));
  });
  boardEl.addEventListener('mousemove', e => {
    const cell = e.target.closest('.c4-cell');
    const col  = cell ? parseInt(cell.dataset.col) : -1;
    if (col !== hoveredCol) { hoveredCol = col; renderBoard(); }
  });
  boardEl.addEventListener('mouseleave', () => {
    if (hoveredCol !== -1) { hoveredCol = -1; renderBoard(); }
  });

  previewEl.addEventListener('click', e => {
    const cell = e.target.closest('.c4-preview-cell');
    if (cell) handleDrop(parseInt(cell.dataset.col));
  });
  previewEl.addEventListener('mousemove', e => {
    const cell = e.target.closest('.c4-preview-cell');
    const col  = cell ? parseInt(cell.dataset.col) : -1;
    if (col !== hoveredCol) { hoveredCol = col; updatePreview(); }
  });
  previewEl.addEventListener('mouseleave', () => {
    if (hoveredCol !== -1) { hoveredCol = -1; updatePreview(); }
  });
}

// ─── drop logic ────────────────────────────────────────────────
function handleDrop(col) {
  if (animating || winner !== -1) return;
  if (mode === 'online' && current !== myIdx) return;

  const row = getDropRow(board, col);
  if (row === -1) return;

  const newBoard  = [...board];
  newBoard[row * COLS + col] = current + 1;
  const winCells  = findWinningCells(newBoard, current);
  const newWinner = winCells ? current : isBoardFull(newBoard) ? 2 : -1;
  const nextTurn  = newWinner === -1 ? 1 - current : current;

  lastDrop = row * COLS + col;
  animating = true;

  if (mode === 'local') {
    board   = newBoard;
    current = nextTurn;
    winner  = newWinner;
    if (newWinner !== -1) {
      if (newWinner !== 2) scores[newWinner]++;
      updateScoreUI();
    }
    renderBoard(winCells || undefined);
    // Read the duration renderBoard just wrote, then clear both guards after it elapses
    const dropCell = document.getElementById(`c4-${row}-${col}`);
    const dropDur  = parseInt(dropCell?.style.getPropertyValue('--drop-dur')) || 320;
    setTimeout(() => { animating = false; lastDrop = -1; }, dropDur + 40);
    if (newWinner !== -1) setTimeout(() => endGame(newWinner, winCells), 800);
    else playDrop();
  } else {
    const newScores = [...scores];
    if (newWinner !== -1 && newWinner !== 2) newScores[newWinner]++;
    db.ref('connect4-rooms/' + roomCode).update({
      board: newBoard,
      current: nextTurn,
      winner: newWinner,
      scores: newScores,
      lastDrop: row * COLS + col,
    });
    playDrop();
  }
}

// ─── local game ────────────────────────────────────────────────
function startLocal() {
  const n0 = document.getElementById('p1-name').value.trim() || 'Player 1';
  const n1 = document.getElementById('p2-name').value.trim() || 'Player 2';
  lvsSaveNames(n0, n1);
  names  = [n0, n1];
  mode   = 'local';
  myIdx  = 0;
  scores = [0, 0];
  initGame();
  lvsFsShow();
}

function initGame() {
  board   = emptyBoard();
  current = 0;
  winner  = -1;
  lastDrop = -1;
  hoveredCol = -1;
  animating  = false;

  document.getElementById('score-name-0').textContent = names[0];
  document.getElementById('score-name-1').textContent = names[1];
  updateScoreUI();
  showScreen('game');
  buildBoard();
  renderBoard();
  setMsg('');
}

// ─── restart ───────────────────────────────────────────────────
function handleRestart() {
  if (mode === 'local') {
    initGame();
    return;
  }
  if (!isHost) { setMsg('Only the host can restart'); return; }
  db.ref('connect4-rooms/' + roomCode).update({
    board:    emptyBoard(),
    current:  0,
    winner:   -1,
    lastDrop: -1,
  });
}

// ─── game over ─────────────────────────────────────────────────
function downloadResultCard() {
  lvsDownloadCard({
    game: 'Connect Four',
    names: names,
    winner: winner,
    result: winner === 2 ? 'Full board' : 'Connected Four',
  });
}

function endGame(w, winCells) {
  const winPiece = document.getElementById('win-piece');
  const winName  = document.getElementById('win-name');
  const winSub   = document.getElementById('win-sub');

  winPiece.className = 'win-piece';
  if (w === 2) {
    winName.textContent = "It's a draw!";
    winSub.textContent  = 'The board is full';
    winPiece.style.display = 'none';
  } else {
    winPiece.style.display = '';
    winPiece.classList.add(w === 0 ? 'p0' : 'p1');
    if (mode === 'online' && w === myIdx) {
      winName.textContent = 'You win! 🎉';
    } else {
      winName.textContent = names[w] + ' wins!';
    }
    winSub.textContent = 'Connected four';
    launchConfetti();
  }
  window._lvsWinPlayers = { names: names.slice(), winner: w };
  showScreen('win');
}

// ─── online: create room ────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('online-name').value.trim();
  if (!name) { setOnlineMsg('Enter your name first.', true); return; }

  const code    = randomCode();
  const hostIdx = Math.floor(Math.random() * 2);
  roomCode = code; myIdx = hostIdx; isHost = true;
  localStorage.setItem('lvs_c4_room', code);
  localStorage.setItem('lvs_c4_role', 'host');
  lvsSaveNames(name, '');

  db.ref('connect4-rooms/' + code).set({
    host: name, guest: null, hostIdx,
    board:    emptyBoard(),
    current:  0,
    winner:   -1,
    lastDrop: -1,
    scores:   [0, 0],
    status:   'waiting',
  }).then(() => {
    document.getElementById('waiting-code').textContent = code;
    showScreen('waiting');
    attachListener();
  }).catch(() => setOnlineMsg('Could not create room.', true));
}

// ─── online: join room ──────────────────────────────────────────
function joinRoom() {
  const name = document.getElementById('online-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { setOnlineMsg('Enter your name first.', true); return; }
  if (code.length !== 4) { setOnlineMsg('Enter a 4-letter code.', true); return; }

  db.ref('connect4-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d)                     { setOnlineMsg('Room not found.', true); return; }
    if (d.status !== 'waiting') { setOnlineMsg('Game already started.', true); return; }
    if (d.guest)                { setOnlineMsg('Room is full.', true); return; }

    roomCode = code; myIdx = 1 - (d.hostIdx || 0); isHost = false;
    localStorage.setItem('lvs_c4_room', code);
    localStorage.setItem('lvs_c4_role', 'guest');
    lvsSaveNames(name, '');

    db.ref('connect4-rooms/' + code).update({ guest: name, status: 'playing' })
      .then(() => { attachListener(); })
      .catch(() => setOnlineMsg('Could not join room.', true));
  }).catch(() => setOnlineMsg('Could not reach server.', true));
}

// ─── Firebase listener ─────────────────────────────────────────
function attachListener() {
  if (roomRef) roomRef.off();
  roomRef = db.ref('connect4-rooms/' + roomCode);
  roomRef.on('value', snap => {
    const d = snap.val();
    if (!d) return;
    gd = d;

    if (d.status === 'waiting') return;
    lvsOnlineUpdate(d);

    // Set names once both players are in
    const hostIdx = d.hostIdx || 0;
    names[hostIdx]     = d.host;
    names[1 - hostIdx] = d.guest || '…';
    mode = 'online';

    // If we're on waiting screen, switch to game
    const active = document.querySelector('.screen.active')?.id;
    if (active === 'screen-waiting' || active === 'screen-online') {
      scores = d.scores || [0, 0];
      lvsOnlineStart(roomRef, myIdx, backToLobby);
      initGame();
    }

    // Sync state
    const prevWinner = winner;
    board    = d.board || emptyBoard();
    current  = d.current ?? 0;
    winner   = d.winner ?? -1;
    scores   = d.scores || [0, 0];
    lastDrop = d.lastDrop ?? -1;

    updateScoreUI();

    const winCells = winner !== -1 && winner !== 2 ? findWinningCells(board, winner) : null;
    renderBoard(winCells || undefined);

    // Clear the drop animation marker after it plays so mousemove can't restart it
    if (lastDrop !== -1) {
      const dr = Math.floor(lastDrop / COLS), dc = lastDrop % COLS;
      const dropCell = document.getElementById(`c4-${dr}-${dc}`);
      const dropDur  = parseInt(dropCell?.style.getPropertyValue('--drop-dur')) || 320;
      setTimeout(() => { lastDrop = -1; animating = false; }, dropDur + 40);
    }

    if (winner !== -1 && prevWinner === -1) {
      setTimeout(() => endGame(winner, winCells), 800);
    }

    // Play Again reset — return to game screen
    if (winner === -1 && prevWinner !== -1 &&
        document.getElementById('screen-win').classList.contains('active')) {
      showScreen('game');
      setMsg('');
    }

    if (d.ready0 === true && d.ready1 === true && isHost) {
      db.ref('connect4-rooms/' + roomCode).update({
        board:    emptyBoard(),
        current:  0,
        winner:   -1,
        lastDrop: -1,
        ready0:   false,
        ready1:   false,
      });
    }
  });
}

// ─── navigation ────────────────────────────────────────────────
function playAgain() {
  if (mode === 'local') {
    initGame();
    return;
  }
  const btn = document.getElementById('win-again-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
  db.ref('connect4-rooms/' + roomCode).update({ ['ready' + myIdx]: true });
}

function backToLobby() {
  lvsFsHide();
  lvsOnlineStop();
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (roomCode) {
    db.ref('connect4-rooms/' + roomCode).update({ status: 'done' }).catch(() => {});
  }
  localStorage.removeItem('lvs_c4_room');
  localStorage.removeItem('lvs_c4_role');
  roomCode = null;
  showScreen('lobby');
}

function copyCode() {
  const btn = document.getElementById('waiting-copy-btn');
  lvsCopyLink(roomCode, btn, 'Copy Link');
}

// ─── reconnect ─────────────────────────────────────────────────
(function tryReconnect() {
  const code = localStorage.getItem('lvs_c4_room');
  const role = localStorage.getItem('lvs_c4_role');
  if (!code || !role) return;

  db.ref('connect4-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d || d.status === 'done' || d.status === 'waiting') {
      localStorage.removeItem('lvs_c4_room');
      localStorage.removeItem('lvs_c4_role');
      return;
    }
    roomCode = code;
    isHost   = role === 'host';
    myIdx    = isHost ? (d.hostIdx || 0) : 1 - (d.hostIdx || 0);
    attachListener();
  }).catch(() => {});
})();

// ─── sound ─────────────────────────────────────────────────────

function playDrop() {
  if (isMuted()) return;
  try {
    const ctx  = audioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(); osc.stop(ctx.currentTime + 0.16);
  } catch (_) {}
}

// ─── confetti ──────────────────────────────────────────────────
