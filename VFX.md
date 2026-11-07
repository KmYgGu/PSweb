# 전투 VFX — PixelFX + Codixel

Visual-only integration, based on PC commit `7bcf3a0`. No sprite assets, combat stats, damage,
collisions, knockback, bounce rules, targeting rules or skill delays were edited. A/B rules remain separate.

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

## Runtime

`index.html` loads `pixelfx.bundle.js` as a **classic IIFE**, before game.js; `vfx.js` loads after all
character/stage extensions and before main.js. No runtime dependencies, modules, fetch, external fonts
or CDN requests are added. `file://` works, including without Chrome's allow-file-access flag.

PixelFX has separate color/light buffers. The adapter composites transparent ImageData into reused
small offscreen canvases; smoothing is disabled on blit. The normal back/front layers are retained;
water's two halves are deliberately drawn together on the ground **after water terrain**, before units.
Most effects use 0.35–0.55 scale, not catalog-size screen-filling art. Light is conservative.

Live state, muted old primitives and supplementary burst lifetimes are held in WeakMaps/WeakSets,
never attached to serialized units/projectiles. Hash seeds use type and coordinates, independent of
battle `rand()` / `Math.random()`. Original spawn helpers still run, including **every existing RNG draw**,
then only their rendering is replaced. The grenade-specific blast hook likewise keeps its original
shock, damage and RNG calls; it adds no second grenade or damage event. Impact `delivery` is visual metadata.

Effect clocks are quantized to 30 fps, seek safely from absolute time and reset on rewind. No timers
or asynchronous callbacks mutate battle state. A 32-draw soft budget drops low-priority decoration;
important impacts/status cues have priority. Supplemental lists are capped at 48. The selected bundle
is 167,783 bytes (about 66.5 KiB gzip). Node/no ImageData disables the bridge and retains original drawing.
`BattleVFX.enabled = false` can also be used for comparison. A library draw failure disables the bridge
and restores original shared effects (`BattleVFX.errors` records the error).

## Mapping / inventory

Colors below mean the game's existing supplied color, converted into a limited dark-to-bright hue ramp,
unless a particular palette is listed. `p` is normalized original visual life; original skill timings stay intact.

