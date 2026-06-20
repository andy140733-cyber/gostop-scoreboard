# GoStop 점수판 인수인계 v2

**작성일**: 2026-06-20
**기기**: 노트북
**기반 commit**: `35180fa` "feat: 회차·판 번호 수동 조정 + iOS 날짜 필터 겹침 수정 + 한글 어절 줄바꿈" (origin/main 동기, working tree clean). ※이 v2 핸드오프가 그 위 1커밋이 된다.
**직전 인수인계**: v1 (`9f8f49e` "docs: v1 인수인계 + CLAUDE.md 추가")
**직전 통합본**: 없음 (다음 통합본 = v5 예정)
**유형**: 개별 인수인계
**작업 모델**: **Claude Code 단독**(요구 분석·설계·구현·적대적 리뷰·시각 검증·git/배포) + 진혁(요구 제시·결정).

---

> ⚠️ **해시 시차 주의**
> 위 기반 `35180fa`는 이번 세션의 **기능 커밋**(앱 코드 변경 정본)이고, 이 v2 파일을 커밋하면 HEAD가 "docs: v2 인수인계"로 한 칸 더 앞선다. **앱 코드 정본 = `35180fa`, 그 위 = 이 문서.**

---

## 0. 한 줄 요약

v1 배포본 위에 진혁 요청 4건 — ① **iOS 날짜 필터 겹침 수정**, ② **회차·판 번호 수동 조정 기능**, ③ **한글 어절(공백) 단위 줄바꿈**, ④ (리뷰 중 발견) **다크 테마 네이티브 컨트롤 가독성** — 을 구현하고, **멀티에이전트 적대적 리뷰**로 잡은 엣지 7건을 반영한 뒤 `main` push로 라이브 재배포했다. 점수 엔진(`scoring.js`)·정산/누적 파생 구조는 **무손**(16/16 테스트 그대로 PASS).

---

## 1. 직전 단계 (v1 요약)

빈 디렉터리에서 0 → 앱 완성 → GitHub Pages 배포까지 한 세션에 완료. 점수 엔진(하우스룰 정본)·누적 파생(ledger)·정산 회차 경계·통계·금액환산·JSON/텍스트 백업·PWA·반응형 3단. 상세는 `GoStop_인수인계_v1.md` 참조.

---

## 2. 이번 단계 (v2) — 진혁 요청 4건 + 적대적 리뷰

### 2-1. iOS 날짜 필터 겹침 수정 (요청 ①)
- **증상**: 아이폰(iOS Safari)에서 기록 탭 필터의 **시작일/종료일** date 입력 두 칸이 서로 겹쳐 보임.
- **원인**: iOS의 네이티브 `input[type=date]` 컨트롤은 `width:100%`를 무시하고 내부 콘텐츠 폭으로 렌더돼, flex 칸(`flex:1; min-width:92px`)을 비집고 나와 옆 칸과 겹친다.
- **수정**(`index.html` + `css/styles.css`): 날짜 행에 `.filter-dates` 클래스 부여 → **2열 그리드**(`grid-template-columns:1fr 1fr`)로 폭을 강제. `.filter-dates .field { min-width:0 }`로 칸이 줄어들게 하고, 전역 `input[type=date]`에 `-webkit-appearance:none; appearance:none; min-width:0; min-height:38px` 추가.
- **확인 사실**(리뷰 검증): `appearance:none`은 **iOS 날짜 선택기를 비활성화하지 않는다**(탭하면 그대로 휠 피커가 뜸). 데스크톱 Chromium의 캘린더 인디케이터도 유지됨.

### 2-2. 회차·판 번호 수동 조정 (요청 ②)
- **요구**: 현재가 몇 **회차**인지, 몇 번째 **판**인지 직접 맞추는 수단이 없었음.
- **설계(핵심)**: 회차/판 **절대값은 저장하지 않는다**(v1 원칙 "누적·번호는 파생" 유지). 대신 `settings`에 **표시 오프셋** 2개를 둔다.
  - `settings.periodOffset` (기본 0): 표시 회차 = `정산횟수 + 1 + periodOffset`.
  - `settings.gameOffset` (기본 0): 표시 판 = `현재기간 게임수 + gameOffset`.
  - 점수·정산·통계 계산엔 **일절 영향 없음**(오프셋은 표시 라벨 전용).
- **진입 경로 2개**(`index.html`/`js/ui.js`):
  - 헤더의 회차 표시(`#periodIndicator`)를 **클릭/Enter/Space** → 조정 모달.
  - 설정 탭 "회차 · 판 번호 조정" 카드의 **번호 조정** 버튼 → 같은 모달.
