const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Sink all five of your opponent's ships before they sink yours.</p>
</div>
<div class="rs">
  <h3>Ships</h3>
  <p>Each fleet has 5 ships: Carrier (5 squares), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).</p>
</div>
<div class="rs">
  <h3>Setup</h3>
  <p>Place all your ships on the grid — horizontally or vertically. Ships cannot touch or overlap.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>On your turn, tap a coordinate on the opponent's grid to fire.</li>
    <li><strong>Hit</strong> — the square turns red. <strong>Miss</strong> — the square turns white.</li>
    <li>When all squares of a ship are hit, it is sunk.</li>
  </ol>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Once you score a hit, fire at adjacent squares to find the full length of the ship.</div>
`;

// ============================================================
// CONSTANTS
// ============================================================
const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = [1,2,3,4,5,6,7,8,9,10];

const SHIPS = [
  { name: 'Battleship', size: 5, emoji: '⚔️' },
  { name: 'Cruiser',    size: 4, emoji: '🚀' },
  { name: 'Submarine',  size: 3, emoji: '🔱' },
  { name: 'Destroyer',  size: 2, emoji: '⚡' },
];

// ============================================================
// SHIP SVG SILHOUETTES (top-down view, index matches SHIPS array)
// ============================================================
const SHIP_IMGS = [
  'imgs/ship1.png', // Battleship (5 cells)
  'imgs/ship2.png', // Cruiser (4 cells)
  'imgs/ship3.png', // Submarine (3 cells)
  'imgs/ship4.png', // Destroyer (2 cells)
];

// ============================================================
// GAME STATE
// ============================================================
const state = {
  players:      ['Player 1', 'Player 2'],
  boards:       [null, null],
  placements:   [[], []],
  shots:        [new Set(), new Set()],
  setupPlayer:  0,
  setupShipIdx: 0,
  orientation:  'H',
  currentPlayer: 0,
  shotFired:    false,
  phase:        'setup',
  handoffTarget: 'setup',
  lastShot:           null,   // Feature 6: {r,c}
  lastIncomingShot:   null,   // Feature 8: {r,c,targetPlayer}
  justSunkIdx:        -1,     // Feature 10
};

function makeBoard() {
  return Array.from({length: 10}, () =>
    Array.from({length: 10}, () =>
      ({ ship: null, hit: false, shipPos: null, shipOrient: null })
    )
  );
}

// ============================================================
// UTILITY
// ============================================================
function cellKey(r, c)       { return `${r},${c}`; }
function inBounds(r, c)      { return r >= 0 && r < 10 && c >= 0 && c < 10; }
function shipCells(r, c, sz, o) {
  return Array.from({length: sz}, (_, i) =>
    o === 'H' ? [r, c + i] : [r + i, c]
  );
}
function posTag(i, size)     {
  if (size === 1) return 'solo';
  if (i === 0)    return 'start';
  if (i === size - 1) return 'end';
  return 'mid';
}

// ============================================================
// FIREBASE
// ============================================================

// Online multiplayer session state
const mp = {
  active:   false,
  roomCode: null,
  role:     null,   // 'host' | 'guest'
  myIdx:    null,   // 0 (host) | 1 (guest)
  myTurn:   false,
};
const mpRef = () => db.ref(`rooms/${mp.roomCode}`);

// ============================================================
// LOBBY
// ============================================================
function generateRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function openCreateLobby() {
  const code = generateRoomCode();
  mp.roomCode = code;
  mp.role     = 'host';
  mp.myIdx    = 0;

  document.getElementById('room-code-display').textContent = code;
  document.getElementById('host-name-section').style.display     = 'block';
  document.getElementById('lobby-create-waiting').style.display  = 'none';
  showScreen('lobby-create');

  // Reserve the room so no one else takes the code
  db.ref(`rooms/${code}`).set({
    phase: 'waiting', hostName: null, guestName: null,
    hostReady: false, guestReady: false,
    turn: 'host', winner: null,
    createdAt: Date.now(),
  });
}

function hostStartWaiting() {
  const name = document.getElementById('host-name-input').value.trim() || 'Lash';
  lvsSaveNames(name, null);
  mp.active = false; // not yet in game
  state.players[0] = name;

  mpRef().update({ hostName: name });
  localStorage.setItem('lvs_room', mp.roomCode);
  localStorage.setItem('lvs_role', 'host');

  document.getElementById('host-name-section').style.display    = 'none';
  document.getElementById('lobby-create-waiting').style.display = 'block';
  document.getElementById('waiting-status-text').textContent    = 'Awaiting your opponent...';

  mpRef().on('value', snap => {
    const room = snap.val();
    if (!room) return;
    if (room.guestName && room.phase === 'waiting') {
      document.getElementById('waiting-status-text').textContent = `${room.guestName} joined — setting sail!`;
      mpRef().update({ phase: 'setup' });
    }
    if (room.phase === 'setup') {
      mpRef().off('value');
      state.players[1] = room.guestName || 'Guest';
      startOnlineSetup();
    }
  });
}

async function joinBattle() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  const errEl = document.getElementById('join-error');
  errEl.style.display = 'none';

  if (code.length < 4) { document.getElementById('join-code-input').focus(); return; }

  const snap = await db.ref(`rooms/${code}`).once('value');
  const room = snap.val();

  if (!room) {
    errEl.textContent = 'Room not found — check the code.';
    errEl.style.display = 'block';
    return;
  }
  if (room.phase !== 'waiting') {
    errEl.textContent = 'This battle has already started.';
    errEl.style.display = 'block';
    return;
  }

  const name = document.getElementById('guest-name-input').value.trim() || 'Seven';
  lvsSaveNames(name, null);
  mp.roomCode = code;
  mp.role     = 'guest';
  mp.myIdx    = 1;
  state.players[0] = room.hostName || 'Player 1';
  state.players[1] = name;

  localStorage.setItem('lvs_room', code);
  localStorage.setItem('lvs_role', 'guest');

  await db.ref(`rooms/${code}`).update({ guestName: name });

  // Wait for host to advance phase to 'setup'
  db.ref(`rooms/${code}`).on('value', snap => {
    const r = snap.val();
    if (!r) return;
    if (r.phase === 'setup') {
      db.ref(`rooms/${code}`).off('value');
      state.players[0] = r.hostName || 'Player 1';
      startOnlineSetup();
    }
  });
}

// ============================================================
// WELCOME
// ============================================================
function startGame() {
  const p1 = document.getElementById('p1-name').value.trim() || 'Player 1';
  const p2 = document.getElementById('p2-name').value.trim() || 'Player 2';
  lvsSaveNames(p1, p2);
  state.players    = [p1, p2];
  state.boards     = [makeBoard(), makeBoard()];
  state.placements = [[], []];
  state.shots      = [new Set(), new Set()];
  startSetup(0);
}

// ============================================================
// ONLINE SETUP ENTRY
// ============================================================
function startOnlineSetup() {
  mp.active = true;
  const myIdx = mp.myIdx;
  state.boards     = [makeBoard(), makeBoard()];
  state.placements = [[], []];
  state.shots      = [new Set(), new Set()];
  state.setupPlayer  = myIdx;
  state.setupShipIdx = 0;
  state.orientation  = 'H';

  document.getElementById('setup-phase-tag').textContent  = `Setup — ${state.players[myIdx]}`;
  document.getElementById('setup-grid-label').textContent = `${state.players[myIdx]}'s Fleet`;
  document.getElementById('btn-done-setup').disabled = true;
  document.getElementById('btn-done-setup').textContent = 'Ready';

  setOrientation('H');
  renderFleetList();
  updateUndoButton();
  updateHint();
  renderSetupGrid();
  showScreen('setup');
}

