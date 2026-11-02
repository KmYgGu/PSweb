// 탈출맵 서버 설정: 모든 제한값/기본값은 여기 한 곳 (환경변수로 덮어쓰기 가능)
const env = process.env, int = (k, d) => { const v = parseInt(env[k], 10); return Number.isFinite(v) ? v : d; };
module.exports = {
  PORT: int('PORT', 10000),                                   // Render 가 PORT 를 넣어 줌
  GITHUB_TOKEN: env.GITHUB_TOKEN || '',                       // 맵 저장소 한정 Contents: Read and write (절대 클라이언트/저장소에 넣지 말 것)
  GITHUB_REPO: env.GITHUB_REPO || '',                         // 예: kmyggu/PSweb-maps
  GITHUB_BRANCH: env.GITHUB_BRANCH || 'main',
  GITHUB_API: (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, ''), // 테스트에서 모의 서버로 바꿈
  ADMIN_KEY: env.ADMIN_KEY || '',                             // 비어 있으면 관리자 기능 꺼짐
  IP_SALT: env.IP_SALT || '',                                 // 접속 주소 해시용 비밀 소금 (비어 있으면 ADMIN_KEY+저장소 이름으로 대체)
  ALLOWED_ORIGINS: (env.ALLOWED_ORIGINS || 'https://kmyggu.github.io,null').split(',').map(s => s.trim()).filter(Boolean), // null = file://
  REPORT_THRESHOLD: int('REPORT_THRESHOLD', 5),               // 신고가 이 수에 도달하면 확인 목록(review.json)에 들어감
  MAX_BODY: int('MAX_BODY', 200 * 1024),                      // 올리기 본문 최대 바이트
  TITLE_MAX: 30, AUTHOR_MAX: 20, DESC_MAX: 200,
  MIN_WALL_TILES: int('MIN_WALL_TILES', 12),                  // '대충 만든 맵' 방지: 벽 칸 최소 개수
  MIN_START_EXIT_DIST: int('MIN_START_EXIT_DIST', 400),       // 각 시작 지점 ~ 출구 중심 최소 거리(px)
  MAX_UPLOAD_TIME_LIMIT: int('MAX_UPLOAD_TIME_LIMIT', 300),   // 올리는 맵의 timeLimit 상한(초) — 무료 서버 CPU(0.1) 고려
  SIM_TIMEOUT_MS: int('SIM_TIMEOUT_MS', 90000),               // 재검증 시뮬 최대 시간(워커 강제 종료)
  UPLOAD_PER_HOUR: int('UPLOAD_PER_HOUR', 5), UPLOAD_PER_DAY: int('UPLOAD_PER_DAY', 20),
  REPORT_PER_HOUR: int('REPORT_PER_HOUR', 30),
  ADMIN_FAIL_PER_HOUR: 10,                                    // 관리자 키 틀림 허용 횟수 (주소별)
  BANNED_WORDS: ['씨발', '시발', '병신', '좆', '개새끼', 'fuck', 'shit', 'nigger'], // 간단 금칙어 (부분 일치, 대소문자 무시)
  ALLOWED_SIZES: [[720, 1280], [1080, 1920], [1440, 2560]],
};
