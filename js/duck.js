/* =========================================================
 * 오리 스킬: 꽥꽥!, 쪼기, 푸드덕!  (패시브 '오리' = traits:['waterproof'], game.js에서 처리)
 * ========================================================= */
(() => {
  const pose = (u, k, t) => { u.pose = k; u.poseT = t; };
  SKILLS.quack = {
    desc: '꽥! 소리로 상대를 놀라게 해 잠깐 움찔(이동·행동 정지)하게 합니다.',
    canUse: (u, e, d, b) => d < 140 && !e.status('flinch') && !e.dead,
    use(u, e, b, slot) {
      pose(u, 'quack', 0.45);
      for (let i = 0; i < 3; i++) b.later(i * 0.08, () => b.ring(u.x - u.facing * 6, u.y - 22, 6, 46 + i * 18, 0.4, i % 2 ? '#fff6c0' : '#ffffff'));
      b.text(u.x - u.facing * 10, u.y - 54, '꽥!', '#fff2a0', 14);
      b.later(0.06, () => b.text(u.x - u.facing * 22, u.y - 44, '꽥!', '#ffe080', 10));
      if (dist(u, e) < (slot.range || 150) && !e.dead) { b.applyStatus(e, 'flinch', slot.flinch || 0.7, u); b.text(e.x, e.y - 60, '!', '#fff2a0', 14); }
    },
  };
  SKILLS.peck = {
    desc: '재빠르게 여러 번 쪼아 작은 피해. 상대의 이로운 효과(버프·방벽·혼령·반격 자세 등)를 제거합니다.',
    canUse: (u, e, d) => d > 20 && d < 170 && !e.airborne,
    use(u, e, b, slot) {
      b.chase(u, e, 720, 0.4, () => {
        pose(u, 'peck', (slot.hits || 5) * (slot.gap || 0.08) + 0.2);
        if (slot.dispel) { const gone = b.dispel(u, e); if (gone.length) { b.hooks.onSystem && b.hooks.onSystem(`쪼기: ${e.def.name}의 ${gone.join(', ')} 해제!`); b.text(e.x, e.y - 66, '해제!', '#ffe080', 11); } }
        for (let i = 0; i < (slot.hits || 5); i++) b.later(i * (slot.gap || 0.08), () => {
          if (e.dead || u.dead) return;
          b.damage(u, e, u.st.atk * (slot.mult || 0.45), { element: slot.element, delivery: slot.delivery, noCrit: i > 0 });
          b.slashFx(e.x + rand(-6, 6), e.y - 18 + rand(-8, 6), u.facing, '#ffe8a0', 0.6);
        });
      }, '#ffe8a0');
    },
  };
  SKILLS.flap = {
    desc: '푸드덕! 잠깐 날아올라 공중 상태가 됩니다(근접 공격은 빗나가고, 원거리는 맞음).',
    canUse: (u, e, d, b) => !u.airborne && (d < 80 || b.threatTo(u)),
    use(u, e, b, slot) {
      u.air = { t: 0, dur: slot.dur || 1.4, h: slot.h || 34, fly: true };
      for (let i = 0; i < 8; i++) b.parts.push({ x: u.x + rand(-10, 10), y: u.y - rand(10, 26), vx: rand(-60, 60), vy: rand(-40, 20), g: 120, life: rand(0.5, 0.9), max: 0.9, color: i % 2 ? '#ffffff' : '#fff2a0', size: rand(2, 3) });
      b.dust(u.x, u.y); b.text(u.x, u.y - 56, '푸드덕!', '#fff2a0', 10);
    },
  };
})();
