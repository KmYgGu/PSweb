/* =========================================================
 * 피구대전 스테이지 (STAGE_HOOKS)
 *  - 가로로 긴 코트: 왼쪽 = 1P 팀 구역, 오른쪽 = 2P 팀 구역. 카메라는 선수·공 분포에 맞춰 확대/이동 (main.js → DODGE.updateCam, 시각 전용)
 *  - 팀 = 주인공(1P/2P) + 무작위 팀원 4명 (중복 없음). 팀원은 피구만 함 (스킬·피해 없음), 시작 때 팀마다 1명은 상대 구역 바깥(외야)
 *  - 기본 이동으로는 중앙선을 못 넘음 (스킬로만 침투). 스킬도 코트 밖으로는 못 나감 (play = 코트)
 *  - 팀원이 공에 맞으면 즉시 아웃 → 상대 구역 바깥으로 (부활 없음). 주인공은 공에 맞으면 피해 (경과 시간·남은 팀원 수 비례)
 *    체력 0 → 쓰러졌다 일어나 외야로 (이후 공에 안 맞음, 외야에서 던지기는 가능). 안쪽에 아무도 없으면 패배
 *  - 시선은 공을 향해 돎. 연속 패스할수록 상대 시선 추적이 느려지고(뒤통수 노출), 받는 쪽 놓칠 확률이 오름 (공 주인이 바뀌면 초기화)
 *  - 등 뒤에서 맞으면 무조건 명중, 정면이면 확률로 받아냄 (받으면 공격권 전환)
 *  - 공: 처음 1개, 시간이 지나면 하나씩 추가 (최대 3개)
 *  - 난수는 시뮬레이션(step) 안에서만 (리플레이 시드), 그리기에는 난수 없음
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const FONT = '"Galmuri11", "Malgun Gothic", sans-serif';
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const AR0 = { x: AR.x, y: AR.y, w: AR.w, h: AR.h };
  const setAR = r => { AR.x = r.x; AR.y = r.y; AR.w = r.w; AR.h = r.h; };
  const hyp = Math.hypot;
  const COL = ['#6aa8ff', '#ff7b7b'];

  STAGE_DEFS.dodge = {
    name: '피구대전', short: '피구', theme: 'basket', noSwitchIn: true,
    desc: '가로로 긴 피구 코트에서 팀원 4명과 함께하는 피구 대결! 팀원은 맞으면 바로 아웃, 주인공은 맞으면 체력이 깎이고 0이 되면 외야로. 상대 진영 안쪽에 아무도 남지 않으면 승리. 패스를 돌려 상대 시선을 흔들고 등 뒤를 노리세요. 시간이 지나면 공이 늘어납니다.',
    // court: 코트 선, cx: 중앙선, band: 외야 폭. npcK: 팀원 그림 배율
    dodge: {
      world: { w: 760, h: 520 }, court: { x: 60, y: 130, w: 640, h: 280 }, band: 46, npcK: 0.8,
      spdIn: 150, spdOut: 165, spdExit: 230, spdMainExit: 320, outBoost: { per: 0.25, n: 5, max: 1.8 }, passBoost: { per: 0.06, max: 0.4 }, // outBoost: 외야 속도 × min(max, 1 + per × (n − 외야 인원)), passBoost: 던지기 속도 × (1 + min(max, per × 연속 패스))
      turn: 5.0, // turn: 시선 회전 속도 (rad/s)
      passSlow: 0.35, slowMin: 0.3, // 상대 시선 속도 = turn / (1 + passSlow × 연속 패스 수), 최소 slowMin 배
      fumble: { base: 0.05, per: 0.06, max: 0.4 }, // 패스 받을 때 놓칠 확률 = base + per × 연속 패스 수
      catchP: { npc: 0.42, main: 0.5 }, backC: 0.3, // 정면 포구 확률 (정면 정도에 따라 ×0.5~1). 시선과 공 방향 cos < backC → 등 뒤 (무조건 명중)
      throwSpd: 430, passSpd: 280, hitR: 17, pickR: 14, lineR: 14, intercept: 0.3,
      dmg: { k: 0.045, perT: 1 / 40, perMate: 0.3, mates: 3 }, // 주인공 피해 = 최대체력 × k × (1 + 경과초 × perT) × (1 + perMate × (mates − 안쪽 팀원 수))
      slip: { v: 130, side: 50, t: 0.7 }, bounce: { v: 60, k: 8 }, ballR: 4.6, // slip: 놓친 공 미끄러짐 속도·옆 흔들림·못 줍는 시간, bounce: 팀원 충돌 튕김 속도, ballR: 공 반지름 (공끼리 충돌)
      smart: { lead: 0.9, jit: 5, passGain: 1.0, passP: 0.6, passMax: 2 }, // lead: 동선 예측 비율, jit: 조준 흔들림(px), passGain: 동료 쪽 노출 점수가 이만큼 높으면 패스 (passP 확률, 연속 패스 passMax 회까지)
      addT: [75, 150], maxBalls: 3, downT: 1.2, // downT: 체력 0 → 넘어졌다 일어나는 시간
    },
  };
  const S0 = STAGE_DEFS.dodge.dodge, C0 = S0.court, CX = C0.x + C0.w / 2;
  const PLAY = { x: C0.x - 14, y: C0.y - 26, w: C0.w + 28, h: C0.h + 34 }; // 유닛 발이 코트 선 안에 머물도록 (game.js 경계 여백 보정)

  // ---------- 도우미 ----------
  const isU = e => e.maxHp != null;
  const gz = e => isU(e) ? (e.dgG || 0) : e.g;
  const setG = (e, g) => { if (isU(e)) e.dgG = g; else e.g = g; };
  const sideOf = x => x < CX ? 0 : 1;
  const inCourt = (x, y, m = 0) => x > C0.x - m && x < C0.x + C0.w + m && y > C0.y - m && y < C0.y + C0.h + m;
  const angD = (a, c) => { let d = (c - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const mains = b => b.u.filter(u => !u.summon);
  const mainIn = u => !u.summon && !u.dead && u.dgDown == null && !u.dgOut;
  function insiders(b, D, t) { const L = b.u.filter(u => u.team === t && mainIn(u)); for (const n of D.npc) if (n.team === t && !n.out) L.push(n); return L; }
  const outsiders = (D, t) => D.npc.filter(n => n.team === t && n.out && !n.exiting);
  function zoneClamp(t, x, y) { const m = 8; return { x: t === 0 ? clamp(x, C0.x + m, CX - 6) : clamp(x, CX + 6, C0.x + C0.w - m), y: clamp(y, C0.y + 8, C0.y + C0.h - 6) }; }
  // 외야: 구역 Z 를 둘러싼 띠 (위·아래·바깥쪽 끝). 코트 안쪽 점은 가장 가까운 선 밖으로
  function outProj(Z, x, y) {
    const B = S0.band, m = 10, x0 = Z === 0 ? C0.x - B : CX + 4, x1 = Z === 0 ? CX - 4 : C0.x + C0.w + B;
    x = clamp(x, x0, x1); y = clamp(y, C0.y - B, C0.y + C0.h + B);
    if (inCourt(x, y, m)) {
      const dT = y - (C0.y - m), dB = C0.y + C0.h + m - y, dF = Z === 0 ? x - (C0.x - m) : C0.x + C0.w + m - x, k = Math.min(dT, dB, dF);
      if (k === dT) y = C0.y - m; else if (k === dB) y = C0.y + C0.h + m; else x = Z === 0 ? C0.x - m : C0.x + C0.w + m;
    }
    return { x, y };
  }
  function trackK(b, D, t) { // 팀 t 의 시선 속도 배율: 상대 팀이 쥐었거나 패스 중인 공의 연속 패스 수가 많을수록 느림
    let n = 0; for (const B of D.balls) if (B.team === 1 - t && B.st !== 'loose') n = Math.max(n, B.passN);
    return Math.max(S0.slowMin, 1 / (1 + S0.passSlow * n));
  }
  const ballPos = B => B.st === 'held' && B.h ? { x: B.h.x, y: B.h.y } : { x: B.x, y: B.y };
  function addBall(b, D, x, y) { D.balls.push({ id: D.balls.length, x, y, z: 0, vx: 0, vy: 0, st: 'loose', h: null, team: -1, passN: 0, hold: 0, kind: null }); b.stats.dgBalls = D.balls.length; }

  const stunned = e => { const u = isU(e) ? e : e.px && !e.px.dead ? e.px : null; return !!(u && u.blocked('blocksAct')); };
  // 외야 경로: 구역 Z 바깥을 도는 ㄷ자 (위 → 바깥 끝 → 아래). 이동은 경로 위 거리(s)로 → 코트 안 대각선으로 가로지르지 않음
  const PO = 12, PATHS = [0, 1].map(Z => { const xn = Z === 0 ? CX - 10 : CX + 10, xf = Z === 0 ? C0.x - PO : C0.x + C0.w + PO, yT = C0.y - PO, yB = C0.y + C0.h + PO; return [[xn, yT], [xf, yT], [xf, yB], [xn, yB]]; });
  function pathProj(Z, x, y) {
    const P = PATHS[Z]; let best = 0, bd = 1e9, acc = 0;
    for (let i = 0; i < 3; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1], L = hyp(bx - ax, by - ay), k = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L), 0, 1), d = hyp(ax + (bx - ax) * k - x, ay + (by - ay) * k - y); if (d < bd) { bd = d; best = acc + k * L; } acc += L; }
    return best;
  }
  function pathPos(Z, s) {
    const P = PATHS[Z]; for (let i = 0; i < 3; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1], L = hyp(bx - ax, by - ay); if (s <= L || i === 2) { const k = clamp(s / L, 0, 1); return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k }; } s -= L; }
  }
  function mkProxy(b, n) { // 상대 주인공이 아웃되면 남은 안쪽 팀원에 보이지 않는 대리 유닛 → 주인공 공격·스킬이 노림 (피해 0, 넉백·상태이상만)
    const p = new Unit({ ...n.def, id: n.def.id + '@dgpx', noDraw: true }, n.team, 8 + n.id, 1); p.summon = { owner: null, key: 'dgProxy', t: 1e9, dur: 1e9, onEnd: null, step: null }; p.dgProxy = n; /* summon 형식(js/ghoul.js stepSummons 와 호환: 주인 = 아웃된 주인공, 시간 무한) */ p.x = n.x; p.y = n.y; p.facing = Math.cos(n.g) >= 0 ? 1 : -1; p.summon.owner = p; n.px = p; b.u.push(p); return p;
  }
  function mkNpc(D, def, team, out) {
    const n = { id: D.nid++, def, team, out, exiting: false, x: 0, y: 0, g: team === 0 ? 0 : Math.PI, moving: false, walk: 0, hx: 0, hy: 0, homeT: 0, vx: 0, vy: 0 };
    D.npc.push(n); return n;
  }

  const DG = {
    match: st => !!st.dodge,
    init(b) {
      const S = b.stage.dodge; if (!S) return;
      const D = b.dg = { on: true, clock: 0, npc: [], balls: [], nid: 0, added: 0, msg: null, reuse: false };
      b.play = { ...PLAY };
      const used = new Set(); for (const u of b.u) { used.add(u.def.id); if (u.def.partner) used.add(u.def.partner.id); }
      let pool = CHARACTERS.filter(c => !used.has(c.id) && !c.hidden);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      if (pool.length < 8) { D.reuse = true; const src = pool.length ? pool : CHARACTERS.slice(); while (pool.length < 8) pool = pool.concat(src); }
      for (let t = 0; t < 2; t++) for (let i = 0; i < 4; i++) {
        const n = mkNpc(D, pool[t * 4 + i], t, i === 3);
        if (n.out) { const p = outProj(1 - t, t === 0 ? C0.x + C0.w + 30 : C0.x - 30, C0.y + C0.h / 2); n.x = p.x; n.y = p.y; }
        else { const p = zoneClamp(t, t === 0 ? CX - 70 - (i % 2) * 120 : CX + 70 + (i % 2) * 120, C0.y + 50 + i * 90); n.x = p.x; n.y = p.y; }
        n.hx = n.x; n.hy = n.y;
      }
      for (const u of b.u) { if (u.summon) continue; u.x = u.team === 0 ? CX - 150 : CX + 150; u.y = C0.y + C0.h / 2 + (u.n > 1 ? 50 : 0); u.facing = u.team === 0 ? 1 : -1; u.dgG = u.team === 0 ? 0 : Math.PI; }
      D.side0 = Math.random() < 0.5 ? -1 : 1; addBall(b, D, CX + D.side0 * 8, C0.y + C0.h / 2); // 첫 공: 중앙선 바로 옆 (어느 쪽인지 시드 동전) → 그쪽 안쪽 vs 상대 외야
      Object.assign(b.stats, { dgOut: 0, dgMainOut: 0, dgCatch: 0, dgPass: 0, dgFumble: 0, dgThrow: 0, dgHit: 0, dgBack: 0, dgSteal: 0, dgBalls: 1, dgDmg: 0, dgOutHitTry: 0, dgDownHitTry: 0, dgFast: 0, dgPxHit: 0, dgPxLeak: 0, dgSmartPass: 0, dgPx: 0, dgPathHit: 0, dgBallHit: 0 });
      D.msg = { big: '피구 시작!', sub: '중앙의 공을 먼저 잡아라', col: '#ffffff', t: 0, dur: 1.6 };
    },
    leave(b) { const D = b.dg; if (!D) return; D.on = false; for (let i = b.u.length - 1; i >= 0; i--) if (b.u[i].dgProxy) b.u.splice(i, 1); /* 대리 유닛 제거 (다른 스테이지 규칙에 섞이지 않게) */ setAR(AR0); if (b.cam) b.cam = null; for (const u of b.u) if (u.dgOut || u.dgDown != null) { if (u.dgPark) { u.x = u.dgPark.x; u.y = u.dgPark.y; u.dgPark = null; } u.hidden = false; u.dead = false; u.statuses = []; u.dgOut = false; u.dgDown = null; u.hp = Math.max(1, u.hp); } sys(b, '피구 중단 — 이제부터는 체력 승부!'); },
    clamp(b, x, y, pad) { return { x, y }; },
    noClamp(b, u) { return !!(b.dg && b.dg.on && u.dgOut); }, // 맵 밖에 숨긴 아웃 주인공은 경기장 안으로 되돌리지 않음
    preDamage(b, src, tgt, amount, o) { const D = b.dg; if (!D || !D.on) return; if (tgt && (tgt.dgOut || tgt.dgDown != null)) { if (tgt.dgOut) b.stats.dgOutHitTry++; else b.stats.dgDownHitTry++; return true; } },

    step(b, dt) {
      const D = b.dg; if (!D || !D.on) return;
      D.clock += dt; if (D.msg) { D.msg.t += dt; if (D.msg.t >= D.msg.dur) D.msg = null; }
      if (b.over || b.freeze) return;
      // 공 추가
      if (D.added < S0.addT.length && D.balls.length < S0.maxBalls && D.clock >= S0.addT[D.added]) {
        D.added++; addBall(b, D, CX + (D.added % 2 ? -D.side0 : D.side0) * 8, C0.y + C0.h / 2 + (D.added % 2 ? -60 : 60));
        D.msg = { big: '공 추가!', sub: `공 ${D.balls.length}개`, col: '#ffe27a', t: 0, dur: 1.4 }; sys(b, `피구: 공이 ${D.balls.length}개가 되었습니다!`);
      }
      // 주인공 중앙선: 기본 이동으로 넘어간 경우 자기 구역으로 되밀기 (스킬 동작 중에는 허용)
      for (const u of b.u) {
        if (u.dead || u.dgOut || u.dgDown != null || u.dgProxy) continue;
        const own = u.team, wrong = sideOf(u.x) !== own;
        if (wrong && !u.action) { u.x += (own === 0 ? -1 : 1) * 160 * dt; }
      }
      DG.downStep(b, D, dt);
      if (!D.pxInit) { D.pxInit = true; for (const n of D.npc) if (!n.out) { mkProxy(b, n); b.stats.dgPx++; } } // 첫 스텝(HUD 구성 뒤): 안쪽 팀원마다 대리 유닛 → 스킬 넉백·상태이상·오브젝트 영향 (피해 0)
      for (const n of D.npc) if (n.px && !n.px.dead) { n.x = n.px.x; n.y = n.px.y; } // 넉백·끌어당김 반영
      DG.gaze(b, D, dt);
      DG.npcMove(b, D, dt);
      DG.collide(b, D);
      for (const n of D.npc) if (n.px && !n.px.dead) { n.px.x = n.x; n.px.y = n.y; n.px.facing = Math.cos(n.g) >= 0 ? 1 : -1; }
      for (const e of [...D.npc, ...b.u.filter(mainIn)]) { if (e._lx != null && dt > 0) { e.dvx = (e.dvx || 0) * 0.7 + (e.x - e._lx) / dt * 0.3; e.dvy = (e.dvy || 0) * 0.7 + (e.y - e._ly) / dt * 0.3; } e._lx = e.x; e._ly = e.y; } // 속도 추정 (동선 예측용)
      for (const B of D.balls) DG.ballStep(b, D, B, dt);
      DG.ballBalls(b, D);
      for (let t = 0; t < 2; t++) if (!b.over && !insiders(b, D, t).length) DG.finish(b, D, 1 - t);
    },
    downStep(b, D, dt) {
      for (const u of b.u) {
        if (u.dgDown == null) continue;
        u.dgDown += dt; u.hp = 0; u.action = null; for (const st of u.statuses) st.t = Math.max(0, st.t - dt);
        if (u.dgDown >= S0.downT) {
          u.dgDown = null; u.dgOut = true; u.hidden = true; u.dead = true; u.deadT = 0; u.statuses = []; /* dead: 캐릭터별 상대 고르기(!o.dead)에서도 빠짐 (kill 흐름은 거치지 않음) */
          const n = mkNpc(D, u.def, u.team, true); n.main = u; n.x = u.x; n.y = u.y; n.exiting = true; n.g = u.dgG || 0;
          u.dgPark = { x: u.x, y: u.y }; u.x = -4000; u.y = -4000; // 숨긴 주인공 본체는 맵 밖으로 (광역기·투사체가 보이지 않는 대상을 맞히지 않게)
          const p = outProj(1 - u.team, u.team === 0 ? C0.x + C0.w + 30 : C0.x - 30, u.y); n.hx = p.x; n.hy = p.y;
          for (const B of D.balls) if (B.st === 'held' && B.h === u) B.h = n;
        }
      }
    },
    mainOut(b, D, u) {
      if (u.dgDown != null || u.dgOut) return;
      u.dgDown = 0; u.hp = 0; u.action = null; u.air = null; b.stats.dgMainOut++;
      u.statuses = [{ id: 'stun', t: S0.downT, dur: S0.downT, src: null, tickT: 0, knock: true }]; u.knockSide = u.team === 0 ? -1 : 1; b.dust && b.dust(u.x, u.y); // 기본 넘어짐 연출 (game.js 의 knock 기절 그림: 쓰러졌다 끝에 일어남)
      b.burst(u.x, u.y - 16, u.def.color, 18); b.shake(2.5); b.hitstop(0.15);
      b.text(u.x, u.y - 70, '아웃!', '#ffe27a', 13); sys(b, `피구: ${u.def.name} 체력 0 — 외야로!`);
      for (const B of D.balls) if (B.st === 'held' && B.h === u) DG.drop(B, u.x, u.y);
      D.msg = { big: 'OUT!', sub: `${u.team ? '2P' : '1P'} ${u.def.name} 외야로`, col: COL[u.team], t: 0, dur: 1.4 };
    },
    drop(B, x, y) { B.st = 'loose'; B.h = null; B.x = x; B.y = y + 2; B.vx = (Math.random() - 0.5) * 80; B.vy = (Math.random() - 0.5) * 80; B.kind = null; },
    // 시선: 가장 위협적인 공(상대가 쥐었거나 날아오는 공) → 없으면 가장 가까운 공
    gaze(b, D, dt) {
      const ents = [...b.u.filter(mainIn), ...D.npc];
      for (const e of ents) {
        let best = null, bd = 1e9;
        for (const B of D.balls) { if (B.st === 'held' && B.h === e) continue; const p = ballPos(B), thr = B.team === 1 - e.team && B.st !== 'loose' ? 0.5 : 1, d = hyp(p.x - e.x, p.y - e.y) * thr; if (d < bd) { bd = d; best = p; } }
        if (!best) continue;
        const a = Math.atan2(best.y - e.y, best.x - e.x), g = gz(e), r = S0.turn * trackK(b, D, e.team) * dt, d = angD(g, a);
        setG(e, g + clamp(d, -r, r));
        if (isU(e) && !e.action) e.facing = Math.cos(gz(e)) >= 0 ? 1 : -1;
      }
    },
    npcMove(b, D, dt) {
      // 굴러다니는 공: 각 팀에서 자격 있는 가장 가까운 팀원이 쫓아감
      const ents = [...D.npc, ...b.u.filter(u => !u.summon && mainIn(u) && DG.free(b, u))]; // free: 싸울 상대가 없는 주인공 → 피구만 (팀원처럼 움직임)
      for (const e of ents) if (e.hx == null) { e.hx = e.x; e.hy = e.y; e.homeT = 0; }
      const chase = new Map();
      for (const B of D.balls) {
        if (B.st !== 'loose') continue;
        for (let t = 0; t < 2; t++) {
          let best = null, bd = 1e9;
          for (const n of ents) { if (n.team !== t || n.exiting || chase.has(n) || !DG.canPick(n, B)) continue; const d = hyp(n.x - B.x, n.y - B.y); if (d < bd) { bd = d; best = n; } }
          if (best) chase.set(best, B);
        }
      }
      const oc = [0, 1].map(t => D.npc.filter(n => n.team === t && n.out).length), OB = S0.outBoost;
      for (const n of ents) {
        let tx = n.hx, ty = n.hy, sp = n.out ? S0.spdOut * Math.min(OB.max, 1 + OB.per * Math.max(0, OB.n - oc[n.team])) : S0.spdIn;
        const P = n.px && !n.px.dead ? n.px : null; if (P) { if (P.blocked('blocksMove') || P.push || P.pull) { n.moving = false; continue; } sp *= clamp(P.mult('spdMul') * P.smult('spdMul'), 0.2, 1.5); } // 대리 유닛 상태이상: 묶이면 정지, 둔화
        const lineB = chase.has(n) && n.out && inCourt(chase.get(n).x, chase.get(n).y); // 중앙선 공: 외야 선수가 코트 안으로 들어와 주움
        if (n.exiting) { sp = n.main ? S0.spdMainExit : S0.spdExit; if (hyp(n.x - n.hx, n.y - n.hy) < 4) n.exiting = false; }
        else if (DG.recv(D, n)) { tx = n.x; ty = n.y; } // 패스 받는 중: 제자리
        else if (chase.has(n)) { const B = chase.get(n); tx = B.x; ty = B.y; }
        else if (n.ret) { const p = outProj(1 - n.team, n.x, n.y); tx = p.x; ty = p.y; if (hyp(n.x - p.x, n.y - p.y) < 3) n.ret = false; } // 코트 안 → 외야로 복귀
        else if (D.balls.some(B => B.st === 'held' && B.h === n)) { tx = n.x; ty = n.y; }
        else {
          n.homeT -= dt;
          if (n.homeT <= 0) { // 새 자리 (시드 난수)
            n.homeT = 0.8 + Math.random() * 1.4;
            const Hb = n.out && D.balls.find(B => B.st === 'held' && B.h && B.h.team === n.team && B.h !== n), O = Hb ? insiders(b, D, 1 - n.team) : [];
            if (Hb && O.length) { // 우리 편이 공을 쥠: 상대 무리의 반대편(등 뒤)으로
              let cx = 0, cy = 0; for (const o of O) { cx += o.x / O.length; cy += o.y / O.length; } const dx = cx - Hb.h.x, dy = cy - Hb.h.y, d = hyp(dx, dy) || 1;
              const p = pathPos(1 - n.team, pathProj(1 - n.team, cx + dx / d * 200, cy + dy / d * 200)); n.hx = p.x; n.hy = p.y; n.homeT = 0.6;
            } else
            if (n.out) { const Z = 1 - n.team, q = Math.random(); const p = q < 0.35 ? { x: Z === 0 ? C0.x + Math.random() * (CX - C0.x) : CX + Math.random() * (C0.x + C0.w - CX), y: C0.y - 20 } : q < 0.7 ? { x: Z === 0 ? C0.x + Math.random() * (CX - C0.x) : CX + Math.random() * (C0.x + C0.w - CX), y: C0.y + C0.h + 20 } : { x: Z === 0 ? C0.x - 24 : C0.x + C0.w + 24, y: C0.y + Math.random() * C0.h }; n.hx = p.x; n.hy = p.y; }
            else { const p = zoneClamp(n.team, n.team === 0 ? C0.x + 30 + Math.random() * (CX - C0.x - 50) : CX + 20 + Math.random() * (C0.x + C0.w - CX - 50), C0.y + 20 + Math.random() * (C0.h - 40)); n.hx = p.x; n.hy = p.y; }
          }
          tx = n.hx; ty = n.hy;
          if (!n.out) { // 피하기: 상대가 쥔 공에서 멀어지고, 날아오는 공은 옆으로
            let ax = 0, ay = 0;
            for (const B of D.balls) {
              if (B.team !== 1 - n.team) continue;
              if (B.st === 'held' && B.h) { const dx = n.x - B.h.x, dy = n.y - B.h.y, d = hyp(dx, dy) || 1; if (d < 160) { ax += dx / d * (160 - d); ay += dy / d * (160 - d); } }
              else if (B.st === 'fly' && B.kind === 'throw') { const sp2 = hyp(B.vx, B.vy) || 1, ux = B.vx / sp2, uy = B.vy / sp2, rx = n.x - B.x, ry = n.y - B.y, along = rx * ux + ry * uy; const gc = Math.cos(gz(n)) * -ux + Math.sin(gz(n)) * -uy; if (gc > S0.backC && along > 0 && along < 110) { const px = rx - ux * along, py = ry - uy * along, s = (px * -uy + py * ux) >= 0 ? 1 : -1; ax += -uy * s * 50; ay += ux * s * 50; } }
            }
            if (ax || ay) { tx = n.x + ax; ty = n.y + ay; }
          }
        }
        if (n.out && !n.exiting && !lineB && !n.ret && !(chase.has(n) && (hyp(tx - n.x, ty - n.y) < 40 || Math.abs(pathProj(1 - n.team, tx, ty) - pathProj(1 - n.team, n.x, n.y)) < 24))) { /* 공 근처(경로상 가까움)면 곧장 */ // 외야: 경로(ㄷ자) 위로만 이동 → 모서리를 돌아감
          const Z = 1 - n.team, cs = pathProj(Z, n.x, n.y), ts = pathProj(Z, tx, ty), ds = clamp(ts - cs, -sp * dt, sp * dt), q = pathPos(Z, cs + ds);
          n.moving = Math.abs(ds) > 0.05 || hyp(q.x - n.x, q.y - n.y) > 0.5; if (n.moving) n.walk += dt * 10; n.x = q.x; n.y = q.y; continue;
        }
        const dx = tx - n.x, dy = ty - n.y, d = hyp(dx, dy), st = Math.min(d, sp * dt);
        n.moving = d > 2; if (n.moving) { n.x += dx / d * st; n.y += dy / d * st; n.walk += dt * 10; }
        if (n.kvx || n.kvy) { n.x += n.kvx * dt; n.y += n.kvy * dt; const f = Math.exp(-6 * dt); n.kvx *= f; n.kvy *= f; if (hyp(n.kvx, n.kvy) < 3) n.kvx = n.kvy = 0; } // 부딪혀 튕김
        if (n.out && !n.exiting && (lineB || n.ret)) { if (lineB) n.ret = true; continue; } // 중앙선 공 줍기·복귀 중: 외야 띠에 묶지 않음
        if (!n.exiting) { const p = n.out ? outProj(1 - n.team, n.x, n.y) : zoneClamp(n.team, n.x, n.y); n.x = p.x; n.y = p.y; }
      }
    },
    collide(b, D) {
      const L = [...b.u.filter(u => mainIn(u)), ...D.npc.filter(n => !n.exiting)];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i], c = L[j], dx = c.x - a.x, dy = c.y - a.y, d = hyp(dx, dy), R = 14;
        if (d >= R || d < 1e-6) continue;
        const push = (R - d), ux = dx / d, uy = dy / d, wa = isU(a) ? (isU(c) ? 0 : 0.3) : (isU(c) ? 0.7 : 0.5), wc = isU(c) ? (isU(a) ? 0 : 0.3) : (isU(a) ? 0.7 : 0.5);
        if (wa) { a.x -= ux * push * wa; a.y -= uy * push * wa; } if (wc) { c.x += ux * push * wc; c.y += uy * push * wc; }
        const kb = S0.bounce.v + push * S0.bounce.k; if (!isU(a)) { a.kvx = (a.kvx || 0) - ux * kb; a.kvy = (a.kvy || 0) - uy * kb; } if (!isU(c)) { c.kvx = (c.kvx || 0) + ux * kb; c.kvy = (c.kvy || 0) + uy * kb; } // 팀원끼리·주인공과 부딪히면 튕겨남
        for (const e of [a, c]) if (!isU(e) && !e.ret) { const p = e.out ? outProj(1 - e.team, e.x, e.y) : zoneClamp(e.team, e.x, e.y); e.x = p.x; e.y = p.y; }
      }
    },
    ballBalls(b, D) { // 공끼리: 같은 질량 탄성 충돌 (법선 속도 교환) → 튕긴 공은 더 이상 유효한 공격이 아님 (굴러가는 공)
      const L = D.balls.filter(B => B.st === 'fly' || B.st === 'loose'), r2 = S0.ballR * 2;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const A = L[i], C = L[j], dx = C.x - A.x, dy = C.y - A.y, d = hyp(dx, dy);
        if (d >= r2 || d < 1e-6 || Math.abs((A.z || 0) - (C.z || 0)) > 14) continue;
        const nx = dx / d, ny = dy / d, rel = (A.vx - C.vx) * nx + (A.vy - C.vy) * ny, ov = (r2 - d) / 2;
        A.x -= nx * ov; A.y -= ny * ov; C.x += nx * ov; C.y += ny * ov;
        if (rel <= 0) continue;
        A.vx -= nx * rel; A.vy -= ny * rel; C.vx += nx * rel; C.vy += ny * rel; b.stats.dgBallHit++;
        for (const B of [A, C]) if (B.st === 'fly') { B.st = 'loose'; B.kind = null; B.to = null; B.aim = null; }
        b.spark && b.spark((A.x + C.x) / 2, (A.y + C.y) / 2 - 8, '#ffffff', -20);
      }
    },
    recv: (D, e) => D.balls.some(B => B.st === 'fly' && B.kind === 'pass' && B.to === e),
    fighters: (b, t) => b.u.filter(o => o.team === t && !o.dead && !o.hidden && (o.summon || mainIn(o))),
    free(b, u) { return !b.over && !u.dead && !DG.fighters(b, 1 - u.team).length; },
    canPick(e, B) {
      if (stunned(e) || (B.npT > 0 && B.noPick === e)) return false; // 놓친 직후: 놓친 사람은 잠깐 못 주움
      if (isU(e)) { if (!mainIn(e)) return false; }
      else if (e.exiting) return false;
      const ic = inCourt(B.x, B.y);
      if (e.out) return sideOf(B.x) === 1 - e.team && (!ic || Math.abs(B.x - CX) < S0.lineR); // 외야: 코트 밖 공 + 상대 진영 쪽 중앙선 공
      if (!ic) return false;
      return sideOf(B.x) === e.team; // 안쪽: 자기 진영 (중앙선 공은 우리 안쪽 vs 상대 외야 경쟁)
    },
    take(b, D, B, e) {
      B.st = 'held'; B.h = e; B.vx = B.vy = 0; B.z = 0; B.kind = null; B.hold = 0.35 + Math.random() * 0.55; B.wait = 0;
      if (B.team !== e.team) { B.team = e.team; B.passN = 0; }
    },
    ballStep(b, D, B, dt) {
      if (B.st === 'held') {
        const H = B.h;
        if (!H || (isU(H) ? !mainIn(H) && !(H.dgOut) : H.exiting && !H.main)) { DG.drop(B, H ? H.x : B.x, H ? H.y : B.y); return; }
        B.x = H.x; B.y = H.y; B.hold -= dt; B.wait += dt; if (H.ret) B.hold = Math.max(B.hold, 0.1);
        if (B.hold <= 0) DG.decide(b, D, B, H);
        return;
      }
      if (B.st === 'loose') {
        if (B.npT > 0) B.npT -= dt;
        const f = Math.exp(-2.4 * dt); B.vx *= f; B.vy *= f; B.x += B.vx * dt; B.y += B.vy * dt; B.z = Math.max(0, B.z - 60 * dt);
        const W = S0.world; if (B.x < 8 || B.x > W.w - 8) { B.vx *= -0.5; B.x = clamp(B.x, 8, W.w - 8); } if (B.y < 70 || B.y > W.h - 8) { B.vy *= -0.5; B.y = clamp(B.y, 70, W.h - 8); }
        // 외야 띠 밖(구석)으로 멈춘 공은 띠 안으로 굴러 들어오게
        if (!inCourt(B.x, B.y)) { const p = outProj(sideOf(B.x), B.x, B.y); B.x += (p.x - B.x) * Math.min(1, dt * 3); B.y += (p.y - B.y) * Math.min(1, dt * 3); }
        let best = null, bd = S0.pickR;
        for (const e of [...b.u.filter(mainIn), ...D.npc]) { if (!DG.canPick(e, B)) continue; const d = hyp(e.x - B.x, e.y - B.y); if (d < bd) { bd = d; best = e; } }
        if (best) DG.take(b, D, B, best);
        return;
      }
      // 날아가는 공
      B.x += B.vx * dt; B.y += B.vy * dt; B.trav += hyp(B.vx, B.vy) * dt; B.z = 10 + Math.sin(Math.min(1, B.trav / Math.max(60, B.len)) * Math.PI) * (B.kind === 'pass' ? 18 : 6);
      const sp = hyp(B.vx, B.vy) || 1, ix = -B.vx / sp, iy = -B.vy / sp;
      if (B.kind === 'pass') {
        const R = B.to;
        if (B.trav >= B.len - 10) { // 패스: 던진 순간의 받는 자리로 곧게 → 도착하면 판정 (받는 쪽은 제자리)
          const ok = R && !R.exiting && (isU(R) ? mainIn(R) : true) && hyp(R.x - B.x, R.y - B.y) < S0.hitR + 4;
          if (!ok) { B.to = null; DG.drop(B, B.x, B.y); return; }
          const fum = Math.min(S0.fumble.max, S0.fumble.base + S0.fumble.per * B.passN);
          if (Math.random() < fum) { // 놓침: 손에서 미끄러져 날아오던 방향으로 굴러감 (받는 사람은 잠깐 못 주움)
            b.stats.dgFumble++; const ux = B.vx / sp, uy = B.vy / sp, side = (Math.random() - 0.5) * 2;
            B.st = 'loose'; B.kind = null; B.to = null; B.h = null; B.x = R.x + ux * 8; B.y = R.y + uy * 8 + 2; B.z = 10;
            B.vx = ux * S0.slip.v - uy * side * S0.slip.side; B.vy = uy * S0.slip.v + ux * side * S0.slip.side; B.noPick = R; B.npT = S0.slip.t; B.team = R.team;
            b.text(R.x, R.y - 50, '놓침!', '#ffb0b0', 9); b.dust && b.dust(R.x, R.y);
          }
          else { B.passN++; b.stats.dgPass++; b.text(R.x, R.y - 50, '캐치', '#c8f0c8', 8); DG.take(b, D, B, R); }
          return;
        }
      }
      { // 비행 경로 위의 상대 전원 판정 (던지기·패스 공통, 같은 편은 통과): 등 뒤 = 명중, 정면 = 확률 포구
        for (const o of insiders(b, D, 1 - B.team)) {
          if (hyp(o.x - B.x, o.y - B.y) >= S0.hitR) continue;
          const g = gz(o), c = Math.cos(g) * ix + Math.sin(g) * iy;
          if (B.kind === 'pass' && B.trav < 24) continue; /* 던진 직후 바로 앞 상대는 제외 */
          if (B.aim !== o) b.stats.dgPathHit++;
          if (c >= S0.backC && !DG.noCatch(D, o) && !stunned(o)) { const p = (isU(o) ? S0.catchP.main : S0.catchP.npc) * (0.5 + 0.5 * (c - S0.backC) / (1 - S0.backC)); if (Math.random() < p) { b.stats.dgCatch++; if (B.kind === 'pass') b.stats.dgSteal++; b.text(o.x, o.y - 52, '캐치!', '#9ff0a0', 11); DG.take(b, D, B, o); return; } }
          else b.stats.dgBack++;
          DG.hit(b, D, B, o, c < S0.backC);
          return;
        }
      }
      const W = S0.world;
      if (B.trav > B.len + 160 || B.x < 6 || B.x > W.w - 6 || B.y < 72 || B.y > W.h - 6) { B.st = 'loose'; B.vx *= 0.35; B.vy *= 0.35; B.kind = null; B.x = clamp(B.x, 8, W.w - 8); B.y = clamp(B.y, 72, W.h - 8); }
    },
    hit(b, D, B, o, back) {
      b.stats.dgHit++;
      b.shock(o.x, o.y - 18, 4, 30, '#ffffff', 0.3, 3);
      if (isU(o)) {
        const mates = D.npc.filter(n => n.team === o.team && !n.out).length, K = S0.dmg;
        const dmg = Math.round(o.maxHp * K.k * (1 + D.clock * K.perT) * (1 + K.perMate * Math.max(0, K.mates - mates)) * (back ? 1.2 : 1));
        o.hp -= dmg; o.flash = 0.2; b.stats.dgDmg += dmg; b.text(o.x, o.y - 60, `-${dmg}${back ? ' 등!' : ''}`, '#ff6b6b', 11);
        if (o.hp <= 0) DG.mainOut(b, D, o);
      } else {
        o.out = true; o.exiting = true; b.stats.dgOut++; if (o.px) { o.px.dead = true; o.px.hidden = true; o.px.statuses = []; o.px.push = null; o.px.pull = null; }
        const p = outProj(1 - o.team, o.team === 0 ? C0.x + C0.w + 30 : C0.x - 30, o.y); o.hx = p.x; o.hy = p.y;
        b.text(o.x, o.y - 50, back ? '등 뒤 아웃!' : '아웃!', '#ffe27a', 10); sys(b, `피구: ${o.team ? '2P' : '1P'} 팀 ${o.def.name} 아웃`);
        for (const C of D.balls) if (C !== B && C.st === 'held' && C.h === o) DG.drop(C, o.x, o.y);
      }
      B.st = 'loose'; B.kind = null; B.vx = -B.vx * 0.25 + (Math.random() - 0.5) * 60; B.vy = -B.vy * 0.25 + (Math.random() - 0.5) * 60; B.z = 8;
    },
    // 노출 점수: 시선이 등 뒤(+2), 이동 중(+0.4), 공을 쥠/상태이상(받을 수 없음 +0.8/+1.2), 거리 감점
    expo(o, x, y) {
      const g = gz(o), dx = x - o.x, dy = y - o.y, d = hyp(dx, dy) || 1, c = (Math.cos(g) * dx + Math.sin(g) * dy) / d;
      return { c, s: (c < S0.backC ? 2 : 0) + (1 - c) * 0.5 - d / 600 + (hyp(o.dvx || 0, o.dvy || 0) > 40 ? 0.4 : 0) + (DG.noCatch(DG.bD, o) ? 0.8 : 0) + (stunned(o) ? 1.2 : 0) };
    },
    decide(b, D, B, H) {
      const t = H.team, O = insiders(b, D, 1 - t); if (!O.length) { B.hold = 0.3; return; }
      if (stunned(H)) { B.hold = 0.1; return; } // 상태이상: 못 던짐
      DG.bD = D;
      let best = null, bs = -1e9, bc = 1, s0 = -1e9;
      for (const o of O) { const e = DG.expo(o, H.x, H.y), s = e.s + Math.random() * 0.4; if (e.s > s0) s0 = e.s; if (s > bs) { bs = s; best = o; bc = e.c; } }
      const inH = isU(H) ? mainIn(H) : !H.out;
      const mates = [...insiders(b, D, t), ...outsiders(D, t)].filter(e => e !== H && !stunned(e) && !DG.noCatch(D, e));
      // 각도가 더 좋은 동료(특히 외야)가 있으면 그쪽으로 패스
      let bm = null, bms = -1e9; for (const m of mates) { let ms = -1e9; for (const o of O) ms = Math.max(ms, DG.expo(o, m.x, m.y).s); if (ms > bms) { bms = ms; bm = m; } }
      if (bc >= S0.backC && bm && bms > s0 + S0.smart.passGain && B.wait < 2.5 && B.passN < S0.smart.passMax && Math.random() < S0.smart.passP) { DG.launch(B, H, bm.x, bm.y, S0.passSpd, 'pass', bm); b.stats.dgSmartPass++; return; }
      const throwIt = bc < S0.backC || !mates.length || B.wait > 3 || Math.random() < 0.25 + 0.17 * B.passN;
      if (throwIt) {
        const PB = S0.passBoost, bk = Math.min(PB.max, PB.per * B.passN), sp = S0.throwSpd * (1 + bk);
        let px = best.x, py = best.y; // 동선 예측: 공이 닿는 시간만큼 이동 (반복 보정), 상대 구역 안으로
        for (let k = 0; k < 3; k++) { const tt = hyp(px - H.x, py - H.y) / sp; px = best.x + (best.dvx || 0) * tt * S0.smart.lead; py = best.y + (best.dvy || 0) * tt * S0.smart.lead; }
        const q = zoneClamp(best.team, px, py), ax = q.x + (Math.random() - 0.5) * 2 * S0.smart.jit, ay = q.y + (Math.random() - 0.5) * 2 * S0.smart.jit;
        DG.launch(B, H, ax, ay, sp, 'throw', null); B.aim = best; b.stats.dgThrow++; if (bk > 0) b.stats.dgFast++;
      } else {
        const pref = mates.filter(e => (isU(e) ? mainIn(e) : !e.out) !== inH);
        const L = pref.length && Math.random() < 0.7 ? pref : mates.length ? mates : null; if (!L) { B.hold = 0.2; return; }
        const R = L[Math.floor(Math.random() * L.length)];
        DG.launch(B, H, R.x, R.y, S0.passSpd, 'pass', R);
      }
    },
    noCatch: (D, e) => D.balls.some(B => (B.st === 'held' && B.h === e) || (B.st === 'fly' && B.kind === 'pass' && B.to === e)), // 공을 쥐었거나 받는 중
    launch(B, H, x, y, sp, kind, to) {
      const dx = x - H.x, dy = y - H.y, d = hyp(dx, dy) || 1;
      B.aim = null; B.st = 'fly'; B.kind = kind; B.to = to; B.h = null; B.x = H.x + dx / d * 10; B.y = H.y + dy / d * 10; B.vx = dx / d * sp; B.vy = dy / d * sp; B.trav = 0; B.len = d; B.tid = (B.tid || 0) + 1;
    },
    finish(b, D, team) {
      const ms = b.u.filter(o => o.team === team && !o.dgProxy && !o.summon), w = ms.find(mainIn) || ms[0] || b.teamBest(team);
      b.over = true; b.winner = w; b.endType = 'goal';
      b.resultText = label => { const m = b.u.filter(o => o.team === team && !o.summon); return `피구 승리! ${m.map(label).join(' & ')} 팀이 상대 코트를 비웠습니다`; };
      b.u.forEach(o => { if (!o.dead && !o.summon && !o.hidden) b.say(o, o.team === team ? 'win' : 'lose'); });
      b.hitstop(0.2);
    },

    // ================= 그리기 (시각 전용, 난수 없음) =================
    floor(x, st) {
      if (!st.dodge) return; const f = courtCanvas(); if (!f) return;
      const sh = S0.world.h * 0.8, sw = sh * AR.w / AR.h;
      x.save(); x.imageSmoothingEnabled = true; x.drawImage(f, CX - sw / 2, S0.world.h / 2 - sh / 2, sw, sh, AR.x, AR.y, AR.w, AR.h); x.restore();
    },
    drawUnder(ctx, b, thumb) {
      const D = b.dg; if (!D || !D.on || thumb || !b.cam) return;
      const f = courtCanvas(); if (f) ctx.drawImage(f, 0, 0);
      ctx.save();
      for (const B of D.balls) { if (B.st === 'held') continue; ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(B.x, B.y + 1, 3.5, 1.5, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    sortItems(b) {
      const D = b.dg; if (!D || !D.on || !b.cam) return [];
      return D.npc.map(n => ({ y: n.y, draw: ctx => drawNpc(ctx, b, D, n) }));
    },
    drawOver(ctx, b) {
      const D = b.dg; if (!D || !D.on || !b.cam) return;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      for (const u of b.u) if (mainIn(u)) drawGaze(ctx, u.x, u.y, gz(u), u.team);
      for (const u of b.u) if (u.dgDown != null) { ctx.globalAlpha = 0.8; ctx.font = `bold 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe27a'; ctx.fillText('OUT', u.x, u.y - 78); ctx.globalAlpha = 1; }
      for (const B of D.balls) {
        if (B.st === 'held' && B.h) { const H = B.h, hy = isU(H) ? H.y - 56 - (H.pad || 0) * 2 : H.y - 44; drawBall(ctx, H.x + 7, hy + 18, 1); }
        else drawBall(ctx, B.x, B.y - B.z, 1 + Math.min(0.5, B.z / 60));
      }
      ctx.restore();
    },
    drawTop(ctx, b) {
      const D = b.dg; if (!D || !D.on || !b.cam) return;
      const C = b.cam, V = b.dgView || { x: 0, y: 112, w: 360, h: 410 };
      ctx.save(); ctx.translate(C.x, C.y); ctx.scale(1 / C.k, 1 / C.k);
      ctx.imageSmoothingEnabled = false; ctx.textBaseline = 'middle';
      const y = V.y + 10; ctx.font = `bold 9px ${FONT}`;
      ctx.globalAlpha = 0.75; ctx.fillStyle = '#0e1018'; ctx.fillRect(V.x + 4, y - 8, V.w - 8, 16); ctx.globalAlpha = 1;
      for (let t = 0; t < 2; t++) {
        const ins = insiders(b, D, t).length, tot = D.npc.filter(n => n.team === t && !n.main).length + mains(b).filter(u => u.team === t).length;
        for (let i = 0; i < tot; i++) { const x = t === 0 ? V.x + 12 + i * 10 : V.x + V.w - 12 - i * 10; ctx.fillStyle = i < ins ? COL[t] : '#3a3e4c'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill(); }
      }
      const nx = D.added < S0.addT.length ? Math.max(0, Math.ceil(S0.addT[D.added] - D.clock)) : null;
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText(`공 ${D.balls.length}${nx != null ? ` · +1까지 ${nx}초` : ''}`, V.x + V.w / 2, y);
      const M = D.msg;
      if (M) {
        const a = Math.min(1, M.t / 0.15) * (M.t > M.dur - 0.3 ? Math.max(0, (M.dur - M.t) / 0.3) : 1), cy = V.y + V.h * 0.42;
        ctx.globalAlpha = 0.75 * a; ctx.fillStyle = '#0e1018'; ctx.fillRect(V.x, cy - 22, V.w, 44);
        ctx.globalAlpha = a; ctx.fillStyle = M.col; ctx.font = `bold 20px ${FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = '#0e1018'; ctx.strokeText(M.big, V.x + V.w / 2, cy - 6); ctx.fillText(M.big, V.x + V.w / 2, cy - 6);
        if (M.sub) { ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = '#d8dce8'; ctx.fillText(M.sub, V.x + V.w / 2, cy + 12); }
      }
      ctx.restore();
    },
  };

  // ---------- 그림 ----------
  let courtC = null;
  function courtCanvas() {
    if (courtC) return courtC;
    if (typeof document === 'undefined') return null;
    try {
      const c = document.createElement('canvas'); c.width = S0.world.w; c.height = S0.world.h; const x = c.getContext('2d'); if (!x) return null;
      x.fillStyle = '#2b3442'; x.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < c.width; i += 24) { x.fillStyle = (i / 24) % 2 ? '#2e3848' : '#29313e'; x.fillRect(i, 0, 24, c.height); }
      x.fillStyle = '#c99a62'; x.fillRect(C0.x - S0.band, C0.y - S0.band, C0.w + S0.band * 2, C0.h + S0.band * 2);
      for (let i = C0.x - S0.band; i < C0.x + C0.w + S0.band; i += 16) { x.fillStyle = ((i - C0.x) / 16) % 2 ? '#c3945c' : '#cda068'; x.fillRect(i, C0.y - S0.band, 16, C0.h + S0.band * 2); }
      x.globalAlpha = 0.18; x.fillStyle = COL[0]; x.fillRect(C0.x, C0.y, CX - C0.x, C0.h); x.fillStyle = COL[1]; x.fillRect(CX, C0.y, C0.x + C0.w - CX, C0.h); x.globalAlpha = 1;
      x.strokeStyle = '#ffffff'; x.lineWidth = 3; x.strokeRect(C0.x, C0.y, C0.w, C0.h);
      x.beginPath(); x.moveTo(CX, C0.y); x.lineTo(CX, C0.y + C0.h); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.arc(CX, C0.y + C0.h / 2, 34, 0, TAU); x.stroke();
      x.font = `bold 14px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.globalAlpha = 0.4;
      x.fillStyle = COL[0]; x.fillText('1P', C0.x + (CX - C0.x) / 2, C0.y + C0.h / 2); x.fillStyle = COL[1]; x.fillText('2P', CX + (C0.x + C0.w - CX) / 2, C0.y + C0.h / 2);
      courtC = c;
    } catch (e) { courtC = null; }
    return courtC;
  }
  function drawBall(ctx, x, y, s) {
    ctx.fillStyle = '#16141e'; ctx.beginPath(); ctx.arc(x, y, 4.6 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8473c'; ctx.beginPath(); ctx.arc(x, y, 3.6 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd0c4'; ctx.fillRect(Math.round(x - 1.6 * s), Math.round(y - 2 * s), Math.max(1, Math.round(1.4 * s)), Math.max(1, Math.round(1.4 * s)));
  }
  function drawGaze(ctx, x, y, g, t) {
    const ux = Math.cos(g), uy = Math.sin(g) * 0.5;
    ctx.globalAlpha = 0.7; ctx.fillStyle = COL[t]; ctx.beginPath(); ctx.moveTo(x + ux * 16, y + 1 + uy * 16); ctx.lineTo(x + ux * 9 - uy * 4, y + 1 + uy * 9 + ux * 2); ctx.lineTo(x + ux * 9 + uy * 4, y + 1 + uy * 9 - ux * 2); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawNpc(ctx, b, D, n) {
    const s0 = Sprites.get(n.def), K = n.main ? (n.main.size || 1) : S0.npcK, col = COL[n.team], g = n.g;
    const face = Math.cos(g) >= 0 ? 1 : -1, back = Math.sin(g) < -0.55 && !!s0.back, s = back ? s0.back : s0;
    const alpha = n.exiting ? 0.6 : n.out ? 0.85 : 1;
    const bob = n.moving ? -Math.abs(Math.sin(n.walk)) * 1.5 : Math.sin(b.time * 3 + n.id) * 0.5;
    ctx.save(); ctx.globalAlpha = 0.3 * alpha; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(n.x, n.y + 1, 9 * K, 3, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.7 * alpha; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash && ctx.setLineDash(n.out ? [2, 2] : []); ctx.beginPath(); ctx.ellipse(n.x, n.y + 1, 11 * K, 4, 0, 0, TAU); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
    if (!n.out) drawGaze(ctx, n.x, n.y, g, n.team);
    ctx.globalAlpha = alpha; ctx.translate(Math.round(n.x), Math.round(n.y + bob));
    ctx.scale(spriteSX(n.def, back, face) * K, K);
    const fr = n.moving ? Math.floor(n.walk * s.fps / 6) : 0;
    Sprites.draw(ctx, s, fr, false);
    ctx.restore();
    const P = n.px && !n.px.dead ? n.px : null, st = P && P.statuses.find(q => STATUS_DEFS[q.id] && !STATUS_DEFS[q.id].positive);
    if (st) { const d = STATUS_DEFS[st.id]; ctx.save(); ctx.font = `bold 7px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#0e1018'; ctx.strokeText(d.name, n.x, n.y - 54 * K); ctx.fillStyle = d.color || '#ffe27a'; ctx.fillText(d.name, n.x, n.y - 54 * K); ctx.restore(); } // 상태이상 표시 (그리기 전용)
  }

  function updateCam(b, dt, view) {
    if (!b || b.escape) return;
    const D = b.dg;
    if (!D || !D.on) { if (b._dgCam) { b.cam = null; b._dgCam = false; } return; }
    const V = view || { x: 0, y: 112, w: 360, h: 410 }; b.dgView = V; b._dgCam = true;
    const pts = []; for (const u of b.u) if (!u.dead && !u.hidden) pts.push([u.x, u.y]); for (const n of D.npc) if (!n.out || n.main) pts.push([n.x, n.y]); // 아웃된 주인공(외야)도 화면 안에
    for (const B of D.balls) { const p = ballPos(B); pts.push([p.x, p.y]); }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y - 50); y1 = Math.max(y1, y); }
    const k = clamp(Math.min(V.w / (x1 - x0 + 120), V.h / (y1 - y0 + 160)), 0.46, 1.15);
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hw = V.w / k / 2, hh = V.h / k / 2, Wd = S0.world.w, Hd = S0.world.h;
    cx = Wd > hw * 2 ? clamp(cx, hw, Wd - hw) : Wd / 2; cy = Hd > hh * 2 ? clamp(cy, hh, Hd - hh) : Hd / 2;
    const C = b.cam || (b.cam = { cx, cy, k }); const a = 1 - Math.exp(-3 * (dt || 0.016));
    C.cx += (cx - C.cx) * a; C.cy += (cy - C.cy) * a; C.k += (k - C.k) * a;
    C.x = C.cx - (V.x + V.w / 2) / C.k; C.y = C.cy - (V.y + V.h / 2) / C.k;
  }

  // ---------- 엔진 연결 ----------
  const Pp = Battle.prototype;
  const _step = Pp.step;
  Pp.step = function (dt) {
    const D = this.dg; if (!D || !D.on) return _step.call(this, dt);
    setAR(PLAY); try { return _step.call(this, dt); } finally { setAR(AR0); }
  };
  const _uu = Pp.updateUnit;
  Pp.updateUnit = function (u, dt) {
    if (u.dgProxy) { // 대리 유닛: AI 없음 — 넉백·끌림·상태이상 시간만
      if (u.dead) return; if (u.hp < u.maxHp) { this.stats.dgPxLeak += u.maxHp - u.hp; u.hp = u.maxHp; }
      u.flash = Math.max(0, u.flash - dt); u.kx *= Math.pow(0.001, dt); u.ky *= Math.pow(0.001, dt); u.action = null;
      for (const q of u.buffs) q.t -= dt; u.buffs = u.buffs.filter(q => q.t > 0);
      if (u.pull) { const P = u.pull, s = P.src, d = dist(u, s), R = 15 * (u.size + s.size) + 4; P.t -= dt; if (d > R) { const k = Math.min(d - R, 640 * dt); u.x += (s.x - u.x) / d * k; u.y += (s.y - u.y) / d * k; const p = this.clampPos(u.x, u.y, u.pad, u); u.x = p.x; u.y = p.y; } if (P.t <= 0 || d <= R) u.pull = null; }
      if (u.push) this.pushStep(u, dt);
      if (!this.over) this.updateStatuses(u, dt);
      if (u.hp < u.maxHp) { this.stats.dgPxLeak += u.maxHp - u.hp; u.hp = u.maxHp; }
      return;
    }
    const D = this.dg; if (!D || !D.on) return _uu.call(this, u, dt);
    if (u.dgDown != null || u.dgOut) { u.flash = Math.max(0, u.flash - dt); u.moving = false; u.action = null; u.hp = 0; return; }
    if (!u.dead && !this.freeze && DG.free(this, u)) { // 상대 주인공·소환수가 모두 아웃 → 공격하지 않고 피구만 (주인공은 DG.npcMove 가 움직임, 소환수는 정지)
      u.flash = Math.max(0, u.flash - dt); u.swing = Math.max(0, u.swing - dt); u.action = null; u.kx *= Math.pow(0.001, dt); u.ky *= Math.pow(0.001, dt);
      if (u.summon) u.moving = false; return;
    }
    if (DG.recv(D, u)) { const x = u.x, y = u.y; const r = _uu.call(this, u, dt); u.x = x; u.y = y; u.moving = false; return r; } // 패스 받는 주인공: 제자리 (공격은 그대로)
    return _uu.call(this, u, dt);
  };
  // 대리 유닛(팀원) 피해 0: 상태이상(applies)만 적용
  const _dmg = Pp.damage;
  Pp.damage = function (src, tgt, amount, o = {}) {
    if (tgt && tgt.dgOut && this.dg && this.dg.on) { this.stats.dgOutHitTry++; return 0; }
    if (tgt && tgt.dgProxy) { if (!tgt.dead && !this.over && !o.dot && src && src !== tgt) { tgt.flash = 0.12; this.stats.dgPxHit++; if (o.applies) this.applyList(src, tgt, o.applies); } return 0; }
    return _dmg.call(this, src, tgt, amount, o);
  };
  const _fd = Pp.fixedDamage;
  Pp.fixedDamage = function (src, tgt, amount, o = {}) { if (tgt && tgt.dgProxy) return 0; return _fd.call(this, src, tgt, amount, o); };
  // 주인공 체력 0 → 탈락 대신 외야로 (소환수는 그대로)
  // 대상: 상대 주인공이 코트 안에 있으면 늘 주인공 (대리 유닛은 광역기·밀치기·오브젝트에만 걸림)
  const _en = Pp.enemy;
  Pp.enemy = function (u) {
    const r = _en.call(this, u), D = this.dg; if (!D || !D.on || !r || !r.dgProxy || u.dgProxy) return r;
    let best = null, bd = 1e9; for (const o of this.u) if (o.team !== u.team && mainIn(o)) { const d = hyp(o.x - u.x, o.y - u.y); if (d < bd) { bd = d; best = o; } }
    if (best) { u.tgtU = best; return best; } return r;
  };
  const _col = Pp.collide;
  Pp.collide = function (a, c) { if (a.dgProxy || c.dgProxy) return; return _col.call(this, a, c); }; // 대리 유닛 충돌은 dodge.js collide 가 처리 (팀원 튕김)
  const _kill = Pp.kill;
  Pp.kill = function (tgt, src) {
    const D = this.dg; if (tgt.dgProxy) { tgt.hp = tgt.maxHp; return; } // 대리 유닛은 죽지 않음
    if (!D || !D.on || tgt.summon || this.over) return _kill.call(this, tgt, src);
    DG.mainOut(this, D, tgt);
  };
  // 기본 이동: 중앙선이 벽 (스킬 동작 중이 아니고 자기 구역에 있을 때)
  const _bw = Pp.bounceWalls;
  Pp.bounceWalls = function (u) {
    const r = _bw.call(this, u); const D = this.dg;
    if (D && D.on && !u.action && !u.dead && !u.dgOut) {
      const m = 4 + (u.pad || 0) * 0.5;
      if (u.team === 0 && u.x > CX - m && u.x < CX + 10) { u.x = CX - m; u.dir = Math.PI - u.dir; }
      else if (u.team === 1 && u.x < CX + m && u.x > CX - 10) { u.x = CX + m; u.dir = Math.PI - u.dir; }
    }
    return r;
  };

  window.DODGE = { updateCam, S: S0 };
  STAGE_HOOKS.push(DG);
})();
