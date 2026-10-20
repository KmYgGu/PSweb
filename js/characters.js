/* =========================================================
 * 캐릭터 & 스탯 데이터 정의
 * - STAT_DEFS : 선택 화면에 표시되는 스탯 목록 (순서/라벨/표시 최대값)
 * - STAT_DEFAULTS : 캐릭터가 지정하지 않은 스탯의 기본값
 * - CHARACTERS : 캐릭터 목록. stats 객체에 원하는 키를 자유롭게 추가 가능.
 * ========================================================= */

// 화면에 표시할 스탯 (새 스탯을 표시하려면 여기에 한 줄 추가)
const STAT_DEFS = [
  { key: 'hp',    label: '체력',   max: 1400 },
  { key: 'atk',   label: '공격력', max: 65 },
  { key: 'spd',   label: '속도',   max: 380 },
  { key: 'range', label: '사거리', max: 180 },
  { key: 'def',   label: '방어력', max: 70 },
  // 예) { key: 'crit', label: '치명타', max: 0.5, fmt: v => Math.round(v * 100) + '%' },
];

// 기본값: 엔진이 참조하는 모든 스탯은 여기에 기본값을 둔다.
const STAT_DEFAULTS = {
  hp: 800,       // 최대 체력
  atk: 32,       // 기본 공격 피해
  spd: 240,      // 이동 속도 (px/초, 마찰 없이 일정 속도로 직진)
  range: 22,     // 사거리 (몸통 사이 간격, px). 80 이상이면 원거리(투사체) 공격
  atkRate: 1.0,  // 초당 공격 횟수
  def: 0,        // 방어력: 받는 피해 x 100/(100+def)
  crit: 0,       // 치명타 확률 (0~1), 치명타 배율 x1.75
};

// 픽셀 그리기 헬퍼: 선분 픽셀 목록
function pxLine(x0, y0, x1, y1, k) {
  const out = [];
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    out.push([Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), k]);
  }
  return out;
}

/* skills: 스킬 슬롯 배열. 각 슬롯 { id(SKILLS 키), name, cd(초), canUse?(u,e,d,b), applies? }
 *  - applies: [{ status(STATUS_DEFS 키), duration(초), chance(0~1, 기본 1), power? }] 적중 시 상태이상 부여
 *  - attackApplies (캐릭터 최상위): 기본 공격 적중 시 상태이상
 *  - 슬롯/attack 공통 피해 속성: element(ELEMENT_DEFS 키), delivery('melee'|'ranged'), pierce(0~1 방어 무시)
 * attack      : 기본 공격 { element, delivery, pierce }
 * resist      : 속성(또는 delivery) 피해 배율 { fire: 0.5, dark: 1.5 }  (없으면 1)
 * statusResist: 상태이상 저항 { all: 0.2, stun: 0.5 } → 부여 확률 x(1-r), 지속시간 x(1-r/2). 버프의 statusResist 와 합산 (최대 0.9)
 *  - canUse 를 슬롯에 적으면 skills.js 의 기본 사용 조건 대신 사용됨
 *  - 여러 슬롯이 동시에 준비되면 배열 앞쪽 슬롯이 우선
 *
 * sprite 정의 (두 가지 방식)
 *  1) PNG 이미지: sprite: 'assets/knight.png'  또는
 *     sprite: { src, frameW, frameH, frames, fps, scale|height, foot, portraitRect:[x,y,w,h], ...절차적 폴백 키 }
 *     portrait: 'assets/knight_face.png' (선택)
 *  2) 절차적 (src 없음 또는 로드 실패 시)
 *  pal  : 팔레트 (H 머리/모자, S 피부, E 눈, B 몸통, A 장식, L 다리, D 신발, W 금속, w 나무, M 마법)
 *  rows : 기본 16x16 템플릿의 행을 통째로 교체 {행번호: '16글자'}
 *  rects: [x, y, w, h, 키] 사각형 채우기
 *  px   : [x, y, 키] 개별 픽셀 (pxLine 사용 가능)
 */
