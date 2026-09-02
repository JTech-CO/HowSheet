# HowSheet Progress

- 현재 phase: M6 진입 대기 - 분기 엔진·그래프 검증·활성 경로 ★
- 상태: M5 DONE + M6 진입 전 보정 DONE
- 마지막 갱신: 2026-09-02 KST

## 직전에 끝낸 것

**M5 - 콘텐츠 블록 렌더러·Markdown 안전화·이미지 자산**

- `features/sanitize/` - remark로 raw HTML을 떨어뜨리고 DOMPurify로 2차 살균한다. 두 겹 모두 필요하다는 것을 음성 검증으로 확인했다
- `features/assets/` - MIME·5MB 검증, 긴 변 1920px 축소, EXIF 방향, SHA-256 중복 제거, Blob URL 수명 훅
- `components/content/` 8종 - 작성기 미리보기와 리더가 공유한다. 미리보기가 이제 실제 블록을 그린다
- `components/editor/BlockEditor`·`BlockTypePicker` - 블록 7종 편집과 고정 순서 추가 목록
- `utils/clipboard.ts` - Clipboard API 실패 시 코드 전체 선택 폴백
- `scripts/verify-security.mjs`(`pnpm test:security`), `scripts/generate-fixture-assets.mjs`
- 테스트 539개(단위 471, 통합 68), E2E 54개(브라우저 3종)

**설계 판단**

- 살균 정책은 **허용 목록**이고 금지 목록은 그 위의 이중 확인이다. 금지 목록만 두면 새 태그마다 구멍이 생긴다
- 원격 이미지는 렌더링하지 않는다. 그리는 순간 독자의 접속 사실이 제3자에게 새어 나간다(INV-15). `src`만 지우고 `alt`는 남긴다
- `MarkdownText`는 살균된 HTML이 아니라 **원문 Markdown**을 받는다. "이미 안전한 문자열"을 넘기는 경로를 아예 두지 않았다
- `isAllowedUrl`을 `guide.schema.ts`에서 `guide.types.ts`로 옮겼다. 스키마에 두면 살균기가 그 함수를 쓰려고 zod를 끌어오고 그 의존이 리더 번들까지 따라간다 (D-11)

**이번 phase에서 드러난 것**

- **Safari에서 이미지 첨부가 깨져 있었다.** WebKit E2E가 잡았다. `OffscreenCanvas.convertToBlob`이 없는 빌드가 있는데 인코더가 그것만 썼다. `<canvas>` 폴백과 EXIF 옵션 없는 디코딩 폴백을 넣고, 코덱 실패를 사용자가 볼 수 있는 이슈로 바꿨다
- **DOMPurify의 `ALLOWED_URI_REGEXP`는 URI가 아닌 속성에도 적용된다.** 좁게 잡았더니 `type="checkbox"`·`colspan`이 조용히 사라져 GFM 작업 목록이 통째로 없어졌다. `ADD_URI_SAFE_ATTR`로 비-URI 속성을 명시했다
- **의존성 버전 고정이 M4부터 새고 있었다.** `.npmrc`에 `save-exact=true`가 있는데 M4·M5의 8종이 전부 캐럿 범위로 들어왔고 어떤 게이트도 보지 않았다. 전부 고정하고 `verify:dependencies`를 만들었다

**M6 진입 전 보정 (2026-09-02)**

M1~M5의 DoD를 저장소 실제 상태와 다시 대조했다. 보고서가 "통과"라고 적었는데
근거 코드가 없거나, 이월 사유가 하네스 원문과 어긋난 항목을 찾는 것이 목적이었다.

- **M5 DoD 6** - 이월 근거가 원문과 어긋났다. 기술 §2.2.4의 alt 규칙은 내보내기
  검증이 아니라 **필드 검증** 목록에 있고, 하네스 M9 절에는 "alt"라는 말이 없다.
  `ImageBlock.decorative`를 추가해 필드 단계에서 판정한다. 진짜 문제는 판정
  로직이 아니라 기본값과 선언값이 같다는 것이었다
- **M5 DoD 5** - 기술 §4.4.4가 요구한 애니메이션 GIF 크기 경고가 없었다.
  `ImageIssue.severity`를 넣고 warning으로 발행한다. 경고는 첨부를 막지 않는다
- **M5 DoD 7** - 축소 경로에서 `keptOriginalBecause: 'not-smaller'`를 돌려주면서
  실제로는 원본을 유지하지 않았다. `largerThanOriginal`로 분리하고 그 조합을
  덮는 테스트를 추가했다
- **M5 할 일 1** - 체크리스트 항목 추가·삭제 UI. 분기 결합도가 체크리스트와
  선택지에서 다르다는 것을 픽스처로 확인하고 앞의 것만 붙였다
- **M2 DoD 7** - 근거 테스트가 항진명제였다. 프로덕션 스키마와 1.0 픽스처 전수로
  다시 썼다
- **M2 DoD 8** - `markdown-samples/` 5종 작성, `verify:fixtures`를 CI에 배선
- **M1 DoD 5** - domain의 `.tsx` 파일이 두 게이트를 모두 빠져나갔다. 규칙 추가
- **D-11 전이 검사** - `reader-runtime/`이 비어 있어 게이트가 공회전 중이었다.
  중간 모듈까지 넣은 전이 테스트 4건으로 규칙을 고정하고, 실제 프로브로 A/B안의
  위반 건수를 실측했다
- **살균 멱등성** - 단언이 0건이었다. INV-09/M9 DoD 10의 전제이므로 게이트로 만듦
- **M3 이월** - `removeOrphans()` 자동 실행은 하지 않기로 확정. INV-08과 충돌한다

## 다음 할 일

