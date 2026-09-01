# HowSheet - AI 코딩 에이전트 작업 하네스 (Harness)

**버전**: 1.0  
**작성일**: 2026년 8월 30일  
**프로젝트**: HowSheet - 누구나 만드는 단일 페이지 단계별 해결 가이드  
**대상 에이전트**: Codex, Claude Code 및 동등한 저장소 작업형 코딩 에이전트  
**참고 템플릿**: `JTech-CO/Schema-Hub/Harness/Harness_Template_KR.md`  
**관계 문서**:

- 루트 `AGENTS.md`: Codex용 전역 규칙·불변식·명령 계약
- 루트 `CLAUDE.md`: Claude Code를 병행할 경우의 전역 규칙·불변식. 핵심 내용은 `AGENTS.md`와 충돌하면 안 됨
- 루트 `PROGRESS.md`: 현재 상태, 다음 할 일, 미결 질문, 결정 로그를 전달하는 세션 인계 문서
- `docs/HowSheet_기술_백서.md`: 기능, 데이터 모델, 아키텍처, 성능, 보안, 테스트 기준의 기준 문서
- `docs/HowSheet_디자인_백서.md`: 화면, 컴포넌트, 반응형, 접근성, 디자인 토큰의 기준 문서
- `docs/File_Structure.md`: 파일·디렉터리·모듈 경계·명명 규칙의 **단일 기준 문서**. 두 백서의 §6을 통합한 것이며, 두 백서에는 이 문서를 가리키는 포인터만 남아 있음
- `README.md`: 사용자·기여자용 설치, 실행, 빌드, 배포, 데이터 삭제 안내

> 이 문서는 **무엇을 만드는지 설명하는 백서가 아니라, HowSheet를 어떤 순서로 구현하고 무엇으로 완료를 판정하며 실패 시 어떻게 복구할지를 규정하는 작업 하네스**다. 각 phase의 완료는 “화면이 보인다”, “에러가 없다”, “대체로 동작한다”가 아니라 아래에 명시한 **측정 가능한 Definition of Done(DoD)과 검증 명령을 모두 통과한 상태**를 뜻한다.
>
> HowSheet는 구조화된 절차, 조건 분기, 로컬 저장, 독립 실행형 HTML 내보내기를 동시에 다룬다. 따라서 앞 phase에서 데이터·분기·직렬화 불변식을 어긴 채 UI나 배포로 진행하면 잘못된 완료 판정이 뒤 phase 전체로 전파된다. 이 문서는 그 전파를 차단한다.

---

## 0. 사용법

### 0.1 문서 역할과 기준 문서 우선순위

제품 요구나 구현 판단이 충돌할 때 다음 순서를 적용한다.

1. **사용자가 현재 대화나 이슈에서 명시적으로 승인한 결정**
2. **본 하네스의 하드 불변식과 STOP 규칙**
3. **HowSheet 기술 백서**: 기능, 데이터, 아키텍처, 보안, 성능, 테스트 기준
4. **HowSheet 디자인 백서**: 레이아웃, 시각 계층, 반응형, 접근성, UI 상태 기준
5. **`File_Structure.md`**: 파일 배치, 디렉터리 책임, 모듈 경계, 명명 규칙. 구조 판단에서는 두 백서보다 우선한다. §7에 사용자 승인을 받은 구조 결정 9건과 그 근거가 있다
6. **`PROGRESS.md` 결정 로그**: 기존 문서가 비어 있거나 구현 세부를 정해야 했던 경우의 승인된 결정
7. **현재 코드**: 문서와 다르면 코드가 기준이 아니라 드리프트 후보임

충돌을 발견하면 임의로 한쪽을 선택하지 않는다. `PROGRESS.md`에 충돌 지점과 선택지를 기록하고 §3 STOP 절차를 따른다. 파일 구조·모듈 경계 충돌은 `File_Structure.md` §7에 이미 확정된 결정인지 먼저 확인한다. 확정 항목이면 그대로 따르고, 없는 충돌이면 §7과 같은 형식으로 선택지를 정리해 승인을 받는다. 기능·데이터 계약은 기술 백서, 표현·상호작용 계약은 디자인 백서를 우선하되, 두 문서를 동시에 만족할 수 없는 경우에는 사용자 결정을 받아야 한다.

### 0.2 세션 루프

1. **시작**
   - `PROGRESS.md`를 읽는다.
   - 현재 phase, 직전에 끝낸 작업, 다음 할 일, 미결 질문, 최근 결정 로그를 확인한다.
   - 본 문서의 해당 phase와 관련 백서 절을 읽는다.
   - `git status --short`로 기존 변경을 확인하고, 사용자가 만든 변경을 덮어쓰지 않는다.
2. **작업**
   - 한 번에 하나의 phase만 진행한다.
   - phase 안에서도 도메인 → 테스트 → UI/어댑터 순으로 작은 작업 단위를 유지한다.
   - 작업 단위가 끝날 때마다 해당 phase의 가장 좁은 검증 명령부터 실행한다.
   - 실패한 테스트를 고친 뒤에는 좁은 테스트와 상위 회귀 테스트를 모두 다시 실행한다.
3. **종료**
   - phase DoD를 전부 확인한다.
   - `PROGRESS.md`를 갱신한다.
   - 변경 파일, 실행한 검증, 남은 위험을 기록한다.
   - 하나의 설명 가능한 변경 단위로 커밋한다.

### 0.3 phase 완료 판정

- DoD 항목이 **모두** 충족되어야 완료다.
- 하나라도 실패하거나 검증하지 못한 항목이 있으면 phase 상태는 `IN PROGRESS` 또는 `BLOCKED`다.
- 테스트를 통과시키기 위해 기준값을 낮추거나 검증을 삭제해서는 안 된다.
- “수동 확인 예정”, “브라우저에서 대충 확인”, “나중에 E2E 추가”는 완료 근거가 아니다.
- 수동 검증이 필요한 항목은 재현 절차, 브라우저·뷰포트, 결과 캡처 또는 로그 경로를 남긴다.
- 다음 phase의 코드를 미리 작성했더라도 선행 phase가 미완료면 다음 phase를 완료 처리하지 않는다.

### 0.4 의존 순서

```text
M1 기반·도구 체인
  → M2 도메인 모델·스키마
  → M3 저장소·복구
  → M4 작성기 코어·자동 저장
  → M5 콘텐츠 블록·자산 파이프라인
  → M6 분기 엔진·그래프 검증
  → M7 리더 런타임·진행 상태
  → M8 JSON 가져오기·내보내기
  → M9 독립 실행형 HTML 내보내기
  → M10 Markdown 가져오기
  → M11 디자인 시스템·반응형·접근성·인쇄
  → M12 보안·성능·브라우저·CI·릴리스
```

병렬 구현이 기술적으로 가능하더라도 위 순서를 기본으로 한다. 특히 M2, M6, M9의 게이트가 깨진 상태에서는 뒤 phase를 진행하지 않는다.

### 0.5 `PROGRESS.md` 최소 구성

`PROGRESS.md`가 없으면 M1에서 만든다. 다음 형식을 유지한다.

```md
# HowSheet Progress

- 현재 phase: M{{n}} - {{이름}}
- 상태: NOT STARTED | IN PROGRESS | BLOCKED | DONE
- 마지막 갱신: YYYY-MM-DD HH:mm KST

## 직전에 끝낸 것

- ...

## 다음 할 일

1. ...
2. ...

## 미결 질문 / 차단 요소

- 없음

## 현재 실패 중인 게이트

- 명령:
- 결과:
- 재현:

## 결정 로그

| 날짜 | 결정 | 이유 | 영향 파일/phase | 승인 주체 |
| ---- | ---- | ---- | --------------- | --------- |

## 검증 로그

| 날짜 | 명령 | 결과 | 증거 경로 |
| ---- | ---- | ---- | --------- |
```

세션이 끊겨도 이 파일만 읽으면 같은 phase를 재개할 수 있어야 한다. 비밀값, 로컬 절대 경로, 개인 파일 내용은 기록하지 않는다.

### 0.6 변경 단위와 커밋 규칙

- 한 커밋은 하나의 목적만 가진다.
- 권장 메시지 형식:
  - `chore(m1): scaffold project and verification scripts`
  - `feat(m6): add deterministic branch graph validator`
  - `test(m9): cover offline standalone export`
  - `fix(m7): preserve latest reader progress revision`
