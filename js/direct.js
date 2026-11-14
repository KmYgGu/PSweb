/* 직접 플레이 모드 (스테이지 선택 화면 토글, main.js 가 켬)
 * - 시점: 내 캐릭터(P1 · 블루 팀) 뒤통수를 따라가는 3인칭 3D. three.js 없이 캔버스 2D 에 원근을 직접 계산
 *     바닥 = 지금의 2D 전장 그림(Render.draw 의 v3d 모드: 스테이지·기믹·이펙트·투사체·입자)을 원근으로 눕혀 가로 띠 단위로 그림
 *     캐릭터·소환수 = 기존 그리기(Render.drawUnit)를 작은 캔버스에 그려 카메라를 향해 세움 (내 캐릭터는 뒷모습)
 *     기본 건물 = 3D 상자, 경기장 테두리 = 벽, 원형 경기장 = 반투명 원형 벽, 투사체 = 바닥 그림 + 공중 빛 구슬, 글자 = 세워서
 * - 조작: 화면 누르기(로그·버튼 제외) = 진행 방향 반전 (쿨타임 FLIP_CD, 반전 뒤 잠깐 AI 가 되돌리지 못함 = game.js holdFlip). 스킬은 자동
 *     PC: 마우스 잠금(Pointer Lock) + 마우스 이동 = 시점 회전. 스페이스를 누르는 동안 잠금 해제(배속 버튼 등 누르기), 떼면/다음 클릭에 다시 잠금
 *     모바일: 자이로(설정에서 켜기, 처음 직접 플레이 때 한 번 물어봄). 회전 입력이 없으면 시점이 천천히 상대 쪽으로 돌아감
 * - 농구장·야구장·탈출맵은 일반 시점 (EXCLUDE · supported)
 * 그리기·카메라는 전투 상태를 바꾸지 않고 Math.random 도 부르지 않음 (그리는 동안 잠깐 바꾸는 u.lookUp·u.facing 은 바로 되돌림) */