1. M6 진입 - 분기 엔진·그래프 검증·활성 경로
   - `pnpm test:coverage`와 `scripts/benchmark-graph-validation.mjs`가 아직 없다.
     M6 검증 블록이 둘 다 호출하므로 phase 시작과 함께 만든다.
2. **리더 런타임 ↔ 살균기 경계에 대한 사용자 승인** (아래 미결 항목). M6과
   병렬로 진행할 수 있지만 M7 할 일 2가 시작되기 전에는 있어야 한다.
3. 선택지(`decision`) 항목 추가·삭제 UI를 분기 규칙 참조 무결성과 함께 붙인다.
   `DecisionOption.description`·`DecisionBlock.required`도 편집 경로가 없다.

## 미결 질문 / 차단 요소

- **리더 런타임이 살균기를 어떻게 쓸 것인가 - 사용자 승인 대기 (M7 전 필요)**:
  조사와 실측이 끝났고 **선택지 A를 권고**한다. 승인이 필요한 이유는 이것이
  AGENTS.md §7의 "모듈 경계" 변경이기 때문이다.
  - **실측 (프로브 파일로 확인, 2026-09-02)**: `src/reader-runtime/`에 파일
    하나를 넣고 `verify:architecture`를 돌린 결과 -
    `markdown-to-html.ts`를 export하면 **위반 6건**(unified·remark-parse·
    remark-gfm·remark-rehype·rehype-stringify·dompurify), `sanitize-html.ts`만
    export하면 **위반 1건**(dompurify)이다. `sanitize-html.ts`의 패키지 폐포가
    `{dompurify}` 하나인 것은 M5에서 `isAllowedUrl`을 `guide.types.ts`로 옮긴
    결과다(D-11). A안이 요구하는 리팩터링은 이미 끝나 있었다.
  - **선택지 A (권장)**: 내보내기(M9)가 Markdown을 미리 살균된 HTML로 바꿔
    문서 **본문에** 싣고, 리더는 `sanitize-html.ts`만 import해 렌더 직전에 한 번
    더 살균한다. `dompurify`만 `READER_RUNTIME_ALLOWED_PACKAGES`에 추가한다.
    근거는 번들 바이트가 아니다 - 기술 §7.3의 "리더 런타임은 작성기 라이브러리를
    포함하지 않는다"는 정성 규칙, 하네스 M9 할 일 2가 이미 적은 파이프라인 순서
    (full validation → **sanitization** → asset inlining → …), M9 DoD 9의 초기
    렌더 1초/2초(파서 초기화가 임계 경로), 그리고 INV-07 공격면이다.
  - **A안에 붙는 조건**: 렌더된 HTML은 **본문에만** 싣고 M9의
    `application/json` 데이터 스크립트에는 원문 Markdown을 유지한다. 이 조건이
    빠지면 저장 형식이 바뀌어 §7의 "파일 형식" 변경이 되고 M8 가져오기의 왕복
    계약에도 영향한다.
  - **A안의 대가**: 살균이 두 번 도므로 INV-09/M9 DoD 10의 parity가 살균
    **멱등성**에 의존한다. 그 단언이 0건이었으므로 보정에서 게이트로 만들었다
    (`tests/unit/security/sanitize.test.ts`의 "살균 멱등성").
  - **선택지 B**: 리더가 `markdown-to-html.ts`까지 import하고 remark 전체를
    허용 목록에 넣는다. parity가 구조적으로 자명하다는 장점이 있다(같은 함수를
    부른다). 그러나 위 정성 규칙과 M9 주의 3번째에 정면으로 걸린다.
  - **선택지 C**: 리더 전용 경량 살균기. 기술 §7.1-2의 "경계 한 곳"과 INV-07을
    동시에 깨므로 채택하지 않는다.
  - **승인 후에도 지금 코드를 바꾸지 않는다.** `READER_RUNTIME_ALLOWED_PACKAGES`에
    `dompurify`를 넣는 것은 M7에서 `reader-renderer.ts`가 실제로 그것을 쓰는
    커밋과 **같은 커밋**이어야 한다. 사용처 없이 허용 목록만 넓히는 것은 게이트를
    미리 느슨하게 만드는 것이다.
- **`docs/File_Structure.md` §3.3의 "이 순수 함수"가 어느 파일인지 특정되지 않았다**:
  §3.3은 "내보낸 HTML은 `reader-runtime/reader-renderer.ts`가 직접 이 순수 함수를
  호출한다"고만 적어 A와 B 어느 쪽으로도 읽힌다. 위 승인과 함께 지시 대상을
  `sanitize-html.ts`로 좁혀야 한다. 이것도 경계 축소이므로 승인 대상이다.
- **모르는 필드가 버려진다**: Zod 기본 동작이 strip이라 1.0 문서에 담긴 모르는
  키가 파싱 시 사라진다. 보존 정책은 M8에서 정한다. 지금은 동작을 테스트로 고정해
  두었다.
- **minor 버전을 실제로 올리면 기존 1.0 문서가 열리지 않는다**: `guide.schema.ts`의
  `z.literal(SCHEMA_VERSION)`과 `migrationRequired` 판정이 맞물려
  `parseGuideDocument`가 `ok: false`를 돌려준다. 마이그레이션 레지스트리가 비어
  있어서다(M8 범위). 그래서 `decorative`를 더하면서 `SCHEMA_VERSION`은 `'1.0'`을
  유지했다. **필드 추가가 막힌 것이 아니라 버전 문자열 인상이 막혀 있다.**
- **`snapshotToJson`에 호출자가 없다**: `StorageUnavailableBanner`의 `onBackup`을
  아무도 넘기지 않아 "JSON으로 백업" 버튼이 렌더되지 않는다. 기술 §4.6이 요구하는
  메모리 모드 탈출구는 exporter가 생기는 M8에서 실제로 닫힌다.
