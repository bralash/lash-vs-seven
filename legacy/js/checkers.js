const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Capture all of your opponent's pieces, or leave them with no legal moves.</p>
</div>
<div class="rs">
  <h3>Movement</h3>
  <ol>
    <li>Pieces move diagonally one square forward at a time.</li>
    <li>To capture, jump diagonally over an opponent's piece into the empty square beyond — the captured piece is removed.</li>
    <li>Multiple jumps in a single turn are allowed when available.</li>
    <li><strong>Capturing is mandatory</strong> — if a jump is available, you must take it.</li>
  </ol>
</div>
<div class="rs">
  <h3>Kings</h3>
  <p>When a piece reaches the opponent's back row it becomes a <strong>King</strong>, marked with a double stack. Kings can move and capture in all four diagonal directions.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Keep pieces on your back row as long as possible — they act as natural defence and stop your opponent from kinging.</div>
`;

// ============================================================
// CONSTANTS
// ============================================================
const BOARD_SIZE = 8;

// ============================================================
// SOUND ENGINE
// ============================================================
function _ctx() {
  return audioCtx();
}

function playMove() {
  if (isMuted()) return;
  try {
    const ctx  = _ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.11);
  } catch (_) {}
}

function playChime() {
  if (isMuted()) return;
  try {
    const ctx = _ctx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
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
    // Two-note ascending ping — clearly distinct from move/jump sounds
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

function playJump() {
  if (isMuted()) return;
  try {
    const ctx = _ctx();
    const now = ctx.currentTime;

    const buf  = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    const noise     = ctx.createBufferSource();
    noise.buffer    = buf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch (_) {}
}

// ============================================================
// FIREBASE
// ============================================================

// ============================================================
// MULTIPLAYER STATE
// ============================================================
const mp = {
  active:  false,
  started: false,
  myIdx:   0,      // which player I am (0=red, 1=dark)
  role:    null,   // 'host' | 'guest'
  ref:     null,
  code:    null,
};

// Board cells: 0=empty 1=p0 2=p0king 3=p1 4=p1king
function encodeBoard(board) {
  return board.flat().map(cell => {
    if (!cell) return 0;
    if (cell.player === 0) return cell.king ? 2 : 1;
    return cell.king ? 4 : 3;
  });
}

function decodeBoard(flat) {
  const board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    board.push([]);
    for (let c = 0; c < BOARD_SIZE; c++) {
      const v = Number(flat[r * BOARD_SIZE + c]);
      if (v === 0)      board[r].push(null);
      else if (v === 1) board[r].push({ player: 0, king: false });
      else if (v === 2) board[r].push({ player: 0, king: true  });
      else if (v === 3) board[r].push({ player: 1, king: false });
      else              board[r].push({ player: 1, king: true  });
    }
  }
  return board;
}

// ============================================================
// STATE
// ============================================================
const state = {
  board:      [],
  current:    0,
  selected:   null,
  validMoves: [],
  midJump:    false,
  winner:     null,
  players:    ['Player 1', 'Player 2'],
};

// ============================================================
// BOARD SETUP
// ============================================================
function initBoard() {
  const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3)      board[r][c] = { player: 1, king: false };
        else if (r > 4) board[r][c] = { player: 0, king: false };
      }
    }
  }
  return board;
}

// ============================================================
// MOVE LOGIC
// ============================================================
function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }

function getRegularMoves(r, c) {
  const piece   = state.board[r][c];
  const fwdDirs = piece.player === 0 ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  const allDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const moves   = [];
  for (const [dr, dc] of allDirs) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const sq = state.board[nr][nc];
    if (!sq) {
      // Non-capture: forward only
      if (fwdDirs.some(([fdr, fdc]) => fdr === dr && fdc === dc))
        moves.push({ r: nr, c: nc, jumped: null });
    } else if (sq.player !== piece.player) {
      // Capture: all four diagonals (including backward)
      const jr = nr + dr, jc = nc + dc;
      if (inBounds(jr, jc) && !state.board[jr][jc])
        moves.push({ r: jr, c: jc, jumped: { r: nr, c: nc } });
    }
  }
  return moves;
}

function getKingMoves(r, c) {
  const piece = state.board[r][c];
  const moves = [];
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let nr = r + dr, nc = c + dc;
    let jumped = null;
    while (inBounds(nr, nc)) {
      const sq = state.board[nr][nc];
      if (sq === null) {
        moves.push({ r: nr, c: nc, jumped });
        nr += dr; nc += dc;
      } else if (sq.player !== piece.player && jumped === null) {
        jumped = { r: nr, c: nc };
        nr += dr; nc += dc;
      } else {
        break;
      }
    }
  }
  return moves;
}

function getMovesForPiece(r, c) {
  const piece = state.board[r][c];
  if (!piece) return [];
  return piece.king ? getKingMoves(r, c) : getRegularMoves(r, c);
}

function hasJumpAvailable(player) {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = state.board[r][c];
      if (piece?.player === player && getMovesForPiece(r, c).some(m => m.jumped))
        return true;
    }
  return false;
}

function hasAnyMoves(player) {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = state.board[r][c];
      if (piece?.player === player && getMovesForPiece(r, c).length > 0)
        return true;
    }
  return false;
}

function countPieces(player) {
  let n = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (state.board[r][c]?.player === player) n++;
  return n;
}

// ============================================================
// EXECUTE MOVE
// ============================================================
function executeMove(fromR, fromC, move) {
  move.jumped ? playJump() : playMove();

  const piece = { ...state.board[fromR][fromC] };
  state.board[move.r][move.c] = piece;
  state.board[fromR][fromC]   = null;

  if (move.jumped) state.board[move.jumped.r][move.jumped.c] = null;

  let becameKing = false;
  if (!piece.king) {
    if ((piece.player === 0 && move.r === 0) || (piece.player === 1 && move.r === BOARD_SIZE - 1)) {
      state.board[move.r][move.c].king = true;
      becameKing = true;
    }
  }

  // Multi-jump continuation
  if (move.jumped && !becameKing) {
    const followUps = getMovesForPiece(move.r, move.c).filter(m => m.jumped);
    if (followUps.length > 0) {
      state.selected   = { r: move.r, c: move.c };
      state.validMoves = followUps;
      state.midJump    = true;
      syncToFirebase();
      renderBoard();
      setMsg('Keep jumping!', 'capture-msg');
      return;
    }
  }

  // End of turn
  state.midJump    = false;
  state.selected   = null;
  state.validMoves = [];

  const next   = 1 - state.current;
  const winner = countPieces(next) === 0 || !hasAnyMoves(next) ? state.current : null;

  if (winner !== null) {
    state.winner = winner;
    syncToFirebase();
    renderBoard();
    setTimeout(() => showWinScreen(), 800);
    return;
  }

  state.current = next;
  syncToFirebase();
  renderBoard();

  if (becameKing && !mp.active) {
    setMsg(`${state.players[1 - state.current]} is now a King!`, 'king-msg');
  } else {
    updateTurnMsg();
  }
}

// ============================================================
// CELL CLICK HANDLER
// ============================================================
function onCellClick(r, c) {
  if (state.winner !== null) return;
  if (mp.active && state.current !== mp.myIdx) return;

  const piece      = state.board[r][c];
  const moveTarget = state.validMoves.find(m => m.r === r && m.c === c);

  if (state.midJump) {
    if (moveTarget) {
      executeMove(state.selected.r, state.selected.c, moveTarget);
    } else {
      setMsg('Complete your jump first!', 'capture-msg');
    }
    return;
  }

  if (moveTarget && state.selected) {
    executeMove(state.selected.r, state.selected.c, moveTarget);
    return;
  }

  if (piece && piece.player === state.current) {
    const jumpRequired = hasJumpAvailable(state.current);
    let moves = getMovesForPiece(r, c);

    if (jumpRequired) {
      const jumps = moves.filter(m => m.jumped);
      if (jumps.length === 0) {
        setMsg('A jump is available — you must take it!', 'capture-msg');
        state.selected   = null;
        state.validMoves = [];
        renderBoard();
        return;
      }
      moves = jumps;
    }

    state.selected   = { r, c };
    state.validMoves = moves;
    renderBoard();

    if (moves.length === 0) {
      setMsg('This piece has no moves — pick another');
    } else if (moves.some(m => m.jumped)) {
      setMsg('Jump available! Select a landing square', 'capture-msg');
    } else {
      setMsg('Select a destination');
    }
    return;
  }

  state.selected   = null;
  state.validMoves = [];
  renderBoard();
  updateTurnMsg();
}

// ============================================================
// RENDER
// ============================================================
function renderBoard() {
  const boardEl      = document.getElementById('checkers-board');
  const jumpRequired = state.winner === null && !state.midJump && hasJumpAvailable(state.current);
  const rotated      = mp.active && mp.myIdx === 1;
  boardEl.className  = 'checkers-board' + (rotated ? ' board-rotated' : '');
  boardEl.innerHTML  = '';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const isDark     = (r + c) % 2 === 1;
      const piece      = state.board[r][c];
      const isSelected = state.selected?.r === r && state.selected?.c === c;
      const moveTarget = state.validMoves.find(m => m.r === r && m.c === c);

      const cell = document.createElement('div');
      cell.className = 'ck-cell ' + (isDark ? 'dark' : 'light');

      if (piece) {
        if (piece.king) {
          const stack = document.createElement('div');
          stack.className = `ck-stack p${piece.player}`;
          cell.appendChild(stack);
        }

        const mustJump = jumpRequired
          && piece.player === state.current
          && getMovesForPiece(r, c).some(m => m.jumped);

        const el = document.createElement('div');
        el.className = [
          'ck-piece',
          `p${piece.player}`,
          piece.king   ? 'king'      : '',
          isSelected   ? 'selected'  : '',
          mustJump     ? 'must-jump' : '',
        ].filter(Boolean).join(' ');
        cell.appendChild(el);
      }

      if (moveTarget && isDark) {
        const dot = document.createElement('div');
        dot.className = 'move-dot' + (moveTarget.jumped ? ' jump-dot' : '');
        cell.appendChild(dot);
      }

      if (isDark && state.winner === null) {
        cell.addEventListener('click', () => onCellClick(r, c));
      }

      boardEl.appendChild(cell);
    }
  }

  updateHUD();
}

function updateHUD() {
  document.getElementById('count-val-0').textContent = countPieces(0);
  document.getElementById('count-val-1').textContent = countPieces(1);
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
    if (state.midJump && state.current === mp.myIdx) {
      setMsg('Keep jumping!', 'capture-msg');
    } else if (state.current === mp.myIdx) {
      setMsg('Your turn — select a piece');
    } else {
      setMsg(`Waiting for ${state.players[state.current]}…`);
    }
  } else {
    setMsg(`${state.players[state.current]}'s turn — select a piece`);
  }
}