- 기능 변경과 대규모 포맷 변경을 같은 커밋에 섞지 않는다.
- 의존성을 추가·교체할 때는 이유, 번들 영향, 라이선스, 대안 검토를 결정 로그에 남긴다.
- lockfile은 의존성 변경과 함께 커밋한다.
- 생성된 `dist/`, 테스트 비디오, 대용량 HTML, 임시 이미지, `.env`는 저장소 정책상 명시적으로 허용되지 않는 한 커밋하지 않는다.

### 0.7 하드 불변식

아래 불변식은 일반 DoD보다 우선한다. 1건이라도 위반되면 해당 phase와 이후 phase는 통과할 수 없다.

| ID     | 불변식                        | 통과 기준                                                                                                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| INV-01 | **MVP 로컬 우선**             | 핵심 작성·저장·리더·내보내기에 계정, 백엔드, 원격 DB가 필요하지 않음                                               |
| INV-02 | **독립 HTML 외부 요청 0건**   | 내보낸 샘플 HTML을 네트워크 차단 상태에서 열었을 때 텍스트·CSS·JS·이미지·분기·진행 기능이 유지되고 외부 요청이 0건 |
| INV-03 | **스키마 단일 기준**          | `GuideDocument` TypeScript 타입, Zod 스키마, 기본값, JSON 픽스처가 서로 모순되지 않음                              |
| INV-04 | **안정적 식별자**             | 참조는 항상 ID로 수행하고 `order`는 표시 순서에만 사용함. 재정렬로 ID가 바뀌지 않음                                |
| INV-05 | **잘못된 절차 내보내기 금지** | 누락된 분기 대상, 순환, 시작 단계 오류, 종료 단계 부재 등 `error`가 1건이라도 있으면 HTML 내보내기가 차단됨        |
| INV-06 | **MVP 순환 분기 금지**        | 순환 경로 1건도 허용하지 않으며, 탐지된 순환 경로를 사용자에게 단계명으로 표시함                                   |
| INV-07 | **사용자 콘텐츠 실행 금지**   | 제목, Markdown, 코드, 링크, 캡션, JSON의 XSS 페이로드 실행 0건                                                     |
| INV-08 | **데이터 유실 금지**          | 저장·가져오기·마이그레이션 실패가 마지막 성공 스냅샷이나 기존 문서를 덮어쓰지 않음                                 |
| INV-09 | **작성기–리더 정합성**        | 동일 `GuideDocument`와 진행 입력에서 미리보기와 내보낸 리더의 활성 경로, 단계 상태, 텍스트 의미가 동일함           |
| INV-10 | **개정별 진행 격리**          | 진행 키가 `howsheet:progress:{guideId}:r{revision}` 형식을 사용하며 다른 revision을 자동 덮어쓰거나 병합하지 않음  |
| INV-11 | **리더 런타임 경계**          | `reader-runtime`이 작성기 컴포넌트·스토리지 구현 세부·편집기 전용 라이브러리를 import하지 않음                     |
| INV-12 | **접근성 상태 의미 보존**     | 상태를 색만으로 표현하지 않고 모든 핵심 흐름을 키보드로 완료할 수 있음                                             |
| INV-13 | **모바일 실행성**             | 320px 이상에서 코드 블록 외 가로 스크롤이 없고 주요 터치 대상이 최소 44×44px임                                     |
| INV-14 | **인쇄 의미 보존**            | 인쇄에서 단계 번호, 경고, 코드, 링크 정보, 오류 해결 내용이 보존되고 인터랙션 전용 UI는 제거됨                     |
| INV-15 | **추적·광고·원격 폰트 금지**  | MVP 편집기와 내보낸 HTML에 분석, 광고, 원격 웹폰트, 자동 원격 이미지 다운로드가 없음                               |

### 0.8 MVP 비범위

다음 항목은 사용자 승인 없이 phase에 추가하지 않는다.

- 로그인, 계정, 공동 편집, 클라우드 동기화
- 공개 가이드 호스팅·검색·템플릿 마켓
- 익명 통계·행동 분석·피드백 수집
- QR 코드 서비스
- AI 자동 작성·자동 번역
- 서버 PDF 생성
- 임의 CSS 편집 또는 플러그인 실행
- 순환 분기·반복 루프
- 원격 이미지 자동 다운로드

향후 확장을 고려한 인터페이스 정의는 허용하지만, MVP 런타임·번들·UI에 기능을 노출하지 않는다.

### 0.9 표준 명령 계약

프로젝트는 `pnpm`을 사용한다. 아래 스크립트는 해당 phase에서 실제 검증을 수행하도록 구현하며, 빈 명령·항상 성공하는 placeholder·`|| true`를 두지 않는다.

| 명령                       | 역할                                         | 최초 필수 phase |
| -------------------------- | -------------------------------------------- | --------------: |
| `pnpm dev`                 | Vite 개발 서버                               |              M1 |
| `pnpm build`               | 편집기·리더 관련 프로덕션 빌드               |              M1 |
| `pnpm preview`             | 프로덕션 빌드 로컬 확인                      |              M1 |
| `pnpm format:check`        | Markdown·JSON·TS·CSS 포맷 검사               |              M1 |
| `pnpm lint`                | ESLint 및 접근성·import 경계 규칙            |              M1 |
| `pnpm typecheck`           | `tsc --noEmit`                               |              M1 |
| `pnpm test:unit`           | 순수 함수·도메인 단위 테스트                 |              M1 |
| `pnpm test:integration`    | 저장소·컴포넌트·파이프라인 통합 테스트       |              M3 |
| `pnpm test:coverage`       | 전체 커버리지와 핵심 모듈 임계치 검사        |              M6 |
| `pnpm test:e2e`            | Chromium·Firefox·WebKit E2E                  |              M7 |
| `pnpm test:a11y`           | axe 자동 검사와 키보드 시나리오              |             M11 |
| `pnpm test:security`       | XSS·URL·직렬화·악성 입력 회귀 테스트         |              M5 |
| `pnpm test:visual`         | 고정 뷰포트 시각 회귀 검사                   |             M11 |
| `pnpm verify:architecture` | 모듈 import 경계·금지 의존성 검사            |              M1 |
| `pnpm verify:fixtures`     | 샘플 가이드 스키마·그래프·자산 검증          |              M2 |
| `pnpm verify:bundle`       | 편집기·리더 번들 크기 예산 검사              |              M9 |
| `pnpm verify:offline`      | 내보낸 HTML 외부 요청 0건·오프라인 실행 검사 |              M9 |
| `pnpm verify:print`        | print media DOM·스타일·스크린샷 검사         |             M11 |
| `pnpm verify:release`      | 린트→타입→테스트→빌드→E2E→예산 전체 게이트   |             M12 |

검증 스크립트는 Windows, macOS, Linux에서 동일하게 실행되도록 Node.js 기반으로 작성한다. 셸 전용 `grep`, `sed`, `find`, `du`에 릴리스 판정을 의존하지 않는다.

### 0.10 기준 픽스처

M2부터 다음 픽스처를 유지한다. 파일명은 다르게 정할 수 있으나 역할과 테스트 범위는 줄이지 않는다.

```text
tests/fixtures/
├── valid-minimal.howsheet.json
├── valid-linear-5step.howsheet.json
├── valid-branched.howsheet.json
├── invalid-missing-target.howsheet.json
├── invalid-cycle.howsheet.json
├── invalid-unreachable.howsheet.json
├── invalid-no-terminal.howsheet.json
├── invalid-duplicate-priority.howsheet.json
├── xss-guide.howsheet.json
├── large-100-step.howsheet.json
├── assets/
│   ├── photo-large.jpg
│   ├── transparent-diagram.png
│   ├── duplicate-a.png
│   ├── duplicate-b.png
│   └── blocked.svg
└── markdown-samples/
    ├── complete-guide.md
    ├── ambiguous-headings.md
    ├── raw-html.md
    ├── local-images.md
    └── remote-images.md
```

픽스처는 테스트 안에서 임의 생성하는 데이터와 별도로 저장해 사람이 리뷰할 수 있어야 한다. 성능용 대용량 자산은 저장소 크기를 불필요하게 키우지 않도록 결정론적 생성 스크립트를 사용할 수 있다.

### 0.11 검증 증거 경로

수동·성능·시각 검증 결과는 다음 경계 안에 둔다.

