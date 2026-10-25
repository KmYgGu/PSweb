/* =========================================================
 * 카이바 (두 번째 듀얼리스트) — 덱 40장 + 엑스트라 덱 5장
 *  - 특수 승리 없음. 강력한 공격 + 유희 전술 파훼(덱 파괴·패 공격·카드 타입 맞추기)
 *  - 카드 id K01~K40 = 유저 목록 번호 (K02/K03 = 푸른 눈의 백룡 사본 → 덱에서 K01 ×3)
 *  - 엑스트라 덱 KX1~KX5 (융합으로만 소환)
 *  - 프레임워크: js/duel.js (needFor/playHooks/planHooks/setupHooks/nextDraw/onDraw/nextMonMult 확장)
 *  - 모든 공격은 시전 순간의 방향/위치로 고정(비추적). 예외: YZ 캐터필러 드래곤(유저 지정: 추적 돌진)
 *  - 광선·구체·돌진은 벽/스테이지 장애물에서 멈추거나 튕김
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2, CFG = DUEL.CFG, A = CFG.ATK_SCALE;
  const BW = 'K01';
  const say = DUEL.say, sys = DUEL.sys;
  const canLaunch = t => t && !t.dead && !t.airborne && !t.climb && !t.inTrain && !t.status('pin');
  const kfx = b => b.kfx || (b.kfx = []);
  const kproj = b => b.kproj || (b.kproj = []);
  const free = (b, x, y) => { if (b.blockAt(x, y)) return false; const q = b.clampPos(x, y, 0); return Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1; };
  function rayLen(b, x, y, ca, sa, max) { let L = 0; while (L < max) { if (!free(b, x + ca * (L + 6), y + sa * (L + 6))) break; L += 6; } return L; }
  const angTo = (u, t) => Math.atan2(t.y - u.y, t.x - u.x);
  const effMax = o => o.def.duelist ? o.maxHp / CFG.LP_SCALE : o.maxHp;

  // ---------- 공통 공격 ----------
  // 광선: 시전 순간 상대 방향으로 고정. 벽/장애물에서 멈춤. o.tick/o.dur 없으면 1회 판정
  function kbeam(ctx, amt, o = {}) {
    const { b, u } = ctx, t = o.target || ctx.e; if (!t) return;
    const x0 = u.x + Math.cos(angTo(u, t)) * 12, y0 = u.y, a = o.ang != null ? o.ang : Math.atan2(t.y - y0, t.x - x0), ca = Math.cos(a), sa = Math.sin(a);
    const w = o.w || 24, wu = o.windup ?? 0.45, L = rayLen(b, x0, y0, ca, sa, o.len || 520), H = 26;
    b.telegraphLine(x0, y0 - H, x0 + ca * L, y0 + sa * L - H, w, wu, o.tele || '#d8f0ff');
    if (o.epic) kfx(b).push({ type: 'charge', x: x0, y: y0 - H, w, t: 0, dur: wu, col: o.col || '#8ad0ff', col2: o.col2 || '#e8f8ff', seed: Math.random() * 99 });
    b.later(wu, () => {
      if (u.dead || b.over) return;
      if (o.epic) { // 백룡 계열: 강화 연출 (판정은 동일)
        const ex = x0 + ca * L, ey = y0 + sa * L - H;
        kfx(b).push({ type: 'ebeam', x: x0, y: y0 - H, ca, sa, L, w, t: 0, dur: o.fxDur || 0.9, col: o.col || '#8ad0ff', col2: o.col2 || '#e8f8ff', seed: Math.random() * 99 });
        kfx(b).push({ type: 'impact', x: ex, y: ey, w, t: 0, dur: 0.6, col: o.col || '#8ad0ff', col2: o.col2 || '#e8f8ff' });
        b.shake(o.shake || 6); b.glow(x0, y0 - H, w * 2.4, '#ffffff', 0.35); b.glow(ex, ey, w * 2.2, o.col || '#8ad0ff', 0.6);
        b.ring(ex, ey, 6, w * 2.2, 0.45, o.col2 || '#e8f8ff');
        for (let d = 40; d < L; d += 60) b.sparks(x0 + ca * d, y0 + sa * d - H, d % 120 < 60 ? '#ffffff' : (o.col || '#8ad0ff'), 4, 140);
        b.sparks(ex, ey, '#ffffff', 18, 300); b.sparks(ex, ey, o.col || '#8ad0ff', 14, 220);
      } else kfx(b).push({ type: 'beam', x: x0, y: y0 - H, ca, sa, L, w, t: 0, dur: o.fxDur || 0.4, col: o.col || '#8ad0ff', col2: o.col2 || '#e8f8ff' });
      b.shake(o.shake || 2.5); b.glow(x0, y0 - H, w * 1.5, o.col || '#8ad0ff', 0.4);
      for (const f of b.foes(u)) {
        const dx = f.x - x0, dy = f.y - y0, al = dx * ca + dy * sa, pp = Math.abs(-dx * sa + dy * ca);
        if (al > -10 && al < L + 10 + f.pad && pp < w / 2 + 10 + f.pad) ctx.damage(f, amt, { element: o.element || 'light', big: true, applies: o.applies, pierce: o.pierce });
      }
      b.sparks(x0 + ca * L, y0 + sa * L - H, o.col2 || '#e8f8ff', 12, 220);
    });
  }
  // 부채꼴 근접/근거리: 시전 순간 방향 고정, delay 뒤 판정
  function kfan(ctx, amt, o = {}) {
    const { b, u } = ctx, t = ctx.e; if (!t) return;
    const R = o.range || 105, sp = o.spread || 0.6, a = angTo(u, t), col = o.color || '#ffe0b0', dl = o.delay ?? 0.28, O = { x: u.x, y: u.y }; // 위치·방향 모두 시전 순간 고정
    b.telegraphFan(O.x, O.y - 14, a, sp, R, dl, col);
    b.later(dl, () => {
      if (u.dead || b.over) return;
      for (let i = -1; i <= 1; i++) b.crescent(O.x + Math.cos(a + i * sp * 0.6) * R * 0.55, O.y - 16 + Math.sin(a + i * sp * 0.6) * R * 0.55, R * 0.35, a - 0.7, col, 0.25);
      for (const f of b.foes(u)) { const d = Math.hypot(f.x - O.x, f.y - O.y), fa = Math.atan2(f.y - O.y, f.x - O.x), df = Math.abs(Math.atan2(Math.sin(fa - a), Math.cos(fa - a))); if (d <= R + f.pad && df <= sp + 0.15) ctx.damage(f, amt, { element: o.element || 'slash', delivery: o.delivery || 'melee', pierce: o.pierce, applies: o.applies, big: o.big }); }
      if (o.after) o.after(a);
    });
  }
  // 고정 위치 폭발 (경고 원)
  function blastAt(ctx, x, y, r, delay, amt, o = {}) {
    const { b, u } = ctx;
    b.telegraphCircle(x, y, r, delay, o.col || '#ffb07a');
    b.later(delay, () => {
      if (b.over) return;
      if (o.bolt) { b.bolt(x, y, 80, o.col || '#bfe8ff'); b.bolt(x + 6, y, 60, '#ffffff'); b.sparks(x, y - 10, o.col || '#bfe8ff', 14, 220); }
      else b.explosion(x, y, r);
      for (const f of b.foes(u)) if (Math.hypot(f.x - x, (f.y - y) / 0.8) <= r + 8 + f.pad && (!f.airborne || o.air)) { const d = ctx.damage(f, amt, { element: o.element || 'blunt', big: true, applies: o.applies }); if (o.onHit && d > 0) o.onHit(f); }
    });
  }
  function randomSpot(b, u, avoid) {
    for (let i = 0; i < 50; i++) {
      const x = rand(20, 340), y = rand(110, 600), q = b.clampPos(x, y, u.pad, u);
      if (Math.abs(q.x - x) > 1 || Math.abs(q.y - y) > 1 || b.blockAt(x, y, u.pad) || b.zoneAt(x, y)) continue;
      if (avoid && Math.hypot(avoid.x - x, avoid.y - y) < 70) continue;
      return { x, y };
    }
    return null;
  }
  const mill = (b, f, n) => { const D = f.duel, out = []; for (let i = 0; i < n && D.deck.length; i++) { const c = D.deck.shift(); D.grave.push(c); out.push(c); } return out; };

  // ---------- 융합 ----------
  const RECIPES = [
    { ex: 'KX5', mats: [BW, BW, BW] },
    { ex: 'KX4', mats: ['K19', 'K20', 'K21'] },
    { ex: 'KX3', mats: ['K20', 'K21'] },
    { ex: 'KX1', mats: ['K19', 'K20'] },
    { ex: 'KX2', mats: ['K19', 'K21'] },
  ];
  function fusionPlan(D, extraHand) { // 패에서 재료 찾기. 버사고(K28) 1장이 재료 1장을 대신할 수 있음
    if (!D || !D.extra) return null;
    const hand = D.hand.concat(extraHand || []);
    for (const R of RECIPES) {
      const ex = D.extra.find(c => c.id === R.ex); if (!ex) continue;
      const used = [], miss = [];
      for (const id of R.mats) { const c = hand.find(h => h.id === id && !used.includes(h)); if (c) used.push(c); else miss.push(id); }
      if (miss.length > 1) continue;
      if (miss.length === 1) { const bg = hand.find(h => h.id === 'K28' && !used.includes(h)); if (!bg) continue; used.push(bg); }
      return { ex, mats: used, sub: miss.length === 1 };
    }
    return null;
  }
  const isMat = id => id === 'K19' || id === 'K20' || id === 'K21' || id === 'K28';

  // ---------- 카드 효과 전용 ----------
  function useFromHand(ctx, ci, label) { const D = ctx.u.duel; const i = D.hand.indexOf(ci); if (i < 0) return; D.hand.splice(i, 1); D.grave.push(ci); ctx.useMonster(ci, { label }); }
  function setNextBW(b, u, why) { const D = u.duel; if (!D || !D.deck.some(c => c.id === BW)) return false; D.nextDraw = BW; b.text(u.x, u.y - 76, '다음 드로우: 푸른 눈의 백룡', '#bfe8ff', 9); say(b, u, `${why}: 다음 드로우를 푸른 눈의 백룡으로 선택`); return true; }
  function phantasm(b, u, dur) { const D = u.duel; if (!D) return; D.kPhant = { t: dur, ext: 0 }; b.ring(u.x, u.y - 18, 8, 44, 0.5, '#bfe8ff'); b.glow(u.x, u.y - 30, 50, '#bfe8ff', 0.5); b.text(u.x, u.y - 70, '백룡의 가호!', '#dff2ff', 10); }

  const KAIBA_CARDS = [
    { id: 'K01', name: '푸른 눈의 백룡', type: 'monster', level: 8, atk: 3000, def: 2500, element: 'light', sprite: 'bewd', shout: '멸망을 부르는 우뢰탄!',
      text: '[릴리스 2] 시전 순간 상대 방향으로 고정된 전방 광선 (ATK×1.3, 폭 26, 벽·장애물에서 멈춤).',
      effect(ctx) { kbeam(ctx, ctx.atk(1.3), { w: 30, windup: 0.28, epic: true }); },
      ai: { tags: ['damage'], range: 420, dmg: 1.3, priority: 10, keep: 22 } },
    { id: 'K04', name: '드래곤 자각의 선율', type: 'spell', text: '패 1장을 버리고 덱에서 레벨 8 몬스터 2장(백룡 우선)을 패로.',
      effect(ctx) { ctx.discardWorst(1); let n = 0; for (const p of [BW, BW, 'K24', d => d.level === 8]) { if (n >= 2) break; if (ctx.deck.search(p)) n++; } ctx.text(`레벨 8 ×${n} 서치`, '#bfe8ff'); },
      ai: { tags: [], when: S => S.hand >= 2 && S.u.duel.deck.some(c => c.def.level === 8), score: S => 14 + (S.inHand('K18') || S.inHand('K30') || S.inHand('K24') ? 14 : 0) + (S.inHand('K27') ? 8 : 0) - (S.hand >= 6 ? 10 : 0) } },
    { id: 'K05', name: '코스트 다운', type: 'spell', text: '패 1장을 버리고 패의 모든 몬스터 레벨 -2 (패에 있는 동안 유지).',
      effect(ctx) { ctx.discardWorst(1); let n = 0; for (const c of ctx.u.duel.hand) if (c.def.type === 'monster' && c.def.level) { c.lvMod = (c.lvMod || 0) - 2; n++; } ctx.text(`몬스터 ${n}장 레벨 -2`, '#9cf0c0'); },
      ai: { tags: [], when: S => S.u.duel.hand.some(c => c.def.type === 'monster' && DUEL.effLv(c) >= 5) && S.hand >= 3, score: S => 6 + 10 * S.u.duel.hand.filter(c => c.def.type === 'monster' && DUEL.effLv(c) >= 5).length } },
    { id: 'K06', name: '죽음의 덱 파괴 바이러스', type: 'trap', text: '상대가 스킬/카드를 쓸 때: 무작위 상태이상. 상대가 듀얼리스트면 대신 상대 덱 위 5장을 묘지로.',
      trigger: { on: 'oppSkill' },
      effect(ctx, ev) {
        const t = ev.src || ctx.e; if (!t) return; const { b } = ctx;
        b.shock(t.x, t.y - 16, 6, 46, '#c050ff', 0.5, 4); b.smoke(t.x, t.y - 18, '#a040e0', 10);
        if (t.duel) { const L = mill(b, t, 5); b.text(t.x, t.y - 64, `덱 파괴 ×${L.length}`, '#e0a0ff', 11); sys(b, `덱 파괴 바이러스: ${t.def.name}의 덱 위 ${L.length}장 묘지로 (${L.map(c => c.def.name).join(', ')})`); return; }
        const pool = [['poison', 4, 6], ['paralysis', 2.5], ['confusion', 3], ['weaken', 5], ['slow', 4], ['seal', 3]], p = pool[Math.floor(Math.random() * pool.length)];
        ctx.status(t, p[0], p[1], 1, p[2]); b.text(t.x, t.y - 64, '바이러스 감염!', '#e0a0ff', 10);
      },
      ai: { priority: 6, score: S => (S.oppDuelist ? 16 + (S.u.duel && S.e && S.e.duel && S.e.duel.deck.length <= 7 ? 20 : 0) : S.oppHasSkills ? 4 : -30) } },
    { id: 'K07', name: '어둠의 어릿광대 사기', type: 'monster', level: 3, atk: 1200, def: 1500, element: 'dark', sprite: 'sagi', shout: '다크 글라이더!',
      text: '어둠 구체 (ATK×0.35, 시전 방향 직선). 벽/장애물에 부딪히면 2개로 갈라지며 튕김 (최대 3번 → 최대 8개).',
      effect(ctx) { const { b, u } = ctx, e = ctx.e; if (!e) return; const a = angTo(u, e), o = ctx.origin(); kproj(b).push({ type: 'orb', u, ctx, x: o.x, y: u.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, gen: 0, life: 2.4, amt: ctx.atk(0.35) }); },
      ai: { tags: ['damage'], range: 320, dmg: 0.6, keep: -2 } },
    { id: 'K08', name: '크로스 소울', type: 'spell', text: '상대 스킬 1개(가장 빨리 준비되는 것) 쿨타임 +6초. 상대가 듀얼리스트면 대신 상대 패 1장(무작위)을 묘지로. 그리고 다음 고레벨 몬스터의 릴리스 -1 (1회).',
      effect(ctx) {
        const { b, u } = ctx, t = ctx.e; if (!t) return; u.duel.tribCut = (u.duel.tribCut || 0) + 1;
        b.wireFx && b.wireFx(u, t, 0.4, 2); b.glow(t.x, t.y - 18, 34, '#c8a0ff', 0.4);
        if (t.duel) { const H = t.duel.hand; if (H.length) { const c = H.splice(Math.floor(Math.random() * H.length), 1)[0]; t.duel.grave.push(c); b.text(t.x, t.y - 64, `패 파괴: ${c.def.name}`, '#e0c0ff', 10); sys(b, `크로스 소울: ${t.def.name}의 패 ${c.def.name} → 묘지`); } }
        else { let bi = -1, bt = 1e9; t.skills.forEach((sl, i) => { if (sl.hidden || !SKILLS[sl.id]) return; if (t.skillT[i] < bt) { bt = t.skillT[i]; bi = i; } }); if (bi >= 0) { t.skillT[bi] = Math.max(0, t.skillT[bi]) + 6; b.text(t.x, t.y - 64, `${t.skills[bi].name} 쿨 +6초`, '#c8b0ff', 9); } }
        ctx.text('릴리스 -1', '#ffe0a0');
      },
      ai: { tags: [], when: S => S.oppDuelist ? !!(S.e && S.e.duel.hand.length) : S.oppHasSkills, score: S => (S.oppDuelist ? 18 + (S.e.duel.hand.length >= 5 ? 6 : 0) : 8 + (S.oppSkillSoon < 2 ? 8 : 0)) + (S.u.duel.hand.some(c => DUEL.effLv(c) >= 5) ? 8 : 0) } },
    { id: 'K09', name: '미노타우로스', type: 'monster', level: 4, atk: 1700, def: 1000, element: 'slash', sprite: 'minotaur', shout: '액스 크러셔!',
      text: '전방 도끼 베기 (부채꼴 반경 105, ATK×1.0, 방어 50% 무시).',
      effect(ctx) { kfan(ctx, ctx.atk(1.0), { range: 105, spread: 0.6, pierce: 0.5, color: '#e0c090', big: true }); },
      ai: { tags: ['damage'], range: 115, melee: true, dmg: 1.0 } },
    { id: 'K10', name: '램프의 요정 라진', type: 'monster', level: 4, atk: 1800, def: 1000, element: 'fire', sprite: 'lajinn', shout: '마정화염장!',
      text: '길다란 화염 에너지 파 (폭 22, 길이 240, ATK×0.9, 시전 방향 고정).',
      effect(ctx) { kbeam(ctx, ctx.atk(0.9), { w: 22, len: 240, windup: 0.3, element: 'fire', col: '#ff8a3a', col2: '#ffe0a0', tele: '#ffb070', shake: 1.2 }); },
      ai: { tags: ['damage'], range: 240, dmg: 0.9 } },
    { id: 'K11', name: '공격 무력화', type: 'trap', text: '상대 공격이 닿을 때: 그 공격을 무효로 하고 상대를 1.6초 속박 (그 자리에 가만히).',
      trigger: { on: 'oppHit', when: (ctx, ev) => ev.amount > 0 && ev.src && !ev.src.dead },
      effect(ctx, ev) { ctx.negate(); const t = ev.src; ctx.b.ring(ctx.u.x, ctx.u.y - 18, 8, 40, 0.4, '#a8d8ff'); ctx.b.text(ctx.u.x, ctx.u.y - 60, '공격 무력화!', '#cfe8ff', 10); if (t) { t.action = null; ctx.status(t, 'bind', 1.6); } },
      ai: { priority: 6, score: S => (S.oppSkillHeavy ? 6 : 2) } },
    { id: 'K12', name: '죽은 자의 소생', type: 'spell', text: '묘지 몬스터 1장(엑스트라 몬스터 포함)의 효과를 레벨·릴리스와 관계없이 발동 (AI가 가장 좋은 것 선택).',
      effect(ctx) { const c = ctx.bestGrave(); if (c) ctx.useMonster(c, { label: '소생', keepZone: 'grave' }); },
      ai: { tags: ['grave'], when: S => S.graveMonsters > 0, score: S => S.bestGraveScore + 2 } },
    { id: 'K13', name: '욕망의 항아리', type: 'spell', text: '카드 2장 드로우.',
      effect(ctx) { ctx.draw(2); }, ai: { tags: ['draw'], draw: 2 }, borrowable: false },
    { id: 'K14', name: '오벨리스크의 거신병', type: 'monster', level: 10, atk: 4000, def: 4000, element: 'blunt', sprite: 'obelisk', shout: '갓 핸드 크러셔!',
      text: '[릴리스 3] 시전 순간 상대 위치에 거대한 주먹 (경고 원): 직격 ATK×1.2, 맵 전체 충격파로 지상의 상대 기절 1.2초 + ATK×0.15 (공중은 충격파 무효).',
      effect(ctx) { ctx.godHand(ctx.atk(1.2), ctx.atk(0.15), 1.2); },
      ai: { tags: ['damage', 'control'], range: 9999, dmg: 0.9, priority: 18, keep: 30 } },
    { id: 'K15', name: '에너미 컨트롤러', type: 'spell', text: '자신의 패 수만큼(최대 6) 상대에게 강제 명령 (0.5초 간격, 패 카드 타입 순서): 몬스터 → 제자리 한 바퀴 돌며 정지 0.5초, 마법 → 점프(공중), 함정 → 자기 기본 공격 피해.',
      effect(ctx) {
        const { b, u } = ctx, t = ctx.e; if (!t) return;
        const cmds = u.duel.hand.slice(0, 6).map(c => c.def.type); if (!cmds.length) cmds.push('monster');
        b.text(t.x, t.y - 70, `강제 명령 ×${cmds.length}`, '#ffd0a0', 10);
        cmds.forEach((ty, i) => b.later(0.25 + i * 0.5, () => {
          if (u.dead || b.over || t.dead) return;
          if (ty === 'monster') { t.spinT = 0.5; t.action = null; b.applyStatus(t, 'stun', 0.5, u, { noResistScale: true }); b.text(t.x, t.y - 58, '정지!', '#ffd0a0', 9); }
          else if (ty === 'spell') { if (canLaunch(t)) { t.action = null; t.air = { t: 0, dur: 0.6, h: 38 }; } b.text(t.x, t.y - 58, '점프!', '#a8ffd0', 9); }
          else { b.damage(u, t, t.st.atk * 0.85, { element: (t.def.attack && t.def.attack.element) || 'blunt', delivery: 'melee', sure: true, cardDmg: true }); b.text(t.x, t.y - 58, '자기 공격!', '#ffa8d8', 9); b.sparks(t.x, t.y - 18, '#ffa8d8', 8, 160); }
        }));
      },
      ai: { tags: ['control'], range: 400, when: S => S.hand >= 3, score: S => 4 * Math.min(6, S.hand - 1) + (S.oppCasting ? 6 : 0) } },
    { id: 'K16', name: '거대화', type: 'spell', text: '다음에 발동하는 몬스터 효과의 피해 ×2.',
      effect(ctx) { ctx.u.duel.nextMonMult = 2; ctx.b.glow(ctx.u.x, ctx.u.y - 30, 40, '#ffb060', 0.5); ctx.text('다음 몬스터 공격력 ×2', '#ffb060'); },
      ai: { tags: [], when: S => !S.u.duel.nextMonMult && S.u.duel.hand.some(c => c.def.type === 'monster' && (c.def.atk || 0) >= 1500), score: S => 10 + (S.inHand(BW) || S.inHand('K24') ? 12 : 0) } },
    { id: 'K17', name: '생명 단축의 패', type: 'spell', text: '3장 드로우. 뽑은 3장을 모두 쓰기(패에서 사라지기) 전에 다른 카드를 사용하면 자신에게 1000 피해.',
      effect(ctx) { const D = ctx.u.duel, n0 = D.hand.length, got = ctx.draw(3); D.kLife = new Set(D.hand.slice(n0, n0 + got).map(c => c.uid)); if (got) ctx.text('뽑은 카드부터 써야 한다!', '#ff9ab0'); },
      ai: { tags: ['draw'], draw: 3, when: S => S.deck >= 9 && S.hand <= 3 && S.myLp > 1600 && !S.u.duel.kLife, score: S => (S.hand <= 1 ? 10 : 0) } },
    { id: 'K18', name: '드래곤의 통제자', type: 'monster', level: 4, atk: 1100, def: 900, element: 'dark', sprite: 'controller', shout: '미드나이트 리버브!',
      text: '패의 레벨 6~8 몬스터를 릴리스 없이 전부 발동 (0.8초 간격).',
      effect(ctx) {
        const { b, u } = ctx, D = u.duel; b.ring(u.x, u.y - 18, 8, 60, 0.6, '#c080ff'); b.shock(u.x, u.y - 16, 6, 70, '#a060e0', 0.5, 4);
        const L = D.hand.filter(c => c.def.type === 'monster' && DUEL.effLv(c) >= 6 && DUEL.effLv(c) <= 8 && !c.def.onDraw);
        if (!L.length) { ctx.text('부를 드래곤이 없다', '#c8c0d8'); return; }
        L.forEach((c, i) => b.later(0.5 + i * 0.8, () => { if (!u.dead && !b.over && D.hand.includes(c)) useFromHand(ctx, c, '통제자'); }));
      },
      ai: { tags: [], when: S => S.u.duel.hand.some(c => c.def.type === 'monster' && DUEL.effLv(c) >= 6 && DUEL.effLv(c) <= 8 && !c.def.onDraw), score: S => 20 + 22 * S.u.duel.hand.filter(c => c.def.type === 'monster' && DUEL.effLv(c) >= 6 && DUEL.effLv(c) <= 8).length - (S.inHand('K27') && S.u.duel.hand.filter(c => c.id === BW).length >= 3 ? 40 : 0) } },
    { id: 'K19', name: 'X-헤드 캐논', type: 'monster', level: 4, atk: 1800, def: 1500, element: 'blunt', sprite: 'xHead', shout: '듀얼 캐논!',
      text: '대포 2발: 시전 순간 상대 위치와 0.35초 뒤 위치를 기억해 포물선 발사 (비추적). 날아가는 동안 공중 상대에게도 적중, 떨어진 자리에서 폭발 (각 ATK×0.55, 반경 34).',
      effect(ctx) {
        const { b, u } = ctx, shot = () => { const e = ctx.e; if (!e || u.dead || b.over) return; const o = ctx.origin(); kproj(b).push({ type: 'shell', u, ctx, sx: o.x, sy: u.y, tx: e.x, ty: e.y, t: 0, dur: 0.75, h: 80, amt: ctx.atk(0.55) }); b.text(e.x, e.y - 50, '◎', '#ffd040', 9); b.telegraphCircle(e.x, e.y, 34, 0.75, '#ffd070'); };
        shot(); b.later(0.35, shot);
      },
      ai: { tags: ['damage'], range: 320, dmg: 1.0, keep: 8, score: S => (S.oppAir ? 6 : 0) } },
    { id: 'K20', name: 'Y-드래곤 헤드', type: 'monster', level: 4, atk: 1500, def: 1600, element: 'elec', sprite: 'yDragon', shout: '일렉트릭 빔!',
      text: '전기 빔 (폭 18, ATK×1.0, 30% 마비 1.5초, 시전 방향 고정).',
      effect(ctx) { kbeam(ctx, ctx.atk(1.0), { w: 18, len: 360, windup: 0.3, element: 'elec', col: '#ffe860', col2: '#ffffff', tele: '#fff0a0', shake: 1.2, applies: [{ status: 'paralysis', duration: 1.5, chance: 0.3 }] }); },
      ai: { tags: ['damage'], range: 340, dmg: 1.0, keep: 8 } },
    { id: 'K21', name: 'Z-메탈 캐터필러', type: 'monster', level: 4, atk: 1500, def: 1300, element: 'blunt', sprite: 'zMetal', shout: '더스트 그라운드!',
      text: '전차 로봇이 도약해 시전 순간 상대 위치로 낙하 (0.75초 뒤, 반경 42, ATK×1.1, 비추적).',
      effect(ctx) {
        const { b, u } = ctx, e = ctx.e; if (!e) return; const x = e.x, y = e.y;
        kfx(b).push({ type: 'jump', spr: 'zMetal', sx: u.x, sy: u.y, tx: x, ty: y, t: 0, dur: 0.75, h: 110 });
        blastAt(ctx, x, y, 42, 0.75, ctx.atk(1.1), { col: '#a8c0ff', element: 'blunt' }); b.later(0.75, () => { b.dust(x, y); b.shake(2.5); b.debris && b.debris(x, y, 8); });
      },
      ai: { tags: ['damage'], range: 300, dmg: 1.1, keep: 8 } },
    { id: 'K22', name: '마법 흡수', type: 'spell', text: '발동 후 마법 카드를 쓸 때마다 LP 500 회복. 마법이 아닌 카드를 쓰면 효과 종료.',
      effect(ctx) { ctx.u.duel.kAbsorb = true; ctx.text('마법 흡수 전개', '#9cf0c0'); },
      ai: { tags: [], when: S => !S.u.duel.kAbsorb && S.u.duel.hand.filter(c => c.def.type === 'spell').length >= 3, score: S => 4 * S.u.duel.hand.filter(c => c.def.type === 'spell').length + (S.myHpR < 0.6 ? 8 : 0) } },
    { id: 'K23', name: '수축', type: 'spell', text: '6초간 상대를 작게 만든다 (크기 ×0.6 = 충돌 범위도 작아짐, 주는 피해 ×0.6).',
      effect(ctx) { const t = ctx.e, b = ctx.b; if (!t) return; t.buffs = t.buffs.filter(q => q.type !== 'kShrink'); t.buffs.push({ type: 'kShrink', name: '수축', t: 6, dmgDealt: 0.6 }); t.shrinkK = 0.6; b.ring(t.x, t.y - 16, 30, 6, 0.4, '#a8ffd0'); b.text(t.x, t.y - 60, '수축!', '#a8ffd0', 10); },
      ai: { tags: ['defense'], range: 400, when: S => !(S.e && S.e.buff('kShrink')), score: S => 6 + (S.oppSkillHeavy ? 8 : 0) + (S.oppMelee && S.d < 120 ? 6 : 0) } },
    { id: 'K24', name: '푸른 눈의 아백룡', type: 'monster', level: 8, atk: 3000, def: 2500, element: 'light', sprite: 'bewdAlt', shout: '멸망의 번 스트림!',
      text: '[릴리스 2] 패에 "푸른 눈의 백룡"이 있으면 릴리스 없이 사용. 백룡과 같은 전방 광선 (ATK×1.3).',
      effect(ctx) { kbeam(ctx, ctx.atk(1.3), { w: 30, windup: 0.28, col: '#a0c8ff', epic: true }); },
      ai: { tags: ['damage'], range: 420, dmg: 1.3, priority: 10, keep: 16, freeSummon: S => S.inHand(BW) } },
    { id: 'K25', name: '블레이드 나이트', type: 'monster', level: 4, atk: 1600, def: 1000, element: 'slash', sprite: 'bladeKnight', shout: '라이트닝 블레이드!',
      text: '전방 강한 베기 (반경 100). 패가 적을수록 강함: ATK×(1.5 - 0.15×패 수), 최소 ×0.6.',
      effect(ctx) { const n = ctx.hand.count(), k = Math.max(0.6, 1.5 - 0.15 * n); kfan(ctx, ctx.atk(k), { range: 100, spread: 0.55, color: '#e8f0ff', big: k >= 1.2 }); if (k >= 1.2) ctx.text(`패 ${n}장: ×${k.toFixed(2)}`, '#e8f0ff'); },
      ai: { tags: ['damage'], range: 110, melee: true, est: S => 1600 * A * Math.max(0.6, 1.5 - 0.15 * Math.max(0, S.hand - 1)) } },
    { id: 'K26', name: '카이저 글라이더', type: 'monster', level: 6, atk: 2400, def: 2200, element: 'light', sprite: 'kaiserGlider', shout: '골든 버스트!',
      text: '[릴리스 1] 황금 날개 방패 (내구도 = ATK×0.035×0.7 ≈ 59, 초당 12 감소). 내구도 이하 피해는 완전 무효(내구도 그대로), 초과 피해는 방패를 부수고 초과분만 받음. 방패가 사라지면 묘지의 가장 강한 몬스터 1장을 패로.',
      effect(ctx) { const D = ctx.u.duel; if (!D) return; const hp = ctx.atk(0.7); D.kGlider = { hp, max: hp }; ctx.b.shock(ctx.u.x, ctx.u.y - 18, 6, 40, '#ffd040', 0.4, 4); },
      ai: { tags: ['defense'], buffType: null, when: S => !S.u.duel.kGlider, keep: 6 } },
    { id: 'K27', name: '융합', type: 'spell', text: '패의 지정 몬스터(파괴신 버사고 1장이 재료 1장 대신 가능)를 묘지로 보내고 엑스트라 덱의 융합 몬스터를 특수 소환해 효과 발동. 우선순위: 궁극의 푸른 눈의 백룡 > XYZ > YZ > XY > XZ.',
      effect(ctx) {
        const D = ctx.u.duel, P = fusionPlan(D); if (!P) { ctx.text('융합 재료 부족', '#c8c0d8'); return; }
        for (const m of P.mats) { D.hand.splice(D.hand.indexOf(m), 1); D.grave.push(m); }
        D.extra.splice(D.extra.indexOf(P.ex), 1); D.grave.push(P.ex);
        say(ctx.b, ctx.u, `융합! ${P.mats.map(m => m.def.name).join(' + ')}${P.sub ? ' (버사고 대체)' : ''} → ${P.ex.def.name}`);
        ctx.b.ring(ctx.u.x, ctx.u.y - 30, 6, 60, 0.6, '#ffe080'); ctx.b.glow(ctx.u.x, ctx.u.y - 40, 60, '#ffe080', 0.6);
        ctx.b.later(0.3, () => { if (!ctx.u.dead && !ctx.b.over) ctx.useMonster(P.ex, { label: '융합 소환' }); });
      },
      ai: { tags: ['damage'], range: 9999, when: S => !!fusionPlan(S.u.duel), est: S => { const P = fusionPlan(S.u.duel); return P ? P.ex.def.atk * A * (P.ex.def.ai.dmg || 1.2) : 0; }, priority: 24 } },
    { id: 'K28', name: '파괴신 버사고', type: 'monster', level: 3, atk: 1200, def: 1100, element: 'dark', sprite: 'berserkGod', shout: '절망의 강폭풍!',
      text: '융합 재료 1장을 대신할 수 있음. 몬스터로 쓰면 시전 순간 상대 위치에 폭풍 (반경 70, 2.2초): 범위 안 상대를 중심으로 끌어당기며 0.4초마다 ATK×0.07.',
      effect(ctx) { const { b, u } = ctx, e = ctx.e; if (!e) return; (b.kStorm || (b.kStorm = [])).push({ u, ctx, x: e.x, y: e.y, r: 70, t: 0, dur: 2.2, tick: 0.4, amt: ctx.atk(0.07) }); b.telegraphCircle(e.x, e.y, 70, 0.3, '#8a8ab0'); },
      ai: { tags: ['damage', 'control'], range: 320, dmg: 0.35, keep: 6, score: S => (S.inHand('K27') || S.inDeck('K27') ? -18 : 0) } },
    { id: 'K29', name: '뱀파이어 로드', type: 'monster', level: 5, atk: 2000, def: 1500, element: 'dark', sprite: 'vampire', shout: '뱀파이어 로드!',
      text: '[릴리스 1] 박쥐 떼를 시전 방향으로 직선 발사 → 맞으면 1.2초 붙잡아 흡혈 (0.3초마다 ATK×0.22, 4회), 준 피해만큼 LP 회복. 상대가 듀얼리스트면 대신 카드 타입 선언: 상대 패에 있으면 상대는 그 타입 1장을 버리고 다시 선언 (최대 3회).',
      effect(ctx) {
        const { b, u } = ctx, t = ctx.e; if (!t) return;
        if (t.duel) {
          const known = new Set([...t.duel.grave, ...t.duel.banished].map(c => c.uid));
          let n = 0;
          const step = () => {
            if (u.dead || b.over || n >= 3) return; n++;
            const pool = [...t.duel.deck, ...t.duel.hand].filter(c => !known.has(c.uid)); const cnt = { monster: 0, spell: 0, trap: 0 }; for (const c of pool) cnt[c.def.type]++; // 공개 정보(덱 구성 − 묘지)로 확률 추정
            const ty = Object.keys(cnt).sort((a, z) => cnt[z] - cnt[a])[0], nm = { monster: '몬스터', spell: '마법', trap: '함정' }[ty];
            b.text(u.x, u.y - 72, `선언: ${nm}!`, '#ff8aa0', 10);
            const hit = t.duel.hand.filter(c => c.def.type === ty);
            if (!hit.length) { b.later(0.3, () => b.text(t.x, t.y - 62, '빗나감', '#c8c0d8', 9)); sys(b, `뱀파이어 로드: ${nm} 선언 → 없음`); return; }
            const c = hit[Math.floor(Math.random() * hit.length)]; t.duel.hand.splice(t.duel.hand.indexOf(c), 1); t.duel.grave.push(c); known.add(c.uid);
            b.later(0.3, () => { b.text(t.x, t.y - 62, `버림: ${c.def.name}`, '#ff8aa0', 9); b.smoke(t.x, t.y - 18, '#a02040', 6); });
            sys(b, `뱀파이어 로드: ${nm} 선언 → 적중! ${t.def.name}의 ${c.def.name} 묘지로`);
            b.later(0.7, step);
          };
          step(); return;
        }
        const a = angTo(u, t), o = ctx.origin();
        kproj(b).push({ type: 'bat', u, ctx, x: o.x, y: u.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, life: 1.0, amt: ctx.atk(0.22) });
      },
      ai: { tags: ['damage'], range: 360, dmg: 0.88, score: S => (S.oppDuelist ? 14 + (S.e && S.e.duel.hand.length >= 4 ? 8 : 0) : (S.missing > 400 ? 6 : 0)) } },
    { id: 'K30', name: '정의의 아군 카이바맨', type: 'monster', level: 3, atk: 200, def: 700, element: 'light', sprite: 'kaibaman', shout: '분쇄! 옥쇄! 대갈채!',
      text: '패의 "푸른 눈의 백룡" 1장을 릴리스 없이 발동. 그 후 다음 드로우를 덱의 "푸른 눈의 백룡"으로 선택.',
      effect(ctx) { const { b, u } = ctx, D = u.duel; const c = D.hand.find(h => h.id === BW); if (c) b.later(0.5, () => { if (!u.dead && !b.over && D.hand.includes(c)) useFromHand(ctx, c, '카이바맨'); }); else ctx.text('패에 백룡이 없다', '#c8c0d8'); setNextBW(b, u, '카이바맨'); },
      ai: { tags: [], when: S => S.inHand(BW) || S.inDeck(BW), score: S => (S.inHand(BW) ? 40 : 8) - (S.inHand('K27') && S.u.duel.hand.filter(c => c.id === BW).length >= 3 ? 50 : 0) } },
    { id: 'K31', name: '트와이라이트존 드래곤', type: 'monster', level: 5, atk: 2400, def: 1800, element: 'dark', sprite: 'twilight', shout: '윙 오브 버스트!',
      text: '[릴리스 1] 2.4초 동안 3번 무작위 위치로 순간이동(물·장애물 제외)하며, 매번 그 순간 상대 방향으로 날갯짓 돌풍 (부채꼴 반경 130, ATK×0.45).',
      effect(ctx) {
        const { b, u } = ctx;
        for (let i = 0; i < 3; i++) b.later(0.15 + i * 0.8, () => {
          if (u.dead || b.over) return; const e = ctx.e; if (!e) return;
          const p = randomSpot(b, u, e); if (p && !u.airborne && !u.climb && !u.inTrain && !u.status('pin')) { b.smoke(u.x, u.y - 18, '#9a6ad8', 8); b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.3, a: 0.5 }); u.x = p.x; u.y = p.y; u.action = null; b.smoke(u.x, u.y - 18, '#c890ff', 8); }
          b.later(0.12, () => { if (!u.dead && !b.over) kfan(ctx, ctx.atk(0.45), { range: 130, spread: 0.7, color: '#c890ff', delay: 0.18, element: 'dark', delivery: 'ranged' }); });
        });
      },
      ai: { tags: ['damage'], range: 300, dmg: 1.0, score: S => (S.oppMelee && S.d < 100 ? 8 : 0) } },
    { id: 'K32', name: '카이저 씨호스', type: 'monster', level: 4, atk: 1700, def: 1650, element: 'slash', sprite: 'seahorse', shout: '카이저 트라이던트!',
      text: '시전 순간 방향으로 70px 전진하며 삼지창 3연속 찌르기 (각 ATK×0.45, 앞쪽 작은 판정). 그 후 다음 몬스터 1회 릴리스 -2.',
      effect(ctx) {
        const { b, u } = ctx, e = ctx.e; u.duel.tribCut = Math.max(u.duel.tribCut || 0, 2); u.duel.tribCutAll = true; ctx.text('다음 몬스터 릴리스 -2', '#ffe0a0');
        if (!e || u.airborne || u.climb || u.inTrain) return;
        const a = angTo(u, e), ca = Math.cos(a), sa = Math.sin(a); u.facing = ca >= 0 ? 1 : -1;
        const st = { type: 'kThrust', t: 0, n: 0 };
        st.step = dt => {
          st.t += dt; if (u.dead || b.over) { u.action = null; return; }
          if (st.t < 0.6) { const nx = u.x + ca * 115 * dt, ny = u.y + sa * 115 * dt; if (free(b, nx, ny) && !b.foes(u).some(f => Math.hypot(f.x - nx, f.y - ny) < 22 + f.pad)) { u.x = nx; u.y = ny; } }
          while (st.n < 3 && st.t >= 0.08 + st.n * 0.2) {
            st.n++; const hx = u.x + ca * 34, hy = u.y + sa * 34;
            b.streak(u.x + ca * 8, u.y - 18 + sa * 8, hx + ca * 16, hy - 18 + sa * 16, '#bfeaff', 5, 0.15);
            for (const f of b.foes(u)) if (!f.airborne && Math.hypot(f.x - hx, (f.y - hy) / 0.8) < 20 + f.pad) { ctx.damage(f, ctx.atk(0.45), { element: 'slash', delivery: 'melee', noCrit: st.n > 1 }); b.sparks(f.x, f.y - 18, '#bfeaff', 6, 160); }
          }
          if (st.t >= 0.75) u.action = null;
        };
        u.action = st;
      },
      ai: { tags: ['damage'], range: 110, melee: true, dmg: 1.35, score: S => (S.u.duel.hand.some(c => DUEL.effLv(c) >= 7) ? 14 : 0) } },
    { id: 'K33', name: '사파이어 드래곤', type: 'monster', level: 4, atk: 1900, def: 1600, element: 'elec', sprite: 'sapphire', shout: '사파이어 스파크!',
      text: '0.6초 힘을 모은 뒤 시전 순간 상대 위치에 전기 낙뢰 (반경 38, ATK×1.1). 모으는 동안 피해를 받았으면 맞은 상대를 멀리 날려 보냄.',
      effect(ctx) {
        const { b, u } = ctx, e = ctx.e; if (!e) return; const x = e.x, y = e.y, D = u.duel;
        D.kSapph = { t: 0.6, hit: false }; b.glow(u.x, u.y - 30, 30, '#9ad8ff', 0.6);
        blastAt(ctx, x, y, 38, 0.6, ctx.atk(1.1), { bolt: true, element: 'elec', col: '#9ad8ff', onHit: f => { if (D.kSapphHit) { b.knockback(f, Math.atan2(f.y - y, f.x - x) || angTo(u, f), 620, 0.5); b.text(f.x, f.y - 60, '반격 증폭!', '#9ad8ff', 10); } } });
        b.later(0.59, () => { D.kSapphHit = !!(D.kSapph && D.kSapph.hit); D.kSapph = null; });
        b.later(0.7, () => { D.kSapphHit = false; });
      },
      ai: { tags: ['damage'], range: 320, dmg: 1.1, score: S => (S.oppAtkSoon || S.incoming ? 6 : 0) } },
    { id: 'K34', name: '천사의 자비', type: 'spell', text: '3장 드로우 후 패 2장 버림 (AI가 가장 안 좋은 카드).',
      effect(ctx) { ctx.draw(3); ctx.discardWorst(2); }, ai: { tags: ['draw'], draw: 3 }, borrowable: false },
    { id: 'K35', name: '파란 눈의 소녀', type: 'monster', level: 1, atk: 0, def: 0, element: 'light', sprite: 'blueGirl', shout: '파란 눈의 소녀!',
      text: '0.7초 동안 카이바를 보호 (피해 무효). 그 순간 공격받으면 백룡의 멸망을 부르는 우뢰탄(백룡 ATK×1.3)으로 공격자 방향 반격. 그 후 덱에서 "푸른 눈의 백룡" 1장을 패에.',
      effect(ctx) { const { b, u } = ctx, D = u.duel; D.kGirl = { t: 0.7, ctx }; b.ring(u.x, u.y - 18, 8, 32, 0.4, '#bfe8ff'); },
      ai: { tags: ['defense'], keep: 2, when: S => !S.u.duel.kGirl, score: S => (S.inDeck(BW) ? 12 : 0) + (S.oppAtkSoon || S.oppCasting || S.incoming ? 14 : -4) } },
    { id: 'K36', name: '하얀 환상수-푸른 눈', type: 'monster', level: 8, atk: 2500, def: 2000, element: 'light', sprite: 'phantasm', shout: '백룡의 가호!',
      text: '드로우하면 바로 발동 (패 → 묘지): 3초 동안 받는 피해 무효. 끝날 때 패 1장을 버리면 3초 연장 (최대 2회, AI 판단). 효과가 끝나면 다음 드로우를 "푸른 눈의 백룡"으로. (소생 등으로 발동해도 같은 효과)',
      onDraw(b, u, ci) { const D = u.duel; D.hand.splice(D.hand.indexOf(ci), 1); D.grave.push(ci); DUEL.popup(b, u, ci.def, false, '드로우 즉시 발동', '백룡의 가호!'); DUEL.spawnSpirit(b, u, ci.def, 1.6); say(b, u, `${DUEL.cardTag(ci.def)} 하얀 환상수-푸른 눈: 드로우 즉시 발동`, '백룡의 가호!'); phantasm(b, u, 3); },
      effect(ctx) { phantasm(ctx.b, ctx.u, 3); },
      ai: { tags: ['defense'], when: S => !S.u.duel.kPhant, keep: 10 } },
    { id: 'K37', name: '탐욕의 항아리', type: 'spell', text: '묘지의 몬스터 5장을 덱으로 되돌려 셔플 후 2장 드로우. (묘지 몬스터 5장 필요)',
      effect(ctx) { ctx.avarice(); },
      ai: { tags: ['draw'], draw: 2, when: S => S.graveMonsters >= 5, score: S => (S.deck < 10 ? 14 : 0) + (S.inGrave(BW) ? 6 : 0) }, borrowable: false },
    { id: 'K38', name: '왼팔의 대가', type: 'spell', text: '패 3장을 버리고 덱에서 원하는 마법 1장을 패에 (AI: 융합 > 죽은 자의 소생 > 거대화 > 욕망의 항아리 순, 쓸모 있는 것).',
      effect(ctx) {
        const D = ctx.u.duel; ctx.discardWorst(3); const S = ctx.S();
        const want = [fusionPlan(D, D.deck.filter(c => c.id === 'K27').slice(0, 1)) || D.hand.some(c => isMat(c.id)) ? 'K27' : null, S.graveMonsters && S.graveBestAtk >= 2400 ? 'K12' : null, 'K16', 'K13', 'K37', 'spell'].filter(Boolean);
        for (const p of want) { const c = ctx.deck.search(p); if (c) { ctx.text(`서치: ${c.def.name}`, '#9cf0c0'); break; } }
      },
      ai: { tags: [], when: S => S.hand >= 5 && S.u.duel.deck.some(c => c.def.type === 'spell'), score: S => (S.u.duel.deck.some(c => c.id === 'K27') && S.u.duel.hand.filter(c => isMat(c.id)).length >= 1 ? 22 : 2) + (S.hand >= 6 ? 8 : 0) } },
    { id: 'K39', name: '파괴륜', type: 'trap', text: '상대가 다가올 때: 패의 몬스터 1장(가장 높은 레벨, 백룡은 마지막)을 버리고 0.5초 뒤 상대 자리에 폭발 → 상대 최대 체력의 레벨×2.5% 피해. 폭발 범위(반경 60) 안에 카이바도 있으면 카이바도 같은 비율의 절반 피해를 받고, 버린 몬스터를 다시 패로.',
      trigger: { on: 'oppApproach', when: ctx => ctx.hand.count('monster') > 0 },
      effect(ctx, ev) {
        const { b, u } = ctx, D = u.duel, t = ev.src || ctx.e; if (!t) return;
        const L = D.hand.filter(c => c.def.type === 'monster').sort((a, z) => (a.id === BW) - (z.id === BW) || DUEL.effLv(z) - DUEL.effLv(a)); const m = L[0]; if (!m) return;
        D.hand.splice(D.hand.indexOf(m), 1); D.grave.push(m);
        const pct = 0.025 * (m.def.level || 1), x = t.x, y = t.y;
        b.ring(x, y - 10, 30, 8, 0.5, '#ff7a4a'); b.text(x, y - 66, `파괴륜 (${m.def.name} Lv${m.def.level})`, '#ffb090', 9); b.telegraphCircle(x, y, 60, 0.5, '#ff7a4a');
        b.later(0.5, () => {
          if (b.over) return; b.explosion(x, y, 60); b.shake(3);
          for (const f of b.foes(u)) if (Math.hypot(f.x - x, f.y - y) < 60 + f.pad) ctx.damage(f, pct * effMax(f), { element: 'fire', sure: true, big: true });
          if (!u.dead && Math.hypot(u.x - x, u.y - y) < 60 + u.pad) { const lp = Math.round(pct * 0.5 * u.maxHp); u.hp = Math.max(1, u.hp - lp); b.text(u.x, u.y - 50, `-${lp} LP`, '#ff9ab0', 10); const i = D.grave.indexOf(m); if (i >= 0) { D.grave.splice(i, 1); D.hand.push(m); } say(b, u, `파괴륜: 카이바도 휘말림 (-${lp} LP) → ${m.def.name} 패로 회수`); }
        });
      },
      ai: { priority: 4, score: S => (S.oppMelee ? 12 : -8) + (S.handMonstersNoPiece >= 2 ? 4 : -6) } },
    { id: 'K40', name: '리빙데드가 부르는 소리', type: 'trap', text: '상대에게 공격받았을 때(피격): 묘지 몬스터 1장의 효과를 발동 (AI가 가장 좋은 것 선택, 엑스트라 몬스터 포함).',
      trigger: { on: 'damaged', when: ctx => ctx.grave.count('monster') > 0 },
      effect(ctx) { const c = ctx.bestGrave(); if (c) ctx.useMonster(c, { label: '소생', keepZone: 'grave' }); },
      ai: { priority: 4, score: S => (S.graveMonsters > 0 ? 6 : -20) + (S.graveBestAtk >= 2400 ? 6 : 0) } },
  ];
  // ---------- 엑스트라 덱 ----------
  const EXTRA_CARDS = [
    { id: 'KX1', name: 'XY 드래곤 캐논', type: 'monster', level: 6, atk: 2800, def: 2600, element: 'blunt', sprite: 'xyCannon', extra: true, shout: '하이퍼 디스트록션!',
      text: '[융합: X + Y] 공중에서 시전 순간 상대 위치 주변으로 캐논 6발 폭격 (각 반경 30, ATK×0.4, 위치 고정).',
      effect(ctx) { const e = ctx.e; if (!e) return; const x = e.x, y = e.y; for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + rand(-0.3, 0.3), r = i === 0 ? 0 : rand(18, 52); ctx.b.later(i * 0.12, () => { if (!ctx.u.dead && !ctx.b.over) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.8; ctx.b.streak(ctx.u.x, ctx.u.y - 90, px, py - 6, '#ffd060', 4, 0.5); blastAt(ctx, px, py, 30, 0.5, ctx.atk(0.4), { col: '#ffc060' }); } }); } },
      ai: { tags: ['damage'], range: 9999, dmg: 1.4, priority: 12 } },
    { id: 'KX2', name: 'XZ 캐터필러 캐논', type: 'monster', level: 6, atk: 2400, def: 2200, element: 'blunt', sprite: 'xzCannon', extra: true, shout: 'XZ 캐터필러 캐논!',
      text: '[융합: X + Z] 카이바를 태우고 3.6초 동안 상대를 중심으로 돌며 거리를 벌림(반경 150 이상) + 0.35초마다 그 순간 상대 방향으로 직선 포탄 (ATK×0.22, 비추적).',
      effect(ctx) {
        const { b, u } = ctx; if (u.airborne || u.climb || u.inTrain) return;
        const st = { type: 'kRide', t: 0, fire: 0.2, dir: Math.random() < 0.5 ? 1 : -1 };
        st.step = dt => {
          st.t += dt; const e = ctx.e; if (u.dead || b.over || !e || st.t > 3.6) { u.action = null; return; }
          const cur = Math.atan2(u.y - e.y, u.x - e.x), R = Math.max(150, Math.hypot(u.x - e.x, u.y - e.y)), na = cur + st.dir * 1.3 * dt;
          const tx = e.x + Math.cos(na) * R, ty = e.y + Math.sin(na) * R, dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1, sp = Math.min(d, 300 * dt);
          const q = b.clampPos(u.x + dx / d * sp, u.y + dy / d * sp, u.pad, u); if (b.blockAt(q.x, q.y, u.pad)) st.dir = -st.dir; else { if (Math.hypot(q.x - u.x - dx / d * sp, q.y - u.y - dy / d * sp) > 1) st.dir = -st.dir; u.x = q.x; u.y = q.y; }
          u.facing = e.x >= u.x ? 1 : -1;
          if ((st.fire -= dt) <= 0) { st.fire = 0.35; const a = Math.atan2(e.y - u.y, e.x - u.x); b.proj.push({ x: u.x + Math.cos(a) * 12, y: u.y - 26, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, spd: 520, src: u, dmg: ctx.atk(0.22), kind: 'magic', life: 1.0, trail: 0, noAirLock: true, r: 7, hit: { element: 'blunt', delivery: 'ranged', cardDmg: true } }); b.glow(u.x + Math.cos(a) * 12, u.y - 26, 14, '#ffd060', 0.15); }
        };
        u.action = st;
      },
      ai: { tags: ['damage'], range: 9999, dmg: 1.6, priority: 12 } },
    { id: 'KX3', name: 'YZ 캐터필러 드래곤', type: 'monster', level: 6, atk: 3000, def: 2800, element: 'blunt', sprite: 'yzDragon', extra: true, shout: 'YZ 캐터필러 드래곤!',
      text: '[융합: Y + Z] 가속하며 상대를 추적 돌진 (유저 지정: 추적, 회전 속도 제한 2.6rad/s → 옆으로 피할 수 있음). 3번 돌진, 이동 거리·속도가 클수록 피해 증가 (ATK×0.3 × (1 + 거리/250 + 속도/720), 최대 ×3). 벽에 부딪히면 그 돌진은 종료.',
      effect(ctx) { const { b, u } = ctx, e = ctx.e; if (!e) return; const a = angTo(u, e); kproj(b).push({ type: 'yz', u, ctx, x: u.x, y: u.y, ang: a, spd: 140, t: 0, n: 0, pause: 0.2, trav: 0, amt: ctx.atk(0.3) }); },
      ai: { tags: ['damage'], range: 9999, dmg: 1.8, priority: 12 } },
    { id: 'KX4', name: 'XYZ-드래곤 캐논', type: 'monster', level: 8, atk: 3800, def: 3600, element: 'elec', sprite: 'xyzCannon', extra: true, shout: '캐논 파이어 스톰!',
      text: '[융합: X + Y + Z] 0.8초 입자포 충전 후 2.2초 동안 끊김없는 빔 (폭 30, 0.15초마다 ATK×0.1). 빔 방향은 상대 쪽으로 천천히(0.55rad/s) 돌아감 → 빠르게 옆으로 빠지면 피할 수 있음. 그동안 카이바는 제자리.',
      effect(ctx) {
        const { b, u } = ctx, e = ctx.e; if (!e || u.climb || u.inTrain) return;
        const st = { type: 'kXyz', t: 0, ang: angTo(u, e), tick: 0, L: 0, firing: false };
        b.telegraphLine(u.x, u.y - 26, u.x + Math.cos(st.ang) * 300, u.y + Math.sin(st.ang) * 300 - 26, 30, 0.8, '#ffe0a0');
        st.step = dt => {
          st.t += dt; const E = ctx.e; if (u.dead || b.over) { u.action = null; return; }
          if (st.t < 0.8) { if (Math.random() < 0.5) b.parts.push({ x: u.x + rand(-20, 20), y: u.y - 40 + rand(-14, 14), vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#ffe080', size: 2.5, glow: true }); return; }
          if (st.t > 3.0) { u.action = null; return; }
          st.firing = true;
          if (E) { const want = Math.atan2(E.y - u.y, E.x - u.x), df = Math.atan2(Math.sin(want - st.ang), Math.cos(want - st.ang)); st.ang += Math.sign(df) * Math.min(Math.abs(df), 0.55 * dt); }
          const ca = Math.cos(st.ang), sa = Math.sin(st.ang); st.L = rayLen(b, u.x, u.y, ca, sa, 520); u.facing = ca >= 0 ? 1 : -1;
          if ((st.tick -= dt) <= 0) { st.tick = 0.15; for (const f of b.foes(u)) { const dx = f.x - u.x, dy = f.y - u.y, al = dx * ca + dy * sa, pp = Math.abs(-dx * sa + dy * ca); if (al > -6 && al < st.L + 10 + f.pad && pp < 15 + 10 + f.pad) ctx.damage(f, ctx.atk(0.1), { element: 'elec', noCrit: true }); } b.shake(1); }
        };
        u.action = st;
      },
      ai: { tags: ['damage'], range: 9999, dmg: 1.5, priority: 12 } },
    { id: 'KX5', name: '궁극의 푸른 눈의 백룡', type: 'monster', level: 12, atk: 4500, def: 3800, element: 'light', sprite: 'ultimate', extra: true, shout: '멸망을 부르는 궁극의 우레탄!',
      text: '[융합: 백룡 ×3] 0.7초 충전 후 매우 넓은 전방 광선 (폭 64, ATK×1.35, 시전 방향 고정, 벽에서 멈춤).',
      effect(ctx) { ctx.b.shake(2); ctx.b.glow(ctx.u.x, ctx.u.y - 60, 70, '#bfe8ff', 0.7); kbeam(ctx, ctx.atk(1.35), { w: 68, windup: 0.45, fxDur: 1.1, shake: 9, col: '#7ac8ff', col2: '#ffffff', epic: true }); },
      ai: { tags: ['damage'], range: 9999, dmg: 1.35, priority: 12 } },
  ];
  for (const c of [...KAIBA_CARDS, ...EXTRA_CARDS]) { if (!c.shout) c.shout = c.name + '!'; CARD_DEFS[c.id] = c; }
  const KAIBA_DECK = Object.fromEntries(KAIBA_CARDS.map(c => [c.id, c.id === BW ? 3 : 1])); // 40장
  window.KAIBA = { RECIPES, fusionPlan, KAIBA_DECK, EXTRA: EXTRA_CARDS.map(c => c.id) };
  // 융합 지향: 재료/융합 카드는 버림·릴리스 대상에서 뒤로 (keepFn)
  const fusAvail = D => D.hand.some(c => c.id === 'K27') || D.deck.some(c => c.id === 'K27' || c.id === 'K38');
  const matsIn = D => D.hand.filter(c => isMat(c.id)).length;
  for (const id of ['K19', 'K20', 'K21', 'K28']) CARD_DEFS[id].ai.keepFn = S => { const D = S.u.duel; return D && fusAvail(D) && matsIn(D) >= 2 ? 22 : D && fusAvail(D) ? 12 : 0; };
  CARD_DEFS.K01.ai.keepFn = S => { const D = S.u.duel; return D && fusAvail(D) && D.hand.filter(c => c.id === BW).length >= 2 ? 10 : 0; };
  CARD_DEFS.K27.ai.keepFn = S => { const D = S.u.duel; return !D ? 0 : fusionPlan(D) ? 60 : matsIn(D) || D.hand.filter(c => c.id === BW).length >= 2 ? 40 : 28; };

  // ---------- AI 규칙 (카이바 전용, 계획 점수 보정) ----------
  DUEL.planHooks.push((b, u, plan, S) => {
    if (!u.def.duelist || u.def.id !== 'kaiba') return 0;
    const D = u.duel, c = plan.inst.def, ai = c.ai || {}; let v = 0;
    if (D.kLife && D.kLife.size) v += D.kLife.has(plan.inst.uid) ? 25 : (S.hand >= CFG.HAND_LIMIT ? 0 : -60); // 생명 단축의 패: 뽑은 카드부터
    if (S.deck <= 8) { if ((ai.tags || []).includes('damage')) v += 15; if ((ai.tags || []).includes('draw')) v -= 10; } // 덱이 적으면 공격적으로
    const FP = fusionPlan(D);
    if (FP && c.id !== 'K27' && D.hand.some(h => h.id === 'K27') && FP.mats.includes(plan.inst)) v -= 40; // 융합 재료는 아껴 둠
    if (FP && plan.tributes.some(t => FP.mats.includes(t)) && D.hand.some(h => h.id === 'K27')) v -= 30;
    if (c.id === 'K27' && FP) v += 30; // 재료가 있으면 융합 최우선
    if (!FP && S.deck > 8 && isMat(c.id) && fusAvail(D)) v -= matsIn(D) >= 2 ? 20 : 8; // 융합을 찾는 동안 재료 보존
    if (c.id === 'K38' && !D.hand.some(h => h.id === 'K27') && D.deck.some(h => h.id === 'K27') && (matsIn(D) >= 2 || D.hand.filter(h => h.id === BW).length >= 2)) v += 22; // 왼팔의 대가로 융합 서치
    if (c.type === 'monster' && D.nextMonMult && (c.atk || 0) >= 2000) v += 14; // 거대화 다음엔 강한 몬스터
    if (D.kAbsorb) v += c.type === 'spell' ? 6 : -4;
    return v;
  });
  // 사용 직전 처리: 생명 단축의 패 / 마법 흡수
  DUEL.playHooks.push((b, u, ci) => {
    const D = u.duel; if (!D) return;
    if (D.kLife) {
      for (const id of [...D.kLife]) if (!D.hand.some(c => c.uid === id)) D.kLife.delete(id);
      if (D.kLife.has(ci.uid)) D.kLife.delete(ci.uid);
      else if (D.kLife.size) { D.kLife = null; u.hp -= 1000; b.text(u.x, u.y - 50, '-1000 LP', '#ff7a9a', 12); b.shock(u.x, u.y - 16, 6, 40, '#ff5a7a', 0.4, 4); say(b, u, '생명 단축의 패: 뽑은 카드보다 먼저 다른 카드를 사용 → 1000 피해'); if (u.hp <= 0) { u.hp = 0; b.kill(u, b.enemy(u)); } }
      if (D.kLife && !D.kLife.size) D.kLife = null;
    }
    if (D.kAbsorb && ci.id !== 'K22') { if (ci.def.type === 'spell') { b.heal(u, 500); b.text(u.x, u.y - 60, '마법 흡수 +500', '#9cf0c0', 9); } else { D.kAbsorb = false; b.text(u.x, u.y - 60, '마법 흡수 종료', '#c8c0d8', 9); } }
  });
  DUEL.setupHooks.push((b, u) => { const D = u.duel; if (D.hand.some(c => c.def.onDraw)) D.kPendDraw = true; });

  // ---------- 엔진 훅 ----------
  function hitFoes(b, u, x, y, r, air) { return b.foes(u).filter(f => !f.dead && Math.hypot(f.x - x, f.y - y) < r + f.pad && (air ? true : !f.airborne)); }
  function stepProj(b, dt) {
    const L = kproj(b), add = [];
    for (const p of L) {
      const { u, ctx } = p;
      if (p.type === 'orb' || p.type === 'bat') {
        p.life -= dt; if (p.life <= 0 || u.dead) { p.dead = true; continue; }
        const sp = Math.hypot(p.vx, p.vy), n = Math.max(1, Math.ceil(sp * dt / 6));
        for (let i = 0; i < n && !p.dead; i++) {
          const nx = p.x + p.vx * dt / n, ny = p.y + p.vy * dt / n;
          if (!free(b, nx, ny)) {
            if (p.type === 'bat') { p.dead = true; b.smoke(p.x, p.y - 20, '#6a2a8a', 5); break; }
            const fx = !free(b, nx, p.y), fy = !free(b, p.x, ny); if (fx || (!fx && !fy)) p.vx = -p.vx; if (fy || (!fx && !fy)) p.vy = -p.vy;
            b.sparks(p.x, p.y - 20, '#c070f0', 5, 120);
            if (p.gen < 3) { p.gen++; const a = Math.atan2(p.vy, p.vx), s = Math.hypot(p.vx, p.vy); p.vx = Math.cos(a - 0.35) * s; p.vy = Math.sin(a - 0.35) * s; add.push({ ...p, vx: Math.cos(a + 0.35) * s, vy: Math.sin(a + 0.35) * s, life: Math.min(p.life + 0.6, 2.4) }); p.life = Math.min(p.life + 0.6, 2.4); }
            else { p.dead = true; b.burst && b.burst(p.x, p.y - 20, '#c070f0', 6); }
            break;
          }
          p.x = nx; p.y = ny;
          const f = hitFoes(b, u, p.x, p.y, p.type === 'bat' ? 14 : 11, true)[0];
          if (f) {
            p.dead = true;
            if (p.type === 'orb') { ctx.damage(f, p.amt, { element: 'dark' }); b.sparks(f.x, f.y - 18, '#c070f0', 6, 140); }
            else { // 흡혈: 붙잡고 4회
              ctx.status(f, 'bind', 1.2); b.text(f.x, f.y - 60, '흡혈!', '#ff6a8a', 10);
              for (let k = 0; k < 4; k++) b.later(0.15 + k * 0.3, () => { if (u.dead || f.dead || b.over) return; const r = ctx.damage(f, p.amt, { element: 'dark', noCrit: true }); b.streak(f.x, f.y - 18, u.x, u.y - 22, '#ff3a5a', 3, 0.2); if (r > 0) { const lp = f.duel ? r : r * CFG.LP_SCALE; ctx.heal(Math.round(lp)); } });
            }
          }
        }
      } else if (p.type === 'shell') {
        p.t += dt; const k = Math.min(1, p.t / p.dur); p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.z = 4 * p.h * k * (1 - k);
        if (k > 0.15 && k < 0.9) for (const f of b.foes(p.u)) if (f.airborne && !f.dead && Math.hypot(f.x - p.x, f.y - p.y) < 24 + f.pad && Math.abs(b.airZ(f) - p.z) < 32) { p.t = p.dur; p.tx = p.x; p.ty = p.y; p.air = true; }
        if (p.t >= p.dur) { p.dead = true; b.explosion(p.x, p.y, 34); b.shake(1.5); for (const f of b.foes(p.u)) if (Math.hypot(f.x - p.x, (f.y - p.y) / 0.8) < 34 + 8 + f.pad && (p.air || !f.airborne || Math.abs(b.airZ(f) - (p.z || 0)) < 30)) p.ctx.damage(f, p.amt, { element: 'blunt', big: true }); }
      } else if (p.type === 'yz') {
        if (u.dead) { p.dead = true; continue; }
        if (p.pause > 0) { p.pause -= dt; if (p.pause <= 0) { const e = ctx.e; if (e) p.ang = angTo(p, e); p.spd = 140; p.t = 0; p.trav = 0; } continue; }
        const e = ctx.e; p.t += dt;
        if (e && !e.dead) { const want = Math.atan2(e.y - p.y, e.x - p.x), df = Math.atan2(Math.sin(want - p.ang), Math.cos(want - p.ang)); p.ang += Math.sign(df) * Math.min(Math.abs(df), 2.6 * dt); }
        p.spd = Math.min(720, p.spd + 900 * dt);
        const nx = p.x + Math.cos(p.ang) * p.spd * dt, ny = p.y + Math.sin(p.ang) * p.spd * dt;
        let end = false;
        if (!free(b, nx, ny)) { b.dust(p.x, p.y); b.shake(1.5); b.sparks(p.x, p.y - 16, '#ffd060', 8, 160); end = true; }
        else { p.trav += Math.hypot(nx - p.x, ny - p.y); p.x = nx; p.y = ny; if (Math.random() < 0.6) b.parts.push({ x: p.x - Math.cos(p.ang) * 14, y: p.y - 6, vx: rand(-20, 20), vy: rand(-20, 0), life: 0.3, max: 0.3, color: '#a8a8b8', size: 2.5 }); }
        const f = !end && hitFoes(b, u, p.x, p.y, 20, false)[0];
        if (f) { const k = Math.min(3, 1 + p.trav / 250 + p.spd / 720); ctx.damage(f, p.amt * k, { element: 'blunt', delivery: 'melee', big: k > 2 }); b.knockback(f, p.ang, 300, 0.25); b.hitstop(0.06); b.text(f.x, f.y - 66, `×${k.toFixed(1)}`, '#ffd060', 9); end = true; }
        if (end || p.t > 1.6) { p.n++; if (p.n >= 3) { p.dead = true; b.smoke(p.x, p.y - 16, '#c8c8d8', 8); } else p.pause = 0.3; }
      }
    }
    b.kproj = L.filter(p => !p.dead).concat(add);
  }
  function stepState(b, u, dt) {
    const D = u.duel; if (!D) return;
    if (D.kPendDraw && D.phase !== 'start') { D.kPendDraw = false; for (const c of D.hand.filter(c => c.def.onDraw)) c.def.onDraw(b, u, c); }
    if (D.kGirl) { D.kGirl.t -= dt; if (D.kGirl.t <= 0 || u.dead) { const ctx = D.kGirl.ctx; D.kGirl = null; if (!u.dead && !b.over) { const c = ctx.deck.search(BW); if (c) ctx.text('백룡 서치!', '#bfe8ff'); } } }
    if (D.kGlider) { D.kGlider.hp -= 12 * dt; if (D.kGlider.hp <= 0) gliderBreak(b, u, '내구도 소진'); }
    if (D.kPhant) {
      D.kPhant.t -= dt;
      if (D.kPhant.t <= 0) {
        const S = DUEL.situation(b, u), P = D.kPhant;
        if (!u.dead && P.ext < 2 && D.hand.length >= 2 && (S.myHpR < 0.7 || S.oppSkillSoon < 2 || S.incoming)) { const ctx = DUEL.makeCtx(b, u, null, null); const L = ctx.discardWorst(1); if (L.length) { P.ext++; P.t = 3; b.text(u.x, u.y - 70, `가호 연장 (${L[0].def.name} 버림)`, '#dff2ff', 9); } }
        if (P.t <= 0) { D.kPhant = null; b.text(u.x, u.y - 66, '가호 종료', '#bfe8ff', 9); setNextBW(b, u, '하얀 환상수'); }
      }
    }
  }
  function gliderBreak(b, u, why) {
    const D = u.duel; if (!D.kGlider) return; D.kGlider = null;
    b.text(u.x, u.y - 60, `황금 방패 파괴 (${why})`, '#ffd040', 9); b.sparks(u.x, u.y - 22, '#ffd040', 14, 220);
    const ctx = DUEL.makeCtx(b, u, null, null), c = ctx.grave.toHand(d => d.type === 'monster' && !d.extra);
    if (c) { b.text(u.x, u.y - 72, `회수: ${c.def.name}`, '#ffe9a0', 9); say(b, u, `카이저 글라이더: 묘지의 ${c.def.name} → 패`); }
  }
  STAGE_HOOKS.push({
    match: () => false,
    init(b) { b.kfx = []; b.kproj = []; b.kStorm = []; },
    preDamage(b, src, tgt, amount, o) {
      const D = tgt && tgt.duel; if (!D || !src || src.team === tgt.team || o.reflected) return undefined;
      if (D.kSapph) D.kSapph.hit = true;
      if (D.kPhant) { b.text(tgt.x, tgt.y - 56, '가호: 무효', '#dff2ff', 9); b.sparks(tgt.x, tgt.y - 20, '#dff2ff', 6, 140); return true; }
      if (D.kGirl) {
        const ctx = D.kGirl.ctx; D.kGirl.t = 0; b.text(tgt.x, tgt.y - 60, '파란 눈의 소녀: 보호!', '#bfe8ff', 10);
        DUEL.spawnSpirit(b, tgt, CARD_DEFS[BW], 1.4); b.later(0.05, () => { if (!tgt.dead && !b.over && !src.dead) kbeam(ctx, CARD_DEFS[BW].atk * A * 1.3, { target: src, w: 30, windup: 0.25, epic: true }); });
        return true;
      }
      if (D.kGlider) { const G = D.kGlider; if (amount <= G.hp) { b.sparks(tgt.x, tgt.y - 22, '#ffd040', 6, 140); b.text(tgt.x, tgt.y - 56, '황금 날개: 막음', '#ffe080', 8); return true; } const left = amount - G.hp; gliderBreak(b, tgt, '돌파'); return left; }
      return undefined;
    },
    step(b, dt) {
      for (const u of b.u) { if (u.spinT > 0) u.spinT -= dt; if (u.shrinkK && u.shrinkK !== 1 && !u.buff('kShrink')) u.shrinkK = 1; if (u.duel) stepState(b, u, dt); }
      stepProj(b, dt);
      for (const S of b.kStorm || []) {
        S.t += dt; S.tick -= dt;
        for (const f of b.foes(S.u)) { if (f.dead || f.airborne) continue; const dx = S.x - f.x, dy = S.y - f.y, d = Math.hypot(dx, dy); if (d < S.r + 40 && d > 6) { const q = b.clampPos(f.x + dx / d * 75 * dt, f.y + dy / d * 75 * dt, f.pad, f); if (!b.blockAt(q.x, q.y, f.pad)) { f.x = q.x; f.y = q.y; } } }
        if (S.tick <= 0) { S.tick = 0.4; for (const f of b.foes(S.u)) if (!f.dead && Math.hypot(f.x - S.x, f.y - S.y) < S.r + f.pad) S.ctx.damage(f, S.amt, { element: 'dark', noCrit: true }); }
        if (Math.random() < 0.7) { const a = rand(0, TAU), r = rand(10, S.r); b.parts.push({ x: S.x + Math.cos(a) * r, y: S.y - 10 + Math.sin(a) * r * 0.5, vx: -Math.sin(a) * 120, vy: Math.cos(a) * 60 - 30, life: 0.4, max: 0.4, color: ['#5a5a78', '#8a8ab0', '#2a2a3a'][Math.floor(rand(0, 3))], size: 3 }); }
      }
      b.kStorm = (b.kStorm || []).filter(S => S.t < S.dur);
      for (const f of b.kfx || []) f.t += dt; b.kfx = (b.kfx || []).filter(f => f.t < f.dur);
    },
    drawUnder(ctx, b, preview) {
      if (preview) return;
      for (const S of b.kStorm || []) { const k = Math.min(1, S.t * 4, (S.dur - S.t) * 3); ctx.save(); ctx.globalAlpha = 0.25 * k; ctx.fillStyle = '#3a3a5a'; ctx.beginPath(); ctx.ellipse(S.x, S.y, S.r, S.r * 0.55, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.6 * k; ctx.strokeStyle = '#8a8ab0'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(S.x, S.y - 6 - i * 10, S.r * (0.9 - i * 0.25), S.r * 0.4 * (0.9 - i * 0.25), 0, b.time * 6 + i, b.time * 6 + i + 3.6); ctx.stroke(); } ctx.restore(); }
      for (const u of b.u) if (u.action && u.action.type === 'kRide' && !u.dead) drawSpr(ctx, 'xzCannon', u.x, u.y + 8, u.facing, 1.1, 1);
    },
    drawOver(ctx, b) {
      for (const f of b.kfx || []) {
        if (f.type === 'ebeam') drawEpicBeam(ctx, f, b.time);
        else if (f.type === 'charge') drawCharge(ctx, f, b.time);
        else if (f.type === 'impact') drawImpact(ctx, f);
        else if (f.type === 'beam') drawBeam(ctx, f.x, f.y, f.ca, f.sa, f.L, f.w * (1 - 0.4 * f.t / f.dur), f.col, f.col2, 1 - f.t / f.dur, b.time);
        else if (f.type === 'jump') { const k = f.t / f.dur, x = f.sx + (f.tx - f.sx) * k, y = f.sy + (f.ty - f.sy) * k - 4 * f.h * k * (1 - k); drawSpr(ctx, f.spr, x, y, f.tx >= f.sx ? 1 : -1, 1, 1); }
      }
      for (const p of b.kproj || []) {
        if (p.type === 'orb') { const x = Math.round(p.x), y = Math.round(p.y - 22); ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#a040e0'; ctx.fillRect(x - 6, y - 6, 12, 12); ctx.globalAlpha = 1; ctx.fillStyle = '#1a0a2a'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.fillStyle = '#c070f0'; ctx.fillRect(x - 3, y - 3, 6, 6); ctx.fillStyle = '#f0d0ff'; ctx.fillRect(x - 2, y - 2, 2, 2); ctx.restore(); }
        else if (p.type === 'bat') { const x = Math.round(p.x), y = Math.round(p.y - 24), fl = Math.sin(b.time * 30) > 0 ? 3 : 0; ctx.fillStyle = '#1a0a20'; for (const [dx, dy] of [[0, 0], [-9, 4], [8, -5]]) { ctx.fillRect(x + dx - 5, y + dy - fl, 4, 2); ctx.fillRect(x + dx + 1, y + dy - fl, 4, 2); ctx.fillRect(x + dx - 1, y + dy, 2, 3); ctx.fillStyle = '#ff3a5a'; ctx.fillRect(x + dx, y + dy, 1, 1); ctx.fillStyle = '#1a0a20'; } }
        else if (p.type === 'shell') { const x = Math.round(p.x), y = Math.round(p.y - 10 - (p.z || 0)); ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 2.5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#14141a'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.fillStyle = '#e8c040'; ctx.fillRect(x - 3, y - 3, 6, 6); ctx.fillStyle = '#fff0a0'; ctx.fillRect(x - 2, y - 2, 2, 2); ctx.restore(); }
        else if (p.type === 'yz') drawSpr(ctx, 'yzDragon', p.x, p.y + 4, Math.cos(p.ang) >= 0 ? 1 : -1, 1, p.pause > 0 ? 0.6 : 1);
      }
      for (const u of b.u) {
        const D = u.duel; if (!D || u.dead) continue;
        const A2 = u.action;
        if (A2 && A2.type === 'kXyz') { if (A2.firing) drawBeam(ctx, u.x, u.y - 26, Math.cos(A2.ang), Math.sin(A2.ang), A2.L, 30 + Math.sin(b.time * 40) * 3, '#ffd060', '#ffffff', 1, b.time); drawSpr(ctx, 'xyzCannon', u.x - u.facing * 10, u.y - 40, u.facing, 1, 0.85); }
        if (D.kGlider) { const G = D.kGlider, k = Math.max(0, G.hp / G.max); ctx.save(); ctx.globalAlpha = 0.35 + 0.5 * k; ctx.fillStyle = '#ffd040'; for (const s of [-1, 1]) for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(u.x + s * (14 + i * 4)) - 2, Math.round(u.y - 40 + i * 5 - i * i), 4, 10 - i); ctx.fillStyle = '#fff4b0'; ctx.fillRect(Math.round(u.x) - 12, Math.round(u.y - 48), 24 * k, 2); ctx.restore(); }
        if (D.kPhant) { ctx.save(); ctx.globalAlpha = 0.25 + 0.12 * Math.sin(b.time * 6); ctx.strokeStyle = '#dff2ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(u.x, u.y - 22, 22, 30, 0, 0, TAU); ctx.stroke(); ctx.restore(); drawSpr(ctx, 'phantasm', u.x - u.facing * 6, u.y - 34, u.facing, 1, 0.35); }
        if (D.kGirl) drawSpr(ctx, 'blueGirl', u.x + u.facing * 16, u.y - 2, u.facing, 1, 0.9);
      }
    },
  });
  STAGE_HOOKS.push({ match: () => false, drawAboveUI(ctx, b) { // 상단 UI 위: 몬스터 몸체 스프라이트만
    for (const f of b.kfx || []) if (f.type === 'jump') { const k = f.t / f.dur, x = f.sx + (f.tx - f.sx) * k, y = f.sy + (f.ty - f.sy) * k - 4 * f.h * k * (1 - k); drawSpr(ctx, f.spr, x, y, f.tx >= f.sx ? 1 : -1, 1, 1); }
    for (const p of b.kproj || []) if (p.type === 'yz') drawSpr(ctx, 'yzDragon', p.x, p.y + 4, Math.cos(p.ang) >= 0 ? 1 : -1, 1, p.pause > 0 ? 0.6 : 1);
    for (const u of b.u) { const D = u.duel; if (!D || u.dead) continue; if (D.kPhant) drawSpr(ctx, 'phantasm', u.x - u.facing * 6, u.y - 34, u.facing, 1, 0.35); if (D.kGirl) drawSpr(ctx, 'blueGirl', u.x + u.facing * 16, u.y - 2, u.facing, 1, 0.9); }
  } });
  function drawSpr(ctx, id, x, y, face, k = 1, a = 1) { const sp = DuelSprites.get(id); if (!sp) return; const sc = sp.s * k, w = sp.w * sc, h = sp.h * sc; ctx.save(); ctx.globalAlpha *= a; ctx.translate(Math.round(x), Math.round(y)); ctx.scale(face < 0 ? -1 : 1, 1); ctx.imageSmoothingEnabled = false; ctx.drawImage(sp.c, Math.round(-w / 2), Math.round(-h), w, h); ctx.restore(); }
  // 픽셀 광선: 바깥 빛 → 중간 → 흰 심 + 가장자리 픽셀 조각
  function drawBeam(ctx, x, y, ca, sa, L, w, col, col2, a, t) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(Math.atan2(sa, ca)); ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = col; ctx.globalAlpha = 0.35 * a; ctx.fillRect(0, -w / 2 - 3, L, w + 6);
    ctx.globalAlpha = 0.85 * a; ctx.fillRect(0, -w / 2, L, w);
    ctx.fillStyle = col2; ctx.globalAlpha = a; ctx.fillRect(0, -w * 0.22, L, w * 0.44);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -1, L, 2);
    ctx.fillStyle = col2; for (let i = 0; i < L; i += 10) { const o = ((i * 7 + Math.floor(t * 30) * 13) % 7) - 3; ctx.fillRect(i, -w / 2 - 4 + o, 4, 3); ctx.fillRect(i + 5, w / 2 + 1 - o, 4, 3); }
    ctx.fillStyle = col2; ctx.fillRect(L - 4, -w / 2 - 2, 8, w + 4); // 끝 충돌 섬광
    ctx.restore();
  }

  // 백룡 강화 광선 (도트풍: 사각형만 사용)
  const hsh = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  function drawCharge(ctx, f, t) { // 입 앞 충전: 빨려드는 입자 + 맥동 구체 + 십자 섬광
    const k = Math.min(1, f.t / f.dur), x = Math.round(f.x), y = Math.round(f.y), r = Math.round(3 + k * f.w * 0.35 + (Math.floor(t * 30) % 2));
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.3 * k; ctx.fillStyle = f.col; ctx.fillRect(x - r - 4, y - r - 4, (r + 4) * 2, (r + 4) * 2);
    ctx.globalAlpha = 0.9; ctx.fillStyle = f.col2; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - r + 2, y - r + 2, r * 2 - 4, r * 2 - 4);
    const fl = Math.round(r * (1.5 + 2.5 * k)); ctx.globalAlpha = 0.85; ctx.fillRect(x - fl, y - 1, fl * 2, 2); ctx.fillRect(x - 1, y - fl, 2, fl * 2);
    ctx.fillStyle = f.col2;
    for (let i = 0; i < 14; i++) { const a = hsh(f.seed + i) * TAU, d = (1 - ((k * 2 + hsh(f.seed + i * 3)) % 1)) * (30 + f.w); ctx.globalAlpha = 0.9; ctx.fillRect(Math.round(x + Math.cos(a) * d) - 1, Math.round(y + Math.sin(a) * d) - 1, 3, 3); }
    ctx.restore();
  }
  function drawEpicBeam(ctx, f, t) { // 섬광(0~0.1) → 굵은 코어 → 잔광(얇아지며 사라짐)
    const p = f.t / f.dur, flash = f.t < 0.1, fire = Math.max(0, 1 - p / 0.5), glow = 1 - p;
    const w = f.w * (flash ? 1.7 : 0.35 + 0.95 * fire), L = f.L, fr = Math.floor(t * 30);
    ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y)); ctx.rotate(Math.atan2(f.sa, f.ca));
    ctx.fillStyle = f.col; ctx.globalAlpha = 0.25 * glow; ctx.fillRect(0, -w / 2 - 8, L, w + 16);   // 외곽 광륜 (잔광)
    ctx.globalAlpha = 0.75 * glow; ctx.fillRect(0, -w / 2, L, w);
    ctx.fillStyle = f.col2; ctx.globalAlpha = Math.min(1, 0.4 + fire); ctx.fillRect(0, -w * 0.32, L, w * 0.64);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = flash ? 1 : fire; ctx.fillRect(0, -w * 0.16 - 1, L, w * 0.32 + 2); // 밝은 코어
    if (fire > 0) { // 코어 줄무늬(흐름)
      ctx.fillStyle = f.col; ctx.globalAlpha = 0.5 * fire; for (let i = (fr * 9) % 24 - 24; i < L; i += 24) ctx.fillRect(i, -w * 0.3, 10, 2), ctx.fillRect(i + 12, w * 0.3 - 2, 10, 2);
    }
    ctx.globalAlpha = Math.min(1, glow * 1.4); // 광선을 따라 튀는 입자
    for (let i = 0; i < L / 9; i++) { const s = f.seed + i, d = hsh(s) * L, side = hsh(s * 2) > 0.5 ? 1 : -1, off = (w / 2 + 2 + (hsh(s * 3) * 18 + p * 40) * (0.4 + hsh(s * 5))) * side; ctx.fillStyle = hsh(s * 7) > 0.5 ? '#ffffff' : f.col2; const z = hsh(s * 11) > 0.7 ? 3 : 2; ctx.fillRect(Math.round(d + p * 30 * hsh(s * 13)), Math.round(off), z, z); }
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = flash ? 1 : 0.8 * fire; ctx.fillRect(-6, -w / 2 - 4, 12, w + 8); // 입 섬광
    ctx.restore();
  }
  function drawImpact(ctx, f) { // 끝점 폭발: 퍼지는 사각 고리 + 방사 광선
    const p = f.t / f.dur, x = Math.round(f.x), y = Math.round(f.y), r = Math.round(6 + p * (f.w * 1.6 + 20));
    ctx.save(); ctx.globalAlpha = 1 - p;
    ctx.fillStyle = '#ffffff'; if (p < 0.35) { const c = Math.round(f.w * 0.8 * (1 - p)); ctx.fillRect(x - c, y - c, c * 2, c * 2); }
    ctx.fillStyle = f.col2; ctx.fillRect(x - r, y - r, r * 2, 3); ctx.fillRect(x - r, y + r - 3, r * 2, 3); ctx.fillRect(x - r, y - r, 3, r * 2); ctx.fillRect(x + r - 3, y - r, 3, r * 2);
    ctx.fillStyle = f.col; for (let i = 0; i < 8; i++) { const a = i * TAU / 8, d0 = r * 0.6, d1 = r * 1.3; for (let d = d0; d < d1; d += 4) ctx.fillRect(Math.round(x + Math.cos(a) * d) - 1, Math.round(y + Math.sin(a) * d) - 1, 3, 3); }
    ctx.restore();
  }

  // ---------- 디버그: 융합 강제 ----------
  DUEL.debug.fusion = (b, u, ex) => { const D = u.duel, c = D.extra.find(x => x.id === ex) || DUEL.inst(ex); if (!c) return false; DUEL.useMonster(b, u, c, { label: '융합 소환(강제)' }); return true; };
  DUEL.debug.kaibaIds = () => [...KAIBA_CARDS.map(c => c.id), ...EXTRA_CARDS.map(c => c.id)];

  // ---------- 카이바 ----------
  CHARACTERS.push({
    id: 'kaiba', name: '카이바', gender: 'male', color: '#3a6ad8',
    stats: { hp: 4000, atk: 22, spd: 240, range: 110, atkRate: 0.75, def: 0, crit: 0 },
    attack: { element: 'light', delivery: 'ranged' }, projectile: 'magic',
    duelist: { deck: KAIBA_DECK, extra: EXTRA_CARDS.map(c => c.id), noExodia: true,
      atkMul: 1.45, cfg: { PLAY_GAP: 0.45, MIN_WAIT: 0.55, WAIT_TIMEOUT: 2.3, MAX_PLAYS: 3 }, // v2: 몬스터 피해 ×1.45, 카드 사용 템포 상향
      blurb: '<b style="color:#8ad0ff">특수 승리 없음 · 엑스트라 덱 5장(융합) · 상대 듀얼리스트의 덱/패를 공격</b>' },
    skills: [{ id: 'duelCard', name: '듀얼리스트의 카드', cd: 1e9, hidden: true, canUse: () => false }],
    sprite: { src: 'assets/kaiba/front.png', back: 'assets/kaiba/back.png', scale: 0.5, foot: 2, faces: { front: 'left', back: 'right' } },
    portrait: 'assets/kaiba/portrait.png',
    lines: { // 유저 대사 확정 전 자리 채움용
      skill: {},
      event: {
        battleStart: ['듀얼 개시!', '내 덱의 힘을 보여주지.'],
        draw: ['드로우!', '나의 턴!'],
        deckLow: ['덱이 얼마 남지 않았군.'],
        trapSet: ['카드를 1장 세트.'],
        trapFlip: ['함정 카드 발동!'],
        summonBig: ['나와라!', '공격하라!'],
        summonGod: ['신의 카드다!'],
        lowHp: ['아직 끝나지 않았다.'],
        win: ['나의 승리다.'], lose: ['이럴 수가…'],
      },
      cd: { draw: 7, deckLow: 15, trapSet: 6, trapFlip: 4, summonBig: 5, summonGod: 4 },
    },
  });
})();
