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
function checkMap(raw, game) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('맵 JSON 형식이 아니에요');
  if (raw.format !== 'psescape' || raw.v !== 2) throw bad('psescape v2 맵만 올릴 수 있어요');
  if (!C.ALLOWED_SIZES.some(([w, h]) => raw.w === w && raw.h === h)) throw bad('맵 크기는 720×1280 / 1080×1920 / 1440×2560 중 하나여야 해요');
  const cols = raw.w / TILE, rows = raw.h / TILE;
  if (!Array.isArray(raw.grid) || raw.grid.length !== rows || raw.grid.some(r => typeof r !== 'string' || r.length !== cols || /[^#.]/.test(r))) throw bad('타일 격자(grid) 형식이 맞지 않아요');
  let n; try { n = game.ESCAPE.normalize(raw); } catch (e) { throw bad('맵 검증 실패: ' + e.message); }
  if (n.chars.length !== 2 || n.chars.some(id => !game.CHARACTERS.some(c => c.id === id))) throw bad('캐릭터 2종(chars)이 올바르지 않아요');
  if (n.timeLimit > C.MAX_UPLOAD_TIME_LIMIT) throw bad(`제한 시간은 ${C.MAX_UPLOAD_TIME_LIMIT}초 이하로 해 주세요`, 'limit');
  const walls = n.grid.reduce((a, r) => a + (r.match(/#/g) || []).length, 0);
  if (walls < C.MIN_WALL_TILES) throw bad(`벽 칸이 너무 적어요 (최소 ${C.MIN_WALL_TILES}칸, 현재 ${walls}칸)`, 'too_simple');
  const wallAt = (x, y) => n.grid[Math.floor(y / TILE)][Math.floor(x / TILE)] === '#';
  const ex = n.exit.x + n.exit.w / 2, ey = n.exit.y + n.exit.h / 2;
  for (let i = 0; i < 2; i++) {
    const s = n.starts[i]; if (wallAt(s.x, s.y)) throw bad(`P${i + 1} 시작 지점이 벽 위에 있어요`);
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
const contentHash = n => crypto.createHash('sha256').update(JSON.stringify([n.w, n.h, n.grid, n.starts, n.exit, n.chars, n.seed, n.timeLimit, n.rules])).digest('hex').slice(0, 20);
module.exports = { checkMap, checkText, contentHash, clean };
