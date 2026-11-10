#!/usr/bin/env node
// 버전 올리기 + 캐시 무효화 주소 갱신: 커밋 전에 실행
//   node tools/bump_version.cjs            → 오늘 날짜(한국 시간) 버전. 같은 날 다시 하면 -2, -3 …  (예: 2026.11.10-1)
//   node tools/bump_version.cjs --set X    → 버전을 X 로 지정
//   node tools/bump_version.cjs --check    → 바꾸지 않고 js/version.js · version.json · index.html 이 같은 버전인지만 검사 (다르면 종료 코드 1)
// 바꾸는 파일: js/version.js (APP_VERSION), version.json (사이트가 새 버전을 확인하는 파일), index.html (모든 로컬 js/css 주소 뒤 ?v=버전)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const F = { js: path.join(root, 'js/version.js'), json: path.join(root, 'version.json'), html: path.join(root, 'index.html') };
const RE_JS = /(G\.APP_VERSION\s*=\s*')([^']*)(')/;
const RE_TAG = /(<(?:script|link)\b[^>]*?\b(?:src|href)=")([^"]+)(")/g;
const local = u => !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
const read = f => fs.readFileSync(f, 'utf8');
const argv = process.argv.slice(2);
const cur = (read(F.js).match(RE_JS) || [])[2];
if (!cur) { console.error('js/version.js 에서 APP_VERSION 을 찾지 못함'); process.exit(2); }

function htmlVersions(html) { const s = new Set(); for (const m of html.matchAll(RE_TAG)) if (local(m[2])) { const q = m[2].match(/\?v=([^"&#]*)$/); s.add(q ? q[1] : '(없음)'); } return s; }

if (argv.includes('--check')) {
  let ok = true; const j = JSON.parse(read(F.json)).version, hv = htmlVersions(read(F.html));
  if (j !== cur) { ok = false; console.error(`version.json(${j}) ≠ js/version.js(${cur})`); }
  if (hv.size !== 1 || !hv.has(cur)) { ok = false; console.error(`index.html 주소 버전: ${[...hv].join(', ')} (기대: ${cur})`); }
  console.log(ok ? `OK ${cur}` : '불일치 → node tools/bump_version.cjs 실행'); process.exit(ok ? 0 : 1);
}

let next;
const si = argv.indexOf('--set');
if (si >= 0) { next = argv[si + 1]; if (!next || !/^[0-9A-Za-z._-]+$/.test(next)) { console.error('--set 뒤에 버전 (영문·숫자·.-_ 만)'); process.exit(2); } }
else {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const day = `${p.year}.${p.month}.${p.day}`, m = cur.match(/^(\d{4}\.\d{2}\.\d{2})-(\d+)$/);
  next = m && m[1] === day ? `${day}-${+m[2] + 1}` : `${day}-1`;
}

fs.writeFileSync(F.js, read(F.js).replace(RE_JS, `$1${next}$3`));
fs.writeFileSync(F.json, JSON.stringify({ version: next }) + '\n');
let n = 0;
const html = read(F.html).replace(RE_TAG, (all, a, u, b) => { if (!local(u)) return all; n++; return a + u.replace(/\?.*$/, '') + '?v=' + next + b; });
fs.writeFileSync(F.html, html);
console.log(`버전 ${cur} → ${next} (index.html 주소 ${n}개 갱신)`);
