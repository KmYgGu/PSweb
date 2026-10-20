# 픽셀 오토 배틀 (프로토타입)

HTML/CSS/바닐라 JS + Canvas. 빌드 과정 없음. `python3 -m http.server 8080` 실행 후 http://localhost:8080 접속 (index.html 파일을 바로 열어도 동작함).

## 파일 구성
| 파일 | 역할 |
|---|---|
| `index.html` | 화면 구조 (선택 화면, HUD, 로그, 결과 창) |
| `css/style.css` | UI 스타일 (360x640 논리 해상도, 화면 크기에 맞게 확대) |
| `js/characters.js` | **스탯 정의 + 캐릭터 데이터** |
| `js/elements.js` | **속성(ELEMENT_DEFS) / 전달 방식(DELIVERY_DEFS) / 약점·저항 표시 기준** |
| `js/stages.js` | **스테이지 정의 (STAGE_DEFS): 지형 구역·건물·시작 위치** |
| `js/status.js` | **상태이상 정의 (STATUS_DEFS)** |
| `js/skills.js` | 스킬 로직 (AI 사용 조건 + 실행) |
| `js/sprites.js` | 16x16 픽셀 스프라이트/초상화 절차적 생성 |
| `js/game.js` | 전투 엔진 (`Battle`, `Unit`, AI, 피해 계산) + 렌더러 |
| `js/main.js` | 화면 흐름, HUD, 배속, 메인 루프(1/120초 고정 스텝) |

## 스탯 구조
- `STAT_DEFS`: 선택 화면에 보여줄 스탯 `{ key, label, max, fmt? }`
- `STAT_DEFAULTS`: 모든 스탯의 기본값. 캐릭터는 바꾸고 싶은 값만 `stats`에 적으면 됨.
- 유닛 생성 시 `unit.st = { ...STAT_DEFAULTS, ...def.stats }` 로 합쳐짐.
- 현재 엔진이 사용하는 스탯: `hp, atk, spd(px/초), range(px, 80 이상은 원거리), atkRate(초당 공격), def, crit`.
- 버프는 `unit.buffs`에 `{ type, t, 배율키... }`로 넣으며 `unit.mult('키')`로 곱연산 됨 (`spdMul`, `atkRateMul`, `dmgTaken`, `lifesteal`, `reflect`).

### 새 스탯 추가 방법 (예: 방어력/치명타)
`def`, `crit`는 이미 엔진(`Battle.damage`)에 연결되어 있음:
1. `STAT_DEFS`에 `{ key: 'def', label: '방어력', max: 50 }` 추가 → 선택 화면에 막대로 표시됨.
2. 캐릭터 `stats`에 `def: 20` 지정 (없으면 기본값 0).

완전히 새로운 스탯(예: `evasion` 회피):
1. `STAT_DEFAULTS`에 `evasion: 0` 추가.
2. (표시하려면) `STAT_DEFS`에 한 줄 추가.
3. `js/game.js`의 `Battle.damage()` 계산 파이프라인에 한 줄 추가: `if (Math.random() < tgt.st.evasion) return 0;`

## 이동 방식 (핀볼/팽이 스타일)
캐릭터는 서로를 향해 걷지 않습니다. 마찰 없이 `spd`(px/초) 일정 속도로 직진하고, 벽에 닿으면 반사(±0.25rad 무작위 + 상대 쪽으로 최대 0.8rad 꺾임 → 충돌 빈도 증가), 서로 부딪히면 동일 질량 탄성 충돌로 튕겨나가며 잠시 +45% 가속(약 0.6초에 걸쳐 감쇠). 충돌 시 작은 링/스파크, 강한 충돌에만 미세한 화면 흔들림. 이동 중 옅은 잔상. 물리는 1/120초 서브스텝으로 진행해 4배속에서도 터널링 없음. 상대가 사거리 안이면 이동 중 자동 공격/스킬. 근접 캐릭터는 충돌 순간 공격 쿨이 절반 이상 찼으면 즉시 '충돌 타격'. 돌진 스킬은 상대 이동을 예측/추적.

## 캐릭터 추가 방법
`CHARACTERS`에 객체 추가: `id, name, color, stats, skills: [...], projectile?('arrow'|'magic'|'holy'), sprite, portrait?`.
스프라이트는 기본 16x16 인체 템플릿 위에 `rows`(행 교체), `rects`, `px`(`pxLine` 헬퍼)로 무기/모자를 덧그림. 팔레트 키: H 머리, S 피부, E 눈, B 몸, A 장식, L 다리, D 신발, W 금속, w 나무, M 마법.

