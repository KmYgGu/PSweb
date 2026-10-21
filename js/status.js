/* =========================================================
 * 상태이상 정의 (데이터 기반)
 *  키 = 상태 id. 스킬/공격의 applies: [{ status, duration, chance, power? }] 로 부여
 *  name     : 표시 이름 (머리 위 아이콘, 하단 로그 '캐릭터명: 상태명')
 *  color    : 아이콘/파티클 색, tint: 스프라이트 덧칠 색, tintA: 덧칠 강도
 *  blocksMove / blocksAct : true 또는 (u, s) => bool  (이동/행동 불가)
 *  dmgDealt / dmgTaken / spdMul : 배율 (곱연산)
 *  misdirect: 0~1 공격 빗나감/오조준 확률
 *  tick + onTick(u, b, s) : tick초마다 호출
 *  onApply / onUpdate(u, b, s, dt) / onExpire / onDamaged(u, b, s, o) → 피해 배율 반환
 *  particle : 상태 중 몸에서 피어오르는 파티클 색
 *  stack    : 'refresh'(기본, 지속시간 갱신) | 'ignore'
 *  인스턴스 s = { id, t(남은 시간), dur, src(부여자), power, ...상태별 변수 }
 * ========================================================= */
const STATUS_DEFS = {
  poison: {
    name: '독', color: '#9be36b', tint: '#7fd85a', tintA: 0.28, particle: '#a8f07a',
    tick: 0.5,
    onTick(u, b, s) { b.damage(s.src, u, s.power || 7, { dot: true, noCrit: true, quiet: true, color: '#b8f08a' }); },
  },
  stun: {
    name: '기절', color: '#ffe27a', blocksMove: true, blocksAct: true,
    onApply(u) { u.action = null; },
  },
  // 움찔: 꽥꽥!에 놀라 잠깐 멈춤 (이동·행동 불가, 짧음)
  flinch: {
    name: '움찔', color: '#fff2a0', blocksMove: true, blocksAct: true, tint: '#ffffff', tintA: 0.12,
    onApply(u) { u.action = null; },
  },
  // 제압: 라인하르트 돌진에 붙잡힘. 벽 충돌 시 해제 (타이머는 안전장치)
  pin: {
    name: '제압', color: '#ffb36b', tint: '#ff9a4a', tintA: 0.18, blocksMove: true, blocksAct: true, stack: 'ignore',
    onApply(u) { u.action = null; },
  },
  // 속박: 이동 불가 (행동/공격은 가능). 기절과 구분
  bind: {
    name: '속박', color: '#ffb070', tint: '#ff9a50', tintA: 0.16, blocksMove: true, particle: '#ffc890',
  },
  confusion: {
    name: '혼란', color: '#d8a0ff', tint: '#c890ff', tintA: 0.22, particle: '#e0b8ff',
    misdirect: 0.6,
    onUpdate(u, b, s, dt) { // 이따금 엉뚱한 방향으로 방향 전환
      s.turn = (s.turn ?? 0.3) - dt;
      if (s.turn <= 0) { s.turn = rand(0.25, 0.55); u.dir = fixAngle(rand(0, Math.PI * 2)); }
    },
  },
  weaken: {
    name: '쇠약', color: '#9fb0d0', tint: '#5a6888', tintA: 0.3, particle: '#8a9ab8',
    dmgDealt: 0.6,
  },
  petrify: {
    name: '석화', color: '#c8c0b0', tint: '#9a9488', tintA: 0.65, blocksMove: true, blocksAct: true,
    onApply(u) { u.action = null; },
    onDamaged(u, b, s, o) { // 맞으면 큰 추가 피해 + 석화 해제
      if (o.dot) return 1;
      s.t = 0;
      b.text(u.x, u.y - 58, '파쇄!', '#f0e0c0', 13);
      b.shatter(u.x, u.y - 18);
      return 2.2;
    },
  },
  paralysis: {
    name: '마비', color: '#fff07a', tint: '#fff07a', tintA: 0.18, particle: '#fff6a8',
    blocksMove: (u, s) => s.freeze > 0, blocksAct: (u, s) => s.freeze > 0,
    onUpdate(u, b, s, dt) { // 가끔 잠깐 굳음
      s.freeze = Math.max(0, (s.freeze || 0) - dt);
      s.next = (s.next ?? rand(0.2, 0.6)) - dt;
      if (s.next <= 0) { s.next = rand(0.7, 1.3); s.freeze = 0.4; b.zap(u.x, u.y - 20); }
    },
  },
  // 조종: 신비술사 미스틱 볼. 스스로 이동 불가, 신비술사가 움직인 만큼 똑같이 끌려다님 (벽에 부딪히면 큰 피해; js/mystic.js)
  control: {
    name: '조종', color: '#d890ff', tint: '#b070ff', tintA: 0.22, particle: '#e0b0ff', blocksMove: true,
  },
  // 봉인: 신비술사 리스트레인트. 스킬 사용 불가 (기본 공격·이동·패시브는 가능). 머리 위 자물쇠 표시
  seal: {
    name: '봉인', color: '#a8a0ff', tint: '#6a60c0', tintA: 0.15, blocksSkill: true,
  },
  // 기 저하: 파라가스 '기를 낮추거라'. 주는 피해 감소 (= 공격력 디버프). 브로리도 맞으면 걸림
  kiDown: {
    name: '기 저하', color: '#9fe0c8', tint: '#4a8a78', tintA: 0.22, particle: '#b8f0dc',
    dmgDealt: 0.7,
  },
  // 새 상태 예) 화상
  // burn: { name: '화상', color: '#ff9a5a', tint: '#ff7a3a', tintA: 0.25, particle: '#ffb07a', tick: 0.4,
  //         onTick(u, b, s) { b.damage(s.src, u, s.power || 5, { dot: true, noCrit: true, quiet: true }); } },
};
