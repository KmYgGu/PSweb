# 전투 VFX — 지정 연출만 유지

2026-11-07 KST: `fe56488`의 광범위한 PixelFX/Codixel 교체를 원복하고 아래 일곱 연출만 유지합니다.
원본 기준은 `7bcf3a0`. 판정·데미지·타이밍·넉백·튕김·기존 RNG 호출은 바꾸지 않습니다.

## 유지 목록 / 실제 경로

| 연출 | 코드 경로 | 유지한 렌더러 |
|---|---|---|
| 근접 피격 | `game.js` impact(delivery=melee), 공유 slashFx/crescent → `BattleVFX.drawFx` | melee/sword-slash, melee/double-slash, impacts/hit-spark, blunt-hit, crit-hit. 원거리 impact/총구/일반 sparks/debris는 원복 |
| 슈르프 드래곤 브레스 | `schurf.js` dragon / drawBreath → `BattleVFX.breath` | 기존 업그레이드 Codixel Breath 그대로. dragon이 생성한 사각 ember 파티클만 WeakSet으로 숨김; 생성·수명·RNG는 그대로 |
| 샌즈 가스터 블래스터 | `sans.js` drawOver 블래스터 분기 → `BattleVFX.gasterBeam` | 기존 Codixel 밴드 빔, 동일 끝점/폭/시간. 해골·뼈·경고선은 원래 그림 |
| 육군보병 슈류탄 폭발 | `army.js` explodeGren → `BattleVFX.blast` | explosions/small-explosion, 실제 폭발점만. 던지는 수류탄은 원본; 라이브러리 투척 동작 없음 |
| 브로리 슈퍼사이어인 오라 | `broly.js` BROLY.drawUnder → `BattleVFX.ssjAura` | 기존 연두/금색 Codixel Flame. 기탄·바위·포즈·하트는 원복 |
| 유희 오시리스의 천공룡 (Y14) | `cards.js` effect → `duel.js` makeCtx.thunderForce / keepOsiris | 그 스킬의 낙뢰만 PixelFX lightning/zap-hit + 기존 Codixel 경로; 실제 적중도 명시적 scope로 유지. drawSpirit / osiris 스프라이트는 이전에도 교체되지 않았으므로 그대로 |
| 카이바 트와이라이트존 드래곤 (K31) | `kaiba.js` K31.effect / keepTwilight / kfan(vfxTwilight) | 순간이동 Codixel Smoke, 3갈래 PixelFX double-slash 돌풍, 해당 적중. twilight 스프라이트/캐릭터 잔상 그대로. 다른 kfan 장식은 originalFan으로 명시적 원복 |

공유 slashFx/crescent는 근접 스윙/피격 호출에 같이 쓰이므로 그 공유 경로는 유지합니다.
일반 무기 스윙 자체(drawWeaponSwing), bladeRibbon, thrust trail은 원본입니다.
오시리스는 skills2.js가 아니라 duel.js의 thunderForce이며, 트와이라이트존은 백룡 광선이 아니라 K31의 순간이동/부채꼴 돌풍입니다.

## 원복 목록

- heal/기도/blessing/shield, stun/confusion/sleep/slow/charm, 독·빙결·불·분노·BBQ 상태 오라
- ripple/splash, 일반 bolt/zap, meteor/pillar, 일반 explosion/충격파/ring/glow/particles/debris/wallDust
- Mystic/일반 마법/성스러운 구체, Galford 오브/전기 장식, army/Michuhen 탄환 궤적
- KO/텔레포트 poof (K31의 자체 순간이동 연기만 예외), wire/garrote/crack/hexagram
- Genji 방어/용 장식, Okuyasu 충전, Lamia 빔, Rudelian 불/눈빔, Berzebut vortex, stages8 숯불
- 카이바의 charge/백룡 epic beam/plasma 끝점 폭발/일반 빔/XYZ/포탄과 다른 카드·몬스터 연출
- 기타 캐릭터의 고유 props/sprites 및 afterimages는 원래 모습 유지

위 캐릭터 전용 원복 파일들은 `7bcf3a0`의 drawing 코드로 복구했습니다.
`game.js`는 공용 drawFx 진입, 허용된 extra 폭발/연기, 숨겨야 할 파티클 검사와 기존 delivery 시각 메타데이터만 남겼습니다.
전역 glow/status/projectile/weapon 후킹 및 광범위한 spawn helper 교체는 제거했습니다.

