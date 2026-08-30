# HowSheet 파일 구조 (File Structure)

**버전**: 1.0
**작성일**: 2026년 8월 30일
**프로젝트**: HowSheet — 누구나 만드는 단일 페이지 단계별 해결 가이드
**관계 문서**:

- `docs/HowSheet_기술_백서.md`: 기능, 데이터 모델, 아키텍처, 성능, 보안, 테스트 기준
- `docs/HowSheet_디자인_백서.md`: 화면, 컴포넌트, 반응형, 접근성, 디자인 토큰
- `docs/HowSheet_Harness_KR.md`: 구현 순서, phase DoD, 검증 명령, 하드 불변식

> 기술 백서와 디자인 백서는 각각 서로 다른 파일 구조를 §6에 두고 있었다. 두 트리는 그룹 이름(`components/common` vs `components/ui`), 컴포넌트 이름(`ReaderStep` vs `ReaderStepCard`), 스타일 파일 수(4개 vs 7개)가 서로 달라 그대로 두면 구현 중 드리프트가 발생한다.
>
> **이 문서가 파일 구조의 단일 기준이다.** 두 백서의 §6은 이 문서를 가리키는 포인터만 남기고 제거했다. 파일·디렉터리·모듈 배치에 관한 판단은 다른 문서가 아니라 이 문서를 따른다. 두 백서가 실제로 충돌하거나 두 백서 모두 침묵하던 항목 9건은 하네스 §0.1·§3.3에 따라 사용자 승인을 받아 확정했으며, 결정과 근거는 §7에 기록했다. §1~§6의 트리와 규칙은 그 결정을 이미 반영한 상태다.

---

## 1. 저장소 최상위 구조

