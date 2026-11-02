// 맵 저장소(GitHub Contents API) 읽기/쓰기. 모든 쓰기는 하나의 큐로 직렬화하고, sha 충돌(409/422)이면 다시 읽어 재시도.
const C = require('./config');
const enc = s => Buffer.from(s, 'utf8').toString('base64'), dec = b => Buffer.from(b, 'base64').toString('utf8');
const url = p => `${C.GITHUB_API}/repos/${C.GITHUB_REPO}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
const H = () => ({ Authorization: `Bearer ${C.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'psweb-escape-server' });
async function getFile(p) { // → { json, sha } | null (없음)
  const r = await fetch(url(p) + '?ref=' + encodeURIComponent(C.GITHUB_BRANCH), { headers: H() });
  if (r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error('GitHub 읽기 실패 ' + r.status), { status: 502 });
  const j = await r.json(); return { json: JSON.parse(dec(j.content || '')), sha: j.sha };
}
async function putFile(p, json, sha, message) {
  const body = { message, content: enc(JSON.stringify(json, null, 1) + '\n'), branch: C.GITHUB_BRANCH }; if (sha) body.sha = sha;
  const r = await fetch(url(p), { method: 'PUT', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return { conflict: true };
  if (!r.ok) throw Object.assign(new Error('GitHub 쓰기 실패 ' + r.status), { status: 502 });
  return { ok: true };
}
// 파일 하나를 읽고 → fn(현재값) 으로 새 값 계산 → 커밋. fn 이 undefined 를 돌려주면 쓰지 않음.
async function mutate(p, fn, message, def) {
  for (let i = 0; i < 4; i++) {
    const cur = await getFile(p), val = cur ? cur.json : (typeof def === 'function' ? def() : def);
    const next = await fn(val); if (next === undefined) return val;
    const r = await putFile(p, next, cur && cur.sha, message);
    if (r.ok) return next;
    await new Promise(res => setTimeout(res, 300 * (i + 1))); // 충돌: 잠시 후 다시 읽어 재시도
  }
  throw Object.assign(new Error('저장소 충돌이 계속됨'), { status: 503 });
}
let chain = Promise.resolve();
const queue = task => { const p = chain.then(task, task); chain = p.catch(() => {}); return p; }; // 직렬화 큐
module.exports = { getFile, putFile, mutate, queue };