- **저장소 마이그레이션 경로가 없다**: `DATABASE_VERSION = 1`이고 `.upgrade()`가
  없다. 실패 롤백과 빈 DB 재생성 금지만 테스트돼 있다. M8에서 필요해진다.
- **타이포 스케일 미완**: `typography.css`가 디자인 §4.1.1 계약보다 작고
  `word-break: keep-all`이 없다. M11의 "styles/ 전체 확정"에서 맞춘다.
- **하위 경로 배포 E2E 부재**: `basename` 수정 후 수동 확인만 했다. M12에서
  게이트로 만든다.
- **`photo-large.png`를 참조하는 테스트가 없다**: 실제 브라우저 코덱으로 1920
  축소를 확인하는 자동 검증이 아직 없다. M12 성능 측정과 함께 붙인다.
- **ESLint 9 / TypeScript 5 고정**: 각각 `eslint-plugin-jsx-a11y`,
  `typescript-eslint`의 peer 범위 때문이다. 상류가 지원을 추가하면 함께 올린다.

### 해소된 항목

- ~~`tests/fixtures/markdown-samples/`가 비어 있다~~ → 2026-09-02에 5종 작성.
  §0.10이 M2부터 유지하라고 명시했고, M10 DoD 10이 배정한 것은 snapshot이지
  파일 자체가 아니었다.
- ~~`ImageBlock`에 장식용 플래그가 없다~~ → 2026-09-02에 `decorative?: boolean`
  추가. minor 필드이고 `SCHEMA_VERSION`은 그대로다.
- ~~앱 시작 시 `removeOrphans()`를 돌릴지~~ → **돌리지 않는다.** 결정 로그 참조.

## 현재 실패 중인 게이트

- 명령: 없음
- 결과: M5 검증 명령 5개와 전체 회귀 8개 전부 종료 코드 0
- 재현: 해당 없음

## 결정 로그

