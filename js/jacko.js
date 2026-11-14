/**
 * 잭오랜턴 — 트릭키한 근접 캐릭터 (평타 = 띄워베기)
 *  평타 띄워베기 : 짧은 근접 베기. 맞은 상대는 잠깐 '공중에 뜸' (그림·위치 연출만: 이동·공격·스킬은 그대로 가능, 기절/제압 아님)
 *                  잭오랜턴은 떠 있는 상대와 몸이 부딪히지 않고 지나감. 베기 거리 안이면 같이 점프해 공중에서 한 번 더 벰,
 *                  멀면 땅에 남아 잠깐(0.6초) 다른 스킬로 바로 이어갈 수 있음
 *  1. 스텝        : 50% 상대 쪽 / 50% 무작위 방향으로 160px 를 0.45초 동안 한 바퀴 돌며 이동 (팽이 스테이지 회전과 같은 그림 순환)
 *                   스텝 중 모든 공격 회피·상대 관통, 벽·장애물(펌킨 타워 포함)은 못 지나감. 스텝 중 한 번 더 스텝(방향 다시 뽑음, 최대 2번)
 *                   쿨타임은 마지막 스텝이 끝난 뒤부터(3초). 끝나면 0.5초 동안 띄워베기·다른 스킬로 바로 이어감
 *  2. 펌킨 타워   : 하나만 유지(새로 놓으면 이전 것 제거), 0.7초 동안 한 바퀴만 빠르게 돌고 사라짐. 시계/반시계(반반) 방향으로 돌며 한 바퀴(0.7초)에 불꽃 12발을 포물선으로 던짐
 *                   (타워를 밀어도 타워 기준으로 발사). 떨어진 불꽃은 1.2초 동안 바닥에서 탐(타워가 사라진 뒤에도 남음). 누구든 닿으면 타워를 밀며 그대로 이동,
 *                   더 밀 곳이 없으면 튕겨남. 부서지지 않음
 *  3. 호박 머리   : 3.5초 동안 공중에 뜬 호박 머리로 변신. 이동 방향의 양옆으로 불꽃을 쏘며 이동. 변신 중 다른 스킬·평타 불가.
 *                   시간이 다 되거나 피해를 조금이라도 받으면 해제. 공중 판정은 기존 공중 규칙(트램펄린 점프와 같음: 지상 충돌·지형·바닥 함정 무시,
 *                   원거리는 필중) 그대로, 단 근접 공격도 맞음(빗나가지 않음)
 *  4. 호박 불꽃   : 바라보는 쪽 앞의 고정된 5곳으로 포물선 불꽃 5발 (조준 없음). 직격 = 그대로 피해, 땅·벽에 닿으면 2개로 갈라져 튀고 피해 절반,
 *                   3번 갈라지면 사라짐
 *  5. 요술 램프   : 지금 자리에 램프를 놓고 2초 뒤 램프 쪽으로 빠르게 끌려감(가속, 순간이동 아님). 끌려가다 상대와 부딪히면 그 속도로 밀쳐내고,
 *                   밀린 상대가 벽에 부딪히면 그 속도에 비례한 피해. 잭오랜턴 자신은 벽에 닿으면 거기서 멈춤(피해 없음)
 *  난수는 전부 Math.random (전투 중 시드 난수). 그리기 코드는 난수·전투 값을 쓰지 않음 (u.jkLiftZ·u.jkSpin 은 시뮬레이션이 매 프레임 계산해 둔 그림용 값)
 *  그림: 사용자 제공 앞·뒷모습(assets/jackO/잭오랜턴.png)을 tools/gen_jacko_sprites.py 로 잘라 씀. 호박 머리는 원본 팔레트로 새로 그린 도트(head.png)
 *  효과음: 사용자 제공 소리 없음 → 전용 소리 없음
 */
