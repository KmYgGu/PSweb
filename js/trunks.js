/**
 * 미래 트랭크스 (드래곤볼 구극장판 '불타올라라!! 열전·열전·초격전' 브로리 MAD 버전) — 미묘하게 어긋난 캐릭터성. 근접 주먹 평타
 *  1. 트랭크스루~      : (반응 슬롯) 쿨타임이 차 있으면 상대의 원거리 공격이 아무 피격 효과 없이 그냥 몸을 지나감(투사체는 계속 날아감, 투명화 연출 없음) '트랭크스루~' + '아핫☆'.
 *                        쿨타임 중에 원거리 공격을 맞으면 똑같이 '트랭크스루~'를 외치지만 '거짓말?!' 하며 피해가 늘어남
 *  2. 냉장고 꺼내기    : 호이포이 캡슐로 근처에 냉장고(부서지지 않는 장애물, 12초)를 꺼내고 음료수를 마심 '음료수도 많이 있으니까, 원한다면 드세요.'
 *                        음료수(무작위): A 체력 소량 회복 / B 쿨타임 중인 스킬 하나 초기화 / C 독(마시는 순간 냉장고 사라짐).
 *                        누구든(상대 포함) 냉장고에 부딪히면 마심(4초에 한 번). 마시는 1초 동안 정지·무적
 *  3. 20년 후 미래에는.. : 5초 동안 검 모드 '20년 후의 미래에는 너 같은 건 존재하지 않아...' — 평타가 검 참격(큰 피해, 사거리 +16).
 *                        첫 참격 '왜냐하면 너는 여기서 나한테 쓰러질 테니까!!!!'. 세 번째 참격은 상대가 무효화하고 트랭크스를 붙잡아 멀리 던짐 '갸아아아아악!'
 *                        (그 전에 시간이 끝나거나, 세 번째 순간 상대가 해로운 상태이상에 걸려 있으면 던지기 없음)
 *  4. 무시             : 상대의 공격 사거리 안에서 사용. 2.5초 동안 상대는 트랭크스를 무시(공격하지 않음·몸도 그냥 지나감), 트랭크스는 제자리에서 방방 뛰며 외침
 *  5. 마섬광           : 평범하고 상식적인 원거리 공격. 상대를 향해 직선으로 동그란 기탄
 *  난수는 전부 Math.random (전투 중 시드 난수). 그리기 코드는 난수·전투 값을 바꾸지 않음 (b.time 기반 흔들림만)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'trunks', LAV = '#c8b4f0', KI = '#ffe86a';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const isT = u => !!(u && u.def && u.def.id === ID);
  const slotOf = (u, id) => u.skills.findIndex(s => s.id === id);
  const harmful = u => u.statuses.some(s => { const d = STATUS_DEFS[s.id]; return d && !d.positive; });
  function voice(b, u, txt, color, size) { b.hooks.onVoice && b.hooks.onVoice(u, txt, null); if (color) b.text(u.x, u.y - 74 - u.pad * 2, txt.length > 14 ? txt.slice(0, 13) + '…' : txt, color, size || 9); }
  const D = {
    trough: { failK: 1.3, failCd: 1.5, passLife: 0.6 },
    fridge: { life: 12, w: 18, h: 14, drink: 1.0, cd: 4, heal: 0.08, poisonDur: 4, poisonPow: 6, weights: [0.45, 0.35, 0.2] },
    sword: { dur: 5, mult: 1.8, reach: 16, throwDist: 220, throwT: 1.0, throwH: 54, throwK: 1.0 },
    ignore: { dur: 2.5, hop: 0.4 },
    masenko: { spd: 420, mult: 1.3, life: 1.2, r: 9 },
  };
  const IGNORE_LINES = ['어ㅡ이!', '들으라구!', '아아아아아아앙~!!!!!!', '누군가 한 명을 잊어버린것 같지 않냐고!', '너, 뭔가 착각하고 있는 거 아니야?!'];

  // ---------- 상태: 음료수 마시는 중 (정지·무적, 끝나면 효과) ----------
  STATUS_DEFS.trDrink = { name: '음료수', color: '#bfe8ff', positive: true, noResistScale: true, stack: 'ignore', blocksMove: true, blocksAct: true,
    onApply(u) { u.action = null; },
    onExpire(u, b, s) { drinkEffect(b, u, s.trKind, s.src); } };
  const KIND_NAME = ['회복 음료', '쿨타임 음료', '독 음료'];
  function drinkEffect(b, u, k, src) {
    if (u.dead || b.over) return;
    if (k === 0) { b.heal(u, u.maxHp * D.fridge.heal); b.text(u.x, u.y - 70, '꿀꺽! 회복', '#9cf0a0', 9); }
    else if (k === 1) { const L = []; u.skills.forEach((s, i) => { if (!s.hidden && u.skillT[i] > 0.5) L.push(i); });
      if (L.length) { const i = L[Math.floor(Math.random() * L.length)]; u.skillT[i] = 0; b.text(u.x, u.y - 70, `꿀꺽! ${u.skills[i].name} 준비`, '#bfe8ff', 8); }
      else { b.heal(u, u.maxHp * D.fridge.heal * 0.5); b.text(u.x, u.y - 70, '꿀꺽!', '#bfe8ff', 9); } }
    else { b.applyStatus(u, 'poison', D.fridge.poisonDur, src && src !== u ? src : u, { power: D.fridge.poisonPow }); b.text(u.x, u.y - 70, '우웩! 독이다!', '#b8f08a', 10);
      for (const bl of b.buildings) if (bl.trFridge && !bl.dead) { bl.life = 0; b.smoke(bl.x + bl.w / 2, bl.y + bl.h / 2 - 10, '#d8e8f0', 12); b.hooks.onSystem && b.hooks.onSystem('냉장고가 사라졌습니다!'); } }
    b.stats['trDrink' + k] = (b.stats['trDrink' + k] || 0) + 1;
  }
  function startDrink(b, u, owner) {
    const w = D.fridge.weights, r = Math.random(), k = r < w[0] ? 0 : r < w[0] + w[1] ? 1 : 2;
    const s = b.applyStatus(u, 'trDrink', D.fridge.drink, owner, { noResistScale: true }); if (!s) return;
    s.trKind = k; s.src = owner; u.trDrinkCd = b.time + D.fridge.cd; b.text(u.x, u.y - 58, `${KIND_NAME[k]}…`, '#e8f4ff', 8);
  }

  // ---------- 피해 훅: 트랭크스루~ / 무시 / 음료수 무적 ----------
  const isRangedHit = o => o.delivery === 'ranged' || o.viaProj;
  const oDmg = Battle.prototype.damage;
  Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    if (tgt && tgt.status && tgt.status('trDrink') && src && src !== tgt) return 0; // 마시는 중: 무적
    if (isT(tgt) && src && src !== tgt && src.team !== tgt.team && !tgt.dead && !this.over && !o.dot && !o.reflected) {
      if (tgt.buff('trIgnored')) return 0; // 무시: 상대는 트랭크스를 신경 쓰지 않음
      if (isRangedHit(o)) {
        const i = slotOf(tgt, 'trTrough');
        if (i >= 0 && tgt.skillT[i] <= 0) { // 트랭크스루~: 그냥 지나감
          tgt.skillT[i] = tgt.skills[i].cd; this.hooks.onSkill && this.hooks.onSkill(tgt, tgt.skills[i].name, null);
          voice(this, tgt, '트랭크스루~', LAV, 10); this.text(tgt.x + 10, tgt.y - 56, '아핫☆', '#ffd0f0', 9);
          const p = this.curProj; if (p && !p.pierce) { p.life = Math.max(p.life, D.trough.passLife); (p.hitSet || (p.hitSet = new Set())).add(tgt); } // 투사체는 계속 날아감
          this.stats.trThrough = (this.stats.trThrough || 0) + 1; return 0;
        }
        if (i >= 0 && this.time - (tgt.trFailT || -9) > D.trough.failCd) { // 쿨타임 중: 외쳤지만 실패 → 추가 피해
          tgt.trFailT = this.time; voice(this, tgt, '트랭크스루~', LAV, 9); this.later(0.15, () => { if (!tgt.dead && !this.over) voice(this, tgt, '거짓말?!', '#ff9aa8', 10); });
          this.stats.trFail = (this.stats.trFail || 0) + 1; return oDmg.call(this, src, tgt, amt * D.trough.failK, o);
        }
      }
    }
    return oDmg.call(this, src, tgt, amt, o);
  };
  const oFixed = Battle.prototype.fixedDamage; Battle.prototype.fixedDamage = function (src, tgt, amt, o) { if (tgt && tgt.status && tgt.status('trDrink') && src !== tgt) return 0; if (isT(tgt) && tgt.buff('trIgnored') && src && src.team !== tgt.team) return 0; return oFixed.call(this, src, tgt, amt, o); };
  // 무시: 상대는 트랭크스에게 평타를 하지 않고, 몸도 부딪히지 않고 지나감
  const oCol = Battle.prototype.collide; Battle.prototype.collide = function (a, c) { if ((isT(a) && a.buff('trIgnored') && c.team !== a.team) || (isT(c) && c.buff('trIgnored') && a.team !== c.team)) return; return oCol.call(this, a, c); };

  // ---------- 평타: 검 모드 ----------
  const oBasic = Battle.prototype.basicAttack;
  Battle.prototype.basicAttack = function (u, e) {
    if (isT(e) && e.buff('trIgnored') && u.team !== e.team) return; // 무시당하는 중엔 공격 안 함
    if (!isT(u) || !u.buff('trSword')) return oBasic.call(this, u, e);
    if (this.emit('attack', u, e)) { this.text(u.x, u.y - 50, '무효!', '#c8c0ff', 10); return; }
    const S = u.trSw || (u.trSw = { n: 0 }), a0 = angTo(u, e); S.n++;
    u.swing = 0.2; u.wSwing = { t: 0, dur: 0.26, ang: Math.atan2((e.y - 18) - (u.y - 20), e.x - u.x), k: 'sword' }; charSfx(u, 'basic');
    if (S.n === 3 && !harmful(e) && !e.dead && !e.summon) { // 세 번째 참격: 상대가 막고 트랭크스를 던짐
      this.later(0.08, () => { if (u.dead || this.over || e.dead) return; swordThrow(this, u, e); });
      return;
    }
    this.later(0.08, () => {
      if (u.dead || this.over || u.stun) return;
      if (S.n === 1) voice(this, u, '왜냐하면 너는 여기서 나한테 쓰러질 테니까!!!!', '#ffd8a0', 9);
      this.crescent(u.x + Math.cos(a0) * 16, u.y - 18 + Math.sin(a0) * 8, 22, a0, '#bfe6ff', 0.25);
      if (dist(u, e) <= u.reach + 12 && !e.hidden) { const bd = this.damage(u, e, u.st.atk * D.sword.mult, { element: 'slash', delivery: 'melee', basic: true, color: '#d8f0ff' }); if (bd > 0) this.resEvent(u, 'basicHit'); this.slashFx(e.x - u.facing * 4, e.y - 18, u.facing, '#ffffff', 1.2); }
      else { this.slashFx(u.x + u.facing * 18, u.y - 18, u.facing, '#ffffff', 0.9); playSfx('whiff'); }
      const bl = this.blockAt(u.x + Math.cos(a0) * 22, u.y - 4 + Math.sin(a0) * 22, 8); if (bl) this.hitBuilding(bl, u.st.atk * this.rules.meleeK * 1.5, false, u.x + u.facing * 16, u.y - 14, u, 'melee');
      this.stats.trSlash = (this.stats.trSlash || 0) + 1;
    });
  };
  function swordEnd(u) { if (u.trSw && u.trSw.base != null) u.st.range = u.trSw.base; u.trSw = null; u.buffs = u.buffs.filter(x => x.type !== 'trSword'); }
  function swordThrow(b, u, e) {
    b.text(e.x, e.y - 70, '무효!', '#e8e8ff', 10); b.ring(e.x, e.y - 18, 3, 22, 0.25, '#ffffff');
    swordEnd(u); u.action = null; u.push = null;
    const a = angTo(e, u), q = b.clampPos(u.x + Math.cos(a) * D.sword.throwDist, u.y + Math.sin(a) * D.sword.throwDist, u.pad, u);
    u.air = { t: 0, dur: D.sword.throwT, h: D.sword.throwH, spin: true, fling: { x0: u.x, y0: u.y, x1: q.x, y1: q.y } };
    voice(b, u, '갸아아아아악!', '#ff9a8a', 12);
    b.later(D.sword.throwT, () => { if (u.dead || b.over) return; b.damage(e, u, (e.st.atk || 30) * D.sword.throwK, { element: 'blunt', delivery: 'melee', noCrit: true, color: '#ffd0c8' }); b.dust(u.x, u.y); b.shake(2); });
    b.stats.trThrown = (b.stats.trThrown || 0) + 1;
  }

  // ---------- 스킬 ----------
  SKILLS.trTrough = { desc: '쿨타임이 차 있으면 상대의 원거리 공격이 아무 피격 효과 없이 그냥 몸을 지나갑니다(투사체는 계속 날아감). 쿨타임 중에 원거리 공격을 맞으면 똑같이 외치지만 "거짓말?!" 하며 피해 ×1.3(1.5초에 한 번).', canUse: () => false, use() {} };

  SKILLS.trFridge = { desc: '호이포이 캡슐로 근처에 냉장고(부서지지 않는 장애물, 12초)를 꺼내고 음료수를 마십니다. 음료수는 무작위로 A 체력 8% 회복(45%) / B 쿨타임 중인 스킬 하나 초기화(35%) / C 독 4초, 마시는 순간 냉장고가 사라짐(20%). 누구든(상대 포함) 냉장고에 부딪히면 4초에 한 번 마시며, 마시는 1초 동안 정지·무적.',
    canUse: (u, e, d, b) => !b.buildings.some(bl => bl.trFridge && !bl.dead && bl.life > 0) && b.time > 3 && d > 60,
    use(u, e0, b, s) {
      const F = D.fridge; let x = u.x + u.facing * 30, y = u.y; let q = b.clampPos(x, y, 14, u);
      if (b.blockAt(q.x, q.y - 4, 16)) q = b.clampPos(u.x - u.facing * 30, u.y, 14, u);
      const bl = { x: q.x - F.w / 2, y: q.y - F.h / 2 - 4, w: F.w, h: F.h, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, cracks: [[], [], []], rubble: [], windows: [], solid: true, life: F.life, trFridge: true, owner: u, draw: drawFridge, t0: b.time };
      b.buildings.push(bl); for (const o of b.u) if (!o.dead && !o.airborne && o !== u) b.resolveBuildings(o, true);
      b.smoke(q.x, q.y - 10, '#e8f0f8', 10); b.ring(q.x, q.y - 6, 3, 24, 0.35, '#e8f0f8'); b.text(q.x, q.y - 46, '펑!', '#e8f0f8', 9);
      voice(b, u, '음료수도 많이 있으니까, 원한다면 드세요.', '#e8f0ff', 8);
      startDrink(b, u, u); b.stats.trFridge = (b.stats.trFridge || 0) + 1;
    } };

  SKILLS.trSword = { desc: '5초 동안 검 모드: 평타가 검 참격(ATK×1.8, 사거리 +16). 세 번째 참격은 상대가 무효화하고 트랭크스를 붙잡아 220px 던집니다(1초 공중, 착지 때 상대 ATK×1.0 피해). 그 전에 시간이 끝나거나, 세 번째 순간 상대가 해로운 상태이상에 걸려 있으면 던지기 없음.',
    canUse: (u, e, d) => e && !e.dead && d < 160 && !u.buff('trSword'),
    use(u, e0, b, s) { const S = { ...D.sword, ...s };
      u.buffs.push({ type: 'trSword', name: '검', t: S.dur, nodispel: true }); u.trSw = { n: 0, base: u.st.range }; u.st.range += S.reach; u.atkT = Math.min(u.atkT, 0.2);
      voice(b, u, '20년 후의 미래에는 너 같은 건 존재하지 않아...', '#d8f0ff', 8); b.glow(u.x, u.y - 20, 26, '#bfe6ff', 0.4); b.stats.trSword = (b.stats.trSword || 0) + 1;
    } };

  SKILLS.trIgnore = { desc: '상대의 공격 사거리 안에서 사용. 2.5초 동안 상대는 트랭크스를 무시합니다(평타를 하지 않고 몸도 그냥 지나감, 상대의 피해 무효). 그 동안 트랭크스는 제자리에서 방방 뛰며 무작위로 외칩니다.',
    canUse: (u, e, d) => e && !e.dead && !e.summon && d <= e.reach + 10 && !u.buff('trIgnored'),
    use(u, e0, b, s) { const I = { ...D.ignore, ...s }; let t = 0, hop = 0;
      u.buffs.push({ type: 'trIgnored', name: '무시당함', t: I.dur, nodispel: true });
      voice(b, u, IGNORE_LINES[Math.floor(Math.random() * IGNORE_LINES.length)], '#ffb8d8', 9);
      const e = foeOf(b, u); if (e) b.text(e.x, e.y - 66, '(무시)', '#c8c8d0', 9);
      u.action = { type: 'trIgnore', step(dt) { t += dt; hop -= dt; u.moving = false;
        if (hop <= 0 && !u.air) { hop = I.hop; u.air = { t: 0, dur: 0.32, h: 12, noLand: true }; }
        if (t >= I.dur) u.action = null; } };
      b.stats.trIgnore = (b.stats.trIgnore || 0) + 1;
    } };

  function drawKi(ctx, p) { const k = 1 + 0.15 * Math.sin(p.life * 40); ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.globalAlpha = 0.35; ctx.fillStyle = KI; ctx.beginPath(); ctx.arc(0, 0, 9 * k, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(0, 0, 5 * k, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -2, 2, 2); }
  SKILLS.trMasenko = { desc: '평범하고 상식적인 원거리 공격. 상대를 향해 직선으로 동그란 기탄(ATK×1.3, 빛, 420px/s)을 쏩니다.',
    canUse: (u, e, d) => e && !e.dead && d > 90 && d < 320,
    use(u, e0, b, s) { const M = { ...D.masenko, ...s }, e = foeOf(b, u), a = Math.atan2(e.y - u.y, e.x - u.x); u.facing = Math.cos(a) >= 0 ? 1 : -1; u.swing = 0.2;
      voice(b, u, '마섬광!', KI, 10);
      b.proj.push({ x: u.x + Math.cos(a) * 12, y: u.y - 20, vx: Math.cos(a) * M.spd, vy: Math.sin(a) * M.spd, spd: M.spd, src: u, dmg: u.st.atk * M.mult, kind: 'trKi', homing: false, life: M.life, trail: 0, r: M.r, draw: drawKi, hit: { element: 'light', delivery: 'ranged', color: KI } });
      b.glow(u.x + Math.cos(a) * 12, u.y - 20, 14, KI, 0.25); playSfx('shot'); b.stats.trMasenko = (b.stats.trMasenko || 0) + 1;
    } };

  // ---------- 냉장고 그림 (월드 좌표, 바닥 기준) ----------
  function drawFridge(ctx, bl) {
    const x = Math.round(bl.x), y = Math.round(bl.y), w = bl.w, H = 30, top = y + bl.h - H, k = bl.life != null ? Math.min(1, bl.life / 0.6) : 1;
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 1, y + bl.h - 2, w + 2, 3);
    ctx.fillStyle = '#3a4250'; ctx.fillRect(x - 1, top - 1, w + 2, H + 1);
    ctx.fillStyle = '#e8eef4'; ctx.fillRect(x, top, w, H - 1); ctx.fillStyle = '#c8d0dc'; ctx.fillRect(x + w - 3, top, 3, H - 1);
    ctx.fillStyle = '#9aa4b2'; ctx.fillRect(x, top + 10, w, 1);
    ctx.fillStyle = '#5a6474'; ctx.fillRect(x + 2, top + 4, 1, 4); ctx.fillRect(x + 2, top + 13, 1, 6);
    ctx.fillStyle = '#4a7ad8'; ctx.fillRect(x + 6, top + 16, 6, 3); // 캡슐 코퍼레이션 마크 느낌의 파란 띠
    ctx.restore();
  }

  // ---------- 스테이지 훅 (모든 스테이지): 냉장고 마시기, 검 모드 정리 ----------
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.over) return;
      for (const bl of b.buildings) { if (!bl.trFridge || bl.dead || bl.life <= 0) continue;
        for (const u of b.u) { if (u.dead || u.airborne || u.hidden || u.status('trDrink') || (u.trDrinkCd || 0) > b.time) continue;
          const qx = clamp(u.x, bl.x, bl.x + bl.w), qy = clamp(u.y - 4, bl.y, bl.y + bl.h); if (Math.hypot(u.x - qx, u.y - 4 - qy) > 13 + u.pad) continue;
          startDrink(b, u, bl.owner); if (u.team !== bl.owner.team) b.text(u.x, u.y - 70, '음료수 발견!', '#e8f4ff', 9); } }
      for (const u of b.u) if (isT(u) && u.trSw && !u.buff('trSword')) swordEnd(u); // 검 모드 시간 끝: 사거리 원래대로
    },
    drawOver(ctx, b) {
      for (const u of b.u) { if (u.dead || u.hidden) continue; const z = b.airZ(u), s = u.status('trDrink');
        if (s) { const x = Math.round(u.x + u.facing * 8), y = Math.round(u.y - 30 - z); ctx.fillStyle = ['#ff9a6a', '#7ad0ff', '#9ae06a'][s.trKind || 0]; ctx.fillRect(x - 2, y - 6 + Math.round(Math.sin(b.time * 10)), 4, 7); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 8 + Math.round(Math.sin(b.time * 10)), 2, 2); }
        if (isT(u) && u.buff('trIgnored') && Math.floor(b.time * 3) % 2) { ctx.fillStyle = '#ff8ab8'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!!', u.x + 12, u.y - 44 - z); }
      }
    },
  });

  CHARACTERS.push({
    id: ID, name: '트랭크스', fullName: '미래 트랭크스', gender: 'male', color: '#9a86d8',
    stats: { hp: 880, atk: 31, spd: 275, range: 54, atkRate: 1.0, def: 16, crit: 0.07, critMult: 1.8 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { light: 0.9 },
    skills: [
      { id: 'trTrough', name: '트랭크스루~', cd: 9 },
      { id: 'trIgnore', name: '무시', cd: 14 },
      { id: 'trFridge', name: '냉장고 꺼내기', cd: 16 },
      { id: 'trSword', name: '20년 후 미래에는..', cd: 13 },
      { id: 'trMasenko', name: '마섬광', cd: 5 },
    ],
    passiveDesc: '트랭크스루~는 직접 쓰지 않고, 쿨타임이 차 있을 때 원거리 공격을 받으면 자동으로 그냥 지나가게 합니다.',
    sprite: { // 16x16 절차적 도트 (직접 그림): 연보라 바가지 머리, 파란 재킷·검은 셔츠, 등의 검 손잡이, 회색 바지·노란 부츠
      pal: { H: LAV, h: '#e8dcff', S: '#f2c9a0', E: '#2a3a6a', m: '#8a4038', B: '#3a4a9a', K: '#22222a', w: '#7a5534', L: '#4a4a5a', D: '#e0b030' },
      rows: { 0: '.....HHHHHH.....', 1: '....HHhhHHHH....', 2: '...HHHHHHHHHH...', 3: '...HHSSSSSSHH...', 4: '...HSSESSESSH...', 5: '....SSSSSSSS....', 6: '.....SSmmSS.....', 7: '...BBBKKKKBBBw..',
        8: '..BBBBKKKKBBBBw.', 9: '..SBBBKKKKBBBS..', 10: '..SBBBKKKKBBBS..', 11: '...BBBBBBBBBB...', 12: '....LLL..LLL....', 13: '....LLL..LLL....', 14: '....DDD..DDD....', 15: '................' },
    },
    lines: {
      skill: {}, // 스킬 대사는 스킬 코드에서 직접
      event: {
        battleStart: ['미래에서 왔습니다!', '아버지, 저도 싸우겠습니다!'],
        lowHp: ['이, 이럴 리가…!'], stunned: ['으앗?!'],
        win: ['미래는 바뀌었어!', '아핫☆'], lose: ['갸아아아아악!'],
      },
    },
  });
})();