function setOnlineMsg(text, isError) {
  const el = document.getElementById('online-msg');
  el.textContent = text;
  el.className   = 'online-msg' + (isError ? ' error' : '');
}

// ============================================================
// LOCAL GAME FLOW
// ============================================================
function startGame() {
  const p1 = document.getElementById('p1-name').value.trim() || 'Player 1';
  const p2 = document.getElementById('p2-name').value.trim() || 'Player 2';
  lvsSaveNames(p1, p2);
  state.players    = [p1, p2];
  state.board      = initBoard();
  state.current    = Math.floor(Math.random() * 2);
  state.selected   = null;
  state.validMoves = [];
  state.midJump    = false;
  state.winner     = null;

  document.getElementById('name-0').textContent = p1;
  document.getElementById('name-1').textContent = p2;
  document.getElementById('my-color-badge').style.display = 'none';
  document.getElementById('restart-btn').style.display    = '';

  renderBoard();
  showScreen('game');
  setMsg(`${state.players[state.current]}'s turn — select a piece`);
  lvsFsShow();
}

function handleRestart() {
  if (mp.active) { backToLobby(); return; }
  resetGame();
}

function resetGame() {
  state.board      = initBoard();
  state.current    = Math.floor(Math.random() * 2);
  state.selected   = null;
  state.validMoves = [];
  state.midJump    = false;
  state.winner     = null;
  renderBoard();
  showScreen('game');
  setMsg(`${state.players[state.current]}'s turn — select a piece`);
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
  lvsFsHide();
  lvsOnlineStop();
  if (mp.ref) {
    mp.ref.off();
    if (state.winner === null) mp.ref.update({ status: 'done' }).catch(() => {});
  }
  mp.active  = false;
  mp.started = false;
  mp.ref     = null;
  mp.code    = null;

  localStorage.removeItem('lvs_ck_room');
  localStorage.removeItem('lvs_ck_role');

  state.winner     = null;
  state.selected   = null;
  state.validMoves = [];
  state.midJump    = false;

  document.getElementById('my-color-badge').style.display = 'none';
  showScreen('lobby');
}

