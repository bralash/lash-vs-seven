const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Be the first player to move your pawn to any square on the opposite side of the board.</p>
</div>
<div class="rs">
  <h3>On Your Turn — Choose One</h3>
  <ol>
    <li><strong>Move your pawn</strong> one square in any direction (up, down, left, right).</li>
    <li><strong>Place a wall</strong> to block your opponent's path. Walls span 2 squares and cannot overlap.</li>
  </ol>
</div>
<div class="rs">
  <h3>Walls</h3>
  <p>Each player starts with 10 walls. <strong>You can never completely trap an opponent</strong> — they must always have at least one path to their goal side.</p>
</div>
<div class="rs">
  <h3>Jumping</h3>
  <p>If your opponent is directly adjacent you may jump over them. If a wall or board edge blocks the straight jump, you may jump diagonally instead.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Save your walls for when your opponent is close to winning — early walls often help them as much as you.</div>
`;

// ============================================================
// QUORIDOR — js/quoridor.js
// ============================================================
// Board: 9×9 grid. rows 0 (top) – 8 (bottom), cols 0–8.
// Player 0 (orange): starts (8,4), goal = row 0.
// Player 1 (dark):   starts (0,4), goal = row 8.
// hWalls[]: {r,c} anchors — H wall blocks (r,c)↔(r+1,c) and (r,c+1)↔(r+1,c+1)
// vWalls[]: {r,c} anchors — V wall blocks (r,c)↔(r,c+1) and (r+1,c)↔(r+1,c+1)

// ── Multiplayer state ─────────────────────────────────────
const mp = { active:false, started:false, myIdx:0, role:null, ref:null, code:null };

// ── Game state ────────────────────────────────────────────
const state = {
  pos:        [{r:8,c:4},{r:0,c:4}],
  wallsLeft:  [10,10],
  hWalls:     [],
  vWalls:     [],
  current:    0,
  winner:     -1,
  players:    ['Player 1','Player 2'],
  mode:       'move',
  validMoves: [],
};

// ── Core helpers ──────────────────────────────────────────
function buildBlocked(hWalls, vWalls) {
  const hB = Array.from({length:8}, ()=>Array(9).fill(false));
  const vB = Array.from({length:9}, ()=>Array(8).fill(false));
  for (const {r,c} of hWalls) { hB[r][c]=true; hB[r][c+1]=true; }
  for (const {r,c} of vWalls) { vB[r][c]=true; vB[r+1][c]=true; }
  return {hB,vB};
}

function wallBlocked(r1,c1,r2,c2, hB,vB) {
  const dr=r2-r1, dc=c2-c1;
  if (dr===1)  return hB[r1][c1];
  if (dr===-1) return hB[r2][c1];
  if (dc===1)  return vB[r1][c1];
  if (dc===-1) return vB[r1][c2];
  return false;
}

function getValidMoves(p, opp, hB, vB) {
  const {r,c}=p, {r:or,c:oc}=opp;
  const moves=[];
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr=r+dr, nc=c+dc;
    if (nr<0||nr>8||nc<0||nc>8) continue;
    if (wallBlocked(r,c,nr,nc,hB,vB)) continue;
    if (nr===or && nc===oc) {
      const jr=or+dr, jc=oc+dc;
      if (jr>=0&&jr<=8&&jc>=0&&jc<=8&&!wallBlocked(or,oc,jr,jc,hB,vB)) {
        moves.push({r:jr,c:jc});
      } else {
        for (const [pdr,pdc] of (dc===0?[[0,-1],[0,1]]:[[-1,0],[1,0]])) {
          const pr=or+pdr, pc=oc+pdc;
          if (pr>=0&&pr<=8&&pc>=0&&pc<=8&&!wallBlocked(or,oc,pr,pc,hB,vB))
            moves.push({r:pr,c:pc});
        }
      }
    } else {
      moves.push({r:nr,c:nc});
    }
  }
  return moves;
}

function hasPath(pos, goalRow, hB, vB) {
  const vis=Array.from({length:9},()=>Array(9).fill(false));
  const q=[{r:pos.r,c:pos.c}];
  vis[pos.r][pos.c]=true;
  while (q.length) {
    const {r,c}=q.shift();
    if (r===goalRow) return true;
    for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>8||nc<0||nc>8||vis[nr][nc]) continue;
      if (wallBlocked(r,c,nr,nc,hB,vB)) continue;
      vis[nr][nc]=true; q.push({r:nr,c:nc});
    }
  }
  return false;
}

function canPlaceH(r,c,s) {
  if (s.wallsLeft[s.current]===0||r<0||r>7||c<0||c>7) return false;
  if (s.hWalls.some(w=>w.r===r&&Math.abs(w.c-c)<=1)) return false;
  if (s.vWalls.some(w=>w.r===r&&w.c===c)) return false;
  const {hB,vB}=buildBlocked([...s.hWalls,{r,c}],s.vWalls);
  return hasPath(s.pos[0],0,hB,vB)&&hasPath(s.pos[1],8,hB,vB);
}

function canPlaceV(r,c,s) {
  if (s.wallsLeft[s.current]===0||r<0||r>7||c<0||c>7) return false;
  if (s.vWalls.some(w=>w.c===c&&Math.abs(w.r-r)<=1)) return false;
  if (s.hWalls.some(w=>w.r===r&&w.c===c)) return false;
  const {hB,vB}=buildBlocked(s.hWalls,[...s.vWalls,{r,c}]);
  return hasPath(s.pos[0],0,hB,vB)&&hasPath(s.pos[1],8,hB,vB);
}

function computeValidMoves() {
  const {hB,vB}=buildBlocked(state.hWalls,state.vWalls);
  return getValidMoves(state.pos[state.current],state.pos[1-state.current],hB,vB);
}

// ── Render ────────────────────────────────────────────────
let _hoverAnchor = null; // {type:'h'|'v', r, c} currently previewed

function renderBoard() {
  const board = document.getElementById('quoridor-board');
  board.innerHTML = '';

  const isMyTurn = !mp.active || state.current === mp.myIdx;
  const moveSet  = new Set(state.validMoves.map(m=>m.r+','+m.c));

  // Build wall display sets (visual positions)
  const wallCells = new Set(); // visual (vr,vc) strings
  for (const {r,c} of state.hWalls) {
    wallCells.add(`h:${2*r+1},${2*c}`);
    wallCells.add(`x:${2*r+1},${2*c+1}`);
    wallCells.add(`h:${2*r+1},${2*c+2}`);
  }
  for (const {r,c} of state.vWalls) {
    wallCells.add(`v:${2*r},${2*c+1}`);
    wallCells.add(`x:${2*r+1},${2*c+1}`);
    wallCells.add(`v:${2*r+2},${2*c+1}`);
  }

  for (let vr=0; vr<17; vr++) {
    for (let vc=0; vc<17; vc++) {
      const el=document.createElement('div');
      el.dataset.vr=vr; el.dataset.vc=vc;

      if (vr%2===0 && vc%2===0) {
        // Game cell
        const gr=vr/2, gc=vc/2;
        el.className='qr-cell';
        if (gr===0) el.classList.add('goal-p1');
        if (gr===8) el.classList.add('goal-p0');

        if (state.pos[0].r===gr&&state.pos[0].c===gc) {
          const pawn=document.createElement('div');
          pawn.className='qr-pawn p0'+(isMyTurn&&state.current===0&&state.mode==='move'?' active-pawn':'');
          el.appendChild(pawn);
        }
        if (state.pos[1].r===gr&&state.pos[1].c===gc) {
          const pawn=document.createElement('div');
          pawn.className='qr-pawn p1'+(isMyTurn&&state.current===1&&state.mode==='move'?' active-pawn':'');
          el.appendChild(pawn);
        }

        if (moveSet.has(`${gr},${gc}`)&&state.winner===-1&&isMyTurn&&state.mode==='move') {
          el.classList.add('has-move');
          el.addEventListener('click', ()=>onMoveClick(gr,gc));
        }

      } else if (vr%2===1 && vc%2===0) {
        // Horizontal slot (between game rows)
        const wr=(vr-1)/2, wc=vc/2;
        el.className='qr-hslot';
        el.dataset.wr=wr; el.dataset.wc=wc;
        if (wallCells.has(`h:${vr},${vc}`)) el.classList.add('wall-h');

        if (state.mode==='wall-h'&&state.winner===-1&&isMyTurn&&state.wallsLeft[state.current]>0) {
          el.classList.add('w-active');
          el.addEventListener('mouseenter', onHSlotEnter);
          el.addEventListener('mouseleave', onSlotLeave);
          el.addEventListener('click', onHSlotClick);
        }

      } else if (vr%2===0 && vc%2===1) {
        // Vertical slot (between game cols)
        const wr=vr/2, wc=(vc-1)/2;
        el.className='qr-vslot';
        el.dataset.wr=wr; el.dataset.wc=wc;
        if (wallCells.has(`v:${vr},${vc}`)) el.classList.add('wall-v');

        if (state.mode==='wall-v'&&state.winner===-1&&isMyTurn&&state.wallsLeft[state.current]>0) {
          el.classList.add('w-active');
          el.addEventListener('mouseenter', onVSlotEnter);
          el.addEventListener('mouseleave', onSlotLeave);
          el.addEventListener('click', onVSlotClick);
        }

      } else {
        // Cross/intersection
        el.className='qr-cross';
        if (wallCells.has(`x:${vr},${vc}`)) el.classList.add('wall-hv');
      }

      board.appendChild(el);
    }
  }
}

// ── Wall preview ──────────────────────────────────────────
function getAnchorH(wr, wc) {
  // hslot at (wr, wc) where wr=wallRow 0-7, wc=col 0-8
  // wall extends right: anchor = min(wc, 7)
  return {r:wr, c:Math.min(wc,7)};
}

function getAnchorV(wr, wc) {
  // vslot at (wr, wc) where wr=row 0-8, wc=wallCol 0-7
  // wall extends down: anchor = {r: min(wr,7), c: wc}
  return {r:Math.min(wr,7), c:wc};
}

function applyPreview(type, r, c) {
  clearPreview();
  const valid = type==='h' ? canPlaceH(r,c,state) : canPlaceV(r,c,state);
  const cls   = valid ? 'w-preview' : 'w-bad';
  _hoverAnchor = {type,r,c,valid};

  const positions = type==='h'
    ? [[2*r+1,2*c],[2*r+1,2*c+1],[2*r+1,2*c+2]]
    : [[2*r,2*c+1],[2*r+1,2*c+1],[2*r+2,2*c+1]];

  for (const [vr,vc] of positions) {
    const el=document.querySelector(`[data-vr="${vr}"][data-vc="${vc}"]`);
    if (el) el.classList.add(cls);
  }
}

function clearPreview() {
  document.querySelectorAll('.w-preview,.w-bad').forEach(el=>{
    el.classList.remove('w-preview','w-bad');
  });
  _hoverAnchor=null;
}

function onHSlotEnter(e) {
  const wr=parseInt(e.target.dataset.wr), wc=parseInt(e.target.dataset.wc);
  const {r,c}=getAnchorH(wr,wc);
  applyPreview('h',r,c);
}
function onVSlotEnter(e) {
  const wr=parseInt(e.target.dataset.wr), wc=parseInt(e.target.dataset.wc);
  const {r,c}=getAnchorV(wr,wc);
  applyPreview('v',r,c);
}
function onSlotLeave() { clearPreview(); }

function onHSlotClick(e) {
  const wr=parseInt(e.target.dataset.wr), wc=parseInt(e.target.dataset.wc);
  const {r,c}=getAnchorH(wr,wc);
  if (!canPlaceH(r,c,state)) { shakeBoard(); return; }
  placeWall('h',r,c);
}
function onVSlotClick(e) {
  const wr=parseInt(e.target.dataset.wr), wc=parseInt(e.target.dataset.wc);
  const {r,c}=getAnchorV(wr,wc);
  if (!canPlaceV(r,c,state)) { shakeBoard(); return; }
  placeWall('v',r,c);
}

function shakeBoard() {
  const b=document.getElementById('quoridor-board');
  b.style.animation='none';
  b.offsetHeight;
  b.style.animation='shake .3s ease';
  setTimeout(()=>b.style.animation='',350);
}

// ── Move click ────────────────────────────────────────────
function onMoveClick(r,c) {
  if (state.winner!==-1) return;
  if (mp.active&&state.current!==mp.myIdx) return;
  if (!state.validMoves.some(m=>m.r===r&&m.c===c)) return;

  state.pos[state.current]={r,c};
  playMove();

  const winner=checkWinner();
  if (winner!==-1) {
    state.winner=winner;
    state.validMoves=[];
    if (mp.active) syncToFirebase();
    renderBoard(); updateHUD();
    setTimeout(()=>showWinScreen(),700);
    return;
  }

  state.current=1-state.current;
  state.mode='move';
  state.validMoves=computeValidMoves();
  if (mp.active) syncToFirebase();
  renderBoard(); updateHUD(); updateTurnMsg();
}

function placeWall(type,r,c) {
  if (type==='h') state.hWalls.push({r,c});
  else state.vWalls.push({r,c});
  state.wallsLeft[state.current]--;
  playWall();

  state.current=1-state.current;
  state.mode='move';
  state.validMoves=computeValidMoves();
  if (mp.active) syncToFirebase();
  renderBoard(); updateHUD(); updateTurnMsg();
}

// ── Win check ─────────────────────────────────────────────
function checkWinner() {
  if (state.pos[0].r===0) return 0;
  if (state.pos[1].r===8) return 1;
  return -1;
}

// ── HUD ───────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('turn-label').textContent=`${state.players[state.current]}'s Turn`;
  const dot=document.getElementById('turn-dot');
  if (dot) dot.className='turn-dot p'+state.current;

  // Wall pips
  [0,1].forEach(p=>{
    const pip=document.getElementById(`wall-pips-${p}`);
    if (!pip) return;
    pip.innerHTML='';
    for (let i=0;i<10;i++){
      const d=document.createElement('span');
      d.className='wall-pip'+(i>=state.wallsLeft[p]?' used':'');
      pip.appendChild(d);
    }
  });

  // Mode buttons
  ['move','wall-h','wall-v'].forEach(m=>{
    const btn=document.getElementById('mode-'+m);
    if (btn) btn.classList.toggle('active', state.mode===m);
  });

  // Disable wall buttons if 0 walls or not my turn
  const isMyTurn=!mp.active||state.current===mp.myIdx;
  const hasWalls=state.wallsLeft[state.current]>0;
  ['wall-h','wall-v'].forEach(m=>{
    const btn=document.getElementById('mode-'+m);
    if (btn) btn.disabled=!isMyTurn||!hasWalls||state.winner!==-1;
  });
  const moveBtn=document.getElementById('mode-move');
  if (moveBtn) moveBtn.disabled=!isMyTurn||state.winner!==-1;
}

