# GoStop 점수판 인수인계 v1

**작성일**: 2026-06-20
**기기**: 노트북
**기반 commit**: `6a01e63` "고스톱 점수판 초기 버전" (origin/main 동기 0/0, working tree clean). ※이 v1 핸드오프 커밋이 그 위 1커밋이 된다. **판단 기준선: 코드 상태 = `6a01e63`, 그 위 1커밋 = 이 인수인계 + CLAUDE.md.**
**직전 통합본**: 없음 (v1 = 최초 인수인계)
**유형**: 개별 인수인계 — 다만 최초 파일이라 프로젝트 전체 맥락을 포함한다. 다음 통합본 = v5 예정.
**작업 모델**: **Claude Code 단독**(요구 분석·설계·구현·시각 검증·git 전부) + 진혁(요구 제시·하우스룰 확정·결정). ※myPaper 프로젝트의 3자(Cowork+Codex+진혁) 모델과 달리 이 프로젝트는 Claude Code 1인이 전 과정을 수행한다.

---

> ⚠️ **해시 시차 주의 (다른 기기·세션 진입 시 필독)**
> 위 기반 commit `6a01e63`은 **이 v1 핸드오프를 커밋하기 직전**의 origin/main HEAD다(앱 전체가 push 완료된 상태). 이 v1 파일 + CLAUDE.md를 커밋·push하면 HEAD는 새 "docs: v1 인수인계" 커밋으로 바뀌어 `6a01e63`보다 앞선다. **앱 코드 정본 = `6a01e63`, 그 위 = 문서.**

---

## 0. 프로젝트 개요 (genesis & context)

**GoStop 점수판** — 진혁이 가족(나·엄마·아빠) 3인이 치는 **고스톱 점수를 기록·누적·정산**하는 단일 페이지 웹앱. 종이 계산의 실수(피박·폭탄·쓰리고·대판·독박 배수 중첩)를 없애고, "누가 언제 얼마를 따고 잃었는지"를 자동 누적·필터·통계로 추적한다. 2026-06-20 한 세션에서 **0 → 완성 → GitHub 배포**까지 전부 진행했다.

- **형태**: 설치 불필요 순수 웹앱. **빌드 도구 없음**(HTML/CSS/순수 JS classic `<script>`). 더블클릭(`file://`)으로도, 호스팅 URL로도 실행. 데이터는 기기 브라우저 `localStorage`에 자동 저장.
- **스택**: 바닐라 JS(ES5~ES2017, 프레임워크·번들러 0), CSS(커스텀, 화투 테마), PWA(manifest + service worker). 외부 의존성·CDN 0 (오프라인·`file://` 안전).
- **저장소**: `andy140733-cyber/gostop-scoreboard` (GitHub, **public**). 라이브(GitHub Pages): **https://andy140733-cyber.github.io/gostop-scoreboard/**. 로컬 `C:\Personal Project\GoStop`(노트북). git config: user.name=`jinhyeok-choi` / email=`andy140733@gmail.com`. GitHub 로그인=`andy140733-cyber`.
- **배포 방식**: GitHub Pages, source = **`main` 브랜치 루트(`/`)**. `main`에 push하면 자동 재빌드(~1분)되어 라이브 반영. gh CLI는 없고, git에 GitHub 자격(GCM, `repo`/`gist`/`workflow` scope)이 캐시돼 있어 Claude Code가 API로 저장소 생성·push·Pages 활성화까지 자동 처리했다.

---

## 1. 직전 단계

**없음.** 이번 v1이 프로젝트의 시작이자 최초 인수인계다.

---

## 2. 이번 단계 (v1) — 0에서 앱 완성 + 모바일/PWA/반응형 + GitHub 배포

빈 디렉터리에서 시작해 세 묶음으로 진행했다.

### 2-1. 요구 확정 + 고스톱 규칙 온라인 검증
- 진혁의 상세 명세(승자·점수·피박·폭탄·쓰리고·대판·독박·정산·보정·필터)를 받고, **하우스룰 중 애매한 점만 확인**: ① 배수 동시 발생 시 계산법 → **곱연산(×2씩 중첩)** 확정, ② 앱 형태 → **설치 불필요 웹앱(단일 기기)** 확정, ③ 추가 기능 → **통계 대시보드·JSON 백업/복원** 채택, **광박·판별 메모는 미채택**, 편의 기능은 Claude 자율.
- 표준 고스톱 규칙을 웹 검색으로 교차 검증(피박/광박 ×2, 독박 vs 고박 구분, 쓰리고 배수, 폭탄·대판). **결론: 진혁의 하우스룰을 그대로 따른다**(쓰리고 이상=단순 ×2, 대판=비표준 ×2, 광박 미사용, 독박=고박+독박 혼합 정의). 규칙 정본은 아래 **3장**.