```text
artifacts/qa/
├── phase-reports/     # 커밋함
├── screenshots/       # .gitignore, CI 아티팩트로 업로드
├── accessibility/     # .gitignore
├── performance/       # .gitignore
├── security/          # .gitignore
└── exports/           # .gitignore
```

CI 임시 산출물은 커밋하지 않아도 되지만, 실패 시 다운로드할 수 있게 업로드한다. 릴리스 후보의 최종 요약은 `artifacts/qa/phase-reports/release-candidate.md` 또는 동일 목적 문서에 남긴다.

`phase-reports/` 외의 디렉터리는 커밋하지 않으므로, 판정 근거가 되는 수치(M6 벤치마크 median, M9 번들 크기·export 측정치, axe 위반 수, M12 성능 수치·checksum)를 파일로만 남기지 말고 해당 보고서 본문에 적는다. (`File_Structure.md` §7 D-09)

---

## 1. Phase별 진입조건 · 할 일 · DoD · 검증

### M1 - 기반·도구 체인과 모듈 경계

- **진입조건**: 저장소 접근 가능. 기술·디자인 백서와 본 하네스 위치 확정.
- **할 일**:
  1. Vite + React + TypeScript + pnpm 스캐폴딩
  2. `src/app` → `src/domain` → `src/features` → `src/storage` → `src/store` → `src/reader-runtime` → `src/styles` 기본 디렉터리 생성
  3. ESLint, Prettier, Vitest, React Testing Library, Playwright 설정
  4. CSS Custom Properties 기반 토큰 파일과 최소 reset/global 스타일 생성
  5. `AGENTS.md`, 선택적 `CLAUDE.md`, `PROGRESS.md`, `README.md` 생성
  6. `verify:architecture`와 기본 CI 워크플로 작성
  7. 정확한 의존성 버전과 lockfile 고정
- **참조**: `File_Structure.md` §1~§5, §7, §9 / 기술 백서 §3, §7.8 / 디자인 백서 §3, §7.1
- **DoD**:
  1. 새 clone 기준 `pnpm install --frozen-lockfile`이 성공한다.
  2. `package.json`의 직접 의존성은 정확한 버전으로 고정되고 자동 major 범위가 없다.
  3. `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`가 모두 종료 코드 0이다.
  4. 최소 앱이 `/`에서 렌더링되고 브라우저 콘솔 error가 0건이다.
  5. `domain`이 React·Zustand·Dexie·DOM API를 import하면 검증이 실패한다.
  6. `reader-runtime`이 `components/editor`, `store/guide.store`, `storage/db`를 import하면 검증이 실패한다.
  7. CI가 로컬과 동일한 Node·pnpm 버전 및 핵심 명령을 사용한다.
  8. 외부 웹폰트·분석 스크립트·백엔드 SDK가 포함되지 않는다.
  9. `src/components/common/`, `src/lib/`, `src/hooks/`, `src/types/` 중 하나라도 존재하면 `verify:architecture`가 실패한다. (`File_Structure.md` §3.2-9, D-01)
  10. `reader-runtime`의 import 허용 목록(`domain/**`, `features/branching/**`, `features/sanitize/**`, `reader-runtime/**`)이 디렉터리 단위가 아니라 **모듈 단위**로 판정된다. `features/autosave` 등 비허용 모듈을 import하면 실패한다. 디렉터리 단위로 구현하면 M1은 통과하고 M9에서 막힌다. (`File_Structure.md` §3.2-3, D-04)
- **검증**:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm verify:architecture
pnpm build
pnpm exec playwright test tests/e2e/smoke.spec.ts --project=chromium
```

- **주의**:
  - M1에서 제품 기능을 과도하게 구현하지 않는다.
  - 전역 UI 프레임워크와 무거운 WYSIWYG 에디터를 추가하지 않는다.
  - 경계 검증을 주석이나 경로 예외로 무력화하지 않는다.

### M2 - 도메인 모델·Zod 스키마·기본 문서 ★

- **진입조건**: M1 전체 게이트 통과.
- **할 일**:
  1. `guide.types.ts`, `progress.types.ts`, `validation.types.ts` 구현
  2. `guide.schema.ts`에 `schemaVersion: "1.0"` 기준 Zod 스키마 구현
  3. 최소 유효 문서와 새 가이드 기본값 구현
  4. 필드 검증과 문서 구조 검증 이슈 코드 정의
  5. 스키마 버전 판정·마이그레이션 인터페이스 구현
  6. 기준 JSON 픽스처와 fixture validator 작성
- **참조**: 기술 백서 §2.2.4, §2.3 전체, §2.3.5, §7.6
- **DoD**:
  1. 최소 기본 문서가 제목 입력 전 임시 상태를 제외하면 하나의 시작 단계와 최소 하나의 종료 가능 경로를 가진다.
  2. TypeScript 타입으로 허용되는 정상 픽스처가 Zod 검증을 통과한다.
  3. 잘못된 제목 길이, URL, 이미지 MIME, 누락 ID, 잘못된 enum이 필드 경로와 이슈 코드로 보고된다.
  4. 동일 컬렉션 안의 중복 ID가 1건이라도 있으면 검증이 실패한다.
  5. `order` 변경은 ID와 참조를 변경하지 않는다.
  6. 현재보다 높은 major schema는 편집 가능한 문서로 자동 변환되지 않고 `UNSUPPORTED_SCHEMA_MAJOR`로 중단 또는 읽기 전용 판정된다.
  7. minor 호환 필드 추가가 기존 1.0 픽스처를 깨지 않는다.
  8. 모든 기준 픽스처의 기대 결과가 명시되고 `verify:fixtures`가 결정론적으로 같은 결과를 낸다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/domain
pnpm verify:fixtures
pnpm typecheck
pnpm verify:architecture
```

- **주의**:
  - 그래프 순환·도달 가능성의 완전한 검증은 M6에서 구현하되, M2 스키마가 잘못된 참조를 임의 수정해서는 안 된다.
  - `any`, 광범위한 type assertion, Zod 결과 우회로 타입–런타임 정합성을 위장하지 않는다.

### M3 - IndexedDB 저장소·복구 스냅샷·폴백 ★

- **진입조건**: M2 전체 게이트 통과.
- **할 일**:
  1. Dexie 기반 `guides`, `assets`, `recovery` 테이블 구현
  2. guide·asset·recovery repository와 LocalStorage wrapper 구현
  3. 가이드 CRUD, 복제, 트랜잭션 삭제, 마지막 성공 스냅샷 구현
  4. IndexedDB 불가 시 메모리 모드와 JSON 백업 가능 상태 구현
  5. 저장소 마이그레이션과 실패 롤백 테스트
- **참조**: 기술 백서 §2.1.1, §4.5, §4.6, §7.2, §7.5
- **DoD**:
  1. 가이드 생성→읽기→수정→삭제 CRUD 왕복 후 데이터가 정확히 일치한다.
  2. 가이드 삭제는 관련 asset을 동일 트랜잭션에서 삭제하며 고아 asset 0건이다.
  3. 트랜잭션 중 의도적 오류를 발생시켜도 마지막 성공 문서와 asset이 유지된다.
  4. 가져오기·대량 변경 전 recovery snapshot이 생성되고 복원 가능하다.
  5. IndexedDB 초기화 실패 시 앱이 crash하지 않고 메모리 모드로 진입한다.
  6. 폴백 상태에서 “새로고침 시 유실 가능” 안내와 JSON 백업 경로를 제공할 수 있는 상태가 노출된다.
  7. LocalStorage에는 테마·패널·진행 정보만 저장되며 비밀번호·복구 코드·원문 파일 경로가 저장되지 않는다.
  8. 저장소 테스트는 테스트 순서에 의존하지 않고 매 실행 격리된다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/storage tests/integration/storage
