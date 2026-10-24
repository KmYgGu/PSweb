/* =========================================================
 * 갈포드 (사무라이 스피리츠 닌자) + 허스키 포피
 *  - 포피(강아지)는 유닛이 아니라 스킬 연출/투사체 전용
 *  - 스킬: 전기 형태 발사, 강아지 낙하, 동반 낙하, 분신술, 더블 메가 스트라이크 헤즈, 플라즈마 독
 *  - 상태 'resistDown'(저항 감소): 마비를 제외한 모든 상태이상 저항 -25% (game.js statusResist 에서 반영, 중복 없이 갱신)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const ELEC = '#9fe6ff', ELEC2 = '#fff6a8';
  const hitO = (slot, extra) => ({ element: slot.element, delivery: slot.delivery, pierce: slot.pierce || 0, applies: slot.applies || null, ...extra });
  const clampP = (b, x, y, u) => b.clampPos(x, y, u ? u.pad : 0, u);
  const fxList = b => b.galFx || (b.galFx = []);
  const elecBurst = (b, x, y, k = 1) => { b.bolt(x, y, 30 * k, ELEC2); b.bolt(x + rand(-8, 8), y, 22 * k, ELEC); b.sparks(x, y, ELEC, Math.round(10 * k), 180); b.glow(x, y, 26 * k, ELEC, 0.3); };

  // ---------- 저항 감소 디버프 ----------
  STATUS_DEFS.resistDown = {
    name: '저항 감소', color: '#c8a0ff', tint: '#a080ff', tintA: 0.14, particle: '#d8c0ff',
    statusResistMod: -0.25,        // 상태이상 저항 -25% (확률 x1.25, 지속시간 x1.125)
    statusResistExclude: ['paralysis'], // 마비에는 적용되지 않음
    noResistScale: true,           // 자기 자신은 저항 감소의 영향을 받지 않음
  };

  // ---------- 허스키 픽셀 스프라이트 (절차적, 12x10) ----------
  const DOG_PX = [
    '..g......g..',
    '.gg.....ggg.',
    '.gggggggggg.',
    'gwwgwwwgwwg.',
    'gwkwwwwwkwg.',
    '.wwwwwwwwwn.',
    '..wwwwwwww..',
    '.gwwggggww..',
    '.gww.gg.ww..',
    '.kk..kk.kk..',
  ];
  const DOG_PAL = { g: '#8a94a8', w: '#f4f6fa', k: '#2a2a36', n: '#2a2a36' };
  let dogC = null;
  function dogCanvas() {
    if (dogC) return dogC;
    const c = document.createElement('canvas'); c.width = 14; c.height = 12; const x = c.getContext('2d');
    const cell = (i, j, col) => { x.fillStyle = col; x.fillRect(i + 1, j + 1, 1, 1); };
    for (let j = 0; j < DOG_PX.length; j++) for (let i = 0; i < 12; i++) { const k = DOG_PX[j][i]; if (k !== '.') { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + dx, jj = j + dy; if (ii < 0 || jj < 0 || ii >= 12 || jj >= DOG_PX.length || DOG_PX[jj][ii] === '.') cell(ii, jj, '#1a1622'); } } }
    for (let j = 0; j < DOG_PX.length; j++) for (let i = 0; i < 12; i++) { const k = DOG_PX[j][i]; if (k !== '.') cell(i, j, DOG_PAL[k]); }
    return (dogC = c);
  }
  // 왼쪽을 보는 원본 → face 1 이면 오른쪽
  function drawDog(ctx, x, y, face, k = 1, elec = 0, t = 0) {
    const c = dogCanvas(), s = 2.6 * k;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(face > 0 ? -s : s, s);
    ctx.drawImage(c, -7, -12); ctx.restore();
    if (elec > 0) {
      ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 40); ctx.strokeStyle = ELEC; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); let px = x - 16, py = y - 14 + i * 6; ctx.moveTo(px, py); for (let n = 0; n < 5; n++) { px += 7; py += rand(-5, 5); ctx.lineTo(px, py); } ctx.stroke(); }
      ctx.globalAlpha = 0.25; ctx.fillStyle = ELEC; ctx.beginPath(); ctx.ellipse(x, y - 14, 22, 15, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  function drawOrb(ctx, p) {
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = ELEC; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = ELEC2; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const a = rand(0, TAU); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * 9 + rand(-2, 2), p.y + Math.sin(a) * 9 + rand(-2, 2)); ctx.lineTo(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14); ctx.stroke(); }
    ctx.restore();
  }

  // 포피는 한 마리: 같은 sharedCd 슬롯끼리 쿨타임 공유 (시전한 스킬의 쿨타임을 양쪽에 적용). 빌린 스킬(패스트푸드점 등)은 시전자 슬롯 기준이라 안전
  function shareCd(u, slot) {
    if (!slot || !slot.sharedCd || !u.skills || !u.skillT) return;
    u.skills.forEach((s, i) => { if (s !== slot && s.sharedCd === slot.sharedCd) u.skillT[i] = Math.max(u.skillT[i] || 0, slot.cd || 0); });
  }

  // ---------- 1. 전기 형태 발사 ----------
  SKILLS.galShock = {
    desc: '전기 덩어리를 시전 순간 상대가 있던 방향으로 직선 발사합니다(유도 없음). 적중 시 마비.',
    canUse: (u, e, d) => d > 50 && d < 280 && !e.dead,
    use(u, e, b, slot) {
      // 논타겟: 시전 순간의 상대 위치로 방향 고정 → 직선 비행 (유도 없음)
      const tx = e.x, ty = e.y - b.airZ(e);
      b.glow(u.x + u.facing * 12, u.y - 18, 22, ELEC, 0.3);
      b.windup(u, 0.2, () => {
        const a = Math.atan2(ty - u.y, tx - u.x);
        b.proj.push({ x: u.x + u.facing * 12, y: u.y - 18, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, spd: 480, src: u, noAirLock: true, dmg: u.st.atk * (slot.mult || 1.4), kind: 'magic', life: 1.4, trail: 0, r: 12,
          hit: hitO(slot), draw: (ctx, p) => drawOrb(ctx, p),
          onHit: o => elecBurst(b, o.x, o.y - 18, 0.8) });
        elecBurst(b, u.x + u.facing * 14, u.y - 18, 0.5);
      });
    },
  };

  // ---------- 2. 강아지 낙하 ----------
  SKILLS.dogDrop = {
    desc: '포피가 하늘에서 상대 위로 떨어집니다. 적중 시 저항 감소 (마비 제외 모든 상태이상 저항 -25%). 포피는 한 마리라 플라즈마 독과 쿨타임 공유.',
    canUse: (u, e, d) => d < 300 && !e.dead,
    use(u, e, b, slot) {
      shareCd(u, slot);
      const t = slot.fall || 0.6, q = { x: e.x, y: e.y }, r = slot.r || 34; // 시전 순간 위치에 고정 (예측·추적 없음)
      b.telegraphCircle(q.x, q.y, r, t, '#d8e4ff');
      b.text(u.x, u.y - 60, '포피!', '#e8f0ff', 10);
      fxList(b).push({ type: 'dogFall', x: q.x, y: q.y, face: u.facing, t: 0, dur: t });
      b.later(t, () => {
        if (u.dead) return;
        b.shock(q.x, q.y, 6, r + 10, '#e8f0ff', 0.4, 4); b.dust(q.x, q.y); b.shake(1.5);
        fxList(b).push({ type: 'dogSit', x: q.x, y: q.y, face: u.facing, t: 0, dur: 0.5 });
        let hitAny = false;
        for (const o of b.foes(u)) if (Math.hypot(o.x - q.x, (o.y - q.y) / 0.75) <= r + o.pad && !o.airborne) {
          if (b.damage(u, o, u.st.atk * (slot.mult || 1.6), hitO(slot, { big: true })) > 0) hitAny = true;
        }
        if (hitAny) b.say(u, 'poppyHit'); // 대사: 포피 공격 적중
        b.later(1.4, () => { if (!u.dead && !b.over) b.say(u, 'poppyReturn'); }); // 대사: 포피 귀환 (낙하 후 돌아옴)
      });
    },
  };

  // ---------- 3. 동반 낙하 ----------
  SKILLS.galDrop = {
    desc: '갈포드가 포피와 함께 높이 뛰어올라 상대 위로 떨어집니다. 적중 시 저항 감소 (강아지 낙하와 중첩되지 않고 갱신).',
    canUse: (u, e, d) => d > 40 && d < 240 && !u.airborne && !e.dead,
    use(u, e, b, slot) {
      const dur = slot.dur || 0.75, q = { x: e.x, y: e.y }, p = clampP(b, q.x, q.y, u), r = slot.r || 40;
      b.telegraphCircle(p.x, p.y, r, dur, '#bfe6ff');
      u.air = { t: 0, dur, h: slot.h || 80, fling: { x0: u.x, y0: u.y, x1: p.x, y1: p.y } };
      u.galDog = { t: 0, dur }; b.dust(u.x, u.y);
      const st = { type: 'galDrop', t: 0 };
      st.step = (dt) => {
        st.t += dt;
        if (u.air && st.t < dur + 0.3) return;
        u.action = null; u.galDog = null;
        b.shock(u.x, u.y, 6, r + 14, '#bfe6ff', 0.45, 5); b.shake(2.5); b.hitstop(0.08);
        fxList(b).push({ type: 'dogSit', x: u.x - u.facing * 18, y: u.y, face: u.facing, t: 0, dur: 0.5 });
        for (const o of b.foes(u)) if (Math.hypot(o.x - u.x, (o.y - u.y) / 0.75) <= r + o.pad && !o.airborne) {
          b.damage(u, o, u.st.atk * (slot.mult || 2.0), hitO(slot, { big: true }));
          b.slashFx(o.x, o.y - 18, u.facing, '#e8f4ff', 1.2);
        }
      };
      u.action = st;
    },
  };

  // ---------- 4. 분신술 ----------
  SKILLS.galClone = {
    desc: '앞뒤에 분신을 세웁니다(둘 중 하나가 진짜, 무작위). 잠시 둘 다 멈춰 서 있고, 상대가 분신을 공격하면 그 공격을 회피(순간이동)! 진짜를 공격하면 깜짝 놀라 0.8초간 굳습니다.',
    canUse: (u, e, d) => d < 170 && !u.airborne && !u.galClone && !e.dead,
    use(u, e, b, slot) {
      const off = slot.off || 42, dur = slot.dur || 2.4;
      const A = clampP(b, u.x + u.facing * off, u.y, u), B = clampP(b, u.x - u.facing * off, u.y, u);
      const realFront = Math.random() < 0.5, R = realFront ? A : B, F = realFront ? B : A;
      b.smoke(u.x, u.y - 18, '#c8d8ff', 10);
      u.x = R.x; u.y = R.y;
      u.galClone = { x: F.x, y: F.y, t: dur, slot, face: u.facing, back: !!u.lookUp };
      b.smoke(F.x, F.y - 18, '#c8d8ff', 6); b.text(u.x, u.y - 64, '분신술!', '#c8d8ff', 11);
      const st = { type: 'galClone', t: 0 };
      st.step = (dt) => { st.t += dt; if (!u.galClone || st.t >= dur) { u.action = null; if (u.galClone) endClone(b, u, true); } };
      u.action = st;
    },
  };
  function endClone(b, u, quiet) {
    const C = u.galClone; if (!C) return; u.galClone = null;
    b.smoke(C.x, C.y - 18, '#c8d8ff', quiet ? 6 : 10);
    if (u.action && u.action.type === 'galClone') u.action = null;
  }
  // 피해 직전: 분신 중이면 공격이 분신/진짜 중 어디에 맞았는지 판정 (상대는 둘을 구분 못함 → 50%)
  function cloneIntercept(b, src, tgt, o) {
    const C = tgt.galClone; if (!C || !src || src.team === tgt.team || o.reflected || o.galCounter) return undefined;
    const slot = C.slot;
    if (Math.random() < (slot.fakeChance ?? 0.5)) { // 분신을 공격함 → 진짜는 반대편: 회피 (반격 없음)
      const ox = tgt.x, oy = tgt.y; tgt.x = C.x; tgt.y = C.y; tgt.galClone = null;
      if (tgt.action && tgt.action.type === 'galClone') tgt.action = null;
      b.smoke(ox, oy - 18, '#c8d8ff', 12); b.text(ox, oy - 60, '분신!', '#c8d8ff', 11);
      b.smoke(tgt.x, tgt.y - 18, '#c8d8ff', 5); b.text(tgt.x, tgt.y - 64, '회피!', '#e8f0ff', 11);
      b.fx.push({ type: 'after', x: ox, y: oy, def: tgt.fdef, back: !!tgt.lookUp, facing: tgt.facing, t: 0, dur: 0.3, a: 0.5 });
      b.stats.galDodge = (b.stats.galDodge || 0) + 1; b.say(tgt, 'cloneTrick');
      return true;
    }
    // 진짜를 공격함 → 깜짝! (반격 실패, 피해는 그대로)
    endClone(b, tgt);
    if (!tgt.air) tgt.air = { t: 0, dur: 0.3, h: 14 };
    b.text(tgt.x, tgt.y - 66, '!', '#ffffff', 16);
    b.later(0.06, () => b.text(tgt.x + 14, tgt.y - 56, '헉!', '#fff2a0', 11));
    b.shake(1); tgt.galShake = 0.35;
    b.later(0.3, () => { if (!tgt.dead && !b.over) { b.applyStatus(tgt, 'stun', slot.surpriseStun || 0.8, src, { noResistScale: true }); b.text(tgt.x, tgt.y - 76, '굳음…', '#c8d0e0', 9); } }); // 놀라서 굳음 (확실한 손해)
    b.stats.galSurprise = (b.stats.galSurprise || 0) + 1;
    return undefined;
  }

  // ---------- 5. 더블 메가 스트라이크 헤즈 ----------
  // 논타겟: 시전 순간 방향 고정 → 그 방향으로 돌진하며 연속 베기(앞쪽 작은 판정) → 짧은 잡기 돌진(작은 판정).
  // 순간이동·추적 없음. 잡기가 빗나가면 헛잡음 + 경직(무방비).
  SKILLS.galMega = {
    desc: '바라보는 방향으로 돌진하며 연속 베기 후, 짧게 뛰어들어 붙잡기를 시도합니다. 잡으면 함께 뛰어올라 전기 내리꽂기. 빗나가면 잠시 무방비.',
    canUse: (u, e, d) => d < 95 && !e.airborne && !u.airborne && !e.dead,
    use(u, e, b, slot) {
      const a = Math.atan2(e.y - u.y, e.x - u.x), cx = Math.cos(a), cy = Math.sin(a);
      const fx = cx >= 0 ? 1 : -1; u.facing = fx;
      b.text(u.x, u.y - 66, '더블 메가 스트라이크 헤즈!', ELEC2, 10);
      const hits = slot.hits || 4, gap = slot.gap || 0.11, dashD = slot.dashDist || 60, reach = slot.slashReach || 24, sr = slot.slashR || 20;
      const gT = slot.grabT || 0.14, gD = slot.grabDist || 34, gR = slot.grabR || 13, gReach = slot.grabReach || 18, whiff = slot.whiff || 0.7;
      const dashT = hits * gap;
      const inBox = (o, rch, rad) => !o.dead && !o.airborne && Math.hypot(o.x - (u.x + cx * rch), (o.y - (u.y + cy * rch)) / 0.75) <= rad + (o.pad || 10);
      const move = (dist) => { // 직선 이동 (앞에 상대 몸이 막고 있으면 멈춤 — 몸 겹침/튕김 방지, 방향은 그대로)
        const nx = u.x + cx * dist, ny = u.y + cy * dist;
        if (b.foes(u).some(o => !o.dead && !o.airborne && Math.hypot(o.x - nx, o.y - ny) < (u.pad || 10) + (o.pad || 10) + 4 && (o.x - u.x) * cx + (o.y - u.y) * cy > 0)) return;
        const q = clampP(b, nx, ny, u); u.x = q.x; u.y = q.y; };
      const st = { type: 'galMega', t: 0, phase: 0, n: 0, tgt: null };
      st.step = (dt) => {
        st.t += dt;
        if (u.dead || b.over) { u.action = null; return; }
        u.facing = fx;
        if (st.phase === 0) { // 돌진 베기 (방향 고정)
          if (st.t <= dashT) { move(dashD / dashT * dt); if (Math.random() < 0.4) b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.18, a: 0.35 }); }
          while (st.n < hits && st.t >= st.n * gap) {
            st.n++; u.swing = 0.12;
            const hx = u.x + cx * reach, hy = u.y + cy * reach;
            b.slashFx(hx + rand(-4, 4), hy - 18 + rand(-4, 4), st.n % 2 ? u.facing : -u.facing, '#e8f4ff', 0.9);
            for (const o of b.foes(u)) if (inBox(o, reach, sr)) b.damage(u, o, u.st.atk * (slot.mult || 0.5), hitO(slot, { noCrit: st.n > 1, element: 'slash' }));
          }
          if (st.t >= dashT + 0.06) { st.phase = 1; st.t = 0; b.dust(u.x, u.y); }
        } else if (st.phase === 1) { // 잡기 돌진 (짧은 사거리·작은 판정)
          move(gD / gT * dt);
          if (Math.random() < 0.5) b.spark(u.x + cx * gReach, u.y - 18 + cy * gReach, ELEC, -10);
          const o = b.foes(u).find(o => inBox(o, gReach, gR));
          if (o) {
            st.phase = 2; st.t = 0; st.tgt = o;
            const dur = slot.air || 0.85;
            b.applyStatus(o, 'stun', dur + 0.25, u, { noResistScale: true });
            o.action = null;
            u.air = { t: 0, dur, h: slot.h || 90 }; o.air = { t: 0, dur, h: (slot.h || 90) + 6 };
            b.text(o.x, o.y - 60, '잡았다!', '#ffffff', 10); b.dust(u.x, u.y);
          } else if (st.t >= gT) { // 헛잡음 → 경직
            st.phase = 3; st.t = 0;
            b.text(u.x, u.y - 60, '헛잡음!', '#c8d0e0', 10); b.dust(u.x + cx * gReach, u.y + cy * gReach);
            b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.3, a: 0.4 });
            b.stats.galWhiff = (b.stats.galWhiff || 0) + 1;
          }
        } else if (st.phase === 2) { // 잡은 상대와 함께 도약 → 내리꽂기
          const e2 = st.tgt;
          if (!e2.dead) { const q = clampP(b, u.x + fx * 20, u.y, e2); e2.x = q.x; e2.y = q.y; }
          if (Math.random() < 0.5) b.spark(u.x, u.y - 18 - b.airZ(u), ELEC, -20);
          if (!u.air) {
            u.action = null;
            const x = e2.x, y = e2.y - 18;
            b.bolt(x, e2.y, 90, ELEC2); b.bolt(x + 6, e2.y, 70, ELEC); b.bolt(x - 8, e2.y, 60, '#ffffff');
            b.shock(x, e2.y, 8, 80, ELEC, 0.5, 6); b.glow(x, y, 60, ELEC, 0.5); b.sparks(x, y, ELEC2, 28, 280);
            b.zoomAt(x, y, 0.06); b.shake(3.5); b.hitstop(0.15);
            if (!e2.dead) b.damage(u, e2, u.st.atk * (slot.finMult || 2.6), hitO(slot, { big: true, element: 'elec' }));
          }
        } else { // 헛잡음 경직: 제자리, 무방비
          if (Math.random() < 0.15) b.text(u.x + rand(-6, 6), u.y - 50, '…', '#c8d0e0', 9);
          if (st.t >= whiff) u.action = null;
        }
      };
      u.action = st;
    },
  };

  // ---------- 6. 플라즈마 독 ----------
  SKILLS.plasmaDog = {
    desc: '전기를 두른 포피가 시전 순간 상대 방향으로 직선 돌진합니다(유도 없음). 갈포드는 반대 방향으로 살짝 뒤로 뛰어 물러납니다. 강아지 낙하와 쿨타임 공유.',
    canUse: (u, e, d) => d > 30 && d < 260 && !e.dead,
    use(u, e, b, slot) {
      shareCd(u, slot);
      const a = Math.atan2(e.y - u.y, e.x - u.x), face = e.x >= u.x ? 1 : -1;
      b.proj.push({ x: u.x + face * 14, y: u.y - 14, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, spd: 520, src: u, noAirLock: true, dmg: u.st.atk * (slot.mult || 1.8), kind: 'magic', life: 1.2, trail: 0, r: 16, face,
        hit: hitO(slot, { big: true }),
        draw: (ctx, p, g) => { p.face = p.vx >= 0 ? 1 : -1; drawDog(ctx, p.x, p.y + 12, p.face, 1, 1, b.time); },
        onHit: o => { elecBurst(b, o.x, o.y - 18, 1.1); b.say(u, 'poppyHit'); } });
      elecBurst(b, u.x + face * 14, u.y - 16, 0.6);
      if (!u.airborne) { const p = clampP(b, u.x - face * (slot.hop || 46), u.y, u); u.air = { t: 0, dur: 0.35, h: 18, fling: { x0: u.x, y0: u.y, x1: p.x, y1: p.y } }; }
    },
  };

  // ---------- 엔진 훅 ----------
  STAGE_HOOKS.push({
    match: () => false,
    init(b) { b.galFx = []; },
    preDamage(b, src, tgt, amount, o) { if (tgt && tgt.galClone) return cloneIntercept(b, src, tgt, o); },
    step(b, dt) {
      for (const u of b.u) {
        if (u.galClone) { if (u.dead || b.over) endClone(b, u, true); else u.galClone.t -= dt; }
        if (u.galShake) u.galShake = Math.max(0, u.galShake - dt);
      }
      if (b.galFx) { for (const f of b.galFx) f.t += dt; b.galFx = b.galFx.filter(f => f.t < f.dur); }
    },
    drawUnder(ctx, b, preview) {
      if (preview) return;
      for (const u of b.u) {
        const C = u.galClone; if (!C || u.dead) continue;
        let s = Sprites.get(u.fdef); const back = C.back && s.back; if (back) s = s.back;
        ctx.save(); ctx.translate(Math.round(C.x), Math.round(C.y));
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 4, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.scale(spriteSX(u.fdef, !!back, u.facing), 1); Sprites.draw(ctx, s, 0, false); ctx.restore();
      }
    },
    drawOver(ctx, b) {
      for (const f of b.galFx || []) {
        if (f.type === 'dogFall') { const k = f.t / f.dur, y = f.y - (1 - k) * 220; drawDog(ctx, f.x, y, f.face, 1); }
        else if (f.type === 'dogSit') { ctx.save(); ctx.globalAlpha = 1 - f.t / f.dur; drawDog(ctx, f.x, f.y, f.face, 1); ctx.restore(); }
      }
      for (const u of b.u) if (u.galDog && !u.dead && u.air) drawDog(ctx, u.x - u.facing * 18, u.y - b.airZ(u) - 4, u.facing, 0.9);
      for (const u of b.u) if (u.galShake > 0 && !u.dead) { ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px "Galmuri11", sans-serif'; ctx.fillText('!!', u.x + 12 + rand(-1, 1), u.y - 60 + rand(-1, 1)); ctx.restore(); }
    },
  });

  // ---------- 캐릭터 ----------
  CHARACTERS.push({
    id: 'galford', name: '갈포드', gender: 'female', color: '#3a6ad8',
    // 기존 캐릭터 평균 근처 (HP ~870 / ATK ~35 / SPD ~275 / DEF ~18)
    stats: { hp: 860, atk: 34, spd: 290, range: 50, atkRate: 1.05, def: 16, crit: 0.08 },
    attack: { element: 'slash', delivery: 'melee' },
    resist: { fire: 1.15 },
    statusResist: { paralysis: 0.2 },
    skills: [
      { id: 'galMega', name: '더블 메가 스트라이크 헤즈', cd: 16, hits: 4, gap: 0.11, dashDist: 60, slashReach: 24, slashR: 20, grabT: 0.14, grabDist: 34, grabReach: 18, grabR: 13, whiff: 0.7, mult: 0.5, finMult: 2.6, air: 0.85, h: 90, element: 'elec', delivery: 'melee', pierce: 0.2 },
      { id: 'galClone', name: '분신술', cd: 13, dur: 2.4, off: 42, fakeChance: 0.5, surpriseStun: 0.8 },
      { id: 'galDrop', name: '동반 낙하', cd: 11, dur: 0.75, h: 80, r: 40, mult: 2.0, element: 'blunt', delivery: 'melee', applies: [{ status: 'resistDown', duration: 5 }] },
      { id: 'plasmaDog', name: '플라즈마 독', cd: 9, sharedCd: 'poppy', mult: 1.8, hop: 46, element: 'elec', delivery: 'ranged', applies: [{ status: 'paralysis', duration: 1.6, chance: 0.5 }] },
      { id: 'dogDrop', name: '강아지 낙하', cd: 9, sharedCd: 'poppy', fall: 0.6, r: 34, mult: 1.6, element: 'blunt', delivery: 'ranged', applies: [{ status: 'resistDown', duration: 5 }] },
      { id: 'galShock', name: '전기 형태 발사', cd: 6, mult: 1.4, element: 'elec', delivery: 'ranged', applies: [{ status: 'paralysis', duration: 2.5, chance: 0.5 }] },
    ],
    sprite: { src: 'assets/Galford/front.png', back: 'assets/Galford/back.png', scale: 0.46, foot: 2, faces: { front: 'left', back: 'left' } },
    portrait: 'assets/Galford/portrait.png',
    // 대사: 사용자 제공 대사 초안 (xlsx)
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '더블 메가 스트라이크 헤즈': ['우리의 최고 기술, 받아봐!', '포피, 마지막까지 호흡 맞춰!', '이번엔 끝까지 몰아붙일 거야!'],
        '분신술': ['어느 쪽이 나일까?', '눈을 떼면 헷갈릴걸?', '자, 나를 찾아봐!'],
        '동반 낙하': ['같이 한 바퀴 돌아볼까!', '착지까지 따라와 봐!', '하늘에서 내려간다!'],
        '플라즈마 독': ['포피, 번개처럼 달려!', '좋아, 포피! 지금이야!', '우리의 번개를 보여주자!'],
        '강아지 낙하': ['포피, 위에서 인사해 줘!', '점프, 포피! 멋지게 착지해!', '위도 살펴보는 게 좋을걸?'],
        '전기 형태 발사': ['번개처럼, 일직선으로!', '찌릿할 테니까 조심해!', '내 번개, 따라올 수 있어?'],
      },
      event: {
        battleStart: ['포피, 오늘도 멋지게 가 보자!', '정의를 지킬 차례네. 준비됐어?', '{opp}, 우리 호흡을 잘 봐!'],
        lowHp: ['포피, 걱정 마. 아직 할 수 있어!', '무릎 꿇기엔 아직 이르잖아!'],
        buffed: ['좋아, 번개처럼 가볍네!', '이 힘이면 더 멀리 갈 수 있어!'],
        debuffed: ['이런 잔꾀로 우릴 막겠다고?', '포피, 조심해! 움직임이 이상해.'],
        healed: ['고마워! 다시 뛰어볼까?', '좋아, 포피. 이제 괜찮아!'],
        stunned: ['앗, 눈앞이 핑 도네…!'],
        knockedDown: ['넘어져도 금방 일어나면 돼!'],
        pinnedBySomeone: ['이거 놔! 포피가 보고 있거든!'],
        water: ['포피, 물장난은 이따가 하자!'],
        airborne: ['높이 날아볼까? 따라와, 포피!'],
        fallCrevasse: ['앗, 포피! 거긴 오면 안 돼!'],
        win: ['포피, 역시 넌 최고의 파트너야!', '정의를 지키는 일, 오늘도 성공!', '잘 봤지? 우린 둘이서 하나야!'],
        lose: ['미안해, 포피… 다음엔 꼭…!', '정의를 지키겠단 약속은… 안 잊어.'],
        poppyHit: ['잘했어, 포피! 바로 그거야!', '우리 호흡, 오늘도 완벽하네!'],
        poppyReturn: ['이리 와, 포피. 다음도 같이 가자!', '무사히 돌아왔네. 잘했어!'],
        cloneTrick: ['아쉽네, 그쪽은 내가 아니야!', '진짜 나는 여기 있지!'],
      },
    },
  });
})();