| Game FX / context | PixelFX id or Codixel replacement | Palette / scale / clock / transform |
|---|---|---|
| `slashFx` (`slash`) | `melee/sword-slash` | passed color; .25–.65 (normally .45); catalog 0–.48s over original .18s; `dir` mirrors |
| `crescent`, including delayed casts | `melee/double-slash` | passed color; r/75 clamped .3–.7; 0–.65s; same angle; actual local center (34,-23) corrected |
| normal `impact`, slash element | `melee/sword-slash` | .42; same impact angle; .48s compressed into original life |
| normal generic `impact` | `impacts/hit-spark` | .42; same angle; early bright frames preserved, then fast tail |
| normal blunt `impact` | `impacts/blunt-hit` | .42; same angle; height offset corrected |
| ranged blunt/bullet `impact` | `impacts/bullet-impact` | .42; same angle; actual blast/hit point, not muzzle |
| crit, tier 1/2, finisher tier 3 | `impacts/crit-hit` | original gold/element ramp; .48 (.7 finisher); fast tail; actual hit angle |
| `sparks` batches / muzzle flashes | `impacts/hit-spark` | passed color; .16–.4; original particles are muted, not removed from sim |
| single `spark`, `embers`, `burst`, `puff`, `dust` particles | Codixel shaded pixels / pixel-perfect streaks | original positions/velocities/life; 3–4 shade chips; no added RNG |
| `shock`, `ring` | Codixel banded+dithered expanding elliptical waves | original r0/r1/easing and color; visual radius capped 125; split behind/in front |
| `streak`, thrust weapon trail | Codixel pixel beam | original endpoints/width/life; no new flight or hitboxes |
| `bolt` / `zap`, elec/lightning impact | `lightning/zap-hit` + Codixel lightning path | .42; original already-generated bolt points; catalog endpoint flash only; angle PI/2 for bolt |
| `pillar` | `fire/flame-pillar` | .5; start at .55s eruption, then 4.4s catalog time over original 1s; no new warning |
| `meteor` | `fire/meteor`, **inbound portion only** | .52; horizontal flip; catalog 0–.615s over original life; never detonates early |
| `explosion`, Kaiba cannon shell detonation | `explosions/small-explosion` | orange; radius/90 clamped .32–.65; .72s tail, fast cooling; actual detonation position |
| army grenade detonation | `explosions/small-explosion` | .4–.7; only at `explodeGren`; original shock/smoke primitives hidden; no library grenade throw |
| Kaiba epic beam terminal impact | `explosions/plasma-explosion` | beam's original color; width/90, max .6; catalog 0–1.65s over .6s |
| `debris`, `wallDust`, wall destruction | `impacts/heavy-landing` | stone/dust ramp; .4/.45; fast dust tail; existing map rubble remains |
| `debrisIce` / small debris particles | Codixel shaded crystal chips | original physics/path/life; pale/cyan highlights; no snowstorm |
| `ripple` | `water/ripples` | blue #66bde9; .5; catalog 0–1.6s over original life; ground-only |
| big ripple / water splash tile | `water/splash` | blue; .55; fast 2.45s catalog over original life; ground-only |
| `smoke` | Codixel Smoke | existing smoke color; short .65s clusters; original particles muted |
| ordinary `glow` and shared `glowAt` | Codixel banded light + sparse colored motes | original color/radius/life; no unrelated holy prop/cinematic |
| healing | `holy/heal` | green #80e88a; .7; .55s; empty actor mask so no stock-body recolor |
| blessing / prayer | `holy/blessing` | original gold; .75; loop while praying; existing identifying halo retained |
| shield buff | `holy/divine-shield` | ice-blue; .85, alpha .6; attached while buff exists; replaces old flat ellipse |
| stun, flinch, army halt | `status/stunned` | status color; .72; attached to unit; old 3-square stun orbit hidden |
| confusion | `status/confused` | status color; .72; attached for status duration |
| sleep / fatigue | `status/sleep` | status color; .72; attached while asleep |
| slow / stopped | `status/slowed` | status color; .72; attached while active |
| charm / Broly hearts' closing beat | `status/charmed` | pink; .65 closing beat, .72 attached status; preserves original converging hearts beforehand |
| burning / BBQ heat / rage | Codixel Flame | orange/red; short 10–38px flames; BBQ above heat 35; discreet foot highlights in front |
| frozen / petrified statuses | Codixel edge crystals / stone shards | existing status color; 5 small crystals; existing tint/pose untouched; no stock `status/frozen` body |
| poison / bleed / KR / weakness / curse-like debuffs | Codixel Smoke + small shaded orbit | existing status color; attached, low opacity; no stock-body repaint |
| paralysis / mcShock | `lightning/zap-hit` | status color; .3; short repeated electric flickers |
| remaining active lock/bind/seal/control/mark debuffs | Codixel small orbit | existing color; attached; distinctive lock/string/mark shapes retained |
| KO / death | `spawn/poof` | pale lilac; .52, alpha .6; .45s; existing 1.2s death pose remains readable |
| `tpIn` / `tpOut` | `spawn/poof` | violet; .4; fits original .45/.5s teleport visual life |
| Mystic Ball, generic magic/holy projectile, skills2 orbs | `arcane/arcane-orb` | original purple/gold; .25–.5; true local center -52 corrected; original travel/collisions untouched; glow/trail presentation replaced |
| Galford electric projectile | `arcane/arcane-orb` + `lightning/zap-hit` | original blue; .26 orb/.27 electric flash; original trajectory |
| army/Michuhen bullets | `projectiles/bullet-tracer` | pale gold; .35, length52 (18px displayed); follows current velocity angle, including reflection |
| weapon swing generic arc | `melee/sword-slash` | weapon's original trail; reach-scaled .35–1.05; same facing/angle; weapon sprite retained |
| blade ribbons / hammer trail | Codixel sampled shaded pixel path | exact original radius/start/sweep; existing hammer/weapon silhouette retained |
| `wire`, wire projectile, `garrote`, `crack`, `chargeCue` | Codixel sampled pixel paths | original attachment/geometry/lifetimes; original line colors and bright rim |
| hex-curse sigil | Codixel sampled triangles + ring | same rotating six-point star; red shade bands, thin highlight |
| `after` | intentionally unchanged character sprite ghosts | original sprites/alpha/positions; not a library dummy |

