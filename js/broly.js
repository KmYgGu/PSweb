/* =========================================================
 * 브로리 (+ 파라가스) — 2인 팀 캐릭터
 *  선택 항목 '브로리' = 파라가스 & 브로리 두 유닛이 한 팀으로 출전 (def.partner, game.js Battle 생성자)
 *  파라가스: 기를 낮추거라 [대상] / 데드☆퍼니셔! / 무스코 크러쉬!
 *  브로리  : 스로잉 블래스터 / 지반 격파 / 남겨둔 기탄
 *  파라가스가 먼저 쓰러지면 브로리 → 전설의 슈퍼사이어인 (스프라이트·스탯·스킬 교체): 암반 / 무시카라 사커 / 데덴탄
 *  용어: 타겟형 = 시전 순간 대상 위치로 직진(비유도), 추적형 = 끝까지 대상을 따라감(유도)
 * ========================================================= */
(() => {
  const TAU = Math.PI * 2;
  const sys = (b, t) => b.hooks.onSystem && b.hooks.onSystem(t);
  const voice = (b, u, t) => b.hooks.onVoice && b.hooks.onVoice(u, t);
  const isBroly = o => o && o.def && o.def.id === 'broly';
  const isParagus = o => o && o.def && o.def.id === 'paragus';
  const FACES = { front: 'left', back: 'left' };
  const FACES_B = { front: 'left', back: 'left' };
  const FACES_L = { front: 'right', back: 'left' }; // 전설 브로리 정면은 오른쪽을 봄
  const ease = t => 1 - Math.pow(1 - t, 3);

  // ===================== 캐릭터 정의 =====================
  const PARAGUS = {
    id: 'paragus', name: '파라가스', gender: 'male', color: '#8a6ac8',
    stats: { hp: 370, atk: 17, spd: 235, range: 46, atkRate: 0.85, def: 7.5 },
    attack: { element: 'blunt', delivery: 'melee' }, // 지팡이
    resist: { dark: 0.9, light: 1.15, slash: 1.1 },
    statusResist: { confusion: 0.3 },
    skills: [
      { id: 'lowerKi', name: '기를 낮추거라', cd: 7, mult: 0.5, dur: 4, allyDur: 3, spd: 340, element: 'elec', delivery: 'ranged' },
      { id: 'deadPunisher', name: '데드☆퍼니셔!', cd: 8, mult: 0.9, range: 95, push: 430, wallMult: 0.7, element: 'dark', delivery: 'ranged' },
      { id: 'musukoCrush', name: '무스코 크러쉬!', cd: 9, mult: 1.6, reach: 165, spd: 640, selfStun: 1.4, element: 'blunt', delivery: 'melee' },
    ],
    sprite: { src: 'assets/paragus/front.png', back: 'assets/paragus/back.png', scale: 0.5, foot: 2, faces: FACES },
    portrait: 'assets/paragus/portrait.png',
    poses: { fallen: { id: 'paragus@fallen', name: '파라가스', color: '#8a6ac8', sprite: { src: 'assets/paragus/fallen.png', scale: 0.5, foot: 3, faces: FACES } } },
    lines: {
      skill: { '데드☆퍼니셔!': ['데드☆퍼니셔!'], '무스코 크러쉬!': ['무스코 크러쉬!', '이 아버지의 품으로 오너라!'] },
      event: {
        battleStart: ['FU~HAHAHA~! 이 곳을 본거지로 삼아 제국을 건설하겠다!', '브로리! 사이어인의 힘을 저 녀석을 없애버려랏~!', { t: '어른스런 누님 좋구나~', female: true }],
        debuffed: ['그만둬라, {opp}! 그만둬어~!', 'SWAT!?.'],
        lowHp: ['살려주십시오!', '이것도 사이어인의 숙명인가...'],
        lose: ['DOOR!?', '또어어어어오오오오옹느!'],
        win: ['나와 브로리의 제국은 영원불멸이다!', '네 죽음의 공포도 머지않아 끝났구나. 고맙게 생각해라.'],
        allyLost: ['가엾지만 브로리.. 너도 이 별과 함께 사라지는 거다..'],
      },
    },
  };
  const LSS_FORM = {
    id: 'broly@lss', name: '브로리', color: '#b8f05a', gender: 'male', size: 1.55,
    sprite: { src: 'assets/broly/lss_front.png', back: 'assets/broly/lss_back.png', scale: 0.5, foot: 2, faces: FACES_L },
    portrait: 'assets/broly/lss_portrait.png',
    lines: {
      skill: { '암반': ['어디로 가려는 거냐?', '도망칠 곳은 없다!'], '무시카라 사커': ['흐아압!', '날아가라!'], '데덴탄': ['이걸로 끝이다아아!', '흐하하하하!'] },
      event: {
        transform: ['그 정도의 파워로 날 쓰러트릴수 있을 거라고 생각하는 거냐?', '자, 와라! 여기가 네 녀석이 죽을 장소DA☆~!!!'],
        buffed: ['기가 높아...흘러 넘친다...'], debuffed: ['그런 건 안 통해!'], lowHp: ['아무리 버텨봤자, 이 나를 뛰어넘는 건 불가능해!!!'],
        kill: ['내가… 악마다!', '흐하하하하하!'], win: ['내가… 악마다!'], lose: ['{opp}!!'],
      },
    },
  };
  const BROLY = {
    id: 'broly', name: '브로리', gender: 'male', color: '#5ad07a',
    stats: { hp: 610, atk: 21.5, spd: 220, range: 52, atkRate: 0.8, def: 14 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { blunt: 0.85, light: 0.9, elec: 1.2 },
    statusResist: { stun: 0.2 },
    size: 1.3,
    partner: PARAGUS, // 2인 팀: [파라가스, 브로리]
    skills: [
      { id: 'throwBlaster', name: '스로잉 블래스터', cd: 6, mult: 1.8, spd: 430, element: 'light', delivery: 'ranged' },
      { id: 'groundBreak', name: '지반 격파', cd: 11, mult: 1.3, r: 50, stun: 0.8, life: 6, w: 46, h: 30, element: 'blunt', delivery: 'melee' },
      { id: 'leftoverKi', name: '남겨둔 기탄', cd: 13, mult: 2.4, spd: 70, life: 8, element: 'light', delivery: 'ranged' },
    ],
    // 전설의 슈퍼사이어인: 파라가스가 먼저 쓰러지면 변신 (onAllyDown)
    lss: {
      desc: '파라가스가 먼저 쓰러지면 → 전설의 슈퍼사이어인 (체력 608 · 공격력 24.2 · 방어력 12.9 고정, 속도×1.12, 공속×1.2, 상태저항 +25%, 체력 비율 유지)',
      form: LSS_FORM, boost: { spd: 1.12, atkRate: 1.2, statusResist: 0.25 }, // 속도·공속은 소폭 배율
      stats: { hp: 608, atk: 24.2, def: 12.9 }, // 절대값: 다른 캐릭터 평균(HP 868.5 / ATK 34.6 / DEF 18.5)의 0.7배
      skills: [
        { id: 'bedrock', name: '암반', cd: 9, mult: 3.2, spd: 620, element: 'blunt', delivery: 'melee', pierce: 0.2 },
        { id: 'soccer', name: '무시카라 사커', cd: 9, mult: 2.2, near: 62, fling: 150, element: 'blunt', delivery: 'melee' },
        { id: 'dedentan', name: '데덴탄', cd: 13, mult: 1.3, n: 3, gap: 0.32, spd: 300, element: 'light', delivery: 'ranged' },
      ],
    },
    sprite: { src: 'assets/broly/front.png', back: 'assets/broly/back.png', scale: 0.5, foot: 2, faces: FACES_B },
    portrait: 'assets/broly/portrait.png',
    poses: { throw: { id: 'broly@throw', name: '브로리', color: '#5ad07a', sprite: { src: 'assets/broly/throw.png', scale: 0.5, foot: 2, faces: FACES_B } } },
    lines: {
      skill: { '스로잉 블래스터': ['흥…!', '사라져라.'], '지반 격파': ['우오오!'], '남겨둔 기탄': ['남겨둔 것이다..!'] },
      event: {
        battleStart: ['{opp}! 우선 너부터 피의 축제의 제물로 만들어주지!', '얌전히 죽음을 기다렸으면 뜨거운 맛을 보지 않아도 됐을 것을…'],
        debuffed: ['크이익!'], lowHp: ['죽다 만 놈이!'], lose: ['바보같은!.'], win: ['.. 끝났구나. 결국은 쓰레기는 쓰레기로구나'],
        allyLost: ['아버지…?'],
      },
    },
  };
  BROLY.extraDefs = [PARAGUS, PARAGUS.poses.fallen, LSS_FORM, BROLY.poses.throw]; // 스프라이트 미리 불러오기 (main.js)
  CHARACTERS.push(BROLY);

  // ===================== 변신 =====================
  BROLY.onAllyDown = (u, dead, b) => {
    if (isParagus(dead) && !u.form && !u.dead) b.later(0.5, () => transform(u, b));
  };
  PARAGUS.onAllyDown = (u, dead, b) => { if (isBroly(dead)) { u.voice && (u.voice.any = -9); b.say(u, 'allyLost'); } };
  function transform(u, b) {
    if (u.dead || u.form || b.over) return;
    const L = BROLY.lss, B = L.boost;
    u.form = L.form;
    const S = L.stats, ratio = u.hp / u.maxHp; // 현재 체력 비율 유지 (회복 없음)
    u.st.hp = S.hp; u.maxHp = S.hp; u.hp = Math.max(1, ratio * S.hp); u.st.atk = S.atk; u.st.def = S.def; u.st.spd *= B.spd; u.st.atkRate *= B.atkRate;
    u.skills = L.skills; u.skillT = u.skills.map(s => s.cd * rand(0.12, 0.3));
    u.statuses = u.statuses.filter(s => STATUS_DEFS[s.id] && STATUS_DEFS[s.id].positive); // 해로운 상태 정화
    u.buffs.push({ type: 'lssAura', name: '전설의 슈퍼사이어인', t: 1e9, nodispel: true, statusResist: B.statusResist });
    u.nBuffs = u.buffs.length; // 변신 버프는 'buffed' 대사 없이
    u.action = { type: 'wind', t: 0.9 }; // 기를 끌어올림
    b.hitstop(0.3); b.zoomAt(u.x, u.y - 30, 0.08); b.shake(4);
    for (let i = 0; i < 3; i++) b.later(i * 0.12, () => b.shock(u.x, u.y, 6, 70 + i * 26, i % 2 ? '#f4ffa0' : '#b8ff5a', 0.6, 6));
    b.glow(u.x, u.y - 34, 90, '#c8ff6a', 0.9); b.embers(u.x, u.y, '#d8ff7a', 30); b.sparks(u.x, u.y - 30, '#f4ffc0', 30, 300);
    b.debris(u.x, u.y, 26);
    b.stats.lss = (b.stats.lss || 0) + 1;
    sys(b, '브로리: 전설의 슈퍼사이어인으로 각성!!');
    u.voice && (u.voice.any = -9); u.lowSaid = u.hp < u.maxHp * 0.3 ? u.lowSaid : false; // LSS 저체력 대사가 다시 나올 수 있게
    b.later(1.4, () => { if (!u.dead && !b.over) { u.voice.any = -9; b.say(u, 'buffed'); } }); // 기 모으기 후 '기가 높아...'
    const t = b.line(u, 'event', 'transform') || LSS_FORM.lines.event.transform[0];
    voice(b, u, t);
  }
  // 몸 뒤 오라 (전설의 슈퍼사이어인): 녹금색 불꽃이 일렁임 (drawUnit 에서 스프라이트 원점=발 기준으로 호출)
  BROLY.drawUnder = (ctx, u, b, s) => {
    if (!u.form) return;
    const w = s.dw * 0.62, h = s.dh * 1.02;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const k = (i / 8) * 2 - 1, ph = b.time * 9 + i * 1.7, fh = h * (0.75 + 0.18 * Math.sin(ph) + 0.08 * Math.sin(ph * 2.3)) * (1 - Math.abs(k) * 0.35);
      ctx.globalAlpha = 0.16 + 0.06 * Math.sin(ph * 1.3);
      ctx.fillStyle = i % 2 ? '#c8ff5a' : '#ffe86a';
      ctx.beginPath(); ctx.moveTo(k * w - 7, -2); ctx.quadraticCurveTo(k * w * 1.25, -fh * 0.55, k * w * 0.8 + Math.sin(ph) * 3, -fh); ctx.quadraticCurveTo(k * w * 0.9, -fh * 0.5, k * w + 7, -2); ctx.fill();
    }
    ctx.restore();
  };

  // ===================== 파라가스 스킬 =====================
  // 기를 낮추거라: 초음파 (타겟형, 관통). 상대 → 피해 + 기 저하(주는 피해 ×0.7). 경로상의 브로리 → 피해 없이 기 저하
  SKILLS.lowerKi = {
    desc: '시전 순간 상대 위치로 초음파를 날립니다(타겟형, 관통). 맞은 상대는 기 저하(주는 피해 30% 감소). 경로에 브로리가 있으면 브로리도 기가 낮아집니다(피해 없음).',
    canUse: (u, e, d) => d > 50 && d < 260 && !e.status('kiDown') && !e.dead,
    say: (u, e) => `기를 낮추거라 ${e.def.name}!`,
    use(u, e, b, slot) {
      const sx = u.x + u.facing * 8, sy = u.y - 22, tx = e.x, ty = e.y - 18, a = Math.atan2(ty - sy, tx - sx), dd = Math.hypot(tx - sx, ty - sy), sp = slot.spd || 340;
      b.telegraphLine(u.x, u.y - 8, u.x + Math.cos(a) * dd, u.y - 8 + Math.sin(a) * dd, 12, 0.22, '#9fe0c8');
      b.windup(u, 0.22, () => {
        u.swing = 0.2;
        b.ring(sx, sy, 3, 16, 0.25, '#c8fff0');
        b.proj.push({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spd: sp, src: u, dmg: u.st.atk * slot.mult, kind: 'sonic', life: dd / sp + 0.35, trail: 0, r: 15, pierce: true, piercesBarrier: false,
          hitAlly: isBroly,
          onHitUnit(o, p) {
            if (o.team === u.team) { // 아군 브로리: 기만 낮아짐
              b.applyStatus(o, 'kiDown', slot.allyDur, u);
              b.text(o.x, o.y - 76, '…?', '#c8fff0', 12);
              sys(b, `${o.def.name}도 기가 낮아졌다…`);
              b.stats.kiDownAlly = (b.stats.kiDownAlly || 0) + 1;
              return;
            }
            b.damage(u, o, p.dmg, hit(slot, { viaProj: true, color: '#c8fff0', applies: [{ status: 'kiDown', duration: slot.dur }] }));
          },
          draw: drawSonic });
      });
    },
  };
  function drawSonic(ctx, p) {
    const a = Math.atan2(p.vy, p.vx);
    ctx.translate(p.x, p.y); ctx.rotate(a);
    for (let i = 0; i < 4; i++) {
      const off = -i * 7, r = 7 + i * 2.5;
      ctx.globalAlpha = 0.85 - i * 0.18; ctx.strokeStyle = i % 2 ? '#9fe0c8' : '#e8fff6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(off, 0, r, -0.9, 0.9); ctx.stroke();
    }
  }
  // 데드☆퍼니셔!: 주변 상대를 밀쳐냄(넉백). 벽에 박히면 추가 피해. 브로리에게는 아무 일도 없음
  SKILLS.deadPunisher = {
    desc: '주변의 상대에게 기공 충격을 날려 멀리 밀쳐냅니다(넉백). 밀려나다 벽에 부딪히면 추가 피해. 브로리가 맞으면… 아무 일도 없습니다.',
    canUse: (u, e, d) => d < 95 && !e.dead,
    use(u, e, b, slot) {
      b.glow(u.x, u.y - 22, 30, '#c890ff', 0.35);
      b.windup(u, 0.2, () => {
        const R = slot.range || 95; u.swing = 0.2;
        b.shock(u.x, u.y - 10, 6, R, '#c890ff', 0.45, 6); b.shock(u.x, u.y - 10, 4, R * 0.6, '#ffffff', 0.3, 3);
        b.hitstop(0.06); b.shake(2);
        for (const o of b.u) {
          if (o === u || o.dead || dist(u, o) > R + o.pad) continue;
          if (o.team === u.team) { // 브로리: 꿈쩍도 안 함
            if (isBroly(o)) { b.text(o.x, o.y - 78, '……', '#e8e0ff', 12); b.later(0.35, () => !o.dead && b.text(o.x + 10, o.y - 70, '(꿈쩍도 안 함)', '#c8c0e0', 8)); b.stats.punishBroly = (b.stats.punishBroly || 0) + 1; }
            continue;
          }
          const dmg = b.damage(u, o, u.st.atk * slot.mult, hit(slot, { color: '#e0c0ff' }));
          if (dmg > 0) {
            const ang = Math.atan2(o.y - u.y, o.x - u.x);
            b.knockback(o, ang, slot.push || 430, 0.35, () => {
              if (o.dead || b.over) return;
              b.damage(u, o, u.st.atk * (slot.wallMult || 0.7), { element: 'blunt', delivery: 'melee', airHit: true, noCrit: true, color: '#e0c0ff' });
              b.text(o.x, o.y - 70, '쾅!', '#e0c0ff', 12); b.shake(2);
            });
          }
        }
      });
    },
  };
  // 무스코 크러쉬!: 짧은 돌진 (타겟형). 경로상 먼저 닿은 유닛과 충돌 (브로리 포함)
  SKILLS.musukoCrush = {
    desc: '두 팔을 벌리고 상대에게 짧게 돌진합니다(타겟형). 적중 시 히트 스톱. 여성 상대 → 하트 연출(효과 없음). 남성 상대·브로리(경로에 있으면 대신 부딪힘) → 첫 번째에만 어색한 침묵 + 파라가스가 넘어져 잠깐 기절.',
    canUse: (u, e, d) => d > 30 && d < 170 && !e.airborne && !e.dead,
    use(u, e, b, slot) {
      const a0 = Math.atan2(e.y - u.y, e.x - u.x), maxD = Math.min(slot.reach || 165, dist(u, e) + 20);
      const tx = u.x + Math.cos(a0) * maxD, ty = u.y + Math.sin(a0) * maxD;
      b.telegraphLine(u.x, u.y, tx, ty, 16, 0.18, '#ffb0d0');
      b.windup(u, 0.18, () => {
        const sx = u.x, sy = u.y, ang = Math.atan2(ty - sy, tx - sx), L = Math.hypot(tx - sx, ty - sy);
        const st = { type: 'musuko', t: 0, trail: '#ffb0d0' };
        st.step = (dt) => {
          st.t += dt;
          const sp = (slot.spd || 640) * dt;
          u.x += Math.cos(ang) * sp; u.y += Math.sin(ang) * sp; u.facing = Math.cos(ang) >= 0 ? 1 : -1;
          const q = b.clampPos(u.x, u.y, u.pad, u); u.x = q.x; u.y = q.y;
          if (Math.random() < 0.3) b.fx.push({ type: 'after', x: u.x, y: u.y, def: u.fdef, back: !!u.lookUp, facing: u.facing, t: 0, dur: 0.25 });
          let hitU = null;
          for (const o of b.u) { // 경로상 먼저 닿은 유닛 (아군은 브로리만)
            if (o === u || o.dead || o.airborne || o.hidden) continue;
            if (o.team === u.team && !isBroly(o)) continue;
            if (dist(u, o) < 15 * (u.size + o.size) + 2) { hitU = o; break; }
          }
          if (hitU) { u.action = null; crushHit(u, hitU, b, slot); return; }
          if (st.t * (slot.spd || 640) >= L || st.t > 0.5) { u.action = null; u.dir = fixAngle(ang + Math.PI + rand(-0.6, 0.6)); }
        };
        u.action = st; playSfx('dash');
      });
    },
  };
  function crushHit(u, o, b, slot) {
    u.dir = fixAngle(Math.atan2(u.y - o.y, u.x - o.x) + rand(-0.5, 0.5));
    if (o.team === u.team) { // 브로리와 부딪힘 (피해 없음)
      b.stats.crushBroly = (b.stats.crushBroly || 0) + 1;
      b.text(o.x, o.y - 80, '!?', '#ffe0f0', 12);
      b.hitstop(0.1); b.zoomAt((u.x + o.x) / 2, (u.y + o.y) / 2 - 20, 0.05);
      awkward(u, o, b, slot);
      return;
    }
    const dmg = b.damage(u, o, u.st.atk * slot.mult, hit(slot, { big: true, color: '#ffd0e0' }));
    if (dmg <= 0) return;
    // 이블린식 히트 스톱 (짧은 슬로모션 + 줌 펄스)
    b.hitstop(0.12); b.zoomAt((u.x + o.x) / 2, (u.y + o.y) / 2 - 20, 0.06); b.shake(2);
    b.shock(o.x, o.y - 16, 6, 40, '#ffb0d0', 0.35, 4);
    if (o.gender === 'female' && !isBroly(o)) hearts(u, o, b);
    else awkward(u, o, b, slot);
  }
  function fxList(b) { return b.bfx || (b.bfx = []); }
  function hearts(u, o, b) { // 효과 없음: 화면 밖에서 하트가 모여들며 작아지고 선명해짐
    const H = { type: 'hearts', a: u, b: o, t: 0, dur: 1.1, items: [] }; // 모바일 최적화: 6개, 짧게
    for (let i = 0; i < 6; i++) { const ang = (i / 6) * TAU + rand(-0.2, 0.2); H.items.push({ ang, r0: rand(240, 300), ox: rand(-16, 16), oy: rand(-20, 6), delay: i * 0.04, s: rand(0.9, 1.15) }); }
    fxList(b).push(H);
    b.stats.hearts = (b.stats.hearts || 0) + 1;
    b.text((u.x + o.x) / 2, Math.min(u.y, o.y) - 80, '♥', '#ff8ac8', 16);
  }
  function awkward(u, o, b, slot) { // 남성/브로리: 전투당 첫 번째에만
    if (u.awkDone) { b.text(u.x, u.y - 66, '흠흠', '#c8c0d0', 9); return; }
    u.awkDone = true; b.stats.awkward = (b.stats.awkward || 0) + 1;
    fxList(b).push({ type: 'awk', a: u, b: o, t: 0, dur: 2.0 });
    sys(b, '……어색한 침묵이 흐른다.');
    b.later(0.25, () => voice(b, u, '…………'));
    b.later(0.65, () => { // 파라가스 꽈당 + 잠깐 기절
      if (u.dead || b.over) return;
      const s = b.applyStatus(u, 'stun', slot.selfStun || 1.4, u);
      if (s) { u.pose = 'fallen'; u.poseT = s.dur; s.selfFall = true; }
      b.text(u.x, u.y - 50, '꽈당!', '#ffe0a0', 12); b.dust(u.x, u.y); b.dust(u.x - 8, u.y);
      b.shock(u.x, u.y, 4, 26, '#d8d0c0', 0.3, 3);
    });
  }

  // ===================== 브로리 스킬 (일반) =====================
  function kiProj(u, o) { // 녹색 기탄 투사체 공통
    return Object.assign({ x: u.x + u.facing * 10, y: u.y - 26, src: u, trail: 0, kind: 'ki', draw: drawKi, col: '#7aff8a' }, o);
  }
  function drawKi(ctx, p, glowAt) {
    const r = p.r * (p.vis || 0.9), pul = 1 + 0.08 * Math.sin(p.life * 30);
    // 기탄의 진행 방향으로 꼬리를 늘리고, 외곽에 회전하는 에너지층을 표시.
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
    const tail = Math.min(65, r * 4), g = ctx.createLinearGradient(-tail, 0, 0, 0);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, p.col);
    ctx.fillStyle = g; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.7); ctx.quadraticCurveTo(-tail * 0.35, -r * 0.4, -tail, 0);
    ctx.quadraticCurveTo(-tail * 0.35, r * 0.4, 0, r * 0.7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = p.col; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
    for (let i = 0; i < 3; i++) {
      const a = p.life * 7 + i * TAU / 3;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.22, r * 0.92, 0, a, a + 0.9); ctx.stroke();
    }
    ctx.restore();
    glowAt(ctx, p.x, p.y, r * 2.6, p.col, 0.55);
    ctx.globalAlpha = 0.45; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, r * pul, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.fillStyle = p.core || '#c8ffc8'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.62, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x - r * 0.2, p.y - r * 0.2, r * 0.28, 0, TAU); ctx.fill();
    if (p.ring) { ctx.globalAlpha = 0.6; ctx.strokeStyle = '#f4ffb0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.25, p.life * 6, p.life * 6 + 4); ctx.stroke(); }
  }
  function kiBoom(b, x, y, r, col) {
    b.shock(x, y + 10, 5, r, col, 0.45, 5); b.glow(x, y, r * 1.2, col, 0.5); b.sparks(x, y, '#e8ffe0', 14, 220); b.shake(2);
  }
  SKILLS.throwBlaster = {
    desc: '거대한 기탄 하나를 시전 순간 상대 위치로 던집니다(타겟형).',
    canUse: (u, e, d) => d > 70 && d < 300 && !e.dead,
    use(u, e, b, slot) {
      const tx = e.x, ty = e.y - 18, sx = u.x + u.facing * 10, sy = u.y - 30, a = Math.atan2(ty - sy, tx - sx), dd = Math.hypot(tx - sx, ty - sy), sp = slot.spd || 430;
      u.pose = 'throw'; u.poseT = 0.6;
      b.telegraphLine(u.x, u.y - 6, u.x + Math.cos(a) * dd, u.y - 6 + Math.sin(a) * dd, 22, 0.32, '#7aff8a');
      b.glow(u.x + u.facing * 14, u.y - 62, 26, '#7aff8a', 0.4);
      b.windup(u, 0.32, () => {
        b.proj.push(kiProj(u, { x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spd: sp, dmg: u.st.atk * slot.mult, life: dd / sp + 0.3, r: 13,
          hit: hit(slot, { big: true, color: '#b8ffb0' }),
          onHit: (o) => kiBoom(b, o.x, o.y - 18, 46, '#7aff8a'),
          fizzle: p => kiBoom(b, p.x, p.y, 30, '#7aff8a') }));
        playSfx('shot');
      });
    },
  };
  // 지반 격파: 바닥을 내리쳐 주변 피해 + 넘어뜨림. 그 자리 바닥이 솟아 잠시 벽(장애물)이 됐다가 복구
  SKILLS.groundBreak = {
    desc: '앞쪽 바닥을 내리쳐 주변 상대에게 피해 + 넘어짐. 부서진 바닥이 솟아올라 몇 초간 벽(장애물)이 되었다가 원래대로 돌아옵니다. 돌진·넉백은 여기에 부딪혀 멈춥니다.',
    canUse: (u, e, d) => d < 140 && !e.airborne && !e.dead,
    use(u, e, b, slot) {
      const a = Math.atan2(e.y - u.y, e.x - u.x), off = Math.min(52, Math.max(40, dist(u, e) * 0.6)) + u.pad;
      const P = b.clampPos(u.x + Math.cos(a) * off, u.y + Math.sin(a) * off), R = slot.r || 50;
      b.telegraphCircle(P.x, P.y, R, 0.38, '#d8c8a8');
      b.glow(u.x, u.y - 50, 30, '#7aff8a', 0.35);
      b.windup(u, 0.38, () => {
        u.swing = 0.2;
        b.shock(P.x, P.y, 6, R + 14, '#e8d8b8', 0.5, 7); b.debris(P.x, P.y, 30); b.smoke(P.x, P.y - 6, '#a89880', 10);
        b.hitstop(0.1); b.shake(3.5); b.zoomAt(P.x, P.y, 0.05);
        for (let k = 0; k < 5; k++) b.crackLine(P.x, P.y, k / 5 * TAU + rand(-0.3, 0.3), R * rand(0.8, 1.2));
        for (const o of b.foes(u)) {
          if (o.airborne || Math.hypot(o.x - P.x, (o.y - P.y) / 0.75) > R + o.pad) continue;
          const dmg = b.damage(u, o, u.st.atk * slot.mult, hit(slot, { big: true }));
          if (dmg > 0) b.knockdown(u, o, slot.stun || 0.8);
        }
        b.areaBuildings(P.x, P.y, R * 0.6, 40, false);
        raiseRock(b, P.x, P.y, slot);
        b.stats.rocks = (b.stats.rocks || 0) + 1;
      });
    },
  };
  function raiseRock(b, x, y, slot) {
    const w = slot.w || 46, h = slot.h || 30;
    const rx = clamp(x - w / 2, AR.x + 2, AR.x + AR.w - w - 2), ry = clamp(y - h / 2, AR.y + 24, AR.y + AR.h - h - 4);
    const seed = Math.floor(rand(1, 9999)), pts = [];
    for (let i = 0; i < 9; i++) pts.push([rand(0.12, 0.88), rand(0.15, 0.85), rand(2, 5)]);
    const R = { x: rx, y: ry, w, h, hp: 1e9, maxHp: 1e9, dead: false, hitT: 0, cracks: [[], [], []], rubble: [], windows: [], solid: true, rock: true, life: slot.life || 6, maxLife: slot.life || 6, seed, pts, draw: drawRock };
    b.buildings.push(R);
    for (const o of b.u) if (!o.dead && !o.airborne) b.resolveBuildings(o, true); // 위에 있던 유닛은 밖으로 밀려남
    sys(b, '지반 격파! 바닥이 솟아올라 벽이 되었다!');
  }
  function drawRock(ctx, R) { // 솟아오른 암반: 등장/복구 시 높이 변화
    const age = R.maxLife - R.life, up = Math.min(1, age / 0.18) * Math.min(1, R.life / 0.5), Hh = 16 * up, j = R.hitT > 0 ? Math.round(rand(-1, 1)) : 0;
    const x = R.x + j, y = R.y;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 3, y + 3, R.w, R.h);
    ctx.fillStyle = '#5a4c40'; ctx.fillRect(x, y - Hh + R.h - 6, R.w, Hh + 6);          // 앞면
    ctx.fillStyle = '#7a6a58'; ctx.fillRect(x, y - Hh, R.w, R.h - 4);                    // 윗면
    ctx.fillStyle = '#8e7e6a'; ctx.fillRect(x + 2, y - Hh + 1, R.w - 4, 2);
    ctx.fillStyle = '#4a3e34'; ctx.fillRect(x, y - Hh + R.h - 5, R.w, 1);
    for (const [px, py, s] of R.pts) { ctx.fillStyle = s > 3.5 ? '#6a5a4a' : '#958470'; ctx.fillRect(Math.round(x + px * R.w), Math.round(y - Hh + py * (R.h - 6)), Math.round(s), Math.round(s * 0.6)); }
    ctx.strokeStyle = 'rgba(30,22,18,0.8)'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(x + R.w * 0.3, y - Hh + 2); ctx.lineTo(x + R.w * 0.42, y - Hh + 10); ctx.lineTo(x + R.w * 0.36, y - Hh + R.h - 6);
    ctx.moveTo(x + R.w * 0.7, y - Hh + 4); ctx.lineTo(x + R.w * 0.62, y - Hh + 14); ctx.stroke();
    // 앞면 균열 + 남은 시간 깜빡임
    if (R.life < 1.2) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(R.life * 25); ctx.fillStyle = '#d8c8a8'; ctx.fillRect(x, y - Hh, R.w, 2); }
    ctx.restore();
  }
  // 남겨둔 기탄: 아주 느린 추적형 거대 기탄. 일정 시간 뒤 소멸. 파라가스도 맞을 수 있음
  SKILLS.leftoverKi = {
    desc: '아주 느리지만 끝까지 대상을 쫓는 거대한 기탄을 남겨둡니다(추적형). 일정 시간이 지나면 사라집니다. 경로의 파라가스도 맞고 피해를 입습니다.',
    canUse: (u, e, d, b) => d > 60 && !e.dead && !b.proj.some(p => p.src === u && p.kind === 'kiLeft'),
    use(u, e, b, slot) {
      b.glow(u.x, u.y - 40, 34, '#7aff8a', 0.4);
      b.windup(u, 0.3, () => {
        u.swing = 0.2;
        b.proj.push(kiProj(u, { y: u.y - 34, vx: 0, vy: 0, spd: slot.spd || 70, homing: true, tgt: e, dmg: u.st.atk * slot.mult, life: slot.life || 8, r: 17, kind: 'kiLeft', ring: true, col: '#5aff7a',
          hitAlly: isParagus,
          onHitUnit(o, p) {
            const dmg = b.damage(u, o, p.dmg, hit(slot, { big: true, viaProj: true, color: '#b8ffb0' }));
            kiBoom(b, p.x, p.y, 60, '#5aff7a'); b.hitstop(0.08);
            if (o.team === u.team) { b.text(o.x, o.y - 80, '브, 브로리?!', '#ffe0a0', 10); sys(b, '남겨둔 기탄이 파라가스를 덮쳤다!'); b.stats.kiFriendly = (b.stats.kiFriendly || 0) + 1; }
          },
          fizzle: p => { b.smoke(p.x, p.y, '#8aff9a', 8); b.text(p.x, p.y - 14, '피식…', '#b8ffb0', 9); } }));
      });
    },
  };

  // ===================== 브로리 스킬 (전설의 슈퍼사이어인) =====================
  // 암반: 붙잡아서 맵 위쪽 끝까지 돌진해 박아버림 (라인하르트 돌진의 제압/벽 충돌 재사용)
  SKILLS.bedrock = {
    desc: '상대에게 달려들어 붙잡으면, 그대로 맵 위쪽 끝까지 돌진해 처박습니다(벽 충돌 시 큰 피해). 공중 상대는 잡을 수 없습니다.',
    canUse: (u, e, d) => d < 120 && !e.airborne && !e.dead,
    use(u, e, b, slot) {
      b.glow(u.x, u.y - 40, 34, '#c8ff6a', 0.35);
      b.windup(u, 0.12, () => b.chase(u, e, 820, 0.4, () => {
        if (e.dead || e.airborne || e.climb || e.inTrain) { b.text(u.x, u.y - 80, '놓쳤다', '#d8e8b0', 10); return; }
        if (e.counter || e.evadeT > b.time) { if (e.counter) b.counterTrigger(e, u); return; }
        b.text(e.x, e.y - 80, '붙잡힘!', '#e8ff9a', 12);
        b.hitstop(0.08); b.shock(e.x, e.y - 18, 6, 34, '#c8ff6a', 0.3, 4);
        b.charge(u, -Math.PI / 2, slot.spd || 620, slot, { tgt: e, pin: true, trail: '#d8ff6a', maxT: 3,
          onImpact: (t, w) => { b.shock(w.x, w.y - 10, 10, 90, '#c8ff6a', 0.6, 8); b.glow(w.x, w.y - 14, 70, '#c8ff6a', 0.5); b.stats.bedrock = (b.stats.bedrock || 0) + 1; sys(b, `암반! ${t.def.name}을(를) 처박았다!`); } });
      }, '#d8ff6a'));
      if (u.action && u.action.type === 'wind') { const nx = u.action.next; u.action.next = () => { nx(); if (u.action && u.action.type === 'chase') u.action.reach = 15 * (u.size + e.size) + 4; }; }
    },
  };
  // 무시카라 사커: 시전 순간 가까운 상대가 있어야 성공. 눕힌 뒤 걷어차 공중으로 (앞/뒷모습 번갈아 굴러감) → 착지
  SKILLS.soccer = {
    desc: '시전 순간 가까운 상대가 있어야 성공. 상대를 바닥에 눕힌 뒤 힘껏 걷어차 공중으로 날려 보냅니다(빙글빙글 굴러가다 착지 후 넘어짐).',
    canUse: (u, e, d) => d < 95 && !e.airborne && !e.dead,
    use(u, e, b, slot) {
      const near = slot.near || 62;
      const o = b.foes(u).filter(f => !f.airborne && !f.climb && !f.inTrain && dist(u, f) < near + u.pad + f.pad).sort((p, q) => dist(u, p) - dist(u, q))[0];
      if (!o) { u.swing = 0.2; b.slashFx(u.x + u.facing * 22, u.y - 10, u.facing, '#d8ffa0', 1); b.text(u.x, u.y - 80, '헛발질!', '#d8e8b0', 10); playSfx('whiff'); return; }
      if (o.counter || o.evadeT > b.time) { if (o.counter) b.counterTrigger(o, u); return; }
      o.action = null; o.push = null;
      const s = b.applyStatus(o, 'stun', 0.55, u); if (s) { s.knock = true; o.knockSide = o.x < u.x ? -1 : 1; }
      b.text(o.x, o.y - 70, '눕혀라!', '#e8ff9a', 10); b.dust(o.x, o.y);
      u.action = { type: 'wind', t: 0.3 };
      b.later(0.28, () => {
        if (o.dead || u.dead || b.over) return;
        o.statuses = o.statuses.filter(x => x !== s);
        u.swing = 0.2;
        const dmg = b.damage(u, o, u.st.atk * slot.mult, hit(slot, { big: true, color: '#e8ffa0' }));
        if (dmg <= 0) return;
        const ang = Math.atan2(o.y - u.y, o.x - u.x) + rand(-0.3, 0.3), q = b.clampPos(o.x + Math.cos(ang) * (slot.fling || 150), o.y + Math.sin(ang) * (slot.fling || 150), o.pad, o);
        o.air = { t: 0, dur: 1.0, h: 58, tumble: true, fling: { x0: o.x, y0: o.y, x1: q.x, y1: q.y } };
        b.hitstop(0.1); b.shake(3); b.zoomAt(o.x, o.y - 20, 0.05);
        b.shock(o.x, o.y - 6, 6, 44, '#e8ffa0', 0.4, 5); b.sparks(o.x, o.y - 14, '#f4ffc0', 16, 260);
        b.text(o.x, o.y - 86, '킥!', '#f4ffa0', 14);
        b.stats.soccer = (b.stats.soccer || 0) + 1;
        b.later(1.02, () => { if (!o.dead && !b.over && !o.airborne) { b.knockdown(u, o, 0.5); b.dust(o.x, o.y); } });
      });
    },
  };
  // 데덴탄: 거대한 추적형 기탄 3발 연속. 닿은 상대 팀 투사체를 상쇄(소멸)
  SKILLS.dedentan = {
    desc: '거대한 추적형 기탄 3발을 연속으로 날립니다. 기탄에 닿은 상대의 원거리 투사체는 소멸합니다.',
    canUse: (u, e, d) => d > 50 && d < 320 && !e.dead,
    use(u, e, b, slot) {
      b.glow(u.x, u.y - 50, 40, '#c8ff6a', 0.45);
      const n = slot.n || 3;
      u.action = { type: 'wind', t: n * (slot.gap || 0.32) + 0.1 };
      for (let i = 0; i < n; i++) b.later(0.12 + i * (slot.gap || 0.32), () => {
        if (u.dead || b.over) return;
        const t = e.dead ? b.enemy(u) : e; if (t.dead) return;
        u.swing = 0.2; u.facing = t.x >= u.x ? 1 : -1;
        const a = Math.atan2(t.y - u.y, t.x - u.x), sp = slot.spd || 300;
        b.proj.push(kiProj(u, { x: u.x + Math.cos(a) * 18, y: u.y - 36, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spd: sp, homing: true, tgt: t, dmg: u.st.atk * slot.mult, life: 3.2, r: 15, kind: 'deden', cancel: true, ring: true, col: '#b8ff4a', core: '#f4ffc0',
          hit: hit(slot, { big: true, color: '#e8ffa0' }),
          onHit: (o) => kiBoom(b, o.x, o.y - 18, 50, '#b8ff4a'),
          fizzle: p => kiBoom(b, p.x, p.y, 26, '#b8ff4a') }));
        b.ring(u.x, u.y - 36, 4, 22, 0.25, '#e8ffa0'); playSfx('shot');
      });
    },
  };

  // ===================== 연출 훅 (하트 / 어색한 침묵) =====================
  // 하트/땀방울은 오프스크린 캔버스에 한 번만 그려두고 drawImage (매 프레임 path/filter 없음)
  let HEART_IMG = null, DROP_IMG = null;
  function bake(w, h, rows, col) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = col;
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] === 'X') g.fillRect(i, j, 1, 1);
    return c;
  }
  function heartImg() { return HEART_IMG || (HEART_IMG = bake(7, 6, ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'], '#ff6ab4')); }
  function dropImg() { return DROP_IMG || (DROP_IMG = bake(3, 5, ['.X.', '.X.', 'XXX', 'XXX', '.X.'], '#8fd0ff')); }
  const DOTS = ['', '·', '··', '···', '····', '·····', '······'];
  STAGE_HOOKS.push({
    match: () => false,
    step(b, dt) {
      if (!b.bfx) return;
      for (let i = b.bfx.length - 1; i >= 0; i--) { const f = b.bfx[i]; f.t += dt; if (f.t >= f.dur) b.bfx.splice(i, 1); } // 할당 없이 제거
      for (const u of b.u) if (u.def.id === 'paragus' && u.poseT > 0 && u.pose === 'fallen' && !u.status('stun')) u.poseT = 0; // 기절이 풀리면 일어남
    },
    drawTop(ctx, b) {
      if (!b.bfx || !b.bfx.length) return;
      for (const f of b.bfx) {
        const mx = (f.a.x + f.b.x) / 2, my = (f.a.y + f.b.y) / 2 - 26;
        ctx.save();
        if (f.type === 'hearts') { // 화면 밖에서 모여들며 작아지고 진해짐 (blur 대신 크기+알파로 표현)
          const img = heartImg(), D = f.dur * 0.7;
          ctx.imageSmoothingEnabled = false;
          for (let i = 0; i < f.items.length; i++) {
            const h = f.items[i], p = clamp((f.t - h.delay) / D, 0, 1); if (p <= 0) continue;
            const k = ease(p), r = h.r0 * (1 - k);
            const x = mx + h.ox * k + Math.cos(h.ang) * r, y = my + h.oy * k + Math.sin(h.ang) * r * 1.3;
            const sc = (2.6 - 1.4 * k) * h.s, w = 7 * sc, hh = 6 * sc;
            ctx.globalAlpha = (0.25 + 0.75 * k) * (p >= 1 ? Math.max(0, 1 - (f.t - h.delay - D) / 0.25) : 1);
            ctx.drawImage(img, x - w / 2, y - hh / 2, w, hh);
          }
        } else if (f.type === 'awk') { // 어색한 침묵: 차가운 공기 + 식은땀 + "……"
          const P = f.t / f.dur, A = P < 0.12 ? P / 0.12 : P > 0.8 ? (1 - P) / 0.2 : 1;
          ctx.globalAlpha = 0.18 * A; ctx.fillStyle = '#5a6a8a'; ctx.fillRect(mx - 56, my - 14, 112, 64); // 썰렁한 공기 (사각 한 장)
          ctx.globalAlpha = 0.5 * A; ctx.fillStyle = '#c8d4f0';
          for (let i = 0; i < 3; i++) ctx.fillRect(mx - 60 + ((f.t * 40 + i * 37) % 120), my - 10 + i * 14, 14, 1); // 썰렁한 바람
          const di = dropImg(); ctx.imageSmoothingEnabled = false;
          for (let n = 0; n < 2; n++) { // 식은땀 (흘러내림)
            const u = n ? f.b : f.a, top = u.y - Sprites.get(u.fdef).dh * 0.82 - b.airZ(u), hx = u.x - u.facing * 9;
            const d = (f.t * 1.2) % 1; ctx.globalAlpha = A * (1 - d * 0.6); ctx.drawImage(di, hx - 3, top + d * 14 - 4, 6, 10);
          }
          ctx.globalAlpha = A; ctx.font = 'bold 14px "Galmuri11", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const t = DOTS[Math.min(6, Math.floor(f.t / 0.15))]; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,18,30,0.85)'; ctx.strokeText(t, mx, my - 46); ctx.fillStyle = '#e8eaf4'; ctx.fillText(t, mx, my - 46);
        }
        ctx.restore();
      }
    },
  });
})();
