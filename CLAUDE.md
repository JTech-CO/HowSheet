# CLAUDE.md

Claude Code로 이 저장소를 작업할 때의 규칙이다.

**전역 규칙은 `AGENTS.md`에 있다. 먼저 읽는다.** 이 파일은 `AGENTS.md`와 충돌해서는 안 되며, 충돌하면 `AGENTS.md`가 기준이다.

## 세션 루프

1. `PROGRESS.md` → 현재 phase 확인
2. `docs/HowSheet_Harness_KR.md` §1 → 해당 phase의 할 일·DoD·검증
3. 작업은 도메인 → 테스트 → UI/어댑터 순으로 작은 단위를 유지
4. 작업 단위마다 가장 좁은 검증 명령부터 실행
5. phase DoD를 전부 확인한 뒤 `PROGRESS.md` 갱신

## 이 저장소에서 자주 틀리는 것

- **모듈 경계**: `reader-runtime`의 import 허용 목록은 디렉터리가 아니라 **모듈** 단위다. `@/features/branching/...`과 `@/features/sanitize/...`만 허용되고 `@/features/autosave/...`는 거부된다. `pnpm verify:architecture`로 확인한다.
- **살균 경계**: `dangerouslySetInnerHTML`은 프로젝트 전체에서 `src/components/content/MarkdownText/` 한 곳뿐이다. 리더 런타임은 React가 아니므로 `features/sanitize`의 순수 함수를 직접 호출한다.
- **전역 클래스**: `styles/utilities.css`에는 `sr-only`, `focus-ring`, `print-only` 세 개만 둔다. 인쇄 훅은 각 컴포넌트의 `*.module.css`에서 `:global()`로 노출한다.
- **의존성**: `.npmrc`의 `save-exact=true` 때문에 `pnpm add`가 정확한 버전을 쓴다. 캐럿 범위를 손으로 되돌리지 않는다.
- **ESLint/TypeScript 버전**: 최신이 아니라 9.x/5.x로 고정돼 있다. 이유는 `PROGRESS.md` 결정 로그에 있다. 임의로 올리지 않는다.

## 검증

phase를 끝내기 전에 하네스 §1의 해당 phase 검증 블록을 그대로 실행한다. 통과한 명령과 수치는 `PROGRESS.md` 검증 로그와 `artifacts/qa/phase-reports/M{n}.md`에 남긴다.
