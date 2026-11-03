/* =========================================================
 * 스테이지 확장 8: 바베큐 불판 / 수업 중의 교실
 *  난수는 전부 rand (전투 중 리플레이 시드 난수로 교체됨) → 리플레이 재현
 *  훅은 각자 상태(b.bbq / b.cls)가 있을 때만 동작 (다른 스테이지·서버·탈출 모드 영향 없음)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2, FONT = '"Galmuri11", "Malgun Gothic", sans-serif';
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const steer = (u, ang, rate, dt) => { const d = Math.atan2(Math.sin(ang - u.dir), Math.cos(ang - u.dir)); u.dir = fixAngle(u.dir + clamp(d, -rate * dt, rate * dt)); };
  const canSteer = u => !u.dead && !u.action && !u.airborne && !u.push && !u.pull && !u.ghostChain && !u.climb && !u.blocked('blocksMove') && !u.blocked('blocksAct');
  const mains = b => b.u.filter(u => !u.summon);
  const harmful = u => u.statuses.some(s => { const d = STATUS_DEFS[s.id]; return d && !d.positive; });
  const lerpC = (a, b, t) => { const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  // ---------------- 스테이지 정의 ----------------
  STAGE_DEFS.bbq = {
    name: '바베큐 불판', theme: 'bbq',
    desc: '뜨거운 숯불 불판! 고기 밖에선 열기 게이지가 차고(가득 차면 화상·혼란·깡충), 고기 위에선 식음. 고기는 위에 선 캐릭터가 많을수록 빨리 익음 — 아랫면이 익으면 거대한 손이 뒤집어 위의 캐릭터를 날려 기절, 양면이 다 익으면 손이 집어 가서 위에 있던 캐릭터는 먹힘(즉시 패배)!',
    spawns: [{ x: 180, y: 190 }, { x: 180, y: 470 }],
    // meats: 고정 위치(겹치지 않음), cook: 초당 익힘 { base, per(위의 캐릭터 1명당) }, warn: 예고 { flip, pick }, notice: 집기 예고를 AI가 알아채고 피할 확률, grab: 집기 판정 배율(손바닥 범위), respawn: [최소, 최대]초
    // heat: { gain(고기 밖 초당), cool(고기 위 초당), reset, cd, dmg(최대 체력 비율), conf(혼란 초), hops, seek(AI가 고기로 피하는 열기) }
    bbq: { meats: [{ x: 92, y: 218 }, { x: 268, y: 218 }, { x: 180, y: 330 }, { x: 92, y: 442 }, { x: 268, y: 442 }], rx: 40, ry: 27,
      cook: { base: 0.06, per: 0.25 }, notice: 0.25, grab: 1.3, warn: { flip: 0.6, pick: 0.8 }, respawn: [4, 5], flip: { stun: [1.0, 1.5], h: 48, dur: 0.7 },
      heat: { gain: [10, 12], cool: 6, reset: 40, cd: 2.0, dmg: [0.06, 0.08], conf: 2.5, hops: [3, 4], seek: 45 } }
  };
  STAGE_DEFS.classroom = {
    name: '수업 중의 교실', theme: 'classroom',
    desc: '수업 중 몰래 싸우기! 선생님이 칠판을 보다가 돌아보면(살짝 돌아가는 예고) 싸우던 캐릭터는 그 자리에 멈춰 선생님을 봐야 함. 공중에 떠 있거나 해로운 상태이상·돌진 등 동작 중이라 못 멈추면 들켜서 교탁 옆으로 끌려가 선생님이 다시 칠판을 볼 때까지 아무것도 못 함.',
    spawns: [{ x: 180, y: 270 }, { x: 180, y: 480 }],
    // top: 이동 영역 시작 y (그 위는 칠판·선생님·학생 구역), board/look/warn: 선생님 주기(초), judge: 완전히 돈 뒤 판정까지, students: [최소, 최대]
    classroom: { top: 200, board: [4, 7], look: [1.2, 1.8], warn: 0.5, judge: 0.2, students: [3, 6], drag: 0.5, back: 0.5 }
  };
  STATUS_DEFS.clsFreeze = { name: '얼음!', color: '#bfe4ff', positive: true, blocksMove: true, blocksAct: true, blocksSkill: true, noResistScale: true };
  STATUS_DEFS.clsCaught = { name: '들킴', color: '#ffb0a0', positive: false, blocksMove: true, blocksAct: true, blocksSkill: true, noResistScale: true };

  /* =================== 바베큐 불판 =================== */
  const onMeat = (b, m, u, k = 1) => { const C = b.bbq.C; if (m.state === 'gone') return false; const dx = (u.x - m.x) / (C.rx * k), dy = (u.y - m.y) / (C.ry * k); return dx * dx + dy * dy <= 1; };
  const BQ = {
    match: st => !!st.bbq,
    init(b) {
      if (!b.stage.bbq) return;
      const C = b.stage.bbq;
      b.bbq = { C, meats: C.meats.map((p, i) => ({ i, x: p.x, y: p.y, cook: [0, 0], down: 0, state: 'cook', t: 0, rot: rand(-0.12, 0.12), seed: i * 13 + 5, pop: 0 })), hand: [], stats: { flips: 0, picks: 0, eats: 0, bursts: 0 } };
      for (const u of b.u) { u.bbqHeat = 0; u.bbqCd = 0; u.bbqHop = 0; }
    },
    step(b, dt) {
      const D = b.bbq; if (!D || b.over) return; const C = D.C;
      const ms = mains(b).filter(u => !u.dead);
      for (const m of D.meats) {
        m.t += dt; m.pop = Math.max(0, m.pop - dt * 3);
        if (m.state === 'gone') { if (m.t >= m.wait) { m.state = 'cook'; m.t = 0; m.cook = [0, 0]; m.down = 0; m.rot = rand(-0.12, 0.12); m.pop = 1; } continue; }
        const on = ms.filter(u => !u.airborne && !u.hidden && onMeat(b, m, u));
        if (m.state === 'cook' || m.state === 'flipped') {
          if (m.state === 'flipped' && m.t >= 0.4) { m.state = 'cook'; m.t = 0; }
          m.cook[m.down] = Math.min(1, m.cook[m.down] + (C.cook.base + C.cook.per * on.length) * dt);
          if (m.state === 'cook' && m.cook[m.down] >= 1) { m.state = m.cook[1 - m.down] >= 1 ? 'pickWarn' : 'flipWarn'; m.t = 0; m.notice = rand(0, 1) < C.notice; }
        } else if (m.state === 'flipWarn' && m.t >= C.warn.flip) {
          for (const u of on) {
            u.action = null; u.push = null;
            u.air = { t: 0, dur: C.flip.dur, h: C.flip.h };
            b.applyStatus(u, 'stun', rand(C.flip.stun[0], C.flip.stun[1]), null, { noResistScale: true });
            b.text(u.x, u.y - 70, '뒤집기!', '#ffd08a', 11);
          }
          m.down = 1 - m.down; m.state = 'flipped'; m.t = 0; D.stats.flips++; b.dust(m.x, m.y); b.shock(m.x, m.y, 10, 46, '#ffcf8a', 0.35, 3);
        } else if (m.state === 'pickWarn' && m.t >= C.warn.pick) {
          // 먹힘: 위에 있던(공중 아님) 캐릭터. 양 팀이 동시에 있으면 체력 비율 낮은 쪽부터 — 승부가 나면 나머지는 날려 보냄(무승부 규칙 없음)
          const vic = ms.filter(u => !u.airborne && !u.hidden && onMeat(b, m, u, C.grab)).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp || b.u.indexOf(q) - b.u.indexOf(p));
          for (const u of vic) {
            if (b.over) { u.air = { t: 0, dur: 0.6, h: 40 }; continue; }
            D.stats.eats++; b.text(u.x, u.y - 70, '먹힘!', '#ff6a5a', 13);
            const killer = b.enemy(u); u.bbqEaten = true; b.kill(u, killer);
            if (b.over) { b.endType = 'eaten'; b.resultText = L => `${L(u)} 먹힘! ${L(b.winner)} 승리!`; }
          }
          D.hand.push({ x: m.x, y: m.y, t: 0, dur: 0.7, meat: { cook: m.cook.slice(), rot: m.rot } });
          D.stats.picks++; m.state = 'gone'; m.t = 0; m.wait = rand(C.respawn[0], C.respawn[1]);
        }
      }
      for (const h of D.hand) h.t += dt; D.hand = D.hand.filter(h => h.t < h.dur);
      // 열기 게이지
      for (const u of ms) {
        if (u.bbqHop > 0 && !u.air && !u.climb) { u.bbqHop--; u.air = { t: 0, dur: 0.36, h: 16, noLand: true }; }
        if (u.bbqCd > 0) { u.bbqCd -= dt; continue; }
        if (u.airborne) continue;
        const safe = D.meats.some(m => onMeat(b, m, u));
        u.bbqHeat = clamp(u.bbqHeat + (safe ? -C.heat.cool : rand(C.heat.gain[0], C.heat.gain[1])) * dt, 0, 100);
        if (u.bbqHeat >= 100) {
          D.stats.bursts++; u.bbqHeat = C.heat.reset; u.bbqCd = C.heat.cd;
          b.damage(u, b.enemy(u) || u, u.maxHp * rand(C.heat.dmg[0], C.heat.dmg[1]), { dot: true, element: 'fire' });
          if (!u.dead) { b.applyStatus(u, 'confusion', C.heat.conf, null, { noResistScale: true }); u.bbqHop = Math.round(rand(C.heat.hops[0], C.heat.hops[1] + 0.49)); }
          b.text(u.x, u.y - 84, '앗뜨거!', '#ff8a3a', 12); b.shock(u.x, u.y - 10, 8, 34, '#ff7a2a', 0.35, 3);
        }
        // AI: 집기 예고 고기에서 도망, 뜨거우면 가까운 안전한 고기로
        if (!canSteer(u)) continue;
        const here = D.meats.find(m => onMeat(b, m, u));
        if (here && here.state === 'pickWarn' && here.notice) steer(u, Math.atan2(u.y - here.y, u.x - here.x), 9, dt);
        else if (!here && u.bbqHeat > C.heat.seek) {
          let best = null, bd = 1e9; for (const m of D.meats) { if (m.state === 'gone' || m.state === 'pickWarn') continue; const d = Math.hypot(m.x - u.x, m.y - u.y); if (d < bd) { bd = d; best = m; } }
          if (best) steer(u, Math.atan2(best.y - u.y, best.x - u.x), 5, dt);
        }
      }
    },
    floor(x, st) {
      if (!st.bbq) return;
      x.save(); x.fillStyle = '#17110f'; x.fillRect(AR.x, AR.y, AR.w, AR.h);
      // 숯 (고정 패턴)
      let s = 7; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 260; i++) { const cx = AR.x + r() * AR.w, cy = AR.y + r() * AR.h, w = 6 + r() * 12; x.fillStyle = r() < 0.18 ? '#5a2312' : r() < 0.5 ? '#2a2220' : '#221c1a'; x.fillRect(Math.round(cx), Math.round(cy), Math.round(w), Math.round(w * 0.6)); }
      // 석쇠
      x.fillStyle = '#5b5856'; for (let yy = AR.y + 8; yy < AR.y + AR.h; yy += 14) x.fillRect(AR.x, yy, AR.w, 2);
      x.fillStyle = '#8d8986'; for (let yy = AR.y + 8; yy < AR.y + AR.h; yy += 14) x.fillRect(AR.x, yy, AR.w, 1);
      x.fillStyle = '#4a4745'; for (let xx = AR.x + 24; xx < AR.x + AR.w; xx += 56) x.fillRect(xx, AR.y, 2, AR.h);
      x.strokeStyle = '#6e6a66'; x.lineWidth = 4; x.strokeRect(AR.x + 2, AR.y + 2, AR.w - 4, AR.h - 4);
      x.restore();
    },
    drawUnder(ctx, b, thumb) {
      const D = b.bbq; if (!D) return; const C = D.C, T = thumb ? 0 : b.time;
      ctx.save();
      // 숯불 깜빡임
      for (let i = 0; i < 9; i++) {
        const gx = AR.x + 30 + (i * 97) % (AR.w - 60), gy = AR.y + 40 + (i * 151) % (AR.h - 80), a = 0.1 + 0.07 * Math.sin(T * (2 + i % 3) + i);
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 46); g.addColorStop(0, `rgba(255,110,30,${a})`); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.fillRect(gx - 46, gy - 46, 92, 92);
      }
      for (const m of D.meats) if (m.state !== 'gone') drawMeat(ctx, b, m, C, T);
      ctx.restore();
    },
    drawOver(ctx, b) {
      const D = b.bbq; if (!D) return;
      for (const u of mains(b)) { // 열기 게이지 (산소 게이지와 같은 모양)
        if (u.dead || u.hidden || !(u.bbqHeat > 0.5)) continue;
        const r = u.bbqHeat / 100, x = u.x + u.kx, top = Math.round(u.y + u.ky - 57 - b.airZ(u));
        ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = 'rgba(28,14,10,0.8)'; ctx.fillRect(x - 15, top, 30, 6);
        ctx.fillStyle = r > 0.7 ? (Math.floor(b.time * 8) % 2 ? '#ff5a3a' : '#ffd23a') : '#ffa040'; ctx.fillRect(x - 9, top + 2, 22 * r, 2);
        ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.moveTo(x - 12, top + 0.5); ctx.quadraticCurveTo(x - 9.5, top + 4, x - 12, top + 5.5); ctx.quadraticCurveTo(x - 14.5, top + 4, x - 12, top + 0.5); ctx.fill();
        ctx.restore();
      }
    },
    drawTop(ctx, b) { // 거대한 손 (예고 하강 → 뒤집기 / 집어 올리기)
      const D = b.bbq; if (!D) return; const C = D.C;
      for (const m of D.meats) {
        if (m.state === 'flipWarn') drawHand(ctx, m.x, m.y - 10 - 120 * (1 - m.t / C.warn.flip) ** 2, 0.85, false);
        else if (m.state === 'flipped') drawHand(ctx, m.x, m.y - 10 - 90 * (m.t / 0.4), 0.85, true);
        else if (m.state === 'pickWarn') drawHand(ctx, m.x, m.y - 10 - 120 * (1 - m.t / C.warn.pick) ** 2, 0.85, false);
      }
      for (const h of D.hand) { const y = h.y - 10 - 260 * (h.t / h.dur) ** 1.5; drawMeat(ctx, b, { x: h.x, y: y + 12, cook: h.meat.cook, down: 0, rot: h.meat.rot, state: 'held', t: 0, pop: 0 }, C, b.time); drawHand(ctx, h.x, y, 0.85, true); }
    }
  };
  function drawMeat(ctx, b, m, C, T) {
    const s = 1 + m.pop * 0.25, rx = C.rx * s, ry = C.ry * s, top = m.cook[1 - m.down], bot = m.cook[m.down];
    ctx.save(); ctx.translate(m.x, m.y);
    if (m.state === 'flipWarn' || m.state === 'pickWarn') { // 손 그림자 예고
      const w = m.state === 'pickWarn', p = m.t / (w ? C.warn.pick : C.warn.flip);
      ctx.fillStyle = `rgba(0,0,0,${0.25 + 0.3 * p})`; ctx.beginPath(); ctx.ellipse(0, 4, rx * (0.6 + 0.5 * p), ry * (0.6 + 0.5 * p), 0, 0, TAU); ctx.fill();
      if (w) { ctx.strokeStyle = Math.floor(T * 10) % 2 ? '#ff3a2a' : '#ffd0a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, rx + 5, ry + 5, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ff3a2a'; ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('!', 0, -ry - 8); }
    }
    let sc = 1; if (m.state === 'flipped') sc = Math.abs(Math.cos(Math.min(1, m.t / 0.4) * Math.PI)); // 뒤집히는 연출 (세로 납작)
    ctx.rotate(m.rot); ctx.scale(1, Math.max(0.15, sc));
    ctx.fillStyle = lerpC('#c75a4a', '#2a120a', Math.max(0, bot - 0.2)); ctx.beginPath(); ctx.ellipse(0, 3, rx, ry, 0, 0, TAU); ctx.fill(); // 아랫면 가장자리
    ctx.fillStyle = lerpC('#ef8f98', '#9a5426', top); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = lerpC('#fff1e8', '#e9c48a', top); ctx.globalAlpha = 0.85; // 지방 마블링
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-rx * 0.5 + i * rx * 0.34, -ry * 0.25 + (i % 2) * ry * 0.45, rx * 0.16, ry * 0.08, 0.5, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (top > 0.5) { ctx.strokeStyle = `rgba(40,16,6,${(top - 0.5) * 1.6})`; ctx.lineWidth = 3; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 13 - 8, -ry * 0.7); ctx.lineTo(i * 13 + 8, ry * 0.7); ctx.stroke(); } }
    ctx.restore();
    if (m.state === 'cook' && !b.over) { // 아랫면 익힘 진행 (작은 호)
      ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(m.x + C.rx - 4, m.y - C.ry + 2, 5, 0, TAU); ctx.stroke();
      ctx.strokeStyle = m.cook[1 - m.down] >= 1 ? '#ff7a5a' : '#ffd28a'; ctx.beginPath(); ctx.arc(m.x + C.rx - 4, m.y - C.ry + 2, 5, -Math.PI / 2, -Math.PI / 2 + TAU * bot); ctx.stroke(); ctx.restore();
    }
    if (T > 0 && bot > 0.05 && m.state !== 'held') { const k = Math.floor(T * 3 + m.seed) % 3; ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#e8e0d8'; ctx.beginPath(); ctx.arc(m.x - 12 + k * 12, m.y - C.ry - 4 - (T * 20 + m.seed * 3) % 16, 3 + k, 0, TAU); ctx.fill(); ctx.restore(); } // 연기
  }
  function drawHand(ctx, x, y, s, grab) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#3d5a8a'; ctx.fillRect(-20, -400, 40, 362); ctx.fillStyle = '#e9edf3'; ctx.fillRect(-22, -46, 44, 10); // 소매
    ctx.fillStyle = '#f2c7a0'; ctx.strokeStyle = '#a8785a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-22, -38, 44, 34, 9) : ctx.rect(-22, -38, 44, 34); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 4; i++) { const fx = -18 + i * 12, fl = grab ? 12 : 20 - Math.abs(i - 1.5) * 3; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(fx - 4, -8, 9, fl, 4) : ctx.rect(fx - 4, -8, 9, fl); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(-25, -16, 6, 11, -0.5, 0, TAU); ctx.fill(); ctx.stroke(); // 엄지
    ctx.restore();
  }

  /* =================== 수업 중의 교실 =================== */
  function drawBack(ctx, def, s) { // 뒷모습 (sprite.back 없으면 머리 부분을 머리색으로 덮음, 아이돌 무대와 같은 방식)
    if (s.back) { Sprites.draw(ctx, s.back, 0, false); return; }
    Sprites.draw(ctx, s, 0, false);
    const hair = (def.sprite && def.sprite.pal && def.sprite.pal.H) || '#555';
    ctx.save(); ctx.beginPath(); ctx.rect(-s.dw / 2, -s.dh + s.foot, s.dw, s.dh * 0.42); ctx.clip(); Sprites.drawTint(ctx, s, 0, hair); ctx.restore();
  }
  const CL = {
    match: st => !!st.classroom,
    init(b) {
      if (!b.stage.classroom) return;
      const C = b.stage.classroom;
      b.play = { x: AR.x, y: C.top, w: AR.w, h: AR.y + AR.h - C.top };
      const ids = new Set(b.u.map(u => u.def.id));
      for (const u of b.u) if (u.def.partner) ids.add(u.def.partner.id);
      const pool = CHARACTERS.filter(c => !ids.has(c.id) && c.sprite && !c.noDraw);
      const pick = () => pool.splice(Math.floor(rand(0, pool.length - 1e-9)), 1)[0];
      const teacher = pick() || CHARACTERS[0];
      const n = Math.min(pool.length, Math.floor(rand(C.students[0], C.students[1] + 1 - 1e-9)));
      const slots = [44, 316, 102, 258, 150, 210].slice(0, n).sort((a, c) => a - c);
      const studs = slots.map((x, i) => ({ def: pick(), x, y: 196, ph: rand(0, TAU) }));
      b.cls = { C, teacher, studs, phase: 'board', t: 0, dur: rand(C.board[0], C.board[1]), judged: false, stats: { looks: 0, freezes: 0, caught: 0 } };
      for (const u of b.u) { u.clsSpot = null; }
    },
    noClamp(b, u) { return !!(b.cls && u.clsDrag); },
    step(b, dt) {
      const D = b.cls; if (!D || b.over) return; const C = D.C;
      D.t += dt;
      if (D.phase === 'board' && D.t >= D.dur) { D.phase = 'warn'; D.t = 0; D.judged = false; D.stats.looks++; }
      else if (D.phase === 'warn' && D.t >= C.warn) { D.phase = 'look'; D.t = 0; D.dur = rand(C.look[0], C.look[1]); sys(b, '선생님이 돌아봤다!'); }
      else if (D.phase === 'look' && D.t >= D.dur) { // 다시 칠판으로: 얼음 해제, 들킨 캐릭터 복귀
        D.phase = 'board'; D.t = 0; D.dur = rand(C.board[0], C.board[1]);
        for (const u of b.u) {
          u.statuses = u.statuses.filter(s => s.id !== 'clsFreeze');
          if (u.clsDrag) { const D2 = u.clsDrag; D2.back = true; D2.t = 0; D2.x0 = u.x; D2.y0 = u.y; const q = b.clampPos(D2.hx, D2.hy, u.pad, null); D2.x1 = q.x; D2.y1 = q.y; }
        }
      }
      const watching = D.phase === 'warn' || D.phase === 'look';
      for (const u of b.u) {
        if (u.dead) continue;
        const G = u.clsDrag;
        if (G) { // 끌려감 / 복귀 (걸어가듯 보간)
          G.t += dt; const p = clamp(G.t / (G.back ? C.back : C.drag), 0, 1), e = p * p * (3 - 2 * p);
          u.x = G.x0 + (G.x1 - G.x0) * e; u.y = G.y0 + (G.y1 - G.y0) * e - Math.abs(Math.sin(p * Math.PI * 4)) * 3; u.push = null; u.pull = null; u.action = null;
          if (Math.abs(G.x1 - G.x0) > 2) u.facing = G.x1 > G.x0 ? 1 : -1;
          if (!G.back) u.lookUp = true;
          if (G.back && p >= 1) { u.clsDrag = null; u.statuses = u.statuses.filter(s => s.id !== 'clsCaught'); }
          continue;
        }
        if (!watching) continue;
        const frozen = u.status('clsFreeze');
        if (!frozen && !u.airborne && !u.action && !u.push && !u.pull && !u.climb && !u.hidden && !harmful(u)) {
          u.statuses.push({ id: 'clsFreeze', t: 99, dur: 99, src: null });
          if (!u.summon) D.stats.freezes++;
        }
        if (u.status('clsFreeze')) u.lookUp = true; // 선생님 쪽을 봄
      }
      if (D.phase === 'look' && !D.judged && D.t >= C.judge) {
        D.judged = true;
        for (const u of mains(b)) {
          if (u.dead || u.hidden || u.clsDrag || u.status('clsFreeze')) continue;
          D.stats.caught++;
          u.statuses = u.statuses.filter(s => s.id !== 'clsFreeze');
          u.statuses.push({ id: 'clsCaught', t: 99, dur: 99, src: null });
          u.action = null; u.air = null;
          const side = u.team ? 1 : -1, k = mains(b).filter(o => o.clsDrag && o.team === u.team).length;
          u.clsDrag = { t: 0, x0: u.x, y0: u.y, x1: 180 + side * (40 + k * 20), y1: 178, hx: u.x, hy: u.y, back: false };
          b.text(u.x, u.y - 70, '들켰다!', '#ff8a7a', 12);
          sys(b, `${u.def.name} 수업 중 딴짓하다 들킴!`);
        }
      }
    },
    floor(x, st) {
      if (!st.classroom) return; const top = st.classroom.top;
      x.save();
      x.fillStyle = '#b98a58'; x.fillRect(AR.x, AR.y, AR.w, AR.h); // 마룻바닥
      for (let yy = top; yy < AR.y + AR.h; yy += 16) { x.fillStyle = 'rgba(80,48,20,0.35)'; x.fillRect(AR.x, yy, AR.w, 1); for (let xx = AR.x + ((yy / 16) % 2) * 40; xx < AR.x + AR.w; xx += 80) x.fillRect(xx, yy, 1, 16); }
      x.fillStyle = '#d9d2b8'; x.fillRect(AR.x, AR.y, AR.w, top - AR.y - 26); // 벽
      x.fillStyle = '#8a6a44'; x.fillRect(AR.x, top - 30, AR.w, 4);
      x.fillStyle = '#6b4a2a'; x.fillRect(48, AR.y + 6, 264, 46); x.fillStyle = '#2f5a3c'; x.fillRect(52, AR.y + 10, 256, 38); // 칠판
      x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = `9px ${FONT}`; x.textAlign = 'left'; x.fillText('1 + 1 = 2   오늘의 학습: 평화', 62, AR.y + 26); x.fillText('숙제: 싸우지 않기', 62, AR.y + 40);
      x.fillStyle = '#efe6d0'; x.fillRect(60, AR.y + 52, 18, 3);
      x.fillStyle = '#a9c8e6'; x.fillRect(AR.x + 4, AR.y + 10, 30, 36); x.fillRect(AR.x + AR.w - 34, AR.y + 10, 30, 36); // 창문
      x.fillStyle = '#e8e2d0'; x.fillRect(AR.x + 18, AR.y + 10, 2, 36); x.fillRect(AR.x + AR.w - 20, AR.y + 10, 2, 36);
      x.fillStyle = '#9a7a52'; x.fillRect(AR.x, top - 26, AR.w, 26); x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(AR.x, top - 4, AR.w, 4); // 교단
      x.restore();
    },
    drawUnder(ctx, b, thumb) {
      const D = b.cls; if (!D) return; const T = thumb ? 0 : b.time;
      const facing = D.phase === 'look' || (D.phase === 'warn' && D.t > D.C.warn * 0.6);
      // 선생님 (교탁 뒤)
      const ts = Sprites.get(D.teacher), tx = 180, ty = 168;
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(tx, ty + 1, 13, 4, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.translate(tx + (D.phase === 'warn' ? Math.sin(D.t * 40) * 1.2 : 0), ty);
      if (facing) Sprites.draw(ctx, ts, 0, false); else drawBack(ctx, D.teacher, ts);
      ctx.restore();
      ctx.save(); ctx.fillStyle = '#7a5530'; ctx.fillRect(tx - 22, ty - 18, 44, 22); ctx.fillStyle = '#5e3f22'; ctx.fillRect(tx - 22, ty - 18, 44, 4); ctx.restore(); // 교탁
      if (D.phase === 'warn' && !thumb) { ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(tx + 22, ty - 62, 9, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#d33'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('?', tx + 22, ty - 58); ctx.restore(); }
      // 학생 + 책상 (선생님이 칠판 보면 싸움 구경, 돌아보면 선생님 봄)
      for (const s of D.studs) {
        const sp = Sprites.get(s.def), look = facing, sx = s.x, sy = s.y, bob = T ? Math.max(0, Math.sin(T * 3 + s.ph)) * -1 : 0;
        ctx.save(); ctx.translate(sx, sy + bob); ctx.scale(0.72, 0.72);
        if (look) drawBack(ctx, s.def, sp);
        else { const near = mains(b).filter(u => !u.dead)[0]; ctx.scale(near && near.x < sx ? -1 : 1, 1); Sprites.draw(ctx, sp, 0, false); }
        ctx.restore();
        ctx.save(); ctx.fillStyle = '#c9a06a'; ctx.fillRect(sx - 15, sy - 4, 30, 9); ctx.fillStyle = '#8f6a3e'; ctx.fillRect(sx - 15, sy + 5, 30, 2); ctx.fillRect(sx - 13, sy + 7, 2, 4); ctx.fillRect(sx + 11, sy + 7, 2, 4); ctx.restore();
      }
    },
    drawTop(ctx, b) {
      const D = b.cls; if (!D || b.over) return;
      if (D.phase === 'warn' || D.phase === 'look') {
        ctx.save(); const msg = D.phase === 'warn' ? '헉, 선생님이 돌아본다!' : '얼음! (움직이면 들킴)';
        ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center'; const w = ctx.measureText(msg).width + 14;
        ctx.fillStyle = 'rgba(20,20,30,0.7)'; ctx.fillRect(180 - w / 2, D.C.top + 4, w, 17);
        ctx.fillStyle = D.phase === 'warn' ? '#ffe08a' : '#bfe4ff'; ctx.fillText(msg, 180, D.C.top + 16); ctx.restore();
      }
    }
  };

  STAGE_HOOKS.push(BQ, CL);
  window.StageExt8 = { BQ, CL };
})();
