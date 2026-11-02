# 탈출맵 중계 서버 (`/server`)

로그인 없이 탈출맵을 올리고 신고할 수 있게 해 주는 작은 Node 서버입니다. 맵은 **별도 공개 저장소**(예: `kmyggu/PSweb-maps`)에 파일로 커밋합니다.
- 외부 패키지가 없고 Node 내장 모듈만 씁니다. `package.json`의 `engines`는 `>=22 <25`입니다.
- 게임 코드(`js/`)를 그대로 불러와 서버에서 다시 시뮬레이션합니다(`tools/headless.js`).

## 실행
```
node server/index.js        # 시작 (PORT 기본 10000)
node server/test/run.js     # 모의 GitHub로 전체 흐름 테스트 (실제 GitHub 안 씀)
```

## 환경 변수
| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `GITHUB_TOKEN` | ✔ | – | 맵 저장소 **하나만** 선택하고 Contents: Read and write만 준 fine-grained 토큰입니다. **클라이언트 코드나 저장소에 절대 넣지 마세요** |
| `GITHUB_REPO` | ✔ | – | `소유자/저장소` (예: `kmyggu/PSweb-maps`) |
| `GITHUB_BRANCH` | | `main` | |
| `ADMIN_KEY` | 권장 | – | 관리자 키입니다. 비어 있으면 관리자 기능이 꺼집니다. 긴 무작위 문자열을 쓰세요 |
| `IP_SALT` | 권장 | (ADMIN_KEY 기반) | 접속 주소를 해시할 때 쓰는 비밀 값입니다. 해시는 **공개** `reports.json`에 들어가므로 길고 무작위인 값을 넣으세요 |
| `ALLOWED_ORIGINS` | | `https://kmyggu.github.io,null` | 쉼표로 구분합니다. `null`은 file://로 연 게임입니다 |
| `REPORT_THRESHOLD` | | `5` | 신고가 이 수에 도달하면 확인 목록에 들어갑니다 |
| `MAX_BODY` | | `204800` | 올리기 본문의 최대 바이트입니다 |
| `MIN_WALL_TILES` | | `12` | 벽 칸 최소 개수입니다 |
| `MIN_START_EXIT_DIST` | | `400` | 시작 지점과 출구 중심 사이의 최소 거리(px)입니다 |
| `MAX_UPLOAD_TIME_LIMIT` | | `300` | 맵 제한 시간의 상한(초)입니다 |
| `SIM_TIMEOUT_MS` | | `90000` | 재검증 시간이 이를 넘으면 워커를 강제 종료하고 거부합니다 |
| `UPLOAD_PER_HOUR` / `UPLOAD_PER_DAY` | | `5` / `20` | 주소별 올리기 횟수 제한입니다 |
| `REPORT_PER_HOUR` | | `30` | 주소별 신고 횟수 제한입니다 |
| `GITHUB_API` | | `https://api.github.com` | 테스트용입니다(모의 서버) |

제목 30자, 작성자 20자, 설명 200자, 금칙어 목록, 허용 크기는 `server/config.js`에서 고칩니다.

## API
| 요청 | 설명 |
|---|---|
| `GET /health` | `{ok, configured, admin, threshold}`. 서버를 깨울 때도 씁니다 |
| `POST /maps` `{map, title, author?, desc?}` | 검사와 재검증을 통과하면 커밋하고 `201 {id, entry}`를 돌려줍니다 |
| `POST /maps/:id/report` | 신고합니다. 같은 주소에서는 한 번만 셉니다. `{count, threshold, review}` |
| `GET /admin/review` (헤더 `X-Admin-Key`) | 확인 목록, 비공개 목록, 신고 수를 돌려줍니다 |
| `POST /admin/maps/:id/hide` · `restore` · `dismiss` · `reset-reports` | 비공개 전환, 복원, 기각(확인 목록에서 빼고 신고 초기화), 신고만 초기화입니다 |

오류는 `{ok:false, error, code}` 형태입니다. 코드: 400 형식, 413 크기, 422 검증, 409 중복, 429 횟수, 401 키, 503 미설정.

