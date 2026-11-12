/**
 * 디오 브란도 (죠죠의 기묘한 모험 1부 보스) — 흡혈귀. 근접 맨손 평타
 *  1. 기화 냉동법      : '빈약! 빈약! 빈약!' 주변(반경 70) 상대를 빙결. 공중에 떠 있던 상대는 그 높이에 얼어붙은 채 매달림 → 얼음 쪼개기로 이어짐
 *  2. 얼음 쪼개기      : 공중에 얼린 상대에게만. '가장 잔혹한 죽음을 선사해주마!' 빙결 해제 + 방어 무시 피해 → 상대는 앞·뒷모습을 번갈아 보이며 빙글빙글 돌아 무작위 위치로 떨어짐
 *  3. 몽키 점프        : 근접 상대가 곧 공격할 것 같으면 상대를 뛰어넘어 뒤로 착지(공중 = 근접 회피). 'Monkey가 인간을 따라잡을 수 있나~?!' / '너는 이 디오에게는 몽키란 말이다! (이름 장음)~!!'
 *  4. 재생 (패시브)    : 받은 피해의 절반을 재생 저장량에 쌓아 천천히 회복. 해로운 상태이상 중엔 멈추고, 풀리면 다시 회복
 *  5. 공열안자경       : 자기 체력을 조금 깎고 눈에서 체액 광선(직선)을 쏨. 지나가며 상대의 일반 투사체를 상쇄
 *  6. 흡혈귀의 액기스  : 상대 소환수(스탠드·체력 공유·구조물 소환은 제외) 하나를 디오 편 시생인으로. 시생인은 체력이 계속 줄어 죽고, 기본 공격이 맞으면 조금 회복.
 *                        디오가 쓰러져도 시생인이 남아 있으면 경기가 끝나지 않음
 *  7. WRRRYYYYY!       : 상대에게 몸통 박치기(시전 순간 방향 직진) → 평소보다 훨씬 멀리 밀림. 밀리다 벽·장애물에 부딪히면 반동으로 디오 쪽으로 날아옴(공중) → 기화 냉동법 연계
 *  난수는 전부 Math.random (전투 중 시드 난수). 그리기 코드는 난수·전투 값을 바꾸지 않음 (b.time 기반 흔들림만)
 */
