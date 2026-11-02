// ===== 탈출맵 온라인 설정 (한 곳) =====
// ESCAPE_SERVER_URL: Render 에 배포한 중계 서버 주소 (끝에 / 없이). 비어 있으면 올리기/신고/관리자는 '서버가 아직 연결되지 않았어요'.
// MAPS_REPO: 공개 맵 저장소 (목록/불러오기는 서버를 거치지 않고 raw.githubusercontent.com 에서 직접 읽음 → 서버가 잠들어도 동작)
window.ESCAPE_CONFIG = {
  ESCAPE_SERVER_URL: 'https://psweb.onrender.com',
  MAPS_REPO: { owner: 'KmYgGu', repo: 'PSweb-maps', branch: 'main' },
  MAPS_RAW_BASE: '', // 비우면 https://raw.githubusercontent.com/<owner>/<repo>/<branch> (테스트 때만 바꿈)
};
