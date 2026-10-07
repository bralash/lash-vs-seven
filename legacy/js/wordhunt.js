const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Find as many words as possible in the letter grid before the timer runs out.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Swipe or drag through adjacent letters to form words.</li>
    <li>Letters must connect horizontally, vertically, or diagonally.</li>
    <li>Each letter in a path can only be used once per word.</li>
    <li>Minimum word length is 3 letters.</li>
  </ol>
</div>
<div class="rs">
  <h3>Scoring</h3>
  <p>Longer words score more points. Finding the same word twice doesn't count.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Look for common endings like -ING, -ER, -ED attached to shorter words already on your list — easy extra points.</div>
`;

/* ============================================================
   WORD HUNT — Lash vs Seven
   ============================================================ */

const GAME_DURATION = 80; // seconds

// ─── module state ───────────────────────────────────────────────
let myIdx     = 0;
let isHost    = false;
let roomRef   = null;
let roomCode  = null;
let gd        = null;
let timerItv  = null;

// game-specific state
let gameActive   = false;
let startTimeMs  = 0;
let gridLetters  = [];
let myWords      = [];
let myWordsSet   = new Set();
let myScore      = 0;

// drag state
let dragging     = false;
let currentPath  = [];      // indices of selected cells
let cellCenters  = [];      // [{x,y}] relative to SVG top-left
let svgEl        = null;
let pathEl       = null;
let gridEl       = null;

function setMsg(elId, text, err) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className   = 'form-msg' + (err ? ' error' : '');
}

// ─── grid generation ───────────────────────────────────────────
const LETTER_POOL = (
  'EEEEEEEEEEEEETTTTTTTTAAAAAAAAAAOOOOOOOOIIIIIIINNNNNNN' +
  'SSSSSSSRRRRRRRHHHHHHDDDDDDLLLLCCCUUUMMMWWWWBBFFGGYYP'
).split('');

function generateGrid() {
  return Array.from({ length: 16 }, () =>
    LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)]
  );
}

// Find all valid words in a grid (DFS + prefix pruning)
function findAllWords(letters) {
  const found = new Set();

  function adj(i) {
    const r = Math.floor(i / 4), c = i % 4, result = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) result.push(nr * 4 + nc);
      }
    }
    return result;
  }

  function dfs(idx, visited, word) {
    if (word.length >= 3 && whIsValidWord(word)) found.add(word);
    if (word.length >= 8) return;
    if (!whIsPrefix(word)) return;
    for (const next of adj(idx)) {
      if (!visited.has(next)) {
        visited.add(next);
        dfs(next, visited, word + letters[next]);
        visited.delete(next);
      }
    }
  }

  for (let i = 0; i < 16; i++) {
    const visited = new Set([i]);
    dfs(i, visited, letters[i]);
  }
  return found;
}

// Generate a grid with at least 10 valid words
function generateValidGrid() {
  let grid, wordCount = 0;
  let attempts = 0;
  do {
    grid = generateGrid();
    wordCount = findAllWords(grid).size;
    attempts++;
  } while (wordCount < 10 && attempts < 20);
  return grid;
}

// ─── room helpers ──────────────────────────────────────────────

function getNames(d) {
  return (d.hostIdx || 0) === 0
    ? [d.host, d.guest || '…']
    : [d.guest || '…', d.host];
}

// ─── create room ───────────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('online-name').value.trim();
  if (!name) { setMsg('online-msg', 'Enter your name first.', true); return; }

  const code    = randomCode();
  const hostIdx = Math.floor(Math.random() * 2);
  const grid    = generateValidGrid();

  roomCode = code; myIdx = hostIdx; isHost = true;
  localStorage.setItem('lvs_wh_room', code);
  localStorage.setItem('lvs_wh_role', 'host');
  lvsSaveNames(name, '');

  db.ref('wh-rooms/' + code).set({
    host:      name,
    guest:     null,
    hostIdx,
    status:    'waiting',
    grid,
    startTime: null,
    words0:    [],
    words1:    [],
    score0:    0,
    score1:    0,
  }).then(() => {
    document.getElementById('waiting-code').textContent = code;
    showScreen('waiting');
    attachListener();
  }).catch(() => setMsg('online-msg', 'Could not create room.', true));
}

// ─── join room ─────────────────────────────────────────────────
function joinRoom() {
  const name = document.getElementById('online-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { setMsg('online-msg', 'Enter your name first.', true); return; }
  if (code.length !== 4) { setMsg('online-msg', 'Enter a 4-letter code.', true); return; }

  db.ref('wh-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d)                     { setMsg('online-msg', 'Room not found.', true);        return; }
    if (d.status !== 'waiting') { setMsg('online-msg', 'Game already started.', true);  return; }
    if (d.guest)                { setMsg('online-msg', 'Room is full.', true);           return; }

    roomCode = code; myIdx = 1 - (d.hostIdx || 0); isHost = false;
    localStorage.setItem('lvs_wh_room', code);
    localStorage.setItem('lvs_wh_role', 'guest');
    lvsSaveNames(name, '');

    db.ref('wh-rooms/' + code).update({
      guest:     name,
      status:    'playing',
      startTime: firebase.database.ServerValue.TIMESTAMP,
    }).then(() => {
      attachListener();
      db.ref('wh-rooms/' + code).once('value').then(snap2 => startGame(snap2.val()));
    }).catch(() => setMsg('online-msg', 'Could not join room.', true));
  }).catch(() => setMsg('online-msg', 'Could not reach server.', true));
}

// ─── Firebase listener ─────────────────────────────────────────
function attachListener() {
  if (roomRef) roomRef.off();
  roomRef = db.ref('wh-rooms/' + roomCode);
  roomRef.on('value', snap => handleUpdate(snap.val()));
}

function handleUpdate(d) {
  if (!d) return;
  lvsOnlineUpdate(d);
  gd = d;

  const activeId = document.querySelector('.screen.active')?.id;

  // Host sees guest join → start game
  if (d.status === 'playing' && activeId === 'screen-waiting') {
    startGame(d);
    return;
  }

  // Play Again — both players restart in the same room
  if (d.status === 'playing' && activeId === 'screen-results') {
    startGame(d);
    return;
  }

  if (d.status === 'done' && activeId !== 'screen-results') {
    showResults(d);
    return;
  }

  if (d.ready0 === true && d.ready1 === true && isHost) {
    const grid = generateValidGrid();
    roomRef.update({
      status:    'playing',
      grid,
      startTime: firebase.database.ServerValue.TIMESTAMP,
      words0:    [],
      words1:    [],
      score0:    0,
      score1:    0,
      ready0:    false,
      ready1:    false,
    });
    return;
  }

  if (d.status !== 'playing') return;

  // Live score updates during game
  if (activeId === 'screen-game') {
    document.getElementById('wh-score-0').textContent = d.score0 || 0;
    document.getElementById('wh-score-1').textContent = d.score1 || 0;
  }
}

// ─── start game ────────────────────────────────────────────────
function startGame(d) {
  if (roomRef) lvsOnlineStart(roomRef, myIdx, backToLobby);
  gd = d;
  // Reset local state
  myWords    = [];
  myWordsSet = new Set();
  myScore    = 0;
  gameActive = false;
  currentPath = [];

  gridLetters = d.grid;
  startTimeMs = d.startTime || Date.now();

  const names = getNames(d);
  document.getElementById('wh-name-0').textContent  = names[0];
  document.getElementById('wh-name-1').textContent  = names[1];
  document.getElementById('wh-score-0').textContent = '0';
  document.getElementById('wh-score-1').textContent = '0';

  buildGrid(d.grid);
  showScreen('game');
  document.getElementById('wh-words-strip').innerHTML = '';
  document.getElementById('wh-current-word').textContent = '';

  // Wait two frames so grid is laid out, then compute cell centers and start timer
  requestAnimationFrame(() => requestAnimationFrame(() => {
    computeCellCenters();
    gameActive = true;
    startTimer();
  }));
}

// ─── grid rendering ────────────────────────────────────────────
function buildGrid(letters) {
  // Remove stale document-level listeners before re-adding (play-again guard)
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);

  gridEl  = document.getElementById('wh-grid');
  svgEl   = document.getElementById('wh-svg');
  pathEl  = document.getElementById('wh-path');
  gridEl.innerHTML = '';

  letters.forEach((letter, i) => {
    const cell = document.createElement('div');
    cell.className  = 'wh-cell';
    cell.dataset.idx = i;
    cell.textContent = letter;
    gridEl.appendChild(cell);
  });

  // Pointer events on grid container
  gridEl.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
}

function computeCellCenters() {
  if (!svgEl) return;
  const svgRect = svgEl.getBoundingClientRect();
  const cells = document.querySelectorAll('.wh-cell');
  cellCenters = Array.from(cells).map(cell => {
    const r = cell.getBoundingClientRect();
    return {
      x: r.left + r.width  / 2 - svgRect.left,
      y: r.top  + r.height / 2 - svgRect.top,
    };
  });
}

window.addEventListener('resize', () => {
  if (document.getElementById('screen-game').classList.contains('active')) {
    computeCellCenters();
  }
});

// ─── adjacency ─────────────────────────────────────────────────
function isAdjacent(a, b) {
  const ar = Math.floor(a / 4), ac = a % 4;
  const br = Math.floor(b / 4), bc = b % 4;
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1 && a !== b;
}

// ─── cell hit detection (pointer-down only) ────────────────────
// Returns the cell index under clientX/Y using direct hit test +
// proximity fallback. Only used for the initial tap — drag uses
// direction-snapping instead (see onPointerMove).
function cellAtPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const direct = el?.closest?.('.wh-cell');
  if (direct) return parseInt(direct.dataset.idx);

  if (!cellCenters.length || !svgEl) return -1;
  const svgRect = svgEl.getBoundingClientRect();
  const px = clientX - svgRect.left;
  const py = clientY - svgRect.top;
  const spacing = cellCenters.length > 1
    ? Math.abs(cellCenters[1].x - cellCenters[0].x) : 60;

  let best = -1, bestD = Infinity;
  cellCenters.forEach(({ x, y }, i) => {
    const d = Math.hypot(px - x, py - y);
    if (d < spacing * 0.55 && d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// Map atan2 angle (degrees, -180..180) to the nearest (dr, dc) in 8 octants.
// This is the key to clean diagonal selection: we snap the pointer's movement
// direction to the nearest 45° step rather than asking which cell is under the pointer.
function angleToDir(deg) {
  const map = [
    [   0, [ 0,  1]],  //   0° → E
    [  45, [ 1,  1]],  //  45° → SE
    [  90, [ 1,  0]],  //  90° → S
    [ 135, [ 1, -1]],  // 135° → SW
    [ 180, [ 0, -1]],  // 180° → W
    [-135, [-1, -1]],  // -135° → NW
    [ -90, [-1,  0]],  //  -90° → N
    [ -45, [-1,  1]],  //  -45° → NE
  ];
  let best = map[0][1], bestDiff = Infinity;
  for (const [a, dir] of map) {
    let d = Math.abs(deg - a);
    if (d > 180) d = 360 - d;
    if (d < bestDiff) { bestDiff = d; best = dir; }
  }
  return best;
}

// ─── pointer handlers ──────────────────────────────────────────
function onPointerDown(e) {
  if (!gameActive) return;
  e.preventDefault();
  const idx = cellAtPoint(e.clientX, e.clientY);
  if (idx < 0) return;
  dragging    = true;
  currentPath = [idx];
  gridEl.setPointerCapture(e.pointerId);
  updatePathDisplay();
}

function onPointerMove(e) {
  if (!dragging || !gameActive) return;
  if (!cellCenters.length || !svgEl || currentPath.length === 0) return;

  const svgRect = svgEl.getBoundingClientRect();
  const px      = e.clientX - svgRect.left;
  const py      = e.clientY - svgRect.top;
  const spacing = cellCenters.length > 1
    ? Math.abs(cellCenters[1].x - cellCenters[0].x) : 60;

  // Walk toward the pointer one cell at a time. The loop handles fast swipes
  // that skip multiple cells — each iteration advances one step.
  for (let step = 0; step < 8; step++) {
    const prevLen = currentPath.length;
    const lastIdx = currentPath[currentPath.length - 1];
    const { x: lx, y: ly } = cellCenters[lastIdx];
    const dx = px - lx;
    const dy = py - ly;

    // Dead zone: don't register a new cell until the pointer has moved
    // at least 40% of cell spacing from the last registered cell.
    // This prevents jitter and gives direction a chance to establish.
    if (Math.hypot(dx, dy) < spacing * 0.40) break;

    // Snap the movement vector to the nearest 45° octant, then step one cell.
    // This avoids the core diagonal problem: during a diagonal swipe the
    // pointer physically crosses orthogonal neighbours, and elementFromPoint
    // would incorrectly select them. Direction-snapping ignores which cell
    // is under the pointer and only cares about which direction we're moving.
    const [dr, dc] = angleToDir(Math.atan2(dy, dx) * 180 / Math.PI);
    const row = Math.floor(lastIdx / 4) + dr;
    const col = (lastIdx % 4) + dc;
    if (row < 0 || row >= 4 || col < 0 || col >= 4) break;

    handleCellEnter(row * 4 + col);

    // Stop if the path didn't grow (cell was rejected or a backtrack happened)
    if (currentPath.length <= prevLen) break;
  }
}

function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;
  const pathCopy = [...currentPath];
  currentPath = [];
  updatePathDisplay();
  if (gameActive) submitPath(pathCopy);
}

function handleCellEnter(idx) {
  if (currentPath.length === 0) return;
  const last = currentPath[currentPath.length - 1];
  if (idx === last) return;

  // Backtrack: if user revisits an earlier cell, truncate path to that cell
  const prev = currentPath.indexOf(idx);
  if (prev >= 0) {
    currentPath = currentPath.slice(0, prev + 1);
    updatePathDisplay();
    return;
  }

  if (!isAdjacent(last, idx)) return;
  currentPath.push(idx);
  updatePathDisplay();
}

// ─── path display ──────────────────────────────────────────────
function updatePathDisplay() {
  // Highlight selected cells
  document.querySelectorAll('.wh-cell').forEach(c => c.classList.remove('selected'));
  currentPath.forEach(i => {
    const cell = document.querySelector(`.wh-cell[data-idx="${i}"]`);
    if (cell) cell.classList.add('selected');
  });

  // Draw SVG path through cell centers
  if (!pathEl || !cellCenters.length) return;
  if (currentPath.length === 0) {
    pathEl.setAttribute('d', '');
    document.getElementById('wh-current-word').textContent = '';
    return;
  }

  const pts = currentPath.map(i => cellCenters[i]).filter(Boolean);
  if (pts.length === 0) { pathEl.setAttribute('d', ''); return; }

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i].x},${pts[i].y}`;
  }
  pathEl.setAttribute('d', d);

  // Show current word forming
  const word = currentPath.map(i => gridLetters[i]).join('');
  const cwEl = document.getElementById('wh-current-word');
  cwEl.textContent = word;
  cwEl.style.color = word.length >= 3 && whIsValidWord(word)
    ? 'var(--green)'
    : word.length >= 3 && !whIsPrefix(word)
      ? 'var(--orange)'
      : 'var(--orange)';
}

