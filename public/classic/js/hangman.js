const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Guess the hidden word before the hangman drawing is completed.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>A secret word is chosen and shown as blank dashes.</li>
    <li>Guess one letter at a time by tapping the keyboard.</li>
    <li><strong>Correct guess</strong> — the letter fills in all its positions in the word.</li>
    <li><strong>Wrong guess</strong> — a part of the hangman figure is drawn.</li>
  </ol>
</div>
<div class="rs">
  <h3>How to Win / Lose</h3>
  <p>Guess the complete word before 6 wrong guesses. After 6 mistakes the figure is complete and the game is lost.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Start with the most common letters in English: E, T, A, O, I, N, S, H, R.</div>
`;

// ============================================================
// SOUND ENGINE
// ============================================================
function _ctx() {
  return audioCtx();
}

function playKey() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.start(now); osc.stop(now + 0.07);
  } catch (_) {}
}

function playWrong() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  } catch (_) {}
}

function playCorrectLetter() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } catch (_) {}
}

function playWin() {
  if (isMuted()) return;
  try {
    const ctx = _ctx();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      const t = ctx.currentTime + i * 0.13;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t); osc.stop(t + 0.45);
    });
  } catch (_) {}
}

function playLose() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    [400, 280].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.2;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.start(t); osc.stop(t + 0.38);
    });
  } catch (_) {}
}

function playChime() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.35);
    });
  } catch (_) {}
}

// ============================================================
// FIREBASE
// ============================================================

// ============================================================
// CONSTANTS
// ============================================================
const MAX_WRONG = 6;
const PART_IDS  = ['hm-head','hm-body','hm-arm-left','hm-arm-right','hm-leg-left','hm-leg-right'];

// ============================================================
// STATE
// ============================================================
const match = {
  mode:        'local',
  players:     ['Player 1', 'Player 2'],
  hintsOn:     false,
  round:       0,        // 0 or 1
  setterIdx:   0,        // setter for the current round
  roundWins:   [0, 0],
  // roundData[r] = { word, hint, setter, outcome }
  roundData:   [null, null],
};

const mp = {
  active:  false,
  started: false,
  myIdx:   0,
  role:    null,
  ref:     null,
  code:    null,
};

// Live state for the current round
let roundState = null;
// { word, hint, guessed: Set, wrong, done }

// ============================================================
// HINT TOGGLE
// ============================================================
let hintLocalOn  = false;
let hintOnlineOn = false;

function toggleHint(ctx) {
  if (ctx === 'local') {
    hintLocalOn = !hintLocalOn;
    const btn = document.getElementById('hint-toggle-local');
    if (btn) {
      btn.textContent = hintLocalOn ? 'ON' : 'OFF';
      btn.className   = 'toggle-btn ' + (hintLocalOn ? 'toggle-on' : 'toggle-off');
    }
  } else {
    hintOnlineOn = !hintOnlineOn;
    const btn = document.getElementById('hint-toggle-online');
    if (btn) {
      btn.textContent = hintOnlineOn ? 'ON' : 'OFF';
      btn.className   = 'toggle-btn ' + (hintOnlineOn ? 'toggle-on' : 'toggle-off');
    }
  }
}

// ============================================================
// LOCAL FLOW
// ============================================================
function startLocalFlow() {
  const p1 = document.getElementById('local-name-0').value.trim() || 'Player 1';
  const p2 = document.getElementById('local-name-1').value.trim() || 'Player 2';
  lvsSaveNames(p1, p2);
  match.mode      = 'local';
  match.players   = [p1, p2];
  match.hintsOn   = hintLocalOn;
  match.round     = 0;
  match.roundWins = [0, 0];
  match.roundData = [null, null];
  match.setterIdx = Math.random() < 0.5 ? 0 : 1;
  showCoverForSetter();
}

function showCoverForSetter() {
  const setter = match.players[match.setterIdx];
  const coverTxt = document.getElementById('cover-text');
  const coverBtn = document.getElementById('cover-btn');
  if (coverTxt) coverTxt.textContent = `Pass the device to ${setter}`;
  if (coverBtn) { coverBtn.textContent = `I'm ${setter}, Ready →`; coverBtn.onclick = coverReady; }
  showScreen('cover');
}

