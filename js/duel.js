/* =========================================================
 * 듀얼리스트 프레임워크 ("어둠의 유희") + 유희 덱 전용 메커니즘
 *  - 덱 40장 / 시작 패 5장 / 드로우 → 카드 사용 → 대기(피격 or 상대 스킬) 반복
 *  - 덱 0장에서 드로우 = 즉시 패배 / 엑조디아 5장이 패에 모이면 즉시 승리
 *  - 사용·릴리스·버린 카드 → 묘지.  묘지/제외/덱/패 API (ctx.grave 등)
 *  - 함정: 최대 3장 세트, 세트 수만큼 감속, 3장이면 마법 사용 불가
 *  - 카드 AI: 상황 점수제 (DUEL.AI) — 카드별 ai 힌트, 전역 규칙 DUEL.AI.rules
 *  카드 데이터: js/cards.js (CARD_DEFS), 몬스터 혼 도트: js/duel_sprites.js
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const CFG = {
    LP: 4000, LP_SCALE: 4000 / 870, ATK_SCALE: 0.035,
    HAND_START: 5, TRAP_SLOTS: 3, TRAP_SPD: 0.88,
    FIRST_DRAW: 1.0, DRAW_DELAY: 0.4, PLAY_GAP: 0.65, MAX_PLAYS: 2, MAX_MONSTERS: 1,
    MIN_WAIT: 0.8, WAIT_TIMEOUT: 4.5, TRAP_ARM: 0.6, HAND_SOFT_MAX: 7, HAND_LIMIT: 7, PLAY_MIN: 14,
    // MIN_WAIT/WAIT_TIMEOUT: 드로우 주기 단축 (원거리 자동 공격 제거 보정, 이전 1.0/6.0)
    SPIRIT_DUR: 1.3,          // 몬스터 혼이 보이는 시간
  };
  window.DUEL_LP_SCALE = CFG.LP_SCALE;
  const tribNeed = lv => !lv || lv <= 4 ? 0 : lv <= 6 ? 1 : lv <= 8 ? 2 : 3;
  const TYPE_NAME = { monster: '몬스터', spell: '마법', trap: '함정' };
  const TYPE_COL = { monster: '#c8863a', spell: '#2fa36b', trap: '#b0407a' };
  const EXO = (typeof EXODIA_IDS !== 'undefined') ? EXODIA_IDS : [];
  const piece = d => EXO.includes(d.id);
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const say = (b, u, label, line) => b.hooks.onSkill && b.hooks.onSkill(u, label, line || null);
  let UID = 1;
  const inst = id => { const def = CARD_DEFS[id]; if (!def) { console.warn('[duel] unknown card', id); return null; } return { uid: UID++, id, def }; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toPred = p => !p ? () => true : typeof p === 'function' ? p : (p === 'monster' || p === 'spell' || p === 'trap') ? (d => d.type === p) : (d => d.id === p);
  const effHp = o => o.def.duelist ? o.hp / CFG.LP_SCALE : o.hp;
  const effMax = o => o.def.duelist ? o.maxHp / CFG.LP_SCALE : o.maxHp;
  const isFoe = (a, b) => a && b && a.team !== b.team;
  const cardTag = d => `<span class="dtag" style="background:${TYPE_COL[d.type]}">${TYPE_NAME[d.type]}${d.level ? ' ' + d.level : ''}</span>`;
  const canLaunch = t => t && !t.dead && !t.airborne && !t.climb && !t.inTrain && !t.status('pin');

  // 새 상태: 둔화(퀸즈 나이트), 빛의 봉인검 영역 안 스킬 봉인
  STATUS_DEFS.slow = { name: '둔화', color: '#a8c8ff', tint: '#6a88c8', tintA: 0.16, spdMul: 0.6 };
  STATUS_DEFS.lightSeal = { name: '빛의 봉인검', color: '#fff4b0', tint: '#fff4b0', tintA: 0.12, blocksSkill: true };

  // ---------------- 덱 ----------------
  function buildDeck(spec) {
    let ids = [];
    if (Array.isArray(spec)) ids = spec.slice(); else for (const [id, n] of Object.entries(spec || {})) for (let i = 0; i < n; i++) ids.push(id);
    if (ids.length !== 40) console.warn(`[duel] 덱은 40장이어야 합니다 (현재 ${ids.length}장)`);
    if (DUEL.testDeckSize != null) ids = shuffle(ids).slice(0, DUEL.testDeckSize);
    return shuffle(ids.map(inst).filter(Boolean));
  }
  function setup(b, u) {
    const D = u.def.duelist;
    u.maxHp = u.hp = u.st.hp = CFG.LP;
    u.duel = { deck: buildDeck(D.deck), hand: [], grave: [], banished: [], traps: [], phase: 'start', t: 0, plays: 0, monsters: 0, trig: false, turn: 0, lost: false, pops: [], spirits: [],
      lastPlay: null, queenTurn: null, kuri: null, gardner: null, elfT: -9, hats: null, magnet: null, repel: null, lsword: null };
    for (let i = 0; i < CFG.HAND_START && u.duel.deck.length; i++) u.duel.hand.push(u.duel.deck.shift());
    u.buffs.push(u.duel.load = { type: 'trapLoad', name: '세트 함정', t: 1e9, spdMul: 1, nodispel: true });
    u.nBuffs = u.buffs.length;
  }
  const updateLoad = u => { u.duel.load.spdMul = Math.pow(CFG.TRAP_SPD, u.duel.traps.length); if (!u.buffs.includes(u.duel.load)) u.buffs.push(u.duel.load); };

  function draw(b, u, n = 1, o = {}) {
    const S = u.duel; if (!S || S.lost) return 0;
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (!S.deck.length) { if (o.safe) break; deckOut(b, u); return got; }
      S.hand.push(S.deck.shift()); got++;
    }
    if (got) {
      b.text(u.x, u.y - 70 - u.pad * 2, got > 1 ? `드로우 ×${got}!` : '드로우!', '#ffe9a0', 10);
      say(b, u, `드로우!${got > 1 ? ' ×' + got : ''} <span class="dmini">패 ${S.hand.length} · 덱 ${S.deck.length}</span>`);
      if (!o.quiet) b.say(u, 'draw');
      if (S.deck.length === 0) sys(b, `${u.def.name}의 덱이 0장! 다음 드로우는 패배`);
      else if (S.deck.length <= 5) b.say(u, 'deckLow');
    }
    return got;
  }
  function deckOut(b, u) {
    const S = u.duel; if (S.lost || b.over) return; S.lost = true;
    b.text(u.x, u.y - 80, '덱 아웃!', '#ff7a7a', 15); b.shock(u.x, u.y - 16, 6, 50, '#ff7a7a', 0.5, 4);
    sys(b, `${u.def.name}: 덱이 0장인 상태에서 드로우 → 패배!`);
    const w = b.foes(u)[0] || b.enemy(u);
    b.endType = 'deckout';
    b.resultText = label => `${label(u)} 덱 아웃! ${b.u.filter(o => o.team === w.team).map(label).join(' & ')} 승리!`;
    b.kill(u, w);
  }

  // ---------------- 엑조디아 ----------------
  function checkExodia(b, u) {
    const D = u.duel; if (!EXO.length || D.lost || b.over || b.exodia) return;
    const sig = D.hand.map(c => c.id).join(','); if (sig === D.handSig) return; D.handSig = sig; // 패가 바뀔 때만 검사
    if (!EXO.every(id => D.hand.some(c => c.id === id))) return;
    b.exodia = { u, t: 0 };
    b.freezeBattle(u); // 완성 즉시 전투 전체 정지 + 승자 유희로 고정
    say(b, u, `<span class="dtag" style="background:#d8a020">엑조디아</span> 봉인된 카드 5장이 모두 모였다!`, '분노의 업화 엑조드 파이어!');
    sys(b, `${u.def.name}: 엑조디아 완성! 즉시 승리!`);
    b.say(u, 'exodia');
    b.endType = 'exodia';
    b.resultText = label => `엑조디아 완성! ${label(u)} 승리!`;
    b.duelFx = b.duelFx || []; b.duelFx.push({ type: 'exodia', u, t: 0, dur: 2.6 });
    b.shake(3);
    b.freezeLater(1.3, () => { for (const f of b.foes(u)) { b.streak(u.x, u.y - 120, f.x, f.y - 18, '#ffb040', 26, 0.5); b.streak(u.x, u.y - 120, f.x, f.y - 18, '#fff0c0', 10, 0.4); b.explosion(f.x, f.y, 46); } });
    b.freezeLater(1.7, () => {
      if (b.over) { b.winner = u; return; }
      b.freeze.allowKill = true;
      for (const f of b.foes(u)) if (!f.dead) b.kill(f, u);
      b.freeze.allowKill = false;
      b.over = true;
      b.winner = u; // 결과 화면 = 유희 프로필
    });
  }

  // ---------------- 상황 분석 ----------------
  function situation(b, u) {
    const D = u.duel, e = b.enemy(u), foes = b.foes(u), d = e ? dist(u, e) : 999;
    let incoming = 0;
    for (const p of b.proj) {
      if (!p.src || p.src.team === u.team || p.life <= 0) continue;
      const dx = u.x - p.x, dy = u.y - 18 - p.y, dd = Math.hypot(dx, dy);
      if (dd < 150 && ((p.vx || 0) * dx + (p.vy || 0) * dy > 0 || p.tgt === u)) incoming++;
    }
    let soon = 99, hasSk = false;
    for (const f of foes) {
      if (f.duel) { hasSk = true; soon = Math.min(soon, f.duel.phase === 'wait' ? 1.5 : 0.3); continue; }
      f.skills.forEach((sl, i) => { if (!SKILLS[sl.id] || sl.hidden) return; hasSk = true; if (b.canPay(f, sl)) soon = Math.min(soon, Math.max(0, f.skillT[i])); });
    }
    const hand = D ? D.hand : [], deck = D ? D.deck : [], grave = D ? D.grave : [];
    const gm = grave.filter(c => c.def.type === 'monster');
    const A = e && e.action;
    const S = {
      b, u, e, foes, d, effMax,
      myHpR: u.hp / u.maxHp, myLp: u.hp, missing: u.maxHp - u.hp,
      oppEff: foes.reduce((s, f) => s + effHp(f), 0) || 1, oppTargetEff: e ? effHp(e) : 1,
      oppHpR: e ? e.hp / e.maxHp : 1, oppDef: e ? e.st.def : 0,
      oppAir: !!(e && e.airborne), oppStunned: !!(e && e.blocked('blocksAct')),
      oppCasting: !!(A && ['wind', 'dash', 'chase', 'charge', 'combo'].includes(A.type)),
      oppDashing: !!(A && ['dash', 'chase', 'charge'].includes(A.type)),
      oppMelee: !!(e && e.st.range < 80), oppRanged: !!(e && e.st.range >= 80) || foes.some(f => f.st.range >= 80),
      oppAtkSoon: !!(e && e.st.range < 80 && d < e.reach + u.pad + 45 && e.atkT < 0.5),
      oppSkillSoon: soon, oppHasSkills: hasSk, oppDuelist: !!(e && e.duel), oppTraps: e && e.duel ? e.duel.traps.length : 0,
      incoming, multi: foes.length > 1,
      deck: deck.length, hand: hand.length, traps: D ? D.traps.length : 0,
      spellBlocked: D ? D.traps.length >= CFG.TRAP_SLOTS : false,
      graveMonsters: gm.length, graveSpells: grave.filter(c => c.def.type === 'spell').length,
      graveBestAtk: gm.reduce((m, c) => Math.max(m, c.def.atk || 0), 0), grave: grave.length,
      sealed: u.blocked('blocksSkill'), time: b.time,
      inHand: id => hand.some(c => c.id === id), inDeck: id => deck.some(c => c.id === id), inGrave: id => grave.some(c => c.id === id),
      pieces: hand.filter(c => piece(c.def)).length, piecesInGrave: grave.filter(c => piece(c.def)).length,
      kuriboh: !!(D && D.kuri), gardner: !!(D && D.gardner), magnet: !!(D && D.magnet), lightSword: !!(D && D.lsword),
      queenRecent: !!(D && D.queenTurn != null && D.turn - D.queenTurn <= 2),
      handMonstersNoPiece: hand.filter(c => c.def.type === 'monster' && !piece(c.def)).length,
      trapsInDeck: deck.filter(c => c.def.type === 'trap').length, handQuality: 0,
    };
    S.oppSkillHeavy = foes.some(f => f.skills.some(sl => !sl.hidden && (sl.mult || 0) >= 1.6));
    S.desperate = S.myHpR < 0.15 || (S.deck <= 1 && S.pieces < 4);
    S.lastPlay = D && D.lastPlay;
    S.berserkerReady = !!(D && D.lastPlay && D.lastPlay.def.type === 'monster' && (D.lastPlay.def.level || 0) <= 4 && D.lastPlay.turn === D.turn && D.lastPlay.seq === D.plays);
    if (S.berserkerReady) { const L = D.lastPlay.def, monR = deck.filter(c => c.def.type === 'monster').length / Math.max(1, deck.length); S.berserkerEst = AI.estDmg(L, S) * (monR / Math.max(0.2, 1 - monR)); }
    if (D) { // 카드별 사전 계산 (AI 힌트에서 사용)
      const noPieceMon = hand.filter(c => c.def.type === 'monster' && !piece(c.def));
      const tp = noPieceMon.filter(c => c.id !== 'Y28').map(c => ({ c, k: AI.keepValue(c, S, true) - c.def.level * 3 })).sort((a, z) => a.k - z.k)[0];
      S.turtlePick = tp ? tp.c : null; S.turtlePickKeep = tp ? Math.max(0, tp.k) : 0;
      const rp = noPieceMon.filter(c => c.id !== 'Y18' && S.deck + 1 - c.def.level >= 4).map(c => ({ c, v: c.def.level * 7 - AI.keepValue(c, S, true) * 0.5 })).sort((a, z) => z.v - a.v)[0];
      S.recoveryPick = rp ? rp.c : null;
      const bg = AI.bestGrave(b, u, S); S.bestGraveScore = bg ? bg.score : -999;
    }
    return S;
  }

  // ---------------- 카드 AI ----------------
  const AI = {
    estDmg(c, S) { const ai = c.ai || {}; return ai.est ? ai.est(S) : ai.dmgRaw != null ? ai.dmgRaw : (c.atk || 0) * CFG.ATK_SCALE * (ai.dmg || 1); },
    evaluators: {
      damage(c, S, ai) {
        if (S.oppAir && ai.melee) return -999;
        const est = AI.estDmg(c, S) * 100 / (100 + S.oppDef);
        let v = est * 0.5 + 35 * Math.min(1, est / S.oppTargetEff);
        if (est >= S.oppTargetEff * 0.95 && !S.multi) v += 60; else if (est >= S.oppTargetEff * 0.95) v += 25;
        if (S.oppStunned) v += 8;
        if (S.oppAir && !ai.melee) v += 4;
        if (S.deck <= 5) v += 10;
        if (ai.melee && S.incoming) v -= 6;
        return v;
      },
      heal(c, S, ai) {
        const h = ai.heal || 0; if (S.missing < h * 0.6) return -60;
        let v = Math.min(h, S.missing) / S.u.maxHp * 100;
        if (S.myHpR < 0.35) v += 25; if (S.myHpR < 0.2) v += 20;
        return v;
      },
      draw(c, S, ai) {
        const n = ai.drawFn ? ai.drawFn(S) : (ai.draw || 1);
        if (S.deck - n < 4) return -999;                                   // 덱 아웃 위험
        let v = 13 * Math.min(n, 3) + 4 * Math.max(0, n - 3) + (S.hand <= 2 ? 14 : 0) - (S.hand >= 6 ? 22 : 0);
        v -= n * 50 / Math.max(1, S.deck);
        if (S.pieces >= 2) v += 4 * S.pieces;                              // 엑조디아 조립 중: 드로우 가치 상승
        return v;
      },
      defense(c, S, ai) {
        if (ai.buffType && S.u.buff(ai.buffType)) return -999;
        return -8 + S.incoming * 14 + (S.oppSkillSoon < 1.2 ? 14 : 0) + (S.oppCasting ? 12 : 0) + (S.d < 70 ? 6 : 0) + (S.myHpR < 0.4 ? 10 : 0);
      },
      control(c, S) { if (S.oppStunned) return -10; return 10 + (S.oppCasting ? 8 : 0) + (S.oppSkillSoon < 1 ? 6 : 0); },
      grave() { return 0; },
    },
    rules: [
      (c, S, ai) => { const lp = ai.lpCostFn ? ai.lpCostFn(S) : ai.lpCost; return lp ? (lp >= S.myLp ? -999 : -lp / S.u.maxHp * 60 * (S.myHpR < 0.4 ? 2.2 : 1)) : 0; },
      (c, S, ai, plan) => (plan.tributes.length && S.oppTraps ? -3 * S.oppTraps * plan.tributes.length : 0),
      (c, S) => (piece(c) && !S.desperate ? -999 : 0),                      // 엑조디아 부위는 보관
    ],
    trapValue(c, S) {
      const on = c.trigger && c.trigger.on;
      let v = 10;
      if (on === 'oppSkill') v += S.oppHasSkills ? 10 + (S.oppSkillSoon < 3 ? 6 : 0) : -30;
      else if (on === 'oppAttack' || on === 'oppHit') v += S.oppMelee ? 14 : 8;
      else if (on === 'projectile') v += S.oppRanged ? 12 : -10;
      else if (on === 'oppApproach' || on === 'oppDash') v += S.oppMelee ? 8 : 0;
      else if (on === 'damaged') v += 8;
      else v += 6;
      v -= 4 * S.traps;
      v -= S.u.duel.traps.filter(t => t.inst.def.id === c.id).length * 10;
      return v;
    },
    // 보존 가치 (릴리스/버림/회수 후보: 낮을수록 먼저 소모). 엑조디아는 절박하지 않으면 999
    keepValue(ci, S, noScore) {
      const d = ci.def, ai = d.ai || {};
      if (piece(d)) return S.desperate ? 20 : 999;
      return 6 + (d.level || 0) * 2.5 + (ai.keep || 0) + (noScore ? 0 : Math.max(0, AI.rawScore(d, S, { tributes: [] })) * 0.25);
    },
    worst(list, n, S) { return list.map(c => ({ c, k: c.def.type === 'monster' ? AI.keepValue(c, S) : 6 + Math.max(0, AI.rawScore(c.def, S, { tributes: [] })) * 0.3 })).sort((a, z) => a.k - z.k).slice(0, n).map(x => x.c); },
    bestGrave(b, u, S) { // 묘지 몬스터 중 지금 효과를 쓰면 가장 좋은 것 (레벨·릴리스 무시)
      let best = null;
      for (const c of u.duel.grave) {
        if (c.def.type !== 'monster') continue;
        const v = AI.rawScore(c.def, S, { tributes: [], free: true }, true);
        if (!best || v > best.score) best = { c, score: v };
      }
      return best;
    },
    rawScore(c, S, plan, ignorePiece) {
      const ai = c.ai || {};
      if (ai.when && !ai.when(S, plan.ctx) && !(ignorePiece && piece(c))) return -999;
      if (ai.range != null && S.d > ai.range) return -999;
      if (c.type === 'trap') return AI.trapValue(c, S) + (ai.priority || 0) + (ai.score ? ai.score(S, plan.ctx) || 0 : 0);
      let v = ai.priority || 0;
      const tags = ai.tags || [];
      if (!tags.length) v += 10;
      for (const t of tags) { const f = AI.evaluators[t]; if (f) v += f(c, S, ai); }
      if (ai.score) v += ai.score(S, plan.ctx) || 0;
      for (let i = 0; i < AI.rules.length; i++) { if (ignorePiece && i === 2) continue; v += AI.rules[i](c, S, ai, plan) || 0; }
      return v;
    },
    choose(b, u) {
      const S = situation(b, u), D = u.duel, seen = new Set(), opts = [];
      const qs = D.hand.map(ci => Math.max(-20, AI.rawScore(ci.def, S, { tributes: [] }))); S.handQuality = qs.length ? Math.max(...qs) : 0; // 카드 파괴 판단용
      for (const ci of D.hand) {
        const c = ci.def; if (seen.has(c.id)) continue; seen.add(c.id);
        if (c.type === 'spell' && S.spellBlocked) continue;
        if (c.type === 'trap' && D.traps.length >= CFG.TRAP_SLOTS) continue;
        if (c.type === 'monster' && D.monsters >= CFG.MAX_MONSTERS) continue;
        const plan = { inst: ci, tributes: [], ctx: null };
        const need = c.type === 'monster' ? tribNeed(c.level) : 0;
        if (need) {
          const cand = D.hand.filter(o => o !== ci && o.def.type === 'monster' && (o.def.level || 0) < c.level)
            .map(o => ({ o, k: AI.keepValue(o, S) })).filter(x => x.k < 500).sort((a, z) => a.k - z.k);
          if (cand.length < need) continue;
          plan.tributes = cand.slice(0, need).map(x => x.o);
          plan.cost = cand.slice(0, need).reduce((s, x) => s + x.k, 0) * (S.hand >= 6 ? 0.6 : 0.85);
        }
        plan.score = AI.rawScore(c, S, plan) - (plan.cost || 0); opts.push(plan);
      }
      if (S.traps === CFG.TRAP_SLOTS - 1) { const sp = opts.filter(o => o.inst.def.type === 'spell' && o.score > 0).length; if (sp) opts.forEach(o => { if (o.inst.def.type === 'trap') o.score -= 12 + 4 * sp; }); }
      let min = CFG.PLAY_MIN; if (S.hand >= CFG.HAND_LIMIT - 1) min = 4; if (S.hand >= CFG.HAND_LIMIT) min = -8; // 패 한도 근처: 적극 사용 if (S.deck <= 3) min -= 6;
      opts.sort((a, z) => z.score - a.score);
      D.lastEval = opts.slice(0, 4).map(o => `${o.inst.def.name}:${Math.round(o.score)}`).join(' ');
      return opts[0] && opts[0].score >= min ? opts[0] : null;
    },
  };

  // ---------------- 몬스터 혼 (소환 연출) ----------------
  function spawnSpirit(b, u, def, dur, o = {}) {
    const D = u.duel, e = b.enemy(u), a = e ? Math.atan2(e.y - u.y, e.x - u.x) : 0;
    const s = { def, spr: def.sprite, flip: def.flip, t: 0, dur: dur || CFG.SPIRIT_DUR, x: u.x + Math.cos(a) * 26, y: u.y - 30 + Math.sin(a) * 10, ox: Math.cos(a) * 26, shot: 0.4, rate: 0, dmg: 0, uid: o.uid, big: (def.level || 0) >= 10 };
    if (D) D.spirits.push(s); else (b.duelSpirits || (b.duelSpirits = [])).push({ ...s, u });
    b.glow(s.x, s.y, s.big ? 50 : 30, '#ffe8b0', 0.35);
    return s;
  }

  // ---------------- 카드 컨텍스트 API ----------------
  function popup(b, u, def, faceDown, sub, line) { const p = { def, faceDown, sub, line, t: 0, dur: line ? 1.9 : 1.5 }; if (u.duel) u.duel.pops.push(p); else (b.duelPops || (b.duelPops = [])).push({ ...p, u }); }
  function makeCtx(b, u, ci, ev, o = {}) {
    const card = ci ? ci.def : null, D = u.duel, mul = o.mult || 1, depth = o.depth || 0;
    const E = () => b.enemy(u);
    const hitO = x => ({ element: (card && card.element) || 'dark', delivery: 'ranged', color: '#ffe0b0', ...x, cardDmg: true });
    const kindOf = el => el === 'fire' ? 'flame' : el === 'light' ? 'holy' : 'magic';
    const zones = {
      list: (arr, p) => (arr || []).filter(c => toPred(p)(c.def, c)),
      take: (arr, p, best) => { if (!arr) return null; let L = arr.filter(c => toPred(p)(c.def, c) && c !== ci); if (!L.length) return null; if (best) L.sort((a, z) => (z.def.atk || 0) - (a.def.atk || 0)); const c = L[0]; arr.splice(arr.indexOf(c), 1); return c; },
    };
    const S = () => situation(b, u);
    const ctx = {
      b, u, card, inst: ci, ev, mult: mul, spirit: o.spirit || null,
      get e() { return E(); }, foes: () => b.foes(u), S,
      origin: () => ctx.spirit && ctx.spirit.t < ctx.spirit.dur ? { x: ctx.spirit.x, y: ctx.spirit.y } : { x: u.x + u.facing * 10, y: u.y - 24 },
      atk: (m = 1) => ((card && card.atk) || 0) * CFG.ATK_SCALE * m * mul,
      val: n => n * CFG.ATK_SCALE * mul,
      damage: (t, amt, x) => b.damage(u, t || E(), amt, hitO(x)),
      shoot(x = {}) {
        const t = x.target || E(); if (!t || t.dead) return;
        const n = x.count || 1;
        for (let i = 0; i < n; i++) b.later(i * 0.12, () => { if (u.dead || b.over || t.dead) return; const p0 = ctx.origin(); b.proj.push({ x: p0.x, y: p0.y, tgt: t, src: u, spd: x.spd || 430, dmg: x.dmg / n, kind: x.kind || kindOf(card && card.element), homing: true, life: 2.6, trail: 0, r: x.r, hit: hitO({ applies: x.applies, pierce: x.pierce }) }); });
        const p0 = ctx.origin(); b.glow(p0.x, p0.y, 22, TYPE_COL[card ? card.type : 'monster'], 0.3);
      },
      bolt(amt, x = {}) {
        const t = x.target || E(); if (!t || t.dead) return;
        b.bolt(t.x, t.y - 18 - b.airZ(t), 60, x.color || '#fff4a0'); b.sparks(t.x, t.y - 18, x.color || '#fff6a8', 10, 140);
        b.damage(u, t, amt, hitO({ element: x.element || 'elec', applies: x.applies, sure: true }));
      },
      bolts(n, amt, x = {}) { for (let i = 0; i < n; i++) b.later(0.15 + i * 0.22, () => { if (!u.dead && !b.over) ctx.bolt(amt, x); }); },
      beam(amt, x = {}) {
        const t = x.target || E(); if (!t) return;
        const w = x.windup ?? 0.35, p0 = ctx.origin(), ang = Math.atan2(t.y - 18 - p0.y, t.x - p0.x);
        b.telegraphLine(p0.x, p0.y, p0.x + Math.cos(ang) * 400, p0.y + Math.sin(ang) * 400, 18, w, '#fff0b0');
        b.later(w, () => {
          if (u.dead || b.over) return;
          for (const f of b.foes(u)) { const dx = f.x - p0.x, dy = f.y - 18 - p0.y, al = dx * Math.cos(ang) + dy * Math.sin(ang), pp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang)); if (al > -10 && pp < 24 + f.pad) b.damage(u, f, amt, hitO({ element: (card && card.element) || 'light', big: true, piercesBarrier: true })); }
          b.streak(p0.x, p0.y, p0.x + Math.cos(ang) * 420, p0.y + Math.sin(ang) * 420, '#fff6c8', 22, 0.45); b.shake(2.5);
        });
      },
      rush(amt, x = {}) {
        const t = x.target || E(); if (!t || t.dead) return;
        b.windup(u, 0.12, () => b.chase(u, t, 950, 0.45, () => {
          const r = b.damage(u, t, amt, hitO({ delivery: 'melee', applies: x.applies, big: true }));
          const a = Math.atan2(t.y - u.y, t.x - u.x);
          b.crescent(t.x, t.y - 18, 30, a - 0.6, x.color || '#ffe0b0', 0.3); b.sparks(t.x, t.y - 18, '#ffe0b0', 12, 220); b.hitstop(0.06);
          if (x.onHit && r > 0) x.onHit(t);
        }, TYPE_COL.monster));
      },
      charge(amt) { // 관통 돌진 (상대를 지나쳐 감)
        const t = E(); if (!t || t.dead) return;
        const a = Math.atan2(t.y - u.y, t.x - u.x), q = b.clampPos(t.x + Math.cos(a) * 60, t.y + Math.sin(a) * 60, u.pad);
        let hit = false;
        b.windup(u, 0.2, () => b.dash(u, q.x, q.y, 0.35, () => { if (hit) return; hit = true; b.damage(u, t, amt, hitO({ delivery: 'melee', big: true })); b.sparks(t.x, t.y - 18, '#c8b0ff', 16, 260); b.streak(u.x, u.y - 18, q.x, q.y - 18, '#9a80ff', 12, 0.3); b.hitstop(0.08); }, '#9a80ff'));
      },
      multiHit(n, amt) {
        const t = E(); if (!t || t.dead) return;
        b.windup(u, 0.1, () => b.chase(u, t, 900, 0.45, () => {
          for (let i = 0; i < n; i++) b.later(i * 0.09, () => { if (t.dead || b.over) return; b.damage(u, t, amt, hitO({ delivery: 'melee' })); b.slashFx(t.x + rand(-8, 8), t.y - 18 + rand(-8, 8), Math.atan2(t.y - u.y, t.x - u.x), '#c8e0ff', 0.7); });
        }, '#c8e0ff'));
      },
      uppercut(amt) {
        const t = E(); if (!t || t.dead) return;
        b.windup(u, 0.12, () => b.chase(u, t, 900, 0.4, () => {
          b.damage(u, t, amt, hitO({ delivery: 'melee', big: true }));
          b.crescent(t.x, t.y - 22, 30, -Math.PI / 2 - 0.8, '#ffe080', 0.3);
          if (canLaunch(t)) { t.action = null; t.air = { t: 0, dur: 0.9, h: 55, tumble: true }; b.text(t.x, t.y - 60, '띄움!', '#ffe080', 9); }
        }, '#ffe080'));
      },
      fan(amt, x = {}) {
        const t = E(); if (!t) return;
        const R = x.range || 160, sp = x.spread || 0.6, a = Math.atan2(t.y - u.y, t.x - u.x), col = x.color || '#ffae6b';
        b.telegraphFan(u.x, u.y - 14, a, sp, R, 0.3, col);
        b.later(0.3, () => {
          if (u.dead || b.over) return;
          if (x.delivery === 'melee') for (let i = -1; i <= 1; i++) b.crescent(u.x + Math.cos(a + i * sp * 0.6) * R * 0.55, u.y - 16 + Math.sin(a + i * sp * 0.6) * R * 0.55, R * 0.35, a - 0.7, col, 0.25);
          else for (let i = 0; i < 16; i++) { const aa = a + rand(-sp, sp), s = rand(120, 300); b.parts.push({ x: u.x, y: u.y - 18, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, life: R / s, max: R / s, color: ['#ffb36b', '#ffd38a', '#ff7a4a'][i % 3], size: rand(2.5, 4.5), glow: true }); }
          for (const f of b.foes(u)) { const d = dist(u, f), fa = Math.atan2(f.y - u.y, f.x - u.x), df = Math.abs(Math.atan2(Math.sin(fa - a), Math.cos(fa - a))); if (d <= R + f.pad && df <= sp + 0.15) b.damage(u, f, amt, hitO({ element: (card && card.element) || 'fire', delivery: x.delivery || 'ranged', applies: x.applies })); }
          if (x.hazard) for (let i = 1; i <= 3; i++) ctx.hazard(u.x + Math.cos(a) * R * i / 3.3, u.y + Math.sin(a) * R * i / 3.3, 22 + i * 6, x.hazard.dur, x.hazard.dmg);
        });
      },
      hazard(x, y, r, dur, dmg) { (b.duelHaz || (b.duelHaz = [])).push({ u, x, y, r, t: 0, dur, dmg, tick: 0.5 }); },
      blast(amt, x = {}) {
        const t = E(); if (!t) return;
        const r = x.r || 50, q = b.predict(t, (x.delay || 0.5) * 0.5), px = q.x, py = q.y;
        b.telegraphCircle(px, py, r, x.delay || 0.5, x.color || '#ff9a7a');
        b.later(x.delay || 0.5, () => { if (b.over) return; b.explosion(px, py, r); for (const f of b.foes(u)) if (Math.hypot(f.x - px, f.y - py) <= r + 8 + f.pad) b.damage(u, f, amt, hitO({ big: true, element: x.element })); });
      },
      chain(t, amt, dur) { t = t || E(); if (!t || t.dead) return; b.wireFx(u, t, 0.4, 2); b.damage(u, t, amt, hitO({ sure: true })); ctx.status(t, 'bind', dur); },
      reflect(t, amt, x = {}) {
        if (!t || t.dead) return;
        b.shock(u.x, u.y - 16, 6, 50, '#e8f0ff', 0.45, 5); b.glow(u.x, u.y - 18, 46, '#cfe0ff', 0.4);
        b.streak(u.x, u.y - 18, t.x, t.y - 18, '#e8f0ff', 10, 0.3);
        b.damage(u, t, amt, hitO({ element: 'light', sure: true, big: true, reflected: true, pierce: 1 }));
        if (x.knock !== false) b.knockback(t, Math.atan2(t.y - u.y, t.x - u.x), 380, 0.3);
      },
      clearProjectiles(r = 120) { let n = 0; for (const p of b.proj) if (p.src && p.src.team !== u.team && Math.hypot(p.x - u.x, p.y - (u.y - 18)) < r) { p.life = 0; p.fizzle = null; n++; b.burst(p.x, p.y, '#e8f0ff', 6); } b.ring(u.x, u.y - 18, 6, r * 0.5, 0.35, '#e8f0ff'); return n; },
      heal(lp) { if (!Number.isFinite(lp) || lp <= 0) return 0; const before = u.hp; b.heal(u, lp); return u.hp - before; },
      payLp(n) { if (n <= 0 || u.hp <= n) return false; u.hp -= n; b.text(u.x, u.y - 50, `-${n} LP`, '#ff9ab0', 10); say(b, u, `LP ${n} 지불 <span class="dmini">남은 LP ${Math.round(u.hp)}</span>`); return true; },
      buff(x) { u.buffs = u.buffs.filter(q => q.type !== x.type); const { dur, ...rest } = x; u.buffs.push({ ...rest, t: dur || 3 }); },
      status(t, id, dur, chance = 1, power) { if (!t || t.dead) return; b.applyList(u, t, [{ status: id, duration: dur, chance, power }]); },
      knockback(t, spd = 380, dur = 0.3) { if (t) b.knockback(t, Math.atan2(t.y - u.y, t.x - u.x), spd, dur); },
      summon(x = {}) { if (!card) return; const s = spawnSpirit(b, u, card, x.dur || 3); s.rate = x.rate || 1; s.dmg = ctx.atk(x.mult || 0.3); s.kind = x.kind || kindOf(card.element); },
      draw: n => draw(b, u, n),
      negate() { ctx.negated = true; },
      text: (t, c = '#ffe9a0') => b.text(u.x, u.y - 82 - u.pad * 2, t, c, 9),
      log: t => sys(b, t),
      voice: key => b.say(u, key),
      hand: {
        list: p => zones.list(D && D.hand, p), count: p => zones.list(D && D.hand, p).length,
        discard(p, n = 1) { const out = []; for (let i = 0; i < n; i++) { const c = zones.take(D && D.hand, p); if (!c) break; D.grave.push(c); out.push(c); } return out; },
        add(id) { const c = inst(id); if (c && D) D.hand.push(c); return c; },
      },
      deck: {
        count: p => zones.list(D && D.deck, p).length, top: () => (D && D.deck[0]) || null,
        search(p) { const c = zones.take(D && D.deck, p); if (c) D.hand.push(c); return c; },
        mill(n = 1) { const out = []; for (let i = 0; i < n && D && D.deck.length; i++) { const c = D.deck.shift(); D.grave.push(c); out.push(c); } return out; },
        shuffle() { D && shuffle(D.deck); }, add(id, top) { const c = inst(id); if (c && D) top ? D.deck.unshift(c) : D.deck.push(c); return c; },
      },
      grave: {
        list: p => zones.list(D && D.grave, p), count: p => zones.list(D && D.grave, p).length,
        has: p => zones.list(D && D.grave, p).length > 0, top: () => (D && D.grave[D.grave.length - 1]) || null,
        toHand(p) { const c = zones.take(D && D.grave, p, true); if (c) D.hand.push(c); return c; },
        toDeck(p, sh = true) { const c = zones.take(D && D.grave, p); if (c) { D.deck.push(c); if (sh) shuffle(D.deck); } return c; },
        banish(p, n = 1) { const out = []; for (let i = 0; i < n; i++) { const c = zones.take(D && D.grave, p); if (!c) break; D.banished.push(c); out.push(c); } return out; },
        revive(p, x = {}) { if (!D) return null; const c = zones.take(D.grave, d => d.type === 'monster' && toPred(p)(d), true); if (!c) return null; D.grave.push(c); useMonster(b, u, c, { label: '소생', mult: (x.mult || 1) * mul, depth: depth + 1 }); return c; },
      },
      banished: { list: p => zones.list(D && D.banished, p), count: p => zones.list(D && D.banished, p).length },

      // ===== 유희 덱 전용 =====
      useMonster: (c, x = {}) => useMonster(b, u, c, { ...x, depth: depth + 1 }),
      useFromDeck(id, label) { if (!D) return null; const c = zones.take(D.deck, id); if (!c) return null; D.grave.push(c); useMonster(b, u, c, { label, depth: depth + 1 }); return c; },
      bestGrave() { if (!D) return null; const r = AI.bestGrave(b, u, S()); return r ? r.c : null; },
      discardWorst(n) { if (!D) return []; const L = AI.worst(D.hand.filter(c => c !== ci), n, S()); for (const c of L) { D.hand.splice(D.hand.indexOf(c), 1); D.grave.push(c); } if (L.length) say(b, u, `버림 <span class="dmini">${L.map(c => c.def.name).join(', ')}</span>`); return L; },
      foeCooldowns(mode) {
        for (const f of b.foes(u)) {
          if (f.duel) { if (mode === 'ready') { f.duel.trig = true; f.duel.t = Math.max(f.duel.t, CFG.MIN_WAIT); } else { f.duel.phase = 'wait'; f.duel.t = 0; f.duel.trig = false; } continue; }
          f.skills.forEach((sl, i) => { if (sl.hidden) return; f.skillT[i] = mode === 'ready' ? 0 : (sl.cd || 5); });
          b.text(f.x, f.y - 60, mode === 'ready' ? '쿨타임 초기화' : '쿨타임 최대', mode === 'ready' ? '#ffb0b0' : '#b0c8ff', 9);
        }
      },
      lockSkill(t, slot, k = 3) { // 무효된 스킬 쿨타임 ×k
        if (!t || t.dead) return;
        if (t.duel) { t.duel.phase = 'wait'; t.duel.t = -CFG.WAIT_TIMEOUT * (k - 1); t.duel.trig = false; b.text(t.x, t.y - 60, '턴 봉인!', '#ffe8a0', 9); return; }
        const i = t.skills.indexOf(slot); if (i < 0) return;
        t.skillT[i] = (slot.cd || 5) * k; b.text(t.x, t.y - 60, `쿨타임 ×${k}`, '#ffe8a0', 9);
        say(b, u, `신의 심판: ${slot.name} 쿨타임 ${Math.round(t.skillT[i])}초`);
      },
      queenRecent: () => !!(D && D.queenTurn != null && D.turn - D.queenTurn <= 2),
      kuriboh(dur) { if (D) D.kuri = { t: dur }; b.ring(u.x, u.y - 18, 8, 30, 0.4, '#c8a070'); ctx.text('크리보 방패!', '#e8c890'); },
      gardner(hp, dur) { if (D) D.gardner = { hp, max: hp, t: dur }; b.shock(u.x, u.y - 16, 6, 34, '#c8d0ff', 0.4, 4); },
      elfGuard(dur) { if (D) D.elfT = b.time + dur; },
      thunderForce(pct) {
        b.shake(3); b.hitstop(0.1);
        for (const f of b.foes(u)) {
          for (let i = 0; i < 3; i++) b.later(i * 0.12, () => { b.bolt(f.x + rand(-14, 14), f.y - 18, 90, '#ffe860'); });
          b.later(0.3, () => { if (f.dead || b.over) return; b.damage(u, f, pct * effMax(f) * mul, hitO({ element: 'elec', sure: true, pierce: 1, piercesBarrier: true, big: true })); f.duelWeak = b.time + 10; b.text(f.x, f.y - 66, '공격력 저하', '#ffe860', 9); });
        }
        for (let i = 0; i < 10; i++) b.later(i * 0.05, () => b.bolt(rand(20, 340), rand(120, 600), 70, '#fff4a0'));
      },
      godHand(direct, wave, stun) {
        const t = E(); if (!t) return;
        const tx = t.x, ty = t.y;
        b.telegraphCircle(tx, ty, 40, 0.45, '#c8d8ff');
        (b.duelFx || (b.duelFx = [])).push({ type: 'fist', x: tx, y: ty, t: 0, dur: 0.75 });
        b.later(0.45, () => {
          if (b.over) return;
          b.shake(4); b.hitstop(0.12); b.explosion(tx, ty, 40); b.shock(tx, ty, 10, 380, '#c8d8ff', 0.7, 6); b.debris(tx, ty, 16);
          for (const f of b.foes(u)) {
            if (Math.hypot(f.x - tx, f.y - ty) < 44 + f.pad && !f.airborne) b.damage(u, f, direct, hitO({ delivery: 'melee', big: true, pierce: 0.5 }));
            if (f.airborne) { b.text(f.x, f.y - 60, '공중: 충격파 무효', '#c8d8ff', 8); continue; }
            b.damage(u, f, wave, hitO({ delivery: 'melee', sure: true })); b.applyStatus(f, 'stun', stun, u);
          }
        });
      },
      raCannon() {
        if (!D) return; const keep = Math.ceil(u.maxHp * 0.01), paid = Math.max(0, Math.round(u.hp - keep)); if (!paid) return;
        u.hp = keep; b.text(u.x, u.y - 50, `-${paid} LP`, '#ff9ab0', 11); say(b, u, `LP ${paid} 지불! <span class="dmini">남은 LP ${keep}</span>`);
        const amt = paid * CFG.ATK_SCALE * 1.2 * mul, r = 36 + paid / 22, t = E(); if (!t) return;
        const px = t.x, py = t.y;
        b.telegraphCircle(px, py, r, 0.7, '#ffb040'); b.glow(u.x, u.y - 60, 60, '#ffd060', 0.7);
        b.later(0.7, () => {
          if (b.over) return;
          b.streak(u.x, u.y - 90, px, py - 10, '#ffb040', 30, 0.5); b.streak(u.x, u.y - 90, px, py - 10, '#fff0c0', 12, 0.4);
          b.explosion(px, py, r); b.shock(px, py, 8, r * 1.3, '#ffb040', 0.6, 6); b.shake(5); b.hitstop(0.15);
          for (const f of b.foes(u)) if (Math.hypot(f.x - px, f.y - py) <= r + f.pad + 8) b.damage(u, f, amt, hitO({ element: 'fire', big: true, sure: true, piercesBarrier: true }));
        });
      },
      avarice() {
        if (!D) return; const gm = D.grave.filter(c => c.def.type === 'monster').sort((a, z) => (piece(z.def) ? 1 : 0) - (piece(a.def) ? 1 : 0) || (z.def.level || 0) - (a.def.level || 0)).slice(0, 5);
        if (gm.length < 5) return;
        for (const c of gm) { D.grave.splice(D.grave.indexOf(c), 1); D.deck.push(c); }
        shuffle(D.deck); say(b, u, `묘지 몬스터 5장 → 덱 <span class="dmini">${gm.map(c => c.def.name).join(', ')}</span>`); draw(b, u, 2);
      },
      monsterRecovery() {
        if (!D) return; const c = S().recoveryPick; if (!c) return;
        D.hand.splice(D.hand.indexOf(c), 1); D.deck.push(c); shuffle(D.deck);
        say(b, u, `${c.def.name} → 덱, ${c.def.level}장 드로우`); draw(b, u, c.def.level);
      },
      turtleShot(per) {
        if (!D) return; const c = S().turtlePick; if (!c) return;
        D.hand.splice(D.hand.indexOf(c), 1); D.grave.push(c);
        say(b, u, `${cardTag(card)} 사출! ${c.def.name}`, `사출! ${c.def.name}`); popup(b, u, c.def, false, '사출!');
        ctx.shoot({ dmg: ctx.val(per * (c.def.level || 1)), kind: 'magic', r: 10 + c.def.level, spd: 520 });
      },
      hatsActive: () => !!(D && D.hats),
      silkHats(dur) {
        if (!D) return;
        const mon = AI.worst(D.hand.filter(c => c.def.type === 'monster' && !piece(c.def)), 1, S())[0]; if (!mon) return;
        D.hand.splice(D.hand.indexOf(mon), 1);
        const items = [mon];
        for (let i = 0; i < 2; i++) { const t = zones.take(D.deck, 'trap'); if (t) items.push(t); }
        shuffle(items);
        D.hats = { t: dur, items: items.map((c, i) => ({ c, a: i * TAU / items.length })), spin: 0 };
        b.smoke(u.x, u.y - 18, '#c8b0e0', 8); ctx.text('어느 모자일까?', '#e0c8ff');
      },
      lightSwords(dur, r) { const t = E(); if (!D || !t) return; D.lsword = { t: dur, dur, x: u.x, y: u.y, ang: Math.atan2(t.y - u.y, t.x - u.x), r }; b.shake(2); },
      reverse(t) {
        if (!t || t.dead) return; t.action = null;
        const a = (t.dir || 0) + Math.PI; t.dir = a;
        b.knockback(t, Math.atan2(t.y - u.y, t.x - u.x), Math.max(260, t.speed * 1.4), 0.45);
        b.ring(t.x, t.y - 16, 6, 30, 0.4, '#b0a0ff'); b.text(t.x, t.y - 60, '중력 반전!', '#b0a0ff', 9);
      },
      slamDown(airAmt, groundAmt) {
        const t = E(); if (!t || t.dead) return;
        if (t.airborne) { t.air = null; b.damage(u, t, airAmt, hitO({ delivery: 'melee', big: true, sure: true })); b.knockdown(u, t, 0.8); b.shock(t.x, t.y, 6, 44, '#d0c0a0', 0.4, 5); b.debris(t.x, t.y, 10); b.shake(3); b.text(t.x, t.y - 60, '추락!', '#ffd0a0', 10); }
        else ctx.shoot({ dmg: groundAmt, kind: 'magic' });
      },
      magnetPull(dur, dot) { const t = E(); if (!D || !t) return; D.magnet = { t: dur, tgt: t, dot, tick: 0.5, strain: 0, lx: t.x, ly: t.y }; b.wireFx(u, t, 0.4, 2); },
      repel(t, dur) { if (D && t) D.repel = { t: dur, tgt: t }; },
      berserker(max) {
        if (!D || !D.lastPlay) return; const L = D.lastPlay.def; let n = 0;
        const step = () => {
          if (u.dead || b.over || D.lost) return;
          if (n >= max) { sys(b, `버서커 소울: 최대 ${max}회로 종료`); return; }
          if (!D.deck.length) { sys(b, '버서커 소울: 덱이 비어 안전 정지'); return; }
          const c = D.deck.shift(); n++;
          b.text(u.x, u.y - 70, `드로우! ${c.def.name}`, '#ffe9a0', 9);
          if (c.def.type !== 'monster') { D.hand.push(c); say(b, u, `버서커 소울 종료 <span class="dmini">${c.def.name} (몬스터 아님)</span>`); return; }
          if (piece(c.def)) { D.hand.push(c); say(b, u, `${c.def.name}은(는) 패에 보관`); b.later(0.45, step); return; }
          D.grave.push(c); say(b, u, `버서커 소울 ${n}회째: ${c.def.name} 버림 → ${L.name}!`);
          useMonster(b, u, { uid: 0, id: L.id, def: L }, { label: `버서커 ${n}`, depth: 1, noGrave: true });
          b.later(0.55, step);
        };
        step();
      },
    };
    return ctx;
  }

  // ---------------- 카드 사용 ----------------
  const shoutOf = c => c.shout || (c.name + '!');
  function useMonster(b, u, ci, x = {}) { // 몬스터 효과 발동 (혼 소환 → 효과). 묘지/덱 발동도 여기로
    const c = ci.def, D = u.duel, depth = x.depth || 0;
    if (depth > 3) return;
    const sp = spawnSpirit(b, u, c, c.level >= 10 ? 1.8 : CFG.SPIRIT_DUR);
    popup(b, u, c, false, x.label, c.shoutLater ? null : shoutOf(c));
    if (x.label) say(b, u, `${cardTag(c)} ${x.label}: ${c.name}`, c.shoutLater ? null : shoutOf(c));
    if (c.level >= 10) { b.say(u, 'summonGod'); b.shake(2.5); } else if (c.level >= 7) b.say(u, 'summonBig');
    if (D && c.id === 'Y21') D.queenTurn = D.turn;
    const ctx = makeCtx(b, u, ci, null, { mult: x.mult, depth, spirit: sp });
    try { c.effect && c.effect(ctx); } catch (err) { console.warn('[duel] monster effect failed', c.id, err); }
  }
  function play(b, u, plan) {
    const D = u.duel, ci = plan.inst, c = ci.def;
    D.hand.splice(D.hand.indexOf(ci), 1);
    if (plan.tributes.length) {
      for (const t of plan.tributes) { D.hand.splice(D.hand.indexOf(t), 1); D.grave.push(t); }
      say(b, u, `릴리스 ${plan.tributes.length}장 <span class="dmini">${plan.tributes.map(t => t.def.name).join(', ')}</span>`);
      b.smoke(u.x, u.y - 18, '#d8c8ff', 6);
    }
    if (c.type === 'trap') {
      D.traps.push({ inst: ci, t: 0 }); updateLoad(u);
      popup(b, u, c, true);
      say(b, u, `카드를 1장 세트 <span class="dmini">함정 ${D.traps.length}/${CFG.TRAP_SLOTS}${D.traps.length >= CFG.TRAP_SLOTS ? ' · 마법 봉쇄' : ''}</span>`);
      b.say(u, 'trapSet');
      return;
    }
    if (c.type === 'monster') D.monsters++;
    D.grave.push(ci);
    D.lastPlay = { def: c, turn: D.turn, seq: D.plays + 1 };
    if (c.type !== 'monster') { popup(b, u, c, false, null, shoutOf(c)); }
    say(b, u, `${cardTag(c)} ${c.name}`, c.shoutLater ? null : shoutOf(c));
    b.glow(u.x, u.y - 30, 30, TYPE_COL[c.type], 0.35);
    if (b.emit('skill', u, { name: c.name, card: c, duel: true }, b.enemy(u))) { b.text(u.x, u.y - 60, '무효!', '#c8c0ff', 11); return; }
    if (c.type === 'monster') { useMonster(b, u, ci, {}); return; }
    const ctx = makeCtx(b, u, ci, null);
    try { c.effect && c.effect(ctx); } catch (err) { console.warn('[duel] card effect failed', c.id, err); }
  }

  // ---------------- 함정 발동 ----------------
  function activateTrap(b, u, ci, ev, sub) {
    const c = ci.def, ctx = makeCtx(b, u, ci, ev);
    popup(b, u, c, false, sub || '발동', shoutOf(c));
    say(b, u, `함정 발동! ${cardTag(c)} ${c.name}`, shoutOf(c));
    b.say(u, 'trapFlip');
    b.shock(u.x, u.y - 16, 4, 36, TYPE_COL.trap, 0.4, 3);
    try { c.effect && c.effect(ctx, ev || {}); } catch (err) { console.warn('[duel] trap effect failed', c.id, err); }
    return !!ctx.negated;
  }
  function checkTraps(b, u, on, ev, force) {
    const D = u.duel; if (!D || u.dead || b.over || D.lost || !D.traps.length || b.exodia) return false;
    for (const T of D.traps) {
      const c = T.inst.def, tr = c.trigger; if (!tr || tr.on !== on || (T.t < CFG.TRAP_ARM && !force)) continue;
      const ctx = makeCtx(b, u, T.inst, ev);
      if (tr.when && !tr.when(ctx, ev || {})) continue;
      if (!force && c.ai && c.ai.activate && !(c.ai.forced) && !c.ai.activate(situation(b, u), ev || {})) continue;
      D.traps.splice(D.traps.indexOf(T), 1); updateLoad(u); D.grave.push(T.inst);
      return activateTrap(b, u, T.inst, ev);
    }
    return false;
  }

  // ---------------- 패 한도 (턴 드로우 전용, 카드 효과 드로우는 예외) ----------------
  //  함정 세트(빈 슬롯 + 쓸만할 때) → 아니면 가장 가치 낮은 카드를 묘지로. 마법은 세트 개념이 없어 버림 처리
  function discardValue(ci, S, D) {
    const d = ci.def;
    if (piece(d)) return D.hand.every(c => piece(c.def)) ? 500 : 9999;
    let k = d.type === 'monster' ? AI.keepValue(ci, S) : 6 + Math.max(0, AI.rawScore(d, S, { tributes: [] })) * 0.3;
    if (d.type === 'monster') {                                  // 묘지 시너지: 버리면 오히려 좋은 카드
      if (d.id === 'Y02' && (S.inHand('Y27') || S.inDeck('Y27'))) k -= 14; // 블랙 매지션 걸 ×2
      if ((d.level || 0) >= 6 && (S.inHand('Y13') || D.traps.some(t => t.inst.id === 'Y19'))) k -= 10; // 소생 대상
      if (S.inHand('Y17') && S.graveMonsters >= 3) k -= 5;       // 탐욕의 항아리 준비
    }
    if (d.type === 'trap' && D.traps.length >= CFG.TRAP_SLOTS) k -= 4;
    return k;
  }
  function reduceHand(b, u) {
    const D = u.duel, S = situation(b, u);
    if (D.traps.length < CFG.TRAP_SLOTS) {
      const tr = D.hand.filter(c => c.def.type === 'trap').map(c => ({ c, v: AI.trapValue(c.def, S) + ((c.def.ai && c.def.ai.priority) || 0) })).sort((a, z) => z.v - a.v)[0];
      if (tr && tr.v > 0) {
        D.hand.splice(D.hand.indexOf(tr.c), 1); D.traps.push({ inst: tr.c, t: 0 }); updateLoad(u); popup(b, u, tr.c.def, true);
        say(b, u, `패가 가득! 카드를 1장 세트 <span class="dmini">함정 ${D.traps.length}/${CFG.TRAP_SLOTS}</span>`);
        return;
      }
    }
    const c = D.hand.map(c => ({ c, k: discardValue(c, S, D) })).sort((a, z) => a.k - z.k)[0].c;
    D.hand.splice(D.hand.indexOf(c), 1); D.grave.push(c);
    b.text(u.x, u.y - 70, '패가 가득!', '#ffb0b0', 9);
    say(b, u, `패가 가득! ${cardTag(c.def)} ${c.def.name} 를 묘지로`);
  }

  // ---------------- 매지컬 실크햇 ----------------
  const hatPos = (u, H, h) => ({ x: u.x + Math.cos(h.a + H.spin) * 38, y: u.y - 14 + Math.sin(h.a + H.spin) * 22 });
  function revealHat(b, u, h, src) {
    const D = u.duel, H = D.hats; if (!H) return;
    const p = hatPos(u, H, h); D.hats = null;
    b.smoke(p.x, p.y, '#e0d0ff', 8); b.text(p.x, p.y - 20, `공개: ${h.c.def.name}`, TYPE_COL[h.c.def.type], 9);
    say(b, u, `실크햇 공개! ${cardTag(h.c.def)} ${h.c.def.name}`);
    for (const o of H.items) if (o !== h) D.grave.push(o.c);
    D.grave.push(h.c);
    if (h.c.def.type === 'trap') activateTrap(b, u, h.c, { src, amount: 0, dmg: 0, hat: true }, '실크햇');
  }

  // ---------------- 턴 진행 ----------------
  function tick(b, u, dt) {
    const D = u.duel;
    for (const T of D.traps) T.t += dt;
    const e = b.enemy(u);
    if (D.traps.length && e) {
      const has = on => D.traps.some(T => T.inst.def.trigger && T.inst.def.trigger.on === on);
      if (has('projectile')) {
        const p = b.proj.find(p => p.src && p.src.team !== u.team && p.life > 0 && Math.hypot(u.x - p.x, u.y - 18 - p.y) < 85 && (((p.vx || 0) * (u.x - p.x) + (p.vy || 0) * (u.y - 18 - p.y)) > 0 || p.tgt === u));
        if (p) checkTraps(b, u, 'projectile', { proj: p, src: p.src });
      }
      if (has('lowLp')) checkTraps(b, u, 'lowLp', {});
      if (e.airborne && has('oppAirborne')) checkTraps(b, u, 'oppAirborne', { src: e });
      const d = dist(u, e), dashing = e.action && ['dash', 'chase', 'charge'].includes(e.action.type);
      if (dashing && d < 160) checkTraps(b, u, 'oppDash', { src: e });
      if (has('oppApproach') && D.lastD != null && ((dashing && d < 170) || (d < 95 && D.lastD - d > 60 * dt && !e.airborne))) checkTraps(b, u, 'oppApproach', { src: e });
      D.lastD = d;
    } else if (e) D.lastD = dist(u, e);
    if (u.dead || b.over || D.lost || b.exodia) return;
    if (u.blocked('blocksAct') || u.action || u.pull || u.push || u.climb || u.inTrain) return;
    D.t += dt;
    if (D.phase === 'start') { if (D.t >= CFG.FIRST_DRAW) { D.phase = 'draw'; D.t = 0; } return; }
    if (D.phase === 'draw') {
      if (D.t < CFG.DRAW_DELAY) return;
      if (D.hand.length >= CFG.HAND_LIMIT) { reduceHand(b, u); D.t = CFG.DRAW_DELAY - 0.35; return; } // 패 한도: 먼저 1장 줄이고 다음 틱에 드로우
      D.turn++; draw(b, u, 1); if (D.lost || b.over) return;
      D.phase = 'main'; D.t = 0; D.plays = 0; D.monsters = 0;
      return;
    }
    if (D.phase === 'main') {
      if (D.t < (D.plays ? CFG.PLAY_GAP : 0.25)) return;
      let plan = null;
      if (D.plays < CFG.MAX_PLAYS && D.hand.length) {
        if (u.blocked('blocksSkill')) { if (!D.sealNote) { D.sealNote = true; b.text(u.x, u.y - 70, '봉인: 카드 사용 불가', '#a8a0ff', 9); } }
        else plan = AI.choose(b, u);
      }
      if (plan) { play(b, u, plan); D.plays++; D.t = 0; return; }
      D.phase = 'wait'; D.t = 0; D.trig = false; D.sealNote = false;
      return;
    }
    if (D.phase === 'wait') { if ((D.trig && D.t >= CFG.MIN_WAIT) || D.t >= CFG.WAIT_TIMEOUT) { D.phase = 'draw'; D.t = 0; } }
  }
  function updateEffects(b, u, dt) {
    const D = u.duel, e = b.enemy(u);
    for (const s of D.spirits) { // 몬스터 혼: 유희 옆에 떠서 상대 쪽을 향함
      s.t += dt;
      const side = e ? Math.sign(e.x - u.x) || 1 : u.facing;
      const tx = u.x + side * (s.big ? 34 : 26), ty = u.y - (s.big ? 62 : 44) + Math.sin(b.time * 3 + s.dur) * 3;
      s.x += (tx - s.x) * Math.min(1, dt * 7); s.y += (ty - s.y) * Math.min(1, dt * 7); s.face = side;
      if (s.rate) { s.shot -= dt; if (s.shot <= 0 && e && !e.dead && !b.over) { s.shot = s.rate; b.proj.push({ x: s.x, y: s.y, tgt: e, src: u, spd: 400, dmg: s.dmg, kind: s.kind, homing: true, life: 2.4, trail: 0, hit: { element: s.def.element || 'dark', delivery: 'ranged', cardDmg: true } }); } }
    }
    D.spirits = D.spirits.filter(s => s.t < s.dur && !u.dead);
    if (D.kuri && (D.kuri.t -= dt) <= 0) D.kuri = null;
    if (D.gardner && (D.gardner.t -= dt) <= 0) {
      const G = D.gardner; D.gardner = null;
      if (G.hp > 1 && e && !e.dead && !b.over) { b.streak(u.x, u.y - 18, e.x, e.y - 18, '#c8d0ff', 10, 0.3); b.damage(u, e, G.hp, { element: 'blunt', delivery: 'melee', sure: true, cardDmg: true, big: true }); sys(b, `빅 실드 가드너: 남은 내구도 ${Math.round(G.hp)} → 반격`); }
    }
    if (D.hats) {
      const H = D.hats; H.t -= dt; H.spin += dt * 1.6;
      if (H.t <= 0) { for (const o of H.items) D.grave.push(o.c); D.hats = null; sys(b, '실크햇 소멸 (카드는 묘지로)'); }
      else for (const f of b.foes(u)) { const h = H.items.find(h => { const p = hatPos(u, H, h); return Math.hypot(f.x - p.x, f.y - 18 - p.y) < 12 + f.pad; }); if (h) { revealHat(b, u, h, f); break; } }
    }
    if (D.magnet) {
      const M = D.magnet, t = M.tgt; M.t -= dt;
      if (M.t <= 0 || !t || t.dead) D.magnet = null;
      else {
        const dx = u.x - t.x, dy = u.y - t.y, d = Math.hypot(dx, dy) || 1;
        const mx = t.x - M.lx, my = t.y - M.ly; // 상대 이동 (저항 판정)
        if ((mx * -dx + my * -dy) / d > 0.5) M.strain = Math.min(4, M.strain + dt * 3);
        if (d > u.pad + t.pad + 14 && !t.airborne) { const p = b.clampPos(t.x + dx / d * 70 * dt, t.y + dy / d * 70 * dt, t.pad, t); t.x = p.x; t.y = p.y; }
        M.lx = t.x; M.ly = t.y;
        if ((M.tick -= dt) <= 0) { M.tick = 0.5; b.damage(u, t, M.dot * (1 + M.strain), { element: 'elec', dot: true, cardDmg: true }); b.zap(t.x, t.y - 18); }
      }
    }
    if (D.repel) {
      const R = D.repel, t = R.tgt; R.t -= dt;
      if (R.t <= 0 || !t || t.dead) D.repel = null;
      else { const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, min = u.pad + t.pad + 22; if (d < min && !t.airborne) { const p = b.clampPos(u.x + dx / d * min, u.y + dy / d * min, t.pad, t); t.x = p.x; t.y = p.y; if (t.action && ['dash', 'chase', 'charge'].includes(t.action.type)) t.action = null; } }
    }
    if (D.lsword) {
      const L = D.lsword; L.t -= dt;
      if (L.t <= 0) D.lsword = null;
      else for (const f of b.foes(u)) { const dx = f.x - L.x, dy = f.y - L.y, fa = Math.atan2(dy, dx), df = Math.abs(Math.atan2(Math.sin(fa - L.ang), Math.cos(fa - L.ang))); if (Math.hypot(dx, dy) < L.r && df < Math.PI / 2) b.applyStatus(f, 'lightSeal', 0.3, u); }
    }
  }
  function hazStep(b, dt) {
    if (!b.duelHaz) return;
    for (const H of b.duelHaz) {
      H.t += dt; H.tick -= dt;
      if (Math.random() < dt * 8) b.embers(H.x + rand(-H.r, H.r) * 0.6, H.y + rand(-H.r, H.r) * 0.3, '#ff8a3a', 1);
      if (H.tick <= 0) { H.tick = 0.5; for (const f of b.foes(H.u)) if (!f.airborne && Math.hypot(f.x - H.x, (f.y - H.y) / 0.7) < H.r + f.pad) b.damage(H.u, f, H.dmg, { element: 'fire', dot: true, cardDmg: true }); }
    }
    b.duelHaz = b.duelHaz.filter(H => H.t < H.dur);
  }

  // ---------------- 엔진 훅 ----------------
  STAGE_HOOKS.push({
    match: () => false,
    init(b) { b.exodia = null; b.duelFx = []; b.duelHaz = []; for (const u of b.u) if (u.def.duelist) setup(b, u); },
    on(b, ev, a, c, d, o) {
      let neg = false;
      if (ev === 'skill') {
        for (const u of b.u) if (u.duel && isFoe(u, a) && !u.dead) { u.duel.trig = true; if (!neg && checkTraps(b, u, 'oppSkill', { src: a, slot: c })) neg = true; }
      } else if (ev === 'attack') {
        if (c && c.duel && isFoe(c, a) && checkTraps(b, c, 'oppAttack', { src: a })) neg = true;
      } else if (ev === 'damaged') {
        if (c && c.duel && isFoe(c, a) && !(o && o.dot)) { c.duel.trig = true; checkTraps(b, c, 'damaged', { src: a, dmg: d, o }); }
      }
      return neg;
    },
    // 피해 직전 (game.js Battle.damage): true = 무효, 숫자 = 피해량 변경
    preDamage(b, src, tgt, amount, o) {
      if (b.exodia && tgt === b.exodia.u) return true;
      let amt = amount;
      if (src && src.duelWeak && src.duelWeak > b.time && isFoe(src, tgt) && !o.reflected) { src.duelWeak = 0; amt *= 0.5; b.text(src.x, src.y - 60, '오시리스: 위력 저하', '#ffe860', 8); }
      const D = tgt.duel; if (!D || !src || !isFoe(src, tgt) || o.reflected) return amt !== amount ? amt : undefined;
      if (checkTraps(b, tgt, 'oppHit', { src, amount: amt, o })) return true;
      if (D.hats) { const H = D.hats; const h = H.items.slice().sort((x, z) => { const p = hatPos(tgt, H, x), q = hatPos(tgt, H, z); return Math.hypot(src.x - p.x, src.y - p.y) - Math.hypot(src.x - q.x, src.y - q.y); })[0]; revealHat(b, tgt, h, src); return true; }
      if (o.basic && D.elfT > b.time) { b.text(tgt.x, tgt.y - 56, '엘프 검사: 막음', '#c8ffd0', 9); b.sparks(tgt.x, tgt.y - 18, '#c8ffd0', 8, 160); return true; }
      if (D.kuri) { D.kuri = null; b.text(tgt.x, tgt.y - 56, '크리보 기뢰화!', '#e8c890', 10); b.explosion(tgt.x + (src.x > tgt.x ? 14 : -14), tgt.y - 18, 18); return true; }
      if (D.repel && D.repel.tgt === src && o.delivery === 'melee') { b.text(tgt.x, tgt.y - 56, '반발!', '#ffd0a0', 9); return true; }
      if (D.gardner) { const G = D.gardner, ab = Math.min(G.hp, amt); G.hp -= ab; amt -= ab; b.sparks(tgt.x, tgt.y - 18, '#c8d0ff', 6, 140); if (G.hp <= 0.5) { D.gardner = null; b.text(tgt.x, tgt.y - 56, '방패 파괴', '#c8d0ff', 9); } if (amt <= 0.01) return true; }
      return amt !== amount ? amt : undefined;
    },
    step(b, dt) {
      for (const u of b.u) {
        if (!u.duel) continue;
        tick(b, u, dt);
        updateEffects(b, u, dt);
        checkExodia(b, u);
        for (const p of u.duel.pops) p.t += dt;
        u.duel.pops = u.duel.pops.filter(p => p.t < p.dur);
      }
      hazStep(b, dt);
      if (b.duelSpirits) { for (const s of b.duelSpirits) { s.t += dt; s.x = s.u.x + 24; s.y = s.u.y - 44; s.face = s.u.facing; } b.duelSpirits = b.duelSpirits.filter(s => s.t < s.dur); }
      if (b.duelPops) { for (const p of b.duelPops) p.t += dt; b.duelPops = b.duelPops.filter(p => p.t < p.dur); }
      if (b.duelFx) { for (const f of b.duelFx) f.t += dt; b.duelFx = b.duelFx.filter(f => f.t < f.dur); }
    },
    // 전투 정지 중: 연출(컷인)만 진행
    frozenStep(b, dt) {
      if (b.duelFx) { for (const f of b.duelFx) f.t += dt; b.duelFx = b.duelFx.filter(f => f.t < f.dur); }
    },
    drawUnder(ctx, b, preview) {
      if (preview || !b.duelHaz) return;
      for (const H of b.duelHaz) { const k = 1 - H.t / H.dur; ctx.save(); ctx.globalAlpha = 0.35 * Math.min(1, k * 3); ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.ellipse(H.x, H.y, H.r, H.r * 0.6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha *= 1.4; ctx.fillStyle = '#ffc05a'; ctx.beginPath(); ctx.ellipse(H.x, H.y, H.r * 0.5, H.r * 0.3, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      for (const u of b.u) if (u.duel && u.duel.lsword) drawLightSwords(ctx, b, u.duel.lsword);
    },
    drawOver(ctx, b) {
      for (const u of b.u) {
        if (!u.duel) continue;
        const D = u.duel;
        for (const s of D.spirits) drawSpirit(ctx, b, s);
        if (D.hats) for (const h of D.hats.items) { const p = hatPos(u, D.hats, h); drawHat(ctx, p.x, p.y, b.time); }
        if (D.kuri && !u.dead) { const x = u.x + Math.cos(b.time * 3) * 20, y = u.y - 30 + Math.sin(b.time * 6) * 3, sp = DuelSprites.get('kuriboh'); if (sp) { ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(sp.c, Math.round(x - sp.w / 2), Math.round(y - sp.h / 2)); ctx.restore(); } }
        if (D.gardner && !u.dead) { const G = D.gardner; ctx.save(); ctx.globalAlpha = 0.45 + 0.4 * G.hp / G.max; ctx.strokeStyle = '#c8d0ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u.x, u.y - 18, 22 + u.pad, -1.1, 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(u.x, u.y - 18, 22 + u.pad, Math.PI - 1.1, Math.PI + 1.1); ctx.stroke(); ctx.restore(); }
        if (D.magnet && D.magnet.tgt) { const t = D.magnet.tgt; ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(b.time * 20); ctx.strokeStyle = '#a0d8ff'; ctx.lineWidth = 1.5 + D.magnet.strain * 0.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(u.x, u.y - 18); ctx.lineTo(t.x, t.y - 18 - b.airZ(t)); ctx.stroke(); ctx.restore(); }
        if (D.repel && !u.dead) { ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ffd0a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.x, u.y - 14, u.pad + 30, 0, TAU); ctx.stroke(); ctx.restore(); }
        if (!u.dead) { const P = D.pops, n = P.length; P.forEach((p, i) => { if (n - 1 - i < 3) drawPop(ctx, b, u, p, n - 1 - i); }); }
      }
      if (b.duelSpirits) for (const s of b.duelSpirits) drawSpirit(ctx, b, s);
      if (b.duelPops) b.duelPops.forEach(p => drawPop(ctx, b, p.u, p, 0));
      if (b.duelFx) for (const f of b.duelFx) { if (f.type === 'fist') drawFist(ctx, f); else if (f.type === 'exodia') drawExodia(ctx, b, f); }
    },
  });

  // ---------------- 그리기 (필터/블러 없음, 스프라이트는 미리 렌더한 캔버스) ----------------
  function drawPop(ctx, b, u, p, i) {
    const k = p.t / p.dur, a = k < 0.12 ? k / 0.12 : k > 0.78 ? (1 - k) / 0.22 : 1;
    const x = Math.round(u.x), y = Math.round(u.y - 96 - u.pad * 2.2 - b.airZ(u) - k * 8 - i * 40);
    const fw = Math.min(1, p.t / 0.18), w = 16, h = 22;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(Math.max(0.08, fw), 1);
    ctx.fillStyle = '#0c0a12'; ctx.fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
    if (p.faceDown) {
      ctx.fillStyle = '#6a3a1c'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = '#d8a050'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, 4, 7, 0, 0, TAU); ctx.stroke();
    } else {
      ctx.fillStyle = TYPE_COL[p.def.type]; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#1a1424'; ctx.fillRect(-w / 2 + 2, -h / 2 + 3, w - 4, 11);
      const sp = p.def.sprite && DuelSprites.get(p.def.sprite);
      if (sp) { const sc = Math.min(12 / sp.w, 10 / sp.h); ctx.drawImage(sp.c, -sp.w * sc / 2, -h / 2 + 3.5, sp.w * sc, sp.h * sc); }
      else { ctx.fillStyle = p.def.type === 'spell' ? '#a8ffd0' : '#ffa8d8'; ctx.fillRect(-2, -h / 2 + 6, 4, 4); }
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-w / 2 + 2, h / 2 - 6, w - 4, 1); ctx.fillRect(-w / 2 + 2, h / 2 - 4, w - 6, 1);
      if (p.def.level) { ctx.fillStyle = '#ffcf40'; for (let s = 0; s < Math.min(6, Math.ceil(p.def.level / 2)); s++) ctx.fillRect(-w / 2 + 2 + s * 2, -h / 2 + 1, 1, 1); }
    }
    ctx.restore();
    if (p.faceDown && !p.sub) return;
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = 'bold 8px "Galmuri11", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,8,18,0.9)';
    const t = (p.sub ? p.sub + ' ' : '') + (p.faceDown ? '' : p.def.name);
    ctx.strokeText(t, x, y + 18); ctx.fillStyle = p.def.type === 'trap' ? '#ffb8e0' : p.def.type === 'spell' ? '#b8ffd8' : '#ffe0a8'; ctx.fillText(t, x, y + 18);
    if (p.line && i === 0) { ctx.font = 'bold 9px "Galmuri11", "Malgun Gothic", sans-serif'; ctx.strokeText(p.line, x, y - 18); ctx.fillStyle = '#fff6c0'; ctx.fillText(p.line, x, y - 18); }
    ctx.restore();
  }
  function drawSpirit(ctx, b, s) {
    const k = s.t / s.dur, a = (k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1);
    const sp = s.spr && DuelSprites.get(s.spr);
    ctx.save(); ctx.globalAlpha = a * 0.92; ctx.translate(Math.round(s.x), Math.round(s.y + (1 - Math.min(1, k * 5)) * 8));
    ctx.fillStyle = 'rgba(255,236,190,0.22)'; ctx.beginPath(); ctx.ellipse(0, 4, s.big ? 30 : 18, s.big ? 10 : 6, 0, 0, TAU); ctx.fill();
    if (sp) {
      const sc = sp.s, w = sp.w * sc, h = sp.h * sc; let f = (s.face || 1) < 0 ? -1 : 1; if (s.flip) f = -f;
      const lunge = k > 0.25 && k < 0.45 ? Math.sin((k - 0.25) / 0.2 * Math.PI) * 6 : 0; // 공격 동작
      ctx.scale(f, 1); ctx.drawImage(sp.c, Math.round(-w / 2 + lunge), Math.round(-h + 6), w, h);
    } else { ctx.fillStyle = '#fff0d0'; ctx.fillRect(-4, -12, 8, 12); }
    ctx.restore();
  }
  function drawHat(ctx, x, y, t) {
    x = Math.round(x); y = Math.round(y + Math.sin(t * 5 + x) * 1.5);
    ctx.fillStyle = '#0c0a12'; ctx.fillRect(x - 9, y + 2, 18, 3); ctx.fillRect(x - 6, y - 11, 12, 14);
    ctx.fillStyle = '#3a2a6a'; ctx.fillRect(x - 8, y + 2, 16, 2); ctx.fillRect(x - 5, y - 10, 10, 12);
    ctx.fillStyle = '#ffd040'; ctx.fillRect(x - 5, y - 2, 10, 2); ctx.fillStyle = '#8a70d0'; ctx.fillRect(x - 4, y - 9, 2, 6);
  }
  function drawLightSwords(ctx, b, L) {
    const k = L.t / L.dur, a = Math.min(1, (L.dur - L.t) * 4, L.t * 2);
    ctx.save(); ctx.globalAlpha = 0.14 * a; ctx.fillStyle = '#fff4b0';
    ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.arc(L.x, L.y, L.r, L.ang - Math.PI / 2, L.ang + Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#fff4b0'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalAlpha = a;
    for (let i = -1; i <= 1; i++) {
      const an = L.ang + i * 0.7, x = Math.round(L.x + Math.cos(an) * L.r * 0.7), drop = k > 0.9 ? (1 - (k - 0.9) / 0.1) * 40 : 0, y = Math.round(L.y + Math.sin(an) * L.r * 0.7 * 0.7 - drop);
      ctx.fillStyle = '#fffbe0'; ctx.fillRect(x - 1, y - 26, 3, 24); ctx.fillStyle = '#ffd040'; ctx.fillRect(x - 4, y - 4, 9, 2); ctx.fillRect(x, y - 2, 1, 4);
      ctx.fillStyle = 'rgba(255,244,176,0.35)'; ctx.fillRect(x - 3, y - 28, 7, 28);
    }
    ctx.restore();
  }
  function drawFist(ctx, f) {
    const k = f.t / f.dur, fall = Math.min(1, k / 0.6), y = f.y - 22 - (1 - fall * fall) * 220, a = k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(Math.round(f.x), Math.round(y));
    ctx.fillStyle = '#1a2440'; ctx.fillRect(-20, -34, 40, 38); ctx.fillStyle = '#3a5ab0'; ctx.fillRect(-18, -32, 36, 34);
    ctx.fillStyle = '#5a7ad8'; for (let i = 0; i < 4; i++) ctx.fillRect(-16 + i * 9, -4, 7, 6);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(-18, -40, 36, 6); ctx.fillStyle = '#2a3a70'; ctx.fillRect(-12, -80, 24, 40);
    ctx.restore();
  }
  function drawExodia(ctx, b, f) {
    const k = f.t / f.dur, u = f.u, a = Math.min(1, k * 3) * (k > 0.85 ? (1 - k) / 0.15 : 1);
    ctx.save(); ctx.globalAlpha = 0.45 * a; ctx.fillStyle = '#1a0c00'; ctx.fillRect(0, 0, 360, 640);
    ctx.globalAlpha = a;
    const sp = DuelSprites.get('exodia');
    if (sp) { const sc = 5, w = sp.w * sc, h = sp.h * sc, rise = (1 - Math.min(1, k * 2.2)) * 120; ctx.drawImage(sp.c, Math.round(u.x - w / 2), Math.round(u.y - h - 10 + rise), w, h); }
    const sa = DuelSprites.get('exArm'); if (sa && k > 0.3) { const sc = 4; ctx.drawImage(sa.c, Math.round(u.x - 70 - sa.w * sc / 2), Math.round(u.y - 110), sa.w * sc, sa.h * sc); ctx.save(); ctx.scale(-1, 1); ctx.drawImage(sa.c, Math.round(-(u.x + 70) - sa.w * sc / 2), Math.round(u.y - 110), sa.w * sc, sa.h * sc); ctx.restore(); }
    ctx.font = 'bold 15px "Galmuri11", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#2a1000';
    ctx.strokeText('엑조디아 완성!', 180, 150); ctx.fillStyle = '#ffd040'; ctx.fillText('엑조디아 완성!', 180, 150);
    if (k > 0.45) { ctx.font = 'bold 11px "Galmuri11", "Malgun Gothic", sans-serif'; ctx.strokeText('분노의 업화 엑조드 파이어!', 180, 172); ctx.fillStyle = '#ffb060'; ctx.fillText('분노의 업화 엑조드 파이어!', 180, 172); }
    ctx.restore();
  }

  // ---------------- HUD ----------------
  (window.HUD_EXT = window.HUD_EXT || []).push({
    init(u, f) {
      if (!u.duel) return;
      const el = document.createElement('div'); el.className = 'duelhud';
      el.innerHTML = `<span class="dk" title="패">패<b class="h">0</b></span><span class="dk" title="덱">덱<b class="d">0</b></span><span class="dk" title="묘지">묘<b class="g">0</b></span><span class="tr" title="세트 함정"><i></i><i></i><i></i></span><span class="ex" title="패의 엑조디아 부위">엑<b class="x">0</b>/5</span>`;
      f.querySelector('.info').appendChild(el); u.duelHud = { el, key: '' };
    },
    update(u) {
      const H = u.duelHud, D = u.duel; if (!H || !D) return;
      const px = D.hand.filter(c => piece(c.def)).length;
      const key = `${D.hand.length}|${D.deck.length}|${D.grave.length}|${D.traps.length}|${D.phase}|${px}`;
      if (key === H.key) return; H.key = key;
      H.el.querySelector('.h').textContent = D.hand.length;
      const dk = H.el.querySelector('.d'); dk.textContent = D.deck.length; dk.classList.toggle('low', D.deck.length <= 5);
      H.el.querySelector('.g').textContent = D.grave.length;
      H.el.querySelectorAll('.tr i').forEach((x, i) => x.classList.toggle('on', i < D.traps.length));
      H.el.querySelector('.tr').classList.toggle('full', D.traps.length >= CFG.TRAP_SLOTS);
      H.el.querySelector('.x').textContent = px; H.el.querySelector('.ex').classList.toggle('hot', px >= 3);
      H.el.classList.toggle('wait', D.phase === 'wait');
    },
  });

  // ---------------- 패스트푸드점: 듀얼리스트 손님 스킬 ----------------
  SKILLS.duelCard = {
    desc: '(패스트푸드점 배달 전용) 듀얼리스트가 받으면 안전 드로우 1장(덱이 0장이면 무시), 다른 캐릭터가 받으면 무작위 카드 1장의 효과를 발동합니다.',
    canUse: () => false,
    use(u, e, b) {
      if (u.duel) { if (!draw(b, u, 1, { safe: true })) b.text(u.x, u.y - 70, '덱이 비어 있음', '#c8c8d8', 9); return; }
      const pool = Object.values(CARD_DEFS).filter(c => c.type !== 'trap' && !c.test && c.borrowable !== false && c.effect);
      const c = pool[Math.floor(Math.random() * pool.length)]; if (!c) return;
      popup(b, u, c, false, null, shoutOf(c));
      if (c.sprite) spawnSpirit(b, u, c, CFG.SPIRIT_DUR);
      const ctx = makeCtx(b, u, { uid: 0, id: c.id, def: c }, null, { depth: 2 });
      try { c.effect(ctx); } catch (err) { console.warn('[duel] borrowed card failed', c.id, err); }
    },
  };

  function describe(c) {
    const D = c.duelist, n = Array.isArray(D.deck) ? D.deck.length : Object.values(D.deck).reduce((s, v) => s + v, 0);
    return `<div class="skills"><div class="sh">듀얼리스트 · LP ${CFG.LP} · 덱 ${n}장</div>
      <div class="skill">드로우 → 카드 사용 → 피격/상대 스킬까지 대기를 반복. 덱 0장에서 드로우하면 패배.<br>
      몬스터 Lv5~6 릴리스1 / Lv7~8 릴리스2 / Lv9+ 릴리스3 · 함정 최대 3장(세트마다 감속, 3장이면 마법 봉쇄)<br>
      <b style="color:#ffd040">봉인된 엑조디아 5장이 패에 모이면 즉시 승리</b><br>
      <span style="color:#a8a0c0">받는 피해 ×${CFG.LP_SCALE.toFixed(2)} (LP 환산) · 카드 피해 = ATK×${CFG.ATK_SCALE}</span></div></div>`;
  }

  // ---------------- 디버그 하네스 (테스트용) ----------------
  const debug = {
    give(u, id) { const c = inst(id); if (c && u.duel) u.duel.hand.push(c); return c; },
    // 카드 1장 강제 발동: 몬스터/마법은 효과, 함정은 세트 후 이벤트 강제 (ev 생략 시 기본 이벤트)
    force(b, u, id, ev) {
      const D = u.duel, c = inst(id); if (!c || !D) return false;
      if (c.def.type === 'trap') { D.grave.push(c); return activateTrap(b, u, c, ev || { src: b.enemy(u), amount: 40, dmg: 150 }, '강제'); }
      D.hand.push(c); play(b, u, { inst: c, tributes: [] }); return true;
    },
    exodia(u) { for (const id of EXO) { const D = u.duel; [D.deck, D.grave].forEach(z => { const i = z.findIndex(c => c.id === id); if (i >= 0) z.splice(i, 1); }); if (!D.hand.some(c => c.id === id)) D.hand.push(inst(id)); } },
  };

  window.DUEL = { CFG, AI, makeCtx, draw, deckOut, situation, play, useMonster, checkTraps, activateTrap, reduceHand, describe, buildDeck, tribNeed, TYPE_COL, debug, testDeckSize: null };

  // ---------------- 유희 ----------------
  const FACES_Y = { front: 'right', back: 'left' };
  CHARACTERS.push({
    id: 'yugi', name: '유희', gender: 'male', color: '#8a5ad8',
    stats: { hp: 4000, atk: 20, spd: 245, range: 110, atkRate: 0.75, def: 0 },
    attack: { element: 'dark', delivery: 'ranged' }, projectile: 'magic',
    duelist: { deck: YUGI_DECK },
    skills: [{ id: 'duelCard', name: '듀얼리스트의 카드', cd: 1e9, hidden: true, canUse: () => false }],
    sprite: { src: 'assets/yugi/front.png', back: 'assets/yugi/back.png', scale: 0.5, foot: 2, faces: FACES_Y },
    portrait: 'assets/yugi/portrait.png',
    lines: {
      skill: {},
      event: {
        battleStart: ['듀얼!', '자, 게임을 시작하지!', '내 턴! 드로우!'],
        draw: ['내 턴! 드로우!', '카드여, 응답해 줘!', '이 카드에 모든 걸 건다!', '덱을 믿는다!'],
        deckLow: ['덱이 얼마 남지 않았어…', '남은 카드를 믿을 수밖에!'],
        trapSet: ['카드를 1장 세트하고 턴 엔드.', '이 카드에 걸었다!'],
        trapFlip: ['걸려들었군! 함정 카드 발동!', '리버스 카드 오픈!'],
        summonBig: ['나와라, 나의 최강의 하인!', '어둠의 힘이여!'],
        summonGod: ['신의 카드 소환!', '보아라, 이게 신의 힘이다!'],
        exodia: ['봉인된 다섯 장의 카드가 모였다!', '엑조디아, 봉인을 풀어라!'],
        lowHp: ['아직 라이프는 남아 있다!', '마지막까지 덱을 믿겠어!'],
        win: ['이 듀얼, 나의 승리다!', '결속의 힘이 이겼다!'], lose: ['내… 라이프가…', '아직… 끝나지 않았어…'],
      },
      cd: { draw: 7, deckLow: 15, trapSet: 6, trapFlip: 4, summonBig: 5, summonGod: 4 },
    },
  });
})();
