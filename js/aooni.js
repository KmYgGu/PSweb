/**
 * 아오오니 — 느리지만 가까이 붙으면 아주 빠른 도트 피해. 근접 평타(맨손)
 *  패시브 냉기 : 몸에 닿는(튕기는) 거리보다 조금(14px) 넓은 범위 안의 상대에게 0.1초마다 도트 피해 (방어·속성 무시)
 *  1. 추적        : 일정 시간 일반 이동 대신 물리 이동으로 상대를 실시간 추격 (가속·관성, 벽/상대에 부딪히면 반동으로 잠깐 밀려남)
 *  2. 지면 내리치기: 피해 없음. 위에서 상자 여러 개가 떨어짐(그림자 예고). 상자에 상대가 부딪히면(깔리면) 기절.
 *                   상자는 공격·부딪힘으로 상하좌우로만 밀리고 3번 부딪히면 파괴
 *  3. 옷장 소환   : 무작위 위치에 옷장이 땅에서 솟아오름. 먼저 닿은 쪽이 들어감
 *                   (아오오니는 옷장이 생길 때 한 번 굴린 25% 확률로만 빈 옷장 쪽으로 일부러 걸어감. 실패하면 평소대로 움직이다 우연히 닿을 때만 들어감)
 *                   - 아오오니가 먼저: 잠시 숨음 → 상대가 부딪히면 끌어들여 현재 체력 10% → 옷장 붕괴, 상대 기절 / 아무도 안 오면 그냥 나옴
 *                   - 상대가 먼저: 스킬 봉인 상태로 숨음 + 공포 연출(옷장 주변 원형만 보이고 나머지는 어둠, 아오오니는 추적 안 씀)
 *                     → 아오오니가 옷장에 부딪히면 들어가 최대 체력 5% → 이후 동일 / 일정 시간 지나면 상대가 스스로 나옴
 *  4. 다른 방의 문 : 외벽 무작위 위치에 문. 아오오니가 부딪히면 그냥 벽. 상대가 들어가면 화면이 밀리며 다른 스테이지로 이동,
 *                   상대는 반대편 벽의 문에서 나옴. 아오오니는 추적 쿨타임 초기화 + (방금 문까지의 거리에 비례한 시간) 뒤 그 문에서 등장.
 *                   문은 일정 피해에 부서짐. 상대(AI)는 문을 노리지 않음 (원래 장애물을 겨냥하는 AI 없음)
 *  탈출맵(목적지 경주): 추적·옷장·문은 쓰지 않음 (출구 대신 상대를 쫓거나 숨어 경주가 끝나지 않음) — 지면 내리치기는 상대 근처 2개만, 6초 뒤 사라짐 (넓은 맵 통로를 막지 않게)
 *  난수는 전부 Math.random (전투 중 시드 난수). 그리기 코드는 난수·전투 값을 쓰지 않음
 *  효과음: 사용자 제공 아오오니 소리 없음 → 전용 소리 없이 기존 공용 효과음(벽·충돌 등)만 사용
 *  그림: 사용자 제공 원본 스프라이트 시트(aooni 폴더의 아오오니.png, 4방향×4프레임)를 tools/gen_aooni_sprites.py 로 잘라 씀
 *        앞·뒤·옆(좌/우) 걷기는 원본 그대로, 지면 내리치기(양팔 벌림)·피격(머리 젖힘)은 원본 앞모습을 변형한 그림,
 *        추적(앞으로 기울기·빠른 들썩임·부딪힘 휘청), 내리치기(웅크림→도약→쿵 찌그러짐), 문에서 등장(쑥 늘어남)은 위치·변형 애니메이션 (화면 전용)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'aooni', SKIN = '#7d74d8';
  const D = {
    aura: { extra: 14, tick: 0.1, mult: 0.2, show: 0.4 },                                    // 범위 = 충돌 거리 + 14px, 0.1초마다 ATK×0.2 (기본 ATK 30 → 초당 60)
    chase: { dur: 4.5, accel: 430, vmax: 300, drag: 0.9, wallRest: 0.6, wallStag: 0.3, hitRecoil: 0.55, hitStag: 0.38 },
    slam: { wind: 0.4, n: 5, near: 2, nearR: 60, fall: 0.6, gap: 0.12, size: 20, hits: 3, push: 36, pushT: 0.22, stunFall: 1.1, stunBump: 0.8, immune: 1.2, life: 15, escLife: 6, max: 10, drop: 230 },
    closet: { goP: 0.25, rise: 0.6, idle: 8, aoHide: 5, foeHide: 6, ambush: 0.7, grabK: 0.10, enterK: 0.05, stun: 1.5, w: 28, h: 14, H: 44, light: 66, seek: 1.0, seekP: 0.45, steer: 0.6 },
    door: { life: 12, hp: 150, w: 36, d: 12, base: 0.6, per: 1 / 150, min: 0.8, max: 4.0, slide: 0.6, maxHit: 60 },
  };
  // 문 너머 '다른 방' 후보: 외벽이 사각형이고 특수 승리 규칙이 없는 스테이지 (현재 스테이지 제외)
  const ROOMS = ['arena', 'island', 'city', 'ballPit', 'iceCave', 'trampoline', 'idol', 'diving', 'claw', 'bbq', 'classroom'];
  const NO_DOOR = new Set(['ballInterior', 'bey', 'snake']); // 원형 벽 / 외벽 없음 → 문을 달 외벽이 없음
  const OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const isAo = u => !!(u && u.def && u.def.id === ID);
  const A_ = u => u.ao || (u.ao = { chase: null, boxes: [], fall: [], closet: null, door: null, away: null, exit: null });
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const mainFoes = (b, u) => b.u.filter(o => o.team !== u.team && !o.dead && !o.summon && !o.def.noDraw);
  const foeOf = (b, u) => { const L = mainFoes(b, u).filter(o => !o.hidden); if (!L.length) return null; let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const slotIdx = (u, id) => u.skills.findIndex(s => s.id === id);
  const P_ = b => b.play || AR;
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const stat = (b, k, n = 1) => { b.stats[k] = (b.stats[k] || 0) + n; };
  // 원(유닛 발 근처) ↔ 사각형 거리
  const rectGap = (o, r) => { const cx = o.x, cy = o.y - 4, qx = clamp(cx, r.x, r.x + r.w), qy = clamp(cy, r.y, r.y + r.h); return Math.hypot(cx - qx, cy - qy) - (11 + o.pad); };
  const touchable = o => o && !o.dead && !o.hidden && !o.airborne && !o.climb && !o.inTrain && !o.fallen && !o.status('pin');
  // 전투 전체에서 옷장/문/숨음 진행 중인지 (서로 배타: 꼬임·무한 대기 방지)
  const busy = b => b.u.some(o => o.aoHid || (o.ao && (o.ao.closet || o.ao.door || o.ao.away)));
  const anyHid = b => b.u.some(o => o.aoHid);
  const lieOf = u => !u.dead && u.statuses && u.statuses.find(s => s.aoLie && s.id === 'stun'); // 옷장에서 붙잡혔다 풀려난 기절 (옆으로 누운 그림, 화면 전용 표시)

  // ---------- 숨김(옷장 안 / 다른 방으로 가는 중) ----------
  function hide(b, u, why, x, y) {
    u.aoHid = why; u.hidden = true; u.aoPark = { x, y }; u.x = x; u.y = y;
    u.action = null; u.push = null; u.pull = null; u.moving = false; u.kx = u.ky = 0; u.boost = 0; if (u.ao) u.ao.chase = null;
    for (const o of b.u) { if (o.action && (o.action.tgt === u || o.action.e === u)) { if (o.action.pin) b.releasePin(u); o.action = null; } if (o.pull && o.pull.src === u) o.pull = null; }
    for (const p of b.proj) if (p.tgt === u) p.tgt = null;
  }
  function unhide(b, u, x, y) {
    if (!u.aoHid) return; u.aoHid = null; u.hidden = false; u.aoPark = null;
    const q = b.clampPos(x, y, u.pad, u); u.x = q.x; u.y = q.y; b.resolveBuildings(u, true); u.zone = b.zoneAt(u.x, u.y);
  }
  // 숨은 유닛: 움직이지도 행동하지도 않음 (시간도 멈춤: 상태·쿨타임 정지), 충돌·피해·상태이상·넉백 대상 아님
  const oUU = Battle.prototype.updateUnit;
  Battle.prototype.updateUnit = function (u, dt) {
    if (u.aoHid) { u.moving = false; u.flash = Math.max(0, u.flash - dt); if (Number.isFinite(u.hp)) u.lastHp = u.hp; return; }
    const C = u.ao && u.ao.chase;
    if (!C || u.dead || this.over) return oUU.call(this, u, dt);
    const sp = u.st.spd; u.st.spd = 0; // 추적 중: 일반 직진 이동만 끄고(스킬·평타·상태는 그대로) 아래 물리 이동으로 대신함
    try { oUU.call(this, u, dt); } finally { u.st.spd = sp; }
    if (u.dead || this.over || !u.ao || u.ao.chase !== C) return;
    if (u.action || u.push || u.pull || u.airborne || u.blocked('blocksMove') || u.blocked('blocksAct')) { C.vx *= Math.pow(0.05, dt); C.vy *= Math.pow(0.05, dt); return; }
    chaseStep(this, u, C, dt);
  };
  const oRB = Battle.prototype.resolveBuildings; Battle.prototype.resolveBuildings = function (u, spawn) { if (u.aoHid) return; return oRB.call(this, u, spawn); };
  const oCW = Battle.prototype.circleWall; Battle.prototype.circleWall = function (u) { if (u.aoHid) return; return oCW.call(this, u); };
  const oUT = Battle.prototype.updateTerrain; Battle.prototype.updateTerrain = function (u, dt) { if (u.aoHid) return; return oUT.call(this, u, dt); };
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o = {}) { if (tgt && tgt.aoHid && !o.aoAllow && !o.dot) return 0; return oDmg.call(this, src, tgt, amt, o); };
  const oFix = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o = {}) { if (tgt && tgt.aoHid && !(o && o.aoAllow)) return 0; return oFix.call(this, src, tgt, amt, o); };
  const oAS = Battle.prototype.applyStatus; Battle.prototype.applyStatus = function (tgt, id, dur, src, o = {}) { if (tgt && tgt.aoHid && !o.aoAllow) return null; return oAS.call(this, tgt, id, dur, src, o); };
  const oKb = Battle.prototype.knockback; Battle.prototype.knockback = function (tgt, ...a) { if (tgt && tgt.aoHid) return; return oKb.call(this, tgt, ...a); };
  const oPull = Battle.prototype.pull; Battle.prototype.pull = function (tgt, ...a) { if (tgt && tgt.aoHid) return; return oPull.call(this, tgt, ...a); };
  const oBA = Battle.prototype.basicAttack; Battle.prototype.basicAttack = function (u, e) { if ((e && e.aoHid) || u.aoHid) return; return oBA.call(this, u, e); };
  // 스킬: 숨은 본인은 사용 불가(옷장 안 = 스킬 봉인). 상대가 전부 숨어 있으면(옷장 속 아오오니 / 다른 방으로 오는 중) 노릴 대상이 없어 스킬을 쓰지 않음
  const oPay = Battle.prototype.canPay;
  Battle.prototype.canPay = function (u, slot) {
    if (u.aoHid) return false;
    if (anyHid(this)) { const F = this.u.filter(o => o.team !== u.team && !o.dead && !o.summon && !o.def.noDraw); if (F.length && F.every(o => o.aoHid)) return false; }
    return oPay.call(this, u, slot);
  };
  // 몸 충돌: 숨은 유닛 제외. 추적 중이면 부딪힌 반작용으로 잠깐 밀려남
  const oCol = Battle.prototype.collide;
  Battle.prototype.collide = function (a, c) {
    if (a.aoHid || c.aoHid) return;
    const ca = a.ao && a.ao.chase, cc = c.ao && c.ao.chase;
    if (!ca && !cc) return oCol.call(this, a, c);
    const R = 15 * (a.size + c.size), d0 = dist(a, c), rush = u => u.action && (u.action.type === 'dash' || u.action.type === 'charge');
    const hit = d0 < R && d0 > 0.01 && !a.airborne && !c.airborne && !a.spirit && !c.spirit && !a.dead && !c.dead && !rush(a) && !rush(c);
    const nx = (c.x - a.x) / (d0 || 1), ny = (c.y - a.y) / (d0 || 1);
    const r = oCol.call(this, a, c);
    if (hit && a.team !== c.team) { if (ca) recoil(this, a, ca, -nx, -ny, c); if (cc) recoil(this, c, cc, nx, ny, a); }
    return r;
  };

  // ---------- 패시브: 냉기 도트 ----------
  function auraR(u, o) { return 15 * (u.size + o.size) + D.aura.extra; }
  function auraStep(b, u, dt) {
    if (u.dead || u.aoHid || b.over || b.freeze) return;
    for (const o of b.u) {
      if (o.team === u.team || o.dead || o.hidden || o.airborne || o.summon || o.def.noDraw) continue;
      if (dist(u, o) >= auraR(u, o)) { o.aoAuraT = 0; continue; }
      o.aoAuraT = (o.aoAuraT || 0) - dt; if (o.aoAuraT > 0) continue; o.aoAuraT += D.aura.tick;
      const n0 = b.texts.length, dmg = b.damage(u, o, u.st.atk * D.aura.mult, { dot: true, noCrit: true, element: 'ice', color: '#b8ccff', aoAura: true });
      if (b.texts.length > n0 && b.texts[b.texts.length - 1].txt === String(dmg)) b.texts.pop(); // 0.1초마다 숫자가 쏟아지지 않게 모아서 표시
      if (dmg > 0) { o.aoAuraAcc = (o.aoAuraAcc || 0) + dmg; stat(b, 'aoAura', dmg); if (Math.random() < 0.5) b.parts.push({ x: o.x + rand(-10, 10), y: o.y - rand(6, 34), vx: rand(-10, 10), vy: rand(-30, -10), life: 0.45, max: 0.45, color: rand(0, 1) < 0.5 ? '#cfe0ff' : '#8fb0ff', size: 2, glow: true }); }
      if (o.aoAuraAcc && b.time - (o.aoAuraShow || -9) >= D.aura.show) { o.aoAuraShow = b.time; b.text(o.x + rand(-6, 6), o.y - 38, String(o.aoAuraAcc), '#b8ccff', 10); o.aoAuraAcc = 0; }
    }
  }

  // ---------- 1. 추적 (물리 이동) ----------
  function chaseStep(b, u, C, dt) {
    const e = foeOf(b, u);
    const k = u.speed / Math.max(1, u.st.spd); // 감속(물·둔화)·충돌 가속 비율은 그대로 반영
    if (C.stag > 0) C.stag -= dt; else if (e) { const a = angTo(u, e); C.vx += Math.cos(a) * D.chase.accel * dt; C.vy += Math.sin(a) * D.chase.accel * dt; }
    const dr = Math.exp(-D.chase.drag * dt); C.vx *= dr; C.vy *= dr;
    const vm = D.chase.vmax * k, sp = Math.hypot(C.vx, C.vy); if (sp > vm) { C.vx *= vm / sp; C.vy *= vm / sp; }
    let nx = u.x + C.vx * dt, ny = u.y + C.vy * dt, wall = false;
    const q = b.clampPos(nx, ny, u.pad, u);
    if (Math.abs(q.x - nx) > 0.01) { C.vx = -C.vx * D.chase.wallRest; wall = true; }
    if (Math.abs(q.y - ny) > 0.01) { C.vy = -C.vy * D.chase.wallRest; wall = true; }
    nx = q.x; ny = q.y;
    let bl = b.blockAt(nx, u.y - 4, 9 + u.pad), bl2 = b.blockAt(u.x, ny - 4, 9 + u.pad);
    if (bl) { C.vx = -C.vx * D.chase.wallRest; nx = u.x; wall = true; }
    if (bl2) { C.vy = -C.vy * D.chase.wallRest; ny = u.y; wall = true; }
    if (wall) { // 벽·장애물: 법선 반사 + 기존 ±0.25rad 흔들림, 잠깐 추진 멈춤(반작용)
      const a = Math.atan2(C.vy, C.vx) + rand(-0.25, 0.25), s = Math.hypot(C.vx, C.vy); C.vx = Math.cos(a) * s; C.vy = Math.sin(a) * s; C.stag = D.chase.wallStag;
      if (b.time - (u.aoWallT || -1) > 0.12) { u.aoWallT = b.time; b.dust(u.x, u.y); b.ring(u.x, u.y, 2, 12, 0.2, '#cfd8f0'); playSfx('wall'); if (s > 180) b.shake(1); }
      const hb = bl || bl2; if (hb && b.time - (u.bldT ?? -1) > 0.15) { u.bldT = b.time; b.hitBuilding(hb, b.rules.bumpDmg + s * b.rules.bumpSpeedK, false, u.x, u.y - 8, u, 'bump'); }
    }
    u.x = nx; u.y = ny;
    const s2 = Math.hypot(C.vx, C.vy); if (s2 > 5) u.dir = Math.atan2(C.vy, C.vx);
    u.moving = s2 > 12; u.walk += dt * Math.min(s2, 200) * 0.2; u.pose = 'run'; u.poseT = 0.1;
    u.trailT -= dt; if (u.trailT <= 0 && s2 > 120) { u.trailT = 0.05; b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.2, a: 0.22 }); }
    if (s2 > 200 && Math.random() < dt * 14) b.dust(u.x - C.vx * 0.03, u.y);
  }
  function recoil(b, u, C, nx, ny, o) { // nx,ny = 상대 → 나 (밀려나는 방향)
    const s = Math.max(130, Math.hypot(C.vx, C.vy) * D.chase.hitRecoil); C.vx = nx * s; C.vy = ny * s; C.stag = D.chase.hitStag;
    o.kx -= nx * 4; o.ky -= ny * 4; stat(b, 'aoChaseBump');
  }
  function endChase(b, u) { const C = u.ao && u.ao.chase; if (!C) return; u.ao.chase = null; const s = Math.hypot(C.vx, C.vy); if (s > 5) u.dir = fixAngle(Math.atan2(C.vy, C.vx)); }
  const foeInCloset = (b, u) => b.u.some(o => o.aoHid === 'closetFoe' && o.team !== u.team);
  SKILLS.aoChase = { desc: '4.5초 동안 평소의 직진 이동 대신 상대를 실시간으로 쫓습니다. 물리 엔진처럼 가속해 붙고 관성이 남아(최고 속도 300), 벽이나 상대에게 부딪히면 반작용으로 튕겨 잠깐 밀려납니다. 상대가 옷장에 숨어 있을 때는 쓰지 않습니다.',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return !b.escape && !u.aoHid && !(u.ao && u.ao.chase) && !!e && !foeInCloset(b, u) && dist(u, e) > 40 && !u.airborne; },
    use(u, e0, b, s) { const A = A_(u), sp = u.speed * 0.4; A.chase = { t: 0, dur: s.dur || D.chase.dur, vx: Math.cos(u.dir) * sp, vy: Math.sin(u.dir) * sp, stag: 0 };
      b.text(u.x, u.y - 72, '!', '#ff7a8a', 16); b.ring(u.x, u.y - 22, 4, 26, 0.3, '#cfe0ff'); stat(b, 'aoChase'); } };

  // ---------- 2. 지면 내리치기 → 상자 ----------
  function boxSpotOk(b, x, y, S) { const P = P_(b); if (x < P.x + 16 || x + S > P.x + P.w - 16 || y < P.y + 30 || y + S > P.y + P.h - 10) return false;
    for (const bl of b.buildings) if (!bl.dead && x < bl.x + bl.w + 2 && x + S > bl.x - 2 && y < bl.y + bl.h + 2 && y + S > bl.y - 2) return false;
    if (b.blockAt(x + S / 2, y + S / 2, S / 2)) return false; const C = b.stage.circle; if (C && Math.hypot(x + S / 2 - C.cx, y + S / 2 - C.cy) > b.circleR() - 26) return false; return true; }
  function makeBox(b, u, x, y) {
    const S = D.slam.size, bl = { x, y, w: S, h: S, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, cracks: [[], [], []], rubble: [], windows: [], aoBox: true, owner: u, hits: 0, t: 0, life: b.escape ? D.slam.escLife : D.slam.life, slide: null, draw: drawBox };
    b.buildings.push(bl); const A = A_(u); A.boxes = A.boxes.filter(x => b.buildings.includes(x) && !x.dead); A.boxes.push(bl);
    while (A.boxes.length > D.slam.max) breakBox(b, A.boxes[0], null);
    return bl;
  }
  function breakBox(b, bl, why) {
    if (bl.dead) return; bl.dead = true; bl.hp = 0; bl.life = 0; // life 0 → 다음 스텝에 목록에서 제거
    const cx = bl.x + bl.w / 2, cy = bl.y + bl.h / 2; for (let i = 0; i < 10; i++) b.parts.push({ x: cx + rand(-8, 8), y: cy - 8 + rand(-4, 4), vx: rand(-90, 90), vy: rand(-140, -40), g: 380, life: 0.55, max: 0.55, color: ['#c08a48', '#8a5a2a', '#e0b070'][i % 3], size: rand(1.5, 3) });
    b.dust(cx, cy); if (why) b.text(cx, cy - 22, why, '#e8c890', 9); playSfx('wall');
    if (bl.owner && bl.owner.ao) bl.owner.ao.boxes = bl.owner.ao.boxes.filter(x => x !== bl);
  }
  function stunBox(b, e, owner, dur, why) {
    if (!e || e.dead || e.hidden || e.airborne || e.team === owner.team || (e.aoBoxImm || -9) > b.time) return false;
    e.aoBoxImm = b.time + dur + D.slam.immune; // 연속 기절 방지: 기절 끝나고 1.2초 동안은 다시 상자 기절 안 걸림
    b.text(e.x, e.y - 66, why || '쿵!', '#ffd890', 12); b.shake(1.2);
    b.applyList(owner, e, [{ status: 'stun', duration: dur, chance: 1 }]); stat(b, 'aoBoxStun'); return true;
  }
  function boxHit(b, bl, x, y, src, kind) {
    if (b.time - (bl.lastHit ?? -9) < 0.12) return; bl.lastHit = b.time;
    const cx = bl.x + bl.w / 2, cy = bl.y + bl.h / 2; let dx, dy;
    if (src && (kind === 'bump' || kind === 'dash')) { dx = cx - src.x; dy = cy - (src.y - 4); } else { dx = cx - (x ?? cx); dy = cy - (y ?? cy + 1); }
    const ax = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) || 1 : 0, ay = ax ? 0 : Math.sign(dy) || 1; // 상하좌우로만
    bl.hits++; stat(b, 'aoBoxHit');
    if (src && (kind === 'bump' || kind === 'dash') && bl.owner) stunBox(b, src, bl.owner, D.slam.stunBump);
    if (bl.hits >= D.slam.hits) { breakBox(b, bl, '상자 파괴'); return; }
    bl.slide = { ax, ay, rem: D.slam.push, spd: D.slam.push / D.slam.pushT * 1.6 };
  }
  function slideStep(b, bl, dt) {
    const L = bl.slide; if (!L || bl.dead) return; const P = P_(b);
    const st = Math.min(L.rem, L.spd * (0.35 + 0.65 * L.rem / D.slam.push) * dt); L.rem -= st;
    const nx = bl.x + L.ax * st, ny = bl.y + L.ay * st;
    let stop = nx < P.x + 4 || nx + bl.w > P.x + P.w - 4 || ny < P.y + 16 || ny + bl.h > P.y + P.h - 2;
    if (!stop) for (const o of b.buildings) if (o !== bl && !o.dead && nx < o.x + o.w && nx + bl.w > o.x && ny < o.y + o.h && ny + bl.h > o.y) { stop = true; break; }
    if (!stop) for (const o of b.u) { if (o.dead || o.hidden || o.airborne) continue; if (rectGap(o, { x: nx, y: ny, w: bl.w, h: bl.h }) < 0) { if (bl.owner) stunBox(b, o, bl.owner, D.slam.stunBump); stop = true; break; } }
    if (stop) { bl.slide = null; b.dust(bl.x + bl.w / 2, bl.y + bl.h); return; }
    bl.x = nx; bl.y = ny; if (Math.random() < dt * 20) b.dust(bl.x + bl.w / 2, bl.y + bl.h);
    if (L.rem <= 0.01) bl.slide = null;
  }
  function slamStart(b, u, s) {
    const A = A_(u), e = foeOf(b, u), S = D.slam.size, n = b.escape ? (s.near ?? D.slam.near) : s.n || D.slam.n, ex = e ? e.x : u.x, ey = e ? e.y : u.y;
    b.shock(u.x, u.y, 6, 60, '#cfe0ff', 0.4, 5); b.shake(2); b.debris(u.x, u.y, 10); b.hitstop(0.05); playSfx('bumpHard');
    b.text(u.x, u.y - 70, '쿵!!', '#cfe0ff', 13);
    let made = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 24; k++) {
        let x, y; const P = P_(b);
        if (i < (s.near ?? D.slam.near)) { const a = rand(0, TAU), r = rand(0, D.slam.nearR); x = ex + Math.cos(a) * r - S / 2; y = ey + Math.sin(a) * r - S / 2 - 6; }
        else { x = rand(P.x + 24, P.x + P.w - 24 - S); y = rand(P.y + 40, P.y + P.h - 20 - S); }
        x = Math.round(x); y = Math.round(y);
        if (!boxSpotOk(b, x, y, S) || A.fall.some(f => Math.abs(f.x - x) < S + 2 && Math.abs(f.y - y) < S + 2)) continue;
        A.fall.push({ x, y, t: -i * D.slam.gap, dur: D.slam.fall }); made++; break;
      }
    }
    stat(b, 'aoSlam'); stat(b, 'aoSlamBoxes', made);
  }
  function fallStep(b, u, dt) {
    const A = u.ao; if (!A || !A.fall.length) return;
    for (const f of A.fall) {
      f.t += dt; if (f.t < f.dur || f.done) continue; f.done = true;
      const S = D.slam.size; let x = f.x, y = f.y;
      if (!boxSpotOk(b, x, y, S)) { b.dust(x + S / 2, y + S / 2); continue; } // 떨어지는 사이 다른 장애물이 생겼으면 부서짐
      const bl = makeBox(b, u, x, y); bl.t = 0;
      b.shock(x + S / 2, y + S, 3, 22, '#e8d8b8', 0.3, 3); b.dust(x + S / 2, y + S); b.dust(x + 2, y + S); b.dust(x + S - 2, y + S); playSfx('wall');
      for (const o of b.u) { if (o.dead || o.hidden || o.airborne) continue; if (rectGap(o, bl) < 2) { if (o.team !== u.team) stunBox(b, o, u, D.slam.stunFall, '깔림!'); b.resolveBuildings(o, true); } }
    }
    A.fall = A.fall.filter(f => !f.done);
  }
  SKILLS.aoSlam = { desc: '땅을 내리칩니다(피해 없음). 위에서 상자 5개가 떨어집니다(2개는 시전 순간 상대가 있던 근처, 3개는 무작위 · 그림자로 예고, 추적 없음). 떨어지는 상자에 깔리거나 상자에 부딪힌 상대는 기절합니다. 상자는 공격·부딪힘으로 상하좌우로만 밀리고, 3번 부딪히면 부서집니다(15초 뒤 사라짐).',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return !u.aoHid && !!e && dist(u, e) < 260 && !u.airborne; },
    use(u, e0, b, s) { u.pose = 'slam'; u.poseT = (s.wind || D.slam.wind) + 0.25; b.windup(u, s.wind || D.slam.wind, () => { if (u.dead || b.over || u.aoHid) return; slamStart(b, u, s); }); } };

  // ---------- 3. 옷장 소환 ----------
  function closetSpot(b) {
    const P = P_(b), w = D.closet.w, h = D.closet.h;
    for (let k = 0; k < 40; k++) {
      const cx = Math.round(rand(P.x + 40, P.x + P.w - 40)), by = Math.round(rand(P.y + 70, P.y + P.h - 24));
      const r = { x: cx - w / 2, y: by - h, w, h };
      if (b.u.some(o => !o.dead && Math.hypot(o.x - cx, o.y - by) < 56)) continue;
      if (b.buildings.some(bl => !bl.dead && r.x < bl.x + bl.w + 8 && r.x + w > bl.x - 8 && r.y < bl.y + bl.h + 8 && r.y + h > bl.y - 8)) continue;
      if (b.blockAt(cx, by - h / 2, 18) || b.zoneAt(cx, by - h / 2)) continue;
      const q = b.clampPos(cx, by + 14, 0); if (Math.abs(q.x - cx) > 0.5 || Math.abs(q.y - by - 14) > 0.5) continue;
      return r;
    }
    return null;
  }
  function closetStart(b, u) {
    const r = closetSpot(b); if (!r) { b.text(u.x, u.y - 64, '옷장 실패', '#c8c0b0', 9); return; }
    const bl = { ...r, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, cracks: [[], [], []], rubble: [], windows: [], aoCloset: true, owner: u, t: 0, phase: 'rise', rattle: 0, draw: drawCloset };
    b.buildings.push(bl); for (const o of b.u) if (!o.dead && !o.airborne) b.resolveBuildings(o, true);
    A_(u).closet = { bl, phase: 'rise', t: 0, occ: null, steerT: 0, go: Math.random() < D.closet.goP }; // 빈 옷장으로 일부러 향할지: 옷장마다 한 번만 25%
    b.debris(bl.x + bl.w / 2, bl.y + bl.h, 12); b.shake(1.5); playSfx('wall'); sys(b, '옷장이 땅에서 솟아올랐습니다…'); stat(b, 'aoCloset');
  }
  const cMid = C => ({ x: C.bl.x + C.bl.w / 2, y: C.bl.y + C.bl.h });
  function closetSide(b, C, who, prefer) { // 옷장 옆 빈자리 (나올 위치)
    const m = cMid(C), opts = [[0, 22], [-30, 4], [30, 4], [0, -24], [-30, 24], [30, 24]];
    if (prefer) opts.sort((p, q) => Math.hypot(m.x + p[0] - prefer.x, m.y + p[1] - prefer.y) - Math.hypot(m.x + q[0] - prefer.x, m.y + q[1] - prefer.y));
    for (const [dx, dy] of opts) { const x = m.x + dx, y = m.y + dy, q = b.clampPos(x, y, who.pad, who); if (Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1 && !b.blockAt(x, y - 4, 11 + who.pad)) return { x, y }; }
    return { x: m.x, y: m.y + 22 };
  }
  function closetEnd(b, u, how) { // how: 'sink'(그냥 사라짐) | 'collapse'(무너짐)
    const A = u.ao, C = A && A.closet; if (!C) return; A.closet = null;
    const bl = C.bl, m = cMid(C); bl.dead = true; bl.hp = 0; bl.life = 0;
    if (how === 'collapse') { for (let i = 0; i < 22; i++) b.parts.push({ x: m.x + rand(-14, 14), y: m.y - rand(4, 40), vx: rand(-120, 120), vy: rand(-160, -30), g: 420, life: rand(0.5, 0.9), max: 0.9, color: ['#8a5a32', '#5e3a1e', '#b07a48', '#3a2414'][i % 4], size: rand(2, 4) });
      b.smoke(m.x, m.y - 14, '#a08a70', 12); b.shake(2.5); playSfx('bumpHard'); }
    else { b.dust(m.x, m.y); b.dust(m.x - 8, m.y); b.dust(m.x + 8, m.y); }
  }
  function release(b, u, C, victim, dmgK, kind) { // 붙잡은 뒤: 피해 → 아오오니 나옴 → 옷장 붕괴 → 상대 기절
    const m = cMid(C);
    if (victim && !victim.dead) {
      const amt = Math.max(1, Math.round(kind === 'cur' ? victim.hp * dmgK : victim.maxHp * dmgK));
      unhide(b, victim, m.x, m.y + 4);
      b.damage(u, victim, amt, { fixed: true, aoAllow: true, delivery: 'melee', element: 'dark', color: '#b8ccff', noCrit: true });
      stat(b, kind === 'cur' ? 'aoGrab' : 'aoEnter');
    }
    const p = closetSide(b, C, u, victim ? { x: m.x * 2 - victim.x, y: m.y * 2 - victim.y + 30 } : null); unhide(b, u, p.x, p.y);
    closetEnd(b, u, 'collapse');
    if (victim && !victim.dead && !b.over) { b.resolveBuildings(victim, true); const st = b.applyStatus(victim, 'stun', D.closet.stun, u, { aoAllow: true }); if (st) st.aoLie = victim.x < u.x ? -1 : 1; /* 그림 전용 표시: 뒷모습으로 아오오니 반대쪽으로 쓰러져 누움 (전투 계산은 읽지 않음) */ b.text(victim.x, victim.y - 70, '기절!', '#ffe27a', 11); }
    if (!b.over) u.dir = fixAngle(angTo(u, victim || u) + Math.PI + rand(-0.6, 0.6));
  }
  function closetStep(b, u, dt) {
    const A = u.ao, C = A && A.closet; if (!C) return;
    const bl = C.bl; C.t += dt; bl.t += dt; bl.phase = C.phase; bl.rattle = Math.max(0, bl.rattle - dt);
    if (!b.buildings.includes(bl) || bl.dead) { // 스테이지 교체 등으로 사라짐
      for (const o of b.u) if (o.aoHid === 'closetAo' || o.aoHid === 'closetFoe') unhide(b, o, o.x, o.y); A.closet = null; return; }
    const m = cMid(C), foes = b.u.filter(o => o.team !== u.team && !o.summon && !o.def.noDraw && touchable(o));
    const near = o => rectGap(o, bl) <= 2.5;
    const park = o => hide(b, o, o === u ? 'closetAo' : 'closetFoe', m.x, m.y - 2);
    if (C.phase === 'rise') { if (C.t >= D.closet.rise) { C.phase = 'idle'; C.t = 0; } return; }
    if (C.phase === 'idle') {
      if (C.go && touchable(u) && !u.action && !u.ao.chase && (C.steerT -= dt) <= 0) { C.steerT = D.closet.steer; u.dir = fixAngle(Math.atan2(m.y - 4 - u.y, m.x - u.x)); } // 자기 옷장으로 향함 (25% 확률로 정해진 옷장만, 아니면 평소대로 움직이다 우연히 닿을 때만)
      if (touchable(u) && near(u) && !u.action) { park(u); C.phase = 'aoIn'; C.t = 0; C.occ = u; bl.rattle = 0.3; b.text(m.x, m.y - 56, '쏙', '#cfe0ff', 10); sys(b, `${u.def.name}: 옷장 안에 숨었다…`); return; }
      const f = foes.find(near);
      if (f) { endChase(b, u); park(f); C.phase = 'foeIn'; C.t = 0; C.occ = f; bl.rattle = 0.3; b.text(m.x, m.y - 56, '숨었다!', '#e8e0ff', 10); sys(b, `${f.def.name}이(가) 옷장에 숨었습니다! (스킬 봉인)`); stat(b, 'aoFoeHide'); return; }
      if (C.t >= D.closet.idle) closetEnd(b, u, 'sink');
      return;
    }
    if (C.phase === 'aoIn') {
      if (u.dead) { closetEnd(b, u, 'sink'); return; }
      const f = foes.find(near);
      if (f) { park(f); C.phase = 'grab'; C.t = 0; C.vic = f; bl.rattle = D.closet.ambush; b.text(m.x, m.y - 62, '!!', '#ff7a8a', 15); b.shake(2); sys(b, `${u.def.name}이(가) ${f.def.name}을(를) 옷장 속으로 끌어들였다!`); return; }
      if (Math.random() < dt * 0.8) bl.peek = 0.5; // 틈으로 눈만 빼꼼
      bl.peek = Math.max(0, (bl.peek || 0) - dt);
      if (C.t >= D.closet.aoHide) { const p = closetSide(b, C, u); unhide(b, u, p.x, p.y); closetEnd(b, u, 'sink'); b.text(u.x, u.y - 64, '…', '#cfe0ff', 11); }
      return;
    }
    if (C.phase === 'foeIn') {
      const f = C.occ;
      if (!f || f.dead) { closetEnd(b, u, 'sink'); return; }
      if (touchable(u) && !u.action && (C.steerT -= dt) <= 0) { C.steerT = D.closet.seek; if (Math.random() < D.closet.seekP) u.dir = fixAngle(Math.atan2(m.y - 4 - u.y, m.x - u.x) + rand(-0.3, 0.3)); } // 어둠 속에서 더듬어 찾기
      if (touchable(u) && near(u)) { park(u); C.phase = 'grab2'; C.t = 0; bl.rattle = D.closet.ambush; b.text(m.x, m.y - 62, '!!', '#ff7a8a', 15); b.shake(2); sys(b, `${u.def.name}이(가) 옷장 문을 열었다!`); return; }
      if (C.t >= D.closet.foeHide) { const p = closetSide(b, C, f); unhide(b, f, p.x, p.y); f.dir = fixAngle(rand(0, TAU)); closetEnd(b, u, 'sink'); b.text(f.x, f.y - 64, '휴…', '#e8e0ff', 10); stat(b, 'aoFoeEscape'); }
      return;
    }
    if (C.phase === 'grab' || C.phase === 'grab2') {
      if (Math.random() < dt * 10) b.dust(m.x + rand(-12, 12), m.y);
      if (C.t >= D.closet.ambush) { const v = C.phase === 'grab' ? C.vic : C.occ; release(b, u, C, v, C.phase === 'grab' ? D.closet.grabK : D.closet.enterK, C.phase === 'grab' ? 'cur' : 'max'); }
    }
  }
  SKILLS.aoCloset = { desc: '맵의 무작위 위치에 옷장이 땅에서 솟아오릅니다(8초). 아오오니가 먼저 닿으면 5초 동안 숨고, 그사이 상대가 부딪히면 옷장 속으로 끌어들여 현재 체력의 10%를 깎은 뒤 옷장이 무너지며 상대는 1.5초 기절. 상대가 먼저 닿으면 상대는 스킬이 봉인된 채 숨고(최대 6초) 옷장 주변만 보이는 어둠이 깔립니다(이때 추적 안 씀). 그때 아오오니가 옷장에 부딪히면 들어가 최대 체력의 5%를 깎고 같은 결말.',
    canUse: (u, e0, d, b) => !b.escape && !u.aoHid && !busy(b) && b.time > 3 && !!foeOf(b, u) && !u.airborne,
    use(u, e0, b, s) { closetStart(b, u); } };

  // ---------- 4. 다른 방의 문 ----------
  function doorRect(P, side, c) { const w = D.door.w, d = D.door.d;
    if (side === 'top') return { x: c - w / 2, y: P.y + 12, w, h: d }; if (side === 'bottom') return { x: c - w / 2, y: P.y + P.h - d, w, h: d };
    if (side === 'left') return { x: P.x + 2, y: c - w / 2, w: d, h: w }; return { x: P.x + P.w - 2 - d, y: c - w / 2, w: d, h: w }; }
  function doorStart(b, u) {
    const P = P_(b);
    for (let k = 0; k < 16; k++) {
      const horiz = Math.random() < P.w / (P.w + P.h), side = horiz ? (Math.random() < 0.5 ? 'top' : 'bottom') : (Math.random() < 0.5 ? 'left' : 'right');
      const c = Math.round(horiz ? rand(P.x + 50, P.x + P.w - 50) : rand(P.y + 70, P.y + P.h - 40)), r = doorRect(P, side, c);
      if (b.buildings.some(bl => !bl.dead && r.x < bl.x + bl.w + 6 && r.x + r.w > bl.x - 6 && r.y < bl.y + bl.h + 6 && r.y + r.h > bl.y - 6)) continue;
      if (b.blockAt(r.x + r.w / 2, r.y + r.h / 2, 8) || b.u.some(o => !o.dead && rectGap(o, r) < 8)) continue;
      const bl = { ...r, hp: D.door.hp, maxHp: D.door.hp, dead: false, hitT: 0, cracks: [[], [], []], rubble: [], windows: [], aoDoor: true, owner: u, P: { x: P.x, y: P.y, w: P.w, h: P.h }, side, rel: horiz ? (c - P.x) / P.w : (c - P.y) / P.h, t: 0, draw: drawDoor };
      b.buildings.push(bl); A_(u).door = bl;
      b.dust(r.x + r.w / 2, r.y + r.h / 2); b.ring(r.x + r.w / 2, r.y + r.h / 2, 3, 24, 0.3, '#e8d0a0'); playSfx('wall');
      sys(b, '외벽에 다른 방으로 통하는 문이 생겼습니다!'); stat(b, 'aoDoor'); return;
    }
    b.text(u.x, u.y - 64, '문 실패', '#c8c0b0', 9);
  }
  function doorGone(b, u, why) { const A = u.ao, bl = A && A.door; if (!bl) return; A.door = null; if (!bl.dead) { bl.dead = true; bl.hp = 0; bl.life = 0; }
    const cx = bl.x + bl.w / 2, cy = bl.y + bl.h / 2;
    if (why === 'break') { for (let i = 0; i < 14; i++) b.parts.push({ x: cx + rand(-10, 10), y: cy - 6, vx: rand(-110, 110), vy: rand(-140, -30), g: 400, life: 0.6, max: 0.6, color: ['#8a5a32', '#5e3a1e', '#c8a060'][i % 3], size: rand(1.5, 3.5) }); b.text(cx, cy - 20, '문 파괴!', '#e8c890', 10); playSfx('bumpHard'); sys(b, '문이 부서졌습니다'); }
    else b.dust(cx, cy); }
  function exitSpot(b, side, rel, who) {
    const P = P_(b), pad = who.pad; const along = side === 'top' || side === 'bottom' ? P.w : P.h, base = side === 'top' || side === 'bottom' ? P.x : P.y;
    for (const off of [0, 24, -24, 48, -48, 80, -80, 120, -120]) {
      const c = clamp(base + rel * along + off, base + 40, base + along - 40);
      const x = side === 'left' ? P.x + 14 + pad + 4 : side === 'right' ? P.x + P.w - 14 - pad - 4 : c;
      const y = side === 'top' ? P.y + 26 + pad + 4 : side === 'bottom' ? P.y + P.h - 8 - pad * 0.5 - 4 : c;
      const q = b.clampPos(x, y, pad, who); if (!b.blockAt(q.x, q.y - 4, 11 + pad) && !b.zoneAt(q.x, q.y)) return { x: q.x, y: q.y, c };
    }
    const c = base + rel * along, q = b.clampPos(side === 'left' ? P.x : side === 'right' ? P.x + P.w : c, side === 'top' ? P.y : side === 'bottom' ? P.y + P.h : c, pad, who); return { x: q.x, y: q.y, c };
  }
  const inward = side => ({ top: Math.PI / 2, bottom: -Math.PI / 2, left: 0, right: Math.PI })[side];
  function parkOut(P, side, c) { return side === 'top' ? { x: c, y: P.y - 60 } : side === 'bottom' ? { x: c, y: P.y + P.h + 60 } : side === 'left' ? { x: P.x - 60, y: c } : { x: P.x + P.w + 60, y: c }; }
  function doorEnter(b, u, bl, e) {
    const cx = bl.x + bl.w / 2, cy = bl.y + bl.h / 2, ds = Math.hypot(u.x - cx, u.y - cy), delay = clamp(D.door.base + ds * D.door.per, D.door.min, D.door.max);
    const pool = ROOMS.filter(k => STAGE_DEFS[k] && k !== b.stageId); if (!pool.length || !window.GHOUL) return;
    const id = pool[Math.floor(Math.random() * pool.length)], side = bl.side, out = OPP[side], rel = bl.rel;
    const ci = slotIdx(u, 'aoChase'); if (ci >= 0) u.skillT[ci] = 0; // 추적 쿨타임 초기화
    endChase(b, u); const A = A_(u); A.fall = [];
    sys(b, `${e.def.name}이(가) 문을 열고 다른 방으로 도망쳤습니다!`); b.text(e.x, e.y - 64, '덜컥!', '#e8d0a0', 11);
    hide(b, u, 'away', u.x, u.y);
    b._aoDoorSwitch = true; let ok = false; try { ok = GHOUL.switchStage(b, id); } finally { b._aoDoorSwitch = false; }
    if (!ok) { unhide(b, u, u.x, u.y); return; }
    A.door = null;
    const P = P_(b), p = exitSpot(b, out, rel, e), team = b.u.filter(o => o.team === e.team && !o.dead && !o.summon && o !== e);
    for (const o of [e, ...team]) { o.action = null; o.push = null; o.pull = null; o.kx = o.ky = 0; if (o.v) o.v = null; }
    e.x = p.x; e.y = p.y; e.dir = fixAngle(inward(out) + rand(-0.5, 0.5)); b.resolveBuildings(e, true); e.zone = b.zoneAt(e.x, e.y);
    team.forEach((o, i) => { const q = b.clampPos(p.x + (out === 'top' || out === 'bottom' ? (i ? -30 : 30) : 0) + Math.cos(inward(out)) * 26, p.y + (out === 'left' || out === 'right' ? (i ? -30 : 30) : 0) + Math.sin(inward(out)) * 26, o.pad, o); o.x = q.x; o.y = q.y; o.dir = fixAngle(inward(out) + rand(-0.6, 0.6)); b.resolveBuildings(o, true); o.zone = b.zoneAt(o.x, o.y); });
    const pk = parkOut(P, out, p.c); u.aoPark = pk; u.x = pk.x; u.y = pk.y;
    A.away = { t: delay, dur: delay, side: out, c: p.c }; A.exit = { side: out, c: p.c, t: 0, open: 1, closeT: -1 };
    b.aoSlide = { side, start: b.time, dur: D.door.slide };
    stat(b, 'aoDoorUse'); stat(b, 'aoDoorDelay', Math.round(delay * 100) / 100);
  }
  function awayStep(b, u, dt) {
    const A = u.ao; if (!A) return;
    if (A.exit) { const X = A.exit; X.t += dt; if (X.closeT >= 0) { X.closeT += dt; if (X.closeT > 1.2) A.exit = null; } }
    const W = A.away; if (!W) return; W.t -= dt; if (W.t > 0 || b.over) return;
    A.away = null; const p = exitSpot(b, W.side, ((W.c ?? 0) - (W.side === 'top' || W.side === 'bottom' ? P_(b).x : P_(b).y)) / (W.side === 'top' || W.side === 'bottom' ? P_(b).w : P_(b).h), u);
    unhide(b, u, p.x, p.y); u.dir = fixAngle(inward(W.side) + rand(-0.4, 0.4)); u.kx = u.ky = 0;
    if (A.exit) A.exit.closeT = 0;
    b.text(u.x, u.y - 72, '!', '#ff7a8a', 18); b.ring(u.x, u.y - 20, 4, 30, 0.3, '#cfe0ff'); b.shake(1.5); playSfx('wall');
    sys(b, `${u.def.name}이(가) 문을 열고 쫓아왔습니다!`); stat(b, 'aoArrive');
  }
  function doorStep(b, u, dt) {
    const A = u.ao, bl = A && A.door; if (!bl) return;
    if (!b.buildings.includes(bl) || bl.dead) { A.door = null; return; }
    bl.t += dt; if (bl.t >= D.door.life) { doorGone(b, u, 'fade'); return; }
    if (u.dead || u.aoHid) return;
    const e = b.u.find(o => o.team !== u.team && !o.summon && !o.def.noDraw && touchable(o) && rectGap(o, bl) <= 2.5);
    if (e) doorEnter(b, u, bl, e);
  }
  SKILLS.aoDoor = { desc: '스테이지 외벽의 무작위 위치에 다른 방으로 통하는 문을 만듭니다(12초, 내구도 150 — 공격에 부서짐). 아오오니가 부딪히면 그냥 벽입니다. 상대가 들어가면 화면이 밀리며 다른 스테이지로 넘어가 반대편 벽의 문에서 나오고, 아오오니는 추적 쿨타임이 초기화된 채 (방금 문까지의 거리에 비례한 시간: 0.6초 + 거리/150, 0.8~4초) 뒤에 그 문에서 나타납니다. 상대는 문을 노리지 않습니다.',
    canUse: (u, e0, d, b) => !u.aoHid && !busy(b) && !b.escape && !NO_DOOR.has(b.stageId) && !b.stage.circle && b.time > 5 && !!foeOf(b, u) && !u.airborne,
    use(u, e0, b, s) { doorStart(b, u); } };

  // ---------- 장애물 피해 규칙 (상자·옷장·문) ----------
  const oHB = Battle.prototype.hitBuilding;
  Battle.prototype.hitBuilding = function (bl, dmg, strong, x, y, src, kind) {
    if (!bl || !(bl.aoBox || bl.aoCloset || bl.aoDoor)) return oHB.call(this, bl, dmg, strong, x, y, src, kind);
    if (bl.dead) return; bl.hitT = 0.15;
    if (bl.aoBox) return boxHit(this, bl, x, y, src, kind);
    if (bl.aoDoor) { if (kind === 'bump') return; bl.hp -= Math.min(D.door.maxHit, Math.max(0, dmg || 0)); if (strong) bl.hp -= D.door.maxHit * 0.5; if (bl.hp <= 0 && bl.owner) doorGone(this, bl.owner, 'break'); return; }
    // 옷장: 부서지지 않음 (나무 부스러기만)
    for (let i = 0; i < 2; i++) this.parts.push({ x: x ?? bl.x + bl.w / 2, y: y ?? bl.y, vx: rand(-50, 50), vy: rand(-80, -30), g: 360, life: 0.35, max: 0.35, color: '#8a5a32', size: 2 });
  };

  // ---------- 전역 훅 ----------
  STAGE_HOOKS.push({
    match: () => false,
    leave(b) { // 스테이지 교체(루인 등 · 내 문 포함): 이전 방의 옷장·떨어지는 상자·문 정리 (상자는 건물 목록과 함께 사라짐)
      for (const u of b.u) { const A = u.ao; if (!A) continue; A.fall = []; A.boxes = []; A.door = null; A.closet = null; if (!b._aoDoorSwitch) A.exit = null; }
      for (const o of b.u) if (o.aoHid === 'closetAo' || o.aoHid === 'closetFoe') unhide(b, o, o.x, o.y);
    },
    step(b, dt) {
      let has = false; for (const u of b.u) if (u.ao || u.aoHid || isAo(u)) { has = true; break; } if (!has) return;
      if (b.over) { for (const o of b.u) if (o.aoHid) unhide(b, o, o.aoPark ? o.aoPark.x : o.x, o.aoPark ? o.aoPark.y : o.y); for (const u of b.u) if (u.ao) { u.ao.chase = null; u.ao.away = null; } return; }
      for (const o of b.u) if (o.aoHid && o.aoPark) { o.x = o.aoPark.x; o.y = o.aoPark.y; o.kx = o.ky = 0; } // 숨은 자리 고정 (크레인·밀림 등 무시)
      for (const u of b.u) {
        if (isAo(u)) auraStep(b, u, dt);
        const A = u.ao; if (!A) continue;
        if (A.chase) { A.chase.t += dt; if (A.chase.t >= A.chase.dur || u.dead || u.aoHid || foeInCloset(b, u)) endChase(b, u); }
        fallStep(b, u, dt);
        A.boxes = A.boxes.filter(bl => !bl.dead && b.buildings.includes(bl));
        for (const bl of A.boxes) { bl.t += dt; slideStep(b, bl, dt); }
        closetStep(b, u, dt); doorStep(b, u, dt); awayStep(b, u, dt);
      }
    },
    drawUnder(ctx, b) {
      for (const u of b.u) {
        if (isAo(u) && !u.dead && !u.hidden) { // 냉기 범위 (발밑 점선 타원)
          const e = foeOf(b, u), R = auraR(u, e || u), inR = e && dist(u, e) < R, k = 0.5 + 0.5 * Math.sin(b.time * 4);
          ctx.save(); ctx.globalAlpha = inR ? 0.5 + 0.2 * k : 0.16 + 0.08 * k; ctx.strokeStyle = inR ? '#dce8ff' : '#9fb8ff'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.lineDashOffset = -b.time * 10;
          ctx.beginPath(); ctx.ellipse(u.x, u.y + 1, R, R * 0.42, 0, 0, TAU); ctx.stroke();
          if (inR) { ctx.globalAlpha = 0.1 + 0.06 * k; ctx.fillStyle = '#9fb8ff'; ctx.fill(); } ctx.restore();
        }
        const A = u.ao; if (!A) continue;
        for (const f of A.fall) { const p = clamp(f.t / f.dur, 0, 1); if (f.t < -0.0001) continue; const S = D.slam.size; // 그림자 예고
          ctx.save(); ctx.globalAlpha = 0.18 + 0.4 * p; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(f.x + S / 2, f.y + S - 2, S * (0.35 + 0.35 * p), S * (0.16 + 0.14 * p), 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.5 * p; ctx.strokeStyle = '#ffd890'; ctx.setLineDash([2, 2]); ctx.strokeRect(f.x + 0.5, f.y + 0.5, S - 1, S - 1); ctx.restore(); }
        if (A.exit) drawDoorShape(ctx, P_(b), A.exit.side, A.exit.c, 1, A.exit.closeT >= 0 ? clamp(1 - A.exit.closeT / 0.5, 0, 1) : 1, A.exit.closeT >= 0 ? clamp(1 - (A.exit.closeT - 0.6) / 0.6, 0, 1) : 1);
      }
    },
    drawOver(ctx, b) {
      for (const u of b.u) { const A = u.ao; if (!A) continue;
        for (const f of A.fall) { if (f.t < 0) continue; const p = clamp(f.t / f.dur, 0, 1), z = (1 - p) * (1 - p) * D.slam.drop; // 떨어지는 상자
          if (b._v3d) { const V = b._v3d, sz = D.slam.size; V.shadow(f.x + sz / 2, f.y + sz / 2, sz * 0.6, 0.3 * Math.min(1, p * 3)); V.box({ x0: f.x, y0: f.y, z0: z, x1: f.x + sz, y1: f.y + sz, z1: z + 10, col: '#c08a48', a: Math.min(1, p * 3) }); continue; } // 직접 플레이: 떨어지는 상자 = 3D 상자 + 그림자
          ctx.save(); ctx.globalAlpha = Math.min(1, p * 3); drawBox(ctx, { x: f.x, y: f.y - z, w: D.slam.size, h: D.slam.size, hits: 0, t: 1, hitT: 0 }); ctx.restore(); }
        if (A.chase && !u.hidden && !u.dead) { const C = A.chase, s = Math.hypot(C.vx, C.vy); if (s > 150) { ctx.save(); ctx.globalAlpha = Math.min(0.5, (s - 150) / 300); ctx.strokeStyle = '#dce8ff'; ctx.lineWidth = 1;
          const a = Math.atan2(C.vy, C.vx), c = Math.cos(a), sn = Math.sin(a); for (let i = 0; i < 3; i++) { const o = (i - 1) * 9, l = 10 + ((b.time * 60 + i * 7) % 10); ctx.beginPath(); ctx.moveTo(u.x - c * 18 - sn * o, u.y - 22 + c * o - sn * 18); ctx.lineTo(u.x - c * (18 + l) - sn * o, u.y - 22 + c * o - sn * (18 + l)); ctx.stroke(); } ctx.restore(); } }
      }
    },
    drawTop(ctx, b) {
      let C = null; for (const u of b.u) if (u.ao && u.ao.closet && (u.ao.closet.phase === 'foeIn' || u.ao.closet.phase === 'grab2')) { C = u.ao.closet; break; }
      if (b._v3d) { if (C && !b.over) b._v3d.floor(c => drawDark(c, b, C)); return; } // 직접 플레이: 어둠은 바닥에만, 방 이동 화면 밀기는 없음
      if (C && !b.over) drawDark(ctx, b, C);
      slideFx(ctx, b);
    },
  });

  // ---------- 그리기 (화면 전용) ----------
  function drawBox(ctx, bl) {
    const H = 10, sq = bl.t < 0.12 ? 1 - bl.t / 0.12 : 0, j = bl.hitT > 0 ? (bl.hitT * 40 | 0) % 2 : 0;
    const x = Math.round(bl.x + j), y = Math.round(bl.y), w = bl.w, h = bl.h, top = y - H + Math.round(sq * 3);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 2, y + 3, w, h - 2);
    ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x, top + h - 4, w, y + h - (top + h - 4));           // 앞면
    ctx.fillStyle = '#c08a48'; ctx.fillRect(x, top, w, h - 3);                                      // 윗면
    ctx.fillStyle = '#e0b070'; ctx.fillRect(x + 1, top + 1, w - 2, 1);
    ctx.fillStyle = '#9a6a34'; ctx.fillRect(x + 1, top + 6, w - 2, 1); ctx.fillRect(x + 1, top + 12, w - 2, 1); // 판자
    ctx.fillStyle = '#5e3a1a'; ctx.fillRect(x, top, 1, y + h - top); ctx.fillRect(x + w - 1, top, 1, y + h - top); ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillStyle = '#6a4220'; for (let i = 0; i < w - 2; i += 2) { const k = i / (w - 2); ctx.fillRect(x + 1 + i, top + h - 3 + Math.round(k * (y + h - top - h + 1)), 2, 1); } // 앞면 X 버팀목(대각선 하나)
    if (bl.hits >= 1) { ctx.fillStyle = '#3a2410'; ctx.fillRect(x + 4, top + 3, 4, 1); ctx.fillRect(x + 7, top + 4, 1, 3); }
    if (bl.hits >= 2) { ctx.fillRect(x + w - 8, top + 9, 5, 1); ctx.fillRect(x + w - 8, top + 10, 1, 3); ctx.fillRect(x + 3, y + h - 4, 3, 1); }
    ctx.restore();
  }
  const CLO_H = 74, CLO_X = 4; // 옷장 그림 크기 (화면 전용: 원본 크기 아오오니(키 84)가 들어갈 만큼. 충돌 바닥 판정 D.closet.w×h 는 그대로)
  function drawCloset(ctx, bl) {
    const H = CLO_H, rise = bl.phase === 'rise' ? clamp(bl.t / D.closet.rise, 0, 1) : 1, vis = Math.round(H * (rise < 1 ? 1 - Math.pow(1 - rise, 2) : 1));
    const sh = bl.rattle > 0 ? ((bl.t * 50 | 0) % 2 ? 1 : -1) : 0, trem = bl.phase === 'foeIn' && (bl.t * 3 | 0) % 4 === 0 ? ((bl.t * 30 | 0) % 2) : 0;
    const x = Math.round(bl.x - CLO_X + sh + trem), base = Math.round(bl.y + bl.h), w = bl.w + CLO_X * 2, top = base - vis, hw = w / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x + 3, base - 6, w, 8);
    ctx.beginPath(); ctx.rect(x - 4, top - 6, w + 8, vis + 8); ctx.clip();
    const T = base - H, oy = H - vis, Y = v => Math.round(v + oy); // 솟아오르는 중엔 아래쪽이 땅속
    const dT = T + 4, dH = H - 9, pH = Math.round(dH / 2 - 6);       // 문짝 위치·높이, 판넬 높이
    ctx.fillStyle = '#5e3a1e'; ctx.fillRect(x, Y(T), w, H);                    // 몸통
    ctx.fillStyle = '#7a4c28'; ctx.fillRect(x + 1, Y(T + 1), w - 2, H - 3);
    ctx.fillStyle = '#9a6438'; ctx.fillRect(x - 1, Y(T - 4), w + 2, 5);          // 위 장식판
    ctx.fillStyle = '#b07a48'; ctx.fillRect(x - 1, Y(T - 4), w + 2, 1);
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(x + 2, Y(dT), hw - 3, dH); ctx.fillRect(x + hw + 1, Y(dT), hw - 3, dH); // 문짝 두 개
    ctx.fillStyle = '#6a4224'; for (const py of [dT + 4, dT + dH - 4 - pH]) { ctx.fillRect(x + 4, Y(py), hw - 7, pH); ctx.fillRect(x + hw + 3, Y(py), hw - 7, pH); } // 판넬
    ctx.fillStyle = '#9a6a3c'; for (const py of [dT + 4, dT + dH - 4 - pH]) { ctx.fillRect(x + 4, Y(py), hw - 7, 1); ctx.fillRect(x + hw + 3, Y(py), hw - 7, 1); }
    ctx.fillStyle = '#1a0e08'; ctx.fillRect(Math.round(x + hw - 1), Y(dT), 2, dH);   // 문틈
    if (bl.peek > 0 && bl.phase === 'aoIn') { ctx.fillStyle = '#ffffff'; const ey = Y(T + 16); ctx.fillRect(Math.round(x + hw - 1), ey, 1, 2); ctx.fillRect(Math.round(x + hw), ey, 1, 2); }   // 틈으로 빼꼼
    if (bl.phase === 'grab' || bl.phase === 'grab2') drawGrabFace(ctx, bl, x, Y(T), w); // 문이 벌어지며 틈으로 아오오니 얼굴
    ctx.fillStyle = '#e8c060'; const hy = Y(dT + Math.round(dH * 0.48)); ctx.fillRect(Math.round(x + hw - 4), hy, 1, 3); ctx.fillRect(Math.round(x + hw + 3), hy, 1, 3); // 손잡이
    ctx.fillStyle = '#3a2414'; ctx.fillRect(x, Y(base - 3), w, 3); ctx.fillRect(x + 1, Y(base), 3, 1); ctx.fillRect(x + w - 4, Y(base), 3, 1); // 받침·다리
    ctx.restore();
    if (rise < 1) { ctx.save(); ctx.fillStyle = '#6a5a48'; for (let i = 0; i < 6; i++) ctx.fillRect(x - 3 + i * 8, base - 1 - ((i * 7 + (bl.t * 40 | 0)) % 4), 3, 2); ctx.restore(); } // 흙
  }
  function drawGrabFace(ctx, bl, x, T, w) { // 옷장 문틈이 벌어지고 그 사이로 원본 얼굴(앞모습 첫 프레임의 얼굴)이 보임
    const k = clamp(bl.t / 0.18, 0, 1), gap = Math.round(4 + 10 * k), gx = Math.round(x + w / 2 - gap / 2), gy = T + 4, gh = CLO_H - 9;
    ctx.fillStyle = '#05040a'; ctx.fillRect(gx, gy, gap, gh);
    const s = bl.owner && Sprites.get(bl.owner.def);
    if (s && s.img && s.fw === 48) { ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gap, gh); ctx.clip(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s.img, 0, 0, 48, 84, Math.round(x + w / 2 - 24), gy + 2 + Math.round((1 - k) * 4), 48, 84); ctx.restore(); }
    ctx.fillStyle = '#3a2414'; ctx.fillRect(gx - 1, gy, 1, gh); ctx.fillRect(gx + gap, gy, 1, gh); // 벌어진 문짝 가장자리
  }
  function drawDoorShape(ctx, P, side, c, alpha, open, fade) { // 벽에 붙은 나무 문 (open: 0 닫힘 ~ 1 열림)
    const w = D.door.w; ctx.save(); ctx.globalAlpha = alpha * (fade ?? 1);
    const vert = side === 'top' || side === 'bottom';
    const R = side === 'top' ? { x: c - w / 2, y: P.y - 6, w, h: 30 } : side === 'bottom' ? { x: c - w / 2, y: P.y + P.h - 10, w, h: 12 } : side === 'left' ? { x: P.x - 2, y: c - w / 2, w: 14, h: w } : { x: P.x + P.w - 12, y: c - w / 2, w: 14, h: w };
    ctx.fillStyle = '#3a2414'; ctx.fillRect(Math.round(R.x - 2), Math.round(R.y - 2), R.w + 4, R.h + 4); // 문틀
    ctx.fillStyle = '#0c0a10'; ctx.fillRect(Math.round(R.x), Math.round(R.y), R.w, R.h);                // 열린 틈 (어둠)
    const k = 1 - (open || 0) * 0.85;
    ctx.fillStyle = '#8a5a32';
    if (vert) { ctx.fillRect(Math.round(R.x), Math.round(R.y), Math.round(R.w * k), R.h); ctx.fillStyle = '#a8703c'; ctx.fillRect(Math.round(R.x + 2), Math.round(R.y + 3), Math.max(0, Math.round(R.w * k) - 4), 2); if (k > 0.5) { ctx.fillStyle = '#e8c060'; ctx.fillRect(Math.round(R.x + R.w * k - 6), Math.round(R.y + R.h / 2), 2, 2); } }
    else { ctx.fillRect(Math.round(R.x), Math.round(R.y), R.w, Math.round(R.h * k)); ctx.fillStyle = '#a8703c'; ctx.fillRect(Math.round(R.x + 3), Math.round(R.y + 2), 2, Math.max(0, Math.round(R.h * k) - 4)); if (k > 0.5) { ctx.fillStyle = '#e8c060'; ctx.fillRect(Math.round(R.x + R.w / 2), Math.round(R.y + R.h * k - 6), 2, 2); } }
    ctx.restore();
  }
  function drawDoor(ctx, bl) {
    const horiz = bl.side === 'top' || bl.side === 'bottom', c = horiz ? bl.x + bl.w / 2 : bl.y + bl.h / 2;
    const appear = clamp(bl.t / 0.3, 0, 1), fade = clamp((D.door.life - bl.t) / 0.6, 0, 1);
    drawDoorShape(ctx, bl.P, bl.side, c, appear, 0, fade);
    const r = bl.hp / bl.maxHp; // 균열
    if (r < 0.66) { ctx.save(); ctx.globalAlpha = appear * fade; ctx.fillStyle = '#2a1a0c'; const cx = Math.round(bl.x + bl.w / 2), cy = Math.round(bl.y + bl.h / 2);
      ctx.fillRect(cx - 5, cy - 1, 4, 1); ctx.fillRect(cx - 2, cy, 1, 3); if (r < 0.33) { ctx.fillRect(cx + 3, cy - 3, 4, 1); ctx.fillRect(cx + 5, cy - 3, 1, 4); } ctx.restore(); }
    if (bl.t < 2.5) { const k = 0.5 + 0.5 * Math.sin(bl.t * 10); ctx.save(); ctx.globalAlpha = 0.6 * k * (1 - bl.t / 2.5) * appear; ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 1; const up = bl.side === 'top' ? 18 : 0; ctx.strokeRect(bl.x - 3.5, bl.y - 3.5 - up, bl.w + 7, bl.h + 7 + up); ctx.restore(); }
  }
  function drawDark(ctx, b, C) { // 공포 연출: 옷장(숨은 상대) 주변 원형만 보이고 나머지는 어둠
    const m = cMid(C), cx = m.x, cy = m.y - 26, R = D.closet.light, fin = clamp(C.t / 0.35, 0, 1), k = (C.phase === 'grab2' ? 1 : fin) * (0.97 + 0.03 * Math.sin(b.time * 9));
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(3,4,12,0.95)'; ctx.beginPath(); ctx.rect(-4000, -4000, 8000 + W, 8000 + H); ctx.arc(cx, cy, R, 0, TAU, true); ctx.fill('evenodd');
    const g = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R); g.addColorStop(0, 'rgba(3,4,12,0)'); g.addColorStop(1, 'rgba(3,4,12,0.95)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R + 0.5, 0, TAU); ctx.fill();
    const hb = (b.time % 0.9) / 0.9, beat = hb < 0.12 ? hb / 0.12 : hb < 0.3 ? 1 - (hb - 0.12) / 0.18 : 0; // 두근두근 (가장자리 붉은 기운)
    ctx.globalAlpha = k * 0.22 * beat; ctx.strokeStyle = '#ff4a6a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  window.topHideUnit = (b, u) => { // 상단 UI 위 덧그리기(game.js drawTopUnits)에서도 어둠 밖 유닛은 그리지 않음
    for (const o of b.u) { const C = o.ao && o.ao.closet; if (C && (C.phase === 'foeIn' || C.phase === 'grab2')) { const m = cMid(C); return Math.hypot(u.x - m.x, u.y - 20 - (m.y - 26)) > D.closet.light - 6; } }
    return false;
  };
  // 화면이 밀리는 방 전환 연출: 문이 있는 동안 직전 화면을 복사해 두었다가, 전환 순간 이전 방이 밀려 나가고 새 방이 들어옴 (화면 전용)
  let snap = null, snapB = null, snapT = -9;
  function slideFx(ctx, b) {
    const S = b.aoSlide, cv = ctx.canvas; if (!cv || !cv.width) return;
    const live = S && b.time - S.start < S.dur;
    if (!live) { if (b.u.some(u => u.ao && u.ao.door)) { try { if (!snap) snap = document.createElement('canvas'); if (snap.width !== cv.width || snap.height !== cv.height) { snap.width = cv.width; snap.height = cv.height; } snap.getContext('2d').drawImage(cv, 0, 0); snapB = b; snapT = b.time; } catch (e) { snap = null; } } return; }
    const p = easeInOut(clamp((b.time - S.start) / S.dur, 0, 1)), Wc = cv.width, Hc = cv.height;
    const okSnap = snap && snapB === b && S.start - snapT < 0.3 && S.start >= snapT - 1e-6;
    let cur; try { cur = slideFx.cur || (slideFx.cur = document.createElement('canvas')); if (cur.width !== Wc || cur.height !== Hc) { cur.width = Wc; cur.height = Hc; } const g = cur.getContext('2d'); g.clearRect(0, 0, Wc, Hc); g.drawImage(cv, 0, 0); } catch (e) { return; }
    const d = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[S.side] || [0, 1]; // 위 문으로 나가면 카메라가 위로 → 이전 방은 아래로 밀려남
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c0a12'; ctx.fillRect(0, 0, Wc, Hc);
    if (okSnap) ctx.drawImage(snap, Math.round(d[0] * p * Wc), Math.round(d[1] * p * Hc));
    ctx.drawImage(cur, Math.round(-d[0] * (1 - p) * Wc), Math.round(-d[1] * (1 - p) * Hc));
    ctx.fillStyle = '#05040a'; if (d[1]) ctx.fillRect(0, Math.round(d[1] > 0 ? p * Hc - 2 : Hc - p * Hc - 2), Wc, 4); else ctx.fillRect(Math.round(d[0] > 0 ? p * Wc - 2 : Wc - p * Wc - 2), 0, 4, Hc);
    ctx.restore();
  }

  // ---------- 캐릭터 정의 ----------
  // 그림 파일 (원본 시트에서 생성). 경로는 통째로 적음: 에셋 묶음(js/assets_data.js)에 원본 시트까지 들어가지 않게
  const SRC = { front: 'assets/aooni/front.png', back: 'assets/aooni/back.png', walkB: 'assets/aooni/walk_back.png', sideL: 'assets/aooni/side_l.png', sideR: 'assets/aooni/side_r.png', slam: 'assets/aooni/slam.png', hurt: 'assets/aooni/hurt.png', portrait: 'assets/aooni/portrait.png' };
  const pose = (k, src, o = {}) => ({ id: ID + '@pose-' + k, /* '@back' 로 끝나면 sprites.js 의 뒷모습 키(def.id+'@back')와 겹쳐 기본 뒷모습이 걷기 시트 통째로 바뀌는 버그 → 'pose-' 접두어 */ name: '아오오니', color: SKIN, sprite: { src, frameW: o.fw || 48, frameH: 84, frames: o.frames || 1, fps: o.fps || 8, scale: 1, foot: 1 } });
  const POSES = {
    front: pose('front', SRC.front, { frames: 4 }), back: pose('back', SRC.walkB, { frames: 4 }), sideL: pose('sideL', SRC.sideL, { frames: 4 }), sideR: pose('sideR', SRC.sideR, { frames: 4 }),
    runF: pose('runF', SRC.front, { frames: 4, fps: 12 }), runB: pose('runB', SRC.walkB, { frames: 4, fps: 12 }), runL: pose('runL', SRC.sideL, { frames: 4, fps: 12 }), runR: pose('runR', SRC.sideR, { frames: 4, fps: 12 }),
    slam: pose('slam', SRC.slam, { fw: 56 }), hurt: pose('hurt', SRC.hurt, { fw: 56 }),
  };
  // 보는 방향 고르기 (화면 전용: 전투 값은 읽기만, 기억은 이 파일의 WeakMap 에만)
  //  움직일 때는 이동 방향, 서 있을 때는 상대 방향. 가로 성분이 크면 옆모습(원본 좌/우 행), 아니면 앞/뒤. 경계에서 깜빡이지 않게 히스테리시스
  const VIEW = new WeakMap(), LAST = new Map(); let lastB = null;
  function viewOf(u, b) {
    const C = u.ao && u.ao.chase; let ax, ay;
    if (C && Math.hypot(C.vx, C.vy) > 8) { ax = C.vx; ay = C.vy; }
    else if (u.moving) { ax = Math.cos(u.dir); ay = Math.sin(u.dir); }
    else { let e = null, m = 1e9; for (const o of b.u) if (o.team !== u.team && !o.dead && !o.hidden && !o.summon && !o.def.noDraw) { const d = dist(u, o); if (d < m) { m = d; e = o; } }
      if (e) { ax = e.x - u.x; ay = e.y - u.y; } else { ax = u.facing; ay = 0; } }
    const n = Math.hypot(ax, ay) || 1, h = Math.abs(ax) / n, prev = VIEW.get(u) || 'F';
    const side = prev === 'L' || prev === 'R' ? h > 0.55 : h > 0.78;
    let v = side ? (ax < 0 ? 'L' : 'R') : (C || u.moving ? (ay < 0 ? 'B' : 'F') : (u.lookUp ? 'B' : 'F'));
    VIEW.set(u, v); return v;
  }
  // 메탈 팽이 스테이지 회전 / 공중에서 굴러감: game.js 의 공용 프레임 순환(앞·오른쪽 → 뒤·오른쪽 → 뒤·왼쪽 → 앞·왼쪽, 10fps)과 같은 박자·같은 회전 방향으로
  //  아오오니의 진짜 4방향 그림을 돌림 (앞 → 오른쪽 → 뒤 → 왼쪽). 화면 전용: 시간·팀·슬롯만 읽음
  function spinView(u, b) {
    if (u.dead) return null;
    if (b.bey) { const v = 'FRBL'[(Math.floor(b.time * 10) + u.team * 2 + (u.slot || 0)) % 4]; VIEW.set(u, v); return v; }
    if (u.air && u.air.tumble) return Math.floor(u.air.t * 10) % 2 ? 'B' : 'F';
    return null;
  }
  function pickPose(u, b) {
    if (b !== lastB) { LAST.clear(); lastB = b; } // 잔상용 기억은 지금 전투 것만
    if (u.dead) { const v = VIEW.get(u); return v ? { F: 'front', B: 'back', L: 'sideL', R: 'sideR' }[v] : null; } // 쓰러질 때: 마지막으로 보던 방향 그림 그대로 (갑자기 앞/뒤로 바뀌지 않게)
    if (lieOf(u)) return null; // 옷장 기절(옆으로 누움): game.js 가 기본 뒷모습을 눕혀 그림
    if (u.poseT > 0 && u.pose === 'slam') return 'slam';
    const v = spinView(u, b) || viewOf(u, b), run = !!(u.ao && u.ao.chase);
    if (u.flash > 0.05 && v === 'F' && !run) return 'hurt';
    const k = run ? { F: 'runF', B: 'runB', L: 'runL', R: 'runR' }[v] : { F: 'front', B: 'back', L: 'sideL', R: 'sideR' }[v];
    LAST.set(u, { k, t: b.time }); return k;
  }
  // 위치·변형 애니메이션. 반환값: 최종 좌우 배율 (옆모습은 원본 좌/우 그림을 그대로 → +1)
  // 지면 내리치기 동작: 웅크림 → 도약 → 쿵! 찌그러짐 (0.4초 준비 + 0.25초 여운). 슈르프가 흡수해 쓸 때도 game.js 가 이 동작만 빌려 씀 (그림은 슈르프 것 그대로)
  function slamXf(ctx, u, b, sx) {
    if (u.dead || !(u.poseT > 0 && u.pose === 'slam')) return sx;
    const T = D.slam.wind + 0.25, p = clamp(1 - u.poseT / T, 0, 1), hit = D.slam.wind / T;
    if (p < 0.18) { const q = p / 0.18; ctx.scale(1 + 0.1 * q, 1 - 0.12 * q); }
    else if (p < hit) { const q = (p - 0.18) / (hit - 0.18); ctx.translate(0, -Math.round(14 * Math.sin(q * Math.PI * 0.92))); ctx.scale(1 - 0.06 * Math.sin(q * Math.PI), 1 + 0.1 * Math.sin(q * Math.PI)); }
    else { const q = (p - hit) / (1 - hit), k = (1 - q) * (1 - q); ctx.translate(Math.round(Math.sin(q * 60) * 2 * k), 0); ctx.scale(1 + 0.22 * k, 1 - 0.26 * k); }
    return sx;
  }
  function drawXform(ctx, u, b, sx) {
    const v = VIEW.get(u), side = v === 'L' || v === 'R', C = u.ao && u.ao.chase;
    if (u.dead) return side ? 1 : sx; // 옆모습 그림은 원본 좌/우 그대로 (뒤집지 않음)
    if (u.poseT > 0 && u.pose === 'slam') return slamXf(ctx, u, b, sx); // 팽이 스테이지: 내리치기 그림(앞모습 하나)은 game.js 가 주는 좌우 뒤집기(sx)로 회전
    const spin = !!(b.bey || (u.air && u.air.tumble)); // 회전 중: 4방향 그림이 직접 방향을 보여 주므로 뒤집지 않음
    if (C) { // 추적: 진행 방향으로 몸을 기울이고 쿵쾅 들썩임, 부딪힌 직후엔 뒤로 휘청
      const s = Math.hypot(C.vx, C.vy), f = clamp(s / D.chase.vmax, 0, 1), st = C.stag > 0 ? C.stag / Math.max(D.chase.hitStag, D.chase.wallStag) : 0;
      const ph = Math.abs(Math.sin(u.walk * 2.4)), lean = clamp(C.vx / D.chase.vmax, -1, 1) * 0.2 * f;
      ctx.translate(0, -Math.round(3 * ph * f));
      ctx.rotate(lean * (1 - st) - lean * 1.6 * st + (st ? Math.sin(b.time * 50) * 0.05 * st : 0));
      ctx.scale(1 + 0.05 * (1 - ph) * f, 1 - 0.05 * (1 - ph) * f + 0.04 * f * (C.vy > 0 ? 1 : 0));
    }
    const X = u.ao && u.ao.exit; // 다른 방 문에서 막 나왔을 때: 몸이 쑥 늘어나며 튀어나옴
    if (X && X.closeT >= 0 && X.closeT < 0.35) { const q = X.closeT / 0.35, k = Math.sin(q * Math.PI) * (1 - q); ctx.scale(1 - 0.18 * k, 1 + 0.28 * k); }
    return side || spin ? 1 : sx;
  }
  // 잔상: 남길 때의 보는 방향 그림으로 (흰 실루엣이 앞모습으로만 나오지 않게)
  const AFTER = new WeakMap();
  function afterPose(f) {
    if (AFTER.has(f)) return AFTER.get(f);
    let best = null, m = 1e9; for (const [u, L] of LAST) { const d = Math.hypot(u.x - f.x, u.y - f.y); if (d < m) { m = d; best = L; } }
    const k = best && m < 80 ? best.k : null, r = k ? { def: POSES[k], sx: k.endsWith('L') || k.endsWith('R') ? 1 : null } : null;
    AFTER.set(f, r); return r;
  }
  CHARACTERS.push({
    id: ID, name: '아오오니', fullName: '아오오니', gender: 'male', color: SKIN, size: 1.25,
    stats: { hp: 960, atk: 30, spd: 165, range: 50, atkRate: 0.8, def: 16, crit: 0.05, critMult: 1.6 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { ice: 0.7, fire: 1.15 },
    skills: [
      { id: 'aoChase', name: '추적', cd: 11, dur: 4.5 },
      { id: 'aoSlam', name: '지면 내리치기', cd: 9, wind: 0.4, n: 5 },
      { id: 'aoCloset', name: '옷장 소환', cd: 16 },
      { id: 'aoDoor', name: '다른 방의 문', cd: 20 },
    ],
    passiveDesc: '냉기: 몸이 닿아 튕기는 거리보다 14px 넓은 범위 안의 상대에게 0.1초마다 ATK×0.2 도트 피해(방어 무시).',
    sprite: { src: SRC.front, back: SRC.back, frameW: 48, frameH: 84, frames: 4, fps: 8, scale: 1, foot: 1, portraitRect: [6, 1, 36, 36] },
    portrait: SRC.portrait,
    poses: POSES, pickPose, drawXform, afterPose,
    lines: {}, // 대사 없음 (로그는 '아오오니: 스킬명')
  });
  window.AOONI = { D, ROOMS, slamXf, lieOf };
})();
