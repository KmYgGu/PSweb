/* =========================================================
 * 전투 엔진 (시뮬레이션 + 렌더링). DOM 비의존 시뮬레이션: Battle.update(dt)
 * ========================================================= */
const W = 360, H = 640;
const AR = { x: 12, y: 120, w: 336, h: 410 };
const RAMP_START = 25, RAMP_RATE = 0.13; // 장기전 방지 피해 증가 (시작 초, 초당 증가율)
const PROJ_COL = { flame: '#ffae6b', holy: '#fff0a0', magic: '#a8d8ff', arrow: '#e8e0c8', arrowG: '#a8f07a' };
const TEAM_COL = ['#6aa8ff', '#ff7b7b'];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const playSfx = (name, o) => { if (window.Sfx) Sfx.play(name, o); };
// 스프라이트 좌우 배율: sprite.faces = { front: 'left'|'right', back: ... } (원본이 바라보는 방향). 없으면 원본은 오른쪽을 본다고 가정
const waterImmune = (u, z) => !!(z && (z.water || z.id === 'water') && u.def.traits && u.def.traits.includes('waterproof')); // 패시브 '오리'
const spriteSX = (def, back, facing) => { const F = def.sprite && def.sprite.faces; if (!F) return facing; return facing * (((back ? F.back : F.front) || 'right') === 'left' ? -1 : 1); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// 너무 수평/수직인 각도 방지 (벽에 붙어 미끄러지는 현상 방지)
function fixAngle(a) {
  let c = Math.cos(a), s = Math.sin(a);
  const m = 0.3;
  if (Math.abs(c) < m) c = Math.sign(c || 1) * m;
  if (Math.abs(s) < m) s = Math.sign(s || 1) * m;
  return Math.atan2(s, c);
}
// 건물 인스턴스 (균열/잔해 모양을 미리 생성)
function makeBuilding(def, i) {
  let seed = (i + 1) * 9301;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const b = { ...def, maxHp: def.hp, hp: def.hp, dead: false, hitT: 0, cracks: [], rubble: [], windows: [] };
  for (let s = 0; s < 3; s++) { // 균열 3단계
    const lines = [];
    for (let k = 0; k < 2; k++) {
      let x = def.x + 4 + rnd() * (def.w - 8), y = def.y - 14 + rnd() * (def.h * 0.6);
      const pts = [[x, y]];
      for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 10; y += 3 + rnd() * 5; pts.push([x, y]); }
      lines.push(pts);
    }
    b.cracks.push(lines);
  }
  for (let k = 0; k < 26; k++) b.rubble.push([def.x + rnd() * def.w, def.y + rnd() * def.h, 2 + rnd() * 5, 2 + rnd() * 4, Math.floor(rnd() * 3)]);
  for (let k = 0; k < 12; k++) b.windows.push(rnd() < 0.45);
  return b;
}
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

class Unit {
  constructor(def, team, slot = 0, n = 1) {
    this.def = def; this.team = team; this.slot = slot; this.n = n; // slot: 팀 내 순번, n: 팀 인원 (파라가스&브로리 = 2)
    this.gender = def.gender || 'male'; this.form = null; // form: 변신 정의 (전설의 슈퍼사이어인 등)
    this.st = { ...STAT_DEFAULTS, ...def.stats };
    this.maxHp = this.st.hp; this.hp = this.maxHp;
    this.x = team === 0 ? AR.x + 70 : AR.x + AR.w - 70;
    this.y = AR.y + AR.h / 2 + (team === 0 ? 50 : -50) + (n > 1 ? (slot ? 1 : -1) * 34 : 0);
    if (n > 1) this.x += (slot ? -1 : 1) * (team === 0 ? 14 : -14);
    this.facing = team === 0 ? 1 : -1;
    this.atkT = rand(0.6, 0.9);
    this.skills = def.skills || [];
    this.skillT = this.skills.map(s => s.cd * rand(0.35, 0.5));
    // 이동 방향 (각도). 대각선 위주로 출발
    this.dir = (team === 0 ? 0 : Math.PI) + (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1.0);
    this.bumpT = 0; this.boost = 0; this.trailT = 0;
    this.zone = null; this.o2 = null; this.o2Max = 3; this.o2Regen = 1.5; this.o2T = 0; this.rippleT = 0; this.bldT = -1;
    this.statuses = []; this.flash = 0; this.buffs = []; this.action = null;
    this.walk = 0; this.moving = false; this.dead = false; this.deadT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = rand(1, 2.5);
    this.swing = 0; this.kx = 0; this.ky = 0;
    this.res = {}; for (const k in (def.resources || {})) this.res[k] = def.resources[k].start || 0; // 범용 자원
  }
  buff(t) { return this.buffs.find(b => b.type === t); }
  status(id) { return this.statuses.find(s => s.id === id); }
  // 상태이상 질의: 플래그(true 또는 함수) / 배율 / 최대값
  blocked(k) {
    for (const s of this.statuses) { const d = STATUS_DEFS[s.id], v = d && d[k]; if (v === true || (typeof v === 'function' && v(this, s))) return true; }
    return false;
  }
  smult(k) { let m = 1; for (const s of this.statuses) { const d = STATUS_DEFS[s.id]; if (d && d[k] != null) m *= d[k]; } return m; }
  smax(k) { let m = 0; for (const s of this.statuses) { const d = STATUS_DEFS[s.id]; if (d && d[k] != null) m = Math.max(m, d[k]); } return m; }
  get stun() { return this.blocked('blocksAct'); }
  get airborne() { return !!this.air; } // 공중 상태 (트램펄린 등)
  mult(k) { let m = 1; for (const b of this.buffs) if (b[k] != null) m *= b[k]; return m; }
  get speed() { return this.st.spd * this.mult('spdMul') * this.smult('spdMul') * (1 + this.boost) * ((this.zone && !waterImmune(this, this.zone) && this.zone.spdMul) || 1) * ((this.barrier && this.barrier.spdMul) || 1) * (this.terrainMul || 1); }
  get atkRate() { return this.st.atkRate * this.mult('atkRateMul'); }
  get reach() { return this.st.range + 20 + this.pad; }
  get pad() { return 15 * (this.size - 1); } // 큰 캐릭터 추가 반경
  get size() { return (this.form && this.form.size) || this.def.size || 1; } // 충돌 반경 배율 (변신 시 form.size)
  get fdef() { return this.form || (this.oni && this.def.oni ? this.def.oni.form : this.def); } // 현재 스프라이트 정의
}

