/* =========================================================
 * 스킬 정의: CHARACTERS[].skills[].id 와 키가 일치해야 함
 *  desc           : 선택 화면 설명
 *  canUse(u,e,d,b): 사용 조건 (AI). d = 두 유닛 거리 (슬롯 canUse로 재정의 가능)
 *  use(u,e,b,slot): 실행. slot.applies (상태이상 목록)를 피해 옵션에 넘기면 적중 시 부여
 * ========================================================= */
const ap = slot => (slot && slot.applies) || null;
// 슬롯의 피해 속성(element/delivery/pierce) + 상태이상을 피해 옵션으로 변환
const hit = (slot, extra) => ({ element: slot && slot.element, delivery: slot && slot.delivery, pierce: (slot && slot.pierce) || 0, applies: ap(slot), ...extra });
const SKILLS = {
  dashSlash: {
    desc: '적에게 순식간에 돌진해 강하게 베어냅니다.',
    canUse: (u, e, d) => d > 45 && d < 190,
    use(u, e, b, slot) {
      const p = b.predict(e, 0.25);
      b.telegraphLine(u.x, u.y, p.x, p.y, 14, 0.25, '#9fd0ff');
      b.glow(u.x, u.y - 18, 30, '#8fc8ff', 0.3);
      b.windup(u, 0.25, () => b.chase(u, e, 1100, 0.35, () => {
        b.damage(u, e, u.st.atk * 2.4, { big: true, ...hit(slot) });
        const a = Math.atan2(e.y - u.y, e.x - u.x);
        b.crescent(e.x, e.y - 18, 34, a - 0.6, '#bfe0ff', 0.32);
        b.crescent(e.x, e.y - 18, 30, a + 0.9, '#e8f4ff', 0.28, 0.06);
        b.shock(e.x, e.y, 8, 62, '#a8d4ff', 0.45, 6);
        b.glow(e.x, e.y - 18, 56, '#7fb8ff', 0.45);
        b.sparks(e.x, e.y - 18, '#d8ecff', 26, 260);
        b.hitstop(0.12); b.zoomAt(e.x, e.y - 18, 0.05);
      }, '#9fd0ff'));
    },
  },
  arrowVolley: {
    desc: '부채꼴로 화살 5발을 연속 발사합니다. 화살에 독이 묻어 있습니다.',
    canUse: (u, e, d) => d > 40 && d < 240,
    use(u, e, b, slot) {
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      b.telegraphFan(u.x, u.y - 14, a, 0.6, 210, 0.3, '#b8f0a0');
      b.glow(u.x + u.facing * 10, u.y - 18, 24, '#a8f07a', 0.3);
      b.windup(u, 0.3, () => {
        b.shock(u.x, u.y, 4, 34, '#b8f0a0', 0.3, 3);
        for (let i = -2; i <= 2; i++) {
          b.later(Math.abs(i) * 0.04, () => b.shoot(u, { angle: a + i * 0.12, spd: 600, dmg: u.st.atk * 0.85, kind: 'arrowG', hit: hit(slot) }));
        }
      });
    },
  },
  fireball: {
    desc: '거대한 화염구를 떨어뜨려 넓은 범위에 큰 피해를 주고 쇠약시킵니다.',
    canUse: (u, e, d) => d < 240,
    use(u, e, b, slot) {
      const t = 0.7, q = b.predict(e, t * 0.5), x = q.x, y = q.y, r = 58;
      b.telegraphCircle(x, y, r, t, '#ffae6b');
      b.glow(u.x, u.y - 30, 26, '#ffb36b', 0.5);
      b.meteor(x, y, t);
      b.later(t, () => {
        b.explosion(x, y, r);
        if (Math.hypot(e.x - x, e.y - y) <= r + 8) b.damage(u, e, u.st.atk * 3.4, { big: true, color: '#ffc27a', ...hit(slot) });
      });
    },
  },
  ironWall: {
    desc: '3.5초간 받는 피해 60% 감소, 피해 일부 반사, 상태이상 저항 +60%.',
    canUse: (u, e, d) => u.hp < u.maxHp * 0.92 && d < 120,
    use(u, e, b) {
      u.buffs.push({ type: 'shield', t: 3.5, dmgTaken: 0.4, reflect: 0.35, statusResist: 0.6 });
      b.shock(u.x, u.y - 18, 10, 52, '#bfe3ff', 0.5, 5);
      b.glow(u.x, u.y - 20, 48, '#9fd0ff', 0.6);
      b.embers(u.x, u.y - 10, '#d8efff', 16);
    },
  },
  groundSlam: {
    desc: '땅을 내려찍어 주변에 충격파를 일으키고 적을 석화시킵니다.',
    canUse: (u, e, d) => d < 85,
    use(u, e, b, slot) {
      b.telegraphCircle(u.x, u.y, 85, 0.35, '#d8c8a0');
      b.windup(u, 0.35, () => {
        b.shock(u.x, u.y, 6, 92, '#e0d0a8', 0.55, 8);
        b.shock(u.x, u.y, 4, 60, '#fff0c8', 0.4, 4);
        b.glow(u.x, u.y - 6, 64, '#c8a060', 0.45);
        b.debris(u.x, u.y, 30);
        b.areaBuildings(u.x, u.y, 92, 90, true);
        b.hitstop(0.1); b.zoomAt(u.x, u.y, 0.04); b.shake(2);
        if (dist(u, e) <= 92) b.damage(u, e, u.st.atk * 1.3, { big: true, ...hit(slot) });
      });
    },
  },
  shadowStrike: {
    desc: '적의 등 뒤로 순간이동해 치명적인 일격을 가하고 혼란에 빠뜨립니다.',
    canUse: (u, e, d) => d < 220,
    use(u, e, b, slot) {
      b.smoke(u.x, u.y - 16, '#7a5aa8', 22);
      const ox = u.x, oy = u.y;
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      const p = b.clampPos(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26);
      u.x = p.x; u.y = p.y;
      b.streak(ox, oy - 18, u.x, u.y - 18, '#b890ff', 10, 0.35);
      u.facing = e.x >= u.x ? 1 : -1;
      u.buffs.push({ type: 'invis', t: 0.7 });
      b.smoke(u.x, u.y - 16, '#7a5aa8', 22);
      b.windup(u, 0.15, () => {
        b.damage(u, e, u.st.atk * 2.6, { big: true, crit: true, ...hit(slot) });
        b.crescent(e.x, e.y - 18, 30, -0.8, '#ffb0d8', 0.3);
        b.crescent(e.x, e.y - 18, 30, 0.8 + Math.PI, '#d8a0ff', 0.3, 0.05);
        b.glow(e.x, e.y - 18, 50, '#c080ff', 0.45);
        b.sparks(e.x, e.y - 18, '#ffc8e8', 20, 220);
        b.hitstop(0.1);
      });
    },
  },
  lanceCharge: {
    desc: '일직선으로 돌격해 꿰뚫고 적을 기절시킵니다.',
    canUse: (u, e, d) => d > 50 && d < 200,
    use(u, e, b, slot) {
      const q = b.predict(e, 0.45);
      const a = Math.atan2(q.y - u.y, q.x - u.x);
      const d = Math.hypot(q.x - u.x, q.y - u.y) + 50;
      const p = b.clampPos(u.x + Math.cos(a) * d, u.y + Math.sin(a) * d);
      b.telegraphLine(u.x, u.y, p.x, p.y, 20, 0.35, '#ffcf8a');
      b.glow(u.x, u.y - 18, 30, '#ffc070', 0.35);
      b.windup(u, 0.35, () => b.dash(u, p.x, p.y, 0.2, () => {
        b.damage(u, e, u.st.atk * 1.8, { big: true, ...hit(slot) });
        b.shock(e.x, e.y, 6, 56, '#ffd08a', 0.45, 6);
        b.glow(e.x, e.y - 18, 52, '#ffb050', 0.45);
        b.sparks(e.x, e.y - 18, '#ffe0a8', 24, 280, a);
        b.hitstop(0.12); b.zoomAt(e.x, e.y - 18, 0.05);
      }, '#ffcf8a'));
    },
  },
  holyLight: {
    desc: '최대 체력의 20%를 회복하고 적에게 번개(전기)를 내려 마비시킵니다.',
    canUse: (u, e, d) => u.hp < u.maxHp * 0.7,
    use(u, e, b, slot) {
      b.heal(u, u.maxHp * 0.2);
      b.pillar(u.x, u.y, '#fff1a8');
      b.shock(u.x, u.y, 6, 44, '#fff1a8', 0.5, 4);
      b.glow(u.x, u.y - 24, 46, '#ffe88a', 0.6);
      b.embers(u.x, u.y, '#fff4c0', 22);
      b.later(0.25, () => {
        if (e.dead) return;
        b.bolt(e.x, e.y - 14, 120, '#fff4a0');
        b.glow(e.x, e.y - 18, 40, '#fff07a', 0.4);
        b.sparks(e.x, e.y - 18, '#fff8c0', 14, 180);
        b.damage(u, e, u.st.atk * 1.0, hit(slot));
      });
    },
  },
  rage: {
    desc: '4초간 공격·이동 속도가 크게 오르고 피해의 일부를 흡수합니다.',
    canUse: (u, e, d) => d < 160,
    use(u, e, b) {
      u.buffs.push({ type: 'rage', t: 4, atkRateMul: 1.9, spdMul: 1.25, lifesteal: 0.35 });
      b.shock(u.x, u.y - 10, 8, 64, '#ff9a7a', 0.5, 7);
      b.glow(u.x, u.y - 20, 60, '#ff6a4a', 0.6);
      b.embers(u.x, u.y, '#ffb08a', 26);
      b.zoomAt(u.x, u.y - 18, 0.03);
    },
  },
  // ===== 라인하르트 =====
  fireStrike: {
    desc: '해머를 크게 휘둘러 세로로 선 화염 참격을 날립니다. 화염은 일직선으로 관통합니다.',
    canUse: (u, e, d) => d > 60 && d < 260,
    use(u, e, b, slot) {
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      b.telegraphLine(u.x, u.y - 14, u.x + Math.cos(a) * 240, u.y - 14 + Math.sin(a) * 240, 18, 0.3, '#ffae6b');
      b.glow(u.x, u.y - 24, 34, '#ff9a4a', 0.35);
      b.windup(u, 0.3, () => {
        u.hamSwing = 0.35;
        const sx = u.x + Math.cos(a) * 14, sy = u.y - 20;
        const nx = -Math.sin(a), ny = Math.cos(a);
        b.streak(sx - nx * 30, sy - ny * 30, sx + nx * 30, sy + ny * 30, '#ffb526', 8, 0.2);
        b.streak(sx - nx * 25, sy - ny * 25, sx + nx * 25, sy + ny * 25, '#fff6b2', 2.5, 0.14);
        b.shoot(u, { angle: a, spd: 430, dmg: u.st.atk * ((slot && slot.mult) || 1.7), kind: 'flame', piercesBarrier: true, hit: hit(slot, { piercesBarrier: true }) }); // 방벽 관통
        const p = b.proj[b.proj.length - 1]; p.pierce = true; p.life = 1.4;
        b.embers(u.x, u.y - 14, '#ffb36b', 10);
      });
    },
  },
  rCharge: {
    desc: '시전 순간 적의 위치로 벽에 닿을 때까지 직진. 적을 붙잡으면(제압) 벽에 박아 큰 피해.',
    canUse: (u, e, d) => d > 40 && d < 170 && !e.airborne,
    use(u, e, b, slot) {
      const t = 0.08, tx = e.x + Math.cos(e.dir) * e.speed * t, ty = e.y + Math.sin(e.dir) * e.speed * t; // 최소한의 예측
      const a = Math.atan2(ty - u.y, tx - u.x);
      b.telegraphLine(u.x, u.y, u.x + Math.cos(a) * 200, u.y + Math.sin(a) * 200, 20, 0.22, '#ffd08a');
      b.glow(u.x, u.y - 20, 40, '#ffb36b', 0.3);
      b.visualFx.push({ type: 'chargeCue', u, ang: a, color: '#ffd08a', t: 0, dur: 0.22 });
      b.windup(u, 0.22, () => b.charge(u, a, 560, slot));
      u.action.chargeTell = true;
    },
  },
  barrier: {
    desc: '내구도가 있는 방벽을 앞에 펼칩니다(슬롯 hp/dur). 원거리 공격/투사체를 막고, 근접은 통과.',
    canUse: (u, e, d) => !u.barrier && e.st.range >= 80 && d > 70,
    use(u, e, b, slot) {
      const hp = (slot && slot.hp) || 1200;
      u.barrier = { hp, max: hp, spdMul: (slot && slot.spdMul) || 0.6, t: (slot && slot.dur) || 6, ang: Math.atan2(e.y - u.y, e.x - u.x), hitT: 0 };
      b.shock(u.x, u.y - 18, 8, 46, '#9fd8ff', 0.45, 4);
      b.glow(u.x, u.y - 22, 46, '#8fc8ff', 0.4);
    },
  },
  earthshatter: {
    desc: '땅을 내려찍어 전방 부채꼴로 땅을 가르는 충격파. 맞은 적은 넘어지며 기절.',
    canUse: (u, e, d) => d < 150 && !e.airborne && Math.abs(Math.atan2(e.y - u.y, e.x - u.x)) >= 0,
    use(u, e, b, slot) {
      const a = Math.atan2(e.y - u.y, e.x - u.x), len = 160, spread = 0.5;
      b.telegraphFan(u.x, u.y, a, spread, len, 0.45, '#ffd08a');
      b.glow(u.x, u.y - 30, 30, '#ffe0a0', 0.45);
      b.windup(u, 0.45, () => {
        u.hamSwing = 0.4;
        b.shock(u.x + Math.cos(a) * 16, u.y + Math.sin(a) * 16, 6, 40, '#ffe8b0', 0.4, 5);
        b.hitstop(0.1); b.shake(2.5); b.zoomAt(u.x, u.y, 0.04);
        for (let k = -1; k <= 1; k++) b.crackLine(u.x, u.y, a + k * spread * 0.6, len * (k ? 0.8 : 1)); // 갈라지는 땅
        for (let i = 1; i <= 4; i++) b.later(i * 0.05, () => { const r = len * i / 4; b.debris(u.x + Math.cos(a) * r, u.y + Math.sin(a) * r, 6); b.areaBuildings(u.x + Math.cos(a) * r, u.y + Math.sin(a) * r, 22, 60, false); });
        const d = dist(u, e), da = Math.abs(Math.atan2(Math.sin(Math.atan2(e.y - u.y, e.x - u.x) - a), Math.cos(Math.atan2(e.y - u.y, e.x - u.x) - a)));
        if (!e.dead && !e.airborne && d <= len + 10 && (da <= spread + 0.15 || d < 30)) {
          b.later(d / len * 0.2, () => {
            if (e.dead || e.airborne) return;
            b.damage(u, e, u.st.atk * 1.3, { big: true, ...hit(slot) });
            b.knockdown(u, e, (slot && slot.stun) || 1.5);
          });
        }
      });
    },
  },
  // ===== 이블린 =====
  wireSnatch: {
    desc: '시전 순간 적의 위치로 와이어를 던집니다(비유도). 맞으면 끌어당기고 속박(이동 불가, 행동 가능).',
    canUse: (u, e, d) => d > 70 && d < 230 && !e.status('bind'),
    use(u, e, b, slot) {
      const tx = e.x, ty = e.y, a = Math.atan2(ty - u.y, tx - u.x), dd = Math.hypot(tx - u.x, ty - u.y);
      b.telegraphLine(u.x, u.y - 14, tx, ty - 14, 6, 0.15, '#ffd8a0');
      b.windup(u, 0.15, () => {
        u.swing = 0.2;
        b.shoot(u, { angle: a, spd: 720, dmg: u.st.atk * (slot.mult || 0.8), kind: 'wire', hit: hit(slot) });
        const p = b.proj[b.proj.length - 1]; p.life = dd / 720 + 0.08; p.from = u;
        p.onHit = (tgt) => { b.pull(tgt, u, 0.22); b.wireFx(u, tgt, 0.35); };
      });
    },
  },
  garrote: {
    desc: '화염 매듭 50 소모. 와이어로 조여 베는 교살 공격 (시전 중 받는 피해 50%). 적중 시 표식 +1.',
    canUse: (u, e, d) => d < 100,
    use(u, e, b, slot) {
      u.buffs.push({ type: 'garrote', t: 0.7, dmgTaken: 0.5 });
      b.glow(u.x, u.y - 20, 26, '#ff9a4a', 0.3);
      b.windup(u, 0.2, () => {
        u.swing = 0.2;
        if (!e.dead && dist(u, e) <= 110) {
          b.garroteFx(e, 0.5, false); b.wireFx(u, e, 0.4);
          b.later(0.12, () => {
            if (e.dead) return;
            const dmg = b.damage(u, e, u.st.atk * (slot.mult || 2), { big: true, ...hit(slot) });
            if (dmg > 0) { b.gainRes(u, 'mark', slot.gainMark || 1); b.embers(e.x, e.y - 14, '#ffb36b', 10); }
          });
        } else b.slashFx(u.x + u.facing * 18, u.y - 18, u.facing, '#ffc890', 0.8);
      });
    },
  },
  bindingSeal: {
    desc: '반격 자세: 짧은 시간 안에 공격/스킬/투사체가 닿으면 자동 회피하고 화염 매듭이 가득 참. 아니면 소량 획득.',
    canUse: (u, e, d, b) => b.threatTo(u) || Math.random() < 0.0015,
    use(u, e, b, slot) { b.startCounter(u, slot.window || 0.6); },
  },
  garroteBurst: {
    desc: '표식 3개를 모두 소모. 여러 가닥의 와이어로 적을 옭아맨 뒤 화염 폭발로 큰 피해.',
    canUse: (u, e, d) => d < 210 && !e.airborne,
    use(u, e, b, slot) {
      u.buffs.push({ type: 'garrote', t: 1.0, dmgTaken: 0.3 });
      b.wireFx(u, e, 0.75, 5); b.garroteFx(e, 0.75, true);
      b.applyStatus(e, 'bind', 0.8, u);
      b.glow(u.x, u.y - 22, 40, '#ffb36b', 0.5);
      b.hitstop(0.08);
      b.windup(u, 0.7, () => {
        if (e.dead) return;
        b.explosion(e.x, e.y, 56);
        b.shock(e.x, e.y - 10, 6, 74, '#ffe0a0', 0.5, 6);
        b.zoomAt(e.x, e.y - 18, 0.06); b.shake(3);
        b.damage(u, e, u.st.atk * (slot.mult || 5), { big: true, color: '#ffc27a', ...hit(slot) });
      });
    },
  },
};