- **동작 규칙**:
  - 적용 시 `periodOffset = 입력회차 − (정산횟수+1)`, `gameOffset = 입력판 − 현재게임수`.
  - **정산하면 `gameOffset`을 0으로 리셋**(판은 회차마다 0부터 다시 셈). `periodOffset`은 유지되고 회차는 정산수로 자동 +1.
  - **최소 회차 = 정산횟수+1** 검증(정산 N회 = 최소 N+1회차 → 과거 회차 라벨이 1 미만으로 안 내려감).
  - 헤더·필터 드롭다운·통계 드롭다운의 모든 "N회차" 라벨이 **같은 오프셋**으로 일관 표시.
- **파생 헬퍼 추가**(`js/ledger.js`): `periodOffset/gameOffset/periodNumber/currentPeriodNumber/currentGameCount/currentGameNumber`.

### 2-3. 한글 어절 단위 줄바꿈 (요청 ③)
- **요구**: 줄바꿈이 글자 단위로 끊겨 어색함(예: "안녕하/세요, 여러분." → "안녕하세요,/여러분." 처럼).
- **수정**(`css/styles.css`, `html, body`에 1회 선언 → 상속으로 전역): `word-break: keep-all`(한글을 어절=공백 단위로만 끊음) + `overflow-wrap: break-word`(띄어쓰기 없는 긴 토큰만 비상 줄바꿈해 넘침 방지). JSON 백업 텍스트영역·긴 숫자도 안전.

### 2-4. 다크 테마 네이티브 컨트롤 가독성 (리뷰 중 발견)
- **증상**: 펠트(짙은 녹색) 배경에서 빈 date 입력의 "연도-월-일" 플레이스홀더가 **어두운 글자/어두운 배경**으로 거의 안 보임.
- **수정**(`css/styles.css`, `:root`): `color-scheme: dark` 추가 → 네이티브 date 글자/플레이스홀더·스크롤바가 밝게 렌더돼 가독성 확보.

### 2-5. 적대적 멀티에이전트 리뷰 (Workflow) → 엣지 7건 반영
구현 후 커밋 전, **3개 차원(오프셋 불변식 / CSS·iOS / 엣지·회귀) × 적대적 검증** 워크플로로 변경 diff를 리뷰(원시 11건 중 7건 확정, 4건 "버그 아님" 기각). 확정 7건 전부 반영:

1. **(MED)** 판을 실제 게임 수보다 낮게 설정 후 게임 삭제 → 판 표시가 음수. → `currentGameNumber`에 **0 하한**(`Math.max(0, …)`).
2. **(LOW)** 손상/손편집 백업의 음수 `periodOffset`가 그대로 들어옴. → import에서 **`periodOffset ≥ 0` 클램프**(`backup.js`).
3. **(MED)** 위 2-4와 동일 — `color-scheme:dark`.
4. **(MED)** 스텝퍼의 `| 0`가 큰 입력을 32비트로 wrap, 저장 경로와 불일치. → `| 0` 제거, **Number 연산 + 상한 `ADJ_MAX=99999`**, 스텝퍼/저장 경로 일치.
5. **(LOW)** 회차/판 음수 표시(1과 동근). → 표시 하한(판≥0, 회차≥1, `ledger.js`).
6. **(LOW)** 빈 입력이 조용히 이전값으로 복원. → `savePeriodAdjust`가 **입력칸 원시 문자열을 검증**(빈칸/문자/범위초과 시 오류 표시).
7. **(LOW)** 헤더 `✎`가 스크린리더 접근명에 포함. → `✎`를 **`aria-hidden` 자식 span**으로 분리(접근명엔 숫자만).

기각된 4건 중 핵심: "del-settle(정산취소) 후 회차 라벨 역전"·"제로섬 불변식 영향"·"appearance:none이 iOS 피커 무력화"·"데스크톱 캘린더 인디케이터 제거"는 **모두 실제 문제 아님**으로 코드 추적·확인됨.

---

## 3. 새 데이터 모델 / 설계 결정 (수정 시 지킬 것)

- `state.settings`에 **`periodOffset:number`, `gameOffset:number`** 추가(둘 다 기본 0). `store.defaultState()` 포함, `store.migrate()`가 구버전 데이터에 0으로 보강, `backup.importJSON`이 왕복 보존(periodOffset은 ≥0 클램프).
- **불변식**: `periodOffset`은 항상 ≥ 0(저장 경로가 강제). 표시 회차 ≥ 1, 표시 판 ≥ 0(`ledger`가 `Math.max`로 하한). 오프셋은 **표시 전용** — `computeDeltas`/`standings`/금액 계산에 절대 들어가지 않는다.
- `gameOffset`은 음수 가능(판을 실제보다 낮게 설정 시)하나 표시는 0 하한. **정산 시 0 리셋**.
- 조정 입력 범위: 회차 `[정산횟수+1, 99999]`, 판 `[0, 99999]`(`ADJ_MAX`).

---

## 4. 현재 상태 (v2 종료 시점)