### 스킬 여러 개 (skills 배열)
```js
skills: [
  { id: 'dashSlash', name: '질풍참', cd: 6 },
  { id: 'ironWall',  name: '철벽 방패', cd: 12, canUse: (u, e, d) => u.hp < u.maxHp * 0.5 }, // 슬롯별 사용 조건 재정의(선택)
],
```
- 슬롯마다 독립 쿨타임(`unit.skillT[i]`), 시작 시 쿨의 35~50%가 남은 상태.
- 사용 조건: 슬롯의 `canUse`가 있으면 그것, 없으면 `SKILLS[id].canUse`.
- 같은 프레임에 여러 슬롯이 준비되면 배열 앞쪽이 우선(프레임당 1개 사용).
- 사용 시 하단 로그에 '캐릭터명: 스킬명' 표시, 선택 화면에 스킬 목록 표시. (캐릭터 위에 쿨타임/준비 표시는 없음)
- `use(u, e, b, slot)`의 4번째 인자로 슬롯 객체가 전달되므로 슬롯에 커스텀 값(예: `power: 2`)을 넣어 같은 스킬을 다른 수치로 재사용 가능.

새 스킬은 `js/skills.js`의 `SKILLS`에 `{ desc, canUse(u,e,d,b), use(u,e,b) }` 추가. 사용 가능한 API: `b.damage, b.heal, b.stun, b.windup, b.dash, b.shoot, b.later, b.telegraphLine/Circle/Fan, b.ring, b.puff, b.explosion, b.text, b.clampPos`.

## 스테이지 (`js/stages.js`)
흐름: 캐릭터 2명 선택 → 스테이지 선택(기본 아레나 / 무인도 / 시가지 / 무작위) → 전투. '다시 싸우기'는 같은 스테이지(무작위였다면 뽑힌 스테이지) 유지. 하단 바와 결과 창에 스테이지 이름 표시.

- **몬스터볼 내부**: 원형 경기장(`circle`). 12초부터 32초에 걸쳐 반지름이 150→75로 부드럽게 축소, 3초 뒤 위치를 점선 예고 링으로 표시. 원형 벽은 법선 기준 반사, 축소 시 바깥 캐릭터는 안쪽으로 밀림, 투사체는 벽에서 소멸.
- **풀장**: 공 36개(`balls`, 반지름 7). 캐릭터가 공에 부딪히면 캐릭터끼리 충돌처럼 반사·충격 링·짧은 가속(`boost`), 공은 날아감(돌진 중엔 관통). 정지 상태로 시작, 캐릭터/투사체/충격파(스킬 AoE)에 밀려 공-공·공-벽·공-캐릭터 충돌(공간 격자, 마찰로 서서히 정지, 정지 공은 계산 생략). 공은 피해 없음·사라지지 않음. 캐릭터도 살짝 튕김.
- **무인도**: 섬 바깥(`outsideEllipse`)이 물 구역. 물속 이동속도 x0.6, 받는 속성 피해 전기 x1.4 / 화염 x0.8 / 빙결 x1.05 (`terrain[].resist`). 입수/출수 물보라, 이동 중 물결 파문. 물속에서 머리 위 산소 게이지가 줄고(3초), 0이면 0.5초마다 8 피해, 육지에서 회복(초당 1.5). 경기장 가장자리 반사는 동일.
- **시가지**: 건물 6채(`buildings`). 캐릭터는 건물에 반사되며 충돌마다 건물 피해(`bumpDmg + 속도×bumpSpeedK`). 투사체는 건물에 막히고 피해(`projK`), 근접 공격도 근처 건물 타격(`meleeK`), 폭발/대지 강타/돌진은 강한 타격(`strongMin` 이상이면 즉시 붕괴). 체력에 따라 균열 3단계 → 붕괴 시 잔해·먼지 이펙트 후 통과 가능한 잔해 바닥. 시작 위치는 건물 밖으로 보정, 매 스텝 건물 밖으로 밀어내 끼임 방지.

