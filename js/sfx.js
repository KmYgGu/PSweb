/* 공통 전투 효과음 — 스매시 스타일.
   1) assets/sfx/*.ogg (Kenney CC0) 샘플을 decodeAudioData로 미리 캐시
   2) WebAudio 바디 레이어(서브 쿵 + 노이즈만, 비프/톤 없음) — 샘플이 없거나 실패하면 단독 폴백
   마스터: 컴프레서 + 가벼운 컨볼버 리버브. API: Sfx.play(name, opts?), Sfx.toggle(v), Sfx.enabled, Sfx.volume(v) */
const Sfx = (() => {
  let ctx = null, master = null, comp = null, dry = null, verb = null, noiseBuf = null, on = true, voices = 0, vol = 0.5;
  const last = new Map();
  const GAP = { bump: 90, bumpHard: 120, wall: 70, melee: 45, shot: 60, projHit: 45, big: 90, whiff: 90, crit: 70, status: 140, stun: 200, buff: 200,
    ko: 500, ui: 35, start: 400, dash: 120, jump: 150, land: 150, splash: 200, boom: 120 };
  const MAX = 8;
  const BASE = 'assets/sfx/';
  // 이벤트 → 샘플 후보 (랜덤 선택), 게인
  // 이벤트 → 샘플 후보 [이름들, 게인, 재생속도]. 전부 실제 녹음(어쿠스틱) 소스.
  const SAMPLES = {
    melee: [['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_medium_002'], 0.9],
    big: [['impactPunch_heavy_000', 'impactPunch_heavy_001', 'impactPunch_heavy_002'], 1.0, 0.85],
    crit: [['impactPunch_heavy_001', 'impactPunch_heavy_002'], 0.9],
    projHit: [['impactSoft_medium_000', 'impactPlate_light_000'], 0.8],
    bump: [['wall_user'], 0.8],
    bumpHard: [['wall_user'], 1.0],
    wall: [['wall_user'], 1.0],
    shot: [['knifeSlice2'], 0.6],
    whiff: [['knifeSlice'], 0.6],
    status: [['impactWood_light_000'], 0.6],
    stun: [['impactBell_heavy_000'], 0.4],
    buff: [['handleCoins'], 0.6],
    ui: [['metalClick'], 0.6],
    start: [['metalPot1'], 0.7],
    ko: [['impactPunch_heavy_000'], 1.0, 0.75],
    dash: [['cloth1'], 0.8],
    jump: [['cloth2'], 0.7],
    land: [['footstep_concrete_000', 'impactSoft_heavy_000'], 0.8],
    splash: [['footstep_snow_000'], 0.9, 0.8],
    boom: [['impactMining_000'], 1.0, 0.6],
  };
  // 활성 이벤트 화이트리스트: 나머지는 무음(no-op). 다시 켜려면 여기에 추가.
  const ENABLED = new Set(['wall', 'bump', 'bumpHard']);
  const RAW = new Set(['wall', 'bump', 'bumpHard']); // 사용자 음원 그대로, 레이어/리버브 없음
  // 이 이벤트들은 샘플만 (합성 레이어 없음)
  const PURE = new Set(['wall', 'ui', 'buff', 'status', 'stun', 'start', 'shot', 'whiff', 'jump', 'dash']);
  // 속성 플레이버 (실제 녹음 레이어)
  const ELEM = { fire: ['cloth4', 0.5], ice: ['impactGlass_light_000', 0.5], dark: ['impactMetal_heavy_000', 0.35, 0.7],
    elec: ['metalLatch', 0.5], light: ['impactGlass_medium_000', 0.35, 1.2], slash: ['drawKnife1', 0.4], blunt: ['impactPlate_light_000', 0.3] };
  const KO_STING = [['impactBell_heavy_002', 0.5, 0.25], ['metalPot2', 0.5, 0.35]];
  const crit_RING = ['impactMetal_light_000', 0.45];
  // ---- 캐릭터 효과음 (js/sfxchar.js 내장 mp3) ----
  // CHAR[캐릭터 id][이벤트] = 샘플 이름들 (여럿이면 차례로 번갈아 재생 — 난수 미사용). 이벤트: basic(기본 공격), 스킬 id(시전 순간), 그 밖은 코드의 charSfx 호출 지점
  const CHAR = {
    swordsman: { basic: ['c_sw_slash'], dashSlash: ['c_sw_dash'], dashSlashHit: ['c_sw_slash'] },
    archer: { basic: ['c_ar_shoot'], volley: ['c_ar_shoot'], volleyFly: ['c_ar_fly'], backStep: ['c_ar_sand'] },
    mage: { teleport: ['c_mg_tele'], meteor: ['c_mg_meteor'] },
    tank: { basic: ['c_tk_swing'], ironWall: ['c_tk_shield'] },
    assassin: { basic: ['c_as_dagger'], shadowStrike: ['c_as_shadow1', 'c_as_shadow2'] },
    lancer: { basic: ['c_ln_thrust'], lanceCharge: ['c_ln_dash'], lanceHit: ['c_ln_thrust'] },
    priest: { holyLight: ['c_pr_holy'] },
    berserker: { basic: ['c_bs_swing'], rage: ['c_bs_rage'] },
    reinhardt: { basic: ['c_rh_hammer'], rCharge: ['c_rh_cstart'], charging: ['c_rh_cloop'], chargeImpact: ['c_rh_cbang'], fireStrike: ['c_rh_fire'] },
    evelyn: { basic: ['c_ev_kick'], garrote: ['c_ev_garrote'], wireSnatch: ['c_ev_wire'], burst: ['c_ev_boom'] },
    kidomusha: { basic: ['c_kd_blade'], ghostHit: ['c_kd_ghost1', 'c_kd_ghost2', 'c_kd_ghost3', 'c_kd_ghost4'], oni: ['c_kd_oni'], spirit: ['c_kd_spirit'] },
    mystic: { mysticBall: ['c_my_ball'], controlWall: ['c_my_ctlwall'], positioning: ['c_my_posset'], posReturn: ['c_my_posret'], accelerate: ['c_my_accel'], replace: ['c_my_replace'], seal: ['c_my_seal'] },
  };
  const CSTAT = { poison: ['c_st_poison1', 'c_st_poison2'], paralysis: ['c_st_para'], petrify: ['c_st_petri1', 'c_st_petri2'], heal: ['c_st_heal'] }; // 상태이상 (캐릭터 공통)
  const C_VOL = 0.8, C_GAP = 90, C_MAX = 6; // 캐릭터 소리 전체 음량, 같은 소리 최소 간격(ms), 동시 재생 상한
  const cTurn = new Map(); let cVoices = 0;
  function playChar(list, key) {
    if (hold || !(on || rec) || !list || !list.length) return;
    const c = ac(); if (!c) return;
    const now = performance.now(); if (now - (last.get(key) || 0) < C_GAP || cVoices >= C_MAX) return;
    const i = cTurn.get(key) || 0, n = list[i % list.length], b = bufs.get(n); if (!b) return;
    last.set(key, now); cTurn.set(key, i + 1);
    try { const G = window.SFX_CHAR_GAIN || {}; if (sample(n, C_VOL * (G[n] || 1), 1, 0, 0)) { cVoices++; setTimeout(() => { cVoices = Math.max(0, cVoices - 1); }, Math.min(1200, b.duration * 1000)); } } catch (e) { /* 소리 실패 무시 */ }
  }
  const bufs = new Map();
  let loading = false;

  function ac() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.16;
      comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = vol; master.connect(comp);
      dry = ctx.createGain(); dry.connect(master);
      verb = ctx.createConvolver(); verb.buffer = impulse(0.9, 3.2);
      const wet = ctx.createGain(); wet.gain.value = 0.18; verb.connect(wet); wet.connect(master);
      preload();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function preload() {
    if (loading) return; loading = true;
    const names = new Set();
    for (const k of ENABLED) if (SAMPLES[k]) SAMPLES[k][0].forEach(n => names.add(n));
    for (const T of [...Object.values(CHAR), CSTAT]) for (const k in T) T[k].forEach(n => { if (window.SFX_DATA && window.SFX_DATA[n]) names.add(n); }); // 캐릭터 소리는 내장본만
    names.forEach(n => {
      const emb = window.SFX_DATA && window.SFX_DATA[n];
      if (emb) { const bin = atob(emb), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        ctx.decodeAudioData(a.buffer, b => bufs.set(n, b), () => {}); return; }
      fetch(BASE + n + '.ogg').then(r => r.ok ? r : fetch(BASE + n + '.wav')).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(a => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no))).then(b => bufs.set(n, b)).catch(() => {}); });
  }
  // 출력 버스: 드라이 + 리버브 센드
  function out(send) { const g = ctx.createGain(); g.connect(dry); if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(verb); } return g; }
  function sample(n, gain, rate, delay, send) {
    const b = bufs.get(n); if (!b) return false;
    const t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), g = out(send == null ? 0.5 : send);
    s.buffer = b; s.playbackRate.value = rate || 1; g.gain.value = gain; s.connect(g); s.start(t);
    return true;
  }
  function env(t, dur, peak, send) {
    const g = ctx.createGain(); g.connect(out(send == null ? 0.4 : send));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(0.006, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  function tone(freq, dur, type, peak, slide, delay, send) {
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq * P, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide * P), t + dur * 0.8);
    o.connect(env(t, dur, peak * V, send)); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, peak, freq, type, delay, send, sweepTo) {
    const t = ctx.currentTime + (delay || 0);
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq * P, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    src.connect(f); f.connect(env(t, dur, peak * V, send)); src.start(t); src.stop(t + dur + 0.02);
  }
  // 합성 바디 레이어: 서브 쿵(저역 사인) + 필터 노이즈만. 톤/비프/징글 없음.
  function body(k, heavy) {
    tone(140 * k, 0.2 * k, 'sine', 0.8, 40, 0, 0.1);
    noise(0.08 * k, 0.5, 2800, 'bandpass', 0, 0.5, 800);
    if (heavy) { tone(90, 0.45, 'sine', 0.8, 32, 0.04, 0.2); noise(0.35, 0.4, 1500, 'lowpass', 0.03, 0.8, 120); }
  }
  let P = 1, V = 1;
  const SYN = {
    bump() { tone(110, 0.16, 'sine', 0.6, 45); noise(0.07, 0.4, 600, 'lowpass'); },
    bumpHard() { body(1.1); },
    wall() {}, ui() {}, buff() {}, status() {}, stun() {}, start() {}, shot() {}, jump() {},
    melee() { body(1); },
    projHit() { noise(0.07, 0.45, 2400, 'bandpass', 0, 0.5, 800); tone(120, 0.14, 'sine', 0.45, 45); },
    big() { body(1.3, true); },
    crit() { body(1.15); },
    ko() { body(1.5, true); },
    whiff() { noise(0.16, 0.35, 900, 'bandpass', 0, 0.2, 4000); },
    dash() { noise(0.2, 0.35, 500, 'bandpass', 0, 0.3, 3500); },
    land() { tone(100, 0.2, 'sine', 0.6, 38); noise(0.1, 0.4, 500, 'lowpass'); },
    splash() { noise(0.4, 0.5, 1800, 'bandpass', 0, 0.6, 350); },
    boom() { tone(75, 0.6, 'sine', 0.8, 30, 0, 0.3); noise(0.6, 0.7, 2500, 'lowpass', 0, 0.8, 100); },
  };
  const SYN_LAYER = 0.55; // 샘플이 있을 때 합성 레이어 비율

  // 동영상 녹화: 압축기 출력을 MediaStreamAudioDestination 으로도 보냄 (스피커 음소거 상태여도 파일에는 들어감)
  let rec = null, hold = false;
  function recStart() {
    const c = ac(); if (!c || !c.createMediaStreamDestination) return null;
    if (!rec) { rec = c.createMediaStreamDestination(); comp.connect(rec); }
    if (!on) { try { comp.disconnect(c.destination); } catch (e) { /* 이미 끊김 */ } }
    return rec.stream;
  }
  function recStop() {
    if (!rec) return; try { comp.disconnect(rec); } catch (e) { /* 무시 */ }
    try { comp.disconnect(ctx.destination); } catch (e) { /* 무시 */ } comp.connect(ctx.destination); rec = null;
  }
  function play(name, o) {
    if (name === 'char') return o && CHAR[o.id] ? playChar(CHAR[o.id][o.ev], o.id + ':' + o.ev) : undefined;
    if (name === 'cstat') return o ? playChar(CSTAT[o.id], 'st:' + o.id) : undefined;
    if (hold || !(on || rec) || !SYN[name] || !ENABLED.has(name)) return;
    const c = ac(); if (!c) return;
    const now = performance.now();
    if (now - (last.get(name) || 0) < (GAP[name] || 50)) return;
    if (voices >= MAX && name !== 'ko' && name !== 'start') return;
    last.set(name, now);
    voices++; setTimeout(() => { voices = Math.max(0, voices - 1); }, 220);
    try {
      const r = 1 + (Math.random() * 2 - 1) * 0.07, gv = 1 + (Math.random() * 2 - 1) * 0.15;
      const S = SAMPLES[name];
      const had = S && sample(S[0][Math.floor(Math.random() * S[0].length)], S[1] * (RAW.has(name) ? 1 : gv), RAW.has(name) ? 1 : r * (S[2] || 1), 0, RAW.has(name) ? 0 : 0.5);
      if (RAW.has(name)) return;                     // 사용자 제공 음원 그대로
      P = r; V = gv * (had ? SYN_LAYER : 1);
      if (!PURE.has(name) || !had) SYN[name]();
      const el = o && o.element;
      if (el && ELEM[el] && (name === 'melee' || name === 'big' || name === 'crit' || name === 'projHit' || name === 'status')) sample(ELEM[el][0], ELEM[el][1] * gv, r * (ELEM[el][2] || 1), 0.01, 0.7);
      if (name === 'crit') sample(crit_RING[0], crit_RING[1] * gv, r, 0.02, 0.8);
      if (name === 'ko') KO_STING.forEach(k => sample(k[0], k[1], 1, k[2], 0.9));
    } catch (e) { /* 소리 실패가 전투를 멈추면 안 됨 */ }
    P = 1; V = 1;
  }

  const unlock = () => { if (on) ac(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlock, { passive: true }));

  return {
    play,
    toggle(v) { on = typeof v === 'boolean' ? v : !on; return on; },
    get enabled() { return on; },
    volume(v) { if (typeof v === 'number') { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = vol; } return vol; },
    get loaded() { return bufs.size; },
    recStart, recStop, hold(v) { hold = !!v; }, // 녹화용 오디오 스트림 / 빨리감기 중 소리 막기
  };
})();
window.Sfx = Sfx;
