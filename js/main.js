/* UI / 화면 흐름 / 메인 루프 */
(() => {
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d'), cvTop = $('#cvTop'), ctxTop = cvTop.getContext('2d'), hudEl = $('#hud');
  const RES = 2; // 내부 해상도 배율 (글자 선명도)

  function fit() {
    const r = document.getElementById('wrap').getBoundingClientRect(); // 100dvh 기준 (모바일 주소창 제외한 실제 보이는 높이)
    const s = Math.min((r.width || innerWidth) / W, (r.height || innerHeight) / H);
    stage.style.transform = `scale(${s}) translate(${-W / 2}px, ${-H / 2}px)`;
  }
  addEventListener('resize', fit); window.visualViewport && visualViewport.addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 200)); fit();

  // ---------- 선택 화면 ----------
  const pick = [null, null];
  let active = 0;
  const grid = $('#grid');
  CHARACTERS.forEach(c => {
    const el = document.createElement('div');
    el.className = 'card'; el.dataset.id = c.id;
    el.innerHTML = `<img src="${Sprites.get(c).portrait}" alt=""><div class="n">${c.name}</div>`;
    el.onclick = () => choose(c);
    grid.appendChild(el);
  });
  document.querySelectorAll('.slot').forEach(s => s.onclick = () => { active = +s.dataset.slot; refresh(); });
  $('#rnd').onclick = () => {
    const r = () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    pick[0] = r(); do { pick[1] = r(); } while (pick[1] === pick[0]);
    refresh();
  };
  $('#start').onclick = () => { if (pick[0] && pick[1]) openStages(); };
  // ---------- 스테이지 선택 ----------
  let stageId = 'arena';
  function openStages() {
    $('#select').classList.add('hidden'); $('#stageSel').classList.remove('hidden');
    $('#vsline').innerHTML = `<span style="color:#9cc4ff">${pick[0].name}</span> VS <span style="color:#ffb0b0">${pick[1].name}</span>`;
  }
  (function buildStages() {
    const g = $('#sgrid');
    const items = [...Object.keys(STAGE_DEFS).map(id => ({ id, ...STAGE_DEFS[id] })), { id: STAGE_RANDOM, name: '무작위', desc: '스테이지를 무작위로 고릅니다.' }];
    for (const s of items) {
      const el = document.createElement('div'); el.className = 'scard'; el.dataset.id = s.id;
      el.innerHTML = (s.id === STAGE_RANDOM ? '<div class="rnd">?</div>' : `<img src="${Render.thumb(s.id)}" alt="">`) + `<div class="n">${s.name}</div><div class="d">${s.desc || ''}</div>`;
      el.onclick = () => {
        const ids = Object.keys(STAGE_DEFS);
        stageId = s.id === STAGE_RANDOM ? ids[Math.floor(Math.random() * ids.length)] : s.id;
        $('#stageSel').classList.add('hidden'); startBattle();
      };
      g.appendChild(el);
    }
    $('#sback').onclick = () => { $('#stageSel').classList.add('hidden'); $('#select').classList.remove('hidden'); };
  })();

  function choose(c) {
    pick[active] = c;
    if (active === 0 && !pick[1]) active = 1;
    refresh();
  }
  // 속성/전달/관통 태그
  function hitTag(h) {
    if (!h || !h.element) return '';
    const el = ELEMENT_DEFS[h.element] || { name: h.element, color: '#ccc' };
    const parts = [`<span style="color:${el.color}">${el.name}</span>`];
    if (h.delivery) parts.push(DELIVERY_DEFS[h.delivery].name);
    if (h.pierce) parts.push(`관통${Math.round(h.pierce * 100)}%`);
    return `<span class="tagx">${parts.join('·')}</span>`;
  }
  function resistHTML(c) {
    const nm = k => (ELEMENT_DEFS[k] || DELIVERY_DEFS[k] || { name: k }).name;
    const col = k => (ELEMENT_DEFS[k] || { color: '#cfd4e4' }).color;
    const ent = Object.entries(c.resist || {});
    const weak = ent.filter(([, v]) => v > 1).map(([k, v]) => `<span style="color:${col(k)}">${nm(k)}</span>×${v}`).join(' ');
    const res = ent.filter(([, v]) => v < 1).map(([k, v]) => `<span style="color:${col(k)}">${nm(k)}</span>×${v}`).join(' ');
    const sr = Object.entries(c.statusResist || {}).map(([k, v]) => `${k === 'all' ? '전체' : (STATUS_DEFS[k] || { name: k }).name} ${Math.round(v * 100)}%`).join(', ');
    return `<div class="res"><span class="wk">약점</span> ${weak || '-'}</div>
      <div class="res"><span class="rs">저항</span> ${res || '-'}</div>
      <div class="res"><span class="sr">상태저항</span> ${sr || '-'}</div>
      <div class="res"><span class="ba">기본공격</span> 충돌 ${hitTag({ ...(c.attack || {}), delivery: null }) || '-'} · ${(c.stats && c.stats.range != null ? c.stats.range : STAT_DEFAULTS.range) < 80 ? '근접 무기 공격' : '무기 없음(스킬)'}</div>`;
  }
  function fmt(sd, v) { return sd.fmt ? sd.fmt(v) : Math.round(v); }
  function duoStats(c) { // 2인 팀: 파라가스 / 브로리 / (LSS) 를 같은 바 스타일로 나란히
    const B = c.lss && c.lss.boost, cols = [[c.partner, { ...STAT_DEFAULTS, ...c.partner.stats }], [c, { ...STAT_DEFAULTS, ...c.stats }]];
    if (B) { const l = { ...cols[1][1], ...(c.lss.stats || {}) }; l.spd *= B.spd || 1; cols.push([c.lss.form, l]); }
    const head = `<div class="stat dstat dhead"><span class="k"></span>${cols.map(([d], k) => `<span class="dc" style="color:${d.color}">${k === 2 ? 'LSS' : d.name}</span>`).join('')}</div>`;
    return head + STAT_DEFS.map(sd => `<div class="stat dstat"><span class="k">${sd.label}</span>${cols.map(([d, st]) => `<span class="dc"><span class="bar"><i style="width:${Math.min(100, st[sd.key] / sd.max * 100)}%;background:${d.color}"></i></span><span class="v">${fmt(sd, st[sd.key])}</span></span>`).join('')}</div>`).join('');
  }
  function slotHTML(i) {
    const c = pick[i], tag = `<div class="tag">${i ? 'P2 · 레드' : 'P1 · 블루'}</div>`;
    if (!c) return tag + `<div class="empty">캐릭터를 선택하세요</div>`;
    const st = { ...STAT_DEFAULTS, ...c.stats };
    const stats = c.partner ? duoStats(c) : STAT_DEFS.map(sd => `<div class="stat"><span class="k">${sd.label}</span><span class="bar"><i style="width:${Math.min(100, st[sd.key] / sd.max * 100)}%;background:${c.color}"></i></span><span class="v">${fmt(sd, st[sd.key])}</span></div>`).join('');
    const vis = (c.skills || []).filter(sl => !sl.hidden); // hidden: 선택 화면에 숨김 (듀얼리스트 패스트푸드 전용 슬롯 등)
    const skills = vis.map(sl => `<div class="skill"><b>${sl.name}</b> <span class="cd">(쿨타임 ${sl.cd}초)</span> ${hitTag(sl)}<br>${(SKILLS[sl.id] || {}).desc || ''}${(sl.applies || []).map(a => ` <span style="color:${STATUS_DEFS[a.status].color}">[${STATUS_DEFS[a.status].name}${a.chance != null && a.chance < 1 ? ' ' + Math.round(a.chance * 100) + '%' : ''}]</span>`).join('')}</div>`).join('');
    const skl = list => (list || []).map(sl => `<div class="skill"><b>${sl.name}</b> <span class="cd">(쿨타임 ${sl.cd}초)</span> ${hitTag(sl)}<br>${(SKILLS[sl.id] || {}).desc || ''}</div>`).join('');
    let extra = '';
    if (c.partner) { // 2인 팀 (파라가스 & 브로리): 파트너 / 변신 스킬도 표시
      const p = c.partner, ps = { ...STAT_DEFAULTS, ...p.stats };
      extra += `<div class="skills duoinfo"><div class="sh">함께 출전: <b style="color:${p.color}">${p.name}</b> (체력 ${ps.hp} · 공격력 ${ps.atk} · 사거리 ${ps.range})</div>${skl(p.skills)}</div>`;
    }
    if (c.lss) extra += `<div class="skills duoinfo"><div class="sh">${c.lss.desc || ''}</div>${skl(c.lss.skills)}</div>`;
    return tag + `<div class="top"><img src="${Sprites.get(c).portrait}" alt=""><div class="n">${c.name}${c.partner ? `<span class="duo-tag">+ ${c.partner.name}</span>` : ''}</div></div>${stats}${resistHTML(c)}
      ${c.duelist && window.DUEL ? DUEL.describe(c) : `<div class="skills"><div class="sh">스킬 ${vis.length}개</div>${skills}</div>`}${extra}`;
  }
  function refresh() {
    document.querySelectorAll('.slot').forEach((s, i) => { s.classList.toggle('active', i === active); s.innerHTML = slotHTML(i); });
    document.querySelectorAll('.card').forEach(el => {
      const s0 = pick[0] && pick[0].id === el.dataset.id, s1 = pick[1] && pick[1].id === el.dataset.id;
      el.classList.toggle('s0', !!s0); el.classList.toggle('s1', !!s1);
      el.querySelectorAll('.b').forEach(b => b.remove());
      if (s0) el.insertAdjacentHTML('beforeend', '<span class="b b0">P1</span>');
      if (s1) el.insertAdjacentHTML('beforeend', '<span class="b b1">P2</span>');
    });
    $('#start').disabled = !(pick[0] && pick[1]);
    $('#hint').textContent = pick[0] && pick[1] ? '준비 완료! 전투를 시작하세요 (같은 캐릭터끼리도 가능)' : `P${active + 1} 캐릭터를 고르세요`;
  }
  refresh();
  Sprites.preload([...CHARACTERS, ...CHARACTERS.filter(c => c.oni).map(c => c.oni.form), ...CHARACTERS.flatMap(c => Object.values(c.poses || {})), ...CHARACTERS.flatMap(c => c.extraDefs || [])]).then(() => {
    document.querySelectorAll('.card').forEach(el => { el.querySelector('img').src = Sprites.get(CHARACTERS.find(c => c.id === el.dataset.id)).portrait; });
    refresh();
  });

  // ---------- 전투 ----------
  let battle = null, speed = 1, hud = [];
  const frames = [$('#f0'), $('#f1')], frameHTML = frames.map(f => f.innerHTML);
  // 배속 (0.5x/1x/2x/4x): 시뮬레이션 dt 에만 적용. 선택은 저장 (file:// 등 localStorage 불가 시 무시)
  const SPEED_KEY = 'psweb.speed';
  function setSpeed(v, save) {
    const btn = [...document.querySelectorAll('#speed button')].find(x => x.dataset.s && +x.dataset.s === v);
    if (!btn) return;
    speed = v;
    document.querySelectorAll('#speed button').forEach(x => { if (x.dataset.s) x.classList.toggle('on', x === btn); });
    if (save) try { localStorage.setItem(SPEED_KEY, String(v)); } catch (e) { /* 저장 불가 환경 */ }
  }
  document.querySelectorAll('#speed button').forEach(b => b.onclick = () => { if (b.dataset.s) setSpeed(+b.dataset.s, true); });
  try { const sv = parseFloat(localStorage.getItem(SPEED_KEY)); if (Number.isFinite(sv)) setSpeed(sv, false); } catch (e) { /* 무시 */ }
  $('#mute').onclick = () => {
    const enabled = Sfx.toggle();
    $('#mute').textContent = enabled ? '소리' : '끔';
    $('#mute').classList.toggle('off', !enabled);
  };
  stage.addEventListener('click', e => {
    if (e.target.closest('button, .card, .scard, .slot')) Sfx.play('ui');
  });

  function label(u) { return pick[0] === pick[1] ? `${u.def.name}(P${u.team + 1})` : u.def.name; }
  function teamLabel(t) { const m = battle.u.filter(u => u.team === t && !u.summon); return m.length > 1 ? m.map(u => u.def.name).join(' & ') + (pick[0] === pick[1] ? `(P${t + 1})` : '') : label(m[0]); }
  // 로그: 새 줄이 아래에서 들어오며 기존 줄을 위로 밀어 올림 (최대 3줄 표시, 위쪽은 잘림)
  const LOG_LINE = 20, LOG_KEEP = 4;
  // 전체 전투 로그: 표시되는 모든 로그 줄을 전투 시간과 함께 기록 (최대 5000줄)
  const FULL_LOG_MAX = 5000; let fullLog = [];
  const fmtT = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; };
  function pushLog(cls, html) {
    if (fullLog.length < FULL_LOG_MAX) fullLog.push({ t: battle ? battle.time : 0, cls, html });
    if (RPQ.quiet) return; // 리플레이 빨리감기 중: 화면 로그는 끝나고 한 번에 갱신
    const log = $('#log'), el = document.createElement('div');
    el.className = 'logl' + cls; el.innerHTML = html;
    log.appendChild(el);
    while (log.children.length > LOG_KEEP) log.firstChild.remove();
    const rows = [...log.children];
    rows.forEach(c => { c.style.transition = 'none'; c.style.transform = `translateY(${LOG_LINE}px)`; });
    void log.offsetHeight; // reflow 후 애니메이션
    rows.forEach(c => { c.style.transition = ''; c.style.transform = ''; });
  }
  const who = u => `<span style="color:${u.team ? '#ffb0b0' : '#b0d0ff'}">${label(u)}</span>`;
  function addLog(u, sk, line) { // 대사가 있으면 대사 + 작은 스킬 태그, 없으면 '캐릭터명: 스킬명'
    if (line) pushLog(' l' + u.team, `${who(u)}: <span class="vl">"${line}"</span> <span class="stag">${sk}</span>`);
    else pushLog(' l' + u.team, `${who(u)}: <span class="sk">${sk}</span>`);
  }
  function addVoice(u, line) { pushLog(' l' + u.team, `${who(u)}: <span class="vl">"${line}"</span>`); }
  function addStatus(u, name, color) { pushLog(' l' + u.team, `${who(u)}: <span style="color:${color}">${name}</span>`); }
  function addSys(t) { pushLog('', `<span class="sk">⚔ ${t}</span>`); }
  // ---------- 리플레이 재현용 시드 난수 ----------
  // 전투 로직(생성자/update)이 쓰는 Math.random 만 시드 난수로 바꿔 끼움 → 같은 시드 + 같은 캐릭터/스테이지 = 같은 전투
  const RPQ = { quiet: false }; let rng = null;
  const nativeRandom = Math.random;
  if (window.Sfx) { const op = Sfx.play; Sfx.play = function (...a) { const o = Math.random; Math.random = nativeRandom; try { return op.apply(this, a); } finally { Math.random = o; } }; } // 효과음의 음높이 난수는 전투 난수와 분리 (소리 켜짐/꺼짐과 무관하게 재현)
  const mkRng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  function seeded(fn) { if (!rng) return fn(); const o = Math.random, r = rng, tr = window.__rpTrace; Math.random = tr ? () => { tr(); return r(); } : r; try { return fn(); } finally { Math.random = o; } } // __rpTrace: 디버그용 (재현 검사)
  function startBattle(opt = {}) {
    $('#select').classList.add('hidden'); $('#result').classList.add('hidden');
    $('#hud').classList.remove('hidden'); $('#bottom').classList.remove('hidden');
    $('#log').innerHTML = ''; fullLog = []; $('#fullLog').classList.add('hidden');
    const seed = opt.seed != null ? opt.seed : (Math.random() * 4294967296) >>> 0; rng = mkRng(seed);
    const hooks = opt.replay ? { onSkill: addLog, onVoice: addVoice, onEnd: () => {}, onSystem: addSys, onStatus: addStatus }
      : { onSkill: (u, sk, l) => { REC.skill(u, sk); addLog(u, sk, l); }, onVoice: addVoice, onEnd: w => { REC.finish(); showResult(w); }, onSystem: t => { REC.sys(t); addSys(t); }, onStatus: addStatus };
    seeded(() => { battle = new Battle(pick[0], pick[1], hooks, stageId); });
    if (!opt.replay) REC.begin(battle, seed);
    $('#stageName').textContent = '🗺 ' + (STAGE_DEFS[stageId].short || STAGE_DEFS[stageId].name); // short: 하단 바용 짧은 이름
    seeded(buildHud);
    window.__battle = battle;
  }
  function buildHud() {
    hud = [];
    [0, 1].forEach(i => {
      const mem = battle.u.filter(u => u.team === i), f = frames[i], face = mem[mem.length - 1];
      f.innerHTML = frameHTML[i]; f.classList.toggle('duo', mem.length > 1); f.dataset.form = '';
      f.querySelector('img').src = Sprites.get(face.def).portrait;
      if (mem.length > 1) { // 2인 팀: 한 프레임 안에 작은 체력 바 2줄
        f.querySelector('.info').innerHTML = mem.map((u, k) => `<div class="drow" data-k="${k}"><div class="dl"><span class="dn">${label(u)}</span><span class="dh"></span></div><div class="hpbar sm"><div class="lag"></div><div class="fill"></div></div></div>`).join('');
        mem.forEach((u, k) => { const row = f.querySelectorAll('.drow')[k]; hud.push({ u, f, face, row, disp: u.maxHp, lag: u.maxHp, hold: 0, fill: row.querySelector('.fill'), lagEl: row.querySelector('.lag'), num: row.querySelector('.dh') }); });
        return;
      }
      const u = mem[0];
      f.querySelector('.nm').textContent = label(u);
      const rb = f.querySelector('.resbars'); rb.innerHTML = ''; // 자원 바 (display: 'bar')
      if (battle.race) rb.insertAdjacentHTML('beforeend', `<div class="resb lap" data-k="__lap" title="랩 진행" style="color:#f0f0f0"><div class="rf" style="background:repeating-linear-gradient(90deg,#f4f4f4 0 4px,#9aa0a8 4px 8px)"></div></div>`);
      for (const [k, R] of Object.entries(u.def.resources || {})) if (R.display === 'bar') rb.insertAdjacentHTML('beforeend', `<div class="resb" data-k="${k}" title="${R.name}" style="color:${R.color}"><div class="rf" style="background:${R.color}"></div></div>`);
      for (const X of (window.HUD_EXT || [])) X.init && X.init(u, f, battle); // 캐릭터 확장 HUD (듀얼리스트 패/덱/묘지/함정)
      hud.push({ u, f, face: u, single: true, disp: u.maxHp, lag: u.maxHp, hold: 0, fill: f.querySelector('.fill'), lagEl: f.querySelector('.lag'), num: f.querySelector('.hpnum') });
    });
  }
  function showResult(w) {
    $('#winImg').src = Sprites.get(w.fdef).portrait;
    $('#winImg').style.borderColor = TEAM_COL[w.team];
    const fl = battle.fallen, rt = battle.resultText && battle.resultText(label), duo = battle.u.filter(u => u.team === w.team && !u.summon).length > 1;
    $('#winTxt').textContent = rt || (fl ? `${label(fl)} 크레바스에 추락! ${teamLabel(w.team)} 승리!` : `${teamLabel(w.team)} 승리!`);
    $('#winTxt').style.fontSize = (fl || rt || duo) ? '17px' : '';
    $('#winSub').textContent = `${STAGE_DEFS[stageId].name} · 전투 시간 ${battle.time.toFixed(1)}초 · 남은 체력 ${Math.ceil(w.hp)}/${w.maxHp}`;
    $('#result').classList.remove('hidden');
  }
  $('#again').onclick = () => startBattle();
  $('#logBtn').onclick = () => {
    const L = $('#flList');
    L.innerHTML = fullLog.map(r => `<div class="logl${r.cls}"><span class="flt">${fmtT(r.t)}</span>${r.html}</div>`).join('') || '<div class="logl">기록 없음</div>';
    $('#flCount').textContent = `${fullLog.length}줄${fullLog.length >= FULL_LOG_MAX ? ' (최대)' : ''}`;
    $('#fullLog').classList.remove('hidden'); L.scrollTop = 0;
  };
  $('#flClose').onclick = () => $('#fullLog').classList.add('hidden');
  $('#flCopy').onclick = () => {
    const tmp = document.createElement('div');
    const text = fullLog.map(r => { tmp.innerHTML = r.html; return `[${fmtT(r.t)}] ${tmp.textContent}`; }).join('\n');
    const done = ok => { $('#flCopy').textContent = ok ? '복사됨' : '실패'; setTimeout(() => { $('#flCopy').textContent = '복사'; }, 1200); };
    const fallback = () => { try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); done(ok); } catch (e) { done(false); } };
    try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => done(true), fallback); else fallback(); } catch (e) { fallback(); }
  };
  $('#reselect').onclick = () => {
    battle = null;
    $('#result').classList.add('hidden'); $('#hud').classList.add('hidden'); $('#bottom').classList.add('hidden');
    $('#select').classList.remove('hidden');
    active = 0; refresh();
  };

  function updateHud(dt) {
    for (const H of hud) {
      const u = H.u, f = H.f;
      H.disp += (u.hp - H.disp) * Math.min(1, dt * 12);
      if (u.hp < H.lag) { H.hold += dt; if (H.hold > 0.35) H.lag += (u.hp - H.lag) * Math.min(1, dt * 4); }
      else { H.lag = u.hp; H.hold = 0; }
      if (Math.abs(H.lag - u.hp) < 0.5) H.hold = 0;
      const r = H.disp / u.maxHp;
      H.fill.style.width = (r * 100) + '%';
      H.fill.style.backgroundColor = r > 0.5 ? '#6fd38a' : r > 0.2 ? '#f2c94c' : '#ef6b5b';
      H.lagEl.style.width = (H.lag / u.maxHp * 100) + '%';
      H.num.textContent = H.single ? `${Math.ceil(u.hp)} / ${u.maxHp}` : `${Math.ceil(u.hp)}`;
      if (H.row) H.row.classList.toggle('down', u.dead);
      if (u === H.face) { const fd = H.face.fdef; if (f.dataset.form !== fd.id) { f.dataset.form = fd.id; f.querySelector('img').src = Sprites.get(fd).portrait; } } // 오니화/변신 초상화
      if (H.single) for (const X of (window.HUD_EXT || [])) X.update && X.update(u, f);
      if (H.single) f.querySelectorAll('.resb').forEach(el => { if (el.dataset.k === '__lap') { el.firstChild.style.width = ((u.lap ? u.lap.prog : 0) * 100) + '%'; return; } const R = u.def.resources[el.dataset.k], v = u.res[el.dataset.k] || 0; el.firstChild.style.width = (v / R.max * 100) + '%'; el.classList.toggle('full', v >= R.max); });
    }
    $('#timer').textContent = battle.time.toFixed(1) + 's';
  }

  // ---------- 루프 (고정 스텝) ----------
  const STEP = 1 / 120;
  let last = performance.now(), acc = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (RP.on) RP.frame(dt);
    else if (battle) {
      battle.updateVisual(dt);
      acc += dt * speed;
      let n = 0;
      seeded(() => { while (acc >= STEP && n < 60) { battle.update(STEP); acc -= STEP; n++; REC.step(battle); } });
      updateHud(dt);
    }
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    Render.draw(ctx, battle);
    Render.drawTopUnits(ctxTop, battle, RES, battle && !hudEl.classList.contains('hidden') ? hudEl.offsetHeight : 0);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ================= 리플레이 (최고의 플레이) =================
  // 방식: 화면을 녹화하지 않고 "시드 + 캐릭터 + 스테이지"만 기록. 전투 로직의 난수를 시드로 고정하므로
  // 같은 엔진으로 처음부터 다시 돌리면 실제 전투와 같은 장면이 그대로 재현됨 (스테이지 교체·카드·소환수·회색조 등 전부 실제 렌더러 사용).
  // 되감기 = 처음부터 화면 없이 빠르게 재계산(1분 전투 ≈ 1초 이내). 1초(120스텝)마다 상태 해시를 기록해 재현이 어긋나면 경고.
  const CHECK_EVERY = 120;
  const BUILD = (() => { const s = [CHARACTERS.map(c => c.id).join(','), Object.keys(STAGE_DEFS).join(','), Object.keys(window.CARD_DEFS || {}).length, Object.keys(SKILLS).length].join('|'); let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); })();
  function hashB(b) { let h = 2166136261; const mix = v => { h = Math.imul(h ^ (v | 0), 16777619); }; mix(b.u.length); mix(b.proj.length); for (const u of b.u) { mix(Math.round(u.x * 10)); mix(Math.round(u.y * 10)); mix(Math.round(u.hp * 10)); } return (h >>> 0).toString(36); }
  function teamHp(b) { return [0, 1].map(t => { const m = b.u.filter(u => u.team === t && !u.summon); const mx = m.reduce((a, u) => a + u.maxHp, 0) || 1; return Math.round(m.reduce((a, u) => a + Math.max(0, u.hp), 0) / mx * 1000) / 1000; }); }
  const HL_KW = [[/붕괴/, 'castle', 20], [/엑조디아|EXODIA/i, 'exodia', 40], [/융합|퓨전|합체/, 'fusion', 22], [/각성|변신|초사이어인|LSS/, 'transform', 22], [/시간 정지/, 'timestop', 12], [/스테이지 파괴/, 'stage', 10]];
  const HL_NAME = { dmg: '대량 피해', kill: '처치', end: '결정타', stage: '스테이지 변경', castle: '백은성 붕괴', exodia: '엑조디아', fusion: '융합', transform: '변신·각성', ult: '필살기', card: '상급 카드', comeback: '역전', timestop: '시간 정지', big: '큰 기술' };
  const REC = {
    cur: null, last: null,
    begin(b, seed) { this.cur = { format: 'psreplay', v: 1, build: BUILD, seed, a: pick[0].id, b: pick[1].id, stage: stageId, dur: 0, samples: [], ev: [], check: [], created: new Date().toISOString() }; this.b = b; this.n = 0; this.nextS = 0; this.dead = new Set(); this.stg = b.stageId; this.seen = new WeakSet(); this.bigT = -9; this.overSeen = false; },
    ev(type, team, w) { if (this.cur && !this.cur.done) this.cur.ev.push([Math.round(this.b.time * 100) / 100, type, team, w]); },
    step(b) {
      const R = this.cur; if (!R || R.done || b !== this.b) return;
      this.n++; if (this.n % CHECK_EVERY === 0) R.check.push([Math.round(b.time * 1000) / 1000, hashB(b)]);
      if (b.time < this.nextS) return; this.nextS = b.time + 0.1;
      R.samples.push([Math.round(b.time * 100) / 100, ...teamHp(b)]);
      for (const u of b.u) if (!u.summon && u.dead && !this.dead.has(u)) { this.dead.add(u); this.ev('kill', 1 - u.team, 45); }
      if (b.stageId !== this.stg) { this.stg = b.stageId; this.ev('stage', -1, 20); }
      for (const t of b.texts) { if (this.seen.has(t)) continue; this.seen.add(t); const s = String(t.txt || '');
        let hit = false; for (const [re, k, w] of HL_KW) if (re.test(s)) { this.ev(k, -1, w); hit = true; break; }
        if (!hit && t.size >= 14 && b.time - this.bigT > 0.6) { this.bigT = b.time; this.ev('big', -1, 8); } }
      if (b.over && !this.overSeen) { this.overSeen = true; this.ev('end', b.winner ? b.winner.team : -1, 30); }
    },
    skill(u, sk) {
      if (!this.cur) return; const sl = (u.skills || []).find(s => s.name === sk);
      if (sl && (sl.ult || sl.cd >= 12)) this.ev('ult', u.team, 18);
      else if (u.def.duelist && window.CARD_DEFS) { const c = Object.values(CARD_DEFS).find(c => c.name === sk); if (c && c.level >= 7) this.ev('card', u.team, 6 + c.level); }
    },
    sys(t) { /* 스테이지 교체는 stageId 변화로 감지 */ },
    finish() { const R = this.cur; if (!R || R.done) return; R.dur = Math.round(this.b.time * 100) / 100; R.done = true; R.hl = computeHL(R); R.names = [pick[0].name, pick[1].name]; R.stageName = STAGE_DEFS[stageId].name; this.last = R; },
  };
  function computeHL(R) { // 하이라이트: 8초 창마다 점수 (피해량 + 이벤트 가중치 + 역전), 상위 3개 (겹침 30% 미만)
    const S = R.samples, D = R.dur, W = Math.min(8, Math.max(3, D)), out = [];
    if (!S.length) return [{ s: 0, e: D, score: 0, team: -1, why: [] }];
    const cand = [];
    for (let s = 0; s <= Math.max(0, D - W) + 1e-6; s += 0.5) {
      const e = s + W, why = {}, cred = [0, 0]; let sc = 0;
      const add = (k, w, team) => { why[k] = (why[k] || 0) + w; sc += w; if (team >= 0) cred[team] += w; };
      let lead0 = null, lmin = 9, lmax = -9;
      for (let i = 1; i < S.length; i++) { const [t, h0, h1] = S[i]; if (t < s || t > e) continue; const p = S[i - 1];
        const d0 = Math.max(0, p[1] - h0), d1 = Math.max(0, p[2] - h1); if (d0) add('dmg', d0 * 100, 1); if (d1) add('dmg', d1 * 100, 0);
        const L = h0 - h1; if (lead0 === null) lead0 = L; lmin = Math.min(lmin, L); lmax = Math.max(lmax, L); }
      if (lead0 !== null && lmin < -0.05 && lmax > 0.05 && lmax - lmin > 0.2) add('comeback', 25, -1);
      for (const [t, k, team, w] of R.ev) if (t >= s && t <= e) add(k, w, team);
      cand.push({ s, e, score: sc, team: cred[0] === cred[1] ? -1 : cred[0] > cred[1] ? 0 : 1, why });
    }
    cand.sort((a, b) => b.score - a.score);
    for (const c of cand) { if (out.length >= 3) break; if (out.length && c.score < out[0].score * 0.3) break;
      if (out.some(o => Math.min(o.e, c.e) - Math.max(o.s, c.s) > W * 0.3)) continue; out.push(c); }
    for (const c of out) for (const [t, k] of R.ev) if ((k === 'kill' || k === 'end' || k === 'stage' || k === 'castle' || k === 'exodia') && t >= c.s && t <= c.e + 1 && t > c.e - 2) c.e = Math.min(D, Math.max(c.e, t + 1.8)); // 결정적 순간 직후 여운까지
    return out.map(c => ({ s: Math.round(c.s * 10) / 10, e: Math.round(Math.min(D, c.e) * 10) / 10, score: Math.round(c.score), team: c.team, why: Object.entries(c.why).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => HL_NAME[k] || k) }));
  }

  // ---------- 뷰어 ----------
  const fmtS = t => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
  const toast = (msg, ms = 1800) => { const el = $('#rpToast'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), ms); };
  const RP = {
    on: false, rec: null, playing: false, spd: 1, A: null, B: null, range: [0, 0], steps: 0, acc: 0, stopAt: null, live: null, warned: false, banner: 0, drag: null,
    open(rec, o = {}) {
      const a = CHARACTERS.find(c => c.id === rec.a), b = CHARACTERS.find(c => c.id === rec.b);
      if (!a || !b || !STAGE_DEFS[rec.stage]) { toast('이 리플레이의 캐릭터/스테이지를 찾을 수 없어요'); return false; }
      if (!this.on) { this.live = { battle, hud, fullLog, pick: pick.slice(), stageId, log: $('#log').innerHTML, stg: $('#stageName').textContent, result: !$('#result').classList.contains('hidden'), select: !$('#select').classList.contains('hidden'), sfx: Sfx.enabled }; Sfx.toggle(false); }
      this.on = true; this.rec = rec; pick[0] = a; pick[1] = b; stageId = rec.stage;
      this.range = rec.range ? rec.range.slice() : [0, rec.dur]; this.A = this.B = null; this.stopAt = null; this.warned = false; $('#rpWarn').textContent = rec.build !== BUILD ? '다른 버전에서 저장됨' : '';
      $('#select').classList.add('hidden'); $('#speed').classList.add('hidden');
      ['#rpBar', '#rpCtl', '#rpTop'].forEach(s => $(s).classList.remove('hidden')); $('#rpSave').classList.add('hidden');
      this.restart(); this.seek(this.range[0]); this.drawMarks();
      if (o.potg) this.potg(0); else this.play(true);
      return true;
    },
    close() {
      this.pause(); this.on = false; this.banner = 0; $('#rpBanner').classList.add('hidden');
      ['#rpBar', '#rpCtl', '#rpTop', '#rpSave'].forEach(s => $(s).classList.add('hidden')); $('#speed').classList.remove('hidden');
      const L = this.live; rng = null; Sfx.toggle(L ? L.sfx : true);
      pick[0] = L.pick[0]; pick[1] = L.pick[1]; stageId = L.stageId; fullLog = L.fullLog;
      if (L.battle && !L.select) { battle = L.battle; window.__battle = battle; $('#hud').classList.remove('hidden'); $('#bottom').classList.remove('hidden'); buildHud(); updateHud(9); updateHud(9); $('#log').innerHTML = L.log; $('#stageName').textContent = L.stg; if (L.result) $('#result').classList.remove('hidden'); }
      else { battle = null; $('#hud').classList.add('hidden'); $('#bottom').classList.add('hidden'); $('#result').classList.add('hidden'); $('#select').classList.remove('hidden'); refresh(); }
      this.live = null;
    },
    restart() { startBattle({ seed: this.rec.seed, replay: true }); this.steps = 0; this.acc = 0; },
    step1() {
      seeded(() => battle.update(STEP)); this.steps++;
      if (this.steps % CHECK_EVERY === 0 && !this.warned) { const c = this.rec.check && this.rec.check[this.steps / CHECK_EVERY - 1]; if (c && c[1] !== hashB(battle)) { this.warned = true; $('#rpWarn').textContent = '⚠ 재현 불일치 (버전 차이?)'; console.warn('[replay] desync at', battle.time.toFixed(2)); } }
    },
    seek(T) {
      T = clamp(T, this.range[0], this.range[1]);
      if (T < battle.time - 1e-6) this.restart();
      RPQ.quiet = true; let g = 0;
      try { while (battle.time < T - 1e-9 && g++ < 200000) { this.step1(); battle.updateVisual(STEP); } } finally { RPQ.quiet = false; }
      const log = $('#log'); log.innerHTML = fullLog.slice(-LOG_KEEP).map(r => `<div class="logl${r.cls}">${r.html}</div>`).join('');
      updateHud(9); updateHud(9); this.ui();
    },
    play(v) { if (v && battle.time >= (this.stopAt || this.range[1]) - 0.01) this.seek(this.range[0]); this.playing = v; $('#rpPlay').textContent = v ? '❚❚' : '▶'; },
    pause() { this.playing = false; const b = $('#rpPlay'); if (b) b.textContent = '▶'; },
    frame(dt) {
      if (this.banner > 0) { this.banner -= dt; if (this.banner <= 0) { $('#rpBanner').classList.add('hidden'); this.play(true); } }
      else if (this.playing && !this.drag) {
        const end = this.stopAt != null ? this.stopAt : this.range[1];
        this.acc += dt * this.spd; let n = 0;
        while (this.acc >= STEP && n < 400) { if (battle.time >= end - 1e-9) { this.pause(); if (this.stopAt != null) { this.stopAt = null; toast('하이라이트 끝 — ★로 다시 보기'); } break; } this.step1(); this.acc -= STEP; n++; }
        battle.updateVisual(dt * this.spd);
      }
      updateHud(dt * (this.playing ? this.spd : 1)); this.ui();
    },
    ui() {
      const [s, e] = this.range, t = this.drag ? this.drag.t : battle.time, k = (t - s) / Math.max(0.01, e - s);
      $('#rpHead').style.left = (clamp(k, 0, 1) * 100) + '%'; $('#rpFill').style.width = (clamp(k, 0, 1) * 100) + '%';
      $('#rpTime').textContent = `${fmtS(t - s)} / ${fmtS(e - s)}`;
    },
    drawMarks() {
      const [s, e] = this.range, P = t => (clamp((t - s) / Math.max(0.01, e - s), 0, 1) * 100) + '%', box = $('#rpMarks'); box.innerHTML = '';
      for (const [i, h] of (this.rec.hl || []).entries()) { if (h.e < s || h.s > e) continue; const d = document.createElement('div'); d.className = 'hlb' + (i ? '' : ' best'); d.style.left = P(h.s); d.style.width = `calc(${P(h.e)} - ${P(h.s)})`; box.appendChild(d); }
      for (const [k, v] of [['A', this.A], ['B', this.B]]) if (v != null) { const d = document.createElement('div'); d.className = 'mk'; d.dataset.k = k; d.style.left = P(v); box.appendChild(d); }
      if (this.A != null && this.B != null) { const d = document.createElement('div'); d.className = 'ab'; d.style.left = P(Math.min(this.A, this.B)); d.style.width = `calc(${P(Math.max(this.A, this.B))} - ${P(Math.min(this.A, this.B))})`; box.appendChild(d); }
      $('#rpSvSeg').disabled = !(this.A != null && this.B != null && Math.abs(this.A - this.B) > 0.3);
      $('#rpSvHl').disabled = !(this.rec.hl && this.rec.hl.length);
      $('#rpHl').disabled = !(this.rec.hl && this.rec.hl.length);
    },
    potg(i = 0) {
      const h = (this.rec.hl || [])[i]; if (!h) { toast('하이라이트가 없어요'); return; }
      this.pause(); this.seek(Math.max(this.range[0], h.s)); this.stopAt = Math.min(this.range[1], h.e); this.potgI = i;
      const t = h.team >= 0 ? h.team : (battle.winner ? battle.winner.team : 0), m = battle.u.filter(u => u.team === t && !u.summon), face = m[m.length - 1] || battle.u[0];
      $('#rpBImg').src = Sprites.get(face.def).portrait; $('#rpBImg').style.borderColor = TEAM_COL[t] || '#ffd75e';
      $('#rpBTitle').textContent = i ? `하이라이트 ${i + 1}` : '최고의 플레이'; $('#rpBName').textContent = teamLabel(t);
      $('#rpBWhy').textContent = h.why.join(' · ');
      const el = $('#rpBanner'); el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetHeight; el.style.animation = ''; this.banner = 2.2; this.spd = 1; this.speedUI();
    },
    speedUI() { document.querySelectorAll('#rpCtl [data-rs]').forEach(x => x.classList.toggle('on', +x.dataset.rs === this.spd)); },
    file(kind) {
      const R = this.rec; let range;
      if (kind === 'hl') { const h = R.hl[this.potgI || 0] || R.hl[0]; range = [Math.max(this.range[0], h.s), Math.min(this.range[1], h.e)]; }
      else if (kind === 'seg') range = [Math.min(this.A, this.B), Math.max(this.A, this.B)];
      else range = this.range.slice();
      const o = { format: 'psreplay', v: 1, build: R.build, seed: R.seed, a: R.a, b: R.b, stage: R.stage, names: R.names, stageName: R.stageName, dur: R.dur, range: range.map(x => Math.round(x * 1000) / 1000), kind,
        hl: (R.hl || []).filter(h => h.e > range[0] && h.s < range[1]).map(h => ({ ...h, s: Math.max(h.s, range[0]), e: Math.min(h.e, range[1]) })), check: (R.check || []).filter(c => c[0] <= range[1] + 0.05), created: R.created, saved: new Date().toISOString() };
      return o;
    },
    async save(kind) {
      const o = this.file(kind), txt = JSON.stringify(o); let blob = new Blob([txt], { type: 'application/json' });
      if (txt.length > 65536 && window.CompressionStream) blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(); // 큰 파일은 gzip
      const d = new Date(), p = n => String(n).padStart(2, '0'), nm = { hl: '하이라이트', seg: '구간', full: '전체' }[kind];
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `PS_${o.a}_vs_${o.b}_${nm}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.psreplay`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      $('#rpSave').classList.add('hidden'); toast(`${nm} 저장 (${(blob.size / 1024).toFixed(1)}KB)`); return { blob, o };
    },
    async load(file) {
      try {
        let buf = new Uint8Array(await file.arrayBuffer());
        if (buf[0] === 0x1f && buf[1] === 0x8b) buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
        const o = JSON.parse(new TextDecoder().decode(buf)); if (o.format !== 'psreplay' || o.seed == null) throw new Error('형식 아님');
        return this.open(o);
      } catch (e) { console.warn('[replay] load failed', e); toast('리플레이 파일을 읽을 수 없어요'); return false; }
    },
  };
  window.Replay = { REC, RP, computeHL, hashB, BUILD };
  // 버튼 연결
  $('#rpOpen').onclick = () => { if (REC.last) RP.open(REC.last); };
  $('#rpPotg').onclick = () => { if (REC.last) RP.open(REC.last, { potg: true }); };
  $('#rpLoad').onclick = () => $('#rpFile').click();
  $('#rpFile').onchange = e => { const f = e.target.files[0]; if (f) RP.load(f); e.target.value = ''; };
  $('#rpPlay').onclick = () => { RP.stopAt = null; RP.play(!RP.playing); };
  $('#rpBack').onclick = () => { RP.stopAt = null; RP.pause(); RP.seek(RP.range[0]); };
  document.querySelectorAll('#rpCtl [data-rs]').forEach(x => x.onclick = () => { RP.spd = +x.dataset.rs; RP.speedUI(); });
  $('#rpHl').onclick = () => { const n = (RP.rec.hl || []).length; RP.potg(RP.potgI != null && RP.stopAt == null && RP.banner <= 0 ? (RP.potgI + 1) % Math.max(1, n) : RP.potgI || 0); };
  $('#rpA').onclick = () => { RP.A = battle.time; RP.drawMarks(); toast(`시작 지점 ${fmtS(RP.A - RP.range[0])}`, 1000); };
  $('#rpB').onclick = () => { RP.B = battle.time; RP.drawMarks(); toast(`끝 지점 ${fmtS(RP.B - RP.range[0])}`, 1000); };
  $('#rpSv').onclick = () => $('#rpSave').classList.toggle('hidden');
  $('#rpSvHl').onclick = () => RP.save('hl'); $('#rpSvSeg').onclick = () => RP.save('seg'); $('#rpSvFull').onclick = () => RP.save('full');
  $('#rpX').onclick = () => RP.close();
  { const sc = $('#rpScrub'); const tAt = e => { const r = sc.getBoundingClientRect(); return RP.range[0] + clamp((e.clientX - r.left) / r.width, 0, 1) * (RP.range[1] - RP.range[0]); };
    sc.addEventListener('pointerdown', e => { RP.drag = { t: tAt(e), was: RP.playing }; RP.pause(); RP.stopAt = null; sc.setPointerCapture(e.pointerId); RP.ui(); });
    sc.addEventListener('pointermove', e => { if (RP.drag) { RP.drag.t = tAt(e); RP.ui(); } });
    const up = () => { if (!RP.drag) return; const d = RP.drag; RP.drag = null; RP.seek(d.t); if (d.was) RP.play(true); };
    sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', up); }
  // 테스트/밸런싱용: 헤드리스 시뮬레이션
  window.BattleSim = {
    simulate(a, b, maxT = 300, stage = 'arena') {
      const bt = new Battle(a, b, {}, stage); const dt = 1 / 60;
      while (!bt.over && bt.time < maxT) bt.update(dt);
      return { end: bt.endType || (bt.fallen ? 'fall' : bt.over ? 'ko' : 'timeout'), stats: bt.stats, fell: !!bt.fallen, winner: bt.winner ? bt.winner.team : -1, time: bt.time, hpLeft: bt.winner ? bt.winner.hp / bt.winner.maxHp : 0 };
    },
  };
})();
