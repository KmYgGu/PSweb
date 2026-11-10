/* =========================================================
 * 야구장 스테이지 (STAGE_HOOKS)
 *  - 넓은 구장(720x880) + 카메라(시각 전용, main.js → BASEBALL.updateCam). 시뮬레이션 동안만 AR 을 구장 영역으로 바꿔 끼움
 *    (투사체 경계·스킬 배치가 구장 기준으로 동작) → 그리기·다른 스테이지에는 영향 없음
 *  - 진행: 준비 → 투구(타자·투수 정지) → 타격하면 '경기 중'(모두 자유 이동·전투) → 플레이 종료 → 다음 투구
 *  - 승리: 3점 선취 또는 상대 체력 0 (기존 KO 판정 그대로)
 *  - 수비수(포수·내야 4·외야 3)·주자: 플레이어가 고르지 않은 남은 캐릭터 (중복 없음). 피해 없음, 공격에 밀리고 투사체를 막음
 *  - 시간이 지날수록 수비수·주자 능력치(이동·송구·포구 범위) 상승 → 시간 제한 없이 결판
 *  - 장기전 피해 증가(RAMP)는 '경기 중' 시간만 셈 (투구 대기 시간 제외)
 *  - 스테이지 교체(구울즈·아오오니 문)로 떠나면 야구 규칙만 멈추고 전투는 계속 (야구장으로 들어오는 교체는 없음: noSwitchIn)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const FONT = '"Galmuri11", "Malgun Gothic", sans-serif';
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const AR0 = { x: AR.x, y: AR.y, w: AR.w, h: AR.h };
  const setAR = r => { AR.x = r.x; AR.y = r.y; AR.w = r.w; AR.h = r.h; };
  const hyp = Math.hypot;

  STAGE_DEFS.baseball = {
    name: '야구장', short: '야구장', theme: 'baseball', noSwitchIn: true,
    desc: '타석과 마운드에서 시작! 투수가 던지고 타자가 치면 모두 자유롭게 움직이며 싸웁니다. 타자가 1·2·3루 아무 베이스나 밟으면 안타, 공 가진 수비수에게 닿으면 아웃. 먼저 3점 또는 상대 체력 0이면 승리!',
    // world: 구장 크기, play: 이동 가능 사각형 (+ 펜스 원 안쪽), home/mound: 홈·마운드, bd: 베이스 간격, fence: 외야 펜스 원 (cx, cy, r, h=넘어가는 높이)
    // npcK: 수비수·주자 그림 배율, spd: 수비수·주자 이동 속도 배율 (캐릭터 이동속도 × spd), rise: 초당 능력치 상승률(최대 riseMax 배)
    baseball: {
      world: { w: 720, h: 880 }, play: { x: 16, y: 196, w: 688, h: 650 },
      home: { x: 360, y: 770 }, mound: { x: 360, y: 668 }, bd: 150,
      fence: { cx: 360, cy: 560, r: 330, h: 16 },
      win: 3, npcK: 0.8, spd: 0.55, rise: 0.009, riseMax: 2.6,
      throwSpd: 340, keepR: 95, tagR: 16, catchR: 13, pickR: 13, baseR: 19, playMax: 40,
      catchP: { fly: 0.75, line: 0.5 }, // 뜬공·라인드라이브 포구 성공 확률 (실패하면 공을 떨어뜨림)
      t: { setup: 1.6, windup: 0.5, pause: 0.6, after: 1.2, swap: 2.0 },
    },
  };

  // ---------- 좌표 ----------
  const S0 = STAGE_DEFS.baseball.baseball;
  const BASES = (() => { const h = S0.home, d = S0.bd / Math.SQRT2; return [{ x: h.x, y: h.y }, { x: h.x + d, y: h.y - d }, { x: h.x, y: h.y - 2 * d }, { x: h.x - d, y: h.y - d }]; })();
  const SPOT = { bat: { x: 337, y: 772 }, pit: { x: S0.mound.x, y: S0.mound.y }, batSub: { x: 288, y: 816 }, pitSub: { x: 410, y: 694 } };
  const FPOS = { C: [360, 806], '1B': [490, 636], '2B': [418, 568], SS: [302, 568], '3B': [230, 636], LF: [206, 420], CF: [360, 350], RF: [514, 420] };
  const ORDER = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const COVER = { C: [360, 784], '1B': [BASES[1].x + 6, BASES[1].y - 2], '2B': [BASES[2].x + 6, BASES[2].y + 2], SS: [318, 606], '3B': [BASES[3].x - 6, BASES[3].y - 2] };
  const sprayOf = (x, y) => Math.atan2(x - S0.home.x, S0.home.y - y); // 0 = 2루 방향, + = 1루 쪽
  const fairAt = (x, y) => Math.abs(sprayOf(x, y)) <= Math.PI / 4 + 0.01;
  const inFence = (x, y, m = 0) => hyp(x - S0.fence.cx, y - S0.fence.cy) <= S0.fence.r - m;
  function clampField(x, y, pad) { // 사각형 + 펜스 원
    const P = S0.play; x = clamp(x, P.x + 14 + pad, P.x + P.w - 14 - pad); y = clamp(y, P.y + 26 + pad, P.y + P.h - 8 - pad * 0.5);
    const F = S0.fence, R = F.r - 12 - pad, dx = x - F.cx, dy = y - F.cy, d = hyp(dx, dy);
    if (d > R) { x = F.cx + dx / d * R; y = F.cy + dy / d * R; }
    return { x, y };
  }

  // ---------- 역할 ----------
  const mains = (b, t) => b.u.filter(o => o.team === t && !o.summon);
  function role(b, t) { const a = mains(b, t).filter(o => !o.dead); return a.find(o => o.def.partner) || a[a.length - 1] || null; }
  const rise = D => Math.min(D.S.riseMax, 1 + D.clock * D.S.rise);
  const npcSpd = (D, n) => n.spd0 * D.S.spd * rise(D);
  const thrSpd = D => D.S.throwSpd * (0.6 + 0.4 * rise(D));
  const teamName = (b, t) => mains(b, t).map(o => o.def.name).join(' & ');

  function mkNpc(D, def, team, kind, pos, x, y) {
    const st = { ...STAT_DEFAULTS, ...(def.stats || {}) };
    return { id: ++D.nid, def, team, kind, pos, x, y, vx: 0, vy: 0, face: 1, back: false, walk: 0, moving: false, spd0: clamp(st.spd, 160, 340), stun: 0, rt: 0, knT: -9, base: 0, st: 'on', to: 0, aggr: 1, recv: null };
  }
  function mkFielders(D, team) { return ORDER.map((p, i) => mkNpc(D, D.roster[team][i % D.roster[team].length], team, 'F', p, FPOS[p][0], FPOS[p][1])); }
  function nextRunnerDef(D) {
    const R = D.roster[D.bat], on = new Set(D.runners.map(r => r.def.id));
    for (let k = 0; k < R.length; k++) { const def = R[(D.nextR[D.bat] + k) % R.length]; if (!on.has(def.id)) { D.nextR[D.bat] = (D.nextR[D.bat] + k + 1) % R.length; return def; } }
    const def = R[D.nextR[D.bat] % R.length]; D.nextR[D.bat] = (D.nextR[D.bat] + 1) % R.length; return def; // 명단이 모자라면 중복 허용
  }
  const baseSpot = k => ({ x: BASES[k].x + (k === 1 ? 7 : k === 3 ? -7 : 0), y: BASES[k].y + (k === 2 ? -6 : 3) }); // 주자가 서는 자리 (베이스 바로 옆)
  const runnerAt = (D, k) => D.runners.find(r => r.base === k && r.st === 'on');

  // ---------- 화면 메시지 / 기록 ----------
  function banner(D, big, sub, col, dur = 1.5) { D.msg = { big, sub: sub || '', col: col || '#ffe27a', t: 0, dur }; }
  // 타석 위치: 타석마다 좌·우 타석을 무작위로 (오른쪽 타석이면 3루 쪽에 섬)
  const batSpot = D => ({ x: S0.home.x - 23 * (D.side || 1), y: SPOT.bat.y });
  function logPlay(b, D, kind, extra) { const e = { t: +b.time.toFixed(2), inn: D.inning, half: D.half, bat: D.bat, kind, outs: D.outs, score: [...D.score], ...(extra || {}) }; if (D.log.length < 400) D.log.push(e); }

  const BB = {
    match: st => !!st.baseball,
    init(b) {
      const S = b.stage.baseball; if (!S) return;
      const D = b.bsb = { S, on: true, phase: 'setup', pt: 0, setupDur: S.t.setup, clock: 0, liveT: 0, playT: 0, bat: Math.random() < 0.5 ? 0 : 1, side: 1, half: 0, inning: 1,
        score: [0, 0], outs: 0, balls: 0, strikes: 0, runners: [], fielders: [], ball: null, pitch: null, msg: null, info: null, nid: 0, log: [], nextR: [0, 0], swap: false, reuse: false, halt: false, batU: null, pitU: null, hit: null };
      b.play = { ...S.play };
      const used = new Set(); for (const u of b.u) { used.add(u.def.id); if (u.def.partner) used.add(u.def.partner.id); }
      let pool = CHARACTERS.filter(c => !used.has(c.id) && !c.hidden);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      if (pool.length < 16) { D.reuse = true; const src = pool.length ? pool : CHARACTERS.slice(); while (pool.length < 16) pool = pool.concat(src); } // 캐릭터가 모자라면 반복 사용
      D.roster = [pool.slice(0, 8), pool.slice(8, 16)];
      D.fielders = mkFielders(D, 1 - D.bat);
      Object.assign(b.stats, { bsPitch: 0, bsHit: 0, bsHR: 0, bsK: 0, bsBB: 0, bsFly: 0, bsTag: 0, bsRunOut: 0, bsRuns: 0, bsSafe: [0, 0, 0, 0], bsFoul: 0, bsTO: 0, bsHalf: 0, bsDrop: 0, bsAdv: 0, bsBack: 0 });
      BB.place(b, D);
      banner(D, 'PLAY BALL!', `${D.bat ? '2P' : '1P'} ${teamName(b, D.bat)} 선공`, '#ffffff', 1.6);
    },
    // 투구 대기 자리: 타자 → 타석, 투수 → 마운드, 2인 팀 동료 → 대기 타석 / 마운드 옆
    place(b, D) {
      const bu = role(b, D.bat), pu = role(b, 1 - D.bat);
      for (const u of b.u) {
        if (u.summon || u.dead || u.hidden) continue;
        const s = u === bu ? batSpot(D) : u === pu ? SPOT.pit : u.team === D.bat ? SPOT.batSub : SPOT.pitSub;
        u.x = s.x; u.y = s.y; u.moving = false;
        u.facing = u.team === D.bat ? 1 : -1; u.lookUp = u.team === D.bat; // 타자 → 마운드 쪽(뒷모습), 투수 → 홈 쪽(앞모습)
      }
    },
    leave(b) { // 스테이지 교체: 야구 규칙 정지 (b.bsb 는 switchStage 가 지움)
      const D = b.bsb; if (!D) return; D.on = false; setAR(AR0);
      if (b.cam) b.cam = null;
      sys(b, '야구 경기 중단 — 이제부터는 체력 승부!');
    },
    clamp(b, x, y, pad) { const D = b.bsb; if (!D || !D.on) return { x, y }; return clampField(x, y, pad); },
    // 장기전 피해 증가: '경기 중' 시간 기준 (투구 대기 제외)
    preDamage(b, src, tgt, amount, o) {
      const D = b.bsb; if (!D || !D.on) return;
      const rt = 1 + Math.max(0, b.time - RAMP_START) * RAMP_RATE, rl = 1 + Math.max(0, D.liveT - RAMP_START) * RAMP_RATE;
      if (rt === rl) return; return amount * rl / rt;
    },

    // ================= 진행 =================
    step(b, dt) {
      const D = b.bsb; if (!D || !D.on) return;
      D.clock += dt; if (D.msg) { D.msg.t += dt; if (D.msg.t >= D.msg.dur) D.msg = null; } if (D.info) { D.info.t += dt; if (D.info.t > 1.6) D.info = null; }
      if (b.over || b.freeze) { if (D.ball) BB.ballPhys(b, D, dt); return; }
      D.batU = role(b, D.bat); D.pitU = role(b, 1 - D.bat);
      if (!D.batU || !D.pitU) { if (!D.halt) { D.halt = true; D.phase = 'live'; sys(b, '선수가 없어 야구 진행 중단 — 체력 승부!'); } BB.npcPhys(b, D, dt); return; } // 소환수만 남은 경우 (자유 전투)
      if (D.halt) { D.halt = false; BB.endPlay(b, D, 'TO'); }
      const P = D.phase;
      if (P === 'live') { D.liveT += dt; D.playT += dt; }
      if (P === 'setup') { D.pt += dt; BB.hold(b, D); BB.fieldersHome(D, dt); if (D.pt >= D.setupDur) BB.newPitch(b, D); }
      else if (P === 'pitch') { BB.hold(b, D); BB.fieldersHome(D, dt); BB.pitchStep(b, D, dt); }
      else if (P === 'pause') { D.pt += dt; BB.hold(b, D); BB.fieldersHome(D, dt); if (D.pt >= D.S.t.pause) BB.newPitch(b, D); }
      else if (P === 'after') { D.pt += dt; BB.fieldersHome(D, dt); if (D.pt >= (D.swap ? D.S.t.swap : D.S.t.after)) BB.nextPlay(b, D); }
      else if (P === 'live') {
        for (const u of b.u) BB.fenceWall(b, u);
        BB.liveStep(b, D, dt);
        if (D.phase === 'live' && D.playT > D.S.playMax) BB.endPlay(b, D, 'TO');
      }
      BB.npcPhys(b, D, dt);
      if (D.ball && D.phase !== 'live') BB.ballPhys(b, D, dt);
    },
    // 투구 대기 중: 정해진 자리에 그대로 (updateUnit 도 멈춤 — 아래 래퍼)
    hold(b, D) {
      const bu = D.batU, pu = D.pitU;
      for (const u of b.u) {
        if (u.summon || u.dead || u.hidden || u.aoHid) continue;
        const s = u === bu ? batSpot(D) : u === pu ? SPOT.pit : u.team === D.bat ? SPOT.batSub : SPOT.pitSub;
        u.x = s.x; u.y = s.y; u.moving = false; u.facing = u.team === D.bat ? 1 : -1; u.lookUp = u.team === D.bat;
      }
    },
    fenceWall(b, u) {
      if (u.dead || u.airborne) return;
      const F = S0.fence, R = F.r - 12 - u.pad, dx = u.x - F.cx, dy = u.y - F.cy, d = hyp(dx, dy);
      if (d < R - 0.5) return;
      const nx = dx / d, ny = dy / d; let vx = Math.cos(u.dir), vy = Math.sin(u.dir); const dot = vx * nx + vy * ny;
      if (dot > 0) { vx -= 2 * dot * nx; vy -= 2 * dot * ny; u.dir = fixAngle(Math.atan2(vy, vx) + rand(-0.25, 0.25)); if (b.time - (u.wallT || -1) > 0.12) { u.wallT = b.time; b.dust(u.x, u.y); playSfx('wall'); } }
    },

    // ---------- 투구 ----------
    newPitch(b, D) {
      const pu = D.pitU, bu = D.batU, ps = pu.st, bs = bu.st, nSk = (pu.skills || []).length;
      const brk = Math.random() < clamp(0.12 + 0.07 * nSk, 0.12, 0.6);         // 변화구 확률 ~ 스킬 수
      const fast = 230 + ps.atk * 4.2, spd = brk ? fast * 0.8 : fast;          // 직구 속도 ~ 공격력
      const kmh = Math.round((118 + ps.atk * 0.85) * (brk ? 0.83 : 1));
      const zone = Math.random() < (brk ? 0.52 : 0.6);
      const swing = Math.random() < (zone ? 0.82 : 0.28);
      let cp = 0.5 + (bs.def || 0) * 0.005 + Math.min(bs.range || 50, 140) * 0.0011 - (ps.atk - 30) * 0.004 - (brk ? 0.07 : 0); // 타격 확률 ~ 방어력·사거리
      if (!zone) cp *= 0.6; cp = clamp(cp, 0.12, 0.82);
      const contact = swing && Math.random() < cp, foul = contact && Math.random() < 0.32;
      const kinds = ['커브', '슬라이더', '체인지업', '포크'], kname = brk ? kinds[Math.floor(Math.random() * kinds.length)] : '직구';
      const curve = brk ? (Math.random() < 0.5 ? -1 : 1) * rand(10, 20) : rand(-2, 2);
      const x1 = S0.home.x + (zone ? rand(-4, 4) : (Math.random() < 0.5 ? -1 : 1) * rand(9, 15)), y1 = S0.home.y - 2;
      let hit = null;
      if (contact && !foul) { // 타구: 방향·종류·비거리 (비거리 ~ 공격력)
        const r = Math.random(), typ = r < 0.42 ? 'ground' : r < 0.72 ? 'line' : 'fly';
        const pow = (150 + bs.atk * 7) * rand(0.6, 1.25) * (typ === 'fly' ? 1.15 : typ === 'line' ? 1 : 0.55);
        hit = { typ, a: rand(-0.72, 0.72), dist: pow };
      } else if (foul) hit = { typ: 'foul', a: (Math.random() < 0.5 ? -1 : 1) * rand(0.95, 1.6), dist: rand(90, 200) };
      const x0 = pu.x + 6, y0 = pu.y - 2, L = hyp(x1 - x0, y1 - y0);
      D.pitch = { t: 0, rel: D.S.t.windup, dur: L / spd, brk, kmh, kname, zone, swing, contact, foul, curve, x0, y0, x1, y1, hit, swingT: -1, done: false };
      D.phase = 'pitch'; D.pt = 0; D.ball = { st: 'hand', x: x0, y: y0, z: 24, vx: 0, vy: 0, vz: 0, bounced: false };
      b.stats.bsPitch++;
    },
    pitchStep(b, D, dt) {
      const p = D.pitch; if (!p) return; p.t += dt;
      const B = D.ball;
      if (p.t < p.rel) { const k = p.t / p.rel; B.x = p.x0 - 4 * Math.sin(k * Math.PI); B.y = p.y0; B.z = 24 + 14 * Math.sin(k * Math.PI); return; } // 와인드업
      if (p.t - dt < p.rel) { B.st = 'pitch'; playSfx('dash'); D.info = { txt: `${p.kname} ${p.kmh}km/h`, t: 0 }; }
      const k = Math.min(1, (p.t - p.rel) / p.dur), ex = Math.sin(k * Math.PI) * p.curve * (p.brk ? 1 : 1);
      B.x = p.x0 + (p.x1 - p.x0) * k + (p.brk ? (k * k) * p.curve : ex); B.y = p.y0 + (p.y1 - p.y0) * k; B.z = 24 - 10 * k - (p.brk && p.kname === '포크' ? 8 * k * k : 0);
      if (p.swing && p.swingT < 0 && k >= 0.78) p.swingT = p.t;
      if (k < 1 || p.done) return;
      p.done = true; const bu = D.batU;
      if (p.contact) {
        b.ring(B.x, B.y - B.z, 3, 22, 0.25, '#ffffff'); b.text(B.x + 12, B.y - 40, '딱!', '#fff4c0', 13); playSfx('hit'); b.shake(1.5);
        if (p.foul) { // 파울: 2스트라이크 전이면 스트라이크
          b.stats.bsFoul++; if (D.strikes < 2) D.strikes++;
          BB.launch(D, p.hit, true); banner(D, '파울!', `${D.balls}볼 ${D.strikes}스트라이크`, '#e8eef8', 0.9); D.phase = 'pause'; D.pt = 0; return;
        }
        BB.launch(D, p.hit, false); BB.startLive(b, D); return;
      }
      B.st = 'dead';
      if (p.swing || p.zone) {
        D.strikes++; b.text(bu.x, bu.y - 64, p.swing ? '헛스윙!' : '스트라이크!', '#ffd08a', 11);
        if (D.strikes >= 3) { b.stats.bsK++; return BB.endPlay(b, D, 'K'); }
      } else {
        D.balls++; b.text(bu.x, bu.y - 64, '볼!', '#a8e0ff', 11);
        if (D.balls >= 4) { b.stats.bsBB++; return BB.endPlay(b, D, 'BB'); }
      }
      D.phase = 'pause'; D.pt = 0;
    },
    launch(D, h, foul) { // 타구 발사 (홈에서)
      const B = D.ball, H = S0.home, G = 700, ux = Math.sin(h.a), uy = -Math.cos(h.a);
      B.x = H.x + ux * 6; B.y = H.y - 4 + uy * 6; B.z = 14; B.bounced = false; B.t = 0; B.typ = h.typ;
      if (h.typ === 'ground') { const v0 = h.dist * 1.5; B.vx = ux * v0; B.vy = uy * v0; B.vz = 110; B.st = 'air'; B.bounced = true; } // 땅볼: 바로 튀며 굴러감
      else { const T = h.typ === 'fly' ? 1.0 + h.dist / 520 : h.typ === 'line' ? 0.42 + h.dist / 1000 : 0.8, v = h.dist / T; B.vx = ux * v; B.vy = uy * v; B.vz = G * T / 2 - 14 / T; B.st = 'air'; }
      if (foul) B.st = 'foul';
    },
    startLive(b, D) {
      D.phase = 'live'; D.playT = 0; D.hitType = D.ball.typ; b.stats.bsHit++;
      for (const n of D.fielders) { n.rt = 0.12 + (n.pos === 'C' ? 0.2 : 0); n.recv = null; }
      for (const r of D.runners) { r.st = 'on'; r.aggr = rand(0.85, 1.15); }
      sys(b, `${D.batU.def.name} 타격! (${{ ground: '땅볼', line: '라인드라이브', fly: '뜬공' }[D.ball.typ]})`);
    },

    // ---------- 공 ----------
    holderPos(H) { return H.kind ? { x: H.x + H.face * 6, y: H.y, z: 18 * S0.npcK } : { x: H.x + H.facing * 8, y: H.y, z: 20 }; },
    ballPhys(b, D, dt) {
      const B = D.ball; if (!B) return; const G = 700, F = S0.fence;
      if (B.st === 'held') { const H = B.holder; if (!H || (H.dead) || (!H.kind && D.phase === 'live' && H !== D.pitU)) { B.st = 'air'; B.bounced = true; B.vx = rand(-40, 40); B.vy = rand(-40, 40); B.vz = 60; B.holder = null; return; } const q = BB.holderPos(H); B.x = q.x; B.y = q.y; B.z = q.z; return; }
      if (B.st === 'throw') {
        const T = B.thr; T.t += dt; const k = Math.min(1, T.t / T.dur);
        B.x = T.x0 + (T.x1 - T.x0) * k; B.y = T.y0 + (T.y1 - T.y0) * k; B.z = 16 + T.arc * Math.sin(k * Math.PI);
        if (k >= 1) { const R = T.to; if (R && hyp(R.x - B.x, R.y - B.y) < 26 && !(R.kind && R.stun > 0.2)) { BB.give(b, D, R); } else { B.st = 'air'; B.bounced = true; B.vx = (T.x1 - T.x0) / T.dur * 0.25; B.vy = (T.y1 - T.y0) / T.dur * 0.25; B.vz = 40; B.z = 6; } if (R && R.kind) R.recv = null; }
        return;
      }
      if (B.st !== 'air' && B.st !== 'foul') return;
      B.t = (B.t || 0) + dt;
      B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt; B.vz -= G * dt;
      if (B.z <= 0) { B.z = 0; if (B.st === 'foul') { B.st = 'dead'; return; } B.bounced = true; if (B.vz < -60) { B.vz = -B.vz * 0.35; B.vx *= 0.72; B.vy *= 0.72; } else B.vz = 0; }
      if (B.z === 0 && B.vz === 0) { const fr = Math.exp(-1.5 * dt); B.vx *= fr; B.vy *= fr; if (hyp(B.vx, B.vy) < 5) { B.vx = B.vy = 0; } }
      if (B.st === 'foul') { if (B.t > 1.2) B.st = 'dead'; return; }
      // 펜스: 공중 높이 h 이상이면 홈런, 아니면 튕김
      const dx = B.x - F.cx, dy = B.y - F.cy, d = hyp(dx, dy);
      if (d > F.r - 4) {
        if (D.phase === 'live' && B.z > F.h && fairAt(B.x, B.y) && !B.bounced) { BB.homeRun(b, D); return; }
        const nx = dx / d, ny = dy / d, vn = B.vx * nx + B.vy * ny; B.x = F.cx + nx * (F.r - 4); B.y = F.cy + ny * (F.r - 4); if (vn > 0) { B.vx -= 1.5 * vn * nx; B.vy -= 1.5 * vn * ny; } B.bounced = true;
        if (Math.abs(vn) > 120 && D.phase === 'live') b.text(B.x, B.y - 20, '펜스!', '#ffffff', 9);
      }
      const P = S0.play;
      if (B.y > P.y + P.h - 6) { B.y = P.y + P.h - 6; B.vy = -Math.abs(B.vy) * 0.5; B.bounced = true; }
      if (B.x < P.x + 6) { B.x = P.x + 6; B.vx = Math.abs(B.vx) * 0.5; } if (B.x > P.x + P.w - 6) { B.x = P.x + P.w - 6; B.vx = -Math.abs(B.vx) * 0.5; }
    },
    give(b, D, H) { const B = D.ball; B.st = 'held'; B.holder = H; B.vx = B.vy = B.vz = 0; if (H.kind) { H.passCd = 0.35; H.rt = Math.max(H.rt, 0.3); } else H.bsPassCd = 0.35; },
    throwTo(b, D, from, to) {
      const B = D.ball, q = BB.holderPos(from), L = hyp(to.x - q.x, to.y - q.y);
      B.st = 'throw'; B.holder = null; B.thr = { t: 0, dur: Math.max(0.12, L / thrSpd(D)), x0: q.x, y0: q.y, x1: to.x, y1: to.y, arc: Math.min(26, L * 0.08), to };
      if (to.kind) to.recv = { x: to.x, y: to.y };
      b.text(q.x, q.y - 40, '송구!', '#d8e6ff', 8);
    },
    landing(B) { // 공중 타구 착지 예상 지점
      if (B.z <= 0 && B.vz <= 0) return { x: B.x, y: B.y };
      const G = 700, t = (B.vz + Math.sqrt(B.vz * B.vz + 2 * G * Math.max(0, B.z))) / G; return clampField(B.x + B.vx * t, B.y + B.vy * t, 0);
    },
    homeRun(b, D) {
      const B = D.ball; B.st = 'gone'; b.stats.bsHR++;
      const n = D.runners.length + 1;
      for (let i = 0; i < 30; i++) { const a = rand(0, TAU), s = rand(40, 160); b.parts.push({ x: B.x, y: B.y - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 60, g: 200, life: rand(0.6, 1.2), max: 1.2, color: ['#ffffff', TEAM_COL[D.bat], '#ffe27a'][i % 3], size: rand(1.5, 3) }); }
      D.runners = []; D.score[D.bat] += n; b.stats.bsRuns += n;
      BB.endPlay(b, D, 'HR', n);
    },

    // ---------- 경기 중 ----------
    targets(b, D) { // 태그 대상: 타자 + 베이스를 떠난 주자
      const L = [], bu = D.batU;
      if (bu && !bu.dead && !bu.hidden && !bu.aoHid && !bu.airborne) L.push(bu);
      for (const r of D.runners) if (r.st !== 'on') L.push(r);
      return L;
    },
    liveStep(b, D, dt) {
      const B = D.ball, bu = D.batU, pu = D.pitU;
      BB.ballPhys(b, D, dt); if (D.phase !== 'live') return;
      // 뜬공 포구 / 땅볼 줍기
      if (B.st === 'air') {
        for (const n of D.fielders) {
          if (n.rt > 0 || n.stun > 0.15) continue;
          const d = hyp(n.x - B.x, n.y - B.y);
          if (!B.bounced && B.z < 36 && d < D.S.catchR + 4 * (rise(D) - 1)) {
            if (B.tried && B.tried.includes(n.id)) continue; (B.tried || (B.tried = [])).push(n.id);
            if (Math.random() < (D.S.catchP[B.typ] ?? 0.7) * Math.min(1.25, 0.85 + 0.15 * rise(D))) { BB.give(b, D, n); b.stats.bsFly++; b.text(n.x, n.y - 50, '잡았다!', '#ffe27a', 10); return BB.endPlay(b, D, 'F', n.def.name); }
            B.bounced = true; B.vx *= 0.25; B.vy *= 0.25; B.vz = 80; n.stun = 0.35; b.stats.bsDrop++; b.text(n.x, n.y - 50, '놓쳤다!', '#c8d0e0', 10); continue; // 포구 실패: 공을 떨어뜨림
          }
          if (B.bounced && B.z < 18 && d < D.S.pickR + 3 * (rise(D) - 1)) { BB.give(b, D, n); break; }
        }
        if (B.st === 'air' && B.bounced && B.z < 18 && pu && !pu.dead && !pu.airborne && hyp(pu.x - B.x, pu.y - B.y) < 14 + pu.pad) BB.give(b, D, pu);
      }
      // 공 가진 쪽 판단 (쫓기보다 가까운 팀원에게 송구)
      const T = BB.targets(b, D);
      if (B.st === 'held') {
        const H = B.holder;
        // 태그 아웃
        for (const t of T) {
          const r = D.S.tagR + (H.kind ? 0 : H.pad) + (t.kind ? 0 : t.pad) + 2 * (rise(D) - 1);
          if (hyp(H.x - t.x, H.y - t.y) < r) { if (t === bu) { b.stats.bsTag++; return BB.endPlay(b, D, 'T', H.def.name); } BB.runnerOut(b, D, t, H); if (D.phase !== 'live') return; }
        }
        if (!H.kind) { // 투수: 이동은 평소대로(무작위). 타자가 멀면 타자에 가까운 수비수에게 송구
          H.bsPassCd = (H.bsPassCd || 0) - dt;
          const t = BB.nearest(H, BB.targets(b, D));
          if (t && H.bsPassCd <= 0 && !H.blocked('blocksAct')) { const d0 = hyp(H.x - t.x, H.y - t.y); if (d0 > D.S.keepR) { const f = BB.bestRecv(D, t, H); if (f && hyp(f.x - t.x, f.y - t.y) < d0 - 50) BB.throwTo(b, D, H, f); else H.bsPassCd = 0.3; } }
        }
      }
      // 타자: 베이스를 밟으면 안타 (1·2·3루 어디든)
      if (bu && !bu.dead && !bu.airborne && !bu.hidden) for (let k = 1; k <= 3; k++) if (hyp(bu.x - BASES[k].x, bu.y - BASES[k].y) < D.S.baseR + bu.pad) return BB.endPlay(b, D, 'H', k);
      BB.fieldAI(b, D, dt);
      BB.runAI(b, D, dt);
    },
    nearest(o, L) { let best = null, bd = 1e9; for (const t of L) { const d = hyp(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; best = t; } } return best; },
    bestRecv(D, t, H) { let best = null, bd = 1e9; for (const f of D.fielders) { if (f === H || f.stun > 0.2) continue; const d = hyp(f.x - t.x, f.y - t.y); if (d < bd) { bd = d; best = f; } } return best; },
    runnerOut(b, D, r, H) {
      D.runners = D.runners.filter(o => o !== r); D.outs++; b.stats.bsRunOut++;
      b.text(r.x, r.y - 50, '아웃!', '#ff9a8a', 12); sys(b, `주자 ${r.def.name} 태그 아웃 (${D.outs}아웃)`); logPlay(b, D, 'runnerOut', { who: r.def.name });
      D.gone = D.gone || []; D.gone.push({ n: r, t: 0 });
      if (D.outs >= 3) BB.endPlay(b, D, '3O');
    },
    moveNpc(D, n, tx, ty, k, dt) {
      const dx = tx - n.x, dy = ty - n.y, d = hyp(dx, dy); if (d < 1.5) { n.moving = false; return true; }
      const st = Math.min(d, npcSpd(D, n) * k * dt); n.x += dx / d * st; n.y += dy / d * st; n.moving = true; n.walk += dt * 9;
      if (Math.abs(dx) > 2) n.face = dx > 0 ? 1 : -1; n.back = dy < -Math.abs(dx) * 0.6;
      return d - st < 1.5;
    },
    fieldersHome(D, dt) { for (const n of D.fielders) if (n.stun <= 0) BB.moveNpc(D, n, FPOS[n.pos][0], FPOS[n.pos][1], 0.7, dt); for (const r of D.runners) { const s = baseSpot(r.base); BB.moveNpc(D, r, s.x, s.y, 0.8, dt); } },
    fieldAI(b, D, dt) {
      const B = D.ball, H = B.st === 'held' ? B.holder : null, T = BB.targets(b, D);
      const busy = new Set();
      if (H && H.kind) { // 공 가진 수비수
        busy.add(H); H.passCd = (H.passCd || 0) - dt;
        if (H.rt <= 0 && H.stun <= 0) {
          const t = BB.nearest(H, T);
          if (t) {
            const d0 = hyp(H.x - t.x, H.y - t.y);
            if (d0 < D.S.keepR) BB.moveNpc(D, H, t.x, t.y, 0.7, dt);
            else { const f = BB.bestRecv(D, t, H); if (f && H.passCd <= 0 && hyp(f.x - t.x, f.y - t.y) < d0 - 50) BB.throwTo(b, D, H, f); else BB.moveNpc(D, H, t.x, t.y, 0.55, dt); }
          } else BB.moveNpc(D, H, COVER[H.pos] ? COVER[H.pos][0] : FPOS[H.pos][0], COVER[H.pos] ? COVER[H.pos][1] : FPOS[H.pos][1], 0.6, dt);
        }
      }
      // 송구 받는 수비수: 공 도착 지점으로
      if (B.st === 'throw' && B.thr.to && B.thr.to.kind) { const R = B.thr.to; busy.add(R); if (R.stun <= 0) BB.moveNpc(D, R, B.thr.x1, B.thr.y1, 1, dt); }
      if (B.st === 'air') { // 타구 쫓기: 가장 빨리 닿는 2명
        const L = B.bounced ? { x: B.x + B.vx * 0.35, y: B.y + B.vy * 0.35 } : BB.landing(B);
        const ord = D.fielders.filter(n => !busy.has(n) && n.stun <= 0).map(n => [n, hyp(n.x - L.x, n.y - L.y) / npcSpd(D, n) + (n.pos === 'C' && hyp(L.x - S0.home.x, L.y - S0.home.y) > 110 ? 9 : 0)]).sort((a, c) => a[1] - c[1]);
        for (let i = 0; i < Math.min(2, ord.length); i++) { const n = ord[i][0]; busy.add(n); if (n.rt <= 0) BB.moveNpc(D, n, L.x, L.y, 1, dt); }
      } else if (H || B.st === 'throw') { // 마크: 대상마다 가장 가까운 수비수 1명이 다가가 송구 받을 준비
        for (const t of T.slice(0, 2)) {
          let best = null, bd = 1e9; for (const n of D.fielders) { if (busy.has(n) || n.stun > 0) continue; const d = hyp(n.x - t.x, n.y - t.y); if (d < bd) { bd = d; best = n; } }
          if (!best) continue; busy.add(best);
          const d = bd, k = d > 34 ? 0.8 : 0; if (k) BB.moveNpc(D, best, t.x - (t.x - best.x) / d * 26, t.y - (t.y - best.y) / d * 26, k, dt); else best.moving = false;
        }
      }
      for (const n of D.fielders) { // 나머지: 베이스 커버 / 수비 위치
        if (n.rt > 0) { n.rt -= dt; continue; }
        if (busy.has(n) || n.stun > 0) continue;
        const c = COVER[n.pos] || FPOS[n.pos]; BB.moveNpc(D, n, c[0], c[1], 0.65, dt);
      }
    },
    // 수비 쪽이 다음 베이스에 공을 가져가는 데 걸리는 시간 (주자 판단용, 대략)
    defTime(D, k) {
      const B = D.ball, P = BASES[k], thr = thrSpd(D);
      let cover = 1e9; for (const f of D.fielders) cover = Math.min(cover, hyp(f.x - P.x, f.y - P.y) / npcSpd(D, f));
      if (B.st === 'held') { const H = B.holder, hs = H.kind ? npcSpd(D, H) * 0.85 : H.speed; return Math.min(hyp(H.x - P.x, H.y - P.y) / Math.max(60, hs), Math.max(cover, hyp(H.x - P.x, H.y - P.y) / thr) + 0.15); }
      if (B.st === 'throw') { const R = B.thr.to; return (B.thr.dur - B.thr.t) + (R ? hyp(B.thr.x1 - P.x, B.thr.y1 - P.y) / thr : 0) + 0.2; }
      let reach = 1e9; for (const f of D.fielders) reach = Math.min(reach, hyp(f.x - B.x, f.y - B.y) / npcSpd(D, f));
      if (B.st === 'air' && !B.bounced) reach = Math.max(reach, 0.6);
      return reach + 0.25 + Math.max(hyp(B.x - P.x, B.y - P.y) / thr, 0);
    },
    runAI(b, D, dt) {
      const B = D.ball;
      const order = D.runners.slice().sort((a, c) => c.base - a.base); // 앞 주자부터
      for (const r of order) {
        if (!D.runners.includes(r)) continue;
        if (r.stun > 0) continue;
        const sp = npcSpd(D, r);
        if (r.st === 'on') {
          if (B.st === 'air' && !B.bounced) continue; // 뜬공: 잡히는지 볼 때까지 대기
          const nx = r.base + 1;
          if (nx <= 3 && (runnerAt(D, nx) || D.runners.some(o => o !== r && o.st === 'run' && o.to === nx))) continue;
          const tr = hyp(r.x - BASES[nx % 4].x, r.y - BASES[nx % 4].y) / sp, td = BB.defTime(D, nx % 4);
          if (tr < td * r.aggr) { r.st = 'run'; r.to = nx; b.stats.bsAdv++; }
          continue;
        }
        if (r.st === 'run') {
          const P = BASES[r.to % 4], d = hyp(r.x - P.x, r.y - P.y), from = BASES[r.base], prog = 1 - d / S0.bd;
          if (prog < 0.45 && d / sp > BB.defTime(D, r.to % 4) * 1.15 * r.aggr) { r.st = 'back'; b.stats.bsBack++; continue; } // 위험 → 되돌아감
          if (BB.moveNpc(D, r, P.x, P.y, 1, dt)) {
            if (r.to === 4) { BB.score(b, D, r); if (D.phase !== 'live') return; continue; }
            r.base = r.to; r.st = 'on'; const s = baseSpot(r.base); void from; void s;
          }
          continue;
        }
        if (r.st === 'back') { const P = BASES[r.base]; if (BB.moveNpc(D, r, P.x, P.y, 1, dt)) r.st = 'on'; }
      }
    },
    score(b, D, r) {
      D.runners = D.runners.filter(o => o !== r); D.score[D.bat]++; b.stats.bsRuns++;
      b.text(S0.home.x, S0.home.y - 50, '득점!', TEAM_COL[D.bat], 13); b.ring(S0.home.x, S0.home.y, 4, 34, 0.45, TEAM_COL[D.bat]);
      sys(b, `${r.def.name} 홈인! ${D.bat ? '2P' : '1P'} 득점 (${D.score[0]} : ${D.score[1]})`); logPlay(b, D, 'run', { who: r.def.name });
      D.gone = D.gone || []; D.gone.push({ n: r, t: 0, home: true });
      if (D.score[D.bat] >= D.S.win) BB.finish(b, D, D.bat);
    },

    // ---------- 플레이 종료 ----------
    placeRunner(b, D, k) { // k 루에 주자를 세움 (자리에 있던 주자는 밀려서 진루, 홈이면 득점)
      const push = j => { const o = runnerAt(D, j); if (!o) return; if (j >= 3) { BB.score(b, D, o); return; } push(j + 1); o.base = j + 1; const s = baseSpot(j + 1); o.x = s.x; o.y = s.y; };
      push(k); if (b.over) return;
      const def = nextRunnerDef(D), s = baseSpot(k), r = mkNpc(D, def, D.bat, 'R', 'R', s.x, s.y); r.base = k; r.st = 'on'; D.runners.push(r);
    },
    endPlay(b, D, kind, arg) {
      if (b.over || D.phase === 'after') return;
      const bu = D.batU, B = D.ball;
      // 주자: 베이스 사이에 있으면 가까운 빈 베이스로
      const lead = D.runners.slice().sort((a, c) => c.base - a.base);
      for (const r of lead) {
        if (r.st === 'on') continue;
        const opts = [r.base, Math.min(3, r.to)].filter((k, i, a) => a.indexOf(k) === i).sort((p, q) => hyp(r.x - BASES[p].x, r.y - BASES[p].y) - hyp(r.x - BASES[q].x, r.y - BASES[q].y));
        const k = opts.find(j => !D.runners.some(o => o !== r && o.base === j && o.st === 'on'));
        if (k == null) { BB.score(b, D, r); if (b.over) return; continue; }
        r.base = k; r.st = 'on';
      }
      for (const u of b.u) { if (u.action && u.action.pin && u.action.tgt) b.releasePin(u.action.tgt); u.action = null; u.push = null; u.pull = null; u.boost = 0; u.moving = false; }
      b.proj = [];
      let big = '', sub = '', col = '#ffe27a';
      if (kind === 'H') { b.stats.bsSafe[arg]++; BB.placeRunner(b, D, arg); big = ['', '1루타!', '2루타!', '3루타!'][arg]; sub = `${bu.def.name} 세이프`; col = '#9fffb8'; sys(b, `${bu.def.name} ${arg}루 세이프 (${big})`); }
      else if (kind === 'BB') { BB.placeRunner(b, D, 1); big = '볼넷!'; sub = `${bu.def.name} 출루`; col = '#a8e0ff'; sys(b, `${bu.def.name} 볼넷`); }
      else if (kind === 'HR') { big = '홈런!'; sub = `${bu.def.name} ${arg}점 홈런`; col = '#ffe27a'; sys(b, `${bu.def.name} 홈런! ${arg}점 (${D.score[0]} : ${D.score[1]})`); b.shake(3); }
      else if (kind === 'TO') { big = '타임!'; sub = '다시 타석으로'; col = '#e8eef8'; b.stats.bsTO++; }
      else if (kind !== '3O') { D.outs++; big = { F: '플라이 아웃!', T: '태그 아웃!', K: '삼진 아웃!' }[kind]; sub = kind === 'K' ? `${bu.def.name} 삼진` : `${arg || ''} → ${bu.def.name} 아웃`; col = '#ff9a8a'; sys(b, `${bu.def.name} ${big} (${D.outs}아웃)`); }
      else { big = '쓰리 아웃!'; col = '#ff9a8a'; }
      logPlay(b, D, kind, { arg: typeof arg === 'number' || typeof arg === 'string' ? arg : undefined, playT: +D.playT.toFixed(2) });
      D.balls = 0; D.strikes = 0; D.pitch = null; D.side = Math.random() < 0.5 ? 1 : -1;
      if (B && B.st !== 'gone') { B.st = 'dead'; B.holder = null; }
      if (b.over) return;
      if (D.score[0] >= D.S.win || D.score[1] >= D.S.win) return BB.finish(b, D, D.score[0] >= D.S.win ? 0 : 1);
      if (D.outs >= 3) { D.swap = true; sub = (sub ? sub + ' · ' : '') + '공수 교대'; }
      banner(D, big, sub, col, D.swap ? 2.1 : 1.4);
      D.phase = 'after'; D.pt = 0;
    },
    nextPlay(b, D) {
      if (D.swap) {
        D.swap = false; D.outs = 0; D.runners = []; D.bat = 1 - D.bat; b.stats.bsHalf++;
        D.half ^= 1; if (D.half === 0) D.inning++;
        D.fielders = mkFielders(D, 1 - D.bat);
        D.batU = role(b, D.bat); D.pitU = role(b, 1 - D.bat);
        sys(b, `공수 교대 — ${D.inning}회${D.half ? '말' : '초'} ${D.bat ? '2P' : '1P'} 공격`);
        banner(D, `${D.inning}회${D.half ? '말' : '초'}`, `${D.bat ? '2P' : '1P'} ${teamName(b, D.bat)} 공격`, TEAM_COL[D.bat], 1.4);
        BB.place(b, D); D.phase = 'setup'; D.pt = 0; D.setupDur = 1.4; D.ball = null; return;
      }
      BB.place(b, D); for (const n of D.fielders) { n.x = FPOS[n.pos][0]; n.y = FPOS[n.pos][1]; n.vx = n.vy = 0; n.recv = null; }
      for (const r of D.runners) { const s = baseSpot(r.base); r.x = s.x; r.y = s.y; r.vx = r.vy = 0; }
      BB.newPitch(b, D);
    },
    finish(b, D, team) {
      if (b.over) return;
      b.over = true; b.winner = b.teamBest(team); b.endType = 'baseball'; D.phase = 'over';
      const sc = `${D.score[0]} : ${D.score[1]}`;
      b.resultText = label => { const m = b.u.filter(o => o.team === team && !o.summon); return `${sc} ${m.map(label).join(' & ')} 승리! (${D.S.win}점 선취)`; };
      banner(D, '게임 셋!', `${sc} ${team ? '2P' : '1P'} 승리`, TEAM_COL[team], 3);
      sys(b, `게임 셋! ${sc} ${teamName(b, team)} 승리 (${D.S.win}점 선취)`); logPlay(b, D, 'win', { team });
      b.u.forEach(o => { if (!o.dead) b.say(o, o.team === team ? 'win' : 'lose'); });
      b.hitstop(0.2);
    },

    // ---------- 수비수·주자 물리: 밀림 / 몸 충돌 / 투사체 막기 ----------
    npcPhys(b, D, dt) {
      const all = D.fielders.concat(D.runners), fr = Math.exp(-7 * dt), pad = 9 * S0.npcK;
      for (const n of all) {
        n.stun = Math.max(0, n.stun - dt);
        if (n.vx || n.vy) { n.x += n.vx * dt; n.y += n.vy * dt; n.vx *= fr; n.vy *= fr; if (hyp(n.vx, n.vy) < 3) n.vx = n.vy = 0; }
        if (D.phase === 'live' || D.halt) for (const u of b.u) { // 캐릭터 몸에 밀림 (캐릭터는 그대로)
          if (u.dead || u.airborne || u.hidden) continue;
          const R0 = 11 + u.pad + pad, dx = n.x - u.x, dy = n.y - u.y, d = hyp(dx, dy);
          if (d >= R0) continue;
          const nx = d > 1e-3 ? dx / d : 1, ny = d > 1e-3 ? dy / d : 0; n.x = u.x + nx * R0; n.y = u.y + ny * R0;
          const k = Math.max(60, (u.moving || u.action ? u.speed : 0) * 0.5); n.vx += nx * k * 0.25; n.vy += ny * k * 0.25;
        }
        const q = clampField(n.x, n.y, 0); n.x = q.x; n.y = q.y;
      }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { // 서로 겹치지 않게
        const a = all[i], c = all[j], dx = c.x - a.x, dy = c.y - a.y, d = hyp(dx, dy), R = pad * 2;
        if (d >= R || d < 1e-3) continue; const k = (R - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * k; a.y -= ny * k; c.x += nx * k; c.y += ny * k;
      }
      // 투사체 막기 (피해 없음, 맞은 방향으로 밀림)
      for (const p of b.proj) {
        if (p.life <= 0 || !p.src) continue;
        for (const n of all) {
          if (Math.hypot(n.x - p.x, n.y - 16 - p.y) >= 11 + (p.r ? Math.min(p.r, 14) * 0.6 : 0)) continue;
          if (p.pierce) { const hs = p.bsHit || (p.bsHit = new Set()); if (hs.has(n.id)) continue; hs.add(n.id); }
          const sp = hyp(p.vx || 0, p.vy || 0) || 1; BB.knock(b, n, (p.vx || 0) / sp, (p.vy || 0) / sp, 170);
          if (!p.pierce) { p.life = 0; b.burst(p.x, p.y, projectileColor(p), 5); p.fizzle && p.fizzle(p); break; }
        }
      }
      if (D.gone) { for (const g of D.gone) g.t += dt; D.gone = D.gone.filter(g => g.t < 0.8); }
    },
    knock(b, n, nx, ny, k) {
      n.vx += nx * k; n.vy += ny * k; n.stun = Math.max(n.stun, 0.25 * Math.min(1.6, k / 200));
      if (b.time - n.knT > 0.15) { n.knT = b.time; b.ring(n.x, n.y - 10, 2, 12, 0.18, '#ffffff'); }
    },
    onFx(b, g) { // 공격 이펙트 → 수비수·주자 밀어냄 (피해 없음)
      const D = b.bsb; if (!D || !D.on || b.over) return;
      const a = g.actor;
      for (const n of D.fielders.concat(D.runners)) {
        let d, qx = g.x, qy = g.y;
        if (g.kind === 'streak') { const vx = g.x2 - g.x, vy = g.y2 - g.y, L2 = vx * vx + vy * vy || 1, t = clamp(((n.x - g.x) * vx + (n.y - g.y) * vy) / L2, 0, 1); qx = g.x + vx * t; qy = g.y + vy * t; }
        d = hyp(n.x - qx, (n.y - qy) * 1.15);
        if (d > g.r + 10) continue;
        let ang = d > 2 ? Math.atan2(n.y - qy, n.x - qx) : a ? Math.atan2(n.y - a.y, n.x - a.x) : 0;
        BB.knock(b, n, Math.cos(ang), Math.sin(ang), 200 * g.mult);
      }
    },

    // ================= 그리기 (시각 전용, 난수·시뮬 상태 변경 없음) =================
    floor(x, st) { // 스테이지 썸네일·카메라 없는 화면: 구장 전체를 경기장 칸에 축소
      if (!st.baseball) return; const f = fieldCanvas(); if (!f) return;
      const sh = 640, sw = sh * AR.w / AR.h;
      x.save(); x.imageSmoothingEnabled = true; x.drawImage(f, 360 - sw / 2, 236, sw, sh, AR.x, AR.y, AR.w, AR.h); x.restore();
    },
    drawUnder(ctx, b, thumb) {
      const D = b.bsb; if (!D || !D.on || thumb || !b.cam) return;
      const f = fieldCanvas(); if (f) ctx.drawImage(f, 0, 0);
      const B = D.ball;
      if (B && B.st !== 'dead' && B.st !== 'gone' && B.st !== 'held' && B.st !== 'hand') { // 공 그림자 + 뜬공 낙하 지점
        ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(B.x, B.y + 1, 3.2 * Math.max(0.4, 1 - B.z / 120), 1.4, 0, 0, TAU); ctx.fill();
        if (B.st === 'air' && !B.bounced && D.phase === 'live') { const L = BB.landing(B), p = 0.5 + 0.5 * Math.sin(b.time * 12); ctx.globalAlpha = 0.5 + 0.3 * p; ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(L.x, L.y, 7, 3, 0, 0, TAU); ctx.stroke(); }
        ctx.restore();
      }
    },
    sortItems(b) {
      const D = b.bsb; if (!D || !D.on || !b.cam) return [];
      const L = D.fielders.concat(D.runners).map(n => ({ y: n.y, draw: ctx => drawNpc(ctx, b, D, n) }));
      if (D.gone) for (const g of D.gone) L.push({ y: g.n.y, draw: ctx => drawNpc(ctx, b, D, g.n, g) });
      return L;
    },
    drawOver(ctx, b) {
      const D = b.bsb; if (!D || !D.on || !b.cam) return;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      const bu = D.batU || role(b, D.bat);
      if (bu && !bu.dead && !bu.hidden && D.phase !== 'live' && D.phase !== 'after') drawBat(ctx, D, bu); // 타석의 방망이
      const B = D.ball;
      if (B && B.st !== 'dead' && B.st !== 'gone') {
        const y = B.y - B.z;
        if (B.st === 'held' && B.holder) { const H = B.holder, hy = H.kind ? H.y - spriteTop(H.def) * S0.npcK - 8 : H.y - 64 - H.pad * 2; ctx.fillStyle = 'rgba(255,240,180,0.35)'; ctx.beginPath(); ctx.arc(H.x, hy, 6, 0, TAU); ctx.fill(); drawBall(ctx, H.x, hy, 1.2); }
        else drawBall(ctx, B.x, y, 1 + Math.min(0.8, B.z / 90));
      }
      if (D.info && D.phase !== 'live') { ctx.globalAlpha = Math.min(1, (1.6 - D.info.t) / 0.4); ctx.font = `bold 8px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const w = ctx.measureText(D.info.txt).width + 8, x = S0.mound.x + 46, y = S0.mound.y - 34; ctx.fillStyle = 'rgba(14,16,24,0.78)'; ctx.fillRect(x - w / 2, y - 6, w, 12); ctx.fillStyle = '#ffe9b0'; ctx.fillText(D.info.txt, x, y + 0.5); ctx.globalAlpha = 1; }
      ctx.restore();
    },
    drawTop(ctx, b) {
      const D = b.bsb; if (!D || !D.on || !b.cam) return;
      const C = b.cam, V = b.bsbView || { x: 0, y: 112, w: 360, h: 410 };
      ctx.save(); ctx.translate(C.x, C.y); ctx.scale(1 / C.k, 1 / C.k); // 화면 좌표 (카메라 해제)
      ctx.imageSmoothingEnabled = false; ctx.textBaseline = 'middle';
      drawBoard(ctx, b, D, V.x + 4, V.y + 2);
      drawMini(ctx, b, D, V.x + V.w - 70, V.y + 2);
      const M = D.msg;
      if (M) {
        const t = M.t, inn = Math.min(1, t / 0.16), out = t > M.dur - 0.3 ? Math.max(0, (M.dur - t) / 0.3) : 1, a = inn * out, cy = V.y + V.h * 0.42, h = 50 * easeOut(inn);
        ctx.globalAlpha = 0.8 * a; ctx.fillStyle = '#0e1018'; ctx.fillRect(0, cy - h / 2, W, h);
        ctx.globalAlpha = a; ctx.fillStyle = M.col; ctx.fillRect(0, cy - h / 2, W, 2); ctx.fillRect(0, cy + h / 2 - 2, W, 2);
        const pop = t < 0.22 ? 0.6 + 0.4 * easeOut(t / 0.22) * 1.08 : 1;
        ctx.textAlign = 'center'; ctx.font = `bold ${Math.round(22 * pop)}px ${FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = '#0e1018';
        ctx.strokeText(M.big, 180, cy - 7); ctx.fillStyle = M.col; ctx.fillText(M.big, 180, cy - 7);
        if (M.sub) { ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = '#d8dce8'; ctx.fillText(M.sub, 180, cy + 13); }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
  };

  // ---------- 그림 도우미 ----------
  let FIELD = null;
  function fieldCanvas() {
    if (FIELD !== null) return FIELD;
    if (typeof document === 'undefined' || !document.createElement) return (FIELD = false);
    const c = document.createElement('canvas'); c.width = S0.world.w; c.height = S0.world.h; const x = c.getContext && c.getContext('2d');
    if (!x || !x.fillRect || typeof x.arc !== 'function') return (FIELD = false);
    try { paintField(x); } catch (e) { return (FIELD = false); }
    return (FIELD = c);
  }
  function paintField(x) {
    const Wd = S0.world.w, Hd = S0.world.h, F = S0.fence, H = S0.home, P = S0.play, M = S0.mound;
    // 관중석
    x.fillStyle = '#232634'; x.fillRect(0, 0, Wd, Hd);
    const crowd = ['#d86a6a', '#6aa8ff', '#f0d070', '#e8e8f0', '#8ad08a', '#c88ad8', '#f0a060'];
    for (let j = 0; j < Hd; j += 7) for (let i = (j / 7) % 2 * 3; i < Wd; i += 6) { if (hyp(i - F.cx, j - F.cy) < F.r + 14) continue; const h = (i * 73 + j * 151) % 97; x.fillStyle = h < 50 ? crowd[h % crowd.length] : '#2e3244'; x.fillRect(i, j, 3, 3); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(i, j + 3, 3, 1); }
    // 구장 (사각형 ∩ 펜스 원)
    x.save(); x.beginPath(); x.rect(P.x, P.y, P.w, P.h); x.clip(); x.beginPath(); x.arc(F.cx, F.cy, F.r + 4, 0, TAU); x.clip();
    x.fillStyle = '#367a3c'; x.fillRect(0, 0, Wd, Hd); // 파울 지역 잔디
    for (let j = 0; j < Hd; j += 4) for (let i = (j * 3) % 11; i < Wd; i += 11) { x.fillStyle = 'rgba(0,30,0,0.12)'; x.fillRect(i, j, 1, 2); }
    // 페어 지역: 줄무늬 잔디
    x.save(); x.beginPath(); x.moveTo(H.x, H.y); x.lineTo(H.x - 900, H.y - 900); x.lineTo(H.x + 900, H.y - 900); x.closePath(); x.clip();
    for (let j = 0, k = 0; j < Hd; j += 22, k++) { x.fillStyle = k % 2 ? '#43964a' : '#3d8c44'; x.fillRect(0, j, Wd, 22); }
    for (let i = 0; i < 700; i++) { x.fillStyle = i % 3 ? 'rgba(0,40,0,0.16)' : 'rgba(210,255,190,0.10)'; x.fillRect((i * 67) % Wd, (i * 139) % Hd, 1, 2); }
    x.restore();
    // 경고 트랙 (펜스 안쪽 흙길)
    x.strokeStyle = '#a8794a'; x.lineWidth = 14; x.beginPath(); x.arc(F.cx, F.cy, F.r - 3, 0, TAU); x.stroke();
    // 내야 흙
    x.fillStyle = '#b8834e'; x.beginPath(); x.moveTo(H.x, H.y + 6); x.arc(M.x, M.y + 8, 132, -Math.PI / 4 - Math.PI / 2 - 0.62, -Math.PI / 4 + 0.62); x.closePath(); x.fill();
    const g = 11, B = BASES; x.fillStyle = '#43964a';
    x.beginPath(); x.moveTo(B[0].x, B[0].y - g * 1.4); x.lineTo(B[1].x - g * 1.4, B[1].y); x.lineTo(B[2].x, B[2].y + g * 1.4); x.lineTo(B[3].x + g * 1.4, B[3].y); x.closePath(); x.fill();
    x.fillStyle = 'rgba(0,40,0,0.10)'; for (let i = 0; i < 160; i++) x.fillRect(B[3].x + 20 + (i * 37) % 170, B[2].y + 20 + (i * 53) % 160, 1, 2);
    x.fillStyle = '#b8834e'; for (const p of B) { x.beginPath(); x.arc(p.x, p.y, p === B[0] ? 30 : 15, 0, TAU); x.fill(); }
    x.beginPath(); x.arc(M.x, M.y, 17, 0, TAU); x.fill(); x.fillStyle = '#c8935e'; x.beginPath(); x.arc(M.x, M.y, 12, 0, TAU); x.fill();
    x.fillStyle = '#ffffff'; x.fillRect(M.x - 5, M.y - 1, 10, 2); // 투수판
    x.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 400; i++) x.fillRect(B[3].x - 60 + (i * 41) % 300, B[2].y - 40 + (i * 61) % 300, 1, 1);
    // 파울 라인
    x.strokeStyle = 'rgba(255,255,255,0.92)'; x.lineWidth = 2;
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(H.x + s * 4, H.y - 4); x.lineTo(H.x + s * 600, H.y - 600); x.stroke(); }
    // 타석·포수석
    x.lineWidth = 1; x.strokeStyle = 'rgba(255,255,255,0.8)';
    x.strokeRect(H.x - 30, H.y - 12, 16, 26); x.strokeRect(H.x + 14, H.y - 12, 16, 26); x.strokeRect(H.x - 12, H.y + 14, 24, 22);
    x.beginPath(); x.arc(SPOT.batSub.x, SPOT.batSub.y + 2, 9, 0, TAU); x.stroke(); // 대기 타석
    x.restore();
    // 펜스 (파울 폴 포함)
    x.strokeStyle = '#1d3f2a'; x.lineWidth = 9; x.beginPath(); x.arc(F.cx, F.cy, F.r + 6, 0, TAU); x.stroke();
    x.strokeStyle = '#ffd23a'; x.lineWidth = 2; x.beginPath(); x.arc(F.cx, F.cy, F.r + 1.5, 0, TAU); x.stroke();
    for (const s of [-1, 1]) { // 파울 폴: 파울 라인과 펜스가 만나는 곳
      const dx = s * Math.SQRT1_2, dy = -Math.SQRT1_2, ox = H.x - F.cx, oy = H.y - F.cy, bq = ox * dx + oy * dy, t = -bq + Math.sqrt(bq * bq - (ox * ox + oy * oy - F.r * F.r));
      const px = H.x + dx * t, py = H.y + dy * t; x.fillStyle = '#ffd23a'; x.fillRect(px - 2, py - 26, 4, 30); x.fillStyle = '#b89020'; x.fillRect(px - 2, py + 2, 4, 2);
    }
    // 백스톱 (홈 뒤 그물)
    x.fillStyle = '#2a2e3c'; x.fillRect(P.x, P.y + P.h, P.w, Hd - P.y - P.h);
    x.strokeStyle = 'rgba(200,210,230,0.35)'; x.lineWidth = 1; x.beginPath(); for (let i = P.x; i < P.x + P.w; i += 6) { x.moveTo(i, P.y + P.h - 2); x.lineTo(i, Hd); } x.stroke();
    x.fillStyle = '#4a5068'; x.fillRect(P.x, P.y + P.h - 2, P.w, 3);
    // 베이스
    x.fillStyle = '#ffffff';
    for (let k = 1; k <= 3; k++) { const p = B[k]; x.save(); x.translate(p.x, p.y); x.rotate(Math.PI / 4); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(-4, -3, 9, 9); x.fillStyle = '#ffffff'; x.fillRect(-4.5, -4.5, 9, 9); x.restore(); }
    x.beginPath(); x.moveTo(H.x - 5, H.y - 4); x.lineTo(H.x + 5, H.y - 4); x.lineTo(H.x + 5, H.y + 1); x.lineTo(H.x, H.y + 5); x.lineTo(H.x - 5, H.y + 1); x.closePath(); x.fill();
  }
  function drawBall(ctx, x, y, k = 1) {
    const r = 2.6 * k; ctx.fillStyle = '#2a2a33'; ctx.beginPath(); ctx.arc(x, y, r + 0.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0402e'; ctx.fillRect(Math.round(x - r * 0.6), Math.round(y - r * 0.5), 1, Math.max(1, Math.round(r))); ctx.fillRect(Math.round(x + r * 0.4), Math.round(y - r * 0.4), 1, Math.max(1, Math.round(r)));
  }
  function drawBat(ctx, D, u) {
    const p = D.pitch, sw = p && p.swingT >= 0 ? clamp((p.t - p.swingT) / 0.16, 0, 1) : 0;
    const hx = u.x + 7, hy = u.y - 22, a = -2.3 + sw * 3.6; // 어깨 위로 든 방망이 → 스윙
    ctx.save(); ctx.translate(Math.round(hx), Math.round(hy)); ctx.rotate(a);
    ctx.fillStyle = '#3a2414'; ctx.fillRect(-1, -1.5, 22, 4); ctx.fillStyle = '#c8955a'; ctx.fillRect(0, -1, 9, 2); ctx.fillRect(9, -1.5, 12, 3); ctx.fillStyle = '#e8c08a'; ctx.fillRect(10, -1.5, 10, 1);
    ctx.restore();
    if (sw > 0 && sw < 1) { ctx.globalAlpha = 0.35 * (1 - sw); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 18, -2.3, -2.3 + sw * 3.6); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  // 모자 위치: 스프라이트 첫 프레임에서 불투명한 맨 윗줄 (가능하면 픽셀 검사, 안 되면 비율로 추정)
  const capCache = {};
  function capInfo(def, back) {
    const key = def.id + (back ? '@b' : ''); if (capCache[key]) return capCache[key];
    const s0 = Sprites.get(def), s = back && s0.back ? s0.back : s0; let info = null;
    try {
      const c = document.createElement('canvas'); c.width = s.fw; c.height = s.fh; const x = c.getContext('2d'); x.drawImage(s.img, 0, 0, s.fw, s.fh, 0, 0, s.fw, s.fh);
      const d = x.getImageData(0, 0, s.fw, s.fh).data; let top = -1;
      for (let j = 0; j < s.fh && top < 0; j++) for (let i = 0; i < s.fw; i++) if (d[(j * s.fw + i) * 4 + 3] > 40) { top = j; break; }
      if (top >= 0) { let x0 = s.fw, x1 = -1; const band = Math.max(2, Math.round(s.fh * 0.06)); for (let j = top; j < Math.min(s.fh, top + band); j++) for (let i = 0; i < s.fw; i++) if (d[(j * s.fw + i) * 4 + 3] > 40) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); } info = { top, cx: (x0 + x1 + 1) / 2, w: x1 - x0 + 1 }; }
    } catch (e) { info = null; }
    if (!info) info = { top: s.fh * 0.06, cx: s.fw / 2, w: s.fw * 0.35 };
    const k = s.dw / s.fw; info = { y: -s.dh + s.foot + info.top * k, x: -s.dw / 2 + info.cx * k, w: info.w * k };
    return (capCache[key] = info);
  }
  function spriteTop(def) { try { return -capInfo(def, false).y; } catch (e) { return 50; } }
  function drawNpc(ctx, b, D, n, gone) {
    const s0 = Sprites.get(n.def), back = n.back && !!s0.back, s = back ? s0.back : s0, K = S0.npcK, col = TEAM_COL[n.team];
    let alpha = 1, oy = 0; if (gone) { alpha = Math.max(0, 1 - gone.t / 0.8); oy = gone.home ? -gone.t * 20 : 0; }
    const bob = n.moving ? -Math.abs(Math.sin(n.walk)) * 1.5 : Math.sin(b.time * 3 + n.id) * 0.5;
    ctx.save(); ctx.globalAlpha = 0.3 * alpha; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(n.x, n.y + 1, 9 * K, 3, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.55 * alpha; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash && ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.ellipse(n.x, n.y + 1, 11 * K, 4, 0, 0, TAU); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
    ctx.globalAlpha = alpha; ctx.translate(Math.round(n.x), Math.round(n.y + bob + oy));
    if (n.stun > 0) ctx.rotate(Math.sin(n.stun * 30) * 0.12);
    ctx.scale(spriteSX(n.def, back, n.face) * K, K);
    const fr = n.moving ? Math.floor(n.walk * s.fps / 6) : 0; Sprites.draw(ctx, s, fr, false);
    const C = capInfo(n.def, back), cw = clamp(C.w * 0.95, 10, 18); // 모자 (팀 색)
    ctx.fillStyle = '#16141e'; ctx.fillRect(Math.round(C.x - cw / 2) - 1, Math.round(C.y - 5), Math.round(cw) + 2, 7);
    ctx.fillStyle = col; ctx.fillRect(Math.round(C.x - cw / 2), Math.round(C.y - 4), Math.round(cw), 5);
    ctx.fillRect(Math.round(C.x - cw / 2 + 2), Math.round(C.y - 6), Math.round(cw - 4), 2);
    ctx.fillStyle = '#16141e'; ctx.fillRect(Math.round(C.x - cw / 2 + 1), Math.round(C.y - 7), Math.round(cw - 2), 1);
    if (!back) { ctx.fillStyle = shade(col, -0.35); ctx.fillRect(Math.round(C.x + cw / 2 - 2), Math.round(C.y), 6, 2); } // 챙
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(Math.round(C.x - cw / 2 + 2), Math.round(C.y - 4), 2, 1);
    if (!back) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(C.x - 1), Math.round(C.y - 3), 2, 2); }
    ctx.restore();
  }
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = v => clamp(Math.round(v * (1 + k)), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
  function dots(ctx, x, y, n, on, col) { for (let i = 0; i < n; i++) { ctx.fillStyle = i < on ? col : 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(x + i * 7, y, 2.4, 0, TAU); ctx.fill(); } }
  function drawBoard(ctx, b, D, x0, y0) { // 점수판: 점수 / 회·초말 / 볼·스트라이크·아웃 / 주자
    const w = 108, h = 54;
    ctx.fillStyle = 'rgba(14,16,24,0.9)'; ctx.fillRect(x0, y0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x0, y0, w, 1);
    ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center';
    for (const t of [0, 1]) { const x = x0 + 8 + t * 40; ctx.fillStyle = TEAM_COL[t]; ctx.fillRect(x - 6, y0 + 4, 3, 11); ctx.fillText(`${t + 1}P`, x + 7, y0 + 10); ctx.fillStyle = '#ffffff'; ctx.fillText(String(D.score[t]), x + 25, y0 + 10); if (D.bat === t) { ctx.fillStyle = '#ffe27a'; ctx.fillRect(x - 6, y0 + 16, 34, 1); } }
    ctx.font = `bold 9px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = '#dfe4f0';
    ctx.fillText(`${D.inning}회${D.half ? '말' : '초'} · ${D.S.win}점 선취`, x0 + 5, y0 + 25);
    ctx.font = `bold 9px ${FONT}`;
    ctx.fillStyle = '#8fe08a'; ctx.fillText('B', x0 + 5, y0 + 37); dots(ctx, x0 + 16, y0 + 37, 3, D.balls, '#8fe08a');
    ctx.fillStyle = '#ffd04a'; ctx.fillText('S', x0 + 5, y0 + 47); dots(ctx, x0 + 16, y0 + 47, 2, D.strikes, '#ffd04a');
    ctx.fillStyle = '#ff7a6a'; ctx.fillText('O', x0 + 44, y0 + 47); dots(ctx, x0 + 55, y0 + 47, 2, D.outs, '#ff7a6a');
    const cx = x0 + 90, cy = y0 + 40; // 주자 다이아몬드
    for (let k = 1; k <= 3; k++) { const px = cx + (k === 1 ? 7 : k === 3 ? -7 : 0), py = cy - (k === 2 ? 7 : 0); ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4); ctx.fillStyle = runnerAt(D, k) ? '#ffe27a' : 'rgba(255,255,255,0.2)'; ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
  }
  function drawMini(ctx, b, D, x0, y0) { // 미니맵: 구장 + 공 + 선수
    const f = fieldCanvas(), sx = 92, sy = 150, sw = 536, sh = 720, k = 66 / sw, h = sh * k;
    ctx.fillStyle = 'rgba(14,16,24,0.82)'; ctx.fillRect(x0 - 1, y0 - 1, 68, h + 2);
    if (f) { ctx.imageSmoothingEnabled = true; ctx.drawImage(f, sx, sy, sw, sh, x0, y0, 66, h); ctx.imageSmoothingEnabled = false; }
    const P = (x, y) => [x0 + (x - sx) * k, y0 + (y - sy) * k];
    for (const n of D.fielders) { const [x, y] = P(n.x, n.y); ctx.fillStyle = TEAM_COL[n.team]; ctx.fillRect(x - 1, y - 1, 2, 2); }
    for (const n of D.runners) { const [x, y] = P(n.x, n.y); ctx.fillStyle = TEAM_COL[n.team]; ctx.fillRect(x - 1, y - 1, 2, 2); }
    for (const u of b.u) { if (u.dead || u.hidden) continue; const [x, y] = P(u.x, u.y); ctx.fillStyle = '#16141e'; ctx.fillRect(x - 2, y - 2, 5, 5); ctx.fillStyle = TEAM_COL[u.team]; ctx.fillRect(x - 1.5, y - 1.5, 4, 4); }
    const B = D.ball; if (B && B.st !== 'dead' && B.st !== 'gone') { const [x, y] = P(B.x, B.y); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 3, 3); }
    if (b.cam && b.bsbView) { const V = b.bsbView, C = b.cam, [x, y] = P(C.x + V.x / C.k, C.y + V.y / C.k); ctx.strokeStyle = 'rgba(255,226,122,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, V.w / C.k * k, V.h / C.k * k); }
  }

  // ---------- 카메라 (main.js 가 매 프레임 호출, 시각 전용) ----------
  function updateCam(b, dt, view) {
    if (!b || b.escape) return;
    const D = b.bsb;
    if (!D || !D.on) { if (b._bsbCam) { b.cam = null; b._bsbCam = false; } return; }
    const V = view || { x: 0, y: 112, w: 360, h: 410 }; b.bsbView = V; b._bsbCam = true;
    let cx, cy, k;
    if (D.phase === 'live' || D.halt || (D.phase === 'after' && b.cam && b.cam.live)) {
      const pts = []; for (const u of [D.batU, D.pitU]) if (u && !u.dead && !u.hidden) pts.push([u.x, u.y]);
      const B = D.ball; if (B && B.st !== 'dead' && B.st !== 'gone') { const H = B.st === 'held' && B.holder; pts.push(H ? [H.x, H.y] : [B.x, B.y - B.z * 0.5]); }
      if (!pts.length) pts.push([S0.mound.x, S0.mound.y]);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y - 40); y1 = Math.max(y1, y); }
      k = clamp(Math.min(V.w / (x1 - x0 + 150), V.h / (y1 - y0 + 150)), 0.5, 1.2); cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
    } else { cx = 360; cy = 726; k = 1.35; }
    const hw = V.w / k / 2, hh = V.h / k / 2, Wd = S0.world.w, Hd = S0.world.h;
    cx = Wd > hw * 2 ? clamp(cx, hw, Wd - hw) : Wd / 2; cy = Hd > hh * 2 ? clamp(cy, hh, Hd - hh) : Hd / 2;
    const C = b.cam || (b.cam = { cx, cy, k }); const a = 1 - Math.exp(-4 * (dt || 0.016));
    C.cx += (cx - C.cx) * a; C.cy += (cy - C.cy) * a; C.k += (k - C.k) * a; C.live = D.phase === 'live' || (D.phase === 'after' && C.live);
    C.x = C.cx - (V.x + V.w / 2) / C.k; C.y = C.cy - (V.y + V.h / 2) / C.k;
  }

  // ---------- 엔진 연결 ----------
  const Pp = Battle.prototype;
  // 시뮬레이션 동안만 AR = 구장 (투사체 경계·스킬 배치 등). 예외가 나도 원래대로
  const _step = Pp.step;
  Pp.step = function (dt) {
    const D = this.bsb; if (!D || !D.on) return _step.call(this, dt);
    setAR(D.S.play); try { return _step.call(this, dt); } finally {
      setAR(AR0);
      // 체력으로 끝난 경기도 결과 화면에 점수 표시 (결과 문구만, 시뮬레이션 값은 건드리지 않음)
      if (this.over && D.on && !this.resultText && this.winner) {
        const team = this.winner.team, sc = `${D.score[0]} : ${D.score[1]}`, b = this;
        this.resultText = label => { const m = b.u.filter(o => o.team === team && !o.summon); return `${sc} ${m.map(label).join(' & ')} 승리! (KO)`; };
      }
    }
  };
  // 투구 대기·플레이 종료 연출 중: 캐릭터 정지 (상태이상·쿨타임도 멈춤, 시각 값만 감쇠)
  const _uu = Pp.updateUnit;
  Pp.updateUnit = function (u, dt) {
    const D = this.bsb; if (!D || !D.on || D.halt || D.phase === 'live' || this.over || this.freeze) return _uu.call(this, u, dt);
    u.flash = Math.max(0, u.flash - dt); u.swing = Math.max(0, u.swing - dt); if (u.wSwing && (u.wSwing.t += dt) >= u.wSwing.dur) u.wSwing = null;
    u.boost *= Math.pow(0.08, dt); u.kx *= Math.pow(0.001, dt); u.ky *= Math.pow(0.001, dt);
    if (u.dead) u.deadT += dt; u.moving = false;
  };

  STAGE_HOOKS.push(BB);
  if (window.StageExt4 && window.StageExt4.FX_HOOKS) window.StageExt4.FX_HOOKS.push(BB);
  window.BASEBALL = { BB, updateCam, BASES, SPOT, FPOS, S: S0 };
})();
