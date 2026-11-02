// 서버 전체 흐름 시험 (모의 GitHub 대상): node server/test/run.js
const { spawn } = require('child_process'), path = require('path'), assert = require('assert');
const mock = require('./mockgh.js'), game = require('../../tools/headless.js').loadGame(path.join(__dirname, '../..'));
const MP = 8098, SP = 8097, S = `http://127.0.0.1:${SP}`;
const ENV = { ...process.env, PORT: String(SP), GITHUB_API: `http://127.0.0.1:${MP}/api`, GITHUB_TOKEN: 'test-token', GITHUB_REPO: 'o/r', ADMIN_KEY: 'admin-secret', REPORT_THRESHOLD: '3', ALLOWED_ORIGINS: 'https://kmyggu.github.io,null', SIM_TIMEOUT_MS: '60000' };
let child;
const startServer = () => new Promise(r => { child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], { env: ENV, stdio: ['ignore', 'pipe', 'inherit'] }); child.stdout.on('data', d => { if (/server/.test(d)) r(); }); });
const stopServer = () => new Promise(r => { child.on('exit', r); child.kill(); });
const call = async (method, p, body, { ip = '1.1.1.1', origin = 'null', key } = {}) => { const h = { 'X-Forwarded-For': ip, Origin: origin }; if (body !== undefined) h['Content-Type'] = 'application/json'; if (key) h['X-Admin-Key'] = key; const r = await fetch(S + p, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => null), h: r.headers }; };
const mapWith = o => { const m = game.ESCAPE.sampleMap(); m.chars = ['swordsman', 'assassin']; Object.assign(m, o); return game.ESCAPE.normalize(m); };
const results = []; const ok = (name, cond, info) => { if (process.env.V) console.log('..', name, cond); results.push([cond ? 'PASS' : 'FAIL', name, cond ? '' : JSON.stringify(info).slice(0, 300)]); };
(async () => {
  const M = await mock.start(MP, { delay: 20 }); await startServer();
  // CORS
  let r = await fetch(S + '/maps', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  ok('CORS 사전요청 Origin:null 허용', r.status === 204 && r.headers.get('access-control-allow-origin') === 'null', r.status);
  r = await call('GET', '/health', undefined, { origin: 'https://kmyggu.github.io' }); ok('CORS github.io 허용 + health', r.s === 200 && r.h.get('access-control-allow-origin') === 'https://kmyggu.github.io' && r.j.configured, r);
  r = await call('GET', '/health', undefined, { origin: 'https://evil.example' }); ok('CORS 다른 출처 거부', r.s === 403, r.s);
  // 올리기 성공
  const good = mapWith({ seed: 1 });
  r = await call('POST', '/maps', { map: good, title: '첫 번째 맵', author: '테스터', desc: '설명' }); ok('올리기 성공', r.s === 201 && r.j.id, r.j); const id1 = r.j && r.j.id;
  // 거부들
  r = await call('POST', '/maps', { map: good, title: '같은 맵 다른 제목' }, { ip: '2.2.2.2' }); ok('중복 거부', r.s === 409 && r.j.code === 'duplicate', r.j);
  r = await call('POST', '/maps', '{bad json', { ip: '2.2.2.2' }); ok('형식 불량(JSON) 거부', r.s === 400, r.j);
  r = await call('POST', '/maps', { map: { ...good, v: 1 }, title: 'x' }, { ip: '2.2.2.2' }); ok('형식 불량(v1) 거부', r.s === 400, r.j);
  r = await call('POST', '/maps', { map: good, title: 'a'.repeat(31) }, { ip: '2.2.2.2' }); ok('제목 길이 거부', r.s === 400 && r.j.code === 'text', r.j);
  r = await call('POST', '/maps', { map: good, title: '놀러와 www.abc.com' }, { ip: '2.2.2.2' }); ok('URL 거부', r.s === 400 && r.j.code === 'text', r.j);
  r = await call('POST', '/maps', { map: good, title: '씨 발' }, { ip: '2.2.2.2' }); ok('금칙어 거부', r.s === 400 && r.j.code === 'text', r.j);
  r = await call('POST', '/maps', JSON.stringify({ map: good, title: 'big', pad: 'x'.repeat(250000) }), { ip: '2.2.2.2' }); ok('너무 큼 거부(413)', r.s === 413, r.s);
  const empty = mapWith({ grid: game.ESCAPE.emptyGrid(18, 32), seed: 1 });
  r = await call('POST', '/maps', { map: empty, title: '빈 맵' }, { ip: '2.2.2.2' }); ok('대충 만든 맵(벽 부족) 거부', r.s === 400 && r.j.code === 'too_simple', r.j);
  r = await call('POST', '/maps', { map: mapWith({ seed: 2 }), title: '클리어 불가' }, { ip: '2.2.2.2' }); ok('클리어 불가 거부', r.s === 422 && r.j.code === 'not_clear', r.j);
  // 횟수 제한: 3.3.3.3 에서 6번 (시간당 5) — 형식 통과 후 계산
  const codes = []; for (let i = 0; i < 6; i++) { const q = await call('POST', '/maps', { map: mapWith({ seed: 2 }), title: '제한' + i }, { ip: '3.3.3.3' }); codes.push(q.s); }
  ok('횟수 제한(시간당 5) → 6번째 429', codes[5] === 429 && codes.slice(0, 5).every(c => c !== 429), codes);
  // 동시 올리기 직렬화: 다른 주소에서 두 맵 동시에
  const [a, b] = await Promise.all([call('POST', '/maps', { map: mapWith({ seed: 3 }), title: '동시 A' }, { ip: '4.4.4.4' }), call('POST', '/maps', { map: mapWith({ seed: 4 }), title: '동시 B' }, { ip: '5.5.5.5' })]);
  const idx = JSON.parse(Buffer.from(M.files['index.json'].b64, 'base64').toString());
  ok('동시 올리기 2건 모두 index 에 기록', a.s === 201 && b.s === 201 && idx.maps.length === 3 && idx.maps.some(m => m.id === a.j.id) && idx.maps.some(m => m.id === b.j.id), { a: a.j, b: b.j, n: idx.maps.length });
  ok('index 최신순 정렬', idx.maps.every((m, i, A) => i === 0 || A[i - 1].created >= m.created), idx.maps.map(m => m.created));
  const [d1, d2] = await Promise.all([call('POST', '/maps', { map: mapWith({ seed: 5 }), title: '동시 같은 맵1' }, { ip: '6.6.6.6' }), call('POST', '/maps', { map: mapWith({ seed: 5 }), title: '동시 같은 맵2' }, { ip: '7.7.7.7' })]);
  ok('동시에 같은 맵 2건 → 하나만 성공', [d1.s, d2.s].sort().join() === '201,409', [d1.s, d2.s]);
  // 신고 누적 → 확인 목록 (임계값 3)
  const rc = []; for (const ip of ['9.0.0.1', '9.0.0.2', '9.0.0.3']) { const q = await call('POST', `/maps/${id1}/report`, {}, { ip }); rc.push([q.s, q.j.count, q.j.review]); }
  ok('신고 3회 → 확인 목록', rc[2][0] === 200 && rc[2][1] === 3 && rc[2][2] === true && rc[1][2] === false, rc);
  r = await call('POST', `/maps/${id1}/report`, {}, { ip: '9.0.0.1' }); ok('같은 주소 중복 신고 거부', r.s === 409, r.j);
  r = await call('POST', `/maps/zzzzzzzz/report`, {}, { ip: '9.0.0.9' }); ok('없는 맵 신고 404', r.s === 404, r.j);
  const rep = JSON.parse(Buffer.from(M.files['reports.json'].b64, 'base64').toString());
  ok('reports.json 에 IP 원문 없음(해시만)', !JSON.stringify(rep).includes('9.0.0.1') && rep.maps[id1].by.every(h => /^[0-9a-f]{16}$/.test(h)), rep);
  // 관리자
  r = await call('GET', '/admin/review', undefined, { key: 'wrong' }); ok('관리자 키 틀림 401', r.s === 401, r.j);
  r = await call('GET', '/admin/review', undefined, { key: 'admin-secret' }); ok('관리자 확인 목록 조회', r.s === 200 && r.j.review.some(m => m.id === id1 && m.count === 3), r.j);
  // 재시작 후 상태 복구
  await stopServer(); await startServer();
  r = await call('GET', '/admin/review', undefined, { key: 'admin-secret' }); ok('재시작 후 확인 목록 유지', r.s === 200 && r.j.review.some(m => m.id === id1), r.j);
  r = await call('POST', `/maps/${id1}/report`, {}, { ip: '9.0.0.2' }); ok('재시작 후 중복 신고 여전히 거부', r.s === 409, r.j);
  r = await call('POST', '/maps', { map: good, title: '재시작 후 중복' }, { ip: '8.8.8.8' }); ok('재시작 후 중복 맵 여전히 거부', r.s === 409, r.j);
  // 숨김/복원/기각
  r = await call('POST', `/admin/maps/${id1}/hide`, { reason: '신고 확인' }, { key: 'admin-secret' }); ok('비공개 전환', r.s === 200, r.j);
  let I = JSON.parse(Buffer.from(M.files['index.json'].b64, 'base64').toString()), Hd = JSON.parse(Buffer.from(M.files['hidden.json'].b64, 'base64').toString()), Rv = JSON.parse(Buffer.from(M.files['review.json'].b64, 'base64').toString());
  ok('숨김: index 에서 빠지고 hidden 에 들어감, review 에서 빠짐', !I.maps.some(m => m.id === id1) && Hd.maps.some(m => m.id === id1) && !Rv.maps.some(m => m.id === id1), { I: I.maps.length, Hd: Hd.maps.length, Rv });
  r = await call('POST', `/maps/${id1}/report`, {}, { ip: '9.9.9.9' }); ok('비공개 맵 신고 404', r.s === 404, r.j);
  r = await call('POST', `/admin/maps/${id1}/restore`, {}, { key: 'admin-secret' }); I = JSON.parse(Buffer.from(M.files['index.json'].b64, 'base64').toString());
  ok('복원: index 로 돌아옴', r.s === 200 && I.maps.some(m => m.id === id1), r.j);
  for (const ip of ['9.1.0.1', '9.1.0.2', '9.1.0.3']) await call('POST', `/maps/${a.j.id}/report`, {}, { ip });
  r = await call('POST', `/admin/maps/${a.j.id}/dismiss`, {}, { key: 'admin-secret' }); Rv = JSON.parse(Buffer.from(M.files['review.json'].b64, 'base64').toString());
  const rep2 = JSON.parse(Buffer.from(M.files['reports.json'].b64, 'base64').toString());
  ok('기각: 확인 목록에서 빠지고 신고 수 초기화', r.s === 200 && !Rv.maps.some(m => m.id === a.j.id) && !rep2.maps[a.j.id], { Rv, rep: rep2.maps[a.j.id] });
  // 맵 파일 내용
  const mf = JSON.parse(Buffer.from(M.files[`maps/${id1}.json`].b64, 'base64').toString());
  ok('maps/<id>.json 내용 (map·verify)', mf.map && mf.map.v === 2 && mf.verify.clear && mf.title === '첫 번째 맵', mf);
  // sha 충돌 → 다시 읽어 재시도
  await fetch(`http://127.0.0.1:${MP}/_conflictNext?path=index.json`); const c0 = M.stats().conflicts;
  r = await call('POST', '/maps', { map: mapWith({ seed: 8 }), title: '충돌 재시도' }, { ip: '10.0.0.1' });
  ok('sha 충돌 1회 후 재시도로 성공', r.s === 201 && M.stats().conflicts === c0 + 1, { r: r.j, st: M.stats() });
  // 재검증 시간 초과 (워커 강제 종료)
  await stopServer(); ENV.SIM_TIMEOUT_MS = '30'; await startServer();
  r = await call('POST', '/maps', { map: mapWith({ seed: 6 }), title: '시간 초과' }, { ip: '10.0.0.2' }); ok('재검증 시간 초과 → 422 verify_timeout', r.s === 422 && r.j.code === 'verify_timeout', r.j);
  r = await call('GET', '/health'); ok('시간 초과 후에도 서버 응답', r.s === 200, r.s);
  await stopServer(); M.srv.close();
  for (const x of results) console.log(x.join(' '));
  console.log(`${results.filter(x => x[0] === 'PASS').length}/${results.length} PASS · 모의 GitHub PUT ${M.stats().puts}회, 충돌 ${M.stats().conflicts}회`);
  process.exit(results.every(x => x[0] === 'PASS') ? 0 : 1);
})().catch(e => { console.error(e); if (child) child.kill(); process.exit(2); });
