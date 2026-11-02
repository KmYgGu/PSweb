// 탈출맵 헤드리스 검사 (Node, 브라우저/DOM 없이): node tools/escape_check.js [맵.json] [--sample]
// index.html 의 스크립트를 순서대로 vm 에 올리고 (main.js / escape_ui.js 제외), 캔버스·이미지는 아무것도 안 하는 가짜 객체로 대체.
// 출력: { clear, result, steps(1/120초 단위), time, arrived[], pathCheck } — 같은 맵 JSON 이면 항상 같은 결과.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => !/main\.js|escape_ui\.js/.test(s));
const noop = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === 'canvas' ? fakeCanvas() : k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' || k === 'createImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h }) : noop, apply: () => noop, set: () => true });
function fakeCanvas() { return { width: 0, height: 0, style: {}, getContext: () => noop, toDataURL: () => '', addEventListener() {} }; }
const el = () => Object.assign(fakeCanvas(), { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] });
const ctx = { console, Math, JSON, Date, setTimeout, clearTimeout, setInterval: () => 0, performance: { now: () => 0 }, navigator: { userAgent: 'node' },
  document: { createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el(), head: el(), addEventListener() {} },
  Image: class { constructor() { this.width = 16; this.height = 16; } set src(v) { this._s = v; if (this.onload) setTimeout(() => this.onload(), 0); } get src() { return this._s; } },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, requestAnimationFrame: () => 0, Audio: class { play() { return Promise.resolve(); } } };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
// 스크립트 간 최상위 const/class 공유를 위해 하나로 이어 붙여 실행
const src = scripts.map(s => fs.readFileSync(path.join(root, s), 'utf8')).join('\n;\n');
vm.runInContext(src + '\n;globalThis.ESCAPE = window.ESCAPE;', ctx, { filename: 'bundle.js' });
const arg = process.argv[2];
const map = !arg || arg === '--sample' ? ctx.ESCAPE.sampleMap() : JSON.parse(fs.readFileSync(arg, 'utf8'));
const pc = ctx.ESCAPE.pathCheck(map), r = ctx.ESCAPE.runHeadless(map);
console.log(JSON.stringify({ name: ctx.ESCAPE.normalize(map).name, pathOk: pc.ok, clear: r.clear, result: r.result, steps: r.steps, time: r.time, arrived: r.arrived, aiErr: r.aiErr, pos: r.pos }));
