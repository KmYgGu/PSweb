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
  crit: 0,       // 치명타 확률 (0~1)
  critMult: 1.75, // 치명타 배율 (캐릭터별 stats.critMult)
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
    id: 'swordsman', name: '검사', gender: 'male', color: '#7fa6e0',
    stats: { hp: 795, atk: 40, spd: 280, range: 50, atkRate: 0.95, def: 25, crit: 0.11, critMult: 2.0 },
    attack: { element: 'slash', delivery: 'melee' },
    resist: { slash: 0.8, elec: 1.3, dark: 1.2 },
    statusResist: { all: 0.1 },
    skills: [{ id: 'dashSlash', name: '질풍참', cd: 6, element: 'ice', delivery: 'melee', pierce: 0.1 }],
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '질풍참': ['한 호흡에 벤다!', '얼어붙어라, 칼끝에서!', '질풍참!'],
      },
      event: {
        battleStart: ['검으로 답하겠다.', '한 수 겨뤄 보자.', '{opp}, 준비됐나?'],
        lowHp: ['호흡부터 가다듬자.', '아직 검은 놓지 않았다.'],
        buffed: ['칼끝이 더 가벼워졌군.', '지금이라면 벨 수 있다.'],
        debuffed: ['흐름을 끊으려는 건가.', '이 정도로 물러서진 않아.'],
        healed: ['좋아. 자세를 다시 잡지.', '이 빚은 승리로 갚겠다.'],
        stunned: ['큭, 중심이…!'],
        knockedDown: ['바닥에서 끝낼 순 없지.'],
        pinnedBySomeone: ['검을 뽑을 틈만 있으면…!'],
        water: ['젖어도 칼날은 무뎌지지 않아.'],
        airborne: ['내려가는 순간을 노린다.'],
        fallCrevasse: ['발 디딜 곳이…!'],
        win: ['좋은 승부였다.', '끝까지 칼끝을 봤어야지.', '다음엔 더 강해져서 와라.'],
        lose: ['한 수… 배웠다.', '내 검은 아직 멀었군.'],
      },
    },
    sprite: {
      pal: { H: '#8a5a34', B: '#4f74b8', A: '#d9c27a', W: '#e4eaf0', w: '#6b4a2e' },
      px: [...pxLine(13, 2, 13, 8, 'W'), [12, 9, 'A'], [13, 9, 'A'], [14, 9, 'A'], [13, 10, 'w']],
    },
  },
  {
    id: 'archer', name: '궁수', gender: 'female', color: '#7cc47a',
    stats: { hp: 965, atk: 37, spd: 260, range: 130, atkRate: 1.1, def: 10, crit: 0 },
    attack: { element: 'slash', delivery: 'ranged', pierce: 0.3 },
    rangedBasic: { interval: 1.1, mult: 0.6, spd: 520 }, // v3: 궁수만 원거리 기본 공격 (논타겟 직선 화살, 유도 없음)
    resist: { fire: 1.3, blunt: 1.2, ranged: 0.85 },
    statusResist: { poison: 0.5 },
    skills: [{ id: 'arrowVolley', name: '화살 세례', cd: 5, element: 'slash', delivery: 'ranged', pierce: 0.3, applies: [{ status: 'poison', duration: 4, chance: 0.35, power: 6 }] },
      { id: 'backStep', name: '백스텝', cd: 6, dist: 95, dashT: 0.2 }],
    projectile: 'arrow',
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '화살 세례': ['피할 곳까지 계산했어!', '한 발로는 아쉽잖아?', '독 화살이야. 조심해!'],
      },
      event: {
        battleStart: ['거기 서 있어. 내가 맞힐게.', '바람도 내 편이네.', '{opp}, 조금만 더 멀리 가 줄래?'],
        lowHp: ['한 발이면 뒤집을 수 있어.', '거리를 벌려야겠네.'],
        buffed: ['손끝 감각이 살아났어.', '다음 화살은 더 빠를걸?'],
        debuffed: ['이런, 시야를 가리네.', '손이 떨려도 맞힐 수 있어.'],
        healed: ['고마워. 이제 다시 조준!', '다시 활을 당길 힘이 나네.'],
        stunned: ['앗, 조준이…!'],
        knockedDown: ['옷에 흙 묻었잖아.'],
        pinnedBySomeone: ['이렇게 가까운 건 취향 아닌데!'],
        water: ['시위는 젖지 않게, 조심.'],
        airborne: ['위에서 보니까 더 잘 보이네!'],
        fallCrevasse: ['잠깐, 여기 발판이 없잖아!'],
        win: ['마지막까지 거리 계산은 정확했지.', '내 화살, 꽤 집요하지?', '다음엔 바람부터 읽어 봐.'],
        lose: ['마지막 한 발이… 아깝네.', '거리를 내준 게 실수였어.'],
      },
    },
    sprite: {
      pal: { H: '#3f7a46', B: '#5c9a52', A: '#a07a40', w: '#8a5a30', W: '#e8e0c8' },
      rows: { 3: '...HHSSSSSSHH...', 4: '...HSSESSESSH...' },
      px: [[13, 4, 'w'], ...pxLine(14, 5, 14, 12, 'w'), [13, 13, 'w'], ...pxLine(13, 5, 13, 12, 'W')],
    },
  },
  {
    id: 'mage', name: '마법사', gender: 'male', color: '#b08ce8',
    stats: { hp: 1050, atk: 47, spd: 225, range: 120, atkRate: 0.8, def: 5, crit: 0.04, critMult: 1.7 },
    attack: { element: 'fire', delivery: 'ranged' },
    spellCharge: { rate: 0.1, cap: 1.0 }, // v3: 맞지 않는 동안 초당 +10%, 최대 +100% (10초). 화염구 사용 시 소모, 피격 시 초기화
    resist: { fire: 0.5, ice: 1.4, slash: 1.15 },
    statusResist: { confusion: 0.4 },
    skills: [{ id: 'fireball', name: '화염구', cd: 5.5, element: 'fire', delivery: 'ranged', applies: [{ status: 'weaken', duration: 4 }] },
      { id: 'teleport', name: '텔레포트', cd: 9 }],
    projectile: 'magic',
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '화염구': ['하늘을 봐라! 화염구!', '이 일대를 불태워 주지!', '낙하 지점, 계산 완료!'],
      },
      event: {
        battleStart: ['오늘의 실험 상대가 왔군.', '마법의 위력을 증명해 보이지.', '{opp}, 열에 강한 편인가?'],
        lowHp: ['로브는 방어구가 아니란 말이지…!', '계산을 조금 수정해야겠군.'],
        buffed: ['마력 순환, 아주 훌륭해.', '이 출력이면 충분하겠군.'],
        debuffed: ['누가 술식에 간섭하는 거지?', '집중… 집중하면 된다.'],
        healed: ['좋군. 연구는 계속된다.', '아직 펼칠 주문이 남았어.'],
        stunned: ['주문을 끝까지…!'],
        knockedDown: ['흙바닥은 연구실에 없었는데.'],
        pinnedBySomeone: ['근접 실험은 사양하겠네!'],
        water: ['불씨를 꺼뜨릴 생각인가?'],
        airborne: ['오, 시야가 제법 트이는군.'],
        fallCrevasse: ['비행 마법은 아직 연구 중인데!'],
        win: ['계산대로군. 조금 뜨거웠나?', '이것이 화염 마법의 정수다.', '실험 결과는 대성공이야.'],
        lose: ['이론은… 완벽했는데.', '방어 술식도 배워 둘걸….'],
      },
    },
    sprite: {
      pal: { H: '#5b3f8f', B: '#6d4fa8', A: '#e0b84a', w: '#7a5534', M: '#8fd3ff' },
      rows: { 0: '.......HH.......', 1: '......HHHH......', 2: '...HHHHHHHHHH...' },
      px: [...pxLine(14, 3, 14, 14, 'w'), [13, 1, 'M'], [14, 1, 'M'], [13, 2, 'M'], [14, 2, 'M'], [15, 2, 'M']],
    },
  },
  {
    id: 'tank', name: '탱커', gender: 'male', color: '#a9b4c2',
    stats: { hp: 840, atk: 28, spd: 200, range: 46, atkRate: 0.8, def: 40, crit: 0.08, critMult: 2.2 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { slash: 0.75, blunt: 0.8, elec: 1.4 },
    statusResist: { all: 0.2, stun: 0.3 },
    skills: [
      { id: 'ironWall', name: '철벽 방패', cd: 9 },
      { id: 'groundSlam', name: '대지 강타', cd: 11, element: 'blunt', delivery: 'melee', applies: [{ status: 'petrify', duration: 2.2 }] },
    ],
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '철벽 방패': ['철벽이다!', '네 힘을 돌려주마.', '더 세게 쳐 봐라!'],
        '대지 강타': ['땅까지 굳혀 주마!', '발밑을 봐라!', '움직이지 마라!'],
      },
      event: {
        battleStart: ['여기서 막는다.', '내 뒤로는 못 간다.', '와라, {opp}. 버텨 주마.'],
        lowHp: ['아직 서 있다.', '한 걸음도 안 물러난다.'],
        buffed: ['더 단단해졌군.', '이 정도면 충분하다.'],
        debuffed: ['흔들어 봐라.', '참을 만하다.'],
        healed: ['다시 버틴다.', '고맙다. 오래 서 있겠군.'],
        stunned: ['무게 중심이…!'],
        knockedDown: ['다시 일어나면 그만이다.'],
        pinnedBySomeone: ['쉽게 밀릴 몸은 아니다!'],
        water: ['갑옷이 더 무거워졌군.'],
        airborne: ['이 무게를 띄우다니.'],
        fallCrevasse: ['버틸… 땅이 없다!'],
        win: ['끝까지 선 쪽이 이긴다.', '막아 냈다.', '이번에도 방패가 버텼군.'],
        lose: ['결국… 뚫렸군.', '다음엔 더 버티겠다.'],
      },
    },
    sprite: {
      pal: { H: '#8f98a3', B: '#6c7684', A: '#c9a24a', W: '#b8c2cc', E: '#30343c' },
      rows: { 3: '....HHHHHHHH....', 4: '....HEEEEEEH....', 5: '....HSSSSSSH....' },
      rects: [[11, 7, 5, 7, 'A'], [12, 8, 3, 5, 'W']],
    },
  },
  {
    id: 'assassin', name: '암살자', gender: 'female', color: '#d27a9a',
    stats: { hp: 630, atk: 27, spd: 360, range: 44, atkRate: 1.5, def: 10, crit: 0.1, critMult: 2.2 },
    attack: { element: 'dark', delivery: 'melee', pierce: 0.4 },
    resist: { dark: 0.5, light: 1.5 },
    statusResist: { poison: 0.8, confusion: 0.5 },
    skills: [{ id: 'shadowStrike', name: '그림자 습격', cd: 6, element: 'dark', delivery: 'melee', pierce: 0.5, applies: [{ status: 'confusion', duration: 2.5 }] }],
    attackApplies: [{ status: 'poison', duration: 3, chance: 0.25, power: 5 }], // 기본 공격 적중 시
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '그림자 습격': ['느껴졌나? 이미 늦었어.', '이걸 허용하다니 어리석군.', '그 그림자는 내꺼라네.'],
      },
      event: {
        battleStart: ['크큭.. 이 몸을 알아채다니', '속공으로 순살시켜 주마!', '{opp}… 제거 대상이군.'],
        lowHp: ['한 대만 더 맞는다면!.', '침착하자. 초조해지면 안돼'],
        buffed: ['크큭.. 발소리도 안들릴껄?', '좋아.고통도 없이 끝내주지.'],
        debuffed: ['고작 이런걸로!', '이 흔적부터 지워야겠어.'],
        healed: ['다시 되살아 왔다.', '후후, 난 다시 재시작을 한다.'],
        stunned: ['적은 어디지? 시야를 놓쳤어'],
        knockedDown: ['넌 이 흙맛을 모르겠지.'],
        pinnedBySomeone: ['이거 놓지 못해!.'],
        water: ['물소리도 최소한으로 줄여주마.'],
        airborne: ['그림자는 아래에 있지.'],
        fallCrevasse: ['여기는 내 도착점이 아니군.'],
        win: ['크큭 날 만날 걸 후회해라.', '누가봐도 자연사군.', '이번 보수는 얼마나 될려나?'],
        lose: ['내가 처리되다니...', '그림자로 가게 될 줄이야.'],
      },
    },
    sprite: {
      pal: { H: '#3a3550', B: '#3d3a5c', A: '#8a3a52', W: '#d0d6e0', E: '#ff9fb0' },
      rows: { 3: '...HHSSSSSSHH...', 4: '...HSSESSESSH...', 5: '....HHHHHHHH....' },
      px: [[13, 7, 'W'], [13, 8, 'W'], [13, 9, 'w'], [2, 8, 'W'], [2, 9, 'w']],
    },
  },
  {
    id: 'lancer', name: '창병', gender: 'male', color: '#e0a060',
    stats: { hp: 780, atk: 37, spd: 250, range: 72, atkRate: 0.9, def: 35, crit: 0.06, critMult: 1.8 },
    attack: { element: 'slash', delivery: 'melee', pierce: 0.35 },
    resist: { slash: 0.85, fire: 1.25, ranged: 0.85 },
    statusResist: { stun: 0.4 },
    skills: [{ id: 'lanceCharge', name: '돌격 찌르기', cd: 8, element: 'slash', delivery: 'melee', pierce: 0.5, applies: [{ status: 'stun', duration: 1.1 }] }],
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '돌격 찌르기': ['한 점을 뚫는다!', '내 앞을 가로막지 마라!', '전진, 돌파!'],
      },
      event: {
        battleStart: ['내 간격 안으로 들어와 봐라.', '창끝을 똑바로 봐라.', '{opp}, 정면으로 받아 주마.'],
        lowHp: ['내 창끝은 아직 무디지 않았다.', '다음 일격에 승부를 거마.'],
        buffed: ['창끝이 가벼워졌군.', '뭐든지 꿰뚫을 수 있을 것 같군'],
        debuffed: ['이걸로 접근을 허용할 생각인가.', '정신을 집중해야해.'],
        healed: ['좋다. 다시 전진한다.', '진형을 다시 유지한다!'],
        stunned: ['창끝이… 흔들린다!'],
        knockedDown: ['무릎은 꿇어도 창은 안 놓는다.'],
        pinnedBySomeone: ['이 간격까지 좁혀 오다니!'],
        water: ['창대를 짚고 균형을 잡는다.'],
        airborne: ['내려찍을 자리가 보이는군.'],
        fallCrevasse: ['딛을 곳을 놓쳤군…!'],
        win: ['간격을 지배하면 승부도 끝난다.', '내 창끝이 한발 빨랐다.', '곧게 뻗은 한 수였다.'],
        lose: ['내 돌파가… 막혔군.', '창끝보다 발밑을 먼저 봤어야 했어.'],
      },
    },
    sprite: {
      pal: { H: '#b08a3a', B: '#b4643c', A: '#c8483c', W: '#dfe6ee', w: '#7a5534' },
      rows: { 0: '......AAA.......' },
      px: [...pxLine(14, 2, 14, 15, 'w'), [14, 0, 'W'], [14, 1, 'W'], [13, 1, 'W'], [15, 1, 'W'], [14, 2, 'W']],
    },
  },
  {
    id: 'priest', name: '성직자', gender: 'female', color: '#f0d77a',
    stats: { hp: 890, atk: 27, spd: 230, range: 115, atkRate: 0.95, def: 15, crit: 0.04, critMult: 1.5 },
    attack: { element: 'light', delivery: 'ranged' },
    resist: { light: 0.5, dark: 1.5 },
    statusResist: { all: 0.25 },
    skills: [{ id: 'holyLight', name: '치유의 빛', cd: 6.5, element: 'elec', delivery: 'ranged', applies: [{ status: 'paralysis', duration: 3 }] },
      { id: 'pray', name: '기도', cd: 12, dur: 2, resist: 0.4, cdRate: 2.5 }],
    projectile: 'holy',
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '치유의 빛': ['상처에는 안식을, 위협에는 심판을!', '빛이여, 제게 다시 설 힘을!', '이 빛으로 길을 열겠습니다!'],
      },
      event: {
        battleStart: ['무사히 마칠 수 있기를.', '두려워도 눈을 감지는 않겠습니다.', '{opp}, 서로 끝까지 버텨 봐요.'],
        lowHp: ['빛은 아직 꺼지지 않았어요.', '숨을 고르면, 다시 일어설 수 있어요.'],
        buffed: ['따뜻한 힘이 느껴져요.', '이 빛을 헛되이 쓰지 않겠어요.'],
        debuffed: ['마음까지 흐려지게 둘 순 없어요.', '이 어둠도 걷힐 거예요.'],
        healed: ['감사합니다. 다시 힘낼게요.', '상처가 조금 가라앉았어요.'],
        stunned: ['기도가… 끊겼어요.'],
        knockedDown: ['괜찮아요. 다시 일어나면 돼요.'],
        pinnedBySomeone: ['놓아 주세요. 아직 해야 할 일이 있어요.'],
        water: ['옷자락이 젖었네요. 조심해야겠어요.'],
        airborne: ['부디 안전하게 내려갈 수 있기를.'],
        fallCrevasse: ['손을… 뻗어야…!'],
        win: ['이제 숨을 고르셔도 돼요.', '이 승리로 싸움이 끝나기를.', '끝까지 빛을 믿었어요.'],
        lose: ['조금만 더… 닿았더라면.', '제 기도가… 모자랐을까요.'],
      },
    },
    sprite: {
      pal: { H: '#e8e4d8', B: '#f0ead8', A: '#e2b843', w: '#8a6a40', L: '#cfc6b0' },
      rows: { 3: '...HHSSSSSSHH...', 4: '...HSSESSESSH...' },
      px: [...pxLine(14, 4, 14, 14, 'w'), [14, 1, 'A'], [14, 2, 'A'], [14, 3, 'A'], [13, 2, 'A'], [15, 2, 'A']],
    },
  },
  {
    id: 'berserker', name: '광전사', gender: 'male', color: '#e07a5a',
    stats: { hp: 1150, atk: 42, spd: 270, range: 50, atkRate: 1.0, def: 20, crit: 0.1, critMult: 2.0 },
    attack: { element: 'slash', delivery: 'melee' },
    takenMul: { melee: 1.2, ranged: 2.2 }, // v2 밸런스: 받는 피해 증가 (근접 ×1.2, 원거리·스킬·기타 ×2.2) - 멀리서 깎이면 약함
    resist: { fire: 0.8, blunt: 0.85, ice: 1.35 },
    statusResist: { stun: 0.4, weaken: 0.3 },
    skills: [{ id: 'rage', name: '분노 폭발', cd: 10 }],
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '분노 폭발': ['모조리 쏟아붓는다!', '더 세게! 더 빠르게!', '이제부터 진짜다!'],
      },
      event: {
        battleStart: ['좋아! 몸 좀 풀어 볼까!', '누가 먼저 지치나 해 보자!', '{opp}! 있는 힘껏 덤벼라!'],
        lowHp: ['이제야 피가 끓는군!', '아직 더 버틸 수 있다!'],
        buffed: ['그래, 이 힘이지!', '으하하! 더 빨리 간다!'],
        debuffed: ['이 정도론 못 묶는다!', '성가시게 굴지 마라!'],
        healed: ['좋아! 한 판 더 할 힘이 난다!', '다시 뜨거워졌군!'],
        stunned: ['크윽, 머리가 울린다!'],
        knockedDown: ['흙 맛 좀 봤다고 끝난 줄 아나!'],
        pinnedBySomeone: ['붙잡았으면 끝까지 버텨 봐라!'],
        water: ['찬물로는 못 식힌다!'],
        airborne: ['위에서도 도끼는 무겁다!'],
        fallCrevasse: ['이런, 밑이 없잖아아!'],
        win: ['으하하! 제대로 싸웠다!', '아직 힘이 남는데, 끝이냐?', '내 도끼가 먼저 답했군!'],
        lose: ['크하… 이번엔 네가 더 셌다.', '다음엔 끝까지 버텨 주마.'],
      },
    },
    sprite: {
      pal: { H: '#c4502e', B: '#7a5236', A: '#c4502e', W: '#cfd6de', w: '#6b4a2e' },
      rows: { 0: '....H.H..H.H....', 7: '....BSSSSSSB....' },
      px: [...pxLine(13, 3, 13, 12, 'w')],
      rects: [[14, 3, 2, 4, 'W'], [12, 3, 1, 2, 'W']],
    },
  },
  // ===== 첫 정식 캐릭터 =====
  {
    id: 'reinhardt', name: '라인하르트', gender: 'male', color: '#b8b8c0',
    stats: { hp: 1000, atk: 28, spd: 215, range: 54, atkRate: 0.75, def: 30, crit: 0.08, critMult: 2.0 },
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
    id: 'evelyn', name: '이블린', gender: 'female', color: '#e0b860',
    stats: { hp: 660, atk: 25, spd: 330, range: 60, atkRate: 0.92, def: 12, crit: 0.08, critMult: 1.6 },
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
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '교살 폭발': ['표식 확인. 마무리하겠습니다.', '연결은 끝났습니다.', '더는 움직이지 마세요.'],
        '뒤엉킨 금제_속박식': ['들어오실 거라 예상했습니다.', '그 움직임, 읽었습니다.', '여기서 기다리고 있었죠.'],
        '교살식': ['틈은 충분합니다.', '묶겠습니다.', '짧게 끝내죠.'],
        '와이어 낚아채기': ['이쪽으로 오시죠.', '동선은 제가 정합니다.', '거기까지입니다.'],
      },
      event: {
        battleStart: ['주변 확인 완료. 시작하겠습니다.', '이 구역은 제가 통제합니다.', '{opp}, 불필요한 접근은 삼가세요.'],
        lowHp: ['임무 수행에는 지장 없습니다.', '호흡을 정리하고, 다음 수를.'],
        buffed: ['움직임이 더 정교해졌군요.', '준비는 충분합니다.'],
        debuffed: ['방해 요소부터 제거하죠.', '시야는 흐려져도 판단은 흐려지지 않습니다.'],
        healed: ['감사합니다. 바로 복귀하겠습니다.', '다시 움직일 수 있습니다.'],
        stunned: ['잠깐… 빈틈을 보였군요.'],
        knockedDown: ['일어나겠습니다. 아직 끝나지 않았어요.'],
        pinnedBySomeone: ['그 손부터 푸는 게 좋겠습니다.'],
        water: ['발밑 확인. 동선을 바꾸겠습니다.'],
        airborne: ['착지 지점부터 확인하겠습니다.'],
        fallCrevasse: ['퇴로가… 끊겼군요.'],
        win: ['위협 요소, 제압했습니다.', '주변 정리까지 마치고 복귀하죠.', '이제 일정대로 돌아가겠습니다.'],
        lose: ['경계를… 늦췄군요.', '아스트라 님을… 기다리게 할 순….'],
        counterSuccess: ['예상 범위 안입니다.', '그 빈틈을 기다렸습니다.'],
        emberFull: ['준비됐습니다. 연결하죠.', '이제 마무리할 차례입니다.'],
      },
    },
  },
  {
    id: 'kidomusha', name: '태도 귀무사', gender: 'female', color: '#c8303a',
    stats: { hp: 840, atk: 35, spd: 305, range: 58, atkRate: 1.05, def: 18, crit: 0.08, critMult: 1.8 },
    attack: { element: 'slash', delivery: 'melee' },
    resist: { slash: 0.9, light: 1.25 },
    // 오니화 게이지: 적중(dealt)·피격(damaged) 시 충전. 가득 차면 오니화 (README '태도 귀무사')
    resources: {
      oni: { name: '오니화', max: 100, display: 'bar', color: '#e8304a', gain: { dealt: 7, damaged: 6 } },
    },
    // oni: 오니화 상태 설정. drain = 초당 게이지 감소, echoDelay = 2회 공격 간격, selfK = 적중 피해 대비 자해 비율
    oni: { res: 'oni', drain: 9, echoDelay: 0.11, echoMult: 0.8, selfK: 0.12, selfMin: 2,
      form: { id: 'kidomusha@oni', name: '태도 귀무사', color: '#c8303a', sprite: { src: 'assets/oni/oni_front.png', back: 'assets/oni/oni_back.png', scale: 0.56, foot: 2, faces: { front: 'left', back: 'left' } }, portrait: 'assets/oni/oni_portrait.png' } },
    skills: [
      { id: 'ghostOn', name: '고스트 온', cd: 8, mult: 1.0, finMult: 4.2, reps: 6, window: 1.2, trackChance: 0.5, element: 'slash', delivery: 'melee' },
      { id: 'spirit', name: '혼령', cd: 6, cost: { oni: 25 }, mult: 1.3, air: { dur: 1.0, h: 44, range: 90 }, element: 'slash', delivery: 'melee' },
    ],
    sprite: { src: 'assets/oni/front.png', back: 'assets/oni/back.png', scale: 0.56, foot: 2, faces: { front: 'left', back: 'left' } },
    portrait: 'assets/oni/portrait.png',
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '고스트 온': ['혼백까지 따라 베겠다!', '내 검무에서 벗어나지 못한다!', '한 번 더, 끝날 때까지!'],
        '혼령': ['이 몸의 경계를 지운다.', '혼의 길로 지나가겠다.', '붙잡은 것은 잔영일 뿐이다.'],
      },
      event: {
        battleStart: ['내가 벨 것은 이미 정했다.', '이 검에 잠든 한을 깨우지 마라.', '{opp}, 물러날 기회는 지금뿐이다.'],
        lowHp: ['쓰러질 자리는… 아직 아니다.', '이 상처까지 짊어지고 간다.'],
        buffed: ['칼 안에서 무언가 눈을 뜨는군.', '힘이여, 내 손을 벗어나지 마라.'],
        debuffed: ['육신은 묶여도 검의 뜻은 남는다.', '이 정도 원한에는 익숙하다.'],
        healed: ['아직 나아갈 힘이 남았군.', '이 몸을 더 써야 하겠지.'],
        stunned: ['의식이… 흔들린다.'],
        knockedDown: ['검을 놓기 전에는 끝나지 않는다.'],
        pinnedBySomeone: ['혼까지 붙잡을 수 있을까.'],
        water: ['차가운 물도 이 한은 못 씻는군.'],
        airborne: ['몸은 가벼워도 검은 무겁다.'],
        fallCrevasse: ['이 어둠의 끝은…!'],
        win: ['또 하나의 싸움이 끝났군.', '승리해도 칼은 가벼워지지 않는다.', '이 검은 다시 거두겠다.'],
        lose: ['아직… 갚지 못했는데.', '이번에도 지키지 못한 건가….'],
        oniAwaken: ['깨어나라… 내가 감당하겠다.', '물러서라. 더는 억누를 수 없다.'],
        oniEnd: ['아직은… 내 의지다.', '돌아가라. 검은 내가 쥔다.'],
        spiritLaunch: ['돌아오는 칼끝을 봐라.', '혼의 경계에서 베겠다.'],
      },
    },
  },
  {
    id: 'duck', name: '오리', gender: 'male', color: '#ffd84a',
    stats: { hp: 750, atk: 32, spd: 345, range: 48, atkRate: 1.2, def: 12, crit: 0.09, critMult: 2.0 },
    attack: { element: 'blunt', delivery: 'melee' },
    resist: { elec: 1.15 },
    traits: ['waterproof'], // 패시브 '오리': 물 관련 불이익(감속·산소·속성 약화) 면역
    skills: [
      { id: 'quack', name: '꽥꽥!', cd: 7, range: 150, flinch: 0.7 },
      { id: 'peck', name: '쪼기', cd: 5, hits: 5, mult: 0.6, gap: 0.08, element: 'slash', delivery: 'melee', dispel: true },
      { id: 'flap', name: '푸드덕!', cd: 9, dur: 1.4, h: 34 },
    ],
    sprite: { src: 'assets/duck/front.png', back: 'assets/duck/back.png', scale: 1.6, foot: 1, faces: { front: 'left', back: 'left' } },
    // 상황별 스프라이트 (game.js drawUnit): fly = 공중(푸드덕), quack/peck = 스킬 중, swim = 물 위, hurt = 피격
    poses: { fly: { id: 'duck@fly', name: '오리', color: '#ffd84a', sprite: { src: 'assets/duck/fly.png', scale: 1.6, foot: 1, faces: { front: 'left', back: 'left' } } }, quack: { id: 'duck@quack', name: '오리', color: '#ffd84a', sprite: { src: 'assets/duck/quack.png', scale: 1.6, foot: 1, faces: { front: 'left', back: 'left' } } }, peck: { id: 'duck@peck', name: '오리', color: '#ffd84a', sprite: { src: 'assets/duck/peck.png', scale: 1.6, foot: 1, faces: { front: 'left', back: 'left' } } }, swim: { id: 'duck@swim', name: '오리', color: '#ffd84a', sprite: { src: 'assets/duck/swim.png', scale: 1.6, foot: 1, faces: { front: 'left', back: 'left' } } }, hurt: { id: 'duck@hurt', name: '오리', color: '#ffd84a', sprite: { src: 'assets/duck/hurt.png', scale: 1.6, foot: 1, faces: { front: 'left', back: 'left' } } } },
    portrait: 'assets/duck/portrait.png',
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '꽥꽥!': ['꽈아아악!', '꽥! 꽥! 꽈악!', '꽤애액!'],
        '쪼기': ['콕! 콕콕콕!', '꽥! 콕콕!', '콕콕! 꽈악!'],
        '푸드덕!': ['푸드드덕!', '푸드덕, 꽥!', '꽈악! 푸드덕!'],
      },
      event: {
        battleStart: ['꽥! 꽥꽥!', '꽈악!', '꽥? 꽥!'],
        lowHp: ['꾸욱… 꽥!', '꽤액…!'],
        buffed: ['꽈아악!', '꽥꽥, 꽥!'],
        debuffed: ['꽥?! 꽤액!', '꾸엑!'],
        healed: ['꽥~ 꽥!', '꾸왁, 꽥!'],
        stunned: ['꾸… 엑?'],
        knockedDown: ['꽥! 꾸욱….'],
        pinnedBySomeone: ['꽈악! 꽥꽥꽥!'],
        water: ['꽥~! 꽈악~!'],
        airborne: ['푸드덕! 꽥!'],
        fallCrevasse: ['꽤애애액!'],
        win: ['꽥꽥! 꽈악!', '꽥! 꽥! 꽥!', '꽈아~악!'],
        lose: ['꾸우욱….', '꽥… 꾸엑….'],
        swimStart: ['꾸왁~ 꽥!', '꽥, 꽥~!'],
      },
    },
  },
  {
    id: 'mystic', name: '신비술사', gender: 'female', color: '#c070e0',
    stats: { hp: 940, atk: 45, spd: 250, range: 115, atkRate: 0.95, def: 8, crit: 0.04, critMult: 1.5 },
    attack: { element: 'dark', delivery: 'ranged' },
    projectile: 'magic',
    resist: { dark: 0.7, light: 1.25 },
    skills: [
      { id: 'mysticBall', name: '미스틱 볼', cd: 5.5, out: 0.75, spd: 260, backSpd: 300, control: 2.0, wallMult: 2.0, wallCd: 0.4, element: 'dark', delivery: 'ranged' },
      { id: 'positioning', name: '포지셔닝', cd: 9, delay: 3.0 },
      { id: 'accelerate', name: '액셀러레이트', cd: 7, spd: 900, spread: 0.75, bounces: 6, life: 3, mult: 0.35, dotDur: 2, dotPow: 4, cdCut: 0.8, element: 'dark', delivery: 'ranged' },
    ],
    // 패시브 (js/mystic.js): 리플레이스(피격 시 20%·내부 쿨 4초 위치 교환 + 해로운 상태 넘기기), 리스트레인트(적중 시 20% 봉인 2초)
    passives: { replace: { chance: 0.2, icd: 4 }, restraint: { chance: 0.2, dur: 2 } },
    sprite: { src: 'assets/mistic/front.png', back: 'assets/mistic/back.png', scale: 0.5, foot: 2, faces: { front: 'left', back: 'left' } },
    portrait: 'assets/mistic/portrait.png',
    lines: { // 대사 (사용자 제공 대사 초안 xlsx)
      skill: {
        '미스틱 볼': ['보옥의 궤적을 따라와봐.', '너의 움직임, 내가 안내해 줄게.', '돌아오는 길도 에스코트를 해줄게.'],
        '포지셔닝': ['내가 돌아올 곳은 여기야.', '이 위치를 기억해봐.', '내 다리만 쳐다보면 안될 껄?.'],
      },
      event: {
        battleStart: ['내 보옥이 너에게 관심을 보이네', '어디, 실력을 보여줘봐.', '{opp}, 겪어보지 못한 걸 느끼게 해주지'],
        lowHp: ['이런 건… 인정할 수 없어.', '아직 내 비전은 끝나지 않았어.'],
        buffed: ['후훗, 보옥의 빛이 더 선명해졌네.', '견딜 수 있겠어?'],
        debuffed: ['내 마법에 간섭하지마!', '이런 방해에 움츠릴 줄 알아?'],
        healed: ['좋아. 다시 우아하게 가 볼께.', '손끝 감각까지 돌아왔어.'],
        stunned: ['잠깐, 생각을 좀…!'],
        knockedDown: ['내 옷에 흙을 묻히다니!'],
        pinnedBySomeone: ['너무 꽉 껴앉는 거 아냐?!'],
        water: ['보옥만은 젖지 않게 해야겠어.'],
        airborne: ['위에서 보면 흐름이 더 잘 보여.'],
        fallCrevasse: ['여기가 아니였는 데..!'],
        win: ['너의 다음 움직임까지 알고 있었지!.', '어때, 마음에 들어?', '이 정도는 내 비전의 시작일 뿐이야.'],
        lose: ['내 계산이 틀렸다니…?', '스승님이라면… 어떻게 하셨을까...'],
        replace: ['그 자리는 너에게 줄게.', '입장이 바뀌었네?'],
        restraint: ['그 기술은 잠시 맡아 둘게.', '조금 조용히 해줘.'],
        positionReturn: ['말했지? 돌아온다고.', '나 보고 싶었어?'],
        controlWall: ['그쪽은 막다른 길이야.', '벽이랑 키스하고 싶었어?'],
      },
    },
  },
];
