const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Be the first player to get three of your marks in a row — horizontally, vertically, or diagonally.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Players take turns placing their mark (X or O) on the 3×3 grid.</li>
    <li>Tap any empty square to place your mark.</li>
    <li>The first player to align three marks in a row wins.</li>
  </ol>
</div>
<div class="rs">
  <h3>Draw</h3>
  <p>If all nine squares are filled with no winner, the game is a draw.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> The center square gives you the most winning paths. Take it first when you can.</div>
`;

// ============================================================
// CONSTANTS
// ============================================================
const WINNING_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6]           // diagonals
];

const PIECE_LABELS = ['X', 'O'];

// X line length in viewBox 0 0 80 80: (18,18)→(62,62) = 44√2 ≈ 62.2
// O circumference: 2π×25 ≈ 157.1
function makePieceSVG(player, large, animate = true) {
  const base = large ? 'piece-svg piece-svg-large' : 'piece-svg';
  const cls  = animate ? base : base + ' no-anim';
  if (player === 0) {
    return `<svg class="${cls} piece-x" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-label="X">
      <line class="x-stroke x-1" x1="18" y1="18" x2="62" y2="62"/>
      <line class="x-stroke x-2" x1="62" y1="18" x2="18" y2="62"/>
    </svg>`;
  } else {
    return `<svg class="${cls} piece-o" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-label="O">
      <circle class="o-stroke" cx="40" cy="40" r="25" transform="rotate(-90 40 40)"/>
    </svg>`;
  }
}


// ============================================================
// STATE
// ============================================================
const state = {
  players:      ['Player 1', 'Player 2'],
  board:        Array(9).fill(null), // null | 0 | 1
  current:      0,                   // 0=X host, 1=O guest
  winner:       null,                // null | 0 | 1 | 'draw'
  winLine:      null,
  scores:       [0, 0],
  lastPlaced:   null,                // index of the most recently placed piece
  roundStarter: 0,                   // who started the current round (alternates each round)
  series:       { target: 2 },      // wins needed (Bo3=2, Bo5=3, Bo7=4)
};

const mp = {
  active:   false,
  inGame:   false,
  myIdx:    0,
  roomCode: null,
  ref:      null,
  listener: null,
};

// ============================================================
// SERIES PICKER
// ============================================================
function setSeries(target, el) {
  state.series.target = target;
  document.querySelectorAll('.series-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  else document.querySelectorAll('.series-btn').forEach(b => {
    if (parseInt(b.dataset.target) === target) b.classList.add('active');
  });
}

// ============================================================
// ONLINE MULTIPLAYER — HOST
// ============================================================
async function openCreateLobby() {
  const name = document.getElementById('online-name').value.trim() || 'Player 1';
  const code = makeRoomCode();
  mp.roomCode = code;
  lvsSaveNames(name, null);
  state.players[0] = name;

  const roomRef = db.ref('ttt/' + code);
  try {
    await roomRef.set({
      host:         name,
      guest:        null,
      board:        Array(9).fill(-1),
      turn:         0,
      status:       'waiting',
      winner:       -1,
      seriesTarget: state.series.target,
    });
  } catch(e) {
    alert('Could not connect to Firebase. Check your internet connection.\n\n' + e.message);
    return;
  }

  mp.ref    = roomRef;
  mp.myIdx  = 0;
  mp.active = true;
  mp.inGame = false;

  localStorage.setItem('lvs_ttt_room', mp.roomCode);
  localStorage.setItem('lvs_ttt_role', '0');

  document.getElementById('room-code-display').textContent = code;
  showScreen('lobby-create');

  if (mp.listener) { mp.ref.off('value', mp.listener); mp.listener = null; }
  mp.listener = mp.ref.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    if (data.status === 'playing' && !mp.inGame) {
      mp.inGame = true;
      state.players[1] = data.guest || 'Player 2';
      startOnlineGame(data);
    } else if (mp.inGame) {
      syncRemoteState(data);
    }
  });
}

// ============================================================
// ONLINE MULTIPLAYER — GUEST
// ============================================================
async function joinBattle() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  const name = document.getElementById('online-name').value.trim() || 'Player 2';
  lvsSaveNames(name, null);
  const errEl = document.getElementById('join-error');
  errEl.style.display = 'none';

  if (code.length < 4) {
    errEl.textContent = 'Enter a 4-character code';
    errEl.style.display = 'block';
    return;
  }

  const roomRef = db.ref('ttt/' + code);
  let snap, data;
  try {
    snap = await roomRef.once('value');
    data = snap.val();
  } catch(e) {
    errEl.textContent = 'Connection failed — check your internet and try again.';
    errEl.style.display = 'block';
    console.error('Firebase read failed:', e);
    return;
  }

  if (!data) {
    errEl.textContent = 'Room not found. Double-check the code and try again.';
    errEl.style.display = 'block';
    return;
  }
  if (data.status !== 'waiting') {
    errEl.textContent = 'That battle already started.';
    errEl.style.display = 'block';
    return;
  }

  state.players[0] = data.host;
  state.players[1] = name;

  localStorage.setItem('lvs_ttt_room', code);
  localStorage.setItem('lvs_ttt_role', '1');

  mp.roomCode = code;
  mp.ref      = roomRef;
  mp.myIdx    = 1;
  mp.active   = true;

  const randomStart = Math.floor(Math.random() * 2);
  await roomRef.update({ guest: name, status: 'playing', turn: randomStart });

  mp.listener = roomRef.on('value', snap => {
    const d = snap.val();
    if (!d) return;
    syncRemoteState(d);
  });

  startOnlineGame({ ...data, turn: randomStart });
}

function startOnlineGame(data) {
  mp.inGame            = true;
  state.series.target  = data.seriesTarget || 2;
  state.scores         = [0, 0];
  state.board          = (data.board || Array(9).fill(-1)).map(v => v === -1 ? null : v);
  state.current        = data.turn ?? 0;
  state.roundStarter   = state.current;
  state.winner         = null;
  state.winLine        = null;
  renderGame();
  showScreen('game');
  lvsOnlineStart(mp.ref, mp.myIdx, backToLobby);
}

function syncRemoteState(data) {
  lvsOnlineUpdate(data);
  const prevBoard  = state.board;
  const prevWinner = state.winner;
  const newBoard   = (data.board || Array(9).fill(-1)).map(v => v === -1 ? null : v);
  state.lastPlaced = newBoard.findIndex((v, i) => v !== null && prevBoard[i] === null);
  state.board   = newBoard;
  state.current = data.turn ?? 0;

  const result = checkWin(state.board);
  if (result) {
    state.winner  = result.winner;
    state.winLine = result.line;
  } else {
    state.winner  = null;
    state.winLine = null;
  }

  renderGame();

  // Opponent triggered a rematch — return to game screen
  if (state.winner === null && prevWinner !== null &&
      document.getElementById('screen-win').classList.contains('active')) {
    showScreen('game');
  }

  if (data.ready0 === true && data.ready1 === true && mp.myIdx === 0) {
    mp.ref.update({
      board:  Array(9).fill(-1),
      turn:   0,
      status: 'playing',
      winner: -1,
      ready0: false,
      ready1: false,
    });
  }

  if (state.winner !== null && prevWinner === null) {
    if (state.winner === 'draw') {
      // Host resets the board after a brief pause; guest just waits for the sync
      if (mp.myIdx === 0) {
        setTimeout(() => {
          mp.ref.update({ board: Array(9).fill(-1), turn: state.roundStarter, winner: -1 });
        }, 1400);
      }
    } else {
      state.scores[state.winner]++;
      updateScoreDisplay();
      if (state.scores[state.winner] >= state.series.target) {
        setTimeout(() => showWinScreen(), 700);
      } else {
        setTimeout(() => showRoundOver(state.winner), 700);
      }
    }
  }
}

// ============================================================
// LOCAL PLAY
// ============================================================
function startLocal() {
  const p1 = document.getElementById('p1-name').value.trim() || 'Player 1';
  const p2 = document.getElementById('p2-name').value.trim() || 'Player 2';
  lvsSaveNames(p1, p2);
  state.players = [p1, p2];
  state.scores  = [0, 0];
  mp.active     = false;

  resetBoard();
  state.roundStarter = Math.floor(Math.random() * 2);
  state.current      = state.roundStarter;
  renderGame();
  showScreen('game');
  document.getElementById('score-row').style.display = 'flex';
  updateScoreDisplay();
  // Reset piece icons so they rebuild for new game
  const p0 = document.getElementById('score-piece-0');
  const p1el = document.getElementById('score-piece-1');
  if (p0) p0.innerHTML = '';
  if (p1el) p1el.innerHTML = '';
}

// ============================================================
// GAME LOGIC
// ============================================================
function resetBoard() {
  state.board   = Array(9).fill(null);
  state.current = 0;
  state.winner  = null;
  state.winLine = null;
}

function checkWin(board) {
  for (const line of WINNING_LINES) {
    const [a,b,c] = line;
    if (board[a] !== null && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every(cell => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return null;
}

function handleCellClick(idx) {
  if (state.board[idx] !== null) return;
  if (state.winner !== null) return;

  if (mp.active) {
    if (mp.myIdx !== state.current) return;
    const newBoard = state.board.map((v, i) => i === idx ? mp.myIdx : (v === null ? -1 : v));
    const nextTurn = 1 - mp.myIdx;
    mp.ref.update({ board: newBoard, turn: nextTurn });
  } else {
    state.lastPlaced = idx;
    state.board[idx] = state.current;
    const result = checkWin(state.board);
    if (result) {
      state.winner  = result.winner;
      state.winLine = result.line;
      renderGame();
      if (state.winner === 'draw') {
        setTimeout(() => { resetBoard(); state.current = state.roundStarter; renderGame(); }, 1400);
      } else {
        state.scores[state.winner]++;
        updateScoreDisplay();
        if (state.scores[state.winner] >= state.series.target) {
          setTimeout(() => showWinScreen(), 700);
        } else {
          setTimeout(() => showRoundOver(state.winner), 700);
        }
      }
    } else {
      state.current = 1 - state.current;
      renderGame();
    }
  }
}

function rematch() {
  if (mp.active) {
    const btn = document.getElementById('win-again-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
    mp.ref.update({ ['ready' + mp.myIdx]: true });
  } else {
    resetBoard();
    renderGame();
    showScreen('game');
  }
}

function copyCode() {
  const btn = document.getElementById('lobby-copy-btn');
  lvsCopyLink(mp.roomCode, btn, 'Copy Link');
}

function backToLobby() {
  lvsOnlineStop();
  if (mp.active && mp.ref && mp.listener) {
    mp.ref.off('value', mp.listener);
  }
  mp.active   = false;
  mp.inGame   = false;
  mp.ref      = null;
  mp.listener = null;
  mp.roomCode = null;
  localStorage.removeItem('lvs_ttt_room');
  localStorage.removeItem('lvs_ttt_role');
  state.scores        = [0, 0];
  state.series.target = 2;
  document.querySelectorAll('.series-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.target === '2');
  });
  showScreen('lobby');
}

// ============================================================
// RENDER
// ============================================================
function renderGame() {
  const boardEl = document.getElementById('ttt-board');
  boardEl.innerHTML = '';

  state.board.forEach((val, idx) => {
    const cell = document.createElement('div');
    cell.className = 'ttt-cell';

    if (val !== null) {
      cell.classList.add('taken', val === 0 ? 'is-x' : 'is-o');
      cell.innerHTML = makePieceSVG(val, false, idx === state.lastPlaced);
    } else if (state.winner === null) {
      cell.onclick = () => handleCellClick(idx);
    }

    if (state.winLine && state.winLine.includes(idx)) {
      cell.classList.add('win-cell');
    }

    boardEl.appendChild(cell);
  });

  updateTurnUI();
  updateScoreDisplay();
}

function updateTurnUI() {
  const dot   = document.getElementById('turn-dot');
  const label = document.getElementById('turn-label');
  const msgEl = document.getElementById('message-bar');

  if (state.winner !== null) {
    if (dot)   dot.style.animation = 'none';
    if (dot)   dot.style.opacity = '0.3';
    if (label) label.textContent = 'Game over';
    if (msgEl) {
      if (state.winner === 'draw') {
        msgEl.textContent = "It's a draw!";
      } else {
        msgEl.textContent = `${state.players[state.winner]} wins!`;
      }
    }
    return;
  }

  const name = state.players[state.current];
  const lbl  = PIECE_LABELS[state.current];

  if (label) label.textContent = `${name}'s turn`;
  if (msgEl) {
    if (mp.active) {
      if (mp.myIdx === state.current) {
        msgEl.textContent = `${lbl} — your turn, pick a square!`;
      } else {
        msgEl.textContent = `Waiting for ${name}...`;
      }
    } else {
      msgEl.textContent = `${lbl} — ${name}, pick a square!`;
    }
  }
}

