const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Unscramble the jumbled letters to discover the hidden word before the timer runs out.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>A word is scrambled and shown as letter tiles.</li>
    <li>Work out what the original word is.</li>
    <li>Type your answer and submit.</li>
  </ol>
</div>
<div class="rs">
  <h3>Hints</h3>
  <p>Stuck? Use a hint to reveal one letter in its correct position. Fewer hints used means a higher score.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Scan for common prefixes (UN-, RE-, PRE-) and suffixes (-ING, -TION, -ED) in the scrambled letters.</div>
`;

/* ============================================================
   ANAGRAM RACE — Lash vs Seven
   ============================================================ */

const TOTAL_ROUNDS = 5;
const ROUND_TIME   = 60; // seconds

// ─── module state ───────────────────────────────────────────────
let myIdx    = 0;          // 0 = left player, 1 = right player
let isHost   = false;      // host manages round transitions
let roomRef  = null;
let roomCode = null;
let gd       = null;       // latest Firebase room snapshot
let timerItv = null;
let roundLocked = false;   // prevent duplicate submissions / timeouts

// ─── message helper ────────────────────────────────────────────
function setMsg(elId, text, err) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className   = 'form-msg' + (err ? ' error' : '');
}

// ─── word helpers ──────────────────────────────────────────────
function pickWords(n) {
  const pool   = ANAGRAM_WORDS.filter(w => w.length >= 5).map(w => w.toUpperCase());
  const result = [];
  const used   = new Set();
  while (result.length < n && pool.length > used.size) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!used.has(w)) { used.add(w); result.push(w); }
  }
  return result;
}

function scrambleWord(word) {
  const a = word.split('');
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Ensure it differs from original
  if (a.join('') === word) { a.push(a.shift()); }
  return a.join('');
}

// Build names array [player0, player1] from room data
function getNames(d) {
  if ((d.hostIdx || 0) === 0) return [d.host, d.guest || '…'];
  return [d.guest || '…', d.host];
}

// ─── create room ───────────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('online-name').value.trim();
  if (!name) { setMsg('online-msg', 'Enter your name first.', true); return; }

  const code      = randomCode();
  const hostIdx   = Math.floor(Math.random() * 2);
  const words     = pickWords(TOTAL_ROUNDS);
  const scrambles = words.map(scrambleWord);

  roomCode = code; myIdx = hostIdx; isHost = true;
  localStorage.setItem('lvs_ag_room', code);
  localStorage.setItem('lvs_ag_role', 'host');
  lvsSaveNames(name, '');

  db.ref('anagram-rooms/' + code).set({
    host: name, guest: null, hostIdx,
    status:      'waiting',
    round:       0,
    words,
    scrambles,
    scores:      [0, 0],
    roundSolved: false,
    roundWinner: -1,
    winner:      -1,
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

  db.ref('anagram-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d)                     { setMsg('online-msg', 'Room not found.', true); return; }
    if (d.status !== 'waiting') { setMsg('online-msg', 'Game already started.', true); return; }
    if (d.guest)                { setMsg('online-msg', 'Room is full.', true); return; }

    roomCode = code; myIdx = 1 - (d.hostIdx || 0); isHost = false;
    localStorage.setItem('lvs_ag_room', code);
    localStorage.setItem('lvs_ag_role', 'guest');
    lvsSaveNames(name, '');

    db.ref('anagram-rooms/' + code).update({ guest: name, status: 'playing' })
      .then(() => {
        attachListener();
        startGame({ ...d, guest: name, status: 'playing' });
      })
      .catch(() => setMsg('online-msg', 'Could not join room.', true));
  }).catch(() => setMsg('online-msg', 'Could not reach server.', true));
}

// ─── Firebase listener ─────────────────────────────────────────
function attachListener() {
  if (roomRef) roomRef.off();
  roomRef = db.ref('anagram-rooms/' + roomCode);
  roomRef.on('value', snap => handleUpdate(snap.val()));
}

function handleUpdate(d) {
  if (!d) return;
  lvsOnlineUpdate(d);
  gd = d;

  // Sync score display in both game and round-over screens
  document.getElementById('score-num-0').textContent = d.scores[0];
  document.getElementById('score-num-1').textContent = d.scores[1];
  document.getElementById('ro-num-0').textContent    = d.scores[0];
  document.getElementById('ro-num-1').textContent    = d.scores[1];

  if (d.status === 'done') { showWin(d); return; }

  // Host-only: game was created and guest just joined — host receives the
  // 'playing' status update here and calls startGame for itself
  const activeId = document.querySelector('.screen.active')?.id;
  if (d.status === 'playing' && activeId === 'screen-waiting') {
    startGame(d);
    return;
  }

  // Play Again — both players restart in the same room
  if (d.status === 'playing' && activeId === 'screen-win') {
    startGame(d);
    return;
  }

  if (d.ready0 === true && d.ready1 === true && isHost) {
    const words     = pickWords(TOTAL_ROUNDS);
    const scrambles = words.map(scrambleWord);
    roomRef.update({
      status:      'playing',
      round:       0,
      words,
      scrambles,
      scores:      [0, 0],
      roundSolved: false,
      roundWinner: -1,
      winner:      -1,
      ready0:      false,
      ready1:      false,
    });
    return;
  }

  if (d.status !== 'playing') return;

  if (d.roundSolved && activeId === 'screen-game') {
    showRoundOver(d);
  } else if (!d.roundSolved && activeId === 'screen-round-over') {
    startRound(d.round, d);
    showScreen('game');
  }
}

// ─── start game ────────────────────────────────────────────────
function startGame(d) {
  lvsOnlineStart(roomRef, myIdx, backToLobby);
  gd = d;
  const names = getNames(d);
  document.getElementById('score-name-0').textContent = names[0];
  document.getElementById('score-name-1').textContent = names[1];
  document.getElementById('ro-name-0').textContent    = names[0];
  document.getElementById('ro-name-1').textContent    = names[1];
  document.getElementById('score-num-0').textContent  = '0';
  document.getElementById('score-num-1').textContent  = '0';
  showScreen('game');
  startRound(d.round, d);
}

// ─── round logic ───────────────────────────────────────────────
function startRound(roundNum, d) {
  roundLocked = false;
  clearTimer();

  const scrambled = (d || gd).scrambles[roundNum];
  document.getElementById('round-pill').textContent       = `Round ${roundNum + 1} / ${TOTAL_ROUNDS}`;
  document.getElementById('answer-input').value           = '';
  document.getElementById('answer-input').disabled        = false;
  document.getElementById('submit-btn').disabled          = false;
  document.getElementById('answer-msg').textContent       = '';
  document.getElementById('answer-msg').className         = 'answer-msg';
  document.getElementById('opp-status').textContent       = '';

  // Render letter tiles
  const scrambleEl = document.getElementById('scramble-word');
  scrambleEl.innerHTML = scrambled.split('').map(
    l => `<span class="letter-tile">${l}</span>`
  ).join('');
  document.getElementById('letter-count').textContent = scrambled.length + ' letters';

  startTimer();
  setTimeout(() => { document.getElementById('answer-input').focus(); }, 100);
}

function startTimer() {
  let remaining = ROUND_TIME;
  const bar     = document.getElementById('timer-bar');
  const label   = document.getElementById('timer-label');

  // Reset bar without animation first
  bar.style.transition = 'none';
  bar.style.width      = '100%';
  bar.style.background = '#2d7d46';
  bar.classList.remove('urgent');
  label.textContent    = remaining;

  // Force reflow so the reset takes effect before we start animating
  bar.getBoundingClientRect();

  // Smooth CSS transition from 100% → 0% over ROUND_TIME seconds
  bar.style.transition = `width ${ROUND_TIME}s linear`;
  bar.style.width      = '0%';

  timerItv = setInterval(() => {
    remaining--;
    label.textContent = remaining;
    if (remaining <= 10) {
      bar.style.background = 'var(--orange)';
      bar.classList.add('urgent');
    }
    if (remaining <= 0) {
      clearTimer();
      if (!roundLocked) timeUp();
    }
  }, 1000);
}

function clearTimer() {
  if (timerItv) { clearInterval(timerItv); timerItv = null; }
}

// Returns true if `submitted` is a valid anagram of `original`:
// same multiset of letters AND exists in the combined word dictionary.
function isValidAnagram(submitted, original) {
  if (submitted.length !== original.length) return false;
  const norm = s => s.toUpperCase().split('').sort().join('');
  if (norm(submitted) !== norm(original)) return false;
  const up = submitted.toUpperCase();
  return WH_WORD_SET.has(up) || ANAGRAM_WORDS.some(w => w.toUpperCase() === up);
}

function submitAnswer() {
  if (roundLocked) return;
  const input  = document.getElementById('answer-input');
  const answer = input.value.trim().toUpperCase();
  if (!answer) return;

  const word  = (gd.words || [])[gd.round];
  const msgEl = document.getElementById('answer-msg');

  if (isValidAnagram(answer, word)) {
    roundLocked = true;
    clearTimer();
    playCorrect();
    msgEl.textContent = '✓ ' + answer + '!';
    msgEl.className   = 'answer-msg correct';
    document.getElementById('answer-input').disabled = true;
    document.getElementById('submit-btn').disabled   = true;

    const newScores = [...gd.scores];
    newScores[myIdx]++;
    db.ref('anagram-rooms/' + roomCode).update({
      roundSolved: true,
      roundWinner: myIdx,
      scores:      newScores,
    });
  } else {
    playWrong();
    const norm = s => s.split('').sort().join('');
    const wrongLetters = norm(answer) !== norm(word.toUpperCase());
    msgEl.textContent = wrongLetters
      ? 'Use the letters shown'
      : 'Not a known word — try another';
    msgEl.className = 'answer-msg wrong';
    input.select();
    setTimeout(() => {
      if (!roundLocked) { msgEl.textContent = ''; msgEl.className = 'answer-msg'; }
    }, 1500);
  }
}

function timeUp() {
  roundLocked = true;
  document.getElementById('answer-input').disabled = true;
  document.getElementById('submit-btn').disabled   = true;
  document.getElementById('opp-status').textContent = "Time's up!";
  // Only host writes the timeout result to avoid a race
  if (isHost) {
    db.ref('anagram-rooms/' + roomCode).update({ roundSolved: true, roundWinner: 2 });
  }
}

// ─── definition fetch (Option C) ───────────────────────────────
async function fetchDefinition(word) {
  try {
    const res = await fetch(
      'https://api.dictionaryapi.dev/api/v2/entries/en/' + word.toLowerCase()
    );
    if (!res.ok) return null;
    const data    = await res.json();
    const meaning = data[0]?.meanings[0];
    if (!meaning) return null;
    return {
      pos:  meaning.partOfSpeech || '',
      text: meaning.definitions[0]?.definition || '',
    };
  } catch (_) { return null; }
}

// ─── round over ────────────────────────────────────────────────
function showRoundOver(d) {
  clearTimer();
  showScreen('round-over');

  const names    = getNames(d);
  const winner   = d.roundWinner;
  const roResult = document.getElementById('ro-result');

  if (winner === myIdx) {
    roResult.textContent = '🎉 You got it!';
    roResult.className   = 'ro-result win';
  } else if (winner === 2 || winner === -1) {
    roResult.textContent = "Time's up!";
    roResult.className   = 'ro-result draw';
  } else {
    roResult.textContent = names[winner] + ' got it';
    roResult.className   = 'ro-result loss';
  }

  const revealedWord = d.words[d.round];
  document.getElementById('ro-word').textContent  = revealedWord;
  document.getElementById('ro-num-0').textContent = d.scores[0];
  document.getElementById('ro-num-1').textContent = d.scores[1];

  // Fetch and show definition while the 3s pause is running
  const defEl = document.getElementById('ro-definition');
  defEl.textContent = '';
  fetchDefinition(revealedWord).then(def => {
    if (!def || !def.text) return;
    defEl.innerHTML =
      (def.pos ? `<span class="ro-def-pos">${def.pos}</span>` : '') +
      def.text;
  });

  const isLastRound = d.round >= TOTAL_ROUNDS - 1;
  document.getElementById('ro-next').textContent = isLastRound ? 'Final scores…' : 'Next round in 3…';

  // Animate countdown bar
  const roBar = document.getElementById('ro-bar');
  roBar.style.transition = 'none';
  roBar.style.width      = '100%';
  roBar.getBoundingClientRect();
  roBar.style.transition = 'width 3s linear';
  roBar.style.width      = '0%';

  // Only host advances round / ends game
  if (isHost) {
    setTimeout(() => {
      if (isLastRound) {
        const s      = d.scores;
        const winner = s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : 2;
        db.ref('anagram-rooms/' + roomCode).update({ status: 'done', winner });
      } else {
        db.ref('anagram-rooms/' + roomCode).update({
          round:       d.round + 1,
          roundSolved: false,
          roundWinner: -1,
        });
      }
    }, 3100);
  }
}

// ─── win screen ────────────────────────────────────────────────
function showWin(d) {
  clearTimer();
  const names     = getNames(d);
  const winnerIdx = d.winner;
  const abandoned = !!d.abandoned;

  const winName = document.getElementById('win-name');
  const winSub  = document.getElementById('win-sub');

  if (winnerIdx === 2) {
    winName.textContent = "It's a draw!";
  } else if (winnerIdx === myIdx) {
    winName.textContent = abandoned ? 'Opponent left' : 'You win!';
  } else if (winnerIdx >= 0) {
    winName.textContent = names[winnerIdx] + ' wins';
  } else {
    winName.textContent = 'Game over';
  }
  winSub.textContent = d.scores[0] + ' — ' + d.scores[1];

  window._lvsWinPlayers = { names, winner: winnerIdx >= 0 ? winnerIdx : 2 };
  showScreen('win');
  if (winnerIdx === myIdx || winnerIdx === 2) launchConfetti();
}

// ─── navigation ────────────────────────────────────────────────
function playAgain() {
  if (!roomCode) { showScreen('lobby'); return; }
  clearTimer();
  const btn = document.getElementById('win-again-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
  roomRef.update({ ['ready' + myIdx]: true });
}

function backToLobby() {
  lvsOnlineStop();
  clearTimer();
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (roomCode) {
    db.ref('anagram-rooms/' + roomCode).update({ status: 'done', winner: -1 }).catch(() => {});
  }
  localStorage.removeItem('lvs_ag_room');
  localStorage.removeItem('lvs_ag_role');
  roomCode = null;
  showScreen('lobby');
}

// Called from the in-game Exit button — forfeit to opponent
function quitGame() {
  if (!confirm('Exit the game? Your opponent will win by forfeit.')) return;
  clearTimer();
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (roomCode) {
    db.ref('anagram-rooms/' + roomCode).update({
      status:    'done',
      winner:    1 - myIdx,
      abandoned: true,
    }).catch(() => {});
  }
  localStorage.removeItem('lvs_ag_room');
  localStorage.removeItem('lvs_ag_role');
  roomCode = null;
  showScreen('lobby');
}

function copyCode() {
  const btn = document.getElementById('waiting-copy-btn');
  lvsCopyLink(roomCode, btn, 'Copy Link');
}

// ─── reconnect on page load ────────────────────────────────────
(function tryReconnect() {
  const code = localStorage.getItem('lvs_ag_room');
  const role = localStorage.getItem('lvs_ag_role');
  if (!code || !role) return;

  db.ref('anagram-rooms/' + code).once('value').then(snap => {
    const d = snap.val();
    if (!d || d.status === 'done' || d.status === 'waiting') {
      localStorage.removeItem('lvs_ag_room');
      localStorage.removeItem('lvs_ag_role');
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

function playCorrect() {
  if (isMuted()) return;
  try {
    const ctx = audioCtx();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.start(t); osc.stop(t + 0.3);
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
    osc.type = 'sawtooth'; osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(); osc.stop(ctx.currentTime + 0.2);
  } catch (_) {}
}

// ─── confetti ──────────────────────────────────────────────────
