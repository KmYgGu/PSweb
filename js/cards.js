/* =========================================================
 * 듀얼리스트 카드 정의 (CARDS 템플릿)
 * ---------------------------------------------------------
 *  ⚠ 이 파일의 카드는 전부 [임시 테스트 카드] 입니다. (id가 T_ 로 시작)
 *    실제 카드 디자인이 나오면 아래 TEST_CARDS 목록을 통째로 교체하고,
 *    덱(TEST_DECK)과 캐릭터 정의(js/duel.js 하단 '듀얼리스트 (테스트)')의 deck 을 바꾸면 됩니다.
 *
 *  카드 형식
 *  {
 *    id: 'T_M01',                    // 고유 id (덱 목록에 쓰임)
 *    name: '견습 마술사',             // 로그 / 카드 팝업에 표시
 *    type: 'monster' | 'spell' | 'trap',
 *    level: 3,                       // 몬스터만. ≤4 자유 / 5~6 릴리스1 / 7~8 릴리스2 / 9+ 릴리스3
 *    atk: 1200, def: 800,            // 몬스터만. 유희왕 수치 그대로 → 게임 피해 = ATK × DUEL.CFG.ATK_SCALE (0.035)
 *    element: 'dark',                // (선택) 피해 속성 (ELEMENT_DEFS 키). 기본 'dark'
 *    text: '효과 설명',               // 선택 화면/README 용 설명
 *    lines: ['대사'],                 // (선택) 발동 시 로그에 나오는 대사 (말풍선 없음)
 *    effect(ctx, ev) { ... },        // 효과 본체. ctx = 카드 컨텍스트 API (README '카드 컨텍스트 API')
 *    trigger: { on: 'oppSkill', when(ctx, ev) { return true; } },  // 함정만: 발동 조건
 *        on: 'oppAttack'(상대 기본 공격 시작) | 'oppSkill'(상대 스킬/카드 사용) | 'damaged'(피격)
 *            | 'projectile'(상대 투사체 접근) | 'lowLp'(매 프레임 검사, when 으로 기준 지정)
 *            | 'oppDash'(상대 돌진 접근) | 'oppAirborne'(상대 공중)
 *    ai: { ... },                    // AI 힌트 (아래)
 *    borrowable: true,               // (선택, 기본 true) 패스트푸드점 손님 효과로 다른 캐릭터가 빌려 쓸 수 있는지
 *  }
 *
 *  ai 힌트 (전부 선택)
 *    priority  기본 점수 가산            tags  ['damage','heal','draw','defense','control','grave']
 *    range     사용 가능 거리(px)         melee  true 면 공중 상대에게 사용 안 함
 *    dmg       예상 피해 (ATK 배율)       dmgRaw 예상 피해 (게임 수치, 마법/함정용)
 *    heal      회복 LP                   draw   드로우 장수 (덱이 적으면 자동 회피)
 *    lpCost    LP 지불량                 buffType 이미 같은 버프가 있으면 사용 안 함
 *    keep      릴리스 후보로서의 보존 가치 (높을수록 릴리스로 덜 버림)
 *    when(S, ctx)   false 면 지금은 사용 불가 (보류)
 *    score(S, ctx)  상황 점수 가산 (S = 상황 객체, README 'AI' 참고)
 *    activate(S, ev) 함정: 조건이 맞아도 지금 발동할지 (기본 true)
 * ========================================================= */
const CARD_DEFS = {};