새 스테이지 추가:
```js
swamp: { name: '늪지', desc: '...', theme: 'arena',          // theme: 바닥 그리기 방식 (arena/island/city, game.js의 paint*에 추가 가능)
  spawns: [{ x: 100, y: 330 }, { x: 260, y: 330 }],
  terrain: [{ id: 'mud', shape: { type: 'rect', x: 12, y: 300, w: 336, h: 80 }, spdMul: 0.7, resist: { fire: 0.8 } }],
  buildings: [{ x: 160, y: 200, w: 40, h: 40, hp: 100, style: 1 }] },
```
원형 경기장 키: `circle: { cx, cy, r0, rMin, start, dur }`. 볼풀 키: `balls: { count, r, area, friction, restitution, push, kick, colors }`.
구역 키: `shape(rect|ellipse|outsideEllipse), spdMul, resist, oxygen{max,drain,regen,dmg,tick}, splash(물보라 색)`. 테스트: `BattleSim.simulate(a, b, 300, 'city')`.

## 속성 · 전달 방식 · 관통 (`js/elements.js`)
- **속성(element)**: 베기 slash, 타격 blunt, 화염 fire, 빙결 ice, 전기 elec, 빛 light, 어둠 dark. 모든 피해에 지정 (기본 공격 `attack`, 스킬 슬롯).
- **전달 방식(delivery)**: `melee`(근접) / `ranged`(원거리). 속성과 별개 (활 = 베기+원거리, 창 = 베기+근접).
- **관통(pierce)**: 속성이 아닌 공격 속성값. 대상 방어력의 해당 비율 무시 (`pierce: 0.3` = 방어 30% 무시).
- 캐릭터 `resist: { fire: 0.5, dark: 1.5, ranged: 0.85 }` (속성 또는 전달 방식 키, 없으면 1). 버프에 `resist: {...}` 를 넣어 일시적 저항도 가능.
- 배율 ≥1.05 → 주황 숫자 + '약점!', ≤0.95 → 회색 숫자 + '저항' (`ELEMENT_FX`에서 조정).
- 피해 계산 순서: 공격력 × 스킬배율 → 치명타 → 방어 `100/(100+def×(1-pierce))` → 속성/전달 배율 → 버프/상태 배율 → 장기전 증폭 → ±15% 난수. 독 등 지속 피해는 방어·속성 무시.
- 새 속성: `ELEMENT_DEFS`에 `wind: { name: '바람', color: '#b8f0d0' }` 추가 후 공격/스킬에 `element: 'wind'`.

```js
attack: { element: 'slash', delivery: 'ranged', pierce: 0.3 },
skills: [{ id: 'lanceCharge', name: '돌격 찌르기', cd: 8, element: 'slash', delivery: 'melee', pierce: 0.5, applies: [...] }],
resist: { slash: 0.85, fire: 1.25 },
statusResist: { all: 0.1, stun: 0.4 },
```

## 상태이상 저항
- 캐릭터 `statusResist: { all, <상태id> }` + 활성 버프의 `statusResist`(숫자 = 전체, 또는 객체) 합산, 최대 0.9.
- 부여 확률 ×(1−r), 지속시간 ×(1−r/2). 저항으로 막히면 '기절 저항' 같은 작은 글자 표시.
- 예: 탱커 철벽 방패 버프는 `statusResist: 0.6`.

## 상태이상 시스템 (`js/status.js`)
`STATUS_DEFS`에 상태를 데이터로 정의. 모든 상태는 지속시간이 끝나면 자동 해제(석화처럼 특수 해제는 콜백으로).

| id | 이름 | 효과 |
|---|---|---|
| poison | 독 | 0.5초마다 소량 피해 (`power`) |
| stun | 기절 | 이동·행동 불가 |
| confusion | 혼란 | 수시로 무작위 방향 전환, 공격 60% 오조준/헛손질 |
| weaken | 쇠약 | 주는 피해 x0.6 |
| petrify | 석화 | 이동·행동 불가, 피격 시 피해 x2.2 후 해제 |
| paralysis | 마비 | 약 1초마다 0.4초씩 굳음 |

부여 방법 (데이터만 수정):
```js
skills: [{ id: 'fireball', name: '화염구', cd: 8, applies: [{ status: 'weaken', duration: 4, chance: 1 }] }],
attackApplies: [{ status: 'poison', duration: 3, chance: 0.25, power: 5 }],   // 기본 공격 적중 시
```
스킬 코드에서는 `b.damage(u, e, amount, { applies: ap(slot) })` 또는 `b.applyList(u, e, list)` / `b.applyStatus(e, 'stun', 1.2, u)`.
부여 시 머리 위 아이콘(남은 시간 바), 스프라이트 덧칠/파티클, 하단 로그 '캐릭터명: 상태명' 자동 표시.

