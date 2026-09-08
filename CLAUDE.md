# CLAUDE.md

Claude Code로 이 저장소를 작업할 때의 규칙이다.

**전역 규칙은 `AGENTS.md`에 있다. 먼저 읽는다.** 이 파일은 `AGENTS.md`와 충돌해서는 안 되며, 충돌하면 `AGENTS.md`가 기준이다.

## 세션 루프

1. `PROGRESS.md` → 현재 phase 확인
2. `docs/HowSheet_v2_Harness_KR.md` §1 → 해당 phase의 할 일·DoD·검증
3. 작업은 도메인 → 테스트 → UI/어댑터 순으로 작은 단위를 유지
4. 작업 단위마다 가장 좁은 검증 명령부터 실행
5. phase DoD를 전부 확인한 뒤 `PROGRESS.md` 갱신

## 이 저장소에서 자주 틀리는 것

- **v1 코드를 되살리지 않는다**: `docs/archive/v1/`과 `git log`에 절차 문서 저작 도구의 코드가 남아 있다. 근거를 확인할 때만 읽고, 거기 있는 기능을 새로 구현하지 않는다. v2의 결과물은 **프롬프트 텍스트**다.
- **살균 경계**: `dangerouslySetInnerHTML`은 프로젝트 전체에서 `src/components/content/MarkdownText/` 한 곳뿐이다. 붙여넣은 자료는 신뢰할 수 없는 입력이다.
- **전역 클래스**: `styles/utilities.css`에는 `sr-only`, `focus-ring`, `print-only` 세 개만 둔다. 인쇄 훅은 각 컴포넌트의 `*.module.css`에서 `:global()`로 노출한다.
- **의존성**: `.npmrc`의 `save-exact=true` 때문에 `pnpm add`가 정확한 버전을 쓴다. 캐럿 범위를 손으로 되돌리지 않는다.
- **ESLint/TypeScript 버전**: 최신이 아니라 9.x/5.x로 고정돼 있다. 이유는 `PROGRESS.md` 결정 로그에 있다. 임의로 올리지 않는다.
- **Node 버전**: `.nvmrc`가 24.20.0을 고정하고 `scripts/check-node.mjs`가 강제한다. 시스템 기본이 v25면 `fnm use`로 바꾼다.
- **게이트가 비면 지운다**: 검사 대상이 사라진 규칙은 통과가 아니라 삭제 대상이다. P0에서 `reader-runtime` 규칙 4종을 그렇게 지웠다.

## 검증

phase를 끝내기 전에 하네스 §1의 해당 phase 검증 블록을 그대로 실행한다. 그다음 **음성 검증**을 한다 - 게이트를 하나씩 무력화해 의도한 테스트가 실제로 실패하는지 본다. 통과한 명령과 수치는 `PROGRESS.md` 검증 로그와 `artifacts/qa/phase-reports/P{n}.md`에 남긴다.
