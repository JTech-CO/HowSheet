# HowSheet Progress

- 현재 phase: M2 — 도메인 모델·Zod 스키마·기본 문서 ★
- 상태: DONE
- 마지막 갱신: 2026-08-31 KST

## 직전에 끝낸 것

**M2 — 도메인 모델·Zod 스키마·기본 문서**

- `guide.types.ts` — 기술 백서 §2.3.2 도메인 타입 전체와 필드 한계값·허용 목록 상수
- `progress.types.ts` — `ReaderProgress`와 INV-10 진행 키 생성·해석
- `validation.types.ts` — 이슈 코드 33종. 어느 phase가 어떤 코드를 판정하는지 표기
- `guide.schema.ts` — Zod 스키마, 필드·문서 검증, 버전 판정, 마이그레이션 인터페이스
- `guide.defaults.ts` — 기본 문서와 `order` 정규화. 시각·ID를 주입받는 순수 함수
- `tests/fixtures/` 기준 픽스처 10종과 `scripts/verify-fixtures.mjs`
- 도메인 단위 테스트 171개, 전체 258개

**적대적 검토 후 수정** (4개 관점, blocker 4건 포함)

- `verify-architecture.mjs`의 M2 "스코프 인식" 변경이 **파일 단위**라 파라미터 하나가 파일 전체의 DOM 전역 탐지를 무력화했다. M1 DoD 5가 실제로 뚫려 있었다. 보수적 규칙으로 되돌리고 충돌하던 `document` 파라미터 3곳을 `doc`으로 바꿨다
- 감시 전역을 7종 → 18종으로 확장하고 ESLint가 같은 목록을 가져다 쓰게 했다
- `reader-runtime` 경계에 전이 패키지 검사를 추가했다 (D-11)
- Zod 4는 `invalid_type` 이슈에 `input`을 싣지 않아 `MISSING_FIELD`/`INVALID_TYPE` 판별이 항상 한쪽으로 쏠렸다. 원본을 경로로 조회하도록 고쳤다
- `as GuideDocument` 단언을 제거하고 타입·스키마 동등성을 컴파일 타임에 강제했다 (INV-03)
- 픽스처 재작업: `invalid-cycle`과 `invalid-no-terminal`이 같은 2노드 그래프였고, `invalid-missing-target`의 기대 코드가 사실과 달랐으며, `valid-branched`의 배열 순서와 priority가 일치해 우선순위를 안 읽는 엔진도 통과했다. `large-100-step`은 순수 선형이라 벤치마크로 무의미했다
- 코퍼스에 이미지 블록과 `assets[]`가 하나도 없었다. 블록 7종·경고 3단계·오류해결 2범위·연산자 4종·완료방식 3종을 모두 담도록 보강했다
- `xss-guide`에 `data:text/html`, SVG, `srcdoc`, `vbscript:` 페이로드를 추가했다

## 다음 할 일

1. M3 진입 — Dexie 기반 `guides`, `assets`, `recovery` 테이블 구현
2. guide·asset·recovery repository와 LocalStorage wrapper
3. 가이드 CRUD·복제·트랜잭션 삭제·마지막 성공 스냅샷
4. IndexedDB 불가 시 메모리 모드와 JSON 백업 경로
5. M3에서 `test:integration`(vitest `dom` 프로젝트)을 스크립트와 CI에 함께 배선한다. 지금은 `dom` 프로젝트를 실행하는 명령이 없다
6. M3에서 `storage/local-storage.ts`가 테마 키를 소유하게 되면 `index.html` 선행 스니펫의 리터럴과 일치하는지 검사하는 테스트를 붙인다

## 미결 질문 / 차단 요소

