const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Find the most matching pairs of cards by remembering where each symbol is hidden.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>All cards start face down.</li>
    <li>On your turn, flip any two cards face up.</li>
    <li>If they match, you keep the pair and take another turn.</li>
    <li>If they don't match, both cards flip back face down.</li>
  </ol>
</div>
<div class="rs">
  <h3>How to Win</h3>
  <p>When all pairs have been matched, the player with the most pairs wins.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> When you flip a card that doesn't complete a pair, concentrate on its position — your opponent may reveal its match on their next turn.</div>
`;

// ============================================================
// SYMBOLS  (8 pirate-themed pairs — DiceBear Icons style)
// ============================================================
const SYMBOLS = [
  { label: 'Compass',   icon: 'compass',   bg: 'b7e4c7' },
  { label: 'Gem',       icon: 'gem',       bg: 'a8d8f0' },
  { label: 'Map',       icon: 'map',       bg: 'c7f2d0' },
  { label: 'Trophy',    icon: 'trophy',    bg: 'fff3b0' },
  { label: 'Key',       icon: 'key',       bg: 'ffd6a5' },
  { label: 'Star',      icon: 'star',      bg: 'd4b5f7' },
  { label: 'Coin',      icon: 'coin',      bg: 'f9c6d0' },
  { label: 'Hourglass', icon: 'hourglass', bg: 'ffb3b3' },
];

const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/icons/svg';
function symbolUrl(sym) {
  return `${DICEBEAR_BASE}?seed=${sym.label}&icon[]=${sym.icon}&backgroundColor[]=${sym.bg}&size=128&radius=0`;
}

const PAIRS = SYMBOLS.length; // 8
const TOTAL = PAIRS * 2;      // 16

// ============================================================
// STATE
// ============================================================
const state = {
  players:  ['Player 1', 'Player 2'],
  cards:    [],   // 16 symbol indices
  matched:  [],   // 16 values: -1=unmatched, 0=p0, 1=p1
  flip1:    -1,
  flip2:    -1,
  checking: false,
  turn:     0,
  scores:   [0, 0],
  winner:   null,
};

const mp = {
  active:   false,
  inGame:   false,
  myIdx:    0,
  roomCode: null,
  ref:      null,
  listener: null,
};

let _resolveTimer  = null;
let _gridBuilt     = false;

// ============================================================
// HELPERS
// ============================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshCards() {
  const vals = [];
  for (let i = 0; i < PAIRS; i++) vals.push(i, i);
  return shuffle(vals);
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function copyCode() {
  const btn = document.getElementById('copy-link-btn');
  lvsCopyLink(mp.roomCode, btn, 'Copy Link');
}

// ============================================================
// LOBBY — CREATE
// ============================================================
async function openCreateLobby() {
  const code = makeRoomCode();
  mp.roomCode = code;

  const roomRef = db.ref('mem/' + code);
  const cards = freshCards();

  try {
    await roomRef.set({
      host:     '',
      guest:    null,
      status:   'waiting',
      cards,
      matched:  Array(TOTAL).fill(-1),
      turn:     0,
      scores:   [0, 0],
      flip1:    -1,
      flip2:    -1,
      checking: false,
      p0Online: false,
      p1Online: false,
      ready0:   false,
      ready1:   false,
    });
  } catch (e) {
    alert('Could not connect to Firebase. Check your internet connection.\n\n' + e.message);
    return;
  }

  mp.ref    = roomRef;
  mp.myIdx  = 0;
  mp.active = true;
  mp.inGame = false;

  document.getElementById('room-code-display').textContent = code;
  showScreen('lobby-create');
}

async function hostStartWaiting() {
  const name = document.getElementById('host-name-input').value.trim() || 'Player 1';
  lvsSaveNames(name, null);
  state.players[0] = name;

  document.getElementById('host-name-section').style.display = 'none';
  document.getElementById('lobby-create-waiting').style.display = 'block';
  document.getElementById('waiting-status-text').textContent = 'Awaiting your opponent…';

  try {
    await mp.ref.update({ host: name });
  } catch (e) {
    document.getElementById('waiting-status-text').textContent = 'Connection failed — try again.';
    return;
  }

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
// LOBBY — JOIN
// ============================================================
async function joinBattle() {
  const code  = document.getElementById('join-code-input').value.trim().toUpperCase();
  const name  = document.getElementById('guest-name-input').value.trim() || 'Player 2';
  lvsSaveNames(name, null);
  const errEl = document.getElementById('join-error');
  errEl.style.display = 'none';

  if (code.length < 4) {
    errEl.textContent  = 'Enter a 4-character code';
    errEl.style.display = 'block';
    return;
  }

  const roomRef = db.ref('mem/' + code);
  let snap, data;
  try {
    snap = await roomRef.once('value');
    data = snap.val();
  } catch (e) {
    errEl.textContent  = 'Connection failed — check your internet and try again.';
    errEl.style.display = 'block';
    return;
  }

  if (!data) {
    errEl.textContent  = 'Room not found. Double-check the code.';
    errEl.style.display = 'block';
    return;
  }
  if (data.status !== 'waiting') {
    errEl.textContent  = 'That game already started.';
    errEl.style.display = 'block';
    return;
  }

  state.players[0] = data.host;
  state.players[1] = name;

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

  startOnlineGame(data);
}

function startOnlineGame(data) {
  mp.inGame       = true;
  state.cards     = data.cards   || freshCards();
  state.matched   = data.matched || Array(TOTAL).fill(-1);
  state.flip1     = data.flip1   ?? -1;
  state.flip2     = data.flip2   ?? -1;
  state.checking  = data.checking ?? false;
  state.turn      = data.turn    ?? 0;
  state.scores    = Array.isArray(data.scores) ? [...data.scores] : [0, 0];
  state.winner    = null;
  _gridBuilt      = false;
  renderGame();
  showScreen('game');
  lvsOnlineStart(mp.ref, mp.myIdx, backToLobby);
}

// ============================================================
// ONLINE SYNC
// ============================================================
function syncRemoteState(data) {
  lvsOnlineUpdate(data);

  state.cards    = data.cards   || state.cards;
  state.matched  = data.matched || state.matched;
  state.flip1    = data.flip1   ?? -1;
  state.flip2    = data.flip2   ?? -1;
  state.checking = data.checking ?? false;
  state.turn     = data.turn    ?? 0;
  state.scores   = Array.isArray(data.scores) ? [...data.scores] : state.scores;

  renderGame();

  // Host resolves the match check when both flips are set
  if (mp.myIdx === 0 && state.checking && state.flip1 >= 0 && state.flip2 >= 0) {
    clearTimeout(_resolveTimer);
    _resolveTimer = setTimeout(resolveOnlineMatch, 1000);
  }

  // Check game over
  if (state.winner === null && state.matched.every(m => m !== -1)) {
    endGame();
  }

  // Keep play-again button text in sync
  if (lvsIsEndScreen()) {
    const btn = document.getElementById('play-again-btn');
    if (btn) lvsReadyUI(data, btn);
  }

  // Both ready: host resets for next game
  if (data.ready0 === true && data.ready1 === true && mp.myIdx === 0) {
    const newCardsArr = freshCards();
    const nextStarter = Math.floor(Math.random() * 2);
    mp.ref.update({
      cards:    newCardsArr,
      matched:  Array(TOTAL).fill(-1),
      turn:     nextStarter,
      scores:   [0, 0],
      flip1:    -1,
      flip2:    -1,
      checking: false,
      ready0:   false,
      ready1:   false,
      status:   'playing',
    });
    state.winner = null;
    _gridBuilt   = false;
    showScreen('game');
  }
}

async function resolveOnlineMatch() {
  const { flip1, flip2, cards, matched, scores, turn } = state;
  if (flip1 < 0 || flip2 < 0) return;

  const isMatch   = cards[flip1] === cards[flip2];
  const newMatched = [...matched];
  const newScores  = [...scores];
  let   newTurn    = turn;

  if (isMatch) {
    newMatched[flip1] = turn;
    newMatched[flip2] = turn;
    newScores[turn]++;
  } else {
    newTurn = 1 - turn;
  }

  await mp.ref.update({
    matched:  newMatched,
    scores:   newScores,
    turn:     newTurn,
    flip1:    -1,
    flip2:    -1,
    checking: false,
  });
}

// ============================================================
// LOCAL GAME
// ============================================================
function startLocalGame() {
  const n0 = document.getElementById('local-name-0').value.trim() || 'Player 1';
  const n1 = document.getElementById('local-name-1').value.trim() || 'Player 2';
  lvsSaveNames(n0, n1);
  state.players  = [n0, n1];
  state.cards    = freshCards();
  state.matched  = Array(TOTAL).fill(-1);
  state.flip1    = -1;
  state.flip2    = -1;
  state.checking = false;
  state.turn     = 0;
  state.scores   = [0, 0];
  state.winner   = null;
  mp.active      = false;
  mp.inGame      = false;
  _gridBuilt     = false;
  renderGame();
  showScreen('game');
}

// ============================================================
// CARD CLICK
// ============================================================
function handleCardClick(index) {
  if (state.checking)              return;
  if (state.matched[index] !== -1) return;
  if (state.flip1 === index)       return;
  if (state.flip1 >= 0 && state.flip2 >= 0) return;
  if (mp.active && state.turn !== mp.myIdx)  return;

  if (state.flip1 === -1) {
    state.flip1 = index;
    renderGridState();
    updateTurnBar();
    if (mp.active) mp.ref.update({ flip1: index });
  } else {
    state.flip2    = index;
    state.checking = true;
    renderGridState();
    updateTurnBar();

    if (mp.active) {
      mp.ref.update({ flip2: index, checking: true });
    } else {
      clearTimeout(_resolveTimer);
      _resolveTimer = setTimeout(resolveLocalMatch, 1000);
    }
  }
}

function resolveLocalMatch() {
  const { flip1, flip2, cards, turn } = state;
  const isMatch = cards[flip1] === cards[flip2];

  if (isMatch) {
    state.matched[flip1] = turn;
    state.matched[flip2] = turn;
    state.scores[turn]++;
  } else {
    state.turn = 1 - turn;
  }

  state.flip1    = -1;
  state.flip2    = -1;
  state.checking = false;

  renderGridState();
  updateTopbar();
  updateTurnBar();

  if (state.matched.every(m => m !== -1)) {
    endGame();
  }
}

// ============================================================
// GAME OVER
// ============================================================
function endGame() {
  const [s0, s1] = state.scores;
  if (s0 > s1)      state.winner = 0;
  else if (s1 > s0) state.winner = 1;
  else              state.winner = 'draw';

  window._lvsWinPlayers = {
    names:  state.players,
    winner: state.winner === 'draw' ? 2 : state.winner,
  };

  setTimeout(() => {
    renderWinScreen();
    showScreen('win');
    launchConfetti();
  }, 700);
}

function backToLobby() {
  lvsOnlineStop();
  if (mp.ref && mp.listener) mp.ref.off('value', mp.listener);
  mp.active = false; mp.inGame = false;
  mp.ref = null; mp.listener = null;
  showScreen('lobby');
}

// ============================================================
// RENDER
// ============================================================
function renderGame() {
  updateTopbar();
  updateTurnBar();

  if (!_gridBuilt) {
    buildGrid();
    _gridBuilt = true;
  } else {
    renderGridState();
  }
}

function updateTopbar() {
  const el0 = document.getElementById('score-0');
  const el1 = document.getElementById('score-1');
  const n0  = document.getElementById('name-0');
  const n1  = document.getElementById('name-1');
  if (el0) el0.textContent = state.scores[0];
  if (el1) el1.textContent = state.scores[1];
  if (n0)  n0.textContent  = state.players[0];
  if (n1)  n1.textContent  = state.players[1];
}

function updateTurnBar() {
  const bar = document.getElementById('turn-bar');
  if (!bar) return;
  const isMyTurn = !mp.active || state.turn === mp.myIdx;
  bar.classList.toggle('checking-state', state.checking);
  bar.classList.toggle('waiting-turn',   !isMyTurn && !state.checking);

  const label = document.getElementById('turn-name');
  if (state.checking) {
    if (label) label.textContent = '…';
  } else {
    if (label) label.textContent = state.players[state.turn] + '\'s turn';
  }
}

// ============================================================
// GRID
// ============================================================
function buildGrid() {
  const grid = document.getElementById('memory-grid');
  if (!grid) return;
  grid.innerHTML = '';

  state.cards.forEach((symIdx, i) => {
    const sym  = SYMBOLS[symIdx];
    const wrap = document.createElement('div');
    wrap.className    = 'card-wrap';
    wrap.dataset.idx  = i;

    const card = document.createElement('div');
    card.className = 'card';

    const ornament = document.createElement('div');
    ornament.className = 'card-ornament';
    ornament.innerHTML = `<span class="card-ornament-glyph">◆</span>`;

    const symbol = document.createElement('div');
    symbol.className = 'card-symbol';
    const img = document.createElement('img');
    img.src = symbolUrl(sym);
    img.alt = sym.label;
    img.draggable = false;
    symbol.appendChild(img);

    card.appendChild(ornament);
    card.appendChild(symbol);
    wrap.appendChild(card);
    grid.appendChild(wrap);

    wrap.addEventListener('click', () => handleCardClick(i));
  });

  renderGridState();
}

function renderGridState() {
  const grid = document.getElementById('memory-grid');
  if (!grid) return;

  const myTurnActive = !mp.active || state.turn === mp.myIdx;

  state.cards.forEach((_, i) => {
    const wrap = grid.querySelector(`[data-idx="${i}"]`);
    if (!wrap) return;
    const card = wrap.querySelector('.card');
    if (!card) return;

    const isMatched = state.matched[i] !== -1;
    const isFlipped = state.flip1 === i || state.flip2 === i;

    card.classList.toggle('flipped', isMatched || isFlipped);

    wrap.classList.remove('matched-0', 'matched-1', 'no-flip');
    if (isMatched) {
      wrap.classList.add('matched-' + state.matched[i]);
      wrap.classList.add('no-flip');
    } else if (state.checking || !myTurnActive || isFlipped) {
      wrap.classList.add('no-flip');
    }
  });
}

// ============================================================
// WIN SCREEN
// ============================================================
function renderWinScreen() {
  const isDraw  = state.winner === 'draw';
  const wIdx    = isDraw ? null : state.winner;
  const [s0, s1] = state.scores;

  const nameEl  = document.getElementById('win-name');
  const labelEl = document.getElementById('win-label');
  const scoreEl = document.getElementById('win-score');
  const markEl  = document.getElementById('win-mark');

  if (isDraw) {
    if (markEl)  markEl.style.display  = 'block';
    if (nameEl)  nameEl.style.display  = 'none';
    if (labelEl) labelEl.textContent   = 'Draw';
    if (scoreEl) scoreEl.textContent   = s0 + ' – ' + s1;
  } else {
    if (markEl)  markEl.style.display  = 'none';
    if (nameEl) {
      nameEl.style.display = 'block';
      nameEl.textContent   = state.players[wIdx];
    }
    if (labelEl) labelEl.textContent = 'Wins!';
    if (scoreEl) scoreEl.textContent = state.scores[wIdx] + ' – ' + state.scores[1 - wIdx];
  }
}

function onPlayAgain() {
  if (mp.active) {
    const btn = document.getElementById('play-again-btn');
    lvsReadyUp(btn);
  } else {
    state.cards    = freshCards();
    state.matched  = Array(TOTAL).fill(-1);
    state.flip1    = -1;
    state.flip2    = -1;
    state.checking = false;
    state.turn     = 1 - (state.winner === 'draw' ? 0 : state.winner ?? 0);
    state.scores   = [0, 0];
    state.winner   = null;
    _gridBuilt     = false;
    renderGame();
    showScreen('game');
  }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const soundBtn = document.getElementById('sound-btn');
  if (soundBtn) soundBtn.addEventListener('click', toggleSound);
});
