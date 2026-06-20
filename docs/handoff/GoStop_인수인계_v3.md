# GoStop 점수판 인수인계 v3

**작성일**: 2026-06-21
**기기**: PC (Windows 11)
**기반 commit**: `94af650` "feat: 점수 보정 음수 입력 지원(모바일 ± 부호 토글) + sw 캐시 v2" (이번 세션의 **기능 커밋 정본**, origin/main 동기 예정, working tree clean). ※이 v3 핸드오프가 그 위 1커밋(docs)이 된다.
**직전 인수인계**: v2 (`5df8656` "docs: v2 인수인계 추가")
**직전 통합본**: 없음 (다음 통합본 = v5 예정)
**유형**: 개별 인수인계
**작업 모델**: **Claude Code 단독**(요구 분석·설계·구현·적대적 멀티에이전트 리뷰·시각/실측 검증·git/배포) + 진혁(요구 제시·결정).

---

> ⚠️ **해시 시차 주의**
> 위 기반 `94af650`는 이번 세션의 **앱 코드 변경 정본**(ui.js/styles.css/sw.js)이고, 이 v3 파일을 커밋하면 HEAD가 "docs: v3 인수인계"로 한 칸 더 앞선다. **앱 코드 정본 = `94af650`, 그 위 = 이 문서(+README/CLAUDE.md 동봉).**

---

## 0. 한 줄 요약

진혁 요청 1건 — **모바일(아이폰)에서 점수 보정 음수 입력 불가** — 을 해결했다. iOS 숫자 키패드엔 마이너스(−) 키가 없어 음수 보정을 칠 수 없던 문제를, 각 입력칸 왼쪽 **±(부호) 토글 버튼**으로 풀었다(입력칸=크기 전용, 버튼=부호, 실제 델타 = `sign × mag`). **멀티에이전트 적대적 리뷰**(11건 발견 → 2건 확정/9건 기각)로 데스크톱 부호 동기화 엣지 2건을 커밋 전 반영했고, PWA 캐시를 v1→v2로 올려 재배포했다. 점수 엔진·누적·정산·통계·백업은 **무손**(`records.js` 등 비변경, 16/16 테스트 그대로 PASS).

---

## 1. 직전 단계 (v2 요약)

v1 배포본 위에 진혁 요청 4건(① iOS 날짜 필터 겹침, ② 회차·판 번호 수동 조정, ③ 한글 어절 줄바꿈, ④ 다크 네이티브 컨트롤 가독성)을 구현하고 적대적 리뷰로 엣지 7건을 반영해 라이브 재배포. `settings.periodOffset/gameOffset` 표시 오프셋 도입(점수 무영향). 상세는 `GoStop_인수인계_v2.md`.

---

## 2. 이번 단계 (v3) — 모바일 음수 보정 입력

### 2-1. 증상 / 원인
- **증상**: 아이폰에서 **점수 보정**(✎ 점수 보정)을 시도하면 숫자 키패드만 떠서, **뺄 값(음수)을 입력할 방법이 없음**.
- **원인**: 보정 입력칸이 `type="number" inputmode="numeric"`이라 모바일에서 **숫자 전용 키패드**가 뜨는데, **iOS 숫자 키패드엔 마이너스(−) 키가 없다**(decimal 키패드도 마찬가지). `inputmode`만으로는 음수를 칠 수 없음 → UI 차원의 부호 입력 수단이 필요.

### 2-2. 설계 — 부호(±)와 크기 분리
- 보정값을 **부호와 크기로 분리**해 다룬다. **입력칸 = 크기(자릿수) 전용**(숫자 키패드로 입력), **부호 = 각 칸 왼쪽 ± 토글 버튼**. 실제 델타 = `sign × mag`.
- `corrDraft` 구조 변경: `{ reason, editingSeq, sign:{me,mom,dad}, mag:{me,mom,dad} }`.
  - `openCorrectionModal`: 편집 시 기존 정수 델타를 `sign = (값<0 ? -1 : 1)`, `mag = Math.abs(값)`로 **분해**(왕복 무손, 0은 `{+,0}`).
  - 헬퍼 `corrDelta(d, id) = d.sign[id] * d.mag[id]`로 **저장·빈입력 검증 모두 일원화**(0 판정은 `corrDelta`가 모두 0인지).
- `buildCorrectionModal`: 행마다 `<button class="corr-sign[.neg]" data-corrsign aria-label aria-pressed>±(+/−)</button>` + `<input type="number" inputmode="numeric" min="0" data-corr value="크기">`.
- `onCorrModalClick`:
  - `data-corrsign` 클릭 → 부호 토글. **전체 재렌더 없이 그 버튼만** `textContent`/`classList(neg)`/`aria-pressed` 갱신(다른 칸의 포커스/입력값 보존) 후 `return`.
  - 그 외 `save-corr` → `deltas = {me,mom,dad}`를 `corrDelta`로 합성해 0체크 후 `R.updateCorrection`/`R.addCorrection` 호출.
