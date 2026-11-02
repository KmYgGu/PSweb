# 탈출맵 온라인 설정 (처음 하는 사람용, 초안)

> GitHub 토큰 만드는 단계는 GitHub 문서(“Managing your personal access tokens”)에서 확인했습니다. Render 화면의 버튼과 칸 이름은 직접 확인하지 못해서 **비슷한 이름**으로 적었습니다. 실제 화면과 다를 수 있어요.

## 1. 맵 저장소 만들기
1. GitHub에서 새 저장소를 만듭니다. 이름은 `PSweb-maps`처럼 정하고(다르게 하면 아래 설정도 같이 바꿉니다), **Public**으로 둡니다.
2. 빈 저장소면 기본 브랜치가 없을 수 있습니다. 만들 때 README를 추가하는 옵션을 켜 두면 `main` 브랜치가 생겨서 안전합니다.

## 2. 토큰 만들기 (fine-grained)
GitHub 문서에 나온 순서입니다.
1. 오른쪽 위 프로필 사진에서 **Settings**로 들어갑니다.
2. 왼쪽 맨 아래 **Developer settings**를 누릅니다.
3. **Personal access tokens**에서 **Fine-grained tokens**를 고르고 **Generate new token**을 누릅니다.
4. 이름과 **Expiration**(만료일)을 정합니다. 만료되면 다시 만들어 Render에 넣어야 합니다.
5. **Resource owner**는 본인 계정으로 둡니다.
6. **Repository access**에서 **Only select repositories**를 고르고 `PSweb-maps` **하나만** 선택합니다.
7. **Permissions**의 저장소 권한에서 **Contents**를 **Read and write**로 둡니다. 다른 권한은 주지 않습니다(Metadata 읽기는 자동으로 들어갈 수 있습니다).
8. **Generate token**을 누르고 나온 값을 복사합니다. 이 값은 다시 볼 수 없으니 바로 다음 단계에서 씁니다. **어디에도 커밋하지 마세요.**

## 3. Render에 서버 만들기 (무료)
1. Render에 GitHub 계정으로 가입하고 로그인합니다.
2. 새 **Web Service**를 만들고 `PSweb` 저장소를 연결합니다.
3. 설정값:
   - 런타임(Language): Node
   - 브랜치: `main`
   - 루트 디렉터리: 비워 둡니다
   - 빌드 명령: `npm install` (설치할 패키지가 없어서 금방 끝납니다)
   - 시작 명령: `node server/index.js`
   - 플랜: Free
   - 헬스 체크 경로(있으면): `/health`
4. 환경 변수(Environment)를 추가합니다.
   - `GITHUB_TOKEN`: 2단계에서 복사한 값
   - `GITHUB_REPO`: `kmyggu/PSweb-maps`
   - `ADMIN_KEY`: 길고 무작위인 문자열(관리자 화면에서 입력할 값). 비밀번호 관리자에 따로 보관하세요.
   - `IP_SALT`: 또 다른 길고 무작위인 문자열
   - (선택) `REPORT_THRESHOLD` 등은 `server/README.md` 표를 참고합니다.
5. 배포가 끝나면 `https://<서비스이름>.onrender.com/health`를 열어 봅니다. `"configured":true`와 `"admin":true`가 보이면 성공입니다.

## 4. 게임에 주소 넣기
1. `js/escape_config.js`를 엽니다.
   - `ESCAPE_SERVER_URL`에 Render 주소를 넣습니다. 끝에 `/`는 붙이지 않습니다.
   - 저장소 이름이 다르면 `MAPS_REPO`도 고칩니다.
2. 커밋하고 push하면 GitHub Pages에 반영됩니다. **이 파일에는 토큰이나 관리자 키를 절대 넣지 않습니다.**

## 5. 확인
1. 게임에서 첫 화면 캐릭터 두 명을 고른 뒤 탈출맵 편집기로 들어갑니다.
2. 🎲 시드 탐색을 하고 ⬆ 맵 올리기를 누릅니다. 서버가 자고 있으면 '서버를 깨우는 중(최대 1분)'이 뜹니다.
3. 🌐 공개 맵 목록에서 방금 올린 맵을 확인합니다.
4. 관리자 화면은 편집기 맨 위 제목 글자를 **2초 안에 5번** 누르면 열립니다. ADMIN_KEY를 넣으면 확인 목록과 비공개 목록이 보입니다.

## 문제가 생기면
- 올리기가 503 → Render 환경 변수 `GITHUB_TOKEN`/`GITHUB_REPO`를 확인합니다.
- 커밋 실패 → 토큰의 저장소 선택과 Contents 권한, 만료일을 확인합니다.
- 브라우저에 'CORS' 오류 → `ALLOWED_ORIGINS`에 게임 주소의 출처(예: `https://kmyggu.github.io`)가 있는지 확인합니다.
- 목록에 늦게 뜸 → raw 파일 캐시 때문입니다. 최대 5분쯤 기다리면 됩니다.
