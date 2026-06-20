# CLAUDE.md

가족(나·엄마·아빠) 3인 **고스톱 점수 기록·누적·정산** 단일 페이지 웹앱.

## 성격 / 스택
- **빌드 도구 없음.** 바닐라 HTML/CSS/JS, classic `<script>` + 전역 네임스페이스 `GS`. 외부 의존성·CDN 0.
- ES 모듈·`import`·`fetch`·XHR 사용 금지 — `file://` 더블클릭 호환을 유지하기 위함. 새 JS 파일도 IIFE로 `GS`에 붙인다.
- 데이터는 브라우저 `localStorage`(키 `gostop.v1`). PWA(`manifest.webmanifest` + `sw.js`).

## 실행 / 검증
- 로컬 서버: `python -m http.server 8123` 후 `http://127.0.0.1:8123/`. (더블클릭 `file://`도 됨)
- 엔진 단위 검증: `tests/scoring-tests.html` 열면 16케이스 PASS 표시. 또는 `node --check js/*.js`.
- 시각 검증: Playwright. **Playwright는 `file://`을 차단** → 반드시 http 서버로 띄워서 검증.

## 핵심 설계 (수정 시 지킬 것)
- **점수 규칙은 진혁 하우스룰 정본** — 임의 변경 금지(변경 시 진혁 확인). 정본 = `js/scoring.js`의 `computeDeltas`(순수, 제로섬). 규칙 요약은 `docs/handoff/GoStop_인수인계_v1.md` 3장.
- 누적은 **절대 저장 안 하고 `js/ledger.js`에서 파생**. 정산(settlement)은 회차 경계 마커(단조 `seq` 기준 반열림 구간).
- 입력 폼 미리보기와 저장은 **같은 `computeDeltas`** 호출(불일치 차단).
- 광박·판별 메모는 미채택(진혁 결정). 자동 클라우드 동기화 없음(단일 기기). 기기 이전 = 설정의 텍스트 복사/붙여넣기 또는 JSON.

## 배포 (GitHub Pages)
- 저장소 `andy140733-cyber/gostop-scoreboard` (public). 라이브 = https://andy140733-cyber.github.io/gostop-scoreboard/
- Pages source = **`main` 루트**. `main`에 push하면 ~1분 뒤 자동 재배포. `sw.js`는 네트워크 우선이라 온라인이면 바로 최신.
- gh CLI 없음. git에 GitHub 자격(GCM, `repo` scope) 캐시됨 → push/API 가능.

## 인수인계 / 문서
- 인수인계 정본 = `docs/handoff/`. 파일명 `GoStop_인수인계_vN.md`. 5배수마다 통합본(압축 미적용). 명시 요청 시 작성.
- CLAUDE.md 편집은 claude-md-management 플러그인 경유.
- ⚠️ `myPaper_인수인계_*.md`는 **다른 프로젝트의 private 참고 파일** → `.gitignore`로 public 저장소 push에서 제외.

## Gotchas
- 전역 `.hidden { display:none !important }` 규칙 필수(요소 토글에 사용).
- Windows에서 `git add` 시 LF→CRLF 경고는 무해.
