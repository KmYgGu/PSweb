/* =========================================================
 * 스테이지 확장 7: 농구장 / 뱀꼬리 맵
 *  난수는 전부 Math.random / rand (전투 중 리플레이 시드 난수로 교체됨)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2, FONT = '"Galmuri11", "Malgun Gothic", sans-serif';
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const steer = (u, ang, rate, dt) => { const d = Math.atan2(Math.sin(ang - u.dir), Math.cos(ang - u.dir)); u.dir = fixAngle(u.dir + clamp(d, -rate * dt, rate * dt)); };
  const canSteer = u => !u.dead && !u.action && !u.airborne && !u.push && !u.pull && !u.ghostChain && !u.climb && !u.blocked('blocksMove') && !u.blocked('blocksAct');
  const mains = b => b.u.filter(u => !u.summon);
  const teamName = (b, t) => { const m = mains(b).filter(o => o.team === t); return m.length > 1 ? m.map(o => o.def.name).join(' & ') : (m[0] || b.u.find(o => o.team === t)).def.name; };

  // ---------------- 스테이지 정의 ----------------
  STAGE_DEFS.basket = {
    name: '농구장', desc: '골대는 하나! 공을 잡으면 드리블, 일반 공격(충돌)으로 뺏기. 슛 포인트에 가면 점프 슛 — 골대에 가까울수록·오래 드리블할수록 잘 들어감. 먼 거리는 고득점. 6점 선취 승리 (체력 0도 패배).', theme: 'basket',
    // hoop: 골대 링 위치(바닥 기준), point: 슛 포인트 { r, first, gap(슛 후 다음), life(미사용 시 이동) }
    // dunk: 공을 잡거나 뺏은 뒤 벽에 안 튕기고 골대(반경 r + 몸 크기)에 닿으면 덩크 (2점, 확률 = 거리 d 의 2점 슛과 같은 식 + 드리블 보너스), 점프 dur 초·높이 h, fly 초 뒤 판정
    // bands: 거리별 점수 [최대거리, 점수], prob: 성공 확률 = clamp(base − dist×perPx, min, max) + min(dribbleMax, 드리블 초×perSec), 최종 상한 cap
    basket: { hoop: { x: 180, y: 160 }, win: 6, point: { r: 20, first: 1.5, gap: 1.5, life: 9 }, bands: [[120, 1], [210, 2], [1e9, 3]],
      prob: { base: 0.85, perPx: 0.0025, min: 0.15, max: 0.8, perSec: 0.06, dribbleMax: 0.3, cap: 0.95 },
      jump: { dur: 0.6, h: 22 }, fly: 0.7, dunk: { r: 12, d: 165, dur: 0.55, h: 34, fly: 0.4 }, stealGrace: 0.5, respawn: 1.2, ai: { point: 0.9, ball: 0.75, turn: 6, dur: [1.6, 3.2] } },
    spawns: [{ x: 110, y: 400 }, { x: 250, y: 400 }],
  };
  STAGE_DEFS.snake = {
    name: '뱀꼬리 맵', desc: '외곽 벽이 없어 반대편으로 이어짐! (돌진 중에만 외곽이 벽) 중앙 구역엔 움직이는 벽. 뱀먹이를 먹으면 나를 따라오는 분신(기본 공격만 따라 함)이 생기지만, 내 꼬리(분신)에 부딪히면 즉사!', theme: 'snake',
    // zone: 움직이는 벽의 이동 범위, wall: 벽 크기/속도, food: 먹이 { first, gap, max(동시), r }, tail: 분신 { gap(경로 간격 px), max(최대 수), grace(생성 후 무해 시간), mult(복사 기본 공격 배율), safe(머리 바로 뒤 무해 분신 수) }
    snake: { zones: [{ x: 110, y: 270, w: 140, h: 110, ww: 44, wh: 16 }, { x: 12, y: 136, w: 72, h: 66, ww: 30, wh: 12 }, { x: 276, y: 136, w: 72, h: 66, ww: 30, wh: 12 }, { x: 12, y: 462, w: 72, h: 66, ww: 30, wh: 12 }, { x: 276, y: 462, w: 72, h: 66, ww: 30, wh: 12 }], wall: { spd: 55 }, food: { first: 2.5, gap: 3.5, max: 2, r: 7 },
      tail: { gap: 26, max: 5, grace: 1.2, mult: 0.35, safe: 1, hitR: 9, steal: 1.0 } },
    spawns: [{ x: 110, y: 240 }, { x: 250, y: 420 }],
  };

  // ===================== 농구장 =====================
  // 직접 플레이 수동 슛 (b.bbMan, 기록된 입력 'bbman'·'bj'·'bs' 로만 바뀜 → 리플레이 그대로, 일반 시점 경기는 영향 없음)
  // inv: 슛 준비 뒤 가만히 있을 때 무적 시간, auto: 점프 안 하면 기존 자동 슛까지, jd/jh: 점프 시간·높이, apex: 정점 판정 폭(정점에서 벗어난 정도 e, 0~1), bonus: 정점 가까움 보정, cap: 상한
  const RZ = 64; // 직접 플레이 3D 링 높이 (그리기 전용)
  const MSHOT = { inv: 1.0, auto: 1.6, jd: 0.8, jh: 30, apex: 0.12, bonus: 0.35, cap: 0.95 };
  const BB = {
    match: st => !!st.basket,
    init(b) {
      const S = b.stage.basket; if (!S) return;
      b.bb = { S, ball: { x: 180, y: 330, vx: 0, vy: 0, z: 0, state: 'loose', holder: null, t: 0, fl: null }, score: [0, 0], point: null, nextT: S.point.first, ann: null, respawnT: 0 };
      b.u.forEach(u => { u.bbAI = { mode: 'free', t: rand(0.3, 1.0) }; });
      Object.assign(b.stats, { bbShots: 0, bbMade: 0, bbSteals: 0, bbDunks: 0, bbDunkMade: 0 });
    },
    give(b, u) { const B = b.bb.ball; B.state = 'held'; B.holder = u; B.t = 0; B.gotT = b.time; B.wb = u.wbnc || 0; }, // wb: 잡은 순간의 벽 튕김 수 (덩크: 그 뒤 벽에 안 튕겼는지)
    drop(b, x, y) { const B = b.bb.ball; B.state = 'loose'; B.holder = null; B.x = clamp(x, AR.x + 20, AR.x + AR.w - 20); B.y = clamp(y, AR.y + 34, AR.y + AR.h - 14); B.vx = rand(-60, 60); B.vy = rand(-60, 60); B.z = 10; },
    on(b, ev, u, e) { // 일반 공격(충돌 포함)으로 공 뺏기
      const D = b.bb; if (!D || ev !== 'attack' || b.over) return false;
      const B = D.ball; if (BB.inv(b, e)) return false; /* 슛 준비·슛 중 무적: 뺏기지 않음 */ if (B.state !== 'held' || B.holder !== e || !u || u.summon || u.team === e.team || u.dead) return false;
      if (b.time - B.gotT < D.S.stealGrace) return false;
      BB.give(b, u); b.stats.bbSteals++; b.text(u.x, u.y - 66, '스틸!', '#ffb46a', 11); b.ring(u.x, u.y - 10, 3, 18, 0.25, '#ffb46a');
      return false;
    },
    step(b, dt) {
      const D = b.bb; if (!D) return;
      const S = D.S, B = D.ball, H = S.hoop;
      if (D.ann) { D.ann.t += dt; if (D.ann.t > 1.6) D.ann = null; }
      if (D.foul) { D.foul.t += dt; if (D.foul.t > 1.6) D.foul = null; }
      if (b.over) return;
      // ---- 공 ----
      if (B.state === 'held') {
        const u = B.holder;
        if (!u || u.dead || u.hidden) BB.drop(b, u ? u.x : 180, u ? u.y : 330);
        else { B.t += dt; B.x = u.x + u.facing * 9; B.y = u.y + 1; B.z = Math.abs(Math.sin(b.time * 9)) * 10; }
      } else if (B.state === 'loose') {
        B.x += B.vx * dt; B.y += B.vy * dt; const f = Math.exp(-2.5 * dt); B.vx *= f; B.vy *= f; B.z = Math.max(0, B.z - 40 * dt);
        if (B.x < AR.x + 16 || B.x > AR.x + AR.w - 16) B.vx *= -1; if (B.y < AR.y + 30 || B.y > AR.y + AR.h - 10) B.vy *= -1;
        B.x = clamp(B.x, AR.x + 16, AR.x + AR.w - 16); B.y = clamp(B.y, AR.y + 30, AR.y + AR.h - 10);
        const got = mains(b).find(u => !u.dead && !u.hidden && !u.airborne && Math.hypot(u.x - B.x, u.y - B.y) < 12 + u.pad);
        if (got) { BB.give(b, got); b.text(got.x, got.y - 62, '공 잡음!', '#ffd08a', 9); }
      } else if (B.state === 'flight') {
        const F = B.fl; F.t += dt; const k = Math.min(1, F.t / (F.dunk ? S.dunk.fly : S.fly));
        B.x = F.x0 + (H.x - F.x0) * k; B.y = F.y0 + (H.y - F.y0) * k; B.z = F.dunk ? F.z0 + (24 - F.z0) * k + Math.sin(Math.PI * Math.min(1, k * 1.4)) * 18 : F.z0 + (24 - F.z0) * k + Math.sin(Math.PI * k) * (40 + F.d * 0.15); // 덩크: 링 위로 올렸다가 내리꽂음
        if (k >= 1) BB.resolve(b);
      } else if (B.state === 'dead') { D.respawnT -= dt; B.z = Math.max(0, B.z - 60 * dt); if (D.respawnT <= 0) { BB.drop(b, rand(120, 240), rand(300, 400)); B.z = 40; } }
      // ---- 덩크: 잡거나 뺏은 뒤 벽에 한 번도 안 튕기고 골대에 닿음 ----
      if (b.bbMan && D.man) BB.manStep(b, D, dt);
      if (B.state === 'held' && !(D.sh && D.sh.u === B.holder)) { const u = B.holder; if (!u.airborne && !u.blocked('blocksAct') && (u.wbnc || 0) === B.wb && Math.hypot(u.x - H.x, u.y - H.y) < S.dunk.r + u.pad) BB.dunk(b, u); }
      // ---- 슛 포인트 ----
      if (!D.point) { D.nextT -= dt; if (D.nextT <= 0) BB.spawnPoint(b); }
      else {
        const P = D.point; P.t += dt;
        if (P.t > S.point.life && B.state !== 'flight' && !D.sh) { D.point = null; D.nextT = 0.3; }
        else if (B.state === 'held' && !D.sh) { const u = B.holder; if (!u.airborne && !u.blocked('blocksAct') && Math.hypot(u.x - P.x, (u.y - P.y) / 0.75) < P.r + u.pad + 4) { if (b.bbMan && u === D.man) BB.manReady(b, D, u); else BB.shoot(b, u); } }
      }
      // ---- AI: 공/포인트 노리기 (그 외엔 원래대로 싸움) ----
      for (const u of mains(b)) {
        const A = u.bbAI; if (!A || u.dead) continue;
        A.t -= dt;
        if (A.t <= 0) { const hold = B.state === 'held' && B.holder === u; A.mode = hold ? (Math.random() < S.ai.point ? 'point' : 'free') : B.state === 'loose' ? (Math.random() < S.ai.ball ? 'ball' : 'free') : 'free'; A.t = rand(S.ai.dur[0], S.ai.dur[1]); }
        if (!canSteer(u)) continue;
        if (A.mode === 'point' && B.holder === u && D.point) steer(u, Math.atan2(D.point.y - u.y, D.point.x - u.x), S.ai.turn, dt);
        else if (A.mode === 'ball' && B.state === 'loose') steer(u, Math.atan2(B.y - u.y, B.x - u.x), S.ai.turn, dt);
      }
    },
    // ---- 직접 플레이 수동 슛 ----
    act(b, u, kind, val) {
      const D = b.bb; if (!D) return null;
      if (kind === 'bbman') { b.bbMan = true; D.man = u; return true; }
      const sh = D.sh; if (b.over || !sh || sh.u !== u) return false;
      if (kind === 'bj') { if (sh.st !== 'ready' || u.air || u.airborne) return false; u.action = null; u.air = { t: 0, dur: MSHOT.jd, h: MSHOT.jh, bb: true, noLand: true }; sh.st = 'air'; sh.ja = 0; return true; } // 점프
      if (kind === 'bs') { if (sh.st !== 'air' || !u.air) return false; BB.manShoot(b, D, u, sh); return true; } // 공중에서 슛
      return false;
    },
    inv(b, u) { const D = b.bb, sh = D && D.sh; return !!(sh && sh.u === u && (sh.st !== 'ready' || sh.t < MSHOT.inv)); },
    preDamage(b, src, tgt) { if (b.bb && b.bbMan && BB.inv(b, tgt) && src !== tgt) return true; },
    manReady(b, D, u) { u.action = null; D.sh = { st: 'ready', t: 0, u, P: D.point, x: u.x, y: u.y }; b.text(u.x, u.y - 66, '슛 준비! (무적)', '#9ff0ff', 10); },
    manStep(b, D, dt) {
      const sh = D.sh; if (!sh) return; const B = D.ball, u = sh.u; sh.t += dt;
      if (sh.st === 'shot') { if (B.state !== 'flight' || B.fl !== sh.fl) D.sh = null; else if (u.air) { u.x = sh.x; u.y = sh.y; } return; } // 슛이 끝날 때까지 무적
      if (B.state !== 'held' || B.holder !== u || u.dead) { D.sh = null; return; }
      u.x = sh.x; u.y = sh.y; // 슛 자세: 제자리
      if (sh.st === 'ready' && sh.t >= MSHOT.auto) { D.sh = null; BB.shoot(b, u); return; } // 점프 안 함 → 기존 자동 슛
      if (sh.st === 'air' && !u.air) { // 점프만 하고 착지 = 트래블링 → 공격권 상대에게
        D.sh = null; const o = mains(b).filter(e => e.team !== u.team && !e.dead && !e.hidden).sort((a, c) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(c.x - u.x, c.y - u.y))[0];
        if (o) BB.give(b, o); else BB.drop(b, u.x, u.y);
        D.foul = { t: 0, who: u.def.name, team: u.team }; b.text(u.x, u.y - 70, '트래블링!', '#ff6a5a', 12); sys(b, `${u.def.name} 트래블링! 공격권이 넘어감`);
      }
    },
    manShoot(b, D, u, sh) { // 정점 가까움 e (0 = 정점, 1 = 뛰는 순간·착지): e ≤ apex 면 무조건 성공, 아니면 기존 확률 + bonus×(1−e)² (상한 cap)
      const S = D.S, B = D.ball, P = sh.P, e = Math.min(1, Math.abs(u.air.t / u.air.dur - 0.5) * 2), p0 = BB.chance(b, P, B.t);
      const sure = e <= MSHOT.apex, p = sure ? 1 : Math.min(MSHOT.cap, p0 + MSHOT.bonus * (1 - e) * (1 - e)), r = Math.random();
      B.state = 'flight'; B.holder = null; B.fl = { x0: u.x, y0: u.y, z0: 30 + b.airZ(u), t: 0, d: P.d, p, pts: P.pts, who: u, made: r < p, man: true };
      b.stats.bbShots++; if (D.point === P) D.point = null; D.nextT = S.point.gap + S.fly; sh.st = 'shot'; sh.fl = B.fl;
      b.text(u.x, u.y - 74, sure ? `정점 슛! (${P.pts}점·100%)` : `슛! (${P.pts}점·${Math.round(p * 100)}%)`, sure ? '#9ff0ff' : '#ffe08a', sure ? 11 : 10);
    },
    spawnPoint(b) {
      const D = b.bb, S = D.S; let x, y, n = 0;
      do { x = rand(AR.x + 30, AR.x + AR.w - 30); y = rand(AR.y + 60, AR.y + AR.h - 30); n++; } while (n < 20 && b.u.some(u => Math.hypot(u.x - x, u.y - y) < 50));
      const d = Math.hypot(x - S.hoop.x, y - S.hoop.y), pts = S.bands.find(q => d < q[0])[1];
      D.point = { x, y, r: S.point.r, t: 0, d, pts };
      b.shock(x, y, 3, S.point.r + 8, '#ffe08a', 0.4, 2);
    },
    chance(b, P, dribble) { const R = b.bb.S.prob; return Math.min(R.cap, clamp(R.base - P.d * R.perPx, R.min, R.max) + Math.min(R.dribbleMax, dribble * R.perSec)); },
    shoot(b, u) {
      const D = b.bb, S = D.S, B = D.ball, P = D.point;
      const p = BB.chance(b, P, B.t);
      u.action = null; u.air = { t: 0, dur: S.jump.dur, h: S.jump.h, ride: true, bb: true }; // 점프 슛: 공중 상태
      B.state = 'flight'; B.holder = null; B.fl = { x0: u.x, y0: u.y, z0: 30, t: 0, d: P.d, p, pts: P.pts, who: u, made: Math.random() < p };
      b.stats.bbShots++; D.point = null; D.nextT = S.point.gap + S.fly;
      b.text(u.x, u.y - 70, `슛! (${P.pts}점·${Math.round(p * 100)}%)`, '#ffe08a', 10);
    },
    dunk(b, u) { // 2점, 확률은 거리 dunk.d 2점 슛과 같은 식 (난수는 성공 판정 1번만, 슛과 같음)
      const D = b.bb, S = D.S, B = D.ball, p = BB.chance(b, { d: S.dunk.d }, B.t);
      u.action = null; u.air = { t: 0, dur: S.dunk.dur, h: S.dunk.h, ride: true, bb: true }; // 링까지 점프
      B.state = 'flight'; B.holder = null; B.fl = { x0: u.x, y0: u.y, z0: 34, t: 0, d: 0, p, pts: 2, who: u, made: Math.random() < p, dunk: true };
      b.stats.bbShots++; b.stats.bbDunks++;
      b.text(u.x, u.y - 74, `덩크! (2점·${Math.round(p * 100)}%)`, '#ff9a5a', 11); b.ring(u.x, u.y - 20, 3, 22, 0.3, '#ffb46a');
    },
    resolve(b) {
      const D = b.bb, S = D.S, B = D.ball, F = B.fl, u = F.who;
      if (F.made) {
        D.score[u.team] += F.pts; b.stats.bbMade++; if (F.dunk) { b.stats.bbDunkMade++; b.shake(4); b.shock(S.hoop.x, S.hoop.y - 24, 4, 34, '#ffb46a', 0.35, 3); }
        D.ann = { t: 0, made: true, pts: F.pts, team: u.team, who: u.def.name, dunk: !!F.dunk };
        sys(b, `${u.def.name} ${F.pts}점 ${F.dunk ? '덩크' : '슛'} 성공! (${D.score[0]} : ${D.score[1]})`);
        b.text(S.hoop.x, S.hoop.y - 50, `+${F.pts}`, '#ffe27a', 16); b.glow(S.hoop.x, S.hoop.y - 36, 40, '#ffe27a', 0.4);
        for (let i = 0; i < 16; i++) { const a = rand(0, TAU), s = rand(40, 120); b.parts.push({ x: S.hoop.x, y: S.hoop.y - 36, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 200, life: rand(0.5, 0.9), max: 0.9, color: ['#ffffff', TEAM_COL[u.team], '#ffe27a'][i % 3], size: 2 }); }
        B.state = 'dead'; B.x = S.hoop.x; B.y = S.hoop.y + 4; D.respawnT = S.respawn;
        if (D.score[u.team] >= S.win) BB.finish(b, u.team);
      } else {
        D.ann = { t: 0, made: false, team: u.team, who: u.def.name, dunk: !!F.dunk };
        b.text(S.hoop.x, S.hoop.y - 50, F.dunk ? '림에 맞고 튕김!' : '노골!', '#c8d0e0', 12);
        const a = rand(0.3, Math.PI - 0.3), r = rand(40, 90); BB.drop(b, S.hoop.x + Math.cos(a) * r, S.hoop.y + Math.sin(a) * r); B.z = 30; // 리바운드
      }
    },
    finish(b, team) {
      const D = b.bb, w = b.teamBest(team);
      b.over = true; b.winner = w; b.endType = 'goal';
      b.resultText = label => { const m = b.u.filter(o => o.team === team && !o.summon); return `${D.score[0]} : ${D.score[1]} ${m.map(label).join(' & ')} 승리! (${D.S.win}점 선취)`; };
      b.u.forEach(o => { if (!o.dead && !o.summon) b.say(o, o.team === team ? 'win' : 'lose'); });
      b.hitstop(0.2);
    },
    floor(x, st) {
      const S = st.basket; if (!S) return;
      x.fillStyle = '#b97a42'; x.fillRect(AR.x, AR.y, AR.w, AR.h);
      for (let i = 0; i < AR.w; i += 12) { x.fillStyle = (i / 12) % 2 ? '#c08248' : '#b4753e'; x.fillRect(AR.x + i, AR.y, 12, AR.h); x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(AR.x + i, AR.y, 1, AR.h); }
      for (let j = 0; j < 60; j++) { x.fillStyle = 'rgba(70,35,10,0.18)'; x.fillRect(AR.x + (j * 53) % AR.w, AR.y + (j * 97) % AR.h, 1, 6); }
      const H = S.hoop; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.5;
      x.strokeRect(AR.x + 6, AR.y + 14, AR.w - 12, AR.h - 20);
      x.fillStyle = 'rgba(200,60,50,0.35)'; x.fillRect(H.x - 30, H.y - 4, 60, 70); x.strokeRect(H.x - 30, H.y - 4, 60, 70);
      x.beginPath(); x.arc(H.x, H.y + 66, 26, 0, Math.PI); x.stroke();
      for (const [r, dash] of [[S.bands[0][0], [4, 3]], [S.bands[1][0], []]]) { x.setLineDash(dash); x.beginPath(); x.arc(H.x, H.y, r, 0.02, Math.PI - 0.02); x.stroke(); }
      x.setLineDash([]);
      x.beginPath(); x.arc(180, AR.y + AR.h - 6, 36, Math.PI, TAU); x.stroke();
      x.font = `bold 7px ${FONT}`; x.fillStyle = 'rgba(255,255,255,0.6)'; x.textAlign = 'center';
      x.fillText('1점', H.x, H.y + S.bands[0][0] - 6); x.fillText('2점', H.x, H.y + S.bands[1][0] - 6); x.fillText('3점', H.x, H.y + S.bands[1][0] + 12);
    },
    drawBall(ctx, x, y, z, r = 5) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y + 1, r, r * 0.45, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      const X = Math.round(x), Y = Math.round(y - r - z);
      ctx.fillStyle = '#3a1a08'; ctx.fillRect(X - r, Y - r + 1, r * 2, r * 2 - 2); ctx.fillRect(X - r + 1, Y - r, r * 2 - 2, r * 2);
      ctx.fillStyle = '#e8792a'; ctx.fillRect(X - r + 1, Y - r + 2, r * 2 - 2, r * 2 - 4); ctx.fillRect(X - r + 2, Y - r + 1, r * 2 - 4, r * 2 - 2);
      ctx.fillStyle = '#3a1a08'; ctx.fillRect(X - r + 1, Y, r * 2 - 2, 1); ctx.fillRect(X, Y - r + 1, 1, r * 2 - 2);
      ctx.fillStyle = '#ffb070'; ctx.fillRect(X - r + 2, Y - r + 2, 2, 1);
    },
    drawHoop(ctx, b, H) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(H.x, H.y + 2, 14, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a3f4e'; ctx.fillRect(H.x - 2, H.y - 22, 4, 24); // 기둥
      ctx.fillStyle = '#f4f4f8'; ctx.fillRect(H.x - 20, H.y - 44, 40, 20); ctx.fillStyle = '#2a2f3e'; ctx.fillRect(H.x - 20, H.y - 44, 40, 2); ctx.fillRect(H.x - 20, H.y - 26, 40, 2); ctx.fillRect(H.x - 20, H.y - 44, 2, 20); ctx.fillRect(H.x + 18, H.y - 44, 2, 20);
      ctx.strokeStyle = '#d23c2c'; ctx.lineWidth = 1.5; ctx.strokeRect(H.x - 7, H.y - 39, 14, 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; // 그물
      for (let i = -7; i <= 7; i += 3.5) { ctx.beginPath(); ctx.moveTo(H.x + i, H.y - 22); ctx.lineTo(H.x + i * 0.6, H.y - 11); ctx.stroke(); }
      ctx.fillStyle = '#f06a1e'; ctx.fillRect(H.x - 9, H.y - 24, 18, 3); // 링
    },
    // 직접 플레이 3D: 링 높이 RZ (2D 판정 높이 24 를 사람 키에 맞게 올려 그림), 공 높이는 날아가는 동안 RZ 쪽으로 보정 (그리기 전용)
    ball3(b) {
      const D = b.bb; if (!D) return null; const B = D.ball, S = D.S;
      if (B.state === 'held' && B.holder) return { x: B.x, y: B.y, z: 6 + B.z * 0.8, held: true, holder: B.holder };
      if (B.state === 'flight') { const F = B.fl, k = Math.min(1, F.t / (F.dunk ? S.dunk.fly : S.fly)); return { x: B.x, y: B.y, z: B.z + (RZ - 24) * k }; }
      if (B.state === 'dead') return { x: B.x, y: B.y, z: B.z * RZ / 24 };
      return { x: B.x, y: B.y, z: B.z };
    },
    draw3D(b, D, V) { // 골대: 기둥·팔·백보드(상자) + 링(높이 RZ 의 수평 고리) + 그물(세운 판), 슛 포인트 = 바닥
      const H = D.S.hoop, P = D.point, by = H.y - 9;
      if (P) V.floor(c => { const k = 0.6 + 0.4 * Math.sin(b.time * 6); c.globalAlpha = 0.25 + 0.25 * k; c.fillStyle = '#ffe08a'; c.beginPath(); c.ellipse(P.x, P.y, P.r, P.r * 0.75, 0, 0, TAU); c.fill();
        c.globalAlpha = 0.9; c.strokeStyle = '#fff4c0'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(P.x, P.y, P.r, P.r * 0.75, 0, 0, TAU); c.stroke(); c.font = `bold 8px ${FONT}`; c.textAlign = 'center'; c.fillStyle = '#fff4c0'; c.fillText(P.pts + '점', P.x, P.y + 3); });
      V.shadow(H.x, by - 4, 14, 0.3);
      V.box({ x0: H.x - 2, y0: by - 8, z0: 0, x1: H.x + 2, y1: by - 4, z1: RZ + 10, col: '#3a3f4e' }); // 기둥
      V.box({ x0: H.x - 1.5, y0: by - 4, z0: RZ + 6, x1: H.x + 1.5, y1: by - 1, z1: RZ + 9, col: '#3a3f4e' }); // 팔
      V.box({ x0: H.x - 20, y0: by - 1, z0: RZ - 4, x1: H.x + 20, y1: by, z1: RZ + 22, col: '#f4f4f8' }); // 백보드
      V.box({ x0: H.x - 7, y0: by, z0: RZ + 1, x1: H.x + 7, y1: by + 0.3, z1: RZ + 11, col: '#d23c2c' }); V.box({ x0: H.x - 5.5, y0: by + 0.3, z0: RZ + 2.5, x1: H.x + 5.5, y1: by + 0.6, z1: RZ + 9.5, col: '#f4f4f8' });
      V.flat({ x: H.x, y: H.y, z: RZ, r: 12, draw: c => { c.strokeStyle = '#f06a1e'; c.lineWidth = 2; c.beginPath(); c.arc(H.x, H.y, 8, 0, TAU); c.stroke(); } }); // 링
      V.stand({ x: H.x, y: H.y + 8, z: RZ - 14, w: 26, h: 16, draw: c => { c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1; for (let i = -7; i <= 7; i += 3.5) { c.beginPath(); c.moveTo(H.x + i, H.y + 8 - 14); c.lineTo(H.x + i * 0.6, H.y + 8 - 3); c.stroke(); } } }); // 그물
    },
    drawUnder(ctx, b, thumb) {
      const D = b.bb; if (!D) return;
      if (b._v3d && !thumb) { BB.draw3D(b, D, b._v3d); return; } // 직접 플레이: 공은 js/direct.js 가 3D 구로
      ctx.save();
      const P = D.point;
      if (P && !thumb) { const k = 0.6 + 0.4 * Math.sin(b.time * 6); ctx.globalAlpha = 0.25 + 0.25 * k; ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(P.x, P.y, P.r, P.r * 0.75, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff4c0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(P.x, P.y, P.r, P.r * 0.75, 0, 0, TAU); ctx.stroke();
        ctx.font = `bold 8px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff4c0'; ctx.fillText(P.pts + '점', P.x, P.y + 3); }
      ctx.globalAlpha = 1;
      BB.drawHoop(ctx, b, D.S.hoop);
      const B = D.ball; if (B.state === 'loose' || B.state === 'dead' || thumb) BB.drawBall(ctx, B.x, B.y, B.z);
      ctx.restore();
    },
    drawOver(ctx, b) { const D = b.bb; if (!D || b._v3d) return; const B = D.ball; if (B.state === 'held' || B.state === 'flight') { ctx.save(); BB.drawBall(ctx, B.x, B.y, B.z); ctx.restore(); } },
    drawTop(ctx, b) {
      const D = b.bb; if (!D) return;
      if (b._v3d) { b._v3d.hud(c => BB.drawTop(c, b)); return; } // 직접 플레이: 점수판·안내 = 화면 고정 HUD (그릴 때는 b._v3d 가 없어 아래 2D 경로)
      ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const x0 = AR.x + 6, y0 = AR.y + 3;
      ctx.fillStyle = 'rgba(14,16,24,0.78)'; ctx.fillRect(x0, y0, 62, 15);
      ctx.fillStyle = TEAM_COL[0]; ctx.fillRect(x0, y0, 3, 15); ctx.fillStyle = TEAM_COL[1]; ctx.fillRect(x0 + 59, y0, 3, 15);
      ctx.font = `bold 10px ${FONT}`;
      ctx.fillStyle = TEAM_COL[0]; ctx.fillText(String(D.score[0]), x0 + 16, y0 + 8.5);
      ctx.fillStyle = '#d8dce8'; ctx.fillText(':', x0 + 31, y0 + 8);
      ctx.fillStyle = TEAM_COL[1]; ctx.fillText(String(D.score[1]), x0 + 46, y0 + 8.5);
      ctx.font = `7px ${FONT}`; ctx.fillStyle = '#c8cede'; ctx.textAlign = 'left'; ctx.fillText(`${D.S.win}점 승리`, x0 + 2, y0 + 23);
      const A = D.ann;
      if (A) { const a = Math.min(1, A.t / 0.15) * Math.min(1, (1.6 - A.t) / 0.3); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = `bold 18px ${FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = '#0e1018';
        const t = A.dunk ? (A.made ? '덩크! +2' : '덩크 실패…') : A.made ? `${A.pts}점 슛!` : '노골…'; ctx.strokeText(t, 180, 260); ctx.fillStyle = A.made ? '#ffe27a' : '#c8d0e0'; ctx.fillText(t, 180, 260);
        ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = TEAM_COL[A.team]; ctx.fillText(`${A.who} · ${D.score[0]} : ${D.score[1]}`, 180, 278); }
      const Fo = D.foul; if (Fo) { ctx.globalAlpha = Math.min(1, Fo.t / 0.12) * Math.min(1, (1.6 - Fo.t) / 0.3); ctx.textAlign = 'center'; ctx.font = `bold 20px ${FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = '#0e1018'; ctx.strokeText('트래블링!', 180, 240); ctx.fillStyle = '#ff6a5a'; ctx.fillText('트래블링!', 180, 240);
        ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = '#e8eef8'; ctx.fillText(`${Fo.who} 점프 후 슛 안 함 → 공격권 넘어감`, 180, 258); ctx.globalAlpha = 1; }
      const sh = D.sh; if (sh && b.bbMan && sh.st !== 'shot') { // 수동 슛 안내 + 남은 시간 막대 / 점프 높이 막대 (정점 = 가운데 표시)
        const air = sh.st === 'air', y = 452; ctx.textAlign = 'center'; ctx.font = `bold 11px ${FONT}`; ctx.lineWidth = 3; ctx.strokeStyle = '#0e1018';
        const t = air ? '한 번 더 눌러 슛! (정점 = 100%)' : '클릭/탭: 점프 → 공중에서 한 번 더: 슛'; ctx.strokeText(t, 180, y); ctx.fillStyle = air ? '#9ff0ff' : '#ffe08a'; ctx.fillText(t, 180, y);
        ctx.fillStyle = 'rgba(14,16,24,0.75)'; ctx.fillRect(120, y + 8, 120, 7);
        if (air) { const u = sh.u, k = u.air ? u.air.t / u.air.dur : 1; ctx.fillStyle = 'rgba(159,240,255,0.45)'; ctx.fillRect(180 - 60 * MSHOT.apex, y + 8, 120 * MSHOT.apex, 7); ctx.fillStyle = '#ffffff'; ctx.fillRect(120 + 120 * k - 1, y + 6, 2, 11); }
        else { ctx.fillStyle = sh.t < MSHOT.inv ? '#9ff0ff' : '#ffb46a'; ctx.fillRect(121, y + 9, 118 * Math.max(0, 1 - sh.t / MSHOT.auto), 5); } }
      ctx.restore();
    },
  };

  // ===================== 뱀꼬리 맵 =====================
  const mod = (v, m) => ((v % m) + m) % m;
  const wrapX = x => AR.x + mod(x - AR.x, AR.w); // 여러 바퀴 돈 경로 좌표도 올바르게 (모듈로)
  const Y0 = AR.y + 16, YH = AR.h - 16; // 유닛 발 기준 세로 순환 범위
  const wrapY = y => Y0 + mod(y - Y0, YH);
  const tdist = (ax, ay, bx, by) => { let dx = Math.abs(ax - bx), dy = Math.abs(ay - by); dx = Math.min(dx, AR.w - dx); dy = Math.min(dy, YH - dy); return Math.hypot(dx, dy); };
  const SN = {
    match: st => !!st.snake,
    init(b) {
      const S = b.stage.snake; if (!S) return;
      const walls = S.zones.map(Z => { const w = { x: Z.x + Z.w / 2 - Z.ww / 2, y: Z.y + Z.h / 2 - Z.wh / 2, w: Z.ww, h: Z.wh, Z, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, cracks: [[], [], []], rubble: [], windows: [], solid: true, snWall: true, draw: SN.drawWall };
        const a = rand(0, TAU); w.vx = Math.cos(a) * S.wall.spd; w.vy = Math.sin(a) * S.wall.spd; b.buildings.push(w); return w; });
      b.sn = { S, walls, food: [], nextT: S.food.first };
      for (const u of b.u) SN.track(u, true);
      Object.assign(b.stats, { snFood: 0, snBite: 0 });
    },
    track(u, reset) { if (reset || !u.snT) u.snT = { ux: u.x, uy: u.y, lx: u.x, ly: u.y, hist: [[u.x, u.y]], tail: [] }; return u.snT; },
    noClamp(b, u) { return !!(b.sn && u && !u.dead); }, // 외곽 벽 없음 (돌진은 clampPos 를 유닛 없이 호출 → 외곽 = 벽)
    on(b, ev, u, e, o) { // 기본 공격(충돌 제외) → 분신들이 따라 함 (원거리 빛 탄, 근접·스킬 복사 없음)
      const D = b.sn; if (!D || ev !== 'attack' || (o && o.bump) || !u || u.summon || b.over) return false;
      const T = u.snT; if (!T || !T.tail.length || !e) return false;
      for (const c of T.tail) { const a = Math.atan2(e.y - c.y, e.x - c.x);
        b.proj.push({ x: c.x, y: c.y - 18, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, src: u, dmg: u.st.atk * D.S.tail.mult, kind: u.def.projectile || 'arrow', homing: false, noAirLock: true, life: 1.0, trail: 0, snClone: true, hit: { ...(u.def.attack || {}), delivery: 'ranged', basic: true } }); }
      return false;
    },
    step(b, dt) {
      const D = b.sn; if (!D) return;
      const S = D.S;
      // ---- 움직이는 벽 (각자 정해진 구역 안에서만: 중앙 + 네 모서리) ----
      for (const Wl of D.walls) { const Z = Wl.Z;
      Wl.x += Wl.vx * dt; Wl.y += Wl.vy * dt;
      if (Wl.x < Z.x) { Wl.x = Z.x; Wl.vx = Math.abs(Wl.vx); } if (Wl.x + Wl.w > Z.x + Z.w) { Wl.x = Z.x + Z.w - Wl.w; Wl.vx = -Math.abs(Wl.vx); }
      if (Wl.y < Z.y) { Wl.y = Z.y; Wl.vy = Math.abs(Wl.vy); } if (Wl.y + Wl.h > Z.y + Z.h) { Wl.y = Z.y + Z.h - Wl.h; Wl.vy = -Math.abs(Wl.vy); } }
      for (const u of b.u) if (!u.dead && !u.airborne && !u.hidden) b.resolveBuildings(u, true);
      // ---- 순환 (캐릭터·소환수·투사체) ----
      for (const u of b.u) { if (u.dead) continue; u.x = wrapX(u.x); u.y = wrapY(u.y); }
      for (const p of b.proj) { if (p.x < AR.x) p.x += AR.w; else if (p.x >= AR.x + AR.w) p.x -= AR.w; const gy = p.y + 18; if (gy < Y0) p.y += YH; else if (gy >= Y0 + YH) p.y -= YH; }
      if (b.over) return;
      // ---- 경로 기록 + 분신 위치 ----
      for (const u of mains(b)) {
        const T = SN.track(u); if (u.dead) continue;
        let dx = u.x - T.lx, dy = u.y - T.ly; if (Math.abs(dx) > AR.w / 2) dx -= Math.sign(dx) * AR.w; if (Math.abs(dy) > YH / 2) dy -= Math.sign(dy) * YH;
        T.lx = u.x; T.ly = u.y; T.ux += dx; T.uy += dy;
        const h = T.hist, last = h[h.length - 1]; if (Math.hypot(T.ux - last[0], T.uy - last[1]) >= 2) { h.push([T.ux, T.uy]); if (h.length > 400) h.shift(); }
        if (!T.tail.length) continue;
        let need = S.tail.gap, k = 0, acc = 0, px = T.ux, py = T.uy;
        for (let i = h.length - 1; i >= 0 && k < T.tail.length; i--) {
          const [qx, qy] = h[i], sl = Math.hypot(px - qx, py - qy);
          while (k < T.tail.length && acc + sl >= need) { const f = sl ? (need - acc) / sl : 0, c = T.tail[k]; c.x = wrapX(px + (qx - px) * f); c.y = wrapY(py + (qy - py) * f); c.face = qx > px ? -1 : 1; k++; need += S.tail.gap; }
          acc += sl; px = qx; py = qy;
        }
        for (; k < T.tail.length; k++) { const c = T.tail[k]; const [qx, qy] = h[0]; c.x = wrapX(qx); c.y = wrapY(qy); }
        for (const c of T.tail) c.age += dt;
        // ---- 내 꼬리를 물면 사망 ----
        if (!u.airborne && !u.hidden && !u.push && !u.action && T.tail.some((c, i) => i >= S.tail.safe && c.age > S.tail.grace && tdist(u.x, u.y, c.x, c.y) < S.tail.hitR + u.pad)) {
          b.stats.snBite++; sys(b, `${u.def.name}: 자기 꼬리를 물었다!`); b.text(u.x, u.y - 66, '꼬리를 물었다!', '#ff9a9a', 11);
          b.burst(u.x, u.y - 16, '#9fe07a', 16); T.tail = []; b.kill(u, b.enemy(u)); continue;
        }
        // ---- AI: 내 꼬리 피하기 ----
        if (canSteer(u)) for (let i = S.tail.safe; i < T.tail.length; i++) { const c = T.tail[i], d = tdist(u.x, u.y, c.x, c.y); if (d > 48) continue;
          const a = Math.atan2(c.y - u.y, c.x - u.x), df = Math.atan2(Math.sin(a - u.dir), Math.cos(a - u.dir)); if (Math.abs(df) < 1.2) { steer(u, a + (df > 0 ? -1.9 : 1.9), 7, dt); break; } }
      }
      for (const u of mains(b)) if (u.dead && u.snT && u.snT.tail.length) u.snT.tail = [];
      // ---- 상대 분신 강탈: 닿은 분신 1개만 내 꼬리 끝으로 (최대치면 소멸) ----
      for (const u of mains(b)) { if (u.dead || u.hidden || u.airborne) continue;
        for (const o of mains(b)) { if (o.team === u.team || !o.snT || !o.snT.tail.length) continue;
          const i = o.snT.tail.findIndex(c => c.age > S.tail.steal && tdist(u.x, u.y, c.x, c.y) < S.tail.hitR + 4 + u.pad); if (i < 0) continue;
          const c = o.snT.tail.splice(i, 1)[0], T = SN.track(u); b.stats.snSteal = (b.stats.snSteal || 0) + 1;
          b.glow(c.x, c.y - 16, 30, '#ffffff', 0.35); b.ring(c.x, c.y - 10, 3, 22, 0.3, TEAM_COL[u.team]);
          if (T.tail.length < S.tail.max) { T.tail.push({ x: c.x, y: c.y, age: 0, face: c.face, stolen: true }); b.text(u.x, u.y - 66, `분신 강탈! (${T.tail.length})`, '#ffe27a', 11); sys(b, `${u.def.name}: ${o.def.name}의 분신 강탈!`); }
          else { b.text(u.x, u.y - 66, '분신 파괴!', '#ffe27a', 10); b.burst(c.x, c.y - 16, '#c8e8b0', 10); }
          break; } }
      // ---- 뱀먹이 ----
      D.nextT -= dt;
      if (D.nextT <= 0 && D.food.length < S.food.max) { D.nextT = S.food.gap; let x, y, n = 0;
        do { x = rand(AR.x + 24, AR.x + AR.w - 24); y = rand(AR.y + 40, AR.y + AR.h - 20); n++; } while (n < 25 && (b.u.some(u => Math.hypot(u.x - x, u.y - y) < 50) || S.zones.some(Z => x > Z.x - 10 && x < Z.x + Z.w + 10 && y > Z.y - 10 && y < Z.y + Z.h + 10)));
        D.food.push({ x, y, t: 0 }); }
      for (const f of D.food) f.t += dt;
      for (let i = D.food.length - 1; i >= 0; i--) { const f = D.food[i];
        const u = mains(b).find(o => !o.dead && !o.hidden && !o.airborne && Math.hypot(o.x - f.x, o.y - f.y) < S.food.r + 8 + o.pad); if (!u) continue;
        D.food.splice(i, 1); const T = SN.track(u); b.stats.snFood++;
        if (T.tail.length < S.tail.max) { T.tail.push({ x: u.x, y: u.y, age: 0, face: u.facing }); b.text(u.x, u.y - 64, `분신 +1 (${T.tail.length})`, '#9fe07a', 10); sys(b, `${u.def.name}: 뱀먹이! 분신 ${T.tail.length}개`); }
        else b.text(u.x, u.y - 64, '꼬리 최대!', '#9fe07a', 9);
        b.ring(f.x, f.y, 3, 18, 0.3, '#9fe07a'); }
    },
    drawWall(ctx, Wl) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Wl.x + 3, Wl.y + 3, Wl.w, Wl.h);
      ctx.fillStyle = '#5a6a3a'; ctx.fillRect(Wl.x, Wl.y - 10, Wl.w, Wl.h); ctx.fillStyle = '#7a8e4e'; ctx.fillRect(Wl.x, Wl.y - 10, Wl.w, 2);
      ctx.fillStyle = '#3e4a28'; ctx.fillRect(Wl.x, Wl.y + Wl.h - 10, Wl.w, 10);
      for (let i = 4; i < Wl.w; i += 10) { ctx.fillStyle = '#2e3820'; ctx.fillRect(Wl.x + i, Wl.y + Wl.h - 8, 6, 2); }
    },
    floor(x, st) {
      const S = st.snake; if (!S) return;
      const T = 16;
      for (let j = 0; j * T < AR.h; j++) for (let i = 0; i * T < AR.w; i++) { x.fillStyle = (i + j) % 2 ? '#1f3a26' : '#234029'; x.fillRect(AR.x + i * T, AR.y + j * T, T, T); }
      for (const Z of S.zones) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(Z.x, Z.y, Z.w, Z.h); x.strokeStyle = 'rgba(200,230,120,0.35)'; x.setLineDash([3, 3]); x.strokeRect(Z.x + 0.5, Z.y + 0.5, Z.w - 1, Z.h - 1); x.setLineDash([]); }
    },
    drawUnder(ctx, b, thumb) {
      const D = b.sn; if (!D) return;
      ctx.save();
      // 외곽: 벽 대신 순환 표시 (점선 띠)
      ctx.fillStyle = '#16281b'; ctx.fillRect(AR.x - 6, AR.y - 6, AR.w + 12, 6); ctx.fillRect(AR.x - 6, AR.y + AR.h, AR.w + 12, 6); ctx.fillRect(AR.x - 6, AR.y, 6, AR.h); ctx.fillRect(AR.x + AR.w, AR.y, 6, AR.h);
      const ph = thumb ? 0 : (b.time * 20) % 12; ctx.fillStyle = '#7ad87a';
      for (let i = -12; i < AR.w + 12; i += 12) { ctx.fillRect(AR.x + i + ph, AR.y - 4, 5, 2); ctx.fillRect(AR.x + i - ph, AR.y + AR.h + 2, 5, 2); }
      for (let j = -12; j < AR.h + 12; j += 12) { ctx.fillRect(AR.x - 4, AR.y + j + ph, 2, 5); ctx.fillRect(AR.x + AR.w + 2, AR.y + j - ph, 2, 5); }
      for (const f of D.food) { const bob = thumb ? 0 : Math.sin(f.t * 5) * 1.5, X = Math.round(f.x), Y = Math.round(f.y - 6 + bob);
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(f.x, f.y + 1, 5, 2, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#8a1a1a'; ctx.fillRect(X - 4, Y - 3, 8, 7); ctx.fillStyle = '#e83a3a'; ctx.fillRect(X - 3, Y - 3, 6, 6); ctx.fillStyle = '#ff9a8a'; ctx.fillRect(X - 2, Y - 2, 2, 1);
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(X, Y - 6, 1, 3); ctx.fillStyle = '#5ac84a'; ctx.fillRect(X + 1, Y - 6, 3, 2); }
      ctx.restore();
    },
    sortItems(b) {
      const D = b.sn; if (!D) return [];
      const out = [];
      for (const u of mains(b)) { const T = u.snT; if (!T || u.dead) continue;
        T.tail.forEach((c, i) => out.push({ y: c.y, x: c.x, draw: ctx => { const s = Sprites.get(u.fdef), warm = c.age < D.S.tail.grace;
          ctx.save(); ctx.globalAlpha = warm ? 0.45 + 0.2 * Math.sin(b.time * 20) : 0.78;
          ctx.fillStyle = TEAM_COL[u.team]; ctx.beginPath(); ctx.ellipse(c.x, c.y + 1, 10, 3.5, 0, 0, TAU); ctx.fill();
          ctx.translate(Math.round(c.x), Math.round(c.y)); ctx.scale(spriteSX(u.fdef, false, c.face), 1); Sprites.draw(ctx, s, 0); ctx.restore(); } })); }
      return out;
    },
  };

  STAGE_HOOKS.push(BB, SN);
  window.StageExt7 = { BB, SN };
})();