| 날짜       | 결정                                                                                                        | 이유                                                                                                                                                                                                                                                                                                                                                                                                                    | 영향 파일/phase                                                                                                                              | 승인 주체                         |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2026-08-30 | D-01 공통 컴포넌트 그룹은 `components/ui/`. `components/common/`·`lib/`·`hooks/`·`types/`는 금지            | 디자인 §6 목록이 상위 집합이고 하네스 §0.1이 표현 계약을 디자인 백서 우선으로 둠                                                                                                                                                                                                                                                                                                                                        | `src/components/`, `scripts/verify-architecture.mjs`                                                                                         | 사용자                            |
| 2026-08-30 | D-02 `components/content/` 그룹 신설                                                                        | 기술 §5.2가 "콘텐츠 렌더러는 공유"를 요구. 없으면 미리보기·리더가 렌더러를 복제해 INV-09를 수동 유지해야 함                                                                                                                                                                                                                                                                                                             | `src/components/content/`, M5                                                                                                                | 사용자                            |
| 2026-08-30 | D-03 이름 충돌 5건은 기술 백서 이름 채택. `BlockToolbar`는 `BlockEditor`의 별칭                             | 하네스 M6·M7 할 일 목록이 기술 백서 이름을 그대로 호출하고, 하네스가 §0.1 우선순위 2                                                                                                                                                                                                                                                                                                                                    | `src/components/reader/`, `src/components/editor/`, M6·M7                                                                                    | 사용자                            |
| 2026-08-30 | D-04 `features/sanitize/` 신설. reader-runtime import 허용 목록을 **모듈 단위**로 판정                      | 디렉터리 단위 금지면 리더가 살균기에 닿지 못해 INV-07 불가, 허용이면 편집기 모듈이 리더 번들에 유입. 모듈 단위만이 INV-07과 INV-11을 동시에 만족                                                                                                                                                                                                                                                                        | `scripts/verify-architecture.mjs`, M5·M9                                                                                                     | 사용자                            |
| 2026-08-30 | D-05 `Field`가 라벨·오류·`aria-describedby` 소유, `Input`/`Textarea`는 박스 규격만                          | 기술 §5.2 내용이 `Field/` 폴더의 계약이고 하네스 M11도 `Field`를 호출. 디자인 §5.6.2 박스 규격은 별개 계약                                                                                                                                                                                                                                                                                                              | `src/components/ui/`, M11 DoD 8                                                                                                              | 사용자                            |
| 2026-08-30 | D-06 인쇄 훅 7개는 컴포넌트 `*.module.css`의 `:global()`, `utilities.css`는 3개 유지                        | 전역 유틸리티를 7개 늘리면 디자인 §3.3 스타일링 계약이 깨짐                                                                                                                                                                                                                                                                                                                                                             | `src/styles/utilities.css`, `src/styles/print.css`, M11                                                                                      | 사용자                            |
| 2026-08-30 | D-07 렌더링 테스트만 병치, `tests/unit\|integration\|e2e`는 유지. vitest include·커버리지 대상 확정         | 하네스 검증 블록이 `tests/` 경로를 직접 호출하고 디자인 QA는 병치 렌더링 테스트를 전제                                                                                                                                                                                                                                                                                                                                  | `vitest.config.ts`, M6 DoD 11·M12 DoD 3~4                                                                                                    | 사용자                            |
| 2026-08-30 | D-08 `scripts/build-reader-runtime.mjs` (`.ts` 아님). 리더 번들 정의를 루트로 분리하지 않음                 | 기술 §3.2에 TS 실행기가 없고 M1 DoD 2가 정확한 버전 고정을 요구해 `tsx`를 즉흥 추가할 수 없음                                                                                                                                                                                                                                                                                                                           | `scripts/`, M9                                                                                                                               | 사용자                            |
| 2026-08-30 | D-09 `artifacts/qa/phase-reports/`만 커밋, 나머지 5개는 `.gitignore` + CI 아티팩트                          | 하네스 §0.11과 §0.6의 충돌 해소. 판정 수치는 보고서 본문에 기록                                                                                                                                                                                                                                                                                                                                                         | `.gitignore`, `artifacts/qa/`, M6·M9·M12                                                                                                     | 사용자                            |
| 2026-08-30 | ESLint를 9.39.5로, TypeScript를 5.9.3으로 고정                                                              | 각각 `eslint-plugin-jsx-a11y`·`typescript-eslint`의 peer 범위 밖이라 최신을 쓰면 `lint` 게이트가 결정론적으로 통과하지 못함. 접근성·타입 린트를 포기하는 것보다 버전을 내리는 편이 손실이 작음                                                                                                                                                                                                                          | `package.json`, 전 phase                                                                                                                     | 에이전트 (M1)                     |
| 2026-08-30 | `.npmrc`(`save-exact=true`)와 `.prettierignore`를 저장소 루트에 추가                                        | M1 DoD 2의 정확한 버전 고정을 도구가 강제하도록. `File_Structure.md` §1에 반영함                                                                                                                                                                                                                                                                                                                                        | `.npmrc`, `.prettierignore`, `docs/File_Structure.md`                                                                                        | 에이전트 (M1)                     |
| 2026-08-30 | `verify-architecture.mjs`의 소스 해석을 TypeScript AST로 전환                                               | 손으로 짠 렉서가 JSX 본문 아포스트로피와 따옴표를 담은 정규식 리터럴에서 파일 나머지를 삼켜 INV-07 살균 경계와 M1 DoD 5 전역 검사가 조용히 무력화됐다. 주석 속 import 표기를 실제 import로 오인하는 오탐도 있었다. `typescript`는 이미 고정된 devDependency라 새 의존성이 없다                                                                                                                                          | `scripts/verify-architecture.mjs`, `tests/unit/architecture/`                                                                                | 에이전트 (M1)                     |
| 2026-08-30 | 모서리 토큰은 디자인 백서 §5.4(8/10/16/999)를 따른다                                                        | 기술 §5.1.3은 8/12/16을 적어 두 백서가 충돌한다. 하네스 §0.1이 "표현·상호작용 계약은 디자인 백서를 우선"한다고 명시하므로 STOP 없이 해소 가능한 충돌이다. 색상 토큰 9개와 `--shadow-sm`/`--shadow-md`도 디자인 §5.1·§5.4대로 보강했다                                                                                                                                                                                   | `src/styles/tokens.css`, `src/styles/themes.css`, M11 DoD 1                                                                                  | 에이전트 (M1)                     |
| 2026-08-30 | Node를 24.20.0 LTS로 고정하고 `engines`에 `>=24.20.0 <25.0.0` 지정                                          | 시스템 Node 25.2.0의 `fs.rmSync(recursive)`가 비ASCII 경로에서 하드 크래시해 `pnpm build`가 결정론적으로 실패했음. fnm의 24.19.0·24.20.0·25.9.0은 정상이라 25.2.0 빌드 고유 버그로 확정. LTS 고정이 이 버그와 비-LTS 위험을 동시에 없앰                                                                                                                                                                                 | `.nvmrc`, `package.json`, `.github/workflows/*`                                                                                              | 에이전트 (M1)                     |
| 2026-08-30 | 라우팅은 `BrowserRouter` + `VITE_BASE` 환경 변수                                                            | 기술 §2.1.4의 경로 표기(`/guide/:id/edit`)를 그대로 쓰기 위함. 정적 호스트 폴백은 `deploy.yml`이 `404.html`로 처리                                                                                                                                                                                                                                                                                                      | `src/app/router.tsx`, `vite.config.ts`, `.github/workflows/deploy.yml`                                                                       | 에이전트 (M1)                     |
| 2026-08-31 | `zod` 4.5.2를 정확한 버전으로 추가                                                                          | 기술 §3.2가 필수 의존성으로 지정. `safeParse` 기반이라 예외를 던지지 않아 가져오기 실패가 기존 문서를 건드리지 않는다(INV-08). 라이선스 MIT. 대안인 valibot·수기 검증은 백서가 지정한 스택에서 벗어나고 이슈 경로 보고를 다시 만들어야 한다. 번들 영향: 아직 앱이 domain을 import하지 않아 편집기 번들 gzip 74.33 kB로 변화 없음. 실제 증가는 M4에서 측정한다                                                           | `package.json`, `src/domain/guide.schema.ts`                                                                                                 | 에이전트 (M2)                     |
| 2026-08-31 | D-10 URL 프로토콜 허용 목록의 소유자를 `domain`으로                                                         | 필드 검증 규칙이라 스키마가 파싱 시점에 판정해야 하는데, §3.2-1이 domain의 외부 계층 import를 금지해 `utils/url.ts` 소유와 양립할 수 없었다                                                                                                                                                                                                                                                                             | `docs/File_Structure.md` §3.3·§7, `src/domain/`                                                                                              | 사용자 승인 대상 - §7 D-10에 기록 |
| 2026-08-31 | D-11 `reader-runtime` 경계를 전이 의존까지 검사                                                             | `@/domain/guide.schema.ts`가 허용 경로에 있으면서 zod를 끌어와, 직접 import만 보면 M9 번들 예산에서야 드러난다                                                                                                                                                                                                                                                                                                          | `scripts/verify-architecture.mjs`, `docs/File_Structure.md` §7                                                                               | 사용자 승인 대상 - §7 D-11에 기록 |
| 2026-08-31 | DOM 전역 탐지를 보수적 규칙으로 되돌림                                                                      | M2에서 넣은 파일 단위 섀도잉 예외가 파라미터 하나로 파일 전체의 탐지를 무력화해 M1 DoD 5가 뚫렸다. 게이트를 코드에 맞춰 낮춘 셈이라 되돌리고 도메인 식별자를 바꿨다                                                                                                                                                                                                                                                     | `scripts/verify-architecture.mjs`, `src/domain/*.ts`                                                                                         | 에이전트 (M2)                     |
| 2026-08-31 | 타입·스키마 동등성을 컴파일 타임에 강제                                                                     | `as GuideDocument` 단언이 INV-03 드리프트를 가렸다. 정확 동등성 검사로 양방향 드리프트가 `typecheck`를 깨뜨린다                                                                                                                                                                                                                                                                                                         | `src/domain/guide.schema.ts`                                                                                                                 | 에이전트 (M2)                     |
| 2026-08-31 | `dexie` 4.4.5과 `fake-indexeddb` 6.2.5를 정확한 버전으로 추가                                               | 기술 §3.2·§4.5가 지정한 스택. `fake-indexeddb`는 jsdom에 IndexedDB가 없어 통합 테스트에 필수. 둘 다 Apache-2.0/MIT                                                                                                                                                                                                                                                                                                      | `package.json`, `src/storage/`, `tests/integration/storage/`                                                                                 | 에이전트 (M3)                     |
| 2026-08-31 | 저장소 트랜잭션 콜백에 **스코프**를 넘긴다 (`transaction(tx => ...)`)                                       | 콜백이 `backend.*`를 쓰면 트랜잭션이 끝난 뒤의 쓰기를 구분할 수 없다. 스코프는 자기 트랜잭션을 알고 있어 이탈을 즉시 실패시키고, `tx.waitFor()`로 저장소 밖 대기의 정식 경로를 준다                                                                                                                                                                                                                                     | `src/storage/*.ts`, M5·M8                                                                                                                    | 에이전트 (M3)                     |
| 2026-08-31 | 자산 본문을 `Blob`이 아니라 `ArrayBuffer`로 저장                                                            | jsdom+fake-indexeddb에서 `Blob`은 구조화 복제를 지나면 빈 객체가 돼 이미지 바이트 왕복(DoD 1)을 확인할 방법이 없었다. Safari의 IndexedDB Blob 문제도 함께 피한다. `AssetRepository.toBlob()`이 동기 변환을 제공하므로 트랜잭션 안에서 `await`가 필요 없다                                                                                                                                                               | `src/storage/db.ts`, `src/storage/asset.repository.ts`, M5·M9                                                                                | 에이전트 (M3)                     |
| 2026-08-31 | 통합 테스트가 IndexedDB로 열리지 않으면 **실패**시킨다                                                      | `openStorage`의 조용한 폴백은 제품에서 옳지만 테스트에서는 게이트가 사라지는 것과 같다. 실제로 46개 중 34개가 메모리에서 돌고 있었다                                                                                                                                                                                                                                                                                    | `tests/setup/fake-indexeddb.ts`, `tests/integration/storage/helpers.ts`, `vitest.config.ts`                                                  | 에이전트 (M3)                     |
| 2026-08-31 | 메모리 백엔드도 저장 경계에서 값을 복사한다                                                                 | 살아 있는 참조를 돌려주면 호출자의 제자리 수정이 스냅샷 롤백을 통과한다. IndexedDB는 구조화 복제로 이미 그렇게 동작하므로 폴백만 무결성이 약했다 (INV-08)                                                                                                                                                                                                                                                               | `src/storage/db.ts`                                                                                                                          | 에이전트 (M3)                     |
| 2026-08-31 | `zustand` 5.0.15와 `react-hook-form` 7.87.0을 정확한 버전으로 추가                                          | 기술 §3.2가 둘 다 필수로 지정. 상태는 Zustand, 폼 검증은 RHF                                                                                                                                                                                                                                                                                                                                                            | `package.json`, `src/store/`, `src/components/editor/GuideMetaForm/`                                                                         | 에이전트 (M4)                     |
| 2026-08-31 | React Hook Form을 **비제어**로만 쓰고 컬렉션은 스토어 액션이 다룬다                                         | 기술 §3.2는 RHF를 필수로 두고 하네스 M4 주의는 폼 지역 상태와 영속 문서의 중복을 금지한다. RHF는 값을 DOM에 두므로 blur 검증만 맡기면 둘을 동시에 만족한다. `useFieldArray`로 배열을 복제하면 바로 중복 상태가 된다                                                                                                                                                                                                     | `src/components/editor/GuideMetaForm/`, M6·M11                                                                                               | 에이전트 (M4)                     |
| 2026-08-31 | 오래된 저장 응답 판정을 `changeSeq`/`savedSeq` 하나로 통일                                                  | 타임스탬프나 `dirty` 플래그로 판정하면 같은 밀리초의 두 변경을 구분하지 못한다. 단조 증가 번호는 그 경계가 없다 (M4 DoD 4, 기술 §4.1.3)                                                                                                                                                                                                                                                                                 | `src/store/guide.store.ts`                                                                                                                   | 에이전트 (M4)                     |
| 2026-08-31 | 편집 화면을 떠나도 메모리 문서를 버리지 않는다                                                              | 언마운트에서 `closeGuide()`를 부르면 미리보기로 이동하는 순간 저장 전 편집이 사라진다. 기술 §2.2.1-7은 미리보기가 저장 완료를 기다리지 않고 메모리 초안을 쓰라고 한다                                                                                                                                                                                                                                                   | `src/pages/EditorPage/`, `src/store/guide.store.ts`                                                                                          | 에이전트 (M4)                     |
| 2026-08-31 | ESLint react-hooks 규칙 범위를 `src/**/*.{ts,tsx}`로 확대                                                   | `.tsx`만 보면 `useAutosave.ts`처럼 `.ts`에 있는 훅이 검사 밖에 남는다                                                                                                                                                                                                                                                                                                                                                   | `eslint.config.js`                                                                                                                           | 에이전트 (M4)                     |
| 2026-08-31 | Playwright 로컬 워커를 4로 제한                                                                             | E2E가 27개로 늘자 Firefox 컨텍스트 생성이 자원 경합으로 타임아웃했다. 흔들리는 게이트는 진짜 실패를 가린다                                                                                                                                                                                                                                                                                                              | `playwright.config.ts`                                                                                                                       | 에이전트 (M4)                     |
| 2026-08-31 | 목록 마커 제거는 유지하고 실제 목록에 `role="list"`를 명시                                                  | `reset.css`의 `list-style: none`이 Safari/VoiceOver에서 목록 역할을 지운다. 마커를 되살리면 시각 계약이 깨지고, 역할을 잃으면 "3개 중 2번째" 안내가 사라진다. ARIA상 중복이지만 그 중복만이 두 가지를 동시에 만족한다. `jsx-a11y/no-redundant-roles`에 ul·ol의 list만 예외로 등록했다                                                                                                                                   | `src/styles/reset.css`, `eslint.config.js`, 목록을 쓰는 컴포넌트 6곳                                                                         | 에이전트 (M4)                     |
| 2026-08-31 | `initStorage()`를 멱등·공유 Promise로 만들고 저장소가 필요한 액션이 대기                                    | 저장소가 열리기 전 클릭이 `guideStoreDeps()`에서 던지고 그 예외가 핸들러 안에서 사라졌다. 버튼을 비활성으로 두는 대신 기다리게 했다. 빠른 환경에서는 차이가 없고 느린 환경에서만 지연으로 드러난다                                                                                                                                                                                                                      | `src/store/guide.store.ts`                                                                                                                   | 에이전트 (M4)                     |
| 2026-09-01 | `unified`·`remark-parse`·`remark-gfm`·`remark-rehype`·`rehype-stringify`·`dompurify`를 정확한 버전으로 추가 | 기술 §3.2가 Markdown AST 파서와 DOMPurify를 필수로 지정. 살균을 직접 구현하는 것은 INV-07에서 가장 피해야 할 선택이다                                                                                                                                                                                                                                                                                                   | `package.json`, `src/features/sanitize/`                                                                                                     | 에이전트 (M5)                     |
| 2026-09-01 | 살균은 두 겹으로 한다 - remark의 raw HTML 차단 + DOMPurify                                                  | 1단계만으로 충분해 보여도 플러그인이 바뀌면 그 가정이 조용히 무너진다. 실제로 2단계를 통과로 바꾸자 단위 11건과 `test:security`가 실패했다                                                                                                                                                                                                                                                                              | `src/features/sanitize/`                                                                                                                     | 에이전트 (M5)                     |
| 2026-09-01 | 원격 http(s) 이미지는 렌더링하지 않고 `src`만 제거한다                                                      | 그리는 순간 독자가 문서를 여는 사실이 제3자 서버에 남는다(INV-15). `alt`는 남겨 내용은 전달한다 (디자인 §5.9)                                                                                                                                                                                                                                                                                                           | `src/features/sanitize/sanitize-html.ts`                                                                                                     | 에이전트 (M5)                     |
| 2026-09-01 | `isAllowedUrl`을 `guide.schema.ts`에서 `guide.types.ts`로 이동                                              | 스키마 파일에 두면 이 함수를 쓰려는 살균기·링크 렌더러가 zod를 함께 끌어오고, 그 의존이 리더 번들까지 따라간다 (D-11). §3.3은 두 파일을 공동 소유자로 적고 있어 위치 변경은 허용 범위다                                                                                                                                                                                                                                 | `src/domain/`, `src/features/sanitize/`, `src/components/content/LinkCard/`                                                                  | 에이전트 (M5)                     |
| 2026-09-01 | 이미지 인코딩에 `<canvas>` 폴백을 둔다                                                                      | `OffscreenCanvas.convertToBlob`이 없는 WebKit 빌드에서 이미지 첨부가 통째로 실패했다. 브라우저 3종 E2E가 없었으면 Safari에서만 조용히 깨진 채 나갔다                                                                                                                                                                                                                                                                    | `src/features/assets/image-optimizer.ts`                                                                                                     | 에이전트 (M5)                     |
| 2026-09-01 | 자산 픽스처는 커밋하지 않고 결정론적으로 생성한다. `photo-large`는 PNG다                                    | 하네스 §0.10이 생성 스크립트를 허용하고, File_Structure.md §5가 "이름은 재량이고 역할은 계약"이라고 명시한다. JPEG 인코더를 직접 쓰는 것은 "의존성 없이 결정론적"이라는 목적과 맞지 않는다                                                                                                                                                                                                                              | `scripts/generate-fixture-assets.mjs`, `.gitignore`                                                                                          | 에이전트 (M5)                     |
| 2026-09-01 | `verify:dependencies`를 만들어 정확 버전 고정을 게이트로 만든다                                             | `.npmrc`의 `save-exact=true`가 있는데도 M4·M5의 8종이 캐럿 범위로 들어왔고 두 phase가 그대로 통과했다. 설정은 의도이고 검사는 사실이다 (M1 DoD 2)                                                                                                                                                                                                                                                                       | `scripts/verify-dependencies.mjs`, `package.json`, CI                                                                                        | 에이전트 (M5)                     |
| 2026-09-02 | D-12(제안) 리더 런타임은 `sanitize-html.ts`만 쓴다. 내보내기가 Markdown을 미리 렌더한다                     | 프로브 실측으로 `markdown-to-html` 경유 6건 vs `sanitize-html` 경유 1건 확인. 근거는 번들 바이트가 아니라 기술 §7.3 정성 규칙·하네스 M9 할 일 2의 파이프라인 순서·M9 DoD 9 렌더 예산·INV-07 공격면. 조건: 렌더된 HTML은 본문에만, `application/json` 페이로드는 원문 Markdown 유지                                                                                                                                      | `scripts/verify-architecture.mjs`, `docs/File_Structure.md` §3.3·§7, M7·M9                                                                   | **사용자 승인 대기**              |
| 2026-09-02 | `ImageBlock.decorative?: boolean` 추가. `SCHEMA_VERSION`은 `'1.0'` 유지                                     | 새 이미지 블록의 `alt` 기본값이 빈 문자열이라 기본값과 장식용 sentinel이 겹쳤다. 실수로 비운 alt와 의도적으로 비운 alt를 구분할 데이터가 없어 M9에 무슨 검증을 붙여도 판정 불가였다. 기술 §2.3.5가 "minor 변경은 하위 호환 필드 추가"로 정의하고 STOP 대상은 major뿐이다. 버전 인상은 마이그레이션 인프라(M8) 전이라 하지 않는다                                                                                        | `src/domain/`, `src/components/content/GuideImage/`, `src/components/editor/BlockEditor/`, `tests/fixtures/valid-linear-5step.howsheet.json` | 에이전트 (M5 보정)                |
| 2026-09-02 | 이미지 최적화 결과에서 `keptOriginalBecause: 'not-smaller'`를 `largerThanOriginal`로 분리                   | 축소가 일어난 경로에서 원본을 유지하지 않는데 "유지 이유"라는 이름을 붙이고 있었다. DoD 7의 두 절이 충돌하면 상한이 이긴다는 판단 자체는 유지하되, M9에서 이 값을 읽는 쪽이 오해하지 않도록 이름을 사실에 맞췄다                                                                                                                                                                                                        | `src/features/assets/image-optimizer.ts`                                                                                                     | 에이전트 (M5 보정)                |
| 2026-09-02 | `ImageIssue`에 `severity`를 넣고 경고는 첨부를 막지 않는다                                                  | 기술 §4.4.4의 애니메이션 GIF 크기 경고를 표시할 자리가 없었다. 등급 없이 같은 목록에 담으면 화면이 경고를 차단으로 보여 주고, 스토어가 error처럼 막으면 애니메이션 GIF를 아예 넣을 수 없게 된다                                                                                                                                                                                                                         | `src/features/assets/image-optimizer.ts`, `src/store/guide.store.ts`, `src/components/editor/BlockEditor/`                                   | 에이전트 (M5 보정)                |
| 2026-09-02 | 체크리스트 항목 CRUD는 지금, 선택지 CRUD는 M6                                                               | 픽스처로 확인한 결합도가 다르다. 체크리스트 분기는 `sourceBlockId` + `checked`로 **블록 단위**만 참조해 항목을 더하거나 지워도 깨질 규칙이 없다. 선택지 분기는 `BranchRule.value`가 **선택지 ID를 직접** 가리켜 삭제가 곧 참조 무결성 문제다. 둘을 한 덩어리로 묶은 것이 판단을 흐렸다                                                                                                                                  | `src/store/guide.store.ts`, `src/components/editor/BlockEditor/`, M6                                                                         | 에이전트 (M5 보정)                |
| 2026-09-02 | 시작 시 `removeOrphans()` 자동 실행을 하지 않는다                                                           | 고아 판정 기준이 "`guides`에 id가 있는가" 하나뿐이라 버려도 되는 찌꺼기와 복구에 필요한 증거가 같은 모양이다. 부분 커밋 후 남은 `existed: true` 스냅샷은 그 문서의 마지막 사본인데 이 함수가 그것을 지운다(INV-08 위반). 진행 중인 `withSnapshot`도 정상 상태인 채로 고아로 보인다. 게다가 `capture()`를 부르는 제품 코드가 아직 0건이라 지울 것 자체가 없다. 사용자가 누르는 정리 경로는 M12, 자동 실행 재검토는 M8 뒤 | `src/storage/guide.repository.ts` (주석), M8·M12                                                                                             | 에이전트 (M3 이월 해소)           |
| 2026-09-02 | domain에도 JSX 파일 금지 규칙을 건다                                                                        | JSX 런타임은 import 문 없이 React를 주입한다. 규칙이 reader-runtime에만 있고 ESLint의 domain 블록은 `*.ts`만 대상이라 `src/domain/x.tsx` 하나로 M1 DoD 5가 뚫렸다                                                                                                                                                                                                                                                       | `scripts/verify-architecture.mjs`, `eslint.config.js`                                                                                        | 에이전트 (M1 감사)                |
| 2026-09-02 | `verify:fixtures`를 CI에 배선하고 markdown-samples 5종을 작성                                               | 하네스 M2 검증 블록의 명령 하나가 사람이 로컬에서 칠 때만 돌고 있었다. §0.10은 markdown 픽스처도 "M2부터 유지"로 적고, M10 DoD 10이 배정한 것은 snapshot이지 파일 자체가 아니다                                                                                                                                                                                                                                         | `.github/workflows/ci.yml`, `scripts/verify-fixtures.mjs`, `tests/fixtures/markdown-samples/`                                                | 에이전트 (M2 감사)                |