function setMsg(text,cls) {
  const bar=document.getElementById('message-bar');
  bar.className='msg-bar'+(cls?' '+cls:'');
  bar.textContent=text;
}

function updateTurnMsg() {
  if (mp.active) {
    setMsg(state.current===mp.myIdx?'Your turn — move or place a wall':`Waiting for ${state.players[state.current]}…`);
  } else {
    setMsg(`${state.players[state.current]}'s turn — move or place a wall`);
  }
}

function setOnlineMsg(text,err) {
  const el=document.getElementById('online-msg');
  el.textContent=text;
  el.className='online-msg'+(err?' error':'');
}

// ── Mode buttons ──────────────────────────────────────────
function setMode(m) {
  const isMyTurn=!mp.active||state.current===mp.myIdx;
  if (!isMyTurn||state.winner!==-1) return;
  if ((m==='wall-h'||m==='wall-v')&&state.wallsLeft[state.current]===0) return;
  state.mode=m;
  clearPreview();
  renderBoard(); updateHUD();
}

// ── Sound engine ──────────────────────────────────────────
function _ctx() { return audioCtx(); }

function playMove() {
  if (isMuted()) return;
  try {
    const ctx=_ctx(), osc=ctx.createOscillator(), g=ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type='sine'; osc.frequency.setValueAtTime(380,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(280,ctx.currentTime+0.07);
    g.gain.setValueAtTime(0.18,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.1);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.1);
  } catch(_){}
}