## Runtime / 안전성

`index.html`의 classic IIFE vendor bundle → 기존 게임 스크립트 → vfx.js → main.js 순서 유지.
ES modules/fetch/CDN/외부 폰트를 추가하지 않습니다. 일반 `file://`로 실행 가능합니다.
Node/no ImageData에서는 원래 drawing fallback, `BattleVFX.enabled=false`로 비교 가능합니다.

`BattleVFX.drawFx`는 shared melee 또는 명시적으로 keep-tag된 Osiris/Twilight FX만 허용합니다.
`keep(b, fn)`은 기존 콜백을 그대로 실행하고 그 콜백이 만든 시각 객체만 WeakSet에 표시합니다.
지연 콜백은 실제 생성 시점에서 각각 scope를 엽니다. 객체/스킬/투사체에 별도 게임 상태를 넣지 않습니다.
원래 helper와 모든 rand/Math.random 호출은 실행되며, VFX 자체는 좌표 해시/분리된 RNG만 사용합니다.
슈르프 사각형 파티클도 삭제하거나 RNG 호출을 건너뛰지 않고 렌더링만 숨깁니다.
시뮬레이션 숫자는 변경하지 않습니다. PixelFX createAct/가짜 캐릭터/타깃은 사용하지 않습니다.

기존 유지 효과의 scale/팔레트/타이밍/geometry는 그대로입니다. 라이브러리 렌더러는 30fps 절대시간,
32-draw soft budget, 최대 48 supplemental 항목과 재사용 offscreen buffers를 유지합니다.
미사용 vendor 모듈은 안전하게 디스크에 남겼습니다. Patch Pixel font 및 cinematic moves/*는 없습니다.

## Sources / licenses

- [PixelFX](https://github.com/patch-gg/pixelfx), commit
  `a84159688af3ca37a4be05a0d422b94451b2e24e`: `js/vendor/pixelfx/` contains `src/core`,
  the **25 referenced effects** below and their private helpers. Original `LICENSE` and `NOTICE.md` are included.
  Copyright 2026 Patch; Hugo Duprez / Sprite Fusion MIT adaptations are credited in `core/sim.js`
  and affected effect headers. Hollow Crown / rehan-remade MIT adaptations are credited in `core/act.js`
  and NOTICE. We never call `createAct`, render a stock character/target, or use cinematic `moves/*`.
  `gallery/fonts` / the non-MIT **Patch Pixel font are NOT included**. The existing game fonts are unchanged.
- [Codixel](https://github.com/mankidev/codixel), commit
  `604a9dcbcc4e386bc48188b5f7f49099f5d04db7`: `js/vendor/codixel/pixel.js` is a runtime-only subset
  of `core/pixel.js` (Buf, RNG/noise, Flame/Smoke/Breath, hue ramps, band/dither, pixelPerfect, blit).
  Node filesystem/PNG/demo helpers are omitted. Copyright 2026 mankidev; MIT LICENSE included.
  Its quality guide informs limited, hue-shifted palettes, nearest-neighbor blits, and thin dither only
  where color bands meet. No character sprites were redrawn.

## 검증 / 재실행

```sh
node tools/vfx_check.js /path/to/7bcf3a0-baseline
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_BIN=/path/to/chrome node tools/vfx_browser_replay.cjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_BIN=/path/to/chrome node tools/vfx_visual_check.cjs /tmp/vfx-shots
npm test
```

- 고정 seed `0x4bca71`, Genji vs army A/B: 원본 대비 winner/HP/위치/시간/stats/RNG 완전 일치. A 7727, B 6458 호출.
- browser 실제 drawing FX off/on: 동일 combat/RNG 및 VFX errors 없음. 일반 file://, 별도 file-access flag 없음.
- visual_check: 실제 일곱 유지 연출은 off/on PNG가 다름; 열 가지 원복 연출은 off/on PNG 해시 일치.
  모든 fixture의 RNG/HP/위치/stats/파티클 수는 off/on 동일. 스크린샷 360×640.
- 동일 Chrome에서 pre-upgrade baseline과도 A/B 완전 일치. browser A RNG 7727, browser B 9181 (Node B 6458과 구분).
- PC 서버 suite: **63/63 PASS**. PC headless deterministic A/B도 7727/6458, fallback OK.
- 밸런스 sweep 및 실물폰 benchmark는 하지 않습니다. 클라이언트 그림 변경이므로 Render 재배포 불필요.