- `onCorrModalInput`: `reason` 외 칸은 `mag[key] = Math.abs(parseInt(raw))`. **데스크톱에서 `−`를 직접 타이핑하면** ① 부호 버튼을 음수로 맞추고 ② **입력칸의 `−`를 즉시 제거(크기만 표시)** → 부호 이중 표기·단방향 불일치 원천 차단(아래 2-4 참고).
- CSS(`css/styles.css`): `.corr-row` 그리드 `60px auto 1fr`(이름/버튼/입력). `.corr-sign`(min-width 52 · **height 44** · radius 9 · felt-2 배경 · 22px). `.corr-sign.neg`(빨강 그라데이션 + `--red-deep` 보더).

### 2-3. 인터페이스 무변경(회귀 0)
- `js/records.js`는 **변경 없음**. `addCorrection(state, deltas, reason)`/`updateCorrection(state, seq, deltas, reason)`가 받는 `deltas`는 여전히 `{me,mom,dad}` 정수 객체. `sign/mag` 분리 구조는 **`ui.js`의 `corrDraft` 내부에만 존재**하고 records 경계를 넘지 않는다(호출부는 `corrDelta`로 합성한 평탄 정수 객체 전달).
- 보정의 **'제로섬 비강제'** 의미 보존(보정은 `computeDeltas`의 제로섬과 달리 합=0을 강제하지 않음 — 정본). `scoring.js`/`ledger.js`/`stats.js` 무영향(음수 델타는 기존 `acc += deltas.x|0` 경로로 그대로 합산).

### 2-4. 적대적 멀티에이전트 리뷰 (Workflow) → 엣지 2건 반영
구현 후 커밋 전, **3개 렌즈(로직 / 회귀·인터페이스 / UX·접근성) × 적대적 검증** 워크플로로 변경 diff를 리뷰. **원시 11건 중 2건 확정·9건 기각**. 확정 2건은 모두 "**데스크톱에서 `−`를 직접 타이핑하는 경로**"(견고성용으로 추가했던 코드)의 결함이었고, 둘 다 반영:

1. **(MED)** 부호 동기화가 **단방향(+→−)**이라, 데스크톱에서 `-5`로 음수를 만든 뒤 마음을 바꿔 `5`로 고쳐도 부호가 −로 남아 **`-5`로 잘못 저장**.
2. **(LOW)** 타이핑한 `−`가 입력칸에 남아 부호 버튼과 함께 **`−(−7)`처럼 이중 음수로 표시**(데이터는 정확하나 표시 모순).

→ **하나의 수정으로 동시 해소**: `−`가 입력되면 부호 버튼을 음수로 맞춤과 **동시에 입력칸의 `−`를 즉시 제거**(크기만 표시). 입력칸엔 `−`가 절대 남지 않으므로 (a) 이중 표기가 사라지고, (b) "지울 `−`"가 없어 단방향 불일치도 발생 불가 — **부호 전환은 오직 ± 버튼**으로 일원화. 양수 타이핑 경로는 `−`가 없어 이 블록을 건너뛰어 캐럿 보존.

기각 9건은 전부 "**결함이 아니라 정상/회귀 없음 확인**"이었음(records 계약 유지, 제로섬 비강제 보존, scoring·ledger·stats 무영향, 음수 필요한 다른 입력칸 0개, `-0` 직렬화·비교 무해, 편집 왕복 정확, 입력칸 39px·`±` 문구·aria-label은 사용성 폴리시 nit).

---

## 3. 데이터 모델 / 설계 결정 (수정 시 지킬 것)

- **점수 보정 모달의 부호 입력 = ± 토글 버튼이 정본.** 입력칸은 **크기(절대값) 전용**(`min=0`), 실제 델타는 `corrDelta = sign × mag`. 새로 음수 입력이 필요한 칸을 만들면 **같은 패턴(크기 칸 + 부호 버튼)**을 따를 것(모바일 숫자 키패드엔 −키가 없음).
- `corrDraft`는 `{reason, editingSeq, sign:{}, mag:{}}` — 부호·크기 분리는 **UI 레이어 한정**. records/ledger/stats에는 **합성된 정수 델타**만 넘긴다(인터페이스 무변경 유지).
- 저장 경로(`R.addCorrection`/`R.updateCorrection`)는 v2와 동일. `sanitizeDeltas`가 `Math.trunc`로 부호 보존.
- PWA: **CSS/JS 등 정적 자산을 바꾸면 `sw.js`의 `CACHE` 버전을 올린다**(이번에 `gostop-cache-v1` → `v2`). 네트워크 우선이라 온라인이면 즉시 최신이지만, 캐시 버전 갱신으로 구캐시를 `activate`에서 확실히 제거.

---

## 4. 현재 상태 (v3 종료 시점)

| 항목 | 상태 |
|---|---|
| origin HEAD | `94af650`(feature) + 이 v3 핸드오프 커밋, push 후 origin 동기, clean |
| 라이브 | https://andy140733-cyber.github.io/gostop-scoreboard/ (`main` push로 자동 재배포) |
| 신규 | 점수 보정 **음수 입력**(± 부호 토글, 입력칸=크기/버튼=부호) · sw 캐시 v2 |
| 검증 | 엔진 **16/16 PASS**(불변) · Playwright(아이폰 390) 음수 생성·수정·복구·저장 델타 실측 · 콘솔 에러 0(favicon 404만 무관) |
| 회귀 | records/scoring/ledger/stats/backup **무손**, 게임·정산·통계·백업 정상 |

