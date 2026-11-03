// ===== 탈출맵 진입 화면 + 타일 편집기 (DOM 전용; 코어는 js/escape.js) =====
// 캐릭터 2종과 전투 타입(A/B)은 첫 화면에서 고른 값을 그대로 씀 (window.escapeSel, main.js)
(function () {
  if (typeof document === 'undefined') return;
  const $ = s => document.querySelector(s), LS = 'psEscapeMaps', LAST = 'psEscapeLast', T = ESCAPE.TILE;
  let map = null, tool = 'wall', paint = null, sc = 1, search = null, draft = null, shape = null, brush = 1, lock = false, hover = null; // draft: 그리는 중인 움직이는 벽 경로 [[c,r]..], shape: 그리는 중인 벽 모양 (절대 칸 [[c,r]..])
  try { const s = localStorage.getItem(LAST); if (s) map = ESCAPE.normalize(s); } catch (e) { map = null; }
  if (!map) map = ESCAPE.sampleMap();
  try { const c = localStorage.getItem('psEscCam'); if (c) window.ESC_CAM = c; } catch (e) {}

  const css = document.createElement('style'); css.textContent = `
#escape{position:absolute;inset:0;z-index:30;background:rgba(22,24,36,.97);padding:8px 10px;display:flex;flex-direction:column;gap:5px;overflow-y:auto;color:#c9cee0;font-size:11px}
#escape.hidden{display:none}
#escape h1{font-size:16px;color:#ffe27a;margin:0;display:flex;justify-content:space-between;align-items:center}
#escape .row{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
#escape button,#escCam{height:24px;padding:0 7px;border-radius:5px;font-size:11px;background:#2e3346;color:#c9cee0;box-shadow:0 2px 0 #14151f;border:0;cursor:pointer}
#escape button.on{background:#ffcf4a;color:#2a2010}
#escape button.go{background:#3bbf7a;color:#08200f;font-weight:bold}
#escape select,#escape input{height:22px;font-size:11px;background:#262a3c;color:#e0e4f0;border:1px solid #3a4058;border-radius:4px}
#escape input[type=number]{width:52px}
#escCv{background:#111;align-self:center;touch-action:none;border:1px solid #3a4058;cursor:crosshair}
#escMsg{min-height:30px;white-space:pre-wrap;color:#ffe08a;font-size:10px;line-height:1.35}
#escCam{position:absolute;right:6px;bottom:84px;z-index:7;display:none}
#escNotice{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);z-index:60;max-width:300px;padding:12px 14px;border-radius:8px;background:rgba(30,26,44,.97);border:2px solid #ffcf4a;color:#ffe9a8;font-size:13px;line-height:1.45;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.6);pointer-events:none}
#escNotice.hidden{display:none}
#escOpt{min-height:24px;overflow-anchor:none}
#escape{overflow-anchor:none}
#escOpt .o{display:none;gap:4px;align-items:center}
#escOpt .o.on{display:flex}
#escape button.sm{padding:0 5px}
#escape button.dir{min-width:30px;font-size:14px}
#escLock.on{background:#ff8a4a;color:#2a1408}
/* 터치 화면·좁은 폭: 편집기 버튼을 손가락 크기로 (높이 36px, 도구 버튼 40px) */
@media (pointer: coarse), (max-width: 480px) {
 #escape button, #escape select, #escCam { height: 36px; font-size: 12px; }
 #escape input { height: 32px; font-size: 13px; }
 #escape .row { gap: 6px; }
 #escTools button, #escTools2 button, #escBrushRow button, #escOpt button { height: 40px; min-width: 40px; }
 #escape button.dir { min-width: 44px; font-size: 18px; }
}`;
  document.head.appendChild(css);

  const P = document.createElement('div'); P.id = 'escape'; P.className = 'hidden';
  P.innerHTML = `
<h1>🚪 탈출맵 편집기 <button id="escClose" type="button">메인으로</button></h1>
<div class="row">이름 <input id="escName" style="width:120px"> 크기 <select id="escSize">${ESCAPE.SIZES.map(s => `<option value="${s[0]}x${s[1]}">${s[0]}×${s[1]} (${s[0] / T}×${s[1] / T}칸)</option>`).join('')}</select></div>
<div class="row" id="escTools"><button data-t="wall">■ 벽 칠하기</button><button data-t="erase">□ 지우개</button><button data-t="s0">P1 시작</button><button data-t="s1">P2 시작</button><button data-t="exit">🚪 출구</button>
 <select id="escExitSz" title="출구 크기(칸)"><option value="1x1">출구 1×1</option><option value="2x2">출구 2×2</option><option value="3x2">출구 3×2</option><option value="4x3">출구 4×3</option></select><button id="escClear" type="button">전부 비우기</button><button id="escSample" type="button">샘플</button></div>
<div class="row" id="escTools2"><button data-t="water">💧 물</button><button data-t="oneway">⇧ 일방통행</button><button data-t="brk">🧱 파괴벽</button><button data-t="mvpath">① 움직일 경로</button><button data-t="mvwall">② 움직이는 벽</button></div>
<div class="row" id="escBrushRow">브러시 <button type="button" data-b="1">1×1</button><button type="button" data-b="2">2×2</button><button type="button" data-b="3">3×3</button><button type="button" data-b="5">5×5</button> <button id="escLock" type="button" title="잠금 (L): 켜면 빈 칸에만 칠함">🔓 잠금 꺼짐</button></div>
<div class="row" id="escOpt">
 <span class="o" data-for="oneway">방향 <select id="escDir" hidden><option value="^">↑ 위</option><option value="v">↓ 아래</option><option value="<">← 왼쪽</option><option value=">">→ 오른쪽</option></select><button type="button" class="dir" data-d="^">↑</button><button type="button" class="dir" data-d="v">↓</button><button type="button" class="dir" data-d="<">←</button><button type="button" class="dir" data-d=">">→</button> <span style="color:#8a90a8">키보드 방향키·WASD</span></span>
 <span class="o" data-for="brk"><select id="escBrkM"><option value="hits">부딪힌 횟수</option><option value="hp">내구도(체력)</option></select><input type="number" id="escBrkN" min="1" max="9999" value="3"><button id="escBrk1" class="sm" type="button">즉시 파괴(1회)</button></span>
 <span class="o" data-for="water">물: 느려짐(×${ESCAPE.WATER.spd}) · 산소 ${ESCAPE.WATER.o2}초 뒤 익사 피해 (피해 0이어도 적용)</span>
 <span class="o" data-for="mvpath">칸을 끌어 경로를 그리세요 (되돌아가면 지워짐) <button id="escMvNew" class="sm" type="button">새 경로</button></span>
 <span class="o" data-for="mvwall"><button id="escMvDone" class="go sm" type="button">✔ 벽 완성</button><button id="escMvShClr" class="sm" type="button">모양 지우기</button> 속도 <input type="number" id="escMvSpd" min="20" max="400" value="80"> <select id="escMvMode"><option value="pingpong">왕복</option><option value="loop">순환</option></select></span>
</div>
<canvas id="escCv"></canvas>
<div class="row">캐릭터 <span id="escChars" style="color:#e0e4f0"></span> <span style="color:#8a90a8">(첫 화면에서 고른 캐릭터·타입)</span></div>
<div class="row">승리 <select id="escGoal"><option value="race">먼저 도착한 쪽</option><option value="coop">둘 다 도착(협동)</option></select>
 <label><input type="checkbox" id="escNoDmg">서로 피해 0</label><label><input type="checkbox" id="escNoAtk">공격 불가</label></div>
<div class="row">속도 <select id="escSpd"><option>0.5</option><option>0.75</option><option selected>1</option><option>1.5</option><option>2</option></select>
 제한 <input type="number" id="escTime" min="10" max="${ESCAPE.MAX_TIME}">초 시드 <input type="number" id="escSeed" style="width:86px"></div>
<div class="row">카메라 <select id="escCamSel"><option value="fit">두 캐릭터 맞춤</option><option value="p0">P1 따라가기</option><option value="p1">P2 따라가기</option></select></div>
<div class="row"><button id="escCheck" type="button">✔ 클리어 검사</button><button id="escSeedFind" type="button">🎲 시드 탐색(20개)</button><button id="escRun" class="go" type="button">▶ 탈출 실행</button></div>
<div class="row"><button id="escSave" type="button">💾 저장</button><select id="escList"></select><button id="escLoad" type="button">불러오기</button><button id="escDel" type="button">삭제</button><button id="escExp" type="button">⬇ 내보내기</button><button id="escImp" type="button">⬆ 가져오기</button><input id="escFile" type="file" accept=".json,.psescape,application/json" hidden></div>
<div id="escMsg"></div><div id="escPv" class="hidden" style="display:none;gap:6px;align-items:center"><canvas id="escPvCv" width="256" height="192" style="width:128px;height:96px;border-radius:4px;border:1px solid #4a5170"></canvas><div id="escPvCap" style="font-size:10px;color:#a9afc6;line-height:1.35"></div></div>`;
  $('#stage').appendChild(P);
  const N = document.createElement('div'); N.id = 'escNotice'; N.className = 'hidden'; $('#stage').appendChild(N);
  // 안내는 클릭을 가로채지 않음 (pointer-events:none), 3.2초 뒤 자동으로 사라짐
  const notice = t => { N.textContent = t; N.classList.remove('hidden'); clearTimeout(notice.t); notice.t = setTimeout(() => N.classList.add('hidden'), 3200); };
  const NEED = '먼저 첫 화면에서 캐릭터(P1·P2)를 선택해 주세요';
  const sel = () => (window.escapeSel ? window.escapeSel() : { chars: null, names: [], mode: 'A' });

  const camBtn = document.createElement('button'); camBtn.id = 'escCam'; camBtn.type = 'button'; $('#stage').appendChild(camBtn);
  const CAMN = { fit: '🎥 맞춤', p0: '🎥 P1', p1: '🎥 P2' };
  const setCam = c => { window.ESC_CAM = c; try { localStorage.setItem('psEscCam', c); } catch (e) {} camBtn.textContent = CAMN[c]; $('#escCamSel').value = c; };
  camBtn.onclick = () => setCam({ fit: 'p0', p0: 'p1', p1: 'fit' }[window.ESC_CAM || 'fit']);
  setInterval(() => { const b = window.__battle; camBtn.style.display = b && b.escape && !$('#hud').classList.contains('hidden') ? 'block' : 'none'; }, 250);

  const ent = document.createElement('button'); ent.id = 'escEnter'; ent.className = 'rpload'; ent.type = 'button'; ent.textContent = '🚪 탈출맵 (편집·실행)';
  $('#rpLoad').after(ent);
  ent.onclick = () => { if (!sel().chars) return notice(NEED); open(); };

  const cv = $('#escCv'), cx = cv.getContext('2d');
  // 안내 문구: 버튼으로 시작한 결과(검사·시드 탐색 등)만 문구 쪽으로 스크롤. 캔버스를 칠하는 중(onCv)에는 스크롤하지 않고, 문구가 화면 밖이면 잠깐 뜨는 알림으로 보여줌
  let onCv = false; const quiet = f => () => { onCv = true; try { f(); } finally { onCv = false; } }; // 편집 도구 버튼(벽 완성 등)도 스크롤하지 않음
  const msg = t => { const e = $('#escMsg'); e.textContent = t;
    if (!onCv) { if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); return; }
    const a = e.getBoundingClientRect(), b = P.getBoundingClientRect(); if (a.top < b.top || a.bottom > b.bottom) notice(t); };
  const cols = () => map.grid[0].length, rows = () => map.grid.length;
  const isWall = (c, r) => map.grid[r] && map.grid[r][c] === '#';
  const brkAt = (c, r) => (map.breakables || []).findIndex(k => k.c === c && k.r === r);
  const delBrk = (c, r) => { const i = brkAt(c, r); if (i >= 0) map.breakables.splice(i, 1); if (map.breakables && !map.breakables.length) delete map.breakables; };
  const setCh = (c, r, ch) => { if (c < 0 || r < 0 || r >= rows() || c >= cols()) return; const s = map.grid[r]; if (s[c] !== ch) map.grid[r] = s.slice(0, c) + ch + s.slice(c + 1); };
  const setTile = (c, r, v) => { setCh(c, r, v ? '#' : '.'); if (v) delBrk(c, r); };
  const mvRects = mv => { const p = ESCAPE.moverPos(mv, 0); return ESCAPE.moverRects(mv).map(q => ({ x: p.x + q.dx * T, y: p.y + q.dy * T, w: q.w * T, h: q.h * T })); }; // 처음 위치 (구형식 w×h 는 1개, 직접 그린 모양은 병합한 여러 개)
  const inRect = (R, x, y) => x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h;
  const inMover = (mv, x, y) => mvRects(mv).some(R => inRect(R, x, y));
  const shIdx = (c, r) => (shape || []).findIndex(q => q[0] === c && q[1] === r);
  function eraseAt(c, r) { // 지우개: 칸(벽·물·일방통행), 파괴벽, 그 칸을 지나는 움직이는 벽(경로째). 그리는 중인 벽 모양 칸이면 그 칸만 모양에서 뺌
    const si = shIdx(c, r); if (si >= 0) { shape.splice(si, 1); if (!shape.length) shape = null; return; }
    setCh(c, r, '.'); delBrk(c, r); const x = c * T + T / 2, y = r * T + T / 2;
    if (map.movers) { map.movers = map.movers.filter(mv => !mv.path.some(p => p[0] === c && p[1] === r) && !inMover(mv, x, y)); if (!map.movers.length) delete map.movers; }
    if (draft && draft.some(p => p[0] === c && p[1] === r)) draft = null;
  }
  // 잠금: 비어 있지 않은 칸 = 벽·물·일방통행(grid ≠ '.'), 파괴벽, 움직이는 벽의 경로 칸과 처음 위치 칸
  function occupied(c, r) {
    if (map.grid[r][c] !== '.' || brkAt(c, r) >= 0) return true; const x = c * T + T / 2, y = r * T + T / 2;
    return (map.movers || []).some(mv => mv.path.some(p => p[0] === c && p[1] === r) || inMover(mv, x, y));
  }
  // 브러시: n×n 칸, 왼쪽 위 = (c - ⌊(n-1)/2⌋, r - ⌊(n-1)/2⌋) → 홀수는 누른 칸이 가운데, 짝수(2)는 누른 칸이 왼쪽 위. 맵 밖 칸은 무시
  const BRUSH_TOOLS = ['wall', 'erase', 'water', 'oneway', 'brk'], SIZE_TOOLS = [...BRUSH_TOOLS, 'mvwall']; // 잠금은 BRUSH_TOOLS 만, 브러시 크기는 움직이는 벽 모양에도
  function brushCells(c, r) { const n = SIZE_TOOLS.includes(tool) ? brush : 1, o = Math.floor((n - 1) / 2), out = []; for (let y = r - o; y < r - o + n; y++) for (let x = c - o; x < c - o + n; x++) if (x >= 0 && y >= 0 && x < cols() && y < rows()) out.push([x, y]); return out; }
  function setBrush(n) { brush = n; document.querySelectorAll('#escBrushRow [data-b]').forEach(b => b.classList.toggle('on', +b.dataset.b === n)); }
  function setLock(v) { lock = v; const b = $('#escLock'); b.classList.toggle('on', v); b.textContent = v ? '🔒 잠금 켜짐' : '🔓 잠금 꺼짐'; }
  function setDir(d) { $('#escDir').value = d; document.querySelectorAll('#escOpt [data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === d)); }
  function pathAdd(c, r) { // 상하좌우로만 이어 붙임 (대각선은 가로→세로로 채움), 바로 전 칸으로 되돌아가면 마지막 칸 지움
    if (!draft) draft = [];
    const step = (cc, rr) => { const L = draft[draft.length - 1], P = draft[draft.length - 2]; if (L && L[0] === cc && L[1] === rr) return; if (P && P[0] === cc && P[1] === rr) { draft.pop(); return; } if (draft.length >= ESCAPE.LIM.path) return; draft.push([cc, rr]); };
    const L = draft[draft.length - 1]; if (!L) return step(c, r);
    let [cc, rr] = L; while (cc !== c) { cc += Math.sign(c - cc); step(cc, rr); } while (rr !== r) { rr += Math.sign(r - rr); step(cc, rr); }
  }
  function resize() { sc = Math.min(336 / map.w, 300 / map.h); cv.width = Math.round(map.w * sc); cv.height = Math.round(map.h * sc); }
  function charsTxt() { const s = sel(); return s.chars ? `P1 ${s.names[0]} · P2 ${s.names[1]} · ${s.mode}타입` : '⚠ 미선택'; }
  function toUI() {
    $('#escName').value = map.name; $('#escSize').value = map.w + 'x' + map.h; $('#escChars').textContent = charsTxt();
    $('#escGoal').value = map.rules.goal; $('#escNoDmg').checked = map.rules.noDamage; $('#escNoAtk').checked = map.rules.noAttack;
    $('#escSpd').value = String(map.rules.speedMul); $('#escTime').value = map.timeLimit; $('#escSeed').value = map.seed;
    const ez = (map.exit.w / T) + 'x' + (map.exit.h / T); if ([...$('#escExitSz').options].some(o => o.value === ez)) $('#escExitSz').value = ez;
    resize(); draw(); list();
  }
  function fromUI() { // 편집 상태 → 정규화된 맵 (캐릭터·타입은 첫 화면 선택값을 기록)
    map.name = $('#escName').value || '이름 없는 탈출맵';
    map.rules = { goal: $('#escGoal').value, noDamage: $('#escNoDmg').checked, noAttack: $('#escNoAtk').checked, speedMul: +$('#escSpd').value, type: sel().mode };
    const s = sel(); if (s.chars) map.chars = s.chars.slice();
    map.timeLimit = +$('#escTime').value || ESCAPE.DEF_TIME; map.seed = (+$('#escSeed').value) >>> 0;
    map = ESCAPE.normalize(map); try { localStorage.setItem(LAST, JSON.stringify(map)); } catch (e) {}
    return map;
  }
  P.addEventListener('change', e => {
    const id = e.target.id; if (id === 'escCamSel') return setCam(e.target.value); if (id === 'escList' || id === 'escFile') return;
    if (id === 'escSize') { const [w, h] = e.target.value.split('x').map(Number); map.w = w; map.h = h; map = ESCAPE.normalize(map); resize(); } // 격자는 잘리거나 빈칸으로 늘어남
    if (id === 'escExitSz') { const [a, c] = e.target.value.split('x').map(Number); map.exit.w = a * T; map.exit.h = c * T; }
    fromUI(); draw();
  });
  function draw() {
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#2b2f3f'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.setTransform(sc, 0, 0, sc, 0, 0);
    map.grid.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] !== '.' && row[c] !== '#') ESCAPE.drawSpecial(cx, c * T, r * T, row[c], 0); });
    cx.fillStyle = '#5d6279'; for (const w of map.walls) cx.fillRect(w.x, w.y, w.w, w.h);
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = 'bold 16px sans-serif';
    for (const k of map.breakables || []) { cx.fillStyle = '#7a5a3e'; cx.fillRect(k.c * T + 1, k.r * T + 1, T - 2, T - 2); cx.fillStyle = '#ffe2b8'; cx.fillText(k.m === 'hp' ? 'HP' + k.n : '×' + k.n, k.c * T + T / 2, k.r * T + T / 2 + 1); }
    const drawPath = (P, col) => { if (!P || !P.length) return; cx.strokeStyle = col; cx.lineWidth = 3; cx.setLineDash([8, 6]); cx.beginPath(); P.forEach((p, i) => { const x = p[0] * T + T / 2, y = p[1] * T + T / 2; i ? cx.lineTo(x, y) : cx.moveTo(x, y); }); cx.stroke(); cx.setLineDash([]); cx.fillStyle = col; for (const p of P) { cx.beginPath(); cx.arc(p[0] * T + T / 2, p[1] * T + T / 2, 4, 0, Math.PI * 2); cx.fill(); } };
    for (const mv of map.movers || []) { drawPath(mv.path, 'rgba(255,196,40,.75)'); const Rs = mvRects(mv); for (const R of Rs) { cx.fillStyle = 'rgba(255,196,40,.55)'; cx.fillRect(R.x, R.y, R.w, R.h); cx.strokeStyle = '#ffc428'; cx.lineWidth = 3; cx.strokeRect(R.x + 1.5, R.y + 1.5, R.w - 3, R.h - 3); } const R = Rs[0]; cx.fillStyle = '#2a2010'; cx.fillText(mv.mode === 'loop' ? '⟳' : '⇄', R.x + R.w / 2, R.y + R.h / 2 + 1); }
    drawPath(draft, 'rgba(120,255,255,.9)');
    if (draft && draft.length) { const a = draft[0], z = draft[draft.length - 1]; // 기준 칸(경로 시작) ◎ + 그리는 모양 + 경로 끝에 도착했을 때 모양(점선)
      if (shape) { cx.fillStyle = 'rgba(120,255,255,.45)'; for (const [c, r] of shape) cx.fillRect(c * T + 1, r * T + 1, T - 2, T - 2);
        if (draft.length >= 2) { cx.strokeStyle = 'rgba(120,255,255,.8)'; cx.lineWidth = 2 / sc; cx.setLineDash([5 / sc, 4 / sc]); for (const [c, r] of shape) cx.strokeRect((c + z[0] - a[0]) * T + 2, (r + z[1] - a[1]) * T + 2, T - 4, T - 4); cx.setLineDash([]); } }
      cx.strokeStyle = '#fff'; cx.lineWidth = 3; cx.beginPath(); cx.arc(a[0] * T + T / 2, a[1] * T + T / 2, T * 0.32, 0, Math.PI * 2); cx.stroke(); }
    else if (shape) { cx.fillStyle = 'rgba(120,255,255,.45)'; for (const [c, r] of shape) cx.fillRect(c * T + 1, r * T + 1, T - 2, T - 2); }
    if (hover && SIZE_TOOLS.includes(tool)) { const C = brushCells(hover[0], hover[1]); if (C.length) { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const [x, y] of C) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      cx.fillStyle = tool === 'erase' ? 'rgba(255,90,90,.18)' : 'rgba(255,255,255,.14)'; cx.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T); cx.strokeStyle = tool === 'erase' ? '#ff7a7a' : (lock ? '#ff8a4a' : '#ffe27a'); cx.lineWidth = 2 / sc; cx.strokeRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T); } }
    cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.strokeStyle = 'rgba(255,255,255,0.07)'; cx.lineWidth = 1 / sc; cx.beginPath();
    for (let x = 0; x <= map.w; x += T) { cx.moveTo(x, 0); cx.lineTo(x, map.h); } for (let y = 0; y <= map.h; y += T) { cx.moveTo(0, y); cx.lineTo(map.w, y); } cx.stroke();
    cx.strokeStyle = 'rgba(255,220,120,0.25)'; cx.strokeRect(0, 0, 360, 640); // 기존 화면 1장 크기 참고
    const X = map.exit; cx.fillStyle = 'rgba(60,220,140,.45)'; cx.fillRect(X.x, X.y, X.w, X.h); cx.strokeStyle = '#7dffb0'; cx.lineWidth = 2 / sc; cx.strokeRect(X.x, X.y, X.w, X.h);
    map.starts.forEach((s, i) => { cx.fillStyle = i ? '#ff8a8a' : '#8ab4ff'; cx.beginPath(); cx.arc(s.x, s.y, T * 0.38, 0, Math.PI * 2); cx.fill(); });
    document.querySelectorAll('#escTools [data-t],#escTools2 [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === tool));
    document.querySelectorAll('#escOpt .o').forEach(o => o.classList.toggle('on', o.dataset.for === tool));
  }
  const tileAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * map.w / T), Math.floor((e.clientY - r.top) / r.height * map.h / T)]; };
  function applyTool(c, r) {
    if (c < 0 || r < 0 || c >= cols() || r >= rows()) return;
    if (SIZE_TOOLS.includes(tool)) { for (const [x, y] of brushCells(c, r)) applyCell(x, y, true); return; }
    applyCell(c, r, false);
  }
  function applyCell(c, r, quiet) {
    if (lock && tool !== 'erase' && BRUSH_TOOLS.includes(tool) && occupied(c, r)) return; // 잠금: 이미 무언가 있는 칸은 그대로
    if (tool === 'wall') return setTile(c, r, true);
    if (tool === 'erase') return eraseAt(c, r);
    if (tool === 'water' || tool === 'oneway') { setCh(c, r, tool === 'water' ? '~' : $('#escDir').value); delBrk(c, r); return; }
    if (tool === 'brk') { const m2 = $('#escBrkM').value, lim = m2 === 'hp' ? ESCAPE.LIM.brkHp : ESCAPE.LIM.brkHits, n = Math.min(lim, Math.max(1, Math.round(+$('#escBrkN').value || 1)));
      if (map.starts.some(s => Math.floor(s.x / T) === c && Math.floor(s.y / T) === r)) return quiet && brush > 1 ? undefined : msg('⚠ 시작 지점 칸에는 파괴벽을 놓을 수 없어요');
      setCh(c, r, '.'); delBrk(c, r); (map.breakables || (map.breakables = [])).push({ c, r, n, m: m2 }); return; }
    if (tool === 'mvpath') return pathAdd(c, r);
    if (tool === 'mvwall') return shapeCell(c, r);
    if (tool === 's0' || tool === 's1') { if (isWall(c, r) || brkAt(c, r) >= 0) return msg('⚠ 벽·파괴벽 칸에는 시작 지점을 놓을 수 없어요'); map.starts[+tool[1]] = { x: c * T + T / 2, y: r * T + T / 2 }; return; }
    if (tool === 'exit') { map.exit = { x: Math.min(c, cols() - map.exit.w / T) * T, y: Math.min(r, rows() - map.exit.h / T) * T, w: map.exit.w, h: map.exit.h }; }
  }
  // ② 단계: 경로 시작 칸(◎) 둘레에 벽 모양을 직접 칠함 (브러시 크기 적용). 한 번 누를 때 첫 칸이 이미 모양이면 그 획은 지우기, 아니면 칠하기
  // 제한: 최대 LIM.mvCells 칸, 모양 전체가 LIM.mvBox×LIM.mvBox 안, 각 칸은 기준 칸에서 가로·세로 LIM.mvBox-1 칸 안. 떨어진 칸도 허용(한 덩어리로 같이 움직임)
  let shMode = 'add', shWarn = '';
  function shapeCell(c, r) {
    if (!draft || draft.length < 2) { shWarn = '⚠ 먼저 ① 움직일 경로를 2칸 이상 그려 주세요'; return; }
    const i = shIdx(c, r); if (shMode === 'del') { if (i >= 0) { shape.splice(i, 1); if (!shape.length) shape = null; } return; } if (i >= 0) return;
    const L = ESCAPE.LIM, a = draft[0], S = shape || [];
    if (S.length >= L.mvCells) { shWarn = `⚠ 움직이는 벽 모양은 ${L.mvCells}칸까지예요`; return; }
    if (Math.abs(c - a[0]) >= L.mvBox || Math.abs(r - a[1]) >= L.mvBox) { shWarn = `⚠ 경로 시작 칸(◎)에서 ${L.mvBox - 1}칸 안에 그려 주세요`; return; }
    const xs = S.map(q => q[0]).concat(c), ys = S.map(q => q[1]).concat(r); if (Math.max(...xs) - Math.min(...xs) >= L.mvBox || Math.max(...ys) - Math.min(...ys) >= L.mvBox) { shWarn = `⚠ 모양은 ${L.mvBox}×${L.mvBox}칸 안에 들어가야 해요`; return; }
    (shape || (shape = [])).push([c, r]);
  }
  function finishMover() { // ✔ 벽 완성: 모양을 경로 시작 칸 기준 오프셋(cells)으로 저장, 시작 칸에서 출발 (at 0)
    if (!draft || draft.length < 2) return msg('⚠ 먼저 ① 움직일 경로를 2칸 이상 그려 주세요');
    if (!shape || !shape.length) return msg('⚠ ② 움직이는 벽을 고른 뒤 경로 시작 칸(◎) 둘레에 벽 모양을 칠해 주세요');
    if ((map.movers || []).length >= ESCAPE.LIM.movers) return msg(`⚠ 움직이는 벽은 ${ESCAPE.LIM.movers}개까지예요`);
    const a = draft[0], cells = shape.map(q => [q[0] - a[0], q[1] - a[1]]), speed = Math.min(ESCAPE.LIM.spdMax, Math.max(ESCAPE.LIM.spdMin, Math.round(+$('#escMvSpd').value || 80)));
    const want = $('#escMvMode').value, mv = ESCAPE.normalize({ ...map, movers: [{ path: draft, cells, at: 0, speed, mode: want }] }).movers[0];
    if (!mv || mv.path.length !== draft.length || mv.cells.length !== cells.length) return msg('⚠ 이 모양으로는 경로를 따라가다 맵 밖으로 나가요 — 모양을 줄이거나 경로를 옮겨 주세요');
    (map.movers || (map.movers = [])).push(mv); draft = null; shape = null; map = ESCAPE.normalize(map); fromUI(); draw();
    msg(`움직이는 벽 추가 (${cells.length}칸, 속도 ${speed}, ${mv.mode === 'loop' ? '순환' : '왕복'}${want === 'loop' && mv.mode !== 'loop' ? ' — 경로의 처음과 끝이 이어지지 않아 왕복으로 바꿈' : ''}). 다른 벽을 만들려면 ① 경로부터 다시 그리세요`);
  }
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    onCv = true; const t = tileAt(e); paint = ['wall', 'erase', 'water', 'oneway', 'brk', 'mvpath', 'mvwall'].includes(tool) ? t : null;
    if (tool === 'mvwall') { shMode = shIdx(t[0], t[1]) >= 0 ? 'del' : 'add'; shWarn = ''; }
    applyTool(t[0], t[1]); map = ESCAPE.normalize(map); draw();
  });
  cv.addEventListener('pointerleave', () => { if (hover) { hover = null; draw(); } });
  cv.addEventListener('pointermove', e => {
    const h = tileAt(e); if (!hover || hover[0] !== h[0] || hover[1] !== h[1]) { hover = h; if (!paint) draw(); }
    if (!paint) return; const t = tileAt(e), [c0, r0] = paint, n = Math.max(Math.abs(t[0] - c0), Math.abs(t[1] - r0));
    if (tool === 'mvpath') applyTool(t[0], t[1]); // 경로는 pathAdd 가 상하좌우로 채움
    else for (let k = 1; k <= n; k++) applyTool(Math.round(c0 + (t[0] - c0) * k / n), Math.round(r0 + (t[1] - r0) * k / n)); // 빠르게 끌어도 칸이 빠지지 않게 보간
    paint = t; map = ESCAPE.normalize(map); draw();
  });
  const endPaint = () => { const was = paint && tool;
    if (paint) { paint = null; fromUI(); draw(); } else fromUI();
    if (was === 'mvpath' && draft && draft.length >= 2) msg(`경로 ${draft.length}칸. 이제 ② 움직이는 벽을 누르고, 경로 시작 칸(◎) 둘레에 벽 모양을 칠한 뒤 ✔ 벽 완성을 누르세요`);
    if (was === 'mvwall') { if (shWarn) msg(shWarn); else if (shape) msg(`벽 모양 ${shape.length}칸 (◎ 기준, 점선 = 경로 끝에 도착했을 때). 다 그렸으면 ✔ 벽 완성 · 칸을 다시 누르거나 지우개로 빼기`); }
    onCv = false; };
  cv.addEventListener('pointerup', endPaint); cv.addEventListener('pointercancel', endPaint);
  document.querySelectorAll('#escTools [data-t],#escTools2 [data-t]').forEach(b => b.onclick = () => { tool = b.dataset.t; draw(); });
  document.querySelectorAll('#escBrushRow [data-b]').forEach(b => b.onclick = () => { setBrush(+b.dataset.b); draw(); });
  $('#escLock').onclick = () => { setLock(!lock); draw(); };
  document.querySelectorAll('#escOpt [data-d]').forEach(b => b.onclick = () => { setDir(b.dataset.d); });
  setBrush(1); setLock(false); setDir('^');
  // 키보드: 방향키·WASD → 일방통행 도구로 바꾸고 그 방향 선택, L → 잠금 토글. 편집기가 열려 있고 입력칸에 포커스가 없을 때만
  const KEYDIR = { ArrowUp: '^', ArrowDown: 'v', ArrowLeft: '<', ArrowRight: '>', w: '^', s: 'v', a: '<', d: '>' };
  document.addEventListener('keydown', e => {
    if (P.classList.contains('hidden') || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName; if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    const net = document.querySelector('#escNet'); if (net && !net.classList.contains('hidden')) return; // 목록·올리기 화면 위에서는 무시
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, d = KEYDIR[k];
    if (d) { e.preventDefault(); tool = 'oneway'; setDir(d); draw(); return; }
    if (k === 'l') { e.preventDefault(); setLock(!lock); draw(); }
  });
  $('#escMvDone').onclick = quiet(finishMover);
  $('#escMvShClr').onclick = quiet(() => { shape = null; draw(); msg('벽 모양을 지웠어요'); });
  $('#escMvNew').onclick = quiet(() => { draft = null; shape = null; draw(); msg('새 경로: 칸을 끌어 그리세요'); });
  $('#escBrk1').onclick = quiet(() => { $('#escBrkM').value = 'hits'; $('#escBrkN').value = 1; msg('즉시 파괴: 한 번 부딪히면 부서지는 벽'); });
  $('#escClear').onclick = () => { map.grid = ESCAPE.emptyGrid(cols(), rows()); delete map.breakables; delete map.movers; draft = null; shape = null; map = ESCAPE.normalize(map); fromUI(); draw(); };
  $('#escSample').onclick = () => { map = ESCAPE.sampleMap(); toUI(); fromUI(); };
  $('#escClose').onclick = () => { stopSearch(); P.classList.add('hidden'); window.leaveEscape && leaveEscape(); $('#select').classList.remove('hidden'); };

  // 실행 전 조건 검사: 실패 이유를 화면에 표시
  function why(m) {
    if (!sel().chars) return NEED;
    for (let i = 0; i < 2; i++) { const s = m.starts[i], c = Math.floor(s.x / T), r = Math.floor(s.y / T);
      if (isWall(c, r)) return `P${i + 1} 시작 지점이 벽 칸 위에 있어요 — 다른 칸에 놓아 주세요`;
      if (brkAt(c, r) >= 0) return `P${i + 1} 시작 지점이 파괴벽 위에 있어요 — 다른 칸에 놓아 주세요`;
      if ((m.movers || []).some(mv => inMover(mv, s.x, s.y))) return `P${i + 1} 시작 지점이 움직이는 벽의 처음 위치와 겹쳐요`; }
    const X = m.exit; let free = 0; for (let r = X.y / T; r < (X.y + X.h) / T; r++) for (let c = X.x / T; c < (X.x + X.w) / T; c++) if (!isWall(c, r)) free++;
    if (!free) return '출구가 벽으로 덮여 있어요 — 출구를 빈칸에 놓아 주세요';
    return '';
  }
  const guard = () => { const m = fromUI(), w = why(m); if (w) { msg('⚠ ' + w); if (w === NEED) notice(NEED); return null; } return m; };
  const showPv = r => { const P = $('#escPv'); if (!r || !r.preview) { P.classList.add('hidden'); P.style.display = 'none'; return; } ESCAPE.drawPreview($('#escPvCv'), r.preview); $('#escPvCap').textContent = (r.preview.kind === 'hits' ? `미리보기: 충돌 많은 곳 (${r.preview.hits}/${r.preview.total}회)` : '미리보기: 충돌이 적어 출구 주변') + '\n공개 목록에 이렇게 보여요'; P.classList.remove('hidden'); P.style.display = 'flex'; };
  const resTxt = r => `${r.clear ? '✔ 클리어' : '✕ 도착 못 함'} — 시드 ${r.seed}: ${r.result}\n도착: ${r.arrived.map(a => `P${a.team + 1} ${a.t.toFixed(2)}초 (스텝 ${Math.round(a.t * 120)})`).join(', ') || '없음'} · 시뮬 ${r.steps}스텝`;
  $('#escCheck').onclick = () => {
    const m = guard(); if (!m) return; msg('검사 중… (실제 시뮬을 화면 없이 끝까지 실행)');
    setTimeout(() => { try { const t0 = performance.now(), r = ESCAPE.runHeadless(m); showPv(r.clear ? r : null); msg(resTxt(r) + ` · ${Math.round(performance.now() - t0)}ms` + (r.clear ? '' : '\n시드를 바꾸거나 🎲 시드 탐색을 눌러 보세요')); } catch (err) { console.error(err); msg('⚠ 검사 오류: ' + err.message); } }, 20);
  };
  // 시드 탐색: 현재 시드부터 20개를 하나씩 (UI 멈춤 방지로 한 개씩 나눠) 시험, 처음 클리어되는 시드를 입력칸에 넣음
  function stopSearch() { if (search) { clearTimeout(search.t); search = null; $('#escSeedFind').textContent = '🎲 시드 탐색(20개)'; } }
  $('#escSeedFind').onclick = () => {
    if (search) { stopSearch(); return msg('시드 탐색 중지'); }
    const m = guard(); if (!m) return; const N0 = 20, from = m.seed; search = { i: 0 }; $('#escSeedFind').textContent = '■ 탐색 중지';
    const one = () => {
      if (!search) return; const i = search.i++;
      try {
        const r = ESCAPE.runHeadless(m, { seed: (from + i) >>> 0 });
        if (r.clear) { stopSearch(); $('#escSeed').value = r.seed; fromUI(); showPv(r); return msg(`🎲 ${i + 1}번째 시드에서 찾음\n` + resTxt(r)); }
        msg(`🎲 시드 탐색 ${i + 1}/${N0} … (시드 ${r.seed}: 도착 못 함)`);
      } catch (err) { stopSearch(); console.error(err); return msg('⚠ 탐색 오류: ' + err.message); }
      if (search.i >= N0) { stopSearch(); return msg(`🎲 시드 ${from}~${from + N0 - 1} 중 클리어되는 시드가 없어요.\n출구를 키우거나 벽을 줄이거나 제한 시간을 늘려 보세요 (다시 누르면 다음 20개).`) || ($('#escSeed').value = from + N0, fromUI()); }
      search.t = setTimeout(one, 0);
    };
    search.t = setTimeout(one, 20);
  };
  $('#escRun').onclick = () => {
    try {
      stopSearch(); const m = guard(); if (!m) return;
      if (typeof window.startEscape !== 'function') return msg('⚠ 게임 스크립트가 아직 준비되지 않았어요. 새로고침(Ctrl+F5) 후 다시 시도해 주세요');
      P.classList.add('hidden');
      if (!window.startEscape(m)) { P.classList.remove('hidden'); msg('⚠ ' + NEED); notice(NEED); }
    } catch (err) { console.error(err); P.classList.remove('hidden'); $('#select').classList.add('hidden'); msg('⚠ 실행 오류: ' + err.message); }
  };
  const store = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
  function list() { const S = store(); $('#escList').innerHTML = Object.keys(S).map(k => `<option>${k.replace(/</g, '&lt;')}</option>`).join('') || '<option value="">(저장 없음)</option>'; }
  $('#escSave').onclick = () => { const m = fromUI(), S = store(); S[m.name] = m; try { localStorage.setItem(LS, JSON.stringify(S)); msg('저장됨: ' + m.name); } catch (e) { msg('저장 실패: ' + e.message); } list(); };
  $('#escLoad').onclick = () => { const S = store(), k = $('#escList').value; if (!S[k]) return; try { map = ESCAPE.normalize(S[k]); toUI(); fromUI(); msg('불러옴: ' + k); } catch (e) { msg('⚠ 불러오기 실패: ' + e.message); } };
  $('#escDel').onclick = () => { const S = store(), k = $('#escList').value; if (!S[k]) return; delete S[k]; try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { msg('삭제 실패: ' + e.message); } list(); };
  $('#escExp').onclick = () => { const m = fromUI(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ESCAPE.toJSON(m)], { type: 'application/json' })); a.download = (m.name || 'escape').replace(/[\\/:*?"<>|]/g, '_') + '.psescape.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#escImp').onclick = () => $('#escFile').click();
  $('#escFile').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { map = ESCAPE.normalize(t); toUI(); fromUI(); msg('가져옴: ' + map.name + (JSON.parse(t).grid ? '' : ' (구버전 사각형 벽 → 타일로 변환)')); }).catch(err => msg('가져오기 실패: ' + err.message)); e.target.value = ''; };
  function open() { N.classList.add('hidden'); $('#select').classList.add('hidden'); P.classList.remove('hidden'); setCam(window.ESC_CAM || 'fit'); toUI(); }
  window.ESC_UI = { open, notice, why: m => why(m), current: () => fromUI(), msg, get map() { return map; }, set map(m) { map = ESCAPE.normalize(m); toUI(); fromUI(); } };
})();
