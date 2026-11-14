/* 게임 버전 (메인 화면 표시 + 브라우저 캐시 무효화용). 직접 고치지 말고 `node tools/bump_version.cjs` 로 올림
 * - index.html 의 모든 js/css 주소 뒤 ?v=버전, version.json 도 같이 바뀜 (푸시하면 새 파일을 바로 받게)
 * - 리플레이 호환 검사(main.js BUILD: 캐릭터·스테이지 목록 해시)와 탈출맵 서버 버전(server/index.js)과는 별개 */
(function (G) {
  G.APP_VERSION = '2026.11.14-10';
  // 상대 경로 그림/소리 주소 뒤에 ?v=버전 (data:, blob:, http: 등 절대 주소와 이미 ? 가 있는 주소는 그대로). file:// 에서도 동작
  G.assetV = function (u) { return typeof u === 'string' && u && !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u) && u.indexOf('?') < 0 ? u + '?v=' + G.APP_VERSION : u; };
})(typeof window !== 'undefined' ? window : globalThis);