// ─── word submission ────────────────────────────────────────────
function submitPath(path) {
  if (path.length < 3) {
    flashCells(path, 'red');
    return;
  }
  const word = path.map(i => gridLetters[i]).join('');
  if (word.length < 3) { flashCells(path, 'red'); return; }

  if (myWordsSet.has(word)) {
    // Already found — flash briefly
    flashCells(path, 'red');
    return;
  }

  if (!whIsValidWord(word)) {
    flashCells(path, 'red');
    playWrong();
    return;
  }

  // Valid new word!
  myWordsSet.add(word);
  myWords.push(word);
  myScore += whScore(word.length);

  flashCells(path, 'green');
  playFind(word.length);
  addWordChip(word);

  const update = {};
  update[`words${myIdx}`] = myWords;
  update[`score${myIdx}`] = myScore;
  db.ref('wh-rooms/' + roomCode).update(update).catch(() => {});
}

function flashCells(path, color) {
  const cls = 'flash-' + color;
  path.forEach(i => {
    const cell = document.querySelector(`.wh-cell[data-idx="${i}"]`);
    if (!cell) return;
    cell.classList.remove('selected', 'flash-green', 'flash-red');
    cell.classList.add(cls);
    setTimeout(() => cell.classList.remove(cls), 380);
  });
}

