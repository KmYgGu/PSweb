/* =========================================================
 * 태도 귀무사 스킬: 혼령, 고스트 온 (오니화 패시브는 game.js 'oni' 처리)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  SKILLS.spirit = {
    desc: '오니화 게이지 25 소모. 혼령 상태(무작위 짧게/길게)가 되어 상대를 통과합니다(서로 공격은 가능). 끝날 때 근처의 상대를 베어 공중으로 띄웁니다. 오니화 중엔 사용 불가.',
    canUse: (u, e, d) => !u.spirit && !u.oni && !u.ghostChain && d < 150 && !e.airborne, // 오니화 중엔 사용 불가 (오니화 지속 보장)
    use(u, e, b, slot) {
      const long = Math.random() < 0.5, dur = long ? rand(2.8, 3.8) : rand(1.0, 1.6);
      u.spirit = { t: dur, max: dur, slot };
      b.smoke(u.x, u.y - 18, '#b8c8ff', 10); b.glow(u.x, u.y - 20, 36, '#9fb0ff', 0.4);
      b.text(u.x, u.y - 62, long ? '혼령 (길게)' : '혼령', '#c8d4ff', 10);
    },
  };
  // 혼령 종료 처리 (game.js updateUnit에서 호출)
  window.spiritEnd = (u, b) => {
    const S = u.spirit, A = S.slot.air, e = b.enemy(u); u.spirit = null;
    b.smoke(u.x, u.y - 18, '#c8d4ff', 8);
    if (!e.dead && !e.airborne && dist(u, e) < A.range + u.pad + e.pad) {
      e.action = null; e.air = { t: 0, dur: A.dur, h: A.h, spin: false };
      b.damage(u, e, u.st.atk * (S.slot.mult || 1), { color: '#c8d4ff', element: S.slot.element, delivery: S.slot.delivery });
      b.shock(e.x, e.y, 6, 40, '#c8d4ff', 0.4, 4); b.text(e.x, e.y - 56, '띄우기!', '#c8d4ff', 11);
      b.stats.spiritLaunch = (b.stats.spiritLaunch || 0) + 1; b.say(u, 'spiritLaunch');
    }
  };
  // 고스트 온: 첫 타만 유도. 회전 후엔 무작위 방향 핀볼 이동 → 창(window) 안에 실제 몸통 충돌이 나야 다음 회전
  const after = (u, b) => b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.3, a: 0.4 });
  function circleAction(u, e, b, slot, n) {
    const st = { type: 'ghost', phase: 'circle', t: 0, n, ang: Math.atan2(u.y - e.y, u.x - e.x), dirS: 1, slot, trail: '#ff6a7a' };
    const cx = AR.x + AR.w / 2, cy = AR.y + AR.h / 2, tx = -Math.sin(st.ang), ty = Math.cos(st.ang);
    st.dirS = (tx * (cx - e.x) + ty * (cy - e.y)) >= 0 ? 1 : -1; // 경기장 중앙 쪽으로 도는 방향
    st.step = (dt) => {
      st.t += dt;
      if (e.dead) { u.action = null; return; }
      const dur = 0.42, R = 44 + e.pad; st.ang += st.dirS * TAU / dur * dt;
      const p = b.clampPos(e.x + Math.cos(st.ang) * R, e.y + Math.sin(st.ang) * R * 0.75, u.pad, u); u.x = p.x; u.y = p.y;
      after(u, b);
      if (Math.random() < 0.5) b.parts.push({ x: u.x, y: u.y - 18, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.35, max: 0.35, color: '#ff8a96', size: 2.5, glow: true });
      if (st.t >= dur) { // 회전 끝: 무작위 방향으로 튕겨 나감 (추적 없음)
        b.crescent(e.x, e.y - 18 - b.airZ(e), R + 4, st.ang, '#ff6a7a', 0.25);
        u.action = null;
        if (Math.random() < (slot.trackChance ?? 0.5)) { u.action = trackAction(u, e, b, slot, st.n); return; } // 50%: 추적 후속타
        u.dir = fixAngle(rand(0, TAU)); u.boost = Math.max(u.boost, 0.3);                               // 50%: 무작위 방향 (몸통 충돌 필요)
        u.ghostChain = { n: st.n, t: slot.window || 1.2, slot, e };
      }
    };
    return st;
  }
  function trackAction(u, e, b, slot, n) { // 추적 후속타: 맞으면 카운트, 빗나가면 연계 끊김 (붉은 궤적)
    const st = { type: 'ghost', phase: 'track', t: 0, n, slot, trail: '#ff2a3a' };
    st.step = (dt) => {
      st.t += dt;
      if (e.dead) { u.action = null; return; }
      const d = dist(u, e), sp = 820 * dt;
      if (d > 22) { u.x += (e.x - u.x) / d * Math.min(sp, d - 20); u.y += (e.y - u.y) / d * Math.min(sp, d - 20); }
      after(u, b);
      if (d <= u.reach * 0.75) {
        u.swing = 0.2; u.action = null;
        const ok = b.damage(u, e, u.st.atk, { airHit: true, color: '#ffb0b8', element: slot.element, delivery: slot.delivery }) > 0;
        if (!ok) { b.text(u.x, u.y - 58, '연계 끊김', '#ffb0b8', 9); u.dir = fixAngle(rand(0, TAU)); return; }
        u.ghostChain = { n, t: 1, slot, e }; window.ghostBump(u, b);
      } else if (st.t > 0.6) { u.action = null; u.dir = fixAngle(rand(0, TAU)); b.text(u.x, u.y - 58, '연계 끊김', '#ffb0b8', 9); }
    };
    return st;
  }
  // 창 타이머 (game.js updateUnit)
  window.ghostTick = (u, b, dt) => {
    const G = u.ghostChain; if (u.action) return;
    G.t -= dt; if (Math.random() < dt * 12) after(u, b);
    if (G.t <= 0 || G.e.dead) { u.ghostChain = null; if (!G.e.dead) b.text(u.x, u.y - 58, '연계 끊김', '#ffb0b8', 9); }
  };
  // 실제 몸통 충돌 발생 (game.js collide)
  window.ghostBump = (u, b) => {
    const G = u.ghostChain; if (!G || u.action) return;
    u.ghostChain = null; const e = G.e, slot = G.slot, n = G.n + 1;
    b.text(e.x + 14, e.y - 66, n + '연', '#ff8a96', 10); b.slashFx(e.x, e.y - 18, u.facing, '#ffd0d4', 1);
    if (n >= (slot.reps || 6)) { // 거대한 X자 참격
      const x = e.x, y = e.y - 20 - b.airZ(e), L = 70;
      b.streak(x - L, y - L, x + L, y + L, '#ff4a5a', 14, 0.5); b.streak(x + L, y - L, x - L, y + L, '#ff4a5a', 14, 0.5);
      b.later(0.06, () => { b.streak(x - L, y - L, x + L, y + L, '#ffffff', 5, 0.4); b.streak(x + L, y - L, x - L, y + L, '#ffffff', 5, 0.4); });
      b.shock(x, y + 18, 8, 80, '#ff8a96', 0.5, 5); b.zoomAt(x, y, 0.07); b.shake(3); b.hitstop(0.15);
      b.damage(u, e, u.st.atk * slot.finMult, { big: true, airHit: true, color: '#ff8a96', element: slot.element, delivery: slot.delivery, pierce: 0.3 });
      b.hooks.onSystem && b.hooks.onSystem('귀무사: 십자 참격!');
      b.stats.ghostFin = (b.stats.ghostFin || 0) + 1;
      return;
    }
    u.action = circleAction(u, e, b, slot, n);
  };
  SKILLS.ghostOn = {
    desc: '상대가 공중일 때만. 첫 일격은 상대에게 날아듭니다. 이후 상대 주위를 한 바퀴 돌고, 50% 확률로 추적 후속타(적중 시 카운트) 또는 무작위 방향으로 튕겨 나가 1.2초 안에 몸통 충돌이 나면 카운트. 카운트마다 다시 회전. 6회 성공 시 거대한 X자 참격.',
    canUse: (u, e, d) => e.airborne && !e.dead && d < 300 && !u.ghostChain,
    use(u, e, b, slot) {
      const st = { type: 'ghost', phase: 'home', t: 0, n: 0, slot, trail: '#ff6a7a' };
      st.step = (dt) => {
        st.t += dt;
        if (e.dead) { u.action = null; return; }
        const d = dist(u, e), sp = 760 * dt;
        if (d > 26) { u.x += (e.x - u.x) / d * Math.min(sp, d - 24); u.y += (e.y - u.y) / d * Math.min(sp, d - 24); }
        after(u, b);
        if (d <= 30) {
          b.damage(u, e, u.st.atk * slot.mult, { airHit: true, color: '#ffb0b8', element: slot.element, delivery: slot.delivery });
          b.slashFx(e.x, e.y - 18 - b.airZ(e), u.facing, '#ff8a96', 1.2);
          if (e.air && !e.air.fling) e.air.t = Math.max(e.air.t, e.air.dur * 0.75); // 첫 타 후 곧 착지 → 상대는 정상 행동
          u.action = circleAction(u, e, b, slot, 0);
        } else if (st.t > 0.7) { u.action = null; u.dir = fixAngle(rand(0, TAU)); }
      };
      u.action = st;
      b.glow(u.x, u.y - 20, 34, '#ff6a7a', 0.3);
    },
  };
})();
