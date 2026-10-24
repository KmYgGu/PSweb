/* =========================================================
 * 카이바 덱 몬스터 혼 픽셀 스프라이트 — 직접 그린 오리지널 도트 (유희 몬스터와 같은 형식/배율)
 *  DUEL_SPRITES 에 추가. 오른쪽을 바라보는 방향으로 그림.
 * ========================================================= */
(() => {
  const S = DUEL_SPRITES;
  // 푸른 눈의 백룡 (하양 + 파랑 눈)
  const BEWD_ROWS = [
    '...........kk.........',
    '..........kwwk........',
    '.........kwwwwkk......',
    '..kk....kwwwwwwwkkk...',
    '.kwwk...kwwwwwbewwwk..',
    'kwggwk..kkwwwwwwwkkkk.',
    'kwgggwk..kkkwwwwk.....',
    '.kwgggwkk..kwwwk......',
    '..kwgggwwkkwwwwk......',
    '...kwwggwwwwwwwk...kk.',
    '....kwwwwwwwwwwwk.kwwk',
    '...kwwwwcwwwwwwwwkwwk.',
    '..kwwk.kwwcwwwwwwwwk..',
    '..kwk..kwwwkkwwkkkk...',
    '...k...kwwk..kwwk.....',
    '.......kckk...kckk....'];
  S.bewd = { s: 2.4, pal: { k: '#14182a', w: '#f4f8ff', g: '#a8c0e8', c: '#c8d8f0', b: '#40a0ff', e: '#9ae0ff' }, rows: BEWD_ROWS };
  S.bewdAlt = { s: 2.4, pal: { k: '#14182a', w: '#e8f0ff', g: '#8ab0f0', c: '#b0c8f0', b: '#ff6a3a', e: '#ffd08a' }, rows: BEWD_ROWS }; // 아백룡: 살짝 푸른 몸 + 붉은 눈빛
  S.phantasm = { s: 2.4, pal: { k: '#3a5a8a', w: '#dff2ff', g: '#9ad0ff', c: '#bfe6ff', b: '#ffffff', e: '#e8ffff' }, rows: BEWD_ROWS }; // 하얀 환상수: 반투명 느낌의 옅은 하늘색
  S.twilight = { s: 2.2, pal: { k: '#120a1e', w: '#7a4ac0', g: '#c890ff', c: '#5a3a9a', b: '#ffd040', e: '#fff0a0' }, rows: BEWD_ROWS };
  S.sapphire = { s: 2.1, pal: { k: '#0a1430', w: '#3a7ae0', g: '#9ad8ff', c: '#2a5ab8', b: '#e8ffff', e: '#ffffff' }, rows: BEWD_ROWS };
  // 궁극의 푸른 눈의 백룡: 머리 3개
  S.ultimate = { s: 2.6, pal: { k: '#14182a', w: '#f4f8ff', g: '#a8c0e8', c: '#c8d8f0', b: '#40a0ff', e: '#9ae0ff', y: '#ffe080' }, rows: [
    '..........kk......kk......',
    '.........kwwk....kwwk.....',
    '..kk....kwwbek..kwwbek....',
    '.kwwk...kwwwwk..kwwwwk.kk.',
    'kwggwk...kwwk....kwwk.kwwk',
    'kwgggwk...kwk..kkkwk.kwbek',
    '.kwgggwk..kwk.kwwwwk.kwwwk',
    '..kwgggwk.kwkkwwbewk..kwk.',
    '...kwwggwkkwwwwwwwk..kwk..',
    '....kwwwwwwwwwwwwwkkkwk...',
    '...kwwwwcwwywwwwwwwwwk....',
    '..kwwk.kwwcwwwwwwwwwk.....',
    '..kwk..kwwwkkwwkkkkk......',
    '...k...kwwk..kwwk.........',
    '.......kckk...kckk........'] };
  // 어둠의 어릿광대 사기
  S.sagi = { s: 2, pal: { k: '#140c1e', w: '#f0e8f0', p: '#8a3ac0', q: '#c070f0', y: '#ffd040', r: '#e03050', g: '#40c080' }, rows: [
    '....kk..kk......',
    '...kpqkkqpk.....',
    '..kppqkkqppk....',
    '..kkkwwwwkkk....',
    '...kwrwwrwk.....',
    '...kwwwwwwk.....',
    '....kwrrwk......',
    '..kpppyypppk....',
    '.kqppkyykppqk.g.',
    'kwk.kppppk.kwkgk',
    'kk..kqppqk..kk..',
    '....kp..pk......',
    '...kpk..kpk.....',
    '...kkk..kkk.....'] };
  // 미노타우로스
  S.minotaur = { s: 2, pal: { k: '#1a1010', b: '#8a5a3a', c: '#b07a50', h: '#e8e0c8', a: '#a0a8b8', l: '#d8e0ec', r: '#c03030', w: '#5a3a24' }, rows: [
    'h........h....kk',
    'hk.kkkk.kh...kal',
    '.hkbbbbkh...kaal',
    '..kbrbrbk...kaak',
    '..kbccbbk....kw.',
    '.kkbccbbkk...kw.',
    'kbbbbbbbbbk..kw.',
    'kbkbbccbbkbkkw..',
    'kbkbbccbbk.kbw..',
    '.k.kbbbbbk..k...',
    '...kwwwwwk......',
    '...kbbkbbk......',
    '...kbk.kbk......',
    '..kkk...kkk.....'] };
  // 램프의 요정 라진
  S.lajinn = { s: 2, pal: { k: '#140c20', b: '#3a5ab0', c: '#5a8ae0', s: '#7ab0ff', y: '#ffd040', r: '#ff6a3a', o: '#ffb060', w: '#ffffff' }, rows: [
    '.....kkk........',
    '....kyyyk.......',
    '...kcsssck......',
    '...kswsws k.....',
    '...kssssskk.....',
    '..kcbbbbbck.oro.',
    '.kccbyybbcckror.',
    'kcc.kbbbbk.kkr..',
    'kk..kcbbck......',
    '.....kccck......',
    '......kcck......',
    '.......kck......',
    '...kyyyyyyk.....',
    '..kyykkkkyyk....'] };
  // 드래곤의 통제자 (해골 갑옷 + 피리)
  S.controller = { s: 2, pal: { k: '#140c18', w: '#e8e0d0', g: '#a8a090', p: '#5a2a7a', q: '#8a4ab0', y: '#ffd040', r: '#ff3a4a' }, rows: [
    '...kkkkk........',
    '..kwwwwwk.......',
    '.kwrwwrwwk......',
    '.kwwwgwwwk......',
    '..kwkwkwk.......',
    '.kpppppppk......',
    'kqpkwwwkpqk.....',
    'kpkwgwgwkpkyyyy.',
    'kk.kwwwk.kkkkkky',
    '...kpppk........',
    '..kpqqqpk.......',
    '..kpk.kpk.......',
    '..kwk.kwk.......',
    '.kkk...kkk......'] };
  // X-헤드 캐논 (노랑 몸 + 어깨 캐논 2문)
  S.xHead = { s: 2, pal: { k: '#14141a', y: '#e8c040', o: '#b08a20', g: '#7a8090', l: '#c0c8d8', r: '#ff4040', b: '#4a7ad8' }, rows: [
    'kllk......kllk..',
    'kglk......kglk..',
    'kglk.kkkk.kglk..',
    'kgok.kyyyk.kgok.',
    '.koykyrryk.yok..',
    '..kyyyyyyyyyk...',
    '.kyykbyyybkyyk..',
    '.kyk.kyyyk.kyk..',
    '.kk..kooook.kk..',
    '.....kyk.kyk....',
    '....kyk...kyk...',
    '....kkk...kkk...'] };
  // Y-드래곤 헤드 (빨강 기계 용)
  S.yDragon = { s: 2, pal: { k: '#140a10', r: '#d03030', o: '#ff7a4a', g: '#8a90a0', l: '#c8d0e0', y: '#ffe060', e: '#9ae0ff' }, rows: [
    '.........kkk....',
    '........krrrk...',
    '..kk...krreyrk..',
    '.krrk..krrrrrrk.',
    'krllrk.kkrrkkkkk',
    'krlllrkkrrk.yyy.',
    '.krllrrrrk......',
    '..krrrrrrk..kk..',
    '...kggrrrrkkrrk.',
    '..kgk.krrrrrrk..',
    '..kk..kgk.kgk...',
    '......kkk.kkk...'] };
  // Z-메탈 캐터필러 (파랑 전차 로봇)
  S.zMetal = { s: 2, pal: { k: '#0c1018', b: '#3a5ab8', c: '#6a8ae0', g: '#6a7080', l: '#b8c0d0', y: '#ffd040', r: '#ff4040' }, rows: [
    '.....kkkkk......',
    '....kcccbbk.....',
    '....kbryrbk.....',
    '..kkkbbbbbkkk...',
    '.kccbbbbbbbbck..',
    '.kcbkbbbbbkbbk..',
    '.kk.kbbbbbk.kk..',
    '..kkkkkkkkkkk...',
    '.kgllgllgllgk...',
    'kglkglkglkglgk..',
    '.kgggggggggk....',
    '..kkkkkkkkk.....'] };
  // 블레이드 나이트
  S.bladeKnight = { s: 2, pal: { k: '#101018', a: '#c0c8d8', l: '#e8f0ff', b: '#3a4a90', r: '#c03040', y: '#ffd040', w: '#ffffff' }, rows: [
    '....kkk.........',
    '...kaaak......kw',
    '..kalkaak....kwk',
    '..kakkkak...kwk.',
    '...kaaak...kwk..',
    '..kbbybbk.kwk...',
    '.kabbybbakyk....',
    'kak.kbbbkkk.....',
    'kk..kbrbk.......',
    '...kbbrbbk......',
    '...kak.kak......',
    '...kak.kak......',
    '..kkk...kkk.....'] };
  // 카이저 글라이더 (황금 날개 용)
  S.kaiserGlider = { s: 2.2, pal: { k: '#1a1008', y: '#ffd040', o: '#c08a20', w: '#fff4b0', r: '#ff5030' }, rows: [
    'kk..............',
    'kwyk.......kkk..',
    'kwyyk.....kyyrk.',
    '.kwyyk...kyyyyk.',
    '.kwwyyk.kyyykkk.',
    '..kwwyyyyyyyk...',
    '...kwyyyoyyk....',
    '..kwwyyooyyyk...',
    '.kwyyyk.kyyyk.k.',
    'kwyyk...kyyyyyk.',
    'kkk......kkkkk..'] };
  // 파괴신 버사고 (검은 바람의 마신)
  S.berserkGod = { s: 2, pal: { k: '#0a0a12', d: '#2a2a3a', g: '#4a4a60', r: '#ff3a4a', y: '#ffd040', w: '#c8c8e0' }, rows: [
    '.k...kkkk...k...',
    'kgk.kddddk.kgk..',
    '.kgkdrddrdkgk...',
    '..kddddddddk....',
    '..kdwkwkwkdk....',
    '.kddddddddddk...',
    'kgdkdddyddkdgk..',
    'kgk.kdddddk.kgk.',
    'kk..kgdddgk..kk.',
    '....kddkddk.....',
    '...kdk...kdk....',
    '...kk.....kk....'] };
  // 뱀파이어 로드
  S.vampire = { s: 2, pal: { k: '#0c0810', s: '#e8e0f0', h: '#d8d8e8', p: '#3a1a4a', r: '#c01830', q: '#6a2a8a', w: '#ffffff' }, rows: [
    '....kkkkk.......',
    '...khhhhhk......',
    '...kssssskk.....',
    '...ksrssrk......',
    '...kswwssk......',
    'kk.krpppprk..kk.',
    'kpkkpqppqpkkpk..',
    'kppkpqrrqpkppk..',
    '.kpppqrrqpppk...',
    '..kkpqqqqpkk....',
    '....kpp.ppk.....',
    '....kp...pk.....',
    '...kkk...kkk....'] };
  // 정의의 아군 카이바맨 (백룡 투구의 히어로)
  S.kaibaman = { s: 2, pal: { k: '#14141c', w: '#f0f4ff', b: '#3a7ad8', e: '#9ae0ff', d: '#2a2a3a', r: '#c03040', g: '#a8b8d0' }, rows: [
    '.....kkkk.......',
    '....kwwwwk......',
    '...kwwbewwk.....',
    '..kwwwwwwwwk....',
    '..kkwgggwkk.....',
    '...kwwwwwk......',
    '..kdwwwwwdk.....',
    '.kwdddrdddwk....',
    'kwkdddrdddkwk...',
    'kk.kdddddk.kk...',
    '...kwdkdwk......',
    '...kdk.kdk......',
    '..kkk...kkk.....'] };
  // 카이저 씨호스 (해마 기사 + 삼지창)
  S.seahorse = { s: 2, pal: { k: '#081018', b: '#2a8ab0', c: '#5ac0e0', y: '#ffd040', l: '#e0e8f0', r: '#e04050' }, rows: [
    '....kkk.......y.',
    '...kcbbk.....yky',
    '..kcbrbk......k.',
    '..kcbbbbk.....k.',
    '...kkbbk......k.',
    '..kcbbbbkk....k.',
    '.kcbyyybbkkkkkk.',
    '.kcbbbbbbk......',
    '..kcbbbbk.......',
    '...kcbbk........',
    '....kcbk........',
    '...kbbk.........',
    '...kck..........',
    '....kk..........'] };
  // 파란 눈의 소녀
  S.blueGirl = { s: 2, pal: { k: '#141420', h: '#e8f0ff', s: '#f8dcc8', e: '#40a0ff', w: '#ffffff', b: '#a8c8f0' }, rows: [
    '....kkkkk.......',
    '...khhhhhk......',
    '..khhhhhhhk.....',
    '..khssssshk.....',
    '..khseseshk.....',
    '..khsssshhk.....',
    '..khkwwwkhk.....',
    '..kkwwbwwkk.....',
    '...kwwbwwk......',
    '..kwwwbwwwk.....',
    '..kwwwwwwwk.....',
    '...kks.skk......',
    '....ks.sk.......'] };
  // 머신 융합체: X/Y/Z 를 위아래로 쌓아 만듦 (행 합성)
  const stack = (...ids) => [].concat(...ids.map(id => S[id].rows));
  const palMix = (...ids) => Object.assign({}, ...ids.map(id => S[id].pal));
  // 팔레트 키가 겹치므로(k 등) 같은 문자는 같은 계열 색 → 합성체는 별도 팔레트로 다시 그림
  S.xyCannon = { s: 2, pal: { k: '#14141a', y: '#e8c040', o: '#b08a20', g: '#7a8090', l: '#c0c8d8', r: '#d03030', b: '#4a7ad8', e: '#9ae0ff' }, rows: [
    'kllk......kllk..',
    'kglk.kkkk.kglk..',
    'kgok.kyyyk.kgok.',
    '.koykyrryk.yok..',
    '..kyyyyyyyyyk...',
    '...kkyyyyykk....',
    '.........kkk....',
    '..kk...krrerk...',
    '.krrk..krrrrrrk.',
    'krllrkkkrrkkkkkk',
    '.krllrrrrk.yyy..',
    '..krrrrrrk......',
    '...kk..kk.......'] };
  S.xzCannon = { s: 2, pal: palMix('zMetal', 'xHead'), rows: [
    'kllk......kllk..',
    'kglk.kkkk.kglk..',
    'kgok.kyyyk.kgok.',
    '.koykyrryk.yok..',
    '..kyyyyyyyyyk...',
    '.kccbbbbbbbbck..',
    '.kcbkbbbbbkbbk..',
    '..kkkkkkkkkkk...',
    '.kgllgllgllgk...',
    'kglkglkglkglgk..',
    '.kgggggggggk....',
    '..kkkkkkkkk.....'] };
  S.yzDragon = { s: 2.2, pal: { k: '#0c1018', r: '#d03030', o: '#ff7a4a', b: '#3a5ab8', c: '#6a8ae0', g: '#6a7080', l: '#b8c0d0', y: '#ffe060', e: '#9ae0ff' }, rows: [
    '.........kkk....',
    '........krrrk...',
    '..kk...krreyrk..',
    '.krrk..krrrrrrkk',
    'krllrkkkrrkkkkyy',
    '.krllrrrrk......',
    '.kccbbbbbbbbck..',
    '.kcbkbbbbbkbbk..',
    '..kkkkkkkkkkk...',
    '.kgllgllgllgk...',
    'kglkglkglkglgk..',
    '.kgggggggggk....',
    '..kkkkkkkkk.....'] };
  S.xyzCannon = { s: 2.4, pal: { k: '#0c1018', y: '#e8c040', o: '#b08a20', r: '#d03030', b: '#3a5ab8', c: '#6a8ae0', g: '#6a7080', l: '#c0c8d8', e: '#9ae0ff', w: '#ffffff' }, rows: [
    'kllk.........kllk.',
    'kglk..kkkkk..kglk.',
    'kgok.kyyyyyk.kgok.',
    '.koykyrewryyykok..',
    '..kyyyyyyyyyyyk...',
    '..krrrrrrrrrrrk...',
    '.krrkrrrrrrrkrrk..',
    '..kkrrrrrrrrrkk...',
    '.kccbbbbbbbbbbck..',
    '.kcbkbbbbbbbkbbk..',
    '..kkkkkkkkkkkkk...',
    '.kgllgllgllgllgk..',
    'kglkglkglkglkglgk.',
    '.kgggggggggggggk..',
    '..kkkkkkkkkkkkk...'] };
  void stack;
})();
