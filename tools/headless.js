// 게임 코드(index.html 의 스크립트 목록)를 DOM 없이 Node vm 에 올림 — tools/escape_check.js 와 server/ 가 함께 사용
// 화면 전용 스크립트(main.js, escape_ui.js, escape_net.js, escape_config.js)는 제외. 캔버스·이미지는 아무것도 안 하는 가짜 객체.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SKIP = /(^|\/)(main|escape_ui|escape_net|escape_config)\.js$/;
function loadGame(root = path.join(__dirname, '..')) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => !SKIP.test(s));
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
  vm.runInContext(src + '\n;globalThis.ESCAPE = window.ESCAPE; globalThis.CHARACTERS = CHARACTERS; globalThis.Battle = Battle;', ctx, { filename: 'bundle.js' });
  return ctx;
}
module.exports = { loadGame };
