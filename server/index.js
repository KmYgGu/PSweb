// 탈출맵 중계 서버 (Render 무료 웹 서비스용, 외부 패키지 없음)
// 영속 상태는 전부 맵 저장소 파일: maps/<id>.json, index.json, reports.json, review.json, hidden.json
// 메모리에만 있는 것: 횟수 제한 카운터 (재시작/잠들면 초기화)
const http = require('http'), crypto = require('crypto'), path = require('path');
const C = require('./config'), GH = require('./github'), SIM = require('./sim'), V = require('./validate');
const game = require('../tools/headless.js').loadGame(path.join(__dirname, '..')); // normalize/캐릭터 목록용 (시뮬은 워커에서)
const VERSION = '2.0.0';

// ---------- 공통 ----------
const salt = C.IP_SALT || ('psweb:' + C.GITHUB_REPO + ':' + C.ADMIN_KEY);
// Render 는 Cloudflare 뒤에 있음: CF-Connecting-IP(클라이언트가 위조 불가) 우선, 없으면 X-Forwarded-For 첫 값(Render 가 앞에 덧붙이지 않고 뒤에 붙이므로 위조 가능), 그다음 소켓 주소
const ipOf = req => (String(req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || '').trim() || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?');
const ipHash = req => crypto.createHmac('sha256', salt).update(ipOf(req)).digest('hex').slice(0, 16); // 저장소에는 이 해시만 기록
const hits = new Map();
function limited(key, max, ms) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); if (a.length >= max) { hits.set(key, a); return true; } a.push(now); hits.set(key, a); return false; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 86400000)) hits.delete(k); }, 600000).unref();
function cors(req, res) {
  const o = req.headers.origin; if (!o) return true; // 브라우저 아님 (curl 등)
  if (!C.ALLOWED_ORIGINS.includes(o) && !C.ALLOWED_ORIGINS.includes('*')) return false;
  res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key'); res.setHeader('Access-Control-Max-Age', '600');
  return true;
}
const send = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const fail = (res, e) => send(res, e.status || 500, { ok: false, code: e.code || 'error', error: e.status ? e.message : '서버 오류' + (e.message ? ': ' + e.message : '') });
const err = (status, msg, code) => Object.assign(new Error(msg), { status, code });
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0, over = false; const chunks = [], big = () => err(413, `맵 파일이 너무 커요 (최대 ${Math.round(C.MAX_BODY / 1024)}KB)`, 'too_large');
    if (+req.headers['content-length'] > C.MAX_BODY) over = true;
    req.on('data', c => { n += c.length; if (n > C.MAX_BODY) over = true; if (!over) chunks.push(c); }); // 넘치면 버리면서 끝까지 읽고 413 (연결을 끊으면 브라우저가 응답을 못 받음)
    req.on('end', () => { if (over) return reject(big()); try { resolve(n ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(err(400, 'JSON 형식이 아니에요', 'invalid')); } });
    req.on('error', reject);
  });
}
const ready = () => { if (!C.GITHUB_TOKEN || !C.GITHUB_REPO) throw err(503, '서버 설정이 끝나지 않았어요 (GITHUB_TOKEN/GITHUB_REPO)', 'not_configured'); };
const DEF = { index: () => ({ v: 1, updated: null, maps: [] }), reports: () => ({ v: 1, maps: {} }), review: () => ({ v: 1, maps: [] }), hidden: () => ({ v: 1, maps: [] }) };
const ID_RE = /^[a-z0-9]{6,24}$/;
const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const now = () => new Date().toISOString();
const sortNew = a => a.sort((x, y) => String(y.created).localeCompare(String(x.created)));