function playWall() {
  if (isMuted()) return;
  try {
    const ctx=_ctx(), now=ctx.currentTime;
    [220,180].forEach((f,i)=>{
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type='square'; const t=now+i*0.05;
      osc.frequency.setValueAtTime(f,t);
      g.gain.setValueAtTime(0.09,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.12);
      osc.start(t); osc.stop(t+0.12);
    });
  } catch(_){}
}

function playChime() {
  if (isMuted()) return;
  try {
    const ctx=_ctx(), now=ctx.currentTime;
    [523.25,659.25,783.99].forEach((f,i)=>{
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type='sine'; const t=now+i*0.12;
      osc.frequency.setValueAtTime(f,t);
      g.gain.setValueAtTime(0.0001,t);
      g.gain.linearRampToValueAtTime(0.18,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.35);
      osc.start(t); osc.stop(t+0.35);
    });
  } catch(_){}
}

function playYourTurn() {
  if (isMuted()) return;
  try {
    const ctx=_ctx(), now=ctx.currentTime;
    [500,750].forEach((f,i)=>{
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type='sine'; const t=now+i*0.11;
      osc.frequency.setValueAtTime(f,t);
      g.gain.setValueAtTime(0.0001,t);
      g.gain.linearRampToValueAtTime(0.16,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.28);
      osc.start(t); osc.stop(t+0.28);
    });
  } catch(_){}
}

