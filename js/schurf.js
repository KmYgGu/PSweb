/* =========================================================
 * 카마이타치 슈르프 (사용자 소설) — 흡수·변신의 귀족 교사
 *  1. 흡수          : 상대 액티브 스킬 하나(시드 난수)를 복사해 똑같이 사용. 보유 중엔 흡수 불가, 최대 체력 20% 잃을 때마다 초기화
 *  2. 더스트 토네이도 : 시전 순간 상대 위치에 거대한 모래 회오리. 바깥 가장자리일수록 강하고 안쪽일수록 약함
 *  3. 변신!         : 토끼/뱀/문어/곰 중 무작위
 *  4. 최후의 변신    : 회전 공격으로 상대를 띄우고 드래곤으로 변신 → 제자리에서 체력이 다할 때까지 불을 뿜음 (1회)
 *  난수는 전부 Math.random (전투 중 리플레이 시드 난수로 교체됨)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2, ID = 'schurf', IMG = 'assets/Schurf/';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  // 주 상대: 소환수가 아닌 상대 캐릭터 본체 (가장 가까운 생존자). 듀얼리스트 LP는 코드베이스 환산(DUEL_LP_SCALE)으로 일반 HP 단위로 비교
  const mainFoe = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const realHp = o => o.def.duelist ? o.hp / (window.DUEL_LP_SCALE || 1) : o.hp;
  const turn = (a, t, m) => { const d = Math.atan2(Math.sin(t - a), Math.cos(t - a)); return a + Math.max(-m, Math.min(m, d)); };
  const form = (k, name, scale, size, src) => ({ id: ID + '@' + k, name, color: '#c8a870', size, sprite: { src, scale, foot: 1 } }); // src 는 전체 경로 문자열 (영상용 에셋 수집기가 경로를 찾음)
  const FORMS = { rabbit: form('rabbit', '토끼', 3, 1, 'assets/Schurf/forms/rabbit.png'), snake: form('snake', '뱀', 3, 1, 'assets/Schurf/forms/snake.png'), octopus: form('octopus', '문어', 3, 1, 'assets/Schurf/forms/octopus.png'),
    bear: form('bear', '곰', 3.6, 1.3, 'assets/Schurf/forms/bear.png'), dragon: form('dragon', '드래곤', 5, 1.6, 'assets/Schurf/forms/dragon.png') };
  const FORM_KO = { rabbit: '토끼', snake: '뱀', octopus: '문어', bear: '곰' };

  // ---------- 1. 흡수 ----------
  // 복사 불가: 듀얼리스트 카드 슬롯(→ 대체 스킬 '흡수한 카드'), 자원(cost)이 필요한 스킬(이블린 가로테, 귀무사 혼령), 슈르프 자신의 스킬
  const NOCOPY = new Set(['duelCardH', 'duelCard', 'absorb', 'schFinal', 'schTransform', 'lmStand', 'lmOrder', 'lmSpread', 'lmCircle', 'mcRecall', 'mcReload', 'bzHole', 'bzSplit', 'bzSlam', 'bzScythe', 'bzThorns']); // 베르제브트: 마력 게이지가 필요한 스킬 (장미 재배만 흡수 가능) // 라미아: 스탠드 필요, 미츄헨 회수·장전: 혼자선 의미 없음(흡수 쪽은 0발이면 자동 장전)
  function myBase(u) { if (!u.schBase) { u.schBase = u.skills; u.skills = u.skills.slice(); } }
  function dropCopy(b, u, why) {
    if (!u.schCopy) return;
    const i = u.skills.indexOf(u.schCopy); if (i >= 0) { u.skills.splice(i, 1); u.skillT.splice(i, 1); }
    u.schCopy = null;
    const ai = u.skills.findIndex(s => s.id === 'absorb'); if (ai >= 0) u.skillT[ai] = Math.min(u.skillT[ai], 0.5);
    if (why) { b.text(u.x, u.y - 66, why, '#e8d8a8', 10); b.ring(u.x, u.y - 20, 6, 30, 0.35, '#e8d8a8'); }
  }
  SKILLS.absorb = {
    desc: '상대의 액티브 스킬 하나를 무작위로 흡수해 자신의 능력치로 똑같이 사용합니다. 흡수한 스킬을 가진 동안 흡수는 쓸 수 없고, 최대 체력의 20%를 잃을 때마다 흡수가 초기화됩니다(듀얼리스트 상대: 카드 날리기).',
    canUse: (u, e, d, b) => !u.schCopy && !u.schForm && dist(u, mainFoe(b, u)) < 380,
    use(u, e0, b, slot) {
      myBase(u); const e = mainFoe(b, u);
      b.streak(e.x, e.y - 20, u.x, u.y - 20, '#e8d8a8', 8, 0.4); b.glow(u.x, u.y - 22, 26, '#e8d8a8', 0.4);
      b.windup(u, slot.wind, () => {
        if (u.dead || b.over || u.schCopy) return;
        const L = (e.def.skills || []).filter(s => !s.hidden && SKILLS[s.id] && !NOCOPY.has(s.id) && !s.cost && !(s.canUse && s.canUse.length === 0));
        let pick = L.length && !e.def.duelist ? L[Math.floor(Math.random() * L.length)] : null;
        const copy = pick ? { ...pick, schCopied: true, schFrom: e.def.name } : { id: 'schCard', name: '흡수한 카드', cd: 4, n: 3, mult: 0.8, schCopied: true, schFrom: e.def.name };
        u.skills.push(copy); u.skillT.push(0.6); u.schCopy = copy;
        b.text(u.x, u.y - 70, '흡수! ' + copy.name, '#ffe8b0', 11);
        b.shock(u.x, u.y - 20, 6, 40, '#e8d8a8', 0.4, 4);
        b.hooks.onSystem && b.hooks.onSystem(pick ? `슈르프가 ${e.def.name}에게서 스킬 '${copy.name}' 흡수!` : `슈르프가 ${e.def.name}에게서 카드의 힘 흡수! ('${copy.name}')`);
      });
    },
  };
  SKILLS.schCard = { // 듀얼리스트 상대 대체 스킬: 카드 3장을 부채꼴로 날림
    desc: '흡수한 카드 3장을 부채꼴로 날립니다.',
    canUse: (u, e, d) => d < 300,
    use(u, e, b, slot) {
      const a0 = angTo(u, e);
      for (let i = 0; i < slot.n; i++) {
        const a = a0 + (i - (slot.n - 1) / 2) * 0.22;
        b.shoot(u, { angle: a, spd: 420, dmg: u.st.atk * slot.mult, kind: 'schCard', hit: { element: 'dark', delivery: 'ranged', color: '#d8c8ff' } });
        Object.assign(b.proj[b.proj.length - 1], { life: 1.2, r: 7, draw: drawCard });
      }
    },
  };
  function drawCard(ctx, p, glowAt) {
    ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(Math.atan2(p.vy, p.vx));
    glowAt(ctx, 0, 0, 9, '#c8b0ff', 0.3);
    ctx.fillStyle = '#20182c'; ctx.fillRect(-6, -4, 12, 8); ctx.fillStyle = '#c8a050'; ctx.fillRect(-5, -3, 10, 6); ctx.fillStyle = '#6a3aa0'; ctx.fillRect(-3, -2, 6, 4);
  }

  // ---------- 2. 더스트 토네이도 ----------
  SKILLS.dustTornado = {
    desc: '시전 순간 상대가 있던 곳에 넓은 모래 회오리를 일으킵니다. 바람의 바깥 가장자리일수록 피해가 크고 안쪽으로 갈수록 작습니다.',
    canUse: (u, e, d) => d < 300 && !u.schForm,
    use(u, e, b, slot) {
      const S = slot, P = { x: e.x, y: e.y };
      b.telegraphCircle(P.x, P.y, S.R, S.wind + 0.2, '#d8b878');
      b.windup(u, S.wind, () => { if (u.dead || b.over) return; (b.schTor || (b.schTor = [])).push({ src: u, S, x: P.x, y: P.y, t: 0, tick: 0, spin: Math.random() * TAU }); b.shake(1.2); });
    },
  };
  function torStep(b, T, dt) {
    const S = T.S, u = T.src; T.t += dt; T.spin += dt * 7; T.tick -= dt;
    if (Math.random() < 0.9) for (let i = 0; i < 2; i++) { const a = Math.random() * TAU, r = S.R * (0.3 + 0.7 * Math.sqrt(Math.random()));
      b.parts.push({ x: T.x + Math.cos(a) * r, y: T.y + Math.sin(a) * r * 0.7 - rand(0, 30), vx: -Math.sin(a) * 120, vy: Math.cos(a) * 60 - 30, life: 0.5, max: 0.5, color: ['#d8b878', '#b89858', '#efe0b0'][i % 3], size: 2 }); }
    if (T.tick <= 0) {
      T.tick = S.tick;
      for (const o of b.u) {
        if (o.dead || o.team === u.team || o.hidden) continue;
        const d = Math.hypot(o.x - T.x, (o.y - T.y) / 0.7); if (d > S.R + o.pad) continue;
        const k = Math.min(1, d / S.R), m = S.mIn + (S.mOut - S.mIn) * k * k; // 가장자리 강함
        b.damage(u, o, u.st.atk * m, { element: 'blunt', delivery: 'ranged', color: '#e8d098', quiet: k < 0.5 });
      }
    }
    return T.t < S.dur;
  }
  function drawTor(ctx, b, T) {
    const S = T.S, fade = Math.min(1, T.t / 0.2, (S.dur - T.t) / 0.25);
    ctx.save(); ctx.globalAlpha = 0.5 * fade;
    const g = ctx.createRadialGradient(T.x, T.y, 4, T.x, T.y, S.R);
    g.addColorStop(0, 'rgba(216,184,120,0.08)'); g.addColorStop(0.7, 'rgba(216,184,120,0.25)'); g.addColorStop(1, 'rgba(190,150,80,0.6)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(T.x, T.y, S.R, S.R * 0.7, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { const r = S.R * (0.35 + i * 0.13); ctx.strokeStyle = i > 3 ? '#c8a060' : '#e8d8a8'; ctx.globalAlpha = (0.25 + i * 0.1) * fade;
      ctx.beginPath(); ctx.ellipse(T.x, T.y - i * 3, r, r * 0.7, 0, T.spin * (1 + i * 0.15), T.spin * (1 + i * 0.15) + 2.2); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- 3. 변신! ----------
  function setForm(b, u, kind, dur) {
    u.form = FORMS[kind]; u.schForm = { kind, t: 0, dur, hopT: 0.5, dashT: 0.3, catchT: 0 };
    b.puff(u.x, u.y - 16, '#efe0b0'); b.ring(u.x, u.y - 16, 6, 36, 0.35, '#e8d8a8');
    b.text(u.x, u.y - 64, kind === 'dragon' ? '드래곤!' : FORM_KO[kind] + '!', '#ffe8b0', 11);
    for (let i = 0; i < u.skillT.length; i++) u.skillT[i] = Math.max(u.skillT[i], u.skills[i].id === 'schFinal' ? 0 : dur + 0.5); // 변신 중엔 다른 스킬 사용 안 함 (최후의 변신 제외)
  }
  function endForm(b, u, quiet) {
    if (!u.schForm || u.schForm.kind === 'dragon') return;
    u.form = null; u.schForm = null; if (u.action && u.action.sch) u.action = null; u.air = u.air && u.air.sch ? null : u.air;
    if (!quiet) b.puff(u.x, u.y - 16, '#efe0b0');
  }
  SKILLS.schTransform = {
    desc: '무작위 동물로 변신합니다. 토끼(회피↑·잦은 점프·착지 충격파), 뱀(시전 방향으로 돌진·독), 문어(상대를 붙잡을 때까지 돌아다님, 문어 상태의 일반 공격은 피해 없음·잡으면 사람으로 돌아와 서로 붙은 채 싸움), 곰(공중의 상대를 붙잡아 내리꽂아 기절).',
    canUse: (u, e, d) => !u.schForm && d < 320,
    use(u, e, b, slot) {
      const kinds = ['rabbit', 'snake', 'octopus', 'bear'], k = kinds[Math.floor(Math.random() * 4)];
      b.windup(u, 0.25, () => { if (!u.dead && !b.over) setForm(b, u, k, slot.dur[k]); });
    },
  };
  function formStep(b, u, e, dt) {
    const F = u.schForm, S = u.def.sch; F.t += dt;
    if (F.kind === 'dragon') return;
    if (F.t >= F.dur || u.dead) return endForm(b, u);
    if (u.blocked('blocksAct')) return;
    if (F.kind === 'rabbit') {
      if (F.hop && !u.air) { F.hop = false; // 착지: 트램펄린 충격파
        b.shock(u.x, u.y, 6, S.rabbit.r, '#fff4d0', 0.4, 4); b.ring(u.x, u.y, 4, S.rabbit.r * 0.6, 0.3, '#ffffff');
        for (const o of b.foes(u)) { if (o.airborne || Math.hypot(o.x - u.x, (o.y - u.y) / 0.7) > S.rabbit.r + o.pad) continue;
          b.damage(u, o, u.st.atk * S.rabbit.mult, { element: 'blunt', delivery: 'ranged', color: '#fff4d0' }); b.knockback(o, angTo(u, o), 260, 0.18); }
      }
      if (!u.air && !u.action && (F.hopT -= dt) <= 0) { F.hopT = S.rabbit.every; F.hop = true; u.air = { t: 0, dur: S.rabbit.air, h: S.rabbit.h, noLand: true, sch: true }; }
    } else if (F.kind === 'snake') {
      if (!u.action && (F.dashT -= dt) <= 0) {
        F.dashT = S.snake.every; const a = angTo(u, e), D = S.snake;
        b.telegraphLine(u.x, u.y, u.x + Math.cos(a) * D.len, u.y + Math.sin(a) * D.len, 12, 0.15, '#9be36b');
        const A = { type: 'schSnake', sch: true, t: -0.15, hit: false, trail: '#9be36b', step(dt) {
          A.t += dt; if (A.t < 0) return;
          const q = b.clampPos(u.x + Math.cos(a) * D.spd * dt, u.y + Math.sin(a) * D.spd * dt, u.pad, u);
          const blocked = b.blockAt(q.x, q.y - 4, 8) || (Math.abs(q.x - u.x) + Math.abs(q.y - u.y) < D.spd * dt * 0.3);
          if (!blocked) { u.x = q.x; u.y = q.y; } u.facing = Math.cos(a) >= 0 ? 1 : -1;
          if (!A.hit) for (const o of b.foes(u)) if (!o.airborne && dist(u, o) < 15 * (u.size + o.size) + 6) {
            A.hit = true; const r = b.damage(u, o, u.st.atk * D.mult, { element: 'slash', delivery: 'melee', color: '#b8f08a' });
            if (r > 0) b.applyStatus(o, 'poison', D.poisonDur, u, { power: Math.round(u.st.atk * D.poisonK) });
            b.sparks(o.x, o.y - 18, '#9be36b', 8); break; }
          if (A.t >= D.dur || blocked || A.hit) { u.action = null; u.dir = a + Math.PI + rand(-0.6, 0.6); }
        } };
        u.action = A;
      }
    } else if (F.kind === 'octopus') {
      if (!u.action) { const D = S.octo; u.action = { type: 'schOcto', sch: true, step(dt) { // 상대를 잡을 때까지 흐느적 이동 (물 지형 감속 없음)
        const a = angTo(u, e) + Math.sin(b.time * 3.1 + u.slot) * 0.9, q = b.clampPos(u.x + Math.cos(a) * D.spd * dt, u.y + Math.sin(a) * D.spd * dt, u.pad, u);
        u.x = q.x; u.y = q.y; b.resolveBuildings(u); u.facing = Math.cos(a) >= 0 ? 1 : -1; u.moving = true; u.walk += dt * 20;
        if (!e.dead && !e.airborne && !e.hidden && dist(u, e) < 15 * (u.size + e.size) + 8) grab(b, u, e);
      } }; }
    } else if (F.kind === 'bear') {
      F.catchT -= dt;
      if (F.catchT <= 0 && !u.action && e.airborne && !e.dead && dist(u, e) < S.bear.reach) { // 공중의 상대를 붙잡아 내리꽂기
        F.catchT = 1.0; const D = S.bear;
        u.action = { type: 'schBear', sch: true, t: 0, step(dt) {
          this.t += dt; const d = dist(u, e), st = Math.min(d, 520 * dt); if (d > 1) { u.x += (e.x - u.x) / d * st; u.y += (e.y - u.y) / d * st; }
          if (d < 30 || this.t > 0.35) { u.action = null; if (e.dead || d > 44) return;
            e.air = null; e.action = null;
            b.damage(u, e, u.st.atk * D.mult, { element: 'blunt', delivery: 'melee', airHit: true, big: true, color: '#ffd8a0' });
            b.knockdown(u, e, D.stun); b.shock(e.x, e.y, 6, 50, '#c8a070', 0.45, 5); b.debris(e.x, e.y, 12); b.shake(2.5); b.hitstop(0.08);
            b.text(e.x, e.y - 70, '내리꽂기!', '#ffd8a0', 11); }
        } };
      }
    }
  }
  function grab(b, u, e) {
    const S = u.def.sch.octo; endForm(b, u, true); u.action = null;
    const off = { x: e.x - u.x, y: e.y - u.y }, d = Math.hypot(off.x, off.y) || 1, R = 15 * (u.size + e.size) - 2;
    u.schGlue = { e, t: S.glue, ox: off.x / d * R, oy: off.y / d * R }; e.schGlueBy = u;
    b.text(e.x, e.y - 70, '붙잡힘!', '#d8a0ff', 11); b.shock((u.x + e.x) / 2, (u.y + e.y) / 2 - 18, 6, 34, '#c890ff', 0.35, 4);
  }
  function glueStep(b, u, dt) {
    const G = u.schGlue, e = G.e; G.t -= dt;
    if (G.t <= 0 || u.dead || e.dead || e.airborne || u.airborne) { u.schGlue = null; e.schGlueBy = null; if (!u.dead && !e.dead) b.text(e.x, e.y - 60, '떨어짐', '#d8a0ff', 9); return; }
    const mx = (u.x + e.x) / 2, my = (u.y + e.y) / 2; // 서로 붙은 채 함께 움직임
    const p1 = b.clampPos(mx - G.ox / 2, my - G.oy / 2, u.pad, u), p2 = b.clampPos(mx + G.ox / 2, my + G.oy / 2, e.pad, e);
    u.x = p1.x; u.y = p1.y; e.x = p2.x; e.y = p2.y;
  }
  // 문어 형태로 돌아다니는 동안: 문어의 충돌·일반 공격은 피해 없음. 붙잡은 뒤(사람, 붙은 상태)엔 서로 정상적으로 싸움
  const octo = u => u.schForm && u.schForm.kind === 'octopus';
  const oBump = Battle.prototype.bumpAttack; Battle.prototype.bumpAttack = function (u, e) { if (octo(u)) return; return oBump.call(this, u, e); };
  const oBasic = Battle.prototype.basicAttack; Battle.prototype.basicAttack = function (u, e) { if (octo(u)) return; return oBasic.call(this, u, e); };
  const oDmg = Battle.prototype.damage; Battle.prototype.damage = function (src, tgt, amt, o = {}) { // 곰: 받는 피해 25% 감소
    if (tgt && tgt.schForm && tgt.schForm.kind === 'bear' && !o.dot) amt *= tgt.def.sch.bear.dr; return oDmg.call(this, src, tgt, amt, o); };
  const oEva = Battle.prototype.evasion; Battle.prototype.evasion = function (tgt, o) { const v = oEva.call(this, tgt, o); return tgt.schForm && tgt.schForm.kind === 'rabbit' ? v + tgt.def.sch.rabbit.eva : v; };

  // ---------- 4. 최후의 변신 ----------
  SKILLS.schFinal = {
    desc: '(1회) 몸을 회전시키며 돌진해 회전 공격으로 상대를 띄운 뒤 드래곤으로 변신합니다. 제자리에 고정된 채 체력을 소모하며 상대 쪽으로 불을 계속 뿜고, 체력이 다하면 쓰러집니다.',
    canUse: (u, e0, d0, b) => { if (u.schFinalUsed) return false; const D = u.def.sch.fin, e = mainFoe(b, u); if (!e || e.dead || dist(u, e) > 260) return false;
      if (u.hp < u.maxHp * D.hpAt) return true;
      return realHp(e) < u.st.atk * D.lethalK && u.hp > D.drain * 1.5; }, // 마무리: 상대 실제 남은 체력이 회전 공격+짧은 불길로 확실히 끝날 만큼일 때만
    use(u, e0, b, slot) { const e = mainFoe(b, u);
      const D = u.def.sch.fin; u.schFinalUsed = true; endForm(b, u, true); if (u.schGlue) { u.schGlue.e.schGlueBy = null; u.schGlue = null; }
      b.glow(u.x, u.y - 20, 40, '#ffb060', 0.5);
      const A = { type: 'schSpin', t: 0, hit: false, trail: '#f0d8a0', step(dt) {
        A.t += dt; u.facing = Math.floor(A.t / 0.06) % 2 ? 1 : -1;
        const d = dist(u, e); if (d > 30) { const st = Math.min(d - 30, D.spinSpd * dt), a = angTo(u, e), q = b.clampPos(u.x + Math.cos(a) * st, u.y + Math.sin(a) * st, u.pad, u); u.x = q.x; u.y = q.y; }
        if (Math.random() < 0.8) b.ring(u.x, u.y - 18, 8, 26, 0.18, '#f0d8a0');
        if (!A.hit && !e.dead && d < 44) { A.hit = true;
          b.damage(u, e, u.st.atk * D.spinMult, { element: 'blunt', delivery: 'melee', big: true, color: '#ffe0a0' });
          if (!e.dead && !e.airborne && !e.inTrain && !e.climb) { e.action = null; e.air = { t: 0, dur: D.lift, h: 60, tumble: true }; b.text(e.x, e.y - 70, '띄움!', '#ffe080', 10); } }
        if (A.t >= D.spin || A.hit && A.t > 0.25) { u.action = null; dragon(b, u); }
      } };
      u.action = A;
    },
  };
  function dragon(b, u) {
    const D = u.def.sch.fin; setForm(b, u, 'dragon', 1e9); u.schForm.aim = angTo(u, mainFoe(b, u)); u.schForm.tick = 0;
    u.air = null; u.push = null; u.pull = null; u.v = null; u.schPin = { x: u.x, y: u.y, stage: b.stageId }; // 제자리 고정
    b.shock(u.x, u.y - 30, 10, 80, '#ff6a3a', 0.6, 6); b.shake(3); b.burst(u.x, u.y - 30, '#ff8a3a', 24);
    b.hooks.onSystem && b.hooks.onSystem('슈르프가 드래곤으로 변신했습니다!');
    u.schDragonA = u.action = { type: 'schDragon', step(dt) { // 제자리 고정, 회전 속도 제한된 조준으로 계속 불 뿜기
      const F = u.schForm, e = mainFoe(b, u); if (!F || u.dead) return;
      if (e && !e.dead) F.aim = turn(F.aim, angTo(u, e), D.turn * dt);
      u.facing = Math.cos(F.aim) >= 0 ? 1 : -1;
      const c = Math.cos(F.aim), s = Math.sin(F.aim); let L = 0;
      for (; L < D.len; L += 6) { const x = u.x + c * L, y = u.y + s * L; if (x < AR.x || x > AR.x + AR.w || y < AR.y || y > AR.y + AR.h || (L > 20 && b.blockAt(x, y - 4))) break; }
      F.L = L;
      for (let i = 0; i < 3; i++) { const r = rand(20, L), w = (r / D.len) * D.half * 2 * (Math.random() - 0.5);
        b.parts.push({ x: u.x + Math.cos(F.aim + w) * r, y: u.y - 30 + Math.sin(F.aim + w) * r, vx: c * 80, vy: s * 80 - 20, life: 0.35, max: 0.35, color: ['#ff4a1a', '#ff9a2a', '#ffe07a'][i], size: 3, glow: true }); }
      if ((F.tick -= dt) <= 0) { F.tick = D.tick;
        for (const o of b.foes(u)) { const dx = o.x - u.x, dy = o.y - u.y, t = dx * c + dy * s; if (t < 0 || t > L + o.pad) continue;
          if (Math.abs(-dx * s + dy * c) > 10 + t * Math.tan(D.half) + o.pad) continue;
          b.damage(u, o, u.st.atk * D.mult, { element: 'fire', delivery: 'ranged', color: '#ffae6b', quiet: true }); }
      }
      u.hp -= D.drain * dt; // 생명력 소모
      if (u.hp <= 0) { u.hp = 0; b.kill(u, e); }
    } };
  }
  function drawBreath(ctx, b, u) {
    const F = u.schForm; if (!F || F.L == null) return; const D = u.def.sch.fin;
    ctx.save(); ctx.translate(u.x, u.y - 30); ctx.rotate(F.aim);
    const g = ctx.createLinearGradient(0, 0, F.L, 0); g.addColorStop(0, 'rgba(255,240,170,0.9)'); g.addColorStop(0.4, 'rgba(255,120,30,0.7)'); g.addColorStop(1, 'rgba(200,30,10,0.15)');
    ctx.fillStyle = g; const w = F.L * Math.tan(D.half), fl = 1 + 0.12 * Math.sin(b.time * 40);
    ctx.beginPath(); ctx.moveTo(14, -5); ctx.lineTo(F.L, -w * fl - 10); ctx.lineTo(F.L, w * fl + 10); ctx.lineTo(14, 5); ctx.fill();
    ctx.restore();
  }

  const oStep = Battle.prototype.step; Battle.prototype.step = function (dt) { // 드래곤: 모든 이동(넉백·충돌·지형·끌어당김 등) 뒤에 위치를 되돌림
    oStep.call(this, dt);
    for (const u of this.u) { const P = u.schPin; if (!P || u.dead) continue;
      if (P.stage !== this.stageId) { P.stage = this.stageId; P.x = u.x; P.y = u.y; } // 루인 등 스테이지 교체: 새 위치에서 다시 고정
      u.x = P.x; u.y = P.y; u.push = null; u.pull = null; u.v = null; if (u.air) u.air = null; }
  };
  window.__sch = { setForm, dragon, FORMS }; // 테스트용

  // ---------- 공용 훅 ----------
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.schTor && b.schTor.length) b.schTor = b.schTor.filter(T => !b.over && torStep(b, T, dt));
      for (const u of b.u) {
        if (u.def.id !== ID || b.over) continue;
        if (u.dead) { if (u.schGlue) { u.schGlue.e.schGlueBy = null; u.schGlue = null; } continue; }
        const lost = Math.floor((u.maxHp - u.hp) / (u.maxHp * u.def.sch.unit)); // 체력 단위 감소 → 흡수 초기화
        if (lost > (u.schLost || 0)) { u.schLost = lost; if (u.schCopy) dropCopy(b, u, '흡수 초기화'); }
        if (u.schDragonA && u.action !== u.schDragonA) u.action = u.schDragonA; // 다른 효과가 행동을 지워도 드래곤 불길 유지
        if (u.schForm) formStep(b, u, b.enemy(u), dt);
        if (u.schGlue) glueStep(b, u, dt);
      }
    },
    drawOver(ctx, b) {
      for (const T of b.schTor || []) drawTor(ctx, b, T);
      for (const u of b.u) {
        if (u.def.id !== ID || u.dead) continue;
        if (u.schForm && u.schForm.kind === 'dragon') drawBreath(ctx, b, u);
        if (u.schGlue) { const e = u.schGlue.e; ctx.save(); ctx.strokeStyle = '#b070d0'; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
          for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(u.x, u.y - 14 - i * 8); ctx.quadraticCurveTo((u.x + e.x) / 2, (u.y + e.y) / 2 - 30 - i * 6 + Math.sin(b.time * 8 + i) * 4, e.x, e.y - 16 - i * 8); ctx.stroke(); } ctx.restore(); }
        if (u.schCopy) { ctx.save(); ctx.fillStyle = '#ffe8b0'; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(b.time * 6); ctx.fillRect(Math.round(u.x) - 2, Math.round(u.y) - 62, 4, 4); ctx.restore(); }
      }
    },
  });

  // ---------- 캐릭터 ----------
  CHARACTERS.push({
    id: ID, name: '슈르프', fullName: '카마이타치 슈르프', gender: 'female', color: '#c8a870',
    stats: { hp: 820, atk: 30, spd: 270, range: 50, atkRate: 0.9, def: 15 },
    attack: { element: 'slash', delivery: 'melee' },
    resist: { slash: 0.85, fire: 1.15 },
    skills: [
      { id: 'absorb', name: '흡수', cd: 4, wind: 0.35 },
      { id: 'dustTornado', name: '더스트 토네이도', cd: 9, wind: 0.4, R: 120, dur: 1.5, tick: 0.25, mIn: 0.1, mOut: 0.55, element: 'blunt', delivery: 'ranged' },
      { id: 'schTransform', name: '변신!', cd: 12, dur: { rabbit: 6, snake: 5, octopus: 5, bear: 7 } },
      { id: 'schFinal', name: '최후의 변신', cd: 1, element: 'fire', delivery: 'ranged' },
    ],
    sch: { // 수치 (README 참고)
      unit: 0.2,
      rabbit: { eva: 0.45, every: 0.9, air: 0.45, h: 26, r: 60, mult: 0.5 },
      snake: { every: 1.2, len: 220, spd: 560, dur: 0.4, mult: 1.0, poisonDur: 4, poisonK: 0.25 },
      octo: { spd: 230, glue: 3 },
      bear: { reach: 150, mult: 1.8, stun: 1.5, dr: 0.75 },
      fin: { hpAt: 0.3, lethalK: 2.5, spin: 0.7, spinSpd: 300, spinMult: 1.4, lift: 1.0, turn: 5, len: 190, half: 0.22, tick: 0.15, mult: 0.55, drain: 45 },
    },
    extraDefs: Object.values(FORMS),
    sprite: { src: IMG + 'front.png', back: IMG + 'back.png', scale: 3, foot: 1 },
    portrait: IMG + 'portrait.png',
    lines: {
      skill: {
        '흡수': ['그 기술, 잠시 빌리겠습니다.', '좋은 교재로군요.', '배운 것은 바로 써 보는 법이지요.'],
        '더스트 토네이도': ['모래바람 속에서 반성하세요.', '가장자리가 가장 아프답니다.', '수업을 시작하죠.'],
        '변신!': ['잠시 모습을 바꾸겠습니다.', '이 모습이 더 편하군요.', '놀라지 마세요.'],
        '최후의 변신': ['도망쳤던 그날과는 다릅니다.', '이번엔… 도망치지 않겠어요.', '마지막 수업입니다.'],
      },
      event: {
        battleStart: ['예의 바르게 시작하죠, {opp}.', '수업 태도를 보겠습니다.', '앞치마는 벗지 않아도 되겠군요.'],
        lowHp: ['…조금 지쳤군요.', '아직 수업은 끝나지 않았습니다.'],
        healed: ['고맙습니다. 기억해 두죠.'],
        stunned: ['품위 없는 방식이군요.'],
        knockedDown: ['옷이 더러워졌네요.'],
        win: ['오늘 수업은 여기까지.', '복습은 각자 하도록.', '훌륭한 교재였습니다.'],
        lose: ['…이번에도, 도망쳤어야 했나요.', '수업은… 다음에.'],
      },
    },
  });
})();
