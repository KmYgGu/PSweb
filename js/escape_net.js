// ===== 탈출맵 온라인: 맵 올리기 · 공개 목록 · 신고 · 관리자 (설정: js/escape_config.js) =====
(function () {
  if (typeof document === 'undefined' || !window.ESC_UI) return;
  const CFG = window.ESCAPE_CONFIG || {}, $ = s => document.querySelector(s);
  const SERVER = String(CFG.ESCAPE_SERVER_URL || '').replace(/\/+$/, '');
  const R = CFG.MAPS_REPO || {}, RAW = String(CFG.MAPS_RAW_BASE || `https://raw.githubusercontent.com/${R.owner}/${R.repo}/${R.branch || 'main'}`).replace(/\/+$/, '');
  const NO_SERVER = '서버가 아직 연결되지 않았어요 (js/escape_config.js 의 ESCAPE_SERVER_URL 이 비어 있음)';
  const T_WAKE = 75000, T_UPLOAD = 150000, T_SMALL = 20000; // 무료 서버는 잠들면 깨는 데 ~1분, 재검증은 CPU 0.1 이라 느릴 수 있음
  let adminKey = null; // 관리자 키: 메모리에만 (새로고침하면 사라짐, 저장하지 않음)
  const recent = []; // 방금 올린 맵 (raw 파일은 최대 ~5분 캐시되므로 목록에 바로 합쳐 보여 줌)

  const css = document.createElement('style'); css.textContent = `
#escNet{position:absolute;inset:0;z-index:45;background:rgba(18,20,30,.98);padding:8px 10px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;color:#c9cee0;font-size:11px}
#escNet.hidden{display:none}
#escNet h1{font-size:15px;color:#ffe27a;margin:0;display:flex;justify-content:space-between;align-items:center}
#escNet button{height:24px;padding:0 8px;border-radius:5px;font-size:11px;background:#2e3346;color:#c9cee0;box-shadow:0 2px 0 #14151f;border:0;cursor:pointer}
#escNet button.go{background:#3bbf7a;color:#08200f;font-weight:bold}
#escNet button.warn{background:#8a3a3a;color:#ffe0e0}
#escNet input,#escNet textarea{font-size:12px;background:#262a3c;color:#e0e4f0;border:1px solid #3a4058;border-radius:4px;padding:3px 5px;width:100%;box-sizing:border-box}
#escNet label{display:block;color:#a9afc6;margin-top:2px}
#escNetMsg{white-space:pre-wrap;color:#ffe08a;font-size:11px;line-height:1.4;min-height:16px;padding:4px 6px;border-radius:4px;background:rgba(255,207,74,.08)}
#escNetMsg:empty{display:none}
#escNetMsg.err{color:#ffb4b4;background:rgba(255,80,80,.1)}
.escItem{background:#23273a;border:1px solid #343a52;border-radius:6px;padding:6px 7px;display:flex;flex-direction:column;gap:3px}
.escTop{display:flex;gap:7px;align-items:flex-start}.escTop .info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.escPvBox{flex:0 0 128px;display:flex;flex-direction:column;align-items:center;gap:2px}
.escPvBox canvas{width:128px;height:96px;border-radius:4px;border:1px solid #4a5170;display:block}
.escPvBox .cap{font-size:9px;color:#8f95ad;text-align:center;line-height:1.2}
.escPvBox button{width:128px;height:96px}
.escItem .t{color:#f0f2fa;font-size:12px;font-weight:bold}.escItem .s{color:#8f95ad;font-size:10px}.escItem .b{display:flex;gap:4px;flex-wrap:wrap}`;
  document.head.appendChild(css);
  const N = document.createElement('div'); N.id = 'escNet'; N.className = 'hidden';
  N.innerHTML = `<h1><span id="escNetTitle"></span><span><button id="escNetTabList" type="button">🌐 목록</button> <button id="escNetTabUp" type="button">⬆ 올리기</button> <button id="escNetClose" type="button">편집기로</button></span></h1><div id="escNetMsg"></div><div id="escNetBody"></div>`;
  $('#stage').appendChild(N);
  const body = $('#escNetBody'), mEl = $('#escNetMsg');
  const say = (t, isErr) => { mEl.textContent = t; mEl.classList.toggle('err', !!isErr); mEl.scrollIntoView && mEl.scrollIntoView({ block: 'nearest' }); };
  const show = (title) => { $('#escNetTitle').textContent = title; body.innerHTML = ''; say(''); N.classList.remove('hidden'); };
  $('#escNetClose').onclick = () => N.classList.add('hidden');
  const el = (tag, props = {}, kids = []) => { const e = document.createElement(tag); Object.assign(e, props); kids.forEach(k => e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k)); return e; };
  const btn = (txt, fn, cls) => { const b = el('button', { type: 'button', textContent: txt, className: cls || '' }); b.onclick = fn; return b; };

  // ---------- 통신 ----------
  async function req(path, { method = 'GET', data, timeout = T_SMALL, key } = {}) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout), h = {};
    if (data !== undefined) h['Content-Type'] = 'application/json'; if (key) h['X-Admin-Key'] = key;
    try {
      const r = await fetch(SERVER + path, { method, headers: h, body: data === undefined ? undefined : JSON.stringify(data), signal: ac.signal, cache: 'no-store' });
      const j = await r.json().catch(() => ({ ok: false, error: '서버 응답을 읽지 못했어요 (' + r.status + ')' }));
      return { status: r.status, ...j };
    } catch (e) { return { status: 0, ok: false, net: true, error: e.name === 'AbortError' ? '시간 초과' : '서버에 연결하지 못했어요' }; }
    finally { clearTimeout(t); }
  }
  async function wake() { // 서버가 잠들어 있으면 깨움 (최대 ~75초)
    if (!SERVER) return { ok: false, error: NO_SERVER };
    let r = await req('/health', { timeout: 8000 }); if (r.ok) return r;
    const t0 = Date.now();
    while (Date.now() - t0 < T_WAKE) {
      say(`서버를 깨우는 중… (최대 1분, ${Math.round((Date.now() - t0) / 1000)}초 경과)`);
      r = await req('/health', { timeout: 10000 }); if (r.ok) return r;
      await new Promise(res => setTimeout(res, 4000));
    }
    return { ok: false, error: '서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요' };
  }
  async function raw(path) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), T_SMALL);
    try { const r = await fetch(`${RAW}/${path}`, { cache: 'no-cache', signal: ac.signal }); if (r.status === 404 && path === 'index.json') return { maps: [] }; // 아직 첫 맵이 없음 → 빈 목록
      if (!r.ok) throw new Error(r.status === 404 ? '아직 공개된 맵이 없거나 저장소를 찾을 수 없어요' : '읽기 실패 ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }

  // ---------- 올리기 ----------
  function openUpload() {
    show('⬆ 맵 올리기');
    const ti = el('input', { id: 'escUpTitle', maxLength: 30, placeholder: '1~30자' }), au = el('input', { id: 'escUpAuthor', maxLength: 20, placeholder: '선택, 20자 이하 (비우면 익명)' }), de = el('textarea', { id: 'escUpDesc', maxLength: 200, rows: 3, placeholder: '선택, 200자 이하' });
    ti.value = (ESC_UI.map && ESC_UI.map.name) || '';
    const go = btn('✔ 로컬 클리어 검사 후 올리기', () => doUpload(ti.value, au.value, de.value, go), 'go'); go.id = 'escUpGo';
    [el('label', { textContent: '제목' }), ti, el('label', { textContent: '작성자 표시명' }), au, el('label', { textContent: '설명' }), de,
      el('div', { className: 's', textContent: '주소(URL)·욕설은 넣을 수 없어요. 서버가 같은 맵·시드로 다시 시뮬레이션해서 출구에 도착해야 공개됩니다.' }), go].forEach(x => body.appendChild(x));
    if (!SERVER) say(NO_SERVER, true);
  }
  async function doUpload(title, author, desc, go) {
    if (!SERVER) return say(NO_SERVER, true);
    let m; try { m = ESC_UI.current(); } catch (e) { return say('맵 읽기 오류: ' + e.message, true); }
    const w = ESC_UI.why(m); if (w) return say('⚠ ' + w, true);
    if (!String(title).trim()) return say('⚠ 제목을 입력해 주세요', true);
    go.disabled = true;
    try {
      say('로컬 클리어 검사 중…'); await new Promise(r => setTimeout(r, 30));
      const loc = ESCAPE.runHeadless(m);
      if (!loc.clear) return say(`⚠ 로컬 클리어 검사 실패 (시드 ${loc.seed}: ${loc.result})\n편집기에서 🎲 시드 탐색으로 클리어되는 시드를 찾은 뒤 올려 주세요`, true);
      { const old = $('#escUpPv'); if (old) old.remove(); if (loc.preview) { const bx = el('div', { className: 'escPvBox', id: 'escUpPv' }, [pvCanvas(loc.preview), el('div', { className: 'cap', textContent: pvCap(loc.preview) })]); go.parentNode.insertBefore(bx, go); } }
      say(`로컬 검사 통과 (${loc.arrived[0] ? loc.arrived[0].t.toFixed(1) : loc.time}초). 서버 확인 중…`);
      const h = await wake(); if (!h.ok) return say('⚠ ' + h.error, true);
      say('올리는 중… 서버가 다시 시뮬레이션해서 확인하고 있어요 (최대 2분)');
      const r = await req('/maps', { method: 'POST', data: { map: m, title, author, desc }, timeout: T_UPLOAD });
      if (!r.ok) return say(`⚠ 올리기 실패: ${r.error}` + (r.net ? '\n네트워크 문제일 수 있어요. 다시 눌러 주세요' : ''), true);
      recent.unshift(r.entry); say(`✔ 올렸어요! (id ${r.id})\n공개 목록에 바로 추가했어요. 다른 사람 화면에는 최대 5분 뒤에 보일 수 있어요.`);
    } finally { go.disabled = false; }
  }

  // ---------- 공개 목록 ----------
  const fmt = iso => { try { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (e) { return ''; } };
  const charName = id => ((typeof CHARACTERS !== 'undefined' ? CHARACTERS : []).find(c => c.id === id) || { name: id }).name;
  async function openList() {
    show('🌐 공개 탈출맵 (최신순)');
    body.appendChild(btn('↻ 새로고침', openList));
    say('목록을 불러오는 중…');
    let maps = [];
    try { const idx = await raw('index.json'); maps = Array.isArray(idx.maps) ? idx.maps : []; say(''); }
    catch (e) { say('⚠ 목록을 불러오지 못했어요: ' + (e.name === 'AbortError' ? '시간 초과' : e.message), !recent.length); }
    const seen = new Set(), all = [...recent, ...maps].filter(m => m && m.id && !seen.has(m.id) && seen.add(m.id)).sort((a, b) => String(b.created).localeCompare(String(a.created)));
    if (!all.length) body.appendChild(el('div', { className: 's', textContent: '공개된 맵이 없어요.' }));
    for (const m of all) {
      const it = el('div', { className: 'escItem' });
      it.dataset.id = m.id;
      const info = el('div', { className: 'info' }); it.appendChild(el('div', { className: 'escTop' }, [pvBox(m), info]));
      info.appendChild(el('div', { className: 't', textContent: m.title }));
      info.appendChild(el('div', { className: 's', textContent: `${m.author || '익명'} · ${fmt(m.created)} · ${m.w}×${m.h} · 벽 ${m.walls}칸 · ${m.goal === 'coop' ? '협동' : '먼저 도착'} · 제한 ${m.timeLimit}초` }));
      info.appendChild(el('div', { className: 's', textContent: `검증: ${charName(m.chars && m.chars[0])} vs ${charName(m.chars && m.chars[1])} · ${m.mode}타입 · 시드 ${m.seed} · ${Number(m.clearTime).toFixed(1)}초에 도착` }));
      it.appendChild(el('div', { className: 'b' }, [btn('▶ 플레이', () => loadMap(m, 'play')), btn('✎ 편집기로', () => loadMap(m, 'edit')), btn('🚩 신고', () => doReport(m), 'warn')]));
      body.appendChild(it);
    }
  }
  // ---------- 미리보기 (검증 시뮬에서 충돌이 가장 많았던 구역) ----------
  const pvCache = {};
  const pvCap = (pv, local) => (pv.kind === 'hits' ? `충돌 많은 곳 · ${pv.hits}회` : '충돌 적음 · 출구 주변') + (local ? ' (이 기기에서 계산)' : '');
  function pvCanvas(pv) { const cv = el('canvas', { width: 256, height: 192, className: 'escPv' }); ESCAPE.drawPreview(cv, pv); return cv; }
  function pvBox(m) {
    const box = el('div', { className: 'escPvBox' }), pv = m.preview || pvCache[m.id];
    if (pv) { box.appendChild(pvCanvas(pv)); box.appendChild(el('div', { className: 'cap', textContent: pvCap(pv, !m.preview) })); return box; }
    const b = btn('🔍 미리보기', async () => { // 예전 맵(preview 없음): 맵 파일을 받아 같은 시드로 이 기기에서 시뮬 후 계산 (서버 계산과 같은 코드·결과)
      b.disabled = true; b.textContent = '계산 중…';
      try { const f = await raw(`maps/${m.id}.json`); await new Promise(r => setTimeout(r, 20)); const r = ESCAPE.runHeadless(f.map); pvCache[m.id] = r.preview; box.innerHTML = ''; box.appendChild(pvCanvas(r.preview)); box.appendChild(el('div', { className: 'cap', textContent: pvCap(r.preview, true) })); }
      catch (er) { b.disabled = false; b.textContent = '🔍 다시 시도'; say('⚠ 미리보기 실패: ' + er.message, true); }
    });
    box.appendChild(b); return box;
  }
  async function loadMap(e, how) {
    say('맵을 불러오는 중…');
    let f; try { f = await raw(`maps/${e.id}.json`); } catch (er) { return say('⚠ 맵을 불러오지 못했어요: ' + er.message, true); }
    try {
      ESC_UI.map = f.map;
      if (how === 'edit') { N.classList.add('hidden'); return ESC_UI.msg(`불러옴: ${e.title} (공개 맵)`); }
      const sel = window.escapeSel ? window.escapeSel() : null;
      if (!sel || !sel.chars) { ESC_UI.notice('먼저 첫 화면에서 캐릭터(P1·P2)를 선택해 주세요'); return say('⚠ 먼저 첫 화면에서 캐릭터(P1·P2)를 선택해 주세요', true); }
      N.classList.add('hidden'); $('#escape').classList.add('hidden');
      if (!window.startEscape(ESC_UI.current())) { $('#escape').classList.remove('hidden'); ESC_UI.msg('⚠ 실행하지 못했어요'); }
    } catch (er) { console.error(er); say('⚠ 맵 오류: ' + er.message, true); }
  }
  async function doReport(m) {
    if (!SERVER) return say(NO_SERVER, true);
    if (!window.confirm(`'${m.title}' 맵을 신고할까요?\n부적절한 제목·내용일 때만 신고해 주세요. 신고가 ${'일정 수'} 모이면 관리자가 확인합니다.`)) return;
    const h = await wake(); if (!h.ok) return say('⚠ ' + h.error, true);
    const r = await req(`/maps/${m.id}/report`, { method: 'POST', data: {} });
    if (!r.ok) return say('⚠ 신고 실패: ' + r.error, true);
    say(`신고했어요. 고마워요. (누적 ${r.count}/${r.threshold}${r.review ? ' · 관리자 확인 목록에 들어갔어요' : ''})`);
  }

  // ---------- 관리자 (숨은 진입: 편집기 제목을 2초 안에 5번 누르기) ----------
  function openAdmin() {
    show('🛡 관리자');
    const k = el('input', { id: 'escAdmKey', type: 'password', placeholder: 'ADMIN_KEY', autocomplete: 'off' });
    body.appendChild(el('label', { textContent: '관리자 키 (저장하지 않음, 이 화면을 새로고침하면 다시 입력)' })); body.appendChild(k);
    const go = btn('확인 목록 보기', async () => { adminKey = k.value; await loadReview(); }, 'go'); go.id = 'escAdmGo'; body.appendChild(go);
    body.appendChild(el('div', { id: 'escAdmList' }));
    if (adminKey) { k.value = adminKey; loadReview(); }
    if (!SERVER) say(NO_SERVER, true);
  }
  async function loadReview() {
    const box = $('#escAdmList'); if (!box) return; box.innerHTML = '';
    const h = await wake(); if (!h.ok) return say('⚠ ' + h.error, true);
    const r = await req('/admin/review', { key: adminKey }); if (!r.ok) { if (r.status === 401) adminKey = null; return say('⚠ ' + r.error, true); }
    say(`확인 목록 ${r.review.length}개 · 비공개 ${r.hidden.length}개 (신고 임계값 ${r.threshold})`);
    const act = async (id, a, label) => { if (!window.confirm(`${label} 할까요? (${id})`)) return; const q = await req(`/admin/maps/${id}/${a}`, { method: 'POST', data: {}, key: adminKey }); if (!q.ok) return say('⚠ ' + q.error, true); say(`✔ ${label} 완료 (${id})`); setTimeout(loadReview, 300); };
    box.appendChild(el('h3', { textContent: '확인 목록 (신고 누적)', style: 'margin:6px 0 2px;font-size:12px;color:#ffcf4a' }));
    if (!r.review.length) box.appendChild(el('div', { className: 's', textContent: '없음' }));
    for (const m of r.review) {
      const it = el('div', { className: 'escItem' }); it.dataset.id = m.id;
      it.appendChild(el('div', { className: 't', textContent: m.title })); it.appendChild(el('div', { className: 's', textContent: `${m.author || ''} · 신고 ${m.count} · ${fmt(m.at)} · id ${m.id}` }));
      it.appendChild(el('div', { className: 'b' }, [btn('비공개', () => act(m.id, 'hide', '비공개 전환'), 'warn'), btn('기각(신고 초기화)', () => act(m.id, 'dismiss', '기각')), btn('맵 보기', () => loadMap(m, 'edit'))]));
      box.appendChild(it);
    }
    box.appendChild(el('h3', { textContent: '비공개 목록', style: 'margin:8px 0 2px;font-size:12px;color:#ffcf4a' }));
    if (!r.hidden.length) box.appendChild(el('div', { className: 's', textContent: '없음' }));
    for (const m of r.hidden) {
      const it = el('div', { className: 'escItem' }); it.dataset.id = m.id;
      it.appendChild(el('div', { className: 't', textContent: m.title })); it.appendChild(el('div', { className: 's', textContent: `${m.author || ''} · 비공개 ${fmt(m.hiddenAt)} · id ${m.id}` }));
      it.appendChild(el('div', { className: 'b' }, [btn('복원', () => act(m.id, 'restore', '복원'))])); box.appendChild(it);
    }
  }

  // ---------- 편집기에 버튼 추가 ----------
  const row = el('div', { className: 'row' }, [btn('🌐 공개 맵 목록', openList), btn('⬆ 맵 올리기', openUpload)]);
  row.children[0].id = 'escNetList'; row.children[1].id = 'escNetUp';
  const runRow = $('#escRun').parentNode; runRow.parentNode.insertBefore(row, runRow.nextSibling);
  let taps = []; $('#escape h1').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') return; const t = Date.now(); taps = taps.filter(x => t - x < 2000); taps.push(t); if (taps.length >= 5) { taps = []; openAdmin(); } });
  $('#escNetTabList').onclick = openList; $('#escNetTabUp').onclick = openUpload;
  window.ESC_NET = { openList, openUpload, openAdmin, pvCanvas };
})();