// ── Win screen ────────────────────────────────────────────
function showWinScreen() {
  const w=state.winner;
  const wrap=document.getElementById('win-pawn-wrap');
  wrap.innerHTML='';
  const pawn=document.createElement('div');
  pawn.className=`win-pawn p${w}`;
  wrap.appendChild(pawn);
  document.getElementById('win-label').textContent='Winner';
  document.getElementById('win-name').textContent=state.players[w];
  document.getElementById('win-sub').textContent=
    `Reached the other side first — ${state.wallsLeft[w]} wall${state.wallsLeft[w]!==1?'s':''} remaining`;
  window._lvsWinPlayers={names:state.players.slice(),winner:w};
  launchConfetti();
  showScreen('win');
}

// ── Local game flow ───────────────────────────────────────
function startGame() {
  const p1=document.getElementById('p1-name').value.trim()||'Player 1';
  const p2=document.getElementById('p2-name').value.trim()||'Player 2';
  lvsSaveNames(p1,p2);
  initState([p1,p2]);
  document.getElementById('name-0').textContent=p1;
  document.getElementById('name-1').textContent=p2;
  document.getElementById('my-color-badge').style.display='none';
  document.getElementById('restart-btn').style.display='';
  renderBoard(); updateHUD(); showScreen('game'); updateTurnMsg();
}

