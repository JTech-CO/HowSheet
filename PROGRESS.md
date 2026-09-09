# HowSheet Progress

- 현재 phase: P7 - 접근성·모바일·인쇄
- 상태: DONE
- 마지막 갱신: 2026-09-09 KST

## 직전에 끝낸 것

**P7 - 접근성·모바일·인쇄**

- `tests/e2e/` - e2e를 다시 세웠다. 키보드 완주·포커스·상태 표현·알림·320px·인쇄
  11건을 브라우저 3종에서 돌린다 (33건)
- `styles/print.css` - v2 인쇄 규칙. 아무것도 맞히지 못하던 v1 클래스 목록을
  `data-print="hide"`로 바꿨다
- `PromptResult` - `LiveRegion` 하나로 시작·완료·실패를 알리고, 인쇄에서
  높이 상한과 스크롤을 푼다
- 누르는 자리 44px - `size="sm"`, 복사 버튼, 테마 버튼이 32px였다
- **SDK를 생성 시점에 불러온다.** 초기 번들 gzip 184KB → 137KB (-26%)
- 테스트 447개 + e2e 33건. 음성 검증 13건 전부 물었다

**설계 판단**

- **인쇄에서 감출 곳을 속성으로 표시한다.** v1의 클래스 목록은 P0에서 그 이름이
  전부 사라진 뒤로 아무것도 맞히지 못했다. 표시가 실제로 붙어 있는지 세는
  테스트를 함께 뒀다
- **화면의 스크롤 상한이 인쇄에서 프롬프트를 잘랐다.** 인쇄 미디어에서
  `max-height`와 `overflow`를 풀었다. `pre { break-inside: avoid }`도 지웠다 -
  한 페이지를 넘는 블록에 걸면 넘치는 부분이 버려진다
- **알림 경로를 하나로 모은다.** `role="status"`와 `role="alert"`가 따로 있으면
  같은 말이 두 번 읽힌다. 완료 문장에 회차를 넣어 반복도 감지되게 했다
- **작은 버튼은 글자만 작다.** 누르는 자리의 크기와 글자 크기는 다른 문제다 (INV-10)
- **빌드를 e2e의 웹서버 명령에 넣는다.** `vite preview`는 `dist`를 만들지 않아,
  빌드를 빼면 낡은 산출물을 검사하고도 통과한다

**이번 phase에서 드러난 것**

- **`print.css`의 숨김 목록이 아무것도 맞히지 못하고 있었다.** "게이트가 비면
  지운다"가 CSS에도 그대로 적용된다
- **음성 검증에서 물지 않은 두 건의 원인이 달랐다.** 하나는 테스트가 좁았고
  하나는 변이가 관측되지 않았다. "물지 않았다"를 곧바로 "게이트가 비었다"로
  읽으면 멀쩡한 게이트를 고치게 된다
- **포커스 표시가 세 겹이었다.** `reset.css`, `.focus-ring`, 브라우저 기본값.
  한 겹을 지우는 변이로는 게이트를 시험할 수 없다
- **Firefox 정리 단계에서 한 번 튀었다.** 이어진 두 번의 전체 실행은 33/33이다.
  재시도로 덮지 않았다

## 다음 할 일

1. **P8 - 프롬프트 품질 평가셋**
   - **진입조건인 "채점 자동화 범위 확정"이 아직 미결이다.** 채점에 AI를 쓸지,
     금지 목록 위반 같은 기계적 검사만 할지 정해야 시작할 수 있다
   - 고정 자료 5종 이상 × 선택 조합으로 생성하고 채점한다
   - 기준 미달이 **실패로** 보고돼야 한다. 점수만 찍고 통과하지 않는다
2. 미결: 제품정의 §3의 "모델 선택" UI를 어느 phase에 둘지
3. 미결: `@testing-library/jest-dom`을 setup에 연결할지 의존성에서 뺄지

## 미결 질문 / 차단 요소

- **제품 이름을 HowSheet로 유지할지 확정되지 않았다.** v2 제품정의 §11에 적어
  두었다. "한 장으로 설명하는 시트"라는 뜻은 그대로 맞는다
- ~~요소 10종·디자인 축 4종 확정~~ **(2026-09-08 사용자 확정)**: 제품정의
  §4·§5 그대로 간다