### Distinctive character / stage renderers

The shared replacements also apply to unedited callers: skills.js, status.js, all stage hooks, cards/duel,
Blade, Kidomusha, Duck and other character bursts. Their combat implementations are unchanged.

- Genji: deflect arcs use Codixel paths; dragon ribbon uses a green hue ramp; sword/dash hits use shared PixelFX.
  Shuriken, sword silhouette, dragon trail layout and sprite afterimages stay recognizable.
- Sans: Codixel banded beam replaces the flat blaster line. Blaster skull and bones, exact warning and beam geometry remain.
- Army: tracer/muzzle/impact upgraded; grenade detonation explicitly replaced. The thrown grenade and gear silhouettes remain.
- Kaiba: charge orb, pixel beams and plasma terminal blast upgraded. Cards, monsters, cannon shell, XYZ/YZ/bat sprites remain.
- Broly: Codixel lime/gold transformation flames and PixelFX hearts' closing beat. Ki-ball/rock silhouettes and character poses remain.
- Mystic: PixelFX orb at its original coordinates; ball gameplay is untouched. Lock silhouette and controlling strings remain.
- Okuyasu: PixelFX charge orb accompanies The Hand. Hand silhouette, void tiles, erase marks and warning rectangle remain.
- Lamia: Codixel exact-endpoint laser beams; arms/Stand, circling setup and warning geometry remain.
- Schurf: Codixel Breath replaces gradient fire cone, retaining original cone angle and endpoint. Animal/dragon forms remain.
- Rudelian: Codixel flame patches/aura and twin eye beams; unique fireball shape remains, with upgraded shared glow/particles.
- Galford: PixelFX electric orb; Codixel electric dog overlay; Poppy/clone sprites remain untouched.
- Berzebut: Codixel banded dark vortex/swirl. Roses, thorns, clone, scythe and thrown object silhouettes remain.
- BBQ: Codixel banded coal glow + attached heat flames. Meat, giant hand and heat gauge remain.
- Other stage props (train, audience, sky/terrain, crane/dolls, basketball, food/orders, escape map), UI/damage text,
  exact targeting telegraphs, dialogue, card/monster/summon sprites, frozen tint and death poses are intentionally preserved,
  not replaced by generic VFX. This is an FX upgrade, not a sprite/environment/UI redraw.

## Rebuild / checks

The checked-in bundle is sufficient for browser/PC play. Rebuild only when editing vendored source:

```sh
bash tools/build-vfx.sh  # esbuild@0.25.12, pinned; no runtime dependency
node tools/vfx_check.js # one fixed Genji/army seed in A and B, no sweep
# Optional: compare an old checkout containing index.html + js/
node tools/vfx_check.js /path/to/baseline
npm test               # server escape verification
```

Optional developer screenshot/browser checks use Playwright installed **outside the game**:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_BIN=/path/to/chrome \
  node tools/vfx_visual_check.cjs /tmp/vfx-shots
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_BIN=/path/to/chrome \
  node tools/vfx_browser_replay.cjs
```

Verified in headless Chrome through ordinary `file://` at 360x640: melee slash, crit, explosion + smoke tail,
bolt, frozen + burning/heat, ripple/splash, pillar, inbound meteor, stun/poison, KO, Mystic orb, Broly aura,
Sans/Kaiba beams, Codixel breath, vortex, fire patch and hearts; PNGs/contact sheet were opened and reviewed.
All 25 selected modules also passed a back/front, multi-time draw smoke test. A live 360x640 match screenshot
was reviewed with HUD visible; effects stay inside the fight area rather than covering the HUD.

Replay sanity against baseline 7bcf3a0: seed `0x4bca71`, Genji vs army. A and B each matched winner,
HP, positions, simulation time, stats and exact RNG call count (A 7727, B 6458). Browser rendering enabled
versus disabled also matched all of those fields (A); no PixelFX errors. Server tests: **63/63 PASS**.
Typical desktop Chrome render cost in this short check was about 4.3–4.6ms/frame (not a phone benchmark).
No balance sweeps were performed. These are client-only effects: no Render server redeploy is required.