### 2-2. 앱 구축 (모듈 → UI → 검증)
순수 JS 모듈을 계층 분리해 구현하고 각 계층을 Node로 단위 검증한 뒤 UI를 얹었다.
- **점수 엔진**(`js/scoring.js`): `computeDeltas` 순수 함수 + `validateGameInput`. 진혁이 준 예시 3개 + 엣지케이스를 `tests/scoring-tests.html`로 자동 검증(**16/16 PASS**).
- **저장·레코드·원장**(`store.js`/`records.js`/`ledger.js`): localStorage I/O(실패 시 인메모리 폴백), 레코드 CRUD(단조 `seq`), **누적은 저장 안 하고 항상 history에서 파생** + 정산 회차 분할 + 필터.
- **통계·금액·백업**(`stats.js`/`money.js`/`backup.js`): 현재/통산/지난 회차 지표, 점당 금액 환산, JSON export/import(복원 시 게임 델타 재계산).
- **UI**(`index.html`/`css/styles.css`/`js/ui.js`/`js/app.js`): 화투 테마(짙은 녹색 펠트 + 금/홍), 점수판·입력 모달(실시간 델타 미리보기)·기록 필터·통계 대시보드·정산·보정·설정.
- **Playwright 시각 검증**: 정적 서버(`python -m http.server 8123`)로 띄워 예시 3개 입력 미리보기(+9/−6/−3, +12/−6/−6, 독박 −18/+18/0)·누적·필터·정산(누적 0 초기화+기록 보존)·정산 취소(회차 병합)·보정·수정/삭제·통계·금액환산·백업 라운드트립·반응형 전부 확인. **콘솔 에러 0건.**
- **세션 중 발견·수정한 버그 2건**: ① `.hidden` 전역 CSS 규칙 누락 → 통계 회차 선택 드롭다운이 안 숨겨짐(전역 `.hidden{display:none!important}` 추가). ② `openSettleModal`에서 `openModal('modalSettle')` 호출 누락 → 정산 모달이 안 뜸(추가). 둘 다 수정 후 재검증.

### 2-3. 모바일·PWA·반응형·기기 이전 보강 (진혁 후속 요청)
진혁이 "모바일에서도 되나? 기록 이전은? 기기별 레이아웃은?"을 묻고 개선을 요청.
- **PWA화**: `manifest.webmanifest` + `sw.js`(앱 셸 캐시, **네트워크 우선 + 캐시 폴백** → 편집 후 재배포 시 온라인에서 바로 최신, 오프라인에선 마지막 캐시) + 아이콘(Playwright canvas로 벚꽃🌸+녹색펠트+금링 192/512/애플 PNG 생성) + iOS/안드로이드 설치 메타. **HTTPS에서 설치형·오프라인 동작**(Pages에서 확인).
- **반응형 3단**: 폰(세로 1열) / 태블릿·아이패드 세로(널찍한 1열 + 기록 2열) / 노트북·데스크톱(좌측 점수판 세로 고정 + 우측 콘텐츠 2단). `index.html`을 `.side-col`/`.main-col`로 감싸고 CSS 브레이크포인트(720/1024/1440px) 추가. 390/834/1280px 스크린샷 검증.
- **텍스트 기반 기기 이전**: 설정에 **📋 텍스트로 복사 / 📥 붙여넣기로 복원** 모달(`#modalData`) 추가(모바일 친화, 기존 JSON 파일 백업도 유지). 복사→전체삭제→붙여넣기 복원으로 5건·점당100원·점수 100% 복원 검증.

### 2-4. GitHub 동기화 + Pages 호스팅 (진혁 요청)
진혁이 "깃허브 동기화 + 다른 기기에서 수정 + 호스팅 전부 진행" 요청.
- git init(`main`) + `.gitignore` + 초기 커밋 `6a01e63`.
- 캐시된 GCM 토큰(`repo` scope)으로 GitHub API 호출 → 저장소 `gostop-scoreboard`(public) 생성 → push → Pages(`main`/루트) 활성화. 빌드 완료 후 라이브 URL 전 자원 HTTP 200·HTTPS PWA 설치 가능·콘솔 에러 0 확인.

---

## 3. ★점수 규칙 (하우스룰 정본 — 절대 임의 변경 금지)

`computeDeltas(round)` 순수 함수가 단일 정본. **항상 제로섬**(세 명 델타 합 = 0).