- **제품정의 §3의 "모델 선택" UI에 phase가 없다.** P5·P6 어느 할 일에도 없다.
  지금은 상수 하나(`claude-haiku-4-5`)이고, 어디서 만들지 정해야 한다
- **P8 평가셋의 자동화 범위가 정해지지 않았다.** 프롬프트 품질은 눈으로 알 수
  없다. 채점에 AI를 쓸지, 금지 목록 위반 같은 기계적 검사만 할지 정해야 한다
- ~~저장소 계층을 다시 만들어야 한다~~ **(P1에서 해결)**: Dexie를 다시
  들이지 않고 `storage/document.store.ts`를 새로 썼다. 오브젝트 스토어 하나에
  키 하나라 191줄이다. 메모리 폴백과 열기 타임아웃은 v1의 설계를 따랐다
- ~~`features/assets/data-url.ts`에 소비자가 없다~~ **(P2에서 해결)**: P0
  보고서가 건 기한대로 테스트와 함께 지웠다. v2의 결과물은 텍스트라 자산
  인코딩이 들어갈 자리가 없다
- **ESLint 9 / TypeScript 5 고정**: v1 결정 그대로 유지한다. 임의로 올리지 않는다

## 결정 로그

| 날짜       | 결정                                                                     | 근거                                                                                                                                                                                                              | 영향 파일                                      | 결정자        |
| ---------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------- |
| 2026-09-08 | 제품을 프롬프트 생성기로 전환한다                                        | v1의 결과물은 HTML 파일이고 v2의 결과물은 프롬프트 텍스트다. 사용자가 원한 것은 "AI에 붙여넣을 프롬프트를 만드는 웹페이지"였다                                                                                    | 저장소 전체                                    | 사용자        |
| 2026-09-08 | 살릴 것만 남기고 재출발한다 (v1 60% 삭제)                                | 나란히 두면 쓰지 않는 코드가 계속 게이트와 커버리지에 남는다. git 이력에 있으므로 되살릴 수 있다                                                                                                                  | `src/` 전반                                    | 사용자        |
| 2026-09-08 | API 키를 사용자가 브라우저에 입력한다                                    | 백엔드를 두면 호스팅·요금·인증이 생긴다. Anthropic 문서가 브라우저 키를 위험하다고 경고하면서도 "신뢰된 사용자만 쓰는 내부 도구"를 예외로 인정하고, 본인 기기에서 본인 키를 쓰는 이 도구가 거기 해당한다          | P4                                             | 사용자        |
| 2026-09-08 | 경량 모델은 `claude-haiku-4-5`                                           | 프롬프트 작문에 충분하고 저렴하다(입력 $1 / 출력 $5 per MTok). 설정에서 바꿀 수 있게 두되 기본값은 Haiku                                                                                                          | P5                                             | 사용자        |
| 2026-09-08 | 키가 없어도 템플릿 조립으로 동작한다 (INV-02)                            | 키를 요구하는 첫 화면은 제품을 보여 주지 못한다. 폴백이 있어야 오프라인에서도 쓸 수 있다. P3을 P5보다 먼저 만드는 이유다                                                                                          | P3                                             | 에이전트      |
| 2026-09-08 | 모든 생성 프롬프트에 클리셰 금지 조항을 넣는다 (INV-06)                  | 요소·디자인 버튼만으로는 부족하다. "예쁘게 만들어 줘"는 어느 AI에서나 네온 그라데이션과 이모지 제목을 낸다. 금지 목록이 이 제품의 값어치다                                                                        | P3·P5                                          | 에이전트      |
| 2026-09-08 | `isAllowedUrl`을 `utils/url.ts`로 옮긴다                                 | 살균기가 유일한 소비자인데 도메인에 있어서, 도메인을 지우면 살균기가 함께 죽었다. 링크 판정은 가이드 문서의 개념이 아니라 문자열의 성질이다                                                                       | `src/utils/url.ts`, `src/features/sanitize/`   | 에이전트 (P0) |
| 2026-09-08 | `test:security`가 과잉 살균도 잡는다                                     | 잔재 0건만 보면 전부 지워 버리는 살균기가 만점을 받는다. 정상 내용 5종이 살아남는지 함께 본다                                                                                                                     | `scripts/verify-security.mjs`                  | 에이전트 (P0) |
| 2026-09-08 | 라우터를 제거한다                                                        | v2는 화면이 하나다. 자료 입력부터 프롬프트 복사까지가 한 흐름이라 나눌 경계가 없고, 남겨 두면 쓰지 않는 의존성이 번들에 남는다                                                                                    | `src/app/App.tsx`, `package.json`              | 에이전트 (P0) |
| 2026-09-08 | `.claude/launch.json`을 gitignore한다                                    | Node 경로와 포트가 머신마다 다르다. 개인 절대 경로를 커밋하지 않는다 (AGENTS.md §7)                                                                                                                               | `.gitignore`                                   | 에이전트 (P0) |
| 2026-09-08 | 요소 10종·디자인 축 4종을 제품정의 §4·§5 그대로 간다                     | 사용자 확정                                                                                                                                                                                                       | P2                                             | 사용자        |
| 2026-09-08 | 작업 문서를 IndexedDB에 담고 Dexie를 쓰지 않는다                         | 오브젝트 스토어 하나에 키 하나라 Dexie의 쿼리·마이그레이션·테이블 관계가 전부 불필요한데 번들에는 다 들어온다. LocalStorage를 피한 이유는 5MB 상한과 동기 쓰기다 - 자동 저장마다 수백 KB만큼 메인 스레드가 멈춘다 | `src/storage/document.store.ts`                | 에이전트 (P1) |
| 2026-09-08 | 저장소가 어떤 실패에도 던지지 않는다                                     | 저장이 안 된다고 입력까지 막으면 사용자는 작업 자체를 못 한다. 메모리로 떨어지되 어느 모드인지 노출해 화면이 알린다 (INV-07)                                                                                      | `src/storage/document.store.ts`                | 에이전트 (P1) |
| 2026-09-08 | 토큰 수를 어림수로 표시하고 "약"을 붙인다                                | 정확한 값은 모델 토크나이저만 알고 브라우저로 가져오려면 수 MB 사전이 필요하다. 테스트도 특정 숫자를 고정하지 않고 단조성과 크기 감각만 단언한다                                                                  | `src/domain/studio.defaults.ts`                | 에이전트 (P1) |
| 2026-09-08 | 자료 상한을 넘어도 자르지 않고 경고만 한다                               | 자르는 것은 사용자가 모르게 자료를 잃는 일이다 (하네스 P1 주의)                                                                                                                                                   | `src/components/studio/SourceInput/`           | 에이전트 (P1) |
| 2026-09-08 | `useAutosave` 훅을 다시 만들지 않는다                                    | 스토어가 예약기를 직접 든다. 소비자가 하나뿐이라 계층을 하나 줄였다                                                                                                                                               | `src/store/studio.store.ts`                    | 에이전트 (P1) |
| 2026-09-08 | 문서 버전을 올릴 때 올림 경로를 함께 넣는다                              | 모양 검사만 바꾸면 저장된 문서가 "없는 것"이 되어 사용자가 붙여넣어 둔 자료가 사라진다 (INV-07)                                                                                                                   | `src/domain/studio.defaults.ts`                | 에이전트 (P2) |
| 2026-09-08 | 디자인 축에 네이티브 라디오를 쓴다                                       | 화살표 이동과 "하나만 켜짐"을 브라우저가 지킨다. 버튼으로 다시 만들면 DoD 2를 손으로 구현하게 되고 틀릴 자리가 생긴다                                                                                             | `src/components/studio/DesignPicker/`          | 에이전트 (P2) |
| 2026-09-08 | 카탈로그가 프롬프트 요구 문구를 함께 갖는다                              | 떼어 놓으면 P3의 조립기가 같은 목록을 다시 만들게 되고 한쪽만 고쳐지는 날이 온다                                                                                                                                  | `src/domain/spec.types.ts`                     | 에이전트 (P2) |
| 2026-09-08 | 선택을 카탈로그 순서로 정렬해 담는다                                     | 고른 순서를 따르면 같은 선택에서 다른 프롬프트가 나와 P3의 결정론이 깨진다                                                                                                                                        | `src/domain/spec.defaults.ts`                  | 에이전트 (P2) |
| 2026-09-08 | 저장 스냅샷 비교를 편집 가능한 필드 전체로 넓힌다                        | 자료만 비교하면 저장이 도는 동안 누른 토글이 스냅샷에 덮여 사라진다 (INV-07)                                                                                                                                      | `src/store/studio.store.ts`                    | 에이전트 (P2) |
| 2026-09-08 | 존재하지 않는 CSS 토큰 9종을 실재하는 이름으로 바꾼다                    | 정의되지 않은 `var()`는 선언 전체를 조용히 무효로 만들고 테스트·린트·타입 검사가 잡지 못한다                                                                                                                      | `src/**/*.module.css`, `src/styles/themes.css` | 에이전트 (P2) |
| 2026-09-08 | 빈 게이트 두 개를 지운다                                                 | 검사 대상이 사라진 규칙은 통과가 아니라 삭제 대상이다 (CLAUDE.md)                                                                                                                                                 | `vitest.config.ts`, `src/features/assets/`     | 에이전트 (P2) |
| 2026-09-08 | 금지 목록을 문자열이 아니라 배열로 둔다                                  | 문단 하나로 뭉치면 "그 문단이 들어갔는가"만 보게 되고 목록이 비어도 통과한다 (하네스 P3 주의)                                                                                                                     | `src/domain/prompt.rules.ts`                   | 에이전트 (P3) |
| 2026-09-08 | 자료 울타리 길이를 자료에서 계산한다                                     | 자료가 울타리를 닫고 나오면 그 뒤가 프롬프트의 지시문으로 읽힌다. 살균 경계와 다른 층의 주입이다                                                                                                                  | `src/features/compose/compose.ts`              | 에이전트 (P3) |
| 2026-09-08 | 자료 상한 60,000자, 넘으면 자르되 숫자로 밝힌다                          | 조용히 자르는 것은 사용자가 모르게 자료를 잃는 일이다. 줄 경계로 되감으면 밝힌 숫자보다 더 버린다                                                                                                                 | `src/features/compose/compose.ts`              | 에이전트 (P3) |
| 2026-09-08 | `missingProhibitions`를 조립기 옆에 둔다                                 | P5가 AI 출력을 검사해야 하는데, 목록을 아는 쪽이 판정해야 목록이 두 벌이 되지 않는다 (P5 DoD 4)                                                                                                                   | `src/features/compose/compose.ts`              | 에이전트 (P3) |
| 2026-09-09 | 저장소 탐지만 공용으로 빼고 키 정책은 분리한다                           | 허용 목록·마스킹·삭제는 정책이라 나누고, "이 브라우저에서 localStorage를 쓸 수 있는가"는 환경 탐지라 두 벌이 되면 안 된다                                                                                         | `src/storage/browser-store.ts`                 | 에이전트 (P4) |
| 2026-09-09 | 전체 키를 얻는 길을 `readForAnthropicRequest()` 하나로 둔다              | 이름이 곧 허용된 용도다. 상태는 마스킹된 형태만 주어 devtools·오류 보고에 키가 실리지 않는다 (INV-01)                                                                                                             | `src/storage/api-key.store.ts`                 | 에이전트 (P4) |
| 2026-09-09 | 오류와 폴백 이유에 입력·예외 메시지를 싣지 않는다                        | 저장소가 던진 예외에 키가 들어 있을 수 있고, 그것을 옮기면 화면과 콘솔에 남는다 (DoD 4)                                                                                                                           | `src/storage/api-key.store.ts`                 | 에이전트 (P4) |
| 2026-09-09 | `API_KEY_BOUNDARY`는 리터럴을 막고 상수 import는 막지 않는다             | 키 이름이 바뀌면 관련 검사가 함께 따라가야 한다. 규칙이 기존 테스트의 하드코딩을 실제로 잡았다                                                                                                                    | `scripts/verify-architecture.mjs`              | 에이전트 (P4) |
| 2026-09-09 | 삭제 실패를 조용히 지나가지 않는다                                       | 상태만 "없음"으로 바꾸면 사용자는 지워졌다고 믿는데 브라우저에는 남는다. 폐기하라고 알린다                                                                                                                        | `src/storage/api-key.store.ts`                 | 에이전트 (P4) |
| 2026-09-09 | `@anthropic-ai/sdk` 0.124.0을 넣는다                                     | 하네스 P5가 `dangerouslyAllowBrowser` 근거를 호출 지점에 남기라고 지정한다. 공식 SDK를 쓰는 편이 오류 클래스와 스트리밍을 손으로 만들지 않는다                                                                    | `package.json`                                 | 에이전트 (P5) |
| 2026-09-09 | SDK 오류의 이름을 클라이언트 경계에서 세운다                             | 연결 실패와 취소는 status가 없고 name도 Error라 구조 판정으로 구분되지 않는다. instanceof를 쓸 수 있는 곳에서 번역한다                                                                                            | `src/features/synthesize/anthropic.client.ts`  | 에이전트 (P5) |
| 2026-09-09 | 실패를 오류 화면이 아니라 템플릿 폴백으로 다룬다                         | 빈 오류 화면을 내밀면 사용자는 아무것도 얻지 못한 채 원인을 찾아야 한다. 쓸 수 있는 프롬프트가 함께 나온다 (INV-02)                                                                                               | `src/features/synthesize/synthesize.ts`        | 에이전트 (P5) |
| 2026-09-09 | 취소는 폴백을 만들지 않고 그대로 던진다                                  | 다시 만들기를 눌렀다가 멈췄을 때 앞의 결과까지 사라지면 되돌릴 방법이 없다 (DoD 5)                                                                                                                                | `src/store/generate.store.ts`                  | 에이전트 (P5) |
| 2026-09-09 | SDK 재시도를 끈다 (`maxRetries: 0`)                                      | 429나 5xx를 조용히 두 번 더 보내면 사용자는 왜 오래 걸리는지 모르고 안내도 그만큼 늦게 뜬다                                                                                                                       | `src/features/synthesize/anthropic.client.ts`  | 에이전트 (P5) |
| 2026-09-09 | 전체 키를 읽는 길을 `features/synthesize/`에 가둔다                      | 스토어와 컴포넌트가 전체 키를 보지 못하게 한다. 테스트도 대역을 주입해 같은 길로 지난다 (INV-01)                                                                                                                  | `scripts/verify-architecture.mjs`              | 에이전트 (P5) |
| 2026-09-09 | 재생성이 이전 결과를 덮지 않고 목록에 쌓는다                             | 확인 대화상자는 한 번 더 누르게 하면서 되돌리지는 못한다. 남겨 두면 확인이 필요 없다 (P6 DoD 3)                                                                                                                   | `src/store/generate.store.ts`                  | 에이전트 (P6) |
| 2026-09-09 | 회차 번호를 스토어가 붙이고 다시 쓰지 않는다                             | 같은 이름의 파일이 두 번 내려가면 브라우저가 (1)을 붙여 어느 쪽이 어느 것인지 알 수 없다                                                                                                                          | `src/store/generate.store.ts`                  | 에이전트 (P6) |
| 2026-09-09 | 파일명을 자료의 첫 줄에서 만든다                                         | v2에는 제목 필드가 없다. 첫 줄은 대부분 제목이고 여러 자료의 프롬프트를 한 폴더에서 구분해 준다                                                                                                                   | `src/utils/filename.ts`                        | 에이전트 (P6) |
| 2026-09-09 | DoD 4를 선언 검사와 실기기 측정 두 층으로 본다                           | jsdom은 레이아웃을 계산하지 않는다. 테스트만으로 "가로 스크롤 없음"을 주장하지 않는다                                                                                                                             | `tests/integration/result/`                    | 에이전트 (P6) |
| 2026-09-09 | 인쇄에서 감출 곳을 클래스가 아니라 `data-print="hide"` 속성으로 표시한다 | v1의 클래스 목록은 그 이름들이 P0에서 사라진 뒤로 아무것도 맞히지 못했다. 속성은 마크업에 붙어 있는지 눈으로 확인할 수 있다                                                                                       | `src/styles/print.css`                         | 에이전트 (P7) |
| 2026-09-09 | 인쇄에서 결과 상자의 높이 상한과 스크롤을 푼다                           | 화면의 스크롤 상한이 남으면 첫 상자 분량만 나오고 나머지가 사라진다 (DoD 5)                                                                                                                                       | `src/components/studio/PromptResult/`          | 에이전트 (P7) |
| 2026-09-09 | 알림 경로를 LiveRegion 하나로 모은다                                     | 보이는 문구에 role을 또 붙이면 같은 말이 두 번 읽힌다. 완료 문장에 회차를 넣어 반복도 감지되게 했다                                                                                                               | `src/components/studio/PromptResult/`          | 에이전트 (P7) |
| 2026-09-09 | 작은 버튼도 누르는 자리는 44px로 둔다                                    | 누르는 자리의 크기와 글자 크기는 다른 문제다 (INV-10)                                                                                                                                                             | `Button·CopyButton·ThemeToggle`                | 에이전트 (P7) |
| 2026-09-09 | e2e 웹서버 명령에 빌드를 넣는다                                          | `vite preview`는 dist를 만들지 않는다. 빌드를 빼면 낡은 산출물을 검사하고도 통과한다                                                                                                                              | `playwright.config.ts`                         | 에이전트 (P7) |
| 2026-09-09 | Anthropic SDK를 생성 시점에 동적으로 불러온다                            | 키가 없으면 템플릿 경로로 끝나 SDK가 필요 없다. 초기 번들 gzip 184KB → 137KB                                                                                                                                      | `src/features/synthesize/anthropic.client.ts`  | 에이전트 (P7) |

