# HowSheet Progress

- 현재 phase: M1 — 기반·도구 체인과 모듈 경계
- 상태: DONE
- 마지막 갱신: 2026-08-30 16:10 KST

## 직전에 끝낸 것

- Vite + React + TypeScript + pnpm 스캐폴딩과 `File_Structure.md` §2 계층 디렉터리 생성
- ESLint(flat config, 접근성·import 경계 규칙), Prettier, Vitest(unit/dom 프로젝트 분리), Playwright(3 브라우저 프로젝트) 설정
- CSS Custom Properties 토큰(`tokens.css`, `themes.css`)과 reset·typography·utilities·global·print 스타일 작성
- `scripts/verify-architecture.mjs` 작성 — 순수 판정 함수 `analyze()`와 파일 시스템 CLI를 분리, 규칙 6종 구현
- `tests/unit/architecture/analyze.test.ts` 46개 케이스로 DoD 5·6·9·10을 합성 입력으로 검증
- `tests/e2e/smoke.spec.ts` — 렌더링, 콘솔 error 0건, 외부 요청 0건, 404 경로
- CI 워크플로(`ci.yml`) 작성. `deploy.yml`은 수동 실행만 열어 둠
- `AGENTS.md`, `CLAUDE.md`, `README.md`, 본 문서 작성
- `File_Structure.md` §7의 확정 결정 9건을 아래 결정 로그로 이관
- 다관점 적대적 검토 1회 수행 — `verify-architecture.mjs`에서 blocker 4건을 포함해 실제 결함을 찾아 수정했다. 아래 검증 로그의 "검토 후 재검증" 참조

## 다음 할 일

1. M2 진입 — `guide.types.ts`, `progress.types.ts`, `validation.types.ts` 구현
2. `guide.schema.ts`에 `schemaVersion: "1.0"` 기준 Zod 스키마 구현
3. 최소 유효 문서와 새 가이드 기본값, 이슈 코드 정의
4. `tests/fixtures/`의 기준 픽스처 10종과 `scripts/verify-fixtures.mjs` 작성
5. M2 진입 시 `zod` 의존성을 정확한 버전으로 추가하고 결정 로그에 번들 영향 기록

## 미결 질문 / 차단 요소

- **타이포 스케일 미완**: `typography.css`의 h1~h3 clamp 값이 디자인 §4.1.1 계약(H1 26–36px, H2 22–28px, H3 20–24px)보다 작고 Display 레벨이 없다. 한국어 줄바꿈 규칙 `word-break: keep-all`도 아직 없다. `File_Structure.md` §9가 "styles/ 전체 확정"을 M11에 두므로 그때 맞춘다.
- **리스트 시맨틱**: `reset.css`가 모든 `ul/ol`에 `list-style: none`을 적용해 Safari/VoiceOver에서 목록 역할 안내가 사라진다. axe는 잡지 못하고 M12 DoD 6의 수동 스크린 리더 통과에서 드러난다. M4에서 첫 목록 컴포넌트를 만들 때 `role="list"` 관례를 정하거나 리셋을 클래스로 좁힌다.
- **`dom` 프로젝트 미구동**: vitest `dom` 프로젝트를 실행하는 스크립트가 아직 없다(`test:integration`은 하네스 §0.9상 M3부터 필수). M4~M5에서 첫 병치 컴포넌트 테스트가 생기면 M3의 `test:integration`이 CI에 물릴 때까지 CI에서 실행되지 않는다. M3에서 반드시 함께 배선한다.
- **테마 키 계약 미고정**: `index.html`의 플래시 방지 스니펫이 `howsheet:editor:theme`를 문자열 리터럴로 읽는다. M3에서 `storage/local-storage.ts`가 이 키를 소유하게 되면 키와 값 어휘를 상수로 내보내고, 스니펫 리터럴과 일치하는지 검사하는 테스트를 붙인다. 어긋나도 실패하는 게이트가 없어 M11 DoD 5(테마 flash 0건)가 조용히 깨진다.
- **하위 경로 배포 E2E 부재**: `basename` 수정 후 `/howsheet/` 하위 경로 렌더링을 수동 확인했으나 게이트가 없다. M12에서 비루트 base로 빌드해 렌더링을 단언하는 E2E를 추가한다.
- **ESLint 9 고정**: ESLint 10.9.1이 최신이지만 `eslint-plugin-jsx-a11y` 6.10.2가 ESLint 9까지만 지원한다. 접근성 린트를 포기할 수 없어 ESLint를 9.39.5로 고정했다. jsx-a11y가 ESLint 10을 지원하면 함께 올린다.
- **TypeScript 5 고정**: TypeScript 7.0.2가 최신이지만 `typescript-eslint` 8.68.0의 peer 범위가 `<6.1.0`이다. `lint` 게이트를 포기할 수 없어 5.9.3으로 고정했다. typescript-eslint가 TS 7을 지원하면 함께 올린다.
- **정적 호스팅 SPA 폴백**: `BrowserRouter`를 쓰므로 중첩 경로가 정적 호스트에서 404가 된다. `deploy.yml`이 `dist/404.html`을 생성해 대응한다. M12에서 실제 호스트로 검증해야 한다.
- **Node 25.2.0 크래시**(해결됨): 시스템 Node 25.2.0에서 `pnpm build`가 종료 코드 3221226505(`STATUS_STACK_BUFFER_OVERRUN`)로 죽었다. `fs.rmSync(recursive)`가 비ASCII 경로(`…\내 폴더\코딩\기획\…`)에서 프로세스를 크래시시키는 것이 원인이고, Vite의 `emptyOutDir`가 그 호출을 쓴다. fnm의 24.19.0·24.20.0·25.9.0은 모두 정상이라 특정 25.2.0 빌드의 버그로 확정했다. `.nvmrc`를 24.20.0 LTS로 고정하고 `engines`로 25.x를 배제했다.