```
R = (폭탄?2:1) × (쓰리고?2:1) × (대판?2:1)          // 라운드 배수, 곱연산 중첩 (최대 ×8)
각 패자 L: naturalLoss[L] = base × R × (피박[L]?2:1)  // 피박은 패자별 독립(둘 다 가능)
total = naturalLoss[패자1] + naturalLoss[패자2]
승자 델타 = +total
  독박 없음:  각 패자 델타 = -naturalLoss[L]
  독박 = L0:  L0 델타 = -total, 다른 패자 델타 = 0   // 고 외치고 진 사람이 전부 부담
```

진혁이 준 검증 예시 3개(전부 일치, 회귀 기준):
1. 나 3점 승, 엄마만 피박 → 엄마 −6, 아빠 −3, 나 +9
2. 나 3점 승, 폭탄 → 엄마 −6, 아빠 −6, 나 +12
3. 나 고 외친 뒤 엄마 3점 승, 아빠 피박, 대판, 나 독박 → 나 −18, 아빠 0, 엄마 +18

**확정된 설계 결정(변경 시 진혁 확인 필요)**:
- 배수 동시 발생 허용(폭탄+쓰리고+대판 = ×8). 피박은 그 위에 패자별로 ×2.
- 독박 = 진혁 정의(표준 용어로는 '고박+독박' 혼합)를 **'독박' 하나로** 구현. 독박 대상은 승자 아닌 패자 1명.
- **광박은 추가 안 함**, 판별(판마다) 메모도 추가 안 함(진혁 미채택).
- base(점수)는 1~999 정수(기본 3, 고스톱 통상 최소 3점).
- 점수 보정(correction)은 임의 델타 직접 입력(음수·제로섬 비강제), 통계에서 별도 버킷.

---

## 4. 아키텍처 / 파일 구조 / 핵심 설계

```
index.html            화면 구조 (.side-col / .main-col 2단 래퍼, PWA 메타, classic <script> 로딩)
css/styles.css        화투 테마 + 반응형(720/1024/1440 브레이크포인트) + .hidden 전역
js/config.js          상수: PLAYER_IDS(me/mom/dad), 라벨, MIN/MAX_BASE, 배수표, STORAGE_KEY
js/scoring.js         computeDeltas + evaluate + validateGameInput  ← 수식 단일 정본(순수)
js/store.js           localStorage load/save, 마이그레이션, 인메모리 폴백
js/records.js         레코드 CRUD(game/correction/settlement) + 단조 seq
js/ledger.js          누적 파생 + 정산 회차 분할(periods) + 필터  ← 정합성 핵심
js/stats.js           통계 지표(현재/통산/지난 회차)
js/money.js           점수→금액 환산(정수)
js/backup.js          JSON export/import + 복원 검증(게임 델타 재계산)
js/ui.js              렌더링·이벤트(모달·필터·실시간 미리보기·기기 이전)
js/app.js             부트스트랩 + 서비스워커 등록(http(s)에서만)
manifest.webmanifest  PWA 설치 정보
sw.js                 서비스워커(네트워크 우선 + 캐시 폴백), 캐시 키 gostop-cache-v1
icons/                앱 아이콘 192/512/apple-touch
tests/scoring-tests.html  엔진 자체검증(16 케이스)
docs/handoff/         인수인계 정본(이 파일)
```

**핵심 설계 원칙**:
- 누적은 절대 저장하지 않고 `ledger`에서 항상 파생 → 수정/삭제/정산취소 자동 정합.
- 정산(settlement)은 순수 경계 마커. 회차 = 정산 사이 구간(반열림, 단조 seq 기준). 과거 회차 레코드를 고쳐도 그 회차 표시만 바뀌고 현재 회차는 경계로 격리(검증 완료).
- 입력 폼 미리보기와 저장이 **같은 `computeDeltas`** 호출 → 미리보기·저장 불일치 원천 차단.
- classic `<script>` + 전역 네임스페이스 `GS` → `file://` 더블클릭 호환(ES 모듈/fetch/import 0).

---

## 5. 현재 상태 (v1 종료 시점)

