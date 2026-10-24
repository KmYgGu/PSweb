/* =========================================================
 * 구울즈 (세 번째 듀얼리스트) — 미소녀 카드 덱 40장 (전부 몬스터)
 *  - 프레임워크: js/duel.js 재사용 (패/드로우/LP/릴리스/묘지/AI 점수/HUD/상단 UI 위 몬스터 훅)
 *  - 카드 id G01~G40 = 유저 목록 번호. 스프라이트: assets/Ghouls/monsters/Gxx.png (덮어쓰기로 교체)
 *  - 엔진 확장 (이 파일):
 *     · 소환수 유닛(천동·RAI-MEI·에클레시아·시트리스·에지르·아드라·수견사가 부른 캐릭터): b.u 에 들어가지만
 *       승패/결과/팀 판정에서 제외 (u.summon). 쓰러지면 조용히 사라지고 '파괴된 소환수' 로 기록(메멘토 엔위치)
 *     · 도발(u.gTaunt), 투사체 동결/흡수 (b.proj + 카이바 b.kproj 모두), 디버프 면역(gImmune)
 *     · 스테이지 교체 G.switchStage (파멸의 미의 신 루인 / 아르고스타즈 아드라)
 *  - 모든 공격은 시전 순간 위치/방향 고정(비추적). 예외: 라크리모사(카드 문구: 따라다님)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2, CFG = DUEL.CFG, LPK = CFG.LP_SCALE;
  const say = DUEL.say, sys = DUEL.sys;
  const SPR = id => 'G' + String(id).padStart(2, '0');
  // ---------- 스프라이트 (PNG, 교체 가능) ----------
  const MON_DIR = 'assets/Ghouls/monsters/';
  for (let i = 1; i <= 40; i++) DUEL_SPRITES[SPR(i)] = { src: MON_DIR + SPR(i) + '.png', h: 40 };
  for (let i = 1; i <= 40; i++) try { DuelSprites.get(SPR(i)); } catch (e) { } // 미리 로드 시작

  // ---------- 공용 ----------
  const angTo = (u, t) => Math.atan2(t.y - u.y, t.x - u.x);
  const mainFoe = (b, u) => b.u.find(o => o.team !== u.team && !o.summon && !o.dead) || b.enemy(u);
  const free = (b, x, y) => { if (b.blockAt(x, y)) return false; const q = b.clampPos(x, y, 0); return Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1; };
  function rayLen(b, x, y, ca, sa, max) { let L = 0; while (L < max) { if (!free(b, x + ca * (L + 6), y + sa * (L + 6))) break; L += 6; } return L; }
  function spot(b, pad, avoid, minD = 70, far) {
    let best = null, bd = -1;
    for (let i = 0; i < 60; i++) {
      const x = rand(30, 330), y = rand(140, 590), q = b.clampPos(x, y, pad);
      if (Math.abs(q.x - x) > 1 || Math.abs(q.y - y) > 1 || b.blockAt(x, y, pad + 4) || b.zoneAt(x, y)) continue;
      const d = avoid ? Math.hypot(avoid.x - x, avoid.y - y) : 999;
      if (!far && d >= minD) return { x, y };
      if (far && d > bd) { bd = d; best = { x, y }; }
    }
    return best || { x: b.clampPos(180, 380, pad).x, y: b.clampPos(180, 380, pad).y };
  }
  const acts = b => b.gAct || (b.gAct = []);
  function actor(b, spr, x, y, dur, o = {}) { const A = { spr, x, y, z: 0, t: 0, dur, face: o.face || 1, a: 1, k: o.k || 1, upd: o.upd || null, ghost: o.ghost }; acts(b).push(A); b.glow(x, y - 20, 26, '#ffd0ec', 0.3); return A; }
  const hitO = (ctx, x) => ({ element: ctx.card.element || 'dark', delivery: 'ranged', ...x });
  function fanAt(ctx, O, a, R, sp, amt, o = {}) { // 부채꼴: 위치·방향 고정
    const { b, u } = ctx, dl = o.delay ?? 0.28, col = o.color || '#ffc8e8';
    b.telegraphFan(O.x, O.y - 14, a, sp, R, dl, col);
    b.later(dl, () => {
      if (u.dead || b.over) return;
      for (let i = -1; i <= 1; i++) b.crescent(O.x + Math.cos(a + i * sp * 0.6) * R * 0.55, O.y - 16 + Math.sin(a + i * sp * 0.6) * R * 0.55, R * 0.35, a - 0.7, col, 0.25);
      for (const f of b.foes(u)) { const d = Math.hypot(f.x - O.x, f.y - O.y), fa = Math.atan2(f.y - O.y, f.x - O.x), df = Math.abs(Math.atan2(Math.sin(fa - a), Math.cos(fa - a))); if (d <= R + f.pad && df <= sp + 0.15) { const r = ctx.damage(f, amt, hitO(ctx, { delivery: o.delivery || 'melee', element: o.element, applies: o.applies, big: o.big })); if (o.onHit && r > 0) o.onHit(f); } }
      if (o.after) o.after();
    });
  }
  function circleAt(ctx, x, y, r, delay, amt, o = {}) {
    const { b, u } = ctx; b.telegraphCircle(x, y, r, delay, o.col || '#ffb0d8');
    b.later(delay, () => { if (b.over) return; if (!o.noFx) b.explosion(x, y, r); for (const f of b.foes(u)) if (Math.hypot(f.x - x, (f.y - y) / 0.8) <= r + 8 + f.pad && !f.airborne) { const d = ctx.damage(f, amt, hitO(ctx, { delivery: o.delivery || 'melee', element: o.element, big: true, applies: o.applies })); if (o.onHit && d > 0) o.onHit(f); } });
  }
  function beamAt(ctx, x0, y0, a, amt, o = {}) { // 직선 광선: 방향 고정, 벽에서 멈춤
    const { b, u } = ctx, ca = Math.cos(a), sa = Math.sin(a), w = o.w || 22, L = rayLen(b, x0, y0, ca, sa, o.len || 480), wu = o.windup ?? 0.4;
    b.telegraphLine(x0, y0 - 24, x0 + ca * L, y0 + sa * L - 24, w, wu, o.col || '#e0b0ff');
    b.later(wu, () => {
      if (u.dead || b.over) return;
      b.streak(x0, y0 - 24, x0 + ca * L, y0 + sa * L - 24, o.col || '#c890ff', w, 0.4); b.streak(x0, y0 - 24, x0 + ca * L, y0 + sa * L - 24, '#ffffff', w * 0.35, 0.3); b.shake(2.5);
      for (const f of b.foes(u)) { const dx = f.x - x0, dy = f.y - y0, al = dx * ca + dy * sa, pp = Math.abs(-dx * sa + dy * ca); if (al > -10 && al < L + 10 + f.pad && pp < w / 2 + 10 + f.pad) ctx.damage(f, amt, hitO(ctx, { big: true, element: o.element })); }
    });
  }
  function shot(ctx, x, y, a, amt, o = {}) { // 논타겟 투사체 (b.proj, 직진)
    const { b, u } = ctx, sp = o.spd || 460;
    b.proj.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spd: sp, src: u, dmg: amt, kind: o.kind || 'magic', homing: false, life: o.life || 1.6, trail: 0, r: o.r, hit: { element: o.element || ctx.card.element || 'dark', delivery: 'ranged', cardDmg: true, gShot: true, applies: o.applies } });
  }
  const effLv = ci => DUEL.effLv(ci);
  const sDraw = (b, u, n) => { const D = u.duel; n = Math.max(0, Math.min(n, D.deck.length - 2)); return n ? DUEL.draw(b, u, n, { safe: true }) : 0; }; // 효과 드로우: 덱 2장은 남김 (덱 아웃 방지)
  function setNextLv(b, u, lv, why) { // 다음 드로우를 레벨 lv(가까운) 몬스터로 지정 (카이바 nextDraw 재사용)
    const D = u.duel; if (!D || !D.deck.length) return false;
    const L = D.deck.slice().sort((a, z) => Math.abs(effLv(a) - lv) - Math.abs(effLv(z) - lv) || Math.random() - 0.5); const c = L[0];
    D.nextDraw = c.id; b.text(u.x, u.y - 76, `다음 드로우: Lv${effLv(c)}`, '#cfe8ff', 9); say(b, u, `${why}: 다음 드로우를 레벨 ${effLv(c)} 몬스터(${c.def.name})로 지정`); return true;
  }

  // ---------- 상태 ----------
  STATUS_DEFS.gSleep = { name: '수면', color: '#c8b8ff', tint: '#8a7ad8', tintA: 0.25, blocksMove: true, blocksAct: true, particle: '#e0d8ff', onApply(u) { u.action = null; }, onDamaged(u, b, s, o) { if (!o.dot && s.src !== u) s.t = 0; return 1; } };
  STATUS_DEFS.gStop = { name: '시간 정지', color: '#e0e0e8', tint: '#b0b0c0', tintA: 0.5, blocksMove: true, blocksAct: true, noResistScale: true, onApply(u) { u.action = null; } };
  STATUS_DEFS.gFrozen = { name: '빙결', color: '#9fe0ff', tint: '#9fe0ff', tintA: 0.45, blocksMove: true, blocksAct: true, onApply(u) { u.action = null; } };
  STATUS_DEFS.gCastle = { name: '백은성', color: '#e8ecf8', tint: '#d8dcf0', tintA: 0.12, noResistScale: true }; // 작은 성 안에서 조금 움직일 수 있음 (step에서 성 안으로 제한)

  // ---------- 엔진 패치 ----------
  const BP = Battle.prototype;
  const oTeamAlive = BP.teamAlive; BP.teamAlive = function (t) { return this.u.some(o => o.team === t && !o.dead && !o.summon); };
  const oTeamBest = BP.teamBest; BP.teamBest = function (t) { const L = this.u.filter(o => o.team === t && !o.summon); return L.filter(o => !o.dead).sort((a, c) => c.hp / c.maxHp - a.hp / a.maxHp)[0] || L[L.length - 1]; };
  const oEnemy = BP.enemy; BP.enemy = function (u) {
    const T = u.gTaunt; if (T && !T.dead && T.gTauntT > this.time && this.u.includes(T)) return T;
    if (u.summon) { const m = this.u.find(o => o.team !== u.team && !o.summon && !o.dead); if (m) return m; }
    return oEnemy.call(this, u);
  };
  const oKill = BP.kill; BP.kill = function (tgt, src) {
    if (tgt.summon) { if (tgt.dead) return; tgt.hp = 0; tgt.dead = true; tgt.action = null; tgt.statuses = []; this.burst(tgt.x, tgt.y - 16, '#ffc8e8', 14); this.text(tgt.x, tgt.y - 50, `${tgt.def.name} 파괴`, '#ffb0d8', 9); (this.gLost || (this.gLost = [])).push({ key: tgt.summon.key, team: tgt.team, owner: tgt.summon.owner, hp: tgt.maxHp }); const S = tgt.summon; S.onEnd && S.onEnd(tgt, true); S.ended = true; return; }
    const r = oKill.call(this, tgt, src);
    if (tgt.dead) for (const o of this.u) if (o.summon && o.team === tgt.team && !o.dead) { o.dead = true; o.summon.ended = true; }
    return r;
  };
  const oApplyStatus = BP.applyStatus; BP.applyStatus = function (tgt, id, dur, src, o) {
    const d = STATUS_DEFS[id];
    if (tgt.gImmune > this.time && d && !d.positive) { this.text(tgt.x, tgt.y - 70, '면역', '#e8f0ff', 9); return null; }
    return oApplyStatus.call(this, tgt, id, dur, src, o);
  };
  // 투사체 동결/흡수: 업데이트 전후로 위치 고정 (b.proj, b.kproj 모든 형태)
  const projLists = b => [b.proj, b.kproj || []];
  const oUpdate = BP.update; BP.update = function (dt) {
    const fr = [];
    if (this.gFrozenP) for (const L of projLists(this)) for (const p of L) if (p.gFrz > 0) { p.gFrz -= dt; fr.push([p, p.x, p.y, p.life, p.t, p.done, p.vx, p.vy]); p.done = true; }
    const r = oUpdate.call(this, dt);
    for (const [p, x, y, life, t, done, vx, vy] of fr) { p.x = x; p.y = y; if (life != null) p.life = life; if (t != null) p.t = t; p.done = done; p.vx = vx; p.vy = vy; if (p.gFrz <= 0) p.done = done; }
    if (fr.length && !fr.some(f => f[0].gFrz > 0)) this.gFrozenP = false;
    return r;
  };
  const projDmg = p => p.dmg != null ? p.dmg : p.amt != null ? p.amt : 20;
  const projSrc = p => p.src || p.u;
  const projPos = p => p.type === 'shell' ? { x: p.sx + (p.tx - p.sx) * (p.t / p.dur), y: p.sy + (p.ty - p.sy) * (p.t / p.dur) - 14 } : { x: p.x, y: p.y };

  // ---------- 소환수 ----------
  const SUMDEF = {};
  function sumDef(key, name, card, st, o = {}) {
    SUMDEF[key] = { id: 'gsum_' + key, name, gender: 'female', color: o.color || '#ff9ad8', summonDef: true,
      stats: { hp: 100, atk: 10, spd: 0, range: 999, atkRate: 0.8, def: 0, ...st }, attack: { element: o.element || 'blunt', delivery: 'melee' },
      skills: [], sprite: { src: MON_DIR + SPR(card) + '.png', height: o.h || 46, foot: 1 }, lines: { skill: {}, event: {} } };
  }
  sumDef('chundong', '천동', 14, { hp: 200, atk: 14, spd: 150, range: 30, atkRate: 0.9 }, { element: 'fire', h: 50, color: '#e83a3a' });
  sumDef('raimei', 'RAI-MEI', 24, { hp: 170 }, { color: '#c8306a' });
  sumDef('ecclesia', '에클레시아', 7, { hp: 150, atk: 12, range: 40, atkRate: 1.0 }, { element: 'slash', color: '#f0d890' });
  sumDef('sitri', '시트리스', 16, { hp: 130 }, { color: '#ff9ab8' });
  sumDef('ejir', '에지르', 28, { hp: 120, spd: 38 }, { color: '#9af0c8' });
  sumDef('adra', '아드라', 29, { hp: 200, atk: 12, spd: 230, range: 30, atkRate: 1.0 }, { color: '#5ab8f0' });
  const SUMMON_DEFS = Object.values(SUMDEF);
  const STAGE_UNIT_KEYS = ['lap', 'socAI', 'ffAI', 'ffFood', 'ffWall', 'hpPrev'];
  function summon(b, owner, key, x, y, o = {}) {
    const def = o.def || SUMDEF[key]; if (!def || b.over) return null;
    const s = new Unit(def, owner.team, 7 + (b.gSumN = (b.gSumN || 0) + 1), 1);
    const q = b.clampPos(x, y, s.pad, s); s.x = q.x; s.y = q.y; b.resolveBuildings(s, true); s.zone = b.zoneAt(s.x, s.y);
    if (o.hp) s.maxHp = s.hp = s.st.hp = o.hp;
    s.summon = { owner, key, t: o.dur || 8, dur: o.dur || 8, onEnd: o.onEnd || null, step: o.step || null, ...o.extra };
    s.gender = def.gender || 'female';
    if (!def.stats.atkRate || def.stats.range >= 80) s.atkT = 1e9;
    for (const k of STAGE_UNIT_KEYS) if (owner[k] !== undefined && s[k] === undefined) s[k] = owner[k] && typeof owner[k] === 'object' ? JSON.parse(JSON.stringify(owner[k])) : owner[k];
    if (s.socAI) s.socAI = { mode: 'free', t: 0.5 }; if (s.ffAI) { s.ffAI = { mode: 'free', t: 0.8 }; s.ffFood = null; }
    s.dir = rand(0, TAU); s.facing = owner.facing;
    b.u.push(s); b.smoke(s.x, s.y - 14, '#ffd0ec', 8); b.ring(s.x, s.y, 4, 26, 0.4, '#ffb0d8');
    if (!o.quiet) b.text(s.x, s.y - 56, `${def.name} 소환!`, '#ffd0ec', 9);
    return s;
  }
  function removeSummon(b, s) {
    const i = b.u.indexOf(s); if (i < 0) return;
    if (!s.summon.ended) { s.summon.ended = true; s.summon.onEnd && s.summon.onEnd(s, false); }
    b.u.splice(i, 1);
    for (const o of b.u) { if (o.tgtU === s) o.tgtU = null; if (o.gTaunt === s) o.gTaunt = null; if (o.action && (o.action.tgt === s || o.action.e === s)) o.action = null; if (o.pull && o.pull.src === s) o.pull = null; }
    for (const p of b.proj) if (p.tgt === s) p.tgt = null;
    if (!s.dead) b.smoke(s.x, s.y - 14, '#ffd0ec', 6);
  }
  function stepSummons(b, dt) {
    for (const s of b.u.slice()) {
      if (!s.summon) continue; const S = s.summon;
      const ownerGone = !b.u.includes(S.owner) || S.owner.dead;
      if (s.dead) { if (s.deadT > 0.8 || ownerGone) removeSummon(b, s); continue; }
      S.t -= dt; if (S.step && !b.over) S.step(s, dt);
      if (S.t <= 0 || ownerGone || b.over) removeSummon(b, s);
    }
  }

  // ---------- 스테이지 교체 ----------
  const CORE = new Set(['u', 'proj', 'parts', 'texts', 'tele', 'timers', 'fx', 'time', 'slowT', 'zoom', 'lastBump', 'over', 'winner', 'ended', 'endT', 'shakeT', 'shakeA', 'hooks', 'visualFx', 'visualTime', 'impactReady', 'finisher', 'stats', 'endType', 'resultText', 'multi', 'freeze', 'exodia', 'duelFx', 'duelHaz', 'duelSpirits', 'duelPops', 'kfx', 'kproj', 'kStorm', 'gAct', 'gLost', 'gSumN', 'gFrozenP', 'gCrack', 'gZone', 'gShield', 'gStage', '_shk', '_topPass', 'fallen', 'gSlime']);
  const UNIT_SKIP = new Set(['duel', 'duelHud', 'nBuffs', 'lastHp', 'summon', 'tgtU']);
  function teamDefs(b) { return [0, 1].map(t => { const m = b.u.filter(o => o.team === t && !o.summon); return (m.find(o => o.def.partner) || m[m.length - 1]).def; }); }
  function switchStage(b, id) {
    if (!STAGE_DEFS[id] || b.over) return false;
    const [dA, dB] = teamDefs(b), T = new Battle(dA, dB, {}, id), T0 = new Battle(dA, dB, {}, b.stageId);
    const fresh = new Set(Object.keys(new Unit(dA, 0)));
    const pairs = T.u.map(tu => [tu, b.u.find(o => o.team === tu.team && o.slot === tu.slot && !o.summon)]);
    const remap = (v, d) => {
      if (!v || typeof v !== 'object' || d > 5) return v;
      const pr = pairs.find(p => p[0] === v); if (pr) return pr[1] || v;
      if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = remap(v[i], d + 1); return v; }
      if (Object.getPrototypeOf(v) === Object.prototype) { for (const k of Object.keys(v)) v[k] = remap(v[k], d + 1); }
      return v;
    };
    for (const k of Object.keys(T0)) if (!CORE.has(k) && !(k in T)) delete b[k];
    for (const k of Object.keys(T)) if (!CORE.has(k)) b[k] = remap(T[k], 0);
    const oldKeys = new Set(); for (const tu of T0.u) for (const k of Object.keys(tu)) if (!fresh.has(k) && !UNIT_SKIP.has(k)) oldKeys.add(k);
    for (const u of b.u) {
      for (const k of oldKeys) if (!(T.u[0] && k in T.u[0])) delete u[k];
      const tu = pairs.find(p => p[1] === u)?.[0] || (u.summon && pairs.find(p => p[1] === u.summon.owner)?.[0]);
      if (tu) for (const k of Object.keys(tu)) if (!fresh.has(k) && !UNIT_SKIP.has(k)) u[k] = remap(tu[k] && typeof tu[k] === 'object' && u.summon ? JSON.parse(JSON.stringify(tu[k])) : tu[k], 0);
      u.climb = null; u.inTrain = false; u.beyLap = null; u.beyRush = null; u.beyBusy = false; u.wiggle = 0; u.push = null; u.pull = null;
      u.statuses = u.statuses.filter(s => s.id !== 'clawed' && s.id !== 'pin');
      if (u.air && (u.air.claw || u.air.noLand)) u.air = null;
      if (u.action && ['dash', 'chase', 'charge', 'ride'].includes(u.action.type)) u.action = null;
      if (b.race && tu && !u.summon) { u.x = tu.x; u.y = tu.y; }
      let q = b.clampPos(u.x, u.y, u.pad, u); u.x = q.x; u.y = q.y;
      if (b.blockAt(u.x, u.y, u.pad + 6)) { const p = spot(b, u.pad, null); u.x = p.x; u.y = p.y; }
      b.resolveBuildings(u, true); u.zone = b.zoneAt(u.x, u.y);
    }
    b.proj = b.proj.filter(p => !b.blockAt(p.x, p.y + 14));
    for (const o of b.u) if (o.gCastle) { o.gCastle.cx = undefined; } b.gTS = null; // 스테이지 교체: 성 위치 재설정, 시간정지 연출 해제
    const el = document.getElementById('stageName'); if (el && typeof document !== 'undefined' && window.__battle === b) el.textContent = '🗺 ' + (STAGE_DEFS[id].short || STAGE_DEFS[id].name);
    sys(b, `스테이지 변경: ${STAGE_DEFS[id].name}`);
    return true;
  }
  const SPORT = ['soccer', 'race'];
  const stagePool = b => Object.keys(STAGE_DEFS).filter(k => k !== b.stageId && !STAGE_DEFS[k].test && !STAGE_DEFS[k].hidden);

  // ---------- 카드 ----------
  const mon = (n, name, level, atk, element, text, effect, ai, x = {}) => ({ id: SPR(n), name, type: 'monster', level, atk, def: 0, element, sprite: SPR(n), gender: 'female', text, effect, ai, ...x });
  const gm = (ctx, p) => ctx.u.duel.grave.filter(c => c.def.type === 'monster' && (!p || p(c)));
  const handMon = ctx => ctx.u.duel.hand.filter(c => c.def.type === 'monster' && c !== ctx.inst);
  const bestHand = (S, D, pred) => D.hand.filter(c => c.def.type === 'monster' && (!pred || pred(c))).map(c => ({ c, v: DUEL.AI.rawScore(c.def, S, { tributes: [], free: true }, true) })).sort((a, z) => z.v - a.v)[0];
  const behind = S => S.myHpR < S.oppHpR - 0.12;

  const G = [
    mon(1, '세븐스 로드 위치', 6, 2000, 'fire', '패의 몬스터 1장을 릴리스·레벨 제한 없이 즉시 사용 + 화염 마법탄(ATK×0.6, 직진).', ctx => {
      const { b, u } = ctx, D = u.duel, e = mainFoe(b, u); if (e) shot(ctx, u.x, u.y - 22, angTo(u, e), ctx.atk(0.6), { element: 'fire', kind: 'flame', r: 12 });
      const best = bestHand(ctx.S(), D, c => c !== ctx.inst && c.id !== 'G01'); if (!best) return;
      D.hand.splice(D.hand.indexOf(best.c), 1); D.grave.push(best.c); say(b, u, `세븐스 로드 위치: ${best.c.def.name} 를 레벨 제한 없이 사용!`); b.later(0.5, () => { if (!u.dead && !b.over) ctx.useMonster(best.c, { label: '세븐스 로드' }); });
    }, { tags: ['damage'], dmg: 0.6, score: S => { const B = bestHand(S, S.u.duel, c => c.id !== 'G01' && DUEL.tribNeed(effLv(c)) > 0); return B ? Math.min(40, B.v * 0.6) : -6; } }),
    mon(2, '셀레브로즈 인플루언서즈', 7, 1800, 'light', '묘지 몬스터 1장(최고 레벨)을 덱으로 → 그 레벨만큼 공격력 +8%/Lv. 셀카 플래시(부채꼴, 둔화 2.5초) + 강제 포즈(피해 ATK×0.9).', ctx => {
      const { b, u } = ctx, D = u.duel, e = mainFoe(b, u); if (!e) return;
      const c = gm(ctx).sort((a, z) => effLv(z) - effLv(a))[0]; let lv = 0;
      if (c) { D.grave.splice(D.grave.indexOf(c), 1); D.deck.push(c); DUEL.shuffle(D.deck); lv = effLv(c); say(b, u, `${c.def.name} 묘지 → 덱 (공격력 +${lv * 8}%)`); }
      const a = angTo(u, e), O = { x: u.x, y: u.y };
      actor(b, SPR(2), u.x + Math.cos(a) * 20, u.y, 0.9, { face: Math.cos(a) >= 0 ? 1 : -1 });
      b.glow(u.x + Math.cos(a) * 40, u.y - 24, 50, '#ffffff', 0.25);
      fanAt(ctx, O, a, 150, 0.55, ctx.atk(0.9 * (1 + lv * 0.08)), { delivery: 'ranged', color: '#ffffff', applies: [{ status: 'slow', duration: 2.5 }] });
    }, { tags: ['damage'], range: 170, est: S => DUEL.CFG.ATK_SCALE * 1800 * 0.9 * 1.3 * (1 + Math.min(12, S.graveMonsters ? 6 : 0) * 0.08), score: S => S.graveMonsters ? 6 : -4 }),
    mon(3, '핸디레이디', 7, 2200, 'blunt', '릴리스한 몬스터와 같은 레벨의 몬스터로 다음 드로우를 지정. 멋지게 뛰어내려 착지 지점(시전 순간 상대 위치)에 충격 (ATK×1.0).', ctx => {
      const { b, u } = ctx, D = u.duel, e = mainFoe(b, u);
      const tl = D.gLastTrib && D.gLastTrib.length ? Math.max(...D.gLastTrib) : 1 + Math.floor(Math.random() * 8); D.gLastTrib = null;
      setNextLv(b, u, tl, '핸디레이디');
      if (!e) return; const tx = e.x, ty = e.y, sx = u.x, sy = u.y;
      const A = actor(b, SPR(3), sx, sy, 0.7, { face: tx >= sx ? 1 : -1, upd: (A, dt) => { const k = Math.min(1, A.t / 0.6); A.x = sx + (tx - sx) * k; A.y = sy + (ty - sy) * k; A.z = 90 * 4 * k * (1 - k); } });
      circleAt(ctx, tx, ty, 40, 0.6, ctx.atk(1.0), { element: 'blunt' });
    }, { tags: ['damage'], dmg: 1.0, priority: 2 }),
    mon(4, '아이피 마스카레나', 2, 800, 'dark', '(현재 LP 비율%/10) 레벨 이하의 덱 몬스터 1장을 무작위로 소환(효과 발동). 상대를 놀리고 도망.', ctx => {
      const { b, u } = ctx, D = u.duel, e = mainFoe(b, u), max = Math.floor(u.hp / u.maxHp * 100 / 10);
      const L = D.deck.filter(c => c.def.type === 'monster' && effLv(c) <= max && c.id !== 'G04');
      if (e) { const a = angTo(e, u); actor(b, SPR(4), e.x + 16, e.y, 1.1, { face: -1, upd: (A, dt) => { if (A.t > 0.45) { A.x += Math.cos(a) * 200 * dt; A.y += Math.sin(a) * 200 * dt; } } }); b.text(e.x, e.y - 62, '메롱~♪', '#ffb0e0', 10); }
      if (!L.length) { ctx.text(`Lv${max} 이하 몬스터 없음`, '#c8c8d8'); return; }
      const c = L[Math.floor(Math.random() * L.length)]; D.deck.splice(D.deck.indexOf(c), 1); D.grave.push(c);
      b.later(0.4, () => { if (!u.dead && !b.over) ctx.useMonster(c, { label: `마스카레나(Lv${max} 이하)` }); });
    }, { tags: [], score: S => 6 + S.myHpR * 20 }),
    mon(5, '백은성의 라뷰린스', 8, 2900, 'light', '상대를 내구도 (90 + ATK×0.6) 의 작은 백은성에 7초 가둠: 성 안(좌우 14px·상하 6px)에서만 움직임, 상대가 주는 피해는 성벽이 대신 받음. 오~호호호!', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); if (!e) return;
      const hp = 90 + ctx.atk(0.6) * 1.0; e.gCastle = { hp, max: hp, t: 7, src: u, cx: e.x, cy: e.y }; b.applyStatus(e, 'gCastle', 7, u, { noResistScale: true });
      b.shock(e.x, e.y, 6, 40, '#e8ecf8', 0.5, 5); b.text(e.x, e.y - 70, '백은성!', '#f0f4ff', 12);
      u.gLaugh = { t: 7, n: 0 }; actor(b, SPR(5), u.x - u.facing * 18, u.y - 4, 7, { face: u.facing, upd: (A) => { A.x = u.x - u.facing * 18; A.y = u.y - 4; if (!e.gCastle) A.t = Math.max(A.t, A.dur - 0.3); } });
    }, { tags: ['control'], score: S => (S.oppStunned ? -20 : 14) + (S.oppCasting ? 6 : 0), priority: 6 }),
    mon(6, '섬도희 레이', 4, 1500, 'slash', '묘지 카드 수(N)에 비례해 택1: ① 피해 ATK×(0.4+0.06N) ② 상대 공격력 감소(쇠약) 1.5+0.25N초 ③ LP 회복 60+18N. AI가 상황으로 선택.', ctx => {
      const { b, u } = ctx, D = u.duel, N = D.grave.length, e = mainFoe(b, u), S = ctx.S();
      const pick = S.myHpR < 0.4 && S.missing > 300 ? 3 : (e && effHp(e) < ctx.atk(0.4 + 0.06 * N) * 1.2) ? 1 : (e && e.status('weaken')) ? 1 : 2;
      if (pick === 1 && e) { const a = angTo(u, e); actor(b, SPR(6), u.x, u.y, 0.5, { face: Math.cos(a) >= 0 ? 1 : -1 }); fanAt(ctx, { x: u.x, y: u.y }, a, 120, 0.5, ctx.atk(0.4 + 0.06 * N), { color: '#ff5a5a' }); ctx.text(`① 피해 (묘지 ${N})`, '#ffb0b0'); }
      else if (pick === 2 && e) { const s = e.status('weaken'); const dur = 1.5 + 0.25 * N; if (s) { s.t += dur; s.dur += dur; } else b.applyStatus(e, 'weaken', dur, u); b.text(e.x, e.y - 62, `공격력 감소 +${dur.toFixed(1)}초`, '#9fb0d0', 9); ctx.text(`② 쇠약 (묘지 ${N})`, '#c8d0e8'); }
      else { ctx.heal(60 + 18 * N); ctx.text(`③ 회복 (묘지 ${N})`, '#b8ffd0'); }
    }, { tags: [], score: S => 4 + Math.min(30, S.grave * 1.4) }),
    mon(7, '드래그마의 성녀 에클레시아', 4, 1700, 'light', '무작위 위치에 에클레시아(체력 150) 소환 7초: 상대를 도발(상대의 공격 대상 고정), 가까이 오면 기본 공격.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); const p = spot(b, 0, e, 60);
      const s = summon(b, u, 'ecclesia', p.x, p.y, { dur: 7, extra: { taunt: true } });
      if (s) for (const f of b.foes(u)) if (!f.summon) { f.gTaunt = s; f.gTauntT = b.time + 7; b.text(f.x, f.y - 64, '도발!', '#ffd890', 10); }
    }, { tags: ['defense'], score: S => (S.oppMelee ? 10 : 2) + (S.myHpR < 0.5 ? 8 : 0) }),
    mon(8, '티아라멘츠 루루카로스', 8, 2700, 'ice', '덱 3장을 묘지로 → 보낸 몬스터 레벨 합(ΣLv)만큼 강화된 전체 파도: 모든 캐릭터(자신 포함)에 ATK×(0.5+0.05ΣLv) (자신은 35%).', ctx => {
      const { b, u } = ctx, D = u.duel, n = Math.min(3, Math.max(0, D.deck.length - 3)), out = ctx.deck.mill(n), lv = out.reduce((s, c) => s + effLv(c), 0);
      say(b, u, `덱 → 묘지 ${out.length}장 (레벨 합 ${lv}) <span class="dmini">${out.map(c => c.def.name).join(', ')}</span>`);
      const amt = ctx.atk(0.5 + 0.05 * lv);
      (b.gZone || (b.gZone = [])).push({ type: 'wave', t: 0, dur: 1.2, hit: new Set(), u, amt, ctx });
      b.shake(3); b.text(180, 200, '티아라멘츠 웨이브!', '#9fe0ff', 13);
    }, { tags: ['damage'], est: S => DUEL.CFG.ATK_SCALE * 2700 * 1.3 * (0.5 + 0.05 * 12), score: S => (S.deck < 10 ? -30 : 0) + (S.myHpR < 0.25 ? -25 : 0) }),
    mon(9, '요안의 상검사', 8, 2800, 'slash', '상대를 3초 봉인(스킬/카드 불가) 후, 시전 순간 위치로 일직선 돌진 베기. 거리가 멀수록 큰 피해 ATK×(0.6 + 거리/200).', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); if (!e) return;
      b.applyStatus(e, 'seal', 3, u); b.text(e.x, e.y - 64, '봉인!', '#a8a0ff', 10);
      const a = angTo(u, e), L = rayLen(b, u.x, u.y, Math.cos(a), Math.sin(a), Math.hypot(e.x - u.x, e.y - u.y) + 40), d = L;
      const tx = u.x + Math.cos(a) * L, ty = u.y + Math.sin(a) * L, sx = u.x, sy = u.y, amt = ctx.atk(0.6 + d / 200);
      b.telegraphLine(sx, sy - 18, tx, ty - 18, 26, 0.35, '#c8d8ff');
      actor(b, SPR(9), sx, sy, 0.75, { face: Math.cos(a) >= 0 ? 1 : -1, upd: (A) => { const k = Math.max(0, Math.min(1, (A.t - 0.35) / 0.2)); A.x = sx + (tx - sx) * k; A.y = sy + (ty - sy) * k; } });
      b.later(0.55, () => { if (u.dead || b.over) return; b.streak(sx, sy - 18, tx, ty - 18, '#e0e8ff', 14, 0.3); for (const f of b.foes(u)) { const dx = f.x - sx, dy = f.y - sy, al = dx * Math.cos(a) + dy * Math.sin(a), pp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)); if (al > -10 && al < L + 20 && pp < 26 + f.pad) ctx.damage(f, amt, hitO(ctx, { delivery: 'melee', big: true })); } });
    }, { tags: ['damage', 'control'], est: S => DUEL.CFG.ATK_SCALE * 2800 * 1.3 * (0.6 + Math.min(S.d, 400) / 200), score: S => (S.d > 180 ? 10 : 0) }),
    mon(10, '성전의 수견사', 4, 1600, 'light', '전장에 없는 무작위 캐릭터를 불러 스킬 1개를 쓰게 하고, 스킬이 끝나면 바로 사라짐 (체력 120의 소환수).', ctx => {
      const { b, u } = ctx, ids = new Set(b.u.map(o => o.def.id)); for (const o of b.u) if (o.def.partner) ids.add(o.def.partner.id);
      const pool = CHARACTERS.filter(c => !ids.has(c.id) && !c.duelist && !c.partner && (c.skills || []).some(s => !s.hidden && SKILLS[s.id]));
      const def = pool[Math.floor(Math.random() * pool.length)]; if (!def) return;
      const e = mainFoe(b, u), p = { x: u.x + u.facing * 30, y: u.y };
      const s = summon(b, u, 'borrow', p.x, p.y, { def, dur: 3, hp: 120 }); if (!s) return;
      s.gBorrowed = true; s.skillT = s.skills.map(() => 1e9);
      say(b, u, `성전의 수견사: ${def.name} 소환!`);
      b.later(0.5, () => {
        if (s.dead || !b.u.includes(s) || b.over) return; const t = b.enemy(s); if (!t) return;
        const L = s.skills.map((sl, i) => ({ sl, i })).filter(x => !x.sl.hidden && SKILLS[x.sl.id]); const x = L[Math.floor(Math.random() * L.length)]; if (!x) return;
        b.hooks.onSkill && b.hooks.onSkill(s, x.sl.name, null); b.text(s.x, s.y - 62, x.sl.name + '!', '#fff0c0', 10);
        try { SKILLS[x.sl.id].use(s, t, b, x.sl); } catch (err) { console.warn('[ghoul] borrowed skill failed', def.id, x.sl.id, err); }
        s.gUsed = b.time; // 스킬 동작이 끝나는 즉시 퇴장 (최대 1.5초)
      });
    }, { tags: [], score: () => 16 }),
    mon(11, '엑소시스터 마르파', 4, 1400, 'light', '묘지의 레벨 4 몬스터 수만큼 드로우 (최대 4, 덱 2장은 남김).', ctx => {
      const n = Math.min(4, gm(ctx, c => effLv(c) === 4).length); if (!n) { ctx.text('묘지에 Lv4 없음', '#c8c8d8'); return; } sDraw(ctx.b, ctx.u, n);
    }, { tags: ['draw'], drawFn: S => Math.min(4, S.u.duel.grave.filter(c => c.def.type === 'monster' && effLv(c) === 4).length), when: S => S.u.duel.grave.some(c => c.def.type === 'monster' && effLv(c) === 4) }),
    mon(12, '라이브트윈 키스킬', 2, 1100, 'elec', '자신의 레벨(현재 레벨)×ATK×0.25 피해 직진탄. 그 후 덱에서 라이브트윈 라일라를 패로.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u), lv = effLv(ctx.inst); if (e) shot(ctx, u.x, u.y - 22, angTo(u, e), ctx.atk(0.25 * lv), { element: 'elec', r: 11 });
      if (ctx.deck.search('G13')) ctx.text('라일라 서치!', '#ff9ad0');
    }, { tags: ['damage'], dmg: 0.5, score: S => (S.inDeck('G13') ? 14 : 0), priority: 3 }),
    mon(13, '라이브트윈 라일라', 2, 1100, 'light', '자신의 레벨×45 LP 회복. 그 후 덱에서 라이브트윈 키스킬을 패로.', ctx => {
      ctx.heal(45 * effLv(ctx.inst)); if (ctx.deck.search('G12')) ctx.text('키스킬 서치!', '#9ae0ff');
    }, { tags: ['heal'], heal: 90, score: S => (S.inDeck('G12') ? 14 : 0), priority: 3 }),
    mon(14, '쿠리키라 천동', 1, 2500, 'fire', '지금까지 받은 피해(LP)만큼의 체력(일반 체력 환산, 40~520)을 가진 천동을 소환 (15초, 기본 공격만).', ctx => {
      const { b, u } = ctx, hp = Math.round(Math.max(40, Math.min(520, (u.gTaken || 0) / LPK)));
      summon(b, u, 'chundong', u.x + u.facing * 28, u.y, { dur: 15, hp }); ctx.text(`천동 체력 ${hp}`, '#ffb0a0');
    }, { tags: [], score: S => Math.min(40, (S.u.gTaken || 0) / LPK / 12) - 4 }),
    mon(15, '위치크래프트 마스터 베르', 8, 2500, 'dark', '자신과 상대가 함께 잠듦(최대 3.5초, 맞으면 깸). 잠든 시간×90 LP 회복, 잠든 시간 1.2초당 1장 드로우(최대 3).', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u), t0 = b.time;
      b.applyStatus(u, 'gSleep', 3.5, u); if (e) b.applyStatus(e, 'gSleep', 3.5, u);
      b.text(u.x, u.y - 60, 'Zzz…', '#c8b8ff', 11); actor(b, SPR(15), u.x + u.facing * 16, u.y + 2, 3.5, { face: u.facing });
      const check = () => { if (u.dead || b.over) return; if (u.status('gSleep')) { b.later(0.2, check); return; } const st = b.time - t0; ctx.heal(Math.round(st * 90)); sDraw(b, u, Math.min(3, Math.floor(st / 1.2))); sys(b, `베르: ${st.toFixed(1)}초 수면 → 회복·드로우`); };
      b.later(0.25, check);
    }, { tags: [], score: S => (S.myHpR < 0.6 ? 14 : 2) + (S.oppMelee && S.d < 90 ? -8 : 0) + (S.hand <= 2 ? 6 : 0) }),
    mon(16, '시트리스의 충혹마', 4, 1500, 'dark', '시트리스 소환 6초. 남성 캐릭터는 하트를 띄우며 시트리스에게 끌려가고(이동 방향 고정), 여성은 멀리 피함. 오리=중립.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u), p = e ? { x: (u.x + e.x) / 2, y: (u.y + e.y) / 2 } : { x: u.x, y: u.y };
      summon(b, u, 'sitri', p.x, p.y, { dur: 6, step: sitriStep });
    }, { tags: ['control'], score: S => 10 + (S.e && charmGender(S.e) === 'male' ? 6 : 0) }),
    mon(17, '엑소시스터 이렌느', 4, 1400, 'light', '5초간 모든 디버프 면역 + 현재 디버프 해제.', ctx => {
      const { b, u } = ctx; u.gImmune = b.time + 5; u.statuses = u.statuses.filter(s => STATUS_DEFS[s.id] && STATUS_DEFS[s.id].positive);
      b.ring(u.x, u.y - 18, 6, 36, 0.5, '#f0f4ff'); ctx.text('디버프 면역!', '#f0f4ff');
    }, { tags: ['defense'], score: S => (S.u.statuses.length ? 20 : -6) + (S.oppStatusHeavy ? 6 : 0) }),
    mon(18, '다이놀피어 켄트레기나', 6, 2400, 'slash', '클로 베기 (부채꼴 115, 시전 위치 고정). 남은 LP 비율에 비례: ATK×(0.5 + 1.0×LP%).', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); if (!e) return; const a = angTo(u, e);
      actor(b, SPR(18), u.x + Math.cos(a) * 16, u.y, 0.6, { face: Math.cos(a) >= 0 ? 1 : -1 });
      fanAt(ctx, { x: u.x, y: u.y }, a, 115, 0.6, ctx.atk(0.5 + u.hp / u.maxHp), { color: '#ff4a5a' });
    }, { tags: ['damage'], range: 140, est: S => DUEL.CFG.ATK_SCALE * 2400 * 1.3 * (0.5 + S.myHpR), melee: true }),
    mon(19, '아로마지 로즈마리', 4, 1500, 'blunt', '지팡이로 때림 (근접 부채꼴 95, ATK×0.7) + 기절 0.6초, 자신의 체력 비율이 상대보다 높으면 기절 1.5초.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); if (!e) return; const a = angTo(u, e), st = (u.hp / u.maxHp) > (e.hp / e.maxHp) ? 1.5 : 0.6;
      actor(b, SPR(19), u.x + Math.cos(a) * 16, u.y, 0.6, { face: Math.cos(a) >= 0 ? 1 : -1 });
      fanAt(ctx, { x: u.x, y: u.y }, a, 95, 0.6, ctx.atk(0.7), { onHit: f => b.applyStatus(f, 'stun', st, u) });
    }, { tags: ['damage', 'control'], range: 120, dmg: 0.7, melee: true }),
    mon(20, '파멸의 미의 신 루인', 10, 3400, 'dark', '스테이지 파괴(1.8초): 균열이 퍼지며 균열 위의 상대에게 0.4초마다 ATK×0.25 → 다른 무작위 스테이지로 재생성.', ctx => {
      const { b, u } = ctx; if (b.gCrack) return; b.shake(4);
      const cr = []; for (let i = 0; i < 6; i++) { const pts = [{ x: rand(30, 330), y: rand(150, 590) }]; for (let k = 0; k < 5; k++) { const l = pts[pts.length - 1]; pts.push({ x: l.x + rand(-60, 60), y: l.y + rand(-60, 60) }); } cr.push(pts); }
      b.gCrack = { t: 0, dur: 1.8, cr, u, ctx, tick: 0.4, amt: ctx.atk(0.25) };
      b.text(180, 220, '파멸의 미!', '#ff7ab0', 14); sys(b, '파멸의 미의 신 루인: 스테이지 파괴!');
    }, { tags: [], score: S => (behind(S) ? 30 : -4) + (S.myHpR < 0.35 ? 10 : 0), priority: 0 }),
    mon(21, '솔도레미코드 그레이시아', 5, 1900, 'light', '패에 짝수 레벨 몬스터가 있으면 1장 드로우, 아직 보여주지 않은 다른 짝수 몬스터를 보여주며 반복(최대 4). 반복 횟수 n만큼 강화된 악보 공격: 범위 100+25n, ATK×(0.4+0.25n).', ctx => {
      const { b, u } = ctx, D = u.duel, shown = new Set(); let n = 0;
      while (n < 4 && D.deck.length > 3) { const c = D.hand.find(c => c.def.type === 'monster' && effLv(c) % 2 === 0 && !shown.has(c) && c !== ctx.inst); if (!c) break; shown.add(c); DUEL.popup(b, u, c.def, false, '공개'); sDraw(b, u, 1); n++; }
      const e = mainFoe(b, u); if (!e) return; const a = angTo(u, e);
      fanAt(ctx, { x: u.x, y: u.y }, a, 100 + 25 * n, 0.5 + 0.05 * n, ctx.atk(0.4 + 0.25 * n), { delivery: 'ranged', color: '#e0c8ff', delay: 0.4 });
      for (let i = 0; i < 6 + n * 2; i++) b.parts.push({ x: u.x, y: u.y - 20, vx: Math.cos(a + rand(-0.5, 0.5)) * rand(120, 260), vy: Math.sin(a + rand(-0.5, 0.5)) * rand(120, 260), life: 0.6, max: 0.6, color: i % 2 ? '#e0c8ff' : '#fff0a0', size: 3 });
      ctx.text(`♪ 반복 ${n}회`, '#e0c8ff');
    }, { tags: ['damage'], range: 200, est: S => DUEL.CFG.ATK_SCALE * 1900 * 1.3 * (0.4 + 0.25 * Math.min(4, S.u.duel.hand.filter(c => c.def.type === 'monster' && effLv(c) % 2 === 0).length)) }),
    mon(22, '트릭스터 홀리엔젤', 1, 1000, 'light', '이 듀얼에서 내 카드 원거리 공격이 맞을 때마다 이 카드 레벨 +1 (최대 12, 어느 영역에 있든). 레벨 수만큼 채찍 연타 (부채꼴 110, 1타 ATK×0.18).', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u), lv = effLv(ctx.inst); if (!e) return; const a = angTo(u, e);
      actor(b, SPR(22), u.x + Math.cos(a) * 16, u.y, 0.3 + lv * 0.12, { face: Math.cos(a) >= 0 ? 1 : -1 });
      for (let i = 0; i < lv; i++) b.later(i * 0.12, () => { if (u.dead || b.over) return; fanAt(ctx, { x: u.x, y: u.y }, a, 110, 0.45, ctx.atk(0.18), { delay: 0.12, color: '#ff8ab8' }); });
      ctx.text(`채찍 ×${lv}`, '#ff8ab8');
    }, { tags: ['damage'], range: 130, est: S => DUEL.CFG.ATK_SCALE * 1000 * 1.3 * 0.18 * (1 + (S.u.gAngelLv || 0)), score: S => (S.u.gAngelLv || 0) * 3 - 6 }),
    mon(23, 'LL-앙상블 로빈', 1, 500, 'light', '로빈이 상대 방향 전방으로 1.6초 날아가며 닿은 상대 원거리 투사체를 흡수(모든 종류). 끝나면 흡수량(최소 ATK×0.3) 그대로 직진탄으로 되돌려줌.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u), a = e ? angTo(u, e) : (u.facing > 0 ? 0 : Math.PI), sx = u.x, sy = u.y - 20;
      const R = { got: 0 };
      actor(b, SPR(23), sx, u.y, 1.7, { face: Math.cos(a) >= 0 ? 1 : -1, upd: (A, dt) => {
        if (A.t < 1.6) { const nx = A.x + Math.cos(a) * 170 * dt, ny = A.y + Math.sin(a) * 170 * dt; if (free(b, nx, ny)) { A.x = nx; A.y = ny; } }
        for (const L of projLists(b)) for (const p of L) { const s = projSrc(p); if (!s || s.team === u.team || p.life <= 0 || p.gAbs) continue; const q = projPos(p); if (Math.hypot(q.x - A.x, q.y - (A.y - 20)) < 26) { p.gAbs = true; R.got += projDmg(p); p.life = 0; if (p.dur) p.t = p.dur + 1; p.done = true; b.burst(q.x, q.y, '#9ae0ff', 6); b.text(A.x, A.y - 50, '흡수!', '#9ae0ff', 9); } }
        if (A.t >= 1.6 && !R.fired) { R.fired = true; const t = mainFoe(b, u); if (t) { const amt = Math.max(ctx.atk(0.3), R.got); shot(ctx, A.x, A.y - 20, Math.atan2(t.y - 18 - (A.y - 20), t.x - A.x), amt, { spd: 560, r: 13, element: 'light' }); if (R.got) say(b, u, `로빈: 흡수한 ${Math.round(R.got)} 피해를 되돌림`); } }
      } });
    }, { tags: ['defense'], score: S => (S.oppRanged ? 10 : -6) + S.incoming * 10 }),
    mon(24, 'RAI-MEI', 3, 1300, 'elec', '그 자리에 RAI-MEI(체력 170, 캐릭터 판정) 5초 소환. 사라질 때 남은 체력 비율 r → 다음 드로우 레벨 ≈ 1 + 9r.', ctx => {
      const { b, u } = ctx; summon(b, u, 'raimei', u.x + u.facing * 26, u.y + 6, { dur: 5, onEnd: (s, killed) => { const r = killed ? 0 : s.hp / s.maxHp; setNextLv(b, u, Math.round(1 + 9 * r), `RAI-MEI (체력 ${Math.round(r * 100)}%)`); } });
    }, { tags: ['defense'], score: S => 8 + (S.oppMelee ? 4 : 0) }),
    mon(25, '마돌체 마죠레느', 4, 1400, 'dark', '패의 몬스터 1장의 레벨을 1~12 중 하나로 변경 (AI: 고레벨은 4로 낮춰 릴리스 없이, 홀리엔젤·키스킬은 높임).', ctx => {
      const { b, u } = ctx, D = u.duel, L = handMon(ctx); if (!L.length) return;
      let c = L.sort((a, z) => effLv(z) - effLv(a))[0], to = 4;
      const ang = L.find(x => x.id === 'G22' || x.id === 'G12' || x.id === 'G13'); if (ang && (effLv(c) <= 4 || Math.random() < 0.4)) { c = ang; to = 12; }
      if (effLv(c) <= 4 && c !== ang) { to = 1 + Math.floor(Math.random() * 12); }
      c.lvMod = to - c.def.level; say(b, u, `마죠레느: ${c.def.name} 레벨 → ${to}`); ctx.text(`${c.def.name} Lv${to}`, '#ff9ac8');
    }, { tags: [], when: S => S.u.duel.hand.some(c => c.def.type === 'monster' && c.id !== 'G25'), score: S => { const h = S.u.duel.hand.filter(c => c.def.type === 'monster' && c.id !== 'G25'); return (h.some(c => effLv(c) >= 7) ? 18 : 0) + (h.some(c => c.id === 'G22') ? 10 : 0) - 2; } }),
    mon(26, '꿈꾸는 네무렐리아', 1, 500, 'dark', '자신의 상태 이상을 전부 상대에게 옮김 (남은 시간 유지). 수면은 자신에게도 그대로 남음.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); if (!e) return; const L = u.statuses.slice(); let n = 0;
      for (const s of L) { if (STATUS_DEFS[s.id] && STATUS_DEFS[s.id].positive) continue; b.applyStatus(e, s.id, s.t, u, { power: s.power }); n++; if (s.id !== 'gSleep') u.statuses.splice(u.statuses.indexOf(s), 1); }
      b.streak(u.x, u.y - 18, e.x, e.y - 18, '#e0c8ff', 8, 0.3); ctx.text(n ? `상태 이상 ${n}개 이동` : '옮길 상태 없음', '#e0c8ff');
    }, { tags: [], score: S => S.u.statuses.filter(s => !(STATUS_DEFS[s.id] || {}).positive).length * 22 - 10 }),
    mon(27, '빙결계의 무희', 4, 1600, 'ice', '얼음 방어막 6초 (반경 36): 닿은 상대는 1초 빙결(대상별 1.5초 간격), 들어온 상대 투사체(모든 종류)는 1.2초 얼어 멈춤.', ctx => {
      const { b, u } = ctx; u.gIce = { t: 6, cd: new Map() }; b.ring(u.x, u.y - 16, 6, 36, 0.5, '#bfefff'); ctx.text('얼음 방어막!', '#bfefff');
    }, { tags: ['defense'], buffType: null, score: S => (S.u.gIce ? -40 : 4) + S.incoming * 10 + (S.oppMelee && S.d < 120 ? 8 : 0) }),
    mon(28, '히스이의 에지르', 3, 1200, 'light', '에지르(체력 120) 8초 소환: 무작위 방향으로 꾸물꾸물 기어다니며 점액을 흘림. 점액(4초) 위의 모든 캐릭터(피아 무관)는 0.5초마다 회복 (일반 3 / 듀얼리스트 LP 14).', ctx => {
      const { b, u } = ctx; summon(b, u, 'ejir', u.x - u.facing * 24, u.y + 8, { dur: 8, step: ejirStep });
    }, { tags: ['heal'], heal: 100, score: S => (S.myHpR < 0.7 ? 8 : -4) }),
    mon(29, '아르고스타즈 영관의 아드라', 4, 1700, 'blunt', '스포츠 스테이지(축구장/레이싱 코스)로 교체 후 아드라(체력 200)가 10초간 참가 (기본 공격과 스포츠 행동만).', ctx => {
      const { b, u } = ctx, L = SPORT.filter(s => s !== b.stageId && STAGE_DEFS[s]);
      const id = L[Math.floor(Math.random() * L.length)];
      b.flash = 1; b.shake(2); b.later(0.3, () => { if (b.over) return; if (id) switchStage(b, id); summon(b, u, 'adra', u.x + u.facing * 26, u.y, { dur: 10 }); });
    }, { tags: [], score: S => (behind(S) ? 22 : -2) + (SPORT.includes(S.b.stageId) ? -10 : 0) }),
    mon(30, '워크라이 웬토', 4, 1600, 'slash', '무작위 위치로 4번 순간이동하며 그 순간 상대 위치를 향해 논타겟 화살 (1발 ATK×0.3).', ctx => {
      const { b, u } = ctx; const A = actor(b, SPR(30), u.x, u.y, 2.2, { face: u.facing });
      for (let i = 0; i < 4; i++) b.later(0.15 + i * 0.5, () => { if (u.dead || b.over) return; const e = mainFoe(b, u); if (!e) return; const p = spot(b, 0, e, 90); b.smoke(A.x, A.y - 14, '#c8f0c8', 5); A.x = p.x; A.y = p.y; A.face = e.x >= p.x ? 1 : -1; b.later(0.18, () => { if (u.dead || b.over || e.dead) return; shot(ctx, A.x, A.y - 20, Math.atan2(e.y - 18 - (A.y - 20), e.x - A.x), ctx.atk(0.3), { kind: 'arrow', spd: 520, element: 'slash' }); }); });
    }, { tags: ['damage'], dmg: 0.9 }),
    mon(31, '워크라이 스키라', 6, 2100, 'blunt', '스키라가 시전 순간 상대 위치로 달려들어 조임: 맞으면 속박 2.5초 + 0.5초마다 ATK×0.12.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); if (!e) return; const tx = e.x, ty = e.y, sx = u.x, sy = u.y;
      b.telegraphCircle(tx, ty, 28, 0.35, '#ffb070');
      actor(b, SPR(31), sx, sy, 3, { face: tx >= sx ? 1 : -1, upd: (A) => { if (A.t < 0.35) { const k = A.t / 0.35; A.x = sx + (tx - sx) * k; A.y = sy + (ty - sy) * k; } else if (A.tgt) { A.x = A.tgt.x - 10; A.y = A.tgt.y + 1; if (!A.tgt.status('bind')) A.t = Math.max(A.t, A.dur - 0.2); } else A.t = Math.max(A.t, A.dur - 0.2); } });
      b.later(0.35, () => { if (u.dead || b.over) return; const A = acts(b).find(x => x.spr === SPR(31)); for (const f of b.foes(u)) if (Math.hypot(f.x - tx, f.y - ty) < 30 + f.pad && !f.airborne) { b.applyStatus(f, 'bind', 2.5, u); if (A) A.tgt = f; for (let i = 1; i <= 5; i++) b.later(i * 0.5, () => { if (!f.dead && f.status('bind') && !b.over) ctx.damage(f, ctx.atk(0.12), hitO(ctx, { delivery: 'melee', dot: true })); }); b.text(f.x, f.y - 60, '조이기!', '#ffb070', 10); break; } });
    }, { tags: ['damage', 'control'], dmg: 0.6, range: 300 }),
    mon(32, '흑마녀 디아벨스타', 7, 2500, 'dark', '순식간에 상대 뒤(0.25초 예고)에 나타나 듀얼리스트 쪽으로 걷어참: ATK×0.9 + 넉백 (벽·장애물에 박히면 추가 ATK×0.4).', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); if (!e) return; const a = angTo(u, e), bx = e.x + Math.cos(a) * 26, by = e.y + Math.sin(a) * 26, ex = e.x, ey = e.y;
      actor(b, SPR(32), bx, by, 0.7, { face: -Math.sign(Math.cos(a)) || -1 }); b.smoke(bx, by - 14, '#3a1020', 6); b.telegraphCircle(ex, ey, 26, 0.25, '#c8303a');
      b.later(0.25, () => { if (u.dead || b.over) return; for (const f of b.foes(u)) if (Math.hypot(f.x - ex, f.y - ey) < 30 + f.pad && !f.airborne) { const r = ctx.damage(f, ctx.atk(0.9), hitO(ctx, { delivery: 'melee', big: true })); if (r > 0) b.knockback(f, Math.atan2(u.y - f.y, u.x - f.x), 520, 0.4, () => { if (!f.dead && !b.over) ctx.damage(f, ctx.atk(0.4), hitO(ctx, { delivery: 'melee', element: 'blunt' })); }); break; } });
    }, { tags: ['damage'], dmg: 1.1 }),
    mon(33, '에스피 리틀 나이트', 2, 1000, 'light', '자신을 가장 안전한 곳(상대·투사체에서 먼 곳)으로 순간이동.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u), p = spot(b, u.pad, e, 0, true); b.smoke(u.x, u.y - 14, '#ffd030', 8); u.action = null; u.push = null; u.x = p.x; u.y = p.y; b.resolveBuildings(u, true); b.ring(u.x, u.y, 4, 28, 0.4, '#ffd030'); ctx.text('안전한 곳으로!', '#ffe080');
    }, { tags: ['defense'], score: S => (S.d < 90 ? 14 : -6) + S.incoming * 8 + (S.myHpR < 0.4 ? 6 : 0) }),
    mon(34, '티아라멘츠 크샤트리라', 7, 2300, 'elec', '다음 몬스터의 릴리스를 "묘지 몬스터를 덱으로"로 대체 (최대 묘지 몬스터 수). 기계 몸통 박치기(부채꼴 110, ATK×0.8) + 8초간 상대 약점 속성을 전기로 덮어씀 (전기 ×1.5, 원래 약점 무효).', ctx => {
      const { b, u } = ctx, D = u.duel, e = mainFoe(b, u); const n = Math.min(3, D.grave.filter(c => c.def.type === 'monster').length);
      if (n) { D.gKsha = true; D.tribCut = n; D.tribCutAll = true; ctx.text(`다음 릴리스: 묘지 ${n}장 → 덱`, '#ff9ad0'); }
      if (!e) return; const a = angTo(u, e); actor(b, SPR(34), u.x + Math.cos(a) * 16, u.y, 0.6, { face: Math.cos(a) >= 0 ? 1 : -1 });
      fanAt(ctx, { x: u.x, y: u.y }, a, 110, 0.55, ctx.atk(0.8), { color: '#ff7ab8', onHit: f => { f.gElecWeak = b.time + 8; b.text(f.x, f.y - 66, '약점: 전기', '#fff07a', 9); } });
    }, { tags: ['damage'], dmg: 0.8, range: 140, score: S => (S.graveMonsters >= 2 && S.u.duel.hand.some(c => c.def.type === 'monster' && effLv(c) >= 7 && c.id !== 'G34') ? 18 : 0) }),
    mon(35, '홍루의 마 라크리모사', 4, 1500, 'dark', '덱 1장을 묘지로. 그 레벨이 패의 카드 레벨과 같으면 공격 ×2. 라크리모사가 5초간 상대를 따라다니며 0.8초마다 귓속말 (ATK×0.12, 필중 — 카드 문구상 추적).', ctx => {
      const { b, u } = ctx, D = u.duel, c = ctx.deck.mill(D.deck.length > 3 ? 1 : 0)[0], m = c && D.hand.some(h => effLv(h) === effLv(c) && h !== ctx.inst) ? 2 : 1;
      if (c) say(b, u, `라크리모사: ${c.def.name}(Lv${effLv(c)}) 묘지로${m > 1 ? ' — 패와 레벨 일치! 공격 ×2' : ''}`);
      const e = mainFoe(b, u); if (!e) return; let tk = 0;
      actor(b, SPR(35), e.x + 14, e.y, 5, { face: -1, ghost: true, upd: (A, dt) => { if (e.dead) { A.t = A.dur; return; } A.x += (e.x + 14 - A.x) * Math.min(1, dt * 4); A.y += (e.y - 2 - A.y) * Math.min(1, dt * 4); tk += dt; if (tk >= 0.8) { tk = 0; ctx.damage(e, ctx.atk(0.12 * m), hitO(ctx, { sure: true })); b.text(e.x + 10, e.y - 58, '…속삭임', '#ff9ab0', 8); } } });
    }, { tags: ['damage'], est: S => DUEL.CFG.ATK_SCALE * 1500 * 1.3 * 0.12 * 6 * 1.4 }),
    mon(36, '혁의 성녀 카르테시아', 4, 1600, 'dark', '패 1장을 버리고 (그 레벨 + 이 카드 레벨) × ATK 0.09 의 어둠 마법 광선 (방향 고정, 벽에서 멈춤).', ctx => {
      const { b, u } = ctx, d = ctx.discardWorst(1)[0], lv = (d ? effLv(d) : 0) + effLv(ctx.inst), e = mainFoe(b, u); if (!e) return;
      actor(b, SPR(36), u.x, u.y, 0.7, { face: e.x >= u.x ? 1 : -1 }); beamAt(ctx, u.x, u.y, angTo(u, e), ctx.atk(0.09 * lv), { element: 'dark', w: 20 + lv });
    }, { tags: ['damage'], when: S => S.hand >= 2, est: S => DUEL.CFG.ATK_SCALE * 1600 * 1.3 * 0.09 * (4 + Math.max(0, ...S.u.duel.hand.filter(c => c.def.type === 'monster').map(c => effLv(c)), 0)) }),
    mon(37, '멜리스 화이트 레빗', 3, 1200, 'light', '상대를 0.6초 시간 정지 → 0.4초 해제를 4회 반복.', ctx => {
      const { b, u } = ctx, e = mainFoe(b, u); if (!e) return;
      for (let i = 0; i < 4; i++) b.later(i * 1.0, () => { if (!e.dead && !b.over) { b.applyStatus(e, 'gStop', 0.6, u, { noResistScale: true }); b.ring(e.x, e.y - 18, 4, 26, 0.3, '#ffffff'); b.text(e.x, e.y - 64, '정지!', '#ffffff', 9); } });
      b.gTS = { owner: u, foe: e, until: b.time + 3.7, A: actor(b, SPR(37), u.x + u.facing * 14, u.y, 3.6, { face: u.facing }) };
    }, { tags: ['control'], score: S => 10 + (S.oppCasting ? 8 : 0) }),
    mon(38, '메멘토 엔위치', 3, 1200, 'dark', '이번 대전에서 파괴된 소환수(천동·RAI-MEI·에클레시아 등)·스테이지 오브젝트(건물·얼음벽·창문·인형뽑기 인형)를 되살림.', ctx => {
      const { b, u } = ctx; let n = 0;
      for (const L of (b.gLost || []).filter(l => l.team === u.team).splice(0, 3)) { const def = SUMDEF[L.key]; if (!def) continue; const p = spot(b, 0, null); summon(b, u, L.key, p.x, p.y, { dur: 8, hp: Math.min(L.hp, 300) }); n++; }
      b.gLost = (b.gLost || []).filter(l => l.team !== u.team);
      for (const bl of b.buildings) if (bl.dead || bl.hp < bl.maxHp) { bl.dead = false; bl.hp = bl.maxHp; n++; }
      for (const s of b.iceSegs || []) if (s.dead) { s.dead = false; s.hp = s.maxHp; n++; }
      if (b.sub && b.sub.windows) for (const w of b.sub.windows) if (w.broken) { w.broken = false; w.hp = w.max; n++; }
      if (b.claw && window.StageExt5 && StageExt5.CLAW) { const K = b.claw, miss = K.C.dolls - K.dolls.filter(d => !d.grab).length; for (let i = 0; i < miss; i++) { StageExt5.CLAW.spawnDoll(b, false); n++; } }
      for (const o of b.u) if (!o.dead) b.resolveBuildings(o, true);
      ctx.text(n ? `되살림 ×${n}` : '되살릴 것 없음', '#e0c8ff'); if (n) b.shock(u.x, u.y, 6, 60, '#c8a0ff', 0.5, 4);
    }, { tags: [], score: S => { const b = S.b; const n = (b.gLost || []).filter(l => l.team === S.u.team).length * 2 + b.buildings.filter(x => x.dead).length + (b.iceSegs || []).filter(s => s.dead).length * 0.5; return n ? 6 + n * 7 : -30; } }),
    mon(39, '천위의 용선녀', 3, 1300, 'ice', '듀얼리스트가 보는 방향(좌/우)으로 필드 전체에 강풍: 상대 전원 넉백. 벽·장애물에 부딪히면 날아간 거리 ×0.6 피해.', ctx => {
      const { b, u } = ctx, a = u.facing > 0 ? 0 : Math.PI;
      for (let i = 0; i < 26; i++) b.parts.push({ x: u.facing > 0 ? rand(20, 120) : rand(240, 340), y: rand(140, 600), vx: Math.cos(a) * rand(300, 520), vy: rand(-20, 20), life: 0.7, max: 0.7, color: i % 2 ? '#e8fff8' : '#bfe8ff', size: 2 });
      actor(b, SPR(39), u.x - u.facing * 12, u.y - 4, 0.9, { face: u.facing });
      for (const f of b.foes(u)) { if (f.airborne) continue; const x0 = f.x, y0 = f.y; b.knockback(f, a + rand(-0.08, 0.08), 560, 0.55, () => { const dd = Math.hypot(f.x - x0, f.y - y0); if (dd > 8 && !f.dead && !b.over) { ctx.damage(f, 0.6 * dd, hitO(ctx, { delivery: 'melee', element: 'blunt', big: dd > 60 })); b.text(f.x, f.y - 60, '벽 충돌!', '#e8fff8', 9); } }); }
      b.shake(2);
    }, { tags: ['damage'], est: S => 50, score: S => { const e = S.e; if (!e) return -10; const wall = S.u.facing > 0 ? 340 - e.x : e.x - 20; return wall > 80 ? 14 : -4; } }),
    mon(40, '크리슈너드 위치', 4, 1400, 'ice', '패를 전부 덱으로 되돌리고, (되돌린 몬스터 레벨 합)/(되돌린 장수) 반올림만큼 드로우 (최대 5, 덱 2장은 남김).', ctx => {
      const { b, u } = ctx, D = u.duel, L = D.hand.filter(c => c !== ctx.inst); if (!L.length) { sDraw(b, u, 1); return; }
      const sum = L.reduce((s, c) => s + effLv(c), 0), n = Math.min(5, Math.round(sum / L.length));
      for (const c of L) { D.hand.splice(D.hand.indexOf(c), 1); D.deck.push(c); } DUEL.shuffle(D.deck);
      say(b, u, `크리슈너드: 패 ${L.length}장 → 덱, 레벨 합 ${sum} ÷ ${L.length} = ${n}장 드로우`); sDraw(b, u, n);
    }, { tags: [], score: S => { const L = S.u.duel.hand.filter(c => c.id !== 'G40'); if (!L.length) return -10; const n = Math.round(L.reduce((s, c) => s + effLv(c), 0) / L.length); return (n - L.length) * 9 + (S.deck < 10 ? -20 : 0); } }),
  ];
  const effHp = o => o.def.duelist ? o.hp / LPK : o.hp;
  function charmGender(o) { const id = o.def.id; if (id === 'duck') return 'neutral'; return o.gender || o.def.gender || 'male'; } // 오리는 성별 없음, 나머지는 캐릭터 데이터 성별
  function sitriStep(s, dt) {
    const b = window.__gb; if (!b) return;
    for (const f of b.foes(s)) { if (f.summon || f.dead) continue; const g = charmGender(f); if (g === 'neutral') continue;
      const d = Math.hypot(s.x - f.x, s.y - f.y) || 1; if (d > 260) continue;
      if (g === 'male') { f.dir = Math.atan2(s.y - f.y, s.x - f.x); if (Math.random() < dt * 5) b.parts.push({ x: f.x + rand(-6, 6), y: f.y - 40, vx: rand(-10, 10), vy: -30, life: 0.8, max: 0.8, color: '#ff6a9a', size: 3, heart: true }); if (Math.random() < dt * 1.5) b.text(f.x, f.y - 58, '♥', '#ff6a9a', 11); }
      else if (d < 150) f.dir = Math.atan2(f.y - s.y, f.x - s.x);
    }
  }
  function ejirStep(s, dt) {
    const b = window.__gb; if (!b) return;
    if ((s.gTurn = (s.gTurn || 0) - dt) <= 0) { s.gTurn = rand(0.8, 1.6); s.dir = rand(0, TAU); }
    if ((s.gDrop = (s.gDrop || 0) - dt) <= 0) { s.gDrop = 0.4; (b.gSlime || (b.gSlime = [])).push({ x: s.x, y: s.y, t: 0, dur: 4, r: 14 }); }
  }
  for (const c of G) { c.shout = c.shout || c.name + '!'; c.borrowable = false; CARD_DEFS[c.id] = c; } // 패스트푸드점 카드 배달(비듀얼리스트)에는 제외: 효과가 덱/묘지를 전제
  const GHOUL_DECK = G.map(c => c.id);

  // ---------- 듀얼 프레임워크 훅 ----------
  DUEL.playHooks.push((b, u, ci, plan) => {
    const D = u.duel; if (!D || u.def.id !== 'ghoul') return;
    if (plan.tributes && plan.tributes.length) D.gLastTrib = plan.tributes.map(effLv);
    if (D.gKsha && plan.cut > 0) { // 크샤트리라: 릴리스 → 묘지 몬스터를 덱으로
      const L = D.grave.filter(c => c.def.type === 'monster').slice(0, plan.cut);
      for (const c of L) { D.grave.splice(D.grave.indexOf(c), 1); D.deck.push(c); } DUEL.shuffle(D.deck); D.gKsha = false;
      say(b, u, `크샤트리라: 릴리스 대신 묘지 몬스터 ${L.length}장 → 덱`);
      if (!D.gLastTrib) D.gLastTrib = L.map(effLv);
    }
  });
  DUEL.planHooks.push((b, u, plan, S) => { // 시너지 보정: 라이브트윈 체인, 레벨 조작 후 고레벨
    if (u.def.id !== 'ghoul') return 0; const c = plan.inst.def, D = u.duel; let v = 0;
    if ((c.id === 'G12' && S.inHand('G13')) || (c.id === 'G13' && S.inHand('G12'))) v += 4;
    if (c.id === 'G03' && plan.tributes.length) v += 4;
    if (plan.inst.lvMod && effLv(plan.inst) <= 4 && c.level >= 7) v += 10; // 마죠레느로 낮춘 고레벨
    if (D.gKsha && plan.cut) v += 8;
    return v;
  });

  // ---------- 스테이지 훅 (매 프레임) ----------
  STAGE_HOOKS.push({
    match: () => false,
    init(b) { b.gAct = []; b.gLost = []; window.__gb = b; for (const u of b.u) if (u.def.id === 'ghoul') u.gTaken = 0; },
    on(b, ev, a, c, d, o) {
      if (ev === 'damaged' && c) {
        if (c.def.id === 'ghoul' && d > 0) c.gTaken = (c.gTaken || 0) + d;
        if (a && a.def.id === 'ghoul' && o && o.gShot && c.team !== a.team && a.duel) { // 홀리엔젤: 원거리 카드 공격 적중 → 레벨 +1
          a.gAngelLv = Math.min(11, (a.gAngelLv || 0) + 1);
          for (const z of [a.duel.hand, a.duel.deck, a.duel.grave]) for (const ci of z) if (ci.id === 'G22') ci.lvMod = a.gAngelLv;
        }
      }
      return false;
    },
    preDamage(b, src, tgt, amount, o) {
      let amt = amount;
      if (tgt.gElecWeak > b.time) { if (o.element === 'elec') amt *= 1.5; else { const r = tgt.def.resist && tgt.def.resist[o.element]; if (r > 1) amt /= r; } }
      if (src && src.gCastle && src.status('gCastle') && tgt.team !== src.team) { // 백은성: 갇힌 쪽의 공격은 성벽이 받음
        const C = src.gCastle; C.hp -= amt; b.sparks(src.x, src.y - 20, '#e8ecf8', 5, 120);
        if (C.hp <= 0) { src.gCastle = null; src.statuses = src.statuses.filter(s => s.id !== 'gCastle'); b.text(src.x, src.y - 60, '백은성 붕괴!', '#f0f4ff', 11); b.debris(src.x, src.y, 12); }
        return true;
      }
      return amt !== amount ? amt : undefined;
    },
    drawTop(ctx, b) { // 화이트 레빗 시간 정지: 정지 중엔 화면 전체 회색조, 레빗과 그 듀얼리스트만 컬러로 다시 그림
      const T = b.gTS; if (!T || !T.foe || !T.foe.status('gStop')) return;
      const cv = ctx.canvas; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'grayscale(1)'; ctx.drawImage(cv, 0, 0); ctx.restore();
      if (!T.owner.dead && b.u.includes(T.owner)) { Render.drawUnit(ctx, T.owner, b); ctx.globalAlpha = 1; }
      if (T.A && T.A.t < T.A.dur) drawActor(ctx, b, T.A);
    },
    step(b, dt) {
      window.__gb = b;
      stepSummons(b, dt);
      for (const s of [...b.u]) if (s.summon && s.gUsed !== undefined && (!s.action || b.time - s.gUsed > 1.5) && b.time - s.gUsed > 0.15) { b.smoke(s.x, s.y - 14, '#ffd0ec', 8); removeSummon(b, s); }
      if (b.gTS && (b.time > b.gTS.until || b.gTS.owner.dead)) b.gTS = null;
      for (const A of acts(b)) { A.t += dt; if (A.upd) A.upd(A, dt); }
      b.gAct = acts(b).filter(A => A.t < A.dur);
      for (const u of b.u) {
        if (u.gCastle) { const C = u.gCastle; C.t -= dt; if (C.t <= 0 || !u.status('gCastle') || u.dead) { u.gCastle = null; u.statuses = u.statuses.filter(s => s.id !== 'gCastle'); } else { if (C.cx === undefined) { C.cx = u.x; C.cy = u.y; } u.x = clamp(u.x, C.cx - 14, C.cx + 14); u.y = clamp(u.y, C.cy - 6, C.cy + 6); } }
        if (u.gLaugh) { const L = u.gLaugh; L.t -= dt; L.n -= dt; if (L.n <= 0) { L.n = 1.4; b.text(u.x + rand(-10, 10), u.y - 74, ['오~호호호!', '호호호호!', '오-호호호호!'][Math.floor(Math.random() * 3)], '#f0f4ff', 9); } if (L.t <= 0 || u.dead) u.gLaugh = null; }
        if (u.gIce) {
          const I = u.gIce; I.t -= dt; if (I.t <= 0 || u.dead) { u.gIce = null; continue; }
          for (const f of b.foes(u)) { if (Math.hypot(f.x - u.x, f.y - u.y) < 36 + f.pad + 10 && !(I.cd.get(f) > b.time)) { I.cd.set(f, b.time + 1.5); b.applyStatus(f, 'gFrozen', 1, u); b.text(f.x, f.y - 60, '빙결!', '#bfefff', 9); } }
          for (const L of projLists(b)) for (const p of L) { const s = projSrc(p); if (!s || s.team === u.team || p.gIceHit) continue; const q = projPos(p); if (Math.hypot(q.x - u.x, q.y - (u.y - 16)) < 40) { p.gIceHit = true; p.gFrz = 1.2; b.gFrozenP = true; b.burst(q.x, q.y, '#bfefff', 5); } }
        }
      }
      if (b.gSlime) { for (const S of b.gSlime) { S.t += dt; S.tick = (S.tick || 0) - dt; if (S.tick <= 0) { S.tick = 0.5; for (const o of b.u) if (!o.dead && !o.airborne && Math.hypot(o.x - S.x, (o.y - S.y) / 0.7) < S.r + 6) b.heal(o, o.def.duelist ? 14 : 3, true); } } b.gSlime = b.gSlime.filter(S => S.t < S.dur); }
      if (b.gZone) { // 루루카로스 파도: 위→아래로 휩씀 (전원, 자신 35%)
        for (const Z of b.gZone) { Z.t += dt; const y = 120 + (Z.t / Z.dur) * 500; for (const o of b.u) if (!o.dead && !Z.hit.has(o) && Math.abs(o.y - y) < 26) { Z.hit.add(o); const self = o.team === Z.u.team; b.damage(Z.u, o, Z.amt * (self ? 0.35 : 1), { element: 'ice', delivery: 'ranged', cardDmg: true, sure: true, big: !self, selfHit: self }); } }
        b.gZone = b.gZone.filter(Z => Z.t < Z.dur);
      }
      if (b.gCrack) { // 루인: 균열 확산 → 스테이지 교체
        const C = b.gCrack; C.t += dt; C.tick -= dt; if (Math.random() < dt * 20) b.shake(1.5);
        if (C.tick <= 0) { C.tick = 0.4; const k = Math.min(1, C.t / C.dur); for (const f of b.foes(C.u)) { if (f.airborne) continue; for (const pts of C.cr) { const n = Math.max(1, Math.floor((pts.length - 1) * k)); let hit = false; for (let i = 0; i < n; i++) { const A = pts[i], B = pts[i + 1], dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1, tt = Math.max(0, Math.min(1, ((f.x - A.x) * dx + (f.y - A.y) * dy) / L2)); if (Math.hypot(f.x - A.x - dx * tt, f.y - A.y - dy * tt) < 14 + f.pad) { hit = true; break; } } if (hit) { C.ctx.damage(f, C.amt, { element: 'dark', delivery: 'melee', sure: true }); b.sparks(f.x, f.y, '#ff7ab0', 6, 160); break; } } } }
        if (C.t >= C.dur) { b.gCrack = null; if (!b.over) { const L = stagePool(b); const id = L[Math.floor(Math.random() * L.length)]; b.flash = 1; b.shake(5); b.hitstop && b.hitstop(0.15); switchStage(b, id); b.glow(180, 380, 260, '#ffffff', 0.6); } }
      }
    },
    drawUnder(ctx, b, preview) {
      if (preview) return;
      if (b.gSlime) for (const S of b.gSlime) { ctx.save(); ctx.globalAlpha = 0.45 * (1 - S.t / S.dur); ctx.fillStyle = '#9af0c8'; ctx.beginPath(); ctx.ellipse(S.x, S.y, S.r, S.r * 0.6, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      if (b.gCrack) { const C = b.gCrack, k = Math.min(1, C.t / C.dur); ctx.save(); ctx.strokeStyle = '#ff5a9a'; ctx.lineWidth = 3 + k * 3; ctx.globalAlpha = 0.9; for (const pts of C.cr) { const n = Math.max(1, Math.floor((pts.length - 1) * k)); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i <= n; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); } ctx.strokeStyle = '#1a0a14'; ctx.lineWidth = 1.5; for (const pts of C.cr) { const n = Math.max(1, Math.floor((pts.length - 1) * k)); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i <= n; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); } ctx.restore(); }
    },
    drawOver(ctx, b) {
      for (const A of b.gAct || []) drawActor(ctx, b, A);
      for (const s of b.u) if (s.summon && !s.dead && s.maxHp > 0 && !s.hidden) { // 소환수 머리 위 작은 체력바
        const k = clamp(s.hp / s.maxHp, 0, 1), x = Math.round(s.x) - 12, y = Math.round(s.y - 50 * (s.size || 1) - b.airZ(s));
        ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(20,18,30,0.85)'; ctx.fillRect(x - 1, y - 1, 26, 5); ctx.fillStyle = '#3a3448'; ctx.fillRect(x, y, 24, 3);
        ctx.fillStyle = s.team === 0 ? '#6ad0ff' : '#ff7a8a'; ctx.fillRect(x, y, Math.max(1, Math.round(24 * k)), 3); ctx.restore(); }
      for (const u of b.u) {
        if (u.gCastle && !u.dead) { const C = u.gCastle, k = Math.max(0.2, C.hp / C.max), x = Math.round(C.cx ?? u.x), y = Math.round(C.cy ?? u.y); ctx.save(); // 작은 성: 뒷벽은 반투명, 앞쪽 기둥/성벽
          ctx.globalAlpha = 0.45 + 0.35 * k; ctx.fillStyle = '#e8ecf8'; ctx.strokeStyle = '#8a90a8'; ctx.lineWidth = 1;
          ctx.fillRect(x - 26, y - 44, 52, 4); for (const dx of [-30, 24]) { ctx.fillRect(x + dx, y - 50, 6, 58); ctx.strokeRect(x + dx + 0.5, y - 49.5, 5, 57); }
          ctx.fillStyle = '#5a6080'; for (const dx of [-30, 24]) for (let i = 0; i < 2; i++) ctx.fillRect(x + dx + i * 4, y - 54, 2, 4);
          ctx.globalAlpha = 0.35 + 0.35 * k; ctx.fillStyle = '#e8ecf8'; ctx.fillRect(x - 24, y + 2, 48, 6); ctx.strokeRect(x - 23.5, y + 2.5, 47, 5);
          ctx.fillStyle = '#8a90a8'; for (let i = -20; i <= 18; i += 6) ctx.fillRect(x + i, y + 4, 2, 2);
          ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 16, y - 60, 32 * k, 2); ctx.restore(); }
        if (u.gIce && !u.dead) { ctx.save(); ctx.globalAlpha = 0.3 + 0.1 * Math.sin(b.time * 6); ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(u.x, u.y - 16, 36, 30, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#bfefff'; ctx.fill(); ctx.restore(); }
      }
      for (const L of projLists(b)) for (const p of L) if (p.gFrz > 0) { const q = projPos(p); ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = '#bfefff'; ctx.fillRect(Math.round(q.x) - 6, Math.round(q.y) - 6, 12, 12); ctx.restore(); }
      if (b.gZone) for (const Z of b.gZone) { const y = 120 + (Z.t / Z.dur) * 500; ctx.save(); ctx.globalAlpha = 0.55 * (1 - Z.t / Z.dur * 0.5); ctx.fillStyle = '#5ab0ff'; ctx.fillRect(0, y - 26, 360, 30); ctx.fillStyle = '#e8f8ff'; for (let x = 0; x < 360; x += 12) ctx.fillRect(x + (Math.floor(b.time * 30) % 12), y - 28 + Math.sin(x * 0.2 + b.time * 10) * 3, 7, 4); ctx.globalAlpha *= 0.5; ctx.fillStyle = '#3a7ad8'; ctx.fillRect(0, y + 4, 360, 18); ctx.restore(); }
    },
    drawAboveUI(ctx, b) { for (const A of b.gAct || []) drawActor(ctx, b, A); },
  });
  function drawActor(ctx, b, A) {
    const sp = DuelSprites.get(A.spr); if (!sp) return;
    const k = A.t / A.dur, a = Math.min(1, A.t / 0.12, (A.dur - A.t) / 0.15) * (A.ghost ? 0.75 : 1);
    const sc = sp.s * A.k, w = sp.w * sc, h = sp.h * sc;
    ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(Math.round(A.x), Math.round(A.y - A.z)); ctx.scale(A.face < 0 ? -1 : 1, 1); ctx.drawImage(sp.c, Math.round(-w / 2), Math.round(-h + 2), w, h); ctx.restore();
  }
  window.GHOUL = { G, SUMDEF, switchStage, summon, removeSummon, charmGender, DECK: GHOUL_DECK };
  DUEL.debug.ghoulIds = () => G.map(c => c.id);
  DUEL.debug.switchStage = switchStage;

  // ---------- 캐릭터 ----------
  CHARACTERS.push({
    id: 'ghoul', name: '구울즈', gender: 'male', color: '#6a3a8a',
    stats: { hp: 4000, atk: 20, spd: 240, range: 110, atkRate: 0.75, def: 0 },
    attack: { element: 'dark', delivery: 'ranged' }, projectile: 'magic',
    duelist: { deck: GHOUL_DECK, noExodia: true, atkMul: 1.3, cfg: { PLAY_GAP: 0.5, MIN_WAIT: 0.7, WAIT_TIMEOUT: 2.6, MAX_PLAYS: 2 },
      blurb: '<b style="color:#ff9ad8">미소녀 카드 40장(전부 몬스터) · 묘지/레벨 조작/다음 드로우 지정/소환수/스테이지 교체</b>' },
    skills: [{ id: 'duelCard', name: '듀얼리스트의 카드', cd: 1e9, hidden: true, canUse: () => false }],
    sprite: { src: 'assets/Ghouls/character/front.png', back: 'assets/Ghouls/character/back.png', scale: 0.5, foot: 2, faces: { front: 'right', back: 'left' } },
    portrait: 'assets/Ghouls/character/portrait.png',
    extraDefs: SUMMON_DEFS,
    lines: { // 유저 대사 확정 전 자리 채움용
      skill: {},
      event: {
        battleStart: ['듀얼이다… 우리 미소녀들이 상대해 주지.', '구울즈의 이름으로!'],
        draw: ['드로우!', '와라, 나의 천사!'],
        deckLow: ['덱이 얼마 안 남았군…'],
        summonBig: ['나와라, 최고의 미소녀!', '이 아름다움을 보아라!'],
        summonGod: ['파멸의 미여, 강림하라!'],
        lowHp: ['아직이다…!'],
        win: ['미소녀는 승리한다.'], lose: ['내 카드들이…'],
      },
      cd: { draw: 7, deckLow: 15, summonBig: 5, summonGod: 4 },
    },
  });
})();
