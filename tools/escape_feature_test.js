// 탈출맵 특수 요소 짧은 시험: node tools/escape_feature_test.js
const path = require('path'), g = require('./headless.js').loadGame(path.join(__dirname, '..')), E = g.ESCAPE, T = E.TILE;
const res = []; const ok = (n, c, i) => { res.push(c); console.log(c ? 'PASS' : 'FAIL', n, c ? '' : JSON.stringify(i)); };
const blank = (fill) => { const gr = E.emptyGrid(18, 32).map(s => s.split('')); fill && fill(gr); return gr.map(a => a.join('')); };
const CH = ['army', 'sans'];
function world(map, seed, setup) { // 시드 고정 + 직접 조종용 전투
  const m = E.normalize({ ...map, chars: CH }); const orig = Math.random; Math.random = E.mkRng(seed || 1);
  try { const b = new g.Battle(g.CHARACTERS.find(c => c.id === CH[0]), g.CHARACTERS.find(c => c.id === CH[1]), { mode: 'A' }, 'arena'); E.apply(b, m); setup && setup(b); return { b, run(sec, fn) { Math.random = E.mkRng((seed || 1) + 7); try { for (let i = 0; i < sec * 120 && !b.over; i++) { b.update(1 / 120); fn && fn(b, i); } } finally { Math.random = orig; } } }; }
  finally { Math.random = orig; }
}
const base = { w: 720, h: 1280, starts: [{ x: 100, y: 1200 }, { x: 620, y: 1200 }], exit: { x: 320, y: 0, w: 80, h: 80 }, timeLimit: 120, rules: { noAttack: true, noDamage: true } };
// 1) 움직이는 벽: 위치는 시간의 함수
{ const mv = { path: [[2, 5], [3, 5], [4, 5]], w: 2, h: 1, at: 0, speed: 40, mode: 'pingpong' };
  const p = t => JSON.stringify(E.moverPos(mv, t));
  ok('움직이는 벽 왕복 위치 (0s, 1s, 2s, 3s, 4s)', p(0) === JSON.stringify({ x: 80, y: 200 }) && p(1) === JSON.stringify({ x: 120, y: 200 }) && p(2) === JSON.stringify({ x: 160, y: 200 }) && p(3) === JSON.stringify({ x: 120, y: 200 }) && p(4) === JSON.stringify({ x: 80, y: 200 }), [p(0), p(1), p(2), p(3), p(4)]);
  const lp = { path: [[1, 1], [2, 1], [2, 2], [1, 2]], w: 1, h: 1, at: 0, speed: 40, mode: 'loop' }, n = E.normalize({ ...base, movers: [lp] }).movers[0];
  ok('닫힌 경로 순환 (4초 뒤 제자리)', n.mode === 'loop' && JSON.stringify(E.moverPos(n, 4)) === JSON.stringify(E.moverPos(n, 0)) && JSON.stringify(E.moverPos(n, 3)) === JSON.stringify({ x: 40, y: 80 }), [E.moverPos(n, 3)]);
  const W = world({ ...base, grid: blank(), movers: [{ path: [[0, 20], [1, 20], [2, 20], [3, 20], [4, 20], [5, 20], [6, 20]], w: 1, h: 2, speed: 120 }] });
  const bl = W.b.buildings.find(x => x.escMover); W.run(1.5); ok('실행 중 움직이는 벽 이동 (1.5초 → x=180)', Math.abs(bl.x - 180) < 1.01 && bl.y === 800, { x: bl.x, t: W.b.time }); }
// 2) 일방통행: 위쪽(^) 띠. 아래에서 위로 → 통과·2배 속도, 위에서 아래로 → 튕김
{ const grid = blank(gr => { for (let c = 0; c < 18; c++) gr[15][c] = '^'; });
  const W = world({ ...base, grid, starts: [{ x: 100, y: 700 }, { x: 620, y: 300 }] }, 3, b => { const [a, d] = b.u.filter(u => !u.summon); a.dir = -Math.PI / 2; d.dir = Math.PI / 2; });
  const [a, d] = W.b.u.filter(u => !u.summon); let minA = 1e9, maxD = 0, spdOn = 0, spdOff = a.speed;
  W.run(3, () => { if (a.y > 600 && a.y < 640 && !spdOn) spdOn = a.speed; maxD = Math.max(maxD, d.y); minA = Math.min(minA, a.y); });
  ok('같은 방향(위) → 통과', minA < 600, { minA }); ok('같은 방향 이동 속도 2배', Math.abs(spdOn / spdOff - 2) < 1e-9, { spdOn, spdOff });
  ok('반대 방향(아래) → 일방통행 칸에 못 들어감', maxD < 600 && d.dir < 0, { maxD, dir: d.dir });
  const W2 = world({ ...base, grid, starts: [{ x: 100, y: 700 }, { x: 620, y: 300 }] }, 3, b => { const [a2] = b.u.filter(u => !u.summon); a2.dir = -Math.PI / 2 + 1.2; }); // 오른쪽 위로 비스듬히 (69°) → 튕김
  const a2 = W2.b.u.filter(u => !u.summon)[0]; let minA2 = 1e9; W2.run(2, () => { minA2 = Math.min(minA2, a2.y); }); ok('45°보다 비스듬히 진입 → 튕김', minA2 >= 600, { minA2 }); }
