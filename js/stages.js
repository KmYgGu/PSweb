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
    pads: [{ cx: 180, cy: 325, r: 58, air: 1.0, height: 34, cd: 6 }],
    // landShock: 착지 충격파 { r: 반경, stun: 기절 시간(상태저항 적용), chance }
    landShock: { r: 72, stun: 0.9, chance: 1 },
    spawns: [{ x: 90, y: 325 }, { x: 270, y: 325 }],
  },
  // 새 스테이지 예) 빙판: terrain: [{ id: 'ice', shape: { type: 'rect', x: 12, y: 120, w: 336, h: 410 }, spdMul: 1.3, resist: { fire: 1.2 } }]
};
const STAGE_RANDOM = 'random';

function shapeContains(s, x, y) {
  if (s.type === 'rect') return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  const dx = (x - s.cx) / s.rx, dy = (y - s.cy) / s.ry, inside = dx * dx + dy * dy <= 1;
  return s.type === 'ellipse' ? inside : !inside;
}
