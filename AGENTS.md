# AGENTS.md - HowSheet 전역 규칙

이 파일은 저장소에서 작업하는 모든 코딩 에이전트의 전역 규칙이다. 상세 절차는 `docs/HowSheet_Harness_KR.md`에 있다.

## 1. 세션 시작 절차

1. `PROGRESS.md`를 읽고 현재 phase, 다음 할 일, 미결 질문, 결정 로그를 확인한다.
2. `docs/HowSheet_Harness_KR.md` §1에서 해당 phase의 할 일·DoD·검증 명령을 읽는다.
3. `git status --short`로 기존 변경을 확인하고 사용자가 만든 변경을 덮어쓰지 않는다.
4. 한 번에 하나의 phase만 진행한다.

## 2. 기준 문서 우선순위

1. 사용자가 현재 대화에서 명시적으로 승인한 결정
2. 하네스의 하드 불변식(INV-01~15)과 STOP 규칙
3. `docs/HowSheet_기술_백서.md` - 기능·데이터·아키텍처·보안·성능·테스트
4. `docs/HowSheet_디자인_백서.md` - 레이아웃·시각 계층·반응형·접근성·UI 상태
5. `docs/File_Structure.md` - 파일 배치·디렉터리 책임·모듈 경계·명명 규칙 (구조 판단은 두 백서보다 우선)
6. `PROGRESS.md` 결정 로그
7. 현재 코드 - 문서와 다르면 코드가 드리프트 후보다

충돌을 발견하면 임의로 한쪽을 고르지 않는다. `PROGRESS.md`에 기록하고 하네스 §3 STOP 절차를 따른다.

## 3. 하드 불변식 요약

전문은 하네스 §0.7에 있다. 아래 15개 중 1건이라도 위반하면 해당 phase는 통과할 수 없다.

- MVP는 로컬 우선. 계정·백엔드·원격 DB 없이 작성·저장·리더·내보내기가 동작한다.
- 내보낸 독립 HTML의 외부 요청은 0건이다.
- `GuideDocument` 타입·Zod 스키마·기본값·픽스처가 서로 모순되지 않는다.
- 참조는 항상 ID로 하고 `order`는 표시 순서에만 쓴다.
- 검증 `error`가 1건이라도 있으면 HTML 내보내기를 차단한다.
- 순환 분기를 허용하지 않는다.
- 사용자 콘텐츠의 XSS 실행이 0건이다.
- 저장·가져오기·마이그레이션 실패가 마지막 성공 스냅샷을 덮어쓰지 않는다.
- 미리보기와 내보낸 리더의 활성 경로·단계 상태·텍스트 의미가 같다.
- 진행 키는 `howsheet:progress:{guideId}:r{revision}` 형식이다.
- `reader-runtime`이 작성기 컴포넌트·스토리지 구현 세부를 import하지 않는다.
- 상태를 색만으로 표현하지 않고 모든 핵심 흐름을 키보드로 완료할 수 있다.
- 320px 이상에서 코드 블록 외 가로 스크롤이 없고 터치 대상은 최소 44×44px다.
- 인쇄에서 단계·경고·코드·링크·오류 해결이 보존된다.
- 추적·광고·원격 폰트를 포함하지 않는다.

## 4. 모듈 경계

경계 정의는 `docs/File_Structure.md` §3이며 `pnpm verify:architecture`가 기계 검증한다.

- `domain`은 React·Zustand·Dexie·DOM API를 import하지 않는다.
- `reader-runtime`의 import 허용 목록은 `src/domain/**`, `src/features/branching/**`, `src/features/sanitize/**`, `src/reader-runtime/**` 네 곳뿐이다. **모듈 단위로** 판정한다.
- `src/components/common/`, `src/lib/`, `src/hooks/`, `src/types/`는 만들지 않는다.
- `dexie`와 `localStorage`는 `src/storage/` 안에서만 쓴다.
- `dangerouslySetInnerHTML`은 `src/components/content/MarkdownText/`에서만 쓴다.
- 경계 검증을 주석이나 경로 예외로 무력화하지 않는다.

## 5. 표준 명령

phase마다 요구되는 명령은 하네스 §0.9에 있다. 현재 구현된 명령:

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
pnpm verify:fixtures
```

빈 명령, 항상 성공하는 placeholder, `|| true`를 두지 않는다. 검증 스크립트는 Windows·macOS·Linux에서 동일하게 도는 Node 기반으로 작성한다.

## 6. 커밋 규칙

- 한 커밋은 하나의 목적만 갖는다.
- 형식: `type(mN): summary` - 예: `feat(m6): add deterministic branch graph validator`
- 의존성을 추가·교체하면 이유·번들 영향·라이선스·대안 검토를 `PROGRESS.md` 결정 로그에 남긴다.
- lockfile은 의존성 변경과 함께 커밋한다.
- `dist/`, 테스트 비디오, 대용량 HTML, 임시 이미지, `.env`는 커밋하지 않는다.
- `artifacts/qa/`는 `phase-reports/`만 커밋한다.

## 7. 절대 금지

- 사용자 승인 없이 스키마 major, 파일 형식, 모듈 경계, 지원 브라우저를 바꾸는 것
- 테스트를 통과시키려고 기준값을 낮추거나 검증을 삭제하는 것
- 릴리스 직전에 실패한 게이트를 제외 목록에 넣는 것
- 작성기와 리더에 분기 로직을 복제해 parity를 수동 유지하는 것
- CDN·웹폰트·분석 스크립트를 "편의상" 추가하는 것
- 빈 검증 스크립트나 무조건 `process.exit(0)`
