/**
 * 육군보병 — 개머리판 근접 평타(원거리 평타 없음) + 총·수류탄·군장 스킬
 *  1. 구르기   : 상대 기준 옆(무작위 좌/우, 막히면 반대쪽)으로 빠르게 구름. 구르는 동안 상대를 관통(몸 충돌 없음)하고 근접 공격을 회피
 *  2. 군장     : 자기 앞(상대 쪽)에 낮은 내구도의 군장(장애물=벽)을 설치. 최대 3개, 4번째 설치 시 가장 먼저 놓은 군장 철거
 *                부서짐: 적의 모든 공격(투사체·근접 평타·돌진·광역 장애물 피해 등 hitBuilding 경로) + 자신(아군)의 원거리 공격. 몸 튕김은 피해 없음
 *  3. 슈류탄   : 이동을 멈추지 않고 0.3초 간격으로 3번 투척(카이바 X-헤드 캐논 방식: 던지는 순간의 상대 위치로 포물선, 비추적)
 *                착탄 폭발은 자신에게도 피해(절반). 날아가다 군장에 닿으면 그 자리에서 폭발, 폭발 범위의 군장은 즉시 파괴
 *  4. 재식     : 호루라기. 주변 적의 이동을 잠깐 멈춘 뒤(멈칫) 무작위 방향(시드 난수)으로 이동 방향 재설정
 *  5. 사격     : 3발 연속 사격(발당 총알 1). 쏠 때마다 무작위 방향에 탄피가 떨어지고, 탄피를 주우면 총알 +1 (최대 18, 시작 18)
 *  6. 조준 사격: 근처 군장이 있으면 군장을 사이에 두고 상대 반대편으로 이동해 1발 정조준. 멀수록 탄속↑. 자기 군장은 넘어 쏨
 */
