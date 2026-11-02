// ===== 탈출맵 (1단계) =====
// 큰 맵 + 벽(축정렬 사각형) + 시작 지점 2개 + 출구. 캐릭터는 결정적 격자 경로탐색(Dijkstra 거리장)으로 자동 이동.
// 구성: [코어] DOM/캔버스 없이 동작 (Node vm / 헤드리스에서 runHeadless 로 검증 가능)  [UI] 편집기·진입 화면 (document 있을 때만)
// A/B 일반 전투에는 영향 없음: 모든 훅은 b.escape 가 있을 때만 동작.
(function (G) {
  'use strict';
  const FORMAT = 'psescape', VERSION = 1, CELL = 8, STEP = 1 / 120;
  const SIZES = [[720, 1280], [1080, 1920], [1440, 2560]];
  const DEF_RULES = { goal: 'race', noDamage: true, noAttack: false, speedMul: 1, type: 'A' }; // 기본: 먼저 도착 승리 · 서로 피해 0 만 켬
  const DEF_TIME = 120;

  // ---------- 맵 JSON 정규화/검증 ----------
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  function normalize(src) {
    const m = typeof src === 'string' ? JSON.parse(src) : src;
    if (!m || typeof m !== 'object') throw new Error('맵 JSON 이 아님');
    if (m.format && m.format !== FORMAT) throw new Error('format 이 psescape 가 아님');
    if (m.v != null && m.v > VERSION) throw new Error('더 새로운 버전의 맵 (v' + m.v + ')');
    const w = Math.round(num(m.w, 1080)), h = Math.round(num(m.h, 1920));
    if (w < 360 || h < 640 || w > 4000 || h > 6000) throw new Error('맵 크기 범위 밖 (360x640 ~ 4000x6000)');
    const rect = (r, minS) => { const x = Math.round(num(r.x, 0)), y = Math.round(num(r.y, 0)); return { x, y, w: Math.max(minS, Math.round(num(r.w, minS))), h: Math.max(minS, Math.round(num(r.h, minS))) }; };
    const walls = (Array.isArray(m.walls) ? m.walls : []).slice(0, 2000).map(r => rect(r, 8));
    const st = Array.isArray(m.starts) ? m.starts : [];
    const starts = [0, 1].map(i => { const s = st[i] || st[0] || { x: w / 2 + (i ? 24 : -24), y: h - 80 }; return { x: Math.round(num(s.x, w / 2)), y: Math.round(num(s.y, h - 80)) }; });
    const exit = rect(m.exit || { x: w / 2 - 32, y: 40, w: 64, h: 64 }, 24);
    const R = Object.assign({}, DEF_RULES, m.rules || {});
    const rules = { goal: R.goal === 'coop' ? 'coop' : 'race', noDamage: !!R.noDamage, noAttack: !!R.noAttack, speedMul: Math.min(4, Math.max(0.25, num(+R.speedMul, 1))), type: R.type === 'B' ? 'B' : 'A' };
    const chars = (Array.isArray(m.chars) ? m.chars : []).slice(0, 2).map(String);
    while (chars.length < 2) chars.push(chars[0] || 'swordsman');
    return { format: FORMAT, v: VERSION, name: String(m.name || '이름 없는 탈출맵').slice(0, 40), w, h, walls, starts, exit, chars, seed: (num(m.seed, 12345) >>> 0), timeLimit: Math.min(900, Math.max(10, num(m.timeLimit, DEF_TIME))), rules };
  }

  const EXIT_IN = 6; // 발 위치가 출구 안쪽 6px 이상 들어와야 도착
  const inExit = (E, x, y) => x > E.x + EXIT_IN && x < E.x + E.w - EXIT_IN && y > E.y + EXIT_IN && y < E.y + E.h - EXIT_IN;
  // ---------- 격자 + 거리장 (유닛 반경별 캐시) ----------
  // 유닛 충돌 판정과 같은 기준: 중심 (x, y-4), 반경 11+pad 이 벽 사각형과 겹치지 않을 것 (+2 여유)
  function buildField(m, pad, extra) {
    const cols = Math.ceil(m.w / CELL), rows = Math.ceil(m.h / CELL), N = cols * rows;
    const free = new Uint8Array(N), R = 11 + pad + 2;
    const L = 14 + pad, Rr = m.w - 14 - pad, T = 26 + pad, B = m.h - 8 - pad * 0.5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2; free[r * cols + c] = x >= L && x <= Rr && y >= T && y <= B ? 1 : 0; }
    for (const wl of extra ? m.walls.concat(extra) : m.walls) {
      const c0 = Math.max(0, Math.floor((wl.x - R) / CELL)), c1 = Math.min(cols - 1, Math.floor((wl.x + wl.w + R) / CELL));
      const r0 = Math.max(0, Math.floor((wl.y - R + 4) / CELL)), r1 = Math.min(rows - 1, Math.floor((wl.y + wl.h + R + 4) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2 - 4;
        const qx = Math.min(Math.max(x, wl.x), wl.x + wl.w), qy = Math.min(Math.max(y, wl.y), wl.y + wl.h);
        if ((x - qx) ** 2 + (y - qy) ** 2 < R * R) free[r * cols + c] = 0;
      }
    }
    // Dijkstra (직선 2, 대각 3; 모서리 끼기 금지). 동률은 인덱스 순 → 완전 결정적
    const dist = new Int32Array(N).fill(-1), heap = [];
    const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (less(heap[k], heap[p])) { [heap[k], heap[p]] = [heap[p], heap[k]]; k = p; } else break; } };
    const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let s = k; if (l < heap.length && less(heap[l], heap[s])) s = l; if (r < heap.length && less(heap[r], heap[s])) s = r; if (s === k) break; [heap[k], heap[s]] = [heap[s], heap[k]]; k = s; } } return top; };
    const E = m.exit; let targets = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c, x = c * CELL + CELL / 2, y = r * CELL + CELL / 2; if (free[i] && inExit(E, x, y)) { dist[i] = 0; push(0, i); targets++; } }
    const done = new Uint8Array(N);
    while (heap.length) {
      const [d, i] = pop(); if (done[i]) continue; done[i] = 1;
      const c = i % cols, r = (i - c) / cols;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nc = c + dx, nr = r + dy; if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc; if (!free[j] || done[j]) continue;
        if (dx && dy && (!free[r * cols + nc] || !free[nr * cols + c])) continue;
        const nd = d + (dx && dy ? 3 : 2); if (dist[j] < 0 || nd < dist[j]) { dist[j] = nd; push(nd, j); }
      }
    }
    return { cols, rows, free, dist, targets, pad };
  }
  function fieldFor(E, pad) { const k = Math.round(pad * 10); return E.fields[k] || (E.fields[k] = buildField(E.map, pad, E.extra)); }
  // 전투 중 생긴 임시 장애물 (군장·암반·공허 등)이 바뀌면 거리장을 다시 계산 (결정적: 건물 목록만으로 결정)
  function syncExtra(b) {
    const E = b.escape, L = b.buildings.filter(o => !o.dead && !o.escWall), sig = L.map(o => `${o.x | 0},${o.y | 0},${o.w | 0},${o.h | 0}`).join(';');
    if (sig !== E.sig) { E.sig = sig; E.extra = L.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })); E.fields = {}; E.rebuilds++; }
  }
  const cellOf = (F, x, y) => { const c = Math.floor(x / CELL), r = Math.floor(y / CELL); return c < 0 || r < 0 || c >= F.cols || r >= F.rows ? -1 : r * F.cols + c; };
  const cellC = (F, i) => { const c = i % F.cols; return [c * CELL + CELL / 2, (i - c) / F.cols * CELL + CELL / 2]; };
  function los(F, x0, y0, x1, y1) { const L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L / 4); for (let k = 1; k <= n; k++) { const i = cellOf(F, x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); if (i < 0 || !F.free[i]) return false; } return true; }
  function nextDown(F, i) { const c = i % F.cols, r = (i - c) / F.cols; let best = -1, bd = F.dist[i]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nc = c + dx, nr = r + dy; if (nc < 0 || nr < 0 || nc >= F.cols || nr >= F.rows) continue; const j = nr * F.cols + nc; if (F.dist[j] >= 0 && F.dist[j] < bd) { bd = F.dist[j]; best = j; } } return best; }
  // 웨이포인트: 거리장 하강 사슬을 따라가며 직선 시야가 닿는 가장 먼 칸 (최대 40칸 앞)
  function waypoint(F, u, E) {
    let i = cellOf(F, u.x, u.y);
    if (i < 0 || F.dist[i] < 0) { // 벽 여유 영역 안으로 밀려났거나 격자 밖 → 주변에서 가장 가까운(거리장 최소) 칸으로
      const c0 = Math.floor(u.x / CELL), r0 = Math.floor(u.y / CELL); let best = -1;
      for (let rad = 1; rad <= 8 && best < 0; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) { const c = c0 + dc, r = r0 + dr; if (c < 0 || r < 0 || c >= F.cols || r >= F.rows) continue; const j = r * F.cols + c; if (F.dist[j] >= 0 && (best < 0 || F.dist[j] < F.dist[best])) best = j; }
      return best < 0 ? null : cellC(F, best);
    }
    if (F.dist[i] === 0) return [E.x + E.w / 2, E.y + E.h / 2];
    let tgt = i;
    for (let k = 0; k < 40; k++) { const n = nextDown(F, tgt); if (n < 0) break; const [cx, cy] = cellC(F, n); if (!los(F, u.x, u.y, cx, cy)) break; tgt = n; if (F.dist[n] === 0) break; }
    if (tgt === i) { const n = nextDown(F, i); if (n >= 0) tgt = n; }
    return cellC(F, tgt);
  }

  // ---------- 벽 건물 ----------
  function drawWall(ctx, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(w.x + 4, w.y + 4, w.w, w.h);
    ctx.fillStyle = '#4b4f63'; ctx.fillRect(w.x, w.y - 10, w.w, w.h);
    ctx.fillStyle = '#5d6279'; ctx.fillRect(w.x, w.y - 10, w.w, 2);
    ctx.fillStyle = '#33364a'; ctx.fillRect(w.x, w.y + w.h - 10, w.w, 10);
    ctx.fillStyle = '#272a3a'; for (let x = w.x + 8; x < w.x + w.w; x += 16) ctx.fillRect(x, w.y + w.h - 10, 1, 10);
    if (w.hitT > 0) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(w.x, w.y - 10, w.w, w.h); }
  }
  const mkWall = (r, i) => ({ x: r.x, y: r.y, w: r.w, h: r.h, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, solid: true, escWall: true, style: i % 3, cracks: [[], [], []], rubble: [], windows: [], draw: drawWall });

  // ---------- 전투에 탈출 규칙 적용 (new Battle 직후, 같은 시드 구간 안에서 호출) ----------
  function apply(b, src) {
    const m = normalize(src);
    const E = b.escape = { map: m, fields: {}, arrived: [], done: false, result: null, aiErr: 0, sig: '', extra: null, rebuilds: 0 };
    b.play = { x: 0, y: 0, w: m.w, h: m.h };
    b.buildings = m.walls.map(mkWall);
    const mains = b.u.filter(u => !u.summon);
    mains.forEach((u, k) => {
      const s = m.starts[u.team] || m.starts[k % 2];
      u.x = s.x; u.y = s.y; const p = b.clampPos(u.x, u.y, u.pad, u); u.x = p.x; u.y = p.y; b.resolveBuildings(u);
      if (m.rules.speedMul !== 1) u.st.spd *= m.rules.speedMul;
      const wp = waypoint(fieldFor(E, u.pad), u, m.exit); if (wp) u.dir = Math.atan2(wp[1] - u.y, wp[0] - u.x);
    });
    if (m.rules.noAttack) for (const u of b.u) lockAttack(u);
    b.resultText = () => E.result || null;
    b.cam = null; // 렌더 카메라는 updateCam 이 채움 (시각 전용)
    return E;
  }
  function lockAttack(u) { for (let i = 0; i < u.skillT.length; i++) u.skillT[i] = Math.max(u.skillT[i], 1); u.atkT = Math.max(u.atkT || 0, 1); u.bumpT = Math.max(u.bumpT || 0, 1); }
  const nameOf = u => (u.def && u.def.name) || '캐릭터';
  function finish(b, winner, text, clear) { const E = b.escape; E.done = true; E.clear = clear; E.result = text; E.endTime = b.time; b.over = true; b.endT = 0; b.winner = winner; }

  function escStep(b, dt) {
    const E = b.escape; if (!E || E.done || b.over) return;
    const m = E.map, X = m.exit;
    syncExtra(b);
    for (const u of b.u) {
      if (m.rules.noAttack) lockAttack(u);
      if (u.summon || u.dead) continue;
      if (u.esDone) { u.moving = false; continue; }
      if (inExit(X, u.x, u.y)) {
        u.esDone = true; u.esT = b.time; u.st.spd = 0; E.arrived.push({ team: u.team, id: u.def.id, t: +b.time.toFixed(4) });
        b.text(u.x, u.y - 60, '탈출!', '#7dffb0', 11);
        continue;
      }
      if (u.action || u.push || u.pull || u.airborne || u.air || u.blocked('blocksMove')) continue; // 돌진/순간이동/넉백 중에는 건드리지 않음 → 끝난 위치에서 다시 경로 계산
      // 끼임 방지: 1초 동안 6px 도 못 움직였으면 0.4초간 옆으로 비켜 감 (좌/우 번갈아, 결정적)
      if (u.esChk == null) { u.esChk = b.time + 1; u.esPos = [u.x, u.y]; u.esSide = 1; }
      if (b.time >= u.esChk) { if (Math.hypot(u.x - u.esPos[0], u.y - u.esPos[1]) < 6) { u.esSlip = b.time + 0.4; u.esSide = -u.esSide; } u.esChk = b.time + 1; u.esPos = [u.x, u.y]; }
      try { const wp = waypoint(fieldFor(E, u.pad), u, X); if (wp) u.dir = Math.atan2(wp[1] - u.y, wp[0] - u.x) + (u.esSlip > b.time ? u.esSide * Math.PI / 2 : 0); }
      catch (err) { E.aiErr++; if (E.aiErr < 4) console.warn('escape AI error', err); }
    }
    const mains = b.u.filter(u => !u.summon);
    if (m.rules.goal === 'race' && E.arrived.length) { const w = mains.find(u => u.esDone && u.team === E.arrived[0].team); return finish(b, w, `${nameOf(w)} 탈출 성공! (${E.arrived[0].t.toFixed(1)}초)`, true); }
    if (m.rules.goal === 'coop' && mains.every(u => u.esDone)) { const w = mains.slice().sort((a, c) => c.esT - a.esT)[0]; return finish(b, w, `모두 탈출 성공! 협동 클리어 (${b.time.toFixed(1)}초)`, true); }
    if (m.rules.goal === 'coop' && mains.some(u => u.dead && !u.esDone)) return finish(b, mains.find(u => !u.dead) || mains[0], '탈출 실패 — 동료가 쓰러짐', false);
    if (b.time >= m.timeLimit) return finish(b, mains.find(u => !u.dead) || mains[0], `탈출 실패 — 시간 초과 (${m.timeLimit}초)`, false);
  }

  // 피해 0 옵션: 탈출맵에서만, 캐릭터 간 피해 무효 (벽/자해 포함 모든 유닛 피해)
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o) { if (this.escape && this.escape.map.rules.noDamage) return 0; return oDmg.apply(this, arguments); };
  const oFix = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o) { if (this.escape && this.escape.map.rules.noDamage) return 0; return oFix.apply(this, arguments); };

  // 도착한 캐릭터는 다른 캐릭터와 부딪히지 않음 (좁은 출구를 막지 않도록)
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

  // ---------- 헤드리스 실행: 맵 JSON → 클리어 여부 + 도달 스텝 (결정적) ----------
  const mkRng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }; // main.js 와 동일
  function pathCheck(src) {
    const m = normalize(src), out = { ok: true, chars: [] };
    for (let k = 0; k < 2; k++) {
      const def = CHARACTERS.find(c => c.id === m.chars[k]); if (!def) { out.ok = false; out.chars.push({ id: m.chars[k], err: '캐릭터 없음' }); continue; }
      const pad = new Unit(def, k).pad, F = buildField(m, pad), s = m.starts[k];
      let i = cellOf(F, s.x, s.y); const reach = i >= 0 && F.dist[i] >= 0;
      out.chars.push({ id: def.id, pad, reach, exitCells: F.targets, steps: reach ? F.dist[i] : null }); if (!reach) out.ok = false;
    }
    return out;
  }
  function runHeadless(src, o = {}) {
    const m = normalize(src), a = CHARACTERS.find(c => c.id === m.chars[0]), d = CHARACTERS.find(c => c.id === m.chars[1]);
    if (!a || !d) return { clear: false, error: '캐릭터 없음' };
    const S = G.Sfx, sp = S && S.play, orig = Math.random; if (S) S.play = () => {};
    Math.random = mkRng(m.seed);
    let b, steps = 0;
    try {
      b = new Battle(a, d, { mode: m.rules.type }, 'arena'); apply(b, m);
      const maxT = m.timeLimit + 1;
      while (!b.escape.done && !b.over && b.time < maxT && steps < maxT * 120 + 10) { b.update(STEP); steps++; }
    } finally { Math.random = orig; if (S) S.play = sp; }
    const E = b.escape;
    return { clear: !!E.clear, result: E.result || (b.over ? 'KO로 종료' : '미종료'), steps, time: +b.time.toFixed(4), arrived: E.arrived, aiErr: E.aiErr, rebuilds: E.rebuilds, pos: b.u.filter(u => !u.summon).map(u => [+u.x.toFixed(2), +u.y.toFixed(2)]) };
  }

  function sampleMap() { // 1080x1920 기본 미로
    const w = 1080, h = 1920, walls = [];
    const band = (y, gapX, gw) => { if (gapX > 0) walls.push({ x: 0, y, w: gapX, h: 32 }); if (gapX + gw < w) walls.push({ x: gapX + gw, y, w: w - gapX - gw, h: 32 }); };
    band(1600, 760, 160); band(1260, 120, 160); band(920, 700, 200); band(580, 160, 160); band(300, 820, 160);
    walls.push({ x: 400, y: 1380, w: 32, h: 220 }, { x: 640, y: 1040, w: 240, h: 32 }, { x: 300, y: 700, w: 32, h: 220 }, { x: 520, y: 380, w: 200, h: 32 });
    return normalize({ name: '샘플 미로', w, h, walls, starts: [{ x: 200, y: 1820 }, { x: 880, y: 1820 }], exit: { x: 480, y: 60, w: 96, h: 80 }, chars: ['swordsman', 'assassin'], seed: 20261031, timeLimit: 120, rules: {} });
  }

  G.ESCAPE = { FORMAT, VERSION, CELL, SIZES, normalize, apply, runHeadless, pathCheck, updateCam, sampleMap, buildField, mkRng };
})(typeof window !== 'undefined' ? window : globalThis);
