# HowSheet

붙여넣은 자료로 **한 페이지 HTML을 만들 프롬프트**를 써 주는 생성기.

_Paste your material, pick what goes in it, and get a prompt that makes a single-page HTML document._

자료를 붙여넣고 담을 것(다이어그램·순서도·비교표 등 10종)과 보일 방식(색·톤·밀도·타이포)을 고르면, 그것을 상세한 프롬프트 한 장으로 만들어 준다. 그 프롬프트를 Claude나 ChatGPT에 붙여넣으면 결과 페이지가 나온다. **HowSheet의 결과물은 HTML이 아니라 프롬프트 텍스트다.** 계정도 서버도 없다.

프롬프트에는 네온 글로우·그라데이션 텍스트·장식용 이모지 제목 같은 "AI가 만든 티"를 막는 금지 조항과, 단일 HTML·외부 요청 0건·인쇄 가능·320px 대응이라는 결과물 요구사항이 언제나 들어간다.

> 현재 상태: **P8까지 완료. 아직 출시 전이다.** 배포 대상이 정해지지 않았고 남은 결함이 있다. 진행 상황은 [PROGRESS.md](PROGRESS.md), 남은 항목은 [artifacts/qa/phase-reports/](artifacts/qa/phase-reports/)를 본다.

## 두 가지 경로

| 경로        | 조건    | 무엇이 일어나는가                                          |
| ----------- | ------- | ---------------------------------------------------------- |
| 템플릿 조립 | 키 없음 | 규칙 기반으로 프롬프트를 조립한다. 오프라인에서도 동작한다 |
| AI 합성     | 키 있음 | Haiku가 자료에 맞게 다듬는다. 실패하면 템플릿으로 떨어진다 |

키가 없어도 제품이 동작한다. 키를 넣으면 프롬프트가 자료에 더 가깝게 구체화된다.

## 요구 사항

| 도구    | 버전                       | 고정 위치                        |
| ------- | -------------------------- | -------------------------------- |
| Node.js | **24.20.0 LTS** (`.nvmrc`) | `.nvmrc`, `package.json` engines |
| pnpm    | 11.5.3                     | `package.json` packageManager    |

> **Node 25.2.0을 쓰지 않는다.** 그 빌드는 비ASCII 경로에서 `fs.rm(recursive)`가 프로세스를 하드 크래시시킨다(Windows, `STATUS_STACK_BUFFER_OVERRUN`). `vite build`의 출력 디렉터리 정리가 이 호출을 쓰므로 `pnpm build`가 죽는다. `package.json`의 `engines`와 `.npmrc`의 `engine-strict=true`가 설치 단계에서 막는다.

## 로컬 개발

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`http://localhost:5173`에서 열린다.

`.gitattributes`가 생기기 전에 클론한 작업 트리라면 줄바꿈을 한 번 맞춘다. 그러지 않으면 `format:check`가 파일 전부를 실패로 센다.

```bash
git add --renormalize .
```

## 빌드와 미리보기

```bash
pnpm build
pnpm preview
```

`base`는 상대 경로(`./`)라 루트에서도 하위 경로(`/howsheet/`처럼 끝에 슬래시가 있는 주소)에서도 같은 산출물이 동작한다. 다르게 두려면 `VITE_BASE=/howsheet/ pnpm build`처럼 넘긴다.

