// ===== 탈출맵 진입 화면 + 맵 편집기 (DOM 전용; 코어는 js/escape.js) =====
(function () {
  if (typeof document === 'undefined') return;
  const $ = s => document.querySelector(s), LS = 'psEscapeMaps', LAST = 'psEscapeLast';
  let map = null, tool = 'wall', drag = null, sc = 1;
  try { const s = localStorage.getItem(LAST); if (s) map = ESCAPE.normalize(s); } catch (e) {}
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
#escCv{background:#111;align-self:center;touch-action:none;border:1px solid #3a4058;image-rendering:pixelated}
#escMsg{min-height:30px;white-space:pre-wrap;color:#ffe08a;font-size:10px;line-height:1.35}
#escCam{position:absolute;right:6px;bottom:84px;z-index:7;display:none}`;
  document.head.appendChild(css);

  const P = document.createElement('div'); P.id = 'escape'; P.className = 'hidden';
  P.innerHTML = `
<h1>🚪 탈출맵 편집기 <button id="escClose" type="button">메인으로</button></h1>
<div class="row">이름 <input id="escName" style="width:120px"> 크기 <select id="escSize">${ESCAPE.SIZES.map(s => `<option value="${s[0]}x${s[1]}">${s[0]}×${s[1]}</option>`).join('')}</select></div>
<div class="row" id="escTools"><button data-t="wall">▭ 벽</button><button data-t="erase">✕ 지우기</button><button data-t="s0">P1 시작</button><button data-t="s1">P2 시작</button><button data-t="exit">🚪 출구</button><button id="escClear" type="button">전부 비우기</button><button id="escSample" type="button">샘플</button></div>
<canvas id="escCv"></canvas>
<div class="row">캐릭터 <span id="escChars" style="color:#e0e4f0"></span> <button id="escPick" type="button">👥 캐릭터 선택</button></div>
<div class="row">승리 <select id="escGoal"><option value="race">먼저 도착한 쪽</option><option value="coop">둘 다 도착(협동)</option></select>
 <label><input type="checkbox" id="escNoDmg">서로 피해 0</label><label><input type="checkbox" id="escNoAtk">공격 불가</label></div>
<div class="row">속도 <select id="escSpd"><option>0.5</option><option>0.75</option><option selected>1</option><option>1.5</option><option>2</option></select>
 타입 <select id="escType"><option>A</option><option>B</option></select> 제한 <input type="number" id="escTime" min="10" max="900">초 시드 <input type="number" id="escSeed" style="width:86px"></div>
<div class="row">카메라 <select id="escCamSel"><option value="fit">두 캐릭터 맞춤</option><option value="p0">P1 따라가기</option><option value="p1">P2 따라가기</option></select></div>
<div class="row"><button id="escCheck" type="button">✔ 클리어 검사</button><button id="escRun" class="go" type="button">▶ 탈출 실행</button></div>
<div class="row"><button id="escSave" type="button">💾 저장</button><select id="escList"></select><button id="escLoad" type="button">불러오기</button><button id="escDel" type="button">삭제</button><button id="escExp" type="button">⬇ 내보내기</button><button id="escImp" type="button">⬆ 가져오기</button><input id="escFile" type="file" accept=".json,.psescape,application/json" hidden></div>
<div id="escMsg"></div>`;
  $('#stage').appendChild(P);
  const camBtn = document.createElement('button'); camBtn.id = 'escCam'; camBtn.type = 'button'; $('#stage').appendChild(camBtn);
  const CAMN = { fit: '🎥 맞춤', p0: '🎥 P1', p1: '🎥 P2' };
  const setCam = c => { window.ESC_CAM = c; try { localStorage.setItem('psEscCam', c); } catch (e) {} camBtn.textContent = CAMN[c]; $('#escCamSel').value = c; };
  camBtn.onclick = () => setCam({ fit: 'p0', p0: 'p1', p1: 'fit' }[window.ESC_CAM || 'fit']);
  setInterval(() => { const b = window.__battle; camBtn.style.display = b && b.escape && !$('#hud').classList.contains('hidden') ? 'block' : 'none'; }, 250);

  const ent = document.createElement('button'); ent.id = 'escEnter'; ent.className = 'rpload'; ent.type = 'button'; ent.textContent = '🚪 탈출맵 (편집·실행)';
  $('#rpLoad').after(ent);
  ent.onclick = () => open();

  const cv = $('#escCv'), cx = cv.getContext('2d'), msg = t => { const e = $('#escMsg'); e.textContent = t; if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); };
  // 실행 전 조건 검사: 실패 이유를 화면에 표시 (조용히 return 하지 않음)
  function why(m) {
    const bad = m.chars.filter(id => !CHARACTERS.some(c => c.id === id));
    if (bad.length) return `캐릭터를 찾을 수 없어요 (${bad.join(', ')}) — 👥 캐릭터 선택으로 다시 골라 주세요`;
    const inW = (x, y) => m.walls.some(w => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h);
    for (let i = 0; i < 2; i++) { const s = m.starts[i]; if (!s || s.x < 0 || s.y < 0 || s.x > m.w || s.y > m.h) return `P${i + 1} 시작 지점을 맵 안에 먼저 놓아 주세요`; if (inW(s.x, s.y)) return `P${i + 1} 시작 지점이 벽 안에 있어요 — 다른 곳에 놓아 주세요`; }
    const X = m.exit; if (!X || X.x < 0 || X.y < 0 || X.x + X.w > m.w || X.y + X.h > m.h) return '출구를 맵 안에 먼저 놓아 주세요';
    return '';
  }
  function resize() { sc = Math.min(336 / map.w, 300 / map.h); cv.width = Math.round(map.w * sc); cv.height = Math.round(map.h * sc); }
  function toUI() {
    $('#escName').value = map.name; $('#escSize').value = map.w + 'x' + map.h;
    const nm = id => (CHARACTERS.find(c => c.id === id) || { name: id }).name; $('#escChars').innerHTML = `<span style="color:#9cc4ff">P1 ${nm(map.chars[0])}</span> · <span style="color:#ffb0b0">P2 ${nm(map.chars[1])}</span>`;
    $('#escGoal').value = map.rules.goal; $('#escNoDmg').checked = map.rules.noDamage; $('#escNoAtk').checked = map.rules.noAttack;
    $('#escSpd').value = String(map.rules.speedMul); $('#escType').value = map.rules.type; $('#escTime').value = map.timeLimit; $('#escSeed').value = map.seed;
    resize(); draw(); list();
  }
  function fromUI() {
    map.name = $('#escName').value || '이름 없는 탈출맵'; 
    map.rules = { goal: $('#escGoal').value, noDamage: $('#escNoDmg').checked, noAttack: $('#escNoAtk').checked, speedMul: +$('#escSpd').value, type: $('#escType').value };
    map.timeLimit = +$('#escTime').value || 120; map.seed = (+$('#escSeed').value) >>> 0;
    map = ESCAPE.normalize(map); try { localStorage.setItem(LAST, JSON.stringify(map)); } catch (e) {}
    return map;
  }
  P.addEventListener('change', e => { if (e.target.id === 'escCamSel') return setCam(e.target.value); if (e.target.id === 'escSize') { const [w, h] = e.target.value.split('x').map(Number); map.w = w; map.h = h; map = ESCAPE.normalize(map); clampAll(); resize(); } if (e.target.id !== 'escList' && e.target.id !== 'escFile') fromUI(); draw(); });
  function clampAll() { map.starts.forEach(s => { s.x = Math.min(s.x, map.w - 30); s.y = Math.min(s.y, map.h - 30); }); const X = map.exit; X.x = Math.min(X.x, map.w - X.w); X.y = Math.min(X.y, map.h - X.h); map.walls = map.walls.filter(w => w.x < map.w && w.y < map.h); }
  function draw() {
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#2b2f3f'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.setTransform(sc, 0, 0, sc, 0, 0);
    cx.strokeStyle = 'rgba(255,255,255,0.05)'; cx.lineWidth = 1 / sc; for (let x = 0; x < map.w; x += 64) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, map.h); cx.stroke(); } for (let y = 0; y < map.h; y += 64) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(map.w, y); cx.stroke(); }
    cx.strokeStyle = 'rgba(255,220,120,0.25)'; cx.strokeRect(0, 0, 360, 640); // 기존 화면 1장 크기 참고
    cx.fillStyle = '#5d6279'; for (const w of map.walls) cx.fillRect(w.x, w.y, w.w, w.h);
    const X = map.exit; cx.fillStyle = 'rgba(60,220,140,.45)'; cx.fillRect(X.x, X.y, X.w, X.h); cx.strokeStyle = '#7dffb0'; cx.lineWidth = 2 / sc; cx.strokeRect(X.x, X.y, X.w, X.h);
    map.starts.forEach((s, i) => { cx.fillStyle = i ? '#ff8a8a' : '#8ab4ff'; cx.beginPath(); cx.arc(s.x, s.y, 14, 0, Math.PI * 2); cx.fill(); });
    if (drag && drag.r) { cx.strokeStyle = '#ffcf4a'; cx.strokeRect(drag.r.x, drag.r.y, drag.r.w, drag.r.h); }
    document.querySelectorAll('#escTools [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === tool));
  }
  const snap = v => Math.round(v / 16) * 16;
  const pt = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(map.w, (e.clientX - r.left) / r.width * map.w)), Math.max(0, Math.min(map.h, (e.clientY - r.top) / r.height * map.h))]; };
  const rectOf = (a, b) => { const x0 = snap(Math.min(a[0], b[0])), y0 = snap(Math.min(a[1], b[1])), x1 = snap(Math.max(a[0], b[0])), y1 = snap(Math.max(a[1], b[1])); return { x: x0, y: y0, w: Math.max(16, x1 - x0), h: Math.max(16, y1 - y0) }; };
  cv.onpointerdown = e => {
    const p = pt(e); cv.setPointerCapture(e.pointerId);
    if (tool === 's0' || tool === 's1') { map.starts[+tool[1]] = { x: Math.round(p[0]), y: Math.round(p[1]) }; fromUI(); return draw(); }
    if (tool === 'erase') { for (let i = map.walls.length - 1; i >= 0; i--) { const w = map.walls[i]; if (p[0] >= w.x && p[0] <= w.x + w.w && p[1] >= w.y && p[1] <= w.y + w.h) { map.walls.splice(i, 1); break; } } fromUI(); return draw(); }
    drag = { a: p, r: rectOf(p, p) }; draw();
  };
  cv.onpointermove = e => { if (!drag) return; drag.r = rectOf(drag.a, pt(e)); draw(); };
  cv.onpointerup = () => { if (!drag) return; const r = drag.r; drag = null; if (tool === 'wall') map.walls.push(r); else if (tool === 'exit') map.exit = { x: r.x, y: r.y, w: Math.max(32, r.w), h: Math.max(32, r.h) }; fromUI(); draw(); };
  document.querySelectorAll('#escTools [data-t]').forEach(b => b.onclick = () => { tool = b.dataset.t; draw(); });
  $('#escClear').onclick = () => { map.walls = []; fromUI(); draw(); };
  $('#escSample').onclick = () => { map = ESCAPE.sampleMap(); toUI(); fromUI(); };
  $('#escClose').onclick = () => { P.classList.add('hidden'); window.leaveEscape && leaveEscape(); $('#select').classList.remove('hidden'); };
  $('#escCheck').onclick = () => {
    const m = fromUI(), w = why(m); if (w) return msg('⚠ ' + w); msg('검사 중…');
    setTimeout(() => {
      try {
        const pc = ESCAPE.pathCheck(m);
        const pl = pc.chars.map((c, i) => `P${i + 1} ${c.id}: ${c.err || (c.reach ? '경로 있음' : '경로 없음')}`).join(' / ');
        if (!pc.ok) return msg('✕ 경로 검사 실패 — ' + pl + (pc.chars.some(c => c.exitCells === 0) ? '\n출구가 벽에 막혀 들어갈 칸이 없습니다' : ''));
        const t0 = performance.now(), r = ESCAPE.runHeadless(m), ms = Math.round(performance.now() - t0);
        msg(`${r.clear ? '✔ 클리어 가능' : '✕ 클리어 실패'} — ${r.result}\n${pl}\n도달: ${r.arrived.map(a => `P${a.team + 1} ${a.t.toFixed(2)}초 (스텝 ${Math.round(a.t * 120)})`).join(', ') || '없음'} · 시뮬 ${r.steps}스텝 · ${ms}ms`);
      } catch (err) { msg('검사 오류: ' + err.message); }
    }, 20);
  };
  $('#escPick').onclick = () => {
    try {
      if (typeof window.pickForEscape !== 'function') return msg('⚠ 게임 스크립트가 아직 준비되지 않았어요. 새로고침(Ctrl+F5) 후 다시 시도해 주세요');
      fromUI(); P.classList.add('hidden');
      window.pickForEscape(map.chars.slice(), ids => { if (ids) { map.chars = ids; fromUI(); } P.classList.remove('hidden'); toUI(); if (ids) msg('캐릭터 변경: ' + $('#escChars').textContent); });
    } catch (err) { console.error(err); P.classList.remove('hidden'); msg('⚠ 캐릭터 선택 오류: ' + err.message); }
  };
  $('#escRun').onclick = () => {
    try {
      const m = fromUI(), w = why(m); if (w) return msg('⚠ ' + w);
      if (typeof window.startEscape !== 'function') return msg('⚠ 게임 스크립트가 아직 준비되지 않았어요. 새로고침(Ctrl+F5) 후 다시 시도해 주세요');
      P.classList.add('hidden');
      if (!window.startEscape(m)) { P.classList.remove('hidden'); msg('⚠ 탈출을 시작하지 못했어요 (캐릭터를 다시 골라 주세요)'); }
    } catch (err) { console.error(err); P.classList.remove('hidden'); $('#select').classList.add('hidden'); msg('⚠ 실행 오류: ' + err.message); }
  };
  const store = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
  function list() { const S = store(); $('#escList').innerHTML = Object.keys(S).map(k => `<option>${k.replace(/</g, '&lt;')}</option>`).join('') || '<option value="">(저장 없음)</option>'; }
  $('#escSave').onclick = () => { const m = fromUI(), S = store(); S[m.name] = m; try { localStorage.setItem(LS, JSON.stringify(S)); msg('저장됨: ' + m.name); } catch (e) { msg('저장 실패: ' + e.message); } list(); };
  $('#escLoad').onclick = () => { const S = store(), k = $('#escList').value; if (!S[k]) return; map = ESCAPE.normalize(S[k]); toUI(); fromUI(); msg('불러옴: ' + k); };
  $('#escDel').onclick = () => { const S = store(), k = $('#escList').value; if (!S[k]) return; delete S[k]; try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { msg('삭제 실패: ' + e.message); } list(); };
  $('#escExp').onclick = () => { const m = fromUI(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(m, null, 1)], { type: 'application/json' })); a.download = (m.name || 'escape').replace(/[\\/:*?"<>|]/g, '_') + '.psescape.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#escImp').onclick = () => $('#escFile').click();
  $('#escFile').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { map = ESCAPE.normalize(t); toUI(); fromUI(); msg('가져옴: ' + map.name); }).catch(err => msg('가져오기 실패: ' + err.message)); e.target.value = ''; };
  function open() { $('#select').classList.add('hidden'); P.classList.remove('hidden'); setCam(window.ESC_CAM || 'fit'); toUI(); }
  window.ESC_UI = { open, get map() { return map; }, set map(m) { map = ESCAPE.normalize(m); toUI(); } };
})();
