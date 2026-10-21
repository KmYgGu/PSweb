/* =========================================================
 * 확장 스테이지 로직 3 (STAGE_HOOKS): 아이돌 무대, 다이빙 존
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const R = u => 11 + u.pad;
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const reflect = (u, nx, ny, rnd = 0.2) => {
    let vx = Math.cos(u.dir), vy = Math.sin(u.dir); const d = vx * nx + vy * ny;
    if (d < 0) { vx -= 2 * d * nx; vy -= 2 * d * ny; u.dir = fixAngle(Math.atan2(vy, vx) + rand(-rnd, rnd)); return true; }
    return false;
  };
  const isDash = u => u.action && ['dash', 'chase', 'charge', 'combo'].includes(u.action.type);
  function bounce(b, u, n, rnd = 0.3, quiet) {
    if (!quiet && b.wallImpact) b.wallImpact(u, n[0], n[1]);
    if (isDash(u)) { u.action = null; u.dir = fixAngle(Math.atan2(n[1], n[0]) + rand(-0.5, 0.5)); } else reflect(u, n[0], n[1], rnd);
    if (b.time - (u.wallT || -1) > 0.12) { u.wallT = b.time; b.dust(u.x, u.y); }
  }
  function pushOutRect(u, rc) {
    const r = R(u), qx = clamp(u.x, rc.x, rc.x + rc.w), qy = clamp(u.y, rc.y, rc.y + rc.h);
    let dx = u.x - qx, dy = u.y - qy, d = Math.hypot(dx, dy);
    if (d >= r) return null;
    if (d < 1e-3) {
      const l = u.x - rc.x, rr = rc.x + rc.w - u.x, t = u.y - rc.y, bb = rc.y + rc.h - u.y, m = Math.min(l, rr, t, bb);
      if (m === l) { u.x = rc.x - r; return [-1, 0]; } if (m === rr) { u.x = rc.x + rc.w + r; return [1, 0]; }
      if (m === t) { u.y = rc.y - r; return [0, -1]; } u.y = rc.y + rc.h + r; return [0, 1];
    }
    dx /= d; dy /= d; u.x = qx + dx * r; u.y = qy + dy * r; return [dx, dy];
  }
  // 절차적 캐릭터 뒷모습: 머리 부분을 머리색으로 덮음 (sprite.back 없을 때)
  function drawBack(ctx, def, s) {
    if (s.back) { Sprites.draw(ctx, s.back, 0, false); return; }
    Sprites.draw(ctx, s, 0, false);
    const hair = (def.sprite && def.sprite.pal && def.sprite.pal.H) || '#555';
    ctx.save(); ctx.beginPath(); ctx.rect(-s.dw / 2, -s.dh + s.foot, s.dw, s.dh * 0.42); ctx.clip();
    Sprites.drawTint(ctx, s, 0, hair); ctx.restore();
  }

  // 안전장치: 이동 가능 영역 밖이면 안으로 되돌리고 반사 (돌진/넉백/순간이동/끌어오기 등 어떤 이동이든)
  function safeClamp(b, u) {
    if (u.dead || u.climb) return;
    const q = b.clampPos(u.x, u.y, u.pad, u), dx = q.x - u.x, dy = q.y - u.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    u.x = q.x; u.y = q.y;
    if (u.air && u.air.fling) { const F = u.air.fling; const f = b.clampPos(F.x1, F.y1, u.pad, u); F.x1 = f.x; F.y1 = f.y; }
    const d = Math.hypot(dx, dy); bounce(b, u, [dx / d, dy / d], 0.3, true); // 안전 밀어내기: 소리 없음
  }

  // ===================== 아이돌 무대 =====================
  const IDOL = {
    match: st => !!st.idol,
    init(b) {
      const I = b.stage.idol; if (!I) return;
      const ids = new Set(b.u.map(u => u.def.id)), pool = CHARACTERS.filter(c => !ids.has(c.id)), src = pool.length ? pool : CHARACTERS;
      const crowd = [], rowH = (AR.y + AR.h - I.seatY) / I.crowdRows;
      let k = Math.floor(Math.random() * src.length);
      for (let r = 0; r < I.crowdRows; r++) for (let c = 0; c < I.crowdCols; c++) {
        const def = src[(k++) % src.length], cw = AR.w / I.crowdCols;
        crowd.push({ def, x: AR.x + cw * (c + 0.5) + (r % 2 ? cw * 0.35 : -cw * 0.1) + rand(-3, 3), y: I.seatY + rowH * (r + 0.85), ph: rand(0, TAU), stick: Math.random() < 0.55 ? ['#ff7ad0', '#7ae0ff', '#c6ff7a', '#ffe07a'][Math.floor(Math.random() * 4)] : null, face: Math.random() < 0.5 ? -1 : 1 });
      }
      crowd.sort((a, c) => a.y - c.y);
      b.play = { x: AR.x, y: I.top - 15, w: AR.w, h: I.seatY + 2 - (I.top - 15) }; // 이동 가능 영역 = 무대만 (뒷벽/관객석은 경기장 밖)
      b.idol = { I, crowd, cam: { x: 180, y: (I.top + I.seatY) / 2, w: AR.w }, spot: null, nextT: I.spot.first, fans: [0, 0], leader: null, cheer: 0 };
      b.stats.spots = 0; b.stats.leadChanges = 0;
    },
    step(b, dt) {
      const D = b.idol; if (!D) return;
      const I = D.I;
      D.cheer = Math.max(0, D.cheer - dt);
      for (const u of b.u) safeClamp(b, u); // 안전장치: 무대 밖이면 매 스텝 안으로
      if (b.over) return;
      // 스포트라이트 (한 번에 하나)
      if (!D.spot) {
        D.nextT -= dt;
        if (D.nextT <= 0) {
          const r = I.spot.r;
          let x, y, tries = 0;
          do { x = rand(AR.x + 30, AR.x + AR.w - 30); y = rand(I.top + 40, I.seatY - 36); tries++; } while (tries < 20 && b.u.some(u => Math.hypot(u.x - x, u.y - y) < 60));
          D.spot = { x, y, r, t: 0 };
          b.shock(x, y, 4, r + 8, '#fff4c0', 0.4, 2);
        }
      } else {
        const S = D.spot; S.t += dt;
        const got = b.u.find(u => !u.dead && !u.airborne && Math.hypot(u.x - S.x, (u.y - S.y) / 0.7) < S.r + 6 + u.pad);
        if (got) {
          D.fans[got.team]++; b.stats.spots++; D.cheer = 1.6;
          sys(b, `${got.def.name}: 팬심 획득! (${D.fans[got.team]})`);
          b.text(got.x, got.y - 70, '팬심 +1 ♥', '#ff8ad8', 12);
          b.glow(S.x, S.y - 10, 40, '#fff0a0', 0.5); b.shock(S.x, S.y, 6, 44, '#ffb0e8', 0.45, 3);
          for (let i = 0; i < 14; i++) { const a = rand(0, TAU), sp = rand(50, 130); b.parts.push({ x: S.x, y: S.y - 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, g: 160, life: rand(0.5, 0.9), max: 0.9, color: i % 2 ? '#ff8ad8' : '#fff0a0', size: 2.2 }); }
          D.spot = null; D.nextT = I.spot.gap;
        } else if (S.t > I.spot.life) { D.spot = null; D.nextT = 1.2; }
      }
      // 팬심 리드 버프
      // 팬심은 팀 단위. 리드 팀 전원에게 버프, 카메라/LEAD 표시는 리드 팀의 대표(살아있고 체력 비율 높은 쪽)
      const lt = D.fans[0] > D.fans[1] ? 0 : D.fans[1] > D.fans[0] ? 1 : -1;
      if (lt !== (D.leadTeam ?? -1)) {
        D.leadTeam = lt; b.stats.leadChanges++;
        for (const u of b.u) u.buffs = u.buffs.filter(x => x.type !== 'fanLead');
        if (lt >= 0) {
          const mem = b.u.filter(u => u.team === lt);
          for (const m of mem) { m.buffs.push({ type: 'fanLead', name: '팬심 리드', t: 1e9, nodispel: true, ...I.lead }); if (!m.dead) b.glow(m.x, m.y - 20, 50, '#ff9ae0', 0.6); }
          sys(b, `${mem.map(m => m.def.name).join(' & ')} 팬심 리드! 능력치 대폭 상승!`);
        } else sys(b, '팬심 동점! 리드 버프 해제');
      }
      D.leader = lt >= 0 ? b.teamBest(lt) : null;
      { // 중계 카메라: 리드 캐릭터를 부드럽게 따라감 (동점이면 무대 전체 와이드 샷)
        const L = D.leader && !D.leader.dead ? D.leader : null, C = D.cam, k = 1 - Math.exp(-dt * 6);
        const tx = L ? L.x : 180, ty = L ? L.y - 32 - b.airZ(L) : (I.top + I.seatY) / 2, tw = L ? 175 : AR.w;
        C.x += (tx - C.x) * k; C.y += (ty - C.y) * k; C.w += (tw - C.w) * k;
      }
      if (D.leader && !D.leader.dead && Math.random() < dt * 6) b.parts.push({ x: D.leader.x + rand(-10, 10), y: D.leader.y - rand(10, 40), vx: rand(-8, 8), vy: rand(-30, -15), life: 0.7, max: 0.7, color: '#ff9ae0', size: 2, glow: true });
    },
    floor(x, st) {
      const I = st.idol; if (!I) return;
      // 무대 바닥 (광택 마루)
      x.fillStyle = '#2a2240'; x.fillRect(AR.x, AR.y, AR.w, AR.h);
      for (let j = I.top; j < I.seatY; j += 14) { x.fillStyle = ((j - I.top) / 14) % 2 ? '#3a2f58' : '#362b52'; x.fillRect(AR.x, j, AR.w, 14); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(AR.x, j, AR.w, 1); }
      x.strokeStyle = 'rgba(255,150,220,0.18)'; x.lineWidth = 2; x.beginPath(); x.ellipse(180, (I.top + I.seatY) / 2, 70, 44, 0, 0, TAU); x.stroke();
      // 무대 뒤 벽 + 스크린 틀
      x.fillStyle = '#16121f'; x.fillRect(AR.x, AR.y, AR.w, I.top - AR.y);
      for (let i = 0; i < AR.w; i += 8) { x.fillStyle = i % 16 ? '#1c1728' : '#201a2e'; x.fillRect(AR.x + i, AR.y, 8, I.top - AR.y); }
      x.fillStyle = '#0c0a12'; x.fillRect(AR.x, I.top - 4, AR.w, 4);
      for (const [sx, sw] of [[120, 120], [26, 80], [254, 80]]) { x.fillStyle = '#3a3448'; x.fillRect(sx - 3, AR.y + 5, sw + 6, I.top - AR.y - 14); x.fillStyle = '#05060a'; x.fillRect(sx, AR.y + 8, sw, I.top - AR.y - 20); }
      // 무대 앞 가장자리 (조명 띠)
      x.fillStyle = '#1a1424'; x.fillRect(AR.x, I.seatY - 2, AR.w, 8);
      for (let i = 4; i < AR.w; i += 14) { x.fillStyle = '#ffd86a'; x.fillRect(AR.x + i, I.seatY, 4, 2); }
      // 관객석
      x.fillStyle = '#121019'; x.fillRect(AR.x, I.seatY + 6, AR.w, AR.y + AR.h - I.seatY - 6);
      const rowH = (AR.y + AR.h - I.seatY) / I.crowdRows;
      for (let r = 0; r < I.crowdRows; r++) { x.fillStyle = '#2a1e30'; x.fillRect(AR.x, I.seatY + rowH * (r + 0.85) - 3, AR.w, 6); x.fillStyle = '#3e2a44'; x.fillRect(AR.x, I.seatY + rowH * (r + 0.85) - 3, AR.w, 2); }
    },
    SCR: { x: 120, w: 120 },
    drawScreen(ctx, b, D, thumb) { // 중앙 대형 스크린: 실시간 중계 (화면 영역은 캡처에서 제외)
      const I = D.I, sx = IDOL.SCR.x, sw = IDOL.SCR.w, sy = AR.y + 8, sh = I.top - AR.y - 20;
      ctx.save();
      if (thumb) {
        ctx.fillStyle = '#1a2040'; ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = '#ffb0e8'; ctx.font = 'bold 13px "Galmuri11", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('IDOL STAGE', sx + sw / 2, sy + sh / 2);
        ctx.restore(); return;
      }
      const C = D.cam, cw = C.w, ch = cw * sh / sw;
      const cx = clamp(C.x, AR.x + cw / 2, AR.x + AR.w - cw / 2), cy = clamp(C.y, I.top - 10 + ch / 2, AR.y + AR.h - ch / 2); // 위쪽 스크린 벽은 캡처 안 함
      const m = ctx.getTransform(), src = ctx.canvas;
      const px = m.a * (cx - cw / 2) + m.c * (cy - ch / 2) + m.e, py = m.b * (cx - cw / 2) + m.d * (cy - ch / 2) + m.f, pw = m.a * cw, ph = m.d * ch;
      const buf = IDOL.buf || (IDOL.buf = document.createElement('canvas'));
      const bw = Math.max(1, Math.round(sw * m.a)), bh = Math.max(1, Math.round(sh * m.d));
      if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
      const bx = buf.getContext('2d'); bx.imageSmoothingEnabled = false; bx.clearRect(0, 0, bw, bh);
      bx.drawImage(src, px, py, pw, ph, 0, 0, bw, bh); // 오프스크린 버퍼로 먼저 복사 (자기 자신 재귀 방지)
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, sx, sy, sw, sh);
      ctx.globalAlpha = 0.06; ctx.fillStyle = '#000'; for (let y = sy; y < sy + sh; y += 3) ctx.fillRect(sx, y, sw, 1); // 아주 옅은 주사선
      ctx.globalAlpha = 1;
      const L = D.leader;
      ctx.strokeStyle = L ? TEAM_COL[L.team] : '#ffb0e8'; ctx.lineWidth = 1.5; ctx.strokeRect(sx + 0.75, sy + 0.75, sw - 1.5, sh - 1.5);
      ctx.font = 'bold 7px "Galmuri11", sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx + 3, sy + 3, 26, 9);
      if (Math.sin(b.time * 4) > -0.3) { ctx.fillStyle = '#ff4a5a'; ctx.beginPath(); ctx.arc(sx + 8, sy + 7.5, 2.2, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.fillText('LIVE', sx + 12, sy + 8);
      if (L) { ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(0,0,0,0.55)'; const t = L.def.name + ' ♥'; const w = ctx.measureText(t).width + 6; ctx.fillRect(sx + sw - 3 - w, sy + sh - 12, w, 9); ctx.fillStyle = '#ffb0e8'; ctx.fillText(t, sx + sw - 6, sy + sh - 7); }
      else { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx + sw / 2 - 30, sy + sh - 13, 60, 10); ctx.fillStyle = '#ffb0e8'; ctx.fillText('IDOL STAGE', sx + sw / 2, sy + sh - 8); }
      ctx.restore();
    },
    drawCrowd(ctx, b, D, thumb) {
      const amp = thumb ? 0 : 1 + D.cheer * 1.2;
      ctx.save();
      for (const c of D.crowd) {
        const s = Sprites.get(c.def), bob = thumb ? 0 : Math.max(0, Math.sin(b.time * (2.2 + D.cheer) + c.ph)) * amp * -1.5;
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 1, 12 * (c.def.size || 1), 4 * (c.def.size || 1), 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y + bob));
        ctx.scale(spriteSX(c.def, !!s.back, c.face), 1);
        drawBack(ctx, c.def, s); ctx.restore();
        if (c.stick && !thumb) { // 응원봉 (느린 흔들림, 은은한 빛)
          const a = Math.sin(b.time * (1.6 + D.cheer) + c.ph) * 0.5, hx = c.x + c.face * 9, hy = c.y + bob - s.dh * 0.55;
          const tx = hx + Math.sin(a) * 14, ty = hy - Math.cos(a) * 14;
          ctx.globalAlpha = 0.25; glowDot(ctx, tx, ty, 7, c.stick);
          ctx.globalAlpha = 0.9; ctx.strokeStyle = c.stick; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        }
      }
      ctx.restore();
    },
    drawTop(ctx, b) { // 관객은 최상단 (무대 앞쪽 캐릭터가 관객 뒤에 있는 것처럼), 중계 화면은 관객 그리기 전 화면을 캡처
      const D = b.idol; if (!D) return;
      IDOL.drawScreen(ctx, b, D, false);
      IDOL.drawCrowd(ctx, b, D, false);
    },
    drawUnder(ctx, b, thumb) {
      const D = b.idol; if (!D) return;
      const I = D.I, sh = I.top - AR.y - 20;
      ctx.save();
      if (thumb) IDOL.drawScreen(ctx, b, D, true); else { ctx.fillStyle = '#05060a'; ctx.fillRect(IDOL.SCR.x, AR.y + 8, IDOL.SCR.w, sh); }
      // 좌우 스크린: 팬심 수
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [0, 1].forEach(i => { // 팀별 (2인 팀은 대표 이름 = 마지막 팀원, 예: 브로리)
        const mem = b.u.filter(o => o.team === i), u = mem[mem.length - 1];
        const sx = i ? 254 : 26, cx = sx + 40, cy = AR.y + 8 + sh / 2;
        ctx.fillStyle = Sprites.shade(TEAM_COL[i], 0.25); ctx.fillRect(sx, AR.y + 8, 80, sh);
        ctx.fillStyle = TEAM_COL[i]; ctx.font = 'bold 9px "Galmuri11", sans-serif'; ctx.fillText(u.def.name + (mem.length > 1 ? ' 팀' : ''), cx, cy - 13);
        ctx.fillStyle = '#ffb0e8'; ctx.font = 'bold 16px "Galmuri11", sans-serif'; ctx.fillText('♥ ' + D.fans[i], cx, cy + 6);
        if (D.leadTeam === i) { ctx.fillStyle = '#ffe07a'; ctx.font = 'bold 8px "Galmuri11", sans-serif'; ctx.fillText('LEAD', cx, cy + 20); }
      });
      // 스포트라이트
      const S = D.spot;
      if (S && !thumb) {
        const fade = Math.min(1, S.t * 4) * (S.t > D.I.spot.life - 1 ? 0.5 + 0.5 * Math.sin(b.time * 20) : 1), pul = 1 + 0.06 * Math.sin(b.time * 6);
        ctx.globalAlpha = 0.14 * fade; ctx.fillStyle = '#fff6c8';
        ctx.beginPath(); ctx.moveTo(S.x - 6, I.top - 2); ctx.lineTo(S.x + 6, I.top - 2); ctx.lineTo(S.x + S.r * pul, S.y); ctx.lineTo(S.x - S.r * pul, S.y); ctx.fill();
        ctx.globalAlpha = 0.45 * fade; const g = ctx.createRadialGradient(S.x, S.y, 2, S.x, S.y, S.r * pul); g.addColorStop(0, '#fffbe0'); g.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(S.x, S.y, S.r * pul, S.r * 0.7 * pul, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(S.x, S.y, S.r * pul, S.r * 0.7 * pul, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (thumb) IDOL.drawCrowd(ctx, b, D, true); // 실제 경기에선 drawTop에서 (최상단)
      ctx.restore();
    },
  };
  function glowDot(ctx, x, y, r, col) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

  // ===================== 다이빙 존 =====================
  const DIVE = {
    match: st => !!st.diving,
    init(b) {
      const D = b.stage.diving; if (!D) return;
      const S = D.stairs, cx = S.x + S.w / 2, L1 = S.y + S.h - D.boardY, L2 = cx - D.boardX;
      b.dv = { D, cx, L1, L2, len: L1 + L2 };
      b.u.forEach(u => { u.climb = null; u.hpPrev = u.hp; });
      Object.assign(b.stats, { climbs: 0, dives: 0, divePush: 0, climbFails: 0 });
    },
    noClamp(b, u) { return !!(b.dv && u.climb); },
    // 계단 구역은 오른쪽 위 구석(경기장 벽과 맞닿음) → 왼쪽(수영장) 또는 아래(입구 앞)로만 밀어냄
    outStairs(S, x, y, r) {
      if (!(x > S.x - r && y < S.y + S.h + r)) return null;
      if (x > S.x + 4 && x < S.x + S.w - 4 && y >= S.y + S.h - 3) return null; // 입구 앞: 막지 않음 (진입 판정은 step)
      const dl = x - (S.x - r), db = S.y + S.h + r - y;
      return dl < db ? { x: S.x - r, y } : { x, y: S.y + S.h + r };
    },
    clamp(b, x, y, pad) { const V = b.dv; if (!V) return { x, y }; return DIVE.outStairs(V.D.stairs, x, y, 11 + pad) || { x, y }; },
    pos(V, p) { // 계단 경로 (입구 → 계단 위 → 다이빙대 끝)
      const S = V.D.stairs;
      if (p <= V.L1) return { x: V.cx, y: S.y + S.h - p };
      return { x: V.cx - (p - V.L1), y: V.D.boardY };
    },
    inPool(V, u) { const P = V.D.pool; return u.x > P.x && u.x < P.x + P.w && u.y > P.y && u.y < P.y + P.h; },
    eject(b, u) {
      const S = b.dv.D.stairs;
      u.climb = null; u.action = null; u.x = b.dv.cx; u.y = S.y + S.h + R(u) + 2; u.dir = fixAngle(Math.PI / 2 + rand(-0.6, 0.6));
      b.stats.climbFails++; b.dust(u.x, u.y); b.text(u.x, u.y - 50, '미끄러짐!', '#c8d8ff', 10);
    },
    step(b, dt) {
      const V = b.dv; if (!V) return;
      const D = V.D, S = D.stairs;
      for (const u of b.u) {
        if (u.dead) continue;
        const hurt = u.hp < u.hpPrev - 0.5; u.hpPrev = u.hp;
        if (u.climb) {
          const C = u.climb;
          if (b.over) { const p = DIVE.pos(V, C.p); u.x = p.x; u.y = p.y; continue; }
          if (hurt) { C.p -= D.hitBack; b.text(u.x, u.y - 60, '밀려남', '#ffd0a0', 9); }
          if (!u.blocked('blocksMove')) { C.p += clamp(u.speed * D.climbK, 40, 90) * dt; u.moving = true; u.walk += dt * 8; }
          if (C.p <= 0) { DIVE.eject(b, u); continue; }
          if (C.p >= V.len) { DIVE.dive(b, u); continue; }
          const p = DIVE.pos(V, C.p); u.x = p.x; u.y = p.y; u.action = null;
          if (C.p > V.L1) u.facing = -1;
          continue;
        }
        if (u.dive && !u.air) { DIVE.land(b, u); continue; }
        if (u.airborne) { safeClamp(b, u); continue; }
        // 계단: 아래 입구로만 진입, 옆/위는 벽
        const r = R(u);
        if (u.x > S.x - r && u.x < S.x + S.w + r && u.y > S.y - r && u.y < S.y + S.h + r) {
          if (!b.over && u.y >= S.y + S.h - 3 && u.x > S.x + 4 && u.x < S.x + S.w - 4 && Math.sin(u.dir) < 0) {
            u.climb = { p: Math.max(1, S.y + S.h - u.y + 1) }; u.action = null; b.stats.climbs++;
            b.text(u.x, u.y - 60, '계단 오르기', '#d8f4ff', 9);
          } else { const q = DIVE.outStairs(S, u.x, u.y, r); if (q) { const dx = q.x - u.x, dy = q.y - u.y, d = Math.hypot(dx, dy) || 1; u.x = q.x; u.y = q.y; bounce(b, u, [dx / d, dy / d]); } }
        }
        safeClamp(b, u);
      }
      // 계단 위 충돌: 아래쪽 캐릭터가 밀려 내려감
      for (let i = 0; i < b.u.length; i++) for (let j = i + 1; j < b.u.length; j++) { // 모든 쌍 (다인 팀 포함)
        const a = b.u[i], c = b.u[j];
        if (!(a.climb && c.climb && !a.dead && !c.dead && Math.abs(a.climb.p - c.climb.p) < 22)) continue;
        const lo = a.climb.p < c.climb.p ? a : c;
        lo.climb.p -= D.bumpBack; b.sparks && b.sparks(lo.x, lo.y - 14, '#ffffff', 6, 90); b.text(lo.x, lo.y - 60, '밀려남', '#ffd0a0', 9);
        if (lo.climb.p <= 0) DIVE.eject(b, lo);
      }
    },
    dive(b, u) {
      const D = b.dv.D, P = D.pool;
      u.climb = null; u.dive = true; b.stats.dives++;
      const x1 = rand(P.x + 22, P.x + P.w - 22), y1 = rand(P.y + 22, P.y + P.h - 16);
      u.air = { t: 0, dur: D.dive.dur, h: D.dive.h, fling: { x0: u.x, y0: u.y, x1, y1 } };
      u.facing = x1 < u.x ? -1 : 1;
      b.say(u, 'airborne'); sys(b, `${u.def.name} 다이빙!`);
      b.text(u.x, u.y - 64, '다이빙!', '#9fe8ff', 12);
    },
    land(b, u) {
      const V = b.dv, D = V.D, P = D.pool;
      u.dive = false;
      b.splash(u.x, u.y, '#cfeeff', 2.5);
      b.fx.push({ type: 'ripple', x: u.x, y: u.y + 1, t: 0, dur: 0.9, big: true }); b.fx.push({ type: 'ripple', x: u.x, y: u.y + 1, t: 0, dur: 1.3, big: true });
      b.shock(u.x, u.y, 6, 60, '#d8f4ff', 0.5, 4); b.shake(2);
      for (let i = 0; i < 26; i++) { const a = rand(0, TAU), sp = rand(40, 150); b.parts.push({ x: u.x, y: u.y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - rand(60, 140), g: 320, life: rand(0.5, 0.9), max: 0.9, color: i % 3 ? '#cfeeff' : '#ffffff', size: rand(1.5, 3) }); }
      for (const e of b.foes(u)) DIVE.splashPush(b, u, e); // 수영장 안 상대 전원
    },
    splashPush(b, u, e) {
      const V = b.dv, D = V.D, P = D.pool;
      if (b.over || e.dead || e.airborne || e.climb || !DIVE.inPool(V, e)) return;
      // 상대를 수영장 밖으로 밀어내고 긴 기절
      const r = R(e) + 8, opts = [[P.x - r, e.y], [P.x + P.w + r, e.y], [e.x, P.y - r], [e.x, P.y + P.h + r]];
      let best = null, bd = 1e9;
      for (const [x, y] of opts) {
        const q = b.clampPos(x, y, e.pad, e), S = D.stairs;
        if (q.x > S.x - r && q.x < S.x + S.w + r && q.y > S.y - r && q.y < S.y + S.h + r) continue;
        if (q.x > P.x && q.x < P.x + P.w && q.y > P.y && q.y < P.y + P.h) continue;
        const d = Math.hypot(q.x - e.x, q.y - e.y) + Math.hypot(q.x - u.x, q.y - u.y) * -0.3;
        if (d < bd) { bd = d; best = q; }
      }
      if (!best) return;
      b.stats.divePush++;
      e.action = null;
      e.air = { t: 0, dur: 0.45, h: 16, spin: true, fling: { x0: e.x, y0: e.y, x1: best.x, y1: best.y } };
      sys(b, `${e.def.name} 수영장 밖으로 튕겨나감!`);
      b.later(0.47, () => { if (!e.dead && !b.over) { b.knockdown(u, e, D.stun, 1); b.splash(e.x, e.y, '#cfeeff', 0.6); } });
    },
    floor(x, st) {
      const D = st.diving; if (!D) return;
      const P = D.pool, S = D.stairs;
      // 수영장 데크 타일
      for (let j = 0; j * 14 < AR.h; j++) for (let i = 0; i * 14 < AR.w; i++) { x.fillStyle = (i + j) % 2 ? '#d8dde2' : '#cfd5db'; x.fillRect(AR.x + i * 14, AR.y + j * 14, 14, 14); x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(AR.x + i * 14, AR.y + j * 14, 14, 1); }
      // 수영장 (위·왼쪽 끝까지) + 테두리
      x.fillStyle = '#f2f4f6'; x.fillRect(P.x, P.y, P.w + 6, P.h + 6);
      x.fillStyle = '#aab4bc'; x.fillRect(P.x, P.y + P.h + 4, P.w + 6, 2);
      for (let j = 0; j * 12 < P.h; j++) for (let i = 0; i * 12 < P.w; i++) { x.fillStyle = (i + j) % 2 ? '#3a9ccc' : '#3ea2d2'; x.fillRect(P.x + i * 12, P.y + j * 12, Math.min(12, P.w - i * 12), Math.min(12, P.h - j * 12)); }
      for (let k = 1; k < 4; k++) { const lx = P.x + P.w * k / 4; for (let j = 0; j < P.h; j += 8) { x.fillStyle = (j / 8) % 2 ? '#e84848' : '#f4f4f4'; x.fillRect(lx - 1, P.y + j, 2, 6); } } // 레인 로프 (세로)
      x.fillStyle = '#2a6a96'; for (let k = 0; k < 4; k++) x.fillRect(P.x + P.w * (k + 0.5) / 4 - 1, P.y + 14, 2, P.h - 28);
      // 다이빙 구역: 오른쪽 위 기둥 전체 (플랫폼 + 계단, 옆면 벽, 아래 입구)
      const cx = S.x + S.w / 2, stTop = D.boardY + 12;
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(S.x - 4, S.y, 4, S.h + 4); x.fillRect(S.x - 4, S.y + S.h, S.w + 4, 4);
      x.fillStyle = '#6a7684'; x.fillRect(S.x, S.y, S.w, S.h);
      x.fillStyle = '#7e8a98'; x.fillRect(S.x + 6, S.y + 4, S.w - 12, stTop - S.y - 4); // 플랫폼
      x.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = S.x + 10; i < S.x + S.w - 8; i += 10) x.fillRect(i, S.y + 6, 1, stTop - S.y - 8);
      const n = 16, sh0 = S.y + S.h - stTop;
      for (let k = 0; k < n; k++) { const y = stTop + sh0 * k / n, sh = 0.72 + 0.28 * (1 - k / n); x.fillStyle = `rgb(${Math.round(176 * sh)},${Math.round(184 * sh)},${Math.round(194 * sh)})`; x.fillRect(S.x + 8, y + 1, S.w - 16, sh0 / n - 2); x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(S.x + 8, y + 1, S.w - 16, 1); x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(S.x + 8, y + sh0 / n - 2, S.w - 16, 1); }
      x.fillStyle = '#c8ccd2'; x.fillRect(S.x, S.y, 7, S.h); x.fillRect(S.x + S.w - 7, S.y, 7, S.h); // 난간 (벽)
      x.fillStyle = '#5a6470'; x.fillRect(S.x + 2, S.y, 2, S.h); x.fillRect(S.x + S.w - 4, S.y, 2, S.h);
      x.fillStyle = '#e8b82a'; x.fillRect(S.x + 7, S.y + S.h - 4, S.w - 14, 4); // 입구 표시
      x.fillStyle = '#2a6a3a'; x.beginPath(); x.moveTo(cx, S.y + S.h + 6); x.lineTo(cx - 9, S.y + S.h + 16); x.lineTo(cx + 9, S.y + S.h + 16); x.fill();
      // 다이빙대 (플랫폼에서 수영장 위로): 두꺼운 판 + 받침 브래킷 + 지지대
      const bx0 = D.boardX - 8, bw = cx - bx0, by = D.boardY;
      x.fillStyle = 'rgba(0,30,60,0.3)'; x.fillRect(bx0 + 4, by + 22, S.x - bx0 - 4, 8);          // 물 위 그림자
      for (const px of [S.x - 34, S.x - 8]) { // 지지대 (물속 기둥) + 대각 브래킷
        x.fillStyle = '#5a6672'; x.fillRect(px - 3, by + 6, 6, 20); x.fillStyle = '#76828e'; x.fillRect(px - 3, by + 6, 2, 20);
        x.fillStyle = '#6a7684'; x.beginPath(); x.moveTo(px - 12, by + 7); x.lineTo(px + 3, by + 7); x.lineTo(px + 3, by + 18); x.fill();
      }
      x.fillStyle = '#4a5460'; x.fillRect(bx0, by - 8, bw, 17);                                     // 판 테두리
      x.fillStyle = '#f4f0e2'; x.fillRect(bx0 + 1, by - 7, bw - 2, 11);                            // 윗면
      x.fillStyle = '#d6cfb8'; x.fillRect(bx0 + 1, by + 4, bw - 2, 4);                             // 옆면 (두께)
      x.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = bx0 + 6; i < bx0 + bw - 2; i += 6) x.fillRect(i, by - 6, 1, 9); // 미끄럼 방지 줄
      x.fillStyle = '#3ea2d2'; x.fillRect(bx0 + 1, by - 7, 6, 15);                                 // 끝 표시
      x.fillStyle = '#8a96a4'; x.fillRect(S.x - 2, by - 10, 10, 21); x.fillStyle = '#5a6470'; x.fillRect(S.x + 1, by - 6, 4, 4); x.fillRect(S.x + 1, by + 3, 4, 4); // 고정 브래킷 (볼트)
    },
    drawUnder(ctx, b, thumb) {
      const V = b.dv; if (!V || thumb) return;
      const P = V.D.pool;
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
      for (let i = 0; i < 36; i++) { // 물결 반짝임 (무인도와 같은 표현)
        const gx = P.x + (i * 97) % P.w, gy = P.y + (i * 61 + (i % 7) * 13) % P.h, ph = i * 1.7;
        ctx.globalAlpha = 0.18 + 0.18 * Math.sin(b.time * 1.6 + ph); ctx.fillStyle = '#e8f8ff';
        const ox = Math.sin(b.time * 0.8 + ph) * 3; ctx.fillRect(Math.round(gx + ox), gy, 5, 1); ctx.fillRect(Math.round(gx + ox + 2), gy - 1, 2, 1);
      }
      ctx.restore();
      // 다이빙 낙하 지점 표시
      for (const u of b.u) if (u.dive && u.air && u.air.fling) {
        const F = u.air.fling, k = clamp(u.air.t / u.air.dur, 0, 1);
        ctx.globalAlpha = 0.35 + 0.3 * k; ctx.strokeStyle = TEAM_COL[u.team]; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(F.x1, F.y1, 18 - 6 * k, 7 - 2 * k, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
    },
  };

  STAGE_HOOKS.push(IDOL, DIVE);
  window.StageExt3 = { IDOL, DIVE };
})();
