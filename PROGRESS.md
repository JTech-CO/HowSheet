# HowSheet Progress

- 현재 phase: P5 - AI 프롬프트 합성
- 상태: DONE
- 마지막 갱신: 2026-09-09 KST

## 직전에 끝낸 것

**P5 - AI 프롬프트 합성**

- `features/synthesize/` - 시스템 프롬프트(§6.2), Anthropic 스트리밍, 오류 분류,
  AI/템플릿 갈래, 금지 목록 강제
- `store/generate.store.ts` - 진행·취소·**이전 결과 보존**
- `components/studio/PromptResult/` - 생성 버튼, 스트리밍, 출처 배지, 실패 안내
- `verify:architecture`에 `API_KEY_READER` 추가. 규칙 7종이 됐다
- 새 의존성 `@anthropic-ai/sdk` 0.124.0
- 테스트 417개(단위 348, 통합 69). 음성 검증 16건 전부 물었다

**설계 판단**

- **SDK 오류의 이름을 경계에서 세운다.** `APIConnectionError`와
  `APIUserAbortError`는 `status`가 없고 `name`도 `'Error'`라 구조 판정으로
  구분되지 않는다. `instanceof`를 쓸 수 있는 클라이언트가 이름을 붙여 다시 던지고,
  판정은 순수한 채로 남는다
- **취소에는 근거를 하나 더 둔다.** `signal.aborted`를 먼저 본다. 우리가 멈춘 것을
  아는 가장 확실한 신호이고 SDK가 바뀌어도 흔들리지 않는다
- **실패는 오류 화면이 아니라 폴백이다.** 401·429·네트워크 어느 쪽이든 쓸 수 있는
  프롬프트가 함께 나오고, 화면이 그 상황에 맞는 문장을 잇는다 (INV-02)
- **취소는 결과가 아니다.** 폴백을 만들지 않고 그대로 던져, 스토어가 이전 결과를
  지키게 둔다 (DoD 5)
- **재시도를 SDK에 맡기지 않는다.** `maxRetries: 0`. 조용히 두 번 더 보내면
  사용자는 왜 오래 걸리는지 모르고 안내도 그만큼 늦다
- **키가 지나가는 길을 `features/synthesize/`에 가둔다.** 스토어와 컴포넌트는
  전체 키를 보지 못한다 (INV-01)

**이번 phase에서 드러난 것**

- **가짜 오류로 만든 테스트는 진짜와 어긋날 수 있다.** 구조 판정이 SDK의 실제
  오류 두 종을 놓치고 있었고, 진짜 SSE 응답을 흘려 보내는 테스트가 즉시 드러냈다
- **음성 검증이 "한 갈래만 보는 테스트"를 짚었다.** 누출 검사가 여섯 갈래 중
  하나만 지나고 있었다. 몇 갈래를 지났는지 세는 단언을 붙여야 공허해지지 않는다
- **새 규칙이 내 테스트를 먼저 잡았다.** 규칙을 느슨하게 하는 대신 테스트가
  지나는 길을 고쳤다
- **`pnpm add`가 캐럿 범위를 남겼다.** `save-exact=true`가 있는데도 `^0.124.0`으로
  들어왔고 `verify:dependencies`가 잡았다

## 다음 할 일

1. **P6 - 결과 화면**
   - 복사(실패 시 전체 선택 폴백), `.md` 다운로드, 재생성, 이전 결과 보기
   - 다운로드 파일명은 `utils/filename.ts`의 규칙을 따른다
   - 재생성이 이전 결과를 덮기 전에 확인을 받거나 이전 것을 남긴다
   - 긴 프롬프트에서 가로 스크롤이 생기지 않아야 한다
2. **P7** - 접근성·모바일·인쇄. 번들 크기(현재 gzip 183KB)와 SDK 동적 import도 함께 본다
3. **P8** - 프롬프트 품질 평가셋

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