### 7번째 상태 추가 예 (화상)
```js
burn: { name: '화상', color: '#ff9a5a', tint: '#ff7a3a', tintA: 0.25, particle: '#ffb07a', tick: 0.4,
        onTick(u, b, s) { b.damage(s.src, u, s.power || 5, { dot: true, noCrit: true }); } },
```
사용 가능한 키: `name, color, tint, tintA, particle, blocksMove, blocksAct (bool 또는 (u,s)=>bool), dmgDealt, dmgTaken, spdMul, misdirect, tick+onTick, onApply, onUpdate, onExpire, onDamaged(→피해 배율), stack('refresh'|'ignore')`.
엔진은 `unit.blocked(키)`, `unit.smult(키)`, `unit.smax(키)`로 이 값들을 일반적으로 조회하므로 새 배율 키도 쉽게 추가 가능.

## 이펙트 API (스킬에서 사용)
`b.glow`(가산 발광), `b.shock`(충격파 링), `b.crescent`(초승달 베기), `b.streak`(궤적), `b.bolt`(번개), `b.sparks`, `b.embers`, `b.smoke`, `b.debris`, `b.explosion`, `b.hitstop(초)`(짧은 슬로모션), `b.zoomAt(x,y,k)`(미세 줌 펄스). 돌진 `b.dash/b.chase`의 마지막 인자로 궤적 색 지정. 전체 화면 플래시는 사용하지 않음.

## PNG 스프라이트 (선택)
```js
sprite: 'assets/knight.png',                       // 단일 이미지 (프레임 1장)
// 또는 스프라이트 시트 (프레임을 가로 한 줄로 배치)
sprite: { src: 'assets/knight.png', frameW: 32, frameH: 32, frames: 2, fps: 6,
          scale: 1.5,            // 표시 배율 (생략 시 높이 ~54px에 맞는 0.5 단위 배율 자동: 16→3, 32→1.5, 64→1)
          // height: 54,         // scale 대신 표시 높이(px) 지정 가능
          foot: 1,               // 이미지 하단 투명 여백(px, 원본 기준) → 발 위치 보정
          portraitRect: [4, 0, 24, 24], // 초상화로 잘라낼 영역 (생략 시 첫 프레임 상단 중앙)
          pal: {...}, rows: {...} },    // (선택) 이미지 로드 실패 시 쓸 절차적 스프라이트 정의
portrait: 'assets/knight_face.png',   // (선택) 별도 초상화 이미지
```
- 기본 방향은 **오른쪽을 바라보는** 그림. 왼쪽은 자동 좌우 반전.
- 이동 중에는 프레임 순환, 정지 시 0번 프레임. 피격 흰색 번쩍임용 실루엣은 자동 생성.
- 최근접 이웃(nearest-neighbor) 스케일링. 캔버스 내부 해상도가 2배라 0.5 단위 배율도 선명.
- 이미지가 없거나 로드 실패 시 경고만 남기고 절차적 스프라이트로 폴백.
- 예시: `assets/example_knight.png` (32x32, 2프레임), `assets/example_knight_portrait.png`.
- file:// 로 열면 브라우저 보안상 PNG 초상화 자르기가 막힐 수 있으니 로컬 서버 사용 권장.

## 밸런스
- 25초 이후 피해량이 초당 13%씩 증가 (장기전 방지, 로그에 안내). `js/game.js`의 `RAMP_START`, `RAMP_RATE`로 조절.
- 테스트용 `BattleSim.simulate(defA, defB)` (브라우저 콘솔)로 헤드리스 대전 가능.
- 전체 매치업 40회씩 시뮬레이션: 캐릭터별 승률 46~56%, 전투 시간 중앙값 ~34초 (10%~90% 구간 22~44초, 최대 ~56초, 1배속).

## 얼음 동굴 (`iceCave`)
- `ice: { traction, speedRef }`: 빙판 관성. 실제 이동 벡터 `u.v`가 목표 방향(dir×speed)으로 서서히 수렴하며, 수렴 속도 = traction × speedRef / 현재속도 (빠를수록 미끄러짐). 속도 크기는 일정 유지.
- `iceWalls: { segLen, hp, crackSpeed, hitCd }`: 외곽 벽을 구간으로 분할. 벽 방향 속도 ≥ crackSpeed(또는 돌진 중) 충돌 시 hp-1 → 균열 단계 표시, 0이면 크레바스. 크레바스 구간으로 벽을 넘으면 즉시 실격(`battle.fallen`, `simulate().fell`).