pnpm test:integration
pnpm typecheck
pnpm lint
```

- **주의**:
  - 텍스트 문서 수정마다 이미지 Blob 전체를 다시 쓰지 않는다.
  - migration 실패를 무시하고 빈 DB를 새로 만드는 방식으로 데이터 유실을 숨기지 않는다.

### M4 - 대시보드·작성기 코어·자동 저장

- **진입조건**: M3 전체 게이트 통과.
- **할 일**:
  1. 대시보드와 `/guide/:id/edit`, `/guide/:id/preview` 라우트 구성
  2. Guide Store와 UI Store 분리
  3. 제목·요약·대상·준비물·경고·단계 기본 편집기 구현
  4. 가이드 생성·이름 변경·복제·삭제 구현
  5. 단계 추가·삭제·재정렬과 안정적 ID 유지
  6. 500ms debounce 자동 저장과 저장 상태 UI 구현
  7. 오래된 저장 응답이 최신 상태를 `saved`로 덮어쓰지 않게 sequence/version guard 구현
- **참조**: 기술 백서 §2.1.4, FR-001~~FR-005, FR-017~~FR-019, §2.2.1, §4.1, §4.3.2 / 디자인 백서 §2.1.2~§2.1.4, §2.2.1, §2.4.1~§2.4.5
- **DoD**:
  1. 새 가이드를 만들면 첫 단계가 포함된 기본 문서가 편집 화면에서 열린다.
  2. 제목·대상·준비물·경고·5개 단계를 입력하고 새로고침해도 마지막 성공 저장 상태가 복원된다.
  3. 마지막 입력 후 자동 저장 예약은 500ms 목표, 1초 이내 하드 상한을 지킨다.
  4. 저장 중 추가 입력이 발생한 race fixture에서 오래된 응답이 최신 변경을 덮어쓰거나 `saved`로 오표시하지 않는다.
  5. 저장 실패 시 현재 메모리 편집 내용과 이전 성공 스냅샷이 모두 유지된다.
  6. 단계 재정렬 후 모든 step ID와 참조 가능 식별자가 유지되고 `order`만 정규화된다.
  7. 가이드 복제 시 문서 ID와 내부 충돌 가능 ID가 정책대로 새로 생성되고 원본은 변경되지 않는다.
  8. 저장 상태가 `저장 중 → 저장됨` 또는 `저장 실패`로 관찰 가능하며 스크린 리더에도 전달된다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/store tests/unit/autosave
pnpm exec vitest run tests/integration/editor-core
pnpm exec playwright test tests/e2e/editor-basic.spec.ts --project=chromium
pnpm lint
pnpm typecheck
```

- **주의**:
  - 폼 지역 상태와 영속 문서 상태를 무분별하게 중복해 동기화 race를 만들지 않는다.
  - 분기 참조가 있는 단계 삭제의 완전한 영향 처리는 M6에서 완료한다.

### M5 - 콘텐츠 블록 렌더러·Markdown 안전화·이미지 자산 ★

- **진입조건**: M4 전체 게이트 통과.
- **할 일**:
  1. text, code, link, image, checklist, decision, divider 블록 편집·렌더링
  2. raw HTML 비활성 Markdown AST 파서와 허용 노드 렌더러 구현
  3. DOMPurify 2차 살균과 URL 프로토콜 필터 구현
  4. 코드 복사와 Clipboard API 실패 폴백 구현
  5. 이미지 MIME·5MB·해상도·alt 검증 구현
  6. EXIF 방향, 긴 변 1920px 축소, 형식별 압축, checksum 중복 제거 구현
  7. Blob URL 수명 관리와 자산 재연결 UI 기반 구현
- **참조**: 기술 백서 FR-006, §2.2.3~§2.2.4, §4.4.3~§4.4.4, §7.1 / 디자인 백서 §4.3.6, §5.6, §5.9
- **DoD**:
  1. 모든 `ContentBlock` 판별 유니온이 exhaustive 처리되고 미지원 타입은 조용히 무시되지 않는다.
  2. `<script>`, `onerror`, `srcdoc`, `javascript:`, `data:text/html`, raw HTML 삽입 페이로드 실행 0건이다.
  3. 코드 블록 내용은 HTML로 해석되지 않고 텍스트로 보존된다.
  4. 링크는 `http:`와 `https:`만 허용하며 외부 새 탭 링크에 `noopener noreferrer`가 적용된다.
  5. SVG 업로드는 차단되고 PNG·JPEG·WebP·GIF만 정책대로 처리된다.
  6. 5MB 초과 원본은 저장 전에 차단되며, 장식용이 아닌 이미지의 빈 alt는 내보내기 오류가 된다.
  7. 긴 변 1920px 초과 정적 이미지가 최적화 후 상한 이하가 되고, 변환 결과가 더 크면 원본을 유지한다.
  8. 동일 checksum의 자산을 두 번 업로드해도 저장 Blob은 중복되지 않는다.
  9. 교체·삭제·unmount 후 생성한 Blob URL이 해제된다.
  10. Clipboard API 실패 시 사용자가 코드 전체를 선택·복사할 대체 동작을 사용할 수 있다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/content tests/unit/security tests/unit/assets
pnpm exec playwright test tests/e2e/content-blocks.spec.ts --project=chromium
pnpm test:security
pnpm typecheck
pnpm lint
```

- **주의**:
  - `dangerouslySetInnerHTML`은 살균된 Markdown 출력 경계 한 곳 외에는 금지한다.
  - 원격 이미지 URL을 자동으로 fetch해 내장하지 않는다.
  - 대용량 GIF를 자동 변환해 애니메이션 의미를 바꾸지 않는다.

### M6 - 분기 엔진·그래프 검증·활성 경로 ★

- **진입조건**: M5 전체 게이트 통과.
- **할 일**:
  1. 순수 함수 기반 `branch-engine.ts`, `graph-validator.ts`, `path-calculator.ts` 구현
  2. `priority` 오름차순 평가와 첫 일치 규칙 선택 구현
  3. 대상 누락, 중복 우선순위, 순환, 도달 불가, 종료 단계 부재 검출
  4. 활성 경로와 현재 경로 기준 진행률 계산
  5. 이전 분기 선택 변경 시 이후 경로 재계산과 `skipped` 상태 보존
  6. Branch Rule Editor, 경로 요약, Validation Panel 구현
  7. 참조 중인 단계 삭제의 대체 대상 선택 또는 규칙 삭제 흐름 구현
- **참조**: 기술 백서 FR-007~~FR-009, §2.2.2, §2.2.4, §4.3.4, §4.4.1~~§4.4.2 / 디자인 백서 §2.4.6, §4.3.4, §4.3.8
- **DoD**:
  1. 같은 문서·같은 답변 입력은 실행 횟수와 무관하게 동일 활성 경로를 반환한다.
  2. 규칙은 priority 오름차순으로 평가되고 첫 참 규칙만 선택된다.
  3. 일치 규칙이 없으면 `defaultNextStepId`, 그것도 없으면 완료 상태를 선택한다.
  4. 누락 대상, 순환, 시작 단계 오류, 종료 단계 부재는 모두 `error`이고 내보내기 가능 상태가 false다.
  5. 도달 불가 단계는 설계된 severity로 보고되며 해당 단계 ID·제목을 포함한다.
  6. cycle fixture의 순환 경로가 시작과 끝 노드를 포함한 읽을 수 있는 경로로 반환된다.
  7. 분기 선택 변경 후 변경 지점 뒤의 활성 경로가 다시 계산되며, 제외된 기존 완료 단계는 기록을 삭제하지 않고 `skipped`가 된다.
  8. 진행률 분모는 전체 단계가 아니라 활성 경로의 필수 단계 수다.
  9. 참조 중인 단계는 영향 처리 없이 삭제할 수 없다.
  10. 100단계 기준 그래프 검증은 30회 median 목표 100ms 이하, 하드 상한 300ms 이하이며 결과 보고서를 남긴다.
  11. 분기·그래프·진행률 핵심 모듈 statement/branch/function/line 커버리지가 각각 90% 이상이다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/branching tests/integration/branch-editor
pnpm test:coverage
pnpm verify:fixtures
pnpm exec node scripts/benchmark-graph-validation.mjs
pnpm typecheck
```

- **주의**:
  - 탐지를 어렵게 한다는 이유로 순환을 허용하거나 max iteration으로 숨기지 않는다.
  - UI에서 보이는 단계 번호로 참조하지 않는다.
  - 성능 수치를 맞추려고 검증 항목을 생략하지 않는다.

### M7 - 리더 런타임·진행 저장·완료 흐름 ★

- **진입조건**: M6 전체 게이트 통과.
- **할 일**:
  1. GuideIntro, PreparationChecklist, WarningGate, ReaderStep, DecisionOptions, TroubleshootingAccordion, CompletionScreen 구현
  2. 작성기와 독립된 reader state·renderer·storage 구현
  3. `ReaderProgress` 생성, 이어하기, 처음부터, 초기화 구현
  4. 체크·분기 변경 후 100ms debounce 진행 저장
  5. revision별 진행 격리와 다른 탭 `storage` 이벤트 동기화
  6. 저장 실패 세션 메모리 폴백과 지속 배너 구현
  7. 단계 이동 후 제목 포커스·진행률·완료 화면 구현
