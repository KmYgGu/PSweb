/**
 * 히가시카타 죠스케 (죠죠의 기묘한 모험 4부) — 스탠드 「크레이지 다이아몬드」(근거리 파워형, 스탠드 전개 없음). 근접 주먹 평타
 *  평타 도라라라라! : 한 번 공격할 때 주먹 8연타 러쉬 (분노 중 12연타·빠르게). 첫 주먹은 사거리가 짧고 한 대마다 주먹이 7px 더 뻗음(최대 +60), 러쉬가 끝나면 초기화
 *  파편           : 죠스케가 벽·장애물(건물·철망·얼음벽·풀장 공 등)에 몸으로 부딪히면 그 자리에 파편이 생김 (최대 6개, 10초 뒤 소멸).
 *                   부딪힌 것이 내구도가 있는 오브젝트(시가지 건물·스트리트 철망 칸·얼음 동굴 벽 구간)면 '오브젝트 파편'으로 그 오브젝트를 기억
 *  1. 원상복구     : 상황에 맞는 파편(가장 가까운 것 / 가장 먼저 생긴 것 / 오브젝트 파편)으로 끌려가듯 가속 이동 → 파편 제거.
 *                   오브젝트 파편이면 그 오브젝트 내구도 전부 회복 (무너진 건물·뚫린 철망·깨진 얼음벽도 되살아남, 다시 세워진 건물에 끼인 상대는 피해+기절)
 *                   끌려가는 길에 상대와 부딪히면 한 번 피해 + 밀침
 *  2. 일단 너를 고쳐놓으면 말야... : 상대 체력을 최대 체력의 10% 회복시키는 대신, 2.5초 동안 상대가 받는 피해 ×3 (상태이상 '고쳐놓음', 저항 무시)
 *  3. 자동 추적탄!  : 상대 쪽으로 조각을 직선 발사. 빗나가면(수명 끝·벽·장애물) 맵에 파편이 있을 때 크게 유턴해 가장 가까운 파편으로 돌아옴 (돌아오는 길에도 맞음)
 *  4. 머리 손질     : 1.5초 동안 멈춰서 빗질. 다 마치면 그레이트한 기분으로 다른 스킬 하나(시드 난수)의 쿨타임 초기화.
 *                   빗질 중 상대의 일반 공격(몸 충돌)·근접 공격에 맞으면 머리를 헐뜯은 것 → 6초 분노: 경직·기절·넉백·끌림·제압 무시(피해는 그대로),
 *                   상대를 계속 추적, 도라라라라! 공격 속도 ×1.5·러쉬 12연타
 *  난수는 전부 Math.random (전투 중 시드 난수). 그리기 코드는 난수·전투 값을 바꾸지 않음 (b.time 기반 흔들림만)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'josuke', PINK = '#ff8ad0', LPINK = '#ffd0ec';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const isJ = u => !!(u && u.def && u.def.id === ID);
  const J_ = u => u.js || (u.js = { rush: null, pdir: null, fragT: -9, cdT: 0 });
  const D = {
    rush: { n: 8, nAngry: 12, gap: 0.055, gapAngry: 0.045, mult: 0.32, step: 7, maxGrow: 60 },
    frag: { life: 10, max: 6, cd: 0.45, turn: 0.35 },
    restore: { v0: 220, acc: 1500, vMax: 720, maxT: 1.4, hitMult: 0.9, push: 320, trapMult: 1.2, trapStun: 0.8 },
    fix: { wind: 0.28, heal: 0.10, dur: 2.5 },
    shard: { spd: 470, life: 0.85, mult: 1.1, turn: 4.5, backSpd: 430, backLife: 3.0 },
    comb: { dur: 1.5 },
    anger: { dur: 6, rate: 1.5, turn: 5.5 },
  };
  const angry = u => !!(u && u.buffs && u.buff('jsAnger'));
  const rushing = u => !!(u.js && u.js.rush);
  const busy = u => rushing(u) || !!u.action;

  // ---------- 상태이상: 고쳐놓음 (받는 피해 ×3) ----------
  STATUS_DEFS.jsFixed = { name: '고쳐놓음', color: '#ff9ad8', tint: '#ffc0e8', tintA: 0.22, particle: LPINK, dmgTaken: 3 };

  // ---------- 그림: 크레이지 다이아몬드 (16x16 도트, 코드로 그림) ----------
  const CD_ROWS = ['.....dddddd.....', '....dCCCCCCd....', '....dCgCCgCd....', '....dCCmmCCd....', '.....dCCCCd.....', '..ddddhhhhdddd..', '.dPPdCCCCCCdPPd.', '.dPPdCmCCmCdPPd.',
    '.dCdCCCCCCCCdCd.', '.dCddCCbbCCddCd.', '..d.dCCCCCCd.d..', '....dCCddCCd....', '....dCCddCCd....', '....dCC..CCd....', '....dbb..bbd....', '....ddd..ddd....'];
  const CD_PAL = { d: '#3a1a4a', C: '#f4a8d8', P: '#ff5aa8', b: '#4a7ad8', g: '#7af0c0', m: '#c04a8a', h: '#ffe0f2' };
  let cdCv = null;
  function cdCanvas() {
    if (cdCv) return cdCv; const c = document.createElement('canvas'); c.width = 18; c.height = 18; const g = c.getContext('2d');
    g.fillStyle = 'rgba(40,10,40,0.5)'; for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (CD_ROWS[j][i] !== '.') for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.fillRect(i + dx, j + dy, 1, 1);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const k = CD_ROWS[j][i]; if (k === '.') continue; g.fillStyle = CD_PAL[k]; g.fillRect(i + 1, j + 1, 1, 1); }
    return (cdCv = c);
  }
  function drawCD(ctx, x, y, facing, alpha, sc) { // (x, y) = 발 위치
    const c = cdCanvas(), k = sc || 2.6, w = 18 * k; ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(x), Math.round(y));
    if (facing < 0) ctx.scale(-1, 1); ctx.drawImage(c, -w / 2, -w + 2, w, w); ctx.restore();
  }
  function drawFist(ctx, x, y, a) { // 분홍 주먹 (4x4) + 흰 하이라이트
    ctx.fillStyle = '#3a1a4a'; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
    ctx.fillStyle = CD_PAL.C; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x + Math.cos(a) * 1.5) - 1, Math.round(y + Math.sin(a) * 1.5) - 1, 2, 1);
  }

  // ---------- 파편 ----------
  const frags = b => b.jsFrags || (b.jsFrags = []);
  const fragsOf = (b, u) => frags(b).filter(f => f.owner === u && !f.gone);
  const restorable = (b, bl) => bl && !bl.stageSolid && !bl.solid && !bl.okVoid && !bl.arGear && bl.life == null && bl.maxHp > 0 && bl.maxHp < 1e6 && b.buildings.includes(bl);
  function findObj(b, x, y) { // 부딪힌 지점 근처의 내구도 있는 오브젝트
    for (const bl of b.buildings) { if (!restorable(b, bl)) continue; if (Math.hypot(x - clamp(x, bl.x, bl.x + bl.w), (y - 4) - clamp(y - 4, bl.y, bl.y + bl.h)) <= 16) return { type: 'bld', ref: bl }; }
    if (b.iceSegs && b.iceSegs.length) {
      const P = b.play || AR, side = x < P.x + 34 ? 'left' : x > P.x + P.w - 34 ? 'right' : y < P.y + 46 ? 'top' : y > P.y + P.h - 26 ? 'bottom' : null;
      if (side) { const s = b.segAt(side, { x, y }); if (s) return { type: 'ice', ref: s }; }
    }
    if (b.st2 && b.st2.segs) for (const s of b.st2.segs) {
      const vx = s.x1 - s.x0, vy = s.y1 - s.y0, L2 = vx * vx + vy * vy || 1, t = clamp(((x - s.x0) * vx + (y - s.y0) * vy) / L2, 0, 1);
      if (Math.hypot(x - (s.x0 + vx * t), y - (s.y0 + vy * t)) <= 18) return { type: 'fence', ref: s };
    }
    return null;
  }
  function objDamaged(o) {
    if (!o || !o.ref) return false; const r = o.ref;
    if (o.type === 'bld' || o.type === 'ice') return r.dead || r.hp < r.maxHp;
    if (o.type === 'fence') return r.broken || r.hp < r.max;
    return false;
  }
  const FRAG_COL = { bld: ['#b8a888', '#8a7a68'], ice: ['#e8f8ff', '#9fd0ea'], fence: ['#b4b8c0', '#6a7078'], wall: ['#b0a8a0', '#7a7068'] };
  function addFrag(b, u, cx, cy, obj) {
    const L = frags(b), mine = L.filter(f => f.owner === u && !f.gone);
    if (mine.length >= D.frag.max) mine[0].gone = true; // 가장 오래된 파편부터 소멸
    const q = b.clampPos(u.x, u.y, u.pad, u);
    const f = { owner: u, x: cx, y: cy, ax: q.x, ay: q.y, t0: b.time, life: D.frag.life, obj, kind: obj ? obj.type : 'wall', gone: false, pcs: [] };
    for (let i = 0; i < 4; i++) f.pcs.push([rand(-7, 7), rand(-4, 4), rand(1.5, 3.2), Math.random() < 0.5 ? 0 : 1]);
    L.push(f); b.jsFrags = L.filter(x => !x.gone);
    b.debris(cx, cy, 6); b.sparks(cx, cy - 6, FRAG_COL[f.kind][0], 4, 120);
    b.stats.jsFrag = (b.stats.jsFrag || 0) + 1; if (obj) b.stats.jsFragObj = (b.stats.jsFragObj || 0) + 1;
    return f;
  }
  function restoreObj(b, u, o) {
    const r = o.ref; let revived = false;
    if (o.type === 'bld') {
      revived = r.dead; r.dead = false; r.hp = r.maxHp; r.hitT = 0.15;
      if (revived) { // 다시 세워진 건물: 안에 있던 유닛은 밖으로 (상대는 끼여서 피해 + 기절)
        for (const t of b.u) { if (t.dead || t.airborne || t.hidden) continue;
          const inside = t.x > r.x - 8 - t.pad && t.x < r.x + r.w + 8 + t.pad && t.y - 4 > r.y - 8 - t.pad && t.y - 4 < r.y + r.h + 8 + t.pad; if (!inside) continue;
          if (t.team !== u.team) { b.damage(u, t, u.st.atk * D.restore.trapMult, { element: 'blunt', delivery: 'melee', noCrit: true, big: true, color: LPINK }); if (!t.dead) b.stun(t, D.restore.trapStun, u); b.text(t.x, t.y - 70, '끼임!', PINK, 11); b.stats.jsTrap = (b.stats.jsTrap || 0) + 1; }
          b.resolveBuildings(t, true); }
      }
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2; b.glow(cx, cy - 10, Math.max(r.w, r.h), PINK, 0.5); b.ring(cx, cy, 6, Math.max(r.w, r.h) * 0.8, 0.4, LPINK);
      for (let i = 0; i < 18; i++) { const a = rand(0, TAU), s = rand(40, 90); b.parts.push({ x: cx + Math.cos(a) * 40, y: cy + Math.sin(a) * 30, vx: -Math.cos(a) * s, vy: -Math.sin(a) * s, life: 0.45, max: 0.45, color: i % 2 ? '#c8b898' : LPINK, size: 2, glow: i % 2 === 0 }); }
    } else if (o.type === 'ice') { revived = r.dead; r.dead = false; r.hp = r.maxHp; r.hitT = 0; if (revived) b.hooks.onSystem && b.hooks.onSystem('죠스케: 깨진 얼음벽을 원상복구!'); }
    else if (o.type === 'fence') { revived = r.broken; r.broken = false; r.hp = r.max; r.flash = 0.2; if (revived) b.hooks.onSystem && b.hooks.onSystem('죠스케: 뚫린 철망을 원상복구!'); }
    b.stats.jsRestoreObj = (b.stats.jsRestoreObj || 0) + 1; if (revived) b.stats.jsRevive = (b.stats.jsRevive || 0) + 1;
    return revived;
  }
  // 몸 충돌(벽·장애물)로 방향이 꺾였는지: 상대 유닛과 닿아 튕긴 경우는 제외
  const touchingUnit = (b, u) => b.u.some(o => o !== u && !o.dead && !o.hidden && dist(u, o) < 15 * (u.size + o.size) + 8);

  // ---------- 평타: 도라라라라! ----------
  const oBasic = Battle.prototype.basicAttack;
  Battle.prototype.basicAttack = function (u, e) {
    if (!isJ(u)) return oBasic.call(this, u, e);
    if (this.emit('attack', u, e)) { this.text(u.x, u.y - 50, '무효!', '#c8c0ff', 10); return; }
    const J = J_(u), mad = angry(u), n = mad ? D.rush.nAngry : D.rush.n, gap = mad ? D.rush.gapAngry : D.rush.gap;
    const R = J.rush = { i: 0, n, grow: 0, ang: angTo(u, e), hits: 0 };
    u.swing = 0.2; charSfx(u, 'basic');
    this.text(u.x, u.y - 64, mad ? '도라라라라라라!' : '도라라라!', PINK, mad ? 11 : 9);
    const miss = Math.random() < u.smax('misdirect');
    for (let i = 0; i < n; i++) this.later(i * gap, () => punch(this, u, R, i, miss));
  };
  function punch(b, u, R, i, miss) {
    const J = J_(u); if (J.rush !== R) return;
    if (u.dead || b.over || u.blocked('blocksAct') || u.action) { J.rush = null; return; } // 행동 불가·다른 행동 시작 → 러쉬 중단
    const e = foeOf(b, u); if (!e || e.dead) { J.rush = null; return; }
    const grow = Math.min(D.rush.maxGrow, i * D.rush.step), reach = u.reach + grow; R.i = i; R.grow = grow; R.ang = angTo(u, e);
    u.facing = e.x >= u.x ? 1 : -1; u.swing = 0.12;
    const hx = u.x + Math.cos(R.ang) * Math.min(reach, dist(u, e)), hy = u.y - 18 + Math.sin(R.ang) * Math.min(reach, dist(u, e)) * 0.6;
    if (!miss && !e.hidden && dist(u, e) <= reach + 6) {
      const atk = { ...(u.def.attack || {}), basic: true, applies: i === 0 ? u.def.attackApplies : null, color: LPINK };
      const dd = b.damage(u, e, u.st.atk * D.rush.mult, atk);
      if (dd > 0) { R.hits++; if (R.hits === 1) b.resEvent(u, 'basicHit'); }
      b.sparks(e.x + rand(-5, 5), e.y - 20 + rand(-8, 6), i % 2 ? '#ffffff' : PINK, 2, 110);
    } else if (i % 3 === 0) b.sparks(hx, hy, LPINK, 2, 80);
    if (i % 3 === 0) { const bl = b.blockAt(u.x + Math.cos(R.ang) * 22, u.y - 4 + Math.sin(R.ang) * 22, 8); if (bl) b.hitBuilding(bl, u.st.atk * b.rules.meleeK * 0.45, false, u.x + Math.cos(R.ang) * 18, u.y - 14, u, 'melee'); }
    if (i === R.n - 1) { b.stats.jsRushHits = (b.stats.jsRushHits || 0) + R.hits; b.stats.jsRush = (b.stats.jsRush || 0) + 1; b.later(0.1, () => { if (J.rush === R) J.rush = null; }); }
  }

  // ---------- 머리 손질 → 분노 ----------
  const isMeleeHit = (src, o) => o.delivery === 'melee' || o.bump || (o.basic && !o.viaProj && src && src.st && src.st.range < MELEE_RANGE);
  const oDmg = Battle.prototype.damage;
  Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    const combing = isJ(tgt) && tgt.action && tgt.action.type === 'jsComb';
    const r = oDmg.call(this, src, tgt, amt, o);
    if (combing && !tgt.dead && !this.over && src && src !== tgt && src.team !== tgt.team && !o.dot && !o.reflected && isMeleeHit(src, o) && tgt.action && tgt.action.type === 'jsComb') enrage(this, tgt, src);
    return r;
  };
  function enrage(b, u, src) {
    u.action = null; u.push = null; u.pull = null; u.kx = u.ky = 0;
    u.statuses = u.statuses.filter(s => { const d = STATUS_DEFS[s.id]; return !d || d.positive || !(d.blocksAct || d.blocksMove); });
    const old = u.buff('jsAnger'); if (old) old.t = D.anger.dur; else u.buffs.push({ type: 'jsAnger', name: '빡침', t: D.anger.dur, meleeRateMul: D.anger.rate, nodispel: true });
    u.atkT = Math.min(u.atkT, 0.1); u.dir = angTo(u, src);
    b.text(u.x, u.y - 78, '…뭐라고?', '#ff4a4a', 12); b.shock(u.x, u.y - 18, 6, 44, '#ff4a4a', 0.4, 4); b.shake(2); b.hitstop(0.1);
    b.stats.jsAnger = (b.stats.jsAnger || 0) + 1;
    const T = b.time; ['hairInsult1', 'hairInsult2', 'hairInsult3'].forEach((k, i) => b.later(i * 1.25, () => { if (!u.dead && !b.over && angry(u) && b.time - T < D.anger.dur) b.say(u, k); }));
  }
  function combDone(b, u) {
    const L = []; u.skills.forEach((s, i) => { if (s.id !== 'jsComb' && u.skillT[i] > 0.5) L.push(i); });
    b.say(u, 'combDone'); b.sparks(u.x, u.y - 34, '#fff6a8', 10, 120); b.glow(u.x, u.y - 30, 26, '#fff6a8', 0.4);
    b.stats.jsCombOk = (b.stats.jsCombOk || 0) + 1;
    if (!L.length) { b.text(u.x, u.y - 70, '그레이트!', '#fff6a8', 11); return; }
    const i = L[Math.floor(Math.random() * L.length)]; u.skillT[i] = 0;
    b.text(u.x, u.y - 70, `그레이트! (${u.skills[i].name})`, '#fff6a8', 10);
  }
  // 분노 중: 경직·기절·넉백·끌림·제압 무시 (피해는 그대로)
  const oStatus = Battle.prototype.applyStatus; Battle.prototype.applyStatus = function (tgt, id, dur, src, o = {}) {
    const d = STATUS_DEFS[id]; if (d && !d.positive && src !== tgt && isJ(tgt) && angry(tgt) && (d.blocksAct || d.blocksMove)) { if (!tgt.jsResT || this.time - tgt.jsResT > 0.4) { tgt.jsResT = this.time; this.text(tgt.x, tgt.y - 58, '안 멈춰!', '#ff6a6a', 9); } return null; }
    return oStatus.call(this, tgt, id, dur, src, o);
  };
  const oKb = Battle.prototype.knockback; Battle.prototype.knockback = function (tgt, ...a) { if (isJ(tgt) && angry(tgt)) return; return oKb.call(this, tgt, ...a); };
  const oPull = Battle.prototype.pull; Battle.prototype.pull = function (tgt, ...a) { if (isJ(tgt) && angry(tgt)) return; return oPull.call(this, tgt, ...a); };
  const oPin = Battle.prototype.pinUnit; Battle.prototype.pinUnit = function (u, e, a, q) { if (isJ(e) && angry(e)) { a.missed = true; return; } return oPin.call(this, u, e, a, q); };

  // ---------- 원상복구: 파편 고르기 ----------
  function pickFrag(b, u, e) {
    const F = fragsOf(b, u).filter(f => b.time - f.t0 < f.life - 0.3 && Math.hypot(f.ax - u.x, f.ay - u.y) > 40);
    if (!F.length) return null;
    let nearest = F[0], oldest = F[0];
    for (const f of F) { if (Math.hypot(f.ax - u.x, f.ay - u.y) < Math.hypot(nearest.ax - u.x, nearest.ay - u.y)) nearest = f; if (f.t0 < oldest.t0) oldest = f; }
    const de = e && !e.dead ? dist(u, e) : 1e9, fd = f => Math.hypot(f.ax - e.x, f.ay - e.y);
    if (e && !e.dead && u.hp < u.maxHp * 0.35 && de < 110) { // 위기: 상대에게서 먼 쪽 파편으로 빠짐
      const c = fd(oldest) > fd(nearest) ? oldest : nearest; if (fd(c) > de + 60) return { f: c, mode: c === oldest ? '먼저 생긴 파편' : '가까운 파편' };
    }
    const objF = F.filter(f => f.obj && objDamaged(f.obj)); // 부서진 오브젝트 되살리기
    if (objF.length) { let m = objF[0]; for (const f of objF) if (Math.hypot(f.ax - u.x, f.ay - u.y) < Math.hypot(m.ax - u.x, m.ay - u.y)) m = f; return { f: m, mode: '오브젝트 파편' }; }
    if (e && !e.dead && de > 140) for (const c of [oldest, nearest]) if (fd(c) < 75) return { f: c, mode: c === oldest ? '먼저 생긴 파편' : '가까운 파편' }; // 상대 근처 파편으로 끌려가 기습
    return null;
  }
  function arrive(b, u, A) {
    const f = A.f; f.gone = true; u.action = null; b.jsFrags = frags(b).filter(x => !x.gone);
    b.ring(f.x, f.y - 6, 3, 22, 0.3, PINK); b.sparks(f.x, f.y - 8, LPINK, 8, 140);
    let rv = false; if (f.obj) rv = restoreObj(b, u, f.obj);
    b.text(u.x, u.y - 66, f.obj ? (rv ? '원상복구!!' : '수리 완료!') : '원상복구!', PINK, f.obj ? 11 : 9);
    b.resolveBuildings(u, true); u.dir = fixAngle(A.ang + Math.PI + rand(-0.7, 0.7));
    b.stats.jsRestore = (b.stats.jsRestore || 0) + 1;
  }

  // ---------- 스킬 ----------
  SKILLS.jsRestore = { desc: '크레이지 다이아몬드로 맵의 파편을 원래 자리로 되돌리며, 그 파편 쪽으로 끌려가듯 가속 이동합니다. 상황에 따라 가장 가까운 파편 / 가장 먼저 생긴 파편 / 부서진 오브젝트의 파편을 고르고, 도착하면 파편이 사라집니다. 오브젝트 파편이면 그 오브젝트(건물·철망 칸·얼음벽)의 내구도를 전부 회복하며, 무너진 것도 다시 세웁니다(다시 세워진 건물에 끼인 상대는 피해 + 기절). 끌려가는 길에 상대와 부딪히면 한 번 피해(ATK×0.9) + 밀침.',
    canUse: (u, e, d, b) => !busy(u) && !u.airborne && !u.air && !!pickFrag(b, u, foeOf(b, u)),
    use(u, e0, b, s) {
      const e = foeOf(b, u), P = pickFrag(b, u, e); if (!P) return; const f = P.f;
      b.text(u.x, u.y - 72, P.mode, LPINK, 8); J_(u).cdT = 0.5;
      u.action = { type: 'jsRestore', f, t: 0, v: D.restore.v0, hit: false, trail: '#ffb0dc', ang: Math.atan2(f.ay - u.y, f.ax - u.x), step(dt) {
        this.t += dt; if (f.gone) { u.action = null; return; }
        this.v = Math.min(D.restore.vMax, this.v + D.restore.acc * dt);
        const dx = f.ax - u.x, dy = f.ay - u.y, dd = Math.hypot(dx, dy), st = this.v * dt;
        if (dd <= st + 2 || this.t > D.restore.maxT) { if (dd <= st + 2) { u.x = f.ax; u.y = f.ay; } arrive(b, u, this); return; }
        this.ang = Math.atan2(dy, dx); u.x += dx / dd * st; u.y += dy / dd * st; u.walk += dt * 30; u.facing = dx >= 0 ? 1 : -1;
        const q = b.clampPos(u.x, u.y, u.pad, u); u.x = q.x; u.y = q.y; u.dir = this.ang;
        if (!this.hit) for (const o of b.foes(u)) { if (o.hidden || o.airborne || dist(u, o) > 15 * (u.size + o.size) + 6) continue;
          this.hit = true; b.damage(u, o, u.st.atk * D.restore.hitMult, { element: 'blunt', delivery: 'melee', color: LPINK }); if (!o.dead) b.knockback(o, this.ang, D.restore.push, 0.25);
          b.shock(o.x, o.y - 18, 4, 24, PINK, 0.25, 3); b.stats.jsRestoreHit = (b.stats.jsRestoreHit || 0) + 1; break; }
      } };
    } };

  SKILLS.jsFix = { desc: '크레이지 다이아몬드로 상대를 "고쳐" 줍니다: 상대 체력을 최대 체력의 10%만큼 회복시키는 대신, 2.5초 동안 상대가 받는 피해가 3배가 됩니다(상태이상 \'고쳐놓음\', 상태 저항 무시·정화 가능). 근접 거리에서 도라라라라! 직전에 씁니다.',
    canUse: (u, e, d, b) => !busy(u) && e && !e.dead && !e.hidden && !e.summon && d <= u.reach + 14 && u.atkT < 0.45 && !e.status('jsFixed') && b.time > 2,
    use(u, e0, b, s) { const e = foeOf(b, u); const J = J_(u); J.cdT = (s.wind || D.fix.wind) + 0.3; J.cdAng = angTo(u, e);
      b.windup(u, s.wind || D.fix.wind, () => {
        if (u.dead || b.over || !e || e.dead || e.hidden || dist(u, e) > u.reach + 34) { b.text(u.x, u.y - 60, '헛손질', '#e0c8d8', 9); return; }
        b.heal(e, e.maxHp * (s.heal || D.fix.heal));
        b.applyStatus(e, 'jsFixed', s.dur || D.fix.dur, u, { noResistScale: true });
        b.glow(e.x, e.y - 18, 34, PINK, 0.45); b.ring(e.x, e.y - 18, 4, 30, 0.35, LPINK); b.text(e.x, e.y - 96, '고쳐놨다!', PINK, 11);
        u.atkT = Math.min(u.atkT, 0.05); b.stats.jsFix = (b.stats.jsFix || 0) + 1;
      }); } };

  function drawShard(ctx, p) {
    const a = Math.atan2(p.vy, p.vx); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    ctx.globalAlpha = 0.35; ctx.fillStyle = PINK; ctx.fillRect(-12, -1, 9, 2);
    ctx.globalAlpha = 1; ctx.fillStyle = '#5a4a40'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-1, -4); ctx.lineTo(-4, 1); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c8b898'; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-1, -3); ctx.lineTo(-2, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.jsBack ? '#ffffff' : LPINK; ctx.fillRect(-1, -1, 2, 2);
  }
  function shardReturn(b, p) {
    if (p.jsBack || p.reflected || !p.src || p.src.dead || b.over) return;
    const F = fragsOf(b, p.src); if (!F.length) { b.burst(p.x, p.y, '#c8b898', 4); return; }
    let f = F[0]; for (const x of F) if (Math.hypot(x.x - p.x, x.y - 14 - p.y) < Math.hypot(f.x - p.x, f.y - 14 - p.y)) f = x;
    const sp = Math.hypot(p.vx, p.vy) || 1, S = D.shard;
    b.proj.push({ x: p.x, y: p.y, vx: p.vx / sp * S.backSpd, vy: p.vy / sp * S.backSpd, spd: S.backSpd, src: p.src, dmg: p.dmg, kind: 'jsShard', homing: false, life: S.backLife, trail: 0, hit: p.hit, r: 9, jsShard: true, jsBack: true, jsFrag: f, draw: drawShard });
    b.text(p.x, p.y - 14, '유턴!', LPINK, 9); b.ring(p.x, p.y, 2, 12, 0.2, PINK); b.stats.jsShardTurn = (b.stats.jsShardTurn || 0) + 1;
  }
  SKILLS.jsShard = { desc: '상대 쪽으로 조각을 직선으로 쏩니다(ATK×1.1). 맞지 않으면(수명 종료·벽·장애물에 막힘) 맵에 파편이 있을 때 조각이 크게 유턴해 가장 가까운 파편으로 돌아옵니다. 돌아오는 길에도 상대에게 맞습니다(한 번).',
    canUse: (u, e, d, b) => !busy(u) && e && !e.dead && !e.hidden && d > 70 && d < 320,
    use(u, e0, b, s) { const e = foeOf(b, u), S = D.shard, a = Math.atan2(e.y - 18 - (u.y - 18), e.x - u.x); u.facing = Math.cos(a) >= 0 ? 1 : -1; u.swing = 0.2; J_(u).cdT = 0.3; J_(u).cdAng = a;
      b.proj.push({ x: u.x + Math.cos(a) * 12, y: u.y - 18, vx: Math.cos(a) * S.spd, vy: Math.sin(a) * S.spd, spd: S.spd, src: u, dmg: u.st.atk * (s.mult || S.mult), kind: 'jsShard', homing: false, life: S.life, trail: 0,
        hit: { element: 'blunt', delivery: 'ranged', color: LPINK }, r: 9, jsShard: true, draw: drawShard, fizzle: p => shardReturn(b, p) });
      playSfx('shot'); } };

  SKILLS.jsComb = { desc: '1.5초 동안 멈춰 서서 머리를 빗질합니다. 무사히 마치면 그레이트한 기분으로 다른 스킬 하나의 쿨타임을 초기화합니다. 빗질 중 상대의 일반 공격(몸 충돌)이나 근접 공격에 맞으면 머리를 헐뜯은 것으로 간주해 6초 동안 분노: 받는 피해는 그대로지만 경직·기절·넉백·끌림·제압을 무시하고 상대를 계속 추적하며, 도라라라라!의 공격 속도 ×1.5·러쉬 12연타.',
    canUse: (u, e, d, b) => !busy(u) && !angry(u) && !u.airborne && !u.air && e && !e.dead && d > 150 && b.time > 2,
    use(u, e0, b, s) { const T = s.dur || D.comb.dur;
      b.text(u.x, u.y - 70, '머리 손질…', '#e8e0ff', 9);
      u.action = { type: 'jsComb', t: 0, dur: T, step(dt) { this.t += dt; u.moving = false; if (this.t >= this.dur) { u.action = null; combDone(b, u); } } }; } };

  // ---------- 스테이지 훅 (모든 스테이지): 파편 생성·수명, 추적탄 유턴, 분노 추적 ----------
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.jsFrags && b.jsFrags.length) { for (const f of b.jsFrags) if (b.time - f.t0 >= f.life) f.gone = true; if (b.jsFrags.some(f => f.gone)) b.jsFrags = b.jsFrags.filter(f => !f.gone); }
      for (const u of b.u) {
        if (!isJ(u)) continue; const J = J_(u);
        if (J.cdT > 0) J.cdT -= dt;
        if (u.dead || b.over) { J.pdir = null; continue; }
        const prev = J.pdir;
        // 파편 생성: 몸으로 벽·장애물에 부딪혀 진행 방향이 꺾였을 때 (상대와 부딪힌 경우·행동 중·공중 제외)
        if (prev != null && !u.action && !u.airborne && !u.air && !u.push && Math.abs(wrapA(u.dir - prev)) > D.frag.turn && !touchingUnit(b, u) && b.time - J.fragT > D.frag.cd) {
          const r = 12 + u.pad, cx = u.x + Math.cos(prev) * r, cy = u.y + Math.sin(prev) * r;
          J.fragT = b.time; addFrag(b, u, cx, cy, findObj(b, cx, cy));
        }
        // 분노: 상대를 계속 추적 (튕겨도 다시 상대 쪽으로 방향을 꺾음)
        if (angry(u) && !u.action && !u.blocked('blocksMove')) { const e = foeOf(b, u); if (e && !e.dead) { const want = angTo(u, e), df = wrapA(want - u.dir), mx = D.anger.turn * dt; u.dir += clamp(df, -mx, mx); if (u.v) { const sp = Math.hypot(u.v[0], u.v[1]); u.v = [Math.cos(u.dir) * sp, Math.sin(u.dir) * sp]; } }
          if (Math.random() < dt * 10) b.spark(u.x + rand(-8, 8), u.y - rand(6, 32), '#ff5a5a', -40); }
        J.pdir = u.dir;
      }
      // 자동 추적탄: 첫 비행이 경기장 밖으로 나가면 빗나간 것으로 처리(→ 엔진이 fizzle 로 유턴), 돌아오는 조각은 파편 쪽으로 크게 선회
      const P = b.play || AR;
      for (const p of b.proj) {
        if (!p.jsShard || p.life <= 0) continue;
        if (!p.jsBack) { if (!p.reflected && (p.x < P.x + 4 || p.x > P.x + P.w - 4 || p.y < P.y - 10 || p.y > P.y + P.h - 14)) p.life = 0; continue; }
        if (p.reflected) continue;
        let f = p.jsFrag; if (!f || f.gone) { const F = p.src && fragsOf(b, p.src); f = p.jsFrag = F && F.length ? F.reduce((m, x) => Math.hypot(x.x - p.x, x.y - p.y) < Math.hypot(m.x - p.x, m.y - p.y) ? x : m) : null; }
        if (!f) { p.life = 0; b.burst(p.x, p.y, '#c8b898', 4); continue; }
        p.jsT = (p.jsT || 0) + dt; // 선회력은 시간이 갈수록 강해짐 (파편 주위를 계속 맴도는 것 방지)
        // 목표: 파편이 생길 때 죠스케가 서 있던 자리(경기장 안쪽) — 벽 속 파편을 노리다 경기장 밖으로 나가 사라지지 않게
        const tx = f.ax, ty = f.ay - 14, want = Math.atan2(ty - p.y, tx - p.x), cur = Math.atan2(p.vy, p.vx), out = p.x < P.x + 6 || p.x > P.x + P.w - 6 || p.y < P.y - 6 || p.y > P.y + P.h - 16;
        const mx = out ? TAU : (D.shard.turn + 9 * p.jsT) * dt, na = cur + clamp(wrapA(want - cur), -mx, mx); // 경기장 끝에 닿으면 바로 파편 쪽으로 꺾음
        p.vx = Math.cos(na) * p.spd; p.vy = Math.sin(na) * p.spd;
        if (Math.hypot(tx - p.x, ty - p.y) < 16) { p.life = 0; b.sparks(f.x, f.y - 8, LPINK, 6, 120); b.ring(f.x, f.y - 6, 2, 14, 0.25, PINK); b.stats.jsShardHome = (b.stats.jsShardHome || 0) + 1; }
      }
    },
    drawUnder(ctx, b) { // 파편 (바닥, 분홍빛으로 깜빡임 · 사라지기 직전 흐려짐)
      const L = b.jsFrags; if (!L || !L.length) return;
      for (const f of L) { if (f.gone) continue; const age = b.time - f.t0, k = Math.min(1, age / 0.15) * Math.min(1, (f.life - age) / 1.2), C = FRAG_COL[f.kind] || FRAG_COL.wall;
        ctx.save(); ctx.globalAlpha = 0.25 * k * (0.6 + 0.4 * Math.sin(b.time * 6 + f.t0 * 3)); ctx.fillStyle = PINK; ctx.beginPath(); ctx.ellipse(f.x, f.y, 11, 5, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.95 * k; for (const [dx, dy, s, c] of f.pcs) { ctx.fillStyle = C[c]; ctx.fillRect(Math.round(f.x + dx - s / 2), Math.round(f.y + dy - s / 2 - 1), Math.ceil(s), Math.ceil(s)); }
        if (f.obj) { ctx.fillStyle = PINK; ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 7, 2, 2); }
        ctx.restore(); }
    },
    drawOver(ctx, b) { // 크레이지 다이아몬드 (러쉬·고쳐놓기·원상복구 중) + 분노 표시 + 빗질
      for (const u of b.u) { if (!isJ(u) || u.dead || u.hidden) continue; const J = u.js || {}, z = b.airZ(u), A = u.action;
        if (J.rush) { const a = J.rush.ang, f = Math.cos(a) >= 0 ? 1 : -1, reach = u.reach + J.rush.grow;
          drawCD(ctx, u.x + Math.cos(a) * 10 - f * 4, u.y - 2 - z + Math.sin(b.time * 40) * 1.5, f, 0.85, 2.4);
          for (let k = 0; k < 6; k++) { const ph = b.time * 37 + k * 1.7, along = 14 + (reach - 12) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(ph))), side = Math.sin(ph * 1.9 + k) * 9;
            drawFist(ctx, u.x + Math.cos(a) * along - Math.sin(a) * side, u.y - 22 - z + Math.sin(a) * along * 0.6 + Math.cos(a) * side * 0.5, a); }
        } else if (J.cdT > 0 || (A && A.type === 'jsRestore')) { const a = A && A.type === 'jsRestore' ? A.ang : (J.cdAng ?? (u.facing > 0 ? 0 : Math.PI)), f = Math.cos(a) >= 0 ? 1 : -1;
          drawCD(ctx, u.x + Math.cos(a) * 14, u.y - 4 - z, f, 0.75, 2.4); }
        if (A && A.type === 'jsComb') { // 빗 (머리 위에서 왔다 갔다)
          const cx = u.x + Math.sin(b.time * 14) * 6, cy = u.y - 44 - z; ctx.fillStyle = '#8a5a30'; ctx.fillRect(Math.round(cx) - 5, Math.round(cy), 10, 2); ctx.fillStyle = '#c8905a'; for (let i = -4; i <= 4; i += 2) ctx.fillRect(Math.round(cx) + i, Math.round(cy) + 2, 1, 2);
          const k = Math.min(1, A.t / A.dur); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(Math.round(u.x) - 12, Math.round(u.y - 52 - z), 24, 3); ctx.fillStyle = '#fff6a8'; ctx.fillRect(Math.round(u.x) - 12, Math.round(u.y - 52 - z), Math.round(24 * k), 3); }
        if (angry(u)) { const x = Math.round(u.x + u.facing * 9), y = Math.round(u.y - 46 - z), s = Math.sin(b.time * 18) > 0 ? 1 : 0; ctx.fillStyle = '#ff3a3a'; // 💢 표시
          ctx.fillRect(x - 4 - s, y - 4, 3, 1); ctx.fillRect(x - 4 - s, y - 4, 1, 3); ctx.fillRect(x + 2 + s, y - 4, 3, 1); ctx.fillRect(x + 4 + s, y - 4, 1, 3);
          ctx.fillRect(x - 4 - s, y + 2, 1, 3); ctx.fillRect(x - 4 - s, y + 4, 3, 1); ctx.fillRect(x + 4 + s, y + 2, 1, 3); ctx.fillRect(x + 2 + s, y + 4, 3, 1); }
      }
    },
  });

  CHARACTERS.push({
    id: ID, name: '죠스케', fullName: '히가시카타 죠스케', gender: 'male', color: '#4a3a7a',
    stats: { hp: 940, atk: 31, spd: 270, range: 30, atkRate: 0.8, def: 20, crit: 0.06, critMult: 1.7 },
    attack: { element: 'blunt', delivery: 'melee' },
    skills: [
      { id: 'jsFix', name: '일단 너를 고쳐놓으면 말야...', cd: 14, wind: 0.28, heal: 0.10, dur: 2.5 },
      { id: 'jsRestore', name: '원상복구', cd: 6 },
      { id: 'jsShard', name: '자동 추적탄!', cd: 6.5, mult: 1.1 },
      { id: 'jsComb', name: '머리 손질', cd: 13, dur: 1.5 },
    ],
    passiveDesc: '도라라라라!(평타): 한 번에 주먹 8연타 러쉬(한 대 ATK×0.24). 첫 주먹은 사거리가 짧고 한 대마다 7px씩 더 뻗음(최대 +60), 러쉬가 끝나면 초기화. 파편: 몸으로 벽·장애물에 부딪히면 그 자리에 파편(최대 6개, 10초)이 생기고, 내구도 있는 오브젝트(건물·철망·얼음벽)의 파편은 원상복구로 그 오브젝트를 되살립니다.',
    sprite: { // 16x16 절차적 도트 (직접 그림): 앞으로 솟은 검은 퐁파두르, 남색 학란·옷깃의 분홍 하트 배지·금 장식
      pal: { H: '#221a2e', h: '#5a4a72', S: '#f2c9a0', E: '#2a2230', m: '#8a4038', B: '#2a2a50', A: '#e8c050', P: '#ff7ac0', L: '#202440', D: '#2a2020' },
      rows: { 0: '....HHHHHH......', 1: '.HHHHhhHHHH.....', 2: 'HHHHHHHHHHHH....', 3: '...HHHHHHHHH....', 4: '....HSESSESH....', 5: '....SSSSSSSS....', 6: '.....SSmmSS.....', 7: '....BBBAABBB....',
        8: '...BBPBBBBPBB...', 9: '...SBBBABBBBS...', 10: '...SBBBABBBBS...', 11: '....BBBBBBBB....', 12: '....LLL..LLL....', 13: '....LLL..LLL....', 14: '....DDD..DDD....', 15: '................' },
    },
    lines: {
      cd: { hairInsult1: 0, hairInsult2: 0, hairInsult3: 0, combDone: 0 },
      skill: {
        '원상복구': ['크레이지 다이아몬드!', '원래대로 돌려놓겠어!'],
        '일단 너를 고쳐놓으면 말야...': ['일단 너를 고쳐놓으면 말야…', '다 나았지? 그럼 이제…'],
        '자동 추적탄!': ['자동 추적탄이다!', '돌아오는 길도 조심하라고!'],
        '머리 손질': ['잠깐, 머리 좀 정리하고…', '이 머리는 소중하거든.'],
      },
      event: {
        battleStart: ['그레이트하구만…', '덤벼 보라고!'],
        hairInsult1: ['지금 내 머리 보고 뭐라 지껄였나?'],
        hairInsult2: ['똑똑히 들었다고 이 자식아!'],
        hairInsult3: ['이 머리를 욕하는 건 누구도 용서 못해!'],
        combDone: ['그레이트!', '좋아, 완벽해.'],
        lowHp: ['아직 끝난 게 아니라고!'], stunned: ['크윽…!'],
        win: ['그레이트!', '원상복구는 안 해 줄 거다.'], lose: ['크윽… 그레이트하지 못하네…'],
      },
    },
  });
})();
