const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Fill the 9×9 grid so that every row, every column, and every 3×3 box contains the digits 1–9 exactly once.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Some squares are pre-filled as clues — these cannot be changed.</li>
    <li>Tap an empty square, then tap a number to fill it in.</li>
    <li>No digit can repeat within the same row, column, or 3×3 box.</li>
  </ol>
</div>
<div class="rs">
  <h3>Difficulty</h3>
  <p>Easier puzzles have more clues pre-filled. Harder puzzles have fewer, requiring deeper deduction chains.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Start with the rows, columns, or boxes that already have the most numbers filled in — they leave the fewest possibilities.</div>
`;

'use strict';

// ─── SUDOKU GENERATOR ────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isValid(grid, idx, num) {
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i++) {
    if (grid[row * 9 + i] === num) return false;
    if (grid[i * 9 + col] === num) return false;
    const br = boxRow + Math.floor(i / 3);
    const bc = boxCol + (i % 3);
    if (grid[br * 9 + bc] === num) return false;
  }
  return true;
}

function fillGrid(grid) {
  for (let idx = 0; idx < 81; idx++) {
    if (grid[idx] !== 0) continue;
    const nums = shuffle([1,2,3,4,5,6,7,8,9]);
    for (const num of nums) {
      if (isValid(grid, idx, num)) {
        grid[idx] = num;
        if (fillGrid(grid)) return true;
        grid[idx] = 0;
      }
    }
    return false;
  }
  return true;
}

function countSolutions(grid, limit) {
  let count = 0;
  function solve(g) {
    if (count >= limit) return;
    let idx = -1;
    for (let i = 0; i < 81; i++) {
      if (g[i] === 0) { idx = i; break; }
    }
    if (idx === -1) { count++; return; }
    for (let num = 1; num <= 9; num++) {
      if (isValid(g, idx, num)) {
        g[idx] = num;
        solve(g);
        g[idx] = 0;
        if (count >= limit) return;
      }
    }
  }
  solve(grid.slice());
  return count;
}

function solvePuzzle(grid) {
  const g = grid.slice();
  function solve(g) {
    let idx = -1;
    for (let i = 0; i < 81; i++) {
      if (g[i] === 0) { idx = i; break; }
    }
    if (idx === -1) return true;
    for (let num = 1; num <= 9; num++) {
      if (isValid(g, idx, num)) {
        g[idx] = num;
        if (solve(g)) return true;
        g[idx] = 0;
      }
    }
    return false;
  }
  solve(g);
  return g;
}

function generatePuzzle(difficulty) {
  const clues = { easy: 36, medium: 30, hard: 24 };
  const target = clues[difficulty] || 30;

  const solution = Array(81).fill(0);
  fillGrid(solution);

  const puzzle = solution.slice();
  const indices = shuffle(Array.from({ length: 81 }, (_, i) => i));

  let filled = 81;
  for (const idx of indices) {
    if (filled <= target) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[idx] = backup;
    } else {
      filled--;
    }
  }

  return { puzzle, solution };
}

// ─── MODULE STATE ────────────────────────────────────────────

let mode       = 'local';    // 'local' | 'online'
let difficulty = 'medium';
let onlineDiff = 'medium';
let myIdx      = 0;
let isHost     = false;
let roomRef    = null;
let roomCode   = null;
let names      = ['Player 1', 'Player 2'];

let puzzle    = Array(81).fill(0);
let solution  = Array(81).fill(0);
let userGrid  = Array(81).fill(0);  // player's current entries (0 = empty)
let notes     = Array.from({ length: 81 }, () => new Set());
let selected  = -1;
let notesMode = false;

let p1Time    = 0;   // ms (pass & play)
let p2Time    = 0;
let timerStart = 0;  // timestamp when timer started (0 = not running)
let timerInterval = null;
let passPlayPhase = 1; // 1 or 2

let correctCount  = 0;   // online: locally correct cells filled
let onlineListener = null;

// ─── SCREEN ──────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── DIFFICULTY ──────────────────────────────────────────────

function setDiff(d) {
  difficulty = d;
  ['easy','medium','hard'].forEach(x => {
    document.getElementById('diff-' + x)?.classList.toggle('active', x === d);
  });
}

function setOnlineDiff(d) {
  onlineDiff = d;
  ['easy','medium','hard'].forEach(x => {
    document.getElementById('online-diff-' + x)?.classList.toggle('active', x === d);
  });
}

// ─── TIMER ───────────────────────────────────────────────────

function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

function startTimer() {
  if (timerStart !== 0) return;
  timerStart = Date.now();
  timerInterval = setInterval(updateTimerUI, 500);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function resetTimer() {
  stopTimer();
  timerStart = 0;
  updateTimerUI();
}

function elapsedMs() {
  if (timerStart === 0) return 0;
  return Date.now() - timerStart;
}

function updateTimerUI() {
  const el = document.getElementById('su-timer');
  if (el) el.textContent = fmtTime(elapsedMs());
}

// ─── LOCAL GAME ──────────────────────────────────────────────

function startLocal() {
  const n1 = document.getElementById('p1-name')?.value.trim() || 'Player 1';
  const n2 = document.getElementById('p2-name')?.value.trim() || 'Player 2';
  names = [n1, n2];
  lvsSaveNames(n1, n2);

  mode = 'local';
  passPlayPhase = 1;

  const gen = generatePuzzle(difficulty);
  puzzle   = gen.puzzle;
  solution = gen.solution;

  beginPlayerTurn(0);
  showScreen('game');
}

function beginPlayerTurn(playerIdx) {
  userGrid  = Array(81).fill(0);
  notes     = Array.from({ length: 81 }, () => new Set());
  selected  = -1;
  notesMode = false;
  correctCount = 0;

  document.getElementById('su-strip-local').style.display = 'flex';
  document.getElementById('su-strip-online').style.display = 'none';
  document.getElementById('su-current-name').textContent = names[playerIdx] + "'s turn";
  document.getElementById('su-diff-badge').textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  document.getElementById('su-notes-btn')?.classList.remove('notes-active');

  resetTimer();
  buildBoard();
  renderBoard();
}

// ─── ONLINE GAME ─────────────────────────────────────────────

function setOnlineMsg(text, err) {
  const el = document.getElementById('online-msg');
  if (!el) return;
  el.textContent = text;
  el.className = 'form-msg' + (err ? ' error' : '');
}

function createRoom() {
  const name = document.getElementById('online-name')?.value.trim();
  if (!name) { setOnlineMsg('Enter your name', true); return; }

  myIdx  = 0;
  isHost = true;
  roomCode = randomCode();
  names[0] = name;
  lvsSaveNames(name, '');

  const ref = db.ref('sudoku/' + roomCode);
  roomRef = ref;

  ref.set({
    status: 'waiting',
    host: name,
    guest: '',
    hostIdx: 0,
    difficulty: onlineDiff,
    puzzle: [],
    p0Progress: 0,
    p1Progress: 0,
    p0Done: null,
    p1Done: null,
    winner: -1,
    p0Online: true,
    p1Online: false,
    ready0: false,
    ready1: false,
  }).then(() => {
    document.getElementById('waiting-code').textContent = roomCode;
    showScreen('waiting');
    lvsOnlineStart(ref, 0, backToLobby);
    waitForGuest(ref);
  }).catch(e => setOnlineMsg(e.message, true));
}

function waitForGuest(ref) {
  ref.on('value', snap => {
    const d = snap.val();
    if (!d) return;
    lvsOnlineUpdate(d);
    if (d.guest && d.status === 'waiting') {
      names[1] = d.guest;
      difficulty = d.difficulty;
      ref.off('value');
      hostStartGame(ref, d);
    }
  });
}

function hostStartGame(ref, d) {
  const gen = generatePuzzle(d.difficulty);
  puzzle   = gen.puzzle;
  solution = gen.solution;

  ref.update({
    status: 'playing',
    puzzle: puzzle,
  }).then(() => {
    beginOnlineGame();
  });
}

function joinRoom() {
  const name = document.getElementById('online-name')?.value.trim();
  const code = document.getElementById('join-code')?.value.trim().toUpperCase();
  if (!name) { setOnlineMsg('Enter your name', true); return; }
  if (code.length !== 4) { setOnlineMsg('Enter a 4-letter code', true); return; }

  myIdx  = 1;
  isHost = false;
  roomCode = code;
  names[1] = name;
  lvsSaveNames('', name);

  const ref = db.ref('sudoku/' + code);
  roomRef = ref;

  ref.once('value').then(snap => {
    const d = snap.val();
    if (!d) { setOnlineMsg('Room not found', true); return; }
    if (d.status !== 'waiting') { setOnlineMsg('Game already started', true); return; }
    if (d.guest) { setOnlineMsg('Room is full', true); return; }

    names[0] = d.host;
    difficulty = d.difficulty;

    ref.update({ guest: name }).then(() => {
      lvsOnlineStart(ref, 1, backToLobby);
      waitForPuzzle(ref);
    });
  }).catch(e => setOnlineMsg(e.message, true));
}

function waitForPuzzle(ref) {
  ref.on('value', snap => {
    const d = snap.val();
    if (!d) return;
    lvsOnlineUpdate(d);
    if (d.status === 'playing' && d.puzzle && d.puzzle.length === 81) {
      ref.off('value');
      puzzle   = d.puzzle;
      solution = solvePuzzle(puzzle);
      beginOnlineGame();
    }
  });
}

function beginOnlineGame() {
  mode = 'online';
  userGrid  = Array(81).fill(0);
  notes     = Array.from({ length: 81 }, () => new Set());
  selected  = -1;
  notesMode = false;
  correctCount = 0;

  document.getElementById('su-strip-local').style.display = 'none';
  const onlineStrip = document.getElementById('su-strip-online');
  onlineStrip.style.display = 'flex';

  document.getElementById('su-prog-name-0').textContent = names[0];
  document.getElementById('su-prog-name-1').textContent = names[1];
  document.getElementById('su-diff-badge').textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  document.getElementById('su-notes-btn')?.classList.remove('notes-active');

  resetTimer();
  buildBoard();
  renderBoard();
  showScreen('game');
  attachOnlineListener();
}

function attachOnlineListener() {
  if (onlineListener) {
    roomRef.off('value', onlineListener);
  }
  onlineListener = roomRef.on('value', snap => {
    const d = snap.val();
    if (!d) return;
    lvsOnlineUpdate(d);

    const oppIdx = 1 - myIdx;
    const oppProg = d['p' + oppIdx + 'Progress'] || 0;
    updateOnlineProgress(oppIdx, oppProg);

    updateOnlineProgress(myIdx, correctCount);

    if (d.winner !== undefined && d.winner >= 0 && document.getElementById('screen-game')?.classList.contains('active')) {
      stopTimer();
      roomRef.off('value', onlineListener);
      showOnlineWin(d);
    }
  });
}

function updateOnlineProgress(idx, count) {
  const bar   = document.getElementById('su-prog-bar-' + idx);
  const label = document.getElementById('su-prog-count-' + idx);
  if (bar)   bar.style.width = (count / 81 * 100) + '%';
  if (label) label.textContent = count + '/81';
}

function onOnlineCorrectFill() {
  updateOnlineProgress(myIdx, correctCount);
  roomRef.update({ ['p' + myIdx + 'Progress']: correctCount });

  if (correctCount === 81) {
    const now = Date.now();
    roomRef.update({ ['p' + myIdx + 'Done']: now }).then(() => {
      roomRef.once('value').then(snap => {
        const d = snap.val();
        if (!d) return;
        const myDone  = d['p' + myIdx + 'Done'];
        const oppDone = d['p' + (1 - myIdx) + 'Done'];
        if (myDone && !oppDone) {
          roomRef.update({ winner: myIdx });
        } else if (myDone && oppDone) {
          const w = myDone <= oppDone ? myIdx : 1 - myIdx;
          roomRef.update({ winner: w });
        }
      });
    });
  }
}

function showOnlineWin(d) {
  const w = d.winner;
  document.getElementById('win-name').textContent = names[w] + ' wins!';
  document.getElementById('win-sub').textContent  = 'Solved first';

  const t0 = d.p0Done ? 'Finished' : 'Still solving';
  const t1 = d.p1Done ? 'Finished' : 'Still solving';
  document.getElementById('win-times').innerHTML =
    names[0] + ': ' + t0 + '<br>' + names[1] + ': ' + t1;

  window._lvsWinPlayers = { names, winner: w };
  launchConfetti();
  showScreen('win');
}

// ─── COPY LINK ───────────────────────────────────────────────

function copyCode() {
  const btn = document.getElementById('waiting-copy-btn');
  lvsCopyLink(roomCode, btn, 'Copy Link');
}

// ─── BACK TO LOBBY ───────────────────────────────────────────

function backToLobby() {
  stopTimer();
  lvsOnlineStop();
  if (onlineListener && roomRef) {
    roomRef.off('value', onlineListener);
    onlineListener = null;
  }
  roomRef  = null;
  roomCode = null;
  mode = 'local';
  showScreen('lobby');
}

// ─── PLAY AGAIN ──────────────────────────────────────────────

function playAgain() {
  if (mode === 'online') {
    backToLobby();
  } else {
    showScreen('welcome');
  }
}

// ─── BOARD RENDER ────────────────────────────────────────────

function buildBoard() {
  const board = document.getElementById('su-board');
  if (!board) return;
  board.innerHTML = '';

  for (let b = 0; b < 9; b++) {
    const box = document.createElement('div');
    box.className = 'su-box';

    const boxRow = Math.floor(b / 3);
    const boxCol = b % 3;

    for (let l = 0; l < 9; l++) {
      const localRow = Math.floor(l / 3);
      const localCol = l % 3;
      const row = boxRow * 3 + localRow;
      const col = boxCol * 3 + localCol;
      const idx = row * 9 + col;

      const cell = document.createElement('div');
      cell.className = 'su-cell';
      cell.dataset.idx = idx;
      cell.tabIndex = 0;
      cell.addEventListener('click', () => handleCellClick(idx));
      cell.addEventListener('keydown', handleKeyDown);
      box.appendChild(cell);
    }

    board.appendChild(box);
  }
}

function renderBoard() {
  for (let idx = 0; idx < 81; idx++) {
    renderCell(idx);
  }
  renderHighlights();
}

function renderCell(idx) {
  const cell = document.querySelector('.su-cell[data-idx="' + idx + '"]');
  if (!cell) return;

  cell.className = 'su-cell';
  cell.innerHTML = '';

  const isGiven = puzzle[idx] !== 0;
  const val = isGiven ? puzzle[idx] : userGrid[idx];

  if (isGiven) {
    cell.classList.add('given');
    cell.textContent = val;
  } else if (val !== 0) {
    cell.classList.add('user');
    if (val !== solution[idx]) cell.classList.add('error');
    cell.textContent = val;
  } else {
    const cellNotes = notes[idx];
    if (cellNotes.size > 0) {
      const grid = document.createElement('div');
      grid.className = 'su-notes';
      for (let n = 1; n <= 9; n++) {
        const nc = document.createElement('div');
        nc.className = 'su-note-cell';
        nc.textContent = cellNotes.has(n) ? n : '';
        grid.appendChild(nc);
      }
      cell.appendChild(grid);
    }
  }
}

function renderHighlights() {
  const cells = document.querySelectorAll('.su-cell');
  cells.forEach(c => {
    c.classList.remove('selected', 'highlight', 'same-num');
  });

  if (selected === -1) return;

  const selRow = Math.floor(selected / 9);
  const selCol = selected % 9;
  const selBoxRow = Math.floor(selRow / 3);
  const selBoxCol = Math.floor(selCol / 3);
  const selVal = puzzle[selected] !== 0 ? puzzle[selected] : userGrid[selected];

  cells.forEach(c => {
    const idx = parseInt(c.dataset.idx, 10);
    if (idx === selected) {
      c.classList.add('selected');
      return;
    }
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    const boxRow = Math.floor(row / 3);
    const boxCol = Math.floor(col / 3);

    const sameGroup = row === selRow || col === selCol || (boxRow === selBoxRow && boxCol === selBoxCol);
    if (sameGroup) {
      c.classList.add('highlight');
    }
    if (selVal !== 0) {
      const v = puzzle[idx] !== 0 ? puzzle[idx] : userGrid[idx];
      if (v === selVal && idx !== selected) {
        c.classList.add('same-num');
      }
    }
  });
}

// ─── CELL INTERACTION ────────────────────────────────────────

function handleCellClick(idx) {
  selected = idx;
  renderHighlights();
  const cell = document.querySelector('.su-cell[data-idx="' + idx + '"]');
  if (cell) cell.focus();
}

function handleKeyDown(e) {
  const idx = parseInt(e.target.dataset.idx, 10);
  if (isNaN(idx)) return;

  if (e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    selected = idx;
    inputValue(parseInt(e.key, 10));
    return;
  }
  if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    selected = idx;
    inputValue(0);
    return;
  }
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    toggleNotes();
    return;
  }

  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (moves[e.key] !== undefined) {
    e.preventDefault();
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    let next = idx;
    if (e.key === 'ArrowUp'    && row > 0) next = idx - 9;
    if (e.key === 'ArrowDown'  && row < 8) next = idx + 9;
    if (e.key === 'ArrowLeft'  && col > 0) next = idx - 1;
    if (e.key === 'ArrowRight' && col < 8) next = idx + 1;
    if (next !== idx) {
      selected = next;
      renderHighlights();
      const nc = document.querySelector('.su-cell[data-idx="' + next + '"]');
      if (nc) nc.focus();
    }
  }
}

function padInput(num) {
  if (selected === -1) return;
  inputValue(num);
}

function inputValue(num) {
  if (selected === -1) return;
  if (puzzle[selected] !== 0) return;

  startTimer();

  if (notesMode && num !== 0) {
    if (userGrid[selected] !== 0) return;
    if (notes[selected].has(num)) {
      notes[selected].delete(num);
    } else {
      notes[selected].add(num);
    }
    renderCell(selected);
    renderHighlights();
    return;
  }

  const prev = userGrid[selected];
  userGrid[selected] = num;

  if (num !== 0) {
    notes[selected].clear();
  }

  renderCell(selected);
  renderHighlights();

  if (num !== 0 && num === solution[selected] && prev !== solution[selected]) {
    correctCount++;
    if (mode === 'online') {
      onOnlineCorrectFill();
    } else if (mode === 'local') {
      if (correctCount === 81 - puzzle.filter(v => v !== 0).length) {
        onLocalComplete();
      }
    }
  } else if (prev === solution[selected] && num !== solution[selected]) {
    correctCount = Math.max(0, correctCount - 1);
    if (mode === 'online') {
      onOnlineCorrectFill();
    }
  }
}

function toggleNotes() {
  notesMode = !notesMode;
  document.getElementById('su-notes-btn')?.classList.toggle('notes-active', notesMode);
}

// ─── LOCAL COMPLETION ────────────────────────────────────────

function onLocalComplete() {
  stopTimer();
  const elapsed = elapsedMs();

  if (passPlayPhase === 1) {
    p1Time = elapsed;
    const msg = document.getElementById('pass-msg');
    const sub = document.getElementById('pass-sub');
    if (msg) msg.textContent = names[0] + ' solved it in ' + fmtTime(p1Time) + '!';
    if (sub) sub.textContent = 'Pass the screen to ' + names[1];
    showScreen('pass');
  } else {
    p2Time = elapsed;
    showLocalWin();
  }
}

function startP2Turn() {
  passPlayPhase = 2;
  beginPlayerTurn(1);
  showScreen('game');
}

function showLocalWin() {
  let winnerIdx, sub;
  if (p1Time < p2Time) {
    winnerIdx = 0;
    sub = 'Solved ' + fmtTime(p2Time - p1Time) + ' faster';
  } else if (p2Time < p1Time) {
    winnerIdx = 1;
    sub = 'Solved ' + fmtTime(p1Time - p2Time) + ' faster';
  } else {
    winnerIdx = 0;
    sub = 'Exact same time!';
  }

  document.getElementById('win-name').textContent = names[winnerIdx] + ' wins!';
  document.getElementById('win-sub').textContent  = sub;
  document.getElementById('win-times').innerHTML  =
    names[0] + ': ' + fmtTime(p1Time) + '<br>' + names[1] + ': ' + fmtTime(p2Time);

  window._lvsWinPlayers = { names, winner: winnerIdx };
  launchConfetti();
  showScreen('win');
}

// ─── INIT ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  lvsLoadNames();
  lvsCheckRoomUrl();
  if (typeof lucide !== 'undefined') lucide.createIcons();

  document.addEventListener('keydown', e => {
    if (document.getElementById('screen-game')?.classList.contains('active')) {
      if (selected !== -1) return;
      if (e.key >= '1' && e.key <= '9') { e.preventDefault(); inputValue(parseInt(e.key, 10)); }
      if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); inputValue(0); }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggleNotes(); }
    }
  });
});