- **참조**: 기술 백서 FR-007~~FR-011, §2.2.2, §2.3.3, §4.3.7 / 디자인 백서 §2.1.5, §2.2.2, §2.4.10~~§2.4.12, §4.4.2~§4.4.3
- **DoD**:
  1. 준비물과 필수 경고를 모두 확인하기 전에는 첫 단계 진입 CTA가 활성화되지 않는다.
  2. 성공 조건이 필요한 단계는 체크 또는 필수 선택 완료 전 다음 단계로 진행할 수 없다.
  3. 선형·분기 픽스처 모두에서 시작→진행→오류 해결→완료 흐름이 끝까지 동작한다.
  4. 체크·분기 변경 후 저장은 목표 100ms, 최대 250ms 이내 예약된다.
  5. 새로고침 후 current step, active path, 체크, 선택, 경고 확인 상태가 복원된다.
  6. 다른 revision은 기존 진행을 덮어쓰지 않고 이어쓰기 또는 새 버전 시작 선택을 제공한다.
  7. LocalStorage 쓰기 실패 시 세션 동안 진행은 유지되고 “페이지를 닫으면 사라질 수 있음” 배너가 지속된다.
  8. 같은 guide/revision의 다른 탭 변경은 무한 ping-pong 없이 최신 상태를 반영한다.
  9. 단계 이동 후 논리적 제목에 포커스가 이동하고 키보드만으로 전체 흐름을 완료할 수 있다.
  10. `verify:architecture`에서 reader-runtime의 편집기 전용 import가 0건이다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/reader tests/integration/reader
pnpm exec playwright test tests/e2e/reader-linear.spec.ts tests/e2e/reader-branch.spec.ts
pnpm exec playwright test tests/e2e/reader-storage.spec.ts --project=chromium
pnpm verify:architecture
pnpm typecheck
```

- **주의**:
  - `file://`에서 LocalStorage·Clipboard 지원 차이를 기능 감지하지 않고 성공으로 가정하지 않는다.
  - 비활성 경로 기록을 삭제해 사용자의 이전 작업을 유실하지 않는다.

### M8 - HowSheet JSON 가져오기·내보내기·마이그레이션

- **진입조건**: M7 전체 게이트 통과.
- **할 일**:
  1. `.howsheet.json` exporter와 importer 구현
  2. 자산 Data URL 또는 자산 맵 직렬화·복원 구현
  3. 안전한 파일명과 revision suffix 구현
  4. path-aware 오류 보고와 원본 불변 import transaction 구현
  5. schema major/minor 판정 및 복사본 기반 migration 구현
  6. canonical normalization과 round-trip parity 테스트 구현
- **참조**: 기술 백서 FR-012, §2.3.5, §2.4.1, §4.3.5, §4.4.5, §4.6
- **DoD**:
  1. 정상 JSON export→import→정규화 후 `GuideDocument`와 자산 checksum이 원본과 동일하다.
  2. 두 번째 export가 비결정적 key 순서나 무작위 데이터 때문에 불필요하게 달라지지 않는다. 시간 필드는 명시된 정규화 정책을 따른다.
  3. 손상 JSON, 잘못된 필드, 누락 asset은 경로·오류 코드·사용자 행동을 포함해 보고된다.
  4. import 실패가 현재 열려 있는 문서나 기존 DB 레코드를 변경하지 않는다.
  5. migration 전 원본 복사본이 생성되고 migration 실패 시 원본으로 돌아갈 수 있다.
  6. higher major schema는 편집 상태로 조용히 강등되지 않는다.
  7. 파일명에서 OS 금지 문자 제거, 80자 상한, 빈 이름 fallback, `.r{revision}.howsheet.json` suffix가 적용된다.
  8. 동일 자산이 여러 블록에서 사용돼도 내보낸 자산 데이터가 불필요하게 중복되지 않는다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/import-json tests/unit/export-json tests/integration/json-roundtrip
pnpm verify:fixtures
pnpm test:security
pnpm typecheck
```

- **주의**:
  - import 오류를 자동 수정해 사용자가 원본 문제를 모르게 하지 않는다.
  - schema major를 올리는 변경은 §3 STOP 대상이다.

### M9 - 독립 실행형 HTML 내보내기 ★

- **진입조건**: M8 전체 게이트 통과.
- **할 일**:
  1. reader CSS·runtime 별도 프로덕션 번들 생성
  2. full validation → sanitization → asset inlining → safe serialization → template injection 파이프라인 구현
  3. `application/json` 데이터 스크립트와 `<`, `>`, `&`, U+2028, U+2029 이스케이프 구현
  4. CSP nonce 또는 동등한 인라인 스크립트 경계 구현
  5. 예상 크기 계산, 20MB 경고, 30MB 기본 차단 구현
  6. `file://`와 정적 서버 실행 E2E, 네트워크 0건 검사 구현
  7. 미리보기–내보낸 리더 의미 정합성 테스트 구현
- **참조**: 기술 백서 FR-013, §2.2.4, §2.4.1~§2.4.3, §4.3.6, §7.1, §7.5 / 디자인 백서 §2.4.8~§2.4.9
- **DoD**:
  1. 결과가 단일 `.html` 파일이며 외부 `<script src>`, stylesheet, font, image, API 요청이 없다.
  2. 네트워크를 완전히 차단한 Chromium·Firefox·WebKit에서 텍스트, 이미지, 분기, 체크, 진행, 테마가 동작한다.
  3. `file://` 실행에서 지원 가능한 기능이 동작하고 제한 기능은 명시적 폴백 메시지를 표시한다.
  4. `</script>`, U+2028, U+2029, HTML 태그가 포함된 제목·본문·코드·JSON을 내장해도 데이터 태그를 탈출하거나 스크립트를 실행하지 않는다.
  5. export 전 full validation error가 1건이라도 있으면 다운로드가 시작되지 않는다.
  6. 모든 자산 manifest 항목이 실제 Data URL과 checksum으로 연결되고 누락 자산 0건이다.
  7. 예상 크기 20MB 초과는 경고, 30MB 초과는 기본 설정에서 차단된다.
  8. 20MB 샘플 export는 목표 3초, 하드 상한 8초 안에 완료되며 측정 환경과 결과를 기록한다.
  9. 리더 초기 렌더링은 목표 1초, 하드 상한 2초를 만족한다.
  10. 미리보기와 내보낸 HTML이 같은 입력에 대해 동일 active path, step status, completion 결과를 반환한다.
  11. 초기 편집기 JavaScript gzip 크기는 목표 300KB, 최대 500KB를 넘지 않으며 reader bundle은 별도 보고된다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/export-html tests/integration/export-html