function coverReady() {
  showLocalSetWord();
}

function showLocalSetWord() {
  const setterName = match.players[match.setterIdx];
  document.getElementById('set-round-pill').textContent  = `Round ${match.round + 1}`;
  document.getElementById('set-word-header').textContent = `${setterName}, set your word`;
  document.getElementById('set-word-sub').textContent    = 'Enter any word (letters only, no spaces). Your opponent guesses it.';
  document.getElementById('set-word-input').value        = '';
  document.getElementById('set-word-msg').textContent    = '';
  document.getElementById('set-word-msg').style.color    = '';

  const hintRow = document.getElementById('set-hint-row');
  if (hintRow) hintRow.style.display = match.hintsOn ? 'flex' : 'none';
  if (match.hintsOn) {
    const hi = document.getElementById('set-hint-input');
    if (hi) hi.value = '';
  }

  const btn = document.getElementById('confirm-word-btn');
  btn.disabled    = false;
  btn.textContent = 'Lock it in →';
  btn.onclick     = confirmWord;

  showScreen('set-word');
  setTimeout(() => document.getElementById('set-word-input').focus(), 80);
}

function confirmWord() {
  const raw  = document.getElementById('set-word-input').value.trim().toLowerCase();
  const hint = match.hintsOn ? (document.getElementById('set-hint-input').value.trim()) : '';

  if (!raw)                { showSetMsg('Enter a word', true);                        return; }
  if (/[^a-z]/.test(raw)) { showSetMsg('Letters only — no spaces or symbols', true); return; }
  if (raw.length > 20)    { showSetMsg('Max 20 letters', true);                       return; }

  match.roundData[match.round] = { word: raw, hint, setter: match.setterIdx };

  const guesser  = match.players[1 - match.setterIdx];
  const coverTxt = document.getElementById('cover-text');
  const coverBtn = document.getElementById('cover-btn');
  if (coverTxt) coverTxt.textContent = `Word locked! Pass to ${guesser}`;
  if (coverBtn) { coverBtn.textContent = `I'm ${guesser}, Ready →`; coverBtn.onclick = startLocalRound; }
  showScreen('cover');
}

function showSetMsg(msg, isError) {
  const el = document.getElementById('set-word-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#c0392b' : '';
}

function startLocalRound() {
  const data = match.roundData[match.round];
  beginRound(data.word, data.hint);
}

// ============================================================
// ROUND ENGINE
// ============================================================
function beginRound(word, hint) {
  roundState = {
    word:    word.toLowerCase(),
    hint:    hint || '',
    guessed: new Set(),
    wrong:   0,
    done:    false,
  };

  document.getElementById('game-round-pill').textContent = `Round ${match.round + 1}`;

  const setter  = match.players[match.setterIdx];
  const guesser = match.players[1 - match.setterIdx];
  const pill    = document.getElementById('game-players-pill');
  if (pill) pill.textContent = `${guesser} guessing · ${setter} set it`;

  const hintEl = document.getElementById('hint-display');
  if (hintEl) {
    if (hint) {
      hintEl.textContent   = '🔖 ' + hint;
      hintEl.style.display = 'block';
    } else {
      hintEl.style.display = 'none';
    }
  }

  // Re-enable keyboard (in case it was disabled from a previous round)
  const kb = document.getElementById('game-keyboard');
  if (kb) { kb.style.opacity = ''; kb.style.pointerEvents = ''; }

  renderGallows();
  renderBlanks();
  renderWrongLetters();
  setGameMsg('');
  buildKeyboard();
  showScreen('game');
}

// ============================================================
// GALLOWS
// ============================================================
function renderGallows() {
  PART_IDS.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (roundState && i < roundState.wrong) {
      el.classList.add('visible');
    } else {
      el.classList.remove('visible');
    }
  });
}

function revealNextPart() {
  const idx = roundState.wrong - 1;
  if (idx < 0 || idx >= PART_IDS.length) return;
  const el = document.getElementById(PART_IDS[idx]);
  if (!el) return;
  el.classList.remove('visible');
  void el.offsetWidth;
  el.classList.add('visible');
}

