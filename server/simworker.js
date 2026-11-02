// 재검증 워커: 게임 코드를 vm 에 올려 runHeadless 1회 실행 후 결과를 돌려줌 (메인 스레드는 시간 초과 시 이 워커를 종료)
const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const ctx = require('../tools/headless.js').loadGame(path.join(__dirname, '..'));
try { parentPort.postMessage({ ok: true, r: ctx.ESCAPE.runHeadless(workerData.map) }); }
catch (e) { parentPort.postMessage({ ok: false, error: String(e && e.message || e) }); }