class Battle {
  constructor(defA, defB, hooks = {}, stageId = 'arena') {
    // 팀 구성: def.partner 가 있으면 [partner, def] 2인 팀 (파라가스 & 브로리). 그 외는 기존 1v1 그대로
    const squad = d => d.partner ? [d.partner, d] : [d], A = squad(defA), B = squad(defB);
    this.u = [...A.map((d, i) => new Unit(d, 0, i, A.length)), ...B.map((d, i) => new Unit(d, 1, i, B.length))];
    this.multi = this.u.length > 2;
    this.stageId = STAGE_DEFS[stageId] ? stageId : 'arena';
    this.stage = STAGE_DEFS[this.stageId];
    this.buildings = (this.stage.buildings || []).map((b, i) => makeBuilding(b, i));
    this.rules = { bumpDmg: 8, bumpSpeedK: 0.03, projK: 0.6, meleeK: 0.5, strongMin: 60, ...(this.stage.buildingRules || {}) };
    if (this.stage.spawns) this.u.forEach(u => { const s = this.stage.spawns[u.team]; u.x = s.x + (u.n > 1 ? (u.slot ? -1 : 1) * (u.team ? -12 : 12) : 0); u.y = s.y + (u.n > 1 ? (u.slot ? 1 : -1) * 32 : 0); });
    this.u.forEach(u => { this.resolveBuildings(u, true); u.zone = this.zoneAt(u.x, u.y); });
    this.balls = []; this.initBalls();
    this.iceSegs = [];
    const IW = this.stage.iceWalls;
    if (IW) for (const side of ['top', 'bottom', 'left', 'right']) {
      const horiz = side === 'top' || side === 'bottom', len = horiz ? AR.w : AR.h, n = Math.round(len / IW.segLen);
      for (let i = 0; i < n; i++) this.iceSegs.push({ side, a0: (horiz ? AR.x : AR.y) + len * i / n, a1: (horiz ? AR.x : AR.y) + len * (i + 1) / n, hp: IW.hp, maxHp: IW.hp, dead: false, hitT: 0, seed: i * 7 + side.length });
    }
    this.proj = []; this.parts = []; this.texts = []; this.tele = []; this.timers = []; this.fx = [];
    this.time = 0; this.slowT = 0; this.zoom = null; this.lastBump = -1; this.over = false; this.winner = null; this.ended = false; this.endT = 0;
    this.shakeT = 0; this.shakeA = 0; this.hooks = hooks;
    this.stats = { lands: 0, shockHits: 0, knocks: 0 };
    this.endType = null; this.resultText = null;
    this.play = AR; // 실제 이동 가능 영역 (스테이지 훅이 좁힐 수 있음: 아이돌 무대 등)
    for (const h of STAGE_HOOKS) h.init && h.init(this); // 스테이지 확장 훅 (js/stages2.js)
    if (this.multi) this.u.forEach(u => { if (u.n > 1) { const p = this.clampPos(u.x, u.y, u.pad, u); u.x = p.x; u.y = p.y; this.resolveBuildings(u, true); } });
  }
  // 상대: 1v1 이면 유일한 상대. 다인 팀이면 가장 가까운 '살아있는' 상대 (히스테리시스: 새 후보가 25% 이상 가까워야 교체)
  enemy(u) {
    const es = this.u.filter(o => o.team !== u.team);
    if (es.length === 1) return es[0];
    const live = es.filter(o => !o.dead && !o.hidden);
    if (!live.length) return es[0];
    if (live.length === 1) return (u.tgtU = live[0]);
    let best = live[0]; for (const o of live) if (dist(u, o) < dist(u, best)) best = o;
    const cur = u.tgtU && live.includes(u.tgtU) ? u.tgtU : null;
    if (!cur || dist(u, best) < dist(u, cur) * 0.75) u.tgtU = best;
    return u.tgtU;
  }
  foes(u) { return this.u.filter(o => o.team !== u.team && !o.dead); }      // 살아있는 상대 전원
  allies(u) { return this.u.filter(o => o !== u && o.team === u.team && !o.dead); } // 살아있는 아군 (자신 제외)
  teamAlive(t) { return this.u.some(o => o.team === t && !o.dead); }
  teamBest(t) { const L = this.u.filter(o => o.team === t); return L.filter(o => !o.dead).sort((a, c) => c.hp / c.maxHp - a.hp / a.maxHp)[0] || L[L.length - 1]; } // 승자 대표 (살아있는 쪽, 체력 비율 높은 쪽)
  // ---------- 대사 ----------
  // def.lines = { skill: { 스킬명: [..] }, event: { 이벤트: [..] }, cd?: { 이벤트: 초 } }. 같은 대사 연속 방지, 이벤트별/캐릭터별 쿨다운
  line(u, kind, key) {
    const L = (u.form && u.form.lines) || u.def.lines, arr = L && L[kind] && L[kind][key];
    if (!arr || !arr.length) return null;
    u.voice = u.voice || { last: {}, prev: {}, any: -9 };
    const force = kind === 'skill' || key === 'win' || key === 'lose' || key === 'fallCrevasse' || key === 'battleStart';
    const cd = (L.cd && L.cd[key]) ?? (kind === 'skill' ? 0 : 6);
    if (!force && (this.time - (u.voice.last[kind + key] ?? -99) < cd || this.time - u.voice.any < 1.2)) return null;
    let i = Math.floor(Math.random() * arr.length);
    if (arr.length > 1 && i === u.voice.prev[kind + key]) i = (i + 1) % arr.length;
    u.voice.prev[kind + key] = i; u.voice.last[kind + key] = this.time; u.voice.any = this.time;
    return arr[i];
  }
  say(u, key) { // 이벤트 대사 → 로그 + 말풍선
    const t = this.line(u, 'event', key); if (!t) return;
    this.hooks.onVoice && this.hooks.onVoice(u, t, null);
    this.bubble(u, t);
  }
  bubble(u, t) { return; this.texts.push({ x: u.x, y: u.y - 70 - u.pad * 2.2, txt: t, color: '#fff6dc', size: 8, t: 0, dur: 1.6, bubble: true, u }); }
  later(t, fn) { this.timers.push({ t, fn }); }
  clampPos(x, y, pad = 0, u = null) {
    for (const h of STAGE_HOOKS) if (h.noClamp && u && h.noClamp(this, u)) return { x, y };
    for (const h of STAGE_HOOKS) if (h.clamp) { const p = h.clamp(this, x, y, pad); x = p.x; y = p.y; }
    const P = this.play || AR; x = clamp(x, P.x + 14 + pad, P.x + P.w - 14 - pad); y = clamp(y, P.y + 26 + pad, P.y + P.h - 8 - pad * 0.5);
    const C = this.stage && this.stage.circle;
    if (C) { const R = this.circleR() - 12 - pad, dx = x - C.cx, dy = y - C.cy, d = Math.hypot(dx, dy); if (d > R) { x = C.cx + dx / d * R; y = C.cy + dy / d * R; } }
    return { x, y };
  }
  // 원형 경기장 현재 반지름 (부드럽게 축소)
  circleR(t = this.time) {
    const C = this.stage.circle; if (!C) return Infinity;
    const p = clamp((t - C.start) / C.dur, 0, 1);
    return C.r0 - (C.r0 - C.rMin) * easeInOut(p);
  }
  circleWall(u) {
    const C = this.stage.circle; if (!C || u.dead) return;
    const R = this.circleR() - 12 - u.pad, dx = u.x - C.cx, dy = u.y - C.cy, d = Math.hypot(dx, dy);
    if (d < R - 0.5) return;
    const nx = dx / d, ny = dy / d;
    u.x = C.cx + nx * R; u.y = C.cy + ny * R;
    if (u.action && u.action.type === 'dash') u.action.tx = u.x, u.action.ty = u.y, u.action.sx = u.x, u.action.sy = u.y;
    let vx = Math.cos(u.dir), vy = Math.sin(u.dir);
    const dot = vx * nx + vy * ny;
    if (dot > 0) { // 법선 기준 반사
      vx -= 2 * dot * nx; vy -= 2 * dot * ny;
      u.dir = Math.atan2(vy, vx) + rand(-0.25, 0.25);
      if (this.time - (u.wallT || -1) > 0.12) { u.wallT = this.time; this.dust(u.x, u.y); this.ring(u.x + nx * 10, u.y, 2, 10, 0.2, '#f0e8e0'); playSfx('wall'); }
    }
  }
  // ---------- 볼풀 ----------
  initBalls() {
    const B = this.stage.balls; this.balls = [];
    if (!B) return;
    const cols = Math.ceil(Math.sqrt(B.count * B.area.w / B.area.h)), rows = Math.ceil(B.count / cols);
    for (let i = 0; i < B.count; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      this.balls.push({ x: B.area.x + (c + 0.5) * B.area.w / cols + rand(-3, 3), y: B.area.y + (r + 0.5) * B.area.h / rows + rand(-3, 3), vx: 0, vy: 0, r: B.r, color: B.colors[i % B.colors.length], z: 0 });
    }
  }
  pushBalls(x, y, r, power) { // 범위 충격으로 공 밀기
    for (const bl of this.balls) {
      const dx = bl.x - x, dy = bl.y - y, d = Math.hypot(dx, dy);
      if (d < r && d > 0.01) { const k = power * (1 - d / r); bl.vx += dx / d * k; bl.vy += dy / d * k; }
    }
  }
  updateBalls(dt) {
    const B = this.stage.balls; if (!B || !this.balls.length) return;
    const fr = Math.exp(-B.friction * dt), e = B.restitution;
    const L = AR.x + 4, Rr = AR.x + AR.w - 4, T = AR.y + 4, Bt = AR.y + AR.h - 4;
    for (const b of this.balls) {
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 < 9) { b.vx = b.vy = 0; continue; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= fr; b.vy *= fr;
      if (b.x < L + b.r) { b.x = L + b.r; b.vx = Math.abs(b.vx) * e; }
      if (b.x > Rr - b.r) { b.x = Rr - b.r; b.vx = -Math.abs(b.vx) * e; }
      if (b.y < T + b.r) { b.y = T + b.r; b.vy = Math.abs(b.vy) * e; }
      if (b.y > Bt - b.r) { b.y = Bt - b.r; b.vy = -Math.abs(b.vy) * e; }
    }
    // 공-공 충돌 (공간 격자)
    const S = 12, grid = new Map();
    for (const b of this.balls) { const k = ((b.x / S) | 0) * 1000 + ((b.y / S) | 0); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(b); }
    for (const b of this.balls) {
      const moving = b.vx !== 0 || b.vy !== 0; if (!moving) continue;
      const gx = (b.x / S) | 0, gy = (b.y / S) | 0;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const a = grid.get((gx + ox) * 1000 + gy + oy); if (!a) continue;
        for (const c of a) {
          if (c === b) continue;
          const dx = c.x - b.x, dy = c.y - b.y, d2 = dx * dx + dy * dy, R = b.r + c.r;
          if (d2 >= R * R || d2 < 0.0001) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (R - d) / 2;
          b.x -= nx * pen; b.y -= ny * pen; c.x += nx * pen; c.y += ny * pen;
          const rel = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny;
          if (rel > 0) { const j = rel * (1 + e) / 2; b.vx -= j * nx; b.vy -= j * ny; c.vx += j * nx; c.vy += j * ny; }
        }
      }
    }
    // 캐릭터-공
    for (const u of this.u) {
      if (u.dead || u.airborne) continue;
      const ux = Math.cos(u.dir) * u.speed, uy = Math.sin(u.dir) * u.speed;
      for (const b of this.balls) {
        const dx = b.x - u.x, dy = b.y - (u.y - 3), R = 12 + u.pad + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 < 0.0001) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        b.x = u.x + nx * R; b.y = u.y - 3 + ny * R;
        const vin = (u.moving || u.action ? ux * nx + uy * ny : 0) - (b.vx * nx + b.vy * ny); // 접근 속도
        if (vin <= 0) continue;
        // 공은 튕겨 날아감
        const sp = Math.max(u.speed, 120) * B.push + 60;
        b.vx = nx * sp + rand(-30, 30); b.vy = ny * sp + rand(-30, 30); b.z = 7;
        if (u.action && (u.action.type === 'dash' || u.action.type === 'chase' || u.action.type === 'charge')) continue; // 돌진 중엔 뚫고 지나감
        // 캐릭터도 캐릭터끼리 충돌과 동일하게 반사 + 짧은 가속
        let vx = Math.cos(u.dir), vy = Math.sin(u.dir);
        const dot = vx * nx + vy * ny;
        if (dot > 0) { vx -= 2 * dot * nx; vy -= 2 * dot * ny; }
        u.dir = fixAngle(Math.atan2(vy, vx) + rand(-0.2, 0.2));
        u.boost = Math.max(u.boost, B.boost ?? 0.45);
        u.kx -= nx * 5; u.ky -= ny * 5;
        u.x -= nx * 1.5; u.y -= ny * 1.5;
        if (this.time - (u.ballFxT || -1) > 0.2) {
          u.ballFxT = this.time;
          const mx = u.x + nx * 12, my = u.y - 3 + ny * 12;
          this.ring(mx, my, 3, 16, 0.22, '#f4ecd8');
          this.burst(mx, my - 6, b.color, 6);
        }
      }
    }
    for (const b of this.balls) b.z = Math.max(0, b.z - dt * 18); // 튀어 오름 표현
  }


  // ---------- 시뮬레이션 ----------
  // 고속 이동 터널링 방지: 최대 1/120초 단위로 쪼개서 진행
  update(dt) {
    if (this.slowT > 0) { this.slowT -= dt; dt *= 0.35; } // 히트스톱(짧은 슬로모션)
    if (this.zoom) { this.zoom.t += dt; if (this.zoom.t > this.zoom.dur) this.zoom = null; }
    const n = Math.max(1, Math.ceil(dt / (1 / 120) - 1e-6));
    for (let i = 0; i < n; i++) this.step(dt / n);
  }
  step(dt) {
    if (!this.started) { this.started = true; this.u.forEach(u => this.say(u, 'battleStart')); playSfx('start'); }
    this.time += dt;
    if (!this.fever && this.time >= RAMP_START) { this.fever = true; this.hooks.onSystem && this.hooks.onSystem('전투가 격렬해집니다! (피해량 점점 증가)'); }
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter(t => t.t <= 0);
    this.timers = this.timers.filter(t => t.t > 0);
    due.forEach(t => t.fn());

    for (const u of this.u) this.updateUnit(u, dt);
    for (let i = 0; i < this.u.length; i++) for (let j = i + 1; j < this.u.length; j++) this.collide(this.u[i], this.u[j]);
    if (this.buildings.some(bl => bl.life != null)) { // 임시 지형 (브로리 지반 격파): 수명이 다하면 복구
      for (const bl of this.buildings) if (bl.life != null) { bl.life -= dt; if (bl.life <= 0) { this.smoke(bl.x + bl.w / 2, bl.y + bl.h / 2, '#9a8a78', 10); this.dust(bl.x + bl.w / 2, bl.y + bl.h / 2); } }
      this.buildings = this.buildings.filter(bl => bl.life == null || bl.life > 0);
    }
    for (const u of this.u) { this.updateAir(u, dt); if (!u.airborne) this.resolveBuildings(u); this.circleWall(u); if (!u.airborne) this.updateTerrain(u, dt); }
    this.updateBalls(dt);
    for (const h of STAGE_HOOKS) h.step && h.step(this, dt);
    for (const bl of this.buildings) bl.hitT = Math.max(0, bl.hitT - dt);
    this.updateProj(dt);
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.vx *= 1 - 2 * dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < t.dur);
    for (const t of this.tele) t.t += dt;
    this.tele = this.tele.filter(t => t.t < t.dur);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < f.dur);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.over) {
      this.endT += dt;
      if (!this.ended && this.endT > 1.3) { this.ended = true; this.hooks.onEnd && this.hooks.onEnd(this.winner); }
    }
  }

  updateUnit(u, dt) {
    u.flash = Math.max(0, u.flash - dt); u.swing = Math.max(0, u.swing - dt);
    u.boost *= Math.pow(0.08, dt); // 충돌 가속 감쇠 (~0.6초)
    u.kx *= Math.pow(0.001, dt); u.ky *= Math.pow(0.001, dt);
    if (u.dead) { u.deadT += dt; return; }
    if (u.buffs.length > (u.nBuffs || 0)) this.say(u, 'buffed'); // 새 버프 감지
    for (const b of u.buffs) b.t -= dt;
    u.buffs = u.buffs.filter(b => b.t > 0); u.nBuffs = u.buffs.length;
    if (u.def.oni) this.updateOni(u, dt);
    if (u.poseT > 0) u.poseT -= dt;
    if (u.ghostChain) window.ghostTick(u, this, dt);
    if (u.spirit) { u.spirit.t -= dt; if (Math.random() < dt * 10) this.parts.push({ x: u.x + rand(-8, 8), y: u.y - rand(4, 34), vx: rand(-8, 8), vy: rand(-40, -15), life: 0.6, max: 0.6, color: '#c8d4ff', size: 2, soft: true }); if (u.spirit.t <= 0) window.spiritEnd(u, this); }
    u.hamSwing = Math.max(0, (u.hamSwing || 0) - dt);
    if (u.barrier) this.updateBarrier(u, dt);
    if (u.counter) { u.counter.t -= dt; if (u.counter.t <= 0) { u.counter = null; if (!u.dead) { this.resEvent(u, 'counterFail'); this.text(u.x, u.y - 60, '+매듭', '#ffb070', 8); } } }
    if (u.pull && !u.dead) { // 와이어에 끌려감
      const P = u.pull, s = P.src, R = 15 * (u.size + s.size) + 4, d = dist(u, s);
      P.t -= dt; if (d > R) { const k = Math.min(d - R, 640 * dt); u.x += (s.x - u.x) / d * k; u.y += (s.y - u.y) / d * k; const p = this.clampPos(u.x, u.y, u.pad, u); u.x = p.x; u.y = p.y; }
      if (P.t <= 0 || d <= R) u.pull = null;
    }
    if (u.push && !u.dead) this.pushStep(u, dt); // 넉백 (파라가스 데드☆퍼니셔 등)
    { // 격투게임식 방향: 상대 위치 기준 (히스테리시스)
      const e0 = this.enemy(u), HY = 10, HX = 8;
      if (!u.dead && e0) {
        const dy = e0.y - u.y, dx = e0.x - u.x;
        if (dy > HY) u.lookUp = false; else if (dy < -HY) u.lookUp = true;  // 위에 있으면 앞모습, 아래면 뒷모습
        if (!u.blocked('blocksAct')) { if (dx > HX) u.facing = 1; else if (dx < -HX) u.facing = -1; }
      }
    }
    if (u.buff('rage') && Math.random() < dt * 14) this.spark(u.x + rand(-8, 8), u.y - rand(4, 30), '#ff8a6a', -30);
    const e = this.enemy(u);
    if (this.over) { u.moving = false; return; }
    this.updateStatuses(u, dt);
    if (u.dead) return;
    u.atkT -= dt; for (let i = 0; i < u.skillT.length; i++) u.skillT[i] -= dt;
    const noAct = u.blocked('blocksAct'), noMove = u.blocked('blocksMove');
    if (noAct && noMove) { u.moving = false; return; }
    if (u.action) { if (!noAct) this.updateAction(u, e, dt); return; }
    const d = dist(u, e);
    const noSkill = u.blocked('blocksSkill'); // 봉인: 스킬 사용 불가 (패시브는 동작)
    for (let i = 0; i < u.skills.length && !noAct && !noSkill; i++) {
      const slot = u.skills[i], sk = SKILLS[slot.id];
      if (!sk || u.skillT[i] > 0) continue;
      if (!this.canPay(u, slot)) continue;
      const ok = slot.canUse ? slot.canUse(u, e, d, this) : sk.canUse(u, e, d, this);
      if (!ok) continue;
      u.skillT[i] = slot.cd;
      this.pay(u, slot);
      const vl = sk.say ? sk.say(u, e, this, slot) : this.line(u, 'skill', slot.name); // sk.say: 동적 대사 (예: '기를 낮추거라 <상대>!')
      this.hooks.onSkill && this.hooks.onSkill(u, slot.name, vl);
      if (vl) this.bubble(u, vl);
      sk.use(u, e, this, slot);
      break;
    }
    if (u.action) return;
    if (noMove) { u.moving = false; } else {
    // 이동: 직선 주행 + 벽 반사 (DVD 로고 방식)
    const sp = u.speed;
    if (this.stage.ice) { // 빙판: 관성/미끄러짐 (빠를수록 접지력 낮음)
      const I = this.stage.ice, wx = Math.cos(u.dir) * sp, wy = Math.sin(u.dir) * sp;
      if (!u.v) u.v = [wx, wy];
      const a = 1 - Math.exp(-I.traction * I.speedRef / Math.max(60, sp) * dt);
      u.v[0] += (wx - u.v[0]) * a; u.v[1] += (wy - u.v[1]) * a;
      const m = Math.hypot(u.v[0], u.v[1]) || 1; u.v[0] *= sp / m; u.v[1] *= sp / m; // 속도 크기 유지
      u.x += u.v[0] * dt; u.y += u.v[1] * dt;
      if (Math.random() < dt * 8) this.parts.push({ x: u.x + rand(-6, 6), y: u.y + 1, vx: -u.v[0] * 0.1, vy: -u.v[1] * 0.1, life: 0.4, max: 0.4, color: '#e8f8ff', size: 1.5 });
    } else { u.x += Math.cos(u.dir) * sp * dt; u.y += Math.sin(u.dir) * sp * dt; }
    u.moving = true; u.walk += dt * Math.min(sp, 160) * 0.15;
    this.bounceWalls(u);
    u.trailT -= dt;
    if (u.trailT <= 0) { u.trailT = 0.035; this.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.16, a: 0.16 + 0.12 * u.boost }); }
    }
    const r = u.reach;
    if (!noAct && d <= r && u.atkT <= 0) { this.basicAttack(u, e); u.atkT = 1 / u.atkRate; }
  }

  // ---------- 상태이상 ----------
  updateStatuses(u, dt) {
    for (const s of u.statuses) {
      const d = STATUS_DEFS[s.id]; if (!d) { s.t = 0; continue; }
      s.t -= dt;
      if (d.tick && d.onTick) { s.tickT -= dt; if (s.tickT <= 0) { s.tickT += d.tick; d.onTick(u, this, s); } }
      if (d.onUpdate) d.onUpdate(u, this, s, dt);
      if (d.particle && Math.random() < dt * 9) this.parts.push({ x: u.x + rand(-9, 9), y: u.y - rand(6, 34), vx: rand(-6, 6), vy: rand(-30, -14), life: 0.6, max: 0.6, color: d.particle, size: 2, glow: true });
      if (u.dead) break;
    }
    const gone = u.statuses.filter(s => s.t <= 0);
    if (gone.length) { u.statuses = u.statuses.filter(s => s.t > 0); gone.forEach(s => { const d = STATUS_DEFS[s.id]; d && d.onExpire && d.onExpire(u, this, s); }); }
  }
  applyStatus(tgt, id, dur, src, o = {}) {
    const d = STATUS_DEFS[id];
    if (!d || tgt.dead || this.over) return null;
    if (src && src !== tgt && !d.positive && (tgt.counter || tgt.evadeT > this.time)) { if (tgt.counter) this.counterTrigger(tgt, src); return null; }
    let s = tgt.status(id);
    if (s) { if (d.stack !== 'ignore') { s.t = Math.max(s.t, dur); s.dur = Math.max(s.dur, dur); s.src = src; } return s; }
    s = { id, t: dur, dur, src, power: o.power, tickT: d.tick || 0 };
    tgt.statuses.push(s);
    d.onApply && d.onApply(tgt, this, s);
    if (id === 'stun') this.later(0, () => { if (!s.knock) this.say(tgt, 'stunned'); });
    if (!d.positive) this.say(tgt, 'debuffed'); // 해로운 상태이상 (positive: true 면 제외)
    this.hooks.onStatus && this.hooks.onStatus(tgt, d.name, d.color);
    playSfx(id === 'stun' ? 'stun' : d.positive ? 'buff' : 'status', { element: id });
    this.text(tgt.x, tgt.y - 84, d.name + '!', d.color, 11);
    this.shock(tgt.x, tgt.y - 18, 6, 30, d.color, 0.35, 3);
    return s;
  }
  // ---------- 얼음벽 / 크레바스 ----------
  segAt(side, u) { const c = side === 'top' || side === 'bottom' ? u.x : u.y; return this.iceSegs.find(s => s.side === side && c >= s.a0 && c < s.a1); }
  iceWallHit(u, sides) {
    const IW = this.stage.iceWalls;
    for (const side of sides) {
      const s = this.segAt(side, u); if (!s) continue;
      if (s.dead) { if (!this.over && !u.airborne) { this.fall(u, side); return true; } continue; }
      const vx = u.v ? u.v[0] : Math.cos(u.dir) * u.speed, vy = u.v ? u.v[1] : Math.sin(u.dir) * u.speed;
      const imp = side === 'left' ? -vx : side === 'right' ? vx : side === 'top' ? -vy : vy; // 벽 방향 속도 성분
      const dash = u.action && (u.action.type === 'dash' || u.action.type === 'chase');
      if ((imp >= IW.crackSpeed || dash) && this.time - s.hitT > IW.hitCd) {
        s.hitT = this.time; s.hp -= 1;
        const px = side === 'left' ? AR.x : side === 'right' ? AR.x + AR.w : u.x, py = side === 'top' ? AR.y : side === 'bottom' ? AR.y + AR.h : u.y;
        this.sparks(px, py, '#e0f6ff', 8, 140); this.shock(px, py, 3, 16, '#d8f2ff', 0.25, 2);
        if (s.hp <= 0) { s.dead = true; this.debrisIce(px, py); this.shake(2); this.hooks.onSystem && this.hooks.onSystem('얼음벽이 깨졌습니다! 크레바스 주의!'); }
      }
    }
    return false;
  }
  debrisIce(x, y) { for (let i = 0; i < 24; i++) { const a = rand(0, 6.28), sp = rand(40, 150); this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 300, life: rand(0.4, 0.8), max: 0.8, color: ['#e8f8ff', '#bfe6f8', '#9fd0ea'][i % 3], size: rand(1.5, 3.5) }); } }
  fall(u, side) {
    this.say(u, 'fallCrevasse');
    u.dead = true; u.fallen = { t: 0, side, x: u.x, y: u.y }; u.action = null; u.statuses = [];
    this.hooks.onSystem && this.hooks.onSystem(u.def.name + ' 크레바스에 추락!');
    if (this.teamAlive(u.team)) { this.allyDown(u); this.hitstop(0.12); return; } // 팀원이 남아 있으면 계속
    this.say(this.enemy(u), 'win');
    this.over = true; this.winner = this.teamBest(1 - u.team); this.fallen = u;
    this.hitstop(0.2);
    playSfx('ko');
  }
  // ---------- 트램펄린 / 공중 ----------
  updateAir(u, dt) {
    if (u.dead) return;
    if (u.air) {
      if (!u.air.sfx) { u.air.sfx = 1; playSfx('jump'); }
      u.air.t += dt;
      if (u.air.fling) { const F = u.air.fling, k = easeInOut(clamp(u.air.t / u.air.dur, 0, 1)); u.x = F.x0 + (F.x1 - F.x0) * k; u.y = F.y0 + (F.y1 - F.y0) * k; }
      if (u.air.t >= u.air.dur) { u.air = null; u.padCd = this.time; this.landShock(u); }
      return;
    }
    for (const p of this.stage.pads || []) {
      if (Math.hypot((u.x - p.cx) / p.r, (u.y - p.cy) / (p.r * 0.7)) <= 1 && this.time - (u.padCd ?? -9) > p.cd) {
        u.air = { t: 0, dur: p.air, h: p.height }; this.say(u, 'airborne'); (this.padT || (this.padT = new Map())).set(p, this.time);
        this.shock(p.cx, p.cy, 6, p.r + 10, '#ffe8a0', 0.35, 4);
        this.text(u.x, u.y - 50, '점프!', '#ffe8a0', 10);
      }
    }
  }
  landShock(u) { // 착지 충격파: 범위 내 상대를 넘어뜨리고 기절
    playSfx('land');
    const LS = this.stage.landShock || { r: 0 };
    this.stats.lands++;
    this.shock(u.x, u.y, 6, LS.r || 22, '#fff4d0', 0.45, 3);
    this.shock(u.x, u.y, 4, (LS.r || 22) * 0.6, '#ffffff', 0.3, 2);
    for (let i = 0; i < 6; i++) this.dust(u.x + rand(-1, 1) * (LS.r || 20) * 0.6, u.y + rand(-1, 1) * (LS.r || 20) * 0.35);
    if (!LS.r) return;
    this.shake(1.5);
    for (const e of this.foes(u)) {
      if (e.airborne || Math.hypot(e.x - u.x, (e.y - u.y) / 0.7) > LS.r) continue;
      this.stats.shockHits++;
      if (this.knockdown(u, e, LS.stun, LS.chance ?? 1)) this.stats.knocks++;
    }
  }
  airZ(u) { return u.air ? Math.sin(Math.PI * clamp(u.air.t / u.air.dur, 0, 1)) * u.air.h : 0; }
  // 명중 판정 (향후 명중/회피 스탯 확장용 훅)
  accuracy(src, o) { return src.st.acc || 0; }   // TODO: 명중 스탯
  evasion(tgt, o) { return tgt.st.eva || 0; }    // TODO: 회피 스탯
  hitCheck(src, tgt, o) {
    if (o.dot || o.reflected) return { hit: true };
    if (tgt.airborne) {
      if (o.airHit) return { hit: true }; // 공중 추격 공격 (고스트 온)
      if (o.delivery === 'melee') return { hit: false, label: '회피' }; // 공중: 근접은 항상 빗나감
      if (o.delivery === 'ranged') return { hit: true, sure: true, label: '명중' }; // 원거리는 항상 명중
    }
    const p = clamp(this.evasion(tgt, o) - this.accuracy(src, o), 0, 0.95); // 기본값 0 → 항상 명중
    return Math.random() < p ? { hit: false, label: '회피' } : { hit: true };
  }

  // ---------- 지형 ----------
  zoneAt(x, y) { for (const z of this.stage.terrain || []) if (shapeContains(z.shape, x, y)) return z; return null; }
  updateTerrain(u, dt) {
    if (u.dead) return;
    const prev = u.zone, z = this.zoneAt(u.x, u.y);
    u.zone = z;
    if (z && z !== prev && z.splash) { this.splash(u.x, u.y, z.splash); if (!this.over) this.say(u, 'water'); }
    if (!z && prev && prev.splash) this.splash(u.x, u.y, prev.splash, 0.5);
    if (z && z.splash && (u.moving || u.action)) { u.rippleT -= dt; if (u.rippleT <= 0) { u.rippleT = 0.16; this.fx.push({ type: 'ripple', x: u.x, y: u.y + 1, t: 0, dur: 0.7 }); } }
    if (this.over) return;
    if (z && z.oxygen && !waterImmune(u, z)) {
      const O = z.oxygen;
      if (u.o2 == null) u.o2 = O.max;
      u.o2Max = O.max; u.o2Regen = O.regen;
      u.o2 = Math.max(0, u.o2 - O.drain * dt);
      if (u.o2 <= 0) {
        u.o2T -= dt;
        if (u.o2T <= 0) {
          u.o2T = O.tick;
          this.damage(this.enemy(u), u, O.dmg, { dot: true, color: '#9fd8ff' });
          for (let i = 0; i < 3; i++) this.parts.push({ x: u.x + rand(-6, 6), y: u.y - rand(10, 30), vx: rand(-5, 5), vy: rand(-40, -20), life: 0.6, max: 0.6, color: '#d8f4ff', size: 2, glow: true });
        }
      }
    } else if (u.o2 != null) {
      u.o2 += u.o2Regen * dt; u.o2T = 0;
      if (u.o2 >= u.o2Max) u.o2 = null;
    }
  }
  splash(x, y, color, k = 1) {
    playSfx('splash');
    this.fx.push({ type: 'ripple', x, y, t: 0, dur: 0.6, big: true });
    for (let i = 0; i < 14 * k; i++) { const a = rand(Math.PI, Math.PI * 2), s = rand(40, 110); this.parts.push({ x, y: y - 2, vx: Math.cos(a) * s * 0.7, vy: Math.sin(a) * s, g: 360, life: rand(0.3, 0.55), max: 0.55, color, size: rand(1.5, 3) }); }
  }

  // ---------- 건물 ----------
  // 장애물 충돌음: 법선(n, 장애물→캐릭터) 방향으로 실제로 파고드는 속도가 있을 때만 (반사 전에 호출)
  wallImpact(u, nx, ny) {
    const a = u.action, dash = (a && ['dash', 'chase', 'charge', 'combo'].includes(a.type)) || !!u.push;
    const imp = -(Math.cos(u.dir) * nx + Math.sin(u.dir) * ny) * (u.speed || 0);
    if (dash || imp > 40) playSfx('wall');
  }
  blockAt(x, y, pad = 0) {
    for (const b of this.buildings) if (!b.dead && x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
    return null;
  }
  resolveBuildings(u, spawn) {
    if (u.dead) return;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (const b of this.buildings) {
        if (b.dead) continue;
        const cx = u.x, cy = u.y - 4, R = 11 + u.pad;
        const qx = clamp(cx, b.x, b.x + b.w), qy = clamp(cy, b.y, b.y + b.h);
        let dx = cx - qx, dy = cy - qy, d = Math.hypot(dx, dy);
        if (d >= R) continue;
        any = true;
        let nx, ny, pen;
        if (d > 0.001) { nx = dx / d; ny = dy / d; pen = R - d; }
        else { // 중심이 내부: 가장 가까운 면으로 밀어냄
          const opts = [[cx - b.x, -1, 0], [b.x + b.w - cx, 1, 0], [cy - b.y, 0, -1], [b.y + b.h - cy, 0, 1]].sort((a, c) => a[0] - c[0]);
          [pen, nx, ny] = [opts[0][0] + R, opts[0][1], opts[0][2]];
        }
        u.x += nx * pen; u.y += ny * pen;
        if (spawn) continue;
        this.wallImpact(u, nx, ny);
        const a = u.action;
        if (a && (a.type === 'dash' || a.type === 'chase')) { // 돌진: 강한 충돌
          this.hitBuilding(b, 90, true, u.x - nx * 10, u.y - 14);
          if (!b.dead) { u.action = null; u.dir = fixAngle(Math.atan2(ny, nx) + rand(-0.5, 0.5)); }
        } else {
          let vx = Math.cos(u.dir), vy = Math.sin(u.dir);
          const dot = vx * nx + vy * ny;
          if (dot < 0) { vx -= 2 * dot * nx; vy -= 2 * dot * ny; u.dir = fixAngle(Math.atan2(vy, vx) + rand(-0.25, 0.25)); }
          if (this.time - u.bldT > 0.15) {
            u.bldT = this.time;
            this.hitBuilding(b, this.rules.bumpDmg + u.speed * this.rules.bumpSpeedK, false, u.x - nx * 11, u.y - 8);
            this.ring(u.x - nx * 11, u.y - 4, 2, 10, 0.2, '#e0d8c8');
          }
        }
      }
      const p = this.clampPos(u.x, u.y, u.pad, u); u.x = p.x; u.y = p.y;
      if (!any) break;
    }
  }
  hitBuilding(b, dmg, strong, x, y) {
    if (!b || b.dead) return;
    if (b.solid) { b.hitT = 0.15; for (let i = 0; i < 3; i++) this.parts.push({ x: x ?? b.x + b.w / 2, y: y ?? b.y, vx: rand(-60, 60), vy: rand(-90, -30), g: 360, life: 0.4, max: 0.4, color: ['#8a7a68', '#b0a088'][i % 2], size: rand(1.5, 2.5) }); return; } // 파괴 불가 임시 지형
    b.hp -= dmg; b.hitT = 0.15;
    for (let i = 0; i < 4; i++) this.parts.push({ x: x ?? b.x + b.w / 2, y: y ?? b.y, vx: rand(-60, 60), vy: rand(-90, -30), g: 360, life: 0.45, max: 0.45, color: ['#a89878', '#c8b898', '#8a7a68'][i % 3], size: rand(1.5, 2.5) });
    if (strong && dmg >= this.rules.strongMin) b.hp = 0;
    if (b.hp <= 0) this.collapse(b);
  }
  areaBuildings(x, y, r, dmg, strong) {
    for (const b of this.buildings) {
      if (b.dead) continue;
      const qx = clamp(x, b.x, b.x + b.w), qy = clamp(y, b.y, b.y + b.h);
      if (Math.hypot(x - qx, y - qy) <= r) this.hitBuilding(b, dmg, strong, qx, qy - 10);
    }
  }
  collapse(b) {
    b.dead = true; b.hp = 0; b.collapseT = this.time;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    this.debris(cx, cy, 40);
    this.smoke(cx, cy - 8, '#a89c8c', 26);
    this.shock(cx, cy + 6, 6, Math.max(b.w, b.h), '#e0d4c0', 0.5, 5);
    this.shake(2);
    this.hooks.onSystem && this.hooks.onSystem('건물이 무너졌습니다!');
  }

  elemMult(tgt, o) {
    if (o.dot || o.reflected) return 1;
    const r = tgt.def.resist || {};
    let m = 1;
    if (tgt.zone && !waterImmune(tgt, tgt.zone) && tgt.zone.resist && o.element && tgt.zone.resist[o.element] != null) m *= tgt.zone.resist[o.element]; // 지형 보정
    if (o.element && r[o.element] != null) m *= r[o.element];
    if (o.delivery && r[o.delivery] != null) m *= r[o.delivery];
    for (const b of tgt.buffs) if (b.resist && o.element && b.resist[o.element] != null) m *= b.resist[o.element];
    return m;
  }
  // 상태이상 저항: 캐릭터 statusResist(all + 개별) + 버프 statusResist 합산 (최대 0.9)
  statusResist(u, id) {
    const sr = u.def.statusResist || {};
    let r = (sr.all || 0) + (sr[id] || 0);
    for (const b of u.buffs) if (b.statusResist) r += typeof b.statusResist === 'number' ? b.statusResist : (b.statusResist.all || 0) + (b.statusResist[id] || 0);
    return clamp(r, 0, 0.9);
  }
  // applies: [{ status, duration, chance=1, power }]  → 저항: 확률 x(1-r), 지속시간 x(1-r/2)
  applyList(src, tgt, list) {
    if (!list || tgt.dead) return;
    for (const a of list) {
      const r = this.statusResist(tgt, a.status), roll = Math.random(), base = a.chance ?? 1;
      if (roll < base * (1 - r)) this.applyStatus(tgt, a.status, a.duration * (1 - r / 2), src, a);
      else if (roll < base && STATUS_DEFS[a.status]) this.text(tgt.x, tgt.y - 84, STATUS_DEFS[a.status].name + ' 저항', '#a8b0c4', 9);
    }
  }

  bounceWalls(u) {
    for (const h of STAGE_HOOKS) if (h.noClamp && h.noClamp(this, u)) return;
    const P = this.play || AR, pd = u.pad, L = P.x + 14 + pd, R = P.x + P.w - 14 - pd, T = P.y + 26 + pd, B = P.y + P.h - 8 - pd * 0.5;
    let vx = Math.cos(u.dir), vy = Math.sin(u.dir), hit = false;
    const sides = [];
    if (u.x < L) { sides.push('left'); }
    if (u.x > R) { sides.push('right'); }
    if (u.y < T) { sides.push('top'); }
    if (u.y > B) { sides.push('bottom'); }
    if (this.iceSegs.length && sides.length && this.iceWallHit(u, sides)) return; // 크레바스 추락
    if (u.x < L) { u.x = L; vx = Math.abs(vx); hit = true; if (u.v) u.v[0] = Math.abs(u.v[0]); }
    if (u.x > R) { u.x = R; vx = -Math.abs(vx); hit = true; if (u.v) u.v[0] = -Math.abs(u.v[0]); }
    if (u.y < T) { u.y = T; vy = Math.abs(vy); hit = true; if (u.v) u.v[1] = Math.abs(u.v[1]); }
    if (u.y > B) { u.y = B; vy = -Math.abs(vy); hit = true; if (u.v) u.v[1] = -Math.abs(u.v[1]); }
    if (hit) {
      // 핀볼 느낌: 반사각을 상대 쪽으로 살짝 꺾음 (최대 0.8rad) → 충돌 빈도 증가
      let ang = Math.atan2(vy, vx) + rand(-0.25, 0.25);
      const e = this.enemy(u);
      if (e && !e.dead && !u.ghostChain) { // 고스트 온 무작위 이동 중엔 적 방향 보정 없음
        const toE = Math.atan2(e.y - u.y, e.x - u.x);
        let diff = Math.atan2(Math.sin(toE - ang), Math.cos(toE - ang));
        const tx = Math.cos(toE), ty = Math.sin(toE);
        if (tx * vx >= -0.05 && ty * vy >= -0.05 || Math.abs(diff) < 1.2) ang += clamp(diff, -0.8, 0.8);
      }
      u.dir = fixAngle(ang); this.dust(u.x, u.y); this.ring(u.x, u.y, 2, 9, 0.18, '#cfd8c8'); playSfx('wall'); }
  }

  collide(a, b) {
    if (a.airborne || b.airborne) return; // 공중이면 지상 충돌 없음
    if (a.spirit || b.spirit) return; // 혼령: 통과
    const isRush = u => u.action && (u.action.type === 'dash' || u.action.type === 'charge');
    if (a.dead || b.dead || isRush(a) || isRush(b)) return;
    const d = dist(a, b), R = 15 * (a.size + b.size), ally = a.team === b.team; // 아군끼리: 튕기기만 (충돌 공격/연계 없음)
    if (d >= R || d < 0.01) return;
    const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
    const push = (R - d) / 2 + 0.5;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    // 동일 질량 탄성 충돌: 법선 방향 속도 성분 교환
    const va = [Math.cos(a.dir) * a.speed, Math.sin(a.dir) * a.speed], vb = [Math.cos(b.dir) * b.speed, Math.sin(b.dir) * b.speed];
    const pa = va[0] * nx + va[1] * ny, pb = vb[0] * nx + vb[1] * ny;
    const impact = Math.abs(pa - pb);
    if (pa - pb > 0) {
      va[0] += (pb - pa) * nx; va[1] += (pb - pa) * ny; vb[0] += (pa - pb) * nx; vb[1] += (pa - pb) * ny;
    }
    // 서로 멀어지도록 보정
    if (va[0] * nx + va[1] * ny > -5) { va[0] -= nx * 20; va[1] -= ny * 20; }
    if (vb[0] * nx + vb[1] * ny < 5) { vb[0] += nx * 20; vb[1] += ny * 20; }
    a.dir = fixAngle(Math.atan2(va[1], va[0]) + rand(-0.2, 0.2));
    if (a.v) a.v = [va[0], va[1]]; if (b.v) b.v = [vb[0], vb[1]]; // 빙판: 충돌은 즉시 반영
    b.dir = fixAngle(Math.atan2(vb[1], vb[0]) + rand(-0.2, 0.2));
    a.kx -= nx * 5; a.ky -= ny * 5; b.kx += nx * 5; b.ky += ny * 5;
    a.boost = Math.max(a.boost, 0.45); b.boost = Math.max(b.boost, 0.45); // 충돌 직후 가속
    if (impact > 420) this.shake(1.5);
    for (const u of [a, b]) { const p = this.clampPos(u.x, u.y, u.pad, u); u.x = p.x; u.y = p.y; }
    // 충돌 타격: 근접 캐릭터는 부딪히는 순간 공격 쿨이 거의 찼으면 즉시 공격
    for (const [u, e] of ally ? [] : [[a, b], [b, a]]) {
      if (u.st.range < 80 && !u.stun && !u.action && u.atkT < 0.5 / u.atkRate) { this.basicAttack(u, e); u.atkT = 1 / u.atkRate; }
    }
    if (!ally) for (const u of [a, b]) if (u.ghostChain) window.ghostBump(u, this); // 고스트 온 연계
    if (this.time - this.lastBump > 0.25) {
      this.lastBump = this.time;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 16;
      this.ring(mx, my + 14, 4, 20, 0.25, '#f4ecd8');
      this.burst(mx, my, '#fff3c8', 8);
      playSfx(impact > 420 && !ally ? 'bumpHard' : 'bump');
    }
  }

  dust(x, y) { for (let i = 0; i < 3; i++) this.parts.push({ x: x + rand(-4, 4), y: y + rand(-2, 2), vx: rand(-15, 15), vy: rand(-15, -5), life: 0.35, max: 0.35, color: '#9aa597', size: 2 }); }

  updateAction(u, e, dt) {
    const a = u.action;
    u.moving = false;
    const px = u.x, py = u.y;
    this.actionStep(u, e, dt, a);
    if (a.trail && (px !== u.x || py !== u.y)) {
      this.fx.push({ type: 'streak', x1: px, y1: py - 18, x2: u.x, y2: u.y - 18, color: a.trail, w: 12, t: 0, dur: 0.3 });
      if (Math.random() < 0.6) this.parts.push({ x: u.x, y: u.y - 18 + rand(-8, 8), vx: rand(-20, 20), vy: rand(-20, 20), life: 0.4, max: 0.4, color: a.trail, size: 2.5, glow: true });
    }
  }
  actionStep(u, e, dt, a) {
    if (a.step) { a.step(dt); return; } // 커스텀 액션 (캐릭터 파일 정의)
    if (a.type === 'wind') {
      a.t -= dt;
      if (a.t <= 0) { u.action = null; a.next && a.next(); }
    } else if (a.type === 'chase') {
      a.t += dt;
      if (a.e && !a.e.dead) e = a.e; // 시전 시 대상 고정 (다인 팀)
      const d = dist(u, e), st = Math.min(d, a.spd * dt);
      const ang = Math.atan2(e.y - u.y, e.x - u.x);
      u.x += Math.cos(ang) * st; u.y += Math.sin(ang) * st;
      if (Math.random() < 0.7) this.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.25 });
      if (d < (a.reach || 28) || a.t >= a.dur) { // a.reach: 큰 캐릭터용 접촉 거리 (기본 28)
        u.action = null; u.dir = fixAngle(ang + Math.PI + rand(-0.7, 0.7));
        if (d < (a.reach || 28) + 6 && !e.dead) a.onTouch && a.onTouch();
      }
    } else if (a.type === 'combo') { // 2연타: 후퇴 → 재접근 → 2타
      a.t += dt; const C = a.C, canMove = !u.blocked('blocksMove');
      if (a.phase === 0) {
        if (canMove) { const p = this.clampPos(u.x + Math.cos(a.ang) * C.retreatSpd * dt, u.y + Math.sin(a.ang) * C.retreatSpd * dt, u.pad); u.x = p.x; u.y = p.y; }
        if (a.t >= C.retreat) a.phase = 1;
      } else {
        const d = dist(u, e);
        if (canMove && d > 24) { const st = Math.min(d - 24, C.approachSpd * dt); u.x += (e.x - u.x) / d * st; u.y += (e.y - u.y) / d * st; }
        if (d <= u.reach && !e.dead) {
          u.swing = 0.2; u.action = null; u.dir = fixAngle(a.ang + rand(-0.8, 0.8));
          const bd = this.damage(u, e, u.st.atk * (C.mult2 || 1), a.atk);
          if (bd > 0) this.resEvent(u, 'basicHit');
          this.slashFx(e.x - u.facing * 4, e.y - 18, u.facing, '#ffd8a0', 1);
          this.stats.combo2 = (this.stats.combo2 || 0) + 1;
        }
      }
      if (u.action === a && a.t >= C.maxT) { u.action = null; u.dir = fixAngle(a.ang + rand(-0.8, 0.8)); }
    } else if (a.type === 'charge') {
      this.chargeStep(u, e, dt, a);
    } else if (a.type === 'dash') {
      a.t += dt;
      const p = Math.min(1, a.t / a.dur), k = easeOut(p);
      u.x = a.sx + (a.tx - a.sx) * k; u.y = a.sy + (a.ty - a.sy) * k;
      u.facing = a.tx >= a.sx ? 1 : -1;
      if (Math.random() < 0.7) this.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.25 });
      if (!a.touched && !e.dead && dist(u, e) < 28) { a.touched = true; a.onTouch && a.onTouch(); }
      if (p >= 1) { u.action = null; u.dir = fixAngle(Math.atan2(a.ty - a.sy, a.tx - a.sx) + Math.PI + rand(-0.6, 0.6)); if (!a.touched && dist(u, e) < 34) a.onTouch && a.onTouch(); }
    }
  }

  // ---------- 라인하르트: 돌진 ----------
  // o: 추가 옵션 { trail, tgt(미리 붙잡은 대상), pin, maxT, onImpact(e, w) } — 브로리 암반이 재사용
  charge(u, ang, spd, slot, o = {}) { u.action = { type: 'charge', ang, spd, t: 0, slot, pin: false, trail: '#ffc88a', ...o }; u.dir = ang; if (o.tgt && o.pin) this.pinUnit(u, o.tgt, u.action, true); }
  pinUnit(u, e, a, quiet) { // 돌진 접촉 → 제압 (붙잡은 대상은 a.tgt 로 고정)
    a.pin = true; a.tgt = e; e.action = null; this.say(u, 'pinned'); this.say(e, 'pinnedBySomeone');
    e.statuses = e.statuses.filter(s => s.id !== 'pin');
    this.applyStatus(e, 'pin', 3, u); // 안전장치 3초 (벽 충돌 시 해제)
    if (!quiet) { this.shock(e.x, e.y - 18, 6, 34, '#ffc88a', 0.3, 4); this.hitstop(0.06); }
  }
  chargeStep(u, e, dt, a) {
    a.t += dt;
    const cx = Math.cos(a.ang), cy = Math.sin(a.ang), st = a.spd * dt;
    if (!a.pin && !a.missed) for (const f of this.foes(u)) { // 경로상의 상대 (다인 팀이면 먼저 닿은 쪽)
      if (dist(u, f) >= 15 * (u.size + f.size) + 6) continue;
      if (f.counter || f.evadeT > this.time) { a.missed = true; if (f.counter) this.counterTrigger(f, u); break; }
      if (f.airborne || f.fallen) continue;
      this.pinUnit(u, f, a); break;
    }
    if (a.pin && (!a.tgt || a.tgt.dead)) a.pin = false;
    e = a.tgt || e;
    const R = 15 * (u.size + e.size);
    const lead = a.pin ? R - 2 : 0;
    const nx = u.x + cx * st, ny = u.y + cy * st, fx = nx + cx * lead, fy = ny + cy * lead;
    const cu = this.clampPos(nx, ny, u.pad), cf = this.clampPos(fx, fy, a.pin ? e.pad : u.pad);
    let wall = null;
    if (Math.abs(cf.x - fx) > 0.01 || Math.abs(cf.y - fy) > 0.01) wall = { x: cf.x + cx * 10, y: cf.y + cy * 10 };
    else if (Math.abs(cu.x - nx) > 0.01 || Math.abs(cu.y - ny) > 0.01) wall = { x: cu.x + cx * 10, y: cu.y + cy * 10 };
    const bl = this.blockAt(fx, fy - 4, 9 + (a.pin ? e.pad : u.pad));
    if (bl) wall = { x: fx, y: fy - 4, bl };
    if (!wall && this.balls.length) this.pushBalls(fx, fy, 22, 240 * dt * 8); // 공을 밀어냄
    if (wall) return this.chargeImpact(u, a.pin ? e : null, a, wall, a.pin ? cf : cu);
    u.x = nx; u.y = ny;
    if (a.pin && !e.dead) { e.x = fx; e.y = fy; e.kx = e.ky = 0; e.facing = -Math.sign(cx) || e.facing; }
    if (Math.random() < 0.5) this.dust(u.x, u.y);
    if (a.t > (a.maxT || 2.5)) { u.action = null; if (a.pin) this.releasePin(e); }
  }
  releasePin(e) { e.statuses = e.statuses.filter(s => s.id !== 'pin'); }
  chargeImpact(u, e, a, w, front) {
    u.action = null; u.dir = fixAngle(a.ang + Math.PI + rand(-0.6, 0.6));
    // 얼음벽: 균열 / 크레바스
    if (this.iceSegs.length && !w.bl) {
      const P = this.play || AR, fu = a.pin ? e : u, pd = fu.pad, L = P.x + 14 + pd, Rr = P.x + P.w - 14 - pd, T = P.y + 26 + pd, B = P.y + P.h - 8 - pd * 0.5;
      const side = front.x <= L + 0.5 ? 'left' : front.x >= Rr - 0.5 ? 'right' : front.y <= T + 0.5 ? 'top' : front.y >= B - 0.5 ? 'bottom' : null;
      const seg = side && this.segAt(side, front);
      if (seg && seg.dead) { if (a.pin) this.releasePin(e); this.fall(fu, side); return; }
      if (seg) { seg.hp -= a.pin ? 2 : 1; seg.hitT = this.time; this.sparks(w.x, w.y, '#e0f6ff', 12, 160); if (seg.hp <= 0) { seg.dead = true; this.debrisIce(w.x, w.y); this.hooks.onSystem && this.hooks.onSystem('얼음벽이 깨졌습니다! 크레바스 주의!'); } }
    }
    if (w.bl) this.hitBuilding(w.bl, a.pin ? 200 : 90, true, w.x, w.y);
    if (a.pin && !e.dead) {
      this.releasePin(e);
      this.stats.pinImpacts = (this.stats.pinImpacts || 0) + 1; this.later(0.25, () => this.say(u, 'wallSlam'));
      this.damage(u, e, u.st.atk * ((a.slot && a.slot.mult) || 3.6), { big: true, ...hit(a.slot), color: '#ffd08a' });
      e.kx -= Math.cos(a.ang) * 6; e.ky -= Math.sin(a.ang) * 6;
      this.shock(w.x, w.y - 10, 8, 70, '#ffe0b0', 0.55, 7);
      this.shock(w.x, w.y - 10, 4, 40, '#ffffff', 0.35, 4);
      this.glow(w.x, w.y - 14, 60, '#ffb36b', 0.45);
      this.debris(w.x, w.y, 34); this.sparks(w.x, w.y - 14, '#fff0c8', 30, 280);
      this.hitstop(0.18); this.shake(3.5); this.zoomAt(w.x, w.y, 0.06);
      if (a.onImpact) a.onImpact(e, w);
    } else {
      this.stats.wallStops = (this.stats.wallStops || 0) + 1;
      this.dust(u.x, u.y); this.dust(u.x, u.y); this.ring(w.x, w.y, 3, 18, 0.25, '#f0e8d8'); this.shake(1);
      this.text(u.x, u.y - 64, '휘청', '#d8d0c0', 9); this.say(u, 'chargeMiss');
      u.action = { type: 'wind', t: 0.45 }; // 작은 경직
    }
  }
  // ---------- 범용 자원 (게이지/표식) ----------
  updateOni(u, dt) { // 오니화: 게이지 가득 → 변신, 서서히 감소, 0이면 복귀
    const O = u.def.oni, R = u.def.resources[O.res], v = u.res[O.res] || 0;
    if (!u.oni && v >= R.max) {
      u.oni = true; this.hooks.onSystem && this.hooks.onSystem(u.def.name + ' 오니화!');
      this.shock(u.x, u.y, 6, 60, '#ff4a5a', 0.5, 5); this.glow(u.x, u.y - 22, 50, '#ff4a5a', 0.6); this.embers(u.x, u.y, '#ff6a7a', 16); this.hitstop(0.08);
    } else if (u.oni) {
      u.res[O.res] = Math.max(0, v - O.drain * dt);
      if (Math.random() < dt * 8) this.parts.push({ x: u.x + rand(-10, 10), y: u.y - rand(10, 40), vx: rand(-10, 10), vy: rand(-50, -20), life: 0.6, max: 0.6, color: '#ff5a6a', size: 2, glow: true });
      if (u.res[O.res] <= 0) { u.oni = false; this.hooks.onSystem && this.hooks.onSystem(u.def.name + ' 오니화 해제'); this.smoke(u.x, u.y - 18, '#ff8a96', 8); }
    }
  }
  // 이로운 효과 해제: 버프(nodispel 제외), 방벽, 혼령, 반격 자세, beneficial 상태. 해제된 이름 목록 반환
  dispel(src, tgt) {
    const out = [], NAMES = { shield: '철벽 방패', invis: '은신', rage: '광폭화', garrote: '교살 자세' };
    const keep = tgt.buffs.filter(b => b.nodispel); for (const b of tgt.buffs) if (!b.nodispel) out.push(NAMES[b.type] || b.name || b.type); tgt.buffs = keep;
    if (tgt.barrier) { this.burst(tgt.x, tgt.y - 20, '#bfe3ff', 12); tgt.barrier = null; out.push('방벽'); }
    if (tgt.spirit) { tgt.spirit = null; this.smoke(tgt.x, tgt.y - 18, '#c8d4ff', 6); out.push('혼령'); }
    if (tgt.counter) { tgt.counter = null; out.push('반격 자세'); }
    const bs = tgt.statuses.filter(s => STATUS_DEFS[s.id] && STATUS_DEFS[s.id].beneficial); if (bs.length) { tgt.statuses = tgt.statuses.filter(s => !bs.includes(s)); for (const s of bs) out.push(STATUS_DEFS[s.id].name); }
    if (out.length) this.stats.dispels = (this.stats.dispels || 0) + 1;
    return [...new Set(out)];
  }
  gainRes(u, id, amt) {
    const R = u.def.resources && u.def.resources[id]; if (!R) return;
    if (u.oni && u.def.oni && u.def.oni.res === id && amt !== 'max' && amt > 0) return; // 오니화 중 충전 불가
    const before = u.res[id] || 0;
    u.res[id] = clamp(amt === 'max' ? R.max : before + amt, 0, R.max);
    if (R.display === 'pips' && u.res[id] > before) this.text(u.x, u.y - 70 - u.pad * 2, R.name + ' ' + u.res[id], R.color, 9);
  }
  resEvent(u, evt) { const D = u.def.resources; if (!D) return; for (const k in D) { const g = D[k].gain && D[k].gain[evt]; if (g != null) this.gainRes(u, k, g); } }
  canPay(u, slot) {
    for (const k in (slot.cost || {})) if ((u.res[k] || 0) < slot.cost[k]) return false;
    for (const k in (slot.requires || {})) if ((u.res[k] || 0) < slot.requires[k]) return false;
    return true;
  }
  pay(u, slot) {
    for (const k in (slot.cost || {})) u.res[k] -= slot.cost[k];
    for (const k of (slot.consumeAll || [])) u.res[k] = 0;
  }
  // ---------- 이블린: 와이어 / 반격 ----------
  pull(tgt, src, dur) { if (tgt.dead || tgt.airborne) return; tgt.action = null; tgt.pull = { t: dur, src }; }
  wireFx(u, tgt, dur, n = 1) { this.fx.push({ type: 'wire', u, tgt, n, t: 0, dur }); }
  garroteFx(tgt, dur, big) { this.fx.push({ type: 'garrote', tgt, big, t: 0, dur }); for (let i = 0; i < (big ? 14 : 8); i++) this.spark(tgt.x + rand(-12, 12), tgt.y - rand(6, 30), '#ffb36b', -40); }
  threatTo(u) { // 반격 AI: 다가오는 공격 감지
    for (const p of this.proj) {
      if (p.src === u) continue;
      const dx = u.x - p.x, dy = u.y - 18 - p.y, d = Math.hypot(dx, dy);
      if (d < 110 && (p.vx * dx + p.vy * dy) > 0) return true;
    }
    const e = this.enemy(u), a = e.action, d = dist(u, e);
    if (a && (a.type === 'dash' || a.type === 'chase' || a.type === 'charge') && d < 200) return true;
    if (a && a.type === 'wind' && d < 150) return true;
    for (const t of this.tele) if (Math.hypot((t.x ?? t.x2 ?? 0) - u.x, (t.y ?? t.y2 ?? 0) - u.y) < 80) return true;
    return false;
  }
  startCounter(u, w) {
    u.counter = { t: w, max: w };
    this.shock(u.x, u.y - 16, 4, 26, '#ffd8a0', 0.3, 2);
  }
  counterTrigger(u, src) {
    u.counter = null; u.evadeT = this.time + 0.35;
    this.stats.counters = (this.stats.counters || 0) + 1;
    this.resEvent(u, 'counterSuccess');
    const e = src || this.enemy(u), a = Math.atan2(u.y - e.y, u.x - e.x) + (Math.random() < 0.5 ? 1.3 : -1.3);
    this.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.35, a: 0.5 });
    const p = this.clampPos(u.x + Math.cos(a) * 26, u.y + Math.sin(a) * 26, u.pad); u.x = p.x; u.y = p.y;
    this.text(u.x, u.y - 52, '회피', '#ffe0a0', 12);
    this.ring(u.x, u.y - 16, 4, 30, 0.3, '#ffd08a'); this.glow(u.x, u.y - 18, 34, '#ff9a4a', 0.35);
    this.wireFx(u, e, 0.3);
  }
  // ---------- 넘어짐 기절 (트램펄린 충격파 / 대지 분쇄 공용) ----------
  knockdown(src, e, dur, chance = 1) {
    const r = this.statusResist(e, 'stun');
    if (Math.random() < chance * (1 - r)) {
      const s = this.applyStatus(e, 'stun', dur * (1 - r / 2), src);
      if (s) { s.knock = true; e.knockSide = e.x < src.x ? -1 : 1; this.dust(e.x, e.y); this.say(e, 'knockedDown'); return true; }
    } else this.text(e.x, e.y - 84, '기절 저항', '#a8b0c4', 9);
    return false;
  }
  crackLine(x, y, ang, len) {
    const pts = [[x, y]]; let px = x, py = y;
    for (let i = 1; i <= 10; i++) { const r = len * i / 10, j = rand(-6, 6); pts.push([x + Math.cos(ang) * r - Math.sin(ang) * j, y + Math.sin(ang) * r * 0.85 + Math.cos(ang) * j]); }
    this.fx.push({ type: 'crack', pts, t: 0, dur: 1.6 });
    this.stats.shatters = (this.stats.shatters || 0) + 1;
  }
  // ---------- 라인하르트: 방벽 ----------
  barrierGeom(u) { const B = u.barrier, c = Math.cos(B.ang), s = Math.sin(B.ang); return { cx: u.x + c * 26, cy: u.y - 18 + s * 22, nx: c, ny: s, tx: -s, ty: c, hw: 30 }; }
  updateBarrier(u, dt) {
    const B = u.barrier, e = this.enemy(u);
    B.t -= dt; B.hitT = Math.max(0, B.hitT - dt);
    if (!u.dead && !e.dead) { const ta = Math.atan2(e.y - u.y, e.x - u.x), df = Math.atan2(Math.sin(ta - B.ang), Math.cos(ta - B.ang)); B.ang += clamp(df, -6 * dt, 6 * dt); }
    if (B.t <= 0 || u.dead) { const g = this.barrierGeom(u); this.ring(g.cx, g.cy + 18, 4, 26, 0.3, '#bfe3ff'); u.barrier = null; }
  }
  barrierHit(u, amt, x, y) {
    const B = u.barrier; if (!B) return;
    B.hp -= amt; B.hitT = 0.15; if (B.hp > 0) this.say(u, 'barrierHit'); this.stats.blocked = (this.stats.blocked || 0) + amt;
    this.text(x, y - 8, String(Math.round(amt)), '#9fd8ff', 9);
    this.burst(x, y, '#cfeaff', 5); this.ring(x, y, 2, 12, 0.2, '#bfe3ff');
    if (B.hp <= 0) {
      const g = this.barrierGeom(u);
      for (let i = 0; i < 26; i++) { const k = rand(-1, 1); this.parts.push({ x: g.cx + g.tx * g.hw * k, y: g.cy - rand(-8, 24), vx: g.nx * rand(20, 90) + rand(-40, 40), vy: rand(-90, -20), g: 300, life: rand(0.4, 0.8), max: 0.8, color: ['#cfeaff', '#8fc8ff', '#ffffff'][i % 3], size: rand(2, 3.5), glow: i % 3 === 0 }); }
      this.shock(g.cx, g.cy + 10, 6, 40, '#bfe3ff', 0.4, 4); this.shake(1.5);
      this.hooks.onSystem && this.hooks.onSystem('방벽이 파괴되었습니다!'); this.say(u, 'barrierBroken');
      u.barrier = null;
    }
  }
  // 투사체가 방벽을 통과하는지 (앞면으로 들어오는 경우만)
  barrierBlocks(u, p) {
    if (!u.barrier || u.dead) return false;
    const g = this.barrierGeom(u), rx = p.x - g.cx, ry = p.y - g.cy, dn = rx * g.nx + ry * g.ny, dtn = rx * g.tx + ry * g.ty;
    return Math.abs(dtn) < g.hw && dn < 5 && dn > -12 && (p.vx * g.nx + p.vy * g.ny) < 0;
  }
  basicAttack(u, e) {
    u.swing = 0.2;
    const miss = Math.random() < u.smax('misdirect') && !(u.st.range >= 80 && e.airborne); // 혼란: 오조준 (공중 대상 원거리는 반드시 명중)
    const atk = { ...(u.def.attack || {}), applies: u.def.attackApplies }; // 기본 공격 피해 속성
    if (u.st.range >= 80) {
      if (miss) {
        const a = Math.atan2(e.y - u.y, e.x - u.x) + (Math.random() < 0.5 ? -1 : 1) * rand(0.7, 1.6);
        this.shoot(u, { angle: a, spd: 560, dmg: u.st.atk, kind: u.def.projectile || 'arrow', hit: atk });
        this.text(u.x, u.y - 50, '?', '#e0b8ff', 12);
      } else {
        this.proj.push({ x: u.x + u.facing * 10, y: u.y - 18, tgt: e, src: u, spd: 560, dmg: u.st.atk, kind: u.def.projectile || 'arrow', homing: true, life: 2.5, trail: 0, hit: atk });
        playSfx('shot');
      }
    } else {
      this.later(0.08, () => {
        if (miss) { this.slashFx(u.x - u.facing * 18, u.y - 18, -u.facing, '#e0b8ff', 0.8); this.text(u.x, u.y - 50, '빗나감', '#e0b8ff', 10); playSfx('whiff'); return; }
        if (!u.dead && !u.stun && dist(u, e) <= u.reach + 12) {
          const bd = this.damage(u, e, u.st.atk, atk);
          if (bd > 0) this.resEvent(u, 'basicHit');
          if (u.def.combo && !u.action && !u.dead && !e.dead) u.action = { type: 'combo', phase: 0, t: 0, ang: Math.atan2(u.y - e.y, u.x - e.x), C: u.def.combo, atk, trail: '#ffc890' };
          this.slashFx(e.x - u.facing * 4, e.y - 18, u.facing, '#ffffff', 1);
        } else { this.slashFx(u.x + u.facing * 18, u.y - 18, u.facing, '#ffffff', 0.8); playSfx('whiff'); }
        const bl = this.blockAt(u.x + u.facing * 20, u.y - 4, 8); // 근처 건물도 타격
        if (bl) this.hitBuilding(bl, u.st.atk * this.rules.meleeK, false, u.x + u.facing * 16, u.y - 14);
      });
    }
  }

  shoot(u, o) {
    this.proj.push({ x: u.x + u.facing * 10, y: u.y - 18, vx: Math.cos(o.angle) * o.spd, vy: Math.sin(o.angle) * o.spd, src: u, dmg: o.dmg, kind: o.kind, homing: false, life: 1.6, trail: 0, piercesBarrier: !!o.piercesBarrier, hit: o.hit || { applies: o.applies } });
    playSfx('shot');
  }

  // 투사체: 상대 팀 전원과 충돌 판정 (p.hitAlly(o) 가 true 면 아군도 맞음 — 파라가스 초음파/브로리 기탄)
  //  p.r: 충돌 반경, p.onHitUnit(o): 커스텀 적중 처리(피해 직접), p.cancel: 닿은 상대 팀 투사체 소멸, p.fizzle(): 수명 종료 시
  updateProj(dt) {
    for (const p of this.proj) {
      p.life -= dt;
      if (p.life <= 0 && p.fizzle) { p.fizzle(p); p.fizzle = null; continue; } // 수명 종료 (커스텀 투사체만)
      const e = this.enemy(p.src);
      if (e.airborne && !e.dead && !p.noAirLock) { p.homing = true; p.tgt = e; } // 공중 대상: 원거리 필중
      if (p.homing) {
        if (!p.tgt || p.tgt.dead) p.tgt = e; // 대상이 쓰러지면 남은 상대에게
        if (!p.tgt.dead) {
          const tx = p.tgt.x, ty = p.tgt.y - 18 - this.airZ(p.tgt), d = Math.hypot(tx - p.x, ty - p.y);
          p.vx = (tx - p.x) / (d || 1) * p.spd; p.vy = (ty - p.y) / (d || 1) * p.spd;
        }
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const C = this.stage.circle;
      if (C && Math.hypot(p.x - C.cx, p.y + 14 - C.cy) > this.circleR()) { p.life = 0; this.burst(p.x, p.y, '#f0e8e0', 4); p.fizzle && p.fizzle(p); continue; }
      if (this.balls.length) for (const ball of this.balls) { const dx = ball.x - p.x, dy = ball.y - (p.y + 14); if (dx * dx + dy * dy < 64) { const sp = Math.hypot(p.vx, p.vy) || 1; ball.vx += p.vx / sp * 160; ball.vy += p.vy / sp * 160; ball.z = 5; } }
      const bar = !p.piercesBarrier && this.u.find(o => o.team !== p.src.team && this.barrierBlocks(o, p));
      if (bar) { p.life = 0; this.barrierHit(bar, p.dmg, p.x, p.y); continue; } // 방벽
      const bl = this.blockAt(p.x, p.y + 14);
      if (bl && p.pierce) { if (!(p.hitB || (p.hitB = new Set())).has(bl)) { p.hitB.add(bl); this.hitBuilding(bl, p.dmg * this.rules.projK, false, p.x, p.y); } }
      else if (bl) { // 건물이 투사체를 막음
        p.life = 0; this.hitBuilding(bl, p.dmg * this.rules.projK, false, p.x, p.y);
        this.burst(p.x, p.y, PROJ_COL[p.kind] || '#e8e0c8', 4); p.fizzle && p.fizzle(p); continue;
      }
      if (p.cancel) for (const q of this.proj) { // 데덴탄: 상대 투사체 상쇄
        if (q === p || q.life <= 0 || q.src.team === p.src.team || Math.hypot(q.x - p.x, q.y - p.y) > (p.r || 12) + 6) continue;
        q.life = 0; this.burst(q.x, q.y, '#c8ffb0', 8); this.ring(q.x, q.y, 3, 18, 0.25, '#b8ff9a'); this.stats.cancels = (this.stats.cancels || 0) + 1;
      }
      p.trail += dt;
      if (!p.draw && p.kind !== 'arrow' && p.trail > 0.016) { p.trail = 0; this.parts.push({ x: p.x, y: p.y, vx: rand(-10, 10), vy: rand(-10, 10), life: 0.3, max: 0.3, color: PROJ_COL[p.kind] || '#a8d8ff', size: p.kind === 'arrowG' ? 2.5 : 2, glow: true }); }
      if (!p.done) for (const o of this.u) {
        if (o.dead || o === p.src || o.hidden || (o.team === p.src.team && !(p.hitAlly && p.hitAlly(o)))) continue;
        if (p.hitSet && p.hitSet.has(o)) continue;
        if (Math.hypot(o.x - p.x, o.y - 18 - this.airZ(o) - p.y) >= (p.r || (p.pierce ? 18 : 12)) + (p.r ? o.pad * 0.6 : 0)) continue;
        if (p.pierce) (p.hitSet || (p.hitSet = new Set())).add(o); else p.life = 0;
        if (p.onHitUnit) p.onHitUnit(o, p);
        else {
          const pd = this.damage(p.src, o, p.dmg, { ...(p.hit || {}), viaProj: true });
          if (pd > 0 && p.onHit) p.onHit(o);
        }
        const c = PROJ_COL[p.kind] || '#e8e0c8';
        if (!p.draw) { this.burst(p.x, p.y, c, 5); if (p.kind !== 'arrow') this.glow(p.x, p.y, 18, c, 0.25); }
        if (!p.pierce) break;
      }
      if (p.x < AR.x - 20 || p.x > AR.x + AR.w + 20 || p.y < AR.y - 40 || p.y > AR.y + AR.h + 20) p.life = 0;
    }
    this.proj = this.proj.filter(p => p.life > 0);
  }

  // ---------- 전투 API (스킬에서 사용) ----------
  damage(src, tgt, amount, o = {}) {
    if (tgt.dead || this.over) return 0;
    if ((tgt.counter || tgt.evadeT > this.time) && src !== tgt && !o.dot && !o.reflected) { // 반격 회피
      if (tgt.counter) this.counterTrigger(tgt, src); else { this.text(tgt.x, tgt.y - 52, '회피', '#ffe0a0', 10); playSfx('whiff'); }
      return 0;
    }
    if (tgt.barrier && o.delivery === 'ranged' && !o.viaProj && !o.piercesBarrier && !o.dot && !o.reflected) { // 비투사체 원거리: 정면이면 방벽이 흡수
      const ta = Math.atan2(src.y - tgt.y, src.x - tgt.x), df = Math.abs(Math.atan2(Math.sin(ta - tgt.barrier.ang), Math.cos(ta - tgt.barrier.ang)));
      if (df < 1.2) { const g = this.barrierGeom(tgt); this.barrierHit(tgt, amount, g.cx, g.cy); return 0; }
    }
    const hc = this.hitCheck(src, tgt, o);
    if (!hc.hit) { this.text(tgt.x, tgt.y - 48 - this.airZ(tgt), hc.label, '#c8d8ff', 11); playSfx('whiff'); return 0; }
    if (hc.sure) this.text(tgt.x + 8, tgt.y - 58 - this.airZ(tgt), hc.label, '#9ff0ff', 9);
    let dmg = amount, crit = !!o.crit;
    if (!crit && !o.noCrit && Math.random() < src.st.crit) crit = true;
    if (crit) dmg *= 1.75;
    // 방어력 (관통: 방어력의 일부 무시). 지속 피해는 방어 무시
    const effDef = o.dot ? 0 : Math.max(0, tgt.st.def * (1 - clamp(o.pierce || 0, 0, 1)));
    dmg *= 100 / (100 + effDef);
    // 속성 / 전달 방식 배율
    const em = this.elemMult(tgt, o);
    dmg *= em;
    dmg *= tgt.mult('dmgTaken') * tgt.smult('dmgTaken') * src.smult('dmgDealt') * src.mult('dmgDealt'); // 버프 dmgDealt (아이돌 무대 팬심 등)
    for (const s of [...tgt.statuses]) { const d = STATUS_DEFS[s.id]; if (d && d.onDamaged) dmg *= d.onDamaged(tgt, this, s, o) ?? 1; }
    dmg *= 1 + Math.max(0, this.time - RAMP_START) * RAMP_RATE; // 장기전 방지: RAMP_START초 이후 피해 점증
    dmg = Math.max(1, Math.round(dmg * rand(0.85, 1.15)));
    tgt.hp -= dmg;
    if (o.dot) { // 지속 피해: 조용히 표시
      this.text(tgt.x + rand(-8, 8), tgt.y - 36, String(dmg), o.color || '#b8f08a', 9);
      if (tgt.hp <= 0) this.kill(tgt, src);
      return dmg;
    }
    if (src !== tgt) { this.resEvent(src, 'dealt'); this.resEvent(tgt, 'damaged'); }
    if (src.oni && src !== tgt && !o.reflected && !o.selfHit) { // 오니화: 모든 공격 2회 + 적중마다 자해
      const O = src.def.oni;
      if (!o.oniEcho) this.later(O.echoDelay, () => { if (!tgt.dead && !src.dead && !this.over) { this.slashFx(tgt.x + rand(-6, 6), tgt.y - 18 - this.airZ(tgt), -src.facing, '#ff6a7a', 1); this.damage(src, tgt, amount * O.echoMult, { ...o, oniEcho: true, applies: null }); } });
      const sd = Math.max(O.selfMin, Math.round(dmg * O.selfK));
      if (src.hp > 1) { src.hp = Math.max(1, src.hp - sd); this.text(src.x + rand(-6, 6), src.y - 44, String(sd), '#ff6a7a', 9); }
    }
    tgt.flash = 0.12;
    const a = Math.atan2(tgt.y - src.y, tgt.x - src.x), kb = o.big ? 7 : 3;
    tgt.kx += Math.cos(a) * kb; tgt.ky += Math.sin(a) * kb;
    const big = o.big || dmg >= 45;
    const wk = em >= ELEMENT_FX.weak.min ? ELEMENT_FX.weak : em <= ELEMENT_FX.resist.max ? ELEMENT_FX.resist : null;
    const ncol = wk ? wk.color : crit ? '#ffe27a' : (o.color || '#ffffff');
    this.text(tgt.x + rand(-6, 6), tgt.y - 40, String(dmg), ncol, (big ? 15 : 11) + (wk ? wk.sizeAdd : 0));
    if (wk) this.text(tgt.x + rand(-4, 4), tgt.y - 56, wk.label, wk.color, wk === ELEMENT_FX.weak ? 10 : 9);
    this.burst(tgt.x, tgt.y - 18, crit ? '#ffe27a' : '#ffd9c8', big ? 10 : 5);
    if (big) this.shake(2.5);
    playSfx(big ? 'big' : crit ? 'crit' : (o.viaProj || o.delivery === 'ranged') ? 'projHit' : 'melee', { element: o.element, dmg, crit });
    const sh = tgt.buff('shield');
    if (sh && sh.reflect && !o.reflected) this.damage(tgt, src, dmg / sh.dmgTaken * sh.reflect, { reflected: true, noCrit: true, color: '#bfe3ff' });
    const ls = src.buffs.reduce((s, b) => s + (b.lifesteal || 0), 0);
    if (ls > 0 && !src.dead) this.heal(src, dmg * ls, true);
    if (tgt.hp > 0 && !tgt.lowSaid && tgt.hp < tgt.maxHp * 0.3) { tgt.lowSaid = true; this.say(tgt, 'lowHp'); }
    if (tgt.hp <= 0) this.kill(tgt, src);
    else if (o.applies) this.applyList(src, tgt, o.applies);
    if (src !== tgt && src.team !== tgt.team && !tgt.dead && !src.dead && !this.over && !o.reflected) { // 캐릭터 패시브 훅: def.onHit(공격 적중) / def.onHurt(피격)
      if (src.def.onHit) src.def.onHit(src, tgt, this, dmg, o);
      if (tgt.def.onHurt) tgt.def.onHurt(tgt, src, this, dmg, o);
    }
    return dmg;
  }
  kill(tgt, src) {
    if (tgt.dead) return;
    tgt.hp = 0; tgt.dead = true; tgt.action = null; tgt.statuses = [];
    if (this.teamAlive(tgt.team)) { // 다인 팀: 팀원이 남아 있으면 계속 (팀 전멸 시 패배)
      this.say(tgt, 'lose');
      this.burst(tgt.x, tgt.y - 16, tgt.def.color, 20); this.glow(tgt.x, tgt.y - 18, 50, tgt.def.color, 0.5);
      this.shock(tgt.x, tgt.y, 6, 60, tgt.def.color, 0.5, 5); this.hitstop(0.15); this.shake(2.5);
      this.hooks.onSystem && this.hooks.onSystem(tgt.def.name + ' 쓰러짐!');
      this.allyDown(tgt);
      return;
    }
    this.over = true; this.winner = src && src.team !== tgt.team && !src.dead ? src : this.teamBest(1 - tgt.team);
    const w = this.winner; if (w.def.lines && w.def.lines.event && w.def.lines.event.kill) this.say(w, 'kill'); else this.say(w, 'win');
    this.say(tgt, 'lose');
    this.burst(tgt.x, tgt.y - 16, tgt.def.color, 26);
    this.glow(tgt.x, tgt.y - 18, 60, tgt.def.color, 0.6);
    this.shock(tgt.x, tgt.y, 6, 70, tgt.def.color, 0.6, 6);
    this.hitstop(0.25);
    this.shake(3);
    playSfx('ko');
  }
  // 팀원 쓰러짐: 붙잡고 있던 대상 해제 + 남은 팀원의 def.onAllyDown 훅 (브로리 → 전설의 슈퍼사이어인)
  allyDown(d) {
    for (const o of this.u) if (o.action && o.action.tgt === d) { if (o.action.pin) this.releasePin(d); o.action = null; }
    for (const a of this.allies(d)) a.def.onAllyDown && a.def.onAllyDown(a, d, this);
  }
  // 넉백: 지정 방향으로 미끄러져 밀려남. 벽/장애물에 막히면 정지(+onWall)
  knockback(tgt, ang, spd, dur, onWall) { if (tgt.dead || tgt.airborne || tgt.climb || tgt.inTrain) return; tgt.action = null; tgt.push = { ang, spd, t: dur, dur, onWall }; }
  pushStep(u, dt) {
    const P = u.push, k = P.spd * (0.35 + 0.65 * P.t / P.dur) * dt, c = Math.cos(P.ang), s = Math.sin(P.ang);
    P.t -= dt;
    const nx = u.x + c * k, ny = u.y + s * k, q = this.clampPos(nx, ny, u.pad, u), bl = this.blockAt(nx, ny - 4, 9 + u.pad);
    if (bl || Math.abs(q.x - nx) > 0.3 || Math.abs(q.y - ny) > 0.3) {
      u.push = null; playSfx('wall'); this.dust(u.x, u.y); this.ring(u.x + c * 12, u.y - 6, 2, 14, 0.25, '#f0e8d8');
      u.dir = fixAngle(P.ang + Math.PI + rand(-0.6, 0.6)); P.onWall && P.onWall(bl); return;
    }
    u.x = q.x; u.y = q.y; if (Math.random() < 0.6) this.dust(u.x, u.y);
    if (P.t <= 0 || u.climb || u.airborne) u.push = null;
  }
  heal(u, amt, quiet) {
    if (u.dead) return;
    amt = Math.round(Math.min(amt, u.maxHp - u.hp));
    if (amt <= 0) return;
    u.hp += amt; this.say(u, 'healed');
    if (!quiet || amt >= 8) this.text(u.x + rand(-6, 6), u.y - 44, '+' + amt, '#9cf0a0', quiet ? 10 : 13);
  }
  stun(u, t, src) { this.applyStatus(u, 'stun', t, src || this.enemy(u)); }
  // ---------- 화려한 이펙트 API ----------
  hitstop(t) { this.slowT = Math.max(this.slowT || 0, t); }
  zoomAt(x, y, k) { this.zoom = { x, y, k, t: 0, dur: 0.35 }; }
  glow(x, y, r, color, dur = 0.4) { this.fx.push({ type: 'glow', x, y, r, color, t: 0, dur }); }
  shock(x, y, r0, r1, color, dur = 0.45, w = 6) { this.fx.push({ type: 'shock', x, y, r0, r1, color, w, t: 0, dur }); if (this.balls && this.balls.length) this.pushBalls(x, y, r1 * 1.15, 260); }
  streak(x1, y1, x2, y2, color, w = 10, dur = 0.3) { this.fx.push({ type: 'streak', x1, y1, x2, y2, color, w, t: 0, dur }); }
  crescent(x, y, r, ang, color, dur = 0.3, delay = 0) { this.fx.push({ type: 'crescent', x, y, r, ang, color, t: -delay, dur: dur + delay, delay }); }
  bolt(x, y, h, color) {
    const pts = []; for (let i = 0; i <= 7; i++) pts.push([x + (i === 0 || i === 7 ? 0 : rand(-10, 10)), y - h + h * i / 7]);
    this.fx.push({ type: 'bolt', pts, color, t: 0, dur: 0.35 });
  }
  zap(x, y) { this.bolt(x, y, 26, '#fff4a0'); this.sparks(x, y, '#fff6a8', 6, 100); }
  sparks(x, y, color, n, spd = 200, dir = null) {
    for (let i = 0; i < n; i++) {
      const a = dir == null ? rand(0, 6.28) : dir + rand(-0.9, 0.9), s = rand(0.4, 1) * spd;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.45), max: 0.45, color, size: 2, line: true, glow: true });
    }
  }
  embers(x, y, color, n) { for (let i = 0; i < n; i++) this.parts.push({ x: x + rand(-16, 16), y: y - rand(0, 24), vx: rand(-15, 15), vy: rand(-90, -30), life: rand(0.5, 1), max: 1, color, size: rand(2, 3.5), glow: true }); }
  smoke(x, y, color, n) { for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(20, 80); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 15, life: rand(0.4, 0.8), max: 0.8, color, size: rand(3, 6), soft: true }); } this.glow(x, y, 34, color, 0.4); }
  debris(x, y, n) { for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(60, 180); this.parts.push({ x, y: y - 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - rand(60, 140), g: 420, life: rand(0.4, 0.8), max: 0.8, color: ['#a89878', '#c8b898', '#7a6a58'][i % 3], size: rand(2, 4) }); } }
  shatter(x, y) { this.debris(x, y + 14, 22); this.shock(x, y + 18, 4, 40, '#e8e0d0', 0.4, 4); this.hitstop(0.12); }
  windup(u, t, next) { u.action = { type: 'wind', t, next }; }
  // 추적 돌진: 대상에게 닿을 때까지(최대 dur초) 고속 추적
  chase(u, e, spd, dur, onTouch, trail) { u.action = { type: 'chase', e, spd, dur, t: 0, onTouch, trail }; }
  // 이동 예측 위치 (직선 가정, 경기장 안으로 제한)
  predict(e, t) { if (e.action || e.stun > 0) return { x: e.x, y: e.y }; return this.clampPos(e.x + Math.cos(e.dir) * e.speed * t, e.y + Math.sin(e.dir) * e.speed * t); }
  dash(u, tx, ty, dur, onTouch, trail) { u.action = { type: 'dash', sx: u.x, sy: u.y, tx, ty, dur, t: 0, onTouch, touched: false, trail }; playSfx('dash'); }
  shake(a) { this.shakeA = Math.max(this.shakeT > 0 ? this.shakeA : 0, a); this.shakeT = 0.18; }
  text(x, y, txt, color, size) { this.texts.push({ x, y, txt, color, size, t: 0, dur: 0.9 }); }
  telegraphLine(x1, y1, x2, y2, w, dur, color) { this.tele.push({ type: 'line', x1, y1, x2, y2, w, dur, color, t: 0 }); }
  telegraphCircle(x, y, r, dur, color) { this.tele.push({ type: 'circle', x, y, r, dur, color, t: 0 }); }
  telegraphFan(x, y, a, spread, len, dur, color) { this.tele.push({ type: 'fan', x, y, a, spread, len, dur, color, t: 0 }); }
  slashFx(x, y, dir, color, s) { this.fx.push({ type: 'slash', x, y, dir, color, s, t: 0, dur: 0.18 }); }
  ring(x, y, r0, r1, dur, color) { this.fx.push({ type: 'ring', x, y, r0, r1, color, t: 0, dur }); }
  pillar(x, y, color) { this.fx.push({ type: 'pillar', x, y, color, t: 0, dur: 1.0 }); for (let i = 0; i < 14; i++) this.spark(x + rand(-12, 12), y - rand(0, 30), color, -50); }
  meteor(x, y, dur) { this.fx.push({ type: 'meteor', x, y, t: 0, dur }); }
  explosion(x, y, r) {
    playSfx('boom');
    this.areaBuildings(x, y, r * 1.1, 160, true);
    this.shock(x, y, 8, r * 1.5, '#ffcf8a', 0.55, 9);
    this.shock(x, y, 4, r, '#fff0c8', 0.35, 4);
    this.glow(x, y - 8, r * 1.4, '#ff9a4a', 0.6);
    this.glow(x, y - 8, r * 0.7, '#ffe0a0', 0.3);
    this.embers(x, y, '#ffb36b', 18);
    this.sparks(x, y - 8, '#ffd8a0', 20, 300);
    this.smoke(x, y - 10, '#6a5048', 10);
    this.hitstop(0.14); this.zoomAt(x, y, 0.05); this.shake(2.5);
    for (let i = 0; i < 26; i++) { const a = rand(0, 6.28), s = rand(30, 120); this.parts.push({ x, y: y - 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 20, life: rand(0.3, 0.7), max: 0.7, color: ['#ffb36b', '#ffd38a', '#e8735a'][i % 3], size: rand(2, 4) }); }
  }
  puff(x, y, color) { for (let i = 0; i < 14; i++) { const a = rand(0, 6.28), s = rand(20, 60); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: rand(0.3, 0.6), max: 0.6, color, size: rand(2, 4) }); } }
  burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(30, 90); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 160, life: rand(0.25, 0.5), max: 0.5, color, size: rand(1.5, 3) }); } }
  spark(x, y, color, vy) { this.parts.push({ x, y, vx: rand(-8, 8), vy: vy * rand(0.6, 1.2), life: 0.6, max: 0.6, color, size: 2 }); }
}