(() => {
  const TAU = Math.PI * 2, ID = 'dio', GOLD = '#ffd84a', ICE = '#bfefff', BLOOD = '#c8203a';
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const foeOf = (b, u) => { const L = b.u.filter(o => o.team !== u.team && !o.summon && !o.dead); if (!L.length) return b.enemy(u); let m = L[0]; for (const o of L) if (dist(u, o) < dist(u, m)) m = o; return m; };
  const isDio = u => !!(u && u.def && u.def.id === ID);
  const slotOf = (u, id) => u.skills.findIndex(s => s.id === id);
  const D = {
    freeze: { r: 70, airR: 150, dur: 1.0, airDur: 2.6, splitDelay: 0.9 }, // splitDelay: 공중 빙결 뒤 얼음 쪼개기까지 뜸 (초)
    split: { mult: 2.2, fly: 1.0, h: 48, near: 90, far: 210 },
    monkey: { dur: 0.55, h: 44, over: 46 },
    regen: { k: 0.5, rate: 0.06, min: 3, tick: 0.5 },
    ripper: { cost: 0.04, spd: 950, life: 0.45, mult: 1.2, r: 10 },
    extract: { range: 220, decay: 0.06, heal: 0.04 },
    wry: { spd: 700, len: 220, mult: 1.2, push: 780, pushT: 0.6, back: 0.75, backH: 40 },
  };
  const harmful = u => u.statuses.some(s => { const d = STATUS_DEFS[s.id]; return d && !d.positive; });
  function voice(b, u, txt, color, size) { b.hooks.onVoice && b.hooks.onVoice(u, txt, null); if (color) b.text(u.x, u.y - 74 - u.pad * 2, txt.length > 14 ? txt.slice(0, 13) + '…' : txt, color, size || 9); }
  // 이름 장음: 마지막 글자의 모음을 두 번 더 ('오쿠야스' → '오쿠야스으으')
  const longName = s => { const c = s.charCodeAt(s.length - 1); if (c < 0xAC00 || c > 0xD7A3) return s + '~'; const v = Math.floor((c - 0xAC00) / 28) % 21, ch = String.fromCharCode(0xAC00 + (11 * 21 + v) * 28); return s + ch + ch; };

  STATUS_DEFS.dioFrozen = { name: '빙결', color: '#9fe0ff', tint: ICE, tintA: 0.5, particle: '#e8faff', blocksMove: true, blocksAct: true, onApply(u) { u.action = null; } };

  // ---------- 재생 (패시브) · 시생인 · 액기스 훅 ----------
  const oDmg = Battle.prototype.damage;
  Battle.prototype.damage = function (src, tgt, amt, o = {}) {
    const r = oDmg.call(this, src, tgt, amt, o);
    if (r > 0 && isDio(tgt) && !tgt.dead) tgt.dioRegen = (tgt.dioRegen || 0) + r * D.regen.k;
    if (r > 0 && src && src.dioZombie && o.basic && !src.dead) { const h = Math.round(src.maxHp * D.extract.heal); src.hp = Math.min(src.maxHp, src.hp + h); this.text(src.x, src.y - 46, '+' + h, '#c88aff', 8); }
    return r;
  };
  // 디오가 쓰러져도 시생인이 남아 있으면 팀은 살아 있음
  const oTA = Battle.prototype.teamAlive; Battle.prototype.teamAlive = function (t) { return oTA.call(this, t) || this.u.some(o => o.team === t && !o.dead && o.dioZombie); };
  // 쓰러짐 처리: 구울즈 엔진 패치는 본체가 쓰러지면 같은 팀 소환수도 모두 쓰러뜨림 → 시생인은 예외(살려 둠).
  //  시생인이 쓰러져 디오 팀에 아무도 남지 않으면 그때 경기 종료 (소환수 쓰러짐은 원래 승패 판정을 하지 않음)
  const oKill = Battle.prototype.kill; Battle.prototype.kill = function (tgt, src) {
    const Z = this.u.filter(o => o.dioZombie && !o.dead && o !== tgt && o.team === tgt.team);
    const r = oKill.call(this, tgt, src);
    if (Z.length && !this.over) for (const z of Z) if (z.dead && z.hp > 0) { z.dead = false; z.deadT = 0; z.summon.ended = false; }
    if (tgt.dioZombie && tgt.dead && !this.over && !this.teamAlive(tgt.team)) { // 마지막 시생인 → 디오 팀 패배
      const t = 1 - tgt.team; this.over = true; this.winner = this.teamBest(t);
      if (this.winner) { this.finishImpact && this.finishImpact(tgt, this.winner); this.say(this.winner, 'win'); }
      this.hooks.onSystem && this.hooks.onSystem('마지막 시생인이 쓰러졌습니다!');
    }
    return r;
  };
  const convertible = (s, u) => s && s.summon && !s.dead && s.team !== u.team && !s.dioZombie && !s.def.noDraw && !s.summon.okHand && !s.summon.jjSW && !s.summon.lm && !s.gWall && !s.def.partner && (s.st.atk || 0) > 0;

  // ---------- 스킬 ----------
  // 1. 기화 냉동법
  SKILLS.dioFreeze = { desc: "'빈약! 빈약! 빈약!' 주변(반경 70) 상대를 1.4초 빙결(이동·행동 불가). 공중에 떠 있던 상대(반경 150)는 그 높이에 얼어붙은 채 2.6초 매달려 있고, 0.9초 뜸을 들인 뒤 얼음 쪼개기로 이어집니다.",
    canUse: (u, e, d, b) => b.foes(u).some(o => !o.hidden && !o.summon && !o.status('dioFrozen') && (o.airborne ? dist(u, o) < D.freeze.airR + o.pad : dist(u, o) < D.freeze.r + o.pad + u.pad)),
    use(u, e0, b, s) { const F = { ...D.freeze, ...s }; let air = false;
      voice(b, u, '빈약! 빈약! 빈약!', ICE, 11);
      b.ring(u.x, u.y - 10, 6, F.r + 20, 0.45, ICE); b.shock(u.x, u.y - 10, 4, F.r, '#e8faff', 0.4, 3);
      for (let i = 0; i < 16; i++) { const a = rand(0, TAU), sp = rand(40, 110); b.parts.push({ x: u.x, y: u.y - 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, life: 0.5, max: 0.5, color: i % 2 ? ICE : '#ffffff', size: 2, glow: true }); }
      for (const o of b.foes(u)) { if (o.hidden || o.summon && !o.dioZombie && o.def.noDraw) continue;
        if (o.airborne && dist(u, o) < F.airR + o.pad) { // 공중 빙결: 그 높이에 매달림 (착지 충격 없음)
          const z = b.airZ(o); o.air = { t: 0.5, dur: 1, h: Math.max(18, z), noLand: true, dioIce: true }; o.push = null; if (o.bladeRide) { o.bladeRide = null; o.buffs = o.buffs.filter(q => q.type !== 'bladeRideSpd'); } // 높이 고정은 훅에서 (빙결이 풀리면 0.5초 동안 내려옴)
          b.applyStatus(o, 'dioFrozen', F.airDur, u, { noResistScale: true }); o.dioIceAir = true; air = true;
          b.text(o.x, o.y - 80 - z, '공중 빙결!', ICE, 11); b.stats.dioAirFreeze = (b.stats.dioAirFreeze || 0) + 1; }
        else if (!o.airborne && dist(u, o) < F.r + o.pad + u.pad) { b.applyStatus(o, 'dioFrozen', F.dur, u); b.stats.dioFreeze = (b.stats.dioFreeze || 0) + 1; } }
      if (air) { const i = slotOf(u, 'dioSplit'); if (i >= 0) u.skillT[i] = D.freeze.splitDelay; } // 공중 빙결 → 얼어붙은 모습을 잠깐 보여 준 뒤 얼음 쪼개기
    } };

  // 2. 얼음 쪼개기
  const iceAir = o => o && !o.dead && o.dioIceAir && o.status('dioFrozen') && o.air;
  SKILLS.dioSplit = { desc: "공중에 얼린 상대에게만. '가장 잔혹한 죽음을 선사해주마!' 빙결을 풀며 방어를 무시한 ATK×2.2 피해 → 상대는 앞·뒷모습을 번갈아 보이며 빙글빙글 돌아 1초 동안 무작위 위치(90~210px 떨어진 곳)로 떨어집니다.",
    canUse: (u, e, d, b) => b.foes(u).some(o => iceAir(o) && dist(u, o) < 260),
    use(u, e0, b, s) { const S = { ...D.split, ...s }, o = b.foes(u).filter(iceAir).sort((a, c) => dist(u, a) - dist(u, c))[0]; if (!o) return;
      voice(b, u, '가장 잔혹한 죽음을 선사해주마!', '#ff8a9a', 10);
      o.statuses = o.statuses.filter(x => x.id !== 'dioFrozen'); o.dioIceAir = false; const z = b.airZ(o);
      for (let i = 0; i < 22; i++) { const a = rand(0, TAU), sp = rand(50, 160); b.parts.push({ x: o.x, y: o.y - 20 - z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 280, life: rand(0.4, 0.8), max: 0.8, color: i % 3 ? ICE : '#ffffff', size: rand(1.5, 3) }); }
      b.shock(o.x, o.y - 20 - z, 6, 46, ICE, 0.4, 5); b.hitstop(0.1); b.shake(3);
      b.damage(u, o, u.st.atk * S.mult, { element: 'ice', delivery: 'melee', pierce: 1, big: true, noCrit: true, color: ICE });
      if (o.dead) return;
      let x1 = o.x, y1 = o.y; for (let k = 0; k < 8; k++) { const a = rand(0, TAU), r = rand(S.near, S.far), q = b.clampPos(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, o.pad, o); if (!b.blockAt(q.x, q.y - 4, 11 + o.pad)) { x1 = q.x; y1 = q.y; break; } }
      o.air = { t: 0, dur: S.fly, h: S.h, spin: true, dioFall: true, fling: { x0: o.x, y0: o.y, x1, y1 } }; o.action = null; o.push = null;
      b.text(o.x, o.y - 90, '쪼개기!', ICE, 12); b.stats.dioSplit = (b.stats.dioSplit || 0) + 1;
    } };

  // 3. 몽키 점프
  const meleeThreat = (b, u) => { for (const o of b.foes(u)) { if (o.hidden || o.summon || o.airborne || o.blocked('blocksAct')) continue; const d = dist(u, o), mel = o.st.range < MELEE_RANGE && !o.def.rangedBasic;
    const dash = o.action && ['dash', 'chase', 'charge', 'combo', 'jjCoward', 'jjRun', 'okBarrage', 'jsRestore'].includes(o.action.type);
    if ((mel && d < o.reach + 22 && o.atkT < 0.3) || (dash && d < 120)) return o; } return null; };
  SKILLS.dioMonkey = { desc: "근접 상대가 곧 공격하거나 돌진해 오면 상대를 뛰어넘어 뒤쪽에 착지합니다(0.55초 공중 = 근접 공격 회피). 'Monkey가 인간을 따라잡을 수 있나~?!' '너는 이 디오에게는 몽키란 말이다! (상대 이름 장음)~!!'",
    canUse: (u, e, d, b) => !u.airborne && !!meleeThreat(b, u),
    use(u, e0, b, s) { const M = { ...D.monkey, ...s }, o = meleeThreat(b, u) || foeOf(b, u); if (!o) return;
      const a = angTo(u, o), dd = dist(u, o) + M.over, q = b.clampPos(u.x + Math.cos(a) * dd, u.y + Math.sin(a) * dd, u.pad, u);
      u.action = null; u.air = { t: 0, dur: M.dur, h: M.h, noLand: true, fling: { x0: u.x, y0: u.y, x1: q.x, y1: q.y } };
      voice(b, u, 'Monkey가 인간을 따라잡을 수 있나~?!', GOLD, 9);
      const nm = o.def.name; b.later(0.45, () => { if (!u.dead && !b.over) voice(b, u, `너는 이 디오에게는 몽키란 말이다! ${longName(nm)}~!!`, '#ffb070', 9); });
      b.stats.dioMonkey = (b.stats.dioMonkey || 0) + 1;
    } };

  // 5. 공열안자경
  function drawRipper(ctx, p) { const a = Math.atan2(p.vy, p.vx), L = 26; ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(a);
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#ffffff'; ctx.fillRect(-L, -3, L + 4, 6); ctx.globalAlpha = 1; ctx.fillStyle = '#e8f4ff'; ctx.fillRect(-L, -1, L + 6, 1); ctx.fillRect(-L, 2, L + 6, 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(2, -2, 4, 5); }
  SKILLS.dioRipper = { desc: '자기 체력을 최대 체력의 4% 깎고(재생 저장량에도 쌓임) 눈에서 체액 광선을 직선으로 쏩니다(ATK×1.5, 950px/s). 지나가며 닿은 상대의 일반 투사체를 상쇄합니다. 날아오는 투사체가 있으면 막는 용도로도 씁니다.',
    canUse: (u, e, d, b) => e && !e.dead && u.hp > u.maxHp * 0.15 && ((d > 90 && d < 400) || b.proj.some(p => p.src && p.src.team !== u.team && p.life > 0 && Math.hypot(p.x - u.x, p.y - u.y + 18) < 160)),
    use(u, e0, b, s) { const R = { ...D.ripper, ...s }, e = foeOf(b, u); if (!e) return; const cost = Math.round(u.maxHp * R.cost);
      u.hp = Math.max(1, u.hp - cost); u.dioRegen = (u.dioRegen || 0) + cost * D.regen.k; b.text(u.x + 8, u.y - 46, '-' + cost, '#ff9aa8', 9);
      voice(b, u, '공열안자경!', '#e8f4ff', 10);
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      b.proj.push({ x: u.x + Math.cos(a) * 8, y: u.y - 30, vx: Math.cos(a) * R.spd, vy: Math.sin(a) * R.spd, spd: R.spd, src: u, dmg: u.st.atk * R.mult, kind: 'dioRipper', homing: false, life: R.life, trail: 0, r: R.r, cancel: true, noReflect: true, draw: drawRipper,
        hit: { element: 'slash', delivery: 'ranged', pierce: 0.3, color: '#e8f4ff' } });
      b.ring(u.x, u.y - 30, 2, 12, 0.2, '#ffffff'); playSfx('shot'); b.stats.dioRipper = (b.stats.dioRipper || 0) + 1;
    } };

  // 6. 흡혈귀의 액기스
  SKILLS.dioExtract = { desc: '거리 220 안의 상대 소환수 하나를 디오 편 시생인으로 만듭니다(스탠드·체력 공유·구조물·2인 팀 동료 제외). 시생인은 초당 최대 체력 6%씩 줄어 죽고, 기본 공격이 맞으면 최대 체력 4% 회복. 디오가 쓰러져도 시생인이 남아 있으면 경기가 끝나지 않습니다.',
    canUse: (u, e, d, b) => b.u.some(s => convertible(s, u) && dist(u, s) < D.extract.range),
    use(u, e0, b, sl) { const L = b.u.filter(s => convertible(s, u) && dist(u, s) < D.extract.range).sort((a, c) => dist(u, a) - dist(u, c)); const s = L[0]; if (!s) return;
      voice(b, u, '흡혈귀의 액기스를 받아라!', BLOOD, 10);
      const old = s.summon.owner; s.team = u.team; s.dioZombie = { master: u, t0: b.time }; s.summon.owner = s; s.summon.t = 1e9; s.summon.step = null; s.summon.onEnd = null; s.tgtU = null; s.gTaunt = null;
      s.statuses = []; s.action = null; s.atkT = Math.min(s.atkT, 0.5); if (!s.st.atkRate) s.st.atkRate = 0.8;
      for (const o of b.u) if (o.tgtU === s) o.tgtU = null;
      b.streak(u.x, u.y - 20, s.x, s.y - 20, BLOOD, 6, 0.3); b.glow(s.x, s.y - 18, 30, '#a040c8', 0.5); b.text(s.x, s.y - 66, '시생인!', '#c88aff', 11);
      b.hooks.onSystem && b.hooks.onSystem(`디오: ${s.def.name} → 시생인`); b.stats.dioZombie = (b.stats.dioZombie || 0) + 1; void old;
    } };

  // 7. WRRRYYYYY!
  SKILLS.dioWry = { desc: "'WRRRYYYYY!' 시전 순간 상대 방향으로 몸통 박치기(700px/s, 최대 220px, ATK×1.2). 맞은 상대는 평소보다 훨씬 멀리(780px/s, 0.6초) 밀리고, 벽·장애물에 부딪히면 반동으로 0.75초 동안 디오 바로 앞까지 날아옵니다(공중) → 기화 냉동법·얼음 쪼개기 연계.",
    canUse: (u, e, d) => e && !e.dead && !e.airborne && d > 40 && d < 230,
    use(u, e0, b, s) { const W = { ...D.wry, ...s }, e = foeOf(b, u); if (!e) return; const ang = angTo(u, e); let go = 0, hit = false;
      voice(b, u, 'WRRRYYYYY!', '#ff6a6a', 13); u.facing = Math.cos(ang) >= 0 ? 1 : -1;
      u.action = { type: 'dioWry', trail: '#ff8a8a', step(dt) {
        const st = W.spd * dt, px = u.x + Math.cos(ang) * st, py = u.y + Math.sin(ang) * st, q = b.clampPos(px, py, u.pad, u);
        const blocked = Math.abs(q.x - px) > 0.3 || Math.abs(q.y - py) > 0.3 || b.blockAt(px, py - 4, 9 + u.pad);
        if (!blocked) { u.x = px; u.y = py; go += st; u.walk += dt * 30; }
        if (!hit) for (const o of b.foes(u)) { if (o.hidden || o.airborne || dist(u, o) > 15 * (u.size + o.size) + 8) continue; hit = true;
          b.damage(u, o, u.st.atk * W.mult, { element: 'blunt', delivery: 'melee', big: true, color: '#ffc8c8' }); b.shock(o.x, o.y - 18, 5, 34, '#ff8a8a', 0.3, 4); b.hitstop(0.06);
          if (!o.dead) b.knockback(o, ang, W.push, W.pushT, () => { // 벽 반동: 디오 바로 앞까지 날아옴
            if (o.dead || b.over || u.dead) return; const a2 = angTo(u, o), q2 = b.clampPos(u.x + Math.cos(a2) * 34, u.y + Math.sin(a2) * 34, o.pad, o);
            b.damage(u, o, u.st.atk * 0.3, { element: 'blunt', delivery: 'melee', noCrit: true, color: '#ffd8d8' });
            if (o.dead) return; o.air = { t: 0, dur: W.back, h: W.backH, noLand: true, dioBack: true, fling: { x0: o.x, y0: o.y, x1: q2.x, y1: q2.y } };
            b.text(o.x, o.y - 70, '반동!', '#ffb0b0', 11); b.shake(2); b.stats.dioWryBack = (b.stats.dioWryBack || 0) + 1;
            const i = slotOf(u, 'dioFreeze'); if (i >= 0 && u.skillT[i] > 0.6) u.skillT[i] = Math.min(u.skillT[i], 0.6); }); // 날아오는 상대를 얼릴 수 있게
          b.stats.dioWry = (b.stats.dioWry || 0) + 1; break; }
        if (hit || blocked || go >= W.len) { u.action = null; u.dir = fixAngle(ang + Math.PI + rand(-0.6, 0.6)); }
      } };
    } };

  // 시생인의 스테이지 진행 값(레이싱 랩·축구/패스트푸드 AI 등): 소환수는 원래 주인에게서 복사받는데, 시생인은 주인이 자기 자신이라
  //  스테이지가 바뀌면(구울즈·아오오니 문) 비어 있을 수 있음 → 다른 스테이지 훅보다 먼저 디오(없으면 기본값)에게서 채움
  const ZKEYS = ['lap', 'socAI', 'ffAI', 'ffFood', 'ffWall', 'hpPrev'];
  STAGE_HOOKS.unshift({ match: () => false, step(b) {
    for (const z of b.u) { if (!z.dioZombie || z.dead) continue; const m = z.dioZombie.master;
      for (const k of ZKEYS) if (z[k] === undefined && m && m[k] !== undefined) z[k] = m[k] && typeof m[k] === 'object' ? JSON.parse(JSON.stringify(m[k])) : m[k];
      if (b.race && !z.lap) z.lap = { a0: b.race.startAng, next: 1, prog: 0 }; }
  } });

  // ---------- 스테이지 훅 (모든 스테이지): 재생, 시생인, 쪼개기 낙하 연출 ----------
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (b.over) return;
      for (const u of b.u) {
        if (isDio(u) && !u.dead && u.dioRegen > 0 && !harmful(u)) { // 재생: 저장량의 12%/초 (최소 6/초)
          const amt = Math.min(u.dioRegen, Math.max(D.regen.min, u.dioRegen * D.regen.rate) * dt, u.maxHp - u.hp); u.dioRegen -= Math.max(amt, 0); if (u.hp >= u.maxHp) u.dioRegen = 0;
          u.hp += Math.max(0, amt); u.dioRegT = (u.dioRegT || 0) + amt; if (u.dioRegT >= 8) { b.text(u.x + 6, u.y - 46, '+' + Math.round(u.dioRegT), '#c8ff9a', 8); u.dioRegT = 0; } }
        if (u.dioZombie && !u.dead) { u.hp -= u.maxHp * D.extract.decay * dt; if (u.hp <= 0) { u.hp = 0; b.kill(u, foeOf(b, u)); } }
        if (u.air && u.air.dioFall && !u.dead) u.lookUp = Math.floor(u.air.t * 10) % 2 === 1; // 앞·뒷모습 번갈아
        if (u.air && u.air.dioIce && u.dioIceAir && u.status('dioFrozen')) u.air.t = 0.5; // 공중 빙결: 그 높이에 매달림
        if (u.dioIceAir && !u.status('dioFrozen')) u.dioIceAir = false;
      }
    },
    drawOver(ctx, b) {
      for (const u of b.u) { if (u.dead || u.hidden) continue; const z = b.airZ(u);
        if (u.dioZombie) { ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(b.time * 6); ctx.fillStyle = '#7a2a9a'; ctx.beginPath(); ctx.ellipse(u.x, u.y + 1, 14 + u.pad, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
          const k = Math.max(0, u.hp / u.maxHp); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(Math.round(u.x) - 10, Math.round(u.y - 50 - z), 20, 2); ctx.fillStyle = '#c88aff'; ctx.fillRect(Math.round(u.x) - 10, Math.round(u.y - 50 - z), Math.round(20 * k), 2); }
        if (u.dioIceAir && u.status('dioFrozen')) { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#e8faff'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(u.x) - 11 - u.pad, Math.round(u.y - 36 - z - u.pad * 2), 22 + u.pad * 2, 36 + u.pad * 2); ctx.restore(); }
        if (isDio(u) && u.dioRegen > 1 && !harmful(u) && Math.floor(b.time * 4) % 2) { ctx.fillStyle = '#9fe07a'; ctx.fillRect(Math.round(u.x) - 1 + Math.round(Math.sin(b.time * 3) * 8), Math.round(u.y - 40 - z), 2, 2); }
      }
    },
  });

  CHARACTERS.push({
    id: ID, name: '디오', fullName: '디오 브란도', gender: 'male', color: '#d8b030',
    stats: { hp: 760, atk: 30, spd: 270, range: 52, atkRate: 1.0, def: 14, crit: 0.08, critMult: 1.9 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { light: 1.5, dark: 0.7, ice: 0.6, fire: 1.15 }, // 흡혈귀: 빛(파문)에 약함
    skills: [
      { id: 'dioSplit', name: '얼음 쪼개기', cd: 9, mult: 2.2 },
      { id: 'dioFreeze', name: '기화 냉동법', cd: 10 },
      { id: 'dioMonkey', name: '몽키 점프', cd: 9 },
      { id: 'dioWry', name: 'WRRRYYYYY!', cd: 9 },
      { id: 'dioRipper', name: '공열안자경', cd: 9 },
      { id: 'dioExtract', name: '흡혈귀의 액기스', cd: 12 },
    ],
    passiveDesc: '재생: 받은 피해의 절반을 저장해 천천히(저장량의 12%/초, 최소 6/초) 회복. 해로운 상태이상 중엔 멈추고, 풀리면 다시 회복합니다. 빛(파문) 약점 ×1.5.',
    sprite: { // 16x16 절차적 도트 (직접 그림): 금발, 창백한 피부·붉은 눈, 짙은 녹색 상의·금색 하트 장식
      pal: { Y: '#f2d060', y: '#fff0a0', S: '#f4dcc8', R: '#d0203a', m: '#8a3038', G: '#2e5a3a', A: '#e8c050', L: '#22301e', D: '#2a2020' },
      rows: { 0: '....YYYYYYY.....', 1: '...YYYYYYYYY....', 2: '..YYYyYYYYYYY...', 3: '...YYSSSSSSYY...', 4: '....SSRSSRSS....', 5: '....SSSSSSSS....', 6: '.....SSmmSS.....', 7: '...GGGAGGAGGG...',
        8: '..GGGGGAAGGGGG..', 9: '..SGGGGAAGGGGS..', 10: '..SGGGGGGGGGGS..', 11: '...GGGAAAAGGG...', 12: '....LLL..LLL....', 13: '....LLL..LLL....', 14: '....DDD..DDD....', 15: '................' },
    },
    lines: {
      skill: {}, // 스킬 대사는 스킬 코드에서 직접
      event: {
        battleStart: ['넌 지금까지 먹은 빵의 개수를 기억하나?', '이 디오다!'],
        lowHp: ['이 디오가… 이런 곳에서!'], stunned: ['크윽…!'],
        win: ['역시 이 디오가 최고다!', '무다무다!'], lose: ['이, 이 디오가…!'],
      },
    },
  });
})();