const CHARACTERS = [
  {
    id: 'swordsman', name: '검사', color: '#7fa6e0',
    stats: { hp: 795, atk: 40, spd: 280, range: 50, atkRate: 0.95, def: 25 },
    attack: { element: 'slash', delivery: 'melee' },
    resist: { slash: 0.8, elec: 1.3, dark: 1.2 },
    statusResist: { all: 0.1 },
    skills: [{ id: 'dashSlash', name: '질풍참', cd: 6, element: 'ice', delivery: 'melee', pierce: 0.1 }],
    sprite: {
      pal: { H: '#8a5a34', B: '#4f74b8', A: '#d9c27a', W: '#e4eaf0', w: '#6b4a2e' },
      px: [...pxLine(13, 2, 13, 8, 'W'), [12, 9, 'A'], [13, 9, 'A'], [14, 9, 'A'], [13, 10, 'w']],
    },
  },
  {
    id: 'archer', name: '궁수', color: '#7cc47a',
    stats: { hp: 965, atk: 37, spd: 260, range: 130, atkRate: 1.1, def: 10 },
    attack: { element: 'slash', delivery: 'ranged', pierce: 0.3 },
    resist: { fire: 1.3, blunt: 1.2, ranged: 0.85 },
    statusResist: { poison: 0.5 },
    skills: [{ id: 'arrowVolley', name: '화살 세례', cd: 7, element: 'slash', delivery: 'ranged', pierce: 0.3, applies: [{ status: 'poison', duration: 4, chance: 0.35, power: 6 }] }],
    projectile: 'arrow',
    sprite: {
      pal: { H: '#3f7a46', B: '#5c9a52', A: '#a07a40', w: '#8a5a30', W: '#e8e0c8' },
      rows: { 3: '...HHSSSSSSHH...', 4: '...HSSESSESSH...' },
      px: [[13, 4, 'w'], ...pxLine(14, 5, 14, 12, 'w'), [13, 13, 'w'], ...pxLine(13, 5, 13, 12, 'W')],
    },
  },
  {
    id: 'mage', name: '마법사', color: '#b08ce8',
    stats: { hp: 1050, atk: 47, spd: 225, range: 120, atkRate: 0.8, def: 5 },
    attack: { element: 'fire', delivery: 'ranged' },
    resist: { fire: 0.5, ice: 1.4, slash: 1.15 },
    statusResist: { confusion: 0.4 },
    skills: [{ id: 'fireball', name: '화염구', cd: 8, element: 'fire', delivery: 'ranged', applies: [{ status: 'weaken', duration: 4 }] }],
    projectile: 'magic',
    sprite: {
      pal: { H: '#5b3f8f', B: '#6d4fa8', A: '#e0b84a', w: '#7a5534', M: '#8fd3ff' },
      rows: { 0: '.......HH.......', 1: '......HHHH......', 2: '...HHHHHHHHHH...' },
      px: [...pxLine(14, 3, 14, 14, 'w'), [13, 1, 'M'], [14, 1, 'M'], [13, 2, 'M'], [14, 2, 'M'], [15, 2, 'M']],
    },
  },
  {
    id: 'tank', name: '탱커', color: '#a9b4c2',
    stats: { hp: 840, atk: 28, spd: 200, range: 46, atkRate: 0.8, def: 40 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { slash: 0.75, blunt: 0.8, elec: 1.4 },
    statusResist: { all: 0.2, stun: 0.3 },
    skills: [
      { id: 'ironWall', name: '철벽 방패', cd: 9 },
      { id: 'groundSlam', name: '대지 강타', cd: 11, element: 'blunt', delivery: 'melee', applies: [{ status: 'petrify', duration: 2.2 }] },
    ],
    sprite: {
      pal: { H: '#8f98a3', B: '#6c7684', A: '#c9a24a', W: '#b8c2cc', E: '#30343c' },
      rows: { 3: '....HHHHHHHH....', 4: '....HEEEEEEH....', 5: '....HSSSSSSH....' },
      rects: [[11, 7, 5, 7, 'A'], [12, 8, 3, 5, 'W']],
    },
  },
  {
    id: 'assassin', name: '암살자', color: '#d27a9a',
    stats: { hp: 630, atk: 27, spd: 360, range: 44, atkRate: 1.5, crit: 0.2, def: 10 },
    attack: { element: 'dark', delivery: 'melee', pierce: 0.4 },
    resist: { dark: 0.5, light: 1.5 },
    statusResist: { poison: 0.8, confusion: 0.5 },
    skills: [{ id: 'shadowStrike', name: '그림자 습격', cd: 6, element: 'dark', delivery: 'melee', pierce: 0.5, applies: [{ status: 'confusion', duration: 2.5 }] }],
    attackApplies: [{ status: 'poison', duration: 3, chance: 0.25, power: 5 }], // 기본 공격 적중 시
    sprite: {
      pal: { H: '#3a3550', B: '#3d3a5c', A: '#8a3a52', W: '#d0d6e0', E: '#ff9fb0' },
      rows: { 3: '...HHSSSSSSHH...', 4: '...HSSESSESSH...', 5: '....HHHHHHHH....' },
      px: [[13, 7, 'W'], [13, 8, 'W'], [13, 9, 'w'], [2, 8, 'W'], [2, 9, 'w']],
    },
  },
  {
    id: 'lancer', name: '창병', color: '#e0a060',
    stats: { hp: 780, atk: 37, spd: 250, range: 72, atkRate: 0.9, def: 35 },
    attack: { element: 'slash', delivery: 'melee', pierce: 0.35 },
    resist: { slash: 0.85, fire: 1.25, ranged: 0.85 },
    statusResist: { stun: 0.4 },
    skills: [{ id: 'lanceCharge', name: '돌격 찌르기', cd: 8, element: 'slash', delivery: 'melee', pierce: 0.5, applies: [{ status: 'stun', duration: 1.1 }] }],
    sprite: {
      pal: { H: '#b08a3a', B: '#b4643c', A: '#c8483c', W: '#dfe6ee', w: '#7a5534' },
      rows: { 0: '......AAA.......' },
      px: [...pxLine(14, 2, 14, 15, 'w'), [14, 0, 'W'], [14, 1, 'W'], [13, 1, 'W'], [15, 1, 'W'], [14, 2, 'W']],
    },
  },
  {
    id: 'priest', name: '성직자', color: '#f0d77a',
    stats: { hp: 890, atk: 27, spd: 230, range: 115, atkRate: 0.95, def: 15 },
    attack: { element: 'light', delivery: 'ranged' },
    resist: { light: 0.5, dark: 1.5 },
    statusResist: { all: 0.25 },
    skills: [{ id: 'holyLight', name: '치유의 빛', cd: 9, element: 'elec', delivery: 'ranged', applies: [{ status: 'paralysis', duration: 3 }] }],
    projectile: 'holy',
    sprite: {
      pal: { H: '#e8e4d8', B: '#f0ead8', A: '#e2b843', w: '#8a6a40', L: '#cfc6b0' },
      rows: { 3: '...HHSSSSSSHH...', 4: '...HSSESSESSH...' },
      px: [...pxLine(14, 4, 14, 14, 'w'), [14, 1, 'A'], [14, 2, 'A'], [14, 3, 'A'], [13, 2, 'A'], [15, 2, 'A']],
    },
  },
  {
    id: 'berserker', name: '광전사', color: '#e07a5a',
    stats: { hp: 1150, atk: 42, spd: 270, range: 50, atkRate: 1.0, def: 20 },
    attack: { element: 'slash', delivery: 'melee' },
    resist: { fire: 0.8, blunt: 0.85, ice: 1.35 },
    statusResist: { stun: 0.4, weaken: 0.3 },
    skills: [{ id: 'rage', name: '분노 폭발', cd: 10 }],
    sprite: {
      pal: { H: '#c4502e', B: '#7a5236', A: '#c4502e', W: '#cfd6de', w: '#6b4a2e' },
      rows: { 0: '....H.H..H.H....', 7: '....BSSSSSSB....' },
      px: [...pxLine(13, 3, 13, 12, 'w')],
      rects: [[14, 3, 2, 4, 'W'], [12, 3, 1, 2, 'W']],
    },
  },
  // ===== 첫 정식 캐릭터 =====
  {
    id: 'reinhardt', name: '라인하르트', color: '#b8b8c0',
    stats: { hp: 1000, atk: 28, spd: 215, range: 54, atkRate: 0.75, def: 30 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { elec: 1.3, slash: 0.9, blunt: 0.85, fire: 0.9 },
    statusResist: { stun: 0.25, pin: 0.9 },
    size: 1.65,          // 충돌 반경 배율 (기본 15px → ~25px)
    hammer: true,        // 절차적 로켓 해머 그리기
    skills: [
      { id: 'fireStrike', name: '화염 강타', cd: 7, mult: 1.3, element: 'fire', delivery: 'ranged', pierce: 0.2 },
      { id: 'rCharge', name: '돌진', cd: 10, mult: 3, element: 'blunt', delivery: 'melee', pierce: 0.2 },  // mult: 벽 충돌 피해 배율
      { id: 'barrier', name: '방벽', cd: 12, hp: 400, dur: 4, spdMul: 0.6 },
      { id: 'earthshatter', name: '대지 분쇄', cd: 13, stun: 1.1, element: 'blunt', delivery: 'melee' },
    ],
    sprite: { src: 'assets/REINHARDT/front.png', back: 'assets/REINHARDT/back.png', scale: 1, foot: 1, faces: { front: 'left', back: 'left' } },
    portrait: 'assets/REINHARDT/portrait.png',
    // 대사 (README '대사 시스템' 참고) — 사용자 제공 대사
    lines: {
      skill: {
        '방벽': ['방벽 전개!', '방패 활성화!'],
        '돌진': ['하!'],
        '화염 강타': ['으랏차!'],
        '대지 분쇄': ['망치 나가신다!'],
      },
      event: {
        battleStart: ['당당하게 앞으로!', '이번 전투는 기대가 되는군!'],
        buffed: ['날 막을 순 없다!', '내 앞에서 비키는 게 좋을 걸세!'],
        debuffed: ['이런!', '참을 수 없군!'],
        healed: ['아! 몸이 가뿐하구먼!', '훨씬 낫군!'],
        barrierHit: ['내 방패는 아직 굳건하다네!', '전투의 열기가 느껴지는 군!'],
      },
    },
  },
  {
    id: 'evelyn', name: '이블린', color: '#e0b860',
    stats: { hp: 660, atk: 25, spd: 330, range: 60, atkRate: 0.92, def: 12, crit: 0.12 },
    attack: { element: 'fire', delivery: 'melee' },
    resist: { fire: 0.75, ice: 1.3, blunt: 1.1 },
    statusResist: { bind: 0.5 },
    // 기본 공격 2연타: 1타 후 잠깐 물러났다가 다시 파고들어 2타 (combo 액션)
    combo: { hits: 2, retreat: 0.13, retreatSpd: 300, approachSpd: 560, maxT: 0.55, mult2: 0.7 },
    // 범용 자원 시스템 (README '자원 시스템')
    resources: {
      ember: { name: '화염 매듭', max: 100, display: 'bar', color: '#ff9a4a', gain: { basicHit: 6, counterSuccess: 'max', counterFail: 15 } },
      mark: { name: '표식', max: 3, display: 'pips', color: '#ffcf70' },
    },
    skills: [
      { id: 'garroteBurst', name: '교살 폭발', cd: 2, requires: { mark: 3 }, consumeAll: ['mark'], mult: 3.6, element: 'fire', delivery: 'melee', pierce: 0.3 },
      { id: 'bindingSeal', name: '뒤엉킨 금제_속박식', cd: 8, window: 0.6 },
      { id: 'garrote', name: '교살식', cd: 1.5, cost: { ember: 50 }, mult: 1.7, element: 'fire', delivery: 'melee', gainMark: 1 },
      { id: 'wireSnatch', name: '와이어 낚아채기', cd: 7, mult: 0.8, element: 'fire', delivery: 'ranged', applies: [{ status: 'bind', duration: 1.6 }] },
    ],
    sprite: { src: 'assets/evelyn/front.png', back: 'assets/evelyn/back.png', scale: 0.5, foot: 2, faces: { front: 'left', back: 'left' } },
    portrait: 'assets/evelyn/portrait.png',
    lines: {},
  },
];
