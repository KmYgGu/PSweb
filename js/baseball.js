/* =========================================================
 * 야구장 스테이지 (STAGE_HOOKS)
 *  - 넓은 구장(880x1040, 베이스 간격 195) + 카메라(시각 전용, main.js → BASEBALL.updateCam). 시뮬레이션 동안만 AR 을 구장 영역으로 바꿔 끼움
 *    (투사체 경계·스킬 배치가 구장 기준으로 동작) → 그리기·다른 스테이지에는 영향 없음
 *  - 진행: 준비 → 투구(타자·투수 정지) → 타격하면 '경기 중'(모두 자유 이동·전투) → 플레이 종료 → 다음 투구
 *  - 승리: 3점 선취 또는 상대 체력 0 (기존 KO 판정 그대로)
 *  - 수비수(포수·내야 4·외야 3)·주자: 플레이어가 고르지 않은 남은 캐릭터 (중복 없음). 피해 없음, 공격에 밀리고 투사체를 막음
 *  - 시간이 지날수록 수비수·주자 능력치(이동·송구·포구 범위) 상승 → 시간 제한 없이 결판
 *  - 장기전 피해 증가(RAMP)는 '경기 중' 시간만 셈 (투구 대기 시간 제외)
 *  - 스테이지 교체(구울즈·아오오니 문)로 떠나면 야구 규칙만 멈추고 전투는 계속 (야구장으로 들어오는 교체는 없음: noSwitchIn). 경기 집중 모드(b.focusMode)가 켜져 있으면 switchStage 가 leave 를 호출하지 않아 점수·기믹이 그대로 유지됨
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const FONT = '"Galmuri11", "Malgun Gothic", sans-serif';
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const AR0 = { x: AR.x, y: AR.y, w: AR.w, h: AR.h };
  const setAR = r => { AR.x = r.x; AR.y = r.y; AR.w = r.w; AR.h = r.h; };
  const hyp = Math.hypot;
  const KEEP_ST = new Set(['gCastle', 'bzTired']); // 투구 때 지우지 않는 상태: 구울 백은성(구조물과 연결), 베르제붓 탈진(마나 상태 표시, 매 프레임 다시 붙음)

  STAGE_DEFS.baseball = {
    name: '야구장', short: '야구장', theme: 'baseball', noSwitchIn: true,
    desc: '타석과 마운드에서 시작! 투수가 던지고 타자가 치면 모두 자유롭게 움직이며 싸웁니다. 타자가 1·2·3루 아무 베이스나 밟으면 안타, 공 가진 수비수에게 닿으면 아웃. 먼저 3점 또는 상대 체력 0이면 승리!',
    // world: 구장 크기, play: 이동 가능 사각형 (+ 펜스 원 안쪽), home/mound: 홈·마운드, bd: 베이스 간격, fence: 외야 펜스 원 (cx, cy, r, h=넘어가는 높이)
    // npcK: 수비수·주자 그림 배율, spd: 수비수·주자 이동 속도 배율 (캐릭터 이동속도 × spd), rise: 초당 능력치 상승률(최대 riseMax 배)
    baseball: {
      // 내야 확대 (v2026.11.10-6): 베이스 간격 150 → 195 (1.3배), 마운드 거리 102 → 133, 외야·펜스 1.2배 (구장 720x880 → 880x1040)
      world: { w: 880, h: 1040 }, play: { x: 16, y: 236, w: 848, h: 760 },
      home: { x: 440, y: 920 }, mound: { x: 440, y: 787 }, bd: 195,
      fence: { cx: 440, cy: 668, r: 396, h: 16 },
      win: 3, npcK: 0.8, spd: 0.64, rise: 0.009, riseMax: 2.6, hitK: 1.2, // hitK: 타구 비거리 배율 (넓어진 구장에 맞춤)
      throwSpd: 420, keepR: 95, tagR: 16, catchR: 13, pickR: 13, baseR: 30, tagDelay: 0.12, recvR: 36, // recvR: 송구를 받는 거리 (이전 26 — 주자·타자 몸에 밀려 놓치는 일이 잦아서) playMax: 40,
      contact: { base: 0.66, out: 0.68, min: 0.2, max: 0.88, foul: 0.28 }, // 타격 확률: base + 방어력·사거리 − 투수 공격력, 볼이면 ×out, [min, max]. foul: 맞힌 공 중 파울 비율 (이전 0.5 / 0.6 / 0.12~0.82 / 0.32)
      catchP: { fly: 0.72, line: 0.48 }, // 뜬공·라인드라이브 포구 성공 확률 (실패하면 공을 떨어뜨림)
      t: { setup: 1.6, windup: 0.5, pause: 0.6, after: 1.2, swap: 2.0, hrStop: 0.84 }, // hrStop: 홈런 타구 히트 스톱 (시뮬레이션 정지, 매번 같은 길이). v2026.11.10-17: 0.42 → 0.84 (+ 시네마틱 바)
    },
  };

  // ---------- 좌표 ----------
  const S0 = STAGE_DEFS.baseball.baseball;
  const BASES = (() => { const h = S0.home, d = S0.bd / Math.SQRT2; return [{ x: h.x, y: h.y }, { x: h.x + d, y: h.y - d }, { x: h.x, y: h.y - 2 * d }, { x: h.x - d, y: h.y - d }]; })();
  const HX = S0.home.x, HY = S0.home.y, rel = (dx, dy) => [HX + dx, HY + dy]; // 홈 기준 좌표
  const SPOT = { bat: { x: HX - 23, y: HY + 2 }, pit: { x: S0.mound.x, y: S0.mound.y }, batSub: { x: HX - 76, y: HY + 48 }, pitSub: { x: S0.mound.x + 50, y: S0.mound.y + 26 } };
  const FPOS = { C: rel(0, 36), '1B': rel(169, -174), '2B': rel(75, -263), SS: rel(-75, -263), '3B': rel(-169, -174), LF: rel(-185, -420), CF: rel(0, -504), RF: rel(185, -420) };
  const ORDER = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const COVER = { C: rel(0, 14), '1B': [BASES[1].x + 6, BASES[1].y - 2], '2B': [BASES[2].x + 6, BASES[2].y + 2], SS: rel(-55, -213), '3B': [BASES[3].x - 6, BASES[3].y - 2] };
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
  // 실점 위험도 (송구·추격 우선순위): 홈으로 뛰는 주자 > 3루로 > 2루로 > 되돌아가는 주자 > 타자(홈런 말고는 득점 못 함)
  const threat = t => !t.kind ? 0 : t.st === 'back' ? 8 : t.to === 4 ? 70 : t.to === 3 ? 40 : 18;
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
  // 홈런 타구 궤적 (k: 0 → 1 = 타격 지점 → 펜스, 1 초과는 관중석 쪽으로 계속 — 그리기 전용)
  const hrPos = (R, k) => ({ x: R.x0 + (R.x1 - R.x0) * k, y: R.y0 + (R.y1 - R.y0) * k, z: Math.max(0, R.z0 + (R.z1 - R.z0) * k + 64 * Math.sin(Math.PI * Math.min(k, 1)) + (k > 1 ? (k - 1) * 40 : 0)) });
  // 그리기 전용 결정적 해시 (시뮬레이션 난수를 쓰지 않음): 같은 투구·같은 수비수면 항상 같은 값
  const vhash = (a, c) => { let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((c | 0) + 0x7F4A7C15, 0x85EBCA77)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; return (h >>> 0) % 1000 / 1000; };

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
        score: [0, 0], outs: 0, balls: 0, strikes: 0, runners: [], fielders: [], ball: null, pitch: null, msg: null, info: null, nid: 0, log: [], nextR: [0, 0], swap: false, reuse: false, halt: false, batU: null, pitU: null, hit: null, pend: null, hr: null, jmp: null };
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
      else if (P === 'hrstop') { D.pt += dt; BB.hold(b, D); if (D.pt >= D.S.t.hrStop) BB.hrLaunch(b, D); } // 홈런 히트 스톱: 모두 정지 (수비수도)
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
    // 플레이 볼(매 투구 시작): 상태이상 전부 초기화 (체력은 그대로). 자기 기술 상태(positive·백은성·탈진 표시)는 유지
    //  투구 사이에도 예약된 효과(타이머·구슬 등)가 드물게 상태를 걸 수 있어 타격 순간(startLive)에 한 번 더 지움 (full=false: 상태만)
    clearAilments(b, D, full = true) {
      for (const u of b.u) {
        if (u.dead) continue;
        if (u.statuses.length) u.statuses = u.statuses.filter(s => { const d = STATUS_DEFS[s.id]; return d && (d.positive || KEEP_ST.has(s.id)); });
        if (!full) continue;
        if (u.action && u.action.pin && u.action.tgt) b.releasePin(u.action.tgt);
        u.action = null; u.push = null; u.pull = null; u.kx = 0; u.ky = 0; u.bsV = null;
      }
      for (const n of D.fielders.concat(D.runners)) { n.stun = 0; n.vx = n.vy = 0; }
    },
    newPitch(b, D) {
      BB.flushPend(b, D); D.hr = null; D.jmp = null; // 플레이 볼: 지난 플레이에서 세이프된 자리에 주자 등장
      BB.clearAilments(b, D);
      const pu = D.pitU, bu = D.batU, ps = pu.st, bs = bu.st, nSk = (pu.skills || []).length;
      const brk = Math.random() < clamp(0.12 + 0.07 * nSk, 0.12, 0.6);         // 변화구 확률 ~ 스킬 수
      const fast = (230 + ps.atk * 4.2) * 1.2, spd = brk ? fast * 0.8 : fast;          // 직구 속도 ~ 공격력
      const kmh = Math.round((118 + ps.atk * 0.85) * (brk ? 0.83 : 1));
      const zone = Math.random() < (brk ? 0.52 : 0.6);
      const swing = Math.random() < (zone ? 0.82 : 0.28);
      let cp = D.S.contact.base + (bs.def || 0) * 0.005 + Math.min(bs.range || 50, 140) * 0.0011 - (ps.atk - 30) * 0.004 - (brk ? 0.07 : 0); // 타격 확률 ~ 방어력·사거리
      if (!zone) cp *= D.S.contact.out; cp = clamp(cp, D.S.contact.min, D.S.contact.max);
      const contact = swing && Math.random() < cp, foul = contact && Math.random() < D.S.contact.foul;
      const kinds = ['커브', '슬라이더', '체인지업', '포크'], kname = brk ? kinds[Math.floor(Math.random() * kinds.length)] : '직구';
      const curve = brk ? (Math.random() < 0.5 ? -1 : 1) * rand(10, 20) : rand(-2, 2);
      const x1 = S0.home.x + (zone ? rand(-4, 4) : (Math.random() < 0.5 ? -1 : 1) * rand(9, 15)), y1 = S0.home.y - 2;
      let hit = null;
      if (contact && !foul) { // 타구: 방향·종류·비거리 (비거리 ~ 공격력)
        const r = Math.random(), typ = r < 0.42 ? 'ground' : r < 0.72 ? 'line' : 'fly';
        const pow = (150 + bs.atk * 7) * D.S.hitK * rand(0.6, 1.25) * (typ === 'fly' ? 1.15 : typ === 'line' ? 1 : 0.55);
        hit = { typ, a: rand(-0.72, 0.72), dist: pow };
      } else if (foul) hit = { typ: 'foul', a: (Math.random() < 0.5 ? -1 : 1) * rand(0.95, 1.6), dist: rand(90, 200) * D.S.hitK };
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
        BB.launch(D, p.hit, false);
        const hr = BB.predictHR(D.ball); // 홈런 여부는 타격 순간 확정 (고정 간격 궤적 계산, 난수 없음)
        if (hr) { BB.hrStart(b, D, hr); return; }
        D.ball.noHR = true; BB.startLive(b, D); return;
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
      D.phase = 'live'; D.playT = 0; D.hitType = D.ball.typ; b.stats.bsHit++; BB.clearAilments(b, D, false);
      for (const n of D.fielders) { n.rt = 0.12 + (n.pos === 'C' ? 0.2 : 0); n.recv = null; }
      for (const r of D.runners) { r.st = 'on'; r.aggr = rand(0.85, 1.3); }
      for (const u of b.u) u.bsV = null;
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
        if (k >= 1) { const R = T.to; if (R && hyp(R.x - B.x, R.y - B.y) < D.S.recvR && !(R.kind && R.stun > 0.2)) { BB.give(b, D, R); } else { B.st = 'air'; B.bounced = true; B.vx = (T.x1 - T.x0) / T.dur * 0.25; B.vy = (T.y1 - T.y0) / T.dur * 0.25; B.vz = 40; B.z = 6; } if (R && R.kind) R.recv = null; }
        return;
      }
      if (B.st === 'hrfly') { // 홈런 타구: 펜스 너머까지 일직선에 가깝게 강하게 (궤적은 hrPos, 결과는 이미 홈런)
        const R = D.hr; R.k = Math.min(1, R.k + dt / R.dur); const q = hrPos(R, R.k); B.x = q.x; B.y = q.y; B.z = q.z;
        if (R.k >= 1) BB.homeRun(b, D); return;
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
        if (D.phase === 'live' && !B.noHR && B.z > F.h && fairAt(B.x, B.y) && !B.bounced) { BB.homeRun(b, D); return; } // noHR: 타격 순간 홈런이 아니라고 정해진 타구
        const nx = dx / d, ny = dy / d, vn = B.vx * nx + B.vy * ny; B.x = F.cx + nx * (F.r - 4); B.y = F.cy + ny * (F.r - 4); if (vn > 0) { B.vx -= 1.5 * vn * nx; B.vy -= 1.5 * vn * ny; } B.bounced = true;
        if (Math.abs(vn) > 120 && D.phase === 'live') b.text(B.x, B.y - 20, '펜스!', '#ffffff', 9);
      }
      const P = S0.play;
      if (B.y > P.y + P.h - 6) { B.y = P.y + P.h - 6; B.vy = -Math.abs(B.vy) * 0.5; B.bounced = true; }
      if (B.x < P.x + 6) { B.x = P.x + 6; B.vx = Math.abs(B.vx) * 0.5; } if (B.x > P.x + P.w - 6) { B.x = P.x + P.w - 6; B.vx = -Math.abs(B.vx) * 0.5; }
    },
    give(b, D, H) { const B = D.ball; B.st = 'held'; B.holder = H; B.vx = B.vy = B.vz = 0; B.tagT = D.clock + D.S.tagDelay; if (H.kind) { H.passCd = 0.35; H.rt = Math.max(H.rt, 0.3); } else H.bsPassCd = 0.35; },
    throwTo(b, D, from, to, at) { // at: 받을 지점 (예측 송구). 없으면 받는 사람 현재 위치
      const B = D.ball, q = BB.holderPos(from), p = at ? clampField(at.x, at.y, 0) : { x: to.x, y: to.y }, L = hyp(p.x - q.x, p.y - q.y);
      B.st = 'throw'; B.holder = null; B.thr = { t: 0, dur: Math.max(0.12, L / thrSpd(D)), x0: q.x, y0: q.y, x1: p.x, y1: p.y, arc: Math.min(26, L * 0.08), to };
      if (to.kind) to.recv = { x: p.x, y: p.y };
      b.text(q.x, q.y - 40, '송구!', '#d8e6ff', 8);
    },
    landing(B) { // 공중 타구 착지 예상 지점
      if (B.z <= 0 && B.vz <= 0) return { x: B.x, y: B.y };
      const G = 700, t = (B.vz + Math.sqrt(B.vz * B.vz + 2 * G * Math.max(0, B.z))) / G; return clampField(B.x + B.vx * t, B.y + B.vy * t, 0);
    },
    homeRun(b, D) {
      const B = D.ball; B.st = 'gone'; b.stats.bsHR++;
      if (D.hr) { D.hr.outT = D.clock; b.shock(B.x, B.y - B.z * 0.6, 6, 46, '#ffe27a', 0.45, 5); b.ring(B.x, B.y - B.z * 0.6, 4, 30, 0.35, '#ffffff'); b.shake(4); }
      const n = D.runners.length + 1;
      for (let i = 0; i < 30; i++) { const a = rand(0, TAU), s = rand(40, 160); b.parts.push({ x: B.x, y: B.y - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 60, g: 200, life: rand(0.6, 1.2), max: 1.2, color: ['#ffffff', TEAM_COL[D.bat], '#ffe27a'][i % 3], size: rand(1.5, 3) }); }
      D.runners = []; D.score[D.bat] += n; b.stats.bsRuns += n;
      BB.endPlay(b, D, 'HR', n);
    },

    // ---------- 홈런 연출 ----------
    // 타구가 펜스를 넘는지: 실제 공 물리와 같은 식을 고정 간격(1/120초)으로 앞당겨 계산 (난수·시뮬 상태 변경 없음)
    predictHR(B0) {
      if (B0.st !== 'air' || B0.bounced) return null;
      const G = 700, F = S0.fence, P = S0.play, h = 1 / 120; let x = B0.x, y = B0.y, z = B0.z, vx = B0.vx, vy = B0.vy, vz = B0.vz;
      for (let t = h; t < 8; t += h) {
        x += vx * h; y += vy * h; z += vz * h; vz -= G * h;
        if (z <= 0) return null;
        if (hyp(x - F.cx, y - F.cy) > F.r - 4) return z > F.h && fairAt(x, y) ? { x, y, z, t } : null;
        if (y > P.y + P.h - 6) return null;
      }
      return null;
    },
    hrStart(b, D, hr) { // 히트 스톱: 타격 순간에서 모두 멈춤 + 투수 머리 위 '!'
      const B = D.ball, H = S0.home;
      D.hr = { x0: B.x, y0: B.y, z0: B.z, x1: hr.x, y1: hr.y, z1: hr.z, dur: clamp(hr.t * 0.55, 0.55, 1.1), k: 0, t0: D.clock, outT: -1, typ: B.typ };
      B.st = 'hrstop'; B.vx = B.vy = B.vz = 0; D.phase = 'hrstop'; D.pt = 0;
      b.ring(B.x, B.y - B.z, 3, 30, 0.3, '#ffffff'); b.glow(B.x, B.y - B.z, 34, '#fff4c0', 0.45); b.shake(3);
      void H;
    },
    hrLaunch(b, D) { // 히트 스톱 끝: 파괴적인 타구 발사
      const B = D.ball, R = D.hr; B.st = 'hrfly'; B.bounced = false; B.typ = R.typ;
      const a = Math.atan2(R.y1 - R.y0, R.x1 - R.x0);
      b.shock(R.x0, R.y0 - R.z0, 4, 54, '#ffe27a', 0.4, 6); b.ring(R.x0, R.y0 - R.z0, 2, 40, 0.3, '#ffffff');
      b.streak(R.x0, R.y0 - R.z0, R.x0 + Math.cos(a) * 70, R.y0 + Math.sin(a) * 70 - 30, '#fff0b0', 12, 0.3); b.shake(4); playSfx('bumpHard');
      BB.startLive(b, D);
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
      BB.trackVel(bu, dt);
      BB.ballPhys(b, D, dt); if (D.phase !== 'live') return;
      // 뜬공 포구 / 땅볼 줍기
      if (B.st === 'air') {
        for (const n of D.fielders) {
          if (n.rt > 0 || n.stun > 0.15) continue;
          const d = hyp(n.x - B.x, n.y - B.y);
          if (!B.bounced && B.z < 36 && d < D.S.catchR + 4 * (rise(D) - 1)) {
            if (B.tried && B.tried.includes(n.id)) continue; (B.tried || (B.tried = [])).push(n.id);
            D.jmp = { id: n.id, t0: D.clock, typ: B.typ, d }; // 포구 시도 기록 (점프 연출의 착지용, 판정과 무관)
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
        if (D.clock >= (B.tagT || 0)) for (const t of T) { // 공을 받은 직후(tagDelay)에는 태그 불가: 쥐는 시간
          const r = D.S.tagR + (H.kind ? 0 : H.pad) + (t.kind ? 0 : t.pad) + 2 * (rise(D) - 1);
          if (hyp(H.x - t.x, H.y - t.y) < r) { if (t === bu) { b.stats.bsTag++; if (!H.kind) b.stats.bsTagP = (b.stats.bsTagP || 0) + 1; return BB.endPlay(b, D, 'T', H.def.name); } BB.runnerOut(b, D, t, H); if (D.phase !== 'live') return; }
        }
        if (!H.kind) { // 투수: 이동은 평소대로(무작위). 타자가 멀면 타자에 가까운 수비수에게 송구
          H.bsPassCd = (H.bsPassCd || 0) - dt;
          const TT = BB.targets(b, D), t = BB.pickChase(H, TT);
          if (t && H.bsPassCd <= 0 && !H.blocked('blocksAct')) { const d0 = hyp(H.x - t.x, H.y - t.y); if (d0 > D.S.keepR) { const L = BB.leadPass(D, H, TT, 0); if (L && L.gap < L.hold - 50) BB.throwTo(b, D, H, L.f, L.q); else H.bsPassCd = 0.3; } }
        }
      }
      // 타자: 베이스를 밟으면 안타 (1·2·3루 어디든)
      if (bu && !bu.dead && !bu.airborne && !bu.hidden && B.st !== 'hrfly') for (let k = 1; k <= 3; k++) if (hyp(bu.x - BASES[k].x, bu.y - BASES[k].y) < D.S.baseR + bu.pad) return BB.endPlay(b, D, 'H', k);
      BB.fieldAI(b, D, dt);
      BB.runAI(b, D, dt);
    },
    pickChase(o, L) { let best = null, bd = 1e9; for (const t of L) { const d = hyp(o.x - t.x, o.y - t.y) - 1.2 * threat(t); if (d < bd) { bd = d; best = t; } } return best; }, // 가까움 + 실점 위험
    nearest(o, L) { let best = null, bd = 1e9; for (const t of L) { const d = hyp(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; best = t; } } return best; },
    // ---------- 예측 송구 (공이 도착할 때의 위치로 판단) ----------
    // 타자(캐릭터) 속도: 위치 변화로 추정 (부드럽게). 시뮬레이션 값이지만 야구장 전용
    trackVel(u, dt) {
      if (!u || dt <= 0) return; const V = u.bsV;
      if (!V) { u.bsV = { x: u.x, y: u.y, vx: 0, vy: 0 }; return; }
      let vx = (u.x - V.x) / dt, vy = (u.y - V.y) / dt; const m = hyp(vx, vy), cap = Math.max(120, (u.speed || 150) * 1.6);
      if (m > cap * 3) { vx = 0; vy = 0; } else if (m > cap) { vx *= cap / m; vy *= cap / m; } // 순간이동·넉백은 무시
      const a = 1 - Math.exp(-5 * dt); V.vx += (vx - V.vx) * a; V.vy += (vy - V.vy) * a; V.x = u.x; V.y = u.y;
    },
    // 대상 t 의 tau 초 뒤 위치. 주자: 가는 베이스까지 (먼저 도착하면 safe), 타자: 추정 속도로 최대 0.8초만큼
    predict(D, t, tau) {
      if (t.kind) {
        if (t.st === 'run' || t.st === 'back') {
          const P = BASES[t.st === 'run' ? t.to % 4 : t.base], d = hyp(P.x - t.x, P.y - t.y), go = npcSpd(D, t) * tau;
          if (go >= d - 4) return { x: P.x, y: P.y, safe: true };
          return { x: t.x + (P.x - t.x) / d * go, y: t.y + (P.y - t.y) / d * go };
        }
        return { x: t.x, y: t.y };
      }
      const V = t.bsV, k = Math.min(tau, 0.8); if (!V) return { x: t.x, y: t.y };
      return clampField(t.x + V.vx * k, t.y + V.vy * k, 0);
    },
    // 송구 받을 수비수 f 가 tau 초 안에 P 쪽으로 갈 수 있는 지점
    reachPt(D, f, P, tau) {
      const dx = P.x - f.x, dy = P.y - f.y, d = hyp(dx, dy), r = npcSpd(D, f) * Math.max(0, tau - 0.08) * 0.9, go = Math.min(r, Math.max(0, d - 16)); // 대상 몸에 막히지 않게 16px 앞에서 받음
      if (d < 1) return { x: f.x, y: f.y }; return { x: f.x + dx / d * go, y: f.y + dy / d * go };
    },
    // 가장 좋은 송구: 공이 도착할 때 대상(타자·주자)에 가장 가까이 있을 수비수와 그 지점.
    // hold = 공을 안 던지고 들고 있으면 같은 시간 뒤 대상과의 거리 (chase: 들고 쫓는 속도 배율, 투수는 0)
    leadPass(D, H, T, chase) {
      const q = BB.holderPos(H), thr = thrSpd(D); let best = null;
      for (const t of T) {
        for (const f of D.fielders) {
          if (f === H || f.stun > 0.2) continue;
          let tau = Math.max(0.12, hyp(f.x - q.x, f.y - q.y) / thr), P = BB.predict(D, t, tau), Q = BB.reachPt(D, f, P, tau);
          for (let i = 0; i < 3; i++) { tau = Math.max(0.12, hyp(Q.x - q.x, Q.y - q.y) / thr); P = BB.predict(D, t, tau); Q = BB.reachPt(D, f, P, tau); }
          if (P.safe) continue; // 공이 닿기 전에 베이스에 들어감
          const gap = hyp(Q.x - P.x, Q.y - P.y), cost = gap + tau * 25 - threat(t) * (gap < 30 ? 1 : 0.3); // 아웃 가능성이 높을수록 실점 위험 큰 주자 우선
          if (!best || cost < best.cost) {
            const hs = H.kind ? npcSpd(D, H) * chase : 0, hold = Math.max(0, hyp(P.x - H.x, P.y - H.y) - hs * tau);
            best = { f, q: Q, t, gap, tau, cost, hold };
          }
        }
      }
      return best;
    },
    runnerOut(b, D, r, H) {
      D.runners = D.runners.filter(o => o !== r); D.outs++; b.stats.bsRunOut++;
      b.text(r.x, r.y - 50, '아웃!', '#ff9a8a', 12); sys(b, `주자 ${r.def.name} 태그 아웃 (${D.outs}아웃)`); logPlay(b, D, 'runnerOut', { who: r.def.name });
      D.gone = D.gone || []; D.gone.push({ n: r, t: 0 });
      if (D.outs >= 3) BB.endPlay(b, D, '3O');
    },
    moveNpc(D, n, tx, ty, k, dt) {
      const dx = tx - n.x, dy = ty - n.y, d = hyp(dx, dy); if (d < 1.5) { n.moving = false; return true; }
      let ux = dx / d, uy = dy / d;
      // 자리를 지키는(서 있는·공 가진·송구 받는) 같은 팀 수비수는 밀지 않고 옆으로 돌아감
      if (n.kind === 'F' && d > 8) {
        const R0 = 9 * S0.npcK * 2 + 8; let sx = 0, sy = 0;
        for (const o of D.fielders) {
          if (o === n || o.moving) continue;
          const ox = o.x - n.x, oy = o.y - n.y, along = ox * ux + oy * uy; if (along <= 0 || along > Math.min(d, 46)) continue;
          const perp = ox * -uy + oy * ux; if (Math.abs(perp) >= R0) continue;
          const side = perp > 0 ? -1 : perp < 0 ? 1 : (n.id < o.id ? 1 : -1), w = (R0 - Math.abs(perp)) / R0 * (1 - along / 60);
          sx += -uy * side * w * 1.6; sy += ux * side * w * 1.6;
        }
        if (sx || sy) { ux += sx; uy += sy; const m = hyp(ux, uy) || 1; ux /= m; uy /= m; }
      }
      const st = Math.min(d, npcSpd(D, n) * k * dt); n.x += ux * st; n.y += uy * st; n.moving = true; n.walk += dt * 9;
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
          const t = BB.pickChase(H, T);
          if (t) {
            const d0 = hyp(H.x - t.x, H.y - t.y);
            if (d0 < D.S.keepR) BB.moveNpc(D, H, t.x, t.y, 0.62, dt);
            else { const L = H.passCd <= 0 ? BB.leadPass(D, H, T, 0.55) : null; if (L && L.gap < L.hold - 40) BB.throwTo(b, D, H, L.f, L.q); else { const P = BB.predict(D, t, 0.3); BB.moveNpc(D, H, P.x, P.y, 0.55, dt); } }
          } else BB.moveNpc(D, H, COVER[H.pos] ? COVER[H.pos][0] : FPOS[H.pos][0], COVER[H.pos] ? COVER[H.pos][1] : FPOS[H.pos][1], 0.6, dt);
        }
      }
      // 송구 받는 수비수: 공 도착 지점으로
      if (B.st === 'throw' && B.thr.to && B.thr.to.kind) { const R = B.thr.to; busy.add(R); if (R.stun <= 0) BB.moveNpc(D, R, B.thr.x1, B.thr.y1, 1, dt); }
      if (B.st === 'air' || B.st === 'hrfly') { // 타구 쫓기: 가장 빨리 닿는 2명 (홈런 타구: 넘어가는 펜스 쪽으로 쫓아감, 잡을 수는 없음)
        const L = B.st === 'hrfly' ? clampField(D.hr.x1, D.hr.y1, 0) : B.bounced ? { x: B.x + B.vx * 0.35, y: B.y + B.vy * 0.35 } : BB.landing(B);
        const ord = D.fielders.filter(n => !busy.has(n) && n.stun <= 0).map(n => [n, hyp(n.x - L.x, n.y - L.y) / npcSpd(D, n) + (n.pos === 'C' && hyp(L.x - S0.home.x, L.y - S0.home.y) > 140 ? 9 : 0)]).sort((a, c) => a[1] - c[1]);
        for (let i = 0; i < Math.min(2, ord.length); i++) { const n = ord[i][0]; busy.add(n); if (n.rt <= 0) BB.moveNpc(D, n, L.x, L.y, 1, dt); }
      } else if (H || B.st === 'throw') { // 마크: 대상마다 가장 가까운 수비수 1명이 다가가 송구 받을 준비
        for (const t of T.slice().sort((a, c) => threat(c) - threat(a)).slice(0, 2)) { // 대상의 0.5초 뒤 위치로 (지나간 자리 대신 앞질러 감)
          const P = BB.predict(D, t, 0.5);
          let best = null, bd = 1e9; for (const n of D.fielders) { if (busy.has(n) || n.stun > 0) continue; const d = hyp(n.x - P.x, n.y - P.y); if (d < bd) { bd = d; best = n; } }
          if (!best) continue; busy.add(best);
          const d = bd, k = d > 34 ? 0.8 : 0; if (k) BB.moveNpc(D, best, P.x - (P.x - best.x) / d * 26, P.y - (P.y - best.y) / d * 26, k, dt); else best.moving = false;
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
          const NB = BASES[nx % 4], tr = hyp(r.x - NB.x, r.y - NB.y) / sp, td = BB.defTime(D, nx % 4);
          // 공 상황 읽기: 깊은 타구(홈에서 멂)·다른 곳으로 가는 송구면 한 베이스 더 노림
          const deep = B.st !== 'held' && hyp(B.x - S0.home.x, B.y - S0.home.y) > 230 ? 0.22 : 0;
          const away = B.st === 'throw' && B.thr && hyp(B.thr.x1 - NB.x, B.thr.y1 - NB.y) > 120 ? 0.2 : 0;
          if (tr < td * r.aggr * (1 + deep + away)) { r.st = 'run'; r.to = nx; b.stats.bsAdv++; if (tr >= td * r.aggr) b.stats.bsXtra = (b.stats.bsXtra || 0) + 1; }
          continue;
        }
        if (r.st === 'run') {
          const P = BASES[r.to % 4], d = hyp(r.x - P.x, r.y - P.y), from = BASES[r.base], prog = 1 - d / S0.bd;
          if (prog < 0.45 && d / sp > BB.defTime(D, r.to % 4) * 1.15 * r.aggr) { r.st = 'back'; b.stats.bsBack++; continue; } // 위험 → 되돌아감
          const inc = B.st === 'throw' && B.thr && hyp(B.thr.x1 - P.x, B.thr.y1 - P.y) < 34 && (B.thr.dur - B.thr.t) + 0.1 < d / sp; // 다음 베이스로 공이 먼저 도착
          if (prog < 0.6 && inc && d / sp > (B.thr.dur - B.thr.t) * 1.25 * r.aggr) { r.st = 'back'; b.stats.bsBack++; continue; }
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
    placeRunner(b, D, k) { // k 루를 타자 팀에 줌 (자리에 있던 주자는 밀려서 진루, 홈이면 득점). 새 주자는 다음 플레이 볼 때 등장 (flushPend)
      BB.flushPend(b, D);
      const push = j => { const o = runnerAt(D, j); if (!o) return; if (j >= 3) { BB.score(b, D, o); return; } push(j + 1); o.base = j + 1; const s = baseSpot(j + 1); o.x = s.x; o.y = s.y; };
      push(k); if (b.over) return;
      D.pend = { k };
    },
    flushPend(b, D) { // 비워 둔 베이스에 주자 세우기 (플레이 볼 순간)
      const P = D.pend; if (!P) return; D.pend = null;
      const def = nextRunnerDef(D), s = baseSpot(P.k), r = mkNpc(D, def, D.bat, 'R', 'R', s.x, s.y); r.base = P.k; r.st = 'on'; r.bornT = D.clock; D.runners.push(r);
      b.ring(s.x, s.y - 2, 3, 20, 0.35, TEAM_COL[D.bat]);
    },
    endPlay(b, D, kind, arg) {
      if (b.over || D.phase === 'after') return;
      BB.flushPend(b, D); // (선수 이탈로 플레이 볼 없이 끝난 경우) 남은 주자부터 세움
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
        D.swap = false; D.outs = 0; D.runners = []; D.pend = null; D.hr = null; D.bat = 1 - D.bat; b.stats.bsHalf++;
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
      // 같은 팀끼리: 자리를 지키는 쪽(공 가진·송구 받는 > 서 있는 > 움직이는)은 밀리지 않고 움직이는 쪽만 비켜남
      const B = D.ball, hold = B && B.st === 'held' ? B.holder : null, recv = B && B.st === 'throw' && B.thr ? B.thr.to : null;
      const pri = n => n === hold || n === recv ? 2 : n.moving ? 0 : 1;
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { // 서로 겹치지 않게
        const a = all[i], c = all[j], dx = c.x - a.x, dy = c.y - a.y, d = hyp(dx, dy), R = pad * 2;
        if (d >= R || d < 1e-3) continue; const ov = R - d, nx = dx / d, ny = dy / d;
        let ka = 0.5, kc = 0.5; if (a.kind === c.kind && a.team === c.team) { const pa = pri(a), pc = pri(c); if (pa > pc) { ka = 0; kc = 1; } else if (pc > pa) { ka = 1; kc = 0; } }
        a.x -= nx * ov * ka; a.y -= ny * ov * ka; c.x += nx * ov * kc; c.y += ny * ov * kc;
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
      const sh = 768, sw = sh * AR.w / AR.h;
      x.save(); x.imageSmoothingEnabled = true; x.drawImage(f, S0.home.x - sw / 2, S0.home.y - 641, sw, sh, AR.x, AR.y, AR.w, AR.h); x.restore();
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
    // 그리기 전용: 타석에서 자기 근접 무기를 들고 있는 타자 → game.js 가 평소 무기(라인하르트 해머)를 따로 안 그림
    holdsWeapon(b, u) { const D = b.bsb; return !!(D && D.on && b.cam && u === (D.batU || role(b, D.bat)) && batting(b, D, u) && heldWeapon(u)); },
    drawOver(ctx, b) {
      const D = b.bsb; if (!D || !D.on || !b.cam) return;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      const bu = D.batU || role(b, D.bat);
      if (batting(b, D, bu)) drawBat(ctx, b, D, bu); // 타석의 방망이 (근접 무기가 있으면 그 무기)
      const B = D.ball;
      if (D.hr) drawHR(ctx, b, D);
      if (B && B.st !== 'dead' && B.st !== 'gone' && B.st !== 'hrfly') {
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
    x.save(); x.beginPath(); x.moveTo(H.x, H.y); x.lineTo(H.x - 1300, H.y - 1300); x.lineTo(H.x + 1300, H.y - 1300); x.closePath(); x.clip();
    for (let j = 0, k = 0; j < Hd; j += 22, k++) { x.fillStyle = k % 2 ? '#43964a' : '#3d8c44'; x.fillRect(0, j, Wd, 22); }
    for (let i = 0; i < 700; i++) { x.fillStyle = i % 3 ? 'rgba(0,40,0,0.16)' : 'rgba(210,255,190,0.10)'; x.fillRect((i * 67) % Wd, (i * 139) % Hd, 1, 2); }
    x.restore();
    // 경고 트랙 (펜스 안쪽 흙길)
    x.strokeStyle = '#a8794a'; x.lineWidth = 14; x.beginPath(); x.arc(F.cx, F.cy, F.r - 3, 0, TAU); x.stroke();
    // 내야 흙
    x.fillStyle = '#b8834e'; x.beginPath(); x.moveTo(H.x, H.y + 6); x.arc(M.x, M.y + 10, 172, -Math.PI / 4 - Math.PI / 2 - 0.62, -Math.PI / 4 + 0.62); x.closePath(); x.fill();
    const g = 13, B = BASES; x.fillStyle = '#43964a';
    x.beginPath(); x.moveTo(B[0].x, B[0].y - g * 1.4); x.lineTo(B[1].x - g * 1.4, B[1].y); x.lineTo(B[2].x, B[2].y + g * 1.4); x.lineTo(B[3].x + g * 1.4, B[3].y); x.closePath(); x.fill();
    x.fillStyle = 'rgba(0,40,0,0.10)'; for (let i = 0; i < 260; i++) x.fillRect(B[3].x + 24 + (i * 37) % 228, B[2].y + 24 + (i * 53) % 216, 1, 2);
    x.fillStyle = '#b8834e'; for (const p of B) { x.beginPath(); x.arc(p.x, p.y, p === B[0] ? 32 : 22, 0, TAU); x.fill(); }
    x.beginPath(); x.arc(M.x, M.y, 17, 0, TAU); x.fill(); x.fillStyle = '#c8935e'; x.beginPath(); x.arc(M.x, M.y, 12, 0, TAU); x.fill();
    x.fillStyle = '#ffffff'; x.fillRect(M.x - 5, M.y - 1, 10, 2); // 투수판
    x.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 640; i++) x.fillRect(B[3].x - 70 + (i * 41) % 420, B[2].y - 50 + (i * 61) % 400, 1, 1);
    // 파울 라인
    x.strokeStyle = 'rgba(255,255,255,0.92)'; x.lineWidth = 2;
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(H.x + s * 4, H.y - 4); x.lineTo(H.x + s * 900, H.y - 900); x.stroke(); }
    // 베이스 라인 1루 → 2루 → 3루 (홈~1루·3루는 파울 라인이 겸함). 구장 그림에 그려서 카메라·미니맵·썸네일 어디서나 같이 보임
    x.beginPath(); x.moveTo(B[1].x, B[1].y); x.lineTo(B[2].x, B[2].y); x.lineTo(B[3].x, B[3].y); x.stroke();
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
  // 홈런 연출 (그리기 전용): 히트 스톱 중 공 번쩍임 · 투수 머리 위 '!' · 불꽃 꼬리를 끌며 날아가는 타구 · 펜스 너머로 사라짐
  function drawHR(ctx, b, D) {
    const R = D.hr, B = D.ball, T = D.clock - R.t0;
    const pu = D.pitU; // 투수 머리 위 느낌표 (타격 순간부터 1.8초)
    if (pu && !pu.dead && !pu.hidden && T < 1.8) {
      const pop = 1.4 * (T < 0.14 ? 0.4 + 0.6 * easeOut(T / 0.14) * 1.15 : 1), fade = T > 1.5 ? Math.max(0, (1.8 - T) / 0.3) : 1;
      const hx = Math.round(pu.x), hy = Math.round(pu.y - 66 - pu.pad * 2 - 4 * Math.abs(Math.sin(T * 14)) * (T < 0.5 ? 1 : 0));
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(hx, hy); ctx.scale(pop, pop);
      ctx.fillStyle = '#16141e'; ctx.fillRect(-6, -11, 12, 19); ctx.fillRect(-2, 8, 5, 3); // 말풍선 (외곽)
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-5, -10, 10, 17); ctx.fillRect(-1, 7, 3, 2);
      ctx.fillStyle = '#e8302e'; ctx.fillRect(-1.5, -8, 3, 9); ctx.fillRect(-1.5, 3, 3, 3); // !
      ctx.fillStyle = '#ff8a7a'; ctx.fillRect(-1.5, -8, 1, 9);
      ctx.restore();
    }
    if (B && B.st === 'hrstop') { // 히트 스톱: 맞은 공이 번쩍
      const y = B.y - B.z, p = 0.5 + 0.5 * Math.sin(T * 40);
      ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * p; ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.arc(B.x, y, 7 + 3 * p, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2, r0 = 9, r1 = 15 + 4 * p; ctx.beginPath(); ctx.moveTo(B.x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(B.x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke(); }
      ctx.restore(); drawBall(ctx, B.x, y, 1.3); return;
    }
    let k, fade = 1;
    if (B && B.st === 'hrfly') k = R.k;
    else if (R.outT >= 0 && D.clock - R.outT < 0.5) { const t = D.clock - R.outT; k = 1 + t / R.dur; fade = 1 - t / 0.5; }
    else return;
    ctx.save();
    const N = 10, step = 0.03; // 불꽃 꼬리: 같은 궤적의 지난 지점들
    for (let i = N; i >= 1; i--) {
      const kk = Math.max(0, k - i * step), q = hrPos(R, kk), q2 = hrPos(R, Math.max(0, kk + step)), f = 1 - i / (N + 1);
      ctx.globalAlpha = fade * (0.25 + 0.6 * f); ctx.lineCap = 'round';
      ctx.strokeStyle = i > N * 0.6 ? '#c8402a' : i > N * 0.3 ? '#ff9a2e' : '#ffe27a'; ctx.lineWidth = 2 + 7 * f;
      ctx.beginPath(); ctx.moveTo(q.x, q.y - q.z); ctx.lineTo(q2.x, q2.y - q2.z); ctx.stroke();
    }
    const q = hrPos(R, k), y = q.y - q.z, a = Math.atan2((q.y - q.z) - (hrPos(R, Math.max(0, k - step)).y - hrPos(R, Math.max(0, k - step)).z), q.x - hrPos(R, Math.max(0, k - step)).x);
    ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; // 속도선
    for (let i = -1; i <= 1; i++) { const ox = -Math.sin(a) * i * 6, oy = Math.cos(a) * i * 6, L = 14 + 6 * (1 - Math.abs(i)); ctx.beginPath(); ctx.moveTo(q.x + ox - Math.cos(a) * 6, y + oy - Math.sin(a) * 6); ctx.lineTo(q.x + ox - Math.cos(a) * (6 + L), y + oy - Math.sin(a) * (6 + L)); ctx.stroke(); }
    ctx.globalAlpha = fade * (0.55 + 0.25 * Math.sin(D.clock * 50)); ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.arc(q.x, y, 6.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = fade; drawBall(ctx, q.x, y, 1.6 + Math.min(0.8, q.z / 90));
    ctx.restore();
  }
  const batting = (b, D, u) => !!(u && !u.dead && !u.hidden && D.phase !== 'live' && D.phase !== 'after');
  const heldWeapon = u => (typeof Render !== 'undefined' && Render.heldWeapon ? Render.heldWeapon(u) : null);
  // 타석: 근접 무기 스프라이트가 있는 캐릭터는 그 무기, 없으면 야구 방망이. 같은 자세·같은 스윙 (그리기 전용)
  // 아래 → 위 올려치기: 준비 = 무기가 아래로, 스윙하면 홈 쪽을 지나 어깨 위로. 오른쪽 타석(side -1)은 좌우 거울
  //  헛스윙·파울 뒤 'pause' 동안은 D.pt 로 끝까지 휘두름 (그리기 전용, 시뮬 상태 안 바꿈). 몸으로 치는 캐릭터(다리·주먹)는 휘두를 때만 보임
  const SW0 = 1.75, SWA = 3.6;
  // 홈런 시네마틱 바 (그리기 전용): 히트 스톱 동안 화면 맨 위·맨 아래부터 검은 띠가 밀려 들어와 타자·공 주변의 좁은 띠만 남김.
  //  0.14초 동안 들어오고, 타구 발사 후 0.3초 동안 빠져나감. 화면 표시는 main.js 의 DOM 띠(#cineT/#cineB, HUD·하단 UI 위), 녹화는 drawCineCanvas
  //  cine(b) → { k: 0~1, y0, y1 } (캔버스 논리 좌표의 남는 띠 위·아래) 또는 null
  const CINE = { half: 40, inT: 0.14, outT: 0.3 }; // half: 남는 띠 절반 높이 (월드 px, 카메라 배율 곱함) — 타자 손(공 맞는 높이) 중심
  function cine(b) {
    const D = b && b.bsb, R = D && D.on && D.hr, C = b && b.cam; if (!R || !C) return null;
    const T = D.clock - R.t0, stop = D.S.t.hrStop;
    const k = T < stop ? easeOut(clamp(T / CINE.inT, 0, 1)) : 1 - clamp((T - stop) / CINE.outT, 0, 1) ** 2;
    if (k <= 0) return null;
    const u = D.batU, wy = u ? u.y - 20 : S0.home.y - 20, cy = (wy - C.y) * C.k, h = CINE.half * C.k;
    return { k, y0: cy - h, y1: cy + h };
  }
  function drawCineCanvas(x, b, H, off) { // 녹화용: 논리 좌표 캔버스(높이 H)에 직접 그림. off = 캔버스 y 오프셋
    const c = cine(b); if (!c) return;
    const t = Math.round(c.k * Math.max(0, c.y0 + off)), bo = Math.round(c.k * Math.max(0, H - (c.y1 + off)));
    x.fillStyle = '#000000'; x.fillRect(0, 0, W, t); x.fillRect(0, H - bo, W, bo);
    x.fillStyle = 'rgba(255,226,122,0.55)'; if (t > 1) x.fillRect(0, t - 1, W, 1); if (bo > 1) x.fillRect(0, H - bo, W, 1);
  }
  function drawBat(ctx, b, D, u) {
    const p = D.pitch, side = D.side || 1;
    const el = p && p.swingT >= 0 ? p.t - p.swingT + (D.phase === 'pause' ? D.pt : 0) : -1, sw = el >= 0 ? clamp(el / 0.16, 0, 1) : 0, swinging = sw > 0 && sw < 1;
    const H = heldWeapon(u); if (H && H.body && !swinging) return;
    const hx = u.x + side * (H ? H.dx : 7), hy = u.y + (H ? H.dy : -22), a = SW0 - sw * SWA;
    ctx.save(); ctx.translate(Math.round(hx), Math.round(hy)); ctx.scale(side, 1);
    if (H) Render.drawHeldWeapon(ctx, u, b, H, 0, 0, a, swinging);
    else {
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = '#3a2414'; ctx.fillRect(-1, -1.5, 22, 4); ctx.fillStyle = '#c8955a'; ctx.fillRect(0, -1, 9, 2); ctx.fillRect(9, -1.5, 12, 3); ctx.fillStyle = '#e8c08a'; ctx.fillRect(10, -1.5, 10, 1);
      ctx.restore();
    }
    if (swinging) { ctx.globalAlpha = 0.35 * (1 - sw); ctx.strokeStyle = H ? H.trail : '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, H ? Math.max(18, H.len * 0.85) : 18, a, SW0); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.restore();
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
  const PITCHING = new Set(['setup', 'pitch', 'pause', 'hrstop']);
  // 포수: 플레이 볼(투구) 동안 홈 뒤에서 투수 쪽을 봄 → 뒷모습
  const catcherBack = (D, n) => n.kind === 'F' && n.pos === 'C' && PITCHING.has(D.phase) && hyp(n.x - FPOS.C[0], n.y - FPOS.C[1]) < 40;
  // 받기 편한 뜬공 점프 (그리기 전용): 공 아래 자리 잡은 수비수가 가끔(투구·수비수별 해시 50%) 포구 직전 점프 → 포구 시도 뒤 착지
  const JUMP_H = 15, JUMP_UP = 0.28, JUMP_DN = 0.3, JUMP_NEAR = 14;
  function jumpLift(b, D, n) {
    if (n.kind !== 'F' || !D.ball || vhash(b.stats.bsPitch, n.id) >= 0.5) return 0;
    const B = D.ball, J = D.jmp;
    if (J && J.id === n.id && J.typ === 'fly' && J.d < JUMP_NEAR) { const t = D.clock - J.t0; return t < JUMP_DN ? JUMP_H * (1 - (t / JUMP_DN) * (t / JUMP_DN)) : 0; }
    if (D.phase !== 'live' || B.st !== 'air' || B.bounced || B.typ !== 'fly' || B.z <= 34 || (B.tried && B.tried.includes(n.id))) return 0;
    const tc = (B.vz + Math.sqrt(Math.max(0, B.vz * B.vz + 1400 * (B.z - 34)))) / 700; if (tc >= JUMP_UP) return 0;
    if (hyp(n.x - (B.x + B.vx * tc), n.y - (B.y + B.vy * tc)) >= JUMP_NEAR) return 0;
    return JUMP_H * easeOut(1 - tc / JUMP_UP);
  }
  function drawNpc(ctx, b, D, n, gone) {
    const s0 = Sprites.get(n.def), back = (n.back || catcherBack(D, n)) && !!s0.back, s = back ? s0.back : s0, K = S0.npcK, col = TEAM_COL[n.team];
    let alpha = 1, oy = 0; if (gone) { alpha = Math.max(0, 1 - gone.t / 0.8); oy = gone.home ? -gone.t * 20 : 0; }
    if (!gone && n.bornT != null && D.clock - n.bornT < 0.3) { const p = (D.clock - n.bornT) / 0.3; alpha = p; oy = -6 * (1 - p); } // 플레이 볼: 주자 등장
    const jz = gone ? 0 : jumpLift(b, D, n);
    const bob = n.moving ? -Math.abs(Math.sin(n.walk)) * 1.5 : Math.sin(b.time * 3 + n.id) * 0.5;
    ctx.save(); ctx.globalAlpha = 0.3 * alpha; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(n.x, n.y + 1, 9 * K * (1 - jz / 40), 3 * (1 - jz / 40), 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.55 * alpha; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash && ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.ellipse(n.x, n.y + 1, 11 * K, 4, 0, 0, TAU); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
    ctx.globalAlpha = alpha; ctx.translate(Math.round(n.x), Math.round(n.y + bob + oy - jz));
    if (n.stun > 0) ctx.rotate(Math.sin(n.stun * 30) * 0.12);
    const jst = jz > 0 ? 1 + 0.06 * Math.min(1, jz / JUMP_H) : 1; // 점프: 살짝 늘어남
    ctx.scale(spriteSX(n.def, back, n.face) * K / jst, K * jst);
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
    for (let k = 1; k <= 3; k++) { const px = cx + (k === 1 ? 7 : k === 3 ? -7 : 0), py = cy - (k === 2 ? 7 : 0); ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4); ctx.fillStyle = runnerAt(D, k) || (D.pend && D.pend.k === k) ? '#ffe27a' : 'rgba(255,255,255,0.2)'; ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
  }
  function drawMini(ctx, b, D, x0, y0) { // 미니맵: 구장 + 공 + 선수
    const f = fieldCanvas(), sx = 118, sy = 176, sw = 643, sh = 864, k = 66 / sw, h = sh * k;
    ctx.fillStyle = 'rgba(14,16,24,0.82)'; ctx.fillRect(x0 - 1, y0 - 1, 68, h + 2);
    if (f) { ctx.imageSmoothingEnabled = true; ctx.drawImage(f, sx, sy, sw, sh, x0, y0, 66, h); ctx.imageSmoothingEnabled = false; }
    const P = (x, y) => [x0 + (x - sx) * k, y0 + (y - sy) * k];
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.beginPath(); // 다이아몬드 (축소 그림에선 선이 너무 얇아져 따로 그림)
    for (let i = 0; i <= 4; i++) { const [x, y] = P(BASES[i % 4].x, BASES[i % 4].y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
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
    let cx, cy, k, fast = false;
    const R = D.hr, hrCam = R && D.ball && (D.ball.st === 'hrfly' || (R.outT >= 0 && D.clock - R.outT < 0.9));
    if (hrCam) { // 홈런 타구: 공을 빠르게 따라가 펜스 너머로 사라지는 것까지 보여줌
      const q = D.ball.st === 'hrfly' ? hrPos(R, Math.min(1, R.k + 0.12)) : hrPos(R, 1);
      cx = q.x; cy = q.y - q.z * 0.5; k = 0.95; fast = true;
    } else if (D.phase === 'live' || D.halt || (D.phase === 'after' && b.cam && b.cam.live)) {
      const pts = []; for (const u of [D.batU, D.pitU]) if (u && !u.dead && !u.hidden) pts.push([u.x, u.y]);
      const B = D.ball; if (B && B.st !== 'dead' && B.st !== 'gone') { const H = B.st === 'held' && B.holder; pts.push(H ? [H.x, H.y] : [B.x, B.y - B.z * 0.5]); }
      if (!pts.length) pts.push([S0.mound.x, S0.mound.y]);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y - 40); y1 = Math.max(y1, y); }
      k = clamp(Math.min(V.w / (x1 - x0 + 150), V.h / (y1 - y0 + 150)), 0.5, 1.2); cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
    } else { // 투구: 다이아몬드 전체(2루~포수·대기 타석, 1루~3루)가 보이게 — 구장 확대(v6) 뒤 고정 배율 1.2로는 2루 쪽이 화면 밖이었음
      const top = BASES[2].y - 18, bot = SPOT.batSub.y + 10, wd = BASES[1].x - BASES[3].x + 40;
      cx = S0.home.x; cy = (top + bot) / 2; k = clamp(Math.min(V.w / wd, V.h / (bot - top)), 0.9, 1.2);
    }
    const hw = V.w / k / 2, hh = V.h / k / 2, Wd = S0.world.w, Hd = S0.world.h;
    cx = Wd > hw * 2 ? clamp(cx, hw, Wd - hw) : Wd / 2; cy = Hd > hh * 2 ? clamp(cy, hh, Hd - hh) : Hd / 2;
    const C = b.cam || (b.cam = { cx, cy, k }); const a = 1 - Math.exp(-(fast ? 7 : 4) * (dt || 0.016));
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
  window.BASEBALL = { BB, updateCam, jumpLift, BASES, SPOT, FPOS, S: S0, cine, drawCineCanvas };
})();