// ============================================================
// BLANKS
// ============================================================
function renderBlanks() {
  const container = document.getElementById('word-blanks');
  if (!container || !roundState) return;
  container.innerHTML = '';
  for (const ch of roundState.word) {
    const tile = document.createElement('div');
    tile.className = 'blank-tile';
    if (roundState.guessed.has(ch)) tile.textContent = ch.toUpperCase();
    container.appendChild(tile);
  }
}

function animateRevealedLetters(letter) {
  const container = document.getElementById('word-blanks');
  if (!container) return;
  const tiles = container.querySelectorAll('.blank-tile');
  roundState.word.split('').forEach((ch, i) => {
    if (ch === letter) {
      const tile = tiles[i];
      tile.textContent = ch.toUpperCase();
      tile.classList.remove('revealed');
      void tile.offsetWidth;
      tile.classList.add('revealed');
    }
  });
}

// ============================================================
// WRONG LETTERS
// ============================================================
function renderWrongLetters() {
  const el = document.getElementById('wrong-letters');
  if (!el || !roundState) return;
  const wrongs = [...roundState.guessed].filter(l => !roundState.word.includes(l));
  el.textContent = wrongs.length ? 'Wrong: ' + wrongs.join(' ') : '';
}

// ============================================================
// KEYBOARD
// ============================================================
function buildKeyboard() {
  const container = document.getElementById('game-keyboard');
  if (!container) return;
  container.innerHTML = '';
  ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ'].forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'hm-key-row';
    for (const ch of row) {
      const btn = document.createElement('button');
      btn.className   = 'hm-key';
      btn.textContent = ch;
      btn.dataset.key = ch.toLowerCase();
      btn.addEventListener('click', () => handleLetter(ch.toLowerCase()));
      rowEl.appendChild(btn);
    }
    container.appendChild(rowEl);
  });
  updateKeyboard();
}

function updateKeyboard() {
  const container = document.getElementById('game-keyboard');
  if (!container || !roundState) return;
  container.querySelectorAll('.hm-key').forEach(btn => {
    const ch = btn.dataset.key;
    if (roundState.guessed.has(ch)) {
      btn.className = 'hm-key ' + (roundState.word.includes(ch) ? 'correct' : 'wrong');
    } else {
      btn.className = 'hm-key';
    }
  });
}

function disableKeyboard() {
  const kb = document.getElementById('game-keyboard');
  if (kb) { kb.style.opacity = '0.4'; kb.style.pointerEvents = 'none'; }
}

// ============================================================
// GUESS LOGIC
// ============================================================
function handleLetter(letter) {
  if (!roundState || roundState.done) return;
  if (roundState.guessed.has(letter)) return;
  // Online: only guesser types
  if (match.mode === 'online' && mp.myIdx === match.setterIdx) return;

  roundState.guessed.add(letter);

  if (roundState.word.includes(letter)) {
    playCorrectLetter();
    animateRevealedLetters(letter);
    updateKeyboard();

    const solved = roundState.word.split('').every(ch => roundState.guessed.has(ch));
    if (solved) {
      roundState.done = true;
      setGameMsg(`${match.players[1 - match.setterIdx]} guessed it!`, 'win');
      playWin();
      if (match.mode === 'online') pushGuessToFirebase();
      setTimeout(() => endRound('guesser'), 900);
      return;
    }
  } else {
    roundState.wrong++;
    playWrong();
    revealNextPart();
    renderWrongLetters();
    updateKeyboard();

    if (roundState.wrong >= MAX_WRONG) {
      roundState.done = true;
      setGameMsg(`Hanged! The word was ${roundState.word.toUpperCase()}`, 'error');
      playLose();
      if (match.mode === 'online') pushGuessToFirebase();
      setTimeout(() => endRound('setter'), 1400);
      return;
    }
  }

  if (match.mode === 'online') pushGuessToFirebase();
}

function setGameMsg(msg, type = '') {
  const el = document.getElementById('game-msg');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'game-msg' + (type ? ' ' + type : '');
}