---

## 5. 검증 상세 (이번 세션)

- **엔진**: `tests/scoring-tests.html` **16/16 PASS**(변경 전후 동일). `node --check js/*.js` 전부 OK.
- **음수 보정 생성**(iPhone 390px): 나 +5 / 엄마 −5(부호 버튼 토글) / 아빠 0 → 저장 델타 `{me:5, mom:-5, dad:0}` 정확, 누적판 **나 +35 · 엄마 −20 · 아빠 −15** 반영, 기록 목록 표기 정확.
- **편집 왕복**: 기존 음수 보정(엄마 −5)을 다시 열면 **크기 5 + 부호 −**로 분해 표시(제목 "보정 수정", 버튼 "수정 저장").
- **데스크톱 `−` 직접 타이핑(리뷰 픽스 재검증)**: `-7` 입력 → 칸은 **`7`로 정규화**·버튼 `−`(이중 표기 없음). `-5` 후 양수 복구는 **버튼 클릭으로** `+` 전환(칸엔 `−` 없음). 혼합 저장 `{me:5, mom:8, dad:-7}` 정확. 양수 `8` 타이핑은 정규화 미발동(캐럿 보존), 버튼 `+`.
- **콘솔 에러 0건**. 멀티에이전트 적대적 리뷰(14 에이전트)로 엣지 2건 확정·반영, 9건은 회귀 없음으로 코드 추적 확인.

---

## 6. 다음 단계 (후보 — 진혁 결정 대기)

1. (편의) 빠른 입력 개선(기본 승자 기억 등), 통계 그래프, 다크/라이트 토글.
2. (테스트·선택) 보정 음수/제로섬-비강제 누적 반영을 엔진 테스트류에 회귀 케이스로 추가(프로덕션 코드는 손대지 말 것 — 제로섬 강제는 규칙 위반).
3. (운영) v5에서 통합본(압축 미적용) 작성.
4. (보류·미채택 유지) 광박 규칙, 판별 메모, 실시간 클라우드 동기화.

---

## 7. 세션 메타

- **기기**: PC(Windows 11). **Claude Code 단독** + 진혁.
- **이번 세션 커밋**: `94af650`(feat, 3파일 +62/−12) + 이 v3 인수인계 커밋(README/CLAUDE.md 동봉).
- **도구**: 멀티에이전트 Workflow(3렌즈 적대적 코드리뷰·발견별 검증), Playwright(아이폰 390 시각·실측·localStorage 확인), Node(`--check`), python http.server(로컬), git push(자동 Pages 재배포).
- **외부 자원**: 저장소 https://github.com/andy140733-cyber/gostop-scoreboard · 라이브 https://andy140733-cyber.github.io/gostop-scoreboard/ (메모리 `gostop-deploy`).

---

## 8. 다음 세션 진입 인사 (참고)

> "GoStop v3 인수인계 컨텍스트로 잡아줘. 작업 폴더 `C:\Personal Project\GoStop`, origin/main `94af650`(+v3 핸드오프 커밋) 동기·clean. 라이브 = https://andy140733-cyber.github.io/gostop-scoreboard/ (GitHub Pages, main 루트, push 시 자동 재배포).
>
> 앱 = 나·엄마·아빠 3인 고스톱 점수 기록·누적·정산 단일 페이지 웹앱(바닐라 JS, 빌드 없음, classic script, localStorage, PWA). v3에서 추가: **점수 보정 음수 입력**. iOS 숫자 키패드엔 −키가 없어, 보정 입력칸을 **크기 전용**(inputmode=numeric, min=0)으로 두고 각 칸 왼쪽 **± 부호 토글 버튼**으로 음/양수를 정한다(실제 델타 = sign × mag). `corrDraft`={reason,editingSeq,sign,mag}, 헬퍼 `corrDelta`. 데스크톱 `−` 직접 타이핑 시 부호 버튼 동기화 + 칸의 `−` 제거. CSS `.corr-sign`/`.corr-sign.neg`. sw 캐시 v1→v2. `records.js`는 무변경(인터페이스 유지).
>
> 핵심 파일: scoring.js(엔진 정본, 무손)·records.js(보정 저장 계약, 무손)·ledger.js(누적·정산·회차/판 파생)·ui.js(화면+보정/조정 모달)·backup.js. 검증 = scoring-tests.html(16/16) + Playwright(http.server, file:// 차단).
>
> ★규율: 점수 규칙 정본 유지. 보정은 **제로섬 비강제**(합=0 강제 금지). 음수 입력 칸은 **크기 칸 + 부호 버튼** 패턴. 부호·크기 분리는 UI 한정(records엔 합성 정수만). 정적 자산 변경 시 sw.js CACHE 버전 ↑. 인수인계 정본 = repo docs/handoff/, 5배수마다 통합본."

---

**v3 인수인계 작성 완료** ✅