(() => {
  const TAU = Math.PI * 2, ID = 'army', RED = '#e8545a';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const D = {
    ammoMax: 18,
    roll: { len: 92, spd: 560 },
    gear: { w: 26, h: 12, hp: 40, max: 3, near: 80 },
    gren: { gap: 0.3, dur: 0.55, h: 46, r: 34, selfK: 0.5, spread: 10 },
    whistle: { r: 120, halt: 0.6 },
    bullet: { spd: 720, gap: 0.12 },
    aim: { moveSpd: 300, maxMove: 0.7, aimT: 0.22, spd0: 420, spdK: 2.2, spdMax: 1250 },
    cas: { pick: 12, max: 40 },
  };
  const A_ = u => u.ar || (u.ar = { ammo: D.ammoMax, gears: [] }); // 슈르프가 흡수해 써도 동작하도록 사용자별로 생성
  const isArmy = u => u && u.def && u.def.id === ID;
  const rolling = u => !!(u && u.action && u.action.type === 'arRoll');

  // ---------- 탄피 ----------
  function dropCasing(b, u) {
    const L = b.arCas || (b.arCas = []);
    const a = rand(0, TAU), r = rand(18, 52), q = b.clampPos(u.x + Math.cos(a) * r, u.y + Math.sin(a) * r * 0.8, 4);
    L.push({ x: q.x, y: q.y, sx: u.x, sy: u.y - 20, t: 0, owner: u, rot: rand(0, TAU) });
    if (L.length > D.cas.max) L.shift();
  }
  // ---------- 총알 ----------
  function drawBullet(ctx, p) {
    const a = Math.atan2(p.vy, p.vx); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    ctx.fillStyle = p.reflected ? '#ffe27a' : '#ffe8a0'; ctx.fillRect(-5, -1, 7, 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(1, -1, 2, 2);
    if (p.aimed) { ctx.globalAlpha = 0.5; ctx.fillStyle = RED; ctx.fillRect(-14, -1, 9, 2); }
  }
  function bullet(b, u, ang, spd, mult, aimed) {
    const sx = u.x + Math.cos(ang) * 12, sy = u.y - 20 - b.airZ(u) + Math.sin(ang) * 4;
    const p = { x: sx, y: sy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, spd, src: u, dmg: u.st.atk * mult, kind: 'arBullet', homing: false, noAirLock: true,
      life: 1.4, trail: 0, draw: drawBullet, aimed: !!aimed, hit: { element: 'blunt', delivery: 'ranged', pierce: aimed ? 0.4 : 0.15, color: '#ffe8a0' } };
    if (aimed) p.passB = bl => bl.arGear && bl.owner && p.src && bl.owner.team === p.src.team; // 조준 사격은 아군 군장 위로 넘어 쏨 (반사되면 src 가 바뀌므로 다시 막힘)
    b.proj.push(p);
    u.swing = 0.1; u.facing = Math.cos(ang) >= 0 ? 1 : -1;
    b.sparks(sx, sy, '#ffe8a0', 3, 90); b.glow(sx, sy, 8, '#ffd080', 0.08);
    dropCasing(b, u);
    return p;
  }
  const useAmmo = u => { const S = A_(u); if (S.ammo <= 0) return false; S.ammo--; return true; };

  // ---------- 군장 (장애물) ----------
  function drawGear(ctx, g) {
    const j = g.hitT > 0 ? Math.round(rand(-1, 1)) : 0, x = Math.round(g.x + j), y = Math.round(g.y), H = 9, dmg = 1 - g.hp / g.maxHp;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 2, y + 2, g.w, g.h);
    ctx.fillStyle = '#4a5230'; ctx.fillRect(x, y - H + g.h - 4, g.w, H + 4);          // 앞면
    ctx.fillStyle = '#6a7444'; ctx.fillRect(x, y - H, g.w, g.h - 2);                  // 윗면
    ctx.fillStyle = '#7e8a52'; ctx.fillRect(x + 1, y - H + 1, g.w - 2, 1);
    ctx.fillStyle = '#3a4026'; ctx.fillRect(x + 6, y - H, 2, g.h + H - 2); ctx.fillRect(x + g.w - 8, y - H, 2, g.h + H - 2); // 끈
    ctx.fillStyle = '#5a6238'; ctx.fillRect(x + 10, y - H + g.h - 2, g.w - 20, 4);   // 주머니
    ctx.fillStyle = '#c8b070'; ctx.fillRect(x + 12, y - H + g.h - 1, 2, 1);
    if (dmg > 0.3) { ctx.fillStyle = '#2a2e1a'; ctx.fillRect(x + 4, y - H + 3, 5, 1); ctx.fillRect(x + 8, y - H + 4, 1, 3); }
    if (dmg > 0.6) { ctx.fillRect(x + g.w - 12, y - 2, 6, 1); ctx.fillRect(x + g.w - 7, y - 4, 1, 3); }
    ctx.restore();
  }
  function removeGear(b, g, why) {
    if (g.arGone) return; g.arGone = true; g.dead = true; g.hp = 0;
    const S = g.owner && g.owner.ar; if (S) S.gears = S.gears.filter(x => x !== g);
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    for (let i = 0; i < 8; i++) b.parts.push({ x: cx + rand(-8, 8), y: cy - 6, vx: rand(-80, 80), vy: rand(-120, -40), g: 360, life: 0.5, max: 0.5, color: ['#6a7444', '#4a5230', '#c8b070'][i % 3], size: rand(1.5, 3) });
    b.dust(cx, cy); if (why) b.text(cx, cy - 20, why, '#d8e0b0', 9);
    playSfx('wall');
  }
  function placeGear(b, u, x, y) {
    const S = A_(u), w = D.gear.w, h = D.gear.h, P = b.play || AR;
    const gx = clamp(x - w / 2, P.x + 16, P.x + P.w - w - 16), gy = clamp(y - h / 2, P.y + 30, P.y + P.h - h - 10);
    const g = { x: gx, y: gy, w, h, hp: D.gear.hp, maxHp: D.gear.hp, dead: false, hitT: 0, cracks: [[], [], []], rubble: [], windows: [], arGear: true, owner: u, draw: drawGear };
    b.buildings.push(g); S.gears.push(g);
    while (S.gears.length > D.gear.max) removeGear(b, S.gears[0], '철거');
    for (const o of b.u) if (!o.dead && !o.airborne) b.resolveBuildings(o, true); // 겹친 유닛은 밖으로
    b.dust(gx + w / 2, gy + h / 2); playSfx('wall');
    b.stats.arGear = (b.stats.arGear || 0) + 1;
    return g;
  }
  // 군장 피해 판정: 몸 튕김은 무피해, 같은 팀의 근접/돌진은 무피해, 그 외(적의 모든 공격 + 아군 원거리 + 출처 미상의 광역 등)는 피해
  const oHB = Battle.prototype.hitBuilding;
  Battle.prototype.hitBuilding = function (bl, dmg, strong, x, y, src, kind) {
    if (!bl || !bl.arGear) return oHB.call(this, bl, dmg, strong, x, y, src, kind);
    if (bl.dead) return;
    bl.hitT = 0.15;
    if (kind === 'bump') return;
    if (src && bl.owner && src.team === bl.owner.team && kind !== 'proj') return;
    bl.hp -= Math.max(0, dmg || 0); if (strong) bl.hp = 0;
    if (bl.hp <= 0) removeGear(this, bl, '군장 파괴');
  };
  const gearsIn = (b, x, y, r) => b.buildings.filter(g => g.arGear && !g.dead && Math.hypot(x - clamp(x, g.x, g.x + g.w), y - clamp(y, g.y, g.y + g.h)) <= r);
  function nearGear(b, u) { const S = A_(u); let m = null, md = 1e9; for (const g of S.gears) { if (g.dead) continue; const d = Math.hypot(g.x + g.w / 2 - u.x, g.y + g.h / 2 - u.y); if (d < md) { md = d; m = g; } } return md <= D.gear.near ? m : null; }

  // ---------- 구르기: 관통(몸 충돌 없음) + 근접 회피 ----------
  const oCollide = Battle.prototype.collide;
  Battle.prototype.collide = function (a, c) { if (rolling(a) || rolling(c)) return; return oCollide.call(this, a, c); };
  const isMeleeHit = (src, o) => o.delivery === 'melee' || o.bump || (o.basic && !o.viaProj && src && src.st && src.st.range < MELEE_RANGE);
  const oDmg = Battle.prototype.damage;
  Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    if (rolling(tgt) && src && src !== tgt && !o.dot && !o.reflected && !o.fixed && isMeleeHit(src, o)) {
      this.text(tgt.x, tgt.y - 52, '회피', '#ffe0a0', 10); this.stats.arRollDodge = (this.stats.arRollDodge || 0) + 1; return 0;
    }
    return oDmg.call(this, src, tgt, amt, o);
  };

  // ---------- 슈류탄 (카이바 X-헤드 캐논 방식의 포물선 투척물: b.proj 가 아니므로 반사 대상 아님) ----------
  function throwGren(b, u, tx, ty, s) {
    const L = b.arGren || (b.arGren = []), q = b.clampPos(tx, ty, 4);
    L.push({ u, sx: u.x, sy: u.y, tx: q.x, ty: q.y, t: 0, dur: s.dur || D.gren.dur, h: D.gren.h, mult: s.mult || 0.9, r: s.r || D.gren.r });
    b.telegraphCircle(q.x, q.y, s.r || D.gren.r, s.dur || D.gren.dur, '#ffb070'); u.swing = 0.14;
  }
  function explodeGren(b, G, x, y) {
    const u = G.u, R = G.r, atk = { element: 'fire', delivery: 'ranged', color: '#ffb070' };
    b.shock(x, y, 4, R * 1.3, '#ffcf8a', 0.4, 6); b.glow(x, y - 8, R * 1.2, '#ff9a4a', 0.4); b.smoke(x, y - 6, '#8a8078', 8); b.burst(x, y - 6, '#ffd090', 10); b.shake(1.5);
    playSfx('bumpHard');
    for (const g of gearsIn(b, x, y, R)) removeGear(b, g, '군장 파괴');
    b.areaBuildings(x, y, R, u.st.atk * G.mult * 0.6, false);
    for (const o of [...b.u]) {
      if (o.dead || o.hidden || o.airborne) continue;
      const self = o === u; if (!self && o.team === u.team) continue;
      if (Math.hypot(o.x - x, (o.y - y) / 0.8) > R + o.pad) continue;
      b.damage(u, o, u.st.atk * G.mult * (self ? D.gren.selfK : 1), self ? { ...atk, selfHit: true, noCrit: true } : atk);
      if (self) b.stats.arSelfHit = (b.stats.arSelfHit || 0) + 1;
    }
  }
  function grenStep(b, dt) {
    const L = b.arGren; if (!L || !L.length) return;
    for (const G of L) {
      G.t += dt; const k = Math.min(1, G.t / G.dur), x = G.sx + (G.tx - G.sx) * k, y = G.sy + (G.ty - G.sy) * k;
      if (k >= 0.5 && k < 1 && gearsIn(b, x, y, 4).length) { G.done = true; b.stats.arGrenGear = (b.stats.arGrenGear || 0) + 1; explodeGren(b, G, x, y); continue; } // 내려오다 군장에 닿음
      if (k >= 1) { G.done = true; explodeGren(b, G, G.tx, G.ty); }
    }
    b.arGren = L.filter(G => !G.done);
  }

  // ---------- 재식(호루라기): 멈칫 → 무작위 방향 ----------
  STATUS_DEFS.arHalt = { name: '멈칫', color: '#e0e8c0', blocksMove: true, stack: 'refresh',
    onExpire(u, b) { if (u.dead || u.action) return; u.dir = fixAngle(rand(0, TAU)); if (u.v) u.v = [Math.cos(u.dir) * (u.speed || 0), Math.sin(u.dir) * (u.speed || 0)]; } };

  // ---------- 스킬 ----------
  SKILLS.arRoll = { desc: '상대를 기준으로 옆(무작위 좌/우, 막히면 반대쪽)으로 빠르게 구릅니다. 구르는 동안 상대를 관통하고 근접 공격을 회피합니다. 벽·장애물에 닿으면 멈춥니다.',
    canUse: (u, e, d, b) => !u.airborne && !u.push && !u.pull && (b.threatTo(u) || (e && !e.dead && e.st.range < MELEE_RANGE && d < e.reach + 14 && e.atkT < 0.25)),
    use(u, e0, b, s) {
      const e = foeOf(b, u), base = angTo(u, e), L = s.len || D.roll.len, V = s.spd || D.roll.spd; let side = Math.random() < 0.5 ? 1 : -1;
      const free = a => { const x = u.x + Math.cos(a) * L, y = u.y + Math.sin(a) * L, q = b.clampPos(x, y, u.pad, u); return Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1 && !b.blockAt(x, y - 4, 9 + u.pad); };
      let a = base + side * Math.PI / 2; if (!free(a)) { side = -side; a = base + side * Math.PI / 2; }
      let gone = 0; u.facing = Math.cos(a) >= 0 ? 1 : -1; b.dust(u.x, u.y);
      u.action = { type: 'arRoll', trail: '#f0d8c8', step(dt) {
        const st = Math.min(V * dt, L - gone), nx = u.x + Math.cos(a) * st, ny = u.y + Math.sin(a) * st, q = b.clampPos(nx, ny, u.pad, u), bl = b.blockAt(nx, ny - 4, 9 + u.pad);
        let stop = false;
        if (bl || Math.abs(q.x - nx) > 0.3 || Math.abs(q.y - ny) > 0.3) { stop = true; playSfx('wall'); b.dust(u.x, u.y); }
        else { u.x = nx; u.y = ny; gone += st; }
        u.walk += dt * 40;
        if (stop || gone >= L - 0.01) { u.action = null; u.dir = fixAngle(stop ? a + Math.PI + rand(-0.5, 0.5) : a + rand(-0.3, 0.3)); b.dust(u.x, u.y); }
      } };
      b.stats.arRoll = (b.stats.arRoll || 0) + 1;
    } };
  SKILLS.arAim = { desc: '근처에 자기 군장이 있으면 군장을 사이에 두고 상대 반대편으로 이동해, 상대를 향해 1발 정조준 사격합니다(총알 1). 거리가 멀수록 탄속이 빨라집니다. 자기 군장은 넘어 쏩니다.',
    canUse: (u, e, d, b) => A_(u).ammo > 0 && e && !e.dead && d > 80 && !!nearGear(b, u),
    use(u, e0, b, s) {
      const g = nearGear(b, u); if (!g) return; const e = foeOf(b, u);
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2, aw = angTo(e, { x: cx, y: cy }), off = Math.max(g.w, g.h) / 2 + u.pad + 14;
      const T = b.clampPos(cx + Math.cos(aw) * off, cy + Math.sin(aw) * off + 4, u.pad, u);
      let t = 0, aimT = -1;
      u.action = { type: 'arAim', step(dt) {
        t += dt; const tg = foeOf(b, u);
        if (aimT < 0) {
          const dx = T.x - u.x, dy = T.y - u.y, dd = Math.hypot(dx, dy), st = Math.min(dd, (s.moveSpd || D.aim.moveSpd) * dt);
          if (dd > 1) { const nx = u.x + dx / dd * st, ny = u.y + dy / dd * st; if (!b.blockAt(nx, ny - 4, 9 + u.pad)) { u.x = nx; u.y = ny; u.walk += dt * 40; u.facing = dx >= 0 ? 1 : -1; } else aimT = 0; }
          if (dd <= 1.5 || t > D.aim.maxMove) aimT = 0;
          return;
        }
        aimT += dt; if (tg) u.facing = tg.x >= u.x ? 1 : -1; u.arAimLine = tg ? { x: tg.x, y: tg.y - 18 } : null;
        if (aimT < (s.aimT || D.aim.aimT)) return;
        u.action = null; u.arAimLine = null;
        if (!tg || tg.dead || !useAmmo(u)) return;
        const dd = dist(u, tg), spd = clamp(D.aim.spd0 + dd * D.aim.spdK, D.aim.spd0, D.aim.spdMax);
        bullet(b, u, Math.atan2(tg.y - 18 - (u.y - 20), tg.x - u.x), spd, s.mult || 1.6, true);
        b.text(u.x, u.y - 64, '조준 사격', RED, 9); b.stats.arAim = (b.stats.arAim || 0) + 1;
      } };
    } };
  SKILLS.arGear = { desc: '자기 앞(상대 쪽)에 낮은 내구도의 군장을 설치합니다. 벽처럼 튕기고 투사체를 막습니다. 적의 공격·자신의 원거리 공격에 부서지며, 최대 3개(4번째를 놓으면 가장 오래된 것 철거).',
    canUse: (u, e, d, b) => { if (!e || e.dead || d < 60 || d > 260 || u.airborne) return false; const a = angTo(u, e), x = u.x + Math.cos(a) * 30, y = u.y + Math.sin(a) * 30; return !b.blockAt(x, y - 4, 16); },
    use(u, e0, b, s) { const e = foeOf(b, u), a = angTo(u, e); placeGear(b, u, u.x + Math.cos(a) * 30, u.y + Math.sin(a) * 30 - 2); b.text(u.x, u.y - 62, '군장 설치', '#d8e0b0', 9); } };
  SKILLS.arGrenade = { desc: '이동을 멈추지 않고 0.3초 간격으로 슈류탄 3개를 던집니다. 던지는 순간의 상대 위치로 포물선(비추적)을 그리며 떨어진 자리에서 폭발합니다. 자신도 폭발에 휘말리면 피해(절반). 군장에 닿으면 즉시 폭발해 군장을 부숩니다.',
    canUse: (u, e, d) => e && !e.dead && d > 90 && d < 260,
    use(u, e0, b, s) { const n = s.n || 3;
      for (let i = 0; i < n; i++) b.later(i * (s.gap || D.gren.gap), () => { if (u.dead || b.over || u.blocked('blocksAct')) return; const t = foeOf(b, u); if (!t || t.dead) return;
        throwGren(b, u, t.x + rand(-D.gren.spread, D.gren.spread), t.y + rand(-D.gren.spread, D.gren.spread), s); }); } };
  SKILLS.arWhistle = { desc: '호루라기를 불어 주변 전방위 적을 놀라게 합니다. 범위 안의 적은 잠깐 이동을 멈춘 뒤(멈칫) 무작위 방향으로 이동 방향이 바뀝니다.',
    canUse: (u, e, d, b) => b.foes(u).some(o => !o.dead && !o.hidden && !o.airborne && dist(u, o) < (D.whistle.r - 20)),
    use(u, e0, b, s) { const R = s.r || D.whistle.r;
      b.ring(u.x, u.y - 18, 6, R, 0.4, '#f0f4d0'); b.ring(u.x, u.y - 18, 4, R * 0.7, 0.3, '#ffffff'); b.text(u.x, u.y - 66, '삐익!', '#f0f4d0', 11);
      let n = 0; for (const o of b.foes(u)) { if (o.dead || o.hidden || o.airborne || dist(u, o) > R + o.pad) continue; b.applyStatus(o, 'arHalt', s.halt || D.whistle.halt, u); n++; }
      b.stats.arWhistle = (b.stats.arWhistle || 0) + n; } };
  SKILLS.arFire = { desc: '3발 연속 사격합니다(발당 총알 1, 각 발마다 현재 상대 쪽으로 조준). 쏠 때마다 무작위 방향으로 탄피가 떨어지며, 탄피를 주워야 총알이 1씩 회복됩니다(최대 18). 총알이 없으면 쏠 수 없습니다.',
    canUse: (u, e, d) => A_(u).ammo > 0 && e && !e.dead && d > 50 && d < 320,
    use(u, e0, b, s) { const n = s.n || 3;
      for (let i = 0; i < n; i++) b.later(i * (s.gap || D.bullet.gap), () => { if (u.dead || b.over || u.blocked('blocksAct')) return; const t = foeOf(b, u); if (!t || t.dead) return;
        if (!useAmmo(u)) { if (i === 0 || A_(u).ammo === 0) b.text(u.x, u.y - 60, '탄약 없음', '#c8c8c8', 9); return; }
        bullet(b, u, Math.atan2(t.y - 18 - (u.y - 20), t.x - u.x) + rand(-0.04, 0.04), s.spd || D.bullet.spd, s.mult || 0.45, false); }); } };

  STAGE_HOOKS.push({
    match: () => false,
    init(b) { b.arGren = []; b.arCas = []; },
    step(b, dt) {
      grenStep(b, dt);
      if (b.buildings.some(g => g.arGone)) b.buildings = b.buildings.filter(g => !g.arGone);
      const C = b.arCas; if (C && C.length) {
        for (const c of C) c.t += dt;
        for (const u of b.u) { if (u.dead || !u.ar || u.airborne) continue;
          for (const c of C) { if (c.got || c.owner !== u || c.t < 0.35 || Math.hypot(c.x - u.x, c.y - u.y) > D.cas.pick + u.pad) continue;
            if (u.ar.ammo >= D.ammoMax) continue; c.got = true; u.ar.ammo++; b.text(u.x + 8, u.y - 44, '+1', '#ffe8a0', 8); b.stats.arPick = (b.stats.arPick || 0) + 1; } }
        if (C.some(c => c.got)) b.arCas = C.filter(c => !c.got);
      }
    },
    drawUnder(ctx, b) {
      for (const c of b.arCas || []) { const k = Math.min(1, c.t / 0.35), x = c.sx + (c.x - c.sx) * k, y = c.sy + (c.y - c.sy) * k - Math.sin(k * Math.PI) * 10 + (1 - k) * 20 * 0;
        ctx.save(); ctx.translate(Math.round(x), Math.round(k < 1 ? y : c.y)); ctx.rotate(c.rot + (k < 1 ? c.t * 20 : 0)); ctx.fillStyle = '#d8b050'; ctx.fillRect(-2, -1, 4, 2); ctx.fillStyle = '#fff0a0'; ctx.fillRect(-2, -1, 1, 1); ctx.restore(); }
    },
    drawOver(ctx, b) {
      for (const G of b.arGren || []) { const k = Math.min(1, G.t / G.dur), x = G.sx + (G.tx - G.sx) * k, y = G.sy + (G.ty - G.sy) * k, z = 4 * G.h * k * (1 - k);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(x - 2), Math.round(y - 1), 4, 2);
        ctx.fillStyle = '#4a5a30'; ctx.fillRect(Math.round(x - 2), Math.round(y - 18 - z), 5, 5); ctx.fillStyle = '#8a9a58'; ctx.fillRect(Math.round(x - 1), Math.round(y - 18 - z), 2, 1); ctx.fillStyle = '#c8c8c8'; ctx.fillRect(Math.round(x), Math.round(y - 20 - z), 1, 2); }
      for (const u of b.u) { if (u.dead || u.hidden || !u.ar) continue;
        if (u.arAimLine && u.action && u.action.type === 'arAim') { ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = RED; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(u.x, u.y - 20); ctx.lineTo(u.arAimLine.x, u.arAimLine.y); ctx.stroke(); ctx.restore(); }
        if (!isArmy(u) && !u.skills.some(s => s.id === 'arFire' || s.id === 'arAim')) continue;
        ctx.save(); ctx.font = '8px monospace'; ctx.textAlign = 'center'; const t = '탄 ' + u.ar.ammo; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(Math.round(u.x - 14), Math.round(u.y + 3), 28, 9);
        ctx.fillStyle = u.ar.ammo > 0 ? '#ffe8a0' : '#ff8080'; ctx.fillText(t, Math.round(u.x), Math.round(u.y + 10)); ctx.restore(); }
    },
  });

  CHARACTERS.push({
    id: ID, name: '육군보병', fullName: '육군보병', gender: 'female', color: '#d83a3a', weapon: 'rifleButt',
    stats: { hp: 760, atk: 30, spd: 270, range: 50, atkRate: 0.9, def: 12, crit: 0.04, critMult: 1.5 },
    attack: { element: 'blunt', delivery: 'melee' },
    skills: [
      { id: 'arRoll', name: '구르기', cd: 5.5, len: 92, spd: 560 },
      { id: 'arAim', name: '조준 사격', cd: 6, mult: 1.6 },
      { id: 'arGear', name: '군장', cd: 7 },
      { id: 'arWhistle', name: '재식', cd: 11, r: 120, halt: 0.6 },
      { id: 'arGrenade', name: '슈류탄', cd: 8, mult: 0.9, n: 3, gap: 0.3, r: 34, dur: 0.55 },
      { id: 'arFire', name: '사격', cd: 3, mult: 0.45, n: 3, gap: 0.12, spd: 720 },
    ],
    sprite: { src: 'assets/army/front.png', back: 'assets/army/back.png', scale: 0.36, foot: 2, faces: { front: 'left', back: 'left' } },
    portrait: 'assets/army/portrait.png',
    lines: { // 플레이스홀더 (사용자 대사 없음)
      skill: { '구르기': ['구르기!'], '조준 사격': ['조준 사격!'], '군장': ['군장 설치!'], '재식': ['삐익!'], '슈류탄': ['슈류탄!'], '사격': ['사격!'] },
      event: { battleStart: ['전투 준비!'], lowHp: ['아직 버틸 수 있다!'], stunned: ['으윽…!'], win: ['임무 완료!'], lose: ['후퇴…'] },
    },
  });
})();
