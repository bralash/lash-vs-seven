window.GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Claim more words than your opponent by solving crossword clues correctly.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Select a clue from the list or click any cell on the grid.</li>
    <li>Type your answer and press <strong>Submit</strong> or hit Enter.</li>
    <li>A correct answer claims that word in your colour — and you <strong>keep your turn</strong>.</li>
    <li>A wrong answer passes the turn to your opponent.</li>
  </ol>
</div>
<div class="rs">
  <h3>Winning</h3>
  <p>The game ends when all words are claimed. The player with the most words wins.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Target short words first to build your score quickly.</div>
`;

/* ============================================================
   CROSSWORD — Lash vs Seven
   ============================================================ */

// ── Seeded RNG (mulberry32) ──────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Word banks ───────────────────────────────────────────────
const BANKS = {
  ghana: [
    { word: 'GHANA',   clue: 'West African nation known for gold and kente' },
    { word: 'ACCRA',   clue: 'Capital city on the Gulf of Guinea' },
    { word: 'KENTE',   clue: 'Colourful handwoven royal fabric' },
    { word: 'VOLTA',   clue: "Ghana's great river and reservoir" },
    { word: 'COCOA',   clue: 'Key cash crop of the forest belt' },
    { word: 'KUMASI',  clue: 'Ashanti regional capital' },
    { word: 'GOLD',    clue: "Ghana's historic export mineral" },
    { word: 'TEMA',    clue: "Ghana's main port city east of Accra" },
    { word: 'PALM',    clue: 'Tree that gives cooking oil and wine' },
    { word: 'DRUM',    clue: 'Talking ___, used to send messages' },
    { word: 'KOLA',    clue: '___ nut, offered as a traditional gift' },
    { word: 'AKAN',    clue: 'Largest ethnic group in Ghana' },
    { word: 'CEDI',    clue: "Ghana's national currency" },
    { word: 'ADA',     clue: 'Town at the mouth of the Volta River' },
    { word: 'CAPE',    clue: '___ Coast, historic central Ghana city' },
    { word: 'LAKE',    clue: 'Volta ___, one of the world\'s largest reservoirs' },
    { word: 'TEAK',    clue: 'Hardwood timber tree common in Ghana' },
    { word: 'GAS',     clue: 'People of the Greater Accra region' },
    { word: 'EWE',     clue: 'Ethnic group of the Volta region' },
    { word: 'OBI',     clue: "Traditional leader's title in some towns" },
    { word: 'AWA',     clue: 'Common Akan exclamation of surprise' },
    { word: 'OMA',     clue: 'Suffix meaning river in many Ghanaian place names' },
    { word: 'OSEI',    clue: 'As in ___ Tutu, great Ashanti king' },
    { word: 'ADINKRA', clue: 'Symbolic visual motifs from Ghana' },
    { word: 'NKRUMAH', clue: 'First president of Ghana: Kwame ___' },
  ],
  games: [
    { word: 'LUDO',    clue: 'Race your tokens home — this very game!' },
    { word: 'CHESS',   clue: 'Strategy game of kings and queens' },
    { word: 'DICE',    clue: 'Six-sided cubes of chance' },
    { word: 'MOVE',    clue: 'Your turn in a board game' },
    { word: 'ROLL',    clue: 'Send the dice spinning' },
    { word: 'PLAY',    clue: 'Participate in a game' },
    { word: 'RULE',    clue: 'Regulation every player must follow' },
    { word: 'TOKEN',   clue: 'Coloured piece used in Ludo' },
    { word: 'BOARD',   clue: 'Flat surface for tabletop games' },
    { word: 'CARD',    clue: 'Drawn in many classic games' },
    { word: 'KING',    clue: 'Highest rank in chess or checkers' },
    { word: 'PAWN',    clue: 'Smallest chess piece' },
    { word: 'ROOK',    clue: 'Castle-shaped chess piece' },
    { word: 'TILE',    clue: 'Letter piece in Scrabble' },
    { word: 'CLUE',    clue: 'Hint that leads to an answer' },
    { word: 'DARE',    clue: 'Challenge in Truth or ___' },
    { word: 'ACE',     clue: 'Top playing card' },
    { word: 'JOKER',   clue: 'Wild card in a deck' },
    { word: 'QUEEN',   clue: 'Most powerful chess piece' },
    { word: 'DRAW',    clue: 'Neither player wins' },
    { word: 'WIN',     clue: 'Come out on top' },
    { word: 'HOME',    clue: 'Safe finishing zone in Ludo' },
    { word: 'BLUFF',   clue: 'Deceive your opponent in poker' },
    { word: 'SCORE',   clue: 'Tally of points earned' },
    { word: 'PASS',    clue: 'Skip your turn' },
    { word: 'TRAP',    clue: 'Deceptive move to capture an opponent' },
    { word: 'CAPTURE', clue: 'Take an opponent\'s piece' },
    { word: 'BISHOP',  clue: 'Chess piece that moves diagonally' },
  ],
};

// ── Module state ─────────────────────────────────────────────
let gameMode  = 'local';
let myIdx     = 0;
let mp        = { active: false, ref: null, myIdx: 0, code: null, isHost: false };
let gd        = null;
let localTheme  = 'ghana';
let onlineTheme = 'ghana';

let state = {
  names:    ['Player 1', 'Player 2'],
  scores:   [0, 0],
  turn:     0,
  placed:   [],
  cells:    [],
  size:     11,
  selected: null,
  gameOver: false,
  seed:     0,
  theme:    'ghana',
};

// ── Helpers ──────────────────────────────────────────────────
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
function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Theme selectors ──────────────────────────────────────────
function setTheme(t) {
  localTheme = t;
  ['ghana', 'games', 'random'].forEach(k => {
    const btn = document.getElementById('theme-' + k);
    if (btn) btn.classList.toggle('active', k === t);
  });
}
function setOnlineTheme(t) {
  onlineTheme = t;
  ['ghana', 'games', 'random'].forEach(k => {
    const btn = document.getElementById('online-theme-' + k);
    if (btn) btn.classList.toggle('active', k === t);
  });
}

// ── Crossword generator ──────────────────────────────────────
const GRID_SIZE = 11;

function generatePuzzle(seed, theme) {
  const rng  = mulberry32(seed);
  const bank = theme === 'random'
    ? seededShuffle([...BANKS.ghana, ...BANKS.games], rng)
    : seededShuffle((BANKS[theme] || BANKS.ghana).slice(), rng);

  const size = GRID_SIZE;
  // grid[r][c] = letter string or null
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const placed = [];

  function cellOk(r, c, letter) {
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    return grid[r][c] === null || grid[r][c] === letter;
  }

  function fits(word, row, col, dir) {
    const len = word.length;
    if (dir === 'A') { if (col < 0 || col + len > size || row < 0 || row >= size) return false; }
    else             { if (row < 0 || row + len > size || col < 0 || col >= size) return false; }

    // Cell before and after must be empty
    if (dir === 'A') {
      if (col > 0 && grid[row][col - 1] !== null)       return false;
      if (col + len < size && grid[row][col + len] !== null) return false;
    } else {
      if (row > 0 && grid[row - 1][col] !== null)       return false;
      if (row + len < size && grid[row + len][col] !== null) return false;
    }

    let crossings = 0;
    for (let i = 0; i < len; i++) {
      const r = dir === 'A' ? row    : row + i;
      const c = dir === 'A' ? col + i : col;
      const letter = word[i];

      if (!cellOk(r, c, letter)) return false;

      if (grid[r][c] === letter) {
        crossings++;
      } else {
        // New cell: check perpendicular adjacency to avoid unintended merges
        if (dir === 'A') {
          const above = r > 0 ? grid[r - 1][c] : null;
          const below = r < size - 1 ? grid[r + 1][c] : null;
          if (above !== null || below !== null) return false; // would extend a down word
        } else {
          const left  = c > 0 ? grid[r][c - 1] : null;
          const right = c < size - 1 ? grid[r][c + 1] : null;
          if (left !== null || right !== null) return false;
        }
      }
    }

    // First placement needs no crossings; subsequent placements must cross
    if (placed.length > 0 && crossings === 0) return false;
    return true;
  }

  function place(entry, row, col, dir) {
    for (let i = 0; i < entry.word.length; i++) {
      const r = dir === 'A' ? row    : row + i;
      const c = dir === 'A' ? col + i : col;
      grid[r][c] = entry.word[i];
    }
    placed.push({ ...entry, row, col, dir, num: 0, owner: -1 });
  }

  function tryPlace(entry) {
    const candidates = [];
    for (const pw of placed) {
      const newDir = pw.dir === 'A' ? 'D' : 'A';
      for (let pi = 0; pi < pw.word.length; pi++) {
        for (let ni = 0; ni < entry.word.length; ni++) {
          if (pw.word[pi] !== entry.word[ni]) continue;
          let row, col;
          if (pw.dir === 'A') { col = pw.col + pi; row = pw.row - ni; }
          else                { row = pw.row + pi; col = pw.col - ni; }
          if (!fits(entry.word, row, col, newDir)) continue;
          const dRow = row + (newDir === 'D' ? entry.word.length / 2 : 0) - size / 2;
          const dCol = col + (newDir === 'A' ? entry.word.length / 2 : 0) - size / 2;
          const centrality = -(Math.abs(dRow) + Math.abs(dCol));
          candidates.push({ row, col, dir: newDir, score: centrality });
        }
      }
    }
    if (!candidates.length) return false;
    candidates.sort((a, b) => b.score - a.score);
    const top    = candidates.slice(0, Math.min(4, candidates.length));
    const chosen = top[Math.floor(rng() * top.length)];
    place(entry, chosen.row, chosen.col, chosen.dir);
    return true;
  }

  // Place first word horizontally at center
  const first = bank[0];
  if (!first) return { placed, size };
  place(first, Math.floor(size / 2), Math.floor((size - first.word.length) / 2), 'A');

  // Try to place remaining words (multiple passes for better density)
  const maxWords  = Math.min(bank.length, 18);
  const remaining = bank.slice(1).filter(w => w.word.length >= 3 && w.word.length <= size - 2);
  for (let pass = 0; pass < 3 && placed.length < maxWords; pass++) {
    for (const entry of remaining) {
      if (placed.length >= maxWords) break;
      if (placed.find(p => p.word === entry.word)) continue;
      tryPlace(entry);
    }
  }

  assignNumbers(placed);
  return { placed, size };
}

function assignNumbers(placed) {
  const starts = new Map();
  const positions = [];
  for (const pw of placed) positions.push({ r: pw.row, c: pw.col });
  positions.sort((a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c);

  const seen = new Set();
  let num = 1;
  for (const pos of positions) {
    const key = pos.r + ',' + pos.c;
    if (!seen.has(key)) { seen.add(key); starts.set(key, num++); }
  }
  for (const pw of placed) {
    pw.num = starts.get(pw.row + ',' + pw.col) || 0;
  }
}

function buildCells(placed, size) {
  const cells = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      letter: null, num: 0, solvedBy: -1, wordIds: [],
    }))
  );
  for (let wi = 0; wi < placed.length; wi++) {
    const pw = placed[wi];
    for (let i = 0; i < pw.word.length; i++) {
      const r = pw.dir === 'A' ? pw.row    : pw.row + i;
      const c = pw.dir === 'A' ? pw.col + i : pw.col;
      cells[r][c].letter = pw.word[i];
      cells[r][c].wordIds.push(wi);
      if (i === 0) cells[r][c].num = Math.max(cells[r][c].num, pw.num);
    }
  }
  return cells;
}

// ── Render ───────────────────────────────────────────────────
function renderGrid() {
  const container = document.getElementById('cw-grid');
  if (!container) return;
  const { placed, cells, size } = state;
  container.style.gridTemplateColumns = `repeat(${size}, var(--cell-size))`;
  container.innerHTML = '';

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = cells[r][c];
      const div  = document.createElement('div');
      div.className = 'cw-cell' + (cell.letter === null ? ' black' : '');
      div.dataset.r = r;
      div.dataset.c = c;

      if (cell.letter !== null) {
        if (cell.num > 0) {
          const n = document.createElement('div');
          n.className   = 'cw-cell-num';
          n.textContent = cell.num;
          div.appendChild(n);
        }
        const l = document.createElement('div');
        l.className   = 'cw-cell-letter';
        l.textContent = cell.solvedBy >= 0 ? cell.letter : '';
        div.appendChild(l);

        if (cell.solvedBy === 0) div.classList.add('solved-p0');
        if (cell.solvedBy === 1) div.classList.add('solved-p1');
        div.addEventListener('click', () => onCellClick(r, c));
      }
      container.appendChild(div);
    }
  }
  applyHighlight();
}

function applyHighlight() {
  const container = document.getElementById('cw-grid');
  if (!container) return;
  container.querySelectorAll('.cw-cell').forEach(el => el.classList.remove('selected', 'in-word'));
  if (!state.selected) return;
  const pw = state.placed[state.selected.wordIdx];
  if (!pw) return;
  for (let i = 0; i < pw.word.length; i++) {
    const r   = pw.dir === 'A' ? pw.row    : pw.row + i;
    const c   = pw.dir === 'A' ? pw.col + i : pw.col;
    const el  = container.children[r * state.size + c];
    if (el) el.classList.add(i === 0 ? 'selected' : 'in-word');
  }
}

function refreshCell(r, c) {
  const container = document.getElementById('cw-grid');
  if (!container) return;
  const cell = state.cells[r][c];
  const el   = container.children[r * state.size + c];
  if (!el || el.classList.contains('black')) return;
  const l = el.querySelector('.cw-cell-letter');
  if (l) l.textContent = cell.solvedBy >= 0 ? cell.letter : '';
  el.classList.remove('solved-p0', 'solved-p1');
  if (cell.solvedBy === 0) el.classList.add('solved-p0');
  if (cell.solvedBy === 1) el.classList.add('solved-p1');
}

// ── Clue UI ──────────────────────────────────────────────────
function updateClueBar() {
  if (!state.selected) return;
  const pw = state.placed[state.selected.wordIdx];
  if (!pw) return;
  document.getElementById('clue-num').textContent  = pw.num + pw.dir;
  document.getElementById('clue-text').textContent = pw.clue;
}

function updateClueList() {
  renderClueDir('clues-across', 'A');
  renderClueDir('clues-down',   'D');
}

function renderClueDir(elId, dir) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = '';
  const words = state.placed
    .filter(pw => pw.dir === dir)
    .sort((a, b) => a.num - b.num);

  for (const pw of words) {
    const wi  = state.placed.indexOf(pw);
    const div = document.createElement('div');
    div.className = 'clue-entry'
      + (pw.owner === 0 ? ' solved-p0' : pw.owner === 1 ? ' solved-p1' : '')
      + (state.selected && state.selected.wordIdx === wi ? ' active' : '');
    div.innerHTML = `<span class="clue-entry-num">${pw.num}</span><span class="clue-entry-text">${pw.clue}</span>`;
    div.addEventListener('click', () => selectWord(wi, pw));
    el.appendChild(div);
  }
}

// ── Selection ─────────────────────────────────────────────────
function selectWord(wi, pw) {
  state.selected = { wordIdx: wi, dir: pw.dir, row: pw.row, col: pw.col };
  document.getElementById('answer-input').value = '';
  document.getElementById('answer-input').focus();
  applyHighlight();
  updateClueBar();
  updateClueList();
}

function getWordAt(r, c, dir) {
  return state.placed.findIndex(pw => {
    if (pw.dir !== dir) return false;
    if (dir === 'A') return pw.row === r && c >= pw.col && c < pw.col + pw.word.length;
    return pw.col === c && r >= pw.row && r < pw.row + pw.word.length;
  });
}

function onCellClick(r, c) {
  if (state.gameOver) return;
  if (gameMode === 'online' && myIdx !== state.turn) return;
  if (!state.cells[r] || state.cells[r][c].letter === null) return;

  const aIdx = getWordAt(r, c, 'A');
  const dIdx = getWordAt(r, c, 'D');

  let newDir = 'A';
  if (state.selected) {
    const sameCell = state.selected.row === state.placed[state.selected.wordIdx]?.row
      && state.placed[state.selected.wordIdx]?.col === c
      && r === state.placed[state.selected.wordIdx]?.row;

    const curDir = state.selected.dir;
    // Toggle if clicking within the already-selected word
    const pw = state.placed[state.selected.wordIdx];
    let inSame = false;
    if (pw) {
      if (pw.dir === 'A') inSame = pw.row === r && c >= pw.col && c < pw.col + pw.word.length;
      else                inSame = pw.col === c && r >= pw.row && r < pw.row + pw.word.length;
    }
    if (inSame && aIdx >= 0 && dIdx >= 0) {
      newDir = curDir === 'A' ? 'D' : 'A';
    } else {
      newDir = curDir === 'A' && aIdx >= 0 ? 'A'
             : curDir === 'D' && dIdx >= 0 ? 'D'
             : aIdx >= 0 ? 'A' : 'D';
    }
  } else {
    newDir = aIdx >= 0 ? 'A' : 'D';
  }

  const wi = newDir === 'A' ? aIdx : dIdx;
  if (wi < 0) return;
  selectWord(wi, state.placed[wi]);
}

// ── Answering ─────────────────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Enter') submitAnswer();
}

function submitAnswer() {
  if (state.gameOver) return;
  if (!state.selected) return;
  if (gameMode === 'online' && myIdx !== state.turn) {
    setMsg('Not your turn!');
    return;
  }

  const wi  = state.selected.wordIdx;
  const pw  = state.placed[wi];
  if (!pw || pw.owner >= 0) { setMsg('Already solved!'); return; }

  const answer = (document.getElementById('answer-input').value || '').trim().toUpperCase();
  if (!answer) return;

  if (answer === pw.word) {
    pw.owner = state.turn;
    state.scores[state.turn]++;

    // Mark cells
    for (let i = 0; i < pw.word.length; i++) {
      const r = pw.dir === 'A' ? pw.row    : pw.row + i;
      const c = pw.dir === 'A' ? pw.col + i : pw.col;
      if (state.cells[r][c].solvedBy < 0) state.cells[r][c].solvedBy = state.turn;
      refreshCell(r, c);
    }

    setMsg('✓ Correct! +1 point — ' + state.names[state.turn] + ' keeps the turn');
    document.getElementById('answer-input').value = '';
    state.selected = null;
    applyHighlight();
    updateScoreUI();
    updateClueList();
    checkWin();
  } else {
    flashWrong();
    document.getElementById('answer-input').value = '';
    state.turn = 1 - state.turn;
    state.selected = null;
    applyHighlight();
    setMsg('✗ Wrong — ' + state.names[state.turn] + '\'s turn');
    updateTurnUI();
    updateClueList();
  }

  if (gameMode === 'online') pushState();
}

function skipWord() {
  if (state.gameOver) return;
  if (gameMode === 'online' && myIdx !== state.turn) return;
  state.turn = 1 - state.turn;
  state.selected = null;
  document.getElementById('answer-input').value = '';
  applyHighlight();
  setMsg(state.names[state.turn] + '\'s turn');
  updateTurnUI();
  updateClueList();
  if (gameMode === 'online') pushState();
}

function flashWrong() {
  if (!state.selected) return;
  const container = document.getElementById('cw-grid');
  if (!container) return;
  const pw = state.placed[state.selected.wordIdx];
  if (!pw) return;
  for (let i = 0; i < pw.word.length; i++) {
    const r  = pw.dir === 'A' ? pw.row    : pw.row + i;
    const c  = pw.dir === 'A' ? pw.col + i : pw.col;
    const el = container.children[r * state.size + c];
    if (el) { el.classList.remove('wrong-flash'); void el.offsetWidth; el.classList.add('wrong-flash'); }
  }
}

// ── Score / turn UI ──────────────────────────────────────────
function updateTurnUI() {
  const dot = document.getElementById('turn-dot');
  if (dot) dot.className = 'turn-dot p' + state.turn;
  const lbl = document.getElementById('turn-label');
  if (lbl) lbl.textContent = state.names[state.turn] + '\'s Turn';
}

function updateScoreUI() {
  ['0', '1'].forEach(i => {
    const n = document.getElementById('score-name-' + i);
    const v = document.getElementById('score-val-' + i);
    if (n) n.textContent = state.names[+i];
    if (v) v.textContent = state.scores[+i];
  });
}

// ── Win ──────────────────────────────────────────────────────
function checkWin() {
  if (state.placed.every(pw => pw.owner >= 0)) endGame();
}

function endGame() {
  state.gameOver = true;
  const [s0, s1] = state.scores;
  const [n0, n1] = state.names;
  let winnerIdx = s0 > s1 ? 0 : s1 > s0 ? 1 : 2;
  window._lvsWinPlayers = { names: state.names.slice(), winner: winnerIdx };

  document.getElementById('win-name').textContent     = winnerIdx === 2 ? "It's a draw!" : state.names[winnerIdx] + ' wins!';
  document.getElementById('win-sub').textContent      = winnerIdx === 2 ? 'Equal wordsmiths' : 'Master wordsmith';
  document.getElementById('win-score-name-0').textContent = n0;
  document.getElementById('win-score-name-1').textContent = n1;
  document.getElementById('win-score-num-0').textContent  = s0;
  document.getElementById('win-score-num-1').textContent  = s1;
  showScreen('win');
  fireConfetti();
}

// ── Game start ───────────────────────────────────────────────
function initGame(seed, theme, names) {
  const { placed, size } = generatePuzzle(seed, theme);

  if (!placed.length) {
    // Fallback seed
    return initGame((seed + 1337) & 0x7FFFFFFF, theme, names);
  }

  state = {
    names:    names || ['Player 1', 'Player 2'],
    scores:   [0, 0],
    turn:     0,
    placed,
    cells:    buildCells(placed, size),
    size,
    selected: null,
    gameOver: false,
    seed,
    theme,
  };

  updateScoreUI();
  updateTurnUI();
  setMsg('Select a clue or cell to start');
  renderGrid();
  updateClueList();

  // Auto-select first word
  const first = placed.find(pw => pw.num === 1) || placed[0];
  if (first) selectWord(placed.indexOf(first), first);

  showScreen('game');
}

function startLocal() {
  gameMode = 'local';
  myIdx    = 0;
  const n0   = document.getElementById('p1-name').value.trim() || 'Player 1';
  const n1   = document.getElementById('p2-name').value.trim() || 'Player 2';
  const seed = Date.now() & 0x7FFFFFFF;
  initGame(seed, localTheme, [n0, n1]);
}

function handleRestart() {
  if (gameMode === 'online') { playAgain(); return; }
  initGame((Date.now() + 1) & 0x7FFFFFFF, state.theme, state.names);
}

function playAgain() {
  if (gameMode !== 'online' || !mp.active) {
    initGame((Date.now() + 1) & 0x7FFFFFFF, state.theme, state.names);
    return;
  }
  const btn = document.getElementById('win-again-btn');
  if (btn) btn.textContent = 'Waiting for opponent…';
  lvsReadyUp(mp.ref, mp.myIdx, () => {
    lvsReadyBoth(mp.ref, () => {
      if (mp.isHost) {
        const seed = Date.now() & 0x7FFFFFFF;
        mp.ref.update({ seed, gameState: null, ready: null });
        initGame(seed, state.theme, state.names);
        gameMode = 'online';
      }
    });
  });
}

function backToLobby() {
  if (mp.active) lvsOnlineStop(mp.ref);
  mp       = { active: false, ref: null, myIdx: 0, code: null, isHost: false };
  gameMode = 'local';
  myIdx    = 0;
  state.gameOver = false;
  showScreen('lobby');
}

// ── Online ───────────────────────────────────────────────────
function createRoom() {
  const name = (document.getElementById('online-name').value || '').trim() || 'Player 1';
  const code = Math.random().toString(36).slice(2, 6).toUpperCase();
  const ref  = lvsDb().ref('crossword-rooms/' + code);
  setOnlineMsg('Creating room…');

  ref.set({ names: [name, ''], theme: onlineTheme, seed: 0, gameState: null, ready: null })
    .then(() => {
      mp = { active: true, ref, myIdx: 0, code, isHost: true };
      gameMode = 'online';
      myIdx    = 0;
      document.getElementById('waiting-code').textContent = code;
      showScreen('waiting');
      attachListener(ref);
    })
    .catch(e => setOnlineMsg(e.message, true));
}

function joinRoom() {
  const name = (document.getElementById('online-name').value || '').trim() || 'Player 2';
  const code = (document.getElementById('join-code').value || '').trim().toUpperCase();
  if (!code || code.length !== 4) { setOnlineMsg('Enter a 4-letter code', true); return; }
  const ref = lvsDb().ref('crossword-rooms/' + code);
  setOnlineMsg('Joining…');

  ref.once('value').then(snap => {
    if (!snap.exists())       { setOnlineMsg('Room not found', true); return; }
    if (snap.val().names?.[1]) { setOnlineMsg('Room is full',   true); return; }
    ref.update({ 'names/1': name }).then(() => {
      mp = { active: true, ref, myIdx: 1, code, isHost: false };
      gameMode = 'online';
      myIdx    = 1;
      attachListener(ref);
    });
  }).catch(e => setOnlineMsg(e.message, true));
}

function attachListener(ref) {
  lvsOnlineStart(ref, mp.myIdx, backToLobby);

  ref.on('value', snap => {
    if (!snap.exists()) { backToLobby(); return; }
    gd = snap.val();

    if (gd.names?.[0] && gd.names?.[1] && !gd.gameState) {
      if (mp.isHost && !gd.seed) {
        const seed = Date.now() & 0x7FFFFFFF;
        ref.update({ seed });
      } else if (gd.seed) {
        initGame(gd.seed, gd.theme || 'ghana', [gd.names[0], gd.names[1]]);
        gameMode = 'online';
      }
    } else if (gd.gameState) {
      applyRemote(gd.gameState);
    }
  });
}

function pushState() {
  if (!mp.active || !mp.ref) return;
  mp.ref.update({
    gameState: {
      turn:   state.turn,
      scores: state.scores,
      owners: state.placed.map(pw => pw.owner),
      cells:  state.cells.map(row => row.map(c => c.solvedBy)),
    },
  });
}

function applyRemote(gs) {
  if (!gs) return;
  state.turn   = gs.turn;
  state.scores = gs.scores || state.scores;

  if (gs.owners) {
    gs.owners.forEach((owner, i) => {
      if (state.placed[i]) state.placed[i].owner = owner;
    });
  }
  if (gs.cells) {
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        if (gs.cells[r]?.[c] !== undefined && state.cells[r]?.[c]) {
          state.cells[r][c].solvedBy = gs.cells[r][c];
          refreshCell(r, c);
        }
      }
    }
  }

  updateScoreUI();
  updateTurnUI();
  updateClueList();
  if (state.placed.every(pw => pw.owner >= 0) && !state.gameOver) endGame();
}

function copyCode() {
  if (!mp.code) return;
  const url = location.origin + location.pathname + '?join=' + mp.code;
  navigator.clipboard.writeText(url).catch(() => {});
  const btn = document.getElementById('waiting-copy-btn');
  if (btn) { const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = t, 2000); }
}

// ── Confetti ─────────────────────────────────────────────────
function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
  const ctx     = canvas.getContext('2d');
  const COLORS  = ['#E85A25', '#1A6BAA', '#d4a843', '#2ecc71', '#e74c3c', '#9b59b6'];
  const pieces  = Array.from({ length: 90 }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * -innerHeight,
    r: Math.random() * 6 + 3,
    d: Math.random() * 2 + 1.5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    t: Math.random() * Math.PI * 2,
    ts: Math.random() * 0.04 + 0.01,
  }));
  let tick = 0;
  const id = setInterval(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.t += p.ts; p.y += p.d + 1.5; p.x += Math.sin(p.t) * 0.9;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
    });
    if (++tick > 260) clearInterval(id);
  }, 16);
}

// ── Download result card ─────────────────────────────────────
function downloadResultCard() {
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FDF8EE'; ctx.fillRect(0, 0, 600, 320);
  ctx.fillStyle = '#1A0D04'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Crossword — Lash vs Seven', 300, 52);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#E85A25';
  ctx.fillText(state.names[0] + ': ' + state.scores[0] + ' word' + (state.scores[0] !== 1 ? 's' : ''), 300, 120);
  ctx.fillStyle = '#1A6BAA';
  ctx.fillText(state.names[1] + ': ' + state.scores[1] + ' word' + (state.scores[1] !== 1 ? 's' : ''), 300, 165);
  ctx.fillStyle = '#1A0D04'; ctx.font = 'bold 26px sans-serif';
  const [s0, s1] = state.scores;
  ctx.fillText(s0 > s1 ? state.names[0] + ' wins!' : s1 > s0 ? state.names[1] + ' wins!' : "It's a draw!", 300, 230);
  ctx.fillStyle = '#A07060'; ctx.font = '15px sans-serif';
  ctx.fillText('lash-vs-seven.web.app/crossword', 300, 290);
  const a = document.createElement('a');
  a.download = 'crossword-result.png'; a.href = canvas.toDataURL(); a.click();
}

// ── Auto-join on URL param ────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const join = new URLSearchParams(location.search).get('join');
  if (join) {
    showScreen('online');
    const el = document.getElementById('join-code');
    if (el) el.value = join.toUpperCase();
  }
});
