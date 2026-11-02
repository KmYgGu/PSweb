// 헤드리스 재검증: 워커 스레드 1개씩 순서대로 (무료 서버 CPU 보호), SIM_TIMEOUT_MS 넘으면 강제 종료
const { Worker } = require('worker_threads');
const path = require('path'), C = require('./config');
let chain = Promise.resolve();
function runOnce(map) {
  return new Promise(resolve => {
    const w = new Worker(path.join(__dirname, 'simworker.js'), { workerData: { map }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    let done = false; const fin = v => { if (done) return; done = true; clearTimeout(t); w.terminate(); resolve(v); };
    const t = setTimeout(() => fin({ ok: false, timeout: true, error: '재검증 시간 초과' }), C.SIM_TIMEOUT_MS);
    w.on('message', fin); w.on('error', e => fin({ ok: false, error: String(e.message || e) })); w.on('exit', c => fin({ ok: false, error: '워커 종료 ' + c }));
  });
}
const verify = map => { const p = chain.then(() => runOnce(map)); chain = p.catch(() => {}); return p; };
module.exports = { verify };
