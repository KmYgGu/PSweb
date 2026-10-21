/* =========================================================
 * 확장 스테이지 로직 2 (STAGE_HOOKS): 공사 타워, 스트리트 파이트
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const R = u => 11 + u.pad;
  const reflect = (u, nx, ny, rnd = 0.2) => {
    let vx = Math.cos(u.dir), vy = Math.sin(u.dir); const d = vx * nx + vy * ny;
    if (d < 0) { vx -= 2 * d * nx; vy -= 2 * d * ny; u.dir = fixAngle(Math.atan2(vy, vx) + rand(-rnd, rnd)); return true; }
    return false;
  };
  const isDash = u => u.action && ['dash', 'chase', 'charge', 'combo'].includes(u.action.type);
  // 원 vs 직사각형: 밖으로 밀어내고 법선 반환
  function pushOutRect(u, rc) {
    const r = R(u), qx = clamp(u.x, rc.x, rc.x + rc.w), qy = clamp(u.y, rc.y, rc.y + rc.h);
    let dx = u.x - qx, dy = u.y - qy, d = Math.hypot(dx, dy);
    if (d >= r) return null;
    if (d < 1e-3) { // 중심이 안쪽: 가장 가까운 변으로
      const l = u.x - rc.x, rr = rc.x + rc.w - u.x, t = u.y - rc.y, bb = rc.y + rc.h - u.y, m = Math.min(l, rr, t, bb);
      if (m === l) { u.x = rc.x - r; return [-1, 0]; } if (m === rr) { u.x = rc.x + rc.w + r; return [1, 0]; }
      if (m === t) { u.y = rc.y - r; return [0, -1]; } u.y = rc.y + rc.h + r; return [0, 1];
    }
    dx /= d; dy /= d; u.x = qx + dx * r; u.y = qy + dy * r; return [dx, dy];
  }
  function bounce(b, u, n, rnd, quiet) {
    if (!quiet && b.wallImpact) b.wallImpact(u, n[0], n[1]);
    if (isDash(u)) { u.action = null; u.dir = fixAngle(Math.atan2(n[1], n[0]) + rand(-0.5, 0.5)); } else reflect(u, n[0], n[1], rnd);
    if (b.time - (u.wallT || -1) > 0.12) { u.wallT = b.time; b.dust(u.x, u.y); }
  }

  // ===================== 공사 타워 =====================
  const TOWER = {
    match: st => !!st.tower,
    init(b) {
      const T = b.stage.tower; if (!T) return;
      b.tw = { T, btns: T.buttons.map(p => ({ ...p, pressT: 0, cdT: 0, down: false })), hatch: { open: 0, phase: 'closed', t: 0 } };
      b.stats.hatchTriggers = 0; b.stats.hatchFalls = 0; b.stats.hatchDodges = 0;
    },
    onHatch(T, u) { const h = T.hatch; return u.x > h.x && u.x < h.x + h.w && u.y > h.y && u.y < h.y + h.h; },
    step(b, dt) {
      const tw = b.tw; if (!tw) return;
      const T = tw.T, H = tw.hatch;
      // 해치 상태: closed → opening → open(벽) → closing
      if (H.phase === 'opening') { H.open = Math.min(1, H.open + dt / T.openT); if (H.open >= 1) { H.phase = 'open'; H.t = T.holdT; } }
      else if (H.phase === 'open') { H.t -= dt; if (H.t <= 0) H.phase = 'closing'; }
      else if (H.phase === 'closing') { H.open = Math.max(0, H.open - dt / T.closeT); if (H.open <= 0) { H.phase = 'closed'; b.hooks.onSystem && b.hooks.onSystem('해치가 닫혔습니다.'); } }
      for (const bt of tw.btns) { bt.pressT = Math.max(0, bt.pressT - dt); bt.cdT = Math.max(0, bt.cdT - dt); }
      for (const u of b.u) {
        if (u.dead) continue;
        // 해치가 일부라도 열려 있으면 벽
        if (H.open > T.wallAt) { const n = pushOutRect(u, T.hatch); if (n) bounce(b, u, n, 0.3); }
        // 버튼
        for (const bt of tw.btns) {
          const on = !u.air && Math.hypot(u.x - bt.x, u.y - bt.y) < bt.r + 6;
          if (on && !bt.down) {
            bt.down = true; bt.pressT = 0.25;
            if (bt.cdT <= 0 && H.phase === 'closed' && !b.over) { // 누르면 항상 개방 (닫힐 때까지 + btnCd 동안 재작동 불가)
              for (const o of tw.btns) o.cdT = T.btnCd + T.openT + T.holdT + T.closeT;
              H.phase = 'opening'; H.open = 0; b.stats.hatchTriggers++;
              b.hooks.onSystem && b.hooks.onSystem(`${u.def.name}: 버튼 작동! 해치 개방!`);
              b.shake && b.shake(2);
              for (const o of b.u) if (!o.dead && !b.over && TOWER.onHatch(T, o)) {
                if (o.air || o.evadeT > 0) b.stats.hatchDodges++; // 공중/회피 중이면 버티고 벽에 튕겨나감
                else TOWER.drop(b, o, b.enemy(o));
              }
            }
          }
          if (!on && bt.down && !b.u.some(o => !o.dead && Math.hypot(o.x - bt.x, o.y - bt.y) < bt.r + 6)) bt.down = false;
        }
      }
    },
    drop(b, u, presser) {
      b.stats.hatchFalls++;
      u.dead = true; u.fallen = { t: 0, side: 'hole', x: u.x, y: u.y }; u.action = null; u.statuses = [];
      if (b.teamAlive(u.team)) { b.hooks.onSystem && b.hooks.onSystem(u.def.name + ' 해치로 추락!'); b.allyDown(u); b.hitstop(0.12); return; } // 팀원이 남아 있으면 계속
      if (presser.team === u.team) presser = b.teamBest(1 - u.team);
      b.over = true; b.winner = presser; b.fallen = u; b.endType = 'hatch';
      b.resultText = label => `${label(u)} 해치로 추락! ${label(presser)} 승리!`;
      b.hooks.onSystem && b.hooks.onSystem(u.def.name + ' 해치로 추락!');
      b.say(presser, 'win'); b.hitstop(0.2);
    },
    floor(x, st) {
      const T = st.tower; if (!T) return;
      x.fillStyle = '#6b6258'; x.fillRect(AR.x, AR.y, AR.w, AR.h);                       // 콘크리트 슬래브
      for (let j = 0; j < AR.h; j += 41) for (let i = 0; i < AR.w; i += 48) { x.fillStyle = (i / 48 + j / 41) % 2 ? '#716860' : '#675e55'; x.fillRect(AR.x + i, AR.y + j, 48, 41); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(AR.x + i, AR.y + j, 48, 1); x.fillRect(AR.x + i, AR.y + j, 1, 41); }
      for (let i = 0; i < 120; i++) { x.fillStyle = i % 3 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'; x.fillRect(AR.x + (i * 97) % AR.w, AR.y + (i * 61) % AR.h, 2, 2); }
      // 가장자리 경고 띠
      const stripe = (rx, ry, rw, rh) => { x.save(); x.beginPath(); x.rect(rx, ry, rw, rh); x.clip(); x.fillStyle = '#e8b82a'; x.fillRect(rx, ry, rw, rh); x.fillStyle = '#2a2622'; for (let k = -rh - rw; k < rw + rh; k += 12) { x.beginPath(); x.moveTo(rx + k, ry); x.lineTo(rx + k + 6, ry); x.lineTo(rx + k + 6 + rh, ry + rh); x.lineTo(rx + k + rh, ry + rh); x.fill(); } x.restore(); };
      stripe(AR.x, AR.y, AR.w, 6); stripe(AR.x, AR.y + AR.h - 6, AR.w, 6); stripe(AR.x, AR.y, 6, AR.h); stripe(AR.x + AR.w - 6, AR.y, 6, AR.h);
      // 철골 기둥, 자재
      x.fillStyle = '#8a3a2a'; for (const [px, py] of [[40, 300], [320, 300], [180, 160], [180, 490]]) { x.fillRect(px - 5, py - 5, 10, 10); x.fillStyle = '#6a2a1e'; x.fillRect(px - 5, py + 3, 10, 2); x.fillStyle = '#8a3a2a'; }
      x.fillStyle = '#9a7a4a'; x.fillRect(270, 150, 40, 8); x.fillRect(274, 160, 36, 8); x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(270, 157, 40, 1);
      x.fillStyle = '#8c8c94'; x.fillRect(50, 470, 30, 18); x.fillStyle = '#74747c'; x.fillRect(50, 484, 30, 4);
      // 해치 주변 경고 띠
      const h = T.hatch; stripe(h.x - 6, h.y - 6, h.w + 12, 6); stripe(h.x - 6, h.y + h.h, h.w + 12, 6); stripe(h.x - 6, h.y, 6, h.h); stripe(h.x + h.w, h.y, 6, h.h);
    },
    drawUnder(ctx, b, thumb) {
      const tw = b.tw; if (!tw) return;
      const T = tw.T, h = T.hatch, o = thumb ? 0 : tw.hatch.open, hw = h.w / 2;
      ctx.save();
      // 구멍 (열린 만큼)
      ctx.fillStyle = '#0a0a0e'; ctx.fillRect(h.x, h.y, h.w, h.h);
      if (o > 0) { const g = ctx.createRadialGradient(h.x + hw, h.y + h.h / 2, 4, h.x + hw, h.y + h.h / 2, h.w * 0.7); g.addColorStop(0, '#000'); g.addColorStop(1, '#1c1a20'); ctx.fillStyle = g; ctx.fillRect(h.x, h.y, h.w, h.h); }
      // 양쪽으로 미닫이 철판
      const sl = hw * o;
      for (const [dx, dir] of [[h.x - sl, -1], [h.x + hw + sl, 1]]) {
        ctx.fillStyle = '#5a6068'; ctx.fillRect(dx, h.y, hw, h.h);
        ctx.fillStyle = '#6c737c'; for (let yy = h.y + 4; yy < h.y + h.h - 2; yy += 8) for (let xx = dx + 3 + ((yy / 8) % 2) * 4; xx < dx + hw - 3; xx += 8) ctx.fillRect(xx, yy, 3, 1);
        ctx.fillStyle = '#3e434a'; ctx.fillRect(dir < 0 ? dx + hw - 2 : dx, h.y, 2, h.h);
      }
      if (o > 0 && o < 1) { ctx.strokeStyle = 'rgba(255,200,80,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1); }
      // 버튼
      for (const bt of tw.btns) {
        const p = bt.down || bt.pressT > 0 ? 1 : 0, ready = bt.cdT <= 0;
        ctx.fillStyle = '#3a3a40'; ctx.fillRect(bt.x - bt.r - 4, bt.y - bt.r - 2, (bt.r + 4) * 2, (bt.r + 4) * 2);
        ctx.fillStyle = '#26262a'; ctx.beginPath(); ctx.ellipse(bt.x, bt.y + 3, bt.r, bt.r * 0.75, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = ready ? '#d83a32' : '#7a4a46'; ctx.beginPath(); ctx.ellipse(bt.x, bt.y - 3 + p * 4, bt.r - 2, (bt.r - 2) * 0.72, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(bt.x - 4, bt.y - 6 + p * 4, 4, 2, 0, 0, TAU); ctx.fill();
        if (!thumb && !ready) { ctx.strokeStyle = 'rgba(255,220,120,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bt.x, bt.y, bt.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - bt.cdT / T.btnCd)); ctx.stroke(); }
      }
      ctx.restore();
    },
  };

  // ===================== 스트리트 파이트 =====================
  const STREET = {
    match: st => !!st.street,
    init(b) {
      const S = b.stage.street; if (!S) return;
      const f = S.fence, segs = [];
      const add = (x0, y0, x1, y1, n) => { for (let i = 0; i < n; i++) segs.push({ x0: x0 + (x1 - x0) * i / n, y0: y0 + (y1 - y0) * i / n, x1: x0 + (x1 - x0) * (i + 1) / n, y1: y0 + (y1 - y0) * (i + 1) / n, hp: S.segHp, max: S.segHp, broken: false, hitT: -9, flash: 0 }); };
      add(f.x, f.y, f.x + f.w, f.y, S.segsX); add(f.x + f.w, f.y, f.x + f.w, f.y + f.h, S.segsY);
      add(f.x + f.w, f.y + f.h, f.x, f.y + f.h, S.segsX); add(f.x, f.y + f.h, f.x, f.y, S.segsY);
      // 관중: 싸우는 둘을 뺀 캐릭터 (중복 허용)
      const ids = new Set(b.u.map(u => u.def.id)), pool = CHARACTERS.filter(c => !ids.has(c.id)), crowd = [];
      const src = pool.length ? pool : CHARACTERS;
      for (let tries = 0; crowd.length < S.crowd && tries < 4000; tries++) {
        const def = src[crowd.length % src.length], sp = Sprites.get(def), cr = 11 + 15 * ((def.size || 1) - 1), hw = Math.max(cr, sp.dw * 0.32); // 실제 전투 크기 기준 반경
        const x = rand(AR.x + hw + 2, AR.x + AR.w - hw - 2), y = rand(AR.y + Math.min(sp.dh * 0.7, 60), AR.y + AR.h - 6);
        if (x > f.x - hw - 10 && x < f.x + f.w + hw + 10 && y > f.y - cr - 8 && y < f.y + f.h + Math.max(cr + 8, sp.dh * 0.55)) continue;
        if (crowd.some(c => Math.abs(c.x - x) < c.hw + hw + 4 && Math.abs(c.y - y) < Math.max(c.cr + cr + 4, Math.min(c.dh, sp.dh) * 0.5))) continue;
        crowd.push({ x, y, def, cr, hw, dh: sp.dh, face: Math.random() < 0.5 ? -1 : 1, ph: rand(0, TAU), fly: null, gone: false });
      }
      crowd.sort((a, c) => a.y - c.y);
      b.st2 = { S, segs, crowd };
      b.stats.fenceBroken = 0; b.stats.crowdHit = 0;
    },
    hitSeg(b, s, dmg, x, y) {
      if (s.broken || b.time - s.hitT < 0.15) return;
      s.hitT = b.time; s.hp -= dmg; s.flash = 0.12;
      b.dust(x, y);
      if (s.hp <= 0) {
        s.broken = true; b.stats.fenceBroken++;
        b.hooks.onSystem && b.hooks.onSystem('철망이 뚫렸습니다!');
        for (let i = 0; i < 14; i++) { const k = Math.random(); b.parts.push({ x: s.x0 + (s.x1 - s.x0) * k, y: s.y0 + (s.y1 - s.y0) * k - 8, vx: rand(-60, 60), vy: rand(-90, -20), g: 300, life: rand(0.4, 0.8), max: 0.8, color: i % 2 ? '#9aa0a8' : '#6a7078', size: rand(1.5, 3) }); }
        b.shake && b.shake(2);
      }
    },
    step(b, dt) {
      const sb = b.st2; if (!sb) return;
      for (const s of sb.segs) s.flash = Math.max(0, s.flash - dt);
      for (const u of b.u) {
        if (u.dead || u.air) continue;
        const r = R(u);
        for (const s of sb.segs) {
          if (s.broken) continue;
          const vx = s.x1 - s.x0, vy = s.y1 - s.y0, L2 = vx * vx + vy * vy, t = clamp(((u.x - s.x0) * vx + (u.y - s.y0) * vy) / L2, 0, 1);
          const qx = s.x0 + vx * t, qy = s.y0 + vy * t; let dx = u.x - qx, dy = u.y - qy; const d = Math.hypot(dx, dy);
          if (d >= r) continue;
          if (d < 1e-3) { const l = Math.sqrt(L2); dx = -vy / l; dy = vx / l; } else { dx /= d; dy /= d; }
          const imp = -(Math.cos(u.dir) * dx + Math.sin(u.dir) * dy) * u.speed, dash = isDash(u);
          u.x = qx + dx * r; u.y = qy + dy * r;
          if (imp > 40 || dash) STREET.hitSeg(b, s, dash ? sb.S.dashDmg : sb.S.bumpDmg + u.speed * sb.S.bumpK, qx, qy);
          bounce(b, u, [dx, dy], 0.3);
        }
        for (const c of sb.crowd) { // 관중: 튕겨나기만 (피해 없음), 관중은 날아가 사라짐
          if (c.fly || c.gone) continue;
          const dx = u.x - c.x, dy = u.y - c.y, d = Math.hypot(dx, dy);
          if (d < r + c.cr) {
            const n = d > 1e-3 ? [dx / d, dy / d] : [0, -1]; u.x = c.x + n[0] * (r + c.cr); u.y = c.y + n[1] * (r + c.cr);
            bounce(b, u, n, 0.3, true); // 관중(사람)은 장애물 소리 없음
            c.fly = { t: 0, vx: -n[0] * 90 + rand(-20, 20), spin: (Math.random() < 0.5 ? -1 : 1) * rand(9, 14) }; b.stats.crowdHit++;
          }
        }
      }
      // 투사체는 철망에 막힘 (철망 손상)
      for (const p of b.proj) {
        if (p.life <= 0) continue; const py = p.y + 14;
        for (const s of sb.segs) {
          if (s.broken) continue;
          const vx = s.x1 - s.x0, vy = s.y1 - s.y0, L2 = vx * vx + vy * vy, t = clamp(((p.x - s.x0) * vx + (py - s.y0) * vy) / L2, 0, 1);
          if (Math.hypot(p.x - (s.x0 + vx * t), py - (s.y0 + vy * t)) < 5) { STREET.hitSeg(b, s, p.dmg * 0.4, p.x, py); p.life = 0; b.burst(p.x, p.y, '#c4c8d0', 4); break; }
        }
      }
      for (const c of sb.crowd) if (c.fly) { c.fly.t += dt; c.x += c.fly.vx * dt; if (c.fly.t > 0.9) { c.gone = true; c.fly = null; } }
    },
    floor(x, st) {
      const S = st.street; if (!S) return;
      x.fillStyle = '#3c3a40'; x.fillRect(AR.x, AR.y, AR.w, AR.h);                         // 아스팔트 골목
      for (let i = 0; i < 300; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; x.fillRect(AR.x + (i * 73) % AR.w, AR.y + (i * 151) % AR.h, 2, 1); }
      x.fillStyle = '#56525a'; x.fillRect(AR.x, AR.y, AR.w, 22); x.fillStyle = '#4a464e'; for (let i = 0; i < AR.w; i += 28) x.fillRect(AR.x + i, AR.y + 2, 26, 18); // 뒤쪽 벽돌담
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(AR.x, AR.y + 22, AR.w, 3);
      // 링 바닥 (낡은 매트) + 낙서
      const f = S.fence; x.fillStyle = '#5a4a42'; x.fillRect(f.x, f.y, f.w, f.h); x.fillStyle = '#634f45'; for (let j = 0; j < f.h; j += 12) x.fillRect(f.x, f.y + j, f.w, 6);
      x.strokeStyle = 'rgba(230,200,80,0.35)'; x.lineWidth = 2; x.beginPath(); x.arc(f.x + f.w / 2, f.y + f.h / 2, 34, 0, TAU); x.stroke();
      x.fillStyle = 'rgba(255,90,120,0.18)'; x.fillRect(AR.x + 20, AR.y + 60, 30, 6); x.fillStyle = 'rgba(90,200,255,0.16)'; x.fillRect(AR.x + AR.w - 54, AR.y + AR.h - 40, 36, 6);
    },
    drawUnder(ctx, b, thumb) {
      const sb = b.st2; if (!sb) return;
      ctx.save();
      for (const s of sb.segs) { // 철망
        const crack = 1 - s.hp / s.max;
        if (s.broken) { ctx.strokeStyle = '#4a4e56'; ctx.lineWidth = 2; const mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2; ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x0 + (mx - s.x0) * 0.25, s.y0 + (my - s.y0) * 0.25 + 4); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x1 + (mx - s.x1) * 0.25, s.y1 + (my - s.y1) * 0.25 + 4); ctx.stroke(); }
        else {
          const hor = Math.abs(s.y1 - s.y0) < 1, H = hor ? 14 : 0;
          ctx.fillStyle = 'rgba(160,168,180,0.25)'; if (hor) ctx.fillRect(Math.min(s.x0, s.x1), s.y0 - H, Math.abs(s.x1 - s.x0), H);
          ctx.strokeStyle = s.flash > 0 ? '#ffffff' : crack > 0.66 ? '#b08060' : crack > 0.33 ? '#a0a4ac' : '#c4c8d0'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); if (hor) { ctx.moveTo(s.x0, s.y0 - H); ctx.lineTo(s.x1, s.y1 - H); } ctx.stroke();
          ctx.strokeStyle = 'rgba(200,205,215,0.45)'; ctx.lineWidth = 1; // 그물 무늬
          const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), n = Math.floor(L / 6);
          for (let k = 0; k <= n; k++) { const px = s.x0 + (s.x1 - s.x0) * k / n, py = s.y0 + (s.y1 - s.y0) * k / n; ctx.beginPath(); if (hor) { ctx.moveTo(px, py); ctx.lineTo(px + 6, py - H); } else { ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3); } ctx.stroke(); }
          for (let k = 0; k < Math.floor(crack * 3); k++) { const t = 0.25 + 0.25 * k, px = s.x0 + (s.x1 - s.x0) * t, py = s.y0 + (s.y1 - s.y0) * t; ctx.strokeStyle = '#2a2a30'; ctx.beginPath(); ctx.moveTo(px - 3, py - 4); ctx.lineTo(px + 2, py - 1); ctx.lineTo(px - 1, py + 3); ctx.stroke(); }
        }
      }
      ctx.fillStyle = '#8a8e96'; for (const s of sb.segs) ctx.fillRect(s.x0 - 2, s.y0 - 14, 3, 16); // 기둥
      for (const c of sb.crowd) { // 관중
        if (c.gone) continue;
        const s = Sprites.get(c.def), k = 1, fl = c.fly, bob = thumb ? 0 : Math.sin(b.time * 3 + c.ph) * 1.2;
        ctx.save();
        let a = 1, lift = 0, rot = 0, sc = 1;
        if (fl) { const p = fl.t / 0.9; lift = Math.sin(Math.min(1, p) * Math.PI) * 30 + p * 10; rot = fl.t * fl.spin; a = Math.max(0, 1 - p); sc = 1 - p * 0.3; }
        ctx.globalAlpha = 0.35 * a; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 1, 13 * (c.def.size || 1), 4.5 * (c.def.size || 1), 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9 * a; ctx.translate(Math.round(c.x), Math.round(c.y + bob - lift));
        if (fl) { ctx.translate(0, -16); ctx.rotate(rot); ctx.translate(0, 16); }
        ctx.scale(spriteSX(c.def, false, c.face) * k * sc, k * sc);
        Sprites.draw(ctx, s, 0, false);
        ctx.restore();
      }
      ctx.restore();
    },
  };

  STAGE_HOOKS.push(TOWER, STREET);
  window.StageExt2 = { TOWER, STREET };
})();