// ============================================================
// END ROUND
// ============================================================
function endRound(outcome) {
  // outcome: 'guesser' | 'setter'
  const winnerIdx = outcome === 'guesser' ? (1 - match.setterIdx) : match.setterIdx;
  match.roundWins[winnerIdx]++;

  // Persist outcome for result screen
  if (match.roundData[match.round]) {
    match.roundData[match.round].outcome = outcome;
  }

  // Online: push round result (setter is authoritative, but guesser pushes too — idempotent)
  if (match.mode === 'online' && mp.ref) {
    const nextRoundWins = [...match.roundWins];
    if (match.round === 1) {
      mp.ref.update({ roundWins: nextRoundWins, status: 'done' });
    } else {
      mp.ref.update({ roundWins: nextRoundWins });
    }
  }

  document.getElementById('re-round-pill').textContent = `Round ${match.round + 1}`;

  const outcomeEl = document.getElementById('re-outcome');
  if (outcomeEl) {
    outcomeEl.textContent = outcome === 'guesser'
      ? `${match.players[1 - match.setterIdx]} escaped!`
      : `${match.players[match.setterIdx]} wins the round!`;
  }

  const revealEl = document.getElementById('re-word-reveal');
  if (revealEl && roundState) revealEl.textContent = `The word was: ${roundState.word.toUpperCase()}`;

  const scoreEl = document.getElementById('re-score');
  if (scoreEl) scoreEl.textContent = `${match.players[0]}: ${match.roundWins[0]} — ${match.players[1]}: ${match.roundWins[1]}`;

  const nextBtn = document.getElementById('re-next-btn');
  if (nextBtn) nextBtn.textContent = match.round === 0 ? 'Round 2 →' : 'See Results →';

  showScreen('round-end');
}

function nextRound() {
  if (match.round === 0) {
    if (match.mode === 'local') {
      match.round++;
      match.setterIdx = 1 - match.setterIdx;
      roundState      = null;
      showCoverForSetter();
    } else {
      // Push only — Firebase listener drives the transition for both players
      const newSetterIdx = 1 - match.setterIdx;
      if (mp.ref) {
        mp.ref.update({
          round:     1,
          setterIdx: newSetterIdx,
          word:      null,
          hint:      null,
          guessed:   [],
          wrong:     0,
          status:    'setting',
        });
      }
    }
  } else {
    showMatchResult();
  }
}

// ============================================================
// MATCH RESULT
// ============================================================
function showMatchResult() {
  const [w0, w1] = match.roundWins;
  let titleText, subText;

  if (w0 > w1)       { titleText = `${match.players[0]} wins!`; subText = 'Won both rounds'; }
  else if (w1 > w0)  { titleText = `${match.players[1]} wins!`; subText = 'Won both rounds'; }
  else               { titleText = 'Draw!';                      subText = 'One round each'; }

  document.getElementById('result-name').textContent = titleText;
  document.getElementById('result-sub').textContent  = subText;

  const roundsEl = document.getElementById('result-rounds');
  if (roundsEl) {
    roundsEl.innerHTML = '';
    for (let r = 0; r < 2; r++) {
      const data = match.roundData[r];
      if (!data) continue;
      const roundWinner = data.outcome === 'guesser'
        ? match.players[1 - data.setter]
        : match.players[data.setter];
      const item = document.createElement('div');
      item.className = 'result-round-item';
      item.innerHTML = `
        <div class="result-round-label">Round ${r + 1} · ${data.word.toUpperCase()}</div>
        <div class="result-round-winner">${roundWinner}</div>
      `;
      roundsEl.appendChild(item);
    }
  }

  if (w0 !== w1) setTimeout(launchConfetti, 100);
  window._lvsWinPlayers = { names: match.players.slice(), winner: w0 > w1 ? 0 : w1 > w0 ? 1 : 2 };
  showScreen('result');
}

// ============================================================
// CONFETTI
// ============================================================
// ============================================================
// ONLINE FLOW
// ============================================================

