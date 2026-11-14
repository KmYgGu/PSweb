/* 설정 (첫 화면 ⚙ 설정 버튼 → #settings 창). PC·모바일 공통.
 * 옵션 추가: Settings.define([{ key, label, desc?, type: 'toggle' | 'range', def, min?, max?, step?, fmt?, request? }])
 *   → 설정 창에 줄이 자동으로 생김. 값은 localStorage 'psweb.settings' (JSON) 에 저장 (file:// 에서 저장이 안 되면 이번 실행 동안만 유지)
 *   toggle.request(): 켤 때 누른 순간 안에서 부르는 권한 요청 (iOS 자이로 등). Promise<boolean> — false 면 켜지 않음
 *   Settings.on((key, value) => …): 값이 바뀔 때 알림 */
const Settings = (() => {
  const KEY = 'psweb.settings';
  let vals = {}; try { vals = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { vals = {}; }
  const defs = [], subs = [];
  const def = k => defs.find(d => d.key === k);
  function define(list) { for (const d of list) if (!def(d.key)) defs.push(d); if (panel && !panel.classList.contains('hidden')) build(); }
  function has(k) { return Object.prototype.hasOwnProperty.call(vals, k); }
  function get(k) { if (has(k)) return vals[k]; const d = def(k); return d ? d.def : undefined; }
  function set(k, v) {
    vals[k] = v; try { localStorage.setItem(KEY, JSON.stringify(vals)); } catch (e) { /* 저장 불가 환경 */ }
    for (const f of subs) try { f(k, v); } catch (e) { console.warn('[settings]', e); }
    if (panel && !panel.classList.contains('hidden')) build();
  }
  function on(f) { subs.push(f); }
  let panel = null, list = null;
  function ensure() {
    if (panel) return;
    panel = document.getElementById('settings'); list = document.getElementById('setList');
    document.getElementById('setClose').onclick = close;
    panel.addEventListener('click', e => { if (e.target === panel) close(); });
  }
  function build() {
    ensure(); list.innerHTML = '';
    for (const d of defs) {
      const row = document.createElement('div'); row.className = 'setrow'; row.dataset.k = d.key;
      const v = get(d.key), desc = typeof d.desc === 'function' ? d.desc(v, has(d.key)) : d.desc || '';
      row.innerHTML = `<div class="setlab"><b>${d.label}</b>${desc ? `<span class="setdesc">${desc}</span>` : ''}</div>`;
      if (d.type === 'toggle') {
        const on = v === true, sw = document.createElement('button');
        sw.type = 'button'; sw.className = 'switch' + (on ? ' on' : ''); sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.setAttribute('aria-label', d.label);
        sw.innerHTML = '<span class="knob"></span>';
        sw.onclick = () => {
          const want = !(get(d.key) === true);
          if (want && d.request) { // 권한 요청은 누른 순간 안에서 (iOS)
            let p; try { p = d.request(); } catch (e) { p = Promise.resolve(false); }
            Promise.resolve(p).then(ok => set(d.key, !!ok), () => set(d.key, false));
          } else set(d.key, want);
        };
        row.appendChild(sw);
      } else if (d.type === 'range') {
        const box = document.createElement('div'); box.className = 'setrange';
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = d.min; inp.max = d.max; inp.step = d.step || 0.1; inp.value = v; inp.setAttribute('aria-label', d.label);
        const out = document.createElement('span'); out.className = 'setval'; const fmt = x => d.fmt ? d.fmt(+x) : (+x).toFixed(1);
        out.textContent = fmt(v);
        inp.oninput = () => { out.textContent = fmt(inp.value); };
        inp.onchange = () => { vals[d.key] = +inp.value; set(d.key, +inp.value); };
        box.appendChild(inp); box.appendChild(out); row.appendChild(box);
      }
      list.appendChild(row);
    }
  }
  function open() { ensure(); build(); panel.classList.remove('hidden'); }
  function close() { if (panel) panel.classList.add('hidden'); }
  return { define, get, set, has, on, open, close };
})();