pnpm exec playwright test tests/e2e/standalone-export.spec.ts
pnpm verify:offline
pnpm verify:bundle
pnpm test:security
pnpm build
```

- **주의**:
  - JSON을 JavaScript 객체 리터럴로 문자열 결합해 삽입하지 않는다.
  - CDN, 웹폰트, 원격 아이콘을 “편의상” 남기지 않는다.
  - 편집기 전체 번들을 HTML에 넣어 크기 예산을 맞추지 못하는 구조를 허용하지 않는다.

### M10 - Markdown 가져오기·매핑 검토

- **진입조건**: M9 전체 게이트 통과.
- **할 일**:
  1. UTF-8 decode → unified/remark AST → section classifier → block mapper 구현
  2. 제목, 요약, 대상, 준비물, 경고, 단계, 코드, 이미지, 링크, 오류, 체크리스트 규칙 매핑
  3. `mapped`, `needsReview`, `unmapped` 상태 구현
  4. mapping review UI와 새 GuideDocument 생성 흐름 구현
  5. raw HTML 일반 텍스트 처리, 로컬 이미지 누락, 원격 이미지 비다운로드 처리
  6. 원문 보존·복구 메타데이터와 실패 불변성 구현
- **참조**: 기술 백서 FR-016, §2.2.5, §4.3.3 / 디자인 백서 §2.4.7, §5.6.4
- **DoD**:
  1. 첫 H1, H2 이전 문단, 대상, 준비물, GitHub-style WARNING/CAUTION, 일반 H2 단계 후보가 규칙표대로 매핑된다.
  2. fenced code는 code block, 단독 링크는 link block, 이미지 문법은 image 후보, 체크리스트는 준비물 또는 성공 기준 후보로 분류된다.
  3. 다중 해석이 가능한 heading·checklist는 `needsReview`이며 사용자 확인 없이 확정 import되지 않는다.
  4. 구조화하지 못한 내용은 `unmapped`로 보존되고 조용히 삭제되지 않는다.
  5. raw HTML은 실행되지 않고 일반 텍스트 또는 안전한 Markdown으로 보존된다.
  6. 원격 이미지를 fetch하지 않고 링크 또는 수동 업로드 대상으로 표시한다.
  7. 로컬 상대 이미지 경로는 누락 자산으로 표시되고 사용자에게 재연결 위치를 제공한다.
  8. import 취소·검증 실패가 현재 문서를 변경하지 않는다.
  9. parser와 mapper는 네트워크·AI API를 호출하지 않으며 동일 입력에 동일 결과를 낸다.
  10. 기준 Markdown 픽스처의 expected mapping snapshot이 모두 통과한다.
- **검증**:

```bash
pnpm exec vitest run tests/unit/import-markdown tests/integration/markdown-review
pnpm exec playwright test tests/e2e/markdown-import.spec.ts --project=chromium
pnpm test:security
pnpm typecheck
```

- **주의**:
  - 규칙 기반 가져오기를 AI 이해처럼 과장하지 않는다.
  - 애매한 구조를 임의 분기로 생성하지 않는다.

### M11 - 디자인 시스템·반응형·접근성·인쇄 ★

- **진입조건**: M10 전체 게이트 통과.
- **할 일**:
  1. Light·Dark·Print 토큰과 시스템 폰트 스택 확정
  2. Button, Field, Dialog, Toast, ProgressBar, StepCard 등 공통 컴포넌트 상태 구현
  3. 1024px 이상 3열 작성기, 태블릿 드로어, 모바일 단일 편집 열 구현
  4. 단일 열 리더, sticky header/action bar, 현재 단계 우선 시각 계층 구현
  5. 키보드 재정렬, 모달 포커스, skip link, live region 구현
  6. 320·390·768·1024·1440px 시각 회귀 픽스처 구현
  7. print media 변환, A4 세로, 라이트 강제, 인터랙션 UI 제거 구현
  8. reduced motion, forced colors, high contrast, 200·400% zoom 검증
- **참조**: 디자인 백서 §1.4, §2 전체, §4.1~§4.3, §5 전체, §7.1~§7.7 / 기술 백서 §5, §7.4~§7.5
- **DoD**:
  1. `tokens.css`의 Light·Dark 핵심 색상, 시스템 폰트, 4px 간격 스케일, radius 값이 디자인 백서의 토큰 계약과 일치하고 자동 token contract test를 통과한다.
  2. 320px~1920px에서 코드 블록 외 가로 스크롤이 0건이다.
  3. 모바일 주요 CTA, 아이콘 버튼, 체크·라디오 라벨 행이 최소 44px 터치 영역을 가진다.
  4. 본문 기본 글자 크기가 16px 미만이 아니며 긴 한국어·영문·URL·코드가 레이아웃을 깨지 않는다.
  5. Light·Dark·System 전환이 새로고침 없이 동작하고 초기 테마 flash가 관찰되지 않는다.
  6. 위험·경고·정보·성공 상태가 색상 외 아이콘과 텍스트로도 구분된다.
  7. 현재 단계 완료 전에는 성공 확인이 다음 이동보다 우선되고, 비활성 이유가 보인다.
  8. 모든 입력에 영구 라벨이 있고 오류 메시지가 필드와 프로그램적으로 연결된다.
  9. 키보드만으로 대시보드→작성→재정렬→미리보기→내보내기와 리더 완료 흐름을 수행한다.
  10. 모달·드로어 포커스가 내부에 갇히고 닫은 뒤 트리거로 복귀한다.
  11. axe critical·serious 오류가 주요 화면에서 0건이다.
  12. 200% 확대에서 핵심 기능 손실이 없고, 400% 확대에서 리더 핵심 흐름을 완료할 수 있다.
  13. `prefers-reduced-motion`에서 필수 정보가 애니메이션에 의존하지 않는다.
  14. print media에서 버튼·토스트·테마 전환이 숨겨지고 단계·경고·코드·링크·오류 해결이 보존된다.
  15. 경고 제목과 본문이 불필요하게 다른 인쇄 페이지로 분리되지 않는다.
  16. 고정 Chromium CI 환경에서 작성기 미리보기와 standalone reader 핵심 컴포넌트의 `maxDiffPixelRatio`가 0.01 이하이다.
- **검증**:

```bash
pnpm test:a11y
pnpm test:visual
pnpm verify:print
pnpm exec playwright test tests/e2e/responsive.spec.ts tests/e2e/keyboard.spec.ts
pnpm exec playwright test tests/e2e/theme.spec.ts tests/e2e/zoom.spec.ts --project=chromium
pnpm lint
pnpm build
```

- **주의**:
  - 카드 중첩을 늘려 리더를 대시보드처럼 만들지 않는다.
  - 빨간색을 일반 주의나 단순 검증 메시지에 남용하지 않는다.
  - 드래그만 제공하고 키보드 이동을 누락하지 않는다.
  - 인쇄 결과를 단순 화면 캡처로 대체하지 않는다.

### M12 - 보안·성능·브라우저·CI·릴리스 ★

- **진입조건**: M11 전체 게이트 통과. Must 기능 구현 완료.
- **할 일**:
  1. 전체 XSS·악성 URL·직렬화·대용량 입력 회귀 테스트 정리
  2. 번들, LCP, 입력 반응, 저장, 그래프, export, reader render 성능 측정
  3. Chromium·Firefox·WebKit 전체 E2E와 `file://` 예외 동작 검증
  4. CI에서 lint→typecheck→unit→integration→coverage→build→E2E→a11y→security→offline 순서 고정
  5. 샘플 JSON·standalone HTML·체크섬·릴리스 노트 생성
  6. README의 개발, 빌드, 배포, 데이터 삭제, 브라우저 제한 문서화
  7. 릴리스 후보 수동 시연과 최종 보고서 작성
- **참조**: 기술 백서 §1.4, §2.4.2~§2.4.3, §7 전체 / 디자인 백서 §7.5~§7.7
- **DoD**:
  1. FR-001~FR-015 Must 요구사항이 모두 구현되고 요구사항–테스트 추적표가 존재한다.
  2. 대표 XSS, 이벤트 핸들러, `javascript:`, `data:text/html`, 악성 SVG, `</script>` 페이로드 실행 0건이다.
  3. 핵심 분기·가져오기·내보내기 순수 함수 커버리지가 90% 이상이다.
  4. 전체 코드의 statement, branch, function, line 커버리지가 각각 80% 이상이다.
  5. Chromium·Firefox·WebKit E2E가 모두 통과한다.
  6. axe critical·serious 오류 0건과 수동 키보드·스크린 리더 핵심 흐름 통과 기록이 있다.
  7. 편집기 LCP 최대 2.5초, 폼 입력 반응 최대 100ms, 100단계 검증 최대 300ms, 20MB export 최대 8초, reader render 최대 2초, 진행 저장 최대 250ms를 넘지 않는다.
  8. 편집기 초기 JavaScript gzip 최대 500KB를 넘지 않는다.
  9. 샘플 standalone HTML의 외부 요청은 0건이며 네트워크 차단 상태에서 전체 흐름이 동작한다.
  10. 20MB 이하 샘플 export·재실행·진행 복원·인쇄가 통과한다.
  11. 저장소 불가, quota 초과, 손상 JSON, 누락 asset, clipboard 실패, print popup 차단의 사용자 메시지를 확인한다.
  12. CI는 clean checkout에서 `pnpm verify:release` 하나로 전체 게이트를 재현한다.
  13. README에 로컬 개발, 빌드, 정적 배포, JSON 백업, 가이드별 삭제, 전체 데이터 초기화, 브라우저 제한이 문서화된다.
  14. 릴리스 후보 보고서에 커밋 SHA, 환경, 명령, 성능 수치, 알려진 제한, 샘플 산출물 checksum이 기록된다.
- **검증**:

```bash
pnpm install --frozen-lockfile
pnpm verify:release
```

`verify:release`는 최소한 다음과 동등해야 한다.

```text
format:check
→ lint
→ typecheck
→ test:unit
→ test:integration
→ test:coverage
→ build
→ verify:architecture
→ verify:fixtures
→ test:security
→ test:a11y
→ test:e2e
→ test:visual
→ verify:offline
→ verify:print
→ verify:bundle
```