function updateScoreDisplay() {
  document.getElementById('score-name-0').textContent = state.players[0];
  document.getElementById('score-name-1').textContent = state.players[1];
  document.getElementById('score-val-0').textContent  = state.scores[0];
  document.getElementById('score-val-1').textContent  = state.scores[1];
  const targetEl = document.getElementById('score-target');
  if (targetEl) {
    const labels = { 2: 'Best of 3', 3: 'Best of 5', 4: 'Best of 7' };
    targetEl.textContent = `${labels[state.series.target] || 'Series'} · First to ${state.series.target}`;
  }
  // Populate piece icons once (no animation class — static display)
  const p0 = document.getElementById('score-piece-0');
  const p1 = document.getElementById('score-piece-1');
  if (p0 && !p0.hasChildNodes()) p0.innerHTML = makePieceSVG(0).replace('piece-svg', 'piece-svg score-icon');
  if (p1 && !p1.hasChildNodes()) p1.innerHTML = makePieceSVG(1).replace('piece-svg', 'piece-svg score-icon');
}

function showRoundOver(winner) {
  document.getElementById('ro-piece').innerHTML  = makePieceSVG(winner, true);
  document.getElementById('ro-winner').textContent = `${state.players[winner]} wins the round`;
  document.getElementById('ro-score').textContent  = `${state.scores[0]}  —  ${state.scores[1]}`;
  const labels = { 2: 'Best of 3', 3: 'Best of 5', 4: 'Best of 7' };
  document.getElementById('ro-label').textContent  = labels[state.series.target] || 'Series';
  showScreen('roundover');

  setTimeout(() => {
    state.roundStarter = 1 - state.roundStarter;
    resetBoard();
    state.current = state.roundStarter;
    if (mp.active && mp.myIdx === 0) {
      mp.ref.update({ board: Array(9).fill(-1), turn: state.roundStarter, status: 'playing', winner: -1 });
    }
    renderGame();
    showScreen('game');
  }, 2200);
}

