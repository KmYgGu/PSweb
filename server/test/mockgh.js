// 테스트용 모의 GitHub: Contents API (GET/PUT, sha 충돌 409) + raw 파일 제공(CORS *). 실제 GitHub 에 접속하지 않음.
const http = require('http'), crypto = require('crypto'), fs = require('fs');
function start(port, { delay = 30, file = null } = {}) {
  const files = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}; // path → { b64, sha }
  const save = () => file && fs.writeFileSync(file, JSON.stringify(files));
  let puts = 0, conflicts = 0; const force = new Set();
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let m;
    const out = (s, o, h = {}) => setTimeout(() => { res.writeHead(s, { 'Content-Type': 'application/json', ...h }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); }, delay);
    if ((m = u.pathname.match(/^\/raw\/(.+)$/))) { const f = files[decodeURIComponent(m[1])]; return f ? out(200, Buffer.from(f.b64, 'base64').toString('utf8'), { 'Access-Control-Allow-Origin': '*' }) : out(404, '404: Not Found', { 'Access-Control-Allow-Origin': '*' }); }
    if (u.pathname === '/_conflictNext') { force.add(u.searchParams.get('path')); return out(200, { ok: true }); }
    if (u.pathname === '/_stats') return out(200, { puts, conflicts, files: Object.keys(files) });
    if (!(m = u.pathname.match(/^\/api\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/))) return out(404, { message: 'Not Found' });
    if (req.headers.authorization !== 'Bearer test-token') return out(401, { message: 'Bad credentials' });
    const p = m[1].split('/').map(decodeURIComponent).join('/');
    if (req.method === 'GET') { const f = files[p]; return f ? out(200, { path: p, sha: f.sha, encoding: 'base64', content: f.b64 }) : out(404, { message: 'Not Found' }); }
    if (req.method === 'PUT') {
      let b = ''; req.on('data', c => b += c); req.on('end', () => {
        const j = JSON.parse(b), f = files[p];
        if (force.delete(p) || (f && j.sha !== f.sha) || (!f && j.sha)) { conflicts++; return out(409, { message: 'sha mismatch' }); }
        const sha = crypto.createHash('sha1').update(j.content + Math.random()).digest('hex');
        files[p] = { b64: j.content, sha }; puts++; save(); out(f ? 200 : 201, { content: { path: p, sha } });
      });
      return;
    }
    out(405, { message: 'no' });
  });
  return new Promise(r => srv.listen(port, () => r({ srv, files, stats: () => ({ puts, conflicts }) })));
}
module.exports = { start };
if (require.main === module) start(+process.argv[2] || 8098, { file: process.argv[3] || null }).then(() => console.log('mock github on', process.argv[2] || 8098));