// ============================================================
// SETUP PHASE
// ============================================================
function startSetup(playerIdx) {
  state.setupPlayer  = playerIdx;
  state.setupShipIdx = 0;
  state.boards[playerIdx]     = makeBoard();
  state.placements[playerIdx] = [];

  document.getElementById('setup-phase-tag').textContent  = `Setup — ${state.players[playerIdx]}`;
  document.getElementById('setup-grid-label').textContent = `${state.players[playerIdx]}'s Fleet`;
  document.getElementById('btn-done-setup').disabled = true;

  setOrientation('H');
  renderFleetList();
  updateUndoButton();
  updateHint();
  renderSetupGrid();
  showScreen('setup');
}

function setOrientation(o) {
  state.orientation = o;
  document.getElementById('btn-horiz').classList.toggle('active', o === 'H');
  document.getElementById('btn-vert').classList.toggle('active',  o === 'V');
  renderSetupGrid();
}

function renderFleetList() {
  const el = document.getElementById('setup-ship-list');
  el.innerHTML = '';
  SHIPS.forEach((ship, idx) => {
    const placed = idx < state.setupShipIdx;
    const active = idx === state.setupShipIdx;
    const div = document.createElement('div');
    div.className = 'fleet-item' + (placed ? ' placed' : '') + (active ? ' active' : '');
    div.innerHTML = `
      <div class="fleet-dot"></div>
      <span>${ship.name}</span>
      <div class="fleet-pips">${'<div class="fleet-pip"></div>'.repeat(ship.size)}</div>
    `;
    el.appendChild(div);
  });
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('btn-undo');
  if (btn) btn.disabled = state.placements[state.setupPlayer].length === 0;
}

function updateHint() {
  const hint = document.getElementById('setup-hint');
  if (state.setupShipIdx >= SHIPS.length) {
    hint.innerHTML = 'All ships placed! Click <strong>Ready</strong> when set.';
    return;
  }
  const s = SHIPS[state.setupShipIdx];
  hint.innerHTML = `Click a cell to place your <strong>${s.name} (${s.size})</strong>`;
}

// ---- Drag-to-place state (Feature 3) ----
let dragStartR = -1, dragStartC = -1, wasDragged = false;
let docMouseUpAdded = false;