(() => {
  const TAU = Math.PI * 2, ID = 'jackO', COL = '#a8283a', FIRE = '#ffa040';
  const D = {
    step: { len: 160, dur: 0.45, recastP: 0.5, recastAt: [0.4, 0.8], cancel: 0.5, near: 300 },
    lift: { dur: 0.8, h: 28 },
    air: { near: 8, cd: 1.6, dur: 0.46, hitAt: 0.24, mult: 0.75, h: 24, spd: 260 },
    gcancel: 0.6,
    tower: { dur: 0.7, rev: 0.7, n: 12, r: 18, throwR: 100, fly: 0.42, fh: 26, fade: 0.1, mult: 0.45, hitR: 16, fire: { life: 1.2, r: 16, tick: 0.3, mult: 0.15 } },
    head: { dur: 3.5, gap: 0.18, spd: 330, life: 0.4, mult: 0.4, h: 16 },
    flame: { gap: 0.06, ang: [-0.5, -0.25, 0, 0.25, 0.5], dist: [78, 100, 120, 100, 78], dur: 0.62, h: 54, mult: 1.0, splits: 3, hitR: 13 },
    lamp: { delay: 2, accel: 2600, vmax: 760, v0: 120, maxT: 1.4, kbDur: 0.4, wallK: 1 / 380, touchR: 22, wait: 1.5 },
  };
  const isJack = u => !!(u && u.def && u.def.id === ID);
  const J_ = u => u.jko || (u.jko = { head: null, cancelT: 0, airCd: 0, chain: 0 }); // 사용자별 상태 (슈르프·패스트푸드 빌린 스킬도 동작)
  const B_ = b => b.jko || (b.jko = { towers: [], tfl: [], fires: [], bombs: [], lamps: [] });
  const angTo = (a, c) => Math.atan2(c.y - a.y, c.x - a.x);
  const foes = (b, u) => b.u.filter(o => o.team !== u.team && !o.dead && !o.hidden && !o.aoHid);
  const foeOf = (b, u) => { const L = foes(b, u).filter(o => !o.summon && !o.def.noDraw); const M = L.length ? L : foes(b, u); if (!M.length) return null; let m = M[0]; for (const o of M) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const slotIdx = (u, id) => u.skills.findIndex(s => s.id === id);
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  // 야구장 투구 대기 등 캐릭터가 멈춰 있는 동안 (baseball.js 의 updateUnit 래퍼와 같은 조건)
  const held = b => { const S = b.bsb; return !!(S && S.on && !S.halt && S.phase !== 'live' && !b.over && !b.freeze); };
  const stepping = u => !!(u && u.action && u.action.type === 'jkStep');
  const pulling = u => !!(u && u.action && u.action.type === 'jkPull');
  const airSlashing = u => !!(u && u.action && u.action.type === 'jkAir');
  const free = (b, u, x, y) => { const q = b.clampPos(x, y, u.pad, u); return Math.abs(q.x - x) < 0.3 && Math.abs(q.y - y) < 0.3 && !b.blockAt(x, y - 4, 9 + u.pad) && !towerAt(b, x, y, 11 + u.pad); };
  const setCd = (b, u, id) => { const i = slotIdx(u, id); if (i < 0) return; let c = u.skills[i].cd; if (b.modeB && B_MODE.skillCd && u.st.range < MELEE_RANGE) c *= bMeleeCdK(u); u.skillT[i] = c; };

  // ---------- 공중에 뜸 (띄워베기) : 그림 높이만 ----------
  function lift(b, tgt, src, dur, h) {
    if (!tgt || tgt.dead || tgt.airborne || tgt.hidden || tgt.aoHid || tgt.climb || tgt.inTrain) return false;
    const L = tgt.jkLift;
    if (L && L.t < L.dur) { L.t = Math.min(L.t, L.dur * 0.35); L.dur = Math.max(L.dur, dur); L.src = src; return true; } // 공중 콤보: 다시 띄움
    tgt.jkLift = { t: 0, dur, h, src };
    return true;
  }
  // 몸 충돌 없음: 스텝·램프 끌림 중 / 잭오랜턴이 띄운 상대 ↔ 띄운 잭오랜턴 / 같이 점프 중
  const lifted = u => !!(u.jkLift && u.jkLift.t < u.jkLift.dur);
  const oCollide = Battle.prototype.collide;
  Battle.prototype.collide = function (a, c) {
    if (a.jko || c.jko || a.jkLift || c.jkLift) {
      if (stepping(a) || stepping(c) || pulling(a) || pulling(c) || airSlashing(a) || airSlashing(c)) return;
      if ((lifted(a) && a.jkLift.src === c) || (lifted(c) && c.jkLift.src === a)) return;
    }
    return oCollide.call(this, a, c);
  };
  // 호박 머리(공중): 근접 공격도 맞음 (기존 공중 규칙은 근접 항상 빗나감)
  const oHC = Battle.prototype.hitCheck;
  Battle.prototype.hitCheck = function (src, tgt, o) {
    if (tgt && tgt.jko && tgt.jko.head && tgt.air && tgt.air.jkHead && o && o.delivery === 'melee' && !o.dot && !o.reflected) return { hit: true };
    return oHC.call(this, src, tgt, o);
  };
  // 호박 머리 중 스킬 사용 불가
  const oBlocked = Unit.prototype.blocked;
  Unit.prototype.blocked = function (k) { if (k === 'blocksSkill' && this.jko && this.jko.head) return true; return oBlocked.call(this, k); };

  // ---------- 펌킨 타워 ----------
  function towerAt(b, x, y, pad) { const L = b.jko && b.jko.towers; if (!L || !L.length) return null; for (const T of L) if (Math.hypot(T.x - x, (T.y - y)) < T.r + pad) return T; return null; }
  function towerFits(b, T, x, y) {
    const q = b.clampPos(x, y, T.r - 2); if (Math.abs(q.x - x) > 0.3 || Math.abs(q.y - y) > 0.3) return false;
    if (b.blockAt(x, y - 4, T.r - 2)) return false;
    for (const o of b.jko.towers) if (o !== T && Math.hypot(o.x - x, o.y - y) < o.r + T.r) return false;
    return true;
  }
  function removeTower(b, T) { T.gone = true; b.smoke(T.x, T.y - 12, '#6a3a2a', 6); b.burst(T.x, T.y - 14, FIRE, 6); }
  function towerPush(b) { // 누구든 닿으면 타워를 밀며 이동, 못 밀면 튕김
    const L = b.jko.towers;
    for (const u of b.u) {
      if (u.dead || u.airborne || u.hidden || u.aoHid) continue;
      for (const T of L) {
        if (T.gone) continue;
        let dx = T.x - u.x, dy = T.y - u.y, d = Math.hypot(dx, dy); const R = T.r + 11 + u.pad;
        if (d >= R) continue;
        if (d < 0.01) { dx = Math.cos(u.dir); dy = Math.sin(u.dir); d = 1; }
        const nx = dx / d, ny = dy / d, pen = R - d + 0.05;
        if (towerFits(b, T, T.x + nx * pen, T.y + ny * pen)) { T.x += nx * pen; T.y += ny * pen; T.pushT = 0.12; continue; }
        u.x -= nx * pen; u.y -= ny * pen; const q = b.clampPos(u.x, u.y, u.pad, u); u.x = q.x; u.y = q.y;
        let vx = Math.cos(u.dir), vy = Math.sin(u.dir); const dot = vx * nx + vy * ny;
        if (dot > 0) { vx -= 2 * dot * nx; vy -= 2 * dot * ny; u.dir = fixAngle(Math.atan2(vy, vx) + rand(-0.25, 0.25)); if (u.v) u.v = [Math.cos(u.dir) * (u.speed || 0), Math.sin(u.dir) * (u.speed || 0)];
          if (b.time - (u.jkTowT || -1) > 0.15) { u.jkTowT = b.time; b.ring(u.x + nx * 11, u.y - 4, 2, 10, 0.2, '#ffd0a0'); playSfx('wall'); } }
      }
    }
  }
  function towerStep(b, dt) {
    const S = b.jko;
    for (const T of S.towers) {
      if (T.gone) continue;
      T.t += dt; T.pushT = Math.max(0, (T.pushT || 0) - dt);
      if (T.t >= T.dur || !T.owner || T.owner.dead) { removeTower(b, T); continue; }
      // 솟아오름/사라짐 페이드는 그리기만(0.1초). 수명=한 바퀴라 처음부터 회전·발사를 해야 정확히 한 바퀴 돌고 사라짐
      T.ang += T.sgn * TAU / D.tower.rev * dt; T.fireT -= dt;
      if (T.fireT <= 0) {
        T.fireT += D.tower.rev / D.tower.n;
        const tx = T.x + Math.cos(T.ang) * D.tower.throwR, ty = T.y + Math.sin(T.ang) * D.tower.throwR * 0.8;
        S.tfl.push({ owner: T.owner, sx: T.x + Math.cos(T.ang) * 12, sy: T.y + Math.sin(T.ang) * 8, tx, ty, t: 0, dur: D.tower.fly, h: D.tower.fh, dmg: T.owner.st.atk * T.mult });
        T.flash = 0.1;
      }
      T.flash = Math.max(0, (T.flash || 0) - dt);
    }
    if (S.towers.some(T => T.gone)) S.towers = S.towers.filter(T => !T.gone);
    for (const F of S.tfl) { // 타워 불꽃: 포물선 → 착지(직격 판정) → 바닥 불
      F.t += dt; if (F.t < F.dur) continue; F.done = true;
      const q = b.clampPos(F.tx, F.ty, 2); if (b.blockAt(q.x, q.y - 4, 0)) { b.burst(q.x, q.y - 4, FIRE, 3); continue; }
      const u = F.owner; if (!u || b.over) continue;
      for (const o of foes(b, u)) { if (o.airborne || Math.hypot(o.x - q.x, (o.y - q.y) / 0.8) > D.tower.hitR + o.pad) continue; b.damage(u, o, F.dmg, { element: 'fire', delivery: 'ranged', color: '#ffb060' }); }
      S.fires.push({ owner: u, x: q.x, y: q.y, t: 0, life: D.tower.fire.life, tickT: D.tower.fire.tick, r: D.tower.fire.r });
      b.burst(q.x, q.y - 3, FIRE, 4);
    }
    if (S.tfl.some(F => F.done)) S.tfl = S.tfl.filter(F => !F.done);
    for (const P of S.fires) {
      P.t += dt; if (P.t >= P.life) { P.done = true; continue; }
      P.tickT -= dt; if (P.tickT > 0) continue; P.tickT += D.tower.fire.tick;
      const u = P.owner; if (!u || b.over) continue;
      for (const o of foes(b, u)) { if (o.airborne || Math.hypot(o.x - P.x, (o.y - P.y) / 0.7) > P.r + o.pad) continue; b.damage(u, o, u.st.atk * D.tower.fire.mult, { dot: true, element: 'fire', color: '#ffb060' }); }
    }
    if (S.fires.some(P => P.done)) S.fires = S.fires.filter(P => !P.done);
  }

  // ---------- 호박 불꽃 (분열 폭탄) ----------
  function bomb(b, u, sx, sy, tx, ty, gen, dmg, dur, h) {
    const P = { owner: u, sx, sy, tx, ty, t: 0, dur, h, gen, dmg, lx: sx, ly: sy, spin: gen };
    B_(b).bombs.push(P); return P;
  }
  function splitBomb(b, P, x, y, base) {
    if (P.gen >= D.flame.splits) { b.burst(x, y - 3, FIRE, 4); b.glow(x, y - 4, 10, FIRE, 0.2); return; } // 3번 갈라진 조각은 사라짐
    const g = P.gen + 1, k = Math.pow(0.82, g);
    for (const s of [-1, 1]) {
      const a = base + s * rand(0.45, 1.0), L = rand(28, 44) * k;
      bomb(b, P.owner, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.8, g, P.dmg / 2, 0.36 * Math.pow(0.9, g), 30 * k);
    }
    b.burst(x, y - 3, FIRE, 3); b.ring(x, y, 2, 9, 0.18, '#ffc070');
  }
  function bombStep(b, dt) {
    const S = b.jko;
    for (const P of S.bombs.slice()) {
      if (P.done) continue;
      P.t += dt; const k = Math.min(1, P.t / P.dur), x = P.sx + (P.tx - P.sx) * k, y = P.sy + (P.ty - P.sy) * k, z = 4 * P.h * k * (1 - k);
      const u = P.owner; if (!u || b.over) { P.done = true; continue; }
      const dir = Math.atan2(P.ty - P.sy, P.tx - P.sx);
      // 벽·장애물: 그 자리에서 갈라져 반대쪽으로 튐
      const q = b.clampPos(x, y, 2), bl = b.blockAt(x, y - 4, 1);
      if (bl || Math.abs(q.x - x) > 0.3 || Math.abs(q.y - y) > 0.3) {
        P.done = true; let c = Math.cos(dir), s = Math.sin(dir);
        if (bl) { c = -c; s = -s; } else { if (Math.abs(q.x - x) > 0.3) c = -c; if (Math.abs(q.y - y) > 0.3) s = -s; }
        splitBomb(b, P, P.lx, P.ly, Math.atan2(s, c)); continue;
      }
      P.lx = x; P.ly = y;
      if (k > 0.5 || k >= 1) { // 내려오는 중: 직격
        const hit = foes(b, u).find(o => !o.airborne && z < 30 && Math.hypot(o.x - x, (o.y - y) / 0.8) < D.flame.hitR + o.pad);
        if (hit) { P.done = true; b.damage(u, hit, P.dmg, { element: 'fire', delivery: 'ranged', color: '#ffb060', jkBomb: true }); b.burst(x, y - 10, FIRE, 5); b.stats.jkBombHit = (b.stats.jkBombHit || 0) + 1; continue; }
      }
      if (k >= 1) { P.done = true; splitBomb(b, P, x, y, dir); }
    }
    if (S.bombs.some(P => P.done)) S.bombs = S.bombs.filter(P => !P.done);
  }

  // ---------- 요술 램프 ----------
  function lampStep(b, dt) {
    const S = b.jko;
    for (const L of S.lamps) {
      const u = L.owner; if (L.done) continue;
      if (!u || u.dead || b.over) { L.done = true; continue; }
      if (L.state !== 'wait') { if (!pulling(u) || u.action.lamp !== L) L.done = true; continue; }
      L.t += dt; if (L.t < L.delay) continue;
      if (u.blocked('blocksAct') || u.blocked('blocksMove') || u.climb || u.inTrain || u.status('pin') || u.air || u.hidden || u.aoHid || (u.action && u.action.pin)) { if (L.t > L.delay + D.lamp.wait) L.done = true; continue; }
      startPull(b, u, L);
    }
    if (S.lamps.some(L => L.done)) S.lamps = S.lamps.filter(L => !L.done);
  }
  function startPull(b, u, L) {
    L.state = 'pull'; if (u.action && u.action.pin && u.action.tgt) b.releasePin(u.action.tgt);
    u.push = null; u.pull = null; u.jkSpin = null;
    let v = D.lamp.v0, t = 0; const hitSet = new Set();
    b.text(u.x, u.y - 62, '요술 램프!', '#ffe0a0', 10); b.glow(L.x, L.y - 14, 26, '#ffd070', 0.4);
    u.action = { type: 'jkPull', lamp: L, trail: '#ffd890', step(dt) {
      t += dt; v = Math.min(D.lamp.vmax, v + D.lamp.accel * dt); u.jkV = v;
      const dx = L.x - u.x, dy = L.y - u.y, dd = Math.hypot(dx, dy), st = Math.min(dd, v * dt), a = Math.atan2(dy, dx);
      const nx = u.x + (dd > 0.01 ? dx / dd * st : 0), ny = u.y + (dd > 0.01 ? dy / dd * st : 0);
      if (!free(b, u, nx, ny)) { end(true); return; } // 벽·장애물: 그 자리에서 멈춤 (잭오랜턴은 피해 없음)
      u.x = nx; u.y = ny; u.facing = Math.cos(a) >= 0 ? 1 : -1;
      if ((u.jkAfT = (u.jkAfT || 0) - dt) <= 0) { u.jkAfT = 0.035; b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.2, a: 0.35 }); }
      for (const o of foes(b, u)) { // 끌려가다 부딪힌 상대: 지금 속도로 밀쳐냄 → 벽에 부딪히면 속도 비례 피해
        if (hitSet.has(o) || o.airborne || o.climb || o.inTrain || dist(u, o) > D.lamp.touchR + o.pad + u.pad) continue;
        hitSet.add(o); knock(b, u, o, a, v);
      }
      if (dd <= st + 0.5 || t >= D.lamp.maxT) end(false);
    } };
    function end(wall) {
      if (u.action && u.action.lamp === L) u.action = null; L.done = true; u.jkV = 0;
      if (wall) { b.dust(u.x, u.y); b.ring(u.x, u.y - 6, 2, 14, 0.25, '#f0e8d8'); playSfx('wall'); }
      u.dir = fixAngle(Math.atan2(L.y - L.sy, L.x - L.sx) + Math.PI + rand(-0.4, 0.4));
      b.glow(L.x, L.y - 12, 20, '#ffd070', 0.3); b.burst(L.x, L.y - 10, '#ffe0a0', 5);
    }
    L.sx = u.x; L.sy = u.y;
    b.stats.jkLamp = (b.stats.jkLamp || 0) + 1;
  }
  function knock(b, u, o, a, v) {
    const ang = Math.atan2(o.y - u.y, o.x - u.x), dirA = Math.atan2(Math.sin(a) * 0.7 + Math.sin(ang) * 0.3, Math.cos(a) * 0.7 + Math.cos(ang) * 0.3);
    b.knockback(o, dirA, v, D.lamp.kbDur, () => {
      const P = o.jkKb; if (!P) return; const sp = P.spd * (0.35 + 0.65 * Math.max(0, P.t) / P.dur);
      o.jkKb = null; if (u.dead || o.dead || b.over) return;
      b.damage(u, o, u.st.atk * sp * D.lamp.wallK, { element: 'blunt', delivery: 'melee', big: sp > 520, color: '#ffd090', jkLamp: true });
      b.shake(sp > 520 ? 2.5 : 1.5); b.text(o.x, o.y - 70, '쾅!', '#ffd090', 11); b.stats.jkLampWall = (b.stats.jkLampWall || 0) + 1;
    });
    o.jkKb = o.push || null;
    b.ring(o.x, o.y - 14, 4, 22, 0.25, '#ffe0a0'); b.burst(o.x, o.y - 16, '#ffe0a0', 6); playSfx('bumpHard');
    b.stats.jkLampKnock = (b.stats.jkLampKnock || 0) + 1;
  }

  // ---------- 호박 머리 ----------
  function headStart(b, u, s) {
    const J = J_(u), dur = s.dur || D.head.dur;
    const A = { t: 0, dur: dur + 5, h: D.head.h, ride: true, noLand: true, jkHead: true };
    if (u.action && u.action.pin && u.action.tgt) b.releasePin(u.action.tgt);
    u.action = null; u.air = A; u.jkLift = null;
    J.head = { t: 0, dur, fireT: 0.15, hp: u.hp, air: A, mult: s.mult || D.head.mult };
    b.smoke(u.x, u.y - 18, '#5a2a2a', 8); b.glow(u.x, u.y - 22, 30, FIRE, 0.4); b.text(u.x, u.y - 66, '호박 머리!', FIRE, 11);
    b.stats.jkHead = (b.stats.jkHead || 0) + 1;
  }
  function headEnd(b, u, why) {
    const J = u.jko, H = J && J.head; if (!H) return; J.head = null;
    if (u.air === H.air) H.air.dur = Math.min(H.air.dur, H.air.t + 0.15); // 부드럽게 내려옴 (착지 충격 없음)
    if (!u.dead) { b.smoke(u.x, u.y - 18, '#5a2a2a', 6); if (why) b.text(u.x, u.y - 64, why, '#ffc8a0', 9); }
    u.atkT = Math.max(u.atkT, 0.25);
  }
  function headStep(b, u, dt) {
    const J = u.jko, H = J.head;
    if (u.dead || u.air !== H.air || b.over) { headEnd(b, u); return; }
    if (u.hp < H.hp - 1e-6) { headEnd(b, u, '변신 해제'); return; } // 피해를 조금이라도 받으면 해제
    H.hp = u.hp; H.t += dt; u.atkT = Math.max(u.atkT, 0.1); // 평타 불가
    if (H.t >= H.dur) { headEnd(b, u); return; }
    if (u.blocked('blocksAct')) return;
    H.fireT -= dt; if (H.fireT > 0) return; H.fireT += D.head.gap;
    const a = u.moving ? u.dir : (u.facing > 0 ? 0 : Math.PI);
    for (const s of [-1, 1]) {
      const aa = a + s * Math.PI / 2, sp = D.head.spd;
      b.proj.push({ x: u.x + Math.cos(aa) * 10, y: u.y - 22 + Math.sin(aa) * 6, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, spd: sp, src: u, dmg: u.st.atk * H.mult, kind: 'jkFlame', homing: false, noAirLock: true,
        life: D.head.life, trail: 0, r: 11, draw: drawFlameProj, hit: { element: 'fire', delivery: 'ranged', color: '#ffb060' } });
    }
    b.stats.jkHeadShot = (b.stats.jkHeadShot || 0) + 2;
  }

  // ---------- 스텝 ----------
  function stepStart(b, u, slot, n) {
    const J = J_(u), e = foeOf(b, u), s = slot || {};
    const a = e && Math.random() < 0.5 ? angTo(u, e) : rand(0, TAU);
    const recast = n < 2 && Math.random() < D.step.recastP ? rand(D.step.recastAt[0], D.step.recastAt[1]) : -1;
    const L = s.len || D.step.len, dur = s.dur || D.step.dur, sx = u.x, sy = u.y;
    let t = 0; J.chain = n; u.facing = Math.cos(a) >= 0 ? 1 : -1; u.jkSpin = 0; b.dust(u.x, u.y);
    u.action = { type: 'jkStep', trail: '#ffb070', step(dt) {
      t += dt; const p = Math.min(1, t / dur), k = 1 - (1 - p) * (1 - p);
      u.jkSpin = p; u.evadeT = Math.max(u.evadeT || 0, b.time + 0.05); // 스텝 중: 모든 공격 회피
      if (u.blocked('blocksMove')) { end(false); return; }
      const nx = sx + Math.cos(a) * L * k, ny = sy + Math.sin(a) * L * k;
      if (!free(b, u, nx, ny)) { end(true); return; } // 벽·장애물은 못 지나감
      u.x = nx; u.y = ny; u.walk += dt * 30;
      if ((u.jkAfT = (u.jkAfT || 0) - dt) <= 0) { u.jkAfT = 0.04; b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.18, a: 0.3 }); }
      if (recast >= 0 && p >= recast) { b.stats.jkStep2 = (b.stats.jkStep2 || 0) + 1; b.text(u.x, u.y - 58, '스텝!', '#ffd0a0', 9); stepStart(b, u, slot, n + 1); return; } // 스텝 중 한 번 더 (방향 다시 뽑음)
      if (p >= 1) end(false);
    } };
    function end(wall) {
      u.action = null; u.jkSpin = null; J.chain = 0;
      if (wall) { b.dust(u.x, u.y); playSfx('wall'); }
      u.dir = fixAngle(wall ? a + Math.PI + rand(-0.5, 0.5) : a + rand(-0.3, 0.3)); if (u.v) u.v = [Math.cos(u.dir) * (u.speed || 0), Math.sin(u.dir) * (u.speed || 0)];
      setCd(b, u, 'jackStep'); // 쿨타임은 마지막 스텝이 끝난 뒤부터
      J.cancelT = Math.max(J.cancelT, D.step.cancel);
      const f = foeOf(b, u); if (f && dist(u, f) <= u.reach) u.atkT = Math.min(u.atkT, 0); // 바로 띄워베기
    }
    b.stats.jkStep = (b.stats.jkStep || 0) + 1;
  }

  // ---------- 띄워베기 후속: 같이 점프해 공중 베기 ----------
  function airSlash(b, u, tgt) {
    const J = J_(u); let t = 0, hit = false;
    J.airCd = D.air.cd; u.jkLift = { t: 0, dur: D.air.dur, h: D.air.h, src: tgt };
    b.text(u.x, u.y - 60, '점프!', '#ffd0a0', 9);
    u.action = { type: 'jkAir', step(dt) {
      t += dt;
      if (!tgt.dead) { // 상대 쪽으로 (관통해 지나감)
        const dx = tgt.x + u.facing * 14 - u.x, dy = tgt.y - u.y, dd = Math.hypot(dx, dy), st = Math.min(dd, D.air.spd * dt);
        if (dd > 0.5) { const nx = u.x + dx / dd * st, ny = u.y + dy / dd * st; if (free(b, u, nx, ny)) { u.x = nx; u.y = ny; } }
      }
      if (!hit && t >= D.air.hitAt) {
        hit = true;
        if (!tgt.dead && !b.over && dist(u, tgt) <= u.reach + 8) {
          const bd = b.damage(u, tgt, u.st.atk * D.air.mult, { ...(u.def.attack || {}), element: 'slash', delivery: 'melee', jkAir: true, color: '#ffd8c0' });
          b.slashFx(tgt.x, tgt.y - 30 - (tgt.jkLiftZ || 0), -u.facing, '#ffe0c8', 1.2);
          if (bd > 0) { lift(b, tgt, u, D.lift.dur, D.lift.h); b.stats.jkAirHit = (b.stats.jkAirHit || 0) + 1; }
        } else b.slashFx(u.x + u.facing * 16, u.y - 34, u.facing, '#ffffff', 0.8);
      }
      if (t >= D.air.dur) { u.action = null; u.dir = fixAngle(u.facing > 0 ? rand(-0.8, 0.8) : Math.PI + rand(-0.8, 0.8)); }
    } };
    b.stats.jkAir = (b.stats.jkAir || 0) + 1;
  }
  function onHit(u, tgt, b, dmg, o) {
    if (!o || !o.basic || o.bump || o.delivery !== 'melee' || o.jkAir || o.viaProj) return;
    if (!lift(b, tgt, u, D.lift.dur, D.lift.h)) return;
    b.stats.jkLaunch = (b.stats.jkLaunch || 0) + 1;
    const J = J_(u);
    if (J.head || u.action || u.dead) return;
    if (dist(u, tgt) <= u.st.range + u.pad + tgt.pad + D.air.near && J.airCd <= 0 && !u.airborne && !u.blocked('blocksMove')) airSlash(b, u, tgt);
    else { J.cancelT = Math.max(J.cancelT, D.gcancel); b.stats.jkGround = (b.stats.jkGround || 0) + 1; } // 땅에 남음: 바로 다른 스킬
  }

  // ---------- 스킬 ----------
  const inCancel = u => !!(u.jko && u.jko.cancelT > 0);
  const okBase = (u, b) => !u.airborne && !(u.jko && u.jko.head) && !u.push && !u.pull && !u.climb && !u.inTrain;
  SKILLS.jackStep = { desc: '절반 확률로 상대 쪽, 나머지는 무작위 방향으로 한 바퀴 돌며 빠르게 이동합니다(160px, 0.45초). 스텝 중에는 모든 공격을 피하고 상대를 통과하지만 벽·장애물은 못 지나갑니다. 스텝 중 한 번 더 스텝할 수 있고(방향 다시 뽑음), 끝나면 띄워베기나 다른 스킬로 바로 이어갑니다.',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return okBase(u, b) && !!e && dist(u, e) < D.step.near; },
    use(u, e0, b, s) { stepStart(b, u, s, 1); } };
  SKILLS.jackTower = { desc: '앞에 큰 펌킨 타워를 세웁니다(하나만, 0.7초 동안 한 바퀴만 빠르게 돌고 사라짐, 부서지지 않음). 시계/반시계 방향으로 돌며 한 바퀴에 불꽃 12발을 던지고, 떨어진 불꽃은 타워가 사라진 뒤에도 잠시 바닥에서 탑니다. 닿으면 타워를 밀며 지나가고, 더 밀 곳이 없으면 튕깁니다.',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return okBase(u, b) && !!e && (dist(u, e) < 200 || inCancel(u)); },
    use(u, e0, b, s) {
      const S = B_(b), e = foeOf(b, u), a = e ? angTo(u, e) : (u.facing > 0 ? 0 : Math.PI);
      for (const T of S.towers) if (T.owner === u && !T.gone) removeTower(b, T);
      S.towers = S.towers.filter(T => !T.gone);
      const T = { owner: u, x: 0, y: 0, r: D.tower.r, t: 0, dur: s.dur || D.tower.dur, sgn: Math.random() < 0.5 ? 1 : -1, ang: a, fireT: 0, mult: s.mult || D.tower.mult };
      let placed = false;
      for (const k of [40, 28, -32, 0]) { const q = b.clampPos(u.x + Math.cos(a) * k, u.y + Math.sin(a) * k * 0.8, T.r); T.x = q.x; T.y = q.y; if (towerFits(b, T, T.x, T.y)) { placed = true; break; } }
      if (!placed) { const q = b.clampPos(u.x, u.y, T.r); T.x = q.x; T.y = q.y; }
      S.towers.push(T);
      b.dust(T.x, T.y); b.smoke(T.x, T.y - 16, '#6a3a2a', 5); b.text(T.x, T.y - 80, T.sgn > 0 ? '펌킨 타워 ↻' : '펌킨 타워 ↺', FIRE, 9);
      b.stats.jkTower = (b.stats.jkTower || 0) + 1;
    } };
  SKILLS.jackHead = { desc: '3.5초 동안 공중에 뜬 호박 머리로 변신해 이동 방향의 양옆으로 불꽃을 쏘며 움직입니다. 변신 중에는 다른 스킬·평타를 쓸 수 없고, 시간이 다 되거나 피해를 받으면 풀립니다.',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return okBase(u, b) && !u.action && !!e && dist(u, e) < 220; },
    use(u, e0, b, s) { headStart(b, u, s); } };
  SKILLS.jackFlame = { desc: '바라보는 쪽 앞의 정해진 다섯 곳에 호박 불꽃을 포물선으로 떨어뜨립니다(조준 없음). 직격하면 그대로 피해, 땅이나 벽에 닿으면 2개로 갈라져 튀며 피해가 절반이 됩니다. 3번 갈라지면 사라집니다.',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return okBase(u, b) && !!e && (dist(u, e) < 150 || (inCancel(u) && dist(u, e) < 220)); },
    use(u, e0, b, s) {
      const n = D.flame.ang.length, mult = s.mult || D.flame.mult;
      for (let i = 0; i < n; i++) b.later(i * D.flame.gap, () => {
        if (u.dead || b.over || u.blocked('blocksAct') || held(b)) return;
        const base = u.facing > 0 ? 0 : Math.PI, a = base + D.flame.ang[i] * u.facing, L = D.flame.dist[i];
        bomb(b, u, u.x + u.facing * 6, u.y, u.x + Math.cos(a) * L, u.y + Math.sin(a) * L * 0.8, 0, u.st.atk * mult, D.flame.dur, D.flame.h);
        u.swing = 0.12;
      });
      b.stats.jkFlame = (b.stats.jkFlame || 0) + 1;
    } };
  SKILLS.jackLamp = { desc: '지금 자리에 요술 램프를 놓습니다. 2초 뒤 램프 쪽으로 빠르게 끌려가며(순간이동 아님), 끌려가다 상대와 부딪히면 그 속도로 밀쳐냅니다. 밀린 상대가 벽에 부딪히면 속도에 비례한 피해. 자신은 벽에 닿으면 멈춥니다(피해 없음).',
    canUse: (u, e0, d, b) => { const e = foeOf(b, u); return okBase(u, b) && !!e && !B_(b).lamps.some(L => L.owner === u) && (dist(u, e) < 130 || u.hp < u.maxHp * 0.5 || inCancel(u)); },
    use(u, e0, b, s) { const q = b.clampPos(u.x, u.y, u.pad, u); B_(b).lamps.push({ owner: u, x: q.x, y: q.y, t: 0, delay: s.delay || D.lamp.delay, state: 'wait' }); b.ring(u.x, u.y, 4, 22, 0.4, '#ffd070'); b.text(u.x, u.y - 60, '램프', '#ffe0a0', 9); } };

  // ---------- 진행 ----------
  STAGE_HOOKS.push({
    match: () => false,
    init(b) { b.jko = null; },
    leave(b) { for (const u of b.u) if (u.jko && u.jko.head) headEnd(b, u); }, // 스테이지 교체: 변신 해제 (타워·불꽃·램프는 새 전투 값으로 비워짐)
    step(b, dt) {
      const S = b.jko;
      for (const u of b.u) {
        if (u.jkLift) { const L = u.jkLift; L.t += dt; u.jkLiftZ = L.t < L.dur && !u.dead && !u.airborne ? Math.sin(Math.PI * L.t / L.dur) * L.h : 0; if (L.t >= L.dur || u.dead || u.airborne) { u.jkLift = null; u.jkLiftZ = 0; } }
        if (u.jkSpin != null && !stepping(u)) u.jkSpin = null;
        const J = u.jko; if (!J) continue;
        J.cancelT = Math.max(0, J.cancelT - dt); J.airCd = Math.max(0, J.airCd - dt);
        if (J.head) headStep(b, u, dt);
      }
      if (!S) return;
      if (held(b)) { // 야구장 플레이 볼: 잭오랜턴이 남긴 것 정리 (상태이상 초기화와 같은 취지)
        if (S.towers.length || S.tfl.length || S.fires.length || S.bombs.length || S.lamps.length) { S.towers = []; S.tfl = []; S.fires = []; S.bombs = []; S.lamps = []; }
        for (const u of b.u) { if (u.jko && u.jko.head) headEnd(b, u); u.jkLift = null; u.jkLiftZ = 0; }
        return;
      }
      if (b.freeze) return;
      if (S.towers.length) towerPush(b);
      if (S.towers.length || S.tfl.length || S.fires.length) towerStep(b, dt);
      if (S.bombs.length) bombStep(b, dt);
      if (S.lamps.length) lampStep(b, dt);
    },
    drawUnder(ctx, b, thumb) {
      const S = b.jko; if (!S || thumb) return;
      for (const P of S.fires) drawFire(ctx, P, b);
      for (const L of S.lamps) if (L.state === 'wait' || !L.done) drawLamp(ctx, L, b);
      for (const T of S.towers) drawTower(ctx, T, b);
    },
    drawOver(ctx, b) {
      const S = b.jko; if (!S) return;
      const V = b._v3d; // 직접 플레이: 던진 불씨·호박 폭탄을 제자리에 세움 (그림자는 그림 안에 같이)
      const em = (x, y, z, ...r) => V ? V.stand({ x, y, w: 40, h: z + 40, draw: c => drawEmber(c, x, y, z, ...r) }) : drawEmber(ctx, x, y, z, ...r);
      for (const F of S.tfl) { const k = Math.min(1, F.t / F.dur), x = F.sx + (F.tx - F.sx) * k, y = F.sy + (F.ty - F.sy) * k, z = 4 * F.h * k * (1 - k) + 18 * (1 - k); em(x, y, z, 1, b); }
      for (const P of S.bombs) { const k = Math.min(1, P.t / P.dur), x = P.sx + (P.tx - P.sx) * k, y = P.sy + (P.ty - P.sy) * k, z = 4 * P.h * k * (1 - k) + (P.gen ? 0 : 20 * (1 - k)); em(x, y, z, P.gen === 0 ? 1.6 : 1.25 - P.gen * 0.18, b, P.gen); }
    },
  });

  // ---------- 그리기 (화면 전용) ----------
  function drawFlameProj(ctx, p) {
    const a = Math.atan2(p.vy, p.vx); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#ff6a20'; ctx.fillRect(-9, -2, 7, 4);
    ctx.globalAlpha = 1; ctx.fillStyle = '#ff9a3a'; ctx.fillRect(-3, -3, 6, 6); ctx.fillStyle = '#ffe08a'; ctx.fillRect(-1, -2, 3, 4);
  }
  function drawEmber(ctx, x, y, z, s, b, gen) {
    const X = Math.round(x), Y = Math.round(y);
    ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.fillRect(X - 2 * s, Y - 1, 4 * s, 2); ctx.globalAlpha = 1;
    const fl = Math.floor(b.time * 14 + x) % 2, r = Math.max(1.5, 3 * s);
    if (!gen && s > 1.2) { // 호박 불꽃 본탄: 작은 호박 모양
      ctx.fillStyle = '#5a1a10'; ctx.fillRect(Math.round(X - r - 1), Math.round(Y - z - r - 1), Math.round(r * 2 + 2), Math.round(r * 2 + 2));
      ctx.fillStyle = '#e8702a'; ctx.fillRect(Math.round(X - r), Math.round(Y - z - r), Math.round(r * 2), Math.round(r * 2));
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(Math.round(X - 2), Math.round(Y - z - 1), 1, 1); ctx.fillRect(Math.round(X + 1), Math.round(Y - z - 1), 1, 1); ctx.fillRect(Math.round(X - 1), Math.round(Y - z + 1), 3, 1);
      ctx.fillStyle = '#523952'; ctx.fillRect(Math.round(X), Math.round(Y - z - r - 2), 1, 2);
    } else {
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff5a10'; ctx.fillRect(Math.round(X - r - 1), Math.round(Y - z - r + 1 + fl), Math.round(r * 2 + 2), Math.round(r * 2));
      ctx.globalAlpha = 1; ctx.fillStyle = '#ff9a3a'; ctx.fillRect(Math.round(X - r), Math.round(Y - z - r), Math.round(r * 2), Math.round(r * 2));
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(Math.round(X - r / 2), Math.round(Y - z - r / 2 - fl), Math.max(1, Math.round(r)), Math.max(1, Math.round(r)));
    }
    ctx.restore();
  }
  function drawFire(ctx, P, b) {
    const k = 1 - P.t / P.life, X = Math.round(P.x), Y = Math.round(P.y);
    ctx.save(); ctx.globalAlpha = 0.25 * k + 0.1; ctx.fillStyle = '#ff5a10'; ctx.beginPath(); ctx.ellipse(X, Y, P.r, P.r * 0.55, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) { const ox = Math.round(Math.cos(i * 1.7 + P.x) * P.r * 0.6), h = 3 + ((Math.floor(b.time * 12) + i) % 3) * 2 * k;
      ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = i % 2 ? '#ff9a3a' : '#ffc860'; ctx.fillRect(X + ox - 1, Math.round(Y - h), 3, Math.round(h)); }
    ctx.restore();
  }
  function drawTower(ctx, T, b) {
    const fade = D.tower.fade, rise = Math.min(1, T.t / fade), end = Math.min(1, (T.dur - T.t) / fade), X = Math.round(T.x + (T.pushT > 0 ? Math.sin(b.time * 60) : 0)), Y = Math.round(T.y), H = Math.round(52 * rise * end);
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(X, Y + 2, 22, 8, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    if (H > 2) {
      ctx.fillStyle = '#2c1e1d'; ctx.fillRect(X - 12, Y - H, 24, H);      // 기둥 (덩굴) — 기존 픽셀 타워를 약 2배로
      ctx.fillStyle = '#3e3230'; ctx.fillRect(X - 10, Y - H, 20, H - 2);
      ctx.fillStyle = '#523952'; ctx.fillRect(X - 6, Y - H, 4, H - 2); ctx.fillRect(X + 4, Y - H + 8, 2, H - 12);
      const hy = Y - H - 16; // 꼭대기 호박
      ctx.fillStyle = '#2c1e1d'; ctx.fillRect(X - 18, hy - 12, 36, 28);
      ctx.fillStyle = '#ae3525'; ctx.fillRect(X - 16, hy - 10, 32, 24);
      ctx.fillStyle = '#d8604a'; ctx.fillRect(X - 14, hy - 8, 8, 6);
      ctx.fillStyle = '#7a2218'; ctx.fillRect(X - 2, hy - 10, 4, 24); ctx.fillRect(X - 16, hy + 10, 32, 4);
      ctx.fillStyle = '#523952'; ctx.fillRect(X, hy - 18, 4, 8);
      const g = T.flash > 0 ? '#fff0b0' : '#ffb040', fx = Math.round(Math.cos(T.ang) * 6);   // 얼굴은 발사 방향 쪽으로 돌아감
      ctx.fillStyle = g; ctx.fillRect(X - 10 + fx, hy - 4, 6, 4); ctx.fillRect(X + 4 + fx, hy - 4, 6, 4); ctx.fillRect(X - 8 + fx, hy + 4, 16, 4);
      ctx.fillStyle = '#5a1a10'; ctx.fillRect(X - 4 + fx, hy + 4, 2, 2); ctx.fillRect(X + 2 + fx, hy + 4, 2, 2);
      // 회전 방향 화살표
      ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffc070'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y - 2, 28, 10, 0, T.ang - 0.9 * T.sgn, T.ang, T.sgn < 0); ctx.stroke();
    }
    ctx.restore();
  }
  function drawLamp(ctx, L, b) {
    const X = Math.round(L.x), Y = Math.round(L.y), pul = L.state === 'wait' ? Math.min(1, L.t / L.delay) : 1, bob = Math.round(Math.sin(b.time * 4) * 1.5);
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.35 * pul; ctx.fillStyle = '#ffd070'; ctx.beginPath(); ctx.ellipse(X, Y, 10 + 6 * pul, 4 + 2 * pul, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; const y0 = Y - 12 + bob;
    ctx.fillStyle = '#2c1e1d'; ctx.fillRect(X - 7, y0 - 1, 14, 7); ctx.fillRect(X - 3, y0 - 4, 6, 3); ctx.fillRect(X + 6, y0, 4, 2); ctx.fillRect(X - 10, y0 + 1, 4, 3);
    ctx.fillStyle = '#c89a3a'; ctx.fillRect(X - 6, y0, 12, 5); ctx.fillStyle = '#ffe08a'; ctx.fillRect(X - 5, y0, 6, 2); ctx.fillStyle = '#8a6020'; ctx.fillRect(X - 6, y0 + 4, 12, 1);
    ctx.fillStyle = '#c89a3a'; ctx.fillRect(X - 2, y0 - 3, 4, 2); ctx.fillRect(X + 7, y0 + 1, 2, 1); ctx.fillRect(X - 9, y0 + 2, 3, 1);
    const fl = Math.floor(b.time * 10) % 2; ctx.fillStyle = '#ff9a3a'; ctx.fillRect(X + 9, y0 - 2 - fl, 2, 2 + fl); // 주둥이 불꽃
    if (L.state === 'wait') { ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X, y0 - 10, 4, -Math.PI / 2, -Math.PI / 2 + pul * TAU); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- 캐릭터 정의 ----------
  const IMG = 'assets/jackO/';
  const POSES = { head: { id: ID + '@pose-head', name: '잭오랜턴', color: COL, sprite: { src: IMG + 'head.png', back: IMG + 'head_back.png', frameW: 76, frameH: 70, frames: 2, fps: 6, scale: 0.5, foot: -6 } } };
  const LAST = new Map(); let lastB = null;
  function pickPose(u, b) {
    if (b !== lastB) { LAST.clear(); lastB = b; }
    const k = !u.dead && u.jko && u.jko.head ? 'head' : null; LAST.set(u, k); return k;
  }
  function drawXform(ctx, u, b, sx) {
    if (u.jko && u.jko.head && !u.dead) ctx.translate(0, Math.round(Math.sin(b.time * 6) * 1.5)); // 둥실둥실
    if (airSlashing(u)) ctx.rotate(-u.facing * 0.25); // 점프 베기: 몸을 앞으로 기울임
    return sx;
  }
  const AFTER = new WeakMap();
  function afterPose(f) {
    if (AFTER.has(f)) return AFTER.get(f);
    let k = null, m = 1e9; for (const [u, v] of LAST) { const d = Math.hypot(u.x - f.x, u.y - f.y); if (d < m) { m = d; k = v; } }
    const r = k && m < 60 ? { def: POSES[k], sx: null } : null; AFTER.set(f, r); return r;
  }
  CHARACTERS.push({
    id: ID, name: '잭오랜턴', fullName: '잭오랜턴', gender: 'female', color: COL, weapon: 'jackCane',
    stats: { hp: 820, atk: 36, spd: 310, range: 52, atkRate: 1.1, def: 16, crit: 0.08, critMult: 1.75 },
    attack: { element: 'slash', delivery: 'melee' },
    resist: { fire: 0.85 },
    skills: [
      { id: 'jackStep', name: '스텝', cd: 3, len: 160, dur: 0.45 },
      { id: 'jackTower', name: '펌킨 타워 생성', cd: 14, dur: 0.7, mult: 0.45 },
      { id: 'jackHead', name: '호박 머리 변신', cd: 16, dur: 3.5, mult: 0.4 },
      { id: 'jackFlame', name: '호박 불꽃', cd: 10, mult: 1.0 },
      { id: 'jackLamp', name: '요술 램프', cd: 12, delay: 2 },
    ],
    passiveDesc: '띄워베기(평타): 맞은 상대를 잠깐 공중에 띄웁니다(연출만, 상대는 그대로 움직이고 공격 가능). 잭오랜턴은 띄운 상대를 몸으로 통과하고, 가까우면 같이 점프해 공중에서 한 번 더 베기(ATK×0.75), 멀면 땅에 남아 바로 다른 스킬로 이어갑니다.',
    sprite: { src: IMG + 'front.png', back: IMG + 'back.png', scale: 0.5, foot: 2, faces: { front: 'left', back: 'left' }, portraitRect: [16, 10, 46, 46] },
    portrait: IMG + 'portrait.png',
    poses: POSES, pickPose, drawXform, afterPose, onHit,
    lines: {}, // 대사 없음 (로그는 '잭오랜턴: 스킬명')
  });
  window.JACKO = { D, lift, towerAt };
})();