function addWordChip(word) {
  const strip = document.getElementById('wh-words-strip');
  const chip  = document.createElement('div');
  chip.className   = 'wh-word-chip';
  chip.textContent = word;
  strip.prepend(chip);
}

// ─── timer ─────────────────────────────────────────────────────
function startTimer() {
  const bar   = document.getElementById('wh-timer-bar');
  const label = document.getElementById('wh-timer-label');
  const pill  = document.getElementById('wh-timer-pill');

  // Reset bar
  bar.style.transition = 'none';
  bar.style.width      = '100%';
  bar.classList.remove('urgent');
  bar.getBoundingClientRect(); // force reflow

  clearInterval(timerItv);
  timerItv = setInterval(() => {
    const elapsed   = Date.now() - startTimeMs;
    const remaining = Math.max(0, GAME_DURATION * 1000 - elapsed);
    const pct       = (remaining / (GAME_DURATION * 1000)) * 100;
    const secs      = Math.ceil(remaining / 1000);

    bar.style.transition = 'none';
    bar.style.width      = pct + '%';
    label.textContent    = secs;
    if (pill) pill.textContent = '0:' + String(secs).padStart(2, '0');

    if (remaining <= 10000 && !bar.classList.contains('urgent')) {
      bar.classList.add('urgent');
    }

    if (remaining <= 0) {
      clearInterval(timerItv);
      timerItv = null;
      gameOver();
    }
  }, 200);
}