## 올리기 검사 순서
1. 본문 크기와 JSON 형식을 확인합니다.
2. 텍스트를 검사합니다: 길이, URL 금지, 금칙어.
3. 맵을 검사합니다: v2 grid 필수, 허용 크기, 캐릭터 존재, 제한 시간 상한, 벽 칸 수, 시작 지점이 벽 위가 아닌지, 시작~출구 거리.
4. 주소별 횟수 제한을 확인합니다.
5. 중복을 확인합니다(내용 해시).
6. **재검증**: 별도 워커에서 `ESCAPE.runHeadless`를 돌립니다. 시간 제한과 메모리 256MB 제한이 있고, 한 번에 하나만 돌립니다.
7. 커밋 대기열에서 중복을 다시 확인한 뒤 `maps/<id>.json`, `index.json` 순서로 씁니다.

## 맵 저장소 파일 구조
```
maps/<id>.json   {id,title,author,desc,created,hash,verify,map}
index.json       {v,updated,maps:[{id,title,author,created,w,h,chars,mode,goal,timeLimit,seed,walls,clearTime,hash,stats:{}}]}  최신순 (stats: 나중에 이용수/평가용)
reports.json     {v,maps:{id:{count,by:[주소해시],first,last}}}
review.json      {v,maps:[{id,title,author,created,count,at}]}
hidden.json      {v,maps:[index 항목 + hiddenAt, reason]}
```
- 모든 상태가 이 파일들에 있습니다. Render 무료 서버가 재시작되거나 디스크가 지워져도 그대로 이어집니다(테스트로 확인).
- 쓰기는 하나씩 줄 세워 처리합니다. sha가 충돌하면 다시 읽어서 최대 4번 재시도합니다.
- 게임은 목록과 맵을 **서버 없이** `raw.githubusercontent.com`에서 직접 읽습니다. 그래서 서버가 잠들어 있어도 목록은 보입니다.

## 보안
- 토큰은 Render 환경 변수에만 둡니다. 응답과 로그에 토큰을 출력하지 않습니다.
- 관리자 키는 sha256 다이제스트를 `crypto.timingSafeEqual`로 비교합니다. 틀리면 주소별로 시간당 10회까지만 허용합니다.
- 게임 쪽에서는 키를 **메모리에만** 둡니다. 새로고침하면 사라지며 localStorage나 sessionStorage에 저장하지 않습니다.
- 접속 주소는 원문을 저장하지 않습니다. `HMAC(IP_SALT, X-Forwarded-For 첫 값)`의 앞 16자리만 씁니다.
- CORS는 허용한 출처에만 응답하고, 그 밖의 출처는 403입니다. Origin이 없는 요청(curl 등)은 막지 않습니다. 따라서 CORS는 보안 장치가 아니고, 횟수 제한과 검증이 실제 방어입니다.

## 한계
- 횟수 제한 기록은 **메모리**에만 있어서 서버가 재시작(잠들었다 깨어남 포함)되면 초기화됩니다. 중복 신고 차단은 파일에 저장되므로 유지됩니다.
- 비공개로 바꾸면 목록(index.json)에서만 빠집니다. `maps/<id>.json` 파일과 **git 기록은 공개 저장소에 남습니다**. 완전히 지우려면 저장소에서 직접 지우고 기록까지 정리해야 합니다.
- raw 파일은 CDN에서 최대 약 5분 캐시됩니다(`max-age=300`이고 쿼리 문자열로 우회되지 않음을 확인). 새 맵이나 비공개 처리가 다른 사람 화면에 반영되기까지 몇 분 걸릴 수 있습니다. 올린 사람 화면에는 바로 합쳐서 보여 줍니다.
- 무료 플랜은 15분 동안 요청이 없으면 잠들고, 깨어나는 데 1분쯤 걸립니다. CPU가 0.1이라 재검증이 수십 초 걸릴 수 있습니다.
- 주소 기반 제한은 VPN이나 공유 IP로 우회하거나 오탐할 수 있습니다. 금칙어는 단순 부분 일치입니다.
- 접속 주소: `CF-Connecting-IP`(Render 앞단 Cloudflare가 넣음)를 우선 쓰고, 없으면 `X-Forwarded-For` 첫 값을 씁니다. Render 글(How Render handles DDoS attacks)은 `x-forwarded-for`를 읽으라고 안내하지만, Render는 클라이언트가 보낸 값을 지우지 않고 뒤에 덧붙인다는 보고가 있어 첫 값은 위조될 수 있습니다. `CF-Connecting-IP`가 실제로 오는지는 확인하지 못했습니다(서버 로그에 찍지 않음).