```text
howsheet/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── artifacts/
│   └── qa/                              # 하네스 §0.11 검증 증거 경계
│       ├── phase-reports/               # 커밋함 (D-09)
│       │   ├── M1.md … M12.md           # 하네스 부록 A phase 완료 보고서
│       │   └── release-candidate.md     # 하네스 §0.11 최종 요약
│       ├── screenshots/                 # .gitignore, CI 아티팩트로 업로드
│       ├── accessibility/               # .gitignore
│       ├── performance/                 # .gitignore — 수치는 보고서 본문에 기록
│       ├── security/                    # .gitignore
│       └── exports/                     # .gitignore — 체크섬은 보고서 본문에 기록
├── docs/
│   ├── HowSheet_기술_백서.md
│   ├── HowSheet_디자인_백서.md
│   ├── HowSheet_Harness_KR.md
│   ├── File_Structure.md                # 이 문서
│   └── requirements-traceability.md     # M12 DoD 1 요구사항–테스트 추적표
├── public/
│   ├── favicon.svg
│   └── manifest.webmanifest             # 선택적 설치형 앱 메타데이터
├── scripts/
├── src/
├── tests/
├── .gitignore                           # 하네스 §0.6 커밋 금지 대상 강제
├── .npmrc                               # save-exact=true — M1 DoD 2 버전 고정 강제
├── .nvmrc                               # M1 DoD 7 CI–로컬 Node 버전 일치
├── .prettierignore
├── .prettierrc
├── AGENTS.md
├── CLAUDE.md
├── PROGRESS.md
├── README.md
├── eslint.config.js
├── index.html
├── package.json                         # packageManager·engines로 pnpm 버전 고정
├── playwright.config.ts
├── pnpm-lock.yaml
├── postcss.config.js
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

`dist/`, Playwright 비디오, 대용량 내보내기 HTML, 임시 이미지, `.env`는 하네스 §0.6에 따라 커밋하지 않는다. `.gitignore`가 이 규칙을 강제한다.

`artifacts/qa/`의 6개 하위 디렉터리 중 `phase-reports/`만 커밋한다. `screenshots/`, `accessibility/`, `performance/`, `security/`, `exports/`는 `.gitignore`에 넣고 CI 아티팩트로 업로드한다. 원본 파일이 커밋되지 않으므로 **판정 근거가 되는 모든 수치**(M6 벤치마크 median, M9 번들 크기·export 측정치, axe 위반 수, M12 성능 수치·checksum)는 `phase-reports/`의 보고서 본문에 적는다. 파일만 남기고 수치를 적지 않으면 다음 세션이 재현할 수 없다. (D-09)

---

## 2. `src/` 구조

### 2.1. 전체 트리

```text
src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
├── pages/
│   ├── DashboardPage/                   # 라우트 /
│   ├── EditorPage/                      # 라우트 /guide/:id/edit
│   ├── PreviewPage/                     # 라우트 /guide/:id/preview
│   └── NotFoundPage/
├── assets/
│   ├── icons/                           # 신뢰된 SVG 아이콘 (기술 §7.1-8)
│   ├── illustrations/
│   └── samples/                         # FR-020 샘플 템플릿 3종 이상
├── components/
│   ├── ui/
│   │   ├── Button/
│   │   ├── IconButton/
│   │   ├── Field/                       # 라벨·도움말·글자 수·오류·aria-describedby (D-05)
│   │   ├── Input/
│   │   ├── Textarea/
│   │   ├── Checkbox/
│   │   ├── RadioCard/
│   │   ├── Select/
│   │   ├── Badge/
│   │   ├── Alert/
│   │   ├── Dialog/
│   │   ├── Drawer/
│   │   ├── Accordion/
│   │   ├── ProgressBar/
│   │   ├── Toast/
│   │   ├── EmptyState/
│   │   ├── ThemeToggle/
│   │   ├── SkipLink/
│   │   └── LiveRegion/                  # 재정렬·상태 변경 aria-live 알림
│   ├── layout/
│   │   ├── AppHeader/
│   │   ├── EditorShell/
│   │   ├── ReaderShell/
│   │   ├── Sidebar/
│   │   ├── InspectorDrawer/
│   │   └── StickyActionBar/
│   ├── content/                         # 작성기 미리보기와 리더가 공유
│   │   ├── BlockRenderer/               # ContentBlock 판별 유니온 exhaustive 분기
│   │   ├── MarkdownText/                # 유일한 dangerouslySetInnerHTML 경계
│   │   ├── CodeBlock/
│   │   ├── CopyButton/
│   │   ├── LinkCard/
│   │   ├── GuideImage/
│   │   ├── ChecklistBlock/
│   │   ├── DecisionOptions/
│   │   ├── StepCard/
│   │   ├── WarningCard/
│   │   └── SuccessCheckbox/
│   ├── editor/
│   │   ├── GuideCard/                   # 대시보드 목록 항목
│   │   ├── GuideOutline/
│   │   ├── SectionHeader/
│   │   ├── GuideMetaForm/
│   │   ├── GuideSettingsForm/
│   │   ├── PreparationEditor/
│   │   ├── WarningEditor/
│   │   ├── StepEditor/
│   │   ├── BlockEditor/                 # 블록별 폼 (기술 §5.3 `BlockToolbar`와 동일 — 별도 폴더 금지, D-03)
│   │   ├── BlockTypePicker/             # 고정 순서 블록 추가 목록
│   │   ├── ReorderControls/             # FR-018 키보드 재정렬
│   │   ├── BranchRuleEditor/
│   │   ├── BranchSummary/               # 문장식 경로 요약
│   │   ├── TroubleshootingEditor/
│   │   ├── CompletionEditor/
│   │   ├── ValidationPanel/
│   │   ├── SaveStateIndicator/
│   │   ├── StorageUnavailableBanner/    # M3 DoD 6 지속 배너
│   │   ├── RecoveryRestorePrompt/       # 복구 스냅샷 복원 확인
│   │   ├── NewGuideDialog/              # 빈 문서·Markdown·샘플 템플릿 선택
│   │   ├── JsonImportDialog/
│   │   ├── ImportReview/                # Markdown 매핑 검토
│   │   ├── ExportDialog/
│   │   └── DataBackupMenu/              # 전체 백업·초기화 (가이드별 삭제와 분리)
│   └── reader/
│       ├── GuideIntro/
│       ├── PreparationChecklist/
│       ├── WarningGate/
│       ├── ReaderProgressHeader/
│       ├── ReaderStep/
│       ├── TroubleshootingAccordion/
│       ├── ReaderOutline/               # GuideSettings.showOverallOutline
│       ├── ResumePrompt/                # 이어하기·처음부터
│       ├── ReaderSettings/              # 테마·진행 초기화·전체 개요
│       ├── CompletionScreen/
│       └── ReaderErrorScreen/           # 잘못된 가이드·분기 결과 없음·손상 파일
├── domain/                              # React·브라우저 API 의존 금지
│   ├── guide.types.ts
│   ├── guide.schema.ts                  # Zod, schemaVersion "1.0"
│   ├── guide.defaults.ts
│   ├── progress.types.ts
│   └── validation.types.ts              # 이슈 코드·severity 정의
├── features/
│   ├── autosave/
│   │   ├── autosave.service.ts
│   │   └── useAutosave.ts
│   ├── branching/                       # 순수 함수, 작성기·리더 공유
│   │   ├── branch-engine.ts
│   │   ├── graph-validator.ts
│   │   └── path-calculator.ts
│   ├── sanitize/                        # 순수 함수, 작성기·리더 공유 (D-04)
│   │   ├── sanitize-html.ts             # DOMPurify 설정·금지 태그/속성
│   │   └── markdown-to-html.ts          # remark AST → 허용 노드 → 살균 문자열
│   ├── assets/
│   │   ├── image-optimizer.ts
│   │   └── checksum.ts
│   ├── import-markdown/
│   │   ├── markdown-parser.ts
│   │   ├── section-classifier.ts
│   │   └── block-mapper.ts
│   ├── import-json/
│   │   ├── json-importer.ts
│   │   └── migrations/                  # schemaVersion별 마이그레이션 모듈
│   ├── export-json/
│   │   └── json-exporter.ts
│   ├── export-html/
│   │   ├── html-exporter.ts
│   │   ├── export-validator.ts          # INV-05 내보내기 차단 판정
│   │   ├── safe-serialize.ts
│   │   ├── asset-inliner.ts
│   │   └── export-template.ts           # reader-template.html 주입 로직
│   └── printing/
│       └── print.service.ts
├── reader-runtime/                      # 독립 번들, 프레임워크 비의존
│   ├── index.ts
│   ├── reader-state.ts
│   ├── reader-renderer.ts
│   ├── reader-storage.ts
│   ├── reader-template.html             # 독립 HTML 셸
│   └── reader.css                       # CSS Module 아님, 정적 CSS
├── storage/
│   ├── db.ts                            # Dexie: guides, assets, recovery
│   ├── guide.repository.ts
│   ├── asset.repository.ts
│   ├── recovery.repository.ts
│   └── local-storage.ts
├── store/
│   ├── guide.store.ts
│   ├── ui.store.ts
│   └── reader.store.ts
├── styles/
│   ├── reset.css
│   ├── tokens.css                       # 색상·간격·타이포·모서리
│   ├── themes.css                       # Light/Dark/System
│   ├── typography.css
│   ├── utilities.css                    # sr-only, focus-ring, print-only
│   ├── global.css
│   └── print.css
├── utils/
│   ├── id.ts                            # crypto.randomUUID 우선
│   ├── filename.ts                      # 안전 파일명·80자 상한·revision suffix
│   ├── mime.ts
│   ├── url.ts                           # http:/https: 프로토콜 허용 목록
│   ├── clipboard.ts                     # Clipboard API + 선택 영역 폴백
│   └── accessibility.ts
└── main.tsx
```

### 2.2. 디렉터리별 책임

| 디렉터리              | 책임                                          | 넣지 않는 것                           |
| --------------------- | --------------------------------------------- | -------------------------------------- |
| `app/`                | 앱 진입, 라우팅, Provider 조립                | 화면 구현, 도메인 규칙                 |
| `pages/`              | 라우트 단위 화면 조립                         | 재사용 컴포넌트 정의, 저장소 직접 접근 |
| `components/ui/`      | 도메인 지식 없는 기본 UI                      | HowSheet 도메인 타입 import            |
| `components/layout/`  | 셸·헤더·사이드바·액션바 골격                  | 콘텐츠 렌더링 로직                     |
| `components/content/` | 작성기 미리보기와 리더가 공유하는 콘텐츠 표현 | 편집 전용 컨트롤                       |
| `components/editor/`  | 작성 전용 폼·패널·대화상자                    | 리더 콘텐츠 마크업                     |
| `components/reader/`  | 앱 내 리더·미리보기 화면                      | 편집 컨트롤, 저장소 직접 접근          |
| `domain/`             | 타입·Zod 스키마·기본값·이슈 코드              | React, Zustand, Dexie, DOM API         |
| `features/`           | 순수 로직과 파이프라인                        | JSX 화면 조립                          |
| `reader-runtime/`     | 내보낸 HTML의 상태·렌더·저장                  | 작성기 컴포넌트·스토어·DB              |
| `storage/`            | IndexedDB·LocalStorage 캡슐화                 | 도메인 규칙, UI 상태                   |
| `store/`              | Zustand 스토어 3분할                          | 영속 구현 세부                         |
| `styles/`             | 전역 토큰·리셋·타이포·인쇄                    | 컴포넌트 지역 스타일                   |
| `utils/`              | 도메인 비의존 순수 헬퍼                       | 상태, 저장소, 컴포넌트                 |

### 2.3. 테마 처리 위치

테마는 전용 feature를 만들지 않는다. 기술 §4.3.1과 디자인 §2.1.6이 요구하는 "루트 렌더링 전 적용"은 모듈 import보다 앞서 실행돼야 하기 때문이다.

| 역할                  | 위치                                                   |
| --------------------- | ------------------------------------------------------ |
| 플래시 방지 선행 적용 | `index.html` 인라인 스니펫                             |
| 런타임 전환 상태      | `store/ui.store.ts`                                    |
| 작성기 환경 설정 영속 | `storage/local-storage.ts` (`howsheet:editor:theme`)   |
| 토큰 전환             | `styles/themes.css`                                    |
| 리더 테마 해석        | `reader-runtime/reader-state.ts` + `reader-storage.ts` |

리더는 작성기 테마 키를 읽지 않는다. `GuideSettings.defaultTheme`과 `allowThemeSwitch`를 따른다. 기술 §2.1.3이 "작성기 환경 설정과 가이드 기본 테마는 서로 분리한다"고 규정하고, 작성기 키를 읽으면 INV-11의 스토리지 구현 세부 의존이 된다.

---

## 3. 모듈 경계 규칙

통합 전 기술 백서 §6.1에 있던 모듈 경계 규칙을 이 절이 흡수했고, 하네스 M1 DoD 5~6 및 INV-11이 요구하는 검증 대상을 명시했다. 모듈 경계의 기준은 이 절이다. 아래 규칙은 `pnpm verify:architecture`와 ESLint import 규칙으로 기계 검증한다. 주석이나 경로 예외로 무력화하지 않는다.

### 3.1. 계층 의존 방향

```text
domain  ←  features  ←  store  ←  pages / components  ←  app
   ↑           ↑
   └───────────┴──  reader-runtime (허용 목록에 한해)

