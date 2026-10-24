/* =========================================================
 * 확장 스테이지 로직 5 (STAGE_HOOKS): 인형뽑기 크레인, 메탈 팽이 경기장
 *  - 인형뽑기: 싸우지 않는 캐릭터 인형(무적, 튕기기만) + 가끔 나타나는 크레인 (위로 1번 → 옆으로 1번 → 집게 내림)
 *  - 메탈 팽이: 원형 경기장, 스프라이트 항상 회전, 벽에 닿으면 외곽 한 바퀴 → 그 순간 상대 위치로 직선 돌진(비유도)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const P = Battle.prototype;
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const FONT = '"Galmuri11", "Malgun Gothic", sans-serif';

  // 집게에 잡힘: 행동·이동 불가 (저항 무시)
  STATUS_DEFS.clawed = { name: '집게에 잡힘', color: '#ff9ad8', blocksMove: true, blocksAct: true, noResistScale: true, stack: 'ignore',
    onApply(u) { u.action = null; u.push = null; u.pull = null; } };

  // ================= 인형뽑기 크레인 =================
  const CLAW = {
    match: st => !!st.claw,
    init(b) {
      const C = b.stage.claw; if (!C) return;
      const ids = new Set(b.u.map(u => u.def.id)); for (const u of b.u) if (u.def.partner) ids.add(u.def.partner.id);
      const pool = CHARACTERS.filter(c => !ids.has(c.id));
      b.claw = { C, pool, dolls: [], crane: null, next: C.first, respawn: [], got: [] };
      for (let i = 0; i < C.dolls; i++) CLAW.spawnDoll(b, true);
    },
    bounds(b) { const A = AR; return { L: A.x + 24, R: A.x + A.w - 24, T: A.y + 40, B: A.y + A.h - 14 }; },
    spawnDoll(b, initial) {
      const K = b.claw, Bd = CLAW.bounds(b); if (!K.pool.length) return;
      const used = new Set(K.dolls.map(d => d.def.id)); const free = K.pool.filter(c => !used.has(c.id)); const def = (free.length ? free : K.pool)[Math.floor(Math.random() * (free.length || K.pool.length))];
      let x, y; for (let i = 0; i < 30; i++) { x = rand(Bd.L, Bd.R); y = rand(Bd.T, Bd.B); if (b.u.every(u => Math.hypot(u.x - x, u.y - y) > 60) && K.dolls.every(d => Math.hypot(d.x - x, d.y - y) > 30)) break; }
      const a = rand(0, TAU), d = { def, x, y, vx: Math.cos(a) * K.C.wander, vy: Math.sin(a) * K.C.wander, ph: rand(0, TAU), face: Math.random() < 0.5 ? 1 : -1, hitT: 0, pop: initial ? 1 : 0, z: 0, grab: false };
      K.dolls.push(d); if (!initial) { b.ring(x, y, 4, 22, 0.35, '#ffd0ec'); for (let i = 0; i < 8; i++) b.parts.push({ x, y: y - 12, vx: rand(-60, 60), vy: rand(-80, -20), g: 200, life: 0.6, max: 0.6, color: i % 2 ? '#ffb0e0' : '#ffffff', size: 2 }); }
    },
    bump(b, d, ax, ay, sp) { const m = Math.hypot(ax, ay) || 1; d.vx += ax / m * sp; d.vy += ay / m * sp; d.hitT = 0.3; },
    step(b, dt) {
      const K = b.claw; if (!K) return;
      const C = K.C, Bd = CLAW.bounds(b);
      // --- 인형 이동 / 튕김 ---
      for (const d of K.dolls) {
        d.ph += dt; d.hitT = Math.max(0, d.hitT - dt); d.pop = Math.min(1, d.pop + dt * 3);
        if (d.grab) continue;
        const v = Math.hypot(d.vx, d.vy);
        if (v > C.wander) { const k = Math.max(C.wander / v, Math.exp(-2.6 * dt)); d.vx *= k; d.vy *= k; }
        else if (Math.random() < dt * 0.4) { const a = rand(0, TAU); d.vx = Math.cos(a) * C.wander; d.vy = Math.sin(a) * C.wander; }
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < Bd.L) { d.x = Bd.L; d.vx = Math.abs(d.vx); } if (d.x > Bd.R) { d.x = Bd.R; d.vx = -Math.abs(d.vx); }
        if (d.y < Bd.T) { d.y = Bd.T; d.vy = Math.abs(d.vy); } if (d.y > Bd.B) { d.y = Bd.B; d.vy = -Math.abs(d.vy); }
        if (Math.abs(d.vx) > 4) d.face = d.vx > 0 ? 1 : -1;
      }
      for (let i = 0; i < K.dolls.length; i++) for (let j = i + 1; j < K.dolls.length; j++) { // 인형끼리
        const a = K.dolls[i], c = K.dolls[j]; if (a.grab || c.grab) continue;
        const dx = c.x - a.x, dy = c.y - a.y, dd = Math.hypot(dx, dy), R = C.r * 2; if (dd >= R || dd < 0.01) continue;
        const nx = dx / dd, ny = dy / dd, p = (R - dd) / 2; a.x -= nx * p; a.y -= ny * p; c.x += nx * p; c.y += ny * p;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny; if (rv < 0) { a.vx += rv * nx; a.vy += rv * ny; c.vx -= rv * nx; c.vy -= rv * ny; }
      }
      // 캐릭터 ↔ 인형: 물리적 장애물 (둘 다 튕김, 벽 충돌 판정 아님)
      for (const u of b.u) {
        if (u.dead || u.airborne || u.hidden) continue;
        for (const d of K.dolls) {
          if (d.grab) continue;
          const dx = d.x - u.x, dy = d.y - u.y, dd = Math.hypot(dx, dy), R = C.r + 10 * u.size; if (dd >= R || dd < 0.01) continue;
          const nx = dx / dd, ny = dy / dd, p = R - dd;
          d.x += nx * p * 0.7; d.y += ny * p * 0.7; const q = b.clampPos(u.x - nx * p * 0.3, u.y - ny * p * 0.3, u.pad, u); u.x = q.x; u.y = q.y;
          const vx = Math.cos(u.dir), vy = Math.sin(u.dir), dot = vx * nx + vy * ny;
          if (dot > 0 && !u.action && !u.push) u.dir = fixAngle(Math.atan2(vy - 2 * dot * ny, vx - 2 * dot * nx) + rand(-0.2, 0.2));
          if (d.hitT <= 0) { CLAW.bump(b, d, nx, ny, 150 + (u.speed || 0) * 0.3); b.burst((u.x + d.x) / 2, (u.y + d.y) / 2 - 14, '#ffe0f0', 5); }
        }
      }
      for (const pr of b.proj) for (const d of K.dolls) { // 투사체가 스치면 인형만 튕김 (투사체는 그대로)
        if (d.grab || d.hitT > 0 || pr.life <= 0) continue;
        if (Math.hypot(pr.x - d.x, pr.y + 18 - d.y - 6) < C.r + 4) CLAW.bump(b, d, pr.vx || (d.x - pr.x), pr.vy || (d.y - pr.y), 170);
      }
      // --- 재등장 ---
      for (const r of K.respawn) r.t -= dt;
      while (K.respawn.length && K.respawn[0].t <= 0) { K.respawn.shift(); CLAW.spawnDoll(b, false); }
      // --- 크레인 ---
      if (!K.crane) { if (!b.over && (K.next -= dt) <= 0) CLAW.startCrane(b); }
      else CLAW.stepCrane(b, dt);
    },
    // 공격 이펙트 위치 → 근처 인형 튕김 (사라지지 않음)
    hitArea(b, x, y, r) {
      const K = b.claw; if (!K) return;
      for (const d of K.dolls) if (!d.grab && d.hitT <= 0 && Math.hypot(d.x - x, d.y - y) < r + K.C.r) { CLAW.bump(b, d, d.x - x || rand(-1, 1), d.y - y || rand(-1, 1), 210); d.squash = 0.25; }
    },
    targets(b) {
      const K = b.claw, L = K.dolls.filter(d => !d.grab).map(d => ({ doll: d }));
      for (const u of b.u) if (!u.dead && !u.hidden && !u.airborne && !u.climb && !u.inTrain) L.push({ u });
      return L;
    },
    pos: t => t.doll ? t.doll : t.u,
    startCrane(b) {
      const K = b.claw, C = K.C, Bd = CLAW.bounds(b), L = CLAW.targets(b); if (!L.length) { K.next = 2; return; }
      const tgt = L[Math.floor(Math.random() * L.length)], side = Math.random() < 0.5 ? -1 : 1; // -1: 왼쪽 아래에서 등장 → 위로 1번, 오른쪽 1번
      K.crane = { tgt, side, x: side < 0 ? Bd.L - 4 : Bd.R + 4, y: Bd.B, z: C.h, state: 'in', t: 0, open: 1, held: null };
      sys(b, `크레인 등장! 목표: ${tgt.doll ? tgt.doll.def.name + ' 인형' : tgt.u.def.name}`);
    },
    stepCrane(b, dt) {
      const K = b.claw, C = K.C, Cr = K.crane, Bd = CLAW.bounds(b), T = CLAW.pos(Cr.tgt);
      Cr.t += dt;
      const gone = Cr.tgt.u ? (Cr.tgt.u.dead) : (Cr.tgt.doll.grab || !K.dolls.includes(Cr.tgt.doll));
      if (Cr.state === 'in') { if (Cr.t > 0.4) { Cr.state = 'up'; Cr.t = 0; } }
      else if (Cr.state === 'up') { // 위로 한 번: 목표의 현재 높이까지 (내려가지는 않음)
        const goal = gone ? Cr.y : Math.max(Bd.T, Math.min(Cr.y, T.y));
        Cr.y = Math.max(goal, Cr.y - C.spd * dt);
        if (Cr.y <= goal + 0.5) { Cr.state = 'side'; Cr.t = 0; }
      } else if (Cr.state === 'side') { // 옆으로 한 번: 등장한 쪽 → 반대쪽 (되돌아가지 않음)
        const s = -Cr.side, goal = gone ? Cr.x : (s > 0 ? Math.max(Cr.x, Math.min(Bd.R, T.x)) : Math.min(Cr.x, Math.max(Bd.L, T.x)));
        Cr.x = s > 0 ? Math.min(goal, Cr.x + C.spd * dt) : Math.max(goal, Cr.x - C.spd * dt);
        if (Math.abs(Cr.x - goal) < 0.5) { Cr.state = 'aim'; Cr.t = 0; }
      } else if (Cr.state === 'aim') { if (Cr.t >= C.aim) { Cr.state = 'drop'; Cr.t = 0; } } // 집게 위치 표시 → 피할 시간
      else if (Cr.state === 'drop') {
        Cr.z = C.h * (1 - Math.min(1, Cr.t / C.drop)) + 4 * Math.min(1, Cr.t / C.drop);
        if (Cr.t >= C.drop * 0.55 && CLAW.grab(b, Cr.t < C.drop)) {} // 집게가 낮아진 뒤 지나가는 것도 잡힘
      } else if (Cr.state === 'lift') {
        Cr.z = Math.min(C.h + 30, Cr.z + 90 * dt); Cr.open = Math.max(0, Cr.open - dt * 6);
        const H = Cr.held;
        if (H && H.doll) { H.doll.x = Cr.x; H.doll.y = Cr.y; H.doll.z = Math.max(0, Cr.z - 14); if (Cr.t > 1.0) { H.doll.fade = Math.min(1, (Cr.t - 1.0) / 0.5); } if (Cr.t > 1.5) { K.dolls.splice(K.dolls.indexOf(H.doll), 1); K.got.push({ def: H.doll.def, t: 0 }); K.respawn.push({ t: rand(...C.respawn) }); sys(b, `${H.doll.def.name} 인형 GET!`); Cr.held = null; Cr.state = 'out'; Cr.t = 0; } }
        else if (H && H.u) {
          const u = H.u; u.x = Cr.x; u.y = Cr.y; if (u.air) u.air.z = Math.max(0, Cr.z - 16); u.wiggle = 1;
          if (u.dead || Cr.t >= C.dangle || b.over) CLAW.release(b, u), Cr.held = null, Cr.state = 'out', Cr.t = 0;
        } else if (Cr.t > 0.7) { Cr.state = 'out'; Cr.t = 0; }
      } else if (Cr.state === 'out') { Cr.z = Math.min(C.h + 60, Cr.z + 160 * dt); Cr.fade = Math.min(1, Cr.t / 0.5); if (Cr.t > 0.5) { K.crane = null; K.next = rand(...C.gap); } }
      for (const g of K.got) g.t += dt; K.got = K.got.filter(g => g.t < 1.6);
    },
    grab(b, early) {
      const K = b.claw, C = K.C, Cr = K.crane;
      const cand = [];
      for (const d of K.dolls) if (!d.grab && Math.hypot(d.x - Cr.x, d.y - Cr.y) < C.grabR) cand.push({ doll: d, k: Math.hypot(d.x - Cr.x, d.y - Cr.y) });
      for (const u of b.u) if (!u.dead && !u.hidden && !u.airborne && !u.climb && !u.inTrain && Math.hypot(u.x - Cr.x, u.y - Cr.y) < C.grabR + u.pad) cand.push({ u, k: Math.hypot(u.x - Cr.x, u.y - Cr.y) - (Cr.tgt.u === u ? 6 : 0) });
      cand.sort((a, c) => a.k - c.k); const g = cand[0];
      if (!g && early) return false;
      Cr.state = 'lift'; Cr.t = 0; b.ring(Cr.x, Cr.y, 3, C.grabR, 0.25, '#ffd0ec'); K.stats = K.stats || { doll: 0, fighter: 0, miss: 0 };
      if (!g) { b.text(Cr.x, Cr.y - 30, '허탕!', '#e8e0f0', 10); K.stats.miss++; return true; }
      K.stats[g.doll ? 'doll' : 'fighter']++;
      if (g.doll) { g.doll.grab = true; Cr.held = { doll: g.doll }; b.text(Cr.x, Cr.y - 34, '잡았다!', '#ffb0e0', 10); return true; }
      const u = g.u; Cr.held = { u };
      b.applyStatus(u, 'clawed', C.dangle + 1, null);
      u.air = { t: 0, dur: 999, h: 0, z: 0, claw: true, noLand: true }; u.action = null; u.push = null; u.pull = null;
      b.text(u.x, u.y - 60, '집게에 잡힘!', '#ff9ad8', 11); sys(b, `${u.def.name}, 크레인에 잡혔다!`); return true;
    },
    release(b, u) {
      const C = b.claw.C, z0 = u.air ? u.air.z : 0;
      u.air = { t: 0, dur: 0.3, h: z0, z: z0, claw: true, fall: true, noLand: true }; // noLand: 착지 충격파 없음
      u.wiggle = 0;
      b.later(0.31, () => {
        if (u.air && u.air.claw) u.air = null;
        const s = u.status('clawed'); if (s) s.t = 0;
        if (u.dead || b.over) return;
        b.dust(u.x, u.y); b.ring(u.x, u.y, 3, 18, 0.25, '#e8dcc8');
        const dmg = (u.def.duelist ? u.maxHp / CFG_LP() : u.maxHp) * C.fallDmg;
        if (dmg > 0) b.damage(u, u, dmg, { sure: true, noCrit: true, selfHit: true, element: 'blunt', color: '#ffd0ec' });
      });
    },
    sortItems(b) {
      const K = b.claw; if (!K) return [];
      return K.dolls.map(d => ({ y: d.y, draw: ctx => CLAW.drawDoll(ctx, b, d) }));
    },
    drawDoll(ctx, b, d, thumb) {
      const C = (b.claw && b.claw.C) || { scale: 0.62 };
      const s = Sprites.get(d.def), k = C.scale * (d.def.size || 1) * (0.4 + 0.6 * easeOut(d.pop == null ? 1 : d.pop));
      const sq = d.hitT > 0 ? Math.sin(d.hitT * 30) * 0.12 : 0, bob = thumb ? 0 : -Math.abs(Math.sin(d.ph * 5)) * 1.5;
      ctx.save(); ctx.globalAlpha = 1 - (d.fade || 0);
      if (!d.z) { ctx.globalAlpha *= 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 1, 9, 3, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1 - (d.fade || 0); }
      ctx.translate(Math.round(d.x), Math.round(d.y + bob - (d.z || 0)));
      if (d.grab) ctx.rotate(Math.sin(b.time * 6) * 0.15);
      ctx.scale(spriteSX(d.def, false, d.face) * k * (1 + sq), k * (1 - sq));
      Sprites.draw(ctx, s, 0, false);
      ctx.restore();
      // 인형 태그 (봉제 라벨) + 바느질 하트
      ctx.save(); ctx.globalAlpha = 1 - (d.fade || 0);
      const tx = Math.round(d.x + 7), ty = Math.round(d.y - 6 + bob - (d.z || 0));
      ctx.fillStyle = '#ffffff'; ctx.fillRect(tx, ty, 4, 5); ctx.fillStyle = '#ff7ab8'; ctx.fillRect(tx + 1, ty + 1, 2, 1); ctx.fillRect(tx + 1, ty + 3, 2, 1);
      ctx.restore();
    },
    drawCraneShadow(ctx, b) {
      const Cr = b.claw && b.claw.crane; if (!Cr) return; const C = b.claw.C;
      const aim = Cr.state === 'aim' || Cr.state === 'drop';
      ctx.save(); ctx.globalAlpha = (1 - (Cr.fade || 0)) * (aim ? 0.35 + 0.25 * Math.abs(Math.sin(b.time * 12)) : 0.22);
      ctx.fillStyle = aim ? '#ff3a7a' : '#000'; ctx.beginPath(); ctx.ellipse(Cr.x, Cr.y + 2, C.grabR, C.grabR * 0.42, 0, 0, TAU); ctx.fill();
      if (aim) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#ff5a9a'; const r = C.grabR; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.fillRect(Math.round(Cr.x + sx * r - (sx > 0 ? 4 : 0)), Math.round(Cr.y + 2 + sy * r * 0.42 - (sy > 0 ? 1 : 0)), 4, 1); ctx.fillRect(Math.round(Cr.x + sx * r - (sx > 0 ? 1 : 0)), Math.round(Cr.y + 2 + sy * r * 0.42 - (sy > 0 ? 3 : 0)), 1, 3); } }
      ctx.restore();
    },
    drawCrane(ctx, b) {
      const Cr = b.claw && b.claw.crane; if (!Cr) return;
      const x = Math.round(Cr.x), hy = Math.round(Cr.y - Cr.z - 22), barY = Math.max(AR.y + 6, hy - 46), a = 1 - (Cr.fade || 0);
      ctx.save(); ctx.globalAlpha = a;
      // 갠트리 (가로 레일: 크레인 높이를 따라 이동) + 트롤리 + 케이블
      ctx.fillStyle = 'rgba(40,36,60,0.55)'; ctx.fillRect(AR.x + 4, barY - 2, AR.w - 8, 6);
      ctx.fillStyle = '#c8ccd8'; ctx.fillRect(AR.x + 4, barY - 2, AR.w - 8, 2); ctx.fillStyle = '#8a8ea0'; ctx.fillRect(AR.x + 4, barY, AR.w - 8, 2);
      ctx.fillStyle = '#ff7ab8'; ctx.fillRect(x - 7, barY - 4, 14, 8); ctx.fillStyle = '#ffd0ec'; ctx.fillRect(x - 7, barY - 4, 14, 2);
      ctx.fillStyle = '#d8dce8'; ctx.fillRect(x - 1, barY + 4, 2, hy - barY - 4);
      // 집게 머리 + 3갈래 집게 (open 1 = 벌림)
      const o = Cr.open, sw = Math.round(3 + o * 5);
      ctx.fillStyle = '#3a3448'; ctx.fillRect(x - 7, hy - 1, 14, 9); ctx.fillStyle = '#e8ecf4'; ctx.fillRect(x - 6, hy, 12, 7); ctx.fillStyle = '#a8aec0'; ctx.fillRect(x - 6, hy + 5, 12, 2);
      ctx.fillStyle = '#ffd860'; ctx.fillRect(x - 1, hy + 2, 2, 2);
      ctx.fillStyle = '#b8bccc';
      for (const s of [-1, 1]) { ctx.fillRect(x + s * sw - 1, hy + 8, 2, 8); ctx.fillRect(x + s * (sw - 2) - 1, hy + 15, 2, 2); ctx.fillRect(x + s * Math.max(1, sw - 3) - 1, hy + 16, 2, 2); }
      ctx.fillRect(x - 1, hy + 8, 2, 9);
      ctx.restore();
    },
    floor(x, st) {
      if (!st.claw) return;
      const A = AR;
      x.fillStyle = '#f6e6f0'; x.fillRect(A.x, A.y, A.w, A.h); // 바닥 매트 (체크)
      for (let j = 0; j < A.h; j += 16) for (let i = (j / 16) % 2 * 16; i < A.w; i += 32) { x.fillStyle = '#ecd2e2'; x.fillRect(A.x + i, A.y + j, 16, 16); }
      x.fillStyle = 'rgba(255,255,255,0.35)'; for (let j = 0; j < A.h; j += 16) x.fillRect(A.x, A.y + j, A.w, 1);
      // 기계 외곽 프레임 (분홍 몸체 + 금속 모서리)
      x.fillStyle = '#e0508e'; x.fillRect(A.x, A.y, A.w, 30); x.fillRect(A.x, A.y, 10, A.h); x.fillRect(A.x + A.w - 10, A.y, 10, A.h); x.fillRect(A.x, A.y + A.h - 6, A.w, 6);
      x.fillStyle = '#ff8ac0'; x.fillRect(A.x, A.y, A.w, 3); x.fillRect(A.x, A.y, 3, A.h); x.fillStyle = '#a8306a'; x.fillRect(A.x + A.w - 3, A.y, 3, A.h); x.fillRect(A.x, A.y + 27, A.w, 3);
      for (let i = 0; i < 14; i++) { x.fillStyle = i % 2 ? '#ffe27a' : '#ffffff'; x.fillRect(A.x + 16 + i * 22, A.y + 8, 6, 6); } // 전구
      x.fillStyle = '#ffffff'; x.font = `bold 10px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      // 경품 출구 (오른쪽 위)
      const cx = A.x + A.w - 52; x.fillStyle = '#2a1a2a'; x.fillRect(cx, A.y + 4, 40, 22); x.fillStyle = '#5a3a5a'; x.fillRect(cx + 2, A.y + 6, 36, 4);
      x.fillStyle = '#ffe27a'; x.font = `bold 8px ${FONT}`; x.fillText('GET!', cx + 20, A.y + 18);
      x.fillStyle = '#c8ccd8'; for (const [px, py] of [[A.x + 2, A.y + 2], [A.x + A.w - 6, A.y + 2], [A.x + 2, A.y + A.h - 6], [A.x + A.w - 6, A.y + A.h - 6]]) x.fillRect(px, py, 4, 4);
    },
    drawUnder(ctx, b, thumb) {
      const K = b.claw; if (!K) return;
      if (thumb) { for (const d of K.dolls) CLAW.drawDoll(ctx, b, d, true); return; }
      CLAW.drawCraneShadow(ctx, b);
    },
    drawOver(ctx, b) { const K = b.claw; if (!K) return; for (const d of K.dolls) if (d.grab) CLAW.drawDoll(ctx, b, d); CLAW.drawCrane(ctx, b); },
    drawTop(ctx, b) {
      const K = b.claw; if (!K) return;
      ctx.save(); // 유리 반사광
      ctx.globalAlpha = 0.07; ctx.fillStyle = '#ffffff';
      for (const [x0, w] of [[40, 26], [84, 8], [230, 30], [282, 10]]) { ctx.beginPath(); ctx.moveTo(AR.x + x0, AR.y + 30); ctx.lineTo(AR.x + x0 + w, AR.y + 30); ctx.lineTo(AR.x + x0 + w - 120, AR.y + AR.h - 6); ctx.lineTo(AR.x + x0 - 120, AR.y + AR.h - 6); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const g of K.got) { const p = g.t / 1.6; ctx.globalAlpha = 1 - p; ctx.fillStyle = '#ffe27a'; ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(`${g.def.name} GET!`, AR.x + AR.w - 32, AR.y + 40 + p * 10); }
      ctx.restore();
    },
  };
  const CFG_LP = () => (window.DUEL_LP_SCALE || 1);
  // 공격 이펙트 → 인형 튕김
  const wrapFx = (name, geo) => { const o = P[name]; if (!o) return; P[name] = function (...a) { const r = o.apply(this, a); if (this.claw) { const g = geo(...a); CLAW.hitArea(this, g.x, g.y, g.r); } return r; }; };
  wrapFx('slashFx', (x, y, dir, c, s) => ({ x, y: y + 18, r: 18 * (s || 1) }));
  wrapFx('shock', (x, y, r0, r1) => ({ x, y: y + 6, r: Math.min(r1 || 30, 90) }));
  wrapFx('crescent', (x, y, r) => ({ x, y: y + 18, r: (r || 20) + 4 }));
  wrapFx('explosion', (x, y, r) => ({ x, y, r: (r || 30) }));
  // 집게: 공중 높이 직접 지정
  const _airZ = P.airZ;
  P.airZ = function (u) {
    if (u.air && u.air.claw) { if (u.air.fall) return u.air.h * Math.max(0, 1 - u.air.t / u.air.dur); return u.air.z || 0; }
    return _airZ.call(this, u);
  };

  // ================= 메탈 팽이 경기장 =================
  const BEY = {
    match: st => !!st.bey,
    init(b) { if (b.stage.bey) b.bey = { S: b.stage.bey }; },
    lapOk(b, u) { return !u.dead && !u.action && !u.push && !u.pull && !u.airborne && !u.climb && !u.inTrain && !u.ghostChain && !u.hidden && !u.blocked('blocksMove') && !u.blocked('blocksAct'); },
    step(b, dt) {
      if (!b.bey) return;
      for (const u of b.u) if (u.beyLap && !BEY.lapOk(b, u)) u.beyLap = null;
    },
    floor(x, st) {
      if (!st.bey) return;
      const A = AR, C = st.circle;
      x.fillStyle = '#1a1c24'; x.fillRect(A.x, A.y, A.w, A.h);
      for (let j = 0; j < A.h; j += 12) for (let i = (j / 12) % 2 * 12; i < A.w; i += 24) { x.fillStyle = '#20232c'; x.fillRect(A.x + i, A.y + j, 12, 12); }
      const R = C.r0;
      // 볼(그릇) 단계: 바깥 테두리 → 안쪽으로 밝아짐 (픽셀 원)
      const rings = [[R + 10, '#5a5e6c'], [R + 6, '#8a90a0'], [R + 2, '#3a3e4a'], [R - 6, '#4a4f5e'], [R - 34, '#555a6a'], [R - 70, '#5e6474'], [R - 104, '#68707f'], [28, '#7a8292']];
      for (const [r, col] of rings) { x.fillStyle = col; for (let yy = -r; yy <= r; yy += 2) { const w = Math.floor(Math.sqrt(r * r - yy * yy) / 2) * 2; x.fillRect(C.cx - w, C.cy + yy, w * 2, 2); } }
      x.fillStyle = '#c8ccd8'; for (let k = 0; k < 48; k++) { const a = k / 48 * TAU; x.fillRect(Math.round(C.cx + Math.cos(a) * (R + 4)) - 1, Math.round(C.cy + Math.sin(a) * (R + 4)) - 1, 2, 2); } // 리벳
      x.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; for (let r = 30; r < R - 8; r += 3) x.fillRect(Math.round(C.cx + Math.cos(a) * r), Math.round(C.cy + Math.sin(a) * r), 2, 2); } // 홈
      x.fillStyle = '#ffd860'; x.fillRect(C.cx - 3, C.cy - 3, 6, 6); x.fillStyle = '#e04a3a'; x.fillRect(C.cx - 1, C.cy - 1, 2, 2);
      x.fillStyle = '#e04a3a'; x.font = `bold 11px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LET IT RIP!', 180, A.y + 14);
    },
  };
  // 벽(원형 테두리) 접촉 → 외곽 한 바퀴 → 상대(그 순간 위치)로 직선 돌진
  const _cw = P.circleWall;
  P.circleWall = function (u) {
    if (!this.bey) return _cw.call(this, u);
    const C = this.stage.circle; if (!C || u.dead) return;
    const R = this.circleR() - 12 - u.pad, dx = u.x - C.cx, dy = u.y - C.cy, d = Math.hypot(dx, dy) || 0.01;
    const L = u.beyLap;
    if (L) {
      if (!BEY.lapOk(this, u)) { u.beyLap = null; return _cw.call(this, u); }
      const a = Math.atan2(dy, dx);
      u.x = C.cx + Math.cos(a) * R; u.y = C.cy + Math.sin(a) * R;
      const da = Math.atan2(Math.sin(a - L.a), Math.cos(a - L.a)); if (da * L.s > 0) L.acc += Math.abs(da); L.a = a; L.t += 1 / 60;
      u.dir = fixAngle(a + L.s * (Math.PI / 2 + 0.06)); u.boost = Math.max(u.boost, this.bey.S.lapBoost);
      if (Math.random() < 0.5) this.parts.push({ x: u.x + rand(-3, 3), y: u.y + rand(-2, 2), vx: rand(-30, 30), vy: rand(-40, -10), life: 0.3, max: 0.3, color: Math.random() < 0.5 ? '#ffd860' : '#ffffff', size: 1.5 });
      if (L.acc >= TAU || L.t > this.bey.S.lapMax) { // 한 바퀴 완료 → 돌진 방향 고정 (비유도)
        u.beyLap = null; const e = this.enemy(u);
        if (e && !e.dead) u.dir = Math.atan2(e.y - u.y, e.x - u.x); else u.dir = Math.atan2(-dy, -dx);
        u.boost = Math.max(u.boost, this.bey.S.chargeBoost); u.beyCharge = this.time;
        this.ring(u.x, u.y, 3, 20, 0.25, '#ffd860'); this.text(u.x, u.y - 54, '돌진!', '#ffd860', 9); this.lastBeyCharge = (this.lastBeyCharge || 0) + 1;
      }
      return;
    }
    if (d < R - 0.5) return;
    if (!BEY.lapOk(this, u) || this.time - (u.beyCharge || -9) < 0.15 || this.time < (u.beyNoLap || 0)) return _cw.call(this, u);
    const nx = dx / d, ny = dy / d, vx = Math.cos(u.dir), vy = Math.sin(u.dir), cross = nx * vy - ny * vx;
    u.x = C.cx + nx * R; u.y = C.cy + ny * R;
    u.beyLap = { a: Math.atan2(dy, dx), acc: 0, s: cross >= 0 ? 1 : -1, t: 0 };
    u.dir = fixAngle(u.beyLap.a + u.beyLap.s * (Math.PI / 2 + 0.06));
    this.dust(u.x, u.y); this.ring(u.x, u.y, 2, 12, 0.2, '#ffd860'); playSfx('wall'); this.lastBeyLap = (this.lastBeyLap || 0) + 1;
  };

  // 팽이끼리 부딪히면 외곽 회전 중단 (튕겨 나감)
  const _col = P.collide;
  P.collide = function (a, c) {
    const hit = this.bey && !a.airborne && !c.airborne && Math.hypot(a.x - c.x, a.y - c.y) < 15 * (a.size + c.size);
    const r = _col.call(this, a, c);
    if (hit) for (const u of [a, c]) { u.beyLap = null; u.beyNoLap = this.time + 0.6; } // 충돌 직후 0.6초는 일반 반사
    return r;
  };
  STAGE_HOOKS.push(CLAW, BEY);
  window.StageExt5 = { CLAW, BEY };
})();