function setOnlineMsg(msg, isError = false) {
  const el = document.getElementById('online-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#c0392b' : '';
}

function createRoom() {
  const name    = document.getElementById('online-name').value.trim() || 'Player';
  lvsSaveNames(name, null);
  const code    = randomCode();
  const hostIdx = Math.floor(Math.random() * 2);
  const ref     = db.ref('hangman-rooms/' + code);

  mp.active  = true;
  mp.started = false;
  mp.role    = 'host';
  mp.myIdx   = hostIdx;
  mp.ref     = ref;
  mp.code    = code;

  match.mode      = 'online';
  match.hintsOn   = hintOnlineOn;
  match.players   = ['', ''];
  match.players[hostIdx] = name;
  match.round     = 0;
  match.roundWins = [0, 0];
  match.roundData = [null, null];
  match.setterIdx = Math.random() < 0.5 ? 0 : 1;

  ref.set({
    host:        name,
    guest:       null,
    hostIdx,
    hintsOn:     hintOnlineOn,
    setterIdx:   match.setterIdx,
    status:      'waiting',
    round:       0,
    word:        null,
    hint:        null,
    guessed:     [],
    wrong:       0,
    roundWins:   [0, 0],
  });

  localStorage.setItem('lvs_hm_room', code);
  localStorage.setItem('lvs_hm_role', 'host');

  document.getElementById('waiting-code').textContent     = code;
  document.getElementById('waiting-copy-btn').textContent = 'Copy Link';
  showScreen('waiting');

  ref.on('value', snap => {
    const d = snap.val();
    if (!d) return;
    if (d.status === 'setting' && !mp.started) {
      mp.started = true;
      match.players[1 - hostIdx] = d.guest || 'Opponent';
      playChime();
      syncFromFirebase(d);
      showOnlineSetScreen();
      return;
    }
    handleOnlineUpdate(d);
  });
}

function joinRoom() {
  const name = document.getElementById('online-name').value.trim() || 'Player';
  lvsSaveNames(name, null);
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length < 4) { setOnlineMsg('Enter a 4-letter room code', true); return; }
  setOnlineMsg('Joining…');

  db.ref('hangman-rooms/' + code).once('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'waiting') { setOnlineMsg('Room not found — check the code', true); return; }

    const ref  = db.ref('hangman-rooms/' + code);
    mp.active  = true;
    mp.started = true;
    mp.role    = 'guest';
    mp.myIdx   = 1 - data.hostIdx;
    mp.ref     = ref;
    mp.code    = code;

    match.mode    = 'online';
    match.players = ['', ''];
    match.players[data.hostIdx]     = data.host;
    match.players[1 - data.hostIdx] = name;

    syncFromFirebase(data);
    ref.update({ guest: name, status: 'setting' });

    localStorage.setItem('lvs_hm_room', code);
    localStorage.setItem('lvs_hm_role', 'guest');

    playChime();
    showOnlineSetScreen();

    ref.on('value', snap => {
      const d = snap.val();
      if (!d) return;
      handleOnlineUpdate(d);
    });
  });
}

function syncFromFirebase(d) {
  match.round     = d.round        !== undefined ? d.round        : 0;
  match.setterIdx = d.setterIdx    !== undefined ? d.setterIdx    : 0;
  match.roundWins = d.roundWins    || [0, 0];
  match.hintsOn   = d.hintsOn      !== undefined ? d.hintsOn      : match.hintsOn;
  if (d.host)  match.players[d.hostIdx]     = d.host;
  if (d.guest) match.players[1 - d.hostIdx] = d.guest;
}

// ============================================================
// ONLINE SET WORD SCREEN
// ============================================================
function showOnlineSetScreen() {
  lvsOnlineStart(mp.ref, mp.myIdx, backToLobby);
  const isSetter = mp.myIdx === match.setterIdx;
  document.getElementById('online-set-round-pill').textContent = `Round ${match.round + 1}`;

  const roleTag = document.getElementById('online-set-role-tag');
  if (roleTag) roleTag.textContent = isSetter ? 'You are the Setter' : 'You are the Guesser';

  const header = document.getElementById('online-set-header');
  if (header) header.textContent = isSetter ? 'Set Your Word' : 'Waiting for Setter…';

  const body    = document.getElementById('online-set-body');
  const waiting = document.getElementById('online-waiting-set');

  if (isSetter) {
    if (body)    body.style.display    = 'flex';
    if (waiting) waiting.style.display = 'none';
    document.getElementById('online-set-input').value        = '';
    document.getElementById('online-set-input').disabled     = false;
    document.getElementById('online-set-msg').textContent    = '';
    const hintRow = document.getElementById('online-hint-row');
    if (hintRow) hintRow.style.display = match.hintsOn ? 'flex' : 'none';
    if (match.hintsOn) {
      const hi = document.getElementById('online-hint-input');
      if (hi) hi.value = '';
    }
    const btn = document.getElementById('online-confirm-btn');
    btn.disabled    = false;
    btn.textContent = 'Lock it in →';
    setTimeout(() => document.getElementById('online-set-input').focus(), 80);
  } else {
    if (body)    body.style.display    = 'none';
    if (waiting) waiting.style.display = 'flex';
  }

  showScreen('online-set');
}

