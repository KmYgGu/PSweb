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
  // 칸 문자: '#' 벽, '.' 빈칸, '~' 물, '^' 'v' '<' '>' 일방통행(위·아래·왼·오른쪽). 그 밖의 문자는 빈칸
  const GRID_CH = '#~^v<>';
  function fitGrid(g, cols, rows) { const out = []; for (let r = 0; r < rows; r++) { const s = String((g && g[r]) || ''); let row = ''; for (let c = 0; c < cols; c++) row += GRID_CH.includes(s[c]) && s[c] ? s[c] : '.'; out.push(row); } return out; }
  // ---------- 특수 요소 (선택 필드, 없으면 기존 v2 맵과 완전히 같음) ----------
  const ONEWAY = { '^': [0, -1], 'v': [0, 1], '<': [-1, 0], '>': [1, 0] };
  const ONEWAY_ALIGN = Math.SQRT1_2; // 진행 방향이 타일 방향과 45° 이내면 '같은 방향'
  const ONEWAY_SPD = 2;              // 같은 방향 이동 속도 배율
  const WATER = { spd: 0.6, o2: 3, drain: 1, regen: 1.5, tick: 0.5, dmgFrac: 0.08 }; // 물: 속도 ×0.6, 산소 3초(초당 1 감소, 밖에서 초당 1.5 회복), 바닥나면 0.5초마다 최대 HP 8% 피해 (피해 0 옵션과 무관)
  const LIM = { brk: 1500, brkHits: 99, brkHp: 9999, movers: 16, path: 200, mvTiles: 6, mvCells: 64, mvBox: 8, spdMin: 20, spdMax: 400, spdDef: 80 };
  const intIn = (v, a, b, d) => { v = Math.round(num(+v, d)); return Math.min(b, Math.max(a, v)); };
  function normBreak(list, cols, rows) { // [{c,r,n,m}] m: 'hits' = 부딪힌 횟수, 'hp' = 충돌 피해 합계
    const out = [], seen = new Set();
    for (const o of (Array.isArray(list) ? list : []).slice(0, LIM.brk * 2)) {
      if (!o || out.length >= LIM.brk) continue; const c = Math.round(num(+o.c, -1)), r = Math.round(num(+o.r, -1));
      if (c < 0 || r < 0 || c >= cols || r >= rows || seen.has(c + ',' + r)) continue; seen.add(c + ',' + r);
      const m = o.m === 'hp' ? 'hp' : 'hits'; out.push({ c, r, n: m === 'hp' ? intIn(o.n, 1, LIM.brkHp, 30) : intIn(o.n, 1, LIM.brkHits, 1), m });
    }
    return out;
  }
  // 직접 그린 모양: cells = [[dx,dy]..] 경로 칸 기준 상대 오프셋 (정수, 중복 제거, (dy,dx) 순 정렬). 최대 mvCells 칸, 범위(bounding box) mvBox×mvBox 이내. 연결 안 돼도 한 덩어리로 같이 움직임
  function normCells(list) {
    if (!Array.isArray(list)) return null; const seen = new Set(), out = [];
    for (const q of list.slice(0, LIM.mvCells * 4)) {
      if (!Array.isArray(q) || out.length >= LIM.mvCells) continue; const dx = Math.round(num(+q[0], NaN)), dy = Math.round(num(+q[1], NaN));
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) >= LIM.mvBox || Math.abs(dy) >= LIM.mvBox || seen.has(dx + ',' + dy)) continue; seen.add(dx + ',' + dy); out.push([dx, dy]);
    }
    out.sort((a, b) => a[1] - b[1] || a[0] - b[0]); const k = [];
    for (const q of out) { const x0 = Math.min(...k.map(v => v[0]), q[0]), x1 = Math.max(...k.map(v => v[0]), q[0]), y0 = Math.min(...k.map(v => v[1]), q[1]), y1 = Math.max(...k.map(v => v[1]), q[1]); if (x1 - x0 < LIM.mvBox && y1 - y0 < LIM.mvBox) k.push(q); } // 범위를 넘는 칸은 버림 (정렬 순서대로)
    return k.length ? k : null;
  }
  const cellBox = cells => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of cells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
  // 움직이는 벽의 충돌 사각형(타일 단위, 경로 칸 기준 오프셋): cells 는 mergeGrid 로 병합, 구형식은 w×h 하나
  function moverRects(mv) {
    if (!mv.cells) return [{ dx: 0, dy: 0, w: mv.w, h: mv.h }];
    const B = cellBox(mv.cells), g = Array.from({ length: B.y1 - B.y0 + 1 }, () => Array(B.x1 - B.x0 + 1).fill('.'));
    for (const [x, y] of mv.cells) g[y - B.y0][x - B.x0] = '#';
    return mergeGrid(g.map(a => a.join(''))).map(r => ({ dx: r.x / TILE + B.x0, dy: r.y / TILE + B.y0, w: r.w / TILE, h: r.h / TILE }));
  }
  function normMovers(list, cols, rows) { // [{path:[[c,r]..], w, h | cells, at, speed, mode}] 경로 칸은 상하좌우로 이어져야 함 (끊기면 거기까지)
    const out = [];
    for (const o of (Array.isArray(list) ? list : []).slice(0, LIM.movers)) {
      if (!o || !Array.isArray(o.path)) continue; const cells = normCells(o.cells), w = intIn(o.w, 1, LIM.mvTiles, 1), h = intIn(o.h, 1, LIM.mvTiles, 1), path = [];
      if (o.cells !== undefined && !cells) continue; // cells 가 있는데 쓸 칸이 없으면 버림
      const B = cells ? cellBox(cells) : { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
      for (const p of o.path.slice(0, LIM.path)) {
        if (!Array.isArray(p)) break; const c = Math.round(num(+p[0], -1)), r = Math.round(num(+p[1], -1));
        if (!(c + B.x0 >= 0 && r + B.y0 >= 0 && c + B.x1 < cols && r + B.y1 < rows)) break;
        const q = path[path.length - 1]; if (q && Math.abs(q[0] - c) + Math.abs(q[1] - r) !== 1) break; path.push([c, r]);
      }
      if (path.length < 2) continue;
      const a = path[0], z = path[path.length - 1], closed = path.length >= 4 && Math.abs(a[0] - z[0]) + Math.abs(a[1] - z[1]) === 1;
      out.push({ path, ...(cells ? { cells } : { w, h }), at: intIn(o.at, 0, path.length - 1, 0), speed: intIn(o.speed, LIM.spdMin, LIM.spdMax, LIM.spdDef), mode: o.mode === 'loop' && closed ? 'loop' : 'pingpong' });
    }
    return out;
  }
  // 움직이는 벽 위치 = 시뮬 시간 t 만의 함수 (결정적). pingpong: 끝에서 되돌아옴, loop: 닫힌 경로를 한 방향으로 순환
  function moverPos(mv, t) {
    const P = mv.path, n = P.length, L = (mv.mode === 'loop' ? n : n - 1) * TILE; let d = mv.at * TILE + mv.speed * t;
    if (mv.mode === 'loop') d = d % L; else { d = d % (2 * L); if (d > L) d = 2 * L - d; }
    let i = Math.floor(d / TILE); if (i >= (mv.mode === 'loop' ? n : n - 1)) i = (mv.mode === 'loop' ? n : n - 1) - 1;
    const f = Math.min(1, Math.max(0, (d - i * TILE) / TILE)), A = P[i], B = P[(i + 1) % n];
    return { x: (A[0] + (B[0] - A[0]) * f) * TILE, y: (A[1] + (B[1] - A[1]) * f) * TILE };
  }
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
    const breakables = normBreak(m.breakables, cols, rows), movers = normMovers(m.movers, cols, rows);
    for (const k of breakables) if (grid[k.r][k.c] !== '.') grid[k.r] = grid[k.r].slice(0, k.c) + '.' + grid[k.r].slice(k.c + 1); // 파괴벽 칸은 바닥 '.'
    const out = { format: FORMAT, v: VERSION, name: String(m.name || '이름 없는 탈출맵').slice(0, 40), w, h, tile: TILE, grid, walls: mergeGrid(grid), starts, exit, chars, seed: (num(m.seed, 12345) >>> 0), timeLimit: Math.min(MAX_TIME, Math.max(10, num(m.timeLimit, DEF_TIME))), rules };
    if (breakables.length) out.breakables = breakables; if (movers.length) out.movers = movers; // 선택 필드: 비어 있으면 넣지 않음 (기존 맵 JSON·해시 그대로)
    return out;
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
  function drawBreak(ctx, w) { // 파괴벽: 갈색 벽돌 + 남은 내구도에 따라 균열 0~3단계
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(w.x + 4, w.y + 4, w.w, w.h);
    ctx.fillStyle = '#7a5a3e'; ctx.fillRect(w.x, w.y - 10, w.w, w.h); ctx.fillStyle = '#5c432e'; ctx.fillRect(w.x, w.y + w.h - 10, w.w, 10);
    ctx.fillStyle = '#5c432e'; for (let k = 0; k < 3; k++) { const yy = w.y - 10 + 8 + k * 9; ctx.fillRect(w.x, yy, w.w, 1); ctx.fillRect(w.x + (k % 2 ? 10 : 24), yy - 8, 1, 8); }
    const st = Math.min(3, Math.floor((1 - w.hp / w.maxHp) * 4)); ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 1.5; ctx.beginPath();
    if (st >= 1) { ctx.moveTo(w.x + 8, w.y - 8); ctx.lineTo(w.x + 16, w.y + 4); ctx.lineTo(w.x + 13, w.y + 14); }
    if (st >= 2) { ctx.moveTo(w.x + 32, w.y - 6); ctx.lineTo(w.x + 24, w.y + 6); ctx.lineTo(w.x + 30, w.y + 18); }
    if (st >= 3) { ctx.moveTo(w.x + 4, w.y + 10); ctx.lineTo(w.x + 20, w.y + 8); ctx.lineTo(w.x + 36, w.y + 14); }
    ctx.stroke(); if (w.hitT > 0) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(w.x, w.y - 10, w.w, w.h); }
  }
  function drawMover(ctx, w) { // 움직이는 벽: 노랑·검정 줄무늬 테두리
    drawWall(ctx, w); ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y - 10, w.w, w.h); ctx.clip(); ctx.fillStyle = 'rgba(255,196,40,.55)';
    for (let k = -w.h; k < w.w + w.h; k += 16) { ctx.beginPath(); ctx.moveTo(w.x + k, w.y - 10); ctx.lineTo(w.x + k + 8, w.y - 10); ctx.lineTo(w.x + k + 8 - w.h, w.y - 10 + w.h); ctx.lineTo(w.x + k - w.h, w.y - 10 + w.h); ctx.fill(); }
    ctx.restore(); ctx.fillStyle = '#4b4f63'; ctx.fillRect(w.x + 5, w.y - 5, w.w - 10, w.h - 10);
  }
  const mkWall = (r, i) => ({ x: r.x, y: r.y, w: r.w, h: r.h, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, solid: true, escWall: true, style: i % 3, cracks: [[], [], []], rubble: [], windows: [], draw: drawWall });

  // ---------- 전투에 탈출 규칙 적용 (new Battle 직후, 같은 시드 구간 안에서 호출) ----------
  function apply(b, src) {
    const m = normalize(src);
    const E = b.escape = { map: m, arrived: [], done: false, result: null };
    b.play = { x: 0, y: 0, w: m.w, h: m.h };
    b.buildings = m.walls.map(mkWall);
    for (const k of m.breakables || []) b.buildings.push({ x: k.c * TILE, y: k.r * TILE, w: TILE, h: TILE, hp: k.n, maxHp: k.n, dead: false, hitT: 0, solid: false, escBreak: k.m, cracks: [[], [], []], rubble: [], windows: [], draw: drawBreak });
    for (const mv of m.movers || []) { const p = moverPos(mv, 0); for (const q of moverRects(mv)) b.buildings.push(Object.assign(mkWall({ x: p.x + q.dx * TILE, y: p.y + q.dy * TILE, w: q.w * TILE, h: q.h * TILE }, 0), { escMover: mv, escOff: [q.dx * TILE, q.dy * TILE], draw: drawMover })); } // 구형식(w,h)은 오프셋 0 사각형 1개 (기존과 같음)
    E.special = []; m.grid.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] !== '.' && row[c] !== '#') E.special.push([c, r, row[c]]); }); // 물·일방통행 칸 (그리기용)
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

  // ---------- 움직이는 벽 · 물 · 일방통행 (매 스텝, 엔진 이동·벽 처리 뒤) ----------
  const tileCh = (m, c, r) => (m.grid[r] && m.grid[r][c]) || '#';
  const waterproof = u => !!(u.def && u.def.traits && u.def.traits.includes('waterproof')); // 패시브 '오리'는 물 영향 없음 (기존 물 지형과 같은 규칙)
  function escWorld(b, dt) {
    const E = b.escape; if (!E || E.done || b.over) return; const m = E.map;
    if (m.movers) for (const bl of b.buildings) if (bl.escMover) { const p = moverPos(bl.escMover, b.time); bl.x = p.x + bl.escOff[0]; bl.y = p.y + bl.escOff[1]; } // 겹친 캐릭터는 다음 스텝 엔진 벽 처리(resolveBuildings)로 밀려나며 튕김
    for (const u of b.u) {
      if (u.dead || u.esDone) { u.terrainMul = 1; continue; }
      let c = Math.floor(u.x / TILE), r = Math.floor(u.y / TILE), ch = tileCh(m, c, r);
      if (!u.airborne && ONEWAY[ch] && u.esC != null && (u.esC !== c || u.esR !== r) && tileCh(m, u.esC, u.esR) !== ch) { // 일방통행 칸에 새로 들어오는 순간만 판정
        const D = ONEWAY[ch], mx = u.x - u.esX, my = u.y - u.esY, ml = Math.hypot(mx, my);
        const vx = ml > 1e-6 ? mx / ml : Math.cos(u.dir), vy = ml > 1e-6 ? my / ml : Math.sin(u.dir); // 실제 이동 방향 기준
        if (vx * D[0] + vy * D[1] < ONEWAY_ALIGN) { // 다른 방향 → 벽처럼 튕김 (직전 위치로 되돌리고 들어온 면 기준 반사)
          let nx = Math.sign(u.esC - c), ny = Math.sign(u.esR - r); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          u.x = u.esX; u.y = u.esY;
          if (b.time - (u.esOwT || -9) > 0.15) { u.esOwT = b.time; b.wallImpact(u, nx, ny); }
          let dx = Math.cos(u.dir), dy = Math.sin(u.dir); const dot = dx * nx + dy * ny;
          if (dot < 0) { dx -= 2 * dot * nx; dy -= 2 * dot * ny; u.dir = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5; }
          const a = u.action; if (a && (a.type === 'dash' || a.type === 'chase' || a.type === 'charge')) u.action = null;
          c = u.esC; r = u.esR; ch = tileCh(m, c, r);
        }
      }
      let mul = 1;
      if (!u.airborne && ONEWAY[ch]) { const D = ONEWAY[ch]; if (Math.cos(u.dir) * D[0] + Math.sin(u.dir) * D[1] >= ONEWAY_ALIGN) mul = ONEWAY_SPD; }
      const wet = !u.airborne && ch === '~' && !waterproof(u);
      if (wet) {
        mul *= WATER.spd; u.esO2 = (u.esO2 == null ? WATER.o2 : u.esO2) - WATER.drain * dt;
        if (u.esO2 <= 0) { u.esO2 = 0; u.esDrT = (u.esDrT || 0) - dt; if (u.esDrT <= 0) { u.esDrT = WATER.tick; drown(b, u); if (b.over) return; } }
      } else if (u.esO2 != null) { u.esO2 += WATER.regen * dt; u.esDrT = 0; if (u.esO2 >= WATER.o2) u.esO2 = null; }
      u.terrainMul = mul;
      u.esX = u.x; u.esY = u.y; u.esC = c; u.esR = r;
    }
  }
  function drown(b, u) { // 익사 피해: '서로 피해 0' 과 무관하게 직접 HP 감소
    const dmg = Math.max(1, Math.ceil(u.maxHp * WATER.dmgFrac)); u.hp -= dmg; u.flash = 0.12;
    b.text(u.x, u.y - 40, String(dmg), '#9fd8ff', 15);
    for (let i = 0; i < 3; i++) b.parts.push({ x: u.x - 5 + i * 5, y: u.y - 14 - i * 6, vx: 0, vy: -30, life: 0.6, max: 0.6, color: '#d8f4ff', size: 2, glow: true });
    if (u.hp > 0) return;
    const other = b.u.find(x => !x.summon && x.team !== u.team);
    b.kill(u, other || u);
    if (!u.summon) finish(b, other || u, `${nameOf(u)} 익사 — 탈출 실패`, false);
  }
  // 파괴벽: 캐릭터 몸 충돌('bump'·'dash')만 반영. hits = 1번 부딪힐 때마다 1, hp = 엔진 충돌 피해만큼 (공격·투사체는 무시)
  const oHB = Battle.prototype.hitBuilding; Battle.prototype.hitBuilding = function (bl, dmg, strong, x, y, src, kind) {
    if (!bl || !bl.escBreak) return oHB.apply(this, arguments);
    if (bl.dead || (kind !== 'bump' && kind !== 'dash')) return;
    bl.hp -= bl.escBreak === 'hits' ? 1 : Math.max(1, Math.round(dmg)); bl.hitT = 0.15;
    for (let i = 0; i < 3; i++) this.parts.push({ x: x ?? bl.x + bl.w / 2, y: y ?? bl.y, vx: (i - 1) * 50, vy: -60 - i * 15, g: 360, life: 0.4, max: 0.4, color: ['#a8885e', '#7a5a3e'][i % 2], size: 2 });
    if (bl.hp <= 0) { bl.hp = 0; bl.dead = true; bl.collapseT = this.time; const cx = bl.x + bl.w / 2, cy = bl.y + bl.h / 2; this.debris(cx, cy, 14); this.smoke(cx, cy - 8, '#a89c8c', 8); }
  };
  // 피해 0 옵션: 탈출맵에서만, 모든 유닛 피해 무효
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o) { if (this.escape && this.escape.map.rules.noDamage) return 0; return oDmg.apply(this, arguments); };
  const oFix = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o) { if (this.escape && this.escape.map.rules.noDamage) return 0; return oFix.apply(this, arguments); };
  // 도착한 캐릭터는 다른 캐릭터와 부딪히지 않음 (출구를 막지 않도록)
  const oCol = Battle.prototype.collide; Battle.prototype.collide = function (a, c) {
    if (this.escape && (a.esDone || c.esDone)) return;
    const R = this.escape && this.escape.rec; if (!R) return oCol.apply(this, arguments);
    const ax = a.x, ay = a.y, out = oCol.apply(this, arguments); // 위치가 밀렸으면 실제 충돌 → 기록만 (동작 영향 없음)
    if (a.x !== ax || a.y !== ay) recHit(this, R, a, (a.x + c.x) / 2, (a.y + c.y) / 2, 1);
    return out;
  };
  // 미리보기용 충돌 기록 (runHeadless 에서만 켜짐): 벽에 붙어 미끄러지는 동안 매 프레임 쌓이지 않게 유닛별 0.25초/24px 간격
  function recHit(b, R, u, x, y, kind) {
    if (R.length >= 4000) return; const k = u.team + ':' + kind, L = R.last || (R.last = {}), p = L[k];
    if (p && b.time - p.t < 0.25 && Math.hypot(x - p.x, y - p.y) < 24) return;
    L[k] = { t: b.time, x, y }; R.push([Math.round(x), Math.round(y), kind]);
  }
  const oWall = Battle.prototype.wallImpact; Battle.prototype.wallImpact = function (u, nx, ny) {
    const R = this.escape && this.escape.rec; if (R && !u.summon) recHit(this, R, u, u.x - nx * 11, u.y - 4 - ny * 11, 0);
    return oWall.apply(this, arguments);
  };
  // ---------- 미리보기: 충돌이 가장 많은 320x240 구역 (타일 단위 정렬, 결정적) ----------
  const PV_W = 320, PV_H = 240, PV_MIN_HITS = 3;
  function preview(src, hits) {
    const m = normalize(src), T = TILE, cols = Math.ceil(m.w / T), rows = Math.ceil(m.h / T);
    const W = Math.min(PV_W, m.w), H = Math.min(PV_H, m.h), H2 = Array.isArray(hits) ? hits : [];
    let best = null;
    for (let y = 0; y + H <= m.h; y += T) for (let x = 0; x + W <= m.w; x += T) { // 위→아래, 왼→오른쪽 순서로 첫 최댓값 (동점이면 먼저 나온 곳)
      let n = 0; for (const h of H2) if (h[0] >= x && h[0] < x + W && h[1] >= y && h[1] < y + H) n++;
      if (!best || n > best.n) best = { x, y, n };
    }
    let kind = 'hits';
    if (!best || best.n < PV_MIN_HITS) { // 충돌이 거의 없음 → 출구 주변
      kind = 'exit'; const ex = m.exit.x + m.exit.w / 2, ey = m.exit.y + m.exit.h / 2; best = null;
      for (let y = 0; y + H <= m.h; y += T) for (let x = 0; x + W <= m.w; x += T) { // 출구 중심을 품은 구역 중 벽이 가장 많은 곳 (빈 화면 방지)
        if (ex < x || ex >= x + W || ey < y || ey >= y + H) continue;
        let wN = 0; for (let r = y / T; r < (y + H) / T; r++) for (let c = x / T; c < (x + W) / T; c++) if (m.grid[r] && m.grid[r][c] === '#') wN++;
        const dd = Math.abs(x + W / 2 - ex) + Math.abs(y + H / 2 - ey); // 동점이면 출구가 가운데에 가까운 쪽
        if (!best || wN > best.wN || (wN === best.wN && dd < best.dd)) best = { x, y, wN, dd };
      }
      if (!best) best = { x: 0, y: 0 }; else { delete best.wN; delete best.dd; }
      best.n = H2.filter(h => h[0] >= best.x && h[0] < best.x + W && h[1] >= best.y && h[1] < best.y + H).length;
    }
    const c0 = best.x / T, r0 = best.y / T, cw = Math.ceil(W / T), rh = Math.ceil(H / T);
    const grid = m.grid.slice(r0, r0 + rh).map(row => row.slice(c0, c0 + cw));
    const inR = (x, y) => x >= best.x && x < best.x + W && y >= best.y && y < best.y + H;
    const pts = H2.filter(h => inR(h[0], h[1])).slice(0, 60).map(h => [h[0] - best.x, h[1] - best.y, h[2]]);
    const ex = m.exit, ix = Math.max(ex.x, best.x), iy = Math.max(ex.y, best.y), ix2 = Math.min(ex.x + ex.w, best.x + W), iy2 = Math.min(ex.y + ex.h, best.y + H);
    return { v: 1, kind, x: best.x, y: best.y, w: W, h: H, hits: best.n, total: H2.length, grid,
      starts: m.starts.map((p, i) => inR(p.x, p.y) ? [p.x - best.x, p.y - best.y, i] : null).filter(Boolean),
      exit: ix2 > ix && iy2 > iy ? [ix - best.x, iy - best.y, ix2 - ix, iy2 - iy] : null, pts, mw: m.w, mh: m.h,
      ...(m.breakables ? { brk: m.breakables.filter(k => inR(k.c * T + 1, k.r * T + 1)).slice(0, 48).map(k => [k.c - c0, k.r - r0]) } : {}),
      ...(m.movers ? { mov: m.movers.flatMap(mv => { const p = moverPos(mv, 0); return moverRects(mv).map(q => [p.x + q.dx * T - best.x, p.y + q.dy * T - best.y, q.w * T, q.h * T]); }).filter(q => q[0] < W && q[1] < H && q[0] + q[2] > 0 && q[1] + q[3] > 0) } : {}) };
  }
  function drawPreview(cv, pv) { // pv → 캔버스 (벽 / S / E / 충돌 점 + 구석에 전체 맵 속 위치)
    const ctx = cv.getContext('2d'), Wc = cv.width, Hc = cv.height, k = Math.min(Wc / pv.w, Hc / pv.h);
    ctx.fillStyle = '#2a2f40'; ctx.fillRect(0, 0, Wc, Hc);
    ctx.save(); ctx.translate((Wc - pv.w * k) / 2, (Hc - pv.h * k) / 2); ctx.scale(k, k);
    ctx.fillStyle = '#3a4058'; ctx.fillRect(0, 0, pv.w, pv.h);
    if (pv.exit) { ctx.fillStyle = 'rgba(90,220,140,.45)'; ctx.fillRect(pv.exit[0], pv.exit[1], pv.exit[2], pv.exit[3]); }
    (pv.grid || []).forEach((row, r) => { for (let c = 0; c < row.length; c++) { const ch = row[c]; if (ch === '#') { ctx.fillStyle = '#9aa3bd'; ctx.fillRect(c * TILE, r * TILE, TILE, TILE); } else if (ch !== '.') drawSpecial(ctx, c * TILE, r * TILE, ch, 0); } });
    ctx.fillStyle = '#a8885e'; for (const k of pv.brk || []) ctx.fillRect(k[0] * TILE + 2, k[1] * TILE + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = 'rgba(255,196,40,.8)'; for (const q of pv.mov || []) ctx.fillRect(q[0], q[1], q[2], q[3]);
    for (const p of pv.pts || []) { ctx.fillStyle = p[2] ? 'rgba(255,207,74,.85)' : 'rgba(255,90,90,.85)'; ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (pv.exit) { ctx.fillStyle = '#c8ffd9'; ctx.fillText('E', pv.exit[0] + pv.exit[2] / 2, pv.exit[1] + pv.exit[3] / 2); }
    for (const s of pv.starts || []) { ctx.fillStyle = s[2] ? '#7fb2ff' : '#ff8a8a'; ctx.beginPath(); ctx.arc(s[0], s[1], 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillText('S', s[0], s[1] + 1); }
    ctx.restore();
    if (pv.mw && pv.mh) { const mk = 34 / pv.mh, mw = pv.mw * mk, x0 = Wc - mw - 3, y0 = 3; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x0, y0, mw, 34); ctx.fillStyle = '#556080'; ctx.fillRect(x0 + 1, y0 + 1, mw - 2, 32); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 1; ctx.strokeRect(x0 + pv.x * mk, y0 + pv.y * mk, Math.max(2, pv.w * mk), Math.max(2, pv.h * mk)); }
  }

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
    step(b, dt) { if (b.escape) { escWorld(b, dt); escStep(b, dt); } },
    drawUnder(ctx, b) {
      if (!b.escape) return; const m = b.escape.map, T = floorTile();
      if (T) { ctx.fillStyle = ctx.createPattern(T, 'repeat'); } else ctx.fillStyle = '#2b2f3f';
      ctx.fillRect(0, 0, m.w, m.h);
      ctx.strokeStyle = '#5a6080'; ctx.lineWidth = 4; ctx.strokeRect(-2, -2, m.w + 4, m.h + 4);
      for (const [c, r, ch] of b.escape.special || []) drawSpecial(ctx, c * TILE, r * TILE, ch, b.time);
      m.starts.forEach((s, i) => { ctx.strokeStyle = i ? 'rgba(255,140,140,.6)' : 'rgba(140,180,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(s.x, s.y, 14, 6, 0, 0, Math.PI * 2); ctx.stroke(); });
      drawExit(ctx, b);
    },
    drawOver(ctx, b) { // 물속 산소 막대 (산소가 줄었을 때만)
      if (!b.escape) return;
      for (const u of b.u) if (u.esO2 != null && !u.dead) { const k = u.esO2 / WATER.o2, x = u.x - 14, y = u.y - 58; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 1, y - 1, 30, 5); ctx.fillStyle = k > 0 ? '#7fd4ff' : '#ff6a6a'; ctx.fillRect(x, y, 28 * Math.max(k, k > 0 ? 0.04 : 1), 3); }
    }
  });
  function drawSpecial(ctx, x, y, ch, t) { // 물 / 일방통행 칸 (실행 화면·편집기 공용)
    if (ch === '~') {
      ctx.fillStyle = '#1f5f9a'; ctx.fillRect(x, y, TILE, TILE); ctx.strokeStyle = 'rgba(180,225,255,.45)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let k = 0; k < 2; k++) { const yy = y + 12 + k * 16, ph = (t || 0) * 2 + x * 0.05 + k; ctx.moveTo(x + 4, yy + Math.sin(ph) * 2); ctx.quadraticCurveTo(x + 20, yy - 4 + Math.sin(ph) * 2, x + 36, yy + Math.sin(ph) * 2); }
      ctx.stroke(); return;
    }
    const D = ONEWAY[ch]; if (!D) return;
    ctx.fillStyle = 'rgba(120,90,200,.35)'; ctx.fillRect(x, y, TILE, TILE); ctx.strokeStyle = 'rgba(190,160,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    ctx.save(); ctx.translate(x + TILE / 2, y + TILE / 2); ctx.rotate(Math.atan2(D[1], D[0])); ctx.fillStyle = 'rgba(225,210,255,.9)';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-2, -10); ctx.lineTo(-2, -4); ctx.lineTo(-12, -4); ctx.lineTo(-12, 4); ctx.lineTo(-2, 4); ctx.lineTo(-2, 10); ctx.closePath(); ctx.fill(); ctx.restore();
  }

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
      b = new Battle(a, d, { mode: m.rules.type }, 'arena'); apply(b, m); if (o.track !== false) b.escape.rec = [];
      const maxT = m.timeLimit + 1;
      while (!b.escape.done && !b.over && b.time < maxT && steps < maxT * 360) { /* 정지 연출 중엔 b.time 이 멈추므로 스텝 상한은 넉넉히 */ b.update(STEP); steps++; }
    } finally { Math.random = orig; if (S) S.play = sp; }
    const E = b.escape;
    return { clear: !!E.clear, seed: m.seed, result: E.result || (b.over ? 'KO로 종료' : '미종료'), steps, time: +b.time.toFixed(4), arrived: E.arrived, pos: b.u.filter(u => !u.summon).map(u => [+u.x.toFixed(2), +u.y.toFixed(2)]), preview: E.rec ? preview(m, E.rec) : null };
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

  G.ESCAPE = { FORMAT, VERSION, TILE, SIZES, DEF_TIME, MAX_TIME, normalize, toJSON, mergeGrid, emptyGrid, apply, runHeadless, findSeed, updateCam, sampleMap, mkRng, preview, drawPreview, moverPos, moverRects, drawSpecial, WATER, ONEWAY, ONEWAY_ALIGN, ONEWAY_SPD, LIM };
})(typeof window !== 'undefined' ? window : globalThis);