// ---- Setup grid render ----
function renderSetupGrid() {
  const p     = state.setupPlayer;
  const board = state.boards[p];
  const el    = document.getElementById('setup-grid');
  el.innerHTML = '';

  el.appendChild(makeColHeader());

  const body = document.createElement('div');
  body.className = 'grid-body setup-grid';
  for (let r = 0; r < 10; r++) {
    const row = makeRow(r);
    for (let c = 0; c < 10; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      const sq = board[r][c];
      if (sq.ship !== null) {
        cell.classList.add('ship');
      }
      cell.addEventListener('click',       onSetupClick);
      cell.addEventListener('mouseenter',  onSetupHover);
      cell.addEventListener('mouseleave',  onSetupLeave);
      cell.addEventListener('mousedown',   onSetupMouseDown);
      cell.addEventListener('mouseenter',  onSetupDragEnter);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  addShipOverlays(body, p);
  el.appendChild(body);
}

function getSetupCells(r, c) {
  if (state.setupShipIdx >= SHIPS.length) return null;
  return shipCells(r, c, SHIPS[state.setupShipIdx].size, state.orientation);
}

function isValidPlacement(cells, p) {
  return cells.every(([r, c]) => inBounds(r, c) && state.boards[p][r][c].ship === null);
}

function onSetupHover(e) {
  if (state.setupShipIdx >= SHIPS.length) return;
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  const cells = getSetupCells(r, c);
  const valid  = isValidPlacement(cells, state.setupPlayer);
  clearGhosts();
  cells.forEach(([nr, nc], i) => {
    const el = getSetupCell(nr, nc);
    if (!el) return;
    const pos = posTag(i, cells.length);
    const oc  = state.orientation === 'H' ? 'sh' : 'sv';
    el.classList.add(valid ? 'ghost' : 'ghost-bad');
    if (pos !== 'mid') el.classList.add(`${oc}-${pos}`);
  });
}

function onSetupLeave() { clearGhosts(); }

// Feature 3: Drag-to-place handlers
function onSetupMouseDown(e) {
  if (e.button !== 0) return;
  dragStartR = +e.currentTarget.dataset.r;
  dragStartC = +e.currentTarget.dataset.c;
  wasDragged = false;
  if (!docMouseUpAdded) {
    document.addEventListener('mouseup', onDocMouseUp);
    docMouseUpAdded = true;
  }
}

function onSetupDragEnter(e) {
  if (dragStartR < 0) return;
  const curR = +e.currentTarget.dataset.r;
  const curC = +e.currentTarget.dataset.c;
  const dr = curR - dragStartR;
  const dc = curC - dragStartC;
  if (dr === 0 && dc === 0) return;
  wasDragged = true;
  const newOrient = Math.abs(dc) >= Math.abs(dr) ? 'H' : 'V';
  if (newOrient !== state.orientation) {
    state.orientation = newOrient;
    document.getElementById('btn-horiz').classList.toggle('active', newOrient === 'H');
    document.getElementById('btn-vert').classList.toggle('active',  newOrient === 'V');
  }
  // Show ghost from drag start cell
  if (state.setupShipIdx >= SHIPS.length) return;
  const cells = getSetupCells(dragStartR, dragStartC);
  const valid  = isValidPlacement(cells, state.setupPlayer);
  clearGhosts();
  cells.forEach(([nr, nc], i) => {
    const el = getSetupCell(nr, nc);
    if (!el) return;
    const pos = posTag(i, cells.length);
    const oc  = state.orientation === 'H' ? 'sh' : 'sv';
    el.classList.add(valid ? 'ghost' : 'ghost-bad');
    if (pos !== 'mid') el.classList.add(`${oc}-${pos}`);
  });
}

function onDocMouseUp() {
  if (wasDragged && dragStartR >= 0) {
    placeShipAt(dragStartR, dragStartC);
  }
  dragStartR = -1; dragStartC = -1;
  // wasDragged is reset in onSetupClick after click fires
}

function clearGhosts() {
  document.querySelectorAll('#setup-grid .ghost, #setup-grid .ghost-bad')
    .forEach(el => {
      el.classList.remove('ghost','ghost-bad',
        'sh-start','sh-end','sh-solo','sv-start','sv-end','sv-solo');
    });
}

function getSetupCell(r, c) {
  return document.querySelector(`#setup-grid .cell[data-r="${r}"][data-c="${c}"]`);
}

function placeShipAt(r, c) {
  if (state.setupShipIdx >= SHIPS.length) return false;
  const cells = getSetupCells(r, c);
  if (!isValidPlacement(cells, state.setupPlayer)) return false;

  const p      = state.setupPlayer;
  const idx    = state.setupShipIdx;
  const orient = state.orientation.toLowerCase();
  const size   = cells.length;

  cells.forEach(([nr, nc], i) => {
    state.boards[p][nr][nc].ship       = idx;
    state.boards[p][nr][nc].shipPos    = posTag(i, size);
    state.boards[p][nr][nc].shipOrient = orient;
  });
  state.placements[p].push({ shipIdx: idx, cells });
  state.setupShipIdx++;

  renderFleetList();
  updateHint();
  renderSetupGrid();

  if (state.setupShipIdx >= SHIPS.length) {
    document.getElementById('btn-done-setup').disabled = false;
  }
  return true;
}

function onSetupClick(e) {
  if (wasDragged) { wasDragged = false; return; }
  if (state.setupShipIdx >= SHIPS.length) return;
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  placeShipAt(r, c);
}

function resetSetup() {
  const p = state.setupPlayer;
  state.boards[p]     = makeBoard();
  state.placements[p] = [];
  state.setupShipIdx  = 0;
  renderFleetList();
  updateUndoButton();
  updateHint();
  renderSetupGrid();
  document.getElementById('btn-done-setup').disabled = true;
}

// Feature 1: Randomize placement
function randomizeSetup() {
  const p = state.setupPlayer;
  state.boards[p]     = makeBoard();
  state.placements[p] = [];
  state.setupShipIdx  = 0;

  for (let idx = 0; idx < SHIPS.length; idx++) {
    const size = SHIPS[idx].size;
    let placed = false;
    for (let attempt = 0; attempt < 500 && !placed; attempt++) {
      const orient = Math.random() < 0.5 ? 'H' : 'V';
      const maxR   = orient === 'H' ? 10 : 10 - size;
      const maxC   = orient === 'H' ? 10 - size : 10;
      const r = Math.floor(Math.random() * maxR);
      const c = Math.floor(Math.random() * maxC);
      const cells = shipCells(r, c, size, orient);
      if (isValidPlacement(cells, p)) {
        const orientLower = orient.toLowerCase();
        cells.forEach(([nr, nc], i) => {
          state.boards[p][nr][nc].ship       = idx;
          state.boards[p][nr][nc].shipPos    = posTag(i, size);
          state.boards[p][nr][nc].shipOrient = orientLower;
        });
        state.placements[p].push({ shipIdx: idx, cells });
        state.setupShipIdx++;
        placed = true;
      }
    }
  }

  renderFleetList();
  updateHint();
  renderSetupGrid();
  if (state.setupShipIdx >= SHIPS.length) {
    document.getElementById('btn-done-setup').disabled = false;
  }
}

// Feature 2: Undo last ship
function undoLastShip() {
  const p = state.setupPlayer;
  if (state.placements[p].length === 0) return;
  const last = state.placements[p].pop();
  last.cells.forEach(([r, c]) => {
    state.boards[p][r][c].ship       = null;
    state.boards[p][r][c].shipPos    = null;
    state.boards[p][r][c].shipOrient = null;
    state.boards[p][r][c].hit        = false;
  });
  state.setupShipIdx--;
  document.getElementById('btn-done-setup').disabled = true;
  renderFleetList();
  updateHint();
  renderSetupGrid();
}

function doneSetup() {
  if (state.setupShipIdx < SHIPS.length) return;

  if (mp.active) {
    // Write placements + set ready flag in Firebase
    const myIdx = mp.myIdx;
    const placementsDB = state.placements[myIdx].map(pl => ({
      shipIdx: pl.shipIdx,
      cells:   pl.cells,
    }));
    const update = {};
    update[mp.role === 'host' ? 'hostPlacements' : 'guestPlacements'] = placementsDB;
    update[mp.role === 'host' ? 'hostReady'      : 'guestReady']      = true;
    mpRef().update(update);

    const doneBtn = document.getElementById('btn-done-setup');
    doneBtn.disabled    = true;
    doneBtn.textContent = 'Waiting for opponent...';
    document.getElementById('setup-hint').innerHTML = 'Fleet deployed! Waiting for opponent...';

    mpRef().on('value', snap => {
      const room = snap.val();
      if (!room) return;
      if (room.hostReady && room.guestReady && room.phase === 'setup') {
        if (mp.role === 'host') mpRef().update({ phase: 'battle', turn: 'host' });
      }
      if (room.phase === 'battle') {
        mpRef().off('value');
        rebuildBoardsFromRoom(room);
        startOnlineBattle(room);
      }
    });
    return;
  }

  // Local mode
  if (state.setupPlayer === 0) {
    showHandoff(state.players[1], 'setup');
  } else {
    state.currentPlayer = 0;
    state.shotFired     = false;
    showHandoff(state.players[0], 'battle');
  }
}

// ============================================================
// HANDOFF
// ============================================================
function showHandoff(nextName, target) {
  state.handoffTarget = target;
  document.getElementById('handoff-player-name').textContent = nextName;
  document.getElementById('handoff-subtitle').textContent =
    target === 'setup'
      ? "Make sure they can't see the previous player's ships!"
      : 'All fleets deployed — time to battle!';
  showScreen('handoff');
}

function handoffContinue() {
  if (state.handoffTarget === 'setup') {
    startSetup(1);
  } else {
    startBattle();
  }
}

// ============================================================
// ONLINE BATTLE
// ============================================================
function rebuildBoardsFromRoom(room) {
  [room.hostPlacements, room.guestPlacements].forEach((placements, pIdx) => {
    state.boards[pIdx]     = makeBoard();
    state.placements[pIdx] = [];
    if (!placements) return;
    placements.forEach(pl => {
      pl.cells.forEach(([r, c]) => {
        state.boards[pIdx][r][c].ship      = pl.shipIdx;
        state.boards[pIdx][r][c].shipOrient =
          pl.cells.length < 2 || pl.cells[0][0] === pl.cells[1][0] ? 'H' : 'V';
        state.boards[pIdx][r][c].shipPos   = pl.cells[0];
      });
      state.placements[pIdx].push({ shipIdx: pl.shipIdx, cells: pl.cells });
    });
  });
}

function startOnlineBattle(room) {
  const myIdx  = mp.myIdx;
  const oppIdx = 1 - myIdx;

  // Restore any shots already in the DB (reconnect case)
  state.shots = [new Set(), new Set()];
  const restoreShots = (shotMap, shooterIdx, defIdx) => {
    if (!shotMap) return;
    Object.keys(shotMap).forEach(key => {
      state.shots[shooterIdx].add(key);
      const [r, c] = key.split(',').map(Number);
      state.boards[defIdx][r][c].hit = true;
    });
  };
  restoreShots(room.hostShots,  0, 1);
  restoreShots(room.guestShots, 1, 0);

  mp.myTurn      = (room.turn === mp.role);
  state.shotFired = !mp.myTurn;
  document.getElementById('pass-area').style.visibility = 'hidden';

  renderBattle();
  showScreen('battle');
  switchGridTab(mp.myTurn ? 'enemy' : 'fleet');
  setMsg(mp.myTurn ? 'Your turn — fire!' : `Waiting for ${state.players[oppIdx]}...`, '');
  lvsOnlineStart(mpRef(), mp.myIdx, exitToLobby);

  // Live listener for opponent moves + turn changes
  mpRef().on('value', snap => {
    const r = snap.val();
    if (!r) return;
    lvsOnlineUpdate(r);

    // Apply any new opponent shots
    const oppShotsMap = myIdx === 0 ? r.guestShots : r.hostShots;
    let changed = false;
    if (oppShotsMap) {
      Object.keys(oppShotsMap).forEach(key => {
        if (!state.shots[oppIdx].has(key)) {
          state.shots[oppIdx].add(key);
          const [row, col] = key.split(',').map(Number);
          state.boards[myIdx][row][col].hit = true;
          changed = true;
        }
      });
    }

    mp.myTurn       = (r.turn === mp.role);
    state.shotFired = !mp.myTurn;

    if (r.winner) {
      mpRef().off('value');
      const winIdx = r.winner === 'host' ? 0 : 1;
      renderBattle();
      setTimeout(() => showWin(winIdx), 800);
      return;
    }

    if (changed || mp.myTurn) {
      renderBattle();
      setMsg(mp.myTurn ? 'Your turn — fire!' : `Waiting for ${state.players[oppIdx]}...`, '');
      if (mp.myTurn) switchGridTab('enemy');
    }
  });
}

function renderBattleOnline() {
  const myIdx  = mp.myIdx;
  const oppIdx = 1 - myIdx;
  document.getElementById('own-grid-label').textContent   = `${state.players[myIdx]}'s Fleet`;
  document.getElementById('enemy-grid-label').textContent = `${state.players[oppIdx]}'s Waters`;
  document.getElementById('turn-name').textContent =
    mp.myTurn ? `${state.players[myIdx]}'s Turn` : `${state.players[oppIdx]}'s Turn`;
  buildOwnGrid(myIdx);
  buildEnemyGrid(myIdx, oppIdx);
  renderShipyard('shipyard-display', myIdx, oppIdx);
  renderGraveyard('graveyard-display', myIdx, oppIdx);
}

// ============================================================
// BATTLE PHASE
// ============================================================
function startBattle() {
  state.phase     = 'battle';
  state.shotFired = false;
  renderBattle();
  showScreen('battle');
  switchGridTab('enemy');
}

function renderBattle() {
  if (mp.active) { renderBattleOnline(); return; }
  const p   = state.currentPlayer;
  const opp = 1 - p;

  document.getElementById('turn-name').textContent       = `${state.players[p]}'s Turn`;
  document.getElementById('own-grid-label').textContent   = `${state.players[p]}'s Fleet`;
  document.getElementById('enemy-grid-label').textContent = `${state.players[opp]}'s Waters`;

  buildOwnGrid(p);
  buildEnemyGrid(p, opp);
  renderShipyard('shipyard-display', p, opp);
  renderGraveyard('graveyard-display', p, opp);

  document.getElementById('pass-area').style.visibility = state.shotFired ? 'visible' : 'hidden';
  if (!state.shotFired) setMsg('Click a cell on the enemy grid to fire!', '');
}

// ---- Own grid (ships visible, shows incoming hits) ----
function buildOwnGrid(p) {
  const board = state.boards[p];
  const wrap  = document.getElementById('own-grid');
  wrap.innerHTML = '';
  wrap.appendChild(makeColHeader());
  const body = document.createElement('div');
  body.className = 'grid-body fleet-grid';
  for (let r = 0; r < 10; r++) {
    const row = makeRow(r);
    for (let c = 0; c < 10; c++) {
      const sq   = board[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (sq.ship !== null) {
        cell.classList.add('ship');
        if (sq.hit) cell.classList.add('hit');
      } else if (sq.hit) {
        cell.classList.add('miss');
      }
      // Feature 8: incoming hit animation
      if (state.lastIncomingShot &&
          state.lastIncomingShot.targetPlayer === p &&
          state.lastIncomingShot.r === r &&
          state.lastIncomingShot.c === c) {
        cell.classList.add('hit-incoming');
      }
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  addShipOverlays(body, p);
  wrap.appendChild(body);
}

// ---- Enemy grid (ships hidden, clickable to fire) ----
function buildEnemyGrid(p, opp) {
  const board = state.boards[opp];
  const shots = state.shots[p];
  const wrap  = document.getElementById('enemy-grid');
  wrap.innerHTML = '';
  wrap.appendChild(makeColHeader());
  const body = document.createElement('div');
  body.className = 'grid-body opp-grid';
  for (let r = 0; r < 10; r++) {
    const row = makeRow(r);
    for (let c = 0; c < 10; c++) {
      const sq   = board[r][c];
      const key  = cellKey(r, c);
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;

      // Feature 6: last-shot pulse
      if (state.lastShot && state.lastShot.r === r && state.lastShot.c === c) {
        cell.classList.add('last-shot');
      }

      if (shots.has(key)) {
        if (sq.ship !== null) {
          const pl   = state.placements[opp].find(pl => pl.shipIdx === sq.ship);
          const sunk = pl && pl.cells.every(([pr,pc]) => shots.has(cellKey(pr,pc)));
          cell.classList.add(sunk ? 'sunk' : 'hit');
          if (sunk) addShipSliceToCell(cell, pl, r, c);
        } else {
          cell.classList.add('miss');
        }
      } else if (!state.shotFired) {
        cell.classList.add('target');
        cell.addEventListener('click', () => fireShot(r, c));
      }

      // Feature 7: coordinate crosshair
      cell.addEventListener('mouseenter', () => setCrosshair(r, c, true));
      cell.addEventListener('mouseleave', () => setCrosshair(r, c, false));

      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  wrap.appendChild(body);
}

// Feature 7: crosshair helper
function setCrosshair(r, c, on) {
  const colLabels = document.querySelectorAll('#enemy-grid .col-lbl');
  const rowLabels = document.querySelectorAll('#enemy-grid .row-lbl');
  if (colLabels[c]) colLabels[c].classList.toggle('xhair', on);
  if (rowLabels[r]) rowLabels[r].classList.toggle('xhair', on);
}

// Feature 5: add ship image slice directly inside each sunk enemy cell
// Per-cell approach avoids all z-index stacking context fights
function addShipSliceToCell(cell, pl, r, c) {
  const ship = SHIPS[pl.shipIdx];
  const isH = pl.cells.length < 2 || pl.cells[0][0] === pl.cells[1][0];
  const cellIndex = pl.cells.findIndex(([pr, pc]) => pr === r && pc === c);

  if (isH) {
    // Horizontal: background-image scaled to ship width, positioned to show cell slice
    cell.style.backgroundImage    = `url('${SHIP_IMGS[pl.shipIdx]}')`;
    cell.style.backgroundSize     = `calc(${ship.size} * var(--cell)) 100%`;
    cell.style.backgroundRepeat   = 'no-repeat';
    cell.style.backgroundPosition = `calc(-${cellIndex} * var(--cell)) 0`;
  } else {
    // Vertical: clip a rotated full-ship image to show only the cellIndex-th slice
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute;inset:0;overflow:hidden;pointer-events:none;opacity:0.72;`;
    const inner = document.createElement('div');
    inner.style.cssText = `position:absolute;top:calc(-${cellIndex}*var(--cell));left:0;width:var(--cell);height:calc(${ship.size}*var(--cell));`;
    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = `position:absolute;top:0;left:var(--cell);width:calc(${ship.size}*var(--cell));height:var(--cell);transform:rotate(90deg);transform-origin:top left;overflow:hidden;`;
    const img = document.createElement('img');
    img.src = SHIP_IMGS[pl.shipIdx];
    img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;';
    imgWrap.appendChild(img);
    inner.appendChild(imgWrap);
    wrap.appendChild(inner);
    cell.appendChild(wrap);
  }
}

// Render SVG ship silhouettes as absolute overlays inside a grid-body
function addShipOverlays(gridBody, p) {
  state.placements[p].forEach(pl => {
    const ship = SHIPS[pl.shipIdx];
    const [r0, c0] = pl.cells[0];
    const isH = pl.cells.length < 2 || pl.cells[0][0] === pl.cells[1][0];
    const size = ship.size;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;pointer-events:none;z-index:5;opacity:0.82;display:flex;align-items:center;justify-content:center;overflow:hidden;';

    const img = document.createElement('img');
    img.src = SHIP_IMGS[pl.shipIdx];
    img.style.cssText = 'display:block;max-width:100%;max-height:100%;object-fit:contain;';

    if (isH) {
      wrapper.style.left   = `calc(${c0 + 1} * var(--cell))`;
      wrapper.style.top    = `calc(${r0} * var(--cell))`;
      wrapper.style.width  = `calc(${size} * var(--cell))`;
      wrapper.style.height = `var(--cell)`;
      wrapper.appendChild(img);
    } else {
      wrapper.style.left   = `calc(${c0 + 1} * var(--cell))`;
      wrapper.style.top    = `calc(${r0} * var(--cell))`;
      wrapper.style.width  = `var(--cell)`;
      wrapper.style.height = `calc(${size} * var(--cell))`;
      // Rotate the image 90° so it fills the vertical footprint
      // inner is N-cells wide × 1-cell tall, shifted right by 1 cell so after rotation it lands within wrapper
      const inner = document.createElement('div');
      inner.style.cssText = `position:absolute;top:0;left:var(--cell);width:calc(${size}*var(--cell));height:var(--cell);transform:rotate(90deg);transform-origin:top left;display:flex;align-items:center;justify-content:center;overflow:hidden;`;
      img.style.cssText = 'display:block;max-width:100%;max-height:100%;object-fit:contain;';
      inner.appendChild(img);
      wrapper.appendChild(inner);
    }
    gridBody.appendChild(wrapper);
  });
}

function makeColHeader() {
  const colRow = document.createElement('div');
  colRow.className = 'grid-col-row';
  COLS.forEach(c => {
    const lbl = document.createElement('div');
    lbl.className = 'col-lbl';
    lbl.textContent = c;
    colRow.appendChild(lbl);
  });
  return colRow;
}

function makeRow(r) {
  const row = document.createElement('div');
  row.className = 'grid-row';
  const rl = document.createElement('div');
  rl.className = 'row-lbl';
  rl.textContent = ROWS[r];
  row.appendChild(rl);
  return row;
}

// ---- SHIPYARD: mini ship SVG silhouettes ----
function renderShipyard(containerId, ownPlayer, firingOpp) {
  const shots      = state.shots[firingOpp];
  const placements = state.placements[ownPlayer];
  const el         = document.getElementById(containerId);
  el.innerHTML = '';
  SHIPS.forEach((ship, idx) => {
    const pl   = placements.find(p => p.shipIdx === idx);
    const sunk = pl && pl.cells.every(([r,c]) => shots.has(cellKey(r,c)));
    const wrap = document.createElement('div');
    wrap.className = 'mini-ship' + (sunk ? ' sunk' : '');
    wrap.style.cssText = `width:calc(${ship.size}*var(--mini-cell));height:var(--mini-cell);flex-shrink:0;`;
    const mimg = document.createElement('img');
    mimg.src = SHIP_IMGS[idx];
    mimg.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';
    wrap.appendChild(mimg);
    if (sunk) wrap.style.opacity = '0.28';
    el.appendChild(wrap);
  });
}

// ---- GRAVEYARD: text list of enemy ships ----
function renderGraveyard(containerId, firingPlayer, targetPlayer) {
  const shots      = state.shots[firingPlayer];
  const placements = state.placements[targetPlayer];
  const el         = document.getElementById(containerId);
  el.innerHTML = '';
  SHIPS.forEach((ship, idx) => {
    const pl   = placements.find(p => p.shipIdx === idx);
    const sunk = pl && pl.cells.every(([r,c]) => shots.has(cellKey(r,c)));
    const div  = document.createElement('div');
    const isFreshSunk = sunk && state.justSunkIdx === idx;
    if (sunk) {
      div.className = 'grave-entry ' + (isFreshSunk ? 'sunk' : 'sunk-still');
    } else {
      div.className = 'grave-entry';
    }
    div.textContent = `${ship.name} (${ship.size})`;
    // Feature 10: strike-line span
    const strike = document.createElement('span');
    strike.className = 'strike-line';
    div.appendChild(strike);
    el.appendChild(div);
  });
}

// ---- Fire a shot ----
function fireShot(r, c) {
  if (state.shotFired) return;
  if (mp.active && !mp.myTurn) return;
  const p   = mp.active ? mp.myIdx : state.currentPlayer;
  const opp = 1 - p;
  const key = cellKey(r, c);
  if (state.shots[p].has(key)) return;

  state.shots[p].add(key);
  state.shotFired = true;

  const sq    = state.boards[opp][r][c];
  const isHit = sq.ship !== null;
  sq.hit = true;

  // Feature 6: record last shot
  state.lastShot = { r, c };

  let sunkShip    = null;
  let sunkShipIdx = -1;
  if (isHit) {
    const pl   = state.placements[opp].find(pl => pl.shipIdx === sq.ship);
    const sunk = pl && pl.cells.every(([pr,pc]) => state.shots[p].has(cellKey(pr,pc)));
    if (sunk) { sunkShip = SHIPS[sq.ship]; sunkShipIdx = sq.ship; }
  }

  // Feature 8: record incoming hit for opponent's own grid
  if (isHit) {
    state.lastIncomingShot = { r, c, targetPlayer: opp };
  } else {
    state.lastIncomingShot = null;
  }

  // Feature 4: sound effects
  if (sunkShip)    playSound('sink');
  else if (isHit)  playSound('hit');
  else             playSound('miss');

  // Rebuild enemy grid to reflect the shot, then animate the cell
  buildEnemyGrid(p, opp);
  const updatedCell = document.querySelector(
    `#enemy-grid .cell[data-r="${r}"][data-c="${c}"]`
  );
  if (updatedCell) {
    updatedCell.classList.add(isHit ? 'hit-anim' : 'miss-anim');
    setTimeout(() => updatedCell.classList.remove('hit-anim','miss-anim'), 500);
  }

  // Message
  if (sunkShip) {
    setMsg(`${sunkShip.emoji} You sank their ${sunkShip.name}!`, 'sunk-msg');
  } else if (isHit) {
    setMsg('Hit!', 'hit-msg');
  } else {
    setMsg('Miss!', 'miss-msg');
  }

  // Feature 10: graveyard with justSunkIdx
  state.justSunkIdx = sunkShipIdx;
  renderShipyard('shipyard-display', p, opp);
  renderGraveyard('graveyard-display', p, opp);
  state.justSunkIdx = -1;

  // Check win
  const allSunk = state.placements[opp].every(pl =>
    pl.cells.every(([pr,pc]) => state.shots[p].has(cellKey(pr,pc)))
  );

  if (mp.active) {
    const shotPath  = mp.role === 'host' ? 'hostShots' : 'guestShots';
    const nextTurn  = mp.role === 'host' ? 'guest' : 'host';
    const update    = {};
    update[`${shotPath}/${cellKey(r,c)}`] = isHit ? 'hit' : 'miss';
    if (allSunk) { update.winner = mp.role; update.phase = 'finished'; }
    else         { update.turn = nextTurn; }
    mpRef().update(update);
    mp.myTurn = false;
    if (allSunk) setTimeout(() => showWin(p), 800);
    return;
  }

  if (allSunk) { setTimeout(() => showWin(p), 800); return; }
  document.getElementById('pass-area').style.visibility = 'visible';
}

function switchGridTab(which) {
  const fleet    = document.getElementById('panel-fleet');
  const enemy    = document.getElementById('panel-enemy');
  const tabFleet = document.getElementById('tab-fleet');
  const tabEnemy = document.getElementById('tab-enemy');
  if (!fleet || !enemy) return;
  if (which === 'fleet') {
    fleet.classList.remove('tab-hidden');
    enemy.classList.add('tab-hidden');
    tabFleet.classList.add('active');
    tabEnemy.classList.remove('active');
  } else {
    enemy.classList.remove('tab-hidden');
    fleet.classList.add('tab-hidden');
    tabEnemy.classList.add('active');
    tabFleet.classList.remove('active');
  }
}

function setMsg(text, cls) {
  const bar = document.getElementById('message-bar');
  bar.className = 'msg-bar' + (cls ? ' ' + cls : '');
  bar.textContent = text;
}

function showPassHandoff() {
  state.currentPlayer = 1 - state.currentPlayer;
  state.shotFired     = false;
  showHandoff(state.players[state.currentPlayer], 'battle');
}

// ============================================================
// WIN
// ============================================================
function showWin(winnerIdx) {
  state.phase = 'win';
  const againBtn = document.getElementById('win-btn-again');
  const exitBtn  = document.getElementById('win-btn-exit');
  if (mp.active) {
    // Keep room alive for rematch — attach phase watcher
    mpRef().on('value', snap => {
      const r = snap.val();
      if (!r) return;
      if (r.ready0 === true && r.ready1 === true && mp.role === 'host') {
        mpRef().update({
          phase:          'setup',
          hostShots:      null,
          guestShots:     null,
          hostReady:      false,
          guestReady:     false,
          hostPlacements: null,
          guestPlacements: null,
          turn:           'host',
          winner:         null,
          ready0:         false,
          ready1:         false,
        });
      }
      if (r.phase !== 'setup') return;
      mpRef().off('value');
      stopConfetti();
      state.boards     = [makeBoard(), makeBoard()];
      state.placements = [[], []];
      state.shots      = [new Set(), new Set()];
      if (againBtn) { againBtn.disabled = false; againBtn.textContent = 'Rematch →'; }
      startOnlineSetup();
    });
    if (againBtn) againBtn.textContent = 'Rematch →';
    if (exitBtn)  exitBtn.style.display = '';
  } else {
    if (againBtn) againBtn.textContent = 'Play Again →';
    if (exitBtn)  exitBtn.style.display = 'none';
  }
  document.getElementById('win-name').textContent = state.players[winnerIdx];
  window._lvsWinPlayers = { names: state.players.slice(), winner: winnerIdx };
  showScreen('win');
  playSound('win');
  startConfetti();
}

function playAgainFromWin() {
  if (!mp.active) { resetGame(); return; }
  const btn = document.getElementById('win-btn-again');
  if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
  mpRef().update({ ['ready' + mp.myIdx]: true });
}

function exitToLobby() {
  lvsOnlineStop();
  stopConfetti();
  if (mp.active) {
    mpRef().off();
    mpRef().update({ phase: 'finished' }).catch(() => {});
    localStorage.removeItem('lvs_room');
    localStorage.removeItem('lvs_role');
    mp.active   = false;
    mp.roomCode = null;
    mp.role     = null;
    mp.myIdx    = null;
    mp.myTurn   = false;
  }
  showScreen('lobby');
}

function copyCode() {
  const btn = document.querySelector('#lobby-create-waiting .btn');
  lvsCopyLink(mp.roomCode, btn, 'Copy Link');
}

function resetGame() {
  stopConfetti();
  document.getElementById('p1-name').value = state.players[0];
  document.getElementById('p2-name').value = state.players[1];
  showScreen('lobby');
}

// ============================================================
// CONFETTI
// ============================================================
let rafId = null;
const PIECES = [];
const CONFETTI_COLORS = ['#ff2957','#5a6e8a','#f6b800','#38a169','#9f7aea','#0ea5e9'];

function startConfetti() {
  const cvs = document.getElementById('confetti-canvas');
  cvs.width  = window.innerWidth;
  cvs.height = window.innerHeight;
  const ctx  = cvs.getContext('2d');
  PIECES.length = 0;
  for (let i = 0; i < 130; i++) {
    PIECES.push({
      x:     Math.random() * cvs.width,
      y:     Math.random() * -cvs.height,
      w:     6 + Math.random() * 8,
      h:     4 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      speed: 2.5 + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin:  (Math.random() - 0.5) * 0.14,
      drift: (Math.random() - 0.5) * 1.2,
    });
  }
  function draw() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    PIECES.forEach(p => {
      p.y += p.speed; p.x += p.drift; p.angle += p.spin;
      if (p.y > cvs.height) { p.y = -20; p.x = Math.random() * cvs.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    rafId = requestAnimationFrame(draw);
  }
  draw();
}

function stopConfetti() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  const cvs = document.getElementById('confetti-canvas');
  cvs.getContext('2d').clearRect(0, 0, cvs.width, cvs.height);
}

window.addEventListener('resize', () => {
  if (state.phase === 'win') {
    const cvs = document.getElementById('confetti-canvas');
    cvs.width = window.innerWidth; cvs.height = window.innerHeight;
  }
});

// ============================================================
// FEATURE 4: SOUND EFFECTS (Web Audio API)
// ============================================================
function getAudioCtx() {
  return audioCtx();
}

function playSound(type) {
  if (isMuted()) return;
  try {
    const ctx = getAudioCtx();
    if (type === 'miss') {
      // Filtered noise 350→80 Hz
      const bufSize = ctx.sampleRate * 0.18;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(350, ctx.currentTime);
      filt.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.18);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
      src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      src.start(); src.stop(ctx.currentTime + 0.18);
    } else if (type === 'hit') {
      // Noise burst
      const bufSize = ctx.sampleRate * 0.12;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      src.start(); src.stop(ctx.currentTime + 0.12);
      // Thud
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.5, ctx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(g2); g2.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'sink') {
      // Deeper hit + descending rumble
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.55);
      // Noise layer
      const bufSize = ctx.sampleRate * 0.3;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 150;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.4, ctx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      src.connect(filt); filt.connect(g2); g2.connect(ctx.destination);
      src.start(); src.stop(ctx.currentTime + 0.3);
    } else if (type === 'win') {
      // Ascending 4-note chime: A4 C#5 E5 A5
      const freqs = [440, 554.37, 659.25, 880];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        const t = ctx.currentTime + i * 0.22;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.45, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.55);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.55);
      });
    }
  } catch(e) { /* AudioContext blocked */ }
}

// ============================================================
// FEATURE 9: DARK MODE TOGGLE
// ============================================================
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? '' : 'dark');
  // Update all theme buttons
  // icon is static sun-moon, no content update needed
}

