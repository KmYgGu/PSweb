/**
 * 니지무라 오쿠야스 (죠죠의 기묘한 모험 4부) — 스탠드 「더 핸드」. 근접 주먹 평타
 *  더 핸드: 평소엔 본체 옆에 떠 있는 표시. 공간 삭제 중에는 분리되어 실제 유닛(소환물)으로 제자리에 고정, 맞으면 오쿠야스 체력이 깎임(공유)
 *  1. 공간 휘두르기 : 공간을 지워 (a) 상대를 내 앞으로 끌어오거나 (b) 내가 상대 앞으로 순간이동 (모드는 상황 + 시드 난수)
 *  2. 면상에 주먹   : 근접 한 방 + 강한 넉백, 벽에 부딪히면 추가 피해·짧은 기절
 *  3. 가볍게 휘두르기: 다가오는 일반 투사체를 주변 반경에서 지움 (특수 투사체 제외)
 *  4. 연속 휘두르기 : 상대 쪽으로 고정된 방향으로 연타하며 전진, 벽까지 또는 시간 끝까지. 중에는 경직·CC·넉백·제압 무시(피해는 받음) → 끝에 강타
 *  5. 공간 삭제     : 더 핸드 분리 → 제자리에서 긴 차지(범위 예고) → 직사각 범위 스윙: 적중 시 즉사(고정 피해=현재 HP), 빗나가면 그 범위에 빈 공간(벽, 일정 시간)
 *  난수는 전부 Math.random (전투 중 시드 난수)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'okuyasu', BLUE = '#7cd0f4';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const isOku = u => u && u.def && u.def.id === ID;
  const D = {
    swat: { r: 50, sense: 80 },
    warp: { wind: 0.25, after: 0.2 },
    face: { wind: 0.16, mult: 1.6, push: 640, pushT: 0.5, wallMult: 0.8, stun: 0.6 },
    barrage: { dur: 1.8, spd: 180, gap: 0.12, mult: 0.35, reach: 30, finMult: 1.0 },
    erase: { charge: 4.0, L: 230, W: 70, voidLife: 12, cell: 36 },
  };
  // ---------- 더 핸드 그림 (16x16 도트, 코드로 그림) ----------
  const HAND_ROWS = ['................', '.....dddddd.....', '....dccccccd....', '....dcYccYcd....', '....dccggccd....', '.....dccccd.....', '...ddddddddd.d.d', '..dccdgdgdcdPdPd',
    '..dccdddddcdPPPd', '..dcdccccccdPPPd', '...ddcgccgcdPPPd', '....dccccccddPd.', '....dddddddd.d..', '....dcc..ccd....', '....dcc..ccd....', '....ddd..ddd....'];
  const HAND_PAL = { d: '#1c3a70', c: BLUE, Y: '#fff07a', g: '#f0c040', P: '#a8e4ff' };
  let handCv = null;
  function handCanvas() {
    if (handCv) return handCv; const c = document.createElement('canvas'); c.width = 18; c.height = 18; const g = c.getContext('2d');
    g.fillStyle = 'rgba(10,20,40,0.55)'; for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (HAND_ROWS[j][i] !== '.') for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.fillRect(i + dx, j + dy, 1, 1);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const k = HAND_ROWS[j][i]; if (k === '.') continue; g.fillStyle = HAND_PAL[k]; g.fillRect(i + 1, j + 1, 1, 1); }
    return (handCv = c);
  }
  function drawHand(ctx, x, y, facing, alpha, sc) { // (x, y) = 발 위치
    const c = handCanvas(), k = sc || 2.6, w = 18 * k; ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(x), Math.round(y));
    if (facing < 0) ctx.scale(-1, 1); ctx.drawImage(c, -w / 2, -w + 2, w, w); ctx.restore();
  }
  // ---------- 상태 ----------
  const O_ = u => u.ok || (u.ok = {});
  const handAway = u => !!(u.ok && u.ok.erase);
  // 연속 휘두르기(행동) 중 / 분리된 더 핸드: 경직·CC·넉백·끌어오기·제압 무시
  const armored = u => !!(u && ((u.action && u.action.okArmor) || (u.summon && u.summon.okHand)));
  const oStatus = Battle.prototype.applyStatus; Battle.prototype.applyStatus = function (tgt, id, dur, src, o = {}) {
    const d = STATUS_DEFS[id]; if (d && !d.positive && src !== tgt && armored(tgt) && (d.blocksAct || d.blocksMove)) { if (!tgt.okResT || this.time - tgt.okResT > 0.4) { tgt.okResT = this.time; this.text(tgt.x, tgt.y - 58, '버팀', '#bfe8ff', 9); } return null; }
    return oStatus.call(this, tgt, id, dur, src, o);
  };
  const oKb = Battle.prototype.knockback; Battle.prototype.knockback = function (tgt, ...a) { if (armored(tgt)) return; return oKb.call(this, tgt, ...a); };
  const oPull = Battle.prototype.pull; Battle.prototype.pull = function (tgt, ...a) { if (armored(tgt)) return; return oPull.call(this, tgt, ...a); };
  const oPin = Battle.prototype.pinUnit; Battle.prototype.pinUnit = function (u, e, a, q) { if (armored(e)) { a.missed = true; return; } return oPin.call(this, u, e, a, q); };
  // 분리된 더 핸드 피해 → 오쿠야스 체력 (공유). B타입 반전은 적용 안 함
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    if (tgt && tgt.summon && tgt.summon.okHand) { const ow = tgt.summon.owner; if (!ow || ow.dead) return 0; tgt.flash = 0.12; return this.damage(src, ow, amt, { ...o, noFlip: true }); }
    return oDmg.call(this, src, tgt, amt, o);
  };
  const oFixed = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o = {}) {
    if (tgt && tgt.summon && tgt.summon.okHand) { const ow = tgt.summon.owner; return ow && !ow.dead ? oFixed.call(this, src, ow, amt, o) : 0; }
    return oFixed.call(this, src, tgt, amt, o);
  };
  const HAND_DEF = { id: 'okuyasu@hand', name: '더 핸드', gender: 'neutral', color: BLUE, noDraw: true, stats: { hp: 1, atk: 0, spd: 0, range: 0, atkRate: 0, def: 0 }, attack: { element: 'blunt', delivery: 'melee' }, skills: [] };

  // ---------- 위치 안전 판정 ----------
  function safeSpot(b, u, x, y) {
    const q = b.clampPos(x, y, u.pad, u); if (Math.abs(q.x - x) > 1 || Math.abs(q.y - y) > 1) return null;
    if (b.blockAt(q.x, q.y - 4, 11 + u.pad)) return null;
    const C = b.stage.circle; if (C && Math.hypot(q.x - C.cx, q.y - C.cy) > b.circleR() - 14) return null;
    return q;
  }
  // 강제 이동 가능한 대상인지 (공중·라미아 부상·벽타기·숨음·열차·제압 중·특수 행동 중은 제외)
  const movable = o => o && !o.dead && !o.hidden && !o.airborne && !o.air && !o.climb && !o.inTrain && !o.push && !o.pull && !o.action && !o.summon && !o.def.noDraw && !o.status('pin');
  function frontOf(b, a, t, who) { // a 앞(→t 방향)에 who 를 놓을 자리
    const R = 15 * (a.size + t.size) + 6, base = angTo(a, t);
    for (const da of [0, 0.5, -0.5, 1, -1]) for (const k of [1, 1.4]) { const p = safeSpot(b, who, a.x + Math.cos(base + da) * R * k, a.y + Math.sin(base + da) * R * k); if (p) return p; }
    return null;
  }
  function eraseFx(b, x0, y0, x1, y1) { // 더 핸드가 공간을 긁어낸 자국
    b.fx.push({ type: 'streak', x1: x0, y1: y0 - 18, x2: x1, y2: y1 - 18, color: '#c8f0ff', w: 10, t: 0, dur: 0.35 });
    b.ring(x0, y0 - 18, 3, 20, 0.25, BLUE); b.ring(x1, y1 - 18, 3, 20, 0.25, '#ffffff'); b.sparks(x1, y1 - 18, '#c8f0ff', 8, 160);
  }

  // ---------- 스킬 ----------
  SKILLS.okSwat = { desc: '다가오는 상대 투사체가 있으면 더 핸드로 가볍게 휘둘러, 주변(반경 50)의 일반 투사체를 지웁니다. 수명 종료·명중 시 특수 처리가 붙은 투사체, 관통·상쇄 투사체는 지우지 못하고, 광선·광역·즉발·지속 피해는 대상이 아닙니다.',
    canUse: (u, e, d, b) => !handAway(u) && b.proj.some(p => erasable(p, u) && Math.hypot(p.x - u.x, p.y - (u.y - 18)) < D.swat.sense + u.pad && (p.vx * (u.x - p.x) + p.vy * (u.y - 18 - p.y)) > 0),
    use(u, e0, b, s) { const R = (s.r || D.swat.r) + u.pad; let n = 0;
      for (const p of b.proj) if (erasable(p, u) && Math.hypot(p.x - u.x, p.y - (u.y - 18)) < R) { p.life = 0; p.okErased = true; n++; b.sparks(p.x, p.y, '#c8f0ff', 4, 120); }
      b.crescent(u.x + u.facing * 10, u.y - 20, R * 0.8, u.facing > 0 ? 0 : Math.PI, BLUE, 0.22); u.okSwing = 0.25;
      if (n) b.text(u.x, u.y - 62, `지움 ×${n}`, '#c8f0ff', 9); b.stats.okSwat = (b.stats.okSwat || 0) + n; } };
  function erasable(p, u) { return p && p.life > 0 && p.src && p.src.team !== u.team && !p.fizzle && !p.onHitUnit && !p.pierce && !p.cancel && !p.hitAlly && !p.noErase; }

  SKILLS.okWarp = { desc: '더 핸드로 공간을 지워 (a) 멀리 있는 상대를 내 앞으로 끌어오거나, (b) 상대가 원거리 위주면 주로 내가 상대 앞으로 순간이동합니다(선택은 시드 난수). 짧은 준비·후딜레이. 공중·부상·벽타기·숨음·제압 등 강제 이동이 위험한 대상에겐 쓰지 않습니다.',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return !handAway(u) && e && !e.dead && d > 120 && d < 330 && !u.airborne && !u.air && movable(e) && !!(frontOf(b, u, e, e) || frontOf(b, e, u, u)); },
    use(u, e0, b, s) { const e = foeOf(b, u); const ranged = e.st.range >= MELEE_RANGE || !!e.def.rangedBasic, mode = Math.random() < (ranged ? 0.7 : 0.2) ? 'self' : 'pull';
      b.telegraphFan(u.x, u.y - 18, angTo(u, e), 0.25, 60, s.wind || D.warp.wind, '#c8f0ff'); u.okSwing = 0.3;
      b.windup(u, s.wind || D.warp.wind, () => {
        if (u.dead || b.over || !movable(e)) return; let m = mode, p = m === 'pull' ? frontOf(b, u, e, e) : frontOf(b, e, u, u);
        if (!p) { m = m === 'pull' ? 'self' : 'pull'; p = m === 'pull' ? frontOf(b, u, e, e) : frontOf(b, e, u, u); } if (!p) { b.text(u.x, u.y - 60, '헛손질', '#c8d8e8', 9); return; }
        const mv = m === 'pull' ? e : u, x0 = mv.x, y0 = mv.y; mv.x = p.x; mv.y = p.y; mv.kx = mv.ky = 0; if (mv.v) mv.v = null; eraseFx(b, x0, y0, p.x, p.y);
        u.dir = fixAngle(angTo(u, e)); u.facing = e.x >= u.x ? 1 : -1;
        b.text(mv.x, mv.y - 60, m === 'pull' ? '끌어오기!' : '순간이동!', '#c8f0ff', 10); playSfx('bump');
        b.stats['okWarp_' + m] = (b.stats['okWarp_' + m] || 0) + 1;
        u.action = { type: 'okRecover', t: s.after || D.warp.after, step(dt) { this.t -= dt; if (this.t <= 0) u.action = null; } };
      }); } };

  SKILLS.okFace = { desc: '면상에 주먹 한 방(ATK×1.6) + 맞은 방향으로 매우 강하게 날려 보냅니다. 벽·장애물에 부딪히면 추가 피해(ATK×0.8)와 짧은 기절(0.6초).',
    canUse: (u, e, d) => e && !e.dead && d <= u.reach + 8,
    use(u, e0, b, s) { const e = foeOf(b, u); const a0 = angTo(u, e); u.facing = Math.cos(a0) >= 0 ? 1 : -1;
      b.windup(u, s.wind || D.face.wind, () => {
        if (u.dead || b.over || e.dead || dist(u, e) > u.reach + 22) { b.slashFx(u.x + u.facing * 18, u.y - 18, u.facing, '#ffffff', 0.8); return; }
        u.swing = 0.2; const a = angTo(u, e); b.shock(e.x, e.y - 18, 4, 26, '#ffffff', 0.25, 3); b.hitstop(0.06);
        const dd = b.damage(u, e, u.st.atk * (s.mult || D.face.mult), { element: 'blunt', delivery: 'melee', big: true, color: '#ffe8d0' });
        if (dd > 0 && !e.dead) b.knockback(e, a, s.push || D.face.push, s.pushT || D.face.pushT, () => { if (e.dead || b.over) return;
          b.damage(u, e, u.st.atk * (s.wallMult || D.face.wallMult), { element: 'blunt', delivery: 'melee', noCrit: true, color: '#f0e8d8' }); b.stun(e, s.stun || D.face.stun, u); b.shake(2); b.stats.okFaceWall = (b.stats.okFaceWall || 0) + 1; });
      }); } };

  SKILLS.okBarrage = { desc: '더 핸드에게 명령해 상대 쪽(시전 순간 방향 고정)으로 0.12초마다 연타(ATK×0.35)하며 1.8초 동안 전진합니다. 진행 중엔 맞아도 멈추지 않고(경직·CC·넉백·제압 무시, 피해는 받음) 벽·장애물에 닿을 때까지 직진. 시간이 다 되면 마지막 강타(ATK×1.0). 끝나면 더 핸드가 돌아옵니다.',
    canUse: (u, e, d) => !u.ok?.erase && e && !e.dead && d > 30 && d < 150,
    use(u, e0, b, s) { const e = foeOf(b, u), a = angTo(u, e), V = s.spd || D.barrage.spd, gap = s.gap || D.barrage.gap, T = s.dur || D.barrage.dur; let t = 0, nx = 0, hits = 0;
      u.facing = Math.cos(a) >= 0 ? 1 : -1; b.text(u.x, u.y - 64, '연속 휘두르기', '#c8f0ff', 9);
      const strike = (mult, fin) => { const hx = u.x + Math.cos(a) * 26, hy = u.y + Math.sin(a) * 26; b.crescent(hx, hy - 18, 20 + (fin ? 10 : 0), a + rand(-0.6, 0.6), BLUE, 0.16);
        for (const o of b.foes(u)) { if (o.hidden || o.airborne || Math.hypot(o.x - hx, o.y - hy) > (s.reach || D.barrage.reach) + o.pad) continue;
          const r = b.damage(u, o, u.st.atk * mult, { element: 'blunt', delivery: 'melee', noCrit: true, big: !!fin, color: '#c8f0ff' }); if (r > 0) hits++;
          if (fin && r > 0 && !o.dead) b.knockback(o, a, 360, 0.3); }
        const bl = b.blockAt(hx, hy - 4, 8); if (bl) b.hitBuilding(bl, u.st.atk * 0.5, false, hx, hy - 14, u, 'melee'); };
      u.action = { type: 'okBarrage', okArmor: true, trail: '#bfe8ff', ang: a, step(dt) {
        t += dt; nx -= dt; if (nx <= 0) { nx = gap; strike(s.mult || D.barrage.mult, false); }
        const st = V * dt, px = u.x + Math.cos(a) * st, py = u.y + Math.sin(a) * st, q = b.clampPos(px, py, u.pad, u), bl = b.blockAt(px, py - 4, 9 + u.pad);
        if (bl || Math.abs(q.x - px) > 0.3 || Math.abs(q.y - py) > 0.3) { playSfx('wall'); b.dust(u.x, u.y); u.action = null; u.dir = fixAngle(a + Math.PI + rand(-0.5, 0.5)); b.stats.okBarrageWall = (b.stats.okBarrageWall || 0) + 1; return; }
        u.x = px; u.y = py; u.walk += dt * 30;
        if (t >= T) { strike(s.finMult || D.barrage.finMult, true); u.action = null; u.dir = fixAngle(a + rand(-0.4, 0.4)); b.stats.okBarrageHits = (b.stats.okBarrageHits || 0) + hits; }
      } }; } };

  // ---------- 5. 공간 삭제 ----------
  const inRect = (E, o) => { const dx = o.x - E.x, dy = o.y - E.y, c = Math.cos(E.ang), s = Math.sin(E.ang), along = dx * c + dy * s, perp = -dx * s + dy * c;
    return along >= -o.pad && along <= E.L + o.pad && Math.abs(perp) <= E.W / 2 + o.pad; };
  function drawVoid(ctx, V) { const k = Math.min(1, (V.maxLife - V.life) / 0.2) * Math.min(1, V.life / 0.6);
    ctx.save(); ctx.globalAlpha = 0.92 * k; ctx.fillStyle = '#05040a'; ctx.fillRect(Math.round(V.x), Math.round(V.y), V.w, V.h);
    ctx.globalAlpha = 0.6 * k; ctx.fillStyle = '#3a2a6a'; ctx.fillRect(Math.round(V.x), Math.round(V.y), V.w, 1); ctx.fillRect(Math.round(V.x), Math.round(V.y + V.h - 1), V.w, 1); ctx.fillRect(Math.round(V.x), Math.round(V.y), 1, V.h); ctx.fillRect(Math.round(V.x + V.w - 1), Math.round(V.y), 1, V.h);
    ctx.fillStyle = '#7cd0f4'; for (const [px, py] of V.pts) ctx.fillRect(Math.round(V.x + px * V.w), Math.round(V.y + py * V.h), 1, 1); ctx.restore(); }
  function makeVoid(b, u, E, life) {
    const c = Math.cos(E.ang), s = Math.sin(E.ang), S = D.erase.cell, P = b.play || AR; let n = 0;
    for (let a = 26; a <= E.L - S / 4; a += S * 0.6) {
      const cx = E.x + c * a, cy = E.y + s * a; if (cx < P.x || cx > P.x + P.w || cy < P.y || cy > P.y + P.h) continue;
      const V = { x: cx - S / 2, y: cy - S / 2, w: S, h: S, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, cracks: [[], [], []], rubble: [], windows: [], solid: true, okVoid: true, life, maxLife: life, draw: drawVoid, pts: [] };
      for (let i = 0; i < 5; i++) V.pts.push([rand(0.15, 0.85), rand(0.15, 0.85)]);
      b.buildings.push(V); n++;
    }
    for (const o of b.u) if (!o.dead && !o.airborne) b.resolveBuildings(o, true); // 안에 있던 유닛은 밖으로
    return n;
  }
  function eraseStart(b, u, s) {
    const e = foeOf(b, u), a0 = angTo(u, e), hp = { x: u.x + Math.cos(a0) * 18, y: u.y + Math.sin(a0) * 18 };
    const H = GHOUL.summon(b, u, 'okHand', hp.x, hp.y, { def: HAND_DEF, dur: 1e9, quiet: true, extra: { okHand: true } }); if (!H) return;
    H.maxHp = u.maxHp; H.hp = u.hp; H.atkT = 1e9; H.facing = Math.cos(a0) >= 0 ? 1 : -1;
    const E = { H, x: H.x, y: H.y, ang: angTo(H, e), L: s.L || D.erase.L, W: s.W || D.erase.W, t: 0, charge: s.charge || D.erase.charge };
    O_(u).erase = E; b.text(H.x, H.y - 66, '공간 삭제…', '#c8f0ff', 10); b.hooks.onSystem && b.hooks.onSystem('오쿠야스: 더 핸드가 공간 삭제를 준비합니다!');
  }
  function eraseEnd(b, u) { const E = u.ok && u.ok.erase; if (!E) return; u.ok.erase = null; if (E.H && b.u.includes(E.H)) GHOUL.removeSummon(b, E.H); }
  function eraseSwing(b, u, E) {
    b.shock(E.x, E.y - 18, 6, 50, '#ffffff', 0.3, 4); b.shake(3); b.hitstop(0.12); b.glow(E.x, E.y - 18, 60, BLUE, 0.5);
    const c = Math.cos(E.ang), s = Math.sin(E.ang); b.fx.push({ type: 'streak', x1: E.x, y1: E.y - 18, x2: E.x + c * E.L, y2: E.y + s * E.L - 18, color: '#ffffff', w: E.W * 0.6, t: 0, dur: 0.4 });
    let killed = 0;
    for (const o of [...b.u]) { if (o.dead || o.team === u.team || o.hidden || o.airborne || !inRect(E, o)) continue;
      const hp0 = o.hp, r = b.damage(u, o, Math.ceil(Math.max(1, o.hp)), { fixed: true, delivery: 'melee', element: 'dark', color: '#c8f0ff', noCrit: true, okErase: true });
      if (o.dead) { killed++; b.text(o.x, o.y - 70, '삭제!', '#ffffff', 14); } else if (r === 0 && hp0 === o.hp) b.text(o.x, o.y - 70, '삭제 실패', '#c8d8e8', 9); }
    b.stats.okEraseSwing = (b.stats.okEraseSwing || 0) + 1;
    if (killed) { b.stats.okEraseKill = (b.stats.okEraseKill || 0) + killed; return; }
    if (!b.over) { const n = makeVoid(b, u, E, D.erase.voidLife); b.stats.okVoid = (b.stats.okVoid || 0) + n; if (n) b.hooks.onSystem && b.hooks.onSystem('지워진 공간이 생겼습니다!'); }
  }
  SKILLS.okErase = { desc: '더 핸드를 분리해 그 자리에 고정하고 4초 동안 스탠드 파워를 모은 뒤(범위 예고가 점점 선명해짐), 시전 순간 정한 방향으로 폭 70×길이 230 직사각 범위를 휘둡니다. 맞은 적은 즉사(현재 HP만큼 고정 피해). 빗나가면 그 범위에 12초간 빈 공간(벽)이 생깁니다. 차지 중 더 핸드는 맞아도 움직이지 않으며(피해는 오쿠야스 체력), 오쿠야스는 자유롭게 움직이고 면상 주먹만 쓸 수 있습니다.',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return !handAway(u) && !u.airborne && !u.air && e && !e.dead && d > 70 && d < 200 && b.time > 3; },
    use(u, e0, b, s) { eraseStart(b, u, s); } };

  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.winner && b.winner.summon && b.winner.summon.okHand) b.winner = b.winner.summon.owner;
      for (const u of b.u) { if (!u.ok) continue; if (u.okSwing > 0) u.okSwing -= dt;
        const E = u.ok.erase; if (!E) continue;
        if (u.dead || b.over || !b.u.includes(E.H)) { eraseEnd(b, u); continue; }
        const H = E.H; H.x = E.x; H.y = E.y; H.kx = H.ky = 0; H.action = null; H.push = null; H.pull = null; H.statuses = H.statuses.filter(x => STATUS_DEFS[x.id] && STATUS_DEFS[x.id].positive); H.hp = u.hp; H.maxHp = u.maxHp; // 제자리 고정·체력 동기화
        E.t += dt; if (Math.random() < dt * (6 + 20 * E.t / E.charge)) b.parts.push({ x: H.x + Math.cos(E.ang) * 16 + rand(-6, 6), y: H.y - 22 + rand(-6, 6), vx: rand(-20, 20), vy: rand(-20, 20), life: 0.4, max: 0.4, color: rand(0, 1) < 0.5 ? BLUE : '#ffffff', size: 2, glow: true });
        if (E.t >= E.charge) { eraseSwing(b, u, E); eraseEnd(b, u); }
      }
    },
    drawOver(ctx, b) {
      for (const u of b.u) { if (!isOku(u) && !u.ok) continue; if (u.dead || u.hidden) continue; const E = u.ok && u.ok.erase, z = b.airZ(u);
        if (E) { const k = Math.min(1, E.t / E.charge), c = Math.cos(E.ang), s = Math.sin(E.ang); // 범위 예고 (점점 선명)
          ctx.save(); ctx.translate(E.x, E.y); ctx.rotate(E.ang); ctx.globalAlpha = 0.08 + 0.32 * k; ctx.fillStyle = '#7cd0f4'; ctx.fillRect(0, -E.W / 2, E.L, E.W);
          ctx.globalAlpha = 0.3 + 0.6 * k; ctx.strokeStyle = k > 0.8 && Math.floor(b.time * 12) % 2 ? '#ffffff' : '#bfe8ff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(0, -E.W / 2, E.L, E.W); ctx.restore();
          const g = 6 + 14 * k; ctx.save(); ctx.globalAlpha = 0.4 + 0.5 * k; ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(E.x + c * 18, E.y - 24 + s * 6, g * (0.9 + 0.1 * Math.sin(b.time * 30)), 0, TAU); ctx.fill(); ctx.globalAlpha = 0.8 * k; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(E.x + c * 18, E.y - 24 + s * 6, g * 0.45, 0, TAU); ctx.fill(); ctx.restore();
          drawHand(ctx, E.x, E.y, Math.cos(E.ang) >= 0 ? 1 : -1, 0.95, 2.6); continue; }
        if (!isOku(u)) continue;
        const A = u.action;
        if (A && A.type === 'okBarrage') { const bob = Math.sin(b.time * 50) * 3; drawHand(ctx, u.x + Math.cos(A.ang) * 22, u.y + Math.sin(A.ang) * 10 + bob, Math.cos(A.ang) >= 0 ? 1 : -1, 0.9, 2.6); }
        else drawHand(ctx, u.x - u.facing * 16 + (u.okSwing > 0 ? u.facing * 26 : 0), u.y - 6 - z + Math.sin(b.time * 3) * 2, u.facing, u.okSwing > 0 ? 0.85 : 0.55, 2.3);
      }
    },
  });

  CHARACTERS.push({
    id: ID, name: '오쿠야스', fullName: '니지무라 오쿠야스', gender: 'male', color: '#3a4a8a',
    stats: { hp: 860, atk: 32, spd: 280, range: 52, atkRate: 0.95, def: 18, crit: 0.06, critMult: 1.7 },
    attack: { element: 'blunt', delivery: 'melee' },
    skills: [
      { id: 'okSwat', name: '가볍게 휘두르기', cd: 3.5, r: 50 },
      { id: 'okErase', name: '공간 삭제', cd: 45, ult: true, charge: 4.0, L: 230, W: 70 },
      { id: 'okFace', name: '면상에 주먹', cd: 7, mult: 1.6, push: 640, pushT: 0.5, wallMult: 0.8, stun: 0.6 },
      { id: 'okBarrage', name: '연속 휘두르기', cd: 9, dur: 1.8, spd: 180, gap: 0.12, mult: 0.35, finMult: 1.0 },
      { id: 'okWarp', name: '공간 휘두르기', cd: 8, wind: 0.25, after: 0.2 },
    ],
    sprite: { // 16x16 절차적 도트 (직접 그림): 검은 세운 머리·옆머리 짧게, 이마 흉터, 남색 학란(금단추)·흰 셔츠
      pal: { H: '#1a1a22', h: '#55555e', S: '#f2c9a0', E: '#2a2230', r: '#c08070', m: '#8a4038', B: '#262c48', W: '#dcdce6', A: '#e8c050', L: '#202438', D: '#2a2020' },
      rows: { 0: '.....H.HH.H.....', 1: '....HHHHHHHH....', 2: '....HHHHHHHH....', 3: '....hHSrSSHh....', 4: '....SSESSESS....', 5: '....SSSSSSSS....', 6: '.....SSmmSS.....', 7: '....BBBWWBBB....',
        8: '...BBBAWWABBB...', 9: '...SBBBWWBBBS...', 10: '...SBBAWWABBS...', 11: '....BBBBBBBB....', 12: '....LLL..LLL....', 13: '....LLL..LLL....', 14: '....DDD..DDD....', 15: '................' },
    },
    lines: { // 플레이스홀더 (사용자 대사 없음)
      skill: { '공간 휘두르기': ['더 핸드!'], '면상에 주먹': ['받아라!'], '가볍게 휘두르기': ['휙!'], '연속 휘두르기': ['간다아!'], '공간 삭제': ['공간 삭제!'] },
      event: { battleStart: ['덤벼!'], lowHp: ['아직이다…!'], stunned: ['으악!'], win: ['해냈다!'], lose: ['크윽…'] },
    },
  });
})();
