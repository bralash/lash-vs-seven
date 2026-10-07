// ============================================================
// LVS SHARED UTILITIES
// ============================================================

// ── Firebase ─────────────────────────────────────────────────
firebase.initializeApp({
  apiKey:            'AIzaSyByYiN4eBZtRSTwaB3H64djW_lXpifVaqY',
  authDomain:        'lash-vs-seven.firebaseapp.com',
  databaseURL:       'https://lash-vs-seven-default-rtdb.firebaseio.com',
  projectId:         'lash-vs-seven',
  storageBucket:     'lash-vs-seven.firebasestorage.app',
  messagingSenderId: '982561165284',
  appId:             '1:982561165284:web:a081dd682f2a04c21741f1',
});
const db = firebase.database();

// ── Audio context ─────────────────────────────────────────────
let _audioCtx = null;
function audioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

// ── Confetti ──────────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx    = canvas.getContext('2d');
  const colors = ['#E85A25', '#FDF8EE', '#1A0D04', '#c8976a', '#74b9ff', '#f2a07a'];
  const parts  = Array.from({ length: 120 }, () => ({
    x:   Math.random() * canvas.width,
    y:   Math.random() * -canvas.height * 0.3 - 20,
    vx:  (Math.random() - 0.5) * 3,
    vy:  Math.random() * 3 + 2,
    sz:  Math.random() * 9 + 4,
    col: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2,
    rv:  (Math.random() - 0.5) * 0.15,
  }));
  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rv;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle   = p.col;
      ctx.globalAlpha = Math.max(0, 1 - frame / 160);
      ctx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz * 0.55);
      ctx.restore();
    });
    frame++;
    if (frame < 185) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })();
}

// ── Sound toggle ─────────────────────────────────────────────
function isMuted() { return localStorage.getItem('lvs_sound') === 'off'; }
function toggleSound() {
  localStorage.setItem('lvs_sound', isMuted() ? 'on' : 'off');
  const btn = document.getElementById('sound-btn');
  if (btn) btn.textContent = isMuted() ? '🔇' : '🔊';
}

// ── Name persistence ─────────────────────────────────────────
function lvsLoadNames() {
  const n0 = localStorage.getItem('lvs_name_0') || '';
  const n1 = localStorage.getItem('lvs_name_1') || '';
  // Primary name (my own — used for host, online, local p1)
  ['p1-name', 'local-name-0', 'host-name-input', 'online-name', 'guest-name-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el && n0) el.value = n0;
  });
  // Secondary name (local p2 only)
  ['p2-name', 'local-name-1'].forEach(id => {
    const el = document.getElementById(id);
    if (el && n1) el.value = n1;
  });
}
function lvsSaveNames(n0, n1) {
  if (n0) localStorage.setItem('lvs_name_0', n0);
  if (n1) localStorage.setItem('lvs_name_1', n1);
}

// ── Shareable room URL ────────────────────────────────────────
function lvsCheckRoomUrl() {
  const code = new URLSearchParams(window.location.search).get('room');
  if (!code) return;
  // Fill join input
  const joinInput = document.getElementById('join-code-input') || document.getElementById('join-code');
  if (joinInput) joinInput.value = code.toUpperCase();
  // Show join screen
  const joinScreen = document.getElementById('screen-lobby-join') || document.getElementById('screen-online');
  if (joinScreen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    joinScreen.classList.add('active');
  }
  // Hint message
  const msg = document.getElementById('join-error') || document.getElementById('online-msg');
  if (msg) {
    if (msg.id === 'join-error') {
      msg.textContent  = `Room ${code.toUpperCase()} — enter your name and join`;
      msg.style.display = 'block';
      msg.style.color   = '';
    } else {
      msg.textContent = `Room ${code.toUpperCase()} found — enter your name to join`;
    }
  }
}

