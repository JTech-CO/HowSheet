# HowSheet

누구나 만드는 단일 페이지 단계별 해결 가이드.

_A step-by-step guide to creating a single-page walkthrough that anyone can follow._

문제 해결 절차를 조건 분기가 있는 단계 카드로 작성하고, 외부 요청이 하나도 없는 **독립 실행형 HTML 한 개**로 내보낸다. 계정도 서버도 필요 없다. 작성한 내용은 브라우저를 벗어나지 않는다.

> 현재 상태: **M1 — 기반·도구 체인** 완료. 작성·리더·내보내기 기능은 아직 없다. 진행 상황은 [PROGRESS.md](PROGRESS.md)를 본다.

## 요구 사항

| 도구    | 버전                       | 고정 위치                        |
| ------- | -------------------------- | -------------------------------- |
| Node.js | **24.20.0 LTS** (`.nvmrc`) | `.nvmrc`, `package.json` engines |
| pnpm    | 11.5.3                     | `package.json` packageManager    |

> **Node 25.2.0을 쓰지 않는다.** 그 빌드는 비ASCII 경로에서 `fs.rm(recursive)`가 프로세스를 하드 크래시시킨다(Windows, `STATUS_STACK_BUFFER_OVERRUN`). `vite build`의 출력 디렉터리 정리가 이 호출을 쓰므로 `pnpm build`가 죽는다. `package.json`의 `engines`와 `.npmrc`의 `engine-strict=true`가 설치 단계에서 막는다. Node 24.20.0 LTS를 쓴다.

## 로컬 개발

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`http://localhost:5173`에서 열린다.

## 빌드와 미리보기

```bash
pnpm build
pnpm preview
```

하위 경로에 배포할 때는 base를 넘긴다.

```bash
VITE_BASE=/howsheet/ pnpm build
```

## 검증

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm verify:architecture
```

`verify:architecture`는 모듈 import 경계를 검사한다. 규칙은 [docs/File_Structure.md](docs/File_Structure.md) §3에 있고, 위반 시 종료 코드 1과 함께 파일·규칙·근거를 출력한다.

E2E는 브라우저를 먼저 받아야 한다.

```bash
pnpm exec playwright install chromium
pnpm exec playwright test tests/e2e/smoke.spec.ts --project=chromium
```

## 배포

정적 호스팅이면 어디든 된다 (GitHub Pages, Cloudflare Pages, Netlify 등). `dist/`를 그대로 올린다.

`BrowserRouter`를 쓰므로 중첩 경로(`/guide/:id/edit`)를 위해 **SPA 폴백**이 필요하다. `dist/index.html`을 `dist/404.html`로 복사하거나 호스트의 rewrite 규칙을 설정한다. `.github/workflows/deploy.yml`이 GitHub Pages용으로 이 처리를 한다.

## 데이터와 개인정보

- 작성 내용과 이미지는 브라우저의 **IndexedDB**에 저장된다.
- 테마·패널 설정과 리더 진행 상태는 **LocalStorage**에 저장된다.
- 분석 도구, 광고 스크립트, 원격 웹폰트를 포함하지 않는다. 내보낸 HTML은 네트워크 요청을 하지 않는다.
- 비밀번호, 복구 코드, 주민등록번호를 가이드 본문에 적지 않는다.

데이터 삭제는 M3 이후 앱 안에서 **가이드별 삭제**와 **전체 데이터 초기화**로 나뉘어 제공된다. 삭제 전 JSON 백업을 선택할 수 있다. 그전까지는 브라우저의 사이트 데이터 삭제로 전체를 지울 수 있다.

## 브라우저 지원과 알려진 제한

Chromium 계열, Firefox, Safari의 현대 버전을 지원한다. Internet Explorer와 JavaScript 비활성 환경은 지원하지 않는다.

- `file://`로 연 HTML의 LocalStorage 동작은 브라우저마다 다르다. 기능 감지 후 안내한다.
- Safari 개인 정보 보호 모드에서는 IndexedDB나 저장 용량이 제한될 수 있다.
- Clipboard API는 보안 컨텍스트가 아닌 로컬 파일에서 제한될 수 있어 선택 영역 폴백을 제공한다.
- 인쇄 결과는 브라우저와 운영체제의 여백·머리글 설정에 따라 달라진다.

## 문서

| 문서                                                         | 내용                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| [docs/HowSheet_기술_백서.md](docs/HowSheet_기술_백서.md)     | 기능, 데이터 모델, 아키텍처, 성능, 보안, 테스트 기준 |
| [docs/HowSheet_디자인_백서.md](docs/HowSheet_디자인_백서.md) | 화면, 컴포넌트, 반응형, 접근성, 디자인 토큰          |
| [docs/File_Structure.md](docs/File_Structure.md)             | 파일 배치, 디렉터리 책임, 모듈 경계, 명명 규칙       |
| [docs/HowSheet_Harness_KR.md](docs/HowSheet_Harness_KR.md)   | 구현 순서, phase DoD, 검증 명령, 하드 불변식         |
| [AGENTS.md](AGENTS.md)                                       | 코딩 에이전트 전역 규칙                              |
| [PROGRESS.md](PROGRESS.md)                                   | 현재 상태, 다음 할 일, 결정 로그                     |

## 기여

`AGENTS.md`의 세션 절차와 커밋 규칙을 따른다. phase를 끝낼 때는 하네스 §1의 해당 검증 블록을 그대로 실행하고 결과를 `PROGRESS.md`에 남긴다.

## 라이선스

MIT. [LICENSE](LICENSE)를 참조한다.