// ============================================================
// RECONNECT ON REFRESH
// ============================================================
(function reconnectIfNeeded() {
  const savedRoom = localStorage.getItem('lvs_room');
  const savedRole = localStorage.getItem('lvs_role');
  if (!savedRoom || !savedRole) return;

  db.ref(`rooms/${savedRoom}`).once('value').then(snap => {
    const room = snap.val();
    if (!room || room.phase === 'finished' || room.winner) {
      localStorage.removeItem('lvs_room');
      localStorage.removeItem('lvs_role');
      return;
    }
    mp.roomCode = savedRoom;
    mp.role     = savedRole;
    mp.myIdx    = savedRole === 'host' ? 0 : 1;
    state.players[0] = room.hostName  || 'Player 1';
    state.players[1] = room.guestName || 'Player 2';

    if (room.phase === 'waiting') {
      // Drop back to lobby — room is still open
      if (savedRole === 'host') {
        document.getElementById('room-code-display').textContent = savedRoom;
        document.getElementById('host-name-section').style.display    = 'none';
        document.getElementById('lobby-create-waiting').style.display = 'block';
        document.getElementById('waiting-status-text').textContent    = 'Awaiting your opponent...';
        showScreen('lobby-create');
        // Re-attach listener
        mpRef().on('value', snap2 => {
          const r = snap2.val();
          if (!r) return;
          if (r.guestName && r.phase === 'waiting') {
            document.getElementById('waiting-status-text').textContent = `${r.guestName} joined — setting sail!`;
            mpRef().update({ phase: 'setup' });
          }
          if (r.phase === 'setup') {
            mpRef().off('value');
            state.players[1] = r.guestName || 'Guest';
            startOnlineSetup();
          }
        });
      } else {
        showScreen('lobby');
      }
    } else if (room.phase === 'setup') {
      startOnlineSetup();
    } else if (room.phase === 'battle') {
      mp.active = true;
      rebuildBoardsFromRoom(room);
      startOnlineBattle(room);
    }
  });
})();

// Render all Lucide icons
lucide.createIcons();