function confirmOnlineWord() {
  const raw  = document.getElementById('online-set-input').value.trim().toLowerCase();
  const hint = match.hintsOn ? (document.getElementById('online-hint-input').value.trim()) : '';

  if (!raw)                { setOnlineSetMsg('Enter a word', true);                        return; }
  if (/[^a-z]/.test(raw)) { setOnlineSetMsg('Letters only — no spaces or symbols', true); return; }
  if (raw.length > 20)    { setOnlineSetMsg('Max 20 letters', true);                       return; }

  // Store locally
  match.roundData[match.round] = { word: raw, hint, setter: match.setterIdx };

  if (!mp.ref) return;
  mp.ref.update({ word: raw, hint: hint || null, status: 'playing' });

  document.getElementById('online-confirm-btn').disabled    = true;
  document.getElementById('online-confirm-btn').textContent = 'Locked!';
  document.getElementById('online-set-input').disabled      = true;
  setOnlineSetMsg('Word locked — starting shortly…');
}

function setOnlineSetMsg(msg, isError = false) {
  const el = document.getElementById('online-set-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#c0392b' : '';
}

// ============================================================
// ONLINE: PUSH GUESS
// ============================================================
function pushGuessToFirebase() {
  if (!mp.ref) return;
  mp.ref.update({
    guessed: [...roundState.guessed],
    wrong:   roundState.wrong,
  });
}

// ============================================================
// ONLINE: HANDLE UPDATE
// ============================================================
function handleOnlineUpdate(d) {
  lvsOnlineUpdate(d);
  if (!d) return;
  if (d.host)  match.players[d.hostIdx]     = d.host;
  if (d.guest) match.players[1 - d.hostIdx] = d.guest;

  // Match done
  if (d.status === 'done') {
    if (document.getElementById('screen-result').classList.contains('active')) {
      if (d.ready0 === true && d.ready1 === true && mp.role === 'host') {
        const newSetterIdx = Math.random() < 0.5 ? 0 : 1;
        mp.ref.update({
          round:     0,
          setterIdx: newSetterIdx,
          word:      null,
          hint:      null,
          guessed:   [],
          wrong:     0,
          roundWins: [0, 0],
          status:    'setting',
          ready0:    false,
          ready1:    false,
        });
      }
      return;
    }
    match.roundWins = d.roundWins || match.roundWins;
    showMatchResult();
    return;
  }

  // Play Again — opponent reset the match
  if (d.status === 'setting' && d.round === 0 &&
      document.getElementById('screen-result').classList.contains('active')) {
    roundState      = null;
    match.roundData = [null, null];
    syncFromFirebase(d);
    showOnlineSetScreen();
    return;
  }

  // Round 2 set phase — both players driven here by Firebase
  if (d.status === 'setting' && d.round === 1 && match.round !== 1) {
    match.round     = 1;
    match.setterIdx = d.setterIdx !== undefined ? d.setterIdx : 1 - match.setterIdx;
    match.roundWins = d.roundWins || match.roundWins;
    roundState      = null;
    showOnlineSetScreen();
    return;
  }

  // Game starting
  if (d.status === 'playing') {
    if (!d.word) return;

    // Initialise round if not started yet
    if (!roundState) {
      syncFromFirebase(d);
      match.roundData[match.round] = { word: d.word, hint: d.hint || '', setter: match.setterIdx };
      beginRound(d.word, d.hint || '');
      // Setter watches: disable keyboard
      if (mp.myIdx === match.setterIdx) disableKeyboard();
      // Sync any guesses that arrived before we initialised
      if (d.guessed && d.guessed.length > 0) {
        roundState.guessed = new Set(d.guessed);
        roundState.wrong   = d.wrong || 0;
        renderGallows();
        renderBlanks();
        renderWrongLetters();
        updateKeyboard();
      }
      return;
    }

    // Setter watches guesser's progress via Firebase
    if (mp.myIdx === match.setterIdx && !roundState.done) {
      roundState.guessed = new Set(d.guessed || []);
      roundState.wrong   = d.wrong || 0;
      renderGallows();
      renderBlanks();
      renderWrongLetters();
      updateKeyboard();

      const solved = roundState.word.split('').every(ch => roundState.guessed.has(ch));
      if (solved) {
        roundState.done = true;
        setGameMsg(`${match.players[1 - match.setterIdx]} guessed it!`, 'win');
        playWin();
        setTimeout(() => endRound('guesser'), 900);
        return;
      }
      if (roundState.wrong >= MAX_WRONG) {
        roundState.done = true;
        setGameMsg(`Hanged! The word was ${roundState.word.toUpperCase()}`, 'error');
        playLose();
        setTimeout(() => endRound('setter'), 1400);
        return;
      }
    }
  }
}

function copyCode() {
  const btn = document.getElementById('waiting-copy-btn');
  lvsCopyLink(mp.code, btn, 'Copy Link');
}

// ============================================================
// BACK / PLAY AGAIN
// ============================================================
function backToLobby() {
  lvsOnlineStop();
  if (mp.active && mp.ref) mp.ref.off();
  mp.active  = false;
  mp.started = false;
  mp.ref     = null;
  mp.code    = null;
  localStorage.removeItem('lvs_hm_room');
  localStorage.removeItem('lvs_hm_role');
  roundState      = null;
  match.roundWins = [0, 0];
  match.roundData = [null, null];
  showScreen('lobby');
}

function playAgain() {
  roundState      = null;
  match.round     = 0;
  match.roundWins = [0, 0];
  match.roundData = [null, null];
  match.setterIdx = Math.random() < 0.5 ? 0 : 1;

  if (match.mode === 'local') {
    showCoverForSetter();
  } else {
    const btn = document.getElementById('win-again-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
    mp.ref.update({ ['ready' + mp.myIdx]: true });
  }
}

// ============================================================
// KEYBOARD LISTENER
// ============================================================
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[a-zA-Z]$/.test(e.key)) {
    const active = document.querySelector('.screen.active');
    if (active && active.id === 'screen-game') {
      e.preventDefault();
      handleLetter(e.key.toLowerCase());
    }
  }
});