## 검증

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:security
pnpm verify:dependencies
pnpm verify:architecture
pnpm eval:prompts
```

`verify:architecture`는 모듈 경계를 검사한다. 키를 만지는 모듈이 하나인지, `dangerouslySetInnerHTML`이 `src/components/content/MarkdownText/` 한 곳뿐인지, 저장소 API가 `src/storage/` 밖에서 쓰이지 않는지를 본다. 규칙은 [AGENTS.md](AGENTS.md) §4에 있다.

`eval:prompts`는 고정 자료 5종으로 프롬프트 8,780건을 만들어 금지 목록 위반·요소 반영·자료 충실도를 기계적으로 채점하고, 일부러 망가뜨린 프롬프트 81종이 전부 걸리는지 확인한다. 결과는 `artifacts/eval/`에 남는다.

E2E는 브라우저를 먼저 받는다. 웹서버 명령이 빌드부터 돌린다.

```bash
pnpm exec playwright install --with-deps
pnpm test:e2e
```

## 배포

**배포 대상이 아직 정해지지 않았다.** GitHub Pages 기본 도메인(`<계정>.github.io`)은 그 계정의 모든 Pages 사이트와 출처(origin)를 공유한다. 같은 출처의 어떤 스크립트든 이 앱이 `localStorage`에 둔 API 키를 읽을 수 있으므로, 키를 쓰는 배포에는 **전용 출처**(전용 도메인이나 프로젝트별 호스트)가 필요하다.

정적 호스팅이면 `dist/`를 그대로 올리면 된다. 라우터가 없어 SPA 폴백은 필요 없다. `.github/workflows/release-build.yml`은 전체 게이트를 돌려 산출물을 만들고 **올리지는 않는다.** 대상이 정해지면 그 워크플로에 업로드 단계를 붙인다.

## 데이터와 개인정보

- 붙여넣은 자료와 요소·디자인 선택은 브라우저의 **IndexedDB**(`howsheet` 데이터베이스)에 저장된다. 자동 저장이고 새로고침해도 남는다.
- 테마 설정은 **LocalStorage**(`howsheet:theme`), API 키도 **LocalStorage**(`howsheet:apiKey`)에 저장된다. 키는 저장 후 화면에 다시 보이지 않고 `sk-ant-...`와 뒤 4자리만 표시된다.
- 만든 프롬프트 이력은 저장하지 않는다. 새로고침하면 사라지므로 필요하면 복사하거나 `.md`로 내려받는다.
- **자료가 브라우저를 벗어나는 경우는 하나다.** 키를 저장한 상태에서 프롬프트를 만들면 자료가 `api.anthropic.com`으로 전송된다. 키가 없으면 어떤 요청도 나가지 않는다.
- 분석 도구, 광고 스크립트, 원격 웹폰트, CDN을 쓰지 않는다. 런타임 외부 요청은 위의 Anthropic 호출뿐이다.
- 지우는 방법: 자료는 화면의 **지우기**, 키는 설정의 **키 삭제**, 전부 지우려면 브라우저의 사이트 데이터 삭제를 쓴다.
- 비밀번호, 복구 코드, 주민등록번호 같은 것을 자료에 붙여넣지 않는다.

## API 키

Anthropic 문서는 브라우저에서 키를 쓰는 것을 위험하다고 명시하고, "신뢰된 사용자만 쓰는 내부 도구"를 예외로 둔다. HowSheet는 사용자가 자기 기기에서 자기 키로 자기 작업을 하는 도구라 그 예외에 해당한다. 그래도 값은 치른다.

- **HowSheet 전용 키를 새로 발급해 쓴다.** 다른 곳과 공유하지 않는 키여야 유출됐을 때 그 키만 폐기하면 된다.
- 공용 기기에서 쓰지 않는다. 키는 그 브라우저에 남는다.
- 키는 `api.anthropic.com` 외 어디로도 나가지 않는다. 로그·오류 메시지·분석에 싣지 않는다.
- 키가 의심스러우면 Anthropic 콘솔에서 폐기하고 새로 발급한다.

## 브라우저 지원과 알려진 제한

Chromium 계열, Firefox, Safari의 현대 버전을 지원한다. Internet Explorer와 자바스크립트 비활성 환경은 지원하지 않는다.

- 사생활 보호 모드나 저장소가 막힌 환경에서는 메모리에만 담고 그 사실을 화면에 알린다. 탭을 닫으면 사라진다.
- Clipboard API가 막히면 프롬프트 전문을 선택 상태로 만들어 직접 복사할 수 있게 한다.
- 인쇄 결과는 브라우저와 운영체제의 여백·머리글 설정에 따라 달라진다.
- 인용이나 목록이 아주 깊게 겹친 자료는 미리보기로 바꾸지 못한다. 그때는 안내가 뜨고 원문 보기로 읽을 수 있다.

## 문서

| 문서                                                                             | 내용                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------------- |
| [docs/HowSheet_v2_제품정의.md](docs/HowSheet_v2_제품정의.md)                     | 제품 범위, 화면, 요소, 디자인 축, 키 취급, 불변식   |
| [docs/HowSheet_v2_Harness_KR.md](docs/HowSheet_v2_Harness_KR.md)                 | phase별 할 일, DoD, 검증 명령, 금지                 |
| [docs/HowSheet_v2_평가_AI채점_가이드.md](docs/HowSheet_v2_평가_AI채점_가이드.md) | 프롬프트 채점에 AI를 붙이는 조건                    |
| [AGENTS.md](AGENTS.md)                                                           | 코딩 에이전트 전역 규칙과 모듈 경계                 |
| [PROGRESS.md](PROGRESS.md)                                                       | 현재 상태, 다음 할 일, 결정 로그                    |
| [docs/archive/v1/](docs/archive/v1/)                                             | v1(절차 문서 저작 도구) 문서. 더 이상 유효하지 않다 |

## 기여

`AGENTS.md`의 세션 절차와 커밋 규칙을 따른다. phase를 끝낼 때는 하네스 §1의 해당 검증 블록을 그대로 실행하고 결과를 `PROGRESS.md`와 `artifacts/qa/phase-reports/`에 남긴다.

## 라이선스

MIT. [LICENSE](LICENSE)를 참조한다.