- **모르는 필드가 버려진다**: Zod 기본 동작이 strip이라 1.0 문서에 담긴 모르는 키가 파싱 시 사라진다. 우리가 내보낸 문서에는 그런 키가 없어 왕복은 성립하지만(픽스처 10종 모두 `파싱 == 원본` 확인), 상위 minor 문서를 열었다가 다시 내보내면 그 필드가 사라진다. 보존 정책은 M8에서 정한다. 지금은 동작을 테스트로 고정해 두었다.
- **`tests/fixtures/assets/`와 `markdown-samples/`가 비어 있다**: 하네스 §0.10은 M2부터 유지하라고 하지만 각각 M5·M10의 입력이다. 자산 5종은 §0.10이 허용한 결정론적 생성 스크립트로 M5에서, Markdown 5종은 M10에서 채운다. 그전까지 `IMAGE_MIME_NOT_ALLOWED`·`IMAGE_TOO_LARGE`는 단위 테스트의 합성 입력으로만 검증된다.
- **`ImageBlock`에 장식용 플래그가 없다**: 기술 §2.2.4는 "장식 이미지가 아닌 경우 alt 필수"라고 하지만 §2.3.2 타입에 구분 필드가 없다. 지금은 `alt: ''`를 장식용 선언으로 해석한다. M4에서 `decorative` 필드를 추가하려면 minor 스키마 변경이 필요하다.
- **타이포 스케일 미완**: `typography.css`가 디자인 §4.1.1 계약보다 작고 `word-break: keep-all`이 없다. M11의 "styles/ 전체 확정"에서 맞춘다.
- **리스트 시맨틱**: `reset.css`가 모든 `ul/ol`에 `list-style: none`을 적용해 Safari/VoiceOver에서 목록 역할이 사라진다. M4에서 첫 목록 컴포넌트를 만들 때 정한다.
- **하위 경로 배포 E2E 부재**: `basename` 수정 후 수동 확인만 했다. M12에서 게이트로 만든다.
- **ESLint 9 / TypeScript 5 고정**: 각각 `eslint-plugin-jsx-a11y`, `typescript-eslint`의 peer 범위 때문이다. 상류가 지원을 추가하면 함께 올린다.

## 현재 실패 중인 게이트

- 명령: 없음
- 결과: M2 검증 명령 4개와 전체 회귀 5개 전부 종료 코드 0
- 재현: 해당 없음

## 결정 로그