// ============================================================
// RECONNECT ON REFRESH
// ============================================================
(function tryReconnect() {
  const code = localStorage.getItem('lvs_hm_room');
  const role = localStorage.getItem('lvs_hm_role');
  if (!code || !role) return;

  db.ref('hangman-rooms/' + code).once('value', snap => {
    const data = snap.val();
    if (!data || data.status === 'waiting' || data.status === 'done') {
      localStorage.removeItem('lvs_hm_room');
      localStorage.removeItem('lvs_hm_role');
      return;
    }

    const ref  = db.ref('hangman-rooms/' + code);
    mp.active  = true;
    mp.started = true;
    mp.role    = role;
    mp.myIdx   = role === 'host' ? data.hostIdx : 1 - data.hostIdx;
    mp.ref     = ref;
    mp.code    = code;
    match.mode = 'online';

    syncFromFirebase(data);

    if (data.status === 'setting') {
      showOnlineSetScreen();
    } else if (data.status === 'playing' && data.word) {
      match.roundData[match.round] = { word: data.word, hint: data.hint || '', setter: match.setterIdx };
      beginRound(data.word, data.hint || '');
      roundState.guessed = new Set(data.guessed || []);
      roundState.wrong   = data.wrong || 0;
      renderGallows();
      renderBlanks();
      renderWrongLetters();
      updateKeyboard();
      if (mp.myIdx === match.setterIdx) disableKeyboard();
    }

    ref.on('value', snap => {
      const d = snap.val();
      if (!d) return;
      handleOnlineUpdate(d);
    });
  });
})();