function showWinScreen() {
  const winner = state.winner;
  const pieceEl = document.getElementById('win-piece');
  pieceEl.innerHTML = makePieceSVG(winner, true);
  document.getElementById('win-label').textContent = 'Series Winner';
  document.getElementById('win-name').textContent  = state.players[winner];
  document.getElementById('win-sub').textContent   =
    `${PIECE_LABELS[winner]} wins ${state.scores[winner]}–${state.scores[1 - winner]}`;
  window._lvsWinPlayers = { names: state.players.slice(), winner: state.winner };
  launchConfetti();
  showScreen('win');
}

// ============================================================
// UTILITIES
// ============================================================
function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ============================================================
// CONFETTI
// ============================================================
// ============================================================
// RECONNECT ON REFRESH
// ============================================================
(function tryReconnect() {
  const code = localStorage.getItem('lvs_ttt_room');
  const role = localStorage.getItem('lvs_ttt_role');
  if (!code || role === null) return;

  const roomRef = db.ref('ttt/' + code);
  roomRef.once('value').then(snap => {
    const data = snap.val();
    if (!data || data.status !== 'playing') {
      localStorage.removeItem('lvs_ttt_room');
      localStorage.removeItem('lvs_ttt_role');
      return;
    }

    mp.active   = true;
    mp.myIdx    = parseInt(role, 10);
    mp.roomCode = code;
    mp.ref      = roomRef;

    state.players[0] = data.host  || 'Player 1';
    state.players[1] = data.guest || 'Player 2';

    mp.listener = roomRef.on('value', snap => {
      const d = snap.val();
      if (!d) return;
      syncRemoteState(d);
    });

    startOnlineGame(data);
  });
})();

// ============================================================
// INIT
// ============================================================
renderGame();