## 검증 로그

| 날짜       | 명령                                                                                      | 결과                                                               | 증거 경로                          |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| 2026-08-30 | `pnpm install --frozen-lockfile`                                                          | 성공                                                               | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm format:check`                                                                       | 성공 - All matched files use Prettier code style                   | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm lint`                                                                               | 성공 - 0 problems                                                  | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm typecheck`                                                                          | 성공 - `tsc --noEmit` 종료 코드 0                                  | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm test:unit`                                                                          | 성공 - 46 passed (1 file)                                          | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm verify:architecture`                                                                | 성공 - 소스 8개, 규칙 6종                                          | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm verify:architecture` (위반 3건 주입)                                                | 의도대로 실패 - 위반 5건 보고, 종료 코드 1                         | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm build`                                                                              | 성공 - JS 231.44 kB (gzip 74.32 kB), CSS 4.15 kB (gzip 1.61 kB)    | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-30 | `pnpm exec playwright test tests/e2e/smoke.spec.ts --project=chromium`                    | 성공 - 3 passed                                                    | `artifacts/qa/phase-reports/M1.md` |
| 2026-08-31 | `pnpm exec vitest run tests/unit/domain`                                                  | 성공 - 171 passed                                                  | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm verify:fixtures`                                                                    | 성공 - 가이드 10개                                                 | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm verify:fixtures` (픽스처·페이로드 변형)                                             | 의도대로 실패 - 종료 코드 1                                        | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm typecheck`                                                                          | 성공. 타입·스키마 드리프트 주입 시 의도대로 실패                   | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm verify:architecture`                                                                | 성공. DOM 우회 2종·전이 zod 유입 모두 탐지 확인                    | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | 전체 회귀 (format/lint/test:unit/build/e2e)                                               | 성공 - 단위 테스트 258 passed                                      | `artifacts/qa/phase-reports/M2.md` |
| 2026-08-31 | `pnpm exec vitest run tests/unit/storage tests/integration/storage`                       | 성공 - 96 passed                                                   | `artifacts/qa/phase-reports/M3.md` |
| 2026-08-31 | `pnpm test:integration`                                                                   | 성공 - 46 passed (두 백엔드 동등성 포함)                           | `artifacts/qa/phase-reports/M3.md` |
| 2026-08-31 | `pnpm verify:architecture` (저장소 전역 위반 주입)                                        | 의도대로 실패 - STORAGE_ENCAPSULATION, 종료 코드 1                 | `artifacts/qa/phase-reports/M3.md` |
| 2026-08-31 | `index.html` 테마 키 변형                                                                 | 의도대로 실패 - 단위 테스트 2건                                    | `artifacts/qa/phase-reports/M3.md` |
| 2026-08-31 | 전체 회귀 (format/lint/typecheck/test:unit/verify\*/build/e2e)                            | 성공 - 단위 308, 전체 354 passed, e2e 9 passed                     | `artifacts/qa/phase-reports/M3.md` |
| 2026-08-31 | `pnpm exec vitest run tests/unit/store tests/unit/autosave`                               | 성공 - 53 passed                                                   | `artifacts/qa/phase-reports/M4.md` |
| 2026-08-31 | `pnpm exec vitest run tests/integration/editor-core`                                      | 성공 - 22 passed                                                   | `artifacts/qa/phase-reports/M4.md` |
| 2026-08-31 | `pnpm exec playwright test`                                                               | 성공 - 27 passed (chromium/firefox/webkit)                         | `artifacts/qa/phase-reports/M4.md` |
| 2026-08-31 | 시퀀스 가드·자동 저장 상한 무력화 주입                                                    | 의도대로 실패 - 각각 단위 1건 + 통합 1건                           | `artifacts/qa/phase-reports/M4.md` |
| 2026-08-31 | `pnpm build`                                                                              | 성공 - JS 414.00 kB (gzip 134.15 kB). 기술 §2.4.2 목표 300 kB 이하 | `artifacts/qa/phase-reports/M4.md` |
| 2026-08-31 | 전체 회귀 (format/lint/typecheck/test:unit/test:integration/verify\*)                     | 성공 - 단위 361, 통합 68                                           | `artifacts/qa/phase-reports/M4.md` |
| 2026-09-01 | `pnpm exec vitest run tests/unit/content tests/unit/security tests/unit/assets`           | 성공 - 108 passed                                                  | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-01 | `pnpm test:security`                                                                      | 성공 - 픽스처 문자열 44개, 실행 잔재 0건                           | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-01 | 살균 2단계 무력화·경계 밖 innerHTML·픽스처 페이로드 제거·캐럿 범위 주입                   | 의도대로 실패 - 4건 모두                                           | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-01 | `pnpm exec playwright test`                                                               | 성공 - 54 passed (chromium/firefox/webkit)                         | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-01 | `pnpm build`                                                                              | 성공 - JS 623.3 kB (gzip 199.7 kB). 기술 §2.4.2 목표 300 kB 이하   | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-01 | 전체 회귀 (format/lint/typecheck/test:unit/test:integration/verify\*)                     | 성공 - 단위 471, 통합 68                                           | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-02 | `pnpm verify:architecture` (리더 프로브 A/B)                                              | A안 위반 1건(dompurify), B안 6건(remark 계열 5 + dompurify)        | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-02 | `pnpm verify:fixtures`                                                                    | 성공 - 가이드 10개 + markdown-samples 5종                          | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-02 | decorative 되돌림·GIF 경고 제거·이중 이스케이프 주입·domain `.tsx` 생성                   | 의도대로 실패 - 각각 2건·1건·4건·종료 코드 1                       | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-02 | markdown 픽스처 제거·내용 변조·허용 목록 선제 확대                                        | 의도대로 실패 - 종료 코드 1·불일치 5건·단위 3건                    | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-02 | `pnpm exec playwright test`                                                               | 성공 - 60 passed (chromium/firefox/webkit)                         | `artifacts/qa/phase-reports/M5.md` |
| 2026-09-02 | 전체 회귀 (format/lint/typecheck/test:unit/test:integration/test:security/verify\*/build) | 성공 - 단위 543, 통합 72                                           | `artifacts/qa/phase-reports/M5.md` |