// ---------------- [임시 테스트 카드] 시작 (파일에만 남김: 덱/선택 화면에는 쓰지 않음) ----------------
const TEST_CARDS = [
  // ===== 몬스터 (레벨 2~9) =====
  { id: 'T_M01', name: '견습 마술사', type: 'monster', level: 3, atk: 1200, def: 800, element: 'dark',
    text: '마력탄 1발 (ATK×1.1, 유도).',
    effect(ctx) { ctx.shoot({ dmg: ctx.atk(1.1), kind: 'magic' }); },
    ai: { tags: ['damage'], range: 260, dmg: 1.1 } },

  { id: 'T_M02', name: '돌격 전사', type: 'monster', level: 4, atk: 1800, def: 1000, element: 'slash',
    text: '상대에게 돌진해 벤다 (ATK×1.0, 근접).', lines: ['돌격 전사, 공격!'],
    effect(ctx) { ctx.rush(ctx.atk(1.0)); },
    ai: { tags: ['damage'], range: 170, melee: true, dmg: 1.0 } },

  { id: 'T_M03', name: '방패 골렘', type: 'monster', level: 4, atk: 500, def: 2100, element: 'blunt',
    text: '4초간 받는 피해 45% 감소.',
    effect(ctx) { ctx.buff({ type: 'golemGuard', name: '바위 방벽', dur: 4, dmgTaken: 0.55 }); ctx.b.ring(ctx.u.x, ctx.u.y - 16, 6, 30, 0.4, '#d8c8a0'); },
    ai: { tags: ['defense'], buffType: 'golemGuard', keep: 6 } },

  { id: 'T_M04', name: '번개 요정', type: 'monster', level: 2, atk: 800, def: 600, element: 'elec',
    text: '낙뢰 (ATK×1.2, 즉시 적중) + 60% 확률 마비 2초. 공중 상대에게 유리.',
    effect(ctx) { ctx.bolt(ctx.atk(1.2), { applies: [{ status: 'paralysis', duration: 2, chance: 0.6 }] }); },
    ai: { tags: ['damage', 'control'], range: 240, dmg: 1.2, keep: -4, score: S => (S.oppAir ? 10 : 0) } },

  { id: 'T_M05', name: '묘지기 박쥐', type: 'monster', level: 3, atk: 1000, def: 1000, element: 'dark',
    text: '묘지의 마법 카드 1장을 패로 + 초음파 (ATK×0.8).',
    effect(ctx) { const c = ctx.grave.toHand('spell'); if (c) ctx.text(c.def.name + ' 회수', '#9cf0c0'); ctx.shoot({ dmg: ctx.atk(0.8) }); },
    ai: { tags: ['damage', 'grave'], range: 260, dmg: 0.8, score: S => (S.graveSpells > 0 ? 14 : -6) } },

  { id: 'T_M06', name: '화염 비룡', type: 'monster', level: 6, atk: 2400, def: 1700, element: 'fire',
    text: '[릴리스 1] 화염 브레스 (부채꼴, ATK×1.0) + 3초간 비룡의 혼이 화염탄 지원.', lines: ['날아올라라, 화염 비룡!'],
    effect(ctx) { ctx.fan(ctx.atk(1.0), { range: 170, spread: 0.7 }); ctx.summon({ dur: 3, rate: 1, mult: 0.35 }); },
    ai: { tags: ['damage'], range: 170, dmg: 1.7, priority: 8 } },

  { id: 'T_M07', name: '암흑 기사', type: 'monster', level: 7, atk: 2700, def: 2000, element: 'dark',
    text: '[릴리스 2] 돌진 베기 (ATK×1.1, 기절 1초) + 4초간 기사의 혼이 지원 사격.', lines: ['어둠의 기사여, 나와라!'],
    effect(ctx) { ctx.rush(ctx.atk(1.1), { applies: [{ status: 'stun', duration: 1.0 }] }); ctx.summon({ dur: 4, rate: 1, mult: 0.3 }); },
    ai: { tags: ['damage', 'control'], range: 190, melee: true, dmg: 2.0, priority: 12 } },

  { id: 'T_M08', name: '태초의 용', type: 'monster', level: 9, atk: 3500, def: 3000, element: 'light',
    text: '[릴리스 3] 섬멸의 폭류: 관통 광선 (ATK×1.3, 방어 50% 무시, 사거리 무제한).', lines: ['강림하라, 태초의 용! 섬멸의 폭류!'],
    effect(ctx) { ctx.beam(ctx.atk(1.3), { pierce: 0.5, windup: 0.45 }); },
    ai: { tags: ['damage'], range: 9999, dmg: 1.3, priority: 18 } },

  { id: 'T_M09', name: '망령 술사', type: 'monster', level: 5, atk: 2000, def: 1400, element: 'dark',
    text: '[릴리스 1] 묘지에서 가장 강한 몬스터를 소생해 그 효과를 80% 위력으로 발동. 없으면 저주탄 (ATK×0.9).',
    effect(ctx) { if (!ctx.grave.revive('monster', { mult: 0.8 })) ctx.shoot({ dmg: ctx.atk(0.9) }); },
    ai: { tags: ['grave', 'damage'], range: 260, dmg: 0.9, score: S => (S.graveBestAtk >= 2400 ? 22 : S.graveMonsters ? 6 : -6) } },

  // ===== 마법 =====
  { id: 'T_S01', name: '회복의 비약', type: 'spell', text: 'LP 1000 회복.',
    effect(ctx) { ctx.heal(1000); },
    ai: { tags: ['heal'], heal: 1000 } },

  { id: 'T_S02', name: '강욕한 항아리', type: 'spell', text: '카드 2장 드로우 (덱이 0장일 때 드로우하면 패배!).', lines: ['카드를 2장 드로우!'],
    effect(ctx) { ctx.draw(2); },
    ai: { tags: ['draw'], draw: 2 }, borrowable: false },

  { id: 'T_S03', name: '파멸의 계약', type: 'spell', element: 'fire', text: 'LP 1000 지불 → 0.5초 뒤 상대 위치 폭발 (2000 상당 피해).',
    effect(ctx) { if (ctx.payLp(1000)) ctx.blast(ctx.val(2000), { r: 52, delay: 0.5 }); },
    ai: { tags: ['damage'], dmgRaw: 2000 * 0.035, lpCost: 1000, range: 300 } },

  { id: 'T_S04', name: '속박의 사슬', type: 'spell', text: '상대를 2.5초 속박 (이동 불가) + 300 상당 피해.',
    effect(ctx) { ctx.chain(ctx.e, ctx.val(300), 2.5); },
    ai: { tags: ['control'], range: 260, score: S => (S.oppCasting ? 12 : 0) + (S.oppStunned ? -40 : 0) + (S.oppMelee && S.d < 120 ? 8 : 0) } },

  // ===== 함정 =====
  { id: 'T_T01', name: '미러 포스 (테스트)', type: 'trap', text: '상대가 기본 공격할 때: 그 공격을 무효로 하고 1500 상당 반사 피해 + 넉백.',
    trigger: { on: 'oppAttack', when: (ctx, ev) => ev.src && Math.hypot(ev.src.x - ctx.u.x, ev.src.y - ctx.u.y) < 260 },
    effect(ctx, ev) { ctx.negate(); ctx.reflect(ev.src, ctx.val(1500)); },
    ai: { priority: 4, score: S => (S.oppMelee ? 8 : 2) } },

  { id: 'T_T02', name: '스킬 봉인의 함정', type: 'trap', text: '상대가 스킬(또는 카드)을 사용할 때: 무효로 하고 3초간 봉인.',
    trigger: { on: 'oppSkill' },
    effect(ctx, ev) { ctx.negate(); if (ev.src) { ctx.status(ev.src, 'seal', 3); ctx.b.shock(ev.src.x, ev.src.y - 16, 4, 30, '#a8a0ff', 0.4, 3); } },
    ai: { priority: 8, score: S => (S.oppHasSkills ? 6 : -30) } },

  { id: 'T_T03', name: '반사 장벽', type: 'trap', text: '상대 투사체가 다가올 때: 주변의 상대 투사체를 모두 소멸 + 800 상당 반격탄.',
    trigger: { on: 'projectile' },
    effect(ctx) { ctx.clearProjectiles(120); ctx.shoot({ dmg: ctx.val(800), kind: 'holy' }); },
    ai: { priority: 2, score: S => (S.oppRanged ? 14 : -14) } },

  { id: 'T_T04', name: '리빙 데드의 부름', type: 'trap', text: 'LP가 35% 이하가 되면: 묘지의 가장 강한 몬스터를 소생해 효과 발동 + LP 500 회복.',
    trigger: { on: 'lowLp', when: ctx => ctx.u.hp < ctx.u.maxHp * 0.35 && ctx.grave.count('monster') > 0 },
    effect(ctx) { ctx.grave.revive('monster', { mult: 1 }); ctx.heal(500); },
    ai: { priority: 0, score: S => (S.graveMonsters > 0 ? 8 : -4) + (S.myHpR < 0.6 ? 8 : 0) } },
];
// ---------------- [임시 테스트 카드] 끝 ----------------