function gameOver() {
  gameActive = false;
  document.getElementById('wh-current-word').textContent = '';
  if (pathEl) pathEl.setAttribute('d', '');
  document.querySelectorAll('.wh-cell').forEach(c => c.classList.remove('selected'));

  // Host finalises the game after a short delay so both sides flush their last word
  if (isHost) {
    setTimeout(() => {
      if (!roomCode) return;
      db.ref('wh-rooms/' + roomCode).update({ status: 'done' }).catch(() => {});
    }, 1600);
  }
}

// ─── results ───────────────────────────────────────────────────
function showResults(d) {
  clearInterval(timerItv);
  timerItv = null;
  gameActive = false;

  const names  = getNames(d);
  const words0 = d.words0 || [];
  const words1 = d.words1 || [];
  const sc0    = d.score0 || 0;
  const sc1    = d.score1 || 0;

  const set0 = new Set(words0);
  const set1 = new Set(words1);

  // Determine winner
  const headline = document.getElementById('res-headline');
  const resSub   = document.getElementById('res-sub');
  let winnerIdx  = sc0 > sc1 ? 0 : sc1 > sc0 ? 1 : -1;

  if (winnerIdx === myIdx) {
    headline.textContent = 'You Win!';
    headline.className   = 'res-headline win-color';
  } else if (winnerIdx === -1) {
    headline.textContent = "It's a Draw!";
    headline.className   = 'res-headline';
  } else {
    headline.textContent = names[winnerIdx] + ' Wins';
    headline.className   = 'res-headline';
  }

  resSub.textContent = sc0 + ' — ' + sc1;

  // Populate columns
  for (let p = 0; p < 2; p++) {
    const words     = p === 0 ? words0 : words1;
    const otherSet  = p === 0 ? set1 : set0;
    const score     = p === 0 ? sc0 : sc1;
    const isWinner  = p === winnerIdx;

    document.getElementById('res-name-'  + p).textContent = names[p];
    document.getElementById('res-name-'  + p).className   = 'wh-result-name'  + (isWinner ? ' winner' : '');
    document.getElementById('res-score-' + p).textContent = score;
    document.getElementById('res-score-' + p).className   = 'wh-result-score' + (isWinner ? ' winner' : '');

    const container = document.getElementById('res-words-' + p);
    container.innerHTML = '';

    // Sort by length desc, then alpha
    const sorted = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b));
    sorted.forEach(word => {
      const row    = document.createElement('div');
      const unique = !otherSet.has(word);
      row.className = 'wh-result-word' + (unique ? ' unique' : '');

      const w   = document.createElement('span');
      w.textContent = word;

      const pts   = document.createElement('span');
      pts.className   = 'pts';
      pts.textContent = '+' + whScore(word.length);

      row.appendChild(w);
      row.appendChild(pts);
      container.appendChild(row);
    });
  }

  window._lvsWinPlayers = { names, winner: winnerIdx === -1 ? 2 : winnerIdx };
  showScreen('results');
  if (winnerIdx === myIdx) launchConfetti();
}

