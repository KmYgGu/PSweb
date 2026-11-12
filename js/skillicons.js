/* 스킬 아이콘 줄 (각 캐릭터 HP 바 아래): 픽셀 아트 아이콘 + 쿨타임 표시. 화면 전용
   - 전투 상태는 읽기만 함 (u.skills / u.skillT / u.res / u.bz / u.duel). 난수·전투 값·리플레이에 영향 없음
   - 아이콘 그림: 12×12 글자 그림(아래 ART) → 16×16 PNG (캐릭터 색 테두리 + 어두운 바탕 + 자동 외곽선). file:// 에서도 동작 (캔버스로 직접 생성)
   - 서버(Node, tools/headless.js)에서도 이 파일을 읽지만 불러올 때는 아무것도 실행하지 않음 (DOM 은 함수 호출 시에만 사용) */
(() => {
  // 팔레트: x = 캐릭터 색, X = 어두운 캐릭터 색, z = 밝은 캐릭터 색, . = 빈칸
  const PAL = { k: '#14161e', d: '#4a5064', g: '#8a92a8', l: '#c8d0e0', w: '#ffffff', r: '#ff4a4a', R: '#a01e28', o: '#ff9a2a', y: '#ffe066', Y: '#d89a28',
    n: '#a8703a', N: '#603c1c', s: '#f2c39a', G: '#6ee070', v: '#2e8a40', c: '#7ae0ff', C: '#dff8ff', b: '#4a8cff', B: '#2a4ab0', p: '#b070ff', P: '#5a2a9a', m: '#ff70c8', M: '#a02a78', h: '#2a2c38' };
  // 스킬 id → 12줄 '/' 구분 그림 (12×12)
  const ART = {
    // 검사
    dashSlash: '..........wC/.........wC./........wC../.cc....wC.../......wC..../.ccc.wC...../....wC....../..YwC......./...YY......./..n..Y....../.n........../n...........',
    // 궁수
    arrowVolley: '............/.x.....lw.../xnnnnnnnww../.x.....lw.../...x.....lw./..xnnnnnnnww/...x.....lw./.x.....lw.../xnnnnnnnww../.x.....lw.../.......G..../......GGG...',
    backStep: '............/....l......./...lw......./..lwwwwww.g./.lwwwwwww.g./..lwwwwww.g./...lw......./....l......./............/.xx...xx..../.xx...xx..../............',
    // 마법사
    fireball: 'y.........../.o........../..oo......../..rooo....../...oooyyo.../...ooyyyyo../...oyywwyo../...oywwwyo../...ooyyyoo../....rooor.../.....rrr..../............',
    teleport: '............/....pppp..../..pp....pp../.p..x..x..p./.p...ww...p./p...wCCw...p/p...wCCw...p/.p...ww...p./.p..x..x..p./..pp....pp../....pppp..../............',
    // 탱커
    ironWall: '............/..dddddddd../.dwwwwwwwwd./.dwlllllwld./.dwlxxxxlwd./.dwlxxxxlwd./.dwllxxllwd./..dwllllwd../..dwwllwwd../...dwwwwd.../....dwwd..../.....dd.....',
    groundSlam: '..gggggggg../..gwwwwwwg../..gllllllg../..gggggggg../.....nn...../.....nn...../.y...nn...y./..y..nn..y../nnnnnnnnnnnn/nNnnnNNnnnNn/.N..N..N..N./............',
    // 암살자
    shadowStrike: '..........w./.........wl./........wl../.P.....wl.../PPP...wl..../PPPP.wl...../.PPPYl....../..PPYY....../...nPYP...../..n..PP...../.n.....P..../............',
    // 창병
    lanceCharge: '............/.........y../........yyy./.........y../..........w./gg......lwww/nnnnnnnnllww/gg......lwww/..........w./............/............/............',
    // 성직자
    holyLight: '.....yy...../.....yy...../...yywwyy.../...yywwyy.../.....yy...../.....yy...c./.....yy..cc./..G.....cc../.GGG...cccc./..G.....cc../.......cc.../.......c....',
    pray: '....yyyy..../...y....y.../....yyyy..../............/.....ss...../....ssss..../....ssss..../...ss..ss.../...sxxxxs.../..ssxxxxss../..xxxxxxxx../............',
    // 광전사
    rage: '.r.r....r.r./.rr......rr./..rr....rr../rr........rr/............/............/............/............/rr........rr/..rr....rr../.rr......rr./.r.r....r.r.',
    // 라인하르트
    fireStrike: '.....oy...../....oyy...../....oyyo..../...oyywo..../...oywwyo.../...oywwyo.../...oywwyo.../...oyywyo.../....oyyo..../....oyo...../.....o....../............',
    rCharge: '....gggg..../...gllllg.../..glwwwllg../..glwxxwlg../g.glwxxwlg../..glwwwllg../g.glllllgg../..ggllllg.../g..gggggg.../............/.g.g.g....../............',
    barrier: '.cccccccccc./.cCbCbCbCbc./.cbCbCbCbCc./.cCbCbCbCbc./.cbCbCbCbCc./.cCbCbCbCbc./.cbCbCbCbCc./.cCbCbCbCbc./.cbCbCbCbCc./.cCbCbCbCbc./.cccccccccc./............',
    earthshatter: '....ggg...../....glg...../....ggg...../.....n....../.....n....../.....n....../....oyo...../...o.y.o..../..o..y..o.../.o...o...o../o....o....o./nnnnnnnnnnnn',
    // 이블린
    garroteBurst: 'l.........l./.l.......l../..l..o..l.../...looo.l.../...oyyyo..../..oyywyyo.../...oyyyo..../...looo.l.../..l..o..l.../.l.......l../l.........l./............',
    bindingSeal: '....oooo..../..oo....oo../.o..y..y..o./.o...yy...o./o...y..y...o/o..y....y..o/o..y....y..o/o...y..y...o/.o...yy...o./.o..y..y..o./..oo....oo../....oooo....',
    garrote: '............/...llllll.../..l......l../.l..r..r..l./.l...rr...l./.l...rr...l./.l..r..r..l./..l......l../...lll.ll.../......l...../.....l....../....l.......',
    wireSnatch: '..........y./....lll..y../...l...l..../..l..x..l.../..l.xzx.l.../..l..x..l.../...l...l..../....l.l...../.....l....../....l......./...l......../nnl.........',
    // 태도 귀무사
    ghostOn: '..........w./.........wl./....ll..wl../...lwwlwl.../..lwkwwl..../..lwwwkwl.../..lwwwwwl.../...lwlrl..../..lwl..R..../..l.l......./............/............',
    spirit: '....llll..../...lwwwwl.../..lwwwwwwl../..lwrwwrwl../..lwrwwrwl../..lwwwwwwl../..lwwkkwwl../..lwwwwwwl../..lwwwwwwl../..lwlwwlwl../..l.l..l.l../............',
    // 오리
    quack: '............/...xxxx...../..xxxxxx..w./..xxkxxx.w../.xxxxxxx..w./.oooooxx..../oooooo.x.w../..ooo..x..w./.oooooxx.w../oooooo.x..../.....xxx..../............',
    peck: '............/..xxxx....../.xxxxxx...../.xxkxxx...../.xxxxxx...../.xxxxooo..../..xxxoooo.../..xx...ooo../..xx......y./..xx...y.y../..xx..y.y.y./.......y....',
    flap: '............/.........xx./.......xxzx./.....xxzzx../...xxzzxx.../.xxzzxxx..../xzzxxxx...../xzxxx......./.xx........./..x........./.....g..g.../....g..g....',
    // 신비술사
    mysticBall: '............/...pppp...../..pzzzzp..../.pzwwzzxp.../.pzwzzzxp.../.pzzzzxxp.../.pzzzxxxp.../..pxxxxp..../...pppp...../.......g..l./.....gg..lll/.gggg.....l.',
    positioning: '....xxxx..../...xzzzzx.../..xzwwzzzx../..xzwkkzzx../..xzzkkzzx../..xzzzzzzx../...xzzzzx.../....xzzx..../.....xx...../..ll.xx.ll../.l...ll...l./..lllllllll.',
    accelerate: '............/pp.......x../..pp....xzx./....p....x../.....xx...../pppp.xzx...x/.....xx...xz/....p......x/..pp....x.../pp.....xzx../........x.../............',
    // 갈포드
    galMega: 'c..........c/.l........l./..l..yy..l../...l.yy.l.../....lyyl..../.....ww...../....lyyl..../...l....l.../..nYy..yYn../.nn......nn./nn........nn/............',
    galClone: '....xx....../...xxxx...../...xkkx...../..xxxxxx..../..x.xx.x..../....xx..PP../...x..xPPPP./...x..xPkkP./......PPPPPP/......P.PP.P/........PP../.......P..P.',
    galDrop: '....xx....../...xxxx...../...xkkx...../..xxxxxx..../....xx....../...x..x...../..nn.....y../.nnnn...yyy./.nnkn..yyyyy/.nnnn....y../..n.n....y../.........y..',
    plasmaDog: '...y......../..y...nn.nn./.yy..nnnnnn./..y..nkknkn./.y...nnnnnn./.....nnnkkn./.c..nnnnnn../c.c.nnnnnnn./.c.cnnn.nnn./...cnn...nn./..c.n.....n./............',
    dogDrop: '.....yy...../.....yy...../...yyyyyy.../....yyyy..../.....yy...../............/..nn....nn../..nnnnnnnn../..nkknnkkn../..nnnnnnnn../...nnkknn.../....nnnn....',
    galShock: '.....y....../....yy....../...yy...y.../..yyyy.yy.../.ycywcyy..../yywwwwcy..../..cwwwwyy.../..yccwcy..../...yy.yyy.../...y...yy.../..y.....y.../............',
    // 블레이드
    bladeMark: '............/..........x./...xxxx..xx./.xxzzzzxxx../xzzkkkkzzx../xzkkwwkkzx../xzzkkkkzzx../.xxzzzzxxx../...xxxx..xx./..........x./............/............',
    splitBlade: '............/.......Cw.../......Cwc.../.....Cwc..../....Cwc...../...Cwc....../..ccc......./..d.c.l...../.d...l.l..../.....l..l.../....l....l../...l.....l..',
    bladeStorm: '.....w....../.....C....../.w...C...w../..C..C..C.../...C.w.C..../....ccc...../wCCCcwcCCCw./....ccc...../...C.w.C..../..C..C..C.../.w...C...w../.....w......',
    bladeRide: '....xx....../...xxxx...../...xkkx...../...xxxx...../..x.xx.x..../....xx....../...x..x...../..x....x..../.CCCCCCCCCC./CwwwwwwwwwwC/.CCcccccccC./.....l..l...',
    // 브로리
    throwBlaster: '............/...vvvvv..../..vGGGGGv.../.vGGwwwGGv../.vGwwwwwGv../.vGwwwwwGv../.vGGwwwGGv../..vGGGGGv.../...vvvvv..../.....G...G../..G.....G.../............',
    groundBreak: '............/..nnnn....../.nnNNnn...../.nNNNNnn..../.nnNNnnn..../..nnnnn...../....nn....../..y.nn.y..../...y..y..gg./g......ggdgg/dgg..gggddgd/dddggdddddd.',
    leftoverKi: '.........vvv/........vGGG/.......vGwwG/.......vGwwG/........vGGv/........G.../.......G..../.....G....../...G......../..G........./.G........../G...........',
    // 파라가스
    lowerKi: '............/..x.....x.../.x..x.x..x../.x.x.w.x.x../.x.x.w.x.x../.x..x.x..x../..x.....x.../.....y....../.....y....../...yyyyy..../....yyy...../.....y......',
    deadPunisher: '.w...y...w../..w..y..w.../...p.y.p..../....ppp...../wyyypwpyyyw./....ppp...../...p.y.p..../..w..y..w.../.w...y...w../............/............/............',
    musukoCrush: '............/....sss...../...sssss..../...skkss..../s..sssss..s./ss..sss..ss./.ssxxxxxss../..xxxxxxx.../...xxxxx..../...xx.xx..../...xx.xx..../..xxx.xxx...',
    // 브로리 LSS
    bedrock: '.....w....../....www...../...w.w.w..../.....w....../.ggggggggg../.gllgllggd../.gggggggdd../.glgglggdd../.gggggdddd../.ggddddddd../..ddddddd.../............',
    soccer: '...xxx....../...xxx....../....x......./..xxxx....../...xx......./...xxxxx..wk/...x....wkkw/..x.....kwwk/..x.....wkkw/...........k/........g.g./.........g..',
    dedentan: '.vv........./vGGv......../vGwv..vv..../.vv..vGGv.../.....vGwv.../......vv.vvv/........vGGG/........vGww/........vGww/.........vvv/............/............',
    // 루델리안
    hellInferno: '.....o....../....oyo...../....oyo...o./.....o...oyo/..........o./.....RR...../....RkkR..../.....RR...../.o........../oyo.......o./.oyo.....oyo/..o.......o.',
    darkParallel: '..pppppppp../.p........p./p..PP......p/p.PkkP.....p/p.PkrP.PP..p/p..PP.PkkP.p/p.....PkrP.p/p......PP..p/.p....PP..p./..pp.PkkPp../....pPkrP.../......PP....',
    hellFire: '............/............/.o...o...o../oyo.oyo.oyo./ywy.ywy.ywy./oyo.oyo.oyo./.o...o...o../.r...r...r../.r...r...r../............/...RRRRRR.../..RRRRRRRR..',
    deepBloodEye: 'r..........r/.r........r./..r......r../...RRRRRR.../..RwwwwwwR../.RwwrRRrwwR./.RwwRkkRwwR./..RwwrrwwR../...RRRRRR.../..r......r../.r........r./r..........r',
    // 슈르프
    absorb: '....xxxx..../..xx....xx../.x..zzzz..x./.x.z....z.x./x.z..kk..z.x/x.z.kkkk.z.x/x.z.kkkk.z.x/x.z..kk..z.x/.x.z....z.x./.x..zzz..x../..xx....x.../....xxx.....',
    dustTornado: '.nnnnnnnnnn./..nYYYYYYn../..nnnnnnnn../...nYYYYn.../...nnnnnn.../....nYYn..../....nnnn..../.....nn...../.....nn...../......n...../....YnnnY.../..YY.....YY.',
    schTransform: '..ll....ll../..lml..lml../..lml..lml../..lml..lml../..llllllll../.llllllllll./.llkllllkll./.lllllmllll./..llllllll../...llllll.../.w...y...w../...w...w....',
    schFinal: '..x........./..xx......../..xxx......./.xxxxx....../.xkxxxx...../.xxxxxxxyo../..xxxxxxyyoo/...xxxxxyyyo/..xxx.xxyo../.xx..xx...../.x...x....../............',
    // 라미아
    lmStand: '..CCC......./.CwwwC....../.CwkwC..xx../.CwwwC.xxxx./CCCCCCCxkkx./C.CCC.Cxxxx./C.CCC..xxxxx/..C.C.xx.xx./..C.C....xx./.CC.CC...xx./........xxx./............',
    lmFreeze: '.....C....../...C.C.C..../....CwC...../.C..CwC..C../..C.CwC.C.../CCwwwcwwwCC./..C.CwC.C.../.C..CwC..C../....CwC...../...C.C.C..../.....C....../............',
    lmOrder: '.....y....../....yyy...../....yyy...../....yyy...../....yyy...../.....y....../............/.....y....../....yyy...../.....y....../............/............',
    lmCircle: '.....w....../..w..y..w.../...y.y.y..../....yyy...../wyyyCCCyyyw./....CwC...../....CCC...../...yyyyy..../..y..y..y.../.w...y...w../.....w....../............',
    lmSpread: '..x......x../.xzx....xzx./..x......x../..y......y../..y......y../..y......y../............/.....x....../....xzx...../.....x....../.....y....../.....y......',
    // 미츄헨
    mcRecall: '..ggggg...../.glllllg..../.gllwllg..../..gglgg...../....n......./....n......./....n...c.../....n..c..../....n.c...../.c.cn......./..c.c.c...../.c.c..c.....',
    mcDump: '........y..y/.......y..y./....w..y.y../.ggggggy..y./dgllllgggg../dgggggggg.../dddg.nn...../...d.nn..y../.....nn.y.../....nnn...../............/............',
    mcRicochet: 'd.........../d.....y...../d....y.y..../d...y...y.../d..y.....y../d.y.......y./dw.........w/d.........../d.........../dddddddddddd/............/............',
    mcQuick: '............/............/............/.l........../....l......./l.l....yyy../...l..ywwyy./l.l....yyy../....l......./.l........../............/............',
    mcThrow: '.....l....../...l.l....../....g......./..gggggl..../.glllllg..l./.gllwllg..../..glllg...../...gnn....../..l.nn....../.....nn...../.l....n...../............',
    mcReload: '............/..y..y..y.../.yYy.yYyyYy./.yYy.yYyyYy./.yYy.yYyyYy./.YYY.YYYYYY./.nnn.nnnnnn./............/...gggggg.../..g......g../.gg.......g./gg..........',
    // 베르제브트
    bzHole: '....PPPP..../..PP....PP../.P..pppp..P./.P.p....p.P./P.p..kk..p.P/P.p.kkkk.p.P/P.p.kkkk.p.P/P..p.kk.p..P/.P..p..p..P./.P...pp...P./..PP....PP../....PPPP....',
    bzSplit: '...xxx...dd./..xxxxx.dddd/..xkkxx.dkkd/..xxxxx.dddd/.xx.x...dddd/.x..xxx..dd./xx..x.x..dd./x...x.x..d.d/....x.x..d.d/...xx.xx.d.d/............/............',
    bzSlam: '.....x....../.....xxx..../.....xxxx.../.....xxx..../.....x....../.....n....../.....n....../.....n....../..y..n..y.../.y...n...y../yy..nnn..yy./....yyy.....',
    bzScythe: '...lllll..../..lwwwwwl.../.lw....lnl../.l.......n../.l........n./..........n./.........n../........n.../.......n..../......n...../.....n....../....n.......',
    bzThorns: '............/..G.......G./.Gm......Gm./G.........G./....G......./...Gm.....G./..G......Gm./........G.../.G........../Gm......G.../G......Gm.../.......G....',
    bzRose: '............/....xxx...../...xzzxx..../..xxzxxzx.../..xzxxzxx.../..xxzzxxx.../...xxxxx..../.....G....../...GGG....../.....G.GG.../.....GG...../.....G......',
    // 샌즈
    snTele: '..x.....w.../.x.x...w.w../x...x...w.../.x.x......../..x........./........x.x./.w........../w.w...x...x./.w........../.......x.x../............/.....w......',
    snGravity: '..bb..bb..../.bbbbbbbb.../.bbwbbbbb.../.bbbbbbbb.../..bbbbbb..../...bbbb...../....bb....../............/.....w....../.....w....../...wwwww..../....www.....',
    snGaster: '..ww....ww../.www....www./.wwwwwwwwww./wwwwwwwwwwww/wwkkwwwwkkww/wwkkwwwwkkww/.wwwwwwwwww./.wwkwwwwkww./..wkwwwwkw../..wkkkkkkw../...wwwwww.../............',
    snBlue: '.bb........./bbbb......../bbbbb......./.bbbb......./...bbb....../....bbb...../.....bbb..../......bbbb../.......bbbbb/........bbbb/.........bb./............',
    snBones: '.ww..ww..ww./wwwwwwwwwwww/.ww..ww..ww./.ww..ww..ww./.ww..ww..ww./.ww..ww..ww./.ww..ww..ww./.ww..ww..ww./.ww..ww..ww./.ww..ww..ww./wwwwwwwwwwww/.ww..ww..ww.',
    // 겐지
    gjDeflect: '..........w./.........wl./........wl../.......wl.../......wl..../.....wl...../..y.Ywy...../.yy..Yy.yy../yyyyyy.yyyy./.yy..n...yy./..y.n.....y./...n........',
    gjBlade: '....xxxx..../..xx.xx.xx../.x..xzzx..x./....xkzx..../...xzzzzx.../...xzzwzx.../....xzwx.w../.....zw.w.../....xwww..../...xwwx...../..Y.Y......./.n.Y........',
    gjClimb: 'dddd......../dggd...x..../dddd..xxx.../dgdd...x..../dddd..xxx.../dggd.x.x.x../dddd...x..../dgdd..x.x.../dddd.x...x../dggd......../dddd......../dgdd........',
    gjDash: '..........ww/.........wwz/........wwz./.xx....wwz../......wwz.../.xxx.wwz..../....wwz...../..xwwz....../...Yz......./..n.Y......./.n........../n...........',
    gjFan: '.....l....../.....wl.l.../.....lkwl.../...l.lwl..../.......l..../............/.l........l./.wl.l.....wl/lkwl.....lkw/.lwl......lw/..l........l/............',
    gjTriple: '..l........./..wl.l....../.lkwl......./..lwl......./...l..l...../......wl.l../.....lkwl.../......lwl.../.......l..l./..........wl/.........lkw/..........lw',
    // 육군보병
    arRoll: '....xxxx..../..xx....xx../.x........x./.x..dddd..w./x..d....d.ww/x.d......dw./x.d......d.x/x..d....d..x/.x..dddd..x./ww........x./.ww.....xx../..wxxxxx....',
    arAim: '.....rr...../.....rr...../...rr..rr.../..r......r../..r......r../rr...rr...rr/rr...rr...rr/..r......r../..r......r../...rr..rr.../.....rr...../.....rr.....',
    arGear: '............/...nnnnnn.../..nNNNNNNn../..nNnnnnNn../..nnnnnnnn../..nnYnnYnn../..nnnnnnnn../..nnnnnnnn../..nNnnnnNn../..nnnnnnnn../...nn..nn.../............',
    arWhistle: '..........w./.....w...w../......w.w.../..yyyyy...../.yYYYYyy..../yYYYYYYYy.../yYYkkYYYy.../yYYkkYYyy.../.yYYYYyy..../..yyyy.y..../.......y..../.......yy...',
    arSpray: '.........y.y/........y.y./.......y.y../.ggggggggy../dglllllgg.y./dgggggggg.../.dg..nnn.y../..d..nn..y.y/....nn....y./...nn......./............/............',
    arCollect: '.........y../..........Y./....y......./.....Y....../..y......y../...Y......Y./............/..ss..ss..../.ssssssss.../.ssssssss.../..ssssss..../...ssss.....',
    arGrenade: '.....dd...../....dggd.y../....dddd.y../...vvvvvvy../..vGvvvvvv../.vGvvGvvGvv./.vvvvvvvvvv./.vGvvGvvGvv./.vvvvvvvvvv./..vGvvGvvv../...vvvvvv.../............',
    arFire: '............/...yy..yy..y/..ywwyywwyyw/...yy..yy..y/............/............/.dddddddddd./dgggggggggd./dgllllllggg./ddddg.ddd.../...dg......./....d.......',
    // 오쿠야스
    okSwat: '.....s.s.s../....sssssss./...ssssssss./...ssssssss./..sssssssss./.sssssssss../.sssssss..../..sssss...../...ss...g.g./........g.g./.....g.g..../............',
    okErase: '............/kkkkkkkkkkkk/lllllllllllk/kkkkkkkkkkkk/............/..x.x.x...../..xzxzxzx.../..xzzzzzx.../..xzzzzzxx../...xzzzzzx../....xxxxx.../............',
    okFace: '............/...xxxxxx.../..xzzzzzzx../..xzxzxzxx../..xzxzxzxx../..xzzzzzzx../..xxxxxxxx../...xxxxxx..y/....xxxx..y./.........y../..y.y..y..../...y.y......',
    okBarrage: '.xxxx......./xzzzzx....../xzxzxx..xxxx/xxxxxx.xzzzz/.xxxx..xzxzx/.......xxxxx/.xxxx...xxxx/xzzzzx....../xzxzxx..y.y./xxxxxx...y../.xxxx...y.y./............',
    okWarp: 'xx........xx/xz.y.y.y.xzx/xx........xx/............/k.k.k.k.k.k./.k.k.k.k.k.k/k.k.k.k.k.k./............/....xxxx..../...xzzzzx.../...xzzzzx.../...xxxxxx...',
    // 죠스케 (js/josuke.js)
    jsRestore: 'g....m....g./.g...m...g../..g..m..g.../............/mmm.nnnn.mmm/....nNNn..../....nNNn..../....nnnn..../............/..g..m..g.../.g...m...g../g....m....g.',
    jsFix: '............/..mmm..mmm../.mmmmmmmmmm./.mmmmwwmmmm./.mmmmwwmmmm./.mmwwwwwwmm./.mmwwwwwwmm./..mmmwwmmm../...mmwwmm.../....mmmm..../.....mm...../............',
    jsShard: '............/...mmmmmm.../..m......m../.m........m./.m........m./.m.....n..m./.m....nNn.../.m...nNNNn../.m........../mwm........./.mw........./..m.........',
    jsComb: '...hhhhhh.../.hhhhhhhhh../hhhhhhhhhh../..hhhhhhhh../...ssssss.../...ssssss.../............/.YYYYYYYYYY./.YYYYYYYYYY./.Y.Y.Y.Y.Y../.Y.Y.Y.Y.Y../............',
    // 메가톤맨 죠나단 죠죠 (js/jonathan.js)
    jjCoward: '............/y...y...y.../.y...y...y../..y...y...y./...yy..yy..y/..y...y...y./.y...y...y../y...y...y.../............/.xxxxxxxxxx./.xzzzzzzzzx./.xxxxxxxxxx.',
    jjHate: '.....r....../....rrr...../...r.r.r..../.....r....../..ssssssss../.ss.k..k.ss./.ss..kk..ss./.ssssssssss./.sss.kk.sss./.ss.k..k.ss./..ssssssss../............',
    jjSpeedwagon: '............/....NNNN..../...NNNNNN.../...NNNNNN.../...nnnnnn.../lwlwlwlwlwlw/wgggggggggw./.lwlwlwlwlw./............/..YYYYYYYY../..YsssssY.../...ssrsss...',
    jjScarlet: '....rrrr..../...roooor.../..roooooor../..rossssor../..rsssssor../..rssssssr../...rssssr.../....rrrr..../.r...rr...r./..r..rr..r../...r.rr.r.../....r..r....',
    jjWater: '............/.....yy...../....y..y..../...y.yy.y.../....y..y..../.....yy...../............/cc..cc..cc../.cccc.cccc.c/C..CC..CC..C/.CC..CC..CC./............',
    jjSilver: '....l.l.l.../...lllllll../...lwlwlwl../...lllllll../..llwwwwll../..lllllll.../...lllll..y./....lll..yy./.........y../........yyy./.........y../........y...',
    jjHeart: '.y........y./..y......y../...YY..YY.../..YyyYYyyY../..YyyyyyyY../..YyyyyyyY../...YyyyyY.../....YyyY..../.....YY...../..y......y../.y........y./............',
    // 디오 브란도 (js/dio.js)
    dioSplit: '....CCCC..../..CCcCCcCC../.CcCCwCCcCC./.CCcCwCCCcC./CCCCw.wCCCCC/CcCw...wCcCC/CCw.....wCCC/.w.......w../..c.....c.../.c.......c../c.........c./............',
    dioFreeze: '.....C....../..C..C..C.../...C.C.C..../....CCC...../CCCCCwCCCCC./....CCC...../...C.C.C..../..C..C..C.../.....C....../............/.c.c.c.c.c../............',
    dioMonkey: '....yyyy..../..yy....yy../.y........y./y..........y/............/...nnnnnn.../..nsssssssn./..nsksskssn./..nssssssn../...nsrrsn.../....nnnn..../............',
    dioWry: 'r.....r...../.r...r....../..r.r...YY../...r...YYYY./..r.r..YssY./.r...r.YYYY./r.....r.yy../......xxxxx./.....xxxxxx./......xxxxx./.......x..x./.......x..x.',
    dioRipper: '............/..ss......../.srs.wwwwwww/..ss......../............/..ss......../.srs.wwwwwww/..ss......../............/.......C.C.C/............/............',
    dioExtract: '.....R....../.....R....../....rRr...../....rrr...../...rrrrr..../..rrrwrrr.../..rrwrrrr.../..rrrrrrr.../...rrrrr..../....rrr...../.p..p..p..../p.p.p.p.p...',
    // 듀얼리스트 (유희·카이바·구울즈): 드로우 / 몬스터 / 마법 / 함정
    dlDraw: '..y........./.yyy......../yyyyy......./..y.wwwwwww./..y.wnnnnnw./....wnNNNnw./....wnNYNnw./....wnNNNnw./....wnnnnnw./....wnnnnnw./....wwwwwww./............',
    dlMon: '............/..YYYYYYYY../..YoooooxY../..YolllloY../..YolxxloY../..YolxxloY../..YolllloY../..YoooooxY../..YooooooY../..YokokooY../..YYYYYYYY../............',
    dlSpell: '............/..vvvvvvvv../..vGGGGGGv../..vGwwwwGv../..vGwccwGv../..vGwccwGv../..vGwwwwGv../..vGGGGGGv../..vGG.GGGv../..vGG.GGGv../..vvvvvvvv../............',
    dlTrap: '............/..MMMMMMMM../..MmmmmmmM../..MmwwwwmM../..Mmw..wmM../..Mmw..wmM../..MmwwwwmM../..MmmmmmmM../..MmmkmmmM../..MmmmmmmM../..MMMMMMMM../............',
    // 아오오니 (js/aooni.js)
    aoChase: '...XXXXXX.../..XzzwwzzX../..xzzzwzzx../l.XkkxxkkX../..kwkwxkwk../ll.xxwxxx.../..Xxxzzxx.../l..XkkkkX.../...XXxxXX.../....xxxx..../...xX..Xx.../...XX..XX...', // 원본 얼굴 (큰 머리·이마 반사광·그늘진 눈·콧등 줄) + 달려오는 몸, 속도선
    aoSlam: '.nnnn......./.nNNn..nnnn./.nnnn..nNNn./.......nnnn./..k........./.......k..../...nnnn...../...nNNn...../...nnnn...../.g.......g../gggggggggggg/dddddddddddd',
    aoCloset: '.NNNNNNNNNN./.NnnnnNnnnN./.Nn..nNn..N./.Nn..nkn..N./.NnnnwkwnnnN/.Nn..nkn..N./.Nn..yky..N./.Nn..nkn..N./.NnnnnknnnnN/.NNNNNNNNNN./.N........N./............',
    aoDoor: '.....yy...../....yyyy..../...yy..yy.../..NNNNNNNN../..NnnnnnnN../..Nn.nn.nN../..Nn.nn.nN../..NnnnnnyN../..Nn.nn.nN../..Nn.nn.nN../..NnnnnnnN../dddddddddddd',
    // 잭오랜턴 (js/jacko.js)
    jackStep: '....zzzz..../..zz....zz../.z...kk...z./z...kxxk...z/....kxxk..../.....kk...z./....xxxx..z./...x.xx.x.z./.z..x..x..z./..z.x..x.z../...zzz.zz.../............',
    jackTower: '..o......o../.....PP...../...kRRRRk.../..kRoRRoRk../..kRRRRRRk../..kRooooRk../...kRRRRk.../o....dd....o/.....dd...../.....dd...../....dddd..../...dddddd...',
    jackHead: '......P...../..rr.PP...../.rRrRRRRr.../hRRRRRRRRRh./hRyyRRRyyRh./hRyyRRRyyRh./hRRRRyRRRRh./hRyRyyyRyRh./h.RyyyyyyR.h/h..RRRRRR..h/h....oo....h/.....yo.....',
    jackFlame: '....oo....../...o..o...../..o....o..../.o......o.../.y.......o../yyy.....oyo./.y......yyy./........oyo./..y........./.yyy..o...../..y..oyo..../.....yyy....',
    jackLamp: '..........o./.........oy./....yy...o../...YyyY..Y../..YyyyyYYY../.YyywyyyY.../.YyyyyyyY.../..YYYYYY..../....YY....../...YYYY...../..dddddd..../............',
    // 그림이 없는 스킬 (새 캐릭터 등): 기본 별 모양
    _default: '............/.....xx...../.....xx...../....xzzx..../xxxxxzzxxxxx/.xxzzwwzzxx./..xxzwwzxx../...xzzzzx.../...xzxxzx.../..xzx..xzx../..xx....xx../............',
  };
  const ALIAS = { schCard: 'dlMon' }; // 슈르프가 듀얼리스트에게서 흡수한 카드
  const hex = h => { h = String(h || '#888').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  // 16×16 RGBA 픽셀 (DOM 없이 계산)
  function pixels(id, color) {
    const S = 16, px = new Uint8ClampedArray(S * S * 4), X = hex(color);
    const set = (x, y, c, a = 255) => { const i = (y * S + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = a; };
    const loc = { x: X, X: mix(X, [0, 0, 0], 0.45), z: mix(X, [255, 255, 255], 0.5) };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { // 테두리(캐릭터 색, 모서리 둥글게) + 바탕
      const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
      if (edge && (x === 0 || x === S - 1) && (y === 0 || y === S - 1)) continue;
      if (edge) set(x, y, y < S / 2 ? mix(X, [255, 255, 255], 0.15) : mix(X, [0, 0, 0], 0.25));
      else set(x, y, mix(mix(X, [22, 24, 34], 0.78), [10, 11, 16], y / S * 0.6));
    }
    const rows = (ART[id] || ART[ALIAS[id]] || ART._default).split('/'), G = [];
    for (let y = 0; y < 12; y++) { G.push([]); for (let x = 0; x < 12; x++) { const ch = (rows[y] || '')[x] || '.'; G[y].push(ch === '.' ? null : loc[ch] || (PAL[ch] ? hex(PAL[ch]) : null)); } }
    const on = (x, y) => x >= 0 && y >= 0 && x < 12 && y < 12 && G[y][x];
    for (let y = -1; y < 13; y++) for (let x = -1; x < 13; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) set(x + 2, y + 2, [11, 12, 18], 235); // 외곽선
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (G[y][x]) set(x + 2, y + 2, G[y][x]);
    return px;
  }
  const urls = new Map();
  function url(id, color) {
    const key = id + '|' + color; let u = urls.get(key); if (u) return u;
    try { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'), im = x.createImageData(16, 16); im.data.set(pixels(id, color)); x.putImageData(im, 0, 0); u = c.toDataURL('image/png'); }
    catch (e) { u = ''; }
    urls.set(key, u); return u;
  }

  // ---------- HUD 줄 ----------
  // 스킬 주인 색 (흡수한 스킬·LSS 스킬도 원래 주인 색으로)
  let OWNER = null;
  function owner() {
    if (OWNER) return OWNER; OWNER = {};
    for (const c of (window.CHARACTERS || [])) {
      (c.skills || []).forEach(s => { OWNER[s.id] = OWNER[s.id] || c.color; });
      if (c.partner) (c.partner.skills || []).forEach(s => { OWNER[s.id] = OWNER[s.id] || c.partner.color; });
      if (c.lss) (c.lss.skills || []).forEach(s => { OWNER[s.id] = OWNER[s.id] || (c.lss.form && c.lss.form.color) || c.color; });
    }
    return OWNER;
  }
  // 듀얼리스트: 스킬 슬롯 대신 턴 행동 4칸 (드로우 / 몬스터 / 마법 / 함정). 템포 값은 duel.js 기본값 + 캐릭터별 보정(duelist.cfg)
  const DCFG = { FIRST_DRAW: 1.0, DRAW_DELAY: 0.4, MIN_WAIT: 0.8, WAIT_TIMEOUT: 3.0 };
  const DUEL_SLOTS = [{ k: 'draw', id: 'dlDraw', name: '드로우' }, { k: 'monster', id: 'dlMon', name: '몬스터 카드' }, { k: 'spell', id: 'dlSpell', name: '마법 카드' }, { k: 'trap', id: 'dlTrap', name: '함정 카드' }];
  const rows = []; // { u, el, key, icons: [{ slot, el, ov, num, max, prev, ready }] }
  const fmt = t => t >= 10 ? String(Math.round(t)) : t >= 1 ? String(Math.ceil(t)) : '';
  function iconEl(id, color, title, small) {
    const el = document.createElement('span'); el.className = 'ski'; el.title = title;
    el.innerHTML = `<img alt="" src="${url(id, color)}"><i class="ov"></i><b class="cn"></b>`;
    return el;
  }
  function visible(u) { return (u.skills || []).map((s, i) => ({ s, i })).filter(o => !o.s.hidden); }
  function skillKey(u) { return u.def && u.def.duelist && u.duel ? 'duel' : visible(u).map(o => o.s.id + ':' + o.i + (o.s.schCopied ? '*' : '')).join(','); }
  function fill(R) {
    const u = R.u; R.el.innerHTML = ''; R.icons = []; R.key = skillKey(u);
    R.el.classList.toggle('duel', R.key === 'duel');
    if (R.key === 'duel') {
      for (const D of DUEL_SLOTS) { const el = iconEl(D.id, u.def.color, D.name); R.el.appendChild(el); R.icons.push({ duel: D.k, el, ov: el.querySelector('.ov'), num: el.querySelector('.cn'), prev: null, ready: false }); }
      return;
    }
    const own = owner();
    for (const { s, i } of visible(u)) {
      const copied = !!s.schCopied, lss = !!(u.def.lss && (u.def.lss.skills || []).includes(s)); // 흡수한 스킬·LSS 스킬: 원래 주인(형태) 색 테두리
      const from = copied && (window.CHARACTERS || []).find(c => c.id === s.schFromId || c.name === s.schFrom); // 흡수: 빼앗긴 캐릭터 색
      const col = copied ? (from && from.color) || own[s.id] || u.def.color : lss && own[s.id] ? own[s.id] : u.def.color || own[s.id];
      const el = iconEl(s.id, col, `${s.name}${copied ? ' (흡수)' : ''} · 쿨타임 ${s.cd}초`);
      if (copied) { el.classList.add('abs'); el.insertAdjacentHTML('beforeend', `<s style="background:${u.def.color}"></s>`); }
      R.el.appendChild(el);
      const t = u.skillT[i] || 0;
      R.icons.push({ slot: s, i, el, ov: el.querySelector('.ov'), num: el.querySelector('.cn'), max: Math.max(s.cd || 1, t), prev: t, ready: t <= 0 });
    }
    R.el.classList.toggle('many', R.icons.length > 7);
  }
  function pulse(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function short(u, s) { // 자원 부족 (읽기만): 범용 자원 cost/requires, 베르제브트 마력
    if (typeof s.cost === 'number') return !!(u.bz && (u.bz.tired || u.bz.mana < s.cost));
    for (const k in (s.cost || {})) if ((u.res[k] || 0) < s.cost[k]) return true;
    for (const k in (s.requires || {})) if ((u.res[k] || 0) < s.requires[k]) return true;
    return false;
  }
  function setOv(I, frac, txt, state) {
    const h = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    if (I.h !== h) { I.ov.style.height = h; I.h = h; }
    if (I.txt !== txt) { I.num.textContent = txt; I.txt = txt; }
    if (I.state !== state) { I.el.dataset.s = state; I.state = state; }
  }
  function updDuel(R, dt) {
    const u = R.u, D = u.duel; if (!D) return;
    const C = Object.assign({}, DCFG, (u.def.duelist && u.def.duelist.cfg) || {});
    const cnt = { monster: 0, spell: 0, trap: 0 }; for (const c of D.hand) if (cnt[c.def.type] != null) cnt[c.def.type]++;
    for (const I of R.icons) {
      if (I.duel === 'draw') {
        let rem = 0, max = 1;
        if (D.phase === 'start') { max = C.FIRST_DRAW + C.DRAW_DELAY; rem = C.FIRST_DRAW - D.t + C.DRAW_DELAY; }
        else if (D.phase === 'wait') { const w = D.trig ? C.MIN_WAIT : C.WAIT_TIMEOUT; max = C.WAIT_TIMEOUT + C.DRAW_DELAY; rem = Math.max(0, w - D.t) + C.DRAW_DELAY; }
        else if (D.phase === 'draw') { max = C.WAIT_TIMEOUT + C.DRAW_DELAY; rem = Math.max(0, C.DRAW_DELAY - D.t); }
        const dead = u.dead || D.lost;
        setOv(I, dead ? 1 : rem / max, dead ? '' : (D.deck.length ? String(D.deck.length) : '0'), dead ? 'off' : rem > 0 ? 'cd' : 'on');
        if (I.prev != null && D.turn > I.prev && dt < 1) pulse(I.el, 'use'); I.prev = D.turn;
        continue;
      }
      const n = cnt[I.duel];
      setOv(I, n ? 0 : 1, String(n), u.dead ? 'off' : n ? (D.phase === 'main' ? 'on' : 'rdy0') : 'off');
      if (I.prev != null && n < I.prev && dt < 1) pulse(I.el, 'use'); I.prev = n;
    }
  }
  function update(dt) {
    for (const R of rows) {
      const u = R.u; if (!R.el.isConnected) continue;
      if (skillKey(u) !== R.key) fill(R);
      R.el.classList.toggle('down', !!u.dead);
      if (R.key === 'duel') { updDuel(R, dt); continue; }
      for (const I of R.icons) {
        const t = u.skillT[I.i] == null ? 0 : u.skillT[I.i];
        if (t > I.prev + 0.05) I.max = Math.max(t, 0.05); // 새 쿨타임 시작 (모드 B 배율·쿨타임 연장 포함)
        I.prev = t;
        let state, txt = '', frac = 0;
        if (u.dead || t >= 900) { state = 'off'; frac = 1; }
        else if (t > 0) { state = 'cd'; frac = t / I.max; txt = fmt(t); }
        else state = short(u, I.slot) ? 'low' : 'on';
        if (state === 'on' && !I.ready && dt < 1) pulse(I.el, 'rdy');
        I.ready = state === 'on';
        setOv(I, frac, txt, state);
      }
    }
  }
  // 스킬 사용 (전투 훅 onSkill → main.js addLog): 이름이 같은 아이콘을 잠깐 강조
  function used(u, name) {
    const R = rows.find(r => r.u === u); if (!R || R.key === 'duel') return;
    for (const I of R.icons) if (I.slot && I.slot.name === name) pulse(I.el, 'use');
  }
  // 줄 만들기: host 아래에 붙임 (단독 프레임 = 프레임 맨 아래, 2인 팀 = 각 멤버 줄 안)
  function attach(u, host, small) {
    const el = document.createElement('div'); el.className = 'skrow' + (small ? ' sm' : '');
    host.appendChild(el);
    const R = { u, el, key: null, icons: [] }; fill(R); rows.push(R); return R;
  }
  function reset() { rows.length = 0; }
  // 터치/마우스: 아이콘을 누르면 스킬 이름 잠깐 표시 (title 은 PC 마우스 올림용)
  let tipT = 0;
  function tip(e) {
    const s = e.target.closest && e.target.closest('.ski'); if (!s) return;
    const stage = document.getElementById('stage'); let t = document.getElementById('skTip');
    if (!t) { t = document.createElement('div'); t.id = 'skTip'; stage.appendChild(t); }
    t.textContent = s.title; t.classList.remove('hidden');
    const sr = stage.getBoundingClientRect(), r = s.getBoundingClientRect(), k = sr.width / stage.offsetWidth;
    const x = (r.left + r.width / 2 - sr.left) / k, y = (r.bottom - sr.top) / k + 3;
    t.style.left = Math.max(4, Math.min(stage.offsetWidth - t.offsetWidth - 4, x - t.offsetWidth / 2)) + 'px'; t.style.top = y + 'px';
    clearTimeout(tipT); tipT = setTimeout(() => t.classList.add('hidden'), 1600);
  }
  window.SkillHud = { attach, update, used, reset, tip, url, pixels, ART };
})();
