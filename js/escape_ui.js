// ===== 탈출맵 진입 화면 + 타일 편집기 (DOM 전용; 코어는 js/escape.js) =====
// 캐릭터 2종과 전투 타입(A/B)은 첫 화면에서 고른 값을 그대로 씀 (window.escapeSel, main.js)
(function () {
  if (typeof document === 'undefined') return;
  const $ = s => document.querySelector(s), LS = 'psEscapeMaps', LAST = 'psEscapeLast', T = ESCAPE.TILE;
  let map = null, tool = 'wall', paint = null, sc = 1, search = null;
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
#escNotice.hidden{display:none}`;
  document.head.appendChild(css);

  const P = document.createElement('div'); P.id = 'escape'; P.className = 'hidden';
  P.innerHTML = `
<h1>🚪 탈출맵 편집기 <button id="escClose" type="button">메인으로</button></h1>
<div class="row">이름 <input id="escName" style="width:120px"> 크기 <select id="escSize">${ESCAPE.SIZES.map(s => `<option value="${s[0]}x${s[1]}">${s[0]}×${s[1]} (${s[0] / T}×${s[1] / T}칸)</option>`).join('')}</select></div>
<div class="row" id="escTools"><button data-t="wall">■ 벽 칠하기</button><button data-t="erase">□ 지우개</button><button data-t="s0">P1 시작</button><button data-t="s1">P2 시작</button><button data-t="exit">🚪 출구</button>
 <select id="escExitSz" title="출구 크기(칸)"><option value="1x1">출구 1×1</option><option value="2x2">출구 2×2</option><option value="3x2">출구 3×2</option><option value="4x3">출구 4×3</option></select><button id="escClear" type="button">전부 비우기</button><button id="escSample" type="button">샘플</button></div>
<canvas id="escCv"></canvas>
<div class="row">캐릭터 <span id="escChars" style="color:#e0e4f0"></span> <span style="color:#8a90a8">(첫 화면에서 고른 캐릭터·타입)</span></div>
<div class="row">승리 <select id="escGoal"><option value="race">먼저 도착한 쪽</option><option value="coop">둘 다 도착(협동)</option></select>
 <label><input type="checkbox" id="escNoDmg">서로 피해 0</label><label><input type="checkbox" id="escNoAtk">공격 불가</label></div>
<div class="row">속도 <select id="escSpd"><option>0.5</option><option>0.75</option><option selected>1</option><option>1.5</option><option>2</option></select>
 제한 <input type="number" id="escTime" min="10" max="${ESCAPE.MAX_TIME}">초 시드 <input type="number" id="escSeed" style="width:86px"></div>
<div class="row">카메라 <select id="escCamSel"><option value="fit">두 캐릭터 맞춤</option><option value="p0">P1 따라가기</option><option value="p1">P2 따라가기</option></select></div>
<div class="row"><button id="escCheck" type="button">✔ 클리어 검사</button><button id="escSeedFind" type="button">🎲 시드 탐색(20개)</button><button id="escRun" class="go" type="button">▶ 탈출 실행</button></div>
<div class="row"><button id="escSave" type="button">💾 저장</button><select id="escList"></select><button id="escLoad" type="button">불러오기</button><button id="escDel" type="button">삭제</button><button id="escExp" type="button">⬇ 내보내기</button><button id="escImp" type="button">⬆ 가져오기</button><input id="escFile" type="file" accept=".json,.psescape,application/json" hidden></div>
<div id="escMsg"></div>`;
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
  const msg = t => { const e = $('#escMsg'); e.textContent = t; if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); };
  const cols = () => map.grid[0].length, rows = () => map.grid.length;
  const isWall = (c, r) => map.grid[r] && map.grid[r][c] === '#';
  const setTile = (c, r, v) => { if (c < 0 || r < 0 || r >= rows() || c >= cols()) return; const s = map.grid[r]; if ((s[c] === '#') === v) return; map.grid[r] = s.slice(0, c) + (v ? '#' : '.') + s.slice(c + 1); };
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
    cx.fillStyle = '#5d6279'; for (const w of map.walls) cx.fillRect(w.x, w.y, w.w, w.h);
    cx.strokeStyle = 'rgba(255,255,255,0.07)'; cx.lineWidth = 1 / sc; cx.beginPath();
    for (let x = 0; x <= map.w; x += T) { cx.moveTo(x, 0); cx.lineTo(x, map.h); } for (let y = 0; y <= map.h; y += T) { cx.moveTo(0, y); cx.lineTo(map.w, y); } cx.stroke();
    cx.strokeStyle = 'rgba(255,220,120,0.25)'; cx.strokeRect(0, 0, 360, 640); // 기존 화면 1장 크기 참고
    const X = map.exit; cx.fillStyle = 'rgba(60,220,140,.45)'; cx.fillRect(X.x, X.y, X.w, X.h); cx.strokeStyle = '#7dffb0'; cx.lineWidth = 2 / sc; cx.strokeRect(X.x, X.y, X.w, X.h);
    map.starts.forEach((s, i) => { cx.fillStyle = i ? '#ff8a8a' : '#8ab4ff'; cx.beginPath(); cx.arc(s.x, s.y, T * 0.38, 0, Math.PI * 2); cx.fill(); });
    document.querySelectorAll('#escTools [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === tool));
  }
  const tileAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * map.w / T), Math.floor((e.clientY - r.top) / r.height * map.h / T)]; };
  function applyTool(c, r) {
    if (c < 0 || r < 0 || c >= cols() || r >= rows()) return;
    if (tool === 'wall' || tool === 'erase') return setTile(c, r, tool === 'wall');
    if (tool === 's0' || tool === 's1') { if (isWall(c, r)) return msg('⚠ 벽 칸에는 시작 지점을 놓을 수 없어요'); map.starts[+tool[1]] = { x: c * T + T / 2, y: r * T + T / 2 }; return; }
    if (tool === 'exit') { map.exit = { x: Math.min(c, cols() - map.exit.w / T) * T, y: Math.min(r, rows() - map.exit.h / T) * T, w: map.exit.w, h: map.exit.h }; }
  }
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    const t = tileAt(e); paint = (tool === 'wall' || tool === 'erase') ? t : null; applyTool(t[0], t[1]); map = ESCAPE.normalize(map); draw();
  });
  cv.addEventListener('pointermove', e => {
    if (!paint) return; const t = tileAt(e), [c0, r0] = paint, n = Math.max(Math.abs(t[0] - c0), Math.abs(t[1] - r0));
    for (let k = 1; k <= n; k++) applyTool(Math.round(c0 + (t[0] - c0) * k / n), Math.round(r0 + (t[1] - r0) * k / n)); // 빠르게 끌어도 칸이 빠지지 않게 보간
    paint = t; map = ESCAPE.normalize(map); draw();
  });
  const endPaint = () => { if (paint) { paint = null; fromUI(); draw(); } else fromUI(); };
  cv.addEventListener('pointerup', endPaint); cv.addEventListener('pointercancel', endPaint);
  document.querySelectorAll('#escTools [data-t]').forEach(b => b.onclick = () => { tool = b.dataset.t; draw(); });
  $('#escClear').onclick = () => { map.grid = ESCAPE.emptyGrid(cols(), rows()); map = ESCAPE.normalize(map); fromUI(); draw(); };
  $('#escSample').onclick = () => { map = ESCAPE.sampleMap(); toUI(); fromUI(); };
  $('#escClose').onclick = () => { stopSearch(); P.classList.add('hidden'); window.leaveEscape && leaveEscape(); $('#select').classList.remove('hidden'); };

  // 실행 전 조건 검사: 실패 이유를 화면에 표시
  function why(m) {
    if (!sel().chars) return NEED;
    for (let i = 0; i < 2; i++) { const s = m.starts[i]; if (isWall(Math.floor(s.x / T), Math.floor(s.y / T))) return `P${i + 1} 시작 지점이 벽 칸 위에 있어요 — 다른 칸에 놓아 주세요`; }
    const X = m.exit; let free = 0; for (let r = X.y / T; r < (X.y + X.h) / T; r++) for (let c = X.x / T; c < (X.x + X.w) / T; c++) if (!isWall(c, r)) free++;
    if (!free) return '출구가 벽으로 덮여 있어요 — 출구를 빈칸에 놓아 주세요';
    return '';
  }
  const guard = () => { const m = fromUI(), w = why(m); if (w) { msg('⚠ ' + w); if (w === NEED) notice(NEED); return null; } return m; };
  const resTxt = r => `${r.clear ? '✔ 클리어' : '✕ 도착 못 함'} — 시드 ${r.seed}: ${r.result}\n도착: ${r.arrived.map(a => `P${a.team + 1} ${a.t.toFixed(2)}초 (스텝 ${Math.round(a.t * 120)})`).join(', ') || '없음'} · 시뮬 ${r.steps}스텝`;
  $('#escCheck').onclick = () => {
    const m = guard(); if (!m) return; msg('검사 중… (실제 시뮬을 화면 없이 끝까지 실행)');
    setTimeout(() => { try { const t0 = performance.now(), r = ESCAPE.runHeadless(m); msg(resTxt(r) + ` · ${Math.round(performance.now() - t0)}ms` + (r.clear ? '' : '\n시드를 바꾸거나 🎲 시드 탐색을 눌러 보세요')); } catch (err) { console.error(err); msg('⚠ 검사 오류: ' + err.message); } }, 20);
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
        if (r.clear) { stopSearch(); $('#escSeed').value = r.seed; fromUI(); return msg(`🎲 ${i + 1}번째 시드에서 찾음\n` + resTxt(r)); }
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
  window.ESC_UI = { open, get map() { return map; }, set map(m) { map = ESCAPE.normalize(m); toUI(); } };
})();
