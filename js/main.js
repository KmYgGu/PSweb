/* UI / 화면 흐름 / 메인 루프 */
(() => {
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
  const RES = 2; // 내부 해상도 배율 (글자 선명도)

  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `scale(${s}) translate(${-W / 2}px, ${-H / 2}px)`;
  }
  addEventListener('resize', fit); fit();

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
      <div class="res"><span class="ba">기본공격</span> ${hitTag(c.attack) || '-'}</div>`;
  }
  function fmt(sd, v) { return sd.fmt ? sd.fmt(v) : Math.round(v); }
  function slotHTML(i) {
    const c = pick[i], tag = `<div class="tag">${i ? 'P2 · 레드' : 'P1 · 블루'}</div>`;
    if (!c) return tag + `<div class="empty">캐릭터를 선택하세요</div>`;
    const st = { ...STAT_DEFAULTS, ...c.stats };
    const stats = STAT_DEFS.map(sd => `<div class="stat"><span class="k">${sd.label}</span><span class="bar"><i style="width:${Math.min(100, st[sd.key] / sd.max * 100)}%;background:${c.color}"></i></span><span class="v">${fmt(sd, st[sd.key])}</span></div>`).join('');
    const skills = (c.skills || []).map(sl => `<div class="skill"><b>${sl.name}</b> <span class="cd">(쿨타임 ${sl.cd}초)</span> ${hitTag(sl)}<br>${(SKILLS[sl.id] || {}).desc || ''}${(sl.applies || []).map(a => ` <span style="color:${STATUS_DEFS[a.status].color}">[${STATUS_DEFS[a.status].name}${a.chance != null && a.chance < 1 ? ' ' + Math.round(a.chance * 100) + '%' : ''}]</span>`).join('')}</div>`).join('');
    return tag + `<div class="top"><img src="${Sprites.get(c).portrait}" alt=""><div class="n">${c.name}</div></div>${stats}${resistHTML(c)}
      <div class="skills"><div class="sh">스킬 ${c.skills.length}개</div>${skills}</div>`;
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
  Sprites.preload(CHARACTERS).then(() => {
    document.querySelectorAll('.card').forEach(el => { el.querySelector('img').src = Sprites.get(CHARACTERS.find(c => c.id === el.dataset.id)).portrait; });
    refresh();
  });

  // ---------- 전투 ----------
  let battle = null, speed = 1, disp = [0, 0], lag = [0, 0], lagHold = [0, 0];
  const frames = [$('#f0'), $('#f1')];
  document.querySelectorAll('#speed button').forEach(b => b.onclick = () => {
    speed = +b.dataset.s;
    document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('on', x === b));
  });

  function label(u) { return pick[0] === pick[1] ? `${u.def.name}(P${u.team + 1})` : u.def.name; }
  // 로그: 새 줄이 아래에서 들어오며 기존 줄을 위로 밀어 올림 (최대 3줄 표시, 위쪽은 잘림)
  const LOG_LINE = 20, LOG_KEEP = 4;
  function pushLog(cls, html) {
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
  function startBattle() {
    $('#select').classList.add('hidden'); $('#result').classList.add('hidden');
    $('#hud').classList.remove('hidden'); $('#bottom').classList.remove('hidden');
    $('#log').innerHTML = '';
    battle = new Battle(pick[0], pick[1], { onSkill: addLog, onVoice: addVoice, onEnd: showResult, onSystem: addSys, onStatus: addStatus }, stageId);
    $('#stageName').textContent = '🗺 ' + STAGE_DEFS[stageId].name;
    battle.u.forEach((u, i) => {
      disp[i] = lag[i] = u.maxHp; lagHold[i] = 0;
      frames[i].querySelector('img').src = Sprites.get(u.def).portrait;
      frames[i].querySelector('.nm').textContent = label(u);
      const rb = frames[i].querySelector('.resbars'); rb.innerHTML = ''; // 자원 바 (display: 'bar')
      for (const [k, R] of Object.entries(u.def.resources || {})) if (R.display === 'bar') rb.insertAdjacentHTML('beforeend', `<div class="resb" data-k="${k}" title="${R.name}" style="color:${R.color}"><div class="rf" style="background:${R.color}"></div></div>`);
    });
    window.__battle = battle;
  }
  function showResult(w) {
    $('#winImg').src = Sprites.get(w.def).portrait;
    $('#winImg').style.borderColor = TEAM_COL[w.team];
    const fl = battle.fallen;
    $('#winTxt').textContent = fl ? `${label(fl)} 크레바스에 추락! ${label(w)} 승리!` : `${label(w)} 승리!`;
    $('#winTxt').style.fontSize = fl ? '17px' : '';
    $('#winSub').textContent = `${STAGE_DEFS[stageId].name} · 전투 시간 ${battle.time.toFixed(1)}초 · 남은 체력 ${Math.ceil(w.hp)}/${w.maxHp}`;
    $('#result').classList.remove('hidden');
  }
  $('#again').onclick = startBattle;
  $('#reselect').onclick = () => {
    battle = null;
    $('#result').classList.add('hidden'); $('#hud').classList.add('hidden'); $('#bottom').classList.add('hidden');
    $('#select').classList.remove('hidden');
    active = 0; refresh();
  };

  function updateHud(dt) {
    battle.u.forEach((u, i) => {
      disp[i] += (u.hp - disp[i]) * Math.min(1, dt * 12);
      if (u.hp < lag[i]) { lagHold[i] += dt; if (lagHold[i] > 0.35) lag[i] += (u.hp - lag[i]) * Math.min(1, dt * 4); }
      else { lag[i] = u.hp; lagHold[i] = 0; }
      if (Math.abs(lag[i] - u.hp) < 0.5) lagHold[i] = 0;
      const f = frames[i], r = disp[i] / u.maxHp;
      const fill = f.querySelector('.fill');
      fill.style.width = (r * 100) + '%';
      fill.style.backgroundColor = r > 0.5 ? '#6fd38a' : r > 0.2 ? '#f2c94c' : '#ef6b5b';
      f.querySelector('.lag').style.width = (lag[i] / u.maxHp * 100) + '%';
      f.querySelector('.hpnum').textContent = `${Math.ceil(u.hp)} / ${u.maxHp}`;
      f.querySelectorAll('.resb').forEach(el => { const R = u.def.resources[el.dataset.k], v = u.res[el.dataset.k] || 0; el.firstChild.style.width = (v / R.max * 100) + '%'; el.classList.toggle('full', v >= R.max); });
    });
    $('#timer').textContent = battle.time.toFixed(1) + 's';
  }

  // ---------- 루프 (고정 스텝) ----------
  const STEP = 1 / 120;
  let last = performance.now(), acc = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (battle) {
      acc += dt * speed;
      let n = 0;
      while (acc >= STEP && n < 60) { battle.update(STEP); acc -= STEP; n++; }
      updateHud(dt);
    }
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    Render.draw(ctx, battle);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 테스트/밸런싱용: 헤드리스 시뮬레이션
  window.BattleSim = {
    simulate(a, b, maxT = 300, stage = 'arena') {
      const bt = new Battle(a, b, {}, stage); const dt = 1 / 60;
      while (!bt.over && bt.time < maxT) bt.update(dt);
      return { stats: bt.stats, fell: !!bt.fallen, winner: bt.winner ? bt.winner.team : -1, time: bt.time, hpLeft: bt.winner ? bt.winner.hp / bt.winner.maxHp : 0 };
    },
  };
})();
