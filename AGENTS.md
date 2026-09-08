# AGENTS.md - HowSheet 전역 규칙

이 파일은 저장소에서 작업하는 모든 코딩 에이전트의 전역 규칙이다. 상세 절차는 `docs/HowSheet_v2_Harness_KR.md`에 있다.

**HowSheet는 v2다.** 자료를 붙여넣으면 한 페이지 HTML을 만드는 **프롬프트**를 써 주는 생성기다. 결과물은 HTML 파일이 아니라 프롬프트 텍스트다. v1(절차 문서 저작 도구)의 문서는 `docs/archive/v1/`에 있고 더 이상 유효하지 않다.

## 1. 세션 시작 절차

1. `PROGRESS.md`를 읽고 현재 phase, 다음 할 일, 미결 질문, 결정 로그를 확인한다.
2. `docs/HowSheet_v2_Harness_KR.md` §1에서 해당 phase의 할 일·DoD·검증 명령을 읽는다.
3. `git status --short`로 기존 변경을 확인하고 사용자가 만든 변경을 덮어쓰지 않는다.
4. 한 번에 하나의 phase만 진행한다.

## 2. 기준 문서 우선순위

1. 사용자가 현재 대화에서 명시적으로 승인한 결정
2. 하네스의 하드 불변식(INV-01~10)과 STOP 규칙
3. `docs/HowSheet_v2_제품정의.md` - 제품 범위·화면·요소·디자인 축·키 취급·불변식
4. `docs/HowSheet_v2_Harness_KR.md` - phase·DoD·검증·금지
5. `PROGRESS.md` 결정 로그
6. 현재 코드 - 문서와 다르면 코드가 드리프트 후보다

`docs/archive/v1/`은 **근거 확인용**이다. 살아남은 코드의 주석과 M1~M8 보고서가 그 절 번호를 인용한다. 거기 적힌 요구사항을 새로 구현하지 않는다.

충돌을 발견하면 임의로 한쪽을 고르지 않는다. `PROGRESS.md`에 기록하고 하네스 §3 STOP 절차를 따른다.

## 3. 하드 불변식 요약

전문은 `docs/HowSheet_v2_제품정의.md` §8에 있다. 아래 10개 중 1건이라도 위반하면 해당 phase는 통과할 수 없다.

- API 키가 `api.anthropic.com` 외 어떤 요청에도 실리지 않는다.
- 키가 없어도 템플릿 폴백으로 프롬프트를 만들 수 있다.
- 붙여넣은 자료가 Anthropic API 외 어디로도 전송되지 않는다.
- HowSheet가 결과 HTML을 렌더링하거나 실행하지 않는다. 프롬프트만 만든다.
- 붙여넣은 자료의 XSS 페이로드가 미리보기에서 실행되지 않는다.
- 생성된 모든 프롬프트에 클리셰 금지 조항이 실제로 포함된다.
- 생성 실패·네트워크 오류가 붙여넣은 자료를 지우지 않는다.
- Anthropic API 외 런타임 외부 요청이 0건이다. 웹폰트·분석·CDN 없음.
- 상태를 색만으로 표현하지 않고 모든 흐름을 키보드로 완료할 수 있다.
- 320px 이상에서 가로 스크롤이 없고 터치 대상은 최소 44×44px다.

## 4. 모듈 경계

`pnpm verify:architecture`가 규칙 5종을 기계 검증한다.

- `domain`은 React·Zustand·DOM API를 import하지 않는다. JSX 파일도 두지 않는다.
- `components/ui`는 `domain`을 import하지 않는다. 도메인을 아는 컴포넌트는 상위 계층에 둔다.
- `src/components/common/`, `src/lib/`, `src/hooks/`, `src/types/`는 만들지 않는다.
- `localStorage`·`sessionStorage`·`indexedDB`는 `src/storage/` 안에서만 쓴다.
- `dangerouslySetInnerHTML`은 `src/components/content/MarkdownText/`에서만 쓴다.
- API 키를 만지는 모듈은 정확히 하나다. `PreferenceStore`의 키 허용 목록에 넣지 않는다. (P4에서 게이트가 생긴다)
- 경계 검증을 주석이나 경로 예외로 무력화하지 않는다.

**검사 대상이 사라지면 규칙도 지운다.** 빈 집합 위에서 도는 규칙은 게이트가 아니라 안내문이다.

## 5. 표준 명령

```bash
pnpm dev
pnpm build
pnpm preview
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:security
pnpm verify:architecture
pnpm verify:dependencies
```

빈 명령, 항상 성공하는 placeholder, `|| true`를 두지 않는다. 검증 스크립트는 Windows·macOS·Linux에서 동일하게 도는 Node 기반으로 작성한다.

**E2E는 파이프로 감싸지 않는다.** `playwright test | tail`의 종료 코드는 `tail`의 것이라 언제나 0이다. 리다이렉트로 파일에 받고 종료 코드를 따로 읽는다.

## 6. 커밋 규칙

- 한 커밋은 하나의 목적만 갖는다.
- 형식: `type(pN): summary` - 예: `feat(p3): add template prompt composer`
- 의존성을 추가·교체하면 이유·번들 영향·라이선스·대안 검토를 `PROGRESS.md` 결정 로그에 남긴다.
- lockfile은 의존성 변경과 함께 커밋한다.
- `dist/`, 테스트 비디오, 임시 이미지, `.env`, 개인 절대 경로는 커밋하지 않는다.
- `artifacts/qa/`는 `phase-reports/`만 커밋한다.

## 7. 절대 금지

- 사용자 승인 없이 제품 범위, 모듈 경계, 지원 브라우저를 바꾸는 것
- API 키를 로그·오류 메시지·화면에 노출하거나 `api.anthropic.com` 밖으로 보내는 것
- 생성 프롬프트에서 클리셰 금지 조항을 빼는 것
- 테스트를 통과시키려고 기준값을 낮추거나 검증을 삭제하는 것
- 실패하는 테스트를 지우거나 건너뛰는 것
- 살균기를 우회하거나 신뢰할 수 없는 HTML을 그대로 렌더링하는 것
- CDN·웹폰트·분석 스크립트를 "편의상" 추가하는 것
- 빈 검증 스크립트나 무조건 `process.exit(0)`
- 검사 대상이 없는 게이트를 통과시키는 것