// ============================================================
// WIN SCREEN
// ============================================================
function showWinScreen() {
  const w      = state.winner;
  const wrap   = document.getElementById('win-piece-wrap');
  const isKing = state.board.flat().some(p => p?.player === w && p?.king);
  wrap.innerHTML = '';

  const cell = document.createElement('div');
  cell.className = 'win-piece-cell';

  if (isKing) {
    const stack = document.createElement('div');
    stack.className = `ck-stack p${w}`;
    cell.appendChild(stack);
  }

  const piece = document.createElement('div');
  piece.className = `ck-piece p${w}${isKing ? ' king' : ''}`;
  cell.appendChild(piece);
  wrap.appendChild(cell);

  const loserCount = countPieces(1 - w);
  document.getElementById('win-name').textContent = state.players[w];
  document.getElementById('win-sub').textContent  =
    loserCount === 0 ? 'All enemy pieces captured!' : 'Opponent has no moves left!';

  window._lvsWinPlayers = { names: state.players.slice(), winner: w };
  launchConfetti();
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
  const ref     = db.ref('checkers-rooms/' + code);

  mp.active  = true;
  mp.started = false;
  mp.role    = 'host';
  mp.myIdx   = hostIdx;
  mp.ref     = ref;
  mp.code    = code;

  ref.set({
    host:     name,
    guest:    null,
    status:   'waiting',
    board:    encodeBoard(initBoard()),
    current:  0,
    winner:  -1,
    midJump:  false,
    jumpFrom: null,
    hostIdx,
  });

  localStorage.setItem('lvs_ck_room', code);
  localStorage.setItem('lvs_ck_role', 'host');

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

  setOnlineMsg('Joining…', false);

  const ref = db.ref('checkers-rooms/' + code);
  ref.once('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'waiting') {
      setOnlineMsg('Room not found — double-check the code', true);
      return;
    }

    mp.active  = true;
    mp.started = true;
    mp.role    = 'guest';
    mp.myIdx   = 1 - data.hostIdx;
    mp.ref     = ref;
    mp.code    = code;

    ref.update({ guest: name, status: 'playing' });

    localStorage.setItem('lvs_ck_room', code);
    localStorage.setItem('lvs_ck_role', 'guest');

    playChime();
    startOnlineGame({ ...data, guest: name });
  });
}