## 트램펄린 (`trampoline`) / 공중 상태
- `pads: [{ cx, cy, r, air, height, cd }]`: 밟으면 `u.air` 설정 → `u.airborne` true. 공중에선 유닛/공/건물/지형 충돌 없음, 착지 시 링 효과.
- 명중 판정 `Battle.hitCheck(src, tgt, o)` (damage() 진입 시):
  - 공중 대상: 근접(delivery 'melee') 항상 '회피', 원거리(delivery 'ranged') 항상 '명중'(혼란 오조준 무시, 투사체 유도).
  - 그 외: `evasion(tgt) - accuracy(src)` 확률로 회피. 현재 스텁(`st.eva`, `st.acc` 기본 0 → 항상 명중).
  - 향후 명중/회피 스탯은 STAT_DEFS/STAT_DEFAULTS에 `acc`, `eva`를 추가하면 바로 반영됨.
- `landShock: { r, stun, chance }`: 착지 시 충격파. 반경 내 지상의 상대는 넘어지며(옆으로 눕는 포즈) 기절(상태저항 적용), 기절이 끝나면 일어남.

## 카메라
- 흔들림/줌 펄스는 `draw()`의 단일 카메라 변환으로 바닥·스테이지 오브젝트·유닛·이펙트 전체에 동일 적용. HUD/로그는 DOM이라 영향 없음.

## 라인하르트 (첫 정식 캐릭터, `reinhardt`)
- 스프라이트: `assets/REINHARDT/front.png`(아래/정면 이동), `back.png`(위로 이동), `portrait.png`. 원본 `rein_src.png`에서 가장자리 플러드필로 흰 배경 제거 → 앞/뒤 분리 → 64px 높이로 축소(박스 평균 + 알파 임계값 + 외곽선 보정).
- `sprite: { src, back, scale, foot, noMirror }`: `back` 이 있으면 위쪽 이동 시 뒷모습 사용, `noMirror` 는 좌우 반전 안 함.
- `size`: 충돌 반경 배율 (기본 15px × size). `hammer: true`: 절차적 로켓 해머(휘두르기 회전).
- 스킬 (슬롯 값으로 조정):
  - 화염 강타 `fireStrike` (mult 1.3, cd 7): 관통 화염파 (화염·원거리).
  - 돌진 `rCharge` (mult 3, cd 10): 시전 순간 적 위치 방향으로 벽/건물까지 직진(비유도). 닿으면 '제압'(pin) 상태로 앞에 붙잡아 운반, 벽 충돌 시 큰 피해 후 해제. 놓치면 벽에서 짧게 휘청. 얼음벽은 균열(제압 시 2단계), 크레바스면 앞에 있는 쪽이 추락. 공은 밀어냄.
  - 방벽 `barrier` (hp 400, dur 4, cd 12): 적을 향해 회전하는 방벽. 정면으로 들어오는 투사체/원거리 피해를 흡수(피해량만큼 내구도 감소), 근접은 통과.
  - 대지 분쇄 `earthshatter` (stun 1.1, cd 13): 전방 부채꼴 균열 충격파, 적중 시 넘어짐 기절 (`Battle.knockdown`, 상태저항 적용).
- 상태 `pin`(제압): 행동/이동 불가, 돌진 종료/벽 충돌 시 해제 (3초 안전장치).

### 라인하르트 업데이트
- 스프라이트 96px 높이(배율 1, 내부 2배 해상도에서 정수 배율), `size: 1.65` → 충돌 반경 ~25px. `Unit.pad`(=15×(size−1))로 벽/원형벽/건물/공/돌진 판정 반경을 키움. 해머는 `hammerScale`(기본 size)로 확대. 잔상은 뒷모습/noMirror 반영.
- 방벽 중 이동속도 ×0.6 (방벽 슬롯 `spdMul`).
- `piercesBarrier`: 투사체(`shoot({ piercesBarrier: true })`) 또는 피해 옵션에 지정하면 방벽을 무시. 화염 강타가 사용.