function initState(players) {
  state.pos=[{r:8,c:4},{r:0,c:4}];
  state.wallsLeft=[10,10];
  state.hWalls=[];
  state.vWalls=[];
  state.current=0;
  state.winner=-1;
  state.mode='move';
  state.players=players||state.players;
  state.validMoves=computeValidMoves();
}

function resetGame() {
  initState(state.players);
  renderBoard(); updateHUD(); showScreen('game'); updateTurnMsg();
}

function handleRestart() {
  if (mp.active) { backToLobby(); return; }
  resetGame();
}

function playAgain() {
  if (mp.active) {
    lvsReadyUp(document.getElementById('win-again-btn'));
    return;
  }
  resetGame();
}

function backToLobby() {
  lvsOnlineStop();
  if (mp.ref) {
    mp.ref.off();
    if (state.winner===-1) mp.ref.update({status:'done'}).catch(()=>{});
  }
  mp.active=false; mp.started=false; mp.ref=null; mp.code=null;
  localStorage.removeItem('lvs_qr_room');
  localStorage.removeItem('lvs_qr_role');
  state.winner=-1; state.validMoves=[];
  document.getElementById('my-color-badge').style.display='none';
  showScreen('lobby');
}

// ── Firebase sync ─────────────────────────────────────────
function encodeWalls(walls) {
  return walls.map(w=>w.r*9+w.c);
}
function decodeWalls(arr) {
  return (arr||[]).map(n=>({r:Math.floor(n/9),c:n%9}));
}