TEST_CARDS.forEach(c => { CARD_DEFS[c.id] = { ...c, test: true, borrowable: false }; });

// [임시] 테스트 덱 40장: 몬스터 20 / 마법 8 / 함정 12   — { id: 장수 }
const TEST_DECK = {
  T_M01: 3, T_M02: 3, T_M03: 2, T_M04: 3, T_M05: 2, T_M06: 2, T_M07: 2, T_M08: 1, T_M09: 2,
  T_S01: 2, T_S02: 2, T_S03: 2, T_S04: 2,
  T_T01: 3, T_T02: 3, T_T03: 3, T_T04: 3,
};


/* =========================================================
 * 유희 덱 (40장, 각 1장) — 카드 id Y01~Y40 = 유저 목록 번호
 *  shout: 사용 시 로그 / 팝업 대사 (유저 지정 문구. 없으면 카드명!)
 *  sprite: 소환 연출용 몬스터 혼 (js/duel_sprites.js)
 * ========================================================= */
const EXODIA_IDS = ['Y05', 'Y06', 'Y07', 'Y08', 'Y09'];
const isPiece = d => EXODIA_IDS.includes(d.id);
const isGod = d => d.type === 'monster' && d.level >= 10;
const YUGI_CARDS = [
  { id: 'Y01', name: '데몬 소환', type: 'monster', level: 6, atk: 2500, def: 1200, element: 'elec', sprite: 'summonedSkull', shout: '마법의 번개파!',
    text: '[릴리스 1] 번개를 내뿜으며 공격: 낙뢰 3연타 (각 ATK×0.45, 30% 마비).',
    effect(ctx) { ctx.bolts(3, ctx.atk(0.45), { applies: [{ status: 'paralysis', duration: 1.5, chance: 0.3 }] }); },
    ai: { tags: ['damage'], range: 240, dmg: 1.35, priority: 6 } },
  { id: 'Y02', name: '블랙 매지션', type: 'monster', level: 7, atk: 2500, def: 2100, element: 'dark', sprite: 'darkMagician', shout: '블랙 매직!',
    text: '[릴리스 2] 어둠 마력구 (ATK×1.2, 유도).',
    effect(ctx) { ctx.shoot({ dmg: ctx.atk(1.2), kind: 'magic', r: 16, spd: 380 }); ctx.b.glow(ctx.origin().x, ctx.origin().y, 30, '#9a6aff', 0.4); },
    ai: { tags: ['damage'], range: 280, dmg: 1.2, priority: 8 } },
  { id: 'Y03', name: '암흑 기사 가이아', type: 'monster', level: 7, atk: 2300, def: 2100, element: 'slash', sprite: 'gaia', shout: '나선창살!',
    text: '[릴리스 2] 상대를 꿰뚫고 지나가는 돌격 (ATK×1.25, 근접, 제압 없음).',
    effect(ctx) { ctx.charge(ctx.atk(1.25)); },
    ai: { tags: ['damage'], range: 230, melee: true, dmg: 1.25, priority: 8 } },
  { id: 'Y04', name: '성스러운 방어막 거울의힘!', type: 'trap',
    text: '상대 공격이 닿을 때: 받을 피해를 받지 않고 그대로 상대에게 돌려준다.',
    trigger: { on: 'oppHit', when: (ctx, ev) => ev.amount > 0 },
    effect(ctx, ev) { ctx.negate(); ctx.reflect(ev.src, ev.amount, { knock: true }); },
    ai: { priority: 6, score: S => (S.oppSkillSoon < 2 ? 6 : 0) } },
  { id: 'Y05', name: '봉인된 엑조디아', type: 'monster', level: 3, atk: 1000, def: 1000, element: 'fire', sprite: 'exodia', shout: '분노의 업화 엑조드 파이어!',
    text: '봉인된 카드 5장(엑조디아+팔다리 4장)이 패에 모이면 즉시 승리. 사용 시: 작은 화염탄 (ATK×0.8).',
    effect(ctx) { ctx.shoot({ dmg: ctx.atk(0.8), kind: 'flame' }); },
    ai: { tags: ['damage'], range: 260, dmg: 0.8, keep: 999, when: S => S.desperate }, borrowable: false },
  ...[['Y06', '봉인된 자의 오른쪽 다리', 'exLeg'], ['Y07', '봉인된 자의 왼쪽 다리', 'exLeg'], ['Y08', '봉인된 자의 오른쪽 팔', 'exArm'], ['Y09', '봉인된 자의 왼쪽 팔', 'exArm']].map(([id, name, sp]) => (
    { id, name, type: 'monster', level: 1, atk: 200, def: 300, element: 'blunt', sprite: sp, flip: id === 'Y07' || id === 'Y09',
      text: '엑조디아의 봉인된 부위. 사용 시: 약한 타격 (ATK×1.0). AI는 패에 보관.',
      effect(ctx) { ctx.shoot({ dmg: ctx.atk(1.0), kind: 'flame' }); },
      ai: { tags: ['damage'], range: 260, dmg: 1, keep: 999, when: S => S.desperate }, borrowable: false })),
  { id: 'Y10', name: '크리보', type: 'monster', level: 1, atk: 300, def: 200, element: 'dark', sprite: 'kuriboh', shout: '기뢰화!',
    text: '상대의 다음 공격 1회를 무효로 하는 방패 (12초 지속).',
    effect(ctx) { ctx.kuriboh(12); },
    ai: { tags: ['defense'], keep: 4, when: S => !S.kuriboh, score: S => (S.oppAtkSoon ? 10 : 0) + (S.oppSkillSoon < 1.5 ? 8 : 0) } },
  { id: 'Y11', name: '욕망의 항아리', type: 'spell', text: '카드 2장 드로우.',
    effect(ctx) { ctx.draw(2); }, ai: { tags: ['draw'], draw: 2 }, borrowable: false },
  { id: 'Y12', name: '하늘의 선물', type: 'spell', text: '상대의 스킬 쿨타임을 모두 초기화(즉시 사용 가능)하고, 자신은 5장 드로우.',
    effect(ctx) { ctx.foeCooldowns('ready'); ctx.draw(5); },
    ai: { tags: ['draw'], draw: 5, score: S => (S.oppHasSkills ? (S.oppSkillSoon > 2 ? -26 : -8) : 6) + (S.hand <= 1 ? 12 : 0) }, borrowable: false },
  { id: 'Y13', name: '죽은 자의 소생', type: 'spell', text: '묘지 몬스터 1장의 효과를 레벨·릴리스와 관계없이 발동 (AI가 가장 좋은 것 선택).',
    effect(ctx) { const c = ctx.bestGrave(); if (c) ctx.useMonster(c, { label: '소생', keepZone: 'grave' }); },
    ai: { tags: ['grave'], when: S => S.graveMonsters > 0, score: S => S.bestGraveScore + 2 } },
  { id: 'Y14', name: '오시리스의 천공룡', type: 'monster', level: 10, atk: 4000, def: 4000, element: 'elec', sprite: 'osiris', shout: '썬더 포스!',
    text: '[릴리스 3] 맵 전체 낙뢰: 상대 전원에게 최대 체력의 16% 피해 + 다음 공격 피해 ×0.5.',
    effect(ctx) { ctx.thunderForce(0.16); },
    ai: { tags: ['damage'], est: S => S.foes.reduce((s, f) => s + 0.16 * S.effMax(f), 0), priority: 18, keep: 30 } },
  { id: 'Y15', name: '오벨리스크의 거신병', type: 'monster', level: 10, atk: 4000, def: 4000, element: 'blunt', sprite: 'obelisk', shout: '갓 핸드 크러셔!',
    text: '[릴리스 3] 거대한 주먹으로 지면 강타: 직격 ATK×1.2, 맵 전체 충격파로 지상의 상대 기절 1.2초 + ATK×0.15 (공중은 충격파 무효).',
    effect(ctx) { ctx.godHand(ctx.atk(1.2), ctx.atk(0.15), 1.2); },
    ai: { tags: ['damage', 'control'], range: 9999, dmg: 0.9, priority: 18, keep: 30 } },
  { id: 'Y16', name: '라의 익신룡', type: 'monster', level: 10, atk: 0, def: 0, element: 'fire', sprite: 'ra', shout: '갓 브레이즈 캐논!',
    text: '[릴리스 3] LP를 1%만 남기고 전부 지불. 지불한 LP에 비례해 화염 포격의 위력(지불 LP×0.035×1.2)과 범위가 커짐.',
    effect(ctx) { ctx.raCannon(); },
    ai: { tags: ['damage'], est: S => Math.max(0, S.myLp - Math.ceil(S.u.maxHp * 0.01)) * 0.035 * 1.2, priority: 0, keep: 30,
          when: S => { const est = Math.max(0, S.myLp - Math.ceil(S.u.maxHp * 0.01)) * 0.035 * 1.2 * 100 / (100 + S.oppDef); return est >= S.oppTargetEff * 1.05 && !S.multi || est >= S.oppEff * 1.05; } } },
  { id: 'Y17', name: '탐욕의 항아리', type: 'spell', text: '묘지의 몬스터 5장을 덱으로 되돌려 셔플 후 2장 드로우. (묘지 몬스터 5장 필요)',
    effect(ctx) { ctx.avarice(); },
    ai: { tags: ['draw'], draw: 2, when: S => S.graveMonsters >= 5, score: S => (S.piecesInGrave ? 20 : 0) + (S.deck < 10 ? 10 : 0) }, borrowable: false },
  { id: 'Y18', name: '몬스터 회수', type: 'spell', text: '패의 몬스터 1장을 덱으로 되돌리고, 그 레벨만큼 드로우.',
    effect(ctx) { ctx.monsterRecovery(); },
    ai: { tags: ['grave'], when: S => !!S.recoveryPick, score: S => S.recoveryPick ? 8 + 7 * S.recoveryPick.def.level + S.pieces * 4 - (S.hand >= 6 ? 15 : 0) : -999 }, borrowable: false },
  { id: 'Y19', name: '리빙데드가 부르는 소리!', type: 'trap', text: '상대에게 공격받았을 때(피격): 묘지 몬스터 1장의 효과를 발동 (AI가 가장 좋은 것 선택).',
    trigger: { on: 'damaged', when: ctx => ctx.grave.count('monster') > 0 },
    effect(ctx) { const c = ctx.bestGrave(); if (c) ctx.useMonster(c, { label: '소생', keepZone: 'grave' }); },
    ai: { priority: 4, score: S => (S.graveMonsters > 0 ? 6 : -20) + (S.graveBestAtk >= 2400 ? 6 : 0) } },
  { id: 'Y20', name: '엘프 검사', type: 'monster', level: 4, atk: 1400, def: 1200, element: 'slash', sprite: 'elf', shout: '스파이럴 소드 어택',
    text: '전방 베기 (ATK×1.0). 사용 직후 1.5초 안에 받는 상대의 기본/충돌 공격 피해 무효.',
    effect(ctx) { ctx.elfGuard(1.5); ctx.fan(ctx.atk(1.0), { range: 95, spread: 0.6, delivery: 'melee', color: '#c8ffd0' }); },
    ai: { tags: ['damage'], range: 110, dmg: 1.0, score: S => (S.oppAtkSoon ? 24 : 0) } },
  { id: 'Y21', name: '퀸즈 나이트', type: 'monster', level: 4, atk: 1500, def: 1600, element: 'slash', sprite: 'queen', shout: '퀸즈 세이버 크러시!',
    text: '넓은 베기 (ATK×1.0, 근접 넓은 부채꼴), 적중 시 2초 둔화.',
    effect(ctx) { ctx.fan(ctx.atk(1.0), { range: 105, spread: 1.0, delivery: 'melee', color: '#ffb0c0', applies: [{ status: 'slow', duration: 2 }] }); },
    ai: { tags: ['damage'], range: 115, dmg: 1.0, score: S => (S.inHand('Y22') && S.inDeck('Y23') ? 10 : 0) } },
  { id: 'Y22', name: '킹스 나이트', type: 'monster', level: 4, atk: 1600, def: 1400, element: 'slash', sprite: 'king', shout: '킹스 어퍼!',
    text: '어퍼 베기 (ATK×1.0)로 상대를 띄움. 직전에(2턴 이내) 퀸즈 나이트를 썼다면 덱에서 잭스 나이트를 꺼내 무료 발동.',
    effect(ctx) { ctx.uppercut(ctx.atk(1.0)); if (ctx.queenRecent() && ctx.deck.count('Y23')) ctx.b.later(0.7, () => ctx.useFromDeck('Y23', '잭스 나이트 소환')); },
    ai: { tags: ['damage'], range: 150, melee: true, dmg: 1.0, score: S => (S.queenRecent && S.inDeck('Y23') ? 30 : (S.inHand('Y21') && S.inDeck('Y23') ? -14 : 0)) } },
  { id: 'Y23', name: '잭스 나이트', type: 'monster', level: 5, atk: 1900, def: 1000, element: 'slash', sprite: 'jack', shout: '잭스 니들!',
    text: '[릴리스 1] 빠른 연속 찌르기 5회 (각 ATK×0.28).',
    effect(ctx) { ctx.multiHit(5, ctx.atk(0.28)); },
    ai: { tags: ['damage'], range: 170, melee: true, dmg: 1.4, score: S => (S.inHand('Y22') && S.inHand('Y21') ? -10 : 0) } },
  { id: 'Y24', name: '카드 파괴', type: 'spell', text: '자신의 패를 전부 묘지로 보내고 같은 수만큼 드로우. 상대 스킬 쿨타임을 전부 최대로.',
    effect(ctx) { const n = ctx.hand.count(); ctx.hand.discard(null, n); ctx.draw(n); ctx.foeCooldowns('max'); },
    ai: { tags: ['grave'], when: S => S.hand - 1 >= 1 && S.deck - (S.hand - 1) >= 4 && (S.pieces === 0 || S.desperate),
          score: S => 4 + (S.oppHasSkills ? (S.oppSkillSoon < 2 ? 18 : 8) : 0) + (S.handQuality < 8 ? 12 : -10) } , borrowable: false },
  { id: 'Y25', name: '흑마술의 베일', type: 'spell', text: 'LP 1000 지불 → 묘지의 레벨 6~7 몬스터 1장(AI가 가장 좋은 것 선택)의 효과를 발동. 그 몬스터는 묘지에 남음. LP 1000 이하면 사용 불가.',
    effect(ctx) { const V = window.DUEL_VEIL, c = ctx.bestGrave(V.LV67); if (c && ctx.payLp(V.VEIL_LP)) ctx.useMonster(c, { label: '흑마술의 베일', keepZone: 'grave' }); },
    ai: { tags: ['grave'], lpCost: 1000, when: S => !!S.veilTarget && S.myLp > 1000 + 900, score: S => S.veilScore + 2 }, borrowable: false },
  { id: 'Y26', name: '빅 실드 가드너', type: 'monster', level: 4, atk: 100, def: 2600, element: 'blunt', sprite: 'gardner',
    text: '큰 방패: 6초간 피해 흡수 (내구도 = DEF×0.035 = 91). 방패가 끝날 때 남은 내구도만큼 상대에게 피해.',
    effect(ctx) { ctx.gardner(ctx.card.def * 0.035 * ctx.mult, 6); },
    ai: { tags: ['defense'], when: S => !S.gardner, keep: 4 } },
  { id: 'Y27', name: '블랙 매지션 걸', type: 'monster', level: 6, atk: 2000, def: 1700, element: 'dark', sprite: 'darkMagicianGirl', shout: '블랙 버닝!',
    text: '[릴리스 1] 어둠 마법탄 (ATK×1.0). 묘지에 블랙 매지션이 있으면 피해 2배.',
    effect(ctx) { const k = ctx.grave.count('Y02') ? 2 : 1; ctx.shoot({ dmg: ctx.atk(1.0 * k), kind: 'magic', count: k }); if (k > 1) ctx.text('스승의 힘! ×2', '#ff9ad8'); },
    ai: { tags: ['damage'], range: 280, est: S => 2000 * 0.035 * (S.inGrave('Y02') ? 2 : 1), priority: 6 } },
  { id: 'Y28', name: '중장갑 거북', type: 'monster', level: 4, atk: 1100, def: 1900, element: 'blunt', sprite: 'turtle', shout: '사출!', shoutLater: true,
    text: '패의 몬스터 1장을 버리고 발사: 버린 몬스터 레벨 × 420 상당 피해.',
    effect(ctx) { ctx.turtleShot(420); },
    ai: { tags: ['damage'], range: 280, when: S => !!S.turtlePick, est: S => S.turtlePick ? S.turtlePick.def.level * 420 * 0.035 : 0, score: S => S.turtlePick ? -0.4 * S.turtlePickKeep : 0 } },
  { id: 'Y29', name: '매지컬 실크햇', type: 'trap', text: '상대가 공격할 때: 패의 몬스터 1장 + 덱의 함정 2장을 섞어 모자 3개에 숨김. 상대가 처음 닿은(또는 공격한) 모자의 카드를 공개 — 몬스터는 묘지로, 함정은 효과 발동. 그 공격은 모자가 막고, 나머지 모자는 묘지로. 10초 지속.',
    trigger: { on: 'oppAttack', when: ctx => !ctx.hatsActive() && ctx.hand.count(d => d.type === 'monster' && !isPiece(d)) > 0 },
    effect(ctx) { ctx.silkHats(10); },
    ai: { priority: 4, score: S => (S.handMonstersNoPiece > 1 ? 4 : -6) + (S.trapsInDeck ? 4 : -4) } },
  { id: 'Y30', name: '천사의 자비', type: 'spell', text: '3장 드로우 후 패 2장 버림 (AI가 가장 안 좋은 카드를 고르고 엑조디아는 보관).',
    effect(ctx) { ctx.draw(3); ctx.discardWorst(2); }, ai: { tags: ['draw'], draw: 3, score: S => S.pieces * 5 }, borrowable: false },
  { id: 'Y31', name: '빛의 봉인검', type: 'spell', text: '6초간 유희 앞(시전 시 상대 방향 반원, 반경 140)에 빛의 검 3자루. 그 안의 상대는 스킬 사용 불가.',
    effect(ctx) { ctx.lightSwords(6, 140); },
    ai: { tags: ['control'], when: S => !S.lightSword && S.oppHasSkills, score: S => (S.oppSkillSoon < 2 ? 10 : 0) + (S.d < 130 ? 6 : -6) } },
  { id: 'Y32', name: '체력 증강제 슈퍼 Z', type: 'trap', text: '[강제 발동] LP 100 이상 피해를 받으면: 그 피해로 잃은 LP의 2배를 회복.',
    trigger: { on: 'damaged', when: (ctx, ev) => ev.dmg >= 100 },
    effect(ctx, ev) { const d = Number(ev.dmg) || 0; if (d > 0) ctx.heal(Math.round(d * 2)); },
    ai: { priority: 0, forced: true, score: S => (S.myHpR < 0.7 ? 8 : -4) + (S.oppSkillSoon < 2 ? 6 : 0) } },
  { id: 'Y33', name: '커스 오브 드래곤', type: 'monster', level: 5, atk: 2000, def: 1500, element: 'fire', sprite: 'curseDragon', shout: '지옥의 화염!',
    text: '[릴리스 1] 전방 화염 브레스 (ATK×0.9) + 불탄 자리가 4초간 불길로 남음 (0.5초마다 소량 피해).',
    effect(ctx) { ctx.fan(ctx.atk(0.9), { range: 165, spread: 0.55, hazard: { dur: 4, dmg: ctx.atk(0.12) } }); },
    ai: { tags: ['damage'], range: 170, dmg: 1.3, priority: 4 } },
  { id: 'Y34', name: '버서커 소울', type: 'spell', text: '이번 턴 바로 전에 Lv4 이하 몬스터 효과를 썼을 때만: 1장 드로우 → 몬스터면 묘지로 보내고(엑조디아는 패에 보관) 그 몬스터 효과를 다시 발동, 반복. 몬스터가 아니면 종료 (최대 6회, 덱이 0장이면 안전 정지).',
    effect(ctx) { ctx.berserker(6); },
    ai: { tags: ['damage'], when: S => S.berserkerReady && S.deck >= 8, est: S => S.berserkerEst, priority: 4 }, borrowable: false },
  { id: 'Y35', name: '육망성의 저주', type: 'trap', text: '근접 무기를 가진 상대가 공격(무기·충돌)해 올 때: 8초간 상대의 근접(무기) 공격 간격 ×1.8. 원거리 상대에겐 효과 없음.',
    trigger: { on: 'oppAttack', when: (ctx, ev) => !!(ev.src && ev.src.st.range < 80) },
    effect(ctx, ev) { ctx.hexCurse(ev.src, 1.8, 8); },
    ai: { priority: 2, score: S => (S.oppMelee ? 12 : -30) } },
  { id: 'Y36', name: '마그넷 워리어 감마', type: 'monster', level: 4, atk: 1500, def: 1800, element: 'blunt', sprite: 'magnetG',
    text: '공중의 상대를 즉시 지면에 내리꽂아 낙하 피해 (ATK×1.4 + 0.8초 넘어짐). 지상이면 자력탄 (ATK×0.6).',
    effect(ctx) { ctx.slamDown(ctx.atk(1.4), ctx.atk(0.6)); },
    ai: { tags: ['damage'], range: 300, est: S => 1500 * 0.035 * (S.oppAir ? 1.4 : 0.6), score: S => (S.oppAir ? 40 : -12) } },
  { id: 'Y37', name: '마그넷 워리어 베타', type: 'monster', level: 4, atk: 1700, def: 1600, element: 'elec', sprite: 'magnetB',
    text: '3초간 상대를 자력으로 끌어당김. 멀어지려고 저항할수록 0.5초마다 들어가는 지속 피해 증가.',
    effect(ctx) { ctx.magnetPull(3, ctx.atk(0.08)); },
    ai: { tags: ['control'], range: 260, when: S => !S.magnet, score: S => (S.oppRanged ? 12 : -6) } },
  { id: 'Y38', name: '마그넷 워리어 알파', type: 'monster', level: 4, atk: 1400, def: 1700, element: 'slash', sprite: 'magnetA',
    text: '베기 (ATK×0.9). 적중 시 3초간 반발 자기장: 상대가 유희에게 닿지 못함.',
    effect(ctx) { ctx.rush(ctx.atk(0.9), { onHit: t => ctx.repel(t, 3) }); },
    ai: { tags: ['damage'], range: 160, melee: true, dmg: 0.9, score: S => (S.oppMelee ? 12 : 0) } },
  { id: 'Y39', name: '신의 심판', type: 'trap', text: '상대가 스킬을 쓸 때: LP 절반을 지불하고 그 스킬을 즉시 정지(무효). 무효된 스킬의 쿨타임은 평소의 3배가 된다.',
    trigger: { on: 'oppSkill' },
    effect(ctx, ev) { if (ctx.payLp(Math.floor(ctx.u.hp / 2))) { ctx.negate(); ctx.lockSkill(ev.src, ev.slot, 3); } },
    ai: { priority: 8, activate: S => S.myLp > 1000 && (S.myHpR > 0.3 || S.oppSkillHeavy), score: S => (S.oppHasSkills ? 13 : -30) + (S.myHpR < 0.35 ? -22 : S.myHpR < 0.5 ? -8 : 0) } },
  { id: 'Y40', name: '침묵의 마법사 사일런트 매지션', type: 'monster', level: 4, atk: 1000, def: 1000, element: 'light', sprite: 'silentMagician', shout: '사일런트 버닝!',
    text: '현재 패 1장당 350 상당 빛 피해 (즉시 적중).',
    effect(ctx) { const n = ctx.hand.count(); ctx.bolt(ctx.val(350 * Math.max(1, n)), { element: 'light', color: '#c8e8ff' }); },
    ai: { tags: ['damage'], range: 280, est: S => 350 * 0.035 * Math.max(1, S.hand - 1) } },
];
YUGI_CARDS.forEach(c => { if (!c.shout) c.shout = c.name + '!'; CARD_DEFS[c.id] = c; });
const YUGI_DECK = Object.fromEntries(YUGI_CARDS.map(c => [c.id, 1])); // 40장, 각 1장