## 대사 시스템
캐릭터 정의에 `lines` 추가 (없으면 기존 '캐릭터명: 스킬명' 로그):
```js
lines: {
  skill: { '스킬 표시 이름': ['대사1', '대사2'] },      // 스킬 시전 시 로그: 이름: "대사" [스킬명 태그]
  event: { battleStart: [...], win: [...], ... },        // 이벤트 대사 (로그 + 머리 위 말풍선)
  cd: { lowHp: 10 },                                       // (선택) 이벤트별 쿨다운 초. 기본 6초, 스킬 0초
}
```
- 무작위 선택(직전과 같은 대사 회피), 캐릭터당 대사 간 최소 1.2초. battleStart/win/lose/fallCrevasse는 쿨다운 무시. 대사는 하단 로그에만 표시(말풍선 없음). 대사가 없는 이벤트는 아무것도 표시하지 않음.
- 범용 이벤트: battleStart, buffed(버프 획득), debuffed(해로운 상태이상: 기절/넘어짐/제압/독 등 — `STATUS_DEFS`에 `positive: true`면 제외), healed(회복), barrierHit(방벽 피격), lowHp, kill/win, lose.
- 상황 이벤트(대사 지정 시 사용): wallSlam, chargeMiss, pinned(붙잡음), pinnedBySomeone, stunned, knockedDown, barrierBroken, fallCrevasse, airborne, water. (라인하르트는 붙잡힘/기절/넘어짐을 debuffed 하나로 처리)
- 새 이벤트: 코드에서 `battle.say(unit, '키')` 호출.

## 이블린 (`evelyn`, 젠레스 존 제로)
- 스프라이트 `assets/evelyn/front.png`·`back.png`(원본 픽셀 그대로, 121px) → `scale: 0.5` = 내부 2배 캔버스에서 정확히 1:1 픽셀(약 60px 높이). `portrait.png`는 앞모습 상단 크롭.
- 기본 공격 2연타 (`combo: { retreat, retreatSpd, approachSpd, maxT, mult2 }`): 1타 → 잠깐 후퇴 → 재접근 2타 → 일반 이동 복귀. 범용 액션 `combo`.
- 와이어 낚아채기 `wireSnatch`: 시전 순간 위치로 비유도 와이어 투사체(방벽에 막힘). 적중 시 끌어당김(`battle.pull`) + 속박.
- 교살식 `garrote`: 화염 매듭 50 소모, 시전 중 받는 피해 50%, 적중 시 표식 +1.
- 뒤엉킨 금제_속박식 `bindingSeal`: 반격 자세(`window` 초). 그 사이 공격/스킬/투사체/상태이상/돌진 제압이 닿으면 자동 '회피' + 짧은 무적(0.35초) + 매듭 MAX. 실패 시 소량. AI는 `battle.threatTo(u)`(접근 투사체, 돌진, 예고) 또는 낮은 확률로 사용.
- 교살 폭발 `garroteBurst`: 표식 3개일 때만, 전부 소모. 여러 가닥 와이어로 속박 → 화염 폭발.
- 상태 `bind`(속박): 이동 불가, 행동/공격 가능 (기절과 구분).

## 자원 시스템 (게이지/표식)
```js
resources: {
  ember: { name: '화염 매듭', max: 100, display: 'bar', color: '#ff9a4a', start: 0,
           gain: { basicHit: 6, counterSuccess: 'max', counterFail: 15 } },   // 이벤트별 자동 획득 ('max' = 가득)
  mark:  { name: '표식', max: 3, display: 'pips', color: '#ffcf70' },          // pips = 머리 위 아이콘
}
skills: [{ id, cost: { ember: 50 } /* 소모 */, requires: { mark: 3 } /* 조건 */, consumeAll: ['mark'] /* 전부 소모 */ }]
```
- `display: 'bar'` → 상단 HP바 아래 작은 게이지, `'pips'` → 머리 위 아이콘.
- 코드: `battle.gainRes(u, id, amt)`, `battle.resEvent(u, 'basicHit')`(gain 표 적용), `battle.canPay/pay(u, slot)` (스킬 시전 시 자동).

## 스프라이트 방향 (격투게임식)
- 상대보다 위(y가 작음)에 있으면 앞모습, 아래면 뒷모습 (데드존 10px). 좌우는 상대 쪽을 바라보도록 반전 (데드존 8px, 행동 불가 중엔 유지).
- `sprite.faces: { front: 'left'|'right', back: 'left'|'right' }` = 원본 그림이 바라보는 방향. 없으면 'right'로 가정(절차적 스프라이트). 잔상/넘어짐/해머/와이어도 같은 기준(`spriteSX`)을 사용.
- 판정: 라인하르트 front=left, back=right / 이블린 front=left, back=left.
