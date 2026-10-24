/* =========================================================
 * 스테이지 정의 (데이터 기반)
 *  name/desc  : 표시용
 *  theme      : 바닥 렌더링 방식 ('arena' | 'island' | 'city')
 *  spawns     : [{x,y}, {x,y}] 시작 위치 (논리 좌표, 경기장 x 12~348, y 120~530)
 *  terrain    : 지형 구역 [{ id, name, shape, spdMul, resist, oxygen, splash }]
 *     shape   : { type: 'rect'|'ellipse'|'outsideEllipse', ... }  (발 위치 기준)
 *     spdMul  : 구역 안 이동속도 배율
 *     resist  : 구역 안에서 받는 속성 피해 배율 { elec: 1.4, ... }
 *     oxygen  : { max(초), drain(/초), regen(/초), dmg, tick } 산소 게이지 (0이면 tick마다 dmg)
 *  buildings  : 장애물 [{ x, y, w, h(바닥 면적), hp, style }]  → 충돌 반사, 투사체 차단, 피해 누적/붕괴
 *  buildingRules: { bumpDmg, bumpSpeedK, projK, meleeK, strongMin } 건물 피해 규칙
 * ========================================================= */
const STAGE_DEFS = {
  arena: {
    name: '기본 아레나', desc: '평범한 석조 바닥 경기장.', theme: 'arena',
  },
  island: {
    name: '무인도', desc: '사방이 바다인 섬. 물속은 느리고 산소가 줄어들며 전기에 약해집니다.', theme: 'island',
    island: { cx: 180, cy: 325, rx: 120, ry: 150, sand: 10 },
    spawns: [{ x: 125, y: 345 }, { x: 235, y: 305 }],
    terrain: [{
      id: 'water', name: '물', shape: { type: 'outsideEllipse', cx: 180, cy: 325, rx: 120, ry: 150 },
      spdMul: 0.6,
      resist: { elec: 1.4, fire: 0.8, ice: 1.05 },
      oxygen: { max: 3, drain: 1, regen: 1.5, dmg: 8, tick: 0.5 },
      splash: '#cfeeff',
    }],
  },
  city: {
    name: '시가지', desc: '건물이 빽빽한 도시. 부딪히고 맞으면 건물이 부서집니다.', theme: 'city',
    spawns: [{ x: 110, y: 335 }, { x: 250, y: 335 }],
    buildings: [
      { x: 44, y: 180, w: 52, h: 46, hp: 140, style: 0 },
      { x: 264, y: 180, w: 52, h: 46, hp: 140, style: 1 },
      { x: 154, y: 262, w: 52, h: 50, hp: 180, style: 2 },
      { x: 44, y: 382, w: 52, h: 44, hp: 140, style: 1 },
      { x: 264, y: 382, w: 52, h: 44, hp: 140, style: 0 },
      { x: 154, y: 454, w: 52, h: 38, hp: 120, style: 2 },
    ],
    buildingRules: { bumpDmg: 8, bumpSpeedK: 0.03, projK: 0.6, meleeK: 0.5, strongMin: 60 },
  },
  ballInterior: {
    name: '몬스터볼 내부', desc: '둥근 캡슐 내부. 시간이 지나면 벽이 절반까지 좁혀집니다.', theme: 'ball',
    // circle: 원형 경기장 { cx, cy, r0(시작 반지름), rMin(최소), start(축소 시작 초), dur(축소 시간) }
    circle: { cx: 180, cy: 325, r0: 150, rMin: 75, start: 12, dur: 32 },
    spawns: [{ x: 115, y: 325 }, { x: 245, y: 325 }],
  },
  ballPit: {
    name: '풀장', desc: '알록달록한 공이 가득한 볼풀. 부딪히면 공이 사방으로 튀어 다닙니다.', theme: 'pit',
    // balls: { count, r, area(초기 배치 영역), friction(감속/초), restitution(반발), push(캐릭터가 밀어내는 힘), kick(캐릭터가 받는 반동) }
    balls: { count: 36, r: 7, area: { x: 40, y: 175, w: 280, h: 300 }, friction: 1.3, restitution: 0.85, push: 1.2, kick: 0.15, boost: 0.45,
             colors: ['#ef7a7a', '#f2c94c', '#6fa8f0', '#7fd38a', '#f29ad0', '#f4a560', '#b49af0'] },
  },
  iceCave: {
    name: '얼음 동굴', desc: '미끄러운 빙판. 빠를수록 조종이 어렵고, 금 간 얼음벽이 깨지면 크레바스로 추락!', theme: 'ice',
    // ice: 접지력. 방향 전환 속도(1/초) = traction × speedRef / 현재속도  → 빠를수록 미끄러짐
    ice: { traction: 1.6, speedRef: 240 },
    // iceWalls: 외곽 벽을 segLen 길이 구간으로 분할. crackSpeed 이상으로 벽에 박으면 hp-1, 0이면 파괴(크레바스)
    iceWalls: { segLen: 48, hp: 4, crackSpeed: 245, hitCd: 0.4 },
    spawns: [{ x: 120, y: 325 }, { x: 240, y: 325 }],
  },
  trampoline: {
    name: '트램펄린', desc: '중앙 트램펄린을 밟으면 공중으로 튀어오름. 공중에선 근접 공격 회피, 원거리는 반드시 명중.', theme: 'tramp',
    // pads: 발판 { cx, cy, r, air(체공 시간), height(점프 높이 px), cd(재발동 대기) }
    pads: [{ cx: 180, cy: 325, r: 58, air: 1.0, height: 34, cd: 0 }],
    // landShock: 착지 충격파 { r: 반경, stun: 기절 시간(상태저항 적용), chance }
    landShock: { r: 72, stun: 0.9, chance: 1 },
    spawns: [{ x: 90, y: 325 }, { x: 270, y: 325 }],
  },
  race: {
    name: '레이싱 코스', desc: '타원형 트랙(잔디는 감속). 시계 방향으로 한 바퀴 먼저 완주하면 체력과 상관없이 승리!', theme: 'race',
    // race: 트랙 (타원 링, o/i = 바깥/안쪽 가장자리). 잔디도 이동 가능(grassSpd 배속), 벽은 경기장 외곽뿐. minR: 이 정규화 반경 미만(중앙)에선 랩 각도 미집계. sectors: 체크포인트 수 (시계 방향 순서대로 통과해야 인정)
    race: { cx: 180, cy: 325, rxo: 160, ryo: 198, rxi: 104, ryi: 140, sectors: 8, grassSpd: 0.8, minR: 0.48, board: { rx: 42, ry: 58, bounceRnd: 0.4 }, /* minR: 도로 안쪽 −약 40px까지 진행 집계, board: 중앙 전광판 벽 */ startAng: -Math.PI / 2 },
    spawns: [{ x: 180, y: 160 }, { x: 180, y: 180 }], // 실제 위치는 출발선 직후 안/바깥 차선으로 재배치
  },
  tower: {
    name: '공사 타워', desc: '공사 중인 타워 옥상. 버튼을 밟으면 중앙 해치가 열리고, 그 위에 있던 캐릭터는 추락!', theme: 'tower',
    // tower: buttons = 버튼 위치, hatch = 중앙 해치. 누르면 항상 개방(해치 위 캐릭터 추락). 열리면(wallAt 이상) 벽 → holdT 후 닫힘. btnCd = 버튼 재사용 대기
    tower: { buttons: [{ x: 44, y: 152, r: 18 }, { x: 316, y: 498, r: 18 }], hatch: { x: 140, y: 285, w: 80, h: 80 }, openT: 0.4, holdT: 2.5, closeT: 0.6, wallAt: 0.15, btnCd: 1.5 },
    spawns: [{ x: 110, y: 220 }, { x: 250, y: 430 }],
  },
  street: {
    name: '스트리트 파이트', desc: '관중이 둘러싼 철망 링. 철망을 부수면 밖으로 나갈 수 있고, 관중을 치면 날아갑니다.', theme: 'street',
    // street: fence = 중앙 철망 (맵의 약 37% 넓이), segs = 변별 칸 수. 칸마다 hp (부딪힘/돌진으로 손상, 0이면 뚫림). crowd = 관중 수
    street: { fence: { x: 78, y: 200, w: 204, h: 250 }, segsX: 4, segsY: 5, segHp: 110, bumpDmg: 10, bumpK: 0.03, dashDmg: 45, crowd: 14 },
    spawns: [{ x: 130, y: 325 }, { x: 230, y: 325 }],
  },
  subway: {
    name: '지하철역', desc: '위아래 승강장, 가운데 선로. 열차에 치이면 날아가고, 열차 안에 남은 채 떠나면 탈락!', theme: 'subway',
    // subway: platTop/platBot = 승강장 끝 y, train = 차량 { y, h, cars, carW, doors/windows(차량 내 x구간), stopX }
    subway: {
      platTop: 225, platBot: 425,
      train: { y: 262, h: 126, cars: 4, carW: 120, stopX: -6, doorsBySide: { top: [[80, 148], [250, 318]], bot: [[80, 148], [250, 318]] }, winW: 24, winGap: 10, winHp: 45 } /* 문 4개(위2·아래2 대칭, 폭 68, 열차 기준 x), 창문은 문을 피해 자동 배치 */,
      firstT: 8, gap: [10, 14], warn: 1.8, arrive: 1.5, stop: 3.5, acc: 30, exitHint: 1.4, // exitHint: 문 닫히기 전 탑승자가 문 쪽으로 향하는 시간
      hit: { dmg: 20, air: 0.9, height: 26 },
    },
    spawns: [{ x: 120, y: 175 }, { x: 240, y: 475 }],
  },
  idol: {
    name: '아이돌 무대', desc: '관객석 앞 무대. 스포트라이트를 먼저 밟으면 팬심 획득! 팬심이 앞선 쪽은 능력치 대폭 상승, 대형 스크린에 등장.', theme: 'idol',
    // idol: top = 무대 뒤 벽(스크린) 아래 끝 y, seatY = 관객석 시작 y (그 아래는 벽, 관객은 무적), crowdRows/crowdCols = 관객 배치
    // spot: 스포트라이트 { r, first(첫 등장), gap(획득 후 다음 등장), life(미획득 시 소멸) }, lead: 팬심 리드 버프 (리드 중 고정 배율)
    idol: { top: 186, seatY: 452, crowdRows: 2, crowdCols: 9, spot: { r: 40, first: 2.5, gap: 3.5, life: 8 }, lead: { dmgDealt: 1.3, spdMul: 1.2, atkRateMul: 1.15 } },
    spawns: [{ x: 110, y: 330 }, { x: 250, y: 330 }],
  },
  diving: {
    name: '다이빙 존', desc: '가운데 수영장(물속 감속·산소 감소). 오른쪽 위 계단을 끝까지 오르면 다이빙! 착지 시 물속 상대를 밀어내고 긴 기절.', theme: 'diving',
    // diving: pool = 수영장 (무인도와 같은 물 효과, 위·왼쪽 끝까지), stairs = 계단·플랫폼 구역 (오른쪽 위 전체 기둥) (아래쪽 입구로만 진입, 옆면은 벽), boardY/boardX = 다이빙대 높이/끝 x
    // climbK: 오르는 속도 (이동속도 배율, 40~90px/s), hitBack/bumpBack: 맞거나 부딪히면 밀려 내려가는 거리(px), dive: 체공, stun: 착지 충격 기절(초)
    diving: { pool: { x: 12, y: 120, w: 240, h: 312 }, stairs: { x: 256, y: 120, w: 92, h: 282 }, boardY: 160, boardX: 186, climbK: 0.55, hitBack: 45, bumpBack: 70, dive: { dur: 1.1, h: 48 }, stun: 2.5 },
    terrain: [{
      id: 'water', name: '물', shape: { type: 'rect', x: 12, y: 120, w: 240, h: 312 },
      spdMul: 0.6, resist: { elec: 1.4, fire: 0.8, ice: 1.05 }, oxygen: { max: 3, drain: 1, regen: 1.5, dmg: 8, tick: 0.5 }, splash: '#cfeeff',
    }],
    spawns: [{ x: 70, y: 480 }, { x: 200, y: 485 }],
  },
  soccer: {
    name: '축구장', desc: '위 골대 = 1P, 아래 골대 = 2P. 공격·스킬·몸으로 공을 차서 상대 골대에 먼저 3골! (자책골 주의, 체력 0도 패배)', theme: 'soccer',
    // soccer: top/bottom = 골라인 y, side = 터치라인 여백, goalW = 골문 폭, net = 골망 깊이, win = 승리 골 수, annDur = 골 안내 시간(그동안 공은 골망에, 이후 중앙 재배치)
    // ball: r 반지름, friction 감속(/초), rest 반발, kickBase + atk × kickAtk = 차는 속도(px/s), maxSpd 상한, body 몸통 접촉 배율
    // ai: chase = 공 몰기 모드 확률, turn = 방향 전환 속도(rad/s), dur = 모드 지속 시간 [min,max]
    soccer: { top: 136, bottom: 514, side: 6, goalW: 80, net: 15, postR: 3, win: 3, annDur: 2.2,
      ball: { r: 6, friction: 1.25, rest: 0.78, kickBase: 170, kickAtk: 7.5, maxSpd: 620, body: 0.55 },
      ai: { chase: 0.6, turn: 4.5, dur: [1.5, 3.2] } },
    spawns: [{ x: 180, y: 215 }, { x: 180, y: 435 }],
  },
  fastfood: {
    name: '패스트푸드점 아르바이트', short: '패스트푸드점', desc: '벽 메뉴판을 치면 음식을 들고, 손님에게 닿으면 배달! 그 손님의 스킬 하나를 대신 시전합니다 (잘못 줘도 OK).', theme: 'fastfood',
    // fastfood: wallY = 메뉴판/카운터 아래 끝 y (그 위는 벽), foods = 메뉴 (왼쪽부터 칸), maxCust = 동시 손님 수, custScale = 손님 크기
    // first = 첫 손님, gap = 손님이 나간 뒤 다음 손님까지 [min,max], walk = 걷는 속도, patience = 기다리다 그냥 가는 시간, hitCd = 메뉴판 재타격 대기
    // ai: errand = 심부름 모드 확률 (음식 없음 → 메뉴판 / 들고 있음 → 손님), turn = 방향 전환 속도
    fastfood: { wallY: 176, foods: ['burger', 'pizza', 'chicken', 'fries', 'spaghetti', 'hotdog'], maxCust: 3, custScale: 0.72, first: 0.6, gap: [2.0, 4.0], walk: 55, patience: 24, hitCd: 0.35,
      doors: [300, 450], ai: { errand: 0.45, errandFood: 0.65, turn: 3, dur: [1.4, 3.0] } },
    spawns: [{ x: 110, y: 330 }, { x: 250, y: 330 }],
  },
  claw: {
    name: '인형뽑기 크레인', short: '인형뽑기', desc: '인형뽑기 기계 안! 인형들은 튕기기만 하는 장애물. 가끔 크레인이 아래에서 나타나 위로 한 번, 옆으로 한 번 움직인 뒤 집게를 내립니다 (표시된 곳을 피하세요).', theme: 'claw',
    // claw: dolls = 인형 수, r = 인형 반지름, wander = 인형 이동 속도, scale = 인형 크기, first/gap = 크레인 등장 [초], spd = 크레인 이동 속도(px/s)
    // h = 집게 높이, aim = 집게 위치 표시 시간, drop = 내려가는 시간, grabR = 집는 반경, dangle = 캐릭터가 매달리는 시간, fallDmg = 떨어질 때 최대 체력 비율 피해, respawn = 인형 재등장 [min,max]
    claw: { dolls: 4, r: 10, wander: 32, scale: 0.62, first: 4, gap: [5, 8], spd: 170, h: 64, aim: 0.55, drop: 0.35, grabR: 26, dangle: 1.6, fallDmg: 0.04, respawn: [2.5, 4] },
    spawns: [{ x: 110, y: 330 }, { x: 250, y: 330 }],
  },
  bey: {
    name: '메탈 팽이 경기장', short: '팽이 경기장', desc: '원형 팽이 스타디움. 모두 팽이처럼 회전! 벽에 닿으면 외곽을 크게 한 바퀴 돈 뒤, 그 순간 상대가 있던 곳으로 일직선 돌진.', theme: 'bey',
    // circle.hidden: 기존 원형 경기장 판정만 사용(캡슐 그림 없음, 축소 없음). bey: lapBoost = 외곽 회전 중 가속, chargeBoost = 돌진 가속, lapMax = 한 바퀴 최대 시간(안전장치)
    circle: { cx: 180, cy: 330, r0: 158, rMin: 158, start: 1e9, dur: 1, hidden: true },
    bey: { lapBoost: 0.6, chargeBoost: 1.1, lapMax: 5 },
    spawns: [{ x: 120, y: 330 }, { x: 240, y: 330 }],
  },
  // 새 스테이지 예) 빙판: terrain: [{ id: 'ice', shape: { type: 'rect', x: 12, y: 120, w: 336, h: 410 }, spdMul: 1.3, resist: { fire: 1.2 } }]
};
const STAGE_RANDOM = 'random';
// 스테이지 확장 훅: { match(st), init(b), step(b, dt), clamp(b, x, y, pad), noClamp(b, u), floor(ctx, st), drawUnder(ctx, b), drawOver(ctx, b), drawTop(ctx, b) (이펙트 위, 글자 아래) }
const STAGE_HOOKS = [];

function shapeContains(s, x, y) {
  if (s.type === 'rect') return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  const dx = (x - s.cx) / s.rx, dy = (y - s.cy) / s.ry, inside = dx * dx + dy * dy <= 1;
  return s.type === 'ellipse' ? inside : !inside;
}