| 항목 | 상태 |
|---|---|
| origin HEAD | `35180fa` (feature) + 이 v2 핸드오프 커밋, origin 동기, clean |
| 라이브 | https://andy140733-cyber.github.io/gostop-scoreboard/ (`main` push로 자동 재배포) |
| 신규 기능 | iOS 날짜겹침 해소 · 회차/판 수동조정(헤더 클릭+설정 버튼) · 한글 어절 줄바꿈 · 다크 네이티브 컨트롤 가독성 |
| 검증 | 엔진 **16/16 PASS**(불변) · Playwright(아이폰 390 / 데스크톱 1280) 시각·동작 검증 · 콘솔 에러 0(favicon 404만 무관) |
| 회귀 | 점수/정산/누적/통계/백업 무손, 데스크톱·태블릿 레이아웃 정상 |

---

## 5. 검증 상세 (이번 세션)

- **엔진**: `tests/scoring-tests.html` 16/16 PASS(변경 전후 동일). `node --check js/*.js` 전부 OK.
- **task 3(날짜)**: 390px(빈 값/채운 값)·1280px에서 두 date 입력이 **2열·겹침 없음·필터 바 안 수납**. 플레이스홀더 가독성 확인.
- **task 4(회차/판)**: 헤더 클릭·설정 버튼 모달 오픈, 오프셋 산식 정확, 헤더·필터·통계 드롭다운 일관, 새 게임 시 판 +1, 정산 시 판 0 리셋+회차 +1(지난 회차 번호 보존), 최소 회차 검증, **새로고침 영속**, **백업 왕복 보존**(구버전 백업은 0 기본).
- **리뷰 픽스 재검증**: 판 낮춤+게임삭제 → 0(음수 방지), 손상 import periodOffset → 0, 음수 오프셋 회차 라벨 → 1, 빈 입력 → 오류 표시, 큰 입력(30억) → 99999 캡(스텝퍼)·저장 거부, `✎` aria-hidden 분리, `color-scheme:dark` 적용.
- **어절 줄바꿈**: "안녕하세요, 여러분."을 좁은 칸에 넣어 첫 줄이 **"안녕하세요, "**(공백에서 끊김)로 확인.

---

## 6. 다음 단계 (후보 — 진혁 결정 대기)

1. (편의) 빠른 입력 개선(기본 승자 기억 등), 통계 그래프, 다크/라이트 토글.
2. (운영) v5에서 통합본(압축 미적용) 작성.
3. (보류·미채택 유지) 광박 규칙, 판별 메모, 실시간 클라우드 동기화.

---

## 7. 세션 메타

- **기기**: 노트북. **Claude Code 단독** + 진혁.
- **이번 세션 커밋**: `35180fa`(feature, 6파일 +193/−11) + 이 v2 인수인계 커밋.
- **도구**: 멀티에이전트 Workflow(적대적 코드리뷰·검증), Playwright(아이폰/데스크톱 시각·동작 검증), Node(`--check`), python http.server(로컬), git push(자동 Pages 재배포).
- **외부 자원**: 저장소 https://github.com/andy140733-cyber/gostop-scoreboard · 라이브 https://andy140733-cyber.github.io/gostop-scoreboard/ (메모리 `gostop-deploy`).

---

## 8. 다음 세션 진입 인사 (참고)

> "GoStop v2 인수인계 컨텍스트로 잡아줘. 작업 폴더 `C:\Personal Project\GoStop`(노트북), origin/main `35180fa`(+v2 핸드오프 커밋) 동기·clean. 라이브 = https://andy140733-cyber.github.io/gostop-scoreboard/ (GitHub Pages, main 루트, push 시 자동 재배포).
>
> 앱 = 나·엄마·아빠 3인 고스톱 점수 기록·누적·정산 단일 페이지 웹앱(바닐라 JS, 빌드 없음, classic script, localStorage, PWA). v2에서 추가: ① iOS 날짜 필터 겹침 수정(.filter-dates 2열 그리드 + input[type=date] appearance:none), ② **회차·판 번호 수동 조정**(settings.periodOffset/gameOffset 표시 오프셋 — 절대값 저장 안 함, 점수 무영향; 헤더 회차표시 클릭 또는 설정 카드 → 조정 모달; 정산 시 gameOffset 0 리셋; 회차≥정산수+1 검증), ③ 한글 어절 줄바꿈(word-break:keep-all + overflow-wrap:break-word), ④ color-scheme:dark.
>
> 핵심 파일: scoring.js(엔진 정본, 무손)·ledger.js(누적·정산 경계 + 회차/판 파생·오프셋)·ui.js(화면+조정 모달)·backup.js(오프셋 왕복 보존). 검증 = scoring-tests.html(16/16) + Playwright(http.server, file:// 차단).
>
> ★규율: 점수 규칙·오프셋 표시 전용 원칙(점수 계산에 오프셋 금지) 유지. periodOffset ≥ 0 불변식. 다른 기기 편집은 github.dev/clone, push하면 라이브 자동 갱신. 인수인계 정본 = repo docs/handoff/, 5배수마다 통합본."

---

**v2 인수인계 작성 완료** ✅
