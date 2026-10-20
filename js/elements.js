/* =========================================================
 * 속성(원소) & 공격 전달 방식 정의
 *  ELEMENT_DEFS : 피해 속성. 캐릭터 resist: { 속성키: 배율 } (1 = 보통, <1 저항, >1 약점)
 *  DELIVERY_DEFS: 공격 전달 방식 (근접/원거리). 속성과 별개. resist 에 'melee'/'ranged' 키로 배율 지정 가능
 *  관통(pierce)은 속성이 아니라 공격 속성값: 방어력의 일부(0~1)를 무시
 *  독 등은 속성이 아니라 상태이상(status.js)
 * ========================================================= */
const ELEMENT_DEFS = {
  slash: { name: '베기', color: '#e8eef4' },
  blunt: { name: '타격', color: '#d8c8a8' },
  fire:  { name: '화염', color: '#ff9a5a' },
  ice:   { name: '빙결', color: '#9fe0ff' },
  elec:  { name: '전기', color: '#fff07a' },
  light: { name: '빛',   color: '#fff4c0' },
  dark:  { name: '어둠', color: '#c890ff' },
  // 새 속성 예) wind: { name: '바람', color: '#b8f0d0' },
};
const DELIVERY_DEFS = {
  melee:  { name: '근접' },
  ranged: { name: '원거리' },
};
// 약점/저항 판정 기준 및 표시
const ELEMENT_FX = {
  weak:   { min: 1.05, label: '약점!', color: '#ff9a6a', sizeAdd: 3 },
  resist: { max: 0.95, label: '저항',  color: '#a8b0c4', sizeAdd: -1 },
};
