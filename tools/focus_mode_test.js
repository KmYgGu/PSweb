// 경기 집중 모드(switchStage no-op) 시험: node tools/focus_mode_test.js
const path = require('path'), g = require('./headless.js').loadGame(path.join(__dirname, '..'));
const res = []; const ok = (n, c, i) => { res.push(c); console.log(c ? 'PASS' : 'FAIL', n, c ? '' : JSON.stringify(i)); };
const char = id => g.CHARACTERS.find(c => c.id === id);
const mk = (a, b, hooks, stage) => new g.Battle(char(a), char(b), hooks || {}, stage || 'arena');
const snapWalls = b => JSON.stringify({
  id: b.stageId, nBuild: (b.buildings || []).length,
  builds: (b.buildings || []).map(x => [x.x, x.y, x.w, x.h, !!x.dead, !!x.aoDoor, !!x.aoCloset]),
  play: b.play && { x: b.play.x, y: b.play.y, w: b.play.w, h: b.play.h },
  ice: (b.iceSegs || []).length, balls: (b.balls || []).length,
});
const wrapLeaves = () => {
  const calls = [];
  const orig = g.STAGE_HOOKS.map(h => h.leave);
  g.STAGE_HOOKS.forEach((h, i) => { if (h.leave) h.leave = function (...a) { calls.push(h); return orig[i].apply(this, a); }; });
  return { calls, restore() { g.STAGE_HOOKS.forEach((h, i) => { h.leave = orig[i]; }); } };
};

// 1) focusMode 끄기: switchStage 가 스테이지를 바꿈 (야구장/탈출/noSwitchIn 이 아닌 대상)
{
  const dest = Object.keys(g.STAGE_DEFS).find(k => k !== 'arena' && !g.STAGE_DEFS[k].test && !g.STAGE_DEFS[k].hidden && !g.STAGE_DEFS[k].noSwitchIn);
  const b = mk('army', 'sans', { mode: 'A' }, 'arena');
  ok('기본 focusMode 는 끄기', b.focusMode === false, b.focusMode);
  const okSw = g.GHOUL.switchStage(b, dest);
  ok('끄기: switchStage 가 스테이지를 바꿈', okSw === true && b.stageId === dest && dest !== 'arena' && !g.STAGE_DEFS[dest].noSwitchIn, { okSw, from: 'arena', dest, now: b.stageId });
}

// 2) focusMode 켜기: true 반환, stageId·벽·기믹 유지, leave 훅 미실행
{
  const logs = [];
  const b = mk('army', 'sans', { mode: 'A', focusMode: true, onSystem: t => logs.push(t) }, 'city');
  const before = snapWalls(b), sid = b.stageId, nB = b.buildings.length;
  const W = wrapLeaves();
  const okSw = g.GHOUL.switchStage(b, 'island');
  const after = snapWalls(b);
  W.restore();
  ok('켜기: switchStage 가 true 를 반환', okSw === true, okSw);
  ok('켜기: stageId 유지', b.stageId === sid && sid === 'city', { sid, now: b.stageId });
  ok('켜기: leave 훅 미실행', W.calls.length === 0, W.calls.length);
  ok('켜기: 벽·기믹 유지', after === before && b.buildings.length === nB, { before, after });
  ok('켜기: 시스템 로그', logs.some(t => t === '경기 집중: 스테이지 유지'), logs);
}

// 3) 켜기 + 야구장: 점수·b.bsb 유지
{
  const logs = [];
  const b = mk('army', 'sans', { focusMode: true, onSystem: t => logs.push(t) }, 'baseball');
  ok('야구장 기믹 시작', !!(b.bsb && b.bsb.on && Array.isArray(b.bsb.score)), b.bsb && { on: b.bsb.on, score: b.bsb.score });
  b.bsb.score = [2, 1]; b.bsb.inning = 3; b.bsb.outs = 2; b.bsb.half = 1;
  const score0 = b.bsb.score.slice(), inn0 = b.bsb.inning, outs0 = b.bsb.outs, half0 = b.bsb.half, fieldN = b.bsb.fielders.length, ar0 = { x: g.AR.x, y: g.AR.y, w: g.AR.w, h: g.AR.h };
  const W = wrapLeaves();
  const okSw = g.GHOUL.switchStage(b, 'arena');
  W.restore();
  ok('야구장: switchStage true · 스테이지 유지', okSw === true && b.stageId === 'baseball', { okSw, id: b.stageId });
  ok('야구장: leave 미실행·bsb·점수 유지', W.calls.length === 0 && b.bsb && b.bsb.on === true && JSON.stringify(b.bsb.score) === JSON.stringify(score0) && b.bsb.inning === inn0 && b.bsb.outs === outs0 && b.bsb.half === half0 && b.bsb.fielders.length === fieldN, { leave: W.calls.length, on: b.bsb && b.bsb.on, score: b.bsb && b.bsb.score, inn: b.bsb && b.bsb.inning });
  ok('야구장: 구장 영역(AR) 유지', g.AR.x === ar0.x && g.AR.y === ar0.y && g.AR.w === ar0.w && g.AR.h === ar0.h, { ar0, ar: { x: g.AR.x, y: g.AR.y, w: g.AR.w, h: g.AR.h } });
  ok('야구장: 중단 로그 없음', !logs.some(t => /야구 경기 중단/.test(t)) && logs.some(t => t === '경기 집중: 스테이지 유지'), logs);
}