const DirectPlay = (() => {
  const EXCLUDE = new Set(['basket']); // 특수 규칙 스테이지 → 일반 시점 (야구장은 t254u 부터 직접 플레이)
  const CAM = { dist: 100, h: 80, side: 22, pitch: 0.60, f: 300, near: 6, wallH: 50, bldH: 34 };
  const LONG_T = 0.45; // 모바일 길게 누르기 (상대 추적) 기준 초
  const PITCH_UP = -0.53; // 올려다보기 한계 (기본 0.60 → 0.07rad ≈ 4° 아래: 내 캐릭터 상반신이 화면 아래쪽에 남음)
  const FLIP_CD = 0.45; // 반전 쿨타임 (전투 시간 초)
  const RES = 2, TR = 2; // 화면 내부 배율 (main.js RES) · 바닥 그림 배율
  const TX0 = { x: AR.x - 30, y: AR.y - 30, w: AR.w + 60, h: AR.h + 60 }, TX = { ...TX0 }; let FR = TR; // 바닥 그림 영역 (경기장 + 바깥 테두리) · 바닥 그림 배율. 야구장: 구장 전체(880x1040)를 배율 1로
  const BB = { w: 240, h: 300, fx: 120, fy: 260 }; // 세운 그림 캔버스 (논리 px) · 발 위치
  const TAU = Math.PI * 2, wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now() / 1000;

  // ---------- 설정 ----------
  const hasGyroApi = () => typeof window.DeviceOrientationEvent !== 'undefined' || typeof window.DeviceMotionEvent !== 'undefined';
  const phoneLike = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }; // 주 입력이 손가락인 기기 (PC·노트북 = 아님 → 자이로 무시)
  const touchDevice = () => { try { return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; } catch (e) { return false; } };
  function requestGyro() { // iOS 13+: 누른 순간 안에서 권한 요청. 다른 기기는 바로 허용
    const reqs = [];
    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') reqs.push(DeviceMotionEvent.requestPermission());
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') reqs.push(DeviceOrientationEvent.requestPermission());
    if (!reqs.length) return Promise.resolve(hasGyroApi());
    return Promise.all(reqs.map(p => Promise.resolve(p).catch(() => 'denied'))).then(r => r.every(x => x === 'granted'));
  }
  Settings.define([
    { key: 'gyro', label: '자이로 시점 (모바일 직접 플레이)', type: 'toggle', def: false, request: requestGyro,
      desc: (v, set) => set ? (v ? '휴대폰을 좌우로 돌리면 시점이 돌아가요.' : '시점은 자동으로 상대를 따라가요.') : '아직 고르지 않았어요. 처음 직접 플레이할 때 물어봐요.' },
    { key: 'gyroSens', label: '자이로 감도', type: 'range', def: 1, min: 0.4, max: 2.5, step: 0.1, fmt: v => v.toFixed(1) + '×' },
    { key: 'mouseSens', label: '마우스 감도 (PC 직접 플레이)', type: 'range', def: 1, min: 0.3, max: 3, step: 0.1, fmt: v => v.toFixed(1) + '×' },
  ]);

  // ---------- 상태 ----------
  const S = {
    active: false, battle: null, init: false, px: 0, py: 0, autoYaw: 0, userYaw: 0, userPitch: 0, inYaw: 0, inPitch: 0, lastInp: -9,
    flipReq: false, lastFlipT: -9, flash: 0, locked: false, space: false, mouseUser: false, popup: null, gyroSeen: 0, motionT: 0, ori: null, prevAlpha: null, gyroT0: 0, gcal: { n: 0, y: 0, p: 0 }, lockT: 0,
    looks: new WeakMap(), pf: { back: true, facing: 1 },
  };
  const $ = s => document.querySelector(s);
  const stageEl = () => $('#stage');
  const UI_SEL = '#bottom, button, a, input, label, #result, #fullLog, #settings, .dpPop, #rpCtl, #rpBar, #rpSave, #vidDlg, #vidRec';

  function supported(b) { return !!(b && !b.escape && (!b.cam || b._bsbCam) && !EXCLUDE.has(b.stageId)); } // _bsbCam: 야구장 2D 카메라 (직접 플레이면 main.js 가 끔)
  function player(b) { const m = b.u.filter(u => u.team === 0 && !u.summon); return m.filter(u => !u.dead).pop() || m[m.length - 1] || b.u[0]; }
  function focus(b, P) { // 시점이 향할 상대: 가까운 생존 상대(본체 우선). 전투 상태(u.tgtU 등)는 건드리지 않음
    let best = null, bd = 1e9;
    for (const pass of [0, 1]) {
      for (const o of b.u) { if (o.team === P.team || o.dead || o.hidden || (!pass && o.summon)) continue; const d = Math.hypot(o.x - P.x, o.y - P.y); if (d < bd) { bd = d; best = o; } }
      if (best) return best;
    }
    return b.u.filter(o => o.team !== P.team && !o.summon).pop() || null;
  }

  // ---------- 입력 ----------
  const canLock = () => !!(stageEl() && stageEl().requestPointerLock);
  function lock() {
    const el = stageEl(); if (!el || !canLock() || S.locked || !S.active) return;
    try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => { S.lockFail = true; }); } catch (e) { S.lockFail = true; } // 실패(헤드리스·Esc 직후 등) → 잠금 없이 클릭 = 반전
  }
  function unlock() { if (document.pointerLockElement && document.exitPointerLock) try { document.exitPointerLock(); } catch (e) { /* 무시 */ } }
  document.addEventListener('pointerlockchange', () => { S.locked = !!stageEl() && document.pointerLockElement === stageEl(); if (S.locked) { S.lockFail = false; S.lockT = now(); } });
  document.addEventListener('pointerlockerror', () => { S.lockFail = true; });
  document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') S.mouseUser = true; else if (e.pointerType === 'touch') S.mouseUser = false; }, true);
  function onDown(e) {
    if (!S.active || S.popup) return;
    if (e.pointerType === 'mouse' && e.button === 2) { if (!e.target.closest(UI_SEL)) { S.lockOn = 'mouse'; e.preventDefault(); } return; } // 오른쪽 버튼 누르는 동안 상대 추적
    if (e.pointerType === 'mouse' && e.button === 0 && S.lockOn === 'mouse' && !e.target.closest(UI_SEL)) { S.flipReq = true; S.pressPt = null; S.mDown = true; e.preventDefault(); return; } // 추적 중 왼쪽 클릭 = 반전 (야구: 조준점이 동료면 송구, 잠금 여부와 무관)
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { // 모바일: 짧게 탭 = 반전(손 뗄 때), 길게 누름(0.45초) = 누르는 동안 상대 추적
      if (e.target.closest(UI_SEL)) return;
      if (S.touch && e.pointerId !== S.touch.id) { if (S.lockOn === 'touch') { S.flipReq = true; S.pressPt = toCanvas(e); } return; } // 길게 눌러 추적하는 동안 다른 손가락 탭 = 반전 (그 밖의 두 번째 손가락은 무시)
      S.touch = { id: e.pointerId, t: now(), x: e.clientX, y: e.clientY };
      if (S.battle && timing(S.battle)) { S.touch.used = true; S.flipReq = true; S.pressPt = toCanvas(e); } // 야구 스윙·게이지: 누르는 순간 (손 뗄 때가 아니라)
      return;
    }
    if (e.pointerType === 'mouse' && canLock() && !S.lockFail) {
      if (e.button !== 0) return;
      if (S.locked) { S.flipReq = true; S.mDown = true; e.preventDefault(); return; } // 잠금 중: 커서가 없으므로 어디를 눌러도 반전
      if (S.space || e.target.closest(UI_SEL)) return; // 스페이스로 푼 상태의 UI 클릭: 반전 아님
      lock(); e.preventDefault(); return; // 풀린 상태에서 전장 클릭: 다시 잠그기만 (반전 아님)
    }
    if (e.target.closest(UI_SEL)) return; // 로그·버튼 영역 제외
    S.flipReq = true; S.pressPt = toCanvas(e); if (e.pointerType === 'mouse') S.mDown = true;
    if (e.pointerType === 'mouse' && S.lockFail) { S.lockFail = false; lock(); } // 잠금 다시 시도
  }
  document.addEventListener('pointerdown', onDown);
  function onUp(e) {
    if (e.pointerType === 'mouse' && e.button === 2 && S.lockOn === 'mouse') S.lockOn = null;
    if (e.pointerType === 'mouse' && e.button === 0 && S.mDown) { S.mDown = false; S.relReq = true; } // 왼쪽 버튼 놓음 (야구 투구: 놓으면 던짐)
    if (S.touch && e.pointerId === S.touch.id) { const t0 = S.touch; const long = S.lockOn === 'touch' || now() - S.touch.t >= LONG_T; S.touch = null; if (S.lockOn === 'touch') S.lockOn = null; const used = t0.used; if (used) S.relReq = true; if (!long && !used && e.type === 'pointerup' && S.active && !S.popup) { S.flipReq = true; S.pressPt = toCanvas(e); } }
  }
  function toCanvas(e) { const cv = S.cv; if (!cv || !cv.getBoundingClientRect) return null; const r = cv.getBoundingClientRect(); if (!r.width) return null; return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; } // 화면 점 → 논리 좌표 (송구 대상 고르기)
  document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  document.addEventListener('pointermove', e => { if (S.touch && e.pointerId === S.touch.id && S.lockOn !== 'touch' && Math.hypot(e.clientX - S.touch.x, e.clientY - S.touch.y) > 14) S.touch.moved = true; });
  document.addEventListener('contextmenu', e => { if (S.active && !e.target.closest(UI_SEL)) e.preventDefault(); }); // 오른쪽 버튼·길게 누르기 메뉴 막기 (전장만)
  addEventListener('blur', () => { S.lockOn = null; S.touch = null; });
  document.addEventListener('mousemove', e => {
    if (!S.active || !S.locked) return;
    if (now() - S.lockT < 0.15) return; // 잠금 직후 첫 이동값은 튐 (Chrome)
    const k = Settings.get('mouseSens') || 1, mx = e.movementX || 0, my = e.movementY || 0;
    if (Math.abs(mx) > 160 || Math.abs(my) > 160) return; // 한 번에 크게 튀는 값 무시
    if (Math.abs(mx) + Math.abs(my) < 1) return;
    S.inYaw += mx * 0.0045 * k; S.inPitch += my * 0.0018 * k; // 위아래는 덜 민감하게 (클릭하며 살짝 움직여도 하늘로 튀지 않게)
    S.lastInp = now();
  });
  const isSpace = e => e.code === 'Space' || e.key === ' ';
  addEventListener('keydown', e => {
    if (!S.active || !isSpace(e)) return;
    e.preventDefault(); if (e.repeat) return;
    S.space = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    unlock();
  }, true);
  addEventListener('keyup', e => {
    if (!isSpace(e)) return;
    if (S.space) { S.space = false; if (S.active) { e.preventDefault(); if (S.mouseUser) lock(); } } // keyup 에서는 브라우저가 거부할 수 있음 → 다음 클릭에 잠금
  }, true);
  addEventListener('blur', () => { S.space = false; });
  // 자이로: devicemotion 회전 속도를 지구 위쪽 축으로 투영 = 좌우로 돌린 만큼 (폰을 세우든 눕히든 같게). 회전 속도가 없으면 방위각(alpha) 차이로
  addEventListener('deviceorientation', e => {
    if (e.beta == null) return; S.ori = { b: e.beta, g: e.gamma || 0 }; S.gyroSeen = now();
    if (!gyroOn() || now() - S.motionT < 1 || e.alpha == null || now() - S.gyroT0 < 0.6) { S.prevAlpha = e.alpha; return; }
    if (S.prevAlpha != null) { const d = wrap((e.alpha - S.prevAlpha) * Math.PI / 180); if (Math.abs(d) > 0.002 && Math.abs(d) < 0.6) { S.inYaw -= d * (Settings.get('gyroSens') || 1); if (Math.abs(d) > 0.01) S.lastInp = now(); } }
    S.prevAlpha = e.alpha;
  });
  let motionPrev = 0;
  addEventListener('devicemotion', e => {
    const r = e.rotationRate; if (!r || r.alpha == null) return;
    const t = now(), dt = clamp(t - (motionPrev || t), 0, 0.1); motionPrev = t; S.motionT = t; S.gyroSeen = t;
    if (!gyroOn() || !dt) return;
    const o = S.ori || { b: 90, g: 0 }, b = o.b * Math.PI / 180, g = o.g * Math.PI / 180;
    const up = [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(g) * Math.cos(b)]; // 기기 좌표계의 지구 위쪽
    let rate = (r.beta || 0) * up[0] + (r.gamma || 0) * up[1] + (r.alpha || 0) * up[2]; // 도/초, 위에서 봐서 반시계(왼쪽으로 돎) = +
    let pr = r.beta || 0; // 기기 가로축 회전 = 위아래 (윗변을 뒤로 젖히면 올려다봄)
    const G = S.gcal; // 기준값: 켠 뒤(전투 시작·설정 켜기) 0.6초 동안 가만히 있을 때의 값(센서 치우침)을 모아 빼 줌 → 가만히 든 폰이 저절로 돌지 않게
    if (t - S.gyroT0 < 0.6) { if (Math.abs(rate) < 10 && Math.abs(pr) < 10) { G.n++; G.y += rate; G.p += pr; } return; }
    if (G.n) { rate -= G.y / G.n; pr -= G.p / G.n; }
    if (Math.abs(pr) >= 6) { S.inPitch += pr * Math.PI / 180 * dt * (Settings.get('gyroSens') || 1) * 0.8; if (Math.abs(pr) > 14) S.lastInp = t; }
    if (Math.abs(rate) < 4) return; // 손떨림
    S.inYaw -= rate * Math.PI / 180 * dt * (Settings.get('gyroSens') || 1);
    if (Math.abs(rate) > 12) S.lastInp = t;
  });

  // ---------- 팝업 (자이로 묻기) ----------
  function popup(title, body, yes, no, onYes, onNo) {
    closePopup();
    const d = document.createElement('div'); d.className = 'dpPop';
    d.innerHTML = `<div class="dpbox"><b>${title}</b><p>${body}</p><div class="dprow"><button type="button" class="main dpYes">${yes}</button><button type="button" class="sub dpNo">${no}</button></div></div>`;
    stageEl().appendChild(d); S.popup = d;
    d.querySelector('.dpYes').onclick = () => onYes(); d.querySelector('.dpNo').onclick = () => onNo();
  }
  function closePopup() { if (S.popup) { S.popup.remove(); S.popup = null; } }
  function askGyro() {
    popup('자이로를 켤까요?', '켜면 휴대폰을 좌우로 돌려 시점을 움직일 수 있어요.<br>끄면 시점은 자동으로 상대를 따라가요.<br><small>첫 화면의 ⚙ 설정에서 언제든 바꿀 수 있어요.</small>', '켜기', '끄기',
      () => { requestGyro().then(ok => { Settings.set('gyro', !!ok); closePopup(); if (!ok) toast('자이로 권한이 없어 끌게요'); }, () => { Settings.set('gyro', false); closePopup(); }); },
      () => { Settings.set('gyro', false); closePopup(); });
  }
  function toast(msg) { const el = $('#rpToast'); if (!el) return; el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 1800); }

  // ---------- 전투 시작/상태 ----------
  function gyroOn() { return S.active && Settings.get('gyro') === true && phoneLike(); }
  function gyroReset() { S.gyroT0 = now(); S.gcal = { n: 0, y: 0, p: 0 }; S.prevAlpha = null; }
  Settings.on((k, v) => { if (k === 'gyro' && v) gyroReset(); });
  function begin(b) { // main.js startBattle (실전, 직접 플레이 켜짐, 지원 스테이지)
    gyroReset();
    S.battle = b; S.init = false; S.userYaw = S.userPitch = S.inYaw = S.inPitch = 0; S.lastFlipT = -9; S.flipReq = false; S.flash = 0; S.looks = new WeakMap();
    if (touchDevice() && hasGyroApi() && !Settings.has('gyro')) askGyro();
    else if (Settings.get('gyro') === true && typeof window.DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' && now() - S.gyroSeen > 2) { // iOS: 권한을 이번 실행에서 다시 받아야 할 때
      setTimeout(() => { if (S.battle === b && now() - S.gyroSeen > 2 && !S.popup) popup('자이로 허용', '자이로 시점을 쓰려면 한 번 허용해 주세요.', '허용', '이번엔 끄기', () => { requestGyro().then(() => closePopup(), () => closePopup()); }, () => closePopup()); }, 600);
    }
    S.active = true; anchors = new WeakMap();
    if (S.mouseUser) lock(); // 스테이지 카드·다시 싸우기 클릭 안 → 바로 마우스 잠금
  }
  function setActive(on) {
    if (on === S.active) return;
    S.active = on;
    if (!on) { unlock(); S.space = false; S.flipReq = false; closePopupIfGyro(); }
  }
  function closePopupIfGyro() { if (S.popup) closePopup(); }
  function blocking() { return !!S.popup; } // 팝업이 떠 있는 동안 전투 정지
  // 야구장 입력 상황 (그리기·입력 전용 판단, 시뮬은 BB.act 가 다시 확인): 'sw' 스윙 · 'pg' 게이지 · 'th' 송구 가능 · 'hold' 투구 중(반전 없음) · null 평소
  const BS_FIX = new Set(['setup', 'pitch', 'pause', 'hrstop']);
  function bsbCtx(b, P) {
    const D = b && b.bsb; if (!D || !D.on || !b.bsbMan || b.over || !P) return null; const p = D.pitch;
    if (D.batU === P && (D.autoBat || (D.phase === 'pitch' && p && p.man && !p.done))) return 'sw';
    if (D.pitU === P && D.phase === 'pitch' && p && p.gauge && p.gauge.q == null) return p.gauge.st === 'hold' ? 'pr' : 'pa';
    if (BS_FIX.has(D.phase) && (D.batU === P || D.pitU === P)) return 'hold';
    if (D.phase === 'live' && D.ball && D.ball.st === 'held' && D.ball.holder === P) return 'th';
    return null;
  }
  // 야구: 내가 공을 쥐고 송구할 수 있을 때 잠깐 슬로모션 (화면·시뮬 진행 속도만 줄임 → 고정 스텝이라 결과·리플레이 그대로). 실제 시간 기준 SLOW.t 초 0.3배 → SLOW.e 초 동안 원래대로, 던지면 바로 복귀
  const SLOW = { k: 0.3, t: 1.6, e: 0.5 };
  function timeK(b, dt) {
    const th = S.active && bsbCtx(b, player(b)) === 'th';
    if (th) { S.slT = S.slT == null ? 0 : S.slT + dt; S.slK = S.slT < SLOW.t ? SLOW.k : SLOW.k + (1 - SLOW.k) * Math.min(1, (S.slT - SLOW.t) / SLOW.e); }
    else { S.slT = null; S.slK = S.slK == null ? 1 : Math.min(1, S.slK + (1 - S.slK) * (1 - Math.exp(-14 * dt)) + 0.002); }
    return S.slK;
  }
  function timing(b) { const c = bsbCtx(b, player(b)); return c === 'sw' || c === 'pa'; }
  function aimVal() { // 화면 가운데(카메라 정면) 광선이 홈 플레이트 면(y = 홈 − 2)과 만나는 점 → 존 반폭·반높이 단위 [ax, az]
    const BS = window.BASEBALL, Hm = BS.S.home, t = Math.abs(C.F[1]) > 1e-4 ? (Hm.y - 2 - C.y) / C.F[1] : 0; if (!(t > 0)) return [0, 0];
    const x = C.x + C.F[0] * t, z = C.z + C.F[2] * t, r = v => Math.round(v * 100) / 100;
    return [r(clamp((x - Hm.x) / 6, -2.6, 2.6)), r(clamp((z - 18) / 8, -2.2, 2.2))];
  }
  function takeAct(b) { // 입력 → { u, kind?, val? } (kind 없음 = 반전). main.js 가 스텝 사이에 적용하고 리플레이에 기록
    if (b.bsb && b.bsb.on && !b.bsbMan) return { u: player(b), kind: 'man' }; // 야구장 직접 플레이: 수동 조작 켜기 (첫 프레임, 기록됨)
    if (!S.flipReq) { if (S.relReq) { S.relReq = false; const P = player(b); if (S.active && !b.over && bsbCtx(b, P) === 'pr') return { u: P, kind: 'pr' }; } return null; } // 놓음 (누름과 같은 프레임이면 다음 프레임에)
    S.flipReq = false; const pt = S.pressPt; S.pressPt = null;
    if (!S.active || b.over) return null;
    const P = player(b), c = bsbCtx(b, P);
    if (c === 'sw') return { u: P, kind: c };
    if (c === 'pa') return { u: P, kind: 'pa', val: aimVal() };
    if (c === 'pr') return null;
    if (c === 'hold') return null;
    if (c === 'th') { let id = S.aimId; if (pt && !S.locked) { id = null; let bd = 34; for (const f of S.fproj) { const d = Math.hypot(f.x - pt.x, f.y - pt.y); if (d < bd) { bd = d; id = f.id; } } } if (id != null) return { u: P, kind: 'th', val: id }; }
    if (b.time - S.lastFlipT < FLIP_CD) return null;
    return { u: P };
  }
  function acted(b, A, ok) { if (!A.kind) { if (ok) { S.lastFlipT = b.time; S.flash = 0.45; } } else if (ok && A.kind === 'th') S.thrFlash = 0.4; else if (ok && A.kind === 'pr' && !Settings.get('bsbHoldSeen')) Settings.set('bsbHoldSeen', true); } // 처음 한 번 '누른 채 유지' 안내 (설정에 저장)
  function takeFlip(b) { const A = takeAct(b); return A && !A.kind ? A.u : null; } // 이전 이름 (호환)
  function flipped(b, ok) { acted(b, {}, ok); }

  // ---------- 카메라 ----------
  const C = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, f: 300, cx: 180, cy: 360, F: [0, 0, 0], R: [0, 0, 0], U: [0, 0, 0] };
  function updateCam(b, dt, view) {
    const P = player(b), E = focus(b, P), t = now();
    if (!S.init) { S.init = true; S.px = P.x; S.py = P.y; S.autoYaw = E ? Math.atan2(E.y - P.y, E.x - P.x) : (P.team ? Math.PI : 0); }
    const kp = 1 - Math.exp(-12 * dt); S.px += (P.x - S.px) * kp; S.py += (P.y - S.py) * kp;
    if (E && Math.hypot(E.x - P.x, E.y - P.y) > 26) { // 너무 가까우면 방향이 튀므로 유지
      const d = wrap(Math.atan2(E.y - P.y, E.x - P.x) - S.autoYaw);
      S.autoYaw = wrap(S.autoYaw + clamp(d * (1 - Math.exp(-3.2 * dt)), -2.6 * dt, 2.6 * dt));
    }
    S.dIn = [S.inYaw, S.inPitch]; // 야구 투구 조준용 (이번 프레임 회전 입력)
    S.userYaw = wrap(S.userYaw + S.inYaw); S.userPitch = clamp(S.userPitch + S.inPitch, PITCH_UP, 0.32); S.inYaw = S.inPitch = 0; // 쌓인 입력은 매 프레임 비움. 올려다보기는 내 캐릭터 상반신이 화면에 남는 만큼만
    if (t - S.lastInp > 0.7) { const k = 1 - Math.exp(-1.6 * dt); S.userYaw -= S.userYaw * k; } // 회전 입력이 없으면 상대 쪽으로 천천히 복귀
    if (t - S.lastInp > 1.2) { const k = 1 - Math.exp(-1.8 * dt); S.userPitch -= S.userPitch * k; if (Math.abs(S.userPitch) < 0.002) S.userPitch = 0; } // 위아래는 조금 더 기다렸다가 기본 각도로 // 회전 입력이 없으면 상대 쪽으로 천천히 복귀
    if (S.touch && !S.touch.moved && S.lockOn !== 'touch' && t - S.touch.t >= LONG_T) S.lockOn = 'touch'; // 길게 누름 → 추적 (손 뗄 때 반전 안 함)
    let yaw = S.autoYaw + S.userYaw, pitch = CAM.pitch + S.userPitch, camH = CAM.h;
    // 시점 덮어쓰기 (우선순위: 공중에 뜬 내 캐릭터 > 교실 선생님이 돌아봄 > 상대 추적). 켜질 때·꺼질 때 부드럽게 섞음, 덮어쓰는 동안 시점 입력은 무시
    const md = camMode(b, P, E);
    if (md) { S.ovT = md; S.inYaw = S.inPitch = 0; if (md.zeroUser) { const k = 1 - Math.exp(-6 * dt); S.userYaw -= S.userYaw * k; S.userPitch -= S.userPitch * k; } }
    S.ov = clamp((S.ov || 0) + (md ? dt / 0.35 : -dt / 0.5), 0, 1);
    if (S.ov > 0 && S.ovT) { const k = S.ov * S.ov * (3 - 2 * S.ov), o = S.ovT; // smoothstep
      if (md) { const kk = md.aim && S.ov >= 1 ? 1 : 1 - Math.exp(-8 * dt); /* 조준 중에는 바로 따라감 */ S.oY = S.oY == null ? o.yaw : S.oY + wrap(o.yaw - S.oY) * kk; S.oP = S.oP == null ? o.pitch : S.oP + (o.pitch - S.oP) * kk; S.oH = S.oH == null ? o.h : S.oH + (o.h - S.oH) * kk;
        S.posKK = kk; }
      yaw = yaw + wrap(S.oY - yaw) * k; pitch += (S.oP - pitch) * k; camH += (S.oH - camH) * k;
      S.posK = k; if (!md && S.ov === 0) { S.ovT = null; S.oY = S.oP = S.oH = S.oX = S.oY2 = null; } } else S.posK = 0;
    if (!md && S.ov === 0) S.oY = S.oP = S.oH = S.oX = S.oY2 = null;
    C.yaw = yaw; C.pitch = pitch;
    const fx = Math.cos(C.yaw), fy = Math.sin(C.yaw), rx = -fy, ry = fx;
    C.x = S.px - fx * CAM.dist - rx * CAM.side; C.y = S.py - fy * CAM.dist - ry * CAM.side; C.z = camH;
    if (S.posK > 0) { // 고정 시점 위치 (야구 타석·마운드): 목표 위치(없으면 평소 위치)를 따라가며 섞음
      if (md) { const tx = md.cx != null ? md.cx : C.x, ty = md.cy != null ? md.cy : C.y, kk = S.posKK || 1; S.oX = S.oX == null ? tx : S.oX + (tx - S.oX) * kk; S.oY2 = S.oY2 == null ? ty : S.oY2 + (ty - S.oY2) * kk; }
      if (S.oX != null) { C.x += (S.oX - C.x) * S.posK; C.y += (S.oY2 - C.y) * S.posK; } }
    const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
    C.F = [cp * fx, cp * fy, -sp]; C.R = [rx, ry, 0]; C.U = [sp * fx, sp * fy, cp];
    S.zm = (S.zm || 1) + (((md && md.zm) || 1) - (S.zm || 1)) * (1 - Math.exp(-6 * dt)); let f = CAM.f * S.zm; if (b.zoom) { const z = b.zoom; f *= 1 + z.k * 1.5 * Math.sin(Math.PI * Math.min(1, z.t / z.dur)); }
    C.f = f; C.cx = W / 2; C.cy = view.y + view.h * 0.66;
    if (b.shakeT > 0) { const k = b.shakeT / 0.18 * b.shakeA, q = t * 60; C.cx += Math.round(Math.sin(q * 1.7) * k); C.cy += Math.round(Math.cos(q * 2.3) * k); }
  }
  function launched(u) { const a = u && u.air; return !!(a && !u.dead && (a.tumble || a.spin) && !a.ride && !a.claw && (a.h || 0) >= 14 && (a.dur || 0) >= 0.4); } // 맞아서 떠오른(조종 불가) 공중 상태
  function aimPitch(P, tx, ty, tz, h) { // 카메라(높이 h, 내 캐릭터 뒤 CAM.dist)에서 (tx,ty,tz) 를 화면 가운데 조금 위에 두는 기울기
    const cx = S.px - Math.cos(S.lastYaw || 0) * CAM.dist, cy = S.py - Math.sin(S.lastYaw || 0) * CAM.dist, d = Math.max(30, Math.hypot(tx - cx, ty - cy));
    return Math.atan2(h - tz, d) + 0.08;
  }
  const PCH = 42, PCZ = 1.1; // 내 투구 시점 높이·확대
  function camMode(b, P, E) {
    if (!P) return null;
    const D = b.bsb, BS = window.BASEBALL;
    if (D && D.on && BS && b.bsbMan && !b.over && BS_FIX.has(D.phase) && (D.batU === P || D.pitU === P)) { // 야구 플레이 볼: 회전 없는 고정 시점
      const Hm = BS.S.home, M = BS.S.mound;
      if (D.batU === P) { const cx = Hm.x + 4 * (D.side || 1), cy = Hm.y + 46; S.lastYaw = Math.atan2(M.y - cy, M.x - cx); return { yaw: S.lastYaw, pitch: 0.16, h: 40, cx, cy, zm: 1.15 }; } // 포수 자리 (포수는 그리지 않음) // 타석: 홈 뒤에서 투수 쪽
      const p = D.pitch, g = p && D.phase === 'pitch' && p.gauge, near = !!(g && (g.q == null || !p.done)); // 내 투구 중(조준·게이지·공 날아가는 동안): 마운드 앞 가까운 시점 + 확대로 존이 잘 보이게
      const cx = near ? M.x + 6 : M.x + 24, cy = near ? M.y + 8 : M.y - 100; // 투구: 마운드 뒤에서 포수 쪽
      if (g && g.q == null) { // 내 조준: 존 가운데를 정면으로, 회전 입력은 조준점이 존 둘레(반폭 ×2.4, 반높이 ×2.2)를 넘지 않게. 누른 뒤(게이지)는 고정
        if (S.aimFor !== p) { S.aimFor = p; S.aimY = S.aimP = 0; }
        const dx = Hm.x - cx, dy = Hm.y - 2 - cy, L = Math.hypot(dx, dy), ly = Math.atan2(2.4 * 6, L), lp = Math.atan2(2.2 * 8, L);
        if (g.st === 'aim' && S.dIn) { S.aimY = clamp(S.aimY + S.dIn[0] * 0.3, -ly, ly); S.aimP = clamp(S.aimP + S.dIn[1] * 0.5, -lp, lp); }
        S.lastYaw = Math.atan2(dy, dx) + S.aimY; return { yaw: S.lastYaw, pitch: Math.atan2(PCH - 18, L) + S.aimP, h: PCH, cx, cy, aim: true, zm: PCZ };
      }
      if (near) { const dx = Hm.x - cx, dy = Hm.y - 2 - cy; S.lastYaw = Math.atan2(dy, dx) + (S.aimY || 0); return { yaw: S.lastYaw, pitch: Math.atan2(PCH - 18, Math.hypot(dx, dy)) + (S.aimP || 0), h: PCH, cx, cy, zm: PCZ }; }
      S.lastYaw = Math.atan2(Hm.y - cy, Hm.x - cx); return { yaw: S.lastYaw, pitch: 0.3, h: 66, cx, cy };
    }
    if (launched(P)) { const h = 44, z = b.airZ(P) + 20; S.lastYaw = S.autoYaw + S.userYaw; return { yaw: S.lastYaw, pitch: Math.atan2(h - z, CAM.dist * 1.1) + 0.12, h }; } // 낮은 카메라에서 공중의 내 캐릭터를 올려다봄
    const Dc = b.cls; // 교실: 선생님이 돌아보는 동안 선생님 쪽으로
    if (Dc && (Dc.phase === 'look' || (Dc.phase === 'warn' && Dc.t > Dc.C.warn * 0.6))) { const tx = 180, ty = 168, yw = Math.atan2(ty - P.y, tx - P.x); S.lastYaw = yw; return { yaw: yw, pitch: clamp(aimPitch(P, tx, ty, 34, CAM.h), CAM.pitch - 0.12, CAM.pitch + 0.32), h: CAM.h }; }
    const bl = S.lockOn && BS && BS.ball3(b); // 야구장: 상대 대신 공을 추적
    if (bl) { const yw = Math.hypot(bl.x - P.x, bl.y - P.y) > 8 ? Math.atan2(bl.y - P.y, bl.x - P.x) : (S.lastYaw || 0); S.lastYaw = yw; return { yaw: yw, pitch: clamp(aimPitch(P, bl.x, bl.y, bl.z, CAM.h), CAM.pitch - 0.3, CAM.pitch + 0.32), h: CAM.h, zeroUser: true }; }
    if (S.lockOn && E && !E.dead) { const yw = Math.atan2(E.y - P.y, E.x - P.x); S.lastYaw = yw; return { yaw: yw, pitch: clamp(aimPitch(P, E.x, E.y, 24 + b.airZ(E), CAM.h), CAM.pitch - 0.12, CAM.pitch + 0.32), h: CAM.h, zeroUser: true }; } // 상대 추적 (누르는 동안)
    return null;
  }
  function cam(x, y, z) { const dx = x - C.x, dy = y - C.y, dz = z - C.z; return [dx * C.R[0] + dy * C.R[1], dx * C.U[0] + dy * C.U[1] + dz * C.U[2], dx * C.F[0] + dy * C.F[1] + dz * C.F[2]]; }
  function scr(c) { return { x: C.cx + C.f * c[0] / c[2], y: C.cy - C.f * c[1] / c[2], s: C.f / c[2], z: c[2] }; }
  function proj(x, y, z) { const c = cam(x, y, z); return c[2] > CAM.near ? scr(c) : null; }
  function ground(sx, sy) { // 화면 점 → 바닥(z=0) 점
    const a = (sx - C.cx) / C.f, q = -(sy - C.cy) / C.f;
    const dx = C.F[0] + a * C.R[0] + q * C.U[0], dy = C.F[1] + a * C.R[1] + q * C.U[1], dz = C.F[2] + q * C.U[2];
    if (dz > -1e-4) return null; const t = -C.z / dz; return [C.x + t * dx, C.y + t * dy, t];
  }
  function poly(ctx, pts) { // 3D 다각형 (가까운 면 자르기) → 경로. 보이면 true
    let cs = pts.map(p => cam(p[0], p[1], p[2])); const out = [], N = CAM.near;
    for (let i = 0; i < cs.length; i++) { const a = cs[i], c = cs[(i + 1) % cs.length], ain = a[2] >= N, cin = c[2] >= N;
      if (ain) out.push(a); if (ain !== cin) { const k = (N - a[2]) / (c[2] - a[2]); out.push([a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, N]); } }
    if (out.length < 3) return false;
    ctx.beginPath(); out.forEach((c, i) => { const p = scr(c); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); return true;
  }

  // ---------- 바닥 ----------
  let tex = null, tctx = null, lift = null, lctx = null;
  function floorArea(b) { // 야구장: 구장 전체를 바닥 그림으로 (배율 1). 크기가 바뀌면 캔버스 다시 만듦
    const D = b.bsb, Wd = D && D.on && window.BASEBALL ? BASEBALL.S.world : null;
    const n = Wd ? [0, 0, Wd.w, Wd.h, 1] : [TX0.x, TX0.y, TX0.w, TX0.h, TR];
    if (n[0] !== TX.x || n[1] !== TX.y || n[2] !== TX.w || n[3] !== TX.h || n[4] !== FR) { TX.x = n[0]; TX.y = n[1]; TX.w = n[2]; TX.h = n[3]; FR = n[4]; tex = lift = rest = null; bigPool.length = 0; }
  }
  function drawFloorTex(b) {
    floorArea(b);
    if (!tex) { tex = document.createElement('canvas'); tex.width = TX.w * FR; tex.height = TX.h * FR; tctx = tex.getContext('2d'); }
    if (!lift) { lift = document.createElement('canvas'); lift.width = tex.width; lift.height = tex.height; lctx = lift.getContext('2d'); }
    for (const c of [tctx, lctx]) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, tex.width, tex.height); c.setTransform(FR, 0, 0, FR, -TX.x * FR, -TX.y * FR); c.imageSmoothingEnabled = false; }
    // 바닥(tex) = 바닥 그림·바닥 이펙트, 세울 그림(lift) = 물체·특수 건물·기믹·위층 이펙트·입자. 투사체는 따로 (공중)
    S.stand = []; S.bigs = []; S.bigN = 0; S.flats = []; S.beams = []; S.walls = []; S.boxes = []; S.huds = []; b._v3d = V3D;
    try { Render.draw(tctx, b, { v3d: true, lift: lctx, noProj: true, stand: S.stand, route }); } finally { b._v3d = null; }
    for (const c of [tctx, lctx]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; }
  }
  // ---------- 큰 이펙트 → 바닥에 눕힘 ----------
  // 이펙트·훅마다 그리는 범위를 기록(픽셀은 읽지 않고 그리기 명령 좌표로), 지난 프레임 범위가 크면(BIGW×BIGH 넘음) 바닥 그림(tctx)으로 보냄. 한 번 크면 계속 바닥
  const BIGW = 92, BIGH = 112, bigObj = new WeakMap(), bigKey = {};
  const TK = { ctx: null, key: null, box: [1e9, 1e9, -1e9, -1e9] }, tcache = {};
  const OPS = { fillRect: 4, strokeRect: 4, rect: 4, roundRect: 4, clearRect: 0, drawImage: 1, arc: 2, ellipse: 3, moveTo: 5, lineTo: 5, quadraticCurveTo: 6, bezierCurveTo: 6, fillText: 7, strokeText: 7 };
  function tpt(m, x, y) { const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f, B = TK.box; if (X < B[0]) B[0] = X; if (X > B[2]) B[2] = X; if (Y < B[1]) B[1] = Y; if (Y > B[3]) B[3] = Y; }
  function tmeas(op, a) {
    const k = OPS[op]; if (!k) return; const m = TK.ctx.getTransform();
    if (k === 4) { tpt(m, a[0], a[1]); tpt(m, a[0] + a[2], a[1]); tpt(m, a[0], a[1] + a[3]); tpt(m, a[0] + a[2], a[1] + a[3]); }
    else if (k === 1) { const im = a[0], n = a.length; let x, y, w, h; if (n >= 9) { x = a[5]; y = a[6]; w = a[7]; h = a[8]; } else if (n >= 5) { x = a[1]; y = a[2]; w = a[3]; h = a[4]; } else { x = a[1]; y = a[2]; w = im.width || 0; h = im.height || 0; } tpt(m, x, y); tpt(m, x + w, y); tpt(m, x, y + h); tpt(m, x + w, y + h); }
    else if (k === 2 || k === 3) { const r = k === 2 ? a[2] : Math.max(a[2], a[3]); tpt(m, a[0] - r, a[1] - r); tpt(m, a[0] + r, a[1] + r); tpt(m, a[0] - r, a[1] + r); tpt(m, a[0] + r, a[1] - r); }
    else if (k === 5) tpt(m, a[0], a[1]);
    else if (k === 6) for (let i = 0; i + 1 < a.length; i += 2) tpt(m, a[i], a[i + 1]);
    else if (k === 7) { const w = String(a[0]).length * 4; tpt(m, a[1] - w, a[2] - 8); tpt(m, a[1] + w, a[2] + 8); }
  }
  let tproxy = null;
  function tracker() {
    if (tproxy) return tproxy;
    tproxy = new Proxy(lctx, {
      get(t, p) {
        const v = TK.ctx[p]; if (typeof v !== 'function') return v;
        return tcache[p] || (tcache[p] = OPS[p] !== undefined ? (...a) => { tmeas(p, a); return TK.ctx[p](...a); } : (...a) => TK.ctx[p](...a));
      },
      set(t, p, v) { TK.ctx[p] = v; return true; },
    });
    return tproxy;
  }
  // 큰 이펙트는 각자 전용 캔버스(bigPool)에 그리고, 이번 프레임에 잰 범위만 잘라 그 위치에 세움 (캐릭터 허리 높이 BIG_Z 가 가운데)
  const bigPool = [], MAXBIG = 4, BIG_Z = 24;
  function bigCanvas(i) {
    if (!bigPool[i]) { const c = document.createElement('canvas'); c.width = lift.width; c.height = lift.height; bigPool[i] = { c, x: c.getContext('2d') }; }
    const B = bigPool[i], x = B.x; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, B.c.width, B.c.height);
    x.setTransform(lctx.getTransform()); x.imageSmoothingEnabled = false; return B; // 위층과 같은 변환
  }
  function tflush() {
    if (TK.key == null) return; const B = TK.box, ok = B[2] > B[0] && B[3] > B[1];
    if (TK.bigC) { if (ok) S.bigs.push({ c: TK.bigC, x0: TX.x + B[0] / FR - 2, y0: TX.y + B[1] / FR - 2, x1: TX.x + B[2] / FR + 2, y1: TX.y + B[3] / FR + 2 }); }
    else if (ok && ((B[2] - B[0]) / FR > BIGW || (B[3] - B[1]) / FR > BIGH)) { if (typeof TK.key === 'object') bigObj.set(TK.key, true); else bigKey[TK.key] = true; }
    TK.key = null; TK.bigC = null;
  }
  // ---------- 훅이 직접 플레이에서 제자리에 그릴 수 있게 주는 도구 (b._v3d, 그리는 동안만 있음) ----------
  // stand({x,y,z?,w,h,draw,maxS?}) = 세운 판 (draw 는 2D 처럼 발(x,y) 위로 그림), floor(draw) = 바닥에 그림,
  // flat({x,y,z,r,draw,sy?}) = 높이 z 의 수평면 (팽이처럼 뜬 원반 등), beam({x1,y1,x2,y2,z|z1,z2,w,draw(c,L)}) = 두 점 사이 3D 띠
  // (draw 는 (0,0)→(L,0) 가로로 그림), wall = 바닥에 고정된 세로 판, shadow(x,y,r) = 바닥 그림자. 여기로 넘긴 그림은 큰 이펙트 잡기에서 빠짐.
  const V3D = {
    stand(it) { S.stand.push(it); },
    floor(fn) { tctx.save(); try { fn(tctx); } finally { tctx.restore(); } },
    flat(it) { if (!(it.z > 0.5)) V3D.floor(c => flatXf(c, it)); else S.flats.push(it); },
    beam(it) { S.beams.push(it); },
    wall(it) { S.walls.push(it); },
    box(it) { S.boxes.push(it); },
    cam() { return { x: C.x, y: C.y, z: C.z, yaw: C.yaw }; },
    center() { return { x: C.cx, y: C.cy }; }, // 화면에서 카메라 정면 점
    input() { return { mouse: !!S.mouseUser }; }, // 카메라 위치 (월드) — 앞/뒷모습 고르기 등
    hud(fn) { S.huds.push(fn); },
    proj(x, y, z) { return proj(x, y, z); }, // 월드 → 화면 (HUD 용, 카메라 뒤면 null) // 화면 고정 HUD (3D 그림 위, 2D 화면 좌표) // {x0,y0,z0,x1,y1,z1,col,a?}: 축 정렬 3D 상자 (떨어지는 상자 등) // {x1,y1,x2,y2,h,draw(c,L)}: 두 바닥 점 사이에 선 세로 판 (벽처럼 고정, draw 는 (0,0)=왼쪽 위, 바닥 = y h)
    shadow(x, y, r, a = 0.3) { tctx.save(); tctx.globalAlpha = a; tctx.fillStyle = '#000'; tctx.beginPath(); tctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); tctx.fill(); tctx.restore(); },
  };
  function flatXf(c, it) { if (it.sy) { c.translate(it.x, it.y); c.scale(1, 1 / it.sy); c.translate(-it.x, -it.y); } it.draw(c); } // sy: 2D 에서 세로로 눌러 그린 원 → 바닥에선 펴서
  let sinkC = null;
  function sink() { if (!sinkC) sinkC = document.createElement('canvas').getContext('2d'); sinkC.setTransform(1, 0, 0, 1, 0, 0); return sinkC; } // 이미 다른 길로 넘긴 그림의 자리 (그리지 않음)
  function fxRoute(f) { // 공용 이펙트 중 제자리가 분명한 것 (true = 여기서 처리)
    const t = f.type, D = Render.drawFx;
    if (t === 'shock' || t === 'ring') { V3D.flat({ x: f.x, y: f.y, z: 0, sy: 0.7, draw: c => D(c, f, 1) }); return true; } // 퍼지는 고리 = 바닥
    if (t === 'pillar' || t === 'meteor') { S.stand.push({ x: f.x, y: f.y, w: 130, h: t === 'meteor' ? 250 : 170, draw: c => D(c, f, 1) }); return true; } // 기둥·떨어지는 운석 = 세움
    if (t === 'bolt' && f.pts && f.pts.length > 1) { const e = f.pts[f.pts.length - 1], top = f.pts[0]; S.stand.push({ x: e[0], y: e[1], w: 70, h: Math.max(0, e[1] - top[1]) + 50, draw: c => D(c, f, 1) }); return true; } // 번개 = 세움
    if (t === 'streak') { if (Math.hypot(f.x2 - f.x1, f.y2 - f.y1) < 2) return false; S.beams.push({ x1: f.x1, y1: f.y1 + 18, x2: f.x2, y2: f.y2 + 18, z: 18, w: (f.w || 10) + 6, draw: (c, L) => D(c, Object.assign({}, f, { x1: 0, y1: 0, x2: L, y2: 0 }), 1) }); return true; } // 궤적 = 몸 높이 3D 띠
    return false;
  }
  function route(k) { // Render.draw 가 그림 단위마다 부름 (null = 끝)
    tflush(); if (k == null) return lctx;
    if (typeof k === 'object' && k.type && !k.drawOver && fxRoute(k)) return sink();
    const big = (typeof k === 'object' ? bigObj.get(k) : bigKey[k]) && S.bigN < MAXBIG;
    if (big) { const B = bigCanvas(S.bigN++); TK.ctx = B.x; TK.bigC = B.c; } else { TK.ctx = lctx; TK.bigC = null; }
    TK.key = k; TK.box[0] = TK.box[1] = 1e9; TK.box[2] = TK.box[3] = -1e9;
    return tracker();
  }
  function bigPlace(b, g) { // 세울 위치: 가까운 캐릭터 발(그 캐릭터 몸에 걸친 이펙트) 또는 이펙트 가운데
    const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2; let wy = cy, best = 1e9;
    for (const u of b.u) { if (u.hidden || u.def.noDraw) continue; const dx = Math.abs(u.x - cx), dy = u.y - cy; if (dx < 40 && dy > -12 && dy < 70 && dx + dy < best) { best = dx + dy; wy = u.y; } }
    g.cx = cx; g.wy = wy; return g;
  }
  function drawBig(ctx, g) {
    const p = proj(g.cx, g.wy, BIG_Z); if (!p || p.s > 9) return;
    const w = g.x1 - g.x0, h = g.y1 - g.y0, dw = w * p.s, dh = h * p.s;
    ctx.drawImage(g.c, (g.x0 - TX.x) * FR, (g.y0 - TX.y) * FR, w * FR, h * FR, p.x - dw / 2, p.y - dh / 2, dw, dh);
  }

  // ---------- 세울 그림 나누기 (픽셀을 읽지 않음: file:// 에서 PNG 를 그린 캔버스는 읽을 수 없음) ----------
  // 위층 그림(lift: 이펙트·입자·기믹 위층)은 캐릭터마다 몸 둘레 칸(가까운 캐릭터 기준으로 나눔)을 잘라 그 캐릭터 발 위치에 세우고, 칸 밖은 바닥에 눕힘
  const CELL = { l: 56, r: 56, t: 124, b: 14 }, YW = 0.5; // 칸 크기 · 나눌 때 세로 거리 가중
  function clipPoly(pts, a, c, d) { // a·x + c·y <= d 쪽만 남김
    const out = [];
    for (let i = 0; i < pts.length; i++) { const P = pts[i], Q = pts[(i + 1) % pts.length], fp = a * P[0] + c * P[1] - d, fq = a * Q[0] + c * Q[1] - d;
      if (fp <= 0) out.push(P); if ((fp <= 0) !== (fq <= 0)) { const k = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); } }
    return out;
  }
  let rest = null, rctx = null;
  function unitCells(b) {
    const us = b.u.filter(u => !u.hidden && !u.def.noDraw), cells = [];
    for (const u of us) {
      const x = u.x + (u.kx || 0), y = u.y + (u.ky || 0);
      let poly = [[x - CELL.l, y - CELL.t], [x + CELL.r, y - CELL.t], [x + CELL.r, y + CELL.b], [x - CELL.l, y + CELL.b]];
      const si = [x, (y - 50) * YW];
      for (const o of us) { if (o === u) continue; const ox = o.x + (o.kx || 0), oy = o.y + (o.ky || 0);
        if (Math.abs(ox - x) > CELL.l + CELL.r || Math.abs(oy - y) > CELL.t + CELL.b) continue;
        const sj = [ox, (oy - 50) * YW]; // 축척 공간의 수직이등분선 → 월드의 직선
        poly = clipPoly(poly, 2 * (sj[0] - si[0]), 2 * YW * (sj[1] - si[1]), sj[0] * sj[0] + sj[1] * sj[1] - si[0] * si[0] - si[1] * si[1]); if (poly.length < 3) break; }
      if (poly.length >= 3) cells.push({ u, x, y, poly });
    }
    // 칸 밖 위층 그림 → 바닥
    if (!rest) { rest = document.createElement('canvas'); rest.width = lift.width; rest.height = lift.height; rctx = rest.getContext('2d'); }
    rctx.globalCompositeOperation = 'copy'; rctx.drawImage(lift, 0, 0); rctx.globalCompositeOperation = 'destination-out'; rctx.fillStyle = '#000';
    for (const c of cells) { rctx.beginPath(); c.poly.forEach((q, i) => { const X = (q[0] - TX.x) * FR, Y = (q[1] - TX.y) * FR; i ? rctx.lineTo(X, Y) : rctx.moveTo(X, Y); }); rctx.closePath(); rctx.fill(); }
    rctx.globalCompositeOperation = 'source-over'; tctx.drawImage(rest, 0, 0);
    return cells;
  }
  function drawCell(ctx, c) { // 캐릭터 그림과 같은 배율·발 위치로 세움 → 캐릭터 몸에 붙은 이펙트가 제자리에
    const p = proj(c.x, c.y, 0); if (!p || p.s > 9) return;
    const X = x => p.x + (x - c.x) * p.s, Y = y => p.y + (y - c.y) * p.s;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of c.poly) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    x0 = Math.max(x0, TX.x); y0 = Math.max(y0, TX.y); x1 = Math.min(x1, TX.x + TX.w); y1 = Math.min(y1, TX.y + TX.h); if (x1 <= x0 || y1 <= y0) return;
    if (X(x1) < 0 || X(x0) > W) return;
    ctx.save(); ctx.beginPath(); c.poly.forEach((q, i) => i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1]))); ctx.closePath(); ctx.clip();
    ctx.drawImage(lift, (x0 - TX.x) * FR, (y0 - TX.y) * FR, (x1 - x0) * FR, (y1 - y0) * FR, X(x0), Y(y0), (x1 - x0) * p.s, (y1 - y0) * p.s);
    ctx.restore();
  }
  // 물체 (특수 건물·x 가 있는 스테이지 물체): 각자 작은 캔버스에 그려 발(바닥 y) 위치에 세움
  const opool = [];
  function renderObj(i, it) {
    const w = Math.ceil(Math.max(90, (it.w || 0) + 50) / 10) * 10, h = Math.ceil(Math.max(200, (it.h || 0) + 60) / 20) * 20, fy = h - 30;
    let B = opool[i]; if (!B || B.w !== w || B.h !== h) { const c = document.createElement('canvas'); c.width = w * TR; c.height = h * TR; B = opool[i] = { c, x: c.getContext('2d'), w, h, fy }; }
    const x = B.x; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, B.c.width, B.c.height);
    x.setTransform(TR, 0, 0, TR, (w / 2 - it.x) * TR, (fy - it.y) * TR); x.imageSmoothingEnabled = false;
    try { it.draw(x); } catch (e) { console.warn('[direct] obj draw', e); } finally { x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; }
    return B;
  }
  // ---------- 투사체: 그 캐릭터의 투사체 그림을 공중(높이 PH)에 세움. 진행 방향은 화면에 비친 방향으로 ----------
  const PH = 16, PB = 128, ppool = [];
  function renderProj(i, p) {
    if (!ppool[i]) { const c = document.createElement('canvas'); c.width = PB * TR; c.height = PB * TR; ppool[i] = { c, x: c.getContext('2d') }; }
    const B = ppool[i], x = B.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, B.c.width, B.c.height);
    x.setTransform(TR, 0, 0, TR, (PB / 2 - p.x) * TR, (PB / 2 - p.y) * TR); x.imageSmoothingEnabled = false;
    const sv = [p.vx, p.vy], sp = Math.hypot(p.vx || 0, p.vy || 0);
    if (sp > 1e-6) { const a = proj(p.x, p.y, PH), c = proj(p.x + p.vx / sp * 10, p.y + p.vy / sp * 10, PH);
      if (a && c) { const dx = c.x - a.x, dy = c.y - a.y, L = Math.hypot(dx, dy); if (L > 1e-3) { p.vx = dx / L * sp; p.vy = dy / L * sp; } } }
    try { Render.drawProj(x, p); } catch (e) { console.warn('[direct] proj draw', e); }
    finally { p.vx = sv[0]; p.vy = sv[1]; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
    return B.c;
  }
  // ---------- 근접 휘두르기: 손 높이의 수평면에 눕혀 그림 (실험) ----------
  function drawSwing(ctx, u, b) {
    const P = Render.swingPose && Render.swingPose(u); if (!P) return;
    const k = u.def.size || 1, hz = 20 * k + b.airZ(u) + (u.jkLiftZ || 0), cx = u.x + (u.kx || 0), cy = u.y + (u.ky || 0);
    const at = (a, lx, ly) => proj(cx + Math.cos(a) * lx - Math.sin(a) * ly, cy + Math.sin(a) * lx + Math.cos(a) * ly, hz);
    const o = proj(cx, cy, hz); if (!o) return;
    ctx.save(); ctx.lineCap = 'round';
    const r = P.off + P.len;
    if (!P.thrust && P.aS != null) { // 호 궤적
      const N = 14, pts = []; for (let i = 0; i <= N; i++) { const q = at(P.aS + (P.th - P.aS) * i / N, r, 0); if (q) pts.push(q); }
      if (pts.length > 1) for (const [col, lw, al] of [[P.trail, P.heavy ? 6 : 4, 0.55], ['#ffffff', 1.5, 0.9]]) {
        ctx.globalAlpha = al * P.fade; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, lw * o.s * 0.6);
        ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke(); }
    } else if (P.p < 0.8) { const q0 = at(P.th, 4, 0), q1 = at(P.th, P.off + P.len * 0.9, 0);
      if (q0 && q1) { ctx.globalAlpha = 0.5 * P.fade; ctx.strokeStyle = P.trail; ctx.lineWidth = Math.max(1, 3 * o.s * 0.6); ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke(); } }
    const m = P.off + P.len / 2, A = at(P.th, m + P.len / 2, 0), Bq = at(P.th, m - P.len / 2, 0), Cq = at(P.th, m, 4), D = at(P.th, m, -4), M = at(P.th, m, 0);
    if (A && Bq && Cq && D && M) { // 무기 그림: 무기 가운데 기준 아핀 근사 (작아서 원근 오차 작음)
      const ex = [(A.x - Bq.x) / P.len, (A.y - Bq.y) / P.len], ey = [(Cq.x - D.x) / 8, (Cq.y - D.y) / 8];
      ctx.globalAlpha = P.fade; ctx.transform(ex[0], ex[1], ey[0], ey[1], M.x - ex[0] * m, M.y - ex[1] * m);
      if (P.flip) ctx.scale(1, -1);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(P.img, P.off, -P.img.height * P.sc / 2, P.img.width * P.sc, P.img.height * P.sc);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  // 바닥: 가로 띠마다 (띠 안을 다시 몇 칸으로 나눠) 아핀 변환으로 그림. 칸 크기는 원근 오차가 0.6px 이하가 되게 (지평선 가까울수록 잘게)
  function drawFloor(ctx) {
    const hz = C.cy - C.f * Math.tan(C.pitch), hzD = hz * RES, top = Math.max(0, Math.ceil(hzD + 1));
    let y1 = H * RES;
    while (y1 > top) {
      const h = clamp(Math.round((y1 - hzD) * 0.03), 1, 12), y0 = Math.max(top, y1 - h);
      band(ctx, y0, y1, hz); y1 = y0;
    }
  }
  function band(ctx, y0, y1, hz) {
    const l0 = y0 / RES, l1 = y1 / RES, ym = (l0 + l1) / 2;
    const L = ground(0, ym), Rr = ground(W, ym); if (!L || !Rr || ground(C.cx, l0) === null || ground(C.cx, l0)[2] > 1400) return;
    const hx = [(Rr[0] - L[0]) / W, (Rr[1] - L[1]) / W], k = RES / FR;
    const n = clamp(Math.ceil(W * (l1 - l0) / (1.2 * Math.max(0.5, ym - hz))), 1, 16), cw = W / n;
    let clipped = false;
    for (let i = 0; i < n; i++) {
      const xa = i * cw, xb = xa + cw, xc = xa + cw / 2;
      const c4 = [ground(xa, l0), ground(xb, l0), ground(xa, l1), ground(xb, l1)], T = ground(xc, l0), Bt = ground(xc, l1), O = ground(xc, ym);
      if (c4.some(p => !p) || !T || !Bt || !O) continue;
      if (S.wrap) { const sx = -Math.floor((O[0] - AR.x) / AR.w) * AR.w, sy = -Math.floor((O[1] - AR.y) / AR.h) * AR.h; // 뱀꼬리 맵: 바닥을 경기장 크기로 반복 (끝없는 맵처럼)
        if (sx || sy) { for (const p of c4) { p[0] += sx; p[1] += sy; } O[0] += sx; O[1] += sy; } }
      let u0 = 1e9, v0 = 1e9, u1 = -1e9, v1 = -1e9;
      for (const p of c4) { const u = (p[0] - TX.x) * FR, v = (p[1] - TX.y) * FR; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      u0 = Math.max(0, Math.floor(u0) - 1); v0 = Math.max(0, Math.floor(v0) - 1); u1 = Math.min(tex.width, Math.ceil(u1) + 1); v1 = Math.min(tex.height, Math.ceil(v1) + 1);
      if (u1 <= u0 || v1 <= v0) continue;
      const vy = [(Bt[0] - T[0]) / (l1 - l0), (Bt[1] - T[1]) / (l1 - l0)], det = hx[0] * vy[1] - vy[0] * hx[1]; if (!det) continue;
      const i00 = vy[1] / det, i01 = -vy[0] / det, i10 = -hx[1] / det, i11 = hx[0] / det, ox = TX.x - O[0], oy = TX.y - O[1];
      if (!clipped) { clipped = true; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(0, y0, W * RES, y1 - y0); ctx.clip(); }
      ctx.setTransform(i00 * k, i10 * k, i01 * k, i11 * k, RES * (i00 * ox + i01 * oy + xc), RES * (i10 * ox + i11 * oy + ym));
      ctx.drawImage(tex, u0, v0, u1 - u0, v1 - v0, u0, v0, u1 - u0, v1 - v0);
    }
    if (clipped) ctx.restore();
  }
  // ---------- 스테이지별 하늘(천장)·외곽 벽 (화면 전용, 스테이지마다 오프스크린 캔버스에 한 번만 그려 캐시) ----------
  const hh1 = n => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); }; // 결정적 해시 (시뮬 난수 안 씀)
  const ENV = { // sky: 파노라마 종류, wall: 외곽 벽 무늬(null = 벽 없음), wh: 벽 높이, ground: 경기장 밖 바닥색, fog: 지평선 안개색
    arena: { sky: 'dusk', wall: 'stone', wh: 50, ground: '#2a2420', fog: '120,90,110' },
    island: { sky: 'day', wall: null, ground: '#2a7ab0', fog: '170,210,235' },
    city: { sky: 'city', wall: 'concrete', wh: 44, ground: '#3a3a40', fog: '150,170,190' },
    ballInterior: { sky: 'capsule', wall: 'capsule', wh: 58, ground: '#202024', fog: '60,30,34' },
    ballPit: { sky: 'play', wall: 'padded', wh: 50, ground: '#d8d0e8', fog: '230,220,240' },
    iceCave: { sky: 'cave', wall: 'ice', wh: 50, ground: '#0e1824', fog: '20,40,60' },
    trampoline: { sky: 'gym', wall: 'gymmat', wh: 52, ground: '#30343c', fog: '60,66,80' },
    race: { sky: 'day', wall: 'tire', wh: 26, ground: '#3a6a2a', fog: '170,210,235' },
    tower: { sky: 'high', wall: 'glass', wh: 32, ground: '#7a96b4', fog: '190,215,235' },
    street: { sky: 'night', wall: 'brick', wh: 64, ground: '#1a1a20', fog: '30,30,50' },
    subway: { sky: 'tunnel', wall: 'tile', wh: 72, ground: '#141418', fog: '20,20,24' },
    idol: { sky: 'concert', wall: 'curtain', wh: 72, ground: '#0a0810', fog: '30,10,40' },
    diving: { sky: 'day', wall: 'pooltile', wh: 38, ground: '#cfd8e0', fog: '190,225,245' },
    soccer: { sky: 'stadium', wall: 'adboard', wh: 26, ground: '#2a6a2a', fog: '150,190,220' },
    fastfood: { sky: 'diner', wall: 'interior', wh: 81, ground: '#2a2026', fog: '80,50,40' },
    claw: { sky: 'arcade', wall: 'glasscase', wh: 58, ground: '#1a1028', fog: '50,20,70' },
    bey: { sky: 'arenaNight', wall: 'steel', wh: 35, ground: '#101418', fog: '30,34,50' },
    bbq: { sky: 'evening', wall: 'iron', wh: 23, ground: '#3a2a20', fog: '200,120,90' },
    classroom: { sky: 'classroom', wall: 'classwall', wh: 87, ground: '#3a2e22', fog: '120,110,90' },
    snake: { sky: 'night', wall: null, ground: '#14121c', fog: '20,18,28' },
    baseball: { sky: 'stadium', wall: null, ground: '#232634', fog: '150,190,220' }, // 펜스·관중석·백스톱은 drawBsbWalls
  };
  const envOf = b => ENV[b.stageId] || ENV.arena;
  const skyC = {}, wallC = {};
  const PW = 1024, PHh = 256; // 파노라마 (360도 = PW 픽셀, 아래 끝 = 지평선)
  function grad(x, stops) { const g = x.createLinearGradient(0, 0, 0, PHh); stops.forEach(([t, c]) => g.addColorStop(t, c)); x.fillStyle = g; x.fillRect(0, 0, PW, PHh); }
  function lightsRows(x, col, glow) { // 실내 천장: 지평선 쪽일수록 작고 촘촘한 조명 줄 (원근 흉내)
    for (let r = 0; r < 5; r++) { const y = 30 + r * r * 9 + r * 18, sz = 1 - r * 0.17, gap = 64 * sz;
      for (let i = 0; i * gap < PW; i++) { const lx = i * gap + (r % 2) * gap / 2; x.fillStyle = glow; x.fillRect(lx - 14 * sz, y - 4 * sz, 28 * sz + 8, 8 * sz + 6); x.fillStyle = col; x.fillRect(lx - 10 * sz, y - 2 * sz, 20 * sz + 4, 4 * sz + 2); } }
  }
  function skyline(x, base, win, hmax) { for (let i = 0, px = 0; px < PW; i++) { const w = 18 + hh1(i) * 30, h = 20 + hh1(i + 50) * hmax; x.fillStyle = base; x.fillRect(px, PHh - h, w, h);
    if (win) for (let wy = PHh - h + 5; wy < PHh - 4; wy += 7) for (let wx = px + 3; wx < px + w - 3; wx += 6) if (hh1(i * 31 + wx * 7 + wy) > 0.55) { x.fillStyle = win; x.fillRect(wx, wy, 2, 3); }
    px += w + 1; } }
  function clouds(x, col, n, y0, y1) { for (let i = 0; i < n; i++) { const cx = hh1(i + 3) * PW, cy = y0 + hh1(i + 7) * (y1 - y0), r = 10 + hh1(i + 11) * 18; x.fillStyle = col;
    for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(cx + (k - 2) * r * 0.7, cy + Math.abs(k - 2) * 2, r * (1 - Math.abs(k - 2) * 0.18), r * 0.45, 0, 0, TAU); x.fill(); } } }
  function stars(x, n, y1) { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(255,255,255,${0.3 + hh1(i + 5) * 0.6})`; x.fillRect(hh1(i) * PW, hh1(i + 99) * y1, 1.5, 1.5); } }
  function mountains(x, col, amp, base) { x.fillStyle = col; x.beginPath(); x.moveTo(0, PHh); for (let px = 0; px <= PW; px += 16) x.lineTo(px, PHh - base - amp * (0.5 + 0.5 * Math.sin(px / PW * TAU * 3 + 1) * Math.sin(px / PW * TAU * 7)) - hh1(px) * 6); x.lineTo(PW, PHh); x.fill(); }
  function makeSky(k) {
    const c = document.createElement('canvas'); c.width = PW; c.height = PHh; const x = c.getContext('2d');
    switch (k) {
      case 'dusk': grad(x, [[0, '#1c1838'], [0.55, '#6a3c6a'], [0.85, '#e0805a'], [1, '#f0b070']]); stars(x, 60, 90);
        x.fillStyle = 'rgba(255,220,150,0.9)'; x.beginPath(); x.arc(300, PHh - 18, 16, 0, TAU); x.fill(); mountains(x, '#3a2440', 40, 6); mountains(x, '#2a1a30', 22, 0); break;
      case 'day': grad(x, [[0, '#3a7ad0'], [0.7, '#8cc4f0'], [1, '#d8eefa']]); x.fillStyle = 'rgba(255,250,220,0.95)'; x.beginPath(); x.arc(700, 70, 14, 0, TAU); x.fill(); clouds(x, 'rgba(255,255,255,0.85)', 14, 60, 210); break;
      case 'city': grad(x, [[0, '#4a86d0'], [0.75, '#a8d0f0'], [1, '#e0eef8']]); clouds(x, 'rgba(255,255,255,0.8)', 8, 40, 140); skyline(x, '#7a8aa0', null, 60); skyline(x, '#5a6a80', 'rgba(255,240,180,0.5)', 36); break;
      case 'night': grad(x, [[0, '#060814'], [0.7, '#141a34'], [1, '#2a2a4a']]); stars(x, 160, 200); x.fillStyle = '#f0f0d8'; x.beginPath(); x.arc(200, 60, 10, 0, TAU); x.fill(); skyline(x, '#0c0e1a', '#ffd870', 70); break;
      case 'evening': grad(x, [[0, '#2a2050'], [0.5, '#8a4a7a'], [0.85, '#f08a50'], [1, '#ffc070']]); x.fillStyle = 'rgba(255,200,120,0.95)'; x.beginPath(); x.arc(520, PHh - 10, 22, 0, TAU); x.fill(); clouds(x, 'rgba(255,160,140,0.45)', 8, 80, 200); mountains(x, '#3a2a3a', 26, 0); break;
      case 'high': grad(x, [[0, '#2a6ac8'], [0.75, '#9ad0f4'], [1, '#f0f8ff']]); x.fillStyle = 'rgba(255,250,220,0.95)'; x.beginPath(); x.arc(400, 50, 14, 0, TAU); x.fill(); clouds(x, 'rgba(255,255,255,0.95)', 40, PHh - 30, PHh - 4); break;
      case 'stadium': grad(x, [[0, '#3a7ad0'], [0.75, '#9ccaf0'], [1, '#d8eefa']]); clouds(x, 'rgba(255,255,255,0.8)', 8, 40, 120);
        x.fillStyle = '#3a4250'; x.fillRect(0, PHh - 46, PW, 46); for (let i = 0; i < 1400; i++) { x.fillStyle = ['#e85a5a', '#5a8ae8', '#f0e070', '#f0f0f0', '#5ac87a'][i % 5]; x.fillRect(hh1(i) * PW, PHh - 44 + hh1(i + 7) * 40, 2, 2); }
        for (let i = 0; i < 4; i++) { const tx = 128 + i * 256; x.fillStyle = '#5a6270'; x.fillRect(tx - 2, PHh - 110, 4, 64); x.fillStyle = '#fffbe0'; x.fillRect(tx - 14, PHh - 118, 28, 10); } break;
      case 'arenaNight': grad(x, [[0, '#04060c'], [0.8, '#101828'], [1, '#202a40']]); x.fillStyle = '#1a2030'; x.fillRect(0, PHh - 40, PW, 40);
        for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(200,210,255,${0.2 + hh1(i) * 0.4})`; x.fillRect(hh1(i + 1) * PW, PHh - 38 + hh1(i + 2) * 36, 2, 2); }
        for (let i = 0; i < 6; i++) { const tx = 85 + i * 170, g = x.createLinearGradient(0, 40, 0, PHh); g.addColorStop(0, 'rgba(255,250,220,0.35)'); g.addColorStop(1, 'rgba(255,250,220,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(tx - 6, 40); x.lineTo(tx + 6, 40); x.lineTo(tx + 50, PHh); x.lineTo(tx - 50, PHh); x.fill(); x.fillStyle = '#fffbe0'; x.fillRect(tx - 10, 36, 20, 6); } break;
      case 'concert': grad(x, [[0, '#020104'], [0.8, '#120a1c'], [1, '#2a1030']]);
        for (let i = 0; i < 10; i++) { const tx = 50 + i * 102, col = ['255,120,220', '120,200,255', '255,230,120', '170,120,255'][i % 4], g = x.createLinearGradient(0, 0, 0, PHh); g.addColorStop(0, `rgba(${col},0.5)`); g.addColorStop(1, `rgba(${col},0)`);
          x.fillStyle = g; x.beginPath(); x.moveTo(tx - 4, 0); x.lineTo(tx + 4, 0); x.lineTo(tx + 40 + (i % 3 - 1) * 40, PHh); x.lineTo(tx - 40 + (i % 3 - 1) * 40, PHh); x.fill(); }
        x.fillStyle = '#1a1420'; x.fillRect(0, 0, PW, 14); for (let i = 0; i < PW; i += 32) { x.fillStyle = '#ffe9a0'; x.fillRect(i + 12, 12, 8, 4); } break;
      case 'cave': grad(x, [[0, '#04080e'], [0.7, '#0e1a2a'], [1, '#1c3048']]);
        for (let i = 0; i < 90; i++) { const ix = hh1(i) * PW, il = 10 + hh1(i + 3) * 50, iw = 3 + hh1(i + 5) * 6; x.fillStyle = `rgba(170,220,250,${0.25 + hh1(i + 9) * 0.35})`; x.beginPath(); x.moveTo(ix - iw, 0); x.lineTo(ix + iw, 0); x.lineTo(ix, il); x.fill(); }
        for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(120,200,255,0.5)'; x.fillRect(hh1(i + 40) * PW, 60 + hh1(i + 41) * 150, 2, 2); } mountains(x, '#0a141f', 30, 0); break;
      case 'capsule': grad(x, [[0, '#c83a3a'], [0.45, '#a82a2a'], [0.5, '#1a1a1e'], [0.56, '#e8e8ec'], [1, '#b8b8c0']]); lightsRows(x, '#fff8e8', 'rgba(255,240,200,0.25)'); break;
      case 'play': grad(x, [[0, '#f0e0f8'], [1, '#c8e0f8']]); lightsRows(x, '#ffffff', 'rgba(255,255,200,0.35)');
        for (let i = 0; i < 40; i++) { x.fillStyle = ['#ff7a8a', '#7ac8ff', '#ffe07a', '#8aff9a'][i % 4]; x.beginPath(); x.moveTo(i * 26, 0); x.lineTo(i * 26 + 26, 0); x.lineTo(i * 26 + 13, 22); x.fill(); } break; // 깃발 장식
      case 'gym': grad(x, [[0, '#2a2e36'], [1, '#5a606c']]); for (let i = 0; i < PW; i += 40) { x.fillStyle = '#3a4048'; x.fillRect(i, 0, 3, PHh); } lightsRows(x, '#f8fbff', 'rgba(220,235,255,0.3)'); break;
      case 'tunnel': grad(x, [[0, '#08080a'], [0.8, '#1a1a20'], [1, '#2a2a30']]); for (let i = 0; i < PW; i += 48) { x.fillStyle = '#121216'; x.fillRect(i, 0, 6, PHh); } lightsRows(x, '#fff0c8', 'rgba(255,230,170,0.22)'); break;
      case 'diner': grad(x, [[0, '#3a2a24'], [1, '#7a5a44']]); lightsRows(x, '#fff0c0', 'rgba(255,220,150,0.3)'); x.fillStyle = '#c83a30'; x.fillRect(0, PHh - 12, PW, 12); x.fillStyle = '#ffd23a'; for (let i = 0; i < PW; i += 20) x.fillRect(i, PHh - 7, 10, 2); break;
      case 'arcade': grad(x, [[0, '#0a0614'], [1, '#2a1440']]); for (let i = 0; i < 12; i++) { x.strokeStyle = ['#ff4ad0', '#4ae0ff', '#ffe04a'][i % 3]; x.lineWidth = 3; x.globalAlpha = 0.7; x.beginPath(); x.moveTo(i * 86, 30 + (i % 3) * 30); x.lineTo(i * 86 + 60, 30 + (i % 3) * 30); x.stroke(); }
        x.globalAlpha = 1; for (let i = 0; i < 20; i++) { const ax = i * 52; x.fillStyle = '#1a1028'; x.fillRect(ax, PHh - 60, 40, 60); x.fillStyle = ['#ff4ad0', '#4ae0ff', '#ffe04a', '#8aff6a'][i % 4]; x.globalAlpha = 0.6; x.fillRect(ax + 6, PHh - 54, 28, 20); x.globalAlpha = 1; } break; // 오락기 줄
      case 'classroom': grad(x, [[0, '#d8d2c0'], [1, '#ece6d4']]); lightsRows(x, '#ffffff', 'rgba(255,255,240,0.5)'); break;
      default: grad(x, [[0, '#0b0c14'], [1, '#2a2e42']]);
    }
    return c;
  }
  function drawSky(ctx, b, hz) {
    const E = envOf(b), pano = skyC[E.sky] || (skyC[E.sky] = makeSky(E.sky));
    const k = C.f / (PW / TAU), tw = PW * k, th = PHh * k, phF = Math.atan2(C.F[1], C.F[0]), s = (C.F[0] * C.R[1] - C.F[1] * C.R[0]) > 0 ? 1 : -1;
    ctx.save(); ctx.fillStyle = sampleTop(pano, E.sky); ctx.fillRect(0, 0, W, Math.max(0, hz - th + 1));
    ctx.translate(C.cx, 0); ctx.scale(s, 1); ctx.imageSmoothingEnabled = true;
    let x0 = -phF * C.f; x0 = ((x0 % tw) + tw) % tw - tw; while (x0 > -W) x0 -= tw;
    for (let x = x0; x < W; x += tw) ctx.drawImage(pano, x, hz - th, tw, th);
    ctx.restore();
  }
  const TOPC = { dusk: '#1c1838', day: '#3a7ad0', city: '#4a86d0', night: '#060814', evening: '#2a2050', high: '#2a6ac8', stadium: '#3a7ad0', arenaNight: '#04060c', concert: '#020104', cave: '#04080e', capsule: '#c83a3a', play: '#f0e0f8', gym: '#2a2e36', tunnel: '#08080a', diner: '#3a2a24', arcade: '#0a0614', classroom: '#d8d2c0' };
  function sampleTop(p, k) { return TOPC[k] || '#0b0c14'; }
  // 외곽 벽 무늬: 64 단위 폭 반복 조각 (TR 배율)
  const TW = 64;
  function makeWall(kind, h) {
    const c = document.createElement('canvas'); c.width = TW * TR; c.height = Math.ceil(h * TR); const x = c.getContext('2d'); x.scale(TR, TR);
    const R = (col, a, b2, w, hh) => { x.fillStyle = col; x.fillRect(a, b2, w, hh); };
    switch (kind) {
      case 'stone': R('#5a5450', 0, 0, TW, h); for (let r = 0; r * 8 < h; r++) for (let i = -1; i < 5; i++) { const bx = i * 16 + (r % 2) * 8; R(hh1(r * 9 + i) > 0.5 ? '#6a645e' : '#625c56', bx + 1, r * 8 + 1, 14, 6); } R('#7a746c', 0, 0, TW, 3); break;
      case 'concrete': R('#8a8a90', 0, 0, TW, h); R('#9a9aa0', 0, 0, TW, 3); R('#6a6a70', 31, 0, 2, h); R('rgba(255,90,140,0.6)', 8, h * 0.4, 18, 5); R('rgba(90,200,255,0.5)', 40, h * 0.55, 14, 4); R('#e8c840', 0, h - 5, TW, 3); break;
      case 'capsule': R('#e8e8ec', 0, 0, TW, h); R('#c83a3a', 0, 0, TW, h * 0.45); R('#1a1a1e', 0, h * 0.45, TW, 4); x.fillStyle = '#f8f8fa'; x.beginPath(); x.arc(32, h * 0.45 + 2, 6, 0, TAU); x.fill(); R('#9a9aa2', 0, h - 3, TW, 3); break;
      case 'padded': for (let i = 0; i < 4; i++) { R(['#ff7a8a', '#7ac8ff', '#ffe07a', '#8ae89a'][i], i * 16, 0, 16, h); R('rgba(255,255,255,0.35)', i * 16 + 2, 2, 3, h - 4); R('rgba(0,0,0,0.12)', i * 16 + 15, 0, 1, h); } break;
      case 'gymmat': R('#2a5aa8', 0, 0, TW, h); for (let i = 0; i < 4; i++) R('#24508f', i * 16 + 15, 0, 1, h); R('#e8e8e8', 0, h * 0.5, TW, 2); R('#1a3a70', 0, h - 4, TW, 4); break;
      case 'tire': for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#e83a3a' : '#f0f0f0'; x.fillRect(i * 16, 0, 16, h); x.fillStyle = '#1a1a1a'; for (let r = 0; r * 6 < h; r++) { x.beginPath(); x.ellipse(i * 16 + 8, r * 6 + 3, 7, 2.6, 0, 0, TAU); x.fill(); } } break;
      case 'glass': R('rgba(170,220,250,0.35)', 0, 0, TW, h); R('#c8d0d8', 0, 0, TW, 3); R('#8a929a', 0, 0, 3, h); R('#8a929a', 32, 0, 3, h); R('rgba(255,255,255,0.5)', 8, 5, 2, h - 8); break;
      case 'brick': R('#5a2a22', 0, 0, TW, h); for (let r = 0; r * 6 < h; r++) for (let i = -1; i < 6; i++) R(hh1(r * 7 + i) > 0.5 ? '#8a3a2e' : '#7a3428', i * 12 + (r % 2) * 6 + 1, r * 6 + 1, 10, 4); R('rgba(120,255,200,0.55)', 10, h * 0.35, 20, 3); R('rgba(255,120,220,0.5)', 36, h * 0.5, 16, 3); break; // 낙서
      case 'tile': R('#e8ecee', 0, 0, TW, h); for (let r = 0; r * 6 < h; r++) R('rgba(0,0,0,0.08)', 0, r * 6, TW, 1); for (let i = 0; i < TW; i += 8) R('rgba(0,0,0,0.06)', i, 0, 1, h); R('#2f7ad0', 0, h * 0.3, TW, 6); R('#e8c840', 0, h * 0.3 + 6, TW, 2); R('#3a3a40', 0, h - 4, TW, 4); break;
      case 'curtain': R('#1a0a20', 0, 0, TW, h); for (let i = 0; i < TW; i += 8) { const g = x.createLinearGradient(i, 0, i + 8, 0); g.addColorStop(0, '#2a0e30'); g.addColorStop(0.5, '#4a1a50'); g.addColorStop(1, '#2a0e30'); x.fillStyle = g; x.fillRect(i, 0, 8, h); } R('#1a1a1e', 20, h - 22, 24, 22); R('#3a3a40', 26, h - 18, 12, 12); R('#ffd86a', 0, 0, TW, 2); break; // 커튼 + 스피커
      case 'pooltile': R('#f2f4f6', 0, 0, TW, h); for (let r = 0; r * 8 < h; r++) for (let i = 0; i < 8; i++) if ((r + i) % 2) R('#dce6ee', i * 8, r * 8, 8, 8); R('#2a7ab8', 0, h - 6, TW, 3); R('#3ea2d2', 0, 2, TW, 2); break;
      case 'adboard': R('#1a1a24', 0, 0, TW, h); { const col = ['#e83a3a', '#3a8ae8', '#f0c83a', '#3ac87a'][0]; R(col, 2, 2, 28, h - 4); R('#3a8ae8', 34, 2, 28, h - 4); R('rgba(255,255,255,0.85)', 8, h / 2 - 1, 16, 2); R('rgba(255,255,255,0.85)', 40, h / 2 - 1, 16, 2); } break;
      case 'interior': R('#f0e6d0', 0, 0, TW, h); R('#c83a30', 0, h - 14, TW, 10); R('#ffd23a', 0, h - 15, TW, 1); R('#8fd0f0', 10, 8, 44, h * 0.45); R('#e8e2d0', 31, 8, 2, h * 0.45); R('rgba(255,255,255,0.5)', 14, 10, 3, h * 0.4); R('#5a4a3a', 0, h - 4, TW, 4); break;
      case 'glasscase': R('rgba(180,220,255,0.18)', 0, 0, TW, h); R('#c8a0f0', 0, 0, TW, 3); R('#8a60c0', 0, h - 4, TW, 4); R('#8a60c0', 0, 0, 3, h); R('rgba(255,255,255,0.45)', 10, 6, 2, h - 12); R('rgba(255,255,255,0.3)', 16, 6, 1, h - 12); break;
      case 'steel': R('#3a4250', 0, 0, TW, h); R('#5a6474', 0, 0, TW, 3); for (let i = 0; i < TW; i += 16) { R('#2a3240', i, 0, 2, h); R('#8a94a4', i + 6, h * 0.5, 3, 3); } R('#ffd23a', 0, h - 4, TW, 2); break;
      case 'iron': R('#2a2624', 0, 0, TW, h); R('#4a4440', 0, 0, TW, 2); for (let i = 0; i < TW; i += 8) R('#1a1614', i, 0, 2, h); R('rgba(255,120,40,0.35)', 0, h - 4, TW, 4); break;
      case 'classwall': R('#d9d2b8', 0, 0, TW, h); R('#8a6a44', 0, h - 8, TW, 8); R('#a9c8e6', 12, 10, 40, 28); R('#e8e2d0', 31, 10, 2, 28); R('#e8e2d0', 12, 23, 40, 2); R('rgba(255,255,255,0.5)', 15, 12, 3, 24); R('#7d8c9a', 0, h - 18, TW, 10); break; // 창문 + 사물함
      case 'fence': R('#1d4a2e', 0, 0, TW, h); R('#ffd23a', 0, 0, TW, 2); for (let i = 0; i < TW; i += 16) R('#173c25', i, 2, 1, h - 2); R('rgba(255,255,255,0.6)', 20, h * 0.45, 22, 3); R('#0e2416', 0, h - 3, TW, 3); break; // 외야 펜스 (노란 윗선)
      case 'crowd': R('#2a2e40', 0, 0, TW, h); for (let r = 0; r * 7 < h - 6; r++) { R('#20232f', 0, r * 7 + 5, TW, 2); for (let i = 0; i < TW; i += 5) { const v = hh1(r * 31 + i); if (v < 0.75) R(['#d86a6a', '#6aa8ff', '#f0d070', '#e8e8f0', '#8ad08a', '#c88ad8', '#f0a060'][Math.floor(v * 9.3) % 7], i + 1, r * 7 + 1, 3, 4); } } R('#4a5068', 0, h - 4, TW, 4); break; // 관중석 (계단식 줄 + 관중)
      default: R('#2f3447', 0, 0, TW, h);
    }
    return c;
  }
  function drawEnvWalls(ctx, b) {
    const E = envOf(b); if (!E.wall) return;
    const h = E.wh || CAM.wallH, key = E.wall + h, tex = wallC[key] || (wallC[key] = makeWall(E.wall, h));
    const x0 = AR.x, y0 = AR.y, x1 = AR.x + AR.w, y1 = AR.y + AR.h;
    const sides = [[[x0, y0], [x1, y0], C.y > y0], [[x1, y0], [x1, y1], C.x < x1], [[x1, y1], [x0, y1], C.y < y1], [[x0, y1], [x0, y0], C.x > x0]];
    const gap = b.sub && b.sub.S && b.sub.S.train ? [b.sub.S.train.y - 8, b.sub.S.train.y + b.sub.S.train.h + 8] : null; // 지하철: 선로가 지나는 좌우 벽은 터널 입구(스테이지 훅이 세움)
    for (const [a, c, vis] of sides) if (vis) {
      const ex = /glass/.test(E.wall) ? 0.15 : 0.45;
      if (gap && a[0] === c[0]) { const dir = Math.sign(c[1] - a[1]), g0 = dir > 0 ? gap[0] : gap[1], g1 = dir > 0 ? gap[1] : gap[0]; texWall(ctx, a[0], a[1], a[0], g0, h, tex, 16, 1, ex); texWall(ctx, a[0], g1, c[0], c[1], h, tex, 16, 1, ex); }
      else texWall(ctx, a[0], a[1], c[0], c[1], h, tex, 16, 1, ex);
    }
  }
  // 고정 세로 벽: 두 바닥 끝점 + 높이. 길이 방향 조각마다 아래 두 점·위 한 점으로 아핀, 카메라 바로 앞(near 근처) 조각은 건너뜀 (번져 보이는 것 방지)
  function texWall(ctx, ax0, ay0, bx0, by0, h, tex, seg, alpha = 1, ex = 0.45) { // seg 단위 조각 (무늬 폭 TW 의 약수 → 조각이 무늬 경계를 넘지 않음)
    const L = Math.hypot(bx0 - ax0, by0 - ay0); if (L < 1) return;
    const N = Math.ceil(L / seg), sh = h * TR, P = d => [ax0 + (bx0 - ax0) * d / L, ay0 + (by0 - ay0) * d / L];
    if (alpha < 1) ctx.globalAlpha = alpha;
    let pb = null, pt = null;
    for (let k = 0; k <= N; k++) {
      const d = Math.min(L, k * seg), [x, y] = P(d), ok = cam(x, y, 0)[2] >= CAM.near + 8, qb = ok ? proj(x, y, 0) : null, qt = ok ? proj(x, y, h) : null;
      if (k > 0 && pb && pt && qb && qt) { const s0 = (((k - 1) * seg) % TW) * TR; texQuad(ctx, tex, s0, s0 + (d - (k - 1) * seg) * TR, sh, pb, qb, pt, qt, ex); }
      pb = qb; pt = qt;
    }
    if (alpha < 1) ctx.globalAlpha = 1;
  }
  // 얼음 동굴: 시뮬의 얼음벽 구간(b.iceSegs: hp·hitT·dead)을 그대로 비춤. 금 = 깎인 hp, 부딪힘 = 작은 얼음 조각, hp 0 = 구간이 산산조각 → 크레바스(시뮬대로 영구)
  const iceVis = new WeakMap(), hsh = (a, k) => { const v = Math.sin(a * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); }; // 화면 전용 해시 (시뮬 난수 안 씀)
  function iceSegPts(sg) { const x0 = AR.x, y0 = AR.y, x1 = AR.x + AR.w, y1 = AR.y + AR.h;
    return sg.side === 'top' ? [[sg.a0, y0], [sg.a1, y0], [0, 1]] : sg.side === 'bottom' ? [[sg.a0, y1], [sg.a1, y1], [0, -1]] : sg.side === 'left' ? [[x0, sg.a0], [x0, sg.a1], [1, 0]] : [[x1, sg.a0], [x1, sg.a1], [-1, 0]]; }
  function drawIceWalls3(ctx, b) {
    const h = CAM.wallH, T = b.time, shards = [];
    for (const sg of b.iceSegs) {
      const [A, B2, N] = iceSegPts(sg), vis = (C.x - A[0]) * N[0] + (C.y - A[1]) * N[1] > 0;
      let st = iceVis.get(sg); if (!st) iceVis.set(sg, st = { hitT: sg.hitT, hits: [], deadT: sg.dead ? -9 : null });
      if (sg.hitT !== st.hitT) { st.hitT = sg.hitT; let bu = null, bd = 1e9; // 부딪힌 자리: 그 벽에 가장 가까운 캐릭터 위치
        for (const u of b.u) { const t = clamp(((u.x - A[0]) * (B2[0] - A[0]) + (u.y - A[1]) * (B2[1] - A[1])) / ((B2[0] - A[0]) ** 2 + (B2[1] - A[1]) ** 2), 0, 1), d = Math.hypot(u.x - (A[0] + (B2[0] - A[0]) * t), u.y - (A[1] + (B2[1] - A[1]) * t)); if (d < bd) { bd = d; bu = t; } }
        st.hits.push({ t0: T, at: bu ?? 0.5, k: st.hits.length }); }
      if (sg.dead && st.deadT === null) st.deadT = T;
      st.hits = st.hits.filter(q => T - q.t0 < 0.6);
      const P = t => [A[0] + (B2[0] - A[0]) * t, A[1] + (B2[1] - A[1]) * t];
      for (const q of st.hits) for (let i = 0; i < 6; i++) shards.push([P(clamp(q.at + (hsh(sg.seed + q.k, i) - 0.5) * 0.3, 0, 1)), N, h * (0.25 + 0.5 * hsh(sg.seed, i + 9)), T - q.t0, sg.seed * 3 + q.k * 7 + i, 0.6]);
      if (sg.dead) { const dt = T - st.deadT; if (st.deadT > -9 && dt < 1.1) for (let i = 0; i < 18; i++) shards.push([P(hsh(sg.seed, i + 40)), N, h * hsh(sg.seed, i + 60), dt, sg.seed * 5 + i, 1.1]); continue; }
      if (!vis) continue;
      const fl = T - sg.hitT < 0.25 ? 1 - (T - sg.hitT) / 0.25 : 0, jit = fl * 1.2;
      const q4 = [[A[0], A[1], 0], [B2[0], B2[1], 0], [B2[0], B2[1], h + jit], [A[0], A[1], h - jit]];
      if (poly(ctx, q4)) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgba(${200 + 55 * fl},240,255,0.62)`); g.addColorStop(1, 'rgba(110,180,225,0.5)'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(225,248,255,0.55)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; // 서리 줄무늬 (기울어진 반사광)
      for (let i = 0; i < 3; i++) { const t = 0.15 + 0.3 * i + 0.1 * hsh(sg.seed, i), [ax, ay] = P(t), [bx, by] = P(Math.min(1, t + 0.12)), p = proj(ax, ay, h * 0.2), q = proj(bx, by, h * 0.85); if (p && q) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
      const tp = proj(A[0], A[1], h), tq = proj(B2[0], B2[1], h); if (tp && tq) { ctx.strokeStyle = '#eafaff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(tq.x, tq.y); ctx.stroke(); }
      const cs = sg.maxHp - sg.hp; ctx.strokeStyle = 'rgba(30,70,110,0.85)'; ctx.lineWidth = 1.2; // 금 (깎인 hp 만큼)
      for (let k = 0; k < cs; k++) { ctx.beginPath(); let t = 0.2 + 0.2 * k + 0.08 * hsh(sg.seed, k + 20), z = h * (0.85 - 0.1 * hsh(sg.seed, k)); let p0 = proj(...P(t), z); if (!p0) continue; ctx.moveTo(p0.x, p0.y);
        for (let j = 0; j < 4; j++) { t += (hsh(sg.seed, k * 5 + j) - 0.5) * 0.12; z -= h * 0.2; const p = proj(...P(clamp(t, 0, 1)), Math.max(0, z)); if (p) ctx.lineTo(p.x, p.y); } ctx.stroke(); }
    }
    for (const [pt, N, z0, dt, sd, life] of shards) { // 얼음 조각: 경기장 안쪽으로 튀고 떨어짐 (화면 전용)
      const sp = 30 + 50 * hsh(sd, 1), side = (hsh(sd, 2) - 0.5) * 30, x = pt[0] + N[0] * sp * dt + N[1] * side * dt, y = pt[1] + N[1] * sp * dt + N[0] * side * dt, z = z0 + 40 * dt - 160 * dt * dt;
      if (z < 0) continue; const p = proj(x, y, z); if (!p) continue; const r = (2 + 2.5 * hsh(sd, 3)) * p.s * 0.6, a = hsh(sd, 4) * 6 + dt * 8;
      ctx.globalAlpha = clamp(1 - dt / life, 0, 1) * 0.9; ctx.fillStyle = sd % 3 ? '#d8f4ff' : '#9fd0ea';
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); ctx.lineTo(p.x + Math.cos(a + 2.3) * r * 0.7, p.y + Math.sin(a + 2.3) * r * 0.7); ctx.lineTo(p.x + Math.cos(a + 4.1) * r, p.y + Math.sin(a + 4.1) * r); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // 야구장: 관중석 고리(펜스 바깥) · 외야 펜스(구장 원호) · 홈 뒤 백스톱 그물. 펜스 원 안쪽 면만 (카메라는 늘 안쪽)
  function drawBsbWalls(ctx, b) {
    const BS = window.BASEBALL, F = BS.S.fence, Pl = BS.S.play, yB = Pl.y + Pl.h;
    const ring = (r, h, kind, seg, keep) => { const tx = wallC[kind + h] || (wallC[kind + h] = makeWall(kind, h)), N = 64;
      for (let i = 0; i < N; i++) { const a0 = i / N * TAU, a1 = (i + 1) / N * TAU, am = (a0 + a1) / 2, A = [F.cx + Math.cos(a0) * r, F.cy + Math.sin(a0) * r], B2 = [F.cx + Math.cos(a1) * r, F.cy + Math.sin(a1) * r];
        if (keep && !keep(A, B2)) continue;
        if ((C.x - (F.cx + Math.cos(am) * r)) * -Math.cos(am) + (C.y - (F.cy + Math.sin(am) * r)) * -Math.sin(am) <= 0) continue; // 안쪽 면만
        texWall(ctx, A[0], A[1], B2[0], B2[1], h, tx, seg, 1, 0.45); } };
    ring(F.r + 70, 90, 'crowd', 32, null);
    ring(F.r + 4, 20, 'fence', 16, (A, B2) => A[1] < yB - 2 && B2[1] < yB - 2);
    const dx = Math.sqrt(Math.max(0, (F.r + 4) ** 2 - (yB - F.cy) ** 2)), x0 = F.cx - dx, x1 = F.cx + dx, h = 56; // 백스톱 그물
    if (C.y < yB && poly(ctx, [[x0, yB, 0], [x1, yB, 0], [x1, yB, h], [x0, yB, h]])) { ctx.fillStyle = 'rgba(40,46,62,0.35)'; ctx.fill();
      ctx.strokeStyle = 'rgba(200,210,230,0.35)'; ctx.lineWidth = 1; for (let x = x0; x <= x1; x += 12) { const p = proj(x, yB, 0), q = proj(x, yB, h); if (p && q) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
      for (let z = 8; z <= h; z += 12) { const p = proj(x0, yB, z), q = proj(x1, yB, z); if (p && q) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } } }
  }
  function drawWalls(ctx, b) {
    if (b.bsb && b.bsb.on && window.BASEBALL) return drawBsbWalls(ctx, b);
    if (b.iceSegs && b.iceSegs.length) return drawIceWalls3(ctx, b);
    if (ENV[b.stageId]) drawEnvWalls(ctx, b); else drawPlainWalls(ctx, b);
    drawCircleWall(ctx, b);
  }
  function drawPlainWalls(ctx, b) {
    const x0 = AR.x, y0 = AR.y, x1 = AR.x + AR.w, y1 = AR.y + AR.h, h = CAM.wallH;
    const sides = [ // [시작, 끝, 안쪽에서 보이나]
      [[x0, y0], [x1, y0], C.y > y0, '#2f3447'], [[x1, y0], [x1, y1], C.x < x1, '#262a3a'],
      [[x1, y1], [x0, y1], C.y < y1, '#2f3447'], [[x0, y1], [x0, y0], C.x > x0, '#262a3a']];
    for (const [a, c, vis, col] of sides) {
      if (!vis) continue; // 카메라가 벽 바깥이면 그 벽은 그리지 않음 (뒷면)
      if (poly(ctx, [[a[0], a[1], 0], [c[0], c[1], 0], [c[0], c[1], h], [a[0], a[1], h]])) { ctx.fillStyle = col; ctx.fill(); }
      ctx.strokeStyle = 'rgba(120,130,170,0.35)'; ctx.lineWidth = 1;
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.round(L / 24);
      for (let i = 1; i < n; i++) { const k = i / n, x = a[0] + (c[0] - a[0]) * k, y = a[1] + (c[1] - a[1]) * k, p = proj(x, y, 0), q = proj(x, y, h); if (p && q) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
      const p = proj(a[0], a[1], h), q = proj(c[0], c[1], h);
      if (p && q) { ctx.strokeStyle = '#4a5272'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    }
  }
  function drawCircleWall(ctx, b) {
    const CI = b.stage.circle;
    if (CI && !CI.hidden) { // 원형 경기장: 반투명 원형 벽 (안쪽 면만)
      const r = b.circleR(), N = 56, hh = 22;
      ctx.fillStyle = 'rgba(150,210,255,0.22)'; ctx.strokeStyle = 'rgba(200,235,255,0.7)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < N; i++) {
        const a0 = i / N * TAU, a1 = (i + 1) / N * TAU, am = (a0 + a1) / 2, mx = CI.cx + Math.cos(am) * r, my = CI.cy + Math.sin(am) * r;
        if ((C.x - mx) * -Math.cos(am) + (C.y - my) * -Math.sin(am) <= 0) continue;
        const A = [CI.cx + Math.cos(a0) * r, CI.cy + Math.sin(a0) * r], B2 = [CI.cx + Math.cos(a1) * r, CI.cy + Math.sin(a1) * r];
        if (poly(ctx, [[A[0], A[1], 0], [B2[0], B2[1], 0], [B2[0], B2[1], hh], [A[0], A[1], hh]])) ctx.fill();
        const p = proj(A[0], A[1], hh), q = proj(B2[0], B2[1], hh); if (p && q) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      }
    }
  }
  function drawBox(ctx, bl) { // 기본 건물 → 3D 상자 (지붕·보이는 옆면)
    const col = Render.BLD_COL(bl), h = CAM.bldH, x0 = bl.x, y0 = bl.y, x1 = bl.x + bl.w, y1 = bl.y + bl.h, hit = bl.hitT > 0;
    const faces = [[[x0, y0], [x1, y0], C.y < y0, 0.7], [[x1, y0], [x1, y1], C.x > x1, 0.85], [[x1, y1], [x0, y1], C.y > y1, 1], [[x0, y1], [x0, y0], C.x < x0, 0.85]];
    for (const [a, c, vis, k] of faces) {
      if (!vis) continue;
      if (poly(ctx, [[a[0], a[1], 0], [c[0], c[1], 0], [c[0], c[1], h], [a[0], a[1], h]])) { ctx.fillStyle = Sprites.shade(col.wall, hit ? 1.25 : k); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    if (C.z > h && poly(ctx, [[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]])) { ctx.fillStyle = Sprites.shade(col.roof, hit ? 1.3 : 1); ctx.fill(); ctx.strokeStyle = Sprites.shade(col.roof, 1.3); ctx.lineWidth = 1; ctx.stroke(); }
    if (bl.hp < bl.maxHp) { const p = proj((x0 + x1) / 2, (y0 + y1) / 2, h + 8); if (p) hpBar(ctx, p.x, p.y, 26 * clamp(p.s * 0.6, 0.6, 1.4), bl.hp / bl.maxHp, '#d8c8a8'); }
  }

  // ---------- 세운 그림 (캐릭터·소환수) ----------
  const pool = [];
  function billCanvas(i) {
    if (!pool[i]) { const c = document.createElement('canvas'); c.width = BB.w * TR; c.height = BB.h * TR; pool[i] = { c, x: c.getContext('2d') }; }
    return pool[i];
  }
  function look(u, b, isP, dt) { // 보는 방향: 상대·소환수는 카메라 쪽으로 자연스럽게 (지연·감속), 내 캐릭터는 상대 쪽(= 카메라 앞쪽)
    let L = S.looks.get(u);
    const toCam = Math.atan2(C.y - u.y, C.x - u.x), mv = Math.cos(u.dir) * C.R[0] + Math.sin(u.dir) * C.R[1];
    if (!L) { L = { ang: toCam, facing: mv >= 0 ? 1 : -1, back: !!isP }; S.looks.set(u, L); }
    if (isP) {
      const rel = Math.abs(wrap(S.userYaw)); L.back = L.back ? rel < 1.7 : rel < 1.4; // 시점을 크게 돌리면 앞모습
      if (u.moving && Math.abs(mv) > 0.2) L.facing = mv > 0 ? 1 : -1; // 좌우 반전은 화면 기준 진행 방향
      return { back: L.back, facing: L.facing, sq: 1 };
    }
    if (!u.dead && !u.blocked('blocksAct')) { const d = wrap(toCam - L.ang); L.ang = wrap(L.ang + clamp(d * (1 - Math.exp(-4.5 * dt)), -5 * dt, 5 * dt)); } // 칼같이 돌지 않고 따라옴
    const rel = wrap(L.ang - toCam), ar = Math.abs(rel);
    L.back = L.back ? ar > 1.65 : ar > 1.85;
    const side = Math.cos(L.ang) * C.R[0] + Math.sin(L.ang) * C.R[1];
    if (side > 0.12) L.facing = L.back ? -1 : 1; else if (side < -0.12) L.facing = L.back ? 1 : -1;
    else if (u.moving && Math.abs(mv) > 0.5 && ar > 0.5) L.facing = mv > 0 ? 1 : -1;
    return { back: L.back, facing: L.facing, sq: 0.8 + 0.2 * Math.abs(Math.cos(rel)) };
  }
  function renderBill(i, u, b, v) {
    const B = billCanvas(i), x = B.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.clearRect(0, 0, B.c.width, B.c.height);
    x.setTransform(TR, 0, 0, TR, (BB.fx - u.x) * TR, (BB.fy - u.y) * TR); x.imageSmoothingEnabled = false;
    const sv = [u.lookUp, u.facing]; u.lookUp = v.back; u.facing = v.facing; b._topPass = true; b._flatSwing = true; // _topPass: 바닥 그림자·분노 빛은 빼고 그림 (그림자는 바닥에 이미)
    try {
      Render.drawUnit(x, u, b); x.globalAlpha = 1;
      if (!u.dead) { Render.drawBarrier(x, u, b); x.globalAlpha = 1; if (u.counter) Render.drawCounter(x, u, b); Render.drawPips(x, u, b); if (!u.aoHid) Render.drawO2(x, u, u.x + u.kx, u.y + u.ky); }
    } catch (e) { console.warn('[direct] unit draw', e); }
    finally { u.lookUp = sv[0]; u.facing = sv[1]; b._topPass = false; b._flatSwing = false; x.globalAlpha = 1; x.filter = 'none'; }
    return B.c;
  }
  function hpBar(ctx, x, y, w, r, col) {
    ctx.globalAlpha = 0.9; ctx.fillStyle = 'rgba(14,15,24,0.85)'; ctx.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, Math.round(w) + 2, 5);
    ctx.fillStyle = col || (r > 0.5 ? '#6fd38a' : r > 0.2 ? '#f2c94c' : '#ef6b5b'); ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w * clamp(r, 0, 1)), 3); ctx.globalAlpha = 1;
  }

  // ---------- 글자 (피해 숫자 등): 가까운 캐릭터 머리 위 높이로 세움 ----------
  const easeOutQ = t => 1 - Math.pow(1 - t, 3);
  const hex6 = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null; // glowAt 은 #rrggbb 만 받음
  function textAnchor(b, t) {
    let best = null, bd = 50;
    for (const u of b.u) { if (u.hidden) continue; const dx = Math.abs(t.x - u.x), dy = u.y - t.y; if (dy < -6 || dy > 130) continue; if (dx < bd) { bd = dx; best = u; } }
    return best ? [best.x, best.y, Math.max(0, best.y - t.y)] : [t.x, t.y + 30, 30];
  }
  let anchors = new WeakMap();
  function drawTexts(ctx, b) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of b.texts) {
      if (t.bubble) continue;
      let a = anchors.get(t); if (!a) anchors.set(t, a = textAnchor(b, t)); // 처음 본 위치에 고정 (화면 전용, 전투 객체는 안 건드림)
      const p = proj(a[0], a[1], a[2]); if (!p || p.x < -40 || p.x > W + 40) continue;
      const q = t.t / t.dur, pop = q < 0.15 ? 0.7 + (t.impact ? 0.65 : 0.375) * easeOutQ(q / 0.15) : 1, k = clamp(p.s * 0.55, 0.75, 1.5);
      ctx.globalAlpha = q > 0.65 ? 1 - (q - 0.65) / 0.35 : 1;
      ctx.font = `bold ${Math.round(t.size * pop * k)}px "Galmuri11", "Malgun Gothic", sans-serif`;
      const y = p.y - (t.impact ? 26 : 18) * easeOutQ(q) * k, x = p.x + (t.dx || 0) * easeOutQ(q) * k;
      ctx.lineWidth = t.impact ? 4 : 3; ctx.strokeStyle = 'rgba(20,18,30,0.85)'; ctx.strokeText(t.txt, x, y);
      ctx.fillStyle = t.color; ctx.fillText(t.txt, x, y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 스테이지 3D 물체 (풀장 공 · 축구공 골대 · 크레인) ----------
  function line3(ctx, a, c, w, col) { const p = proj(a[0], a[1], a[2]), q = proj(c[0], c[1], c[2]); if (!p || !q) return; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * (p.s + q.s) / 2); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  function drawBall(ctx, bl) { // 풀장 공: 바닥 그림자 + 공중 높이(z)의 구
    const z = bl.z || 0, g = proj(bl.x, bl.y, 0), p = proj(bl.x, bl.y, z + bl.r); if (!p || p.s > 9) return;
    if (g) { ctx.globalAlpha = 0.3 * (1 - Math.min(0.6, z / 60)); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(g.x, g.y, bl.r * g.s, bl.r * 0.4 * g.s, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    const r = bl.r * p.s;
    ctx.fillStyle = Sprites.shade(bl.color, 0.7); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = bl.color; ctx.beginPath(); ctx.arc(p.x - r * 0.09, p.y - r * 0.09, r * 0.83, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(p.x - r * 0.45, p.y - r * 0.45, Math.max(1, r * 0.28), Math.max(1, r * 0.28));
  }
  const GH = 26; // 골대 높이
  function goalItems(b) {
    const S = b.soc && b.soc.S; if (!S) return [];
    const g0 = 180 - S.goalW / 2, g1 = 180 + S.goalW / 2;
    return [[S.top, S.top - S.net, TEAM_COL[0]], [S.bottom, S.bottom + S.net, TEAM_COL[1]]].map(([y0, yb, col]) => ({ z: cam(180, (y0 + yb) / 2, GH / 2)[2], goal: { g0, g1, y0, yb, col } }));
  }
  function drawGoal(ctx, G) { // 골대: 흰 기둥·크로스바 + 반투명 골망 (뒤·옆·지붕)
    const { g0, g1, y0, yb, col } = G;
    ctx.fillStyle = 'rgba(230,236,255,0.16)'; ctx.strokeStyle = 'rgba(235,240,255,0.5)'; ctx.lineWidth = 1;
    for (const f of [[[g0, yb, 0], [g1, yb, 0], [g1, yb, GH], [g0, yb, GH]], [[g0, y0, 0], [g0, yb, 0], [g0, yb, GH], [g0, y0, GH]], [[g1, y0, 0], [g1, yb, 0], [g1, yb, GH], [g1, y0, GH]], [[g0, y0, GH], [g1, y0, GH], [g1, yb, GH], [g0, yb, GH]]])
      if (poly(ctx, f)) { ctx.fill(); ctx.stroke(); }
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(235,240,255,0.35)';
    for (let x = g0 + 6; x < g1; x += 6) { const p = proj(x, yb, 0), q = proj(x, yb, GH); if (p && q) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
    for (let h = 5; h < GH; h += 5) { const p = proj(g0, yb, h), q = proj(g1, yb, h); if (p && q) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
    ctx.lineCap = 'round';
    for (const x of [g0, g1]) line3(ctx, [x, y0, 0], [x, y0, GH], 3, '#f4f6ff');
    line3(ctx, [g0, y0, GH], [g1, y0, GH], 3, '#f4f6ff'); line3(ctx, [g0, y0, GH - 1.5], [g1, y0, GH - 1.5], 1, col);
    ctx.lineCap = 'butt';
  }
  const CR_TOP = 150; // 크레인 레일 높이
  function box3(ctx, x0, y0, z0, x1, y1, z1, col) { // 축 정렬 상자 (보이는 면만, 면마다 음영) = 벽처럼 고정된 3D
    const F = [];
    if (C.x < x0) F.push([[[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], 0.8]); if (C.x > x1) F.push([[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 0.8]);
    if (C.y < y0) F.push([[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.95]); if (C.y > y1) F.push([[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], 0.95]);
    if (C.z > z1) F.push([[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 1.15]); if (C.z < z0) F.push([[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0.6]);
    for (const [f, k] of F) if (poly(ctx, f)) { ctx.fillStyle = Sprites.shade(col, k); ctx.fill(); }
  }
  function craneBoxes(Cr) { // 고정 구조: 모서리 기둥 · 옆 레일 · 갠트리 · 트롤리 · 케이블 (월드 좌표)
    const x0 = AR.x + 4, x1 = AR.x + AR.w - 4, y0 = AR.y + 4, y1 = AR.y + AR.h - 4, T = CR_TOP, hz = (Cr.z || 0) + 44, L = [];
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) L.push([x - 2.5, y - 2.5, 0, x + 2.5, y + 2.5, T + 1, '#8a8ea0', 'post']);
    L.push([x0 - 2.5, y0, T - 3, x0 + 2.5, y1, T + 1, '#c8ccd8'], [x1 - 2.5, y0, T - 3, x1 + 2.5, y1, T + 1, '#c8ccd8']);
    L.push([x0, Cr.y - 3, T - 4, x1, Cr.y + 3, T + 1, '#b8bccc']);
    L.push([Cr.x - 12, Cr.y - 7, T - 11, Cr.x + 12, Cr.y + 7, T + 2, '#ff7ab8']);
    if (T - 11 > hz) L.push([Cr.x - 0.9, Cr.y - 0.9, hz, Cr.x + 0.9, Cr.y + 0.9, T - 11, '#d8dce8']);
    return L;
  }
  function drawCraneTop(ctx, Cr, posts) { // posts=false: 위쪽 구조(레일·갠트리·트롤리·케이블), true: 기둥만
    const L = craneBoxes(Cr).filter(q => (q[7] === 'post') === posts);
    L.sort((a, c) => cam((c[0] + c[3]) / 2, (c[1] + c[4]) / 2, (c[2] + c[5]) / 2)[2] - cam((a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2)[2]);
    ctx.save(); ctx.globalAlpha = 1 - (Cr.fade || 0);
    for (const q of L) box3(ctx, q[0], q[1], q[2], q[3], q[4], q[5], q[6]);
    ctx.restore();
  }
  function drawClaw(ctx, Cr) { // 집게만 카메라를 바라봄 (stages6 drawCrane 과 같은 모양, 2배)
    const h = proj(Cr.x, Cr.y, (Cr.z || 0) + 44); if (!h || h.s > 12) return;
    ctx.save(); ctx.globalAlpha = 1 - (Cr.fade || 0);
    const k = h.s * 2, R = (dx, dy, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(h.x + dx * k, h.y + dy * k, w * k, hh * k); };
    const o = Cr.open || 0, sw = Math.round(3 + o * 5);
    R(-7, -1, 14, 9, '#3a3448'); R(-6, 0, 12, 7, '#e8ecf4'); R(-6, 5, 12, 2, '#a8aec0'); R(-1, 2, 2, 2, '#ffd860');
    for (const s of [-1, 1]) { R(s * sw - 1, 8, 2, 8, '#b8bccc'); R(s * (sw - 2) - 1, 15, 2, 2, '#b8bccc'); R(s * Math.max(1, sw - 3) - 1, 16, 2, 2, '#b8bccc'); }
    R(-1, 8, 2, 9, '#b8bccc');
    ctx.restore();
  }

  // ---------- 수평면(flat)·3D 띠(beam) ----------
  const fpool = [], mpool = [];
  function poolC(P, i, w, h) { let B = P[i]; if (!B || B.c.width < w || B.c.height < h) { const c = document.createElement('canvas'); c.width = Math.max(w, B ? B.c.width : 0); c.height = Math.max(h, B ? B.c.height : 0); B = P[i] = { c, x: c.getContext('2d') }; }
    const x = B.x; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, w, h); x.imageSmoothingEnabled = false; return B; }
  function drawFlat(ctx, it, i) { // 높이 z 의 수평면: 작은 칸마다 아핀으로 붙임
    const r = Math.min(it.r || 40, 200) + 2, n = Math.ceil(2 * r * TR), B = poolC(fpool, i, n, n);
    B.x.setTransform(TR, 0, 0, TR, (r - it.x) * TR, (r - it.y) * TR);
    B.x.save(); try { flatXf(B.x, it); } catch (e) { console.warn('[direct] flat draw', e); } finally { B.x.restore(); }
    const N = 4, d = 2 * r / N, x0 = it.x - r, y0 = it.y - r, z = it.z;
    for (let j = 0; j < N; j++) for (let i2 = 0; i2 < N; i2++) {
      const a = proj(x0 + i2 * d, y0 + j * d, z), bx = proj(x0 + (i2 + 1) * d, y0 + j * d, z), by = proj(x0 + i2 * d, y0 + (j + 1) * d, z), c = proj(x0 + (i2 + 1) * d, y0 + (j + 1) * d, z);
      if (!a || !bx || !by || !c || a.s > 12) continue;
      ctx.save(); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bx.x, bx.y); ctx.lineTo(c.x, c.y); ctx.lineTo(by.x, by.y); ctx.closePath(); ctx.clip();
      const k = 1 / (d * TR); ctx.transform((bx.x - a.x) * k, (bx.y - a.y) * k, (by.x - a.x) * k, (by.y - a.y) * k, a.x, a.y);
      const sx = i2 * d * TR, sy = j * d * TR, sw = d * TR; ctx.drawImage(B.c, sx - 0.5, sy - 0.5, sw + 1, sw + 1, -0.5, -0.5, sw + 1, sw + 1); ctx.restore();
    }
  }
  function drawBeam3(ctx, m, i) { // 두 점 사이 띠: 길이 방향으로 나눠 각 조각을 그 깊이의 배율로
    const L = Math.min(900, Math.hypot(m.x2 - m.x1, m.y2 - m.y1)); if (L < 1) return;
    const z1 = m.z1 != null ? m.z1 : m.z, z2 = m.z2 != null ? m.z2 : m.z, hw = (m.w || 10) / 2 + 4, pad = hw;
    const cw = Math.ceil((L + 2 * pad) * TR), ch = Math.ceil(2 * hw * TR), B = poolC(mpool, i, cw, ch);
    B.x.setTransform(TR, 0, 0, TR, pad * TR, hw * TR);
    B.x.save(); try { m.draw(B.x, L); } catch (e) { console.warn('[direct] beam draw', e); } finally { B.x.restore(); }
    const N = clamp(Math.ceil(L / 25), 2, 16), P = t => [m.x1 + (m.x2 - m.x1) * t, m.y1 + (m.y2 - m.y1) * t, z1 + (z2 - z1) * t];
    for (let k = 0; k < N; k++) {
      let t0 = k / N, t1 = (k + 1) / N; if (k === 0) t0 = -pad / L; if (k === N - 1) t1 = 1 + pad / L;
      let A = cam(...P(t0)), Bc = cam(...P(t1)); const nz = CAM.near + 1;
      if (A[2] < nz && Bc[2] < nz) continue;
      if (A[2] < nz) { const f = (nz - A[2]) / (Bc[2] - A[2]); t0 += (t1 - t0) * f; A = cam(...P(t0)); }
      if (Bc[2] < nz) { const f = (nz - A[2]) / (Bc[2] - A[2]); t1 = t0 + (t1 - t0) * f; Bc = cam(...P(t1)); }
      const pa = scr(A), pb = scr(Bc), s = Math.min(8, (pa.s + pb.s) / 2), len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      ctx.save(); ctx.translate(pa.x, pa.y); ctx.rotate(Math.atan2(pb.y - pa.y, pb.x - pa.x));
      ctx.drawImage(B.c, (pad + t0 * L) * TR, 0, Math.max(0.5, (t1 - t0) * L * TR), ch, 0, -hw * s, len + 0.6, 2 * hw * s); ctx.restore();
    }
  }

  // 텍스처 삼각형: 원본 삼각형(s) → 화면 삼각형(d) 정확한 아핀 + 그 삼각형만 클립(경계 ex 만큼 살짝 넓혀 이음매 숨김)
  function texTri(ctx, img, s0x, s0y, s1x, s1y, s2x, s2y, d0, d1, d2, ex = 0.4) {
    const det = (s1x - s0x) * (s2y - s0y) - (s2x - s0x) * (s1y - s0y); if (Math.abs(det) < 1e-6) return;
    const ux = d1.x - d0.x, uy = d1.y - d0.y, vx = d2.x - d0.x, vy = d2.y - d0.y, p1y = s1y - s0y, p2y = s2y - s0y, p1x = s1x - s0x, p2x = s2x - s0x;
    const a = (ux * p2y - vx * p1y) / det, c = (vx * p1x - ux * p2x) / det, b2 = (uy * p2y - vy * p1y) / det, d = (vy * p1x - uy * p2x) / det;
    const e = d0.x - a * s0x - c * s0y, f = d0.y - b2 * s0x - d * s0y;
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3, X = q => { const dx = q.x - cx, dy = q.y - cy, l = Math.hypot(dx, dy) || 1; return [q.x + dx / l * ex, q.y + dy / l * ex]; };
    ctx.save(); ctx.beginPath(); ctx.moveTo(...X(d0)); ctx.lineTo(...X(d1)); ctx.lineTo(...X(d2)); ctx.closePath(); ctx.clip();
    ctx.transform(a, b2, c, d, e, f);
    const mx = Math.max(0, Math.min(s0x, s1x, s2x) - 2), Mx = Math.min(img.width, Math.max(s0x, s1x, s2x) + 2), my = Math.max(0, Math.min(s0y, s1y, s2y) - 2), My = Math.min(img.height, Math.max(s0y, s1y, s2y) + 2);
    if (Mx > mx && My > my) ctx.drawImage(img, mx, my, Mx - mx, My - my, mx, my, Mx - mx, My - my);
    ctx.restore();
  }
  // 세로 벽 한 조각: 원본 [sx0, sx1] × [0, sh] → 화면 네 점 (아래 A·B, 위 TA·TB). 이웃 조각과 같은 경계 점을 써서 틈 없음
  function texQuad(ctx, img, sx0, sx1, sh, A, B, TA, TB, ex) {
    texTri(ctx, img, sx0, sh, sx1, sh, sx0, 0, A, B, TA, ex);
    texTri(ctx, img, sx1, sh, sx1, 0, sx0, 0, B, TB, TA, ex);
  }
  function drawWall3(ctx, m, i) { // 고정 세로 판: 길이 방향 조각마다 아래 두 점·위 한 점으로 아핀
    const L = Math.min(900, Math.hypot(m.x2 - m.x1, m.y2 - m.y1)), h = m.h || 16; if (L < 1) return;
    const cw = Math.ceil(L * TR) + 2, ch = Math.ceil(h * TR) + 2, B = poolC(mpool, i, cw, ch);
    B.x.setTransform(TR, 0, 0, TR, 0, 0);
    B.x.save(); try { m.draw(B.x, L); } catch (e) { console.warn('[direct] wall draw', e); } finally { B.x.restore(); }
    const N = clamp(Math.ceil(L / 16), 1, 48), P = t => [m.x1 + (m.x2 - m.x1) * t, m.y1 + (m.y2 - m.y1) * t];
    // 카메라와 내 캐릭터 사이를 가로막는 벽은 반투명 (벽 양쪽에 카메라·캐릭터가 나뉘고, 캐릭터가 벽 길이 안쪽)
    const U = S.P, dx = m.x2 - m.x1, dy = m.y2 - m.y1, sd = (px, py) => dx * (py - m.y1) - dy * (px - m.x1);
    let al = 1; if (U) { const tU = ((U.x - m.x1) * dx + (U.y - m.y1) * dy) / (L * L); if (sd(C.x, C.y) * sd(U.x, U.y) < 0 && tU > -0.1 && tU < 1.1) al = 0.3; }
    ctx.save(); ctx.globalAlpha *= al;
    const sh = h * TR, ex = al < 1 || m.glass ? 0.2 : 0.45; // 경계 점은 한 번만 투영 → 이웃 조각이 정확히 같은 모서리 공유
    let pb = null, pt = null, pz = 0;
    for (let k = 0; k <= N; k++) {
      const t = k / N, [x, y] = P(t), z = cam(x, y, 0)[2], ok = z >= CAM.near + 8, qb = ok ? proj(x, y, 0) : null, qt = ok ? proj(x, y, h) : null;
      if (k > 0 && pb && pt && qb && qt) texQuad(ctx, B.c, (k - 1) / N * L * TR, t * L * TR, sh, pb, qb, pt, qt, ex); // 카메라 바로 앞 조각은 건너뜀 (번짐 방지)
      pb = qb; pt = qt; pz = z;
    }
    ctx.restore();
  }

  function groundZ(b, u) { // 스테이지 지형 높이 (다이빙 존 계단·다이빙대 위 등). 훅이 groundZ(b, u) 를 주면 사용
    for (const h of STAGE_HOOKS) if (h.groundZ) { const z = h.groundZ(b, u); if (z) return z; }
    return 0;
  }
  // ---------- 그리기 ----------
  function draw(ctx, b, dt, view) {
    S.battle = b; S.cv = ctx.canvas; b._dp = true; b.bsbView = view; // _dp·bsbView: 그리기 전용 표시 (야구장 HUD·방망이)
    updateCam(b, dt, view);
    ctx.imageSmoothingEnabled = false;
    // 하늘(천장) + 바깥 바닥
    const hz = C.cy - C.f * Math.tan(C.pitch);
    const EV = envOf(b); drawSky(ctx, b, hz); ctx.fillStyle = EV.ground; ctx.fillRect(0, Math.max(0, hz), W, H); // 스테이지별 하늘(천장) 파노라마 + 경기장 밖 바닥색
    S.wrap = b.stageId === 'snake'; drawFloorTex(b); const cells = unitCells(b); drawFloor(ctx);
    const fh = S.wrap ? 150 : 70, fog = ctx.createLinearGradient(0, hz, 0, hz + fh); fog.addColorStop(0, `rgba(${EV.fog},${S.wrap ? 1 : 0.75})`); fog.addColorStop(1, `rgba(${EV.fog},0)`); // 뱀꼬리: 먼 바닥은 안개로
    ctx.fillStyle = fog; ctx.fillRect(0, hz, W, fh);
    if (!S.wrap) drawWalls(ctx, b); // 뱀꼬리 맵은 외곽 벽 없음
    if (b.claw && b.claw.crane) drawCraneTop(ctx, b.claw.crane, false); // 크레인 위쪽 구조 (모두보다 높음 → 먼저)
    // 깊이 정렬 (먼 것부터)
    const P = player(b), E = focus(b, P), items = []; S.P = P;
    for (const u of b.u) { if (u.hidden || u.def.noDraw) continue; const c = cam(u.x, u.y, 0); if (c[2] > CAM.near + 2) items.push({ z: c[2], u }); }
    for (const bl of b.buildings) if (!bl.dead && !bl.draw) { const c = cam(bl.x + bl.w / 2, bl.y + bl.h / 2, 0); items.push({ z: c[2] + Math.min(bl.w, bl.h) * 0.3, bl }); }
    for (const p of b.proj) { if (p.kind === 'wire') continue; const c = cam(p.x, p.y, PH); if (c[2] > CAM.near) items.push({ z: c[2], p });
      const g = proj(p.x, p.y, 0); if (g && g.s < 9) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(g.x, g.y, 6 * g.s, 2.2 * g.s, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } } // 투사체 그림자
    for (const c of cells) { const q = cam(c.x, c.y, 0); if (q[2] > CAM.near + 2) items.push({ z: q[2] - 0.5, c }); } // 캐릭터 둘레 위층 그림: 그 캐릭터 바로 앞
    for (const o of S.stand) { const q = cam(o.x, o.y, 0); if (q[2] > CAM.near + 2) items.push({ z: q[2], o }); }
    for (const f of S.flats) { const q = cam(f.x, f.y, f.z); if (q[2] > CAM.near + 2) items.push({ z: q[2], flat: f }); }
    for (const m of S.beams) { const z1 = m.z1 != null ? m.z1 : m.z, z2 = m.z2 != null ? m.z2 : m.z, q = cam((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2, (z1 + z2) / 2); items.push({ z: q[2], beam: m }); }
    for (const q of S.boxes) { const c = cam((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, q.z0); items.push({ z: c[2], box: q }); }
    for (const m of S.walls) { const q = cam((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2, 0); items.push({ z: q[2], wall: m }); }
    for (const g of S.bigs) { bigPlace(b, g); const q = cam(g.cx, g.wy, 0); if (q[2] > CAM.near + 2) items.push({ z: q[2] - 0.6, big: g }); } // 큰 이펙트: 세운 판
    if (b.balls && !EXCLUDE.has(b.stageId)) for (const bl of b.balls) { const q = cam(bl.x, bl.y, 0); if (q[2] > CAM.near + 2) items.push({ z: q[2], ball: bl }); }
    for (const g of goalItems(b)) items.push(g);
    const b3 = window.BASEBALL && BASEBALL.ball3(b); if (b3) { const q = cam(b3.x, b3.y, 0); if (q[2] > CAM.near + 2) items.push({ z: q[2] - (b3.held ? 1 : 0), ball: { x: b3.x, y: b3.y, z: b3.z, r: 2.4, color: '#f4f4f0' } }); } // 야구공
    if (b.claw && b.claw.crane) { const Cr = b.claw.crane; items.push({ z: cam(Cr.x, Cr.y, 0)[2] - 1, claw: Cr });
      for (const [x, y] of [[AR.x + 4, AR.y + 4], [AR.x + AR.w - 4, AR.y + 4], [AR.x + 4, AR.y + AR.h - 4], [AR.x + AR.w - 4, AR.y + AR.h - 4]]) { const q = cam(x, y, 0); if (q[2] > CAM.near) items.push({ z: q[2], post: [x, y, Cr] }); } }
    items.sort((a, c) => c.z - a.z);
    const eRect = (() => { if (!E || E.hidden) return null; const p = proj(E.x, E.y, 0); return p ? { x: p.x, y: p.y, w: 30 * p.s, h: 60 * p.s } : null; })();
    let bi = 0, pi = 0, oi = 0, fi = 0, mi = 0;
    for (const it of items) {
      if (it.bl) { drawBox(ctx, it.bl); continue; }
      if (it.c) { drawCell(ctx, it.c); continue; }
      if (it.big) { drawBig(ctx, it.big); continue; }
      if (it.flat) { drawFlat(ctx, it.flat, fi++); continue; }
      if (it.beam) { drawBeam3(ctx, it.beam, mi++); continue; }
      if (it.box) { const q = it.box; if (C.x > q.x0 - 4 && C.x < q.x1 + 4 && C.y > q.y0 - 4 && C.y < q.y1 + 4 && C.z < q.z1 + 4) continue; /* 카메라가 상자 안이면 그리지 않음 (화면 가득 번짐 방지) */ ctx.save(); ctx.globalAlpha = q.a == null ? 1 : q.a; box3(ctx, q.x0, q.y0, q.z0, q.x1, q.y1, q.z1, q.col); ctx.restore(); continue; }
      if (it.wall) { drawWall3(ctx, it.wall, mi++); continue; }
      if (it.ball) { drawBall(ctx, it.ball); continue; }
      if (it.goal) { drawGoal(ctx, it.goal); continue; }
      if (it.claw) { drawClaw(ctx, it.claw); continue; }
      if (it.post) { const [x, y, Cr] = it.post; ctx.save(); ctx.globalAlpha = 1 - (Cr.fade || 0); box3(ctx, x - 2.5, y - 2.5, 0, x + 2.5, y + 2.5, CR_TOP + 1, '#8a8ea0'); ctx.restore(); continue; }
      if (it.o) { const p = proj(it.o.x, it.o.y, it.o.z || 0); if (!p || p.s > 9) continue; const B = renderObj(oi++, it.o), s = it.o.maxS ? Math.min(p.s, it.o.maxS) : p.s, na = clamp((it.z - 15) / 55, 0.3, 1); if (na < 1) ctx.globalAlpha = na; ctx.drawImage(B.c, p.x - B.w / 2 * s, p.y - B.fy * s, B.w * s, B.h * s); ctx.globalAlpha = 1; /* 카메라 바로 앞 세운 판은 흐리게 (시야 가림 방지) */ continue; } // maxS: 가까워도 너무 커지지 않게 (카드 UI)
      if (it.p) { const p = proj(it.p.x, it.p.y, PH); if (!p || p.s > 9) continue; const cv = renderProj(pi++, it.p), s = Math.min(p.s, 6); ctx.drawImage(cv, p.x - PB / 2 * s, p.y - PB / 2 * s, PB * s, PB * s); continue; }
      const u = it.u, isP = u === P, gz = groundZ(b, u), p = proj(u.x, u.y, gz); if (!p || p.s > 9) continue;
      const v = look(u, b, isP, dt), cv = renderBill(bi++, u, b, v);
      const w = BB.w * p.s * v.sq, h = BB.h * p.s;
      let a = 1;
      if (isP && eRect && Math.abs(eRect.x - p.x) < 34 * p.s * 0.5 + eRect.w && eRect.y < p.y && eRect.y > p.y - 58 * p.s) a = 0.55; // 내 캐릭터가 상대를 가리면 반투명
      ctx.globalAlpha = a; ctx.drawImage(cv, p.x - BB.fx * p.s * v.sq, p.y - BB.fy * p.s, w, h); ctx.globalAlpha = 1;
      if (u.wSwing && !u.dead) drawSwing(ctx, u, b);
      if (!isP && !u.dead && u.maxHp > 0 && Number.isFinite(u.hp)) { const q = proj(u.x, u.y, (62 * (u.size || 1)) + b.airZ(u) + gz); if (q) hpBar(ctx, q.x, q.y, clamp(30 * q.s * 0.6, 18, 44), u.hp / u.maxHp, u.summon ? '#9ab0d8' : null); }
    }
    drawTexts(ctx, b);
    drawAim(ctx, b, P, view, dt);
    for (const fn of S.huds) { ctx.save(); try { fn(ctx); } catch (e) { console.warn('[direct] hud', e); } ctx.restore(); }
    // 상대가 화면 밖이면 가장자리 화살표
    if (E && !E.dead && !E.hidden) {
      const c = cam(E.x, E.y, 30), p = c[2] > CAM.near ? scr(c) : null;
      if (!p || p.x < 6 || p.x > W - 6) { const left = p ? p.x < W / 2 : c[0] < 0, x = left ? 10 : W - 10, y = clamp(p ? p.y : C.cy, view.y + 20, view.y + view.h - 20);
        ctx.fillStyle = TEAM_COL[E.team]; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(now() * 8); ctx.beginPath(); ctx.moveTo(x + (left ? -6 : 6), y); ctx.lineTo(x + (left ? 6 : -6), y - 8); ctx.lineTo(x + (left ? 6 : -6), y + 8); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
    }
    // 반전 표시
    if (S.flash > 0) {
      S.flash -= dt; const p = proj(P.x, P.y, 0);
      if (p) { const k = clamp(S.flash / 0.45, 0, 1); ctx.globalAlpha = k; ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2; const r = 18 * p.s * (1.3 - 0.3 * k);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.35, 0, 0.3, Math.PI - 0.3); ctx.stroke(); ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.35, 0, Math.PI + 0.3, TAU - 0.3); ctx.stroke();
        ctx.font = 'bold 11px "Galmuri11", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = 'rgba(20,18,30,0.85)'; ctx.lineWidth = 3; ctx.strokeText('반전!', p.x, p.y + 14); ctx.fillText('반전!', p.x, p.y + 14); ctx.globalAlpha = 1; }
    }
    // 결정타 연출 (화면 어둡게 + K.O.)
    if (b.finisher && b.finisher.t < b.finisher.dur) { const p = b.finisher.t / b.finisher.dur; ctx.fillStyle = '#090b18'; ctx.globalAlpha = 0.45 * Math.sin(Math.PI * p) ** 0.5; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    Render.drawKO(ctx, b, view.y + 60);
    // PC 안내 (마우스 잠금이 풀려 있을 때)
    if (S.active && S.mouseUser && canLock() && !S.locked && !b.over) {
      const msg = S.space ? '스페이스를 떼면 다시 마우스 잠금' : '전장을 클릭하면 마우스로 시점 조작 · 스페이스: 잠금 해제';
      ctx.font = 'bold 10px "Galmuri11", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(msg).width + 14, y = view.y + 14;
      ctx.fillStyle = 'rgba(14,15,24,0.8)'; ctx.fillRect(W / 2 - w / 2, y - 8, w, 16); ctx.fillStyle = '#ffe27a'; ctx.fillText(msg, W / 2, y);
    }
  }

  // 야구: 공을 쥔 내 투수 → 화면 가운데 조준점. 동료 수비수에 맞으면 클릭/탭으로 송구 (모바일·잠금 없는 마우스는 누른 자리의 동료)
  function drawAim(ctx, b, P, view, dt) {
    S.fproj = []; S.aimId = null; if (S.thrFlash > 0) S.thrFlash -= dt;
    if (bsbCtx(b, P) !== 'th') return;
    const D = b.bsb, ax = W / 2, ay = view.y + view.h * 0.45; let best = null, bd = 1e9;
    for (const n of D.fielders) { if (n.team !== P.team) continue; const q = proj(n.x, n.y, 18); if (!q || q.x < 0 || q.x > W || q.y < view.y || q.y > view.y + view.h) continue;
      S.fproj.push({ id: n.id, x: q.x, y: q.y }); const r = Math.max(14, 16 * q.s), d = Math.hypot(q.x - ax, q.y - ay); if (d < r && d < bd) { bd = d; best = { n, q }; } }
    if (!S.fproj.length) return; // 동료가 화면에 없으면 표시 안 함 (AI 송구 그대로)
    S.aimId = best ? best.n.id : null;
    ctx.save(); ctx.lineWidth = 1.5;
    for (const f of S.fproj) { ctx.strokeStyle = best && f.id === best.n.id ? '#ffe27a' : 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, TAU); ctx.stroke(); }
    const col = best ? '#ffe27a' : 'rgba(255,255,255,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ax, ay, 7, 0, TAU); ctx.moveTo(ax - 13, ay); ctx.lineTo(ax - 4, ay); ctx.moveTo(ax + 4, ay); ctx.lineTo(ax + 13, ay); ctx.moveTo(ax, ay - 13); ctx.lineTo(ax, ay - 4); ctx.moveTo(ax, ay + 4); ctx.lineTo(ax, ay + 13); ctx.stroke();
    ctx.font = 'bold 10px "Galmuri11", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const msg = best ? `클릭·탭: ${best.n.def.name}(${best.n.pos})에게 송구` : '동료에게 조준(또는 탭)해 송구'; const w = ctx.measureText(msg).width + 14;
    ctx.fillStyle = 'rgba(14,15,24,0.82)'; ctx.fillRect(W / 2 - w / 2, ay + 22, w, 16); ctx.fillStyle = col; ctx.fillText(msg, W / 2, ay + 30);
    ctx.restore();
  }
  return { supported, begin, setActive, blocking, takeFlip, flipped, takeAct, acted, player, draw, timeK, EXCLUDE, FLIP_CD, get active() { return S.active; },
    get camState() { return { yaw: C.yaw, pitch: C.pitch, autoYaw: S.autoYaw, userYaw: S.userYaw, userPitch: S.userPitch }; } }; // camState: 읽기 전용 (확인용)
})();
