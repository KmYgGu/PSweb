// 올리기 검증: 형식/크기, 글자 필터, 최소 조건, 내용 해시
const crypto = require('crypto'), C = require('./config');
const TILE = 40;
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim();
const len = s => Array.from(s).length;
const URL_RE = /(https?:\/\/|www\.|discord\.gg|\b[a-z0-9-]+\.(com|net|org|kr|io|gg|xyz|me|ly|co|link|app|site)\b)/i;
function textErr(label, s, min, max) {
  if (len(s) < min) return `${label}을(를) ${min}자 이상 입력해 주세요`;
  if (len(s) > max) return `${label}은(는) ${max}자 이하로 입력해 주세요`;
  if (URL_RE.test(s)) return `${label}에는 주소(URL)를 넣을 수 없어요`;
  const flat = s.replace(/[\s._\-*]/g, '').toLowerCase(); if (C.BANNED_WORDS.some(w => flat.includes(w))) return `${label}에 사용할 수 없는 말이 있어요`;
  return '';
}
const bad = (msg, code = 'invalid') => Object.assign(new Error(msg), { status: 400, code });
// raw: 클라이언트가 보낸 맵, game: headless ctx (ESCAPE, CHARACTERS)
// 선택 필드(파괴벽·움직이는 벽): 정규화가 조용히 고치거나 버리는 값이 있으면 거절 (클라이언트 값 불신, 보낸 그대로 저장되는지 확인)
const isInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
function checkExtras(raw, game, cols, rows) {
  const L = game.ESCAPE.LIM;
  if (raw.breakables !== undefined) {
    const B = raw.breakables; if (!Array.isArray(B) || B.length > L.brk) throw bad(`파괴벽은 ${L.brk}칸 이하 배열이어야 해요`);
    const seen = new Set();
    for (const k of B) {
      if (!k || typeof k !== 'object' || !isInt(k.c, 0, cols - 1) || !isInt(k.r, 0, rows - 1) || (k.m !== 'hits' && k.m !== 'hp')) throw bad('파괴벽 형식이 맞지 않아요 (c, r, n, m)');
      if (!isInt(k.n, 1, k.m === 'hp' ? L.brkHp : L.brkHits)) throw bad(`파괴벽 내구도는 횟수 1~${L.brkHits}, 체력 1~${L.brkHp} 정수여야 해요`);
      const key = k.c + ',' + k.r; if (seen.has(key)) throw bad('같은 칸에 파괴벽이 두 번 있어요'); seen.add(key);
      if (raw.grid[k.r][k.c] !== '.') throw bad('파괴벽은 빈칸(.) 위에만 놓을 수 있어요');
    }
  }
  if (raw.movers !== undefined) {
    const M = raw.movers; if (!Array.isArray(M) || M.length > L.movers) throw bad(`움직이는 벽은 ${L.movers}개 이하여야 해요`);
    for (const m of M) {
      if (!m || typeof m !== 'object' || !Array.isArray(m.path) || m.path.length < 2 || m.path.length > L.path) throw bad(`움직이는 벽 경로는 2~${L.path}칸이어야 해요`);
      if (!isInt(m.w, 1, L.mvTiles) || !isInt(m.h, 1, L.mvTiles)) throw bad(`움직이는 벽 크기는 1~${L.mvTiles}칸이어야 해요`);
      if (!isInt(m.speed, L.spdMin, L.spdMax)) throw bad(`움직이는 벽 속도는 ${L.spdMin}~${L.spdMax} 정수여야 해요`);
      if (!isInt(m.at, 0, m.path.length - 1) || (m.mode !== 'pingpong' && m.mode !== 'loop')) throw bad('움직이는 벽 형식이 맞지 않아요 (at, mode)');
      for (let i = 0; i < m.path.length; i++) {
        const p = m.path[i]; if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0], 0, cols - m.w) || !isInt(p[1], 0, rows - m.h)) throw bad('움직이는 벽 경로가 맵 밖으로 나가요');
        if (i && Math.abs(p[0] - m.path[i - 1][0]) + Math.abs(p[1] - m.path[i - 1][1]) !== 1) throw bad('움직이는 벽 경로는 상하좌우로 이어진 칸이어야 해요');
      }
    }
    const n = game.ESCAPE.normalize(raw).movers || []; if (n.length !== M.length || n.some((x, i) => x.mode !== M[i].mode)) throw bad('순환(loop)은 처음과 끝이 이어진 경로(4칸 이상)만 가능해요');
  }
}
function checkMap(raw, game) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('맵 JSON 형식이 아니에요');
  if (raw.format !== 'psescape' || raw.v !== 2) throw bad('psescape v2 맵만 올릴 수 있어요');
  if (!C.ALLOWED_SIZES.some(([w, h]) => raw.w === w && raw.h === h)) throw bad('맵 크기는 720×1280 / 1080×1920 / 1440×2560 중 하나여야 해요');
  const cols = raw.w / TILE, rows = raw.h / TILE;
  if (!Array.isArray(raw.grid) || raw.grid.length !== rows || raw.grid.some(r => typeof r !== 'string' || r.length !== cols || /[^#.~^v<>]/.test(r))) throw bad('타일 격자(grid) 형식이 맞지 않아요');
  checkExtras(raw, game, cols, rows);
  let n; try { n = game.ESCAPE.normalize(raw); } catch (e) { throw bad('맵 검증 실패: ' + e.message); }
  if (n.chars.length !== 2 || n.chars.some(id => !game.CHARACTERS.some(c => c.id === id))) throw bad('캐릭터 2종(chars)이 올바르지 않아요');
  if (n.timeLimit > C.MAX_UPLOAD_TIME_LIMIT) throw bad(`제한 시간은 ${C.MAX_UPLOAD_TIME_LIMIT}초 이하로 해 주세요`, 'limit');
  const walls = n.grid.reduce((a, r) => a + (r.match(/#/g) || []).length, 0) + (n.breakables || []).length + (n.movers || []).reduce((a, m) => a + m.w * m.h, 0); // 파괴벽·움직이는 벽 칸도 벽으로 셈
  if (walls < C.MIN_WALL_TILES) throw bad(`벽 칸이 너무 적어요 (최소 ${C.MIN_WALL_TILES}칸, 현재 ${walls}칸)`, 'too_simple');
  const wallAt = (x, y) => n.grid[Math.floor(y / TILE)][Math.floor(x / TILE)] === '#';
  const ex = n.exit.x + n.exit.w / 2, ey = n.exit.y + n.exit.h / 2;
  for (let i = 0; i < 2; i++) {
    const s = n.starts[i]; if (wallAt(s.x, s.y)) throw bad(`P${i + 1} 시작 지점이 벽 위에 있어요`);
    const sc = Math.floor(s.x / TILE), sr = Math.floor(s.y / TILE);
    if ((n.breakables || []).some(k => k.c === sc && k.r === sr)) throw bad(`P${i + 1} 시작 지점이 파괴벽 위에 있어요`);
    if ((n.movers || []).some(m => { const p = game.ESCAPE.moverPos(m, 0); return s.x >= p.x && s.x < p.x + m.w * TILE && s.y >= p.y && s.y < p.y + m.h * TILE; })) throw bad(`P${i + 1} 시작 지점이 움직이는 벽의 처음 위치와 겹쳐요`);
    const d = Math.hypot(s.x - ex, s.y - ey); if (d < C.MIN_START_EXIT_DIST) throw bad(`P${i + 1} 시작 지점이 출구와 너무 가까워요 (최소 ${C.MIN_START_EXIT_DIST}px, 현재 ${Math.round(d)}px)`, 'too_simple');
  }
  return { n, walls };
}
function checkText(body) {
  const title = clean(body.title), author = clean(body.author) || '익명', desc = clean(body.desc);
  const e = textErr('제목', title, 1, C.TITLE_MAX) || textErr('작성자', author, 1, C.AUTHOR_MAX) || (desc ? textErr('설명', desc, 0, C.DESC_MAX) : '');
  if (e) throw bad(e, 'text');
  return { title, author, desc };
}
// 내용 해시: 제목/작성자와 무관하게 '같은 맵 + 같은 조건' 이면 같은 값
const contentHash = n => { const a = [n.w, n.h, n.grid, n.starts, n.exit, n.chars, n.seed, n.timeLimit, n.rules]; if (n.breakables) a.push({ b: n.breakables }); if (n.movers) a.push({ m: n.movers }); return crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex').slice(0, 20); }; // 새 요소가 없으면 기존과 같은 해시
module.exports = { checkMap, checkText, contentHash, clean };