function startOnlineGame(data) {
  const players = ['', ''];
  players[data.hostIdx]     = data.host;
  players[1 - data.hostIdx] = data.guest || '…';

  state.players    = players;
  state.board      = decodeBoard(data.board);
  state.current    = data.current;
  state.winner     = data.winner === -1 ? null : data.winner;
  state.midJump    = !!data.midJump;
  state.selected   = data.jumpFrom ? { r: data.jumpFrom.r, c: data.jumpFrom.c } : null;
  state.validMoves = [];

  document.getElementById('name-0').textContent = players[0];
  document.getElementById('name-1').textContent = players[1];

  // Show which colour the local player controls
  const badge = document.getElementById('my-color-badge');
  badge.textContent  = mp.myIdx === 0 ? 'You: Red' : 'You: Dark';
  badge.className    = 'my-badge p' + mp.myIdx;
  badge.style.display = 'flex';

  // Hide restart in online mode (exit goes to lobby)
  document.getElementById('restart-btn').style.display = 'none';

  renderBoard();
  showScreen('game');
  updateTurnMsg();
  lvsOnlineStart(mp.ref, mp.myIdx, backToLobby);

  // Replace any previous listener with the live game listener
  mp.ref.off();
  mp.ref.on('value', snap => {
    const d = snap.val();
    if (!d || d.status !== 'playing') return;
    lvsOnlineUpdate(d);
    handleOnlineUpdate(d);
  });
}