| 날짜       | 결정                                                                                                | 이유                                                                                                                                                                                                                                                                                                                                                          | 영향 파일/phase                                                        | 승인 주체                         |
| ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------- |
| 2026-08-30 | D-01 공통 컴포넌트 그룹은 `components/ui/`. `components/common/`·`lib/`·`hooks/`·`types/`는 금지    | 디자인 §6 목록이 상위 집합이고 하네스 §0.1이 표현 계약을 디자인 백서 우선으로 둠                                                                                                                                                                                                                                                                              | `src/components/`, `scripts/verify-architecture.mjs`                   | 사용자                            |
| 2026-08-30 | D-02 `components/content/` 그룹 신설                                                                | 기술 §5.2가 "콘텐츠 렌더러는 공유"를 요구. 없으면 미리보기·리더가 렌더러를 복제해 INV-09를 수동 유지해야 함                                                                                                                                                                                                                                                   | `src/components/content/`, M5                                          | 사용자                            |
| 2026-08-30 | D-03 이름 충돌 5건은 기술 백서 이름 채택. `BlockToolbar`는 `BlockEditor`의 별칭                     | 하네스 M6·M7 할 일 목록이 기술 백서 이름을 그대로 호출하고, 하네스가 §0.1 우선순위 2                                                                                                                                                                                                                                                                          | `src/components/reader/`, `src/components/editor/`, M6·M7              | 사용자                            |
| 2026-08-30 | D-04 `features/sanitize/` 신설. reader-runtime import 허용 목록을 **모듈 단위**로 판정              | 디렉터리 단위 금지면 리더가 살균기에 닿지 못해 INV-07 불가, 허용이면 편집기 모듈이 리더 번들에 유입. 모듈 단위만이 INV-07과 INV-11을 동시에 만족                                                                                                                                                                                                              | `scripts/verify-architecture.mjs`, M5·M9                               | 사용자                            |
| 2026-08-30 | D-05 `Field`가 라벨·오류·`aria-describedby` 소유, `Input`/`Textarea`는 박스 규격만                  | 기술 §5.2 내용이 `Field/` 폴더의 계약이고 하네스 M11도 `Field`를 호출. 디자인 §5.6.2 박스 규격은 별개 계약                                                                                                                                                                                                                                                    | `src/components/ui/`, M11 DoD 8                                        | 사용자                            |
| 2026-08-30 | D-06 인쇄 훅 7개는 컴포넌트 `*.module.css`의 `:global()`, `utilities.css`는 3개 유지                | 전역 유틸리티를 7개 늘리면 디자인 §3.3 스타일링 계약이 깨짐                                                                                                                                                                                                                                                                                                   | `src/styles/utilities.css`, `src/styles/print.css`, M11                | 사용자                            |
| 2026-08-30 | D-07 렌더링 테스트만 병치, `tests/unit\|integration\|e2e`는 유지. vitest include·커버리지 대상 확정 | 하네스 검증 블록이 `tests/` 경로를 직접 호출하고 디자인 QA는 병치 렌더링 테스트를 전제                                                                                                                                                                                                                                                                        | `vitest.config.ts`, M6 DoD 11·M12 DoD 3~4                              | 사용자                            |
| 2026-08-30 | D-08 `scripts/build-reader-runtime.mjs` (`.ts` 아님). 리더 번들 정의를 루트로 분리하지 않음         | 기술 §3.2에 TS 실행기가 없고 M1 DoD 2가 정확한 버전 고정을 요구해 `tsx`를 즉흥 추가할 수 없음                                                                                                                                                                                                                                                                 | `scripts/`, M9                                                         | 사용자                            |
| 2026-08-30 | D-09 `artifacts/qa/phase-reports/`만 커밋, 나머지 5개는 `.gitignore` + CI 아티팩트                  | 하네스 §0.11과 §0.6의 충돌 해소. 판정 수치는 보고서 본문에 기록                                                                                                                                                                                                                                                                                               | `.gitignore`, `artifacts/qa/`, M6·M9·M12                               | 사용자                            |
| 2026-08-30 | ESLint를 9.39.5로, TypeScript를 5.9.3으로 고정                                                      | 각각 `eslint-plugin-jsx-a11y`·`typescript-eslint`의 peer 범위 밖이라 최신을 쓰면 `lint` 게이트가 결정론적으로 통과하지 못함. 접근성·타입 린트를 포기하는 것보다 버전을 내리는 편이 손실이 작음                                                                                                                                                                | `package.json`, 전 phase                                               | 에이전트 (M1)                     |
| 2026-08-30 | `.npmrc`(`save-exact=true`)와 `.prettierignore`를 저장소 루트에 추가                                | M1 DoD 2의 정확한 버전 고정을 도구가 강제하도록. `File_Structure.md` §1에 반영함                                                                                                                                                                                                                                                                              | `.npmrc`, `.prettierignore`, `docs/File_Structure.md`                  | 에이전트 (M1)                     |
| 2026-08-30 | `verify-architecture.mjs`의 소스 해석을 TypeScript AST로 전환                                       | 손으로 짠 렉서가 JSX 본문 아포스트로피와 따옴표를 담은 정규식 리터럴에서 파일 나머지를 삼켜 INV-07 살균 경계와 M1 DoD 5 전역 검사가 조용히 무력화됐다. 주석 속 import 표기를 실제 import로 오인하는 오탐도 있었다. `typescript`는 이미 고정된 devDependency라 새 의존성이 없다                                                                                | `scripts/verify-architecture.mjs`, `tests/unit/architecture/`          | 에이전트 (M1)                     |
| 2026-08-30 | 모서리 토큰은 디자인 백서 §5.4(8/10/16/999)를 따른다                                                | 기술 §5.1.3은 8/12/16을 적어 두 백서가 충돌한다. 하네스 §0.1이 "표현·상호작용 계약은 디자인 백서를 우선"한다고 명시하므로 STOP 없이 해소 가능한 충돌이다. 색상 토큰 9개와 `--shadow-sm`/`--shadow-md`도 디자인 §5.1·§5.4대로 보강했다                                                                                                                         | `src/styles/tokens.css`, `src/styles/themes.css`, M11 DoD 1            | 에이전트 (M1)                     |
| 2026-08-30 | Node를 24.20.0 LTS로 고정하고 `engines`에 `>=24.20.0 <25.0.0` 지정                                  | 시스템 Node 25.2.0의 `fs.rmSync(recursive)`가 비ASCII 경로에서 하드 크래시해 `pnpm build`가 결정론적으로 실패했음. fnm의 24.19.0·24.20.0·25.9.0은 정상이라 25.2.0 빌드 고유 버그로 확정. LTS 고정이 이 버그와 비-LTS 위험을 동시에 없앰                                                                                                                       | `.nvmrc`, `package.json`, `.github/workflows/*`                        | 에이전트 (M1)                     |
| 2026-08-30 | 라우팅은 `BrowserRouter` + `VITE_BASE` 환경 변수                                                    | 기술 §2.1.4의 경로 표기(`/guide/:id/edit`)를 그대로 쓰기 위함. 정적 호스트 폴백은 `deploy.yml`이 `404.html`로 처리                                                                                                                                                                                                                                            | `src/app/router.tsx`, `vite.config.ts`, `.github/workflows/deploy.yml` | 에이전트 (M1)                     |
| 2026-08-31 | `zod` 4.5.2를 정확한 버전으로 추가                                                                  | 기술 §3.2가 필수 의존성으로 지정. `safeParse` 기반이라 예외를 던지지 않아 가져오기 실패가 기존 문서를 건드리지 않는다(INV-08). 라이선스 MIT. 대안인 valibot·수기 검증은 백서가 지정한 스택에서 벗어나고 이슈 경로 보고를 다시 만들어야 한다. 번들 영향: 아직 앱이 domain을 import하지 않아 편집기 번들 gzip 74.33 kB로 변화 없음. 실제 증가는 M4에서 측정한다 | `package.json`, `src/domain/guide.schema.ts`                           | 에이전트 (M2)                     |
| 2026-08-31 | D-10 URL 프로토콜 허용 목록의 소유자를 `domain`으로                                                 | 필드 검증 규칙이라 스키마가 파싱 시점에 판정해야 하는데, §3.2-1이 domain의 외부 계층 import를 금지해 `utils/url.ts` 소유와 양립할 수 없었다                                                                                                                                                                                                                   | `docs/File_Structure.md` §3.3·§7, `src/domain/`                        | 사용자 승인 대상 — §7 D-10에 기록 |
| 2026-08-31 | D-11 `reader-runtime` 경계를 전이 의존까지 검사                                                     | `@/domain/guide.schema.ts`가 허용 경로에 있으면서 zod를 끌어와, 직접 import만 보면 M9 번들 예산에서야 드러난다                                                                                                                                                                                                                                                | `scripts/verify-architecture.mjs`, `docs/File_Structure.md` §7         | 사용자 승인 대상 — §7 D-11에 기록 |
| 2026-08-31 | DOM 전역 탐지를 보수적 규칙으로 되돌림                                                              | M2에서 넣은 파일 단위 섀도잉 예외가 파라미터 하나로 파일 전체의 탐지를 무력화해 M1 DoD 5가 뚫렸다. 게이트를 코드에 맞춰 낮춘 셈이라 되돌리고 도메인 식별자를 바꿨다                                                                                                                                                                                           | `scripts/verify-architecture.mjs`, `src/domain/*.ts`                   | 에이전트 (M2)                     |
| 2026-08-31 | 타입·스키마 동등성을 컴파일 타임에 강제                                                             | `as GuideDocument` 단언이 INV-03 드리프트를 가렸다. 정확 동등성 검사로 양방향 드리프트가 `typecheck`를 깨뜨린다                                                                                                                                                                                                                                               | `src/domain/guide.schema.ts`                                           | 에이전트 (M2)                     |

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
| 2026-08-31 | `pnpm exec vitest run tests/unit/domain`                               | 성공 — 171 passed                                               | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm verify:fixtures`                                                 | 성공 — 가이드 10개                                              | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm verify:fixtures` (픽스처·페이로드 변형)                          | 의도대로 실패 — 종료 코드 1                                     | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm typecheck`                                                       | 성공. 타입·스키마 드리프트 주입 시 의도대로 실패                | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm verify:architecture`                                             | 성공. DOM 우회 2종·전이 zod 유입 모두 탐지 확인                 | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | 전체 회귀 (format/lint/test:unit/build/e2e)                            | 성공 — 단위 테스트 258 passed                                   | `artifacts/qa/phase-reports/M2.md` |