// 4) 켜기 + 아드라 후속: switchStage 이후 소환은 그대로, 스테이지는 유지
{
  const logs = [];
  const b = mk('ghoul', 'army', { focusMode: true, onSystem: t => logs.push(t) }, 'arena');
  const u = b.u.find(o => o.def.id === 'ghoul');
  const sid = b.stageId;
  b.flash = 1; b.shake(2);
  b.later(0.3, () => { if (b.over) return; g.GHOUL.switchStage(b, 'soccer'); g.GHOUL.summon(b, u, 'adra', u.x + u.facing * 26, u.y, { dur: 10 }); });
  for (let i = 0; i < 80 && !b.over; i++) b.update(1 / 120);
  const adra = b.u.find(o => o.summon && o.def && (o.def.id === 'gsum_adra' || o.summon.key === 'adra' || (o.def.name || '').includes('아드라')));
  ok('아드라: 스테이지 유지', b.stageId === sid && sid === 'arena', { now: b.stageId });
  ok('아드라: 소환 후속 효과 발생', !!adra, { units: b.u.map(o => [o.def && o.def.id, !!o.summon]) });
  ok('아드라: 유지 로그', logs.some(t => t === '경기 집중: 스테이지 유지'), logs);
}

// 5) 켜기 + 아오오니 문 진입: ok 가 true 라 연출이 취소되지 않고, 상대는 같은 스테이지 반대편으로 재배치
{
  const logs = [];
  const b = mk('aooni', 'army', { focusMode: true, onSystem: t => logs.push(t) }, 'arena');
  const ao = b.u.find(o => o.def.id === 'aooni'), foe = b.u.find(o => o.def.id === 'army');
  b.time = 6;
  for (const u of b.u) { if (u.skillT) for (let i = 0; i < u.skillT.length; i++) u.skillT[i] = 99; u.atkT = 99; }
  const sid = b.stageId, walls0 = snapWalls(b);
  g.SKILLS.aoDoor.use(ao, foe, b, (ao.skills || []).find(s => s.id === 'aoDoor'));
  const door = (b.buildings || []).find(bl => bl.aoDoor && !bl.dead);
  ok('아오오니: 문이 생김', !!door, { n: (b.buildings || []).length });
  if (door) {
    const cx = door.x + door.w / 2, cy = door.y + door.h / 2, side = door.side;
    foe.action = null; foe.push = null; foe.pull = null; foe.kx = foe.ky = 0; if (foe.v) foe.v = null;
    foe.x = cx; foe.y = cy;
    let entered = false;
    for (let i = 0; i < 60 && !b.over; i++) {
      b.update(1 / 120);
      if (logs.some(t => /문을 열고 다른 방으로/.test(t))) { entered = true; break; }
    }
    const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side];
    const moved = Math.hypot(foe.x - cx, foe.y - cy) > 20;
    ok('아오오니: 문 진입이 취소되지 않음', entered === true, { entered, logs: logs.slice(-6) });
    ok('아오오니: 같은 스테이지에서 상대 재배치', b.stageId === sid && moved, { sid, now: b.stageId, side, opp, from: [cx, cy], to: [foe.x, foe.y], moved });
    ok('아오오니: 기믹(문 외 벽) 유지 + 유지 로그', logs.some(t => t === '경기 집중: 스테이지 유지'), logs);
  }
}

// 6) 리플레이에 focusMode 필드가 없으면 끄기 (옛 리플레이 = A/끄기)
{
  const rec = { format: 'psreplay', v: 1, seed: 1, a: 'army', b: 'sans', stage: 'arena', mode: 'A' }; // focusMode 없음
  const hooks = { mode: rec.mode === 'B' ? 'B' : 'A', focusMode: !!rec.focusMode };
  const b = mk(rec.a, rec.b, hooks, rec.stage);
  ok('옛 리플레이: 없는 focusMode 필드는 끄기', b.focusMode === false && hooks.focusMode === false, { recHas: 'focusMode' in rec, flag: b.focusMode });
  const recOn = { ...rec, focusMode: true };
  const bOn = mk(recOn.a, recOn.b, { mode: recOn.mode, focusMode: !!recOn.focusMode }, recOn.stage);
  ok('리플레이: focusMode true 복원', bOn.focusMode === true, bOn.focusMode);
}

// hooks 생략 시 기본 끄기 (예전 호출부와 비트 동일)
{
  const b = mk('army', 'sans');
  ok('hooks 생략: focusMode 기본 끄기', b.focusMode === false, b.focusMode);
}

console.log(`${res.filter(Boolean).length}/${res.length} PASS`);
process.exit(res.every(Boolean) ? 0 : 1);