function handleOnlineUpdate(d) {
  const prevCurrent = state.current; // capture before we overwrite
  const prevWinner  = state.winner;  // capture before we overwrite

  const players = ['', ''];
  players[d.hostIdx]     = d.host;
  players[1 - d.hostIdx] = d.guest || '…';

  state.players    = players;
  state.board      = decodeBoard(d.board);
  state.current    = d.current;
  state.winner     = d.winner === -1 ? null : d.winner;
  state.midJump    = !!d.midJump;
  state.selected   = d.jumpFrom ? { r: d.jumpFrom.r, c: d.jumpFrom.c } : null;

  // Play notification when opponent's move just handed the turn to me
  if (state.winner === null && d.current === mp.myIdx && prevCurrent !== mp.myIdx) {
    playYourTurn();
  }

  // Only set validMoves if it's our turn in a mid-jump sequence
  state.validMoves = (d.midJump && d.jumpFrom && d.current === mp.myIdx)
    ? getMovesForPiece(d.jumpFrom.r, d.jumpFrom.c).filter(m => m.jumped)
    : [];

  document.getElementById('name-0').textContent = players[0];
  document.getElementById('name-1').textContent = players[1];

  renderBoard();

  if (state.winner !== null) {
    setTimeout(() => showWinScreen(), 800);
    return;
  }

  // Opponent triggered a rematch — return to game screen
  if (prevWinner !== null && document.getElementById('screen-win').classList.contains('active')) {
    showScreen('game');
  }

  if (d.ready0 === true && d.ready1 === true && mp.role === 'host') {
    const newBoard = initBoard();
    mp.ref.update({
      board:    encodeBoard(newBoard),
      current:  0,
      winner:  -1,
      status:  'playing',
      midJump:  false,
      jumpFrom: null,
      ready0:   false,
      ready1:   false,
    });
  }

  updateTurnMsg();
}

function syncToFirebase() {
  if (!mp.active || !mp.ref) return;
  mp.ref.update({
    board:    encodeBoard(state.board),
    current:  state.current,
    winner:   state.winner === null ? -1 : state.winner,
    midJump:  state.midJump,
    jumpFrom: state.selected || null,
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
  const code = localStorage.getItem('lvs_ck_room');
  const role = localStorage.getItem('lvs_ck_role');
  if (!code || !role) return;

  db.ref('checkers-rooms/' + code).once('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'playing') {
      localStorage.removeItem('lvs_ck_room');
      localStorage.removeItem('lvs_ck_role');
      return;
    }

    mp.active  = true;
    mp.started = true;
    mp.role    = role;
    mp.myIdx   = role === 'host' ? data.hostIdx : 1 - data.hostIdx;
    mp.ref     = db.ref('checkers-rooms/' + code);
    mp.code    = code;

    startOnlineGame(data);
  });
})();

// ============================================================
// CONFETTI
// ============================================================