function syncToFirebase() {
  if (!mp.active||!mp.ref) return;
  mp.ref.update({
    p0r:state.pos[0].r, p0c:state.pos[0].c,
    p1r:state.pos[1].r, p1c:state.pos[1].c,
    wl0:state.wallsLeft[0], wl1:state.wallsLeft[1],
    hWalls:encodeWalls(state.hWalls),
    vWalls:encodeWalls(state.vWalls),
    current:state.current,
    winner:state.winner,
  });
}

function applyRemoteData(d) {
  state.pos=[{r:d.p0r??8,c:d.p0c??4},{r:d.p1r??0,c:d.p1c??4}];
  state.wallsLeft=[d.wl0!=null?d.wl0:10, d.wl1!=null?d.wl1:10];
  state.hWalls=decodeWalls(d.hWalls);
  state.vWalls=decodeWalls(d.vWalls);
  state.current=d.current??0;
  state.winner=d.winner!=null?Number(d.winner):-1;
  state.mode='move';
  state.validMoves=state.winner===-1?computeValidMoves():[];
}

// ── Online flow ───────────────────────────────────────────
function createRoom() {
  const name=document.getElementById('online-name').value.trim()||'Player';
  lvsSaveNames(name,null);
  const code=randomCode();
  const hostIdx=Math.floor(Math.random()*2);
  const ref=db.ref('quoridor-rooms/'+code);

  mp.active=true; mp.started=false; mp.role='host';
  mp.myIdx=hostIdx; mp.ref=ref; mp.code=code;

  ref.set({
    host:name, guest:null, status:'waiting', hostIdx,
    p0r:8,p0c:4,p1r:0,p1c:4,
    wl0:10,wl1:10,
    hWalls:[], vWalls:[],
    current:0, winner:-1,
    ready0:false, ready1:false,
  });

  localStorage.setItem('lvs_qr_room',code);
  localStorage.setItem('lvs_qr_role','host');

  document.getElementById('waiting-code').textContent=code;
  document.getElementById('copy-btn').textContent='Copy Link';
  showScreen('waiting');

  ref.on('value',snap=>{
    const d=snap.val();
    if (!d||d.status!=='playing') return;
    if (!mp.started) { mp.started=true; playChime(); startOnlineGame(d); }
  });
}