// 3) 물: 벽으로 둘러싼 물웅덩이에 가둠 → 속도 0.6배, 산소 3초 후 피해, 피해 0이어도 익사 → 실패
{ const grid = blank(gr => { for (let r = 25; r <= 31; r++) for (let c = 0; c <= 6; c++) gr[r][c] = (r === 25 || c === 6) ? '#' : '~'; });
  const W = world({ ...base, grid, starts: [{ x: 100, y: 1180 }, { x: 620, y: 300 }] }, 5);
  const a = W.b.u.filter(u => !u.summon)[0]; const s0 = a.st.spd; let firstDmg = null, hp0 = a.hp, mulSeen = 0;
  W.run(60, b => { if (!mulSeen && a.terrainMul) mulSeen = a.terrainMul; if (firstDmg == null && a.hp < hp0) firstDmg = b.time; });
  ok('물 속도 ×0.6', Math.abs(mulSeen - 0.6) < 1e-9, mulSeen); ok('산소 3초 뒤 첫 익사 피해', firstDmg != null && firstDmg > 2.9 && firstDmg < 3.2, firstDmg);
  ok('서로 피해 0 이어도 익사 → 탈출 실패', a.dead && W.b.escape.done && !W.b.escape.clear && /익사/.test(W.b.escape.result), { dead: a.dead, r: W.b.escape.result, t: W.b.time }); }
// 4) 파괴벽: 3번 부딪히면 파괴 / 1번(즉시) / hp 모드
{ for (const [n, m] of [[3, 'hits'], [1, 'hits'], [30, 'hp']]) {
    const brk = [{ c: 2, r: 14, n, m }]; // 1칸 폭 세로 통로: 아래는 벽, 위는 파괴벽 → 위아래로 튕기며 반복 충돌
    const shaft = blank(gr => { for (let r = 13; r <= 31; r++) { gr[r][1] = '#'; gr[r][3] = '#'; } gr[31][2] = '#'; gr[13][2] = '#'; });
    const W = world({ ...base, grid: shaft, breakables: brk, starts: [{ x: 100, y: 1000 }, { x: 620, y: 300 }] }, 2, b => { const [a] = b.u.filter(u => !u.summon); a.dir = -Math.PI / 2; });
    const a = W.b.u.filter(u => !u.summon)[0]; let hits = 0, broke = null; const B = W.b.buildings.filter(x => x.escBreak);
    W.run(20, b => { const dead = B.filter(x => x.dead).length; if (dead && broke == null) broke = { t: b.time, hp: B.find(x => x.dead).maxHp }; });
    const log = []; // 한 번 더: 충돌마다 남은 값 기록
    const any = B.filter(x => x.dead); ok(`파괴벽 ${m}=${n}: 부딪혀 파괴됨 (${broke ? broke.t.toFixed(2) + '초' : '-'})`, any.length === 1, { hp: B.map(x => x.hp) });
    if (m === 'hits') { // 같은 조건으로 다시: 파괴 직전까지 충돌 횟수 = n
      const W2 = world({ ...base, grid: shaft, breakables: brk, starts: [{ x: 100, y: 1000 }, { x: 620, y: 300 }] }, 2, b => { const [a] = b.u.filter(u => !u.summon); a.dir = -Math.PI / 2; });
      const B2 = W2.b.buildings.find(x => x.escBreak); const seq = []; let last = B2.hp; W2.run(20, () => { if (B2.hp !== last) { seq.push(B2.hp); last = B2.hp; } });
      ok(`파괴벽 hits=${n}: 1번 부딪힐 때마다 1씩, ${n}번째에 파괴`, JSON.stringify(seq) === JSON.stringify(Array.from({ length: n }, (_, i) => n - 1 - i)) && B2.dead, seq); }
  }
  const W = world({ ...base, grid: blank(), breakables: [{ c: 2, r: 20, n: 5, m: 'hits' }] }); const B = W.b.buildings.find(x => x.escBreak);
  W.b.hitBuilding(B, 999, true, 0, 0, null, 'proj'); W.b.hitBuilding(B, 999, true, 0, 0, null); ok('파괴벽: 공격·투사체 피해는 무시', B.hp === 5 && !B.dead, B.hp); }
// 5) 결정성: 모든 요소가 들어간 맵 2회 = 같은 결과
{ const grid = blank(gr => { for (let c = 0; c < 18; c++) gr[18][c] = c < 9 ? '^' : '~'; for (let c = 0; c < 12; c++) gr[10][c] = '#'; });
  const map = { ...base, grid, chars: CH, seed: 4, rules: { noDamage: true }, breakables: [{ c: 12, r: 10, n: 2, m: 'hits' }, { c: 13, r: 10, n: 20, m: 'hp' }], movers: [{ path: [[0, 14], [1, 14], [2, 14], [3, 14], [4, 14], [5, 14]], w: 2, h: 1, speed: 90 }] };
  const r1 = E.runHeadless(map), r2 = E.runHeadless(JSON.parse(JSON.stringify(map)));
  ok('모든 요소 맵: 같은 맵+시드 → 같은 결과(위치·도착·미리보기)', JSON.stringify(r1) === JSON.stringify(r2), [r1.result, r2.result]);
  console.log('  ', r1.clear, r1.result, r1.steps, 'preview', r1.preview.kind, r1.preview.hits);
  const n = E.normalize(map); ok('정규화: 선택 필드 유지·기존 필드 형식 그대로', n.v === 2 && n.breakables.length === 2 && n.movers.length === 1 && n.grid[18][0] === '^' && n.grid[18][17] === '~', n);
  const old = E.sampleMap(); ok('기존 맵 정규화에 새 필드 없음', !('breakables' in old) && !('movers' in old), Object.keys(old)); }
console.log(`${res.filter(Boolean).length}/${res.length} PASS`); process.exit(res.every(Boolean) ? 0 : 1);