// ─── navigation ────────────────────────────────────────────────
function playAgain() {
  if (!roomCode) { showScreen('lobby'); return; }
  clearInterval(timerItv);
  timerItv = null;
  const btn = document.getElementById('win-again-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
  roomRef.update({ ['ready' + myIdx]: true });
}

function backToLobby() {
  cleanupRoom();
  showScreen('lobby');
}

function quitGame() {
  if (!confirm('Exit the game? Your opponent will win by forfeit.')) return;
  if (isHost && roomCode) {
    const update = { status: 'done' };
    // Give opponent the win
    const oppIdx = 1 - myIdx;
    update['score' + oppIdx] = (gd?.['score' + oppIdx] || 0) + 1;
    db.ref('wh-rooms/' + roomCode).update(update).catch(() => {});
  }
  cleanupRoom();
  showScreen('lobby');
}

function cleanupRoom() {
  lvsOnlineStop();
  clearInterval(timerItv);
  timerItv = null;
  gameActive = false;
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (roomCode && isHost) {
    db.ref('wh-rooms/' + roomCode).update({ status: 'done' }).catch(() => {});
  }
  localStorage.removeItem('lvs_wh_room');
  localStorage.removeItem('lvs_wh_role');
  roomCode = null;

  // Remove pointer listeners to avoid leaks
  if (gridEl) {
    gridEl.removeEventListener('pointerdown', onPointerDown);
  }
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  gridEl = null;
}

function copyCode() {
  const btn = document.getElementById('waiting-copy-btn');
  lvsCopyLink(roomCode, btn, 'Copy Link');
}

// ─── reconnect on page load ────────────────────────────────────
(function tryReconnect() {
  const code = localStorage.getItem('lvs_wh_room');
  const role = localStorage.getItem('lvs_wh_role');
  if (!code || !role) return;

  db.ref('wh-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d || d.status !== 'playing') {
      localStorage.removeItem('lvs_wh_room');
      localStorage.removeItem('lvs_wh_role');
      return;
    }
    roomCode = code;
    isHost   = role === 'host';
    myIdx    = isHost ? (d.hostIdx || 0) : 1 - (d.hostIdx || 0);
    attachListener();
    startGame(d);
  }).catch(() => {});
})();

// ─── sound ─────────────────────────────────────────────────────

function playFind(wordLen) {
  if (isMuted()) return;
  try {
    const ctx  = audioCtx();
    // Higher pitch / more notes for longer words
    const freqs = wordLen >= 6
      ? [523.25, 659.25, 783.99, 1046.5]
      : wordLen >= 5
        ? [523.25, 659.25, 783.99]
        : wordLen >= 4
          ? [523.25, 659.25]
          : [659.25];
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.07;
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t); osc.stop(t + 0.25);
    });
  } catch (_) {}
}

function playWrong() {
  if (isMuted()) return;
  try {
    const ctx  = audioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth'; osc.frequency.value = 160;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  } catch (_) {}
}

// ─── confetti ──────────────────────────────────────────────────