- **주의**:
  - 릴리스 직전에 실패한 게이트를 제외 목록에 넣지 않는다.
  - 브라우저 한 곳의 통과를 전체 지원 브라우저 통과로 간주하지 않는다.
  - 성능 수치를 평균 하나로 숨기지 말고 측정 환경, median 또는 percentile, 최대값을 함께 기록한다.

---

## 2. 런북 - 증상 → 흔한 원인 → 조치

프로젝트 고유 이슈를 처음 겪으면 `PROGRESS.md`에 재현과 임시 조치를 기록한다. 같은 유형이 반복되면 이 표에 일반화해 추가한다.

|   # | 증상                                     | 흔한 원인                                                              | 조치                                                                                                      |
| --: | ---------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
|   1 | `pnpm install --frozen-lockfile` 실패    | Node/pnpm 버전 불일치, lockfile·manifest 불일치, registry 문제         | Corepack과 고정 버전 확인 → manifest와 lockfile 차이 확인 → 승인된 의존성 변경인 경우에만 lockfile 재생성 |
|   2 | 빌드 또는 타입체크 실패                  | 판별 유니온 누락, path alias 오류, circular import, 설정 드리프트      | 최초 오류부터 수정 → `typecheck` 재실행 → `verify:architecture`로 경계 확인                               |
|   3 | 테스트가 실행마다 다르게 실패            | 시간, UUID, 테스트 DB, 순서, 비동기 저장 race 미격리                   | fake timer·고정 UUID·DB 초기화·deferred promise 사용 → 시드와 환경 기록                                   |
|   4 | 자동 저장이 최신 입력을 되돌림           | 오래된 비동기 저장 응답이 최신 snapshot을 성공 처리                    | save sequence/version 비교 → 오래된 응답 무시 → race 회귀 테스트 추가                                     |
|   5 | 새로고침 후 이미지가 사라짐              | Blob URL만 저장, asset transaction 누락, guide–asset 연결 오류         | Blob을 IndexedDB에 저장했는지 확인 → manifest/asset checksum 왕복 검사 → 고아 asset 테스트 실행           |
|   6 | IndexedDB를 열 수 없음                   | Safari privacy mode, quota, 손상 schema, 권한 제한                     | 기능 감지 → 메모리 모드 → 지속 배너와 JSON 백업 제공 → 원본 DB 강제 삭제 금지                             |
|   7 | 가이드 삭제 후 저장 용량이 줄지 않음     | 관련 asset·recovery가 트랜잭션에서 삭제되지 않음                       | guideId 기준 참조 검색 → 원자적 삭제 → 고아 레코드 검증 스크립트 실행                                     |
|   8 | 분기 결과가 예상과 다름                  | priority 정렬 오류, sourceBlockId/value 정규화 차이, default 처리 오류 | 고정 입력에서 평가 순서 로그 → 첫 참 규칙 확인 → 편집기·리더 동일 엔진 사용 확인                          |
|   9 | 순환이 있는데 검증 통과                  | DFS visiting/visited 처리 오류, 일부 edge 누락                         | branch와 default edge 모두 그래프에 포함 → cycle fixture 최소화 → 경로 반환 테스트 추가                   |
|  10 | 유효한 가이드가 내보내기 차단            | warning을 error로 승격, stale validation issue, asset 상태 미갱신      | issue code와 severity 확인 → 문서 snapshot 기준 재검증 → UI 캐시가 아닌 validator 결과 사용               |
|  11 | 잘못된 가이드가 내보내짐                 | partial validation만 실행, UI 상태를 직접 export, error 무시           | exporter 입구에서 full validation 강제 → error 존재 시 Blob 생성 함수 호출 금지                           |
|  12 | JSON round-trip 후 내용이 달라짐         | 기본값 자동 삽입, 날짜 갱신, key/order 정규화 불일치, asset 중복       | canonical normalize 정책 확인 → 구조 diff 출력 → 원본을 임의 수정하지 않도록 importer transaction 점검    |
|  13 | standalone HTML이 빈 화면                | embedded JSON 조기 종료, reader bundle 예외, root mount 실패           | 브라우저 콘솔·데이터 script textContent 확인 → `</script>` fixture 실행 → standalone smoke test 재현      |
|  14 | standalone HTML이 네트워크를 요청함      | CDN 아이콘·폰트, 원격 이미지, source map, API 코드 잔존                | request log에서 URL 분류 → 모든 자산 inline → 원격 이미지 자동 fetch 제거 → offline gate 강화             |
|  15 | `file://`에서 복사·진행 저장이 안 됨     | Clipboard/LocalStorage의 보안 컨텍스트·브라우저 차이                   | 기능 감지 → 선택 기반 복사 폴백 → 세션 메모리와 제한 배너 → 정적 서버 사용 안내                           |
|  16 | HTML 크기가 급증함                       | Base64 증가, 이미지 중복, 편집기 번들 포함, 웹폰트 포함                | checksum dedupe → 이미지 최적화 → reader-only bundle 확인 → 20/30MB 정책 적용                             |
|  17 | 미리보기와 export 결과가 다름            | 서로 다른 renderer/branch engine/token, export 시 별도 normalize       | 공통 순수 엔진으로 통합 → 동일 fixture DOM·state diff → parity 테스트를 선행 게이트로 복구                |
|  18 | Markdown 단계가 과도하게 생성됨          | 모든 H2를 확정 단계로 처리, 문맥 검토 누락                             | ambiguous heading을 `needsReview`로 변경 → mapping snapshot 수정 → 자동 확정 범위 축소                    |
|  19 | Markdown 이미지가 import 중 다운로드됨   | parser 단계에서 원격 URL fetch                                         | 네트워크 호출 제거 → link/manual upload 후보로 변환 → request interception 테스트 추가                    |
|  20 | 모바일에서 가로 스크롤 발생              | fixed width, 긴 URL·파일명, nested card, `100vw`와 scrollbar 충돌      | offending element 측정 → `min-width: 0`, `overflow-wrap`, container width 수정 → 320px 회귀 snapshot 추가 |
|  21 | sticky header와 action bar가 내용을 가림 | safe area, dynamic viewport, padding 보정 누락                         | `100dvh` + fallback → top/bottom inset 반영 → 짧은 높이 뷰포트 테스트                                     |
|  22 | 키보드 포커스가 모달 뒤로 빠짐           | focus trap·return focus 누락, portal 순서 오류                         | dialog primitive 점검 → 최초/복귀 focus 테스트 → Escape·Tab E2E 추가                                      |
|  23 | axe는 통과하지만 사용이 어려움           | 자동 검사로 heading·focus·읽기 순서 문제를 놓침                        | 수동 키보드·스크린 리더 흐름 수행 → heading·live region·라벨 관계 기록                                    |
|  24 | 다크 모드 이미지가 보이지 않음           | 투명 도식과 어두운 배경 대비 부족                                      | 이미지 자체 반전 금지 → 중성/흰 이미지 surface 제공 → light/dark 미리보기 확인                            |
|  25 | 인쇄가 다크 배경이거나 버튼이 출력됨     | print token·`@media print` 우선순위 부족                               | print에서 color scheme와 surface 강제 → interactive selector 숨김 → print emulation snapshot 갱신         |
|  26 | WebKit에서만 저장·다운로드 실패          | Blob URL 수명, 다운로드 attribute, IndexedDB timing 차이               | 최소 재현 생성 → object URL 해제 시점 확인 → 브라우저별 폴백 추가 후 WebKit E2E 고정                      |
|  27 | 성능 테스트가 CI에서 불안정              | cold start, 공유 runner 편차, 단일 측정, 이미지 디코딩 변동            | warm-up → 반복 측정 → median/상한 분리 → 환경 기록. 기준을 임의 완화하지 말고 사용자 승인 요청            |
|  28 | `verify:release`가 로컬과 CI에서 다름    | Node/pnpm/browser 버전, timezone, locale, env 차이                     | 버전·timezone·locale 고정 → CI 명령을 로컬 스크립트로 공유 → 환경 diff 출력                               |

---

## 3. 멈춤 규칙 (STOP)

### 3.1 즉시 멈춰야 하는 상황