| 항목 | 상태 |
|---|---|
| origin HEAD | `6a01e63` "고스톱 점수판 초기 버전" (+이 v1 핸드오프·CLAUDE.md 커밋), origin 동기, clean |
| 라이브 | https://andy140733-cyber.github.io/gostop-scoreboard/ (Pages built, 전 자원 200, PWA 설치가능) |
| 기능 | 점수기록·실시간미리보기·누적·정산/정산취소·보정·필터·통계(현재/통산/지난)·점당금액·JSON·텍스트 기기이전 전부 완료 |
| 검증 | 엔진 16/16 PASS, Playwright 전 시나리오 OK, 콘솔 에러 0 |
| PWA | manifest + sw.js(네트워크 우선) + 아이콘, HTTPS 설치/오프라인 동작 |
| 반응형 | 폰/태블릿/데스크톱 3단 검증 완료 |
| 데이터 | 기기별 localStorage 단일 기기(자동 클라우드 동기화 없음, 진혁 결정). 이전=텍스트/JSON |
| 환경 | 노트북 / Claude Code 단독 + 진혁 |

**다음 세션 필수 인지**:
- 코드 수정 후 **`main`에 push하면 라이브 자동 갱신**(~1분). 다른 기기 편집은 github.dev(저장소에서 `.` 키) 또는 clone 후 push.
- 점수 규칙(3장)은 진혁 하우스룰 정본 — 임의 변경 금지.
- `file://`도 동작하지만 localStorage 영속은 호스팅(https) 권장. **Playwright는 `file://` 차단** → 검증은 `python -m http.server`로 띄워서.
- 진혁의 myPaper 인수인계 예시 파일(`myPaper_인수인계_v117.md`, `..._v120_통합.md`)은 **다른 프로젝트의 private 내용**이라 `.gitignore`로 public 저장소 push에서 제외함(디스크엔 참고용으로 남김).

---

## 6. 다음 단계 (후보 — 진혁 결정 대기)

1. (편의) 입력 단축·기본 승자 기억 등 빠른 입력 개선, 다크/라이트 토글, 통계 그래프 시각화.
2. (배포) 커스텀 도메인 연결, README에 라이브 배지·스크린샷 추가, 저장소 이름 변경(주소도 변경됨).
3. (보류·진혁 미채택) 광박 규칙, 판별 메모, 여러 기기 실시간 클라우드 동기화(서버 필요).
4. (운영) 5배수 통합 인수인계(v5)부터 압축 미적용 전체 맥락 정본 작성.

---

## 7. 세션 메타

- **기기**: 노트북. **Claude Code 단독**(요구 분석·고스톱 규칙 검증·설계·순수 JS 구현·Playwright 시각 검증·아이콘 생성·git/API 배포·이 인수인계) + 진혁(요구·하우스룰 확정·추가기능 결정·기기 정보).
- **이번 세션 커밋**: `6a01e63`(앱 전체 초기 버전) + 이 v1 인수인계·CLAUDE.md 커밋. origin 동기.
- **도구**: Playwright(시각 검증·아이콘 canvas 생성), Node(엔진/모듈 단위 검증), python http.server(로컬 호스팅), GitHub REST API(GCM 캐시 토큰으로 저장소 생성·Pages), claude-md-management(CLAUDE.md).
- **외부 자원**: 저장소 https://github.com/andy140733-cyber/gostop-scoreboard · 라이브 https://andy140733-cyber.github.io/gostop-scoreboard/ (메모리 `gostop-deploy`에도 기록).

---

## 8. 다음 세션 진입 인사 (참고)

> "GoStop v1 인수인계 컨텍스트로 잡아줘. 작업 폴더 `C:\Personal Project\GoStop`(노트북), origin/main `6a01e63`(+v1 핸드오프 커밋) 동기·clean. 라이브 = https://andy140733-cyber.github.io/gostop-scoreboard/ (GitHub Pages, main 루트, push 시 자동 재배포).
>
> 앱 = 나·엄마·아빠 3인 고스톱 점수 기록·누적·정산 단일 페이지 웹앱(바닐라 JS, 빌드 없음, classic script, localStorage, PWA, 화투 테마). 점수 규칙은 진혁 하우스룰 정본(피박 패자별 ×2 / 폭탄·쓰리고·대판 각 ×2 곱연산 / 독박=고 외치고 진 사람 전부 부담 / 제로섬). 누적은 ledger에서 파생, 정산은 회차 경계.
>
> 핵심 파일: scoring.js(엔진 정본)·ledger.js(누적·정산 경계)·ui.js(화면). 검증 = tests/scoring-tests.html(16) + Playwright(python http.server로 띄워서, file:// 차단). 데이터는 기기별 localStorage, 이전은 설정의 텍스트/JSON.
>
> ★규율: 점수 규칙 임의 변경 금지(진혁 확인). 다른 기기 편집은 github.dev/clone, push하면 라이브 자동 갱신. myPaper 예시 핸드오프는 gitignore(다른 프로젝트 private). 인수인계 정본 = repo docs/handoff/, 5배수마다 통합본."

---

**v1 인수인계 작성 완료** ✅
