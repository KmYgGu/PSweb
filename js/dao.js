/**
 * 다오 (카트라이더 팬 캐릭터) — 카트를 탄 레이서. 근접 평타 = 카트 들이받기
 *  부스터 (패시브)  : 달리면(이동 거리) 부스터 게이지 상승, 드리프트하면 크게 상승. 가득 차면 부스터 상태:
 *                     속도 ×1.6·가속(충돌 가속 유지), 모든 해로운 상태이상 면역(피해는 받음). 일정 거리(900px)를 달리거나 벽·장애물에 부딪히면 해제
 *  1. 드리프트      : 상대를 중심으로 원을 그리며 미끄러지듯 감속(1.2초). 드리프트한 거리만큼 게이지 회복,
 *                     도중 벽·장애물에 부딪히면 이번 드리프트로 얻은 게이지의 절반을 잃고 끝남. 부스터 중에도 부스터 유지(드리프트 거리는 부스터 거리에 안 셈)
 *  2. 미사일        : 다오와 상대의 진행 방향이 거의 같으면(뒤에서 쫓는 중) 유도 미사일(무조건 명중), 어느 정도 차이면 상대 쪽 직선, 너무 어긋나면 불발
 *  3. 지뢰          : 1.6초 동안 지나간 길에 지뢰 4개(0.6초 뒤 작동, 12초). 밟으면 화염 피해 + 위로 튕겨 오름. 다오 자신도 밟으면 피해
 *  4. 우주선        : 상대 머리 위에 우주선 소환(3.2초, 천천히 따라감) → 0.5초마다 광선. 맞으면 작은 피해 + 감속 + 스킬 쿨타임 0.6초 증가
 *  5. 물파리        : 물방울 탄 — 맞은 상대를 물방울에 가둠(이동·행동 불가)·산소 게이지 감소. 남은 산소가 적을수록 오래 가둠
 *  난수는 전부 Math.random (전투 중 시드 난수). 그리기 코드는 난수·전투 값을 바꾸지 않음 (b.time 기반 흔들림만)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'dao', CYAN = '#4ad0ff', FIRE = '#ff8a3a';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const isD = u => !!(u && u.def && u.def.id === ID);
  function voice(b, u, txt, color, size) { b.hooks.onVoice && b.hooks.onVoice(u, txt, null); if (color) b.text(u.x, u.y - 64 - u.pad * 2, txt.length > 14 ? txt.slice(0, 13) + '…' : txt, color, size || 9); }
  const held = b => !!(window.BSB_HELD && window.BSB_HELD(b));
  const D = {
    boost: { runK: 0.03, len: 900, spdMul: 1.6 },
    drift: { dur: 1.2, k: 0.16, rMin: 60, rMax: 150, endMul: 0.6 },
    missile: { sure: 0.35, ok: 1.0, spd: 520, mult: 1.4, life: 2.5 },
    mine: { n: 4, every: 0.4, arm: 0.6, ownArm: 2.5, selfK: 0.5, life: 12, r: 11, mult: 1.0, fly: 0.7, h: 46 }, // ownArm: 다오 자신은 이 시간 뒤부터 밟힘, selfK: 자기 지뢰 피해 배율
    ufo: { dur: 3.2, follow: 140, every: 0.8, r: 20, mult: 0.25, slow: 0.8, cdAdd: 0.35 },
    bubble: { spd: 320, life: 1.2, mult: 0.5, o2: 1.0, base: 0.5, extra: 1.3 },
  };
  const owBoost = u => !!(u && u.daoBoost);

  STATUS_DEFS.daoSlow = { name: '우주선 광선', color: '#c8a0ff', tint: '#d8c0ff', tintA: 0.2, particle: '#e8d8ff', spdMul: 0.6 };
  STATUS_DEFS.daoBubble = { name: '물방울 감옥', color: '#8ad8ff', tint: '#a8e4ff', tintA: 0.35, particle: '#e0f6ff', blocksMove: true, blocksAct: true, onApply(u) { u.action = null; } };

  // ---------- 부스터 ----------
  function boostOn(b, u) {
    u.res.boost = 0; u.daoBoost = { left: D.boost.len }; u.buffs.push({ type: 'daoBoost', name: '부스터', t: 1e9, nodispel: true, spdMul: D.boost.spdMul });
    u.statuses = u.statuses.filter(s => { const d = STATUS_DEFS[s.id]; return !d || d.positive; }); // 부스터 순간 해로운 상태 해제
    voice(b, u, '부스터!', CYAN, 12); b.shock(u.x, u.y - 10, 4, 34, CYAN, 0.3, 3); b.stats.daoBoost = (b.stats.daoBoost || 0) + 1;
  }
  function boostOff(b, u, why) { if (!u.daoBoost) return; u.daoBoost = null; u.buffs = u.buffs.filter(x => x.type !== 'daoBoost'); if (why) b.text(u.x, u.y - 60, why, '#bfe8ff', 9); }
  function wallHit(b, u) {
    if (u.action && u.action.type === 'daoDrift') { u.action.wall = true; return; }
    if (u.daoBoost) { boostOff(b, u, '부스터 해제 (벽)'); b.stats.daoBoostWall = (b.stats.daoBoostWall || 0) + 1; }
  }
  // 부스터 중 해로운 상태이상 면역 (피해는 받음)
  const oSt = Battle.prototype.applyStatus; Battle.prototype.applyStatus = function (tgt, id, dur, src, o) {
    const d = STATUS_DEFS[id]; if (isD(tgt) && owBoost(tgt) && d && !d.positive && src !== tgt) { if (!tgt.daoImT || this.time - tgt.daoImT > 0.4) { tgt.daoImT = this.time; this.text(tgt.x, tgt.y - 58, '부스터 면역', CYAN, 9); } return null; }
    return oSt.call(this, tgt, id, dur, src, o);
  };
  // 벽 충돌 감지: 바깥 벽 반사(진행 방향이 꺾임), 건물·장애물 충돌
  const oBW = Battle.prototype.bounceWalls; Battle.prototype.bounceWalls = function (u) { const d0 = u.dir, r = oBW.call(this, u); if (isD(u) && !u.dead && Math.abs(wrapA(u.dir - d0)) > 0.3) wallHit(this, u); return r; };
  const oWI = Battle.prototype.wallImpact; Battle.prototype.wallImpact = function (u, nx, ny) { if (isD(u) && !u.dead) wallHit(this, u); return oWI.call(this, u, nx, ny); };

  // ---------- 1. 드리프트 ----------
  SKILLS.daoDrift = { desc: '상대를 중심으로 원을 그리며 미끄러지듯 1.2초 동안 감속(속도 ×1 → ×0.6)합니다. 지나간 자리에 타이어 스키드 마크(3초)가 남고 뒷바퀴에서 불꽃이 튑니다. 드리프트한 거리 1px마다 부스터 게이지 +0.16. 도중 벽·장애물에 부딪히면 이번 드리프트로 얻은 게이지의 절반을 잃고 끝납니다. 부스터 중에도 부스터는 유지됩니다.',
    canUse: (u, e, d) => e && !e.dead && d > 50 && d < 200 && !u.airborne,
    use(u, e0, b, s) { const C = { ...D.drift, ...s }, e = foeOf(b, u); if (!e) return; let t = 0, gained = 0;
      const r0 = clamp(dist(u, e), C.rMin, C.rMax), v0 = u.speed;
      const clear = sg => { let a = Math.atan2(u.y - e.y, u.x - e.x), tt = 0; for (; tt < C.dur; tt += 0.05) { a += sg * v0 * 0.05 / r0; const x = e.x + Math.cos(a) * r0, y = e.y + Math.sin(a) * r0, q = b.clampPos(x, y, u.pad, u); if (Math.abs(q.x - x) > 0.5 || Math.abs(q.y - y) > 0.5 || b.blockAt(x, y - 4, 9 + u.pad)) break; } return tt; };
      const c1 = clear(1), c2 = clear(-1), sgn = c1 === c2 ? (Math.random() < 0.5 ? 1 : -1) : c1 > c2 ? 1 : -1; // 벽에 늦게 닿는 방향으로 (미리 그려 봄)
      voice(b, u, '드리프트!', '#e8f4ff', 9);
      u.action = { type: 'daoDrift', wall: false, step(dt) {
        t += dt; const k = Math.min(1, t / C.dur), v = v0 * (1 - (1 - C.endMul) * k), cx = e.dead ? u.x : e.x, cy = e.dead ? u.y : e.y;
        const a = Math.atan2(u.y - cy, u.x - cx) + sgn * v * dt / r0, tx = cx + Math.cos(a) * r0, ty = cy + Math.sin(a) * r0;
        const dx = tx - u.x, dy = ty - u.y, dd = Math.hypot(dx, dy), mx = v * dt * 1.4, st = Math.min(dd, mx);
        const nx = u.x + (dd ? dx / dd * st : 0), ny = u.y + (dd ? dy / dd * st : 0), q = b.clampPos(nx, ny, u.pad, u);
        if (this.wall || Math.abs(q.x - nx) > 0.5 || Math.abs(q.y - ny) > 0.5 || b.blockAt(nx, ny - 4, 9 + u.pad)) { // 벽: 이번에 얻은 게이지 절반 잃음
          const lose = gained / 2; u.res.boost = Math.max(0, (u.res.boost || 0) - lose); b.text(u.x, u.y - 60, `쿵! 게이지 -${Math.round(lose)}`, '#ffb0a0', 9); b.dust(u.x, u.y); playSfx('wall');
          u.action = null; u.dir = fixAngle(Math.atan2(u.y - cy, u.x - cx) + rand(-0.4, 0.4)); b.stats.daoDriftWall = (b.stats.daoDriftWall || 0) + 1; return; }
        u.x = nx; u.y = ny; u.facing = dx >= 0 ? 1 : -1; u.walk += dt * 20;
        if (!u.daoBoost) { const g = st * C.k; gained += g; b.gainRes(u, 'boost', g); }
        { const mv = Math.atan2(dy, dx), px = -Math.sin(mv), py = Math.cos(mv), bx = u.x - Math.cos(mv) * 8, by = u.y - Math.sin(mv) * 8; // 뒷바퀴 두 개
          const L = b.daoSkids || (b.daoSkids = []); L.push({ x: bx + px * 7, y: by + py * 3, t0: b.time }, { x: bx - px * 7, y: by - py * 3, t0: b.time }); if (L.length > 360) L.splice(0, L.length - 360); // 스키드 마크
          if (Math.random() < dt * 40) b.parts.push({ x: bx + px * 7 * (Math.random() < 0.5 ? 1 : -1), y: by, vx: -Math.cos(mv) * rand(40, 110) + rand(-30, 30), vy: -Math.sin(mv) * rand(40, 110) - rand(20, 60), g: 260, life: rand(0.2, 0.4), max: 0.4, color: Math.random() < 0.5 ? '#ffe070' : FIRE, size: 2, glow: true }); } // 미끄러지며 튀는 불꽃
        if (t >= C.dur) { u.action = null; u.dir = Math.atan2(u.y - cy, u.x - cx) + sgn * Math.PI / 2; b.stats.daoDrift = (b.stats.daoDrift || 0) + 1; }
      } };
    } };

  const blast = (b, x, y, r) => { b.shock(x, y, 4, r * 1.6, '#ffcf8a', 0.35, 4); b.glow(x, y - 4, r * 1.3, '#ff9a4a', 0.35); b.sparks(x, y - 4, '#ffd8a0', 10, 200); b.smoke(x, y - 6, '#6a5048', 5); playSfx('boom'); }; // 작은 폭발 (건물 파괴·히트스톱 없음)
  // ---------- 2. 미사일 ----------
  function drawMissile(ctx, p) { const a = Math.atan2(p.vy, p.vx); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    ctx.fillStyle = '#e8e8ee'; ctx.fillRect(-6, -2, 9, 4); ctx.fillStyle = '#d83a3a'; ctx.fillRect(3, -2, 3, 4); ctx.fillStyle = '#5a5a66'; ctx.fillRect(-7, -3, 2, 6);
    ctx.fillStyle = Math.floor(p.life * 30) % 2 ? '#ffe070' : FIRE; ctx.fillRect(-10, -1, 3, 2); }
  const dirOf = u => u.v ? Math.atan2(u.v[1], u.v[0]) : u.action && u.action.type === 'daoDrift' ? u.dir : u.dir;
  SKILLS.daoMissile = { desc: '다오와 상대의 진행 방향 차이를 봅니다: 0.35rad(약 20°) 안이면 유도 미사일(무조건 명중), 1rad(약 57°) 안이면 상대 쪽 직선 발사, 그보다 어긋나면 불발. ATK×1.4 화염.',
    canUse: (u, e, d) => e && !e.dead && d > 80 && d < 340 && Math.abs(wrapA(dirOf(u) - dirOf(e))) < 1.3,
    use(u, e0, b, s) { const M = { ...D.missile, ...s }, e = foeOf(b, u), diff = Math.abs(wrapA(dirOf(u) - dirOf(e))), a = angTo(u, e);
      if (diff > M.ok) { voice(b, u, '어라? 불발…', '#c8c8d0', 9); b.puff(u.x + u.facing * 10, u.y - 16, '#c8c8c8'); b.stats.daoMisFail = (b.stats.daoMisFail || 0) + 1; return; }
      const sure = diff <= M.sure; voice(b, u, sure ? '미사일 조준 완료!' : '미사일 발사!', FIRE, 9);
      b.proj.push({ x: u.x + Math.cos(a) * 12, y: u.y - 16, vx: Math.cos(a) * M.spd, vy: Math.sin(a) * M.spd, spd: M.spd, src: u, tgt: sure ? e : null, homing: sure, noAirLock: !sure, dmg: u.st.atk * M.mult, kind: 'daoMissile', life: M.life, trail: 0, r: 10, draw: drawMissile,
        hit: { element: 'fire', delivery: 'ranged', color: '#ffc08a' }, onHit(o) { blast(b, o.x, o.y - 16, 14); } });
      playSfx('shot'); b.stats[sure ? 'daoMisSure' : 'daoMisLine'] = (b.stats[sure ? 'daoMisSure' : 'daoMisLine'] || 0) + 1; } };

  // ---------- 3. 지뢰 ----------
  SKILLS.daoMine = { desc: '1.6초 동안 지나간 길에 0.4초마다 지뢰를 하나씩(총 4개, 0.6초 뒤 작동, 12초) 떨어뜨립니다. 밟으면 ATK×1.0 화염 피해 + 위로 튕겨 오름(0.7초 공중). 다오 자신도 밟으면 피해를 입습니다.',
    canUse: (u, e, d, b) => e && !e.dead && b.time > 1.5 && !u.daoMineT,
    use(u, e0, b, s) { u.daoMineT = { n: (s.n || D.mine.n), next: 0 }; voice(b, u, '지뢰 설치!', '#ffd06a', 9); } };
  function mineBoom(b, M, o) {
    M.gone = true; blast(b, M.x, M.y - 6, 14); b.shake(1.5);
    b.damage(M.owner, o, M.owner.st.atk * D.mine.mult * (o === M.owner ? D.mine.selfK : 1), { element: 'fire', delivery: 'ranged', noCrit: true, color: '#ffb08a' });
    if (!o.dead && !o.air) { o.action = null; o.push = null; o.air = { t: 0, dur: D.mine.fly, h: D.mine.h }; }
    b.text(o.x, o.y - 70, '펑!', FIRE, 11); b.stats[o === M.owner ? 'daoMineSelf' : 'daoMineHit'] = (b.stats[o === M.owner ? 'daoMineSelf' : 'daoMineHit'] || 0) + 1;
  }

  // ---------- 4. 우주선 ----------
  SKILLS.daoUfo = { desc: '상대 머리 위에 우주선을 소환합니다(3.2초, 항상 상대 바로 위). 0.8초마다 광선(필중) — 상대는 ATK×0.25 피해 + 감속 0.8초(이동 ×0.6) + 모든 스킬 쿨타임 0.35초 증가.',
    canUse: (u, e, d, b) => e && !e.dead && !(b.daoUfos || []).some(F => F.owner === u),
    use(u, e0, b, s) { const e = foeOf(b, u); if (!e) return; (b.daoUfos || (b.daoUfos = [])).push({ owner: u, tgt: e, x: e.x, y: e.y, t: 0, tick: 0.4, beam: 0, gone: false });
      voice(b, u, '우주선 소환!', '#c8a0ff', 9); b.text(e.x, e.y - 90, '우주선!', '#c8a0ff', 10); b.stats.daoUfo = (b.stats.daoUfo || 0) + 1; } };
  function ufoStep(b, F, dt) {
    const T = F.tgt, O = D.ufo; F.t += dt; F.beam = Math.max(0, F.beam - dt);
    if (F.t >= O.dur || !T || T.dead || F.owner.dead) { F.gone = true; return; }
    F.x = T.x; F.y = T.y; // 필중: 항상 상대 바로 위
    F.tick -= dt; if (F.tick > 0) return; F.tick = O.every; F.beam = 0.25;
    if (T.hidden) return;
    b.damage(F.owner, T, F.owner.st.atk * O.mult, { element: 'light', delivery: 'ranged', noCrit: true, color: '#e8d8ff' });
    if (T.dead) return; b.applyStatus(T, 'daoSlow', O.slow, F.owner);
    T.skills.forEach((sk, i) => { if (!sk.hidden && T.skillT[i] < 1e8) T.skillT[i] += O.cdAdd; });
    b.text(T.x + 8, T.y - 60, '쿨타임 +', '#c8a0ff', 8); b.stats.daoUfoHit = (b.stats.daoUfoHit || 0) + 1;
  }

  // ---------- 5. 물파리 ----------
  function drawBubbleShot_unused(ctx, p) { ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.globalAlpha = 0.5; ctx.fillStyle = '#8ad8ff'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#e0f6ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.fillRect(-3, -4, 2, 2); }
  SKILLS.daoBubble = { desc: '상대를 끝까지 따라가는 물방울(필중, 장애물·반사 무시, ATK×0.5)을 날립니다. 맞은 상대는 산소 게이지가 1 줄고(오리 방수 패시브는 면역) 물방울에 갇힙니다(이동·행동 불가). 갇히는 시간 = 0.5초 + 1.3초×(줄어든 산소 비율) — 남은 산소가 적을수록 오래 갇힘.',
    canUse: (u, e, d) => e && !e.dead && d > 60 && d < 300,
    use(u, e0, b, s) { const B = { ...D.bubble, ...s }, e = foeOf(b, u); if (!e) return;
      voice(b, u, '물파리!', '#8ad8ff', 10);
      (b.daoShots || (b.daoShots = [])).push({ x: u.x + u.facing * 12, y: u.y - 18, tgt: e, src: u, opt: B, t: 0, gone: false });
      playSfx('shot'); } };

  function bubbleHit(b, u, o, B) {
    b.damage(u, o, u.st.atk * B.mult, { element: 'ice', delivery: 'ranged', color: '#c8f0ff' }); if (o.dead) return;
    const wp = o.def.traits && o.def.traits.includes('waterproof'), max = o.o2Max || 3, cur = o.o2 ?? max, nv = wp ? cur : Math.max(0, cur - B.o2);
    if (!wp) { o.o2 = nv; o.o2T = Math.min(o.o2T || 0, 0.2); }
    const dur = B.base + B.extra * (1 - nv / max); b.applyStatus(o, 'daoBubble', dur, u, { noResistScale: true });
    b.splash ? b.splash(o.x, o.y, '#cfeeff') : b.burst(o.x, o.y - 16, '#cfeeff', 8); b.text(o.x, o.y - 76, `갇힘! ${dur.toFixed(1)}초`, '#8ad8ff', 9); b.stats.daoBubbleHit = (b.stats.daoBubbleHit || 0) + 1;
  }
  // ---------- 스테이지 훅: 게이지·부스터, 지뢰, 우주선 ----------
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.over) return;
      for (const u of b.u) { if (!isD(u)) continue;
        const px = u.daoPx ?? u.x, py = u.daoPy ?? u.y, mv = Math.hypot(u.x - px, u.y - py); u.daoPx = u.x; u.daoPy = u.y;
        if (u.dead || held(b)) continue;
        const drifting = u.action && u.action.type === 'daoDrift';
        if (mv < 40 && !drifting) { if (u.daoBoost) { u.daoBoost.left -= mv; u.boost = Math.max(u.boost, 0.35); if (u.daoBoost.left <= 0) boostOff(b, u, '부스터 끝'); } else if (!u.airborne) b.gainRes(u, 'boost', mv * D.boost.runK); }
        if (!u.daoBoost && (u.res.boost || 0) >= 100) boostOn(b, u);
        // 지뢰 떨어뜨리기
        const MT = u.daoMineT; if (MT) { MT.next -= dt; if (MT.next <= 0) { MT.next = D.mine.every; MT.n--;
          (b.daoMines || (b.daoMines = [])).push({ x: u.x - Math.cos(u.dir) * 18, y: u.y - Math.sin(u.dir) * 18, owner: u, t0: b.time, gone: false });
          if (MT.n <= 0) u.daoMineT = null; } }
      }
      if (b.daoMines && b.daoMines.length && !held(b)) { for (const M of b.daoMines) { const age = b.time - M.t0; if (age > D.mine.life || !b.u.includes(M.owner)) { M.gone = true; continue; } if (age < D.mine.arm) continue;
          for (const o of b.u) { if (o.dead || o.hidden || o.airborne || (o.summon && o.team === M.owner.team && o !== M.owner) || (o === M.owner && age < D.mine.ownArm) || Math.hypot(o.x - M.x, o.y - M.y) > D.mine.r + 8 + o.pad) continue; mineBoom(b, M, o); break; } }
        b.daoMines = b.daoMines.filter(M => !M.gone); }
      if (b.daoShots && b.daoShots.length) { if (!held(b)) for (const S of b.daoShots) { const T = S.tgt; S.t += dt;
          if (!T || T.dead || !b.u.includes(T) || S.src.dead) { S.gone = true; continue; } if (T.hidden) continue; // 숨은 상대는 나올 때까지 그 자리에서 기다림
          const tx = T.x, ty = T.y - 18 - b.airZ(T), dx = tx - S.x, dy = ty - S.y, d = Math.hypot(dx, dy), st = S.opt.spd * dt;
          if (d <= st + 10) { S.gone = true; bubbleHit(b, S.src, T, S.opt); } else { S.x += dx / d * st; S.y += dy / d * st; } }
        b.daoShots = b.daoShots.filter(S => !S.gone); }
      if (b.daoSkids && b.daoSkids.length && b.time - b.daoSkids[0].t0 > 3) b.daoSkids = b.daoSkids.filter(k => b.time - k.t0 <= 3);
      if (b.daoUfos && b.daoUfos.length) { if (!held(b)) for (const F of b.daoUfos) ufoStep(b, F, dt); b.daoUfos = b.daoUfos.filter(F => !F.gone); }
    },
    drawUnder(ctx, b) { // 스키드 마크 · 부스터 오라(뒤쪽 빛) · 지뢰
      if (b.daoSkids) for (const k of b.daoSkids) { const a = 1 - (b.time - k.t0) / 3; if (a <= 0) continue; ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#26262c'; ctx.fillRect(Math.round(k.x) - 1, Math.round(k.y) - 1, 3, 2); }
      ctx.globalAlpha = 1;
      for (const u of b.u) { if (!isD(u) || u.dead || u.hidden || !u.daoBoost) continue; const z = b.airZ(u), p = 0.5 + 0.5 * Math.sin(b.time * 16);
        ctx.save(); ctx.globalAlpha = 0.28 + 0.12 * p; ctx.fillStyle = CYAN; ctx.beginPath(); ctx.ellipse(u.x, u.y - 16 - z, 26 + 3 * p, 30 + 3 * p, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#e0f8ff'; ctx.beginPath(); ctx.ellipse(u.x, u.y - 14 - z, 17, 21, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.6; ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(u.x, u.y + 1, 18 + 4 * p, 6 + 1.5 * p, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
      if (!b.daoMines) return;
      for (const M of b.daoMines) { const armed = b.time - M.t0 >= D.mine.arm, blink = armed && Math.floor(b.time * 6) % 2;
        ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.ellipse(Math.round(M.x), Math.round(M.y), 6, 3.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a5a66'; ctx.fillRect(Math.round(M.x) - 3, Math.round(M.y) - 3, 6, 2); ctx.fillStyle = blink ? '#ff3a2a' : armed ? '#a02020' : '#606060'; ctx.fillRect(Math.round(M.x) - 1, Math.round(M.y) - 4, 2, 2); }
    },
    drawOver(ctx, b) {
      if (b.daoShots) for (const S of b.daoShots) { ctx.save(); ctx.translate(Math.round(S.x), Math.round(S.y)); const r = 7 + Math.sin(b.time * 18) * 0.8;
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#8ad8ff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = '#e0f6ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-3, -4, 2, 2); ctx.fillStyle = '#2a2a30'; ctx.fillRect(-1, -1, 3, 2); ctx.restore(); } // 물방울 속 물파리
      if (b.daoUfos) for (const F of b.daoUfos) { const x = Math.round(F.x), y = Math.round(F.y - 74 + Math.sin(b.time * 4) * 2);
        if (F.beam > 0) { ctx.save(); ctx.globalAlpha = 0.35 * F.beam / 0.25 + 0.1; ctx.fillStyle = '#e8d8ff'; ctx.beginPath(); ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 4, y + 4); ctx.lineTo(x + 16, Math.round(F.y)); ctx.lineTo(x - 16, Math.round(F.y)); ctx.closePath(); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = '#9aa2b2'; ctx.beginPath(); ctx.ellipse(x, y, 13, 4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#c8d0dc'; ctx.beginPath(); ctx.ellipse(x, y - 1, 11, 2.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#8ad8ff'; ctx.beginPath(); ctx.ellipse(x, y - 4, 5, 4, 0, Math.PI, 0); ctx.fill();
        for (let i = -2; i <= 2; i++) { ctx.fillStyle = Math.floor(b.time * 6 + i) % 2 ? '#ffe070' : '#ff6a8a'; ctx.fillRect(x + i * 5 - 1, y, 2, 1); } }
      for (const u of b.u) { if (u.dead || u.hidden) continue; const z = b.airZ(u);
        if (u.status('daoBubble')) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#8ad8ff'; ctx.beginPath(); ctx.arc(u.x, u.y - 18 - z, 22 + u.pad, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.8; ctx.strokeStyle = '#e0f6ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(u.x, u.y - 18 - z, 22 + u.pad, 0, TAU); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(u.x - 10), Math.round(u.y - 32 - z), 3, 3); ctx.restore(); }
        if (isD(u) && u.daoBoost) for (let i = 0; i < 8; i++) { // 부스터 오라: 위로 솟는 푸른 불꽃 혀
          const ph = (b.time * 2.4 + i / 8) % 1, ax = Math.sin(i * 2.4 + b.time * 3) * (14 + u.pad), h = 10 + 26 * ph;
          ctx.globalAlpha = 0.75 * (1 - ph); ctx.fillStyle = i % 2 ? CYAN : '#e0f8ff'; ctx.fillRect(Math.round(u.x + ax) - 1, Math.round(u.y - 8 - z - h), 2, Math.round(6 - 4 * ph) + 2); }
        ctx.globalAlpha = 1;
        if (isD(u) && u.daoBoost) { const f = u.facing, k = Math.floor(b.time * 20) % 2; // 배기구 불꽃
          ctx.fillStyle = k ? '#ffe070' : CYAN; ctx.fillRect(Math.round(u.x - f * 18) - 3, Math.round(u.y - 6 - z), 6, 3); ctx.fillStyle = k ? CYAN : '#ffffff'; ctx.fillRect(Math.round(u.x - f * 22) - 2, Math.round(u.y - 5 - z), 4, 2); }
      }
    },
  });

  CHARACTERS.push({
    id: ID, name: '다오', fullName: '다오', gender: 'male', color: '#2a64d2',
    stats: { hp: 820, atk: 31, spd: 300, range: 50, atkRate: 1.0, def: 14, crit: 0.06, critMult: 1.8 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { blunt: 0.9, elec: 1.15 },
    resources: { boost: { name: '부스터', max: 100, display: 'bar', color: CYAN } },
    skills: [
      { id: 'daoBubble', name: '물파리', cd: 15 },
      { id: 'daoMissile', name: '미사일', cd: 6 },
      { id: 'daoUfo', name: '우주선', cd: 17 },
      { id: 'daoMine', name: '지뢰', cd: 9 },
      { id: 'daoDrift', name: '드리프트', cd: 5 },
    ],
    passiveDesc: '부스터: 달리면(1px당 0.03) 게이지 상승, 드리프트하면 크게 상승. 가득 차면 부스터 — 속도 ×1.6·가속, 해로운 상태이상 면역(피해는 받음). 900px를 달리거나 벽·장애물에 부딪히면 해제.',
    sprite: { src: 'assets/dao/front.png', back: 'assets/dao/back.png', scale: 2, foot: 1 }, // 카트를 탄 24x21 도트 (tools/gen_dao_sprites.py)
    portrait: 'assets/dao/portrait.png',
    lines: {
      skill: {}, // 스킬 대사는 스킬 코드에서 직접
      event: {
        battleStart: ['레디… 고!', '1등은 내 거야!'],
        lowHp: ['카트가 덜컹거려…!'], stunned: ['으앗, 핸들이…!'],
        win: ['1등이다!', '체커기 받았다~!'], lose: ['리타이어…'],
      },
    },
  });
})();