function lvsCopyLink(code, btnEl, defaultText) {
  const url = location.origin + location.pathname + '?room=' + code;
  navigator.clipboard.writeText(url).catch(() => {});
  if (btnEl) {
    btnEl.textContent = 'Copied!';
    setTimeout(() => { btnEl.textContent = defaultText || 'Copy Link'; }, 1800);
  }
}

// ── Sound icon (Lucide) ───────────────────────────────────────
function _lvsSoundIcon() { return isMuted() ? 'volume-x' : 'volume-2'; }
function _lvsApplySoundIcon() {
  const btn = document.getElementById('sound-btn');
  if (btn) btn.innerHTML = `<i data-lucide="${_lvsSoundIcon()}"></i>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Screen switching ─────────────────────────────────────────
function _lvsInjectAvatars(screenEl) {
  if (!screenEl) return;
  const p = window._lvsWinPlayers;
  if (!p || !Array.isArray(p.names) || p.names.length < 2) return;
  const old = screenEl.querySelector('.lvs-avatar-row');
  if (old) old.remove();
  const anchor = screenEl.querySelector('#win-name,#result-name,#res-headline');
  if (!anchor) return;
  const isDraw = p.winner === 2 || p.winner === -1;
  const row = document.createElement('div');
  row.className = 'lvs-avatar-row';
  [0, 1].forEach(function (i) {
    const name = p.names[i] || ('Player ' + (i + 1));
    const isWin = !isDraw && p.winner === i;
    const col = document.createElement('div');
    col.className = 'lvs-avatar-col';
    col.style.opacity = isDraw ? '1' : isWin ? '1' : '0.35';
    const img = document.createElement('img');
    img.src = 'https://api.dicebear.com/9.x/micah/svg?seed=' + encodeURIComponent(name) + '&radius=50&size=128';
    img.width = 64; img.height = 64;
    img.className = 'lvs-avatar-img' + (isWin ? ' lvs-avatar-winner' : '');
    img.alt = name;
    const lbl = document.createElement('div');
    lbl.className = 'lvs-avatar-label';
    lbl.textContent = name;
    col.appendChild(img); col.appendChild(lbl); row.appendChild(col);
  });
  anchor.parentNode.insertBefore(row, anchor);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
  if (id === 'win' || id === 'result' || id === 'results') _lvsInjectAvatars(el);
}

// ── Room code generator ───────────────────────────────────────
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Online presence + ready-up ────────────────────────────────
let _lvsRef       = null;
let _lvsMyIdx     = null;
let _lvsBackFn    = null;
let _lvsDiscTimer = null;

(function lvsInjectOnlineUI() {
  document.addEventListener('DOMContentLoaded', function () {
    const style = document.createElement('style');
    style.textContent = [
      '@view-transition{navigation:auto}',
      '@keyframes _lvsIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '.screen.active{animation:_lvsIn 0.2s ease;}',
      '#lvs-disc-banner{position:fixed;bottom:64px;left:50%;transform:translateX(-50%);',
      'background:rgba(26,13,4,.96);color:#fdf8ee;padding:10px 20px;border-radius:8px;',
      'align-items:center;gap:14px;z-index:998;font-size:.875rem;white-space:nowrap;',
      'box-shadow:0 2px 16px rgba(0,0,0,.4);}',
      '#lvs-disc-banner button{background:none;border:1.5px solid rgba(253,248,238,.45);',
      'color:#fdf8ee;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:.8rem;font-family:inherit;}',
      '#lvs-disc-banner button:hover{background:rgba(253,248,238,.12);}',
      '.lvs-avatar-row{display:flex;justify-content:center;gap:36px;margin:16px 0 18px;}',
      '.lvs-avatar-col{display:flex;flex-direction:column;align-items:center;gap:5px;transition:opacity .3s;}',
      '.lvs-avatar-img{width:64px;height:64px;border-radius:50%;border:2.5px solid rgba(212,168,67,.3);}',
      '.lvs-avatar-winner{border-color:#d4a843;box-shadow:0 0 0 3px rgba(212,168,67,.2);}',
      '.lvs-avatar-label{font-size:.72rem;color:rgba(26,13,4,.55);font-family:Nunito,sans-serif;',
      'letter-spacing:.04em;text-align:center;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    ].join('');
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'lvs-disc-banner';
    el.style.display = 'none';
    el.innerHTML = '<span>Opponent disconnected\u2026</span><button id="lvs-disc-leave">Leave</button>';
    document.body.appendChild(el);
    document.getElementById('lvs-disc-leave').addEventListener('click', function () {
      if (typeof _lvsBackFn === 'function') _lvsBackFn();
    });
  });
})();

// Call when online game starts (both players joined)
function lvsOnlineStart(ref, myIdx, backFn) {
  _lvsRef   = ref;
  _lvsMyIdx = myIdx;
  _lvsBackFn = backFn;
  ref.update({ ['p' + myIdx + 'Online']: true });
  ref.child('p' + myIdx + 'Online').onDisconnect().set(false);
}

// Call when leaving a room (backToLobby / exitToLobby)
function lvsOnlineStop() {
  if (_lvsDiscTimer) { clearTimeout(_lvsDiscTimer); _lvsDiscTimer = null; }
  const banner = document.getElementById('lvs-disc-banner');
  if (banner) banner.style.display = 'none';
  if (_lvsRef && _lvsMyIdx !== null) {
    try {
      _lvsRef.child('p' + _lvsMyIdx + 'Online').onDisconnect().cancel();
      _lvsRef.child('p' + _lvsMyIdx + 'Online').set(false);
    } catch (_) {}
  }
  _lvsRef = null; _lvsMyIdx = null; _lvsBackFn = null;
}

// Call inside each Firebase listener — shows/hides disconnect banner
function lvsOnlineUpdate(d) {
  if (_lvsMyIdx === null) return;
  const oppOnline = d['p' + (1 - _lvsMyIdx) + 'Online'];
  const banner = document.getElementById('lvs-disc-banner');
  if (!banner) return;

  if (oppOnline === false) {
    banner.style.display = 'flex';
    // Auto-dismiss after 4 s; clear any previous timer first
    if (_lvsDiscTimer) clearTimeout(_lvsDiscTimer);
    _lvsDiscTimer = setTimeout(function () {
      banner.style.display = 'none';
      _lvsDiscTimer = null;
    }, 4000);
  } else {
    // Opponent back online — hide immediately and cancel pending timer
    if (_lvsDiscTimer) { clearTimeout(_lvsDiscTimer); _lvsDiscTimer = null; }
    banner.style.display = 'none';
  }
}

// Call when player presses Play Again (sets ready flag, updates button)
function lvsReadyUp(btnEl) {
  if (!_lvsRef || _lvsMyIdx === null) return;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Ready! Waiting\u2026'; }
  _lvsRef.update({ ['ready' + _lvsMyIdx]: true });
}

// Call in listener when on end screen — updates Play Again button text/state
function lvsReadyUI(d, btnEl) {
  if (!btnEl || _lvsMyIdx === null) return;
  const my  = d['ready' + _lvsMyIdx]       === true;
  const opp = d['ready' + (1 - _lvsMyIdx)] === true;
  if (my && !opp)  { btnEl.disabled = true;  btnEl.textContent = 'Ready! Waiting\u2026'; }
  else if (!my && opp) { btnEl.disabled = false; btnEl.textContent = 'Play Again \u2014 opponent ready!'; }
  else if (!my && !opp) { btnEl.disabled = false; btnEl.textContent = 'Play Again'; }
}

// Returns true when both players have pressed Play Again
function lvsReadyBoth(d) {
  return d.ready0 === true && d.ready1 === true;
}

// Returns true if the currently active screen is a win/results screen
function lvsIsEndScreen() {
  const id = document.querySelector('.screen.active')?.id ?? '';
  return id === 'screen-win' || id === 'screen-results' || id === 'screen-result';
}

// Download a result card as PNG.
// opts: { game, names[2], winner (0/1/2), scores[2]?, scoreLabel?, result? }
// winner 2 = draw. scores/scoreLabel optional (e.g. dots). result = subtitle line (e.g. connect4).
function lvsDownloadCard(opts) {
  document.fonts.ready.then(() => {
    const W = 1120, H = 560;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const CREAM  = '#fdf8ee';
    const GOLD   = '#d4a843';
    const BG     = '#1A0D04';
    const DIM    = 'rgba(253,248,238,0.30)';
    const DIMMER = 'rgba(253,248,238,0.18)';
    const GHOST  = 'rgba(253,248,238,0.12)';
    const PX = 72;
    const isDraw = opts.winner === 2;
    const wIdx = isDraw ? 0 : opts.winner;
    const lIdx = isDraw ? 1 : 1 - opts.winner;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    ctx.letterSpacing = '3px';
    ctx.font = '600 22px Oswald, sans-serif';
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'left';
    ctx.fillText('◆  ' + opts.game.toUpperCase(), PX, 66);

    ctx.letterSpacing = '2px';
    ctx.font = '400 18px Oswald, sans-serif';
    ctx.fillStyle = DIM;
    ctx.textAlign = 'right';
    ctx.fillText('LASH VS SEVEN', W - PX, 66);

    const nameY  = 270;
    const subY   = nameY + 44;
    const scoreY = subY + 36;

    if (isDraw) {
      ctx.letterSpacing = '2px';
      ctx.font = '700 68px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(253,248,238,0.48)';
      ctx.textAlign = 'left';
      ctx.fillText(opts.names[0].toUpperCase(), PX, nameY);
      ctx.textAlign = 'right';
      ctx.fillText(opts.names[1].toUpperCase(), W - PX, nameY);

      ctx.letterSpacing = '5px';
      ctx.font = '700 28px Oswald, sans-serif';
      ctx.fillStyle = GOLD;
      ctx.textAlign = 'center';
      ctx.fillText('DRAW', W / 2, nameY - 14);

      ctx.letterSpacing = '1px';
      ctx.font = '400 18px Oswald, sans-serif';
      if (opts.scores) {
        ctx.fillStyle = DIM;
        ctx.textAlign = 'left';
        ctx.fillText(opts.scores[0] + (opts.scoreLabel ? ' ' + opts.scoreLabel : ''), PX, scoreY);
        ctx.textAlign = 'right';
        ctx.fillText(opts.scores[1] + (opts.scoreLabel ? ' ' + opts.scoreLabel : ''), W - PX, scoreY);
      }
      if (opts.result) {
        ctx.fillStyle = DIM;
        ctx.textAlign = 'center';
        ctx.fillText(opts.result.toUpperCase(), W / 2, scoreY);
      }
    } else {
      ctx.letterSpacing = '2px';
      ctx.font = '700 68px Oswald, sans-serif';
      ctx.fillStyle = CREAM;
      ctx.textAlign = 'left';
      ctx.fillText(opts.names[wIdx].toUpperCase(), PX, nameY);

      ctx.letterSpacing = '2px';
      ctx.font = '400 18px Oswald, sans-serif';
      ctx.fillStyle = GOLD;
      ctx.textAlign = 'left';
      ctx.fillText('★  WINNER', PX, subY);

      ctx.letterSpacing = '2px';
      ctx.font = '400 16px Oswald, sans-serif';
      ctx.fillStyle = DIMMER;
      ctx.textAlign = 'center';
      ctx.fillText('VS', W / 2, nameY - 8);

      ctx.letterSpacing = '2px';
      ctx.font = '700 68px Oswald, sans-serif';
      ctx.fillStyle = DIM;
      ctx.textAlign = 'right';
      ctx.fillText(opts.names[lIdx].toUpperCase(), W - PX, nameY);

      ctx.letterSpacing = '2px';
      ctx.font = '400 18px Oswald, sans-serif';
      ctx.fillStyle = GHOST;
      ctx.textAlign = 'right';
      ctx.fillText('BEATEN', W - PX, subY);

      ctx.letterSpacing = '1px';
      ctx.font = '400 18px Oswald, sans-serif';
      if (opts.scores) {
        ctx.fillStyle = DIM;
        ctx.textAlign = 'left';
        ctx.fillText(opts.scores[wIdx] + (opts.scoreLabel ? ' ' + opts.scoreLabel : ''), PX, scoreY);
        ctx.fillStyle = GHOST;
        ctx.textAlign = 'right';
        ctx.fillText(opts.scores[lIdx] + (opts.scoreLabel ? ' ' + opts.scoreLabel : ''), W - PX, scoreY);
      }
      if (opts.result) {
        ctx.fillStyle = DIM;
        ctx.textAlign = 'left';
        ctx.fillText(opts.result.toUpperCase(), PX, scoreY);
      }
    }

    ctx.letterSpacing = '3px';
    ctx.font = '400 15px Oswald, sans-serif';
    ctx.fillStyle = GHOST;
    ctx.textAlign = 'left';
    ctx.fillText('◆  ◆  ◆', PX, H - 52);

    ctx.letterSpacing = '1px';
    ctx.font = '400 15px Oswald, sans-serif';
    ctx.fillStyle = DIM;
    ctx.textAlign = 'right';
    ctx.fillText('lash-vs-seven.web.app', W - PX, H - 52);

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lvs-' + (opts.game || 'result').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  });
}

// ── Shared fullscreen ────────────────────────────────────────────

function lvsFsToggle() {
  const el = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => {});
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
}

function _lvsFsSync() {
  const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  document.body.classList.toggle('is-fullscreen', fs);
  const icon = document.getElementById('fs-icon');
  if (icon) {
    icon.setAttribute('data-lucide', fs ? 'minimize-2' : 'maximize-2');
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [icon] });
  }
  if (typeof lvsFsOnChange === 'function') lvsFsOnChange(fs);
}

document.addEventListener('fullscreenchange', _lvsFsSync);
document.addEventListener('webkitfullscreenchange', _lvsFsSync);

function lvsFsShow() {
  const btn = document.getElementById('fs-btn');
  if (btn) btn.style.display = '';
}

function lvsFsHide() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  const btn = document.getElementById('fs-btn');
  if (btn) btn.style.display = 'none';
}

// ── Rules modal ──────────────────────────────────────────────────
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const el = document.createElement('div');
    el.id = 'lvs-rules-overlay';
    el.className = 'lvs-rules-overlay';
    el.innerHTML =
      '<div class="lvs-rules-sheet">' +
        '<div class="lvs-rules-handle"></div>' +
        '<div class="lvs-rules-hd">' +
          '<span class="lvs-rules-label">How to Play</span>' +
          '<button class="lvs-rules-x" onclick="lvsHideRules()" aria-label="Close">' +
            '<i data-lucide="x"></i>' +
          '</button>' +
        '</div>' +
        '<div class="lvs-rules-bd" id="lvs-rules-bd"></div>' +
      '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) lvsHideRules(); });
    document.body.appendChild(el);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lvsHideRules(); });
})();

function lvsShowRules(html) {
  const bd = document.getElementById('lvs-rules-bd');
  if (!bd) return;
  bd.innerHTML = html;
  document.getElementById('lvs-rules-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function lvsHideRules() {
  const ov = document.getElementById('lvs-rules-overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Init on load ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', _lvsApplySoundIcon);
document.addEventListener('DOMContentLoaded', () => {
  lvsLoadNames();
  lvsCheckRoomUrl();
});