storage  ←  store              styles  ←  전 계층 (토큰 참조)
```

### 3.2. 하드 경계

1. `domain`은 React, Zustand, Dexie, DOM API를 import하지 않는다. (M1 DoD 5)
2. `reader-runtime`은 `components/editor`, `store/guide.store`, `storage/db`를 import하지 않는다. (M1 DoD 6, INV-11)
3. `reader-runtime`의 import 허용 목록은 다음으로 한정한다.
   - `src/domain/**`
   - `src/features/branching/**`
   - `src/features/sanitize/**`
   - `src/reader-runtime/**`

   `verify:architecture`는 이 목록을 **디렉터리 단위가 아니라 모듈 단위로** 판정한다. `features` 전체를 금지하면 리더가 분기 엔진과 살균기를 쓸 수 없고, `features` 전체를 허용하면 `autosave`·`import-json` 같은 편집기 전용 모듈이 리더 번들에 들어온다.

4. `features/branching`과 `features/sanitize`는 순수 함수로 구현해 작성기와 리더가 **같은 구현을 공유**한다. 분기 로직이나 살균 로직을 리더용으로 복제하지 않는다. (하네스 §3.3, INV-09)
5. `storage`는 IndexedDB와 LocalStorage 구현을 캡슐화한다. `storage/` 밖에서 Dexie나 `localStorage`에 직접 접근하지 않는다.
6. `export-html`은 DOM 상태가 아닌 `GuideDocument` 스냅샷만 입력으로 받는다.
7. `components/ui`는 HowSheet 도메인 타입을 import하지 않는다. 도메인을 아는 표현은 `components/content` 이상 계층에 둔다.
8. 편집기 전용 컨트롤과 리더 콘텐츠 마크업을 한 컴포넌트에 혼합하지 않는다.
9. `src/components/common/`, `src/lib/`, `src/hooks/`, `src/types/` 경로는 만들지 않는다. 각각 `components/ui/`, `features/*`, 소유 feature 내부, `domain/*.types.ts`로 대체한다. `verify:architecture`는 이 네 경로가 존재하면 실패한다. (D-01)

### 3.3. 살균 경계

- `dangerouslySetInnerHTML`을 사용하는 모듈은 프로젝트 전체에서 `components/content/MarkdownText/` **한 곳뿐**이다. (기술 §7.1-2)
- 살균 자체는 프레임워크에 의존하지 않는 `features/sanitize/`가 수행한다. React 화면은 `MarkdownText`를 통해, 내보낸 HTML은 `reader-runtime/reader-renderer.ts`가 직접 이 순수 함수를 호출한다.
- 이 분리가 없으면 리더 런타임이 살균기를 복제해야 하고, 그 순간 기술 §7.1-2의 "경계 한 곳" 규칙과 INV-07이 동시에 깨진다.
- URL 프로토콜 허용 목록(`ALLOWED_URL_PROTOCOLS`)과 판정 함수는 `domain/guide.types.ts`·`domain/guide.schema.ts`가 단독으로 소유한다. §2.2.4의 필드 검증 규칙이라 스키마가 파싱 시점에 판정해야 하고, §3.2-1이 domain의 외부 계층 import를 금지하므로 `utils/`에 둘 수 없다. `utils/url.ts`는 도메인 상수를 가져다 쓰는 브라우저측 헬퍼만 담는다. 링크 렌더러와 Markdown 매퍼가 각자 판정하지 않는다.

### 3.4. 번들 분리

- 편집기 번들과 리더 번들은 분리한다. 리더 런타임에 작성기 라이브러리를 포함하지 않는다. (기술 §7.3, M9 할 일 1)
- 리더 번들 생성의 단일 소유자는 `scripts/build-reader-runtime.mjs`다. `verify:bundle`은 이 스크립트의 산출물을 측정한다. 리더 번들 정의를 루트 설정 파일로 분리하지 않는다. (D-08)
- 스타일 토큰은 `styles/tokens.css`와 `reader-runtime/reader.css`가 **같은 변수명**을 쓰되 번들은 분리한다.
- `reader.css`는 CSS Module이 아니라 정적 CSS다.

### 3.5. 리더 이중 구현에 관한 확정 사항

`components/reader/*`(React)와 `reader-runtime/reader-renderer.ts`(프레임워크 비의존)는 **의도된 두 구현**이며 미결 항목이 아니다. 통합 전 기술 백서 §6이 두 경로를 동시에 담고 있었고, 기술 §5.2가 "작성 모드와 리더 모드의 표현 컴포넌트를 분리하되 콘텐츠 렌더러는 공유"를, 기술 §7.3이 리더 번들에서 작성기 라이브러리 배제를 요구한다.

- `components/reader/*`: 앱 내 리더와 `/guide/:id/preview` 미리보기를 담당한다. 미리보기는 별도 렌더러를 만들지 않고 이 컴포넌트를 그대로 쓴다.
- `reader-runtime/*`: 내보낸 단일 HTML을 담당한다. 파일 확장자가 `.ts`인 것은 React 의존을 배제한다는 뜻이다.
- 두 구현의 의미 정합성은 INV-09가 강제하고 parity 테스트가 게이트다. 공유 지점은 `features/branching`, `features/sanitize`, 동일한 토큰 변수명 세 가지뿐이다.

---

## 4. 컴포넌트 작성 규칙

통합 전 디자인 백서 §6.1에 있던 컴포넌트 작성 규칙을 이 절이 흡수했다. 컴포넌트 작성 규칙의 기준은 이 절이다.

- 폴더명과 컴포넌트명은 PascalCase를 사용한다.
- 각 컴포넌트 폴더는 `Component.tsx`, `Component.module.css`, `Component.test.tsx`를 기본으로 한다. 병치하는 것은 렌더링 테스트뿐이며, 하네스가 경로로 호출하는 단위·통합·E2E 테스트는 `tests/`에 남는다. (D-07)
- 스타일 상태는 `data-state`, `data-severity`, `aria-*` 속성을 우선 활용하고 상태 전용 클래스를 늘리지 않는다.
- 콘텐츠 컴포넌트는 작성기 미리보기와 리더 런타임에서 가능한 한 공유한다.
- 미리보기 화면은 리더와 같은 컴포넌트를 사용한다. 별도 미리보기 렌더러를 만들지 않는다.
- 클래스명은 CSS Modules 지역 범위를 사용한다. 전역 유틸리티는 `sr-only`, `focus-ring`, `print-only`로 제한한다.
- 인쇄 훅(`.editor-only`, `.reader-actions`, `.theme-toggle`, `.copy-button`, `.toast-region`, `.step-card`, `.warning-card`)은 소유 컴포넌트의 `*.module.css`에서 `:global()`로 노출하고, `styles/print.css`가 그 이름들을 겨냥한다. `utilities.css`에 추가하지 않는다. (D-06)
- 폼 컨트롤은 `Field/`가 라벨·도움말·글자 수·오류·`aria-describedby`를 소유하고, `Input/`·`Textarea/`는 컨트롤 박스 규격만 소유하며 항상 `Field` 안에서 렌더링한다. `Field/`가 M11 DoD 8의 책임 주체다. (D-05)
- 디자인 토큰을 거치지 않은 임의 색상·간격 값을 쓰지 않는다.
- 작성기와 리더는 같은 상태 명칭을 쓴다. `upcoming`, `current`, `completed`, `blocked`, `skipped`를 화면마다 다르게 부르지 않는다.

### 4.1. 로직 모듈 파일 명명

| 종류                          | 규칙                           | 예                                                        |
| ----------------------------- | ------------------------------ | --------------------------------------------------------- |
| 컴포넌트 폴더·파일            | PascalCase                     | `BranchRuleEditor/BranchRuleEditor.tsx`                   |
| 순수 로직 모듈                | kebab-case                     | `branch-engine.ts`, `safe-serialize.ts`                   |
| 타입·스키마·스토어·리포지토리 | dot-namespaced lowercase       | `guide.types.ts`, `guide.store.ts`, `asset.repository.ts` |
| 서비스                        | `*.service.ts`                 | `autosave.service.ts`, `print.service.ts`                 |
| 훅                            | `use*.ts`, 소유 feature에 병치 | `features/autosave/useAutosave.ts`                        |
| Node 실행 스크립트            | kebab-case `.mjs`              | `scripts/verify-offline.mjs`                              |
| E2E 스펙                      | kebab-case `.spec.ts`          | `tests/e2e/reader-branch.spec.ts`                         |

---

## 5. `tests/` 구조

경로는 하네스 M1~M12 검증 블록이 실제로 호출하는 것과 일치해야 한다. 픽스처 파일명은 하네스 §0.10을 그대로 채택했다. §0.10은 "파일명은 다르게 정할 수 있으나 역할과 테스트 범위는 줄이지 않는다"고 하므로, **이름은 재량이고 역할은 계약이다.**

```text
tests/
├── fixtures/
│   ├── valid-minimal.howsheet.json
│   ├── valid-linear-5step.howsheet.json
│   ├── valid-branched.howsheet.json
│   ├── invalid-missing-target.howsheet.json
│   ├── invalid-cycle.howsheet.json
│   ├── invalid-unreachable.howsheet.json
│   ├── invalid-no-terminal.howsheet.json
│   ├── invalid-duplicate-priority.howsheet.json
│   ├── xss-guide.howsheet.json
│   ├── large-100-step.howsheet.json
│   ├── assets/
│   │   ├── photo-large.jpg              # 5MB·1920px 상한 검증
│   │   ├── transparent-diagram.png      # 다크 모드 대비 검증
│   │   ├── duplicate-a.png              # checksum 중복 제거 검증
│   │   ├── duplicate-b.png
│   │   └── blocked.svg                  # SVG 업로드 차단 검증
│   └── markdown-samples/
│       ├── complete-guide.md
│       ├── ambiguous-headings.md
│       ├── raw-html.md
│       ├── local-images.md
│       └── remote-images.md
├── unit/
│   ├── domain/
│   ├── storage/
│   ├── store/
│   ├── autosave/
│   ├── content/
│   ├── security/
│   ├── assets/
│   ├── branching/
│   ├── reader/
│   ├── import-json/
│   ├── export-json/
│   ├── export-html/
│   └── import-markdown/
├── integration/
│   ├── storage/
│   ├── editor-core/
│   ├── branch-editor/
│   ├── reader/
│   ├── json-roundtrip/
│   ├── export-html/
│   └── markdown-review/
├── e2e/
│   ├── smoke.spec.ts                    # M1
│   ├── editor-basic.spec.ts             # M4
│   ├── content-blocks.spec.ts           # M5
│   ├── reader-linear.spec.ts            # M7
│   ├── reader-branch.spec.ts            # M7
│   ├── reader-storage.spec.ts           # M7
│   ├── standalone-export.spec.ts        # M9
│   ├── markdown-import.spec.ts          # M10
│   ├── responsive.spec.ts               # M11
│   ├── keyboard.spec.ts                 # M11
│   ├── theme.spec.ts                    # M11
│   └── zoom.spec.ts                     # M11
└── visual/                              # 320·390·768·1024·1440px 고정 뷰포트
```

`pnpm test:a11y`는 별도 디렉터리를 갖지 않는다. 하네스 §0.9는 역할만 정의하고, M11 검증 블록은 a11y 시나리오를 `tests/e2e/`의 `keyboard`·`responsive`·`theme`·`zoom` 스펙으로 실행한다. axe 검사는 이 스펙들에 대한 Playwright project 또는 grep으로 구성한다.

픽스처는 테스트 안에서 생성하는 데이터와 별도로 저장해 사람이 리뷰할 수 있어야 한다.

### 5.1. 병치 테스트와 커버리지 측정 대상

컴포넌트 렌더링 테스트는 `Component.test.tsx`로 컴포넌트 폴더에 병치한다. 그 외 단위·통합·E2E 테스트는 위 트리에 남는다. 두 위치가 섞이면 커버리지 임계의 대상이 모호해지므로 다음을 함께 고정한다. (D-07)

| 항목                           | 값                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest.config.ts` include     | `tests/unit/**`, `tests/integration/**`, `src/**/*.test.tsx`                                                                                                |
| 커버리지 측정 대상             | `src/**` (테스트 파일 자신 제외)                                                                                                                            |
| M6 DoD 11 — 핵심 모듈 90%      | `src/features/branching/**`                                                                                                                                 |
| M12 DoD 3 — 핵심 순수 함수 90% | `src/features/branching/**`, `src/features/import-json/**`, `src/features/import-markdown/**`, `src/features/export-json/**`, `src/features/export-html/**` |
| M12 DoD 4 — 전체 80%           | `src/**`                                                                                                                                                    |

---

## 6. `scripts/` 구조

하네스 §0.9는 검증 스크립트를 Windows·macOS·Linux에서 동일하게 실행되는 Node.js 기반으로 작성하도록 요구하고, 셸 전용 `grep`·`sed`·`find`·`du`에 릴리스 판정을 의존하지 못하게 한다. 빈 명령, 항상 성공하는 placeholder, `|| true`를 두지 않는다.

```text
scripts/
├── check-node.mjs                       # preinstall·dev·build Node 런타임 가드
├── build-reader-runtime.mjs             # 리더 CSS·런타임 독립 번들 (단일 소유자, D-08)
├── verify-architecture.mjs              # M1  모듈 import 경계
├── verify-fixtures.mjs                  # M2  tests/fixtures/ + src/assets/samples/
├── verify-bundle.mjs                    # M9  편집기·리더 번들 예산
├── verify-offline.mjs                   # M9  외부 요청 0건
├── verify-print.mjs                     # M11 print media DOM·스타일
├── verify-release.mjs                   # M12 전체 게이트 순서 고정
├── benchmark-graph-validation.mjs       # M6  100단계 30회 median
└── generate-fixture-assets.mjs          # 선택 — 대용량 자산 결정론적 생성
```

- `verify-fixtures.mjs`는 `tests/fixtures/*.howsheet.json`과 `src/assets/samples/*`를 **모두** 검증한다. 기술 백서 §6의 `validate-sample-guides.ts`가 담당하던 샘플 템플릿 검증(FR-020)이 여기에 포함된다.
- `check-node.mjs`는 `preinstall`, `dev`, `build`에서 실행한다. pnpm의 `engine-strict`는 의존성의 `engines`만 검사하고 루트 프로젝트의 `engines`는 강제하지 않으므로, 지원하지 않는 런타임을 이 스크립트가 막는다. 알려진 결함 버전은 major 범위와 별개로 항상 차단한다.
- `generate-fixture-assets.mjs`는 하네스 §0.10이 허용한 선택 사항이며 `tests/fixtures/assets/`의 바이너리에만 적용한다. `large-100-step.howsheet.json`은 사람이 리뷰할 수 있도록 커밋한다.
- `verify-release.mjs`는 최소한 다음 순서와 동등해야 한다.

```text
format:check → lint → typecheck → test:unit → test:integration → test:coverage
→ build → verify:architecture → verify:fixtures → test:security → test:a11y
→ test:e2e → test:visual → verify:offline → verify:print → verify:bundle
```

---

## 7. 확정된 구조 결정

아래 항목은 기술 백서와 디자인 백서가 실제로 충돌했거나 두 백서 모두 침묵하던 것들이다. D-01~~D-09는 통합 시점에, D-10 이후는 구현 중에 드러난 것으로 각각 승인을 받았다. **2026년 8월 30일 사용자 승인으로 전부 권장안대로 확정했다.** §1~~§6의 트리와 규칙은 이 결정을 이미 반영한 상태이므로, 구현 시에는 §1~§6을 그대로 따르면 된다. 이 절은 그 배치가 왜 그렇게 됐는지에 대한 근거 기록이다.

M1에서 `PROGRESS.md`를 생성할 때 아래 9건을 결정 로그로 옮긴다. 이후 이 결정을 바꾸려면 §10의 변경 절차를 따른다.

아래에서 인용하는 "기술 §6"·"디자인 §6"·"§6.1"은 **통합 전** 두 백서의 원래 §6 내용을 가리킨다. 현재 두 백서의 §6은 이 문서를 가리키는 포인터다.

### D-01. 공통 컴포넌트 그룹 이름 — `components/ui/` 확정

- **결정**: `components/ui/`를 쓴다. 기술 백서 §6의 `components/common/`은 사용하지 않는다.
- **근거**: 디자인 §6의 목록(15개)이 기술 §6(5개)의 상위 집합이고, 하네스 §0.1이 표현 계약을 디자인 백서 우선으로 둔다.
- **후속**: 기술 백서만 읽는 에이전트가 `components/common`을 만들 수 있다. `verify:architecture`에 해당 경로 존재 시 실패하는 규칙을 둔다.

### D-02. `components/content/` 그룹 신설 — 확정

- **결정**: 작성기 미리보기와 리더가 공유하는 콘텐츠 표현 계층으로 `components/content/`를 신설한다.
- **근거**: 기술 §6에는 없지만 기술 §5.2가 "콘텐츠 렌더러는 공유"를 요구한다. 이 그룹이 없으면 미리보기와 리더가 렌더러를 복제하게 되고 INV-09 정합성을 수동 유지해야 한다.
- **후속**: 새 모듈 경계이므로 §3.2-7(도메인 타입 import 방향)을 `verify:architecture`가 함께 검증한다.

### D-03. 컴포넌트 이름 충돌 5건 — 기술 백서 이름 확정

| 개념      | 기술 백서                  | 디자인 백서            | 확정                           |
| --------- | -------------------------- | ---------------------- | ------------------------------ |
| 리더 단계 | `ReaderStep`               | `ReaderStepCard`       | **`ReaderStep`**               |
| 오류 해결 | `TroubleshootingAccordion` | `TroubleshootingPanel` | **`TroubleshootingAccordion`** |
| 분기 규칙 | `BranchRuleEditor`         | `BranchRuleCard`       | **`BranchRuleEditor`**         |
| 단계 편집 | `StepEditor`               | `StepEditorCard`       | **`StepEditor`**               |
| 블록 편집 | `BlockEditor`              | `BlockEditorCard`      | **`BlockEditor`**              |

- **근거**: 하네스 M6·M7의 할 일 목록이 기술 백서 이름을 그대로 호출한다. 하네스는 §0.1 우선순위 2로 두 백서보다 앞선다.
- **주의**: `BlockToolbar`(기술 §5.3 본문)는 `BlockEditor`(기술 §6 폴더)와 **같은 항목**이다. §5.3의 10개 목록과 §6의 10개 폴더가 순서까지 1:1로 대응한다. 별도 컴포넌트로 만들지 않는다. 디자인 §2.2.1·§2.4.5가 요구하는 고정 순서 블록 추가 목록은 별개 근거로 `BlockTypePicker/`에 둔다.

### D-04. `features/sanitize/` 신설과 리더 import 허용 — 확정

- **결정**: `features/sanitize/`를 신설하고, `reader-runtime`의 import 허용 목록을 §3.2-3의 4개 모듈로 한정한다. `verify:architecture`는 이 목록을 **모듈 단위로** 판정한다.
- **근거**: 신설하지 않으면 리더 런타임이 살균기를 복제해야 해 기술 §7.1-2의 "경계 한 곳" 규칙이 깨진다. 신설하되 디렉터리 단위로 `features` import를 금지하면 리더가 살균기에 닿을 수 없어 INV-07을 만족할 수 없다. 모듈 단위 허용 목록만이 INV-07과 INV-11을 동시에 만족한다.
- **후속**: `verify:architecture`를 디렉터리 allowlist로 구현하면 M1은 통과하고 M9에서 막힌다. M1에서 처음 작성할 때부터 모듈 단위로 구현한다.

### D-05. `Field` / `Input` / `Textarea` — 세 컴포넌트 유지, 책임 분리 확정

- **결정**: 셋 다 유지하고 책임을 나눈다. `Field/`가 라벨·도움말·글자 수·오류 메시지·`aria-describedby` 연결을 소유하며 M11 DoD 8의 책임 주체다. `Input/`·`Textarea/`는 컨트롤 박스 규격(디자인 §5.6.2)만 소유하고 **항상 `Field` 안에서 렌더링**한다.
- **근거**: 기술 §5.2의 제목은 `Input / Textarea`지만 그 내용(라벨 `id` 연결, 도움말·글자 수·오류 고정 순서, `aria-describedby`)은 §6 폴더명 `Field/`의 계약이다. 하네스 M11 할 일 2도 `Field`를 이름으로 호출한다. 디자인 §5.6.2의 박스 규격은 별개 계약이므로 흡수하지 않는다.
- **버린 대안**: `Field/`만 두고 `Input`·`Textarea`를 variant로 흡수 — 디자인 §6의 폴더 두 개가 사라져 디자인 QA 기준이 흐려진다.

### D-06. 인쇄용 전역 클래스 7개 — `:global()` 방식 확정

- **결정**: `styles/utilities.css`는 디자인 §3.3이 허용한 `sr-only`, `focus-ring`, `print-only` 세 개만 유지한다. 기술 §5.5가 겨냥하는 `.editor-only`, `.reader-actions`, `.theme-toggle`, `.copy-button`, `.toast-region`, `.step-card`, `.warning-card`는 각 컴포넌트의 `*.module.css`에서 `:global()`로 노출하고, `styles/print.css`가 그 이름들을 겨냥한다.
- **근거**: 전역 유틸리티를 7개 늘리면 디자인 §3.3의 스타일링 계약이 깨진다. 인쇄 훅은 소유 컴포넌트가 자기 이름을 내보내는 형태가 되어야 소유권이 분명해진다.
- **버린 대안**: 7개를 전역 예외로 승인해 `utilities.css`에 두기.

### D-07. 테스트 파일 배치 — 하이브리드 확정

- **결정**: 컴포넌트 렌더링 테스트만 컴포넌트 폴더에 병치(`Component.test.tsx`)하고, 하네스가 경로로 호출하는 `tests/unit|integration|e2e`는 그대로 유지한다.
- **근거**: 기술 §6은 모든 테스트를 `tests/`에 두고 디자인 §6.1은 병치를 요구한다. 하네스 M1~M11 검증 블록이 `tests/` 경로를 직접 호출하므로 `tests/`를 없앨 수 없고, 디자인 QA는 컴포넌트 옆의 렌더링 테스트를 전제로 한다.
- **측정 대상 확정**(M6 DoD 11·M12 DoD 4가 모호해지지 않도록 함께 정한다):
  - `vitest.config.ts`의 include는 `tests/unit/**`, `tests/integration/**`, `src/**/*.test.tsx` 세 곳이다.
  - 커버리지 측정 대상은 `src/**`이며 테스트 파일 자신은 제외한다.
  - M6 DoD 11의 핵심 모듈 90% 대상은 `src/features/branching/**`다.
  - M12 DoD 3의 핵심 순수 함수 90% 대상은 `src/features/branching/**`, `src/features/import-json/**`, `src/features/import-markdown/**`, `src/features/export-json/**`, `src/features/export-html/**`다.
  - M12 DoD 4의 전체 80% 대상은 `src/**`다.

### D-08. `scripts/build-reader-runtime` — `.mjs` 확정

- **결정**: `scripts/build-reader-runtime.mjs`로 둔다. 기술 §6의 `.ts` 표기는 채택하지 않는다.
- **근거**: 기술 §3.2 라이브러리 표에 TypeScript 실행기가 없고, M1 DoD 2가 직접 의존성의 정확한 버전 고정을 요구하므로 `tsx`·`ts-node`를 즉흥 추가할 수 없다. 하네스 §0.9는 이미 모든 검증 스크립트를 Node 기반으로 요구하므로 확장자를 통일하면 도구 표면이 하나 줄어든다.
- **버린 대안**: 실행기를 명시적으로 고정해 의존성에 추가하기.
- **후속**: 리더 번들 정의 파일을 루트에 따로 두지 않는다(`vite.reader.config.ts` 등). 이 스크립트가 유일한 진입점이며 `verify:bundle`이 그 산출물을 측정한다.

### D-09. `artifacts/` 커밋 정책 — `phase-reports/`만 커밋 확정

- **결정**: `artifacts/qa/phase-reports/`만 커밋한다. `screenshots/`, `accessibility/`, `performance/`, `security/`, `exports/`는 `.gitignore`에 넣고 CI 아티팩트로 업로드한다.
- **근거**: 하네스 §0.11은 증거를 `artifacts/qa/`에 두게 하지만 §0.6은 대용량 HTML·비디오·임시 이미지 커밋을 금지한다. phase 보고서와 릴리스 후보 요약은 텍스트이고 세션 인계에 필요하므로 커밋 대상이다.
- **후속**: M6 벤치마크 수치, M9 export 측정치, M12 체크섬처럼 **판정 근거가 되는 수치는 보고서 본문에 적는다.** `performance/`나 `exports/`의 원본 파일이 커밋되지 않으므로, 파일만 남기고 수치를 적지 않으면 다음 세션이 재현할 수 없다.

### D-10. URL 프로토콜 허용 목록의 소유자 — `domain` 확정

- **결정**: `ALLOWED_URL_PROTOCOLS`와 판정 함수 `isAllowedUrl`을 `domain/guide.types.ts`·`domain/guide.schema.ts`가 소유한다. `utils/url.ts`는 이 상수를 가져다 쓰는 브라우저측 헬퍼만 담는다.
- **근거**: 링크 프로토콜 제한은 기술 §2.2.4의 **필드 검증 규칙**이라 Zod 스키마가 파싱 시점에 판정해야 한다. 그런데 §3.2-1이 domain의 외부 계층 import를 금지하므로 domain이 `utils/`를 참조할 수 없다. 원래 §3.3에 적었던 "`utils/url.ts`가 단독 소유"는 이 제약과 양립할 수 없었다.
- **영향**: §3.3 문구를 고쳤다. 판정이 한 곳에만 있어야 한다는 원칙은 그대로다.

### D-11. `reader-runtime` 경계를 전이 의존까지 검사

- **결정**: `verify:architecture`가 `reader-runtime`에서 도달 가능한 내부 모듈이 끌어오는 **외부 패키지까지** 검사한다. 직접 import뿐 아니라 경유 import도 위반이다.
- **근거**: `@/domain/guide.schema.ts`는 §3.2-3의 허용 경로에 있지만 `zod`를 import한다. 리더가 그 모듈을 쓰면 zod가 리더 번들에 들어가는데, 직접 import만 보면 이것이 M9의 `verify:bundle`까지 드러나지 않는다. INV-11의 "편집기 전용 라이브러리를 import하지 않음"은 전이 의존을 포함해야 의미가 있다.
- **영향**: 리더가 쓸 domain 모듈은 외부 의존이 없어야 한다. `guide.types.ts`, `progress.types.ts`, `validation.types.ts`는 조건을 만족하고 `guide.schema.ts`는 만족하지 않는다.

---

## 8. 확장 예정 경계 (MVP 비범위)

하네스 §0.8에 따라 아래는 사용자 승인 없이 phase에 추가하지 않는다. 인터페이스 정의는 허용하되 MVP 런타임·번들·UI에 노출하지 않는다. 따라서 §2 트리에는 디렉터리를 만들지 않는다.

- `hosting-adapter`: 공개 가이드 업로드와 버전 배포 (기술 부록 B `GuidePublishingAdapter`)
- `template-registry`: 템플릿 검색·복제
- `qr-service`: 가이드 URL QR 생성
- `feedback-adapter`: 익명 완료·오류 피드백
- `collaboration`: 계정·권한·공동 편집
- `ai-assistant`: 문서 구조화·요약·쉬운 표현 변환

핵심 `GuideDocument`와 리더 런타임은 서버 기능이 추가되어도 독립 실행형 내보내기를 유지해야 한다.

---

## 9. 구현 순서와 디렉터리 생성 시점

하네스 §1의 phase 순서를 따른다. 앞 phase의 게이트가 깨진 상태에서 뒤 디렉터리를 채우지 않는다.

| phase | 새로 채우는 경로                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1    | `app/`, `styles/`, 빈 계층 디렉터리, `scripts/verify-architecture.mjs`, `.github/workflows/`, `.gitignore`, `.nvmrc`. §7의 확정 결정 9건을 `PROGRESS.md` 결정 로그로 옮긴다                      |
| M2    | `domain/`, `tests/fixtures/`, `scripts/verify-fixtures.mjs`                                                                                                                                      |
| M3    | `storage/`, `tests/unit/storage/`, `tests/integration/storage/`                                                                                                                                  |
| M4    | `pages/`, `store/`, `components/layout/`, `components/ui/` 기본 컴포넌트(`Button/`·`IconButton/`·`Field/`·`Input/`·`Textarea/`·`Dialog/` 등), `features/autosave/`, `components/editor/` 기본 폼 |
| M5    | `components/content/`, `features/sanitize/`, `features/assets/`, `utils/clipboard.ts`                                                                                                            |
| M6    | `features/branching/`, `components/editor/BranchRuleEditor/`·`BranchSummary/`·`ValidationPanel/`, `scripts/benchmark-graph-validation.mjs`                                                       |
| M7    | `components/reader/`, `reader-runtime/`                                                                                                                                                          |
| M8    | `features/import-json/`, `features/export-json/`, `utils/filename.ts`                                                                                                                            |
| M9    | `features/export-html/`, `reader-runtime/reader-template.html`, `scripts/build-reader-runtime.mjs`, `verify-bundle.mjs`, `verify-offline.mjs`                                                    |
| M10   | `features/import-markdown/`, `components/editor/ImportReview/`                                                                                                                                   |
| M11   | `styles/` 전체 확정, `components/ui/` 상태 완성, `tests/visual/`, `verify-print.mjs`, `features/printing/`                                                                                       |
| M12   | `artifacts/qa/`, `docs/requirements-traceability.md`, `scripts/verify-release.mjs`                                                                                                               |

---

## 10. 이 문서의 변경 절차

1. 파일 구조 변경이 필요하면 먼저 이 문서를 고친다. 코드부터 옮기지 않는다.
2. 모듈 경계 변경은 하네스 §3.3에 따라 사용자 승인 대상이다. §7에 항목을 추가하고 STOP 절차를 따른다.
3. 이름만 바꾸는 변경도 하네스 검증 블록의 경로를 깨뜨릴 수 있다. `tests/`와 `scripts/` 경로를 바꿀 때는 하네스 §1의 해당 phase 검증 명령을 함께 수정한다.
4. 변경 후 `pnpm verify:architecture`가 새 경계를 실제로 검증하는지 확인한다. 문서만 고치고 검증을 두지 않으면 드리프트가 그대로 통과한다.
5. 승인된 결정은 `PROGRESS.md` 결정 로그에 이유와 함께 남긴다.
