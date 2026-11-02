// ===== 탈출맵 =====
// 큰 맵 + 타일 벽 + 시작 지점 2개 + 출구. 캐릭터는 일반 전투와 똑같이 움직임 (일정 속도 직선 + 벽/캐릭터 반사, 길찾기·조향 보정 없음).
// 결과는 맵 JSON(타일·시작·출구·설정) + 시드 + 캐릭터 2종 + 전투 타입만으로 결정됨 → 서버/Node 에서 같은 결과로 재검증 가능.
// [코어] DOM 없이 동작 (tools/escape_check.js)  [UI] js/escape_ui.js. 일반 A/B 전투는 b.escape 가 없으므로 영향 없음.
(function (G) {
  'use strict';
  const FORMAT = 'psescape', VERSION = 2, TILE = 40, STEP = 1 / 120;
  const SIZES = [[720, 1280], [1080, 1920], [1440, 2560]]; // 모두 TILE(40) 로 나누어 떨어짐
  const DEF_RULES = { goal: 'race', noDamage: true, noAttack: false, speedMul: 1, type: 'A' }; // 기본: 먼저 도착 승리 · 서로 피해 0 만 켬
  const DEF_TIME = 120, MAX_TIME = 600;
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  // ---------- 타일 격자 ↔ 벽 사각형 ----------
  // grid: 문자열 행 배열, '#' = 벽, '.' = 빈칸. 행 수 = ceil(h/TILE), 열 수 = ceil(w/TILE)
  function emptyGrid(cols, rows) { return Array.from({ length: rows }, () => '.'.repeat(cols)); }
  function fitGrid(g, cols, rows) { const out = []; for (let r = 0; r < rows; r++) { const s = String((g && g[r]) || ''); let row = ''; for (let c = 0; c < cols; c++) row += s[c] === '#' ? '#' : '.'; out.push(row); } return out; }
  function rectsToGrid(rects, cols, rows) { // 구버전(v1) 사각형 벽 → 타일: 타일 중심이 사각형 안이면 벽
    const g = emptyGrid(cols, rows).map(s => s.split(''));
    for (const w of rects) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2; if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) g[r][c] = '#'; }
    return g.map(a => a.join(''));
  }
  function mergeGrid(g) { // 탐욕적 병합: 가로 연속 구간을 잡고, 아래 행에 같은 구간이 있으면 세로로 늘림
    const rows = g.length, cols = rows ? g[0].length : 0, used = g.map(s => new Uint8Array(s.length)), out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (g[r][c] !== '#' || used[r][c]) continue;
      let c2 = c; while (c2 + 1 < cols && g[r][c2 + 1] === '#' && !used[r][c2 + 1]) c2++;
      let r2 = r; for (;;) { const n = r2 + 1; if (n >= rows) break; let ok = true; for (let k = c; k <= c2; k++) if (g[n][k] !== '#' || used[n][k]) { ok = false; break; } if (!ok) break; r2 = n; }
      for (let y = r; y <= r2; y++) for (let k = c; k <= c2; k++) used[y][k] = 1;
      out.push({ x: c * TILE, y: r * TILE, w: (c2 - c + 1) * TILE, h: (r2 - r + 1) * TILE });
    }
    return out;
  }
  const snapC = (v, max) => Math.min(Math.max(0, Math.floor(v / TILE)), max - 1) * TILE + TILE / 2; // 타일 중심

  // ---------- 맵 JSON 정규화 (v2, v1 읽기 지원) ----------
  function normalize(src) {
    const m = typeof src === 'string' ? JSON.parse(src) : src;
    if (!m || typeof m !== 'object') throw new Error('맵 JSON 이 아님');
    if (m.format && m.format !== FORMAT) throw new Error('format 이 psescape 가 아님');
    if (m.v != null && m.v > VERSION) throw new Error('더 새로운 버전의 맵 (v' + m.v + ')');
    const w = Math.round(num(m.w, 1080)), h = Math.round(num(m.h, 1920));
    if (w < 360 || h < 640 || w > 4000 || h > 6000) throw new Error('맵 크기 범위 밖 (360x640 ~ 4000x6000)');
    const cols = Math.ceil(w / TILE), rows = Math.ceil(h / TILE);
    const grid = Array.isArray(m.grid) ? fitGrid(m.grid, cols, rows) : rectsToGrid((Array.isArray(m.walls) ? m.walls : []).slice(0, 5000).map(r => ({ x: num(r.x, 0), y: num(r.y, 0), w: num(r.w, 0), h: num(r.h, 0) })), cols, rows);
    const st = Array.isArray(m.starts) ? m.starts : [];
    const starts = [0, 1].map(i => { const s = st[i] || st[0] || { x: w / 2 + (i ? TILE : -TILE), y: h - TILE * 2 }; return { x: snapC(num(s.x, w / 2), cols), y: snapC(num(s.y, h - 80), rows) }; });
    const E = m.exit || { x: w / 2 - TILE, y: TILE, w: TILE * 2, h: TILE * 2 };
    const ex = Math.min(Math.max(0, Math.round(num(E.x, 0) / TILE)), cols - 1), ey = Math.min(Math.max(0, Math.round(num(E.y, 0) / TILE)), rows - 1);
    const ew = Math.max(1, Math.min(cols - ex, Math.round(num(E.w, TILE * 2) / TILE))), eh = Math.max(1, Math.min(rows - ey, Math.round(num(E.h, TILE * 2) / TILE)));
    const exit = { x: ex * TILE, y: ey * TILE, w: ew * TILE, h: eh * TILE };
    const R = Object.assign({}, DEF_RULES, m.rules || {});
    const rules = { goal: R.goal === 'coop' ? 'coop' : 'race', noDamage: !!R.noDamage, noAttack: !!R.noAttack, speedMul: Math.min(4, Math.max(0.25, num(+R.speedMul, 1))), type: R.type === 'B' ? 'B' : 'A' };
    const chars = (Array.isArray(m.chars) ? m.chars : []).slice(0, 2).map(String);
    return { format: FORMAT, v: VERSION, name: String(m.name || '이름 없는 탈출맵').slice(0, 40), w, h, tile: TILE, grid, walls: mergeGrid(grid), starts, exit, chars, seed: (num(m.seed, 12345) >>> 0), timeLimit: Math.min(MAX_TIME, Math.max(10, num(m.timeLimit, DEF_TIME))), rules };
  }
  // 저장/내보내기용: walls 는 grid 에서 다시 만들 수 있지만 사람이 읽기 쉽게/구버전 호환 위해 같이 기록
  const toJSON = m => JSON.stringify(normalize(m), null, 1);

  // ---------- 벽 건물 ----------
  function drawWall(ctx, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(w.x + 4, w.y + 4, w.w, w.h);
    ctx.fillStyle = '#4b4f63'; ctx.fillRect(w.x, w.y - 10, w.w, w.h);
    ctx.fillStyle = '#5d6279'; ctx.fillRect(w.x, w.y - 10, w.w, 2);
    ctx.fillStyle = '#33364a'; ctx.fillRect(w.x, w.y + w.h - 10, w.w, 10);
    ctx.fillStyle = '#272a3a'; for (let x = w.x + TILE / 2; x < w.x + w.w; x += TILE) ctx.fillRect(x, w.y + w.h - 10, 1, 10);
    if (w.hitT > 0) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(w.x, w.y - 10, w.w, w.h); }
  }
  const mkWall = (r, i) => ({ x: r.x, y: r.y, w: r.w, h: r.h, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, solid: true, escWall: true, style: i % 3, cracks: [[], [], []], rubble: [], windows: [], draw: drawWall });

  // ---------- 전투에 탈출 규칙 적용 (new Battle 직후, 같은 시드 구간 안에서 호출) ----------
  function apply(b, src) {
    const m = normalize(src);
    const E = b.escape = { map: m, arrived: [], done: false, result: null };
    b.play = { x: 0, y: 0, w: m.w, h: m.h };
    b.buildings = m.walls.map(mkWall);
    b.u.filter(u => !u.summon).forEach((u, k) => {
      const s = m.starts[u.team] || m.starts[k % 2];
      u.x = s.x; u.y = s.y; const p = b.clampPos(u.x, u.y, u.pad, u); u.x = p.x; u.y = p.y; b.resolveBuildings(u, true);
      if (m.rules.speedMul !== 1) u.st.spd *= m.rules.speedMul;
    }); // 이동 방향(u.dir)은 생성자가 시드 난수로 정한 그대로 — 이후에도 보정하지 않음
    if (m.rules.noAttack) for (const u of b.u) lockAttack(u);
    b.resultText = () => E.result || null;
    b.cam = null; // 렌더 카메라는 updateCam 이 채움 (시각 전용)
    return E;
  }
  function lockAttack(u) { for (let i = 0; i < u.skillT.length; i++) u.skillT[i] = Math.max(u.skillT[i], 1); u.atkT = Math.max(u.atkT || 0, 1); u.bumpT = Math.max(u.bumpT || 0, 1); }
  const nameOf = u => (u.def && u.def.name) || '캐릭터';
  const EXIT_IN = 6; // 발 위치가 출구 안쪽 6px 이상 들어와야 도착
  const inExit = (E, x, y) => x > E.x + EXIT_IN && x < E.x + E.w - EXIT_IN && y > E.y + EXIT_IN && y < E.y + E.h - EXIT_IN;
  function finish(b, winner, text, clear) { const E = b.escape; E.done = true; E.clear = clear; E.result = text; E.endTime = b.time; b.over = true; b.endT = 0; b.winner = winner; }

  function escStep(b) { // 판정만 (이동은 엔진 그대로)
    const E = b.escape; if (!E || E.done || b.over) return;
    const m = E.map, X = m.exit;
    for (const u of b.u) {
      if (m.rules.noAttack) lockAttack(u);
      if (u.summon || u.dead || u.esDone) { if (u.esDone) u.moving = false; continue; }
      if (inExit(X, u.x, u.y)) { u.esDone = true; u.esT = b.time; u.st.spd = 0; E.arrived.push({ team: u.team, id: u.def.id, t: +b.time.toFixed(4) }); b.text(u.x, u.y - 60, '탈출!', '#7dffb0', 11); }
    }
    const mains = b.u.filter(u => !u.summon);
    if (m.rules.goal === 'race' && E.arrived.length) { const w = mains.find(u => u.esDone && u.team === E.arrived[0].team); return finish(b, w, `${nameOf(w)} 탈출 성공! (${E.arrived[0].t.toFixed(1)}초)`, true); }
    if (m.rules.goal === 'coop' && mains.every(u => u.esDone)) { const w = mains.slice().sort((a, c) => c.esT - a.esT)[0]; return finish(b, w, `모두 탈출 성공! 협동 클리어 (${b.time.toFixed(1)}초)`, true); }
    if (m.rules.goal === 'coop' && mains.some(u => u.dead && !u.esDone)) return finish(b, mains.find(u => !u.dead) || mains[0], '탈출 실패 — 동료가 쓰러짐', false);
    if (b.time >= m.timeLimit) return finish(b, mains.find(u => !u.dead) || mains[0], `탈출 실패 — 시간 초과 (${m.timeLimit}초)`, false);
  }

  // 피해 0 옵션: 탈출맵에서만, 모든 유닛 피해 무효
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o) { if (this.escape && this.escape.map.rules.noDamage) return 0; return oDmg.apply(this, arguments); };
  const oFix = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o) { if (this.escape && this.escape.map.rules.noDamage) return 0; return oFix.apply(this, arguments); };
  // 도착한 캐릭터는 다른 캐릭터와 부딪히지 않음 (출구를 막지 않도록)
  const oCol = Battle.prototype.collide; Battle.prototype.collide = function (a, c) { if (this.escape && (a.esDone || c.esDone)) return; return oCol.apply(this, arguments); };

  // ---------- 렌더 (시각 전용, 난수 미사용) ----------
  let tile = null;
  function floorTile() {
    if (tile || typeof document === 'undefined') return tile;
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#2b2f3f'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#30354a'; x.fillRect(0, 0, 16, 16); x.fillRect(16, 16, 16, 16);
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, 31, 32, 1); x.fillRect(31, 0, 1, 32);
    return (tile = c);
  }
  function drawExit(ctx, b) {
    const X = b.escape.map.exit, t = b.time, a = 0.5 + 0.3 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(60,220,140,${0.18 + 0.1 * a})`; ctx.fillRect(X.x, X.y, X.w, X.h);
    ctx.strokeStyle = `rgba(125,255,176,${a + 0.2})`; ctx.lineWidth = 2; ctx.strokeRect(X.x + 1, X.y + 1, X.w - 2, X.h - 2);
    ctx.fillStyle = '#7dffb0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('EXIT', X.x + X.w / 2, X.y + X.h / 2 + 4); ctx.textAlign = 'left';
  }
  if (typeof STAGE_HOOKS !== 'undefined') STAGE_HOOKS.push({
    match: () => false, // 스테이지 썸네일용 (탈출맵은 스테이지가 아님)
    step(b, dt) { if (b.escape) escStep(b, dt); },
    drawUnder(ctx, b) {
      if (!b.escape) return; const m = b.escape.map, T = floorTile();
      if (T) { ctx.fillStyle = ctx.createPattern(T, 'repeat'); } else ctx.fillStyle = '#2b2f3f';
      ctx.fillRect(0, 0, m.w, m.h);
      ctx.strokeStyle = '#5a6080'; ctx.lineWidth = 4; ctx.strokeRect(-2, -2, m.w + 4, m.h + 4);
      m.starts.forEach((s, i) => { ctx.strokeStyle = i ? 'rgba(255,140,140,.6)' : 'rgba(140,180,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(s.x, s.y, 14, 6, 0, 0, Math.PI * 2); ctx.stroke(); });
      drawExit(ctx, b);
    }
  });

  // 카메라: 'fit' 두 캐릭터가 모두 보이게 거리 따라 줌 / 'p0' 'p1' 해당 캐릭터 추적. 결과 b.cam = {x, y, k} (월드 좌상단, 배율)
  function updateCam(b, mode, dt, view) {
    if (!b || !b.escape) return; const m = b.escape.map;
    const V = view || { x: 0, y: 112, w: 360, h: 410 }; // 화면에서 실제로 보이는 영역 (상단 HUD/하단 바 제외)
    const U = b.u.filter(u => !u.summon && !u.dead), us = mode === 'p0' || mode === 'p1' ? U.filter(u => u.team === +mode[1]) : U;
    const L = us.length ? us : U.length ? U : b.u;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const u of L) { x0 = Math.min(x0, u.x); x1 = Math.max(x1, u.x); y0 = Math.min(y0, u.y - 30); y1 = Math.max(y1, u.y); }
    const mx = 90, my = 90, k = mode === 'fit' ? Math.min(1.25, Math.max(0.3, Math.min(V.w / (x1 - x0 + mx * 2), V.h / (y1 - y0 + my * 2)))) : 1.1;
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; const hw = V.w / k / 2, hh = V.h / k / 2;
    cx = m.w > hw * 2 ? Math.min(Math.max(cx, hw - 20), m.w - hw + 20) : m.w / 2; cy = m.h > hh * 2 ? Math.min(Math.max(cy, hh - 20), m.h - hh + 20) : m.h / 2;
    const C = b.cam || (b.cam = { cx, cy, k }); const a = b.cam.snap ? 1 : 1 - Math.exp(-6 * (dt || 0.016)); C.snap = false;
    C.cx += (cx - C.cx) * a; C.cy += (cy - C.cy) * a; C.k += (k - C.k) * a;
    C.x = C.cx - (V.x + V.w / 2) / C.k; C.y = C.cy - (V.y + V.h / 2) / C.k;
  }

  // ---------- 헤드리스 실행: 맵 JSON(+캐릭터 2종·타입) → 클리어 여부 + 도착 시각 (결정적) ----------
  const mkRng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }; // main.js 와 동일
  // 실행 화면(main.js startBattle)과 같은 순서: 시드 난수 → new Battle(A, B, {mode}, 'arena') → apply → update(1/120) 반복
  function runHeadless(src, o = {}) {
    const m = normalize(src); if (o.seed != null) m.seed = o.seed >>> 0;
    const a = CHARACTERS.find(c => c.id === m.chars[0]), d = CHARACTERS.find(c => c.id === m.chars[1]);
    if (!a || !d) return { clear: false, error: '캐릭터 없음', result: '캐릭터 2종이 맵 JSON(chars)에 없음', arrived: [], steps: 0, time: 0, seed: m.seed };
    const S = G.Sfx, sp = S && S.play, orig = Math.random; if (S) S.play = () => {};
    Math.random = mkRng(m.seed);
    let b, steps = 0;
    try {
      b = new Battle(a, d, { mode: m.rules.type }, 'arena'); apply(b, m);
      const maxT = m.timeLimit + 1;
      while (!b.escape.done && !b.over && b.time < maxT && steps < maxT * 360) { /* 정지 연출 중엔 b.time 이 멈추므로 스텝 상한은 넉넉히 */ b.update(STEP); steps++; }
    } finally { Math.random = orig; if (S) S.play = sp; }
    const E = b.escape;
    return { clear: !!E.clear, seed: m.seed, result: E.result || (b.over ? 'KO로 종료' : '미종료'), steps, time: +b.time.toFixed(4), arrived: E.arrived, pos: b.u.filter(u => !u.summon).map(u => [+u.x.toFixed(2), +u.y.toFixed(2)]) };
  }
  // 시드 탐색: from 부터 n 개 시드를 차례로 시험해 처음 클리어되는 시드를 반환 (없으면 null). onProg(i, n, r) 로 진행 표시
  function findSeed(src, from, n, onProg) { for (let i = 0; i < n; i++) { const r = runHeadless(src, { seed: (from + i) >>> 0 }); if (onProg) onProg(i, n, r); if (r.clear) return r; } return null; }

  function sampleMap() { // 720x1280 (18x32 타일) 기본 맵: 칸막이 두 줄 + 넓은 출구
    const cols = 18, rows = 32, g = emptyGrid(cols, rows).map(s => s.split(''));
    const band = (r, gap0, gap1) => { for (let c = 0; c < cols; c++) if (c < gap0 || c > gap1) g[r][c] = '#'; };
    band(10, 3, 8); band(21, 9, 14);
    for (let r = 12; r <= 15; r++) g[r][13] = '#';
    return normalize({ name: '샘플 탈출맵', w: 720, h: 1280, grid: g.map(a => a.join('')), starts: [{ x: 140, y: 1180 }, { x: 580, y: 1180 }], exit: { x: 280, y: 40, w: 160, h: 120 }, chars: [], seed: 1, timeLimit: DEF_TIME, rules: {} });
  }

  G.ESCAPE = { FORMAT, VERSION, TILE, SIZES, DEF_TIME, MAX_TIME, normalize, toJSON, mergeGrid, emptyGrid, apply, runHeadless, findSeed, updateCam, sampleMap, mkRng };
})(typeof window !== 'undefined' ? window : globalThis);
