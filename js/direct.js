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
  const EXCLUDE = new Set(['basket', 'baseball']); // 특수 규칙 스테이지 → 일반 시점
  const CAM = { dist: 100, h: 80, side: 22, pitch: 0.45, f: 300, near: 6, wallH: 34, bldH: 34 };
  const FLIP_CD = 0.45; // 반전 쿨타임 (전투 시간 초)
  const RES = 2, TR = 2; // 화면 내부 배율 (main.js RES) · 바닥 그림 배율
  const TX = { x: AR.x - 30, y: AR.y - 30, w: AR.w + 60, h: AR.h + 60 }; // 바닥 그림 영역 (경기장 + 바깥 테두리)
  const BB = { w: 240, h: 300, fx: 120, fy: 260 }; // 세운 그림 캔버스 (논리 px) · 발 위치
  const TAU = Math.PI * 2, wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now() / 1000;

  // ---------- 설정 ----------
  const hasGyroApi = () => typeof window.DeviceOrientationEvent !== 'undefined' || typeof window.DeviceMotionEvent !== 'undefined';
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
    flipReq: false, lastFlipT: -9, flash: 0, locked: false, space: false, mouseUser: false, popup: null, gyroSeen: 0, motionT: 0, ori: null, prevAlpha: null,
    looks: new WeakMap(), pf: { back: true, facing: 1 },
  };
  const $ = s => document.querySelector(s);
  const stageEl = () => $('#stage');
  const UI_SEL = '#bottom, button, a, input, label, #result, #fullLog, #settings, .dpPop, #rpCtl, #rpBar, #rpSave, #vidDlg, #vidRec';

  function supported(b) { return !!(b && !b.escape && !b.cam && !EXCLUDE.has(b.stageId)); }
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
  document.addEventListener('pointerlockchange', () => { S.locked = !!stageEl() && document.pointerLockElement === stageEl(); if (S.locked) S.lockFail = false; });
  document.addEventListener('pointerlockerror', () => { S.lockFail = true; });
  document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') S.mouseUser = true; else if (e.pointerType === 'touch') S.mouseUser = false; }, true);
  function onDown(e) {
    if (!S.active || S.popup) return;
    if (e.pointerType === 'mouse' && canLock() && !S.lockFail) {
      if (e.button !== 0) return;
      if (S.locked) { S.flipReq = true; e.preventDefault(); return; } // 잠금 중: 커서가 없으므로 어디를 눌러도 반전
      if (S.space || e.target.closest(UI_SEL)) return; // 스페이스로 푼 상태의 UI 클릭: 반전 아님
      lock(); e.preventDefault(); return; // 풀린 상태에서 전장 클릭: 다시 잠그기만 (반전 아님)
    }
    if (e.target.closest(UI_SEL)) return; // 로그·버튼 영역 제외
    S.flipReq = true;
    if (e.pointerType === 'mouse' && S.lockFail) { S.lockFail = false; lock(); } // 잠금 다시 시도
  }
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('mousemove', e => {
    if (!S.active || !S.locked) return;
    const k = Settings.get('mouseSens') || 1, mx = e.movementX || 0, my = e.movementY || 0;
    S.inYaw += mx * 0.0045 * k; S.inPitch += my * 0.003 * k;
    if (Math.abs(mx) + Math.abs(my) > 0.5) S.lastInp = now();
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
    if (!S.active || Settings.get('gyro') !== true || now() - S.motionT < 1 || e.alpha == null) { S.prevAlpha = e.alpha; return; }
    if (S.prevAlpha != null) { const d = wrap((e.alpha - S.prevAlpha) * Math.PI / 180); if (Math.abs(d) > 0.002 && Math.abs(d) < 0.6) { S.inYaw -= d * (Settings.get('gyroSens') || 1); if (Math.abs(d) > 0.01) S.lastInp = now(); } }
    S.prevAlpha = e.alpha;
  });
  let motionPrev = 0;
  addEventListener('devicemotion', e => {
    const r = e.rotationRate; if (!r || r.alpha == null) return;
    const t = now(), dt = clamp(t - (motionPrev || t), 0, 0.1); motionPrev = t; S.motionT = t; S.gyroSeen = t;
    if (!S.active || Settings.get('gyro') !== true || !dt) return;
    const o = S.ori || { b: 90, g: 0 }, b = o.b * Math.PI / 180, g = o.g * Math.PI / 180;
    const up = [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(g) * Math.cos(b)]; // 기기 좌표계의 지구 위쪽
    const rate = (r.beta || 0) * up[0] + (r.gamma || 0) * up[1] + (r.alpha || 0) * up[2]; // 도/초, 위에서 봐서 반시계(왼쪽으로 돎) = +
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
  function begin(b) { // main.js startBattle (실전, 직접 플레이 켜짐, 지원 스테이지)
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
  function takeFlip(b) { // 반전 요청 → 쿨타임이 지났으면 반전할 캐릭터
    if (!S.flipReq) return null; S.flipReq = false;
    if (!S.active || b.over || b.time - S.lastFlipT < FLIP_CD) return null;
    return player(b);
  }
  function flipped(b, ok) { if (ok) { S.lastFlipT = b.time; S.flash = 0.45; } }

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
    S.userYaw = wrap(S.userYaw + S.inYaw); S.userPitch = clamp(S.userPitch + S.inPitch, -0.22, 0.32); S.inYaw = S.inPitch = 0;
    if (t - S.lastInp > 0.7) { const k = 1 - Math.exp(-1.6 * dt); S.userYaw -= S.userYaw * k; S.userPitch -= S.userPitch * k; } // 회전 입력이 없으면 상대 쪽으로 천천히 복귀
    C.yaw = S.autoYaw + S.userYaw; C.pitch = CAM.pitch + S.userPitch;
    const fx = Math.cos(C.yaw), fy = Math.sin(C.yaw), rx = -fy, ry = fx;
    C.x = S.px - fx * CAM.dist - rx * CAM.side; C.y = S.py - fy * CAM.dist - ry * CAM.side; C.z = CAM.h;
    const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
    C.F = [cp * fx, cp * fy, -sp]; C.R = [rx, ry, 0]; C.U = [sp * fx, sp * fy, cp];
    let f = CAM.f; if (b.zoom) { const z = b.zoom; f *= 1 + z.k * 1.5 * Math.sin(Math.PI * Math.min(1, z.t / z.dur)); }
    C.f = f; C.cx = W / 2; C.cy = view.y + view.h * 0.66;
    if (b.shakeT > 0) { const k = b.shakeT / 0.18 * b.shakeA, q = t * 60; C.cx += Math.round(Math.sin(q * 1.7) * k); C.cy += Math.round(Math.cos(q * 2.3) * k); }
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
  let tex = null, tctx = null;
  function drawFloorTex(b) {
    if (!tex) { tex = document.createElement('canvas'); tex.width = TX.w * TR; tex.height = TX.h * TR; tctx = tex.getContext('2d'); }
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, tex.width, tex.height);
    tctx.setTransform(TR, 0, 0, TR, -TX.x * TR, -TX.y * TR); tctx.imageSmoothingEnabled = false;
    Render.draw(tctx, b, { v3d: true });
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalAlpha = 1; tctx.globalCompositeOperation = 'source-over'; tctx.filter = 'none';
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
    const hx = [(Rr[0] - L[0]) / W, (Rr[1] - L[1]) / W], k = RES / TR;
    const n = clamp(Math.ceil(W * (l1 - l0) / (1.2 * Math.max(0.5, ym - hz))), 1, 16), cw = W / n;
    let clipped = false;
    for (let i = 0; i < n; i++) {
      const xa = i * cw, xb = xa + cw, xc = xa + cw / 2;
      const c4 = [ground(xa, l0), ground(xb, l0), ground(xa, l1), ground(xb, l1)], T = ground(xc, l0), Bt = ground(xc, l1), O = ground(xc, ym);
      if (c4.some(p => !p) || !T || !Bt || !O) continue;
      let u0 = 1e9, v0 = 1e9, u1 = -1e9, v1 = -1e9;
      for (const p of c4) { const u = (p[0] - TX.x) * TR, v = (p[1] - TX.y) * TR; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
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
  function drawWalls(ctx, b) {
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
    const sv = [u.lookUp, u.facing]; u.lookUp = v.back; u.facing = v.facing; b._topPass = true; // _topPass: 바닥 그림자·분노 빛은 빼고 그림 (그림자는 바닥에 이미)
    try {
      Render.drawUnit(x, u, b); x.globalAlpha = 1;
      if (!u.dead) { Render.drawBarrier(x, u, b); x.globalAlpha = 1; if (u.counter) Render.drawCounter(x, u, b); Render.drawPips(x, u, b); if (!u.aoHid) Render.drawO2(x, u, u.x + u.kx, u.y + u.ky); }
    } catch (e) { console.warn('[direct] unit draw', e); }
    finally { u.lookUp = sv[0]; u.facing = sv[1]; b._topPass = false; x.globalAlpha = 1; x.filter = 'none'; }
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

  // ---------- 그리기 ----------
  function draw(ctx, b, dt, view) {
    S.battle = b;
    updateCam(b, dt, view);
    ctx.imageSmoothingEnabled = false;
    // 하늘(천장) + 바깥 바닥
    const hz = C.cy - C.f * Math.tan(C.pitch);
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, hz)); g.addColorStop(0, '#0b0c14'); g.addColorStop(1, '#2a2e42');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.max(0, hz)); ctx.fillStyle = '#14121c'; ctx.fillRect(0, Math.max(0, hz), W, H);
    drawFloorTex(b); drawFloor(ctx);
    const fog = ctx.createLinearGradient(0, hz, 0, hz + 70); fog.addColorStop(0, 'rgba(20,22,34,0.75)'); fog.addColorStop(1, 'rgba(20,22,34,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, hz, W, 70);
    drawWalls(ctx, b);
    // 깊이 정렬 (먼 것부터)
    const P = player(b), E = focus(b, P), items = [];
    for (const u of b.u) { if (u.hidden || u.def.noDraw) continue; const c = cam(u.x, u.y, 0); if (c[2] > CAM.near + 2) items.push({ z: c[2], u }); }
    for (const bl of b.buildings) if (!bl.dead && !bl.draw) { const c = cam(bl.x + bl.w / 2, bl.y + bl.h / 2, 0); items.push({ z: c[2] + Math.min(bl.w, bl.h) * 0.3, bl }); }
    for (const p of b.proj) { if (p.kind === 'wire') continue; const c = cam(p.x, p.y, 16); if (c[2] > CAM.near) items.push({ z: c[2], p }); }
    items.sort((a, c) => c.z - a.z);
    const eRect = (() => { if (!E || E.hidden) return null; const p = proj(E.x, E.y, 0); return p ? { x: p.x, y: p.y, w: 30 * p.s, h: 60 * p.s } : null; })();
    let bi = 0;
    for (const it of items) {
      if (it.bl) { drawBox(ctx, it.bl); continue; }
      if (it.p) { const p = proj(it.p.x, it.p.y, 16); if (!p) continue; const r = clamp(7 * p.s, 3, 26), col = hex6(it.p.color) || hex6(projectileColor(it.p)) || '#ffe08a'; Render.glowAt(ctx, p.x, p.y, r * 2.2, col, 0.75); ctx.fillStyle = '#fff8e0'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.35, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; continue; }
      const u = it.u, isP = u === P, p = proj(u.x, u.y, 0); if (!p || p.s > 9) continue;
      const v = look(u, b, isP, dt), cv = renderBill(bi++, u, b, v);
      const w = BB.w * p.s * v.sq, h = BB.h * p.s;
      let a = 1;
      if (isP && eRect && Math.abs(eRect.x - p.x) < 34 * p.s * 0.5 + eRect.w && eRect.y < p.y && eRect.y > p.y - 58 * p.s) a = 0.55; // 내 캐릭터가 상대를 가리면 반투명
      ctx.globalAlpha = a; ctx.drawImage(cv, p.x - BB.fx * p.s * v.sq, p.y - BB.fy * p.s, w, h); ctx.globalAlpha = 1;
      if (!isP && !u.dead && u.maxHp > 0 && Number.isFinite(u.hp)) { const q = proj(u.x, u.y, (62 * (u.size || 1)) + b.airZ(u)); if (q) hpBar(ctx, q.x, q.y, clamp(30 * q.s * 0.6, 18, 44), u.hp / u.maxHp, u.summon ? '#9ab0d8' : null); }
    }
    drawTexts(ctx, b);
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

  return { supported, begin, setActive, blocking, takeFlip, flipped, player, draw, EXCLUDE, FLIP_CD, get active() { return S.active; } };
})();