/* ---------- 렌더링 ---------- */
const Render = (() => {
  const floors = {};
  function makeFloor(stageId = 'arena') {
    const st = STAGE_DEFS[stageId] || STAGE_DEFS.arena;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#1e2130'; x.fillRect(0, 0, W, H);
    const T = 24;
    for (let j = 0; j * T < AR.h; j++) for (let i = 0; i * T < AR.w; i++) {
      const px = AR.x + i * T, py = AR.y + j * T;
      x.fillStyle = (i + j) % 2 ? '#3f4c45' : '#44524a';
      x.fillRect(px, py, T, T);
      x.fillStyle = 'rgba(255,255,255,0.035)'; x.fillRect(px, py, T, 1); x.fillRect(px, py, 1, T);
      x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(px, py + T - 1, T, 1);
      if (((i * 7 + j * 13) % 5) === 0) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(px + 6 + (i % 3) * 4, py + 8 + (j % 3) * 3, 2, 2); }
    }
    for (const h of STAGE_HOOKS) h.floor && h.floor(x, st);
    if (st.theme === 'island') paintIsland(x, st);
    if (st.theme === 'city') paintCity(x, st);
    if (st.theme === 'ball') { x.fillStyle = '#1c1a24'; x.fillRect(AR.x, AR.y, AR.w, AR.h); x.fillStyle = '#24212e'; for (let j = 0; j < AR.h; j += 8) for (let i = (j / 8) % 2 * 8; i < AR.w; i += 16) x.fillRect(AR.x + i, AR.y + j, 8, 8); }
    if (st.theme === 'pit') paintPit(x, st);
    if (st.theme === 'ice') paintIce(x, st);
    if (st.theme === 'tramp') paintTramp(x, st);
    // 벽 테두리
    x.fillStyle = '#2b2f40'; x.fillRect(AR.x - 6, AR.y - 6, AR.w + 12, 6); x.fillRect(AR.x - 6, AR.y + AR.h, AR.w + 12, 6);
    x.fillRect(AR.x - 6, AR.y, 6, AR.h); x.fillRect(AR.x + AR.w, AR.y, 6, AR.h);
    x.fillStyle = '#3a3f55';
    for (let i = 0; i < AR.w + 12; i += 12) { x.fillRect(AR.x - 6 + i, AR.y - 6, 10, 2); x.fillRect(AR.x - 6 + i, AR.y + AR.h, 10, 2); }
    if (st.theme !== 'arena') return c;
    // 중앙 원
    x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 2;
    x.beginPath(); x.arc(AR.x + AR.w / 2, AR.y + AR.h / 2, 50, 0, 6.28); x.stroke();
    x.beginPath(); x.moveTo(AR.x + AR.w / 2, AR.y); x.lineTo(AR.x + AR.w / 2, AR.y + AR.h); x.stroke();
    return c;
  }

  // 무인도: 물 타일 + 모래 테두리 + 잔디 섬
  function paintIsland(x, st) {
    const I = st.island, T = 12;
    for (let j = 0; j * T < AR.h; j++) for (let i = 0; i * T < AR.w; i++) {
      const px = AR.x + i * T, py = AR.y + j * T;
      x.fillStyle = (i + j) % 2 ? '#2f6f9a' : '#32739f'; x.fillRect(px, py, T, T);
      x.fillStyle = '#3a82b0'; x.fillRect(px + ((i * 5 + j * 3) % 8), py + ((i * 3 + j * 7) % 9), 3, 1);
      if ((i * 11 + j * 5) % 7 === 0) { x.fillStyle = '#28628a'; x.fillRect(px + 2, py + 6, 4, 1); }
    }
    const ell = (rx, ry) => { x.beginPath(); x.ellipse(I.cx, I.cy, rx, ry, 0, 0, 6.28); };
    x.fillStyle = 'rgba(160,220,240,0.25)'; ell(I.rx + I.sand + 6, I.ry + I.sand + 6); x.fill(); // 얕은 물
    x.fillStyle = '#d8c48a'; ell(I.rx + I.sand * 0.4, I.ry + I.sand * 0.4); x.fill();             // 모래
    x.save(); ell(I.rx - I.sand * 0.6, I.ry - I.sand * 0.6); x.clip();
    for (let j = 0; j * 16 < AR.h; j++) for (let i = 0; i * 16 < AR.w; i++) {
      const px = AR.x + i * 16, py = AR.y + j * 16;
      x.fillStyle = (i + j) % 2 ? '#5f8f4f' : '#659855'; x.fillRect(px, py, 16, 16);
      if ((i * 7 + j * 3) % 4 === 0) { x.fillStyle = '#7aae62'; x.fillRect(px + 4 + (i % 3) * 3, py + 5, 1, 3); x.fillRect(px + 6 + (i % 3) * 3, py + 6, 1, 2); }
    }
    x.restore();
    // 모래 점묘
    for (let k = 0; k < 140; k++) {
      const a = k * 2.399, rr = 1 - (k % 5) * 0.012;
      x.fillStyle = k % 2 ? '#c8b07a' : '#e8d8a4';
      x.fillRect(Math.round(I.cx + Math.cos(a) * I.rx * rr), Math.round(I.cy + Math.sin(a) * I.ry * rr), 2, 1);
    }
    // 야자수 몇 그루 (장식)
    for (const [tx, ty] of [[150, 250], [222, 410], [120, 400]]) {
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.beginPath(); x.ellipse(tx + 3, ty + 2, 9, 3, 0, 0, 6.28); x.fill();
      x.fillStyle = '#8a6a44'; x.fillRect(tx, ty - 14, 3, 15);
      x.fillStyle = '#3f7a3a'; x.fillRect(tx - 7, ty - 17, 17, 3); x.fillRect(tx - 3, ty - 20, 9, 3); x.fillRect(tx - 9, ty - 14, 4, 2); x.fillRect(tx + 8, ty - 14, 4, 2);
    }
  }
  // 시가지: 아스팔트 도로 + 차선 + 보도
  function paintCity(x, st) {
    const T = 16;
    for (let j = 0; j * T < AR.h; j++) for (let i = 0; i * T < AR.w; i++) {
      const px = AR.x + i * T, py = AR.y + j * T;
      x.fillStyle = (i + j) % 2 ? '#4a4c56' : '#4e505a'; x.fillRect(px, py, T, T);
      if ((i * 13 + j * 7) % 9 === 0) { x.fillStyle = '#44464f'; x.fillRect(px + 5, py + 9, 3, 2); }
    }
    x.fillStyle = 'rgba(240,220,140,0.35)';
    for (let yy = AR.y + 8; yy < AR.y + AR.h; yy += 18) x.fillRect(AR.x + AR.w / 2 - 1, yy, 2, 9);
    for (let xx = AR.x + 8; xx < AR.x + AR.w; xx += 18) { x.fillRect(xx, 344, 9, 2); }
    for (const b of st.buildings || []) { // 보도
      x.fillStyle = '#6a6c74'; x.fillRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
      x.fillStyle = '#787a82'; for (let k = b.x - 5; k < b.x + b.w + 5; k += 6) x.fillRect(k, b.y - 5, 1, b.h + 10);
    }
  }
  function paintIce(x, st) {
    const T = 24;
    for (let j = 0; j * T < AR.h; j++) for (let i = 0; i * T < AR.w; i++) {
      const px = AR.x + i * T, py = AR.y + j * T;
      x.fillStyle = (i + j) % 2 ? '#bcdcea' : '#c4e2ee'; x.fillRect(px, py, T, T);
      x.fillStyle = 'rgba(255,255,255,0.35)'; if ((i * 5 + j * 3) % 4 === 0) { x.fillRect(px + 4, py + 6, 8, 1); x.fillRect(px + 6, py + 7, 4, 1); }
      x.fillStyle = 'rgba(90,140,170,0.18)'; if ((i * 7 + j * 11) % 6 === 0) { x.fillRect(px + 12, py + 14, 6, 1); x.fillRect(px + 17, py + 15, 1, 4); }
    }
    const g = x.createRadialGradient(180, 325, 40, 180, 325, 260); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(60,90,120,0.18)');
    x.fillStyle = g; x.fillRect(AR.x, AR.y, AR.w, AR.h);
  }
  function paintTramp(x, st) {
    const T = 20;
    for (let j = 0; j * T < AR.h; j++) for (let i = 0; i * T < AR.w; i++) { x.fillStyle = (i + j) % 2 ? '#5b8f6a' : '#629870'; x.fillRect(AR.x + i * T, AR.y + j * T, T, T); }
    x.fillStyle = 'rgba(255,255,255,0.05)'; for (let j = 0; j < AR.h; j += 40) x.fillRect(AR.x, AR.y + j, AR.w, 20);
  }
  // 트램펄린 (출렁임 애니메이션)
  function drawPads(ctx, b, time) {
    for (const p of b.stage.pads || []) {
      const since = time - ((b.padT && b.padT.get(p)) ?? -9), w = since >= 0 && since < 0.5 ? Math.sin(since * 25) * (1 - since / 0.5) * 3 : 0;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(p.cx + 3, p.cy + 4, p.r + 6, (p.r + 6) * 0.7, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#3a6ac0'; ctx.beginPath(); ctx.ellipse(p.cx, p.cy, p.r + 6, (p.r + 6) * 0.7, 0, 0, 6.28); ctx.fill(); // 프레임
      for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; ctx.fillStyle = k % 2 ? '#f2c94c' : '#ef7a7a'; ctx.fillRect(Math.round(p.cx + Math.cos(a) * (p.r + 3)) - 2, Math.round(p.cy + Math.sin(a) * (p.r + 3) * 0.7) - 2, 4, 4); }
      ctx.fillStyle = '#2a2a3a'; ctx.beginPath(); ctx.ellipse(p.cx, p.cy + w * 0.5, p.r - w, (p.r - w) * 0.7, 0, 0, 6.28); ctx.fill(); // 매트
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      for (const rr of [0.35, 0.7]) { ctx.beginPath(); ctx.ellipse(p.cx, p.cy + w * 0.5, (p.r - w) * rr, (p.r - w) * rr * 0.7, 0, 0, 6.28); ctx.stroke(); }
      ctx.restore();
    }
  }
  // 얼음벽 구간 + 크레바스
  function drawIceWalls(ctx, b) {
    for (const s of b.iceSegs) {
      const horiz = s.side === 'top' || s.side === 'bottom';
      const x = horiz ? s.a0 : s.side === 'left' ? AR.x - 6 : AR.x + AR.w - 6;
      const y = horiz ? (s.side === 'top' ? AR.y - 6 : AR.y + AR.h - 6) : s.a0;
      const w = horiz ? s.a1 - s.a0 : 12, h = horiz ? 12 : s.a1 - s.a0;
      if (s.dead) { // 크레바스: 어두운 틈
        const g = horiz ? ctx.createLinearGradient(0, s.side === 'top' ? y + h : y, 0, s.side === 'top' ? y - 4 : y + h + 4) : ctx.createLinearGradient(s.side === 'left' ? x + w : x, 0, s.side === 'left' ? x - 4 : x + w + 4, 0);
        g.addColorStop(0, '#3a5a78'); g.addColorStop(0.4, '#14202e'); g.addColorStop(1, '#05080e');
        ctx.fillStyle = g; ctx.fillRect(x - (horiz ? 0 : 2), y - (horiz ? 2 : 0), w + (horiz ? 0 : 4), h + (horiz ? 4 : 0));
        ctx.fillStyle = '#e8f8ff'; for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4; ctx.fillRect(Math.round(horiz ? x + w * t : (s.side === 'left' ? x + w - 2 : x)), Math.round(horiz ? (s.side === 'top' ? y + h - 2 : y) : y + h * t), 2, 2); }
        continue;
      }
      ctx.fillStyle = '#9fd0ea'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#d8f2ff'; ctx.fillRect(x + 1, y + 1, w - 2, 2);
      ctx.fillStyle = 'rgba(60,110,150,0.6)'; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
      const cs = s.maxHp - s.hp; // 균열 단계
      ctx.strokeStyle = '#3a6888'; ctx.lineWidth = 1;
      for (let k = 0; k < cs; k++) {
        ctx.beginPath();
        let cx = x + (horiz ? w * (0.25 + 0.25 * k) : 6), cy = y + (horiz ? 6 : h * (0.25 + 0.25 * k));
        ctx.moveTo(cx, cy);
        for (let q = 0; q < 4; q++) { cx += horiz ? ((s.seed + q * 3 + k) % 5 - 2) * 2 : (q % 2 ? 3 : -3); cy += horiz ? (q % 2 ? 3 : -3) : ((s.seed + q * 3 + k) % 5 - 2) * 2; ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
    }
  }
  // 볼풀 바닥: 부드러운 매트 + 테두리 쿠션
  function paintPit(x, st) {
    const T = 20;
    for (let j = 0; j * T < AR.h; j++) for (let i = 0; i * T < AR.w; i++) {
      x.fillStyle = (i + j) % 2 ? '#5a6fa0' : '#6078a8'; x.fillRect(AR.x + i * T, AR.y + j * T, T, T);
    }
    x.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < AR.w; i += 40) x.fillRect(AR.x + i, AR.y, 20, AR.h);
    const cush = ['#f2c94c', '#ef7a7a', '#7fd38a', '#6fa8f0'];
    for (let i = 0; i < AR.w; i += 28) { x.fillStyle = cush[(i / 28) % 4]; x.fillRect(AR.x + i, AR.y, 26, 4); x.fillRect(AR.x + i, AR.y + AR.h - 4, 26, 4); }
    for (let j = 0; j < AR.h; j += 28) { x.fillStyle = cush[(j / 28 + 2) % 4]; x.fillRect(AR.x, AR.y + j, 4, 26); x.fillRect(AR.x + AR.w - 4, AR.y + j, 4, 26); }
  }
  function drawBalls(ctx, balls) {
    for (const b of balls) {
      const z = b.z || 0, x = Math.round(b.x), y = Math.round(b.y - z);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(Math.round(b.x) - b.r + 1, Math.round(b.y) + b.r - 2, b.r * 2 - 2, 2);
      ctx.fillStyle = Sprites.shade(b.color, 0.7); ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.28); ctx.fill();
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(x - 0.6, y - 0.6, b.r - 1.2, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x - 3, y - 3, 2, 2);
    }
  }
  // 캡슐 내부: 위 빨강 / 아래 흰색 / 가운데 띠와 버튼 (현재 반지름 R)
  function drawCapsule(ctx, C, R, R0, warnR, time) {
    ctx.save();
    // 닫힌 영역 (원래 반지름 ~ 현재 반지름)
    ctx.beginPath(); ctx.arc(C.cx, C.cy, R0 + 6, 0, 6.28); ctx.fillStyle = '#2a2632'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(C.cx, C.cy, R0 + 6, 0, 6.28); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 3;
    for (let k = -R0 * 2; k < R0 * 2; k += 12) { ctx.beginPath(); ctx.moveTo(C.cx + k, C.cy - R0 - 6); ctx.lineTo(C.cx + k + R0, C.cy + R0 + 6); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(C.cx, C.cy, R, 0, 6.28); ctx.clip();
    ctx.fillStyle = '#c8605c'; ctx.fillRect(C.cx - R, C.cy - R, R * 2, R);
    ctx.fillStyle = '#e8e2d8'; ctx.fillRect(C.cx - R, C.cy, R * 2, R);
    // 은은한 타일 무늬
    for (let j = -R; j < R; j += 16) for (let i = -R; i < R; i += 16) { if (((i + j) / 16) % 2) { ctx.fillStyle = j < 0 ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.035)'; ctx.fillRect(C.cx + i, C.cy + j, 16, 16); } }
    // 곡면 하이라이트
    const hg = ctx.createRadialGradient(C.cx - R * 0.4, C.cy - R * 0.5, 0, C.cx - R * 0.4, C.cy - R * 0.5, R * 0.9);
    hg.addColorStop(0, 'rgba(255,255,255,0.16)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg; ctx.fillRect(C.cx - R, C.cy - R, R * 2, R * 2);
    // 가운데 띠 + 버튼 (장식, 통과 가능)
    ctx.fillStyle = '#34303c'; ctx.fillRect(C.cx - R, C.cy - 5, R * 2, 10);
    ctx.fillStyle = '#34303c'; ctx.beginPath(); ctx.arc(C.cx, C.cy, 20, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#f4f0ea'; ctx.beginPath(); ctx.arc(C.cx, C.cy, 13, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#d8d2c8'; ctx.beginPath(); ctx.arc(C.cx, C.cy, 7, 0, 6.28); ctx.fill();
    ctx.restore();
    // 벽
    ctx.save();
    ctx.strokeStyle = '#2a2632'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(C.cx, C.cy, R + 3, 0, 6.28); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(C.cx, C.cy, R, 0, 6.28); ctx.stroke();
    // 축소 예고 링
    if (warnR < R - 1) {
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 4); ctx.strokeStyle = '#ffb0a0'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(C.cx, C.cy, warnR, 0, 6.28); ctx.stroke();
    }
    ctx.restore();
  }
  // 물결 애니메이션 (물 구역만)
  const glints = Array.from({ length: 70 }, (_, i) => ({ x: AR.x + ((i * 97) % AR.w), y: AR.y + ((i * 61 + (i % 7) * 13) % AR.h), ph: i * 1.7 }));
  function drawWater(ctx, b) {
    const I = b.stage.island; if (!I) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(AR.x, AR.y, AR.w, AR.h); ctx.ellipse(I.cx, I.cy, I.rx + I.sand * 0.4, I.ry + I.sand * 0.4, 0, 0, 6.28); ctx.clip('evenodd');
    for (const g of glints) {
      const a = 0.18 + 0.18 * Math.sin(b.time * 1.6 + g.ph);
      const ox = Math.sin(b.time * 0.8 + g.ph) * 3;
      ctx.globalAlpha = a; ctx.fillStyle = '#d8f4ff'; ctx.fillRect(Math.round(g.x + ox), g.y, 5, 1); ctx.fillRect(Math.round(g.x + ox + 2), g.y - 1, 2, 1);
    }
    // 해안 물보라
    for (let k = 0; k < 2; k++) {
      const s = 1 + ((b.time * 0.25 + k * 0.5) % 1) * 0.08;
      ctx.globalAlpha = 0.35 * (1 - ((b.time * 0.25 + k * 0.5) % 1)); ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(I.cx, I.cy, (I.rx + I.sand * 0.4) * s, (I.ry + I.sand * 0.4) * s, 0, 0, 6.28); ctx.stroke();
    }
    ctx.restore();
  }
  const WALL = ['#b88a6a', '#8a9ab0', '#c8b088'], ROOF = ['#7a4a3a', '#4a5a70', '#8a6a4a'];
  function drawRubble(ctx, b) {
    ctx.fillStyle = 'rgba(40,36,34,0.35)'; ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    for (const [rx, ry, w, h, c] of b.rubble) { ctx.fillStyle = ['#8a7e70', '#a69a88', '#6a6058'][c]; ctx.fillRect(Math.round(rx - w / 2), Math.round(ry - h / 2), Math.round(w), Math.round(h)); }
  }
  function drawBuilding(ctx, b) {
    if (b.draw) return b.draw(ctx, b); // 임시 지형 (지반 격파 암반 등) 커스텀 그리기
    const H = 14, s = b.style % 3, j = b.hitT > 0 ? Math.round(rand(-1, 1)) : 0;
    const x = b.x + j, y = b.y;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 4, y + 4, b.w, b.h);
    // 지붕
    ctx.fillStyle = ROOF[s]; ctx.fillRect(x, y - H, b.w, b.h);
    ctx.fillStyle = Sprites.shade(ROOF[s], 0.85); for (let yy = y - H + 3; yy < y - H + b.h; yy += 5) ctx.fillRect(x, yy, b.w, 1);
    ctx.fillStyle = Sprites.shade(ROOF[s], 1.25); ctx.fillRect(x, y - H, b.w, 2);
    // 전면 벽 + 창문 + 문
    ctx.fillStyle = WALL[s]; ctx.fillRect(x, y + b.h - H, b.w, H);
    ctx.fillStyle = Sprites.shade(WALL[s], 0.75); ctx.fillRect(x, y + b.h - 1, b.w, 1);
    const n = Math.floor((b.w - 6) / 9);
    for (let k = 0; k < n; k++) {
      const wx = x + 5 + k * 9;
      if (k === Math.floor(n / 2)) { ctx.fillStyle = '#4a3a30'; ctx.fillRect(wx, y + b.h - 9, 5, 8); continue; }
      ctx.fillStyle = b.windows[k % 12] ? '#ffe8a0' : '#3a4250'; ctx.fillRect(wx, y + b.h - 11, 5, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(wx, y + b.h - 11, 5, 1);
    }
    // 균열 (체력에 따라 단계적으로)
    const r = b.hp / b.maxHp, stage = r > 0.75 ? 0 : r > 0.5 ? 1 : r > 0.25 ? 2 : 3;
    ctx.strokeStyle = 'rgba(30,24,26,0.85)'; ctx.lineWidth = 1;
    for (let k = 0; k < stage; k++) for (const pts of b.cracks[k]) {
      ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px + j, py) : ctx.moveTo(px + j, py)); ctx.stroke();
    }
    if (stage >= 3) { ctx.fillStyle = 'rgba(30,24,26,0.5)'; ctx.fillRect(x + 3, y - H + 2, 4, 3); ctx.fillRect(x + b.w - 9, y + 4, 5, 3); }
  }
  // 산소 게이지
  function drawO2(ctx, u, x, y) {
    if (u.o2 == null || u.dead) return;
    const r = clamp(u.o2 / u.o2Max, 0, 1), top = Math.round(y - 57);
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = 'rgba(18,16,28,0.8)'; ctx.fillRect(x - 15, top, 30, 6);
    ctx.fillStyle = r > 0.3 ? '#7fd0ff' : '#ff9a8a'; ctx.fillRect(x - 9, top + 2, 22 * r, 2);
    ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x - 12, top + 3, 2, 0, 6.28); ctx.stroke();
    ctx.restore();
  }
  function thumb(stageId) {
    const st = STAGE_DEFS[stageId], f = makeFloor(stageId);
    const c = document.createElement('canvas'); c.width = 112; c.height = 136;
    const x = c.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    const t = tmp.getContext('2d'); t.drawImage(f, 0, 0);
    (st.buildings || []).forEach((b, i) => drawBuilding(t, makeBuilding(b, i)));
    if (st.circle) drawCapsule(t, st.circle, st.circle.r0, st.circle.r0, st.circle.r0, 0);
    if (st.iceWalls || st.pads) { const fake = new Battle(CHARACTERS[0], CHARACTERS[1], {}, stageId); if (st.iceWalls) drawIceWalls(t, fake); if (st.pads) drawPads(t, fake, 0); }
    if (STAGE_HOOKS.some(h => h.drawUnder && h.match(st))) { const fake = new Battle(CHARACTERS[0], CHARACTERS[1], {}, stageId); for (const h of STAGE_HOOKS) h.drawUnder && h.drawUnder(t, fake, true); }
    if (st.balls) { const fake = new Battle(CHARACTERS[0], CHARACTERS[1], {}, stageId); drawBalls(t, fake.balls); }
    x.imageSmoothingEnabled = true; x.drawImage(tmp, AR.x, AR.y, AR.w, AR.h, 0, 0, 112, 136);
    return c.toDataURL();
  }

  const glowCache = {};
  function glowSprite(color) {
    if (glowCache[color]) return glowCache[color];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color + 'b0'); g.addColorStop(0.4, color + '48'); g.addColorStop(1, color + '00');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (glowCache[color] = c);
  }
  // 부드러운 발광 (가산 혼합)
  function glowAt(ctx, x, y, r, color, a) {
    if (a <= 0 || r <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(glowSprite(color), x - r, y - r * 0.85, r * 2, r * 1.7); ctx.restore();
  }

  function drawStatusIcons(ctx, u, b, x, y) {
    if (!u.statuses.length) return;
    ctx.save();
    ctx.font = 'bold 8px "Galmuri11", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const items = u.statuses.map(s => { const d = STATUS_DEFS[s.id]; return { s, d, w: Math.ceil(ctx.measureText(d.name).width) + 7 }; });
    const total = items.reduce((a, i) => a + i.w + 2, -2);
    let cx = Math.round(x - total / 2);
    const top = Math.round(y - 70);
    for (const { s, d, w } of items) {
      const blink = s.t < 0.6 ? 0.55 + 0.45 * Math.cos(s.t * 10) ** 2 : 1; // 만료 직전 부드럽게 깜빡
      ctx.globalAlpha = 0.85 * blink; ctx.fillStyle = 'rgba(18,16,28,0.85)'; ctx.fillRect(cx, top, w, 11);
      ctx.globalAlpha = blink; ctx.strokeStyle = d.color; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, top + 0.5, w - 1, 10);
      ctx.fillStyle = d.color; ctx.fillText(d.name, cx + w / 2, top + 5.5);
      ctx.globalAlpha = 0.9; ctx.fillRect(cx + 1, top + 12, Math.max(0, (w - 2) * clamp(s.t / s.dur, 0, 1)), 1.5);
      cx += w + 2;
    }
    ctx.restore();
  }

  function drawUnit(ctx, u, b) {
    if (u.hidden) return;
    let fdef = u.fdef; // 오니화/변신 스프라이트
    const PZ = u.form ? u.form.poses : u.def.poses; // 상황별 스프라이트 (오리 등)
    if (PZ && !u.dead) { const k = u.air && u.air.fly ? 'fly' : u.poseT > 0 ? u.pose : u.flash > 0.05 ? 'hurt' : (u.zone && u.zone.splash && !u.air) ? 'swim' : null; if (k && PZ[k]) fdef = PZ[k]; }
    let s = Sprites.get(fdef);
    const TB = u.air && u.air.tumble; // 공중에서 굴러감: 앞/뒷모습 번갈아
    const wantBack = TB ? Math.floor(u.air.t * 10) % 2 === 1 : u.lookUp;
    if (s.back && wantBack) s = s.back; // 상대보다 아래에 있으면 뒷모습
    const sx = spriteSX(u.def, !!(s.back === undefined && wantBack && Sprites.get(fdef).back), u.facing);
    let alpha = 1;
    if (u.spirit) alpha = 0.5 + 0.08 * Math.sin(b.time * 6); // 혼령: 반투명
    if (u.buff('invis')) alpha = 0.35;
    if (u.dead) alpha = Math.max(0, 1 - u.deadT / 1.2);
    const F = u.fallen; // 크레바스 추락 애니메이션
    let fk = 1, fox = 0, foy = 0;
    if (F) {
      const n = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[F.side] || [0, 0]; // 'hole' = 제자리 추락
      const p = Math.min(1, u.deadT * 3); fox = n[0] * 20 * easeOut(p); foy = n[1] * 20 * easeOut(p);
      fk = Math.max(0, 1 - Math.max(0, u.deadT - 0.15) / 1.1); alpha = Math.min(1, fk * 1.4);
    }
    const z = b.airZ(u), zk = 1 + z / 110; // 공중 높이
    const stone = !!u.status('petrify');
    const frozen = stone || u.blocked('blocksMove');
    const bob = stone ? 0 : u.moving ? Math.abs(Math.sin(u.walk)) * -2 : Math.sin(b.time * 3 + u.team) * 0.6;
    const jx = u.status('paralysis') && u.blocked('blocksAct') ? rand(-1, 1) : 0; // 마비 경련
    const rage = u.buff('rage');
    if (rage && !u.dead) glowAt(ctx, u.x, u.y - 20, 30 + Math.sin(b.time * 8) * 3, '#ff6a4a', 0.35);
    const x = u.x + u.kx + fox, y = u.y + u.ky + foy;
    // 그림자 & 팀 링 (공중이면 그림자가 작아지고 분리됨)
    if (!F) {
      const sk = 1 - z / 70;
      ctx.globalAlpha = 0.35 * alpha * sk; ctx.fillStyle = '#000';
      const zs = u.size; ctx.beginPath(); ctx.ellipse(x, y + 2, 14 * sk * zs, 5 * sk * zs, 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 0.75 * alpha * sk; ctx.strokeStyle = TEAM_COL[u.team]; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 16 * sk * zs, 6 * sk * zs, 0, 0, 6.28); ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(Math.round(x + jx), Math.round(y + bob - z));
    if (zk !== 1) ctx.scale(zk, zk);
    if (F) { ctx.translate(0, -18); ctx.scale(fk, fk); ctx.rotate(u.deadT * 7); ctx.translate(0, 18); }
    let rot = 0;
    if (u.swing > 0 && !frozen) rot = Math.sin((u.swing / 0.2) * Math.PI) * 0.25;
    if (u.dead && !F) rot = Math.min(1, u.deadT * 3) * 1.4;
    if (u.air && u.air.spin) rot = u.air.t * 16; // 튕겨나가며 회전
    if (TB) rot = 1.25 + Math.sin(u.air.t * 18) * 0.35; // 눕혀진 채 빙글빙글
    const kn = !u.dead && u.statuses.find(s => s.knock); // 넘어짐 (충격파 기절)
    if (kn) { const el = kn.dur - kn.t, up = kn.t; rot = (u.knockSide || 1) * sx * Math.PI / 2 * Math.min(1, el * 8, up * 6); ctx.translate(0, -2); }
    ctx.scale(sx, 1);
    ctx.rotate(rot);
    const fr = u.moving && !stone ? Math.floor(u.walk * s.fps / 6) : 0;
    if (u.def.drawUnder && !u.dead) u.def.drawUnder(ctx, u, b, s); // 캐릭터별 몸 뒤 장식 (브로리 오라 등)
    if (u.def.hammer && u.lookUp) drawHammer(ctx, u, b);
    Sprites.draw(ctx, s, fr, false);
    if (u.def.hammer && !u.lookUp) drawHammer(ctx, u, b);
    for (const st of u.statuses) { // 상태이상 덧칠
      const d = STATUS_DEFS[st.id];
      if (d && d.tint) { ctx.globalAlpha = alpha * (d.tintA || 0.25) * (st.id === 'petrify' ? 1 : 0.8 + 0.2 * Math.sin(b.time * 5)); Sprites.drawTint(ctx, s, fr, d.tint); }
    }
    ctx.globalAlpha = alpha;
    if (u.flash > 0) { ctx.globalAlpha = alpha * (u.flash / 0.12) * 0.85; Sprites.draw(ctx, s, fr, true); }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (u.dead) return;
    if (u.buff('shield')) {
      const sh = u.buff('shield'), a = Math.min(1, sh.t * 2);
      ctx.globalAlpha = 0.18 * a; ctx.fillStyle = '#bfe3ff';
      ctx.beginPath(); ctx.ellipse(x, y - 20, 24, 28, 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = (0.5 + Math.sin(b.time * 6) * 0.15) * a; ctx.strokeStyle = '#d8efff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (u.buff('slow')) { ctx.fillStyle = '#9fd0ff'; ctx.globalAlpha = 0.6; ctx.fillRect(x - 10, y - 1, 20, 2); ctx.globalAlpha = 1; }
    drawStatusIcons(ctx, u, b, x, y);
    if (u.status('stun')) {
      for (let i = 0; i < 3; i++) {
        const a = b.time * 5 + i * 2.09;
        ctx.fillStyle = '#ffe27a'; ctx.fillRect(Math.round(x + Math.cos(a) * 10) - 1, Math.round(y - 54 + Math.sin(a) * 3) - 1, 3, 3);
      }
    }
    // 스킬 쿨다운 미니바
  }

  function drawTele(ctx, t) {
    const p = t.t / t.dur;
    ctx.save();
    ctx.fillStyle = t.color; ctx.strokeStyle = t.color;
    if (t.type === 'circle') {
      ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r, t.r * 0.7, 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r * easeInOut(p), t.r * 0.7 * easeInOut(p), 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r, t.r * 0.7, 0, 0, 6.28); ctx.stroke();
    } else if (t.type === 'line') {
      const a = Math.atan2(t.y2 - t.y1, t.x2 - t.x1), L = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
      ctx.translate(t.x1, t.y1); ctx.rotate(a);
      ctx.globalAlpha = 0.14; ctx.fillRect(0, -t.w / 2, L, t.w);
      ctx.globalAlpha = 0.3; ctx.fillRect(0, -t.w / 2, L * easeOut(p), t.w);
      ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.strokeRect(0, -t.w / 2, L, t.w);
    } else if (t.type === 'fan') {
      ctx.globalAlpha = 0.12 + 0.12 * p;
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.arc(t.x, t.y, t.len * easeOut(p), t.a - t.spread / 2, t.a + t.spread / 2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawFx(ctx, f, layer) {
    const p = f.t / f.dur;
    if (layer === 0 && f.type === 'after') {
      let s = Sprites.get(f.def); if (f.back && s.back) s = s.back;
      ctx.save(); ctx.globalAlpha = (f.a || 0.3) * (1 - p); ctx.translate(Math.round(f.x), Math.round(f.y)); ctx.scale(spriteSX(f.def, !!(f.back && s.back === undefined), f.facing), 1);
      Sprites.draw(ctx, s, 0, true); ctx.restore();
    }
    if (layer !== 1) return;
    if (f.t < 0) return;
    ctx.save();
    if (f.type === 'glow') {
      const k = easeOut(Math.min(1, p * 2));
      glowAt(ctx, f.x, f.y, f.r * (0.6 + 0.4 * k), f.color, 0.45 * (1 - p) * (1 - p));
    } else if (f.type === 'shock') {
      const r = f.r0 + (f.r1 - f.r0) * easeOut(p);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.1 * (1 - p); ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.7, 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 0.6 * (1 - p); ctx.strokeStyle = f.color; ctx.lineWidth = f.w * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.7, 0, 0, 6.28); ctx.stroke();
      ctx.globalAlpha = 0.35 * (1 - p); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(f.x, f.y, r * 0.92, r * 0.92 * 0.7, 0, 0, 6.28); ctx.stroke();
    } else if (f.type === 'streak') {
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.4 * (1 - p); ctx.strokeStyle = f.color; ctx.lineWidth = f.w * (1 - p * 0.6);
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.globalAlpha = 0.5 * (1 - p); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, f.w * 0.25 * (1 - p));
      ctx.stroke();
    } else if (f.type === 'crescent') {
      const q = f.t / (f.dur - f.delay), k = easeOut(Math.min(1, q * 1.8));
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x, f.y); ctx.rotate(f.ang); ctx.scale(1, 0.75);
      const r = f.r * (0.8 + 0.3 * k), sweep = 2.6 * k;
      ctx.globalAlpha = 0.7 * (1 - q); ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(0, 0, r, -1.3, -1.3 + sweep); ctx.arc(r * 0.18, 0, r * 0.82, -1.3 + sweep, -1.3, true); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.8 * (1 - q); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r, -1.3, -1.3 + sweep); ctx.stroke();
    } else if (f.type === 'bolt') {
      ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
      const a = (1 - p) * (1 - p);
      for (const [w, al, c] of [[6, 0.25, f.color], [2, 0.9, '#ffffff']]) {
        ctx.globalAlpha = al * a; ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); f.pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
      }
      const e = f.pts[f.pts.length - 1]; glowAt(ctx, e[0], e[1], 22, f.color, 0.5 * a);
    } else if (f.type === 'slash') {
      ctx.globalAlpha = 0.9 * (1 - p); ctx.strokeStyle = f.color; ctx.lineWidth = 2.5 * f.s * (1 - p * 0.5);
      const r = 14 * f.s, a0 = f.dir > 0 ? -1.2 : Math.PI - 1.2 + 0.0, sweep = 2.4 * easeOut(Math.min(1, p * 1.6));
      ctx.beginPath();
      if (f.dir > 0) ctx.arc(f.x, f.y, r, -1.2, -1.2 + sweep); else ctx.arc(f.x, f.y, r, Math.PI + 1.2, Math.PI + 1.2 - sweep, true);
      ctx.stroke();
    } else if (f.type === 'ring') {
      const r = f.r0 + (f.r1 - f.r0) * easeOut(p);
      ctx.globalAlpha = 0.7 * (1 - p); ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.75, 0, 0, 6.28); ctx.stroke();
    } else if (f.type === 'pillar') {
      const a = Math.sin(p * Math.PI);
      const g = ctx.createLinearGradient(0, f.y - 120, 0, f.y);
      g.addColorStop(0, 'rgba(255,241,168,0)'); g.addColorStop(1, 'rgba(255,241,168,0.3)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(f.x - 20, f.y - 120, 40, 122);
      ctx.globalAlpha = a * 0.5; ctx.fillRect(f.x - 7, f.y - 120, 14, 122);
      glowAt(ctx, f.x, f.y - 10, 40, '#fff1a8', 0.4 * a);
    } else if (f.type === 'meteor') {
      const k = easeInOut(p), y = f.y - 160 * (1 - k) - 6, x = f.x + 40 * (1 - k);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const tg = ctx.createLinearGradient(x + 40, y - 70, x, y);
      tg.addColorStop(0, 'rgba(255,150,80,0)'); tg.addColorStop(1, 'rgba(255,170,90,0.55)');
      ctx.strokeStyle = tg; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(x + 40, y - 70); ctx.lineTo(x, y); ctx.stroke();
      glowAt(ctx, x, y, 30, '#ff9a4a', 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1; ctx.fillStyle = '#ff9a5a'; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffd38a'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#fff4d8'; ctx.fillRect(x - 3, y - 3, 3, 3);
      // 그림자 (떨어지는 위치)
      ctx.globalAlpha = 0.25 * k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 14 * k, 5 * k, 0, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }

  // 로켓 해머 (스프라이트에 없음 → 절차적으로 그림). 손 위치 기준 회전
  function drawHammer(ctx, u, b) {
    const f = u.facing, sw = u.hamSwing > 0 ? 1 - u.hamSwing / 0.4 : u.swing > 0 ? 1 - u.swing / 0.2 : -1;
    let th = -2.0 + Math.sin(b.time * 2 + u.team) * 0.05; // 기본: 어깨에 걸침
    if (sw >= 0) th = -2.4 + easeOut(Math.min(1, sw * 1.6)) * 3.4; // 휘두르기: 뒤→앞 아래
    if (u.action && u.action.type === 'charge') th = 0.25;
    if (u.action && u.action.type === 'wind') th = -2.6;
    ctx.save();
    const hk = u.def.hammerScale || u.def.size || 1;
    const psx = spriteSX(u.def, !!u.lookUp, u.facing); // 부모 변환의 좌우 배율 보정 → 월드 기준 u.facing 쪽
    ctx.scale(f * psx * hk, hk); ctx.translate(15, -26); ctx.rotate(th + Math.PI / 2);
    ctx.fillStyle = '#3a3036'; ctx.fillRect(-1.5, -30, 3, 32);            // 자루
    ctx.fillStyle = '#c8a050'; ctx.fillRect(-2, -6, 4, 3);
    ctx.fillStyle = '#5a5a64'; ctx.fillRect(-10, -40, 20, 12);           // 머리
    ctx.fillStyle = '#8a8a96'; ctx.fillRect(-10, -40, 20, 3);
    ctx.fillStyle = '#d8b050'; ctx.fillRect(-2, -40, 4, 12);             // 금색 띠
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(-13, -38, 3, 8);             // 로켓 노즐
    if (u.hamSwing > 0 || (u.action && u.action.type === 'charge')) { ctx.globalAlpha = 0.7; ctx.fillStyle = '#ffb36b'; ctx.fillRect(-18, -37, 5, 6); ctx.fillStyle = '#fff0c8'; ctx.fillRect(-16, -36, 3, 4); ctx.globalAlpha = 1; }
    ctx.restore();
  }
  function drawBarrier(ctx, u, b) {
    const B = u.barrier; if (!B) return;
    const g = b.barrierGeom(u), gy = g.cy + 18, H = 44;
    const x1 = g.cx - g.tx * g.hw, y1 = gy - g.ty * g.hw * 0.9, x2 = g.cx + g.tx * g.hw, y2 = gy + g.ty * g.hw * 0.9;
    const fade = Math.min(1, B.t * 3), dmg = 1 - B.hp / B.max;
    ctx.save();
    ctx.globalAlpha = (0.22 + B.hitT * 1.5) * fade; ctx.fillStyle = '#7fc0ff';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - H); ctx.lineTo(x1, y1 - H); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.18 * fade; ctx.strokeStyle = '#d8f0ff'; ctx.lineWidth = 1; // 육각 무늬
    for (let k = 1; k < 6; k++) { const t = k / 6, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - H); ctx.stroke(); }
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x1, y1 - H * k / 4); ctx.lineTo(x2, y2 - H * k / 4); ctx.stroke(); }
    ctx.globalAlpha = 0.8 * fade; ctx.strokeStyle = '#bfe3ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - H); ctx.lineTo(x1, y1 - H); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.7 * fade; // 균열
    for (let k = 0; k < Math.floor(dmg * 6); k++) {
      const t = ((k * 37) % 10) / 10 * 0.8 + 0.1, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t - H * (((k * 53) % 10) / 12 + 0.1);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 4); ctx.lineTo(x + 3, y - 9); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 3); ctx.stroke();
    }
    // 내구도 바
    const bx = g.cx - 16, by = Math.min(y1, y2) - H - 7;
    ctx.globalAlpha = fade; ctx.fillStyle = 'rgba(10,14,24,0.8)'; ctx.fillRect(bx - 1, by - 1, 34, 4);
    ctx.fillStyle = '#8fd0ff'; ctx.fillRect(bx, by, 32 * Math.max(0, B.hp / B.max), 2);
    ctx.restore();
  }
  // 와이어 연결 (u 손 → 대상), n 가닥
  function drawWireFx(ctx, f, b) {
    const p = f.t / f.dur, u = f.u, t = f.tgt, a = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < f.n; i++) {
      const off = (i - (f.n - 1) / 2) * 10, sx = u.x + u.facing * 6, sy = u.y - 22, ex = t.x, ey = t.y - 18 - b.airZ(t);
      const mx = (sx + ex) / 2 - (ey - sy) * 0.002 * off * 10, my = (sy + ey) / 2 + off + Math.sin(b.time * 30 + i) * 2;
      ctx.globalAlpha = 0.3 * a; ctx.strokeStyle = '#ff9a4a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.globalAlpha = 0.9 * a; ctx.strokeStyle = '#fff0d0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    }
    ctx.restore();
  }
  // 교살: 대상 주위를 조여드는 와이어 고리
  function drawGarrote(ctx, f, b) {
    const p = f.t / f.dur, t = f.tgt, x = t.x, y = t.y - 18 - b.airZ(t), n = f.big ? 4 : 2;
    const a = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const r = (f.big ? 34 : 24) * (1 - 0.55 * easeOut(Math.min(1, p * 1.6))) + i * 3, rot = b.time * (i % 2 ? -5 : 5) + i;
      ctx.globalAlpha = 0.35 * a; ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y + (i - n / 2) * 5, r, r * 0.45, rot * 0.1, 0, 6.28); ctx.stroke();
      ctx.globalAlpha = 0.9 * a; ctx.strokeStyle = '#ffe8c0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y + (i - n / 2) * 5, r, r * 0.45, rot * 0.1, 0, 6.28); ctx.stroke();
    }
    if (f.big) glowAt(ctx, x, y, 30 + 20 * p, '#ff8a3a', 0.25 * a);
    ctx.restore();
  }
  function drawCounter(ctx, u, b) { // 반격 자세: 몸 주위를 도는 실
    const k = u.counter.t / u.counter.max;
    ctx.save(); ctx.globalAlpha = 0.6 * Math.min(1, k * 3); ctx.strokeStyle = '#ffd8a0'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const r = 20 + i * 3, s = b.time * 6 + i * 2.1; ctx.beginPath(); ctx.ellipse(u.x, u.y - 18, r, r * 0.4, 0, s, s + 2.2); ctx.stroke(); }
    ctx.restore();
  }
  function drawPips(ctx, u, b) { // 표식 등 'pips' 자원: 머리 위 작은 아이콘
    const D = u.def.resources; if (!D || u.dead) return;
    const s = Sprites.get(u.def);
    for (const k in D) {
      if (D[k].display !== 'pips') continue;
      const n = D[k].max, v = u.res[k] || 0, y = u.y - s.dh + s.foot - 8 - b.airZ(u);
      for (let i = 0; i < n; i++) {
        const x = u.x + (i - (n - 1) / 2) * 8;
        ctx.fillStyle = 'rgba(15,12,20,0.75)'; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.fill();
        if (i < v) { ctx.fillStyle = D[k].color; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 3, y); ctx.fill(); if (v >= n) glowAt(ctx, x, y, 6, D[k].color, 0.3); }
      }
    }
  }
  function drawCrack(ctx, f) {
    const p = f.t / f.dur, n = f.pts.length, show = Math.max(2, Math.ceil(n * Math.min(1, f.t / 0.2)));
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const a = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = 5 * (1 - p) + 1;
    ctx.beginPath(); for (let i = 0; i < show; i++) i ? ctx.lineTo(f.pts[i][0], f.pts[i][1]) : ctx.moveTo(f.pts[i][0], f.pts[i][1]); ctx.stroke();
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#2a1e18'; ctx.lineWidth = 2;
    ctx.beginPath(); for (let i = 0; i < show; i++) i ? ctx.lineTo(f.pts[i][0], f.pts[i][1]) : ctx.moveTo(f.pts[i][0], f.pts[i][1]); ctx.stroke();
    ctx.restore();
  }
  function drawProj(ctx, p) {
    ctx.save();
    if (p.draw) { p.draw(ctx, p, glowAt); ctx.restore(); return; } // 커스텀 투사체 (브로리 기탄 등)
    if (p.kind === 'wire') { // 와이어: 손에서 끝까지 이어진 실
      const f = p.from; ctx.restore(); ctx.save();
      if (f) { ctx.globalAlpha = 0.35; ctx.strokeStyle = '#ffb070'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(f.x + f.facing * 6, f.y - 22); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = '#fff0d0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x + f.facing * 6, f.y - 22); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      glowAt(ctx, p.x, p.y, 8, '#ffb070', 0.5); ctx.fillStyle = '#fff4e0'; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else if (p.kind === 'flame') { // 화염 강타: 초승달 모양 화염파
      const a = Math.atan2(p.vy, p.vx);
      glowAt(ctx, p.x, p.y, 26, '#ff8a3a', 0.45);
      ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.ellipse(-8, 0, 16, 24, 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.ellipse(-2, 0, 12, 22, 0, -1.57, 1.57); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffc070'; ctx.beginPath(); ctx.ellipse(2, 0, 8, 17, 0, -1.5, 1.5); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff0c8'; ctx.beginPath(); ctx.ellipse(5, 0, 4, 11, 0, -1.4, 1.4); ctx.fill();
    } else if (p.kind === 'arrow') {
      const a = Math.atan2(p.vy, p.vx);
      ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.fillStyle = '#c9a26a'; ctx.fillRect(-8, -0.75, 10, 1.5);
      ctx.fillStyle = '#e8eef4'; ctx.fillRect(2, -1.5, 3, 3);
      ctx.fillStyle = '#f2f2e8'; ctx.fillRect(-9, -2, 2, 4);
    } else if (p.kind === 'arrowG') {
      const a = Math.atan2(p.vy, p.vx);
      glowAt(ctx, p.x, p.y, 10, '#a8f07a', 0.45);
      ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.fillStyle = '#d8f0a0'; ctx.fillRect(-10, -1, 13, 2);
      ctx.fillStyle = '#f4ffe0'; ctx.fillRect(2, -2, 4, 4);
    } else {
      const c = p.kind === 'holy' ? ['#fff3b0', '#ffe27a'] : ['#cfeaff', '#8fc8ff'];
      glowAt(ctx, p.x, p.y, 12, c[1], 0.4);
      ctx.globalAlpha = 0.35; ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }

  function draw(ctx, b) {
    const sid = b ? b.stageId : 'arena';
    if (!floors[sid]) floors[sid] = makeFloor(sid);
    ctx.imageSmoothingEnabled = false;
    if (!b) { ctx.drawImage(floors[sid], 0, 0); return; }
    ctx.fillStyle = '#14121c'; ctx.fillRect(0, 0, W, H);
    ctx.save(); // 공용 카메라: 바닥/스테이지/유닛/이펙트 모두 동일 변환 (UI는 DOM)
    if (b.zoom) { // 짧은 줌 펄스
      const z = b.zoom, k = 1 + z.k * Math.sin(Math.PI * Math.min(1, z.t / z.dur));
      ctx.translate(z.x, z.y); ctx.scale(k, k); ctx.translate(-z.x, -z.y);
    }
    if (b.shakeT > 0) { const k = b.shakeT / 0.18 * b.shakeA; ctx.translate(Math.round(rand(-k, k)), Math.round(rand(-k, k))); }
    ctx.drawImage(floors[sid], 0, 0);
    for (const h of STAGE_HOOKS) h.drawUnder && h.drawUnder(ctx, b);
    for (const f of b.fx) drawFx(ctx, f, 0);
    drawWater(ctx, b);
    if (b.stage.circle) { const C = b.stage.circle; drawCapsule(ctx, C, b.circleR(), C.r0, b.circleR(b.time + 3), b.time); }
    if (b.balls.length) drawBalls(ctx, b.balls);
    if (b.iceSegs.length) drawIceWalls(ctx, b);
    if (b.stage.pads) drawPads(ctx, b, b.time);
    for (const bl of b.buildings) if (bl.dead) drawRubble(ctx, bl);
    for (const f of b.fx) if (f.type === 'crack') drawCrack(ctx, f);
    for (const f of b.fx) if (f.type === 'ripple') {
      const p = f.t / f.dur, r = (f.big ? 6 : 4) + (f.big ? 22 : 12) * easeOut(p);
      ctx.globalAlpha = 0.5 * (1 - p); ctx.strokeStyle = '#e0f6ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.4, 0, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const t of b.tele) drawTele(ctx, t);
    // 유닛과 건물을 y 순서로 그림
    const list = [...b.u.map(u => ({ y: u.y, u })), ...b.buildings.filter(x => !x.dead).map(bl => ({ y: bl.y + bl.h, bl }))].sort((a, c) => a.y - c.y);
    for (const it of list) {
      if (it.u) { drawUnit(ctx, it.u, b); drawO2(ctx, it.u, it.u.x + it.u.kx, it.u.y + it.u.ky); }
      else drawBuilding(ctx, it.bl);
    }
    for (const h of STAGE_HOOKS) h.drawOver && h.drawOver(ctx, b);
    for (const u of b.u) drawBarrier(ctx, u, b);
    for (const f of b.fx) { if (f.type === 'wire') drawWireFx(ctx, f, b); else if (f.type === 'garrote') drawGarrote(ctx, f, b); }
    for (const u of b.u) { if (u.counter) drawCounter(ctx, u, b); drawPips(ctx, u, b); }
    for (const p of b.proj) drawProj(ctx, p);
    for (const f of b.fx) drawFx(ctx, f, 1);
    for (const p of b.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.soft) { ctx.globalAlpha = a * 0.5; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, 6.28); ctx.fill(); continue; }
      if (p.glow) glowAt(ctx, p.x, p.y, p.size * 3, p.color, a * 0.25);
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      if (p.line) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
      } else ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size));
    }
    ctx.globalAlpha = 1;
    for (const h of STAGE_HOOKS) h.drawTop && h.drawTop(ctx, b); // 최상단 레이어 (아이돌 무대 관객/중계 화면 등; 글자 HUD 아래)
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of b.texts) if (t.bubble) { // 말풍선 (캐릭터를 따라감, 화면 안으로 보정)
      const p = t.t / t.dur, u = t.u;
      ctx.globalAlpha = p < 0.08 ? p / 0.08 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      ctx.font = `bold ${t.size}px "Galmuri11", "Malgun Gothic", sans-serif`;
      const w = ctx.measureText(t.txt).width + 10, h = 14;
      const bx = clamp(u.x - w / 2, AR.x + 2, AR.x + AR.w - 2 - w), by = Math.max(AR.y + 2, u.y - 64 - u.pad * 2.2 - b.airZ(u) - h);
      ctx.fillStyle = 'rgba(20,18,30,0.82)'; ctx.strokeStyle = 'rgba(255,240,200,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, 4) : ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
      const tx = clamp(u.x, bx + 6, bx + w - 6); ctx.beginPath(); ctx.moveTo(tx - 3, by + h); ctx.lineTo(tx, by + h + 4); ctx.lineTo(tx + 3, by + h); ctx.fill();
      ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.fillText(t.txt, bx + w / 2, by + h / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
    for (const t of b.texts) {
      if (t.bubble) continue;
      const p = t.t / t.dur;
      const pop = p < 0.15 ? 0.7 + 0.3 * easeOut(p / 0.15) * 1.25 : 1;
      ctx.globalAlpha = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
      ctx.font = `bold ${Math.round(t.size * pop)}px "Galmuri11", "Malgun Gothic", sans-serif`;
      const y = t.y - 18 * easeOut(p);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,18,30,0.85)'; ctx.strokeText(t.txt, t.x, y);
      ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x, y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  return { draw, thumb, glowAt };
})();