| 날짜       | 결정                                                         | 근거                                                                                                                                                                                                              | 영향 파일                                      | 결정자        |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------- |
| 2026-09-08 | 제품을 프롬프트 생성기로 전환한다                            | v1의 결과물은 HTML 파일이고 v2의 결과물은 프롬프트 텍스트다. 사용자가 원한 것은 "AI에 붙여넣을 프롬프트를 만드는 웹페이지"였다                                                                                    | 저장소 전체                                    | 사용자        |
| 2026-09-08 | 살릴 것만 남기고 재출발한다 (v1 60% 삭제)                    | 나란히 두면 쓰지 않는 코드가 계속 게이트와 커버리지에 남는다. git 이력에 있으므로 되살릴 수 있다                                                                                                                  | `src/` 전반                                    | 사용자        |
| 2026-09-08 | API 키를 사용자가 브라우저에 입력한다                        | 백엔드를 두면 호스팅·요금·인증이 생긴다. Anthropic 문서가 브라우저 키를 위험하다고 경고하면서도 "신뢰된 사용자만 쓰는 내부 도구"를 예외로 인정하고, 본인 기기에서 본인 키를 쓰는 이 도구가 거기 해당한다          | P4                                             | 사용자        |
| 2026-09-08 | 경량 모델은 `claude-haiku-4-5`                               | 프롬프트 작문에 충분하고 저렴하다(입력 $1 / 출력 $5 per MTok). 설정에서 바꿀 수 있게 두되 기본값은 Haiku                                                                                                          | P5                                             | 사용자        |
| 2026-09-08 | 키가 없어도 템플릿 조립으로 동작한다 (INV-02)                | 키를 요구하는 첫 화면은 제품을 보여 주지 못한다. 폴백이 있어야 오프라인에서도 쓸 수 있다. P3을 P5보다 먼저 만드는 이유다                                                                                          | P3                                             | 에이전트      |
| 2026-09-08 | 모든 생성 프롬프트에 클리셰 금지 조항을 넣는다 (INV-06)      | 요소·디자인 버튼만으로는 부족하다. "예쁘게 만들어 줘"는 어느 AI에서나 네온 그라데이션과 이모지 제목을 낸다. 금지 목록이 이 제품의 값어치다                                                                        | P3·P5                                          | 에이전트      |
| 2026-09-08 | `isAllowedUrl`을 `utils/url.ts`로 옮긴다                     | 살균기가 유일한 소비자인데 도메인에 있어서, 도메인을 지우면 살균기가 함께 죽었다. 링크 판정은 가이드 문서의 개념이 아니라 문자열의 성질이다                                                                       | `src/utils/url.ts`, `src/features/sanitize/`   | 에이전트 (P0) |
| 2026-09-08 | `test:security`가 과잉 살균도 잡는다                         | 잔재 0건만 보면 전부 지워 버리는 살균기가 만점을 받는다. 정상 내용 5종이 살아남는지 함께 본다                                                                                                                     | `scripts/verify-security.mjs`                  | 에이전트 (P0) |
| 2026-09-08 | 라우터를 제거한다                                            | v2는 화면이 하나다. 자료 입력부터 프롬프트 복사까지가 한 흐름이라 나눌 경계가 없고, 남겨 두면 쓰지 않는 의존성이 번들에 남는다                                                                                    | `src/app/App.tsx`, `package.json`              | 에이전트 (P0) |
| 2026-09-08 | `.claude/launch.json`을 gitignore한다                        | Node 경로와 포트가 머신마다 다르다. 개인 절대 경로를 커밋하지 않는다 (AGENTS.md §7)                                                                                                                               | `.gitignore`                                   | 에이전트 (P0) |
| 2026-09-08 | 요소 10종·디자인 축 4종을 제품정의 §4·§5 그대로 간다         | 사용자 확정                                                                                                                                                                                                       | P2                                             | 사용자        |
| 2026-09-08 | 작업 문서를 IndexedDB에 담고 Dexie를 쓰지 않는다             | 오브젝트 스토어 하나에 키 하나라 Dexie의 쿼리·마이그레이션·테이블 관계가 전부 불필요한데 번들에는 다 들어온다. LocalStorage를 피한 이유는 5MB 상한과 동기 쓰기다 - 자동 저장마다 수백 KB만큼 메인 스레드가 멈춘다 | `src/storage/document.store.ts`                | 에이전트 (P1) |
| 2026-09-08 | 저장소가 어떤 실패에도 던지지 않는다                         | 저장이 안 된다고 입력까지 막으면 사용자는 작업 자체를 못 한다. 메모리로 떨어지되 어느 모드인지 노출해 화면이 알린다 (INV-07)                                                                                      | `src/storage/document.store.ts`                | 에이전트 (P1) |
| 2026-09-08 | 토큰 수를 어림수로 표시하고 "약"을 붙인다                    | 정확한 값은 모델 토크나이저만 알고 브라우저로 가져오려면 수 MB 사전이 필요하다. 테스트도 특정 숫자를 고정하지 않고 단조성과 크기 감각만 단언한다                                                                  | `src/domain/studio.defaults.ts`                | 에이전트 (P1) |
| 2026-09-08 | 자료 상한을 넘어도 자르지 않고 경고만 한다                   | 자르는 것은 사용자가 모르게 자료를 잃는 일이다 (하네스 P1 주의)                                                                                                                                                   | `src/components/studio/SourceInput/`           | 에이전트 (P1) |
| 2026-09-08 | `useAutosave` 훅을 다시 만들지 않는다                        | 스토어가 예약기를 직접 든다. 소비자가 하나뿐이라 계층을 하나 줄였다                                                                                                                                               | `src/store/studio.store.ts`                    | 에이전트 (P1) |
| 2026-09-08 | 문서 버전을 올릴 때 올림 경로를 함께 넣는다                  | 모양 검사만 바꾸면 저장된 문서가 "없는 것"이 되어 사용자가 붙여넣어 둔 자료가 사라진다 (INV-07)                                                                                                                   | `src/domain/studio.defaults.ts`                | 에이전트 (P2) |
| 2026-09-08 | 디자인 축에 네이티브 라디오를 쓴다                           | 화살표 이동과 "하나만 켜짐"을 브라우저가 지킨다. 버튼으로 다시 만들면 DoD 2를 손으로 구현하게 되고 틀릴 자리가 생긴다                                                                                             | `src/components/studio/DesignPicker/`          | 에이전트 (P2) |
| 2026-09-08 | 카탈로그가 프롬프트 요구 문구를 함께 갖는다                  | 떼어 놓으면 P3의 조립기가 같은 목록을 다시 만들게 되고 한쪽만 고쳐지는 날이 온다                                                                                                                                  | `src/domain/spec.types.ts`                     | 에이전트 (P2) |
| 2026-09-08 | 선택을 카탈로그 순서로 정렬해 담는다                         | 고른 순서를 따르면 같은 선택에서 다른 프롬프트가 나와 P3의 결정론이 깨진다                                                                                                                                        | `src/domain/spec.defaults.ts`                  | 에이전트 (P2) |
| 2026-09-08 | 저장 스냅샷 비교를 편집 가능한 필드 전체로 넓힌다            | 자료만 비교하면 저장이 도는 동안 누른 토글이 스냅샷에 덮여 사라진다 (INV-07)                                                                                                                                      | `src/store/studio.store.ts`                    | 에이전트 (P2) |
| 2026-09-08 | 존재하지 않는 CSS 토큰 9종을 실재하는 이름으로 바꾼다        | 정의되지 않은 `var()`는 선언 전체를 조용히 무효로 만들고 테스트·린트·타입 검사가 잡지 못한다                                                                                                                      | `src/**/*.module.css`, `src/styles/themes.css` | 에이전트 (P2) |
| 2026-09-08 | 빈 게이트 두 개를 지운다                                     | 검사 대상이 사라진 규칙은 통과가 아니라 삭제 대상이다 (CLAUDE.md)                                                                                                                                                 | `vitest.config.ts`, `src/features/assets/`     | 에이전트 (P2) |
| 2026-09-08 | 금지 목록을 문자열이 아니라 배열로 둔다                      | 문단 하나로 뭉치면 "그 문단이 들어갔는가"만 보게 되고 목록이 비어도 통과한다 (하네스 P3 주의)                                                                                                                     | `src/domain/prompt.rules.ts`                   | 에이전트 (P3) |
| 2026-09-08 | 자료 울타리 길이를 자료에서 계산한다                         | 자료가 울타리를 닫고 나오면 그 뒤가 프롬프트의 지시문으로 읽힌다. 살균 경계와 다른 층의 주입이다                                                                                                                  | `src/features/compose/compose.ts`              | 에이전트 (P3) |
| 2026-09-08 | 자료 상한 60,000자, 넘으면 자르되 숫자로 밝힌다              | 조용히 자르는 것은 사용자가 모르게 자료를 잃는 일이다. 줄 경계로 되감으면 밝힌 숫자보다 더 버린다                                                                                                                 | `src/features/compose/compose.ts`              | 에이전트 (P3) |
| 2026-09-08 | `missingProhibitions`를 조립기 옆에 둔다                     | P5가 AI 출력을 검사해야 하는데, 목록을 아는 쪽이 판정해야 목록이 두 벌이 되지 않는다 (P5 DoD 4)                                                                                                                   | `src/features/compose/compose.ts`              | 에이전트 (P3) |
| 2026-09-09 | 저장소 탐지만 공용으로 빼고 키 정책은 분리한다               | 허용 목록·마스킹·삭제는 정책이라 나누고, "이 브라우저에서 localStorage를 쓸 수 있는가"는 환경 탐지라 두 벌이 되면 안 된다                                                                                         | `src/storage/browser-store.ts`                 | 에이전트 (P4) |
| 2026-09-09 | 전체 키를 얻는 길을 `readForAnthropicRequest()` 하나로 둔다  | 이름이 곧 허용된 용도다. 상태는 마스킹된 형태만 주어 devtools·오류 보고에 키가 실리지 않는다 (INV-01)                                                                                                             | `src/storage/api-key.store.ts`                 | 에이전트 (P4) |
| 2026-09-09 | 오류와 폴백 이유에 입력·예외 메시지를 싣지 않는다            | 저장소가 던진 예외에 키가 들어 있을 수 있고, 그것을 옮기면 화면과 콘솔에 남는다 (DoD 4)                                                                                                                           | `src/storage/api-key.store.ts`                 | 에이전트 (P4) |
| 2026-09-09 | `API_KEY_BOUNDARY`는 리터럴을 막고 상수 import는 막지 않는다 | 키 이름이 바뀌면 관련 검사가 함께 따라가야 한다. 규칙이 기존 테스트의 하드코딩을 실제로 잡았다                                                                                                                    | `scripts/verify-architecture.mjs`              | 에이전트 (P4) |
| 2026-09-09 | 삭제 실패를 조용히 지나가지 않는다                           | 상태만 "없음"으로 바꾸면 사용자는 지워졌다고 믿는데 브라우저에는 남는다. 폐기하라고 알린다                                                                                                                        | `src/storage/api-key.store.ts`                 | 에이전트 (P4) |
| 2026-09-09 | `@anthropic-ai/sdk` 0.124.0을 넣는다                         | 하네스 P5가 `dangerouslyAllowBrowser` 근거를 호출 지점에 남기라고 지정한다. 공식 SDK를 쓰는 편이 오류 클래스와 스트리밍을 손으로 만들지 않는다                                                                    | `package.json`                                 | 에이전트 (P5) |
| 2026-09-09 | SDK 오류의 이름을 클라이언트 경계에서 세운다                 | 연결 실패와 취소는 status가 없고 name도 Error라 구조 판정으로 구분되지 않는다. instanceof를 쓸 수 있는 곳에서 번역한다                                                                                            | `src/features/synthesize/anthropic.client.ts`  | 에이전트 (P5) |
| 2026-09-09 | 실패를 오류 화면이 아니라 템플릿 폴백으로 다룬다             | 빈 오류 화면을 내밀면 사용자는 아무것도 얻지 못한 채 원인을 찾아야 한다. 쓸 수 있는 프롬프트가 함께 나온다 (INV-02)                                                                                               | `src/features/synthesize/synthesize.ts`        | 에이전트 (P5) |
| 2026-09-09 | 취소는 폴백을 만들지 않고 그대로 던진다                      | 다시 만들기를 눌렀다가 멈췄을 때 앞의 결과까지 사라지면 되돌릴 방법이 없다 (DoD 5)                                                                                                                                | `src/store/generate.store.ts`                  | 에이전트 (P5) |
| 2026-09-09 | SDK 재시도를 끈다 (`maxRetries: 0`)                          | 429나 5xx를 조용히 두 번 더 보내면 사용자는 왜 오래 걸리는지 모르고 안내도 그만큼 늦게 뜬다                                                                                                                       | `src/features/synthesize/anthropic.client.ts`  | 에이전트 (P5) |
| 2026-09-09 | 전체 키를 읽는 길을 `features/synthesize/`에 가둔다          | 스토어와 컴포넌트가 전체 키를 보지 못하게 한다. 테스트도 대역을 주입해 같은 길로 지난다 (INV-01)                                                                                                                  | `scripts/verify-architecture.mjs`              | 에이전트 (P5) |

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
