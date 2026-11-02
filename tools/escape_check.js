// 탈출맵 헤드리스 검사 (Node, 브라우저/DOM 없이): node tools/escape_check.js [맵.json] [--sample]
// index.html 의 스크립트를 순서대로 vm 에 올리고 (main.js / escape_ui.js 제외), 캔버스·이미지는 아무것도 안 하는 가짜 객체로 대체.
// 출력: { clear, result, steps(1/120초 단위), time, arrived[] }  · 종료 코드 0 = 클리어, 1 = 실패 — 같은 맵 JSON 이면 항상 같은 결과.
const fs = require('fs'), path = require('path');
const ctx = require('./headless.js').loadGame(path.join(__dirname, '..'));
// 인자: [맵.json | --sample] [--chars a,b] [--mode A|B] [--seed N]  (chars/mode/seed 는 맵 JSON 값을 덮어씀)
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const arg = argv[0];
const map = !arg || arg === '--sample' || arg.startsWith('--') ? ctx.ESCAPE.sampleMap() : JSON.parse(fs.readFileSync(arg, 'utf8'));
if (opt('--chars')) map.chars = opt('--chars').split(',');
if (opt('--mode')) map.rules = Object.assign({}, map.rules, { type: opt('--mode') });
if (opt('--seed')) map.seed = +opt('--seed');
const r = ctx.ESCAPE.runHeadless(map), n = ctx.ESCAPE.normalize(map);
console.log(JSON.stringify({ name: n.name, chars: n.chars, mode: n.rules.type, seed: r.seed, clear: r.clear, result: r.result, steps: r.steps, time: r.time, arrived: r.arrived, pos: r.pos }));
process.exit(r.clear ? 0 : 1);