function joinRoom() {
  const name=document.getElementById('online-name').value.trim()||'Player';
  lvsSaveNames(name,null);
  const code=document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length<4) { setOnlineMsg('Enter a 4-letter room code',true); return; }
  setOnlineMsg('Joining…',false);
  const ref=db.ref('quoridor-rooms/'+code);
  ref.once('value',snap=>{
    const d=snap.val();
    if (!d||d.status!=='waiting') { setOnlineMsg('Room not found — double-check the code',true); return; }
    mp.active=true; mp.started=true; mp.role='guest';
    mp.myIdx=1-d.hostIdx; mp.ref=ref; mp.code=code;
    ref.update({guest:name,status:'playing'});
    localStorage.setItem('lvs_qr_room',code);
    localStorage.setItem('lvs_qr_role','guest');
    playChime();
    startOnlineGame({...d,guest:name});
  });
}

function startOnlineGame(d) {
  const players=['',''];
  players[d.hostIdx]=d.host;
  players[1-d.hostIdx]=d.guest||'…';

  applyRemoteData(d);
  state.players=players;

  document.getElementById('name-0').textContent=players[0];
  document.getElementById('name-1').textContent=players[1];

  const badge=document.getElementById('my-color-badge');
  badge.textContent=mp.myIdx===0?'You: Orange':'You: Dark';
  badge.className='my-badge p'+mp.myIdx;
  badge.style.display='flex';
  document.getElementById('restart-btn').style.display='none';

  renderBoard(); updateHUD(); showScreen('game'); updateTurnMsg();
  lvsOnlineStart(mp.ref,mp.myIdx,backToLobby);

  mp.ref.off();
  mp.ref.on('value',snap=>{
    const d2=snap.val();
    if (!d2||d2.status!=='playing') return;
    lvsOnlineUpdate(d2);
    handleOnlineUpdate(d2);
  });
}

function handleOnlineUpdate(d) {
  const prevCurrent=state.current;
  const prevWinner=state.winner;

  const players=['',''];
  players[d.hostIdx]=d.host;
  players[1-d.hostIdx]=d.guest||'…';
  state.players=players;

  applyRemoteData(d);
  state.players=players;

  if (state.winner===-1&&state.current===mp.myIdx&&prevCurrent!==mp.myIdx) playYourTurn();

  document.getElementById('name-0').textContent=players[0];
  document.getElementById('name-1').textContent=players[1];

  renderBoard(); updateHUD();

  if (state.winner!==-1) { setTimeout(()=>showWinScreen(),700); return; }

  if (prevWinner!==-1&&document.getElementById('screen-win').classList.contains('active')) {
    const btn=document.getElementById('win-again-btn');
    if (btn) { btn.disabled=false; btn.textContent='Play Again'; }
    showScreen('game');
  }

  if (lvsReadyBoth(d)&&mp.role==='host') {
    mp.ref.update({
      p0r:8,p0c:4,p1r:0,p1c:4,wl0:10,wl1:10,
      hWalls:[],vWalls:[],current:0,winner:-1,
      status:'playing',ready0:false,ready1:false,
    });
  }
  lvsReadyUI(d,document.getElementById('win-again-btn'));
  updateTurnMsg();
}

function copyCode() { lvsCopyLink(mp.code,document.getElementById('copy-btn'),'Copy Link'); }

// ── Reconnect on refresh ──────────────────────────────────
(function tryReconnect() {
  const code=localStorage.getItem('lvs_qr_room');
  const role=localStorage.getItem('lvs_qr_role');
  if (!code||!role) return;
  db.ref('quoridor-rooms/'+code).once('value',snap=>{
    const d=snap.val();
    if (!d||d.status!=='playing') {
      localStorage.removeItem('lvs_qr_room');
      localStorage.removeItem('lvs_qr_role');
      return;
    }
    mp.active=true; mp.started=true; mp.role=role;
    mp.myIdx=role==='host'?d.hostIdx:1-d.hostIdx;
    mp.ref=db.ref('quoridor-rooms/'+code);
    mp.code=code;
    startOnlineGame(d);
  });
})();

// ── Shake keyframe injection ──────────────────────────────
(function injectShake() {
  const s=document.createElement('style');
  s.textContent='@keyframes shake{0%,100%{transform:none}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}';
  document.head.appendChild(s);
})();