## 검증 로그

| 날짜       | 명령                                                                    | 결과                                                                         | 증거                               |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| 2026-09-08 | `pnpm format:check` · `lint` · `typecheck` · `build`                    | 성공                                                                         | `artifacts/qa/phase-reports/P0.md` |
| 2026-09-08 | `pnpm test:unit`                                                        | 성공 - 175 passed (5 파일)                                                   | `artifacts/qa/phase-reports/P0.md` |
| 2026-09-08 | `pnpm test:security` (v2 픽스처)                                        | 성공 - 블록 38개, 필수 페이로드 12종, 정상 내용 5종                          | `artifacts/qa/phase-reports/P0.md` |
| 2026-09-08 | `pnpm verify:architecture`                                              | 성공 - 소스 42개(src 31개), 규칙 5종                                         | `artifacts/qa/phase-reports/P0.md` |
| 2026-09-08 | `pnpm verify:dependencies`                                              | 성공                                                                         | `artifacts/qa/phase-reports/P0.md` |
| 2026-09-08 | 개발 서버 실행 후 화면 확인                                             | 성공 - 콘솔 오류 0건, 섹션 4종의 aria-labelledby 해석 확인                   | `artifacts/qa/phase-reports/P0.md` |
| 2026-09-08 | `pnpm exec vitest run tests/unit/source tests/integration/source`       | 성공 - 37 passed                                                             | `artifacts/qa/phase-reports/P1.md` |
| 2026-09-08 | P1 음성 검증 11건                                                       | 11건 모두 의도대로 실패. 1건은 처음에 물지 않아 테스트를 보강했다            | `artifacts/qa/phase-reports/P1.md` |
| 2026-09-08 | 전체 회귀 (format/lint/typecheck/test/verify*/build)                    | 성공 - 단위 189, 통합 23                                                     | `artifacts/qa/phase-reports/P1.md` |
| 2026-09-08 | 실제 브라우저에서 입력 → 새로고침                                       | 성공 - 149자 복원, 살균 확인, 네트워크 전부 200                              | `artifacts/qa/phase-reports/P1.md` |
| 2026-09-08 | `pnpm exec vitest run tests/unit/spec tests/integration/spec`           | 성공 - 52 passed                                                             | `artifacts/qa/phase-reports/P2.md` |
| 2026-09-08 | P2 음성 검증 11건                                                       | 11건 모두 의도대로 실패. 11번은 저장 중 편집 손실이라는 진짜 결함을 드러냈다 | `artifacts/qa/phase-reports/P2.md` |
| 2026-09-08 | 전체 회귀 (format/lint/typecheck/test/verify*/build)                    | 성공 - 단위 208, 통합 41                                                     | `artifacts/qa/phase-reports/P2.md` |
| 2026-09-08 | 실제 브라우저에서 선택 → 새로고침                                       | 성공 - 자료 149자 + 요소 2종 + 축 4/4 복원, 콘솔 오류 0건                    | `artifacts/qa/phase-reports/P2.md` |
| 2026-09-08 | `pnpm exec vitest run tests/unit/compose`                               | 성공 - 48 passed                                                             | `artifacts/qa/phase-reports/P3.md` |
| 2026-09-08 | P3 음성 검증 13건                                                       | 13건 모두 의도대로 실패                                                      | `artifacts/qa/phase-reports/P3.md` |
| 2026-09-08 | 전체 회귀 (format/lint/typecheck/test/verify*/build)                    | 성공 - 단위 256, 통합 41                                                     | `artifacts/qa/phase-reports/P3.md` |
| 2026-09-09 | `pnpm exec vitest run tests/unit/api-key tests/integration/settings`    | 성공 - 35 passed                                                             | `artifacts/qa/phase-reports/P4.md` |
| 2026-09-09 | P4 음성 검증 14건                                                       | 14건 모두 의도대로 실패. 8번은 처음에 물지 않아 "보인다"를 검사하도록 고쳤다 | `artifacts/qa/phase-reports/P4.md` |
| 2026-09-09 | 전체 회귀 (format/lint/typecheck/test/verify*/build)                    | 성공 - 단위 279, 통합 53, 규칙 6종                                           | `artifacts/qa/phase-reports/P4.md` |
| 2026-09-09 | 실제 브라우저에서 키 저장 → 새로고침 → 삭제                             | 성공 - 마스킹만 노출, 삭제 후 localStorage null, 외부 요청 0/68건            | `artifacts/qa/phase-reports/P4.md` |
| 2026-09-09 | `pnpm exec vitest run tests/unit/synthesize tests/integration/generate` | 성공 - 85 passed                                                             | `artifacts/qa/phase-reports/P5.md` |
| 2026-09-09 | P5 음성 검증 16건                                                       | 16건 모두 의도대로 실패. 10번은 처음에 물지 않아 갈래를 전부 지나도록 고쳤다 | `artifacts/qa/phase-reports/P5.md` |
| 2026-09-09 | 전체 회귀 (format/lint/typecheck/test/verify*/build)                    | 성공 - 단위 348, 통합 69, 규칙 7종, 번들 gzip 183KB                          | `artifacts/qa/phase-reports/P5.md` |
| 2026-09-09 | 실제 브라우저에서 템플릿 경로 생성                                      | 성공 - 출처 배지·고른 요소 지시·금지 7종·자료 인용 확인, 외부 요청 0/81건    | `artifacts/qa/phase-reports/P5.md` |
| 2026-09-09 | `pnpm exec vitest run tests/integration/result`                         | 성공 - 14 passed                                                             | `artifacts/qa/phase-reports/P6.md` |
| 2026-09-09 | P6 음성 검증 13건                                                       | 13건 모두 의도대로 실패                                                      | `artifacts/qa/phase-reports/P6.md` |
| 2026-09-09 | 전체 회귀 (format/lint/typecheck/test/verify*/build)                    | 성공 - 단위 364, 통합 83, 소스 81개                                          | `artifacts/qa/phase-reports/P6.md` |
| 2026-09-09 | 실제 브라우저 320px에서 4,000자 한 줄                                   | 성공 - 가로 스크롤 없음, 파일명 배포-절차.r2.md / r1.md, 복사 폴백 동작      | `artifacts/qa/phase-reports/P6.md` |
| 2026-09-09 | `pnpm exec playwright test`                                             | 성공 - 33 passed (chromium·firefox·webkit)                                   | `artifacts/qa/phase-reports/P7.md` |
| 2026-09-09 | P7 음성 검증 13건                                                       | 13건 모두 의도대로 실패. 2건은 처음에 물지 않았고 원인이 서로 달랐다         | `artifacts/qa/phase-reports/P7.md` |
| 2026-09-09 | 전체 회귀 (format/lint/typecheck/test/verify*/build)                    | 성공 - 단위 364, 통합 83                                                     | `artifacts/qa/phase-reports/P7.md` |
| 2026-09-09 | 번들 측정 (SDK 지연 로딩)                                               | 초기 gzip 184.47KB → 137.01KB (-26%), SDK 청크 46.99KB는 생성할 때만         | `artifacts/qa/phase-reports/P7.md` |