## 현재 실패 중인 게이트

- 명령: 없음
- 결과: M1 검증 명령 8개 전부 종료 코드 0
- 재현: 해당 없음

## 결정 로그

| 날짜       | 결정                                                                                                | 이유                                                                                                                                                                                                                                                                           | 영향 파일/phase                                                        | 승인 주체     |
| ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------- |
| 2026-08-30 | D-01 공통 컴포넌트 그룹은 `components/ui/`. `components/common/`·`lib/`·`hooks/`·`types/`는 금지    | 디자인 §6 목록이 상위 집합이고 하네스 §0.1이 표현 계약을 디자인 백서 우선으로 둠                                                                                                                                                                                               | `src/components/`, `scripts/verify-architecture.mjs`                   | 사용자        |
| 2026-08-30 | D-02 `components/content/` 그룹 신설                                                                | 기술 §5.2가 "콘텐츠 렌더러는 공유"를 요구. 없으면 미리보기·리더가 렌더러를 복제해 INV-09를 수동 유지해야 함                                                                                                                                                                    | `src/components/content/`, M5                                          | 사용자        |
| 2026-08-30 | D-03 이름 충돌 5건은 기술 백서 이름 채택. `BlockToolbar`는 `BlockEditor`의 별칭                     | 하네스 M6·M7 할 일 목록이 기술 백서 이름을 그대로 호출하고, 하네스가 §0.1 우선순위 2                                                                                                                                                                                           | `src/components/reader/`, `src/components/editor/`, M6·M7              | 사용자        |
| 2026-08-30 | D-04 `features/sanitize/` 신설. reader-runtime import 허용 목록을 **모듈 단위**로 판정              | 디렉터리 단위 금지면 리더가 살균기에 닿지 못해 INV-07 불가, 허용이면 편집기 모듈이 리더 번들에 유입. 모듈 단위만이 INV-07과 INV-11을 동시에 만족                                                                                                                               | `scripts/verify-architecture.mjs`, M5·M9                               | 사용자        |
| 2026-08-30 | D-05 `Field`가 라벨·오류·`aria-describedby` 소유, `Input`/`Textarea`는 박스 규격만                  | 기술 §5.2 내용이 `Field/` 폴더의 계약이고 하네스 M11도 `Field`를 호출. 디자인 §5.6.2 박스 규격은 별개 계약                                                                                                                                                                     | `src/components/ui/`, M11 DoD 8                                        | 사용자        |
| 2026-08-30 | D-06 인쇄 훅 7개는 컴포넌트 `*.module.css`의 `:global()`, `utilities.css`는 3개 유지                | 전역 유틸리티를 7개 늘리면 디자인 §3.3 스타일링 계약이 깨짐                                                                                                                                                                                                                    | `src/styles/utilities.css`, `src/styles/print.css`, M11                | 사용자        |
| 2026-08-30 | D-07 렌더링 테스트만 병치, `tests/unit\|integration\|e2e`는 유지. vitest include·커버리지 대상 확정 | 하네스 검증 블록이 `tests/` 경로를 직접 호출하고 디자인 QA는 병치 렌더링 테스트를 전제                                                                                                                                                                                         | `vitest.config.ts`, M6 DoD 11·M12 DoD 3~4                              | 사용자        |
| 2026-08-30 | D-08 `scripts/build-reader-runtime.mjs` (`.ts` 아님). 리더 번들 정의를 루트로 분리하지 않음         | 기술 §3.2에 TS 실행기가 없고 M1 DoD 2가 정확한 버전 고정을 요구해 `tsx`를 즉흥 추가할 수 없음                                                                                                                                                                                  | `scripts/`, M9                                                         | 사용자        |
| 2026-08-30 | D-09 `artifacts/qa/phase-reports/`만 커밋, 나머지 5개는 `.gitignore` + CI 아티팩트                  | 하네스 §0.11과 §0.6의 충돌 해소. 판정 수치는 보고서 본문에 기록                                                                                                                                                                                                                | `.gitignore`, `artifacts/qa/`, M6·M9·M12                               | 사용자        |
| 2026-08-30 | ESLint를 9.39.5로, TypeScript를 5.9.3으로 고정                                                      | 각각 `eslint-plugin-jsx-a11y`·`typescript-eslint`의 peer 범위 밖이라 최신을 쓰면 `lint` 게이트가 결정론적으로 통과하지 못함. 접근성·타입 린트를 포기하는 것보다 버전을 내리는 편이 손실이 작음                                                                                 | `package.json`, 전 phase                                               | 에이전트 (M1) |
| 2026-08-30 | `.npmrc`(`save-exact=true`)와 `.prettierignore`를 저장소 루트에 추가                                | M1 DoD 2의 정확한 버전 고정을 도구가 강제하도록. `File_Structure.md` §1에 반영함                                                                                                                                                                                               | `.npmrc`, `.prettierignore`, `docs/File_Structure.md`                  | 에이전트 (M1) |
| 2026-08-30 | `verify-architecture.mjs`의 소스 해석을 TypeScript AST로 전환                                       | 손으로 짠 렉서가 JSX 본문 아포스트로피와 따옴표를 담은 정규식 리터럴에서 파일 나머지를 삼켜 INV-07 살균 경계와 M1 DoD 5 전역 검사가 조용히 무력화됐다. 주석 속 import 표기를 실제 import로 오인하는 오탐도 있었다. `typescript`는 이미 고정된 devDependency라 새 의존성이 없다 | `scripts/verify-architecture.mjs`, `tests/unit/architecture/`          | 에이전트 (M1) |
| 2026-08-30 | 모서리 토큰은 디자인 백서 §5.4(8/10/16/999)를 따른다                                                | 기술 §5.1.3은 8/12/16을 적어 두 백서가 충돌한다. 하네스 §0.1이 "표현·상호작용 계약은 디자인 백서를 우선"한다고 명시하므로 STOP 없이 해소 가능한 충돌이다. 색상 토큰 9개와 `--shadow-sm`/`--shadow-md`도 디자인 §5.1·§5.4대로 보강했다                                          | `src/styles/tokens.css`, `src/styles/themes.css`, M11 DoD 1            | 에이전트 (M1) |
| 2026-08-30 | Node를 24.20.0 LTS로 고정하고 `engines`에 `>=24.20.0 <25.0.0` 지정                                  | 시스템 Node 25.2.0의 `fs.rmSync(recursive)`가 비ASCII 경로에서 하드 크래시해 `pnpm build`가 결정론적으로 실패했음. fnm의 24.19.0·24.20.0·25.9.0은 정상이라 25.2.0 빌드 고유 버그로 확정. LTS 고정이 이 버그와 비-LTS 위험을 동시에 없앰                                        | `.nvmrc`, `package.json`, `.github/workflows/*`                        | 에이전트 (M1) |
| 2026-08-30 | 라우팅은 `BrowserRouter` + `VITE_BASE` 환경 변수                                                    | 기술 §2.1.4의 경로 표기(`/guide/:id/edit`)를 그대로 쓰기 위함. 정적 호스트 폴백은 `deploy.yml`이 `404.html`로 처리                                                                                                                                                             | `src/app/router.tsx`, `vite.config.ts`, `.github/workflows/deploy.yml` | 에이전트 (M1) |

## 검증 로그

| 날짜       | 명령                                                                   | 결과                                                            | 증거 경로                          |
| ---------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| 2026-08-30 | `pnpm install --frozen-lockfile`                                       | 성공                                                            | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm format:check`                                                    | 성공 — All matched files use Prettier code style                | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm lint`                                                            | 성공 — 0 problems                                               | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm typecheck`                                                       | 성공 — `tsc --noEmit` 종료 코드 0                               | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm test:unit`                                                       | 성공 — 46 passed (1 file)                                       | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm verify:architecture`                                             | 성공 — 소스 8개, 규칙 6종                                       | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm verify:architecture` (위반 3건 주입)                             | 의도대로 실패 — 위반 5건 보고, 종료 코드 1                      | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm build`                                                           | 성공 — JS 231.44 kB (gzip 74.32 kB), CSS 4.15 kB (gzip 1.61 kB) | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm exec playwright test tests/e2e/smoke.spec.ts --project=chromium` | 성공 — 3 passed                                                 | `artifacts/qa/phase-reports/M1.md` |