- 같은 실패를 서로 다른 합리적 방법으로 3회 시도해도 해결되지 않는다.
- INV-01~INV-15 중 하나를 깨야만 다음 작업이 가능해 보인다.
- M2 스키마 major 변경, M6 분기 의미 변경, M9 export 형식 변경이 필요하다.
- 백엔드, 로그인, 클라우드 저장, 원격 이미지 fetch, 서버 PDF 등 MVP 비범위 기능이 필요해 보인다.
- React·Zod·Dexie·sanitizer·Markdown parser 등 핵심 의존성의 교체 또는 major upgrade가 필요하다.
- 외부 서비스 약관, 라이선스, 보안 정책 위반 가능성이 있다.
- 브라우저 지원 범위를 축소하거나 `file://` 동작 기준을 낮춰야 통과할 수 있다.
- 데이터 유실, XSS 실행, 잘못된 분기 export, 외부 요청이 재현된다.
- 테스트·커버리지·성능·접근성 기준을 낮추고 싶은 충동이 든다.
- 사용자가 만든 미커밋 변경과 충돌해 덮어쓸 위험이 있다.
- 큰 파일 구조 변경이나 모듈 경계 변경이 필요하다.

### 3.2 멈출 때 절차

1. 더 이상 우회 코드를 추가하지 않는다.
2. `PROGRESS.md`에 다음을 기록한다.
   - 증상
   - 최소 재현 명령·입력
   - 기대 결과와 실제 결과
   - 시도한 방법과 결과
   - 현재 가설
   - 영향받는 불변식·phase·파일
   - 가능한 선택지와 각 위험
3. 가능하면 실패를 재현하는 테스트를 먼저 추가하되, 기존 동작을 임의로 바꾸지 않는다.
4. 사용자에게 아래 형식으로 보고하고 결정을 요청한다.

```md
## BLOCKED - M{{n}} / {{게이트}}

- 증상:
- 재현:
- 기대 / 실제:
- 시도 1:
- 시도 2:
- 시도 3:
- 관련 불변식:
- 선택지 A:
- 선택지 B:
- 권장안과 이유:
```

5. 결정 전까지 불변식을 깨는 임시 우회, 테스트 skip, 기준 하향을 커밋하지 않는다.

### 3.3 절대 금지

- 실패 테스트 삭제, `skip`, `only`, assertion 약화, 임계치 하향으로 통과 위장
- `|| true`, 무조건 `process.exit(0)`, 빈 verification script
- TypeScript 오류를 광범위한 `any`, `@ts-ignore`, assertion으로 은폐
- sanitizer를 우회하거나 raw HTML을 신뢰 입력으로 간주
- 잘못된 그래프를 “최대한 렌더링”한다는 이유로 export 허용
- 저장 실패 시 빈 문서·새 DB로 대체해 데이터 유실을 숨김
- 작성기와 reader에 분기 로직을 복제해 parity를 수동 유지
- 외부 CDN·웹폰트·분석 스크립트를 임시로 추가
- 사용자 승인 없이 스키마 major, 파일 형식, 모듈 경계, 지원 브라우저 변경
- `.env`, 토큰, 개인 경로, 대용량 임시 산출물 커밋
- 사용자의 기존 변경을 reset, checkout, force overwrite

---

## 4. 검증 우선순위

```text
하드 불변식·데이터 안전·보안
  > 도메인 스키마·분기 정확성
  > 저장·JSON·HTML 왕복 정합성
  > 리더 핵심 기능 실효
  > 작성기–리더 parity
  > 접근성·반응형·인쇄
  > 성능·번들·배포 편의
```

앞 단계가 깨지면 뒤 단계의 성공은 유효한 완료 근거가 아니다.

- XSS가 실행되면 시각 QA를 중단한다.
- 분기 그래프가 틀리면 리더 UX 작업을 중단한다.
- 저장·round-trip이 틀리면 export 기능 확장을 중단한다.
- standalone HTML이 외부 요청을 하면 배포를 중단한다.
- 작성기와 reader가 다른 결과를 내면 디자인 polish를 중단한다.

---

## 부록 A. phase 완료 보고서 템플릿

각 phase를 완료 처리할 때 `PROGRESS.md` 또는 `artifacts/qa/phase-reports/M{{n}}.md`에 작성한다.

````md
# M{{n}} - {{phase 이름}} 완료 보고서

- 커밋: {{SHA}}
- 실행 환경: Node {{version}}, pnpm {{version}}, OS {{version}}
- 완료일: {{YYYY-MM-DD}}

## 구현 범위

- ...

## DoD 결과

| DoD | 결과 | 증거               |
| --- | ---- | ------------------ |
| 1   | PASS | 명령/파일/스크린샷 |

## 실행 명령

```bash
...
```

## 성능·접근성·보안 수치

- ...

## 남은 경고

- 없음

## 다음 phase 진입조건 확인

- [ ] 선행 게이트 전부 PASS
- [ ] 미해결 불변식 위반 없음
- [ ] PROGRESS.md 갱신
````

## 부록 B. 요구사항–phase 추적표

| 요구사항                | 주 구현 phase | 최종 회귀 phase |
| ----------------------- | ------------: | --------------: |
| FR-001 가이드 CRUD      |         M3~M4 |             M12 |
| FR-002 메타 정보        |            M4 |         M11~M12 |
| FR-003 준비물           |            M4 |     M7, M11~M12 |
| FR-004 중요 경고        |            M4 |     M7, M11~M12 |
| FR-005 단계 카드        |            M4 |         M11~M12 |
| FR-006 코드·링크·이미지 |            M5 |     M9, M11~M12 |
| FR-007 성공 체크        |         M6~M7 |             M12 |
| FR-008 조건 분기        |            M6 |     M7, M9, M12 |
| FR-009 오류 해결        |         M5~M7 |         M11~M12 |
| FR-010 완료 화면        |            M7 |         M11~M12 |
| FR-011 진행 상태 저장   |            M7 |         M9, M12 |
| FR-012 JSON I/O         |            M8 |             M12 |
| FR-013 단일 HTML        |            M9 |         M11~M12 |
| FR-014 인쇄/PDF         |           M11 |             M12 |
| FR-015 테마             |       M7, M11 |             M12 |
| FR-016 Markdown import  |           M10 |             M12 |
| FR-017 자동 저장·복구   |         M3~M4 |             M12 |
| FR-018 키보드 재정렬    |       M4, M11 |             M12 |
| FR-019 검증 패널        |            M6 |         M11~M12 |
| FR-020 샘플 템플릿      | M12 또는 후속 |   M12 또는 후속 |

## 부록 C. 릴리스 후보 수동 시연 시나리오

자동 테스트 통과 후 한 번 수행한다. 자동 게이트를 대체하지 않는다.

1. clean browser profile에서 HowSheet를 연다.
2. 빈 문서로 제목, 대상, 준비물 2개, danger 경고 1개, 단계 5개를 만든다.
3. 텍스트, 명령어, 안전 링크, 이미지, 체크리스트, decision block을 각각 한 번 이상 넣는다.
4. 두 갈래 분기를 만들고 한 경로에 troubleshooting을 연결한다.
5. 저장 후 새로고침해 문서와 asset을 복원한다.
6. JSON으로 내보내고 새 문서로 다시 가져와 의미가 같은지 확인한다.
7. HTML로 내보내고 네트워크를 끈 뒤 `file://`와 정적 서버에서 연다.
8. 준비물·경고를 확인하고 한 분기를 완료한다.
9. 이전 선택을 바꿔 active path와 진행률이 바뀌는지 확인한다.
10. 페이지를 닫고 다시 열어 진행 상태를 이어간다.
11. Light·Dark·System, 320px·390px·1024px를 확인한다.
12. 키보드만으로 주요 흐름을 다시 수행한다.
13. 인쇄 미리보기에서 인터랙션 UI 제거와 단계·경고·코드·링크 보존을 확인한다.
14. 로컬 저장 실패와 clipboard 실패를 주입해 폴백 메시지를 확인한다.
15. 최종 샘플 파일 checksum과 결과를 릴리스 후보 보고서에 기록한다.

---

**최종 원칙**: HowSheet의 완료는 “가이드를 만들 수 있다”가 아니라, **구조적으로 올바른 가이드를 데이터 유실 없이 만들고, 악성 입력을 실행하지 않으며, 작성기에서 확인한 절차를 외부 요청 없는 하나의 HTML로 동일하게 전달하고, 모바일·키보드·인쇄 환경에서 끝까지 수행할 수 있음이 재현 가능한 게이트로 증명된 상태**다.
