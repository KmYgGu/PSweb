/* =========================================================
 * 확장 스테이지 로직 (STAGE_HOOKS): 레이싱 코스, 지하철역
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const modA = a => ((a % TAU) + TAU) % TAU;
  const R = u => 11 + u.pad; // 캐릭터 충돌 반경
  const reflect = (u, nx, ny, rnd = 0.2) => {
    let vx = Math.cos(u.dir), vy = Math.sin(u.dir); const d = vx * nx + vy * ny;
    if (d < 0) { vx -= 2 * d * nx; vy -= 2 * d * ny; u.dir = fixAngle(Math.atan2(vy, vx) + rand(-rnd, rnd)); return true; }
    return false;
  };

  // ===================== 레이싱 코스 =====================
  const RACE = {
    match: st => !!st.race,
    init(b) {
      const T = b.stage.race; if (!T) return;
      b.race = T;
      b.u.forEach((u, i) => {
        const a = T.startAng + 0.12 - (u.n > 1 ? u.slot * 0.2 : 0); // 2인 팀: 두 번째는 살짝 뒤에서 출발
        const k = u.team === 0 ? 0.3 : 0.7, rx = T.rxi + (T.rxo - T.rxi) * k, ry = T.ryi + (T.ryo - T.ryi) * k;
        u.x = T.cx + Math.cos(a) * rx; u.y = T.cy + Math.sin(a) * ry;
        u.lap = { a0: T.startAng, next: 1, prog: 0 };
      });
    },
    ang(T, x, y) { return Math.atan2((y - T.cy) / ((T.ryo + T.ryi) / 2), (x - T.cx) / ((T.rxo + T.rxi) / 2)); },
    nr(T, x, y) { return Math.hypot((x - T.cx) / ((T.rxo + T.rxi) / 2), (y - T.cy) / ((T.ryo + T.ryi) / 2)); }, // 정규화 반경 (트랙 중심선 = 1)
    onRoad(T, x, y) { const dx = x - T.cx, dy = y - T.cy; return (dx / T.rxo) ** 2 + (dy / T.ryo) ** 2 <= 1 && (dx / T.rxi) ** 2 + (dy / T.ryi) ** 2 >= 1; },
    step(b, dt) {
      const T = b.race; if (!T) return;
      for (const u of b.u) {
        if (u.dead) continue;
        if (T.board) { // 중앙 전광판: 단단한 벽 (타원)
          const r = 11 + u.pad, dx = u.x - T.cx, dy = u.y - T.cy, k = (dx / (T.board.rx + r)) ** 2 + (dy / (T.board.ry + r)) ** 2;
          if (k < 1) {
            const sc = 1 / Math.sqrt(Math.max(k, 1e-4)); u.x = T.cx + dx * sc; u.y = T.cy + dy * sc;
            let nx = dx / (T.board.rx + r) ** 2, ny = dy / (T.board.ry + r) ** 2; const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
            const ds = u.action && ['dash', 'chase', 'charge', 'combo'].includes(u.action.type);
            b.wallImpact && b.wallImpact(u, nx, ny);
            if (ds) { u.action = null; u.dir = fixAngle(Math.atan2(ny, nx) + rand(-0.5, 0.5)); } else reflect(u, nx, ny, T.board.bounceRnd ?? 0.3);
            if (b.time - (u.wallT || -1) > 0.12) { u.wallT = b.time; b.dust(u.x, u.y); }
          }
        }
        // 잔디: 이동 가능하지만 감속 (grassSpd), 은은한 풀잎 파티클
        const grass = !RACE.onRoad(T, u.x, u.y);
        u.terrainMul = grass ? (T.grassSpd ?? 0.8) : 1;
        if (grass && !u.air && Math.random() < dt * 6) b.parts.push({ x: u.x + rand(-6, 6), y: u.y + rand(-2, 3), vx: rand(-14, 14), vy: rand(-30, -14), g: 90, life: rand(0.3, 0.5), max: 0.5, color: Math.random() < 0.5 ? '#6fae5a' : '#8cc46e', size: rand(1.2, 2) });
        // 랩 진행: 시계 방향으로 섹터를 순서대로 통과해야 인정
        if (b.over) continue;
        // 누적 각도(역주행은 감소) + 순서대로 통과한 체크포인트 둘 다 만족해야 완주
        const L = u.lap, N = T.sectors, w = TAU / N, ang = RACE.ang(T, u.x, u.y);
        // 중앙부(minR 미만)에선 각도 추적 정지. 중앙을 가로질러 각도가 한 섹터 이상 점프하면 진행 인정 안 함
        if (RACE.nr(T, u.x, u.y) < (T.minR ?? 0.6)) { L.paused = true; }
        else {
          if (L.prevA == null) L.prevA = ang;
          const d = Math.atan2(Math.sin(ang - L.prevA), Math.cos(ang - L.prevA));
          if (!(L.paused && Math.abs(d) > w * 0.5)) L.cum = (L.cum || 0) + d;
          L.prevA = ang; L.paused = false;
        }
        const rel = modA(ang - L.a0), sec = Math.floor(rel / w);
        if (!L.paused && sec === L.next % N && L.cum >= (L.next - 0.5) * w) L.next++;          // 체크포인트 (순서 + 누적각 확인)
        while (L.next > 1 && L.cum < (L.next - 2) * w) L.next--;                  // 역주행하면 체크포인트 취소
        L.prog = clamp(L.cum / TAU, 0, 1);
        if (L.next > N && L.cum >= TAU) { // 완주
          L.prog = 1;
          b.over = true; b.winner = u; b.endType = 'lap';
          b.resultText = label => `${label(u)} 완주! 승리!`;
          b.hooks.onSystem && b.hooks.onSystem(u.def.name + ' 완주!');
          b.shock(u.x, u.y - 10, 6, 60, '#ffffff', 0.5, 5); b.glow(u.x, u.y - 18, 50, '#fff6c8', 0.5);
          for (let i = 0; i < 30; i++) { const a = rand(0, TAU), s = rand(60, 180); b.parts.push({ x: u.x, y: u.y - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 260, life: rand(0.6, 1.1), max: 1.1, color: i % 2 ? '#ffffff' : '#2a2a30', size: rand(2, 3.5) }); }
        }
      }
    },
    floor(x, st) {
      const T = st.race; if (!T) return;
      x.fillStyle = '#3d7446'; x.fillRect(AR.x, AR.y, AR.w, AR.h);
      for (let j = 0; j < AR.h; j += 16) { x.fillStyle = j % 32 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'; x.fillRect(AR.x, AR.y + j, AR.w, 16); }
      const ell = (rx, ry) => { x.beginPath(); x.ellipse(T.cx, T.cy, rx, ry, 0, 0, TAU); };
      ell(T.rxo + 6, T.ryo + 6); x.fillStyle = '#cfcfd4'; x.fill();               // 바깥 방호벽 바탕
      for (let k = 0; k < 64; k++) { x.fillStyle = k % 2 ? '#e04848' : '#f4f4f4'; x.beginPath(); x.ellipse(T.cx, T.cy, T.rxo + 6, T.ryo + 6, 0, k / 64 * TAU, (k + 1) / 64 * TAU); x.lineTo(T.cx, T.cy); x.fill(); }
      ell(T.rxo, T.ryo); x.fillStyle = '#4a4b54'; x.fill();                        // 아스팔트
      x.save(); ell(T.rxo, T.ryo); x.clip();
      for (let i = 0; i < 400; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; x.fillRect(AR.x + (i * 73) % AR.w, AR.y + (i * 151) % AR.h, 2, 1); }
      x.restore();
      x.setLineDash([8, 8]); x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1.5;   // 중앙 점선
      ell((T.rxo + T.rxi) / 2, (T.ryo + T.ryi) / 2); x.stroke(); x.setLineDash([]);
      // 진행 방향 화살표 (시계 방향)
      x.fillStyle = 'rgba(255,255,255,0.12)';
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + 0.35, mx = (T.rxo + T.rxi) / 2, my = (T.ryo + T.ryi) / 2, px = T.cx + Math.cos(a) * mx, py = T.cy + Math.sin(a) * my;
        const tx = -Math.sin(a) * mx, ty = Math.cos(a) * my, tl = Math.hypot(tx, ty), ux = tx / tl, uy = ty / tl;
        x.beginPath(); x.moveTo(px + ux * 7, py + uy * 7); x.lineTo(px - ux * 4 - uy * 6, py - uy * 4 + ux * 6); x.lineTo(px - ux * 4 + uy * 6, py - uy * 4 - ux * 6); x.fill();
      }
      ell(T.rxi, T.ryi); x.fillStyle = '#cfcfd4'; x.fill();                          // 안쪽 연석
      for (let k = 0; k < 40; k++) { x.fillStyle = k % 2 ? '#e04848' : '#f4f4f4'; x.beginPath(); x.ellipse(T.cx, T.cy, T.rxi, T.ryi, 0, k / 40 * TAU, (k + 1) / 40 * TAU); x.lineTo(T.cx, T.cy); x.fill(); }
      ell(T.rxi - 5, T.ryi - 5); x.fillStyle = '#356a3e'; x.fill();                 // 안쪽 잔디
      for (let j = -T.ryi; j < T.ryi; j += 12) { x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(T.cx - T.rxi, T.cy + j, T.rxi * 2, 6); }
      ell(T.rxi - 5, T.ryi - 5); x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1; x.stroke();
      // 출발/결승선 (체크 무늬)
      const y0 = T.cy - T.ryo, y1 = T.cy - T.ryi, sq = 5;
      for (let yy = y0; yy < y1; yy += sq) for (let c = 0; c < 2; c++) { x.fillStyle = ((yy - y0) / sq + c) % 2 < 1 ? '#f4f4f4' : '#1e1e24'; x.fillRect(T.cx - sq + c * sq, yy, sq, sq); }
    },
    drawOver(ctx, b) { // 미니 트랙 진행도
      const T = b.race; if (!T) return;
      const cx = T.cx, cy = T.cy, rx = 30, ry = 44;
      ctx.save();
      ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(15,20,18,0.55)'; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 12, ry + 14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(cx - 1, cy - ry - 4, 2, 8);
      b.u.forEach(u => {
        if (!u.lap) return;
        ctx.strokeStyle = TEAM_COL[u.team]; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
        const rr = (u.team ? 1.18 : 0.82) + (u.n > 1 ? (u.team ? 1 : -1) * u.slot * 0.12 : 0);
        ctx.beginPath(); ctx.ellipse(cx, cy, rx * rr, ry * rr, 0, -Math.PI / 2, -Math.PI / 2 + u.lap.prog * TAU); ctx.stroke();
        const a = -Math.PI / 2 + u.lap.prog * TAU; ctx.fillStyle = TEAM_COL[u.team];
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr, 3, 0, TAU); ctx.fill();
      });
      ctx.globalAlpha = 1; ctx.fillStyle = '#e8ecf0'; ctx.font = 'bold 9px "Galmuri11", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LAP', cx, cy - 8);
      b.u.forEach((u, i) => { if (u.lap) { ctx.fillStyle = TEAM_COL[u.team]; ctx.fillText(Math.floor(u.lap.prog * 100) + '%', cx, cy + 4 + i * 11); } });
      ctx.restore();
    },
  };

  // ===================== 지하철역 =====================
  const SUB = {
    match: st => !!st.subway,
    init(b) {
      const S = b.stage.subway; if (!S) return;
      const Tr = S.train, L = Tr.cars * Tr.carW;
      b.sub = { S, L, phase: 'absent', t: S.firstT, x0: -L - 60, vx: 0, door: 0, windows: [], stats: null };
      for (const side of ['top', 'bot']) for (const [a, e] of SUB.winList(Tr, side, L))
        b.sub.windows.push({ side, a, e, hp: Tr.winHp, max: Tr.winHp, broken: false, hitT: 0 });
      Object.assign(b.stats, { trainHits: 0, trainElim: 0, trainBoth: 0, windowsBroken: 0, rides: 0 });
    },
    present: sb => sb.phase === 'arrive' || sb.phase === 'stop' || sb.phase === 'depart',
    noClamp(b, u) { return !!(b.sub && b.sub.phase === 'depart' && u.inTrain); },
    inside(sb, u) { const T = sb.S.train; return u.x > sb.x0 && u.x < sb.x0 + sb.L && u.y > T.y && u.y < T.y + T.h; },
    // 벽 구간: 위/아래 벽에서 열린 구간(문 열림, 깨진 창) 제외, 창문은 따로 표시
    doorList(T, side) { return T.doorsBySide ? T.doorsBySide[side] : Array.from({ length: T.cars }, (_, c) => T.doors.map(d => [c * T.carW + d[0], c * T.carW + d[1]])).flat(); },
    winList(T, side, L) { // 문을 피해 창문 자동 배치 (winW 폭, winGap 간격)
      const out = [], ds = SUB.doorList(T, side), W = T.winW || 26, G = T.winGap || 12;
      for (let a = 8; a + W <= L - 8; a += W + G) { const e = a + W; if (ds.some(([da, de]) => a < de + 6 && e > da - 6)) continue; out.push([a, e]); }
      return out;
    },
    gaps(sb, side, outside) { // 닫힘 안내 중엔 밖에서 탑승 불가 (안에서 나가기만 가능)
      const T = sb.S.train, g = [];
      if (sb.door > 0.6 && !(outside && sb.closing)) for (const d of SUB.doorList(T, side)) g.push([d[0], d[1]]);
      for (const w of sb.windows) if (w.side === side && w.broken) g.push([w.a, w.e]);
      return g.sort((a, b) => a[0] - b[0]);
    },
    solids(sb, side, outside) {
      const out = []; let s = 0;
      for (const [a, e] of SUB.gaps(sb, side, outside)) { if (a > s) out.push([s, a]); s = Math.max(s, e); }
      if (s < sb.L) out.push([s, sb.L]);
      return out;
    },
    winAt(sb, side, lx) { return sb.windows.find(w => w.side === side && !w.broken && lx >= w.a && lx <= w.e); },
    hitWindow(b, w, dmg, x, y) {
      if (!w || w.broken) return;
      w.hp -= dmg; w.hitT = 0.15;
      for (let i = 0; i < 4; i++) b.parts.push({ x, y, vx: rand(-60, 60), vy: rand(-80, -20), g: 300, life: 0.4, max: 0.4, color: '#cfeaff', size: rand(1.5, 2.5) });
      if (w.hp <= 0) {
        w.broken = true; b.stats.windowsBroken++;
        for (let i = 0; i < 18; i++) b.parts.push({ x: x + rand(-14, 14), y, vx: rand(-90, 90), vy: rand(-120, 40), g: 320, life: rand(0.4, 0.8), max: 0.8, color: ['#dff4ff', '#9fd0ea', '#ffffff'][i % 3], size: rand(1.5, 3), glow: i % 4 === 0 });
        b.ring(x, y, 3, 18, 0.25, '#dff4ff'); b.shake(1);
        b.hooks.onSystem && b.hooks.onSystem('열차 창문이 깨졌습니다!');
      }
    },
    fling(b, u) {
      const S = b.sub.S, top = Math.random() < 0.5;
      const x1 = rand(AR.x + 30 + u.pad, AR.x + AR.w - 30 - u.pad), y1 = top ? rand(AR.y + 30 + u.pad, S.platTop - 14 - u.pad) : rand(S.platBot + 20 + u.pad, AR.y + AR.h - 14 - u.pad);
      b.stats.trainHits++;
      u.action = null; u.pull = null; u.inTrain = false;
      b.damage(u, u, S.hit.dmg, { noCrit: true, element: 'blunt', big: true, color: '#ffd0a0' });
      if (u.dead) return;
      u.air = { t: 0, dur: S.hit.air, h: S.hit.height, spin: true, fling: { x0: u.x, y0: u.y, x1, y1 } };
      b.shock(u.x, u.y - 14, 6, 40, '#fff0c8', 0.4, 4); b.sparks(u.x, u.y - 18, '#fff4d0', 16, 220); b.shake(2.5); b.hitstop(0.08);
      b.text(u.x, u.y - 60, '쾅!', '#ffe0b0', 13);
    },
    collideWalls(b, u, sb) {
      const T = sb.S.train, r = R(u), ins = u.inTrain;
      const segs = [];
      for (const side of ['top', 'bot']) { const y = side === 'top' ? T.y : T.y + T.h; for (const [a, e] of SUB.solids(sb, side, !ins)) segs.push({ x1: sb.x0 + a, y1: y, x2: sb.x0 + e, y2: y, side }); }
      segs.push({ x1: sb.x0, y1: T.y, x2: sb.x0, y2: T.y + T.h }, { x1: sb.x0 + sb.L, y1: T.y, x2: sb.x0 + sb.L, y2: T.y + T.h });
      for (const s of segs) {
        const qx = clamp(u.x, Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)), qy = clamp(u.y, Math.min(s.y1, s.y2), Math.max(s.y1, s.y2));
        let dx = u.x - qx, dy = u.y - qy, d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d < 0.01) { // 선 위: 안/밖 상태 기준으로 밀어냄
          if (s.side) { dy = (ins ? (s.side === 'top' ? 1 : -1) : (s.side === 'top' ? -1 : 1)); dx = 0; } else { dx = (ins ? (s.x1 === sb.x0 ? 1 : -1) : (s.x1 === sb.x0 ? -1 : 1)); dy = 0; }
          d = 1; 
        }
        const nx = dx / d, ny = dy / d;
        u.x = qx + nx * r; u.y = qy + ny * r;
        const dash = u.action && (u.action.type === 'dash' || u.action.type === 'chase' || u.action.type === 'charge' || u.action.type === 'combo');
        b.wallImpact && b.wallImpact(u, nx, ny);
        if (dash) { u.action = null; u.dir = fixAngle(Math.atan2(ny, nx) + rand(-0.5, 0.5)); } else reflect(u, nx, ny, 0.25);
        if (s.side && b.time - (u.winT || -1) > 0.15) { // 창문 충돌 피해
          u.winT = b.time;
          const w = SUB.winAt(sb, s.side, qx - sb.x0);
          if (w) SUB.hitWindow(b, w, dash ? 45 : 10 + u.speed * 0.03, qx, qy - 6);
          else b.ring(qx, qy, 2, 8, 0.18, '#e0e4ea');
        }
      }
    },
    step(b, dt) {
      const sb = b.sub; if (!sb) return;
      const S = sb.S, T = S.train, prevX = sb.x0;
      sb.t -= dt;
      if (sb.phase === 'absent' && sb.t <= 0) { sb.phase = 'warn'; sb.t = S.warn; b.hooks.onSystem && b.hooks.onSystem('열차가 들어옵니다! 선로에서 물러나세요.'); }
      else if (sb.phase === 'warn' && sb.t <= 0) { sb.phase = 'arrive'; sb.t = S.arrive; }
      else if (sb.phase === 'arrive') { const p = 1 - Math.max(0, sb.t) / S.arrive; sb.x0 = (-sb.L - 60) + (T.stopX + sb.L + 60) * easeOut(p); if (sb.t <= 0) { sb.phase = 'stop'; sb.t = S.stop; sb.x0 = T.stopX; } }
      else if (sb.phase === 'stop') { const el = S.stop - sb.t; sb.closing = sb.t < (S.exitHint || 0); if (sb.closing && !sb.hinted) { sb.hinted = true; b.hooks.onSystem && b.hooks.onSystem('곧 문이 닫힙니다!'); } sb.door = sb.t < 0.4 ? sb.t / 0.4 : Math.min(1, el / 0.35); if (sb.closing && sb.t >= 0.4) sb.door = Math.min(sb.door, 0.75 + 0.25 * Math.cos(b.time * 8) * 0);  if (sb.t <= 0) { sb.phase = 'depart'; sb.t = 0; sb.door = 0; sb.hinted = false; sb.closing = false; b.hooks.onSystem && b.hooks.onSystem('문이 닫힙니다. 열차가 출발합니다!'); for (const u of b.u) if (u.inTrain) b.stats.rides++; } }
      else if (sb.phase === 'depart') {
        sb.t -= 0; sb.dep = (sb.dep || 0) + dt; sb.x0 = T.stopX + 0.5 * S.acc * sb.dep * sb.dep;
        if (sb.x0 > AR.x + AR.w + 4) { SUB.leave(b); sb.phase = 'absent'; sb.t = rand(S.gap[0], S.gap[1]); sb.dep = 0; sb.x0 = -sb.L - 60; for (const w of sb.windows) { w.broken = false; w.hp = w.max; } }
      }
      sb.vx = (sb.x0 - prevX) / dt;
      if (!SUB.present(sb)) { for (const u of b.u) u.inTrain = false; return; }
      for (const p of b.proj) { // 투사체: 벽/창문에 막힘, 열린 문/깨진 창은 통과
        if (p.x < sb.x0 || p.x > sb.x0 + sb.L) continue;
        const py = p.y + 14;
        for (const side of ['top', 'bot']) {
          const wy = side === 'top' ? T.y : T.y + T.h;
          if (Math.abs(py - wy) > 4) continue;
          const lx = p.x - sb.x0;
          if (SUB.gaps(sb, side).some(([a, e]) => lx >= a && lx <= e)) continue;
          const w = SUB.winAt(sb, side, lx);
          if (w) SUB.hitWindow(b, w, p.dmg * 0.6, p.x, wy - 6);
          p.life = 0; b.burst(p.x, p.y, '#e8ecf0', 4);
        }
      }
      const moving = sb.phase === 'arrive' || Math.abs(sb.vx) > 30;
      for (const u of b.u) {
        if (u.dead || u.airborne) continue;
        if (u.inTrain) { u.x += sb.vx * dt; } // 열차와 함께 이동
        const inside = SUB.inside(sb, u);
        if (moving && inside && !u.inTrain) { SUB.fling(b, u); continue; } // 달려오는 열차에 휩쓸림
        if (moving && !inside) { // 열차와 겹치면 치임
          const r = R(u), qx = clamp(u.x, sb.x0, sb.x0 + sb.L), qy = clamp(u.y, T.y, T.y + T.h);
          if (Math.hypot(u.x - qx, u.y - qy) < r * 0.8) { SUB.fling(b, u); continue; }
        }
        if (sb.phase === 'stop' && u.inTrain && sb.t < (S.exitHint || 0) && !u.action) { // 문 닫힘 안내: 가까운 문 쪽으로 서서히 방향 전환
          let best = null, bd = 1e9;
          for (const [side, yy] of [['top', T.y - 12], ['bot', T.y + T.h + 12]]) for (const d of SUB.doorList(T, side)) {
            const dx = sb.x0 + (d[0] + d[1]) / 2; if (dx < AR.x + 10 || dx > AR.x + AR.w - 10) continue;
            const dd = Math.hypot(dx - u.x, yy - u.y); if (dd < bd) { bd = dd; best = [dx, yy]; }
          }
          if (best) { const ta = Math.atan2(best[1] - u.y, best[0] - u.x), df = Math.atan2(Math.sin(ta - u.dir), Math.cos(ta - u.dir)); u.dir = fixAngle(u.dir + clamp(df, -6 * dt, 6 * dt)); }
        }
        SUB.collideWalls(b, u, sb);
        u.inTrain = SUB.inside(sb, u);
      }
    },
    leave(b) {
      const L = b.u.filter(u => u.inTrain && !u.dead);
      if (!L.length || b.over) return;
      b.stats.trainElim++;
      let loser, winner, txt;
      if (b.multi) { // 다인 팀: 팀원이 남아 있으면 계속, 팀 전멸 시 패배
        for (const u of L) { u.dead = true; u.hidden = true; u.deadT = 9; }
        b.hooks.onSystem && b.hooks.onSystem(L.map(u => u.def.name).join(', ') + ' 지하철에 실려 떠났습니다!');
        const al = [b.teamAlive(0), b.teamAlive(1)];
        if (al[0] && al[1]) { L.forEach(u => b.allyDown(u)); return; }
        if (!al[0] && !al[1]) { b.stats.trainBoth++; winner = [...L].sort((p, q) => q.hp / q.maxHp - p.hp / p.maxHp)[0]; txt = label => `모두 지하철에 실려 탈락! 체력 비율로 ${label(winner)} 승리!`; b.endType = 'trainDraw'; }
        else { const wt = al[0] ? 0 : 1; winner = b.teamBest(wt); loser = L.find(u => u.team !== wt); txt = label => `${label(loser)} 지하철에 실려 탈락! ${label(winner)} 승리!`; b.endType = 'train'; }
        b.over = true; b.winner = winner; b.resultText = txt; return;
      }
      if (L.length === 1) { loser = L[0]; winner = b.enemy(loser); txt = label => `${label(loser)} 지하철에 실려 탈락! ${label(winner)} 승리!`; b.endType = 'train'; }
      else { // 둘 다 탑승: 남은 체력 비율이 높은 쪽 승리
        b.stats.trainBoth++;
        const [p, q] = L; winner = (p.hp / p.maxHp) >= (q.hp / q.maxHp) ? p : q; loser = b.enemy(winner);
        txt = label => `둘 다 지하철에 실려 탈락! 체력 비율로 ${label(winner)} 승리!`; b.endType = 'trainDraw';
      }
      for (const u of L) { u.dead = true; u.hidden = true; u.deadT = 9; }
      b.over = true; b.winner = winner; b.resultText = txt;
      b.hooks.onSystem && b.hooks.onSystem(L.length === 1 ? loser.def.name + ' 지하철에 실려 떠났습니다!' : '둘 다 지하철에 실려 떠났습니다!');
    },
    floor(x, st) {
      const S = st.subway; if (!S) return;
      for (const [y0, y1] of [[AR.y, S.platTop], [S.platBot, AR.y + AR.h]]) {
        for (let j = y0; j < y1; j += 16) for (let i = AR.x; i < AR.x + AR.w; i += 16) { x.fillStyle = ((i + j) / 16) % 2 ? '#b8b4ac' : '#c0bcb4'; x.fillRect(i, j, 16, Math.min(16, y1 - j)); }
      }
      // 선로
      x.fillStyle = '#2e2c30'; x.fillRect(AR.x, S.platTop, AR.w, S.platBot - S.platTop);
      for (let i = 0; i < 260; i++) { x.fillStyle = i % 3 ? '#3a383c' : '#26242a'; x.fillRect(AR.x + (i * 53) % AR.w, S.platTop + (i * 97) % (S.platBot - S.platTop), 3, 2); }
      const T = S.train, ry = [T.y + 28, T.y + T.h - 28];
      for (let i = AR.x; i < AR.x + AR.w; i += 14) { x.fillStyle = '#4a3a2e'; x.fillRect(i, ry[0] - 10, 6, ry[1] - ry[0] + 20); }
      for (const yy of ry) for (const o of [-8, 8]) { x.fillStyle = '#8a8c94'; x.fillRect(AR.x, yy + o - 1, AR.w, 2); x.fillStyle = '#c8cad0'; x.fillRect(AR.x, yy + o - 1, AR.w, 1); }
      // 승강장 끝: 안전선 + 그림자
      x.fillStyle = '#e8c840'; x.fillRect(AR.x, S.platTop - 9, AR.w, 4); x.fillRect(AR.x, S.platBot + 5, AR.w, 4);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(AR.x, S.platTop, AR.w, 4); x.fillRect(AR.x, S.platBot - 4, AR.w, 4);
      x.fillStyle = '#8a867e'; x.fillRect(AR.x, S.platTop - 2, AR.w, 2); x.fillRect(AR.x, S.platBot, AR.w, 2);
      // 기둥/벤치 장식
      for (const px of [60, 180, 300]) { x.fillStyle = '#7a7e88'; x.fillRect(px - 5, AR.y + 30, 10, 14); x.fillRect(px - 5, AR.y + AR.h - 40, 10, 14); }
    },
    drawUnder(ctx, b, thumb) {
      const sb = b.sub; if (!sb) return;
      const S = sb.S, T = S.train;
      const ph = thumb ? 'stop' : sb.phase, x0 = thumb ? T.stopX : sb.x0, door = thumb ? 1 : sb.door;
      // 신호등
      const col = ph === 'absent' ? '#5ad07a' : ph === 'warn' ? '#ffb040' : '#ff5a5a';
      for (const [sx, sy] of [[AR.x + 8, S.platTop - 20], [AR.x + AR.w - 8, S.platBot + 20]]) {
        ctx.fillStyle = '#1e1e24'; ctx.fillRect(sx - 4, sy - 7, 8, 14);
        const pulse = ph === 'warn' ? 0.6 + 0.4 * Math.sin(b.time * 6) : 1;
        ctx.globalAlpha = pulse; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (ph === 'warn') { // 선로 은은한 경고광
        const a = 0.08 + 0.07 * (0.5 + 0.5 * Math.sin(b.time * 5));
        const g = ctx.createLinearGradient(AR.x, 0, AR.x + AR.w, 0); g.addColorStop(0, `rgba(255,190,90,${a * 1.6})`); g.addColorStop(1, `rgba(255,190,90,${a * 0.4})`);
        ctx.fillStyle = g; ctx.fillRect(AR.x, T.y + 10, AR.w, T.h - 20);
      }
      if (!(thumb || SUB.present(sb))) return;
      ctx.save(); ctx.beginPath(); ctx.rect(AR.x, AR.y, AR.w, AR.h); ctx.clip();
      const y = T.y, h = T.h, L = sb.L;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x0 + 4, y + 6, L, h);
      ctx.fillStyle = '#d4d8de'; ctx.fillRect(x0, y, L, h); // 바닥
      for (let i = 0; i < L; i += 12) { ctx.fillStyle = 'rgba(0,0,0,0.04)'; ctx.fillRect(x0 + i, y, 6, h); }
      for (let c = 0; c < T.cars; c++) {
        const cx = x0 + c * T.carW;
        // 좌석 (가벼운 장식)
        for (const sy of [y + 6, y + h - 14]) for (const [a, e] of [[6, 32], [88, 114]]) { ctx.fillStyle = '#3a5a9a'; ctx.fillRect(cx + a, sy, e - a, 8); ctx.fillStyle = '#5a7aba'; ctx.fillRect(cx + a, sy, e - a, 2); }
        if (c) { ctx.fillStyle = '#9aa0a8'; ctx.fillRect(cx - 2, y + 30, 4, h - 60); } // 연결부
        ctx.fillStyle = '#e8c840'; ctx.fillRect(cx + 46, y + h / 2 - 2, 28, 4); // 손잡이 봉
      }
      // 벽
      for (const side of ['top', 'bot']) {
        const wy = side === 'top' ? y - 3 : y + h - 3;
        ctx.fillStyle = '#a8b0bc';
        const sol = thumb ? SUB.solidsThumb(sb, side) : SUB.solids(sb, side);
        for (const [a, e] of sol) { ctx.fillRect(x0 + a, wy, e - a, 6); ctx.fillStyle = '#2f7ad0'; ctx.fillRect(x0 + a, wy + (side === 'top' ? 4 : 0), e - a, 2); ctx.fillStyle = '#a8b0bc'; }
        // 창문
        for (const w of sb.windows) if (w.side === side) {
          const wx = x0 + w.a, ww = w.e - w.a;
          if (w.broken) { ctx.fillStyle = 'rgba(200,230,255,0.5)'; for (let k = 0; k < 4; k++) ctx.fillRect(wx + k * ww / 4 + 2, wy + (k % 2) * 3, 3, 2); continue; }
          ctx.fillStyle = w.hitT > 0 ? '#ffffff' : '#9fd8f0'; ctx.fillRect(wx, wy + 1, ww, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(wx + 3, wy + 1, ww * 0.3, 1);
          const cs = Math.floor((1 - w.hp / w.max) * 3); ctx.strokeStyle = '#4a6a88'; ctx.lineWidth = 1;
          for (let k = 0; k < cs; k++) { const kx = wx + ww * (0.25 + 0.25 * k); ctx.beginPath(); ctx.moveTo(kx, wy + 1); ctx.lineTo(kx + 3, wy + 3); ctx.lineTo(kx - 2, wy + 5); ctx.stroke(); }
        }
        // 문 (열림 정도만큼 옆으로 밀림)
        for (const d of SUB.doorList(T, side)) {
          const dx = x0 + d[0], dw = d[1] - d[0], half = dw / 2, sl = half * door;
          ctx.fillStyle = '#e0e4ea'; ctx.fillRect(dx - sl, wy, half, 6); ctx.fillRect(dx + half + sl, wy, half, 6);
          ctx.fillStyle = '#e07a3a'; ctx.fillRect(dx - sl + half - 2, wy + 1, 2, 4); ctx.fillRect(dx + half + sl, wy + 1, 2, 4);
        }
      }
      // 앞뒤 끝 (운전실, 헤드라이트)
      ctx.fillStyle = '#8a929e'; ctx.fillRect(x0 - 4, y - 3, 6, h + 6); ctx.fillRect(x0 + L - 2, y - 3, 8, h + 6);
      ctx.fillStyle = '#fff6c8'; ctx.fillRect(x0 + L + 4, y + 14, 3, 8); ctx.fillRect(x0 + L + 4, y + h - 22, 3, 8);
      if (!thumb && Math.abs(sb.vx) > 30) { // 이동 중: 속도선 + 헤드라이트 광
        Render.glowAt(ctx, x0 + L + 10, y + 18, 18, '#fff0c0', 0.35); Render.glowAt(ctx, x0 + L + 10, y + h - 18, 18, '#fff0c0', 0.35);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
        for (let k = 0; k < 8; k++) { const ly = y + 8 + k * (h - 16) / 7, ll = Math.min(60, Math.abs(sb.vx) * 0.12); ctx.beginPath(); ctx.moveTo(x0 - 8, ly); ctx.lineTo(x0 - 8 - ll, ly); ctx.stroke(); }
      }
      ctx.restore();
    },
    solidsThumb(sb, side) { const d = sb.door; sb.door = 1; const r = SUB.solids(sb, side); sb.door = d; return r; },
  };
  STAGE_HOOKS.push(RACE, SUB);
  window.StageExt = { RACE, SUB };
})();
