/**
 * 메가톤맨 죠나단 죠죠 (죠죠의 기묘한 모험 1부 비공식 번역 '메가톤맨' 패러디) — 파문 전사. 근접 주먹 평타
 *  1. 비겁한 녀석은 죽어야 햇~! : '비겁한~!' / '녀석은!' / '죽어야 햇~!' 을 끊어 외치며 상대 쪽으로 3번 돌진 (매번 잠깐 멈췄다가 시전 순간 위치로, 비추적).
 *                                세 번째 돌진이 맞는 순간, 쿨타임 중인 내 스킬 수가 상대보다 많으면 추가 피해
 *  2. 정말 미워!          : 상대가 멀면 그 자리에 멈춰 '(첫 글자)..(이름)가 날 따돌리고 있어! 왜.. 왜냐!' → 공격력 상승 → '정말 미워!' 후 다시 움직임
 *  3. 암흑가의 천사 피스  : 그 자리에 피스(스피드 왜건, 소환 유닛·피해 없음)를 세움 → 소개 대사를 읽을 시간 동안 대기 → 톱날 모자를 던질 때의 상대 위치로 던짐
 *                           → 모자는 그 지점에서 잠시 회전(연속 피해) 후 피스에게 부메랑처럼 돌아옴(돌아오는 길에도 피해). 모자를 던진 동안은 모자 벗은 그림
 *                           피스가 어떤 공격이든 한 번이라도 맞으면 스트리트 파이트 관중처럼 날아가며 공격 중단 (모자도 떨어짐)
 *  4. 초강력 드라이브 비색 파문추! : 해로운 상태이상에 걸려 있으면 현재 체력을 조금 소비하고 일정 시간 받는 피해 감소(방어력 상승)
 *  5. 물속의 초강력 파문!  : 죠나단이 물속에 있을 때만. 물을 타고 퍼지는 파문 — 맞은 상대의 산소 게이지를 0으로 (오리 방수 패시브는 면역)
 *  6. 은색의 초강력 파문법! : (반격 슬롯, 쿨타임이 차 있을 때 자동) 상대의 근접 공격(몸 충돌 포함)을 무효화하고 그 상대를 감전
 *  7. 나와라 하트파워!    : 제자리에서 힘을 모으며 '나와라 하트파워!, 저놈을 쓰러트려라!' — 이 동안 맞으면 러시 시간이 늘어남.
 *                           이어서 '이야앗! 나와라 혈액 비트! 황금색의 파문질주!' → 상대가 있던 곳까지 달려가(비추적) 러시.
 *                           모으는 동안 최대 체력 10% 이상 피해를 받았으면 러시 시작 때 상대를 띄워 기절시켜 러시가 전부 맞음
 *  난수는 전부 Math.random (전투 중 시드 난수). 그리기 코드는 난수·전투 값을 바꾸지 않음 (b.time 기반 흔들림만)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'jonathan', GOLD = '#ffd84a', HAMON = '#fff0a0', SWC = '#b07a3a';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const isJ = u => !!(u && u.def && u.def.id === ID);
  const isSW = u => !!(u && u.summon && u.summon.jjSW);
  const slotOf = (u, id) => u.skills.findIndex(s => s.id === id);
  const held = b => !!(window.BSB_HELD && window.BSB_HELD(b)); // 야구장: 공을 치기 전엔 피스·모자 진행 정지
  const D = {
    coward: { pause: [0.35, 0.6, 0.6], spd: 640, len: 190, mult: 0.9, finMult: 1.0, bonus: 0.6, push: 260 },
    hate: { wait: 1.5, dur: 7, mul: 1.35, far: 230 },
    sw: { intro: 2.6, outSpd: 480, spin: 1.1, tick: 0.2, r: 24, mult: 0.32, backSpd: 560, backMult: 0.6, leave: 0.6 },
    scarlet: { cost: 0.06, dur: 5, taken: 0.6 },
    water: { spd: 360, life: 1.1, mult: 1.3 },
    silver: { shock: 1.0 },
    heart: { charge: 2.0, run: 900, runMax: 0.9, rush: 1.0, perHit: 0.35, maxAdd: 1.4, gap: 0.09, mult: 0.24, launchK: 0.10 },
  };
  // 한국어 조사: 받침 있으면 '이', 없으면 '가'
  const josa = s => { const c = s.charCodeAt(s.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '이' : '가'; };
  // 대사: 로그(이름: "대사") + 머리 위 짧은 글자
  function voice(b, u, txt, color, size) { b.hooks.onVoice && b.hooks.onVoice(u, txt, null); if (color) b.text(u.x, u.y - 74 - u.pad * 2, txt.length > 14 ? txt.slice(0, 13) + '…' : txt, color, size || 9); }
  const harmful = u => u.statuses.some(s => { const d = STATUS_DEFS[s.id]; return d && !d.positive; });
  const inWater = (b, u) => !!(u.zone && (u.zone.id === 'water' || u.zone.water) && !u.airborne && !u.air);
  const cdCount = u => u.skills.reduce((n, s, i) => n + (!s.hidden && u.skillT[i] > 0.05 ? 1 : 0), 0);
  if (!STATUS_DEFS.mcShock) STATUS_DEFS.mcShock = { name: '감전', color: '#9ff0ff', tint: '#c8faff', tintA: 0.45, particle: '#e8ffff', blocksAct: true, spdMul: 0.35, onApply(u) { u.action = null; } };

  // ---------- 그림: 피스 (16x16 도트, 모자 쓴 / 벗은 두 장) ----------
  const SW_BODY = ['....YYYYYYYY....', '....YSESSESY....', '....SSrSSSSS....', '.....SSmmSS.....', '...ccTTTTTTcc...', '..cccTTTTTTccc..', '..SccccTTccccS..', '..SccccTTccccS..', '...cccccccccc...',
    '....LLL..LLL....', '....LLL..LLL....', '....DDD..DDD....', '................'];
  const SW_HAT = ['.....kkkkkk.....', '....kkkkkkkk....', '..wgwgwgwgwgwg..'];
  const SW_BARE = ['................', '....YYYYYYYY....', '...YYYYYYYYYY...'];
  const SW_PAL = { k: '#3a2a22', g: '#9aa2ae', w: '#e8eef4', Y: '#f2d27a', S: '#f2c9a0', E: '#2a2230', r: '#b0504a', m: '#8a4038', c: SWC, T: '#e8e4d8', L: '#4a3a2e', D: '#2a2020' };
  const swCv = {};
  function swCanvas(hat) {
    const key = hat ? 'h' : 'n'; if (swCv[key]) return swCv[key];
    const rows = (hat ? SW_HAT : SW_BARE).concat(SW_BODY), c = document.createElement('canvas'); c.width = 18; c.height = 18; const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,12,8,0.55)'; for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (rows[j][i] !== '.') for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.fillRect(i + dx, j + dy, 1, 1);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const k = rows[j][i]; if (k === '.') continue; g.fillStyle = SW_PAL[k]; g.fillRect(i + 1, j + 1, 1, 1); }
    return (swCv[key] = c);
  }
  function drawSW(ctx, x, y, facing, hat, rot, alpha) { // (x, y) = 발 위치
    const c = swCanvas(hat), k = 2.4, w = 18 * k; ctx.save(); ctx.globalAlpha = alpha ?? 1; ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(x), Math.round(y - w / 2 + 2));
    if (rot) ctx.rotate(rot); if (facing < 0) ctx.scale(-1, 1); ctx.drawImage(c, -w / 2, -w / 2, w, w); ctx.restore();
  }
  function drawSaw(ctx, x, y, rot, k) { // 톱날 모자 (위에서 본 원판 + 톱니)
    const R = 7 * (k || 1); ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot);
    ctx.fillStyle = '#e8eef4'; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a + 0.3) * (R + 3), Math.sin(a + 0.3) * (R + 3)); ctx.lineTo(Math.cos(a + 0.55) * R, Math.sin(a + 0.55) * R); ctx.fill(); }
    ctx.fillStyle = '#9aa2ae'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a2a22'; ctx.beginPath(); ctx.arc(0, 0, R * 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a4434'; ctx.fillRect(-1, -R * 0.6, 2, R * 0.5); ctx.restore();
  }
  const SW_DEF = { id: 'jonathan@sw', name: '스피드 왜건', gender: 'male', color: SWC, noDraw: true, stats: { hp: 1, atk: 0, spd: 0, range: 0, atkRate: 0, def: 0 }, attack: { element: 'blunt', delivery: 'melee' }, skills: [] };

  // ---------- 피스: 맞으면 관중처럼 날아감 ----------
  function swFly(b, s, src) {
    const S = s.summon; if (S.gone) return; S.gone = true;
    const dir = src ? (s.x >= src.x ? 1 : -1) : -s.facing;
    voice(b, s, '으아아! 뭔지는 잘 모르겠지만 대단한 의지가 살아있는 것 같다', '#ffd8a0', 8);
    (b.jjFly || (b.jjFly = [])).push({ x: s.x, y: s.y, vx: dir * 110 + rand(-20, 20), t: 0, spin: dir * rand(9, 14), hat: !S.hatOut, face: s.facing });
    const H = S.hat; if (H && !H.done) { H.done = true; b.sparks(H.x, H.y, '#e8eef4', 6, 120); } // 날아가던 모자도 떨어짐 (공격 중단)
    b.stats.jjSWHit = (b.stats.jjSWHit || 0) + 1; b.shock(s.x, s.y - 16, 4, 24, '#ffffff', 0.25, 3);
    GHOUL.removeSummon(b, s);
  }
  // 피해 훅: 피스는 체력 대신 날아감 / 은색 파문법 반격 / 하트파워 모으는 중 피격 기록
  const isMeleeHit = (src, o) => o.delivery === 'melee' || o.bump || (o.basic && !o.viaProj && src && src.st && src.st.range < MELEE_RANGE);
  const oDmg = Battle.prototype.damage;
  Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    if (isSW(tgt)) { if (src && src.team !== tgt.team && !this.over) swFly(this, tgt, src); return 0; }
    if (isJ(tgt) && src && src !== tgt && src.team !== tgt.team && !tgt.dead && !this.over && !o.dot && !o.reflected && !o.fixed && isMeleeHit(src, o)) {
      const i = slotOf(tgt, 'jjSilver');
      if (i >= 0 && tgt.skillT[i] <= 0 && !tgt.blocked('blocksAct')) { // 은색의 초강력 파문법!
        tgt.skillT[i] = tgt.skills[i].cd; this.hooks.onSkill && this.hooks.onSkill(tgt, tgt.skills[i].name, null);
        this.text(tgt.x, tgt.y - 62, '은색 파문!', '#e8f0ff', 11); this.ring(tgt.x, tgt.y - 18, 4, 30, 0.3, '#e8f0ff'); this.zap(src.x, src.y - 20);
        if (!src.dead && !src.summon) this.applyStatus(src, 'mcShock', tgt.skills[i].shock || D.silver.shock, tgt);
        this.stats.jjSilver = (this.stats.jjSilver || 0) + 1; return 0;
      }
    }
    const A = isJ(tgt) && tgt.action && tgt.action.type === 'jjCharge' ? tgt.action : null;
    const r = oDmg.call(this, src, tgt, amt, o);
    if (A && r > 0 && src !== tgt) { A.hits++; A.taken += r; }
    return r;
  };
  const oFixed = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o) { if (isSW(tgt)) { if (src && src.team !== tgt.team) swFly(this, tgt, src); return 0; } return oFixed.call(this, src, tgt, amt, o); };
  const oSt = Battle.prototype.applyStatus; Battle.prototype.applyStatus = function (tgt, id, dur, src, o) { if (isSW(tgt)) return null; return oSt.call(this, tgt, id, dur, src, o); };
  const oKb = Battle.prototype.knockback; Battle.prototype.knockback = function (tgt, ...a) { if (isSW(tgt)) return; return oKb.call(this, tgt, ...a); };
  const oPull = Battle.prototype.pull; Battle.prototype.pull = function (tgt, ...a) { if (isSW(tgt)) return; return oPull.call(this, tgt, ...a); };

  // ---------- 스킬 ----------
  // 1. 비겁한 녀석은 죽어야 햇~!
  const COWARD = ['비겁한~!', '녀석은!', '죽어야 햇~!'];
  SKILLS.jjCoward = { desc: "'비겁한~!' '녀석은!' '죽어야 햇~!' 을 끊어 외치며 상대 쪽으로 3번 돌진합니다(ATK×0.9, 매번 잠깐 멈췄다가 그 순간 상대 위치로 직진, 비추적). 세 번째 돌진이 맞을 때 쿨타임 중인 내 스킬 수가 상대보다 많으면 ATK×0.9 추가 피해.",
    canUse: (u, e, d) => e && !e.dead && d > 50 && d < 240,
    use(u, e0, b, s) { const C = { ...D.coward, ...s }; let i = 0, ph = 'pause', t = 0, ang = 0, go = 0, hit = false;
      const startDash = () => { const e = foeOf(b, u); if (!e || e.dead) { u.action = null; return; } voice(b, u, COWARD[i], i === 2 ? '#ff7a6a' : GOLD, i === 2 ? 12 : 10); ang = angTo(u, e); u.facing = Math.cos(ang) >= 0 ? 1 : -1; go = 0; hit = false; ph = 'dash'; };
      u.action = { type: 'jjCoward', trail: '#ffe08a', step(dt) {
        t += dt;
        if (ph === 'pause') { u.moving = false; if (t >= C.pause[i]) { t = 0; startDash(); } return; }
        const st = C.spd * dt, px = u.x + Math.cos(ang) * st, py = u.y + Math.sin(ang) * st, q = b.clampPos(px, py, u.pad, u);
        const blocked = Math.abs(q.x - px) > 0.3 || Math.abs(q.y - py) > 0.3 || b.blockAt(px, py - 4, 9 + u.pad);
        if (!blocked) { u.x = px; u.y = py; go += st; u.walk += dt * 30; }
        if (!hit) for (const o of b.foes(u)) { if (o.hidden || o.airborne || dist(u, o) > 15 * (u.size + o.size) + 8) continue; hit = true;
          let m = i === 2 ? C.finMult : C.mult; const bonus = i === 2 && cdCount(u) > cdCount(o);
          if (bonus) { m += C.bonus; b.text(o.x, o.y - 84, '비겁함 응징!', '#ff7a6a', 11); b.stats.jjCowardBonus = (b.stats.jjCowardBonus || 0) + 1; }
          b.damage(u, o, u.st.atk * m, { element: 'blunt', delivery: 'melee', big: bonus, color: '#ffe8b0' }); if (!o.dead) b.knockback(o, ang, C.push * (bonus ? 1.5 : 1), 0.25);
          b.shock(o.x, o.y - 18, 4, bonus ? 34 : 22, GOLD, 0.25, 3); break; }
        if (hit || blocked || go >= C.len) { i++; t = 0; if (i >= 3) { u.action = null; u.dir = fixAngle(ang + Math.PI + rand(-0.6, 0.6)); b.stats.jjCoward = (b.stats.jjCoward || 0) + 1; return; } ph = 'pause'; }
      } };
    } };

  // 2. 정말 미워!
  SKILLS.jjHate = { desc: '상대가 멀리 있으면 그 자리에 멈춰 "(첫 글자)..(상대 이름)가 날 따돌리고 있어! 왜.. 왜냐!" 하고 1.5초 대기한 뒤, 7초 동안 주는 피해 ×1.35 ("정말 미워!") 후 다시 움직입니다.',
    canUse: (u, e, d) => e && !e.dead && d > D.hate.far && !u.buff('jjHate'),
    use(u, e0, b, s) { const e = foeOf(b, u), nm = (e && e.def.name) || '상대', H = { ...D.hate, ...s }; let t = 0;
      voice(b, u, `${nm[0]}..${nm}${josa(nm)} 날 따돌리고 있어! 왜.. 왜냐!`, '#c8d8ff', 9);
      u.action = { type: 'jjHate', step(dt) { t += dt; u.moving = false; if (t < H.wait) return; u.action = null;
        u.buffs.push({ type: 'jjHate', name: '정말 미워', t: H.dur, dmgDealt: H.mul }); voice(b, u, '정말 미워!', '#ff7a8a', 12);
        b.glow(u.x, u.y - 20, 30, '#ff7a8a', 0.4); b.stats.jjHate = (b.stats.jjHate || 0) + 1; } };
    } };

  // 3. 암흑가의 천사 피스 (스피드 왜건)
  SKILLS.jjSpeedwagon = { desc: '그 자리에 피스(스피드 왜건)를 세웁니다. 피스가 소개 대사를 외치는 동안(2.6초) 대기했다가 톱날 모자를 던질 때의 상대 위치로 던지고, 모자는 그 지점에서 1.1초 회전하며 0.2초마다 ATK×0.32 피해를 준 뒤 피스에게 부메랑처럼 돌아옵니다(돌아오는 길 ATK×0.6, 대상별 1회). 피스는 피해를 받지 않지만 어떤 공격이든 한 번 맞으면 날아가고 공격이 중단됩니다.',
    canUse: (u, e, d, b) => e && !e.dead && d > 80 && d < 320 && !(b.u.some(o => isSW(o) && o.summon.owner === u)),
    use(u, e0, b, s) {
      const sx = u.x - u.facing * 22, sy = u.y + 6;
      const w = GHOUL.summon(b, u, 'jjSW', sx, sy, { def: SW_DEF, dur: 30, quiet: true, extra: { jjSW: true, t0: b.time, ph: 'intro', pt: 0, hatOut: false, hat: null, opt: { ...D.sw, ...s } } }); if (!w) return;
      w.atkT = 1e9; w.facing = u.facing; b.smoke(w.x, w.y - 12, '#e8d8c0', 8);
      voice(b, w, '난 암흑가의 천사 피스님이다. 죠죠를 엄호하기 위해 큘라타운에서 왔지~', null);
      b.text(w.x, w.y - 62, '피스 등장!', '#ffd8a0', 10); b.stats.jjSW = (b.stats.jjSW || 0) + 1;
    } };
  function swStep(b, w, dt) {
    const S = w.summon, O = S.opt, ow = S.owner; if (S.gone) return;
    w.x = w.jx ?? (w.jx = w.x); w.y = w.jy ?? (w.jy = w.y); w.kx = w.ky = 0; w.action = null; w.statuses = []; S.t = 30; // 제자리 고정
    const e = ow && !ow.dead ? foeOf(b, ow) : null; if (e) w.facing = e.x >= w.x ? 1 : -1;
    if (!ow || ow.dead) { GHOUL.removeSummon(b, w); return; }
    S.pt += dt;
    if (S.ph === 'intro' && S.pt >= O.intro) {
      if (!e || e.dead) { S.ph = 'leave'; S.pt = 0; return; }
      voice(b, w, '귀공자처럼 생긴 놈들은 죽이고 싶도록 미워!', '#ffd8a0', 9);
      S.hatOut = true; S.hat = { x: w.x + w.facing * 6, y: w.y - 38, tx: e.x, ty: e.y - 16, ph: 'out', t: 0, rot: 0, tick: 0, hitSet: new Set(), done: false, src: ow, w };
      S.ph = 'throw'; S.pt = 0; playSfx('shot');
    } else if (S.ph === 'throw' && S.hat && S.hat.done) { S.hatOut = false; S.ph = 'leave'; S.pt = 0; }
    else if (S.ph === 'leave' && S.pt >= O.leave) { b.smoke(w.x, w.y - 12, '#e8d8c0', 8); GHOUL.removeSummon(b, w); }
  }
  function hatStep(b, H, O, dt) {
    const w = H.w, ow = H.src; H.t += dt; H.rot += dt * 22;
    const hitFoes = (r, mult, once) => { for (const o of b.foes(ow)) { if (o.hidden || o.airborne || o.summon || Math.hypot(o.x - H.x, o.y - 16 - H.y) > r + o.pad) continue; if (once) { if (H.hitSet.has(o)) continue; H.hitSet.add(o); }
      b.damage(ow, o, ow.st.atk * mult, { element: 'slash', delivery: 'ranged', noCrit: true, color: '#e8eef4' }); b.sparks(H.x, H.y, '#e8eef4', 3, 120); } };
    if (H.ph === 'out') { const dx = H.tx - H.x, dy = H.ty - H.y, d = Math.hypot(dx, dy), st = O.outSpd * dt;
      if (d <= st) { H.x = H.tx; H.y = H.ty; H.ph = 'spin'; H.t = 0; } else { H.x += dx / d * st; H.y += dy / d * st; } hitFoes(14, O.mult, true); return; }
    if (H.ph === 'spin') { H.tick -= dt; if (H.tick <= 0) { H.tick = O.tick; hitFoes(O.r, O.mult, false); } if (Math.random() < dt * 20) b.sparks(H.x, H.y, '#e8eef4', 1, 90); if (H.t >= O.spin) { H.ph = 'back'; H.t = 0; H.hitSet = new Set(); } return; }
    if (H.ph === 'back') { if (!w || !b.u.includes(w)) { H.done = true; return; }
      const tx = w.x, ty = w.y - 38, dx = tx - H.x, dy = ty - H.y, d = Math.hypot(dx, dy), st = O.backSpd * dt;
      hitFoes(14, O.backMult, true);
      if (d <= st + 4) { H.done = true; b.ring(tx, ty, 2, 12, 0.2, '#e8eef4'); } else { H.x += dx / d * st; H.y += dy / d * st; } }
  }

  // 4. 초강력 드라이브 비색 파문추!
  SKILLS.jjScarlet = { desc: '해로운 상태이상에 걸려 있으면 현재 체력의 6%를 소비하고 5초 동안 받는 피해 ×0.6(방어력 상승).',
    canUse: (u) => harmful(u) && !u.buff('jjScarlet') && u.hp > 20,
    use(u, e0, b, s) { const C = { ...D.scarlet, ...s }, cost = Math.max(1, Math.round(u.hp * C.cost)); u.hp = Math.max(1, u.hp - cost);
      b.text(u.x + 8, u.y - 44, '-' + cost, '#ffb0a0', 9); u.buffs.push({ type: 'jjScarlet', name: '비색 파문', t: C.dur, dmgTaken: C.taken });
      b.glow(u.x, u.y - 18, 34, '#ff5a3a', 0.45); b.ring(u.x, u.y - 18, 4, 30, 0.35, '#ff8a5a'); b.text(u.x, u.y - 64, '방어력 상승!', '#ffb08a', 10); b.stats.jjScarlet = (b.stats.jjScarlet || 0) + 1; } };

  // 5. 물속의 초강력 파문!
  function drawWave(ctx, p) { const k = 1 - p.life / p.max0, r = 6 + 4 * Math.sin(p.life * 30);
    ctx.globalAlpha = 0.9; ctx.strokeStyle = HAMON; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(Math.round(p.x), Math.round(p.y + 14), r + 4, (r + 4) * 0.45, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(Math.round(p.x), Math.round(p.y + 14), r, r * 0.45, 0, 0, TAU); ctx.stroke(); void k; }
  SKILLS.jjWater = { desc: '죠나단이 물속에 있을 때만 사용. 물을 타고 퍼지는 파문을 상대 쪽으로 보내 ATK×1.3 피해(빛)를 주고, 맞은 상대의 산소 게이지를 0으로 만듭니다(방수 패시브 면역).',
    canUse: (u, e, d, b) => e && !e.dead && inWater(b, u) && d < 300,
    use(u, e0, b, s) { const e = foeOf(b, u), C = { ...D.water, ...s }, a = angTo(u, e);
      voice(b, u, '물속의 초강력 파문!', HAMON, 10);
      b.proj.push({ x: u.x + Math.cos(a) * 10, y: u.y - 14, vx: Math.cos(a) * C.spd, vy: Math.sin(a) * C.spd, spd: C.spd, src: u, dmg: u.st.atk * C.mult, kind: 'jjWave', homing: false, life: C.life, max0: C.life, trail: 0, r: 14, draw: drawWave,
        onHitUnit(o) { b.damage(u, o, u.st.atk * C.mult, { element: 'light', delivery: 'ranged', viaProj: true, color: HAMON });
          if (!o.dead && !(o.def.traits && o.def.traits.includes('waterproof'))) { o.o2 = 0; o.o2T = 0; b.text(o.x, o.y - 76, '산소 0!', '#9fd8ff', 11); b.stats.jjWaterO2 = (b.stats.jjWaterO2 || 0) + 1; }
          b.ring(o.x, o.y - 6, 4, 26, 0.3, HAMON); } });
      b.ring(u.x, u.y, 4, 30, 0.35, HAMON); b.stats.jjWater = (b.stats.jjWater || 0) + 1; } };

  // 6. 은색의 초강력 파문법! (반격: 피해 훅에서 처리, 직접 시전하지 않음)
  SKILLS.jjSilver = { desc: '쿨타임이 차 있으면, 상대의 근접 공격(몸 충돌 포함) 한 번을 자동으로 무효화하고 그 상대를 1초 감전(행동 불가·감속)시킵니다.', canUse: () => false, use() {} };

  // 7. 나와라 하트파워!
  SKILLS.jjHeart = { desc: '2초 동안 힘을 모으며 "나와라 하트파워!, 저놈을 쓰러트려라!" — 이 동안 맞을 때마다 러시 시간 +0.35초(최대 +1.4). 이어서 "이야앗! 나와라 혈액 비트! 황금색의 파문질주!" 하며 상대가 있던 곳까지 달려가(비추적) 1초 러시(0.07초마다 ATK×0.28). 모으는 동안 최대 체력 10% 이상 피해를 받았으면 러시 시작 때 상대를 띄워 기절시켜 러시가 전부 맞습니다.',
    canUse: (u, e, d, b) => e && !e.dead && d < 220 && b.time > 3,
    use(u, e0, b, s) { const C = { ...D.heart, ...s }; let ph = 'charge', t = 0, tx = 0, ty = 0, rushT = 0, nx = 0, launched = false, tgt = null, n = 0;
      voice(b, u, '나와라 하트파워!, 저놈을 쓰러트려라!', GOLD, 10);
      u.action = { type: 'jjCharge', hits: 0, taken: 0, trail: null, step(dt) {
        t += dt;
        if (ph === 'charge') { u.moving = false; if (Math.random() < dt * 14) b.parts.push({ x: u.x + rand(-12, 12), y: u.y - rand(0, 30), vx: 0, vy: rand(-50, -20), life: 0.5, max: 0.5, color: rand(0, 1) < 0.5 ? GOLD : HAMON, size: 2, glow: true });
          if (t < C.charge) return;
          const e = foeOf(b, u); if (!e || e.dead) { u.action = null; return; }
          voice(b, u, '이야앗! 나와라 혈액 비트! 황금색의 파문질주!', '#ffe27a', 10);
          tgt = e; tx = e.x; ty = e.y; rushT = C.rush + Math.min(C.maxAdd, this.hits * C.perHit); launched = this.taken >= u.maxHp * C.launchK;
          this.type = 'jjRun'; this.trail = '#ffe27a'; ph = 'run'; t = 0; return; }
        if (ph === 'run') { const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy), st = C.run * dt, reach = 15 * (u.size + tgt.size) + 6;
          const near = !tgt.dead && dist(u, tgt) <= reach;
          if (d <= st + reach * 0.5 || near || t >= C.runMax) { ph = 'rush'; t = 0; this.type = 'jjRush'; this.trail = null; u.facing = tgt.x >= u.x ? 1 : -1;
            if (launched && !tgt.dead && !tgt.hidden) { b.applyStatus(tgt, 'stun', rushT + 0.3, u, { noResistScale: true }); tgt.jjLift = { t0: b.time, dur: rushT + 0.3 }; b.text(tgt.x, tgt.y - 84, '띄웠다!', GOLD, 12); b.shock(tgt.x, tgt.y - 10, 6, 40, GOLD, 0.4, 4); b.stats.jjLaunch = (b.stats.jjLaunch || 0) + 1; }
            return; }
          const q = b.clampPos(u.x + dx / d * st, u.y + dy / d * st, u.pad, u); u.x = q.x; u.y = q.y; u.facing = dx >= 0 ? 1 : -1; u.walk += dt * 40; return; }
        // 러시
        u.moving = false; nx -= dt;
        if (nx <= 0) { nx = C.gap; n++; const ok = !tgt.dead && !tgt.hidden && (launched || dist(u, tgt) <= u.reach + 20);
          const hx = u.x + u.facing * (14 + (n % 3) * 5), hy = u.y - 20 + ((n * 7) % 11) - 5;
          if (ok) { b.damage(u, tgt, u.st.atk * C.mult, { element: 'light', delivery: 'melee', noCrit: true, color: HAMON }); if (n % 3 === 0) b.sparks(tgt.x, tgt.y - 20 - (tgt.jjLift ? 20 : 0), GOLD, 3, 140); }
          else b.sparks(hx, hy, HAMON, 1, 60); }
        if (t >= rushT) { u.action = null; if (tgt) tgt.jjLift = null; b.stats.jjHeart = (b.stats.jjHeart || 0) + 1; b.stats.jjRushHits = (b.stats.jjRushHits || 0) + n; }
      } };
    } };

  // ---------- 스테이지 훅 (모든 스테이지): 피스·모자 진행, 날아가는 피스 ----------
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.winner && isSW(b.winner)) b.winner = b.winner.summon.owner;
      if (b.jjFly && b.jjFly.length) { for (const f of b.jjFly) { f.t += dt; f.x += f.vx * dt; } b.jjFly = b.jjFly.filter(f => f.t < 0.9); }
      if (held(b) || b.over) return;
      for (const w of b.u.slice()) if (isSW(w)) { swStep(b, w, dt); const H = w.summon.hat; if (H && !H.done && b.u.includes(w)) hatStep(b, H, w.summon.opt, dt); }
      for (const u of b.u) if (u.jjLift && b.time - u.jjLift.t0 > u.jjLift.dur) u.jjLift = null;
    },
    drawOver(ctx, b) {
      for (const w of b.u) { if (!isSW(w)) continue; const S = w.summon, intro = S.ph === 'intro';
        drawSW(ctx, w.x, w.y + (intro ? Math.sin(b.time * 8) * 0.8 : 0), w.facing, !S.hatOut, 0, Math.min(1, (b.time - S.t0) / 0.25));
        if (S.hat && !S.hat.done) drawSaw(ctx, S.hat.x, S.hat.y, S.hat.rot, S.hat.ph === 'spin' ? 1.25 : 1); }
      if (b.jjFly) for (const f of b.jjFly) { const k = f.t / 0.9; drawSW(ctx, f.x, f.y - Math.sin(k * Math.PI) * 46, f.face, f.hat, f.spin * f.t, 1 - k * k); }
      for (const u of b.u) { if (!isJ(u) || u.dead || u.hidden) continue; const A = u.action, z = b.airZ(u);
        if (A && A.type === 'jjCharge') { const k = 0.5 + 0.5 * Math.sin(b.time * 18); ctx.save(); ctx.globalAlpha = 0.25 + 0.25 * k; ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(u.x, u.y - 18 - z, 16 + 3 * k, 24 + 3 * k, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
        if (A && A.type === 'jjRush') for (let i = 0; i < 5; i++) { const ph = b.time * 41 + i * 1.9, along = 12 + 18 * (0.5 + 0.5 * Math.sin(ph)), side = Math.sin(ph * 1.7 + i) * 9;
          ctx.fillStyle = '#3a2a1a'; ctx.fillRect(Math.round(u.x + u.facing * along) - 3, Math.round(u.y - 22 - z + side) - 3, 6, 6); ctx.fillStyle = i % 2 ? GOLD : '#f2c9a0'; ctx.fillRect(Math.round(u.x + u.facing * along) - 2, Math.round(u.y - 22 - z + side) - 2, 4, 4); }
        if (u.buff('jjScarlet')) { ctx.save(); ctx.globalAlpha = 0.3 + 0.15 * Math.sin(b.time * 10); ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.x, u.y - 18 - z, 20 + u.pad, 0, TAU); ctx.stroke(); ctx.restore(); }
      }
      for (const u of b.u) if (u.jjLift && !u.dead) { const k = Math.min(1, (b.time - u.jjLift.t0) / 0.2); ctx.save(); ctx.globalAlpha = 0.5 * k; ctx.fillStyle = GOLD; ctx.beginPath(); ctx.ellipse(u.x, u.y + 2, 14, 4, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    },
  });
  // 띄워진 상대: 그림 높이(airZ)만 올림 — 기절 중이라 이동·행동은 없음, 투사체 높이 판정에도 반영
  const oAirZ = Battle.prototype.airZ; Battle.prototype.airZ = function (u) { const z = oAirZ.call(this, u); return u.jjLift ? z + 22 * Math.min(1, (this.time - u.jjLift.t0) / 0.2) : z; };

  CHARACTERS.push({
    id: ID, name: '죠나단', fullName: '메가톤맨 죠나단 죠죠', gender: 'male', color: '#3a5aa8',
    stats: { hp: 950, atk: 32, spd: 250, range: 50, atkRate: 0.9, def: 20, crit: 0.07, critMult: 1.8 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { light: 0.85, dark: 1.15 },
    skills: [
      { id: 'jjSilver', name: '은색의 초강력 파문법!', cd: 14, shock: 0.8 },
      { id: 'jjScarlet', name: '초강력 드라이브 비색 파문추!', cd: 12 },
      { id: 'jjWater', name: '물속의 초강력 파문!', cd: 7 },
      { id: 'jjHeart', name: '나와라 하트파워!', cd: 18 },
      { id: 'jjCoward', name: '비겁한 녀석은 죽어야 햇~!', cd: 10 },
      { id: 'jjSpeedwagon', name: '암흑가의 천사 피스', cd: 15 },
      { id: 'jjHate', name: '정말 미워!', cd: 14 },
    ],
    passiveDesc: '파문 전사. 은색의 초강력 파문법은 직접 쓰지 않고, 쿨타임이 차 있을 때 상대의 근접 공격을 받으면 자동으로 막고 감전시킵니다.',
    sprite: { // 16x16 절차적 도트 (직접 그림): 남색 머리, 넓은 어깨, 파란 상의·흰 스카프·금색 벨트
      pal: { H: '#22305a', h: '#4a5a8a', S: '#f2c9a0', E: '#2a2230', m: '#8a4038', B: '#3a4a8a', W: '#e8e4d8', A: '#e8c050', L: '#2a2a3a', D: '#3a2a20' },
      rows: { 0: '.....HHHHHH.....', 1: '....HHHHHHHH....', 2: '...HHHhHHHHHH...', 3: '...HHSSSSSSHH...', 4: '....SSESSESS....', 5: '....SSSSSSSS....', 6: '.....SSmmSS.....', 7: '..BBBWWWWWWBBB..',
        8: '.BBBBBWWWWBBBBB.', 9: '.SSBBBBBBBBBBSS.', 10: '.SSBBBBBBBBBBSS.', 11: '...BBAAAAAABB...', 12: '...LLLL..LLLL...', 13: '...LLLL..LLLL...', 14: '...DDDD..DDDD...', 15: '................' },
    },
    lines: {
      skill: {}, // 스킬 대사는 스킬 코드에서 직접 (끊어 말하기·피스 대사 등)
      event: {
        battleStart: ['죠죠라고 불러 주게!', '신사의 싸움을 보여 주지!'],
        lowHp: ['아직… 파문의 호흡은 멈추지 않았다!'], stunned: ['크윽…!'],
        win: ['신사의 승리다!', '이것이 파문의 힘이다!'], lose: ['스, 스피드 왜건…'],
      },
    },
  });
})();