// ---------- 올리기 ----------
async function upload(req, res) {
  ready(); const ih = ipHash(req);
  const body = await readBody(req);
  const T = V.checkText(body), { n, walls } = V.checkMap(body.map, game);
  if (limited('up:h:' + ih, C.UPLOAD_PER_HOUR, 3600000) || limited('up:d:' + ih, C.UPLOAD_PER_DAY, 86400000)) throw err(429, `올리기 횟수 제한에 걸렸어요 (시간당 ${C.UPLOAD_PER_HOUR}개, 하루 ${C.UPLOAD_PER_DAY}개)`, 'rate_limited');
  const hash = V.contentHash(n);
  const dup = async () => { const [i, h] = await Promise.all([GH.getFile('index.json'), GH.getFile('hidden.json')]); return [...(i ? i.json.maps : []), ...(h ? h.json.maps : [])].some(m => m.hash === hash); };
  if (await dup()) throw err(409, '이미 올라온 맵과 똑같아요', 'duplicate');
  const v = await SIM.verify(n);
  if (!v.ok) throw err(v.timeout ? 422 : 500, v.timeout ? '재검증이 너무 오래 걸려요 (제한 시간을 줄여 주세요)' : '재검증 오류: ' + v.error, v.timeout ? 'verify_timeout' : 'verify_error');
  if (!v.r.clear) throw err(422, `서버 재검증에서 출구에 도착하지 못했어요 (${v.r.result})`, 'not_clear');
  const id = newId(), created = now();
  const entry = { id, title: T.title, author: T.author, created, w: n.w, h: n.h, chars: n.chars, mode: n.rules.type, goal: n.rules.goal, timeLimit: n.timeLimit, seed: n.seed, walls, clearTime: v.r.arrived[0] ? v.r.arrived[0].t : v.r.time, hash, stats: {} }; // stats: 나중에 이용수/평가용
  await GH.queue(async () => {
    if (await dup()) throw err(409, '이미 올라온 맵과 똑같아요', 'duplicate'); // 큐 안에서 다시 확인 (동시 올리기)
    await GH.mutate(`maps/${id}.json`, () => ({ id, title: T.title, author: T.author, desc: T.desc, created, hash, verify: { clear: true, time: v.r.time, steps: v.r.steps, arrived: v.r.arrived }, map: n }), `map: ${id} ${T.title}`, null);
    await GH.mutate('index.json', idx => { idx.maps = sortNew([entry, ...idx.maps.filter(m => m.id !== id)]); idx.updated = created; return idx; }, `index: add ${id}`, DEF.index);
  });
  send(res, 201, { ok: true, id, entry });
}
// ---------- 신고 ----------
async function report(req, res, id) {
  ready(); const ih = ipHash(req);
  if (limited('rp:h:' + ih, C.REPORT_PER_HOUR, 3600000)) throw err(429, '신고 횟수 제한에 걸렸어요 (잠시 후 다시)', 'rate_limited');
  const out = await GH.queue(async () => {
    const idx = await GH.getFile('index.json'), e = idx && idx.json.maps.find(m => m.id === id);
    if (!e) throw err(404, '공개 목록에 없는 맵이에요', 'not_found');
    let count = 0, already = false;
    await GH.mutate('reports.json', R => { const r = R.maps[id] || (R.maps[id] = { count: 0, by: [], first: now() }); if (r.by.includes(ih)) { already = true; count = r.count; return undefined; } r.by.push(ih); r.count++; r.last = now(); count = r.count; return R; }, `report: ${id}`, DEF.reports);
    if (already) throw err(409, '이미 신고한 맵이에요', 'already_reported');
    let review = false;
    if (count >= C.REPORT_THRESHOLD) {
      review = true;
      await GH.mutate('review.json', Rv => { const x = Rv.maps.find(m => m.id === id); if (x) { if (x.count === count) return undefined; x.count = count; } else Rv.maps.push({ id, title: e.title, author: e.author, created: e.created, count, at: now() }); return Rv; }, `review: ${id}`, DEF.review);
    }
    return { count, review };
  });
  send(res, 200, { ok: true, ...out, threshold: C.REPORT_THRESHOLD });
}
// ---------- 관리자 ----------
function admin(req) {
  if (!C.ADMIN_KEY) throw err(503, '관리자 기능이 꺼져 있어요 (ADMIN_KEY 미설정)', 'admin_off');
  const ih = ipHash(req), k = String(req.headers['x-admin-key'] || '');
  const a = crypto.createHash('sha256').update(k).digest(), b = crypto.createHash('sha256').update(C.ADMIN_KEY).digest();
  if (!crypto.timingSafeEqual(a, b)) { if (limited('adm:' + ih, C.ADMIN_FAIL_PER_HOUR, 3600000)) throw err(429, '관리자 키 시도 횟수 초과', 'rate_limited'); throw err(401, '관리자 키가 맞지 않아요', 'unauthorized'); }
}
async function adminReview(req, res) {
  ready(); admin(req);
  const [rv, hd, rp] = await Promise.all(['review.json', 'hidden.json', 'reports.json'].map(p => GH.getFile(p)));
  const reports = rp ? rp.json.maps : {}, strip = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { count: v.count, first: v.first, last: v.last }]));
  send(res, 200, { ok: true, threshold: C.REPORT_THRESHOLD, review: rv ? rv.json.maps : [], hidden: hd ? hd.json.maps : [], reports: strip(reports) });
}
async function adminAction(req, res, id, act) {
  ready(); admin(req); const body = await readBody(req).catch(() => ({}));
  const resetReports = () => GH.mutate('reports.json', R => { if (!R.maps[id]) return undefined; delete R.maps[id]; return R; }, `reports: reset ${id}`, DEF.reports);
  const dropReview = () => GH.mutate('review.json', Rv => { const n = Rv.maps.filter(m => m.id !== id); if (n.length === Rv.maps.length) return undefined; Rv.maps = n; return Rv; }, `review: remove ${id}`, DEF.review);
  const r = await GH.queue(async () => {
    if (act === 'hide') {
      let entry = null;
      await GH.mutate('index.json', idx => { entry = idx.maps.find(m => m.id === id); if (!entry) return undefined; idx.maps = idx.maps.filter(m => m.id !== id); idx.updated = now(); return idx; }, `index: hide ${id}`, DEF.index);
      if (!entry) throw err(404, '공개 목록에 없는 맵이에요', 'not_found');
      await GH.mutate('hidden.json', Hd => { Hd.maps = [{ ...entry, hiddenAt: now(), reason: V.clean(body.reason).slice(0, 100) }, ...Hd.maps.filter(m => m.id !== id)]; return Hd; }, `hidden: add ${id}`, DEF.hidden);
      await dropReview(); return { hidden: id };
    }
    if (act === 'restore') {
      let entry = null;
      await GH.mutate('hidden.json', Hd => { entry = Hd.maps.find(m => m.id === id); if (!entry) return undefined; Hd.maps = Hd.maps.filter(m => m.id !== id); return Hd; }, `hidden: remove ${id}`, DEF.hidden);
      if (!entry) throw err(404, '비공개 목록에 없는 맵이에요', 'not_found');
      const { hiddenAt, reason, ...e } = entry;
      await GH.mutate('index.json', idx => { idx.maps = sortNew([e, ...idx.maps.filter(m => m.id !== id)]); idx.updated = now(); return idx; }, `index: restore ${id}`, DEF.index);
      await resetReports(); return { restored: id };
    }
    if (act === 'dismiss') { await dropReview(); await resetReports(); return { dismissed: id }; } // 기각: 확인 목록에서 빼고 신고 수 초기화
    if (act === 'reset-reports') { await resetReports(); return { reset: id }; }
    throw err(404, '없는 동작', 'not_found');
  });
  send(res, 200, { ok: true, ...r });
}
// ---------- 라우터 ----------
const server = http.createServer(async (req, res) => {
  try {
    if (!cors(req, res)) return send(res, 403, { ok: false, code: 'origin', error: '허용되지 않은 출처(Origin)' });
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && (p === '/' || p === '/health')) return send(res, 200, { ok: true, service: 'psweb-escape', version: VERSION, configured: !!(C.GITHUB_TOKEN && C.GITHUB_REPO), admin: !!C.ADMIN_KEY, threshold: C.REPORT_THRESHOLD });
    if (req.method === 'POST' && p === '/maps') return await upload(req, res);
    let m;
    if (req.method === 'POST' && (m = p.match(/^\/maps\/([^/]+)\/report$/))) { if (!ID_RE.test(m[1])) throw err(400, '잘못된 맵 id', 'invalid'); return await report(req, res, m[1]); }
    if (req.method === 'GET' && p === '/admin/review') return await adminReview(req, res);
    if (req.method === 'POST' && (m = p.match(/^\/admin\/maps\/([^/]+)\/(hide|restore|dismiss|reset-reports)$/))) { if (!ID_RE.test(m[1])) throw err(400, '잘못된 맵 id', 'invalid'); return await adminAction(req, res, m[1], m[2]); }
    send(res, 404, { ok: false, code: 'not_found', error: '없는 주소' });
  } catch (e) { if (!e.status) console.error(e); if (!res.headersSent) fail(res, e); }
});
server.requestTimeout = C.SIM_TIMEOUT_MS + 30000;
if (require.main === module) server.listen(C.PORT, () => {
  console.log(`psweb-escape server ${VERSION} :${C.PORT} repo=${C.GITHUB_REPO || '(미설정)'} admin=${!!C.ADMIN_KEY}`);
  if (!C.IP_SALT) console.warn('경고: IP_SALT 가 비어 있음 — 공개 reports.json 의 주소 해시를 추측당하기 쉬워요. 긴 무작위 값을 넣어 주세요');
  if (!C.GITHUB_TOKEN || !C.GITHUB_REPO) console.warn('경고: GITHUB_TOKEN/GITHUB_REPO 미설정 — 올리기·신고를 받을 수 없어요');
});
module.exports = { server };
