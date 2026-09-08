# HowSheet 기술 백서 (Technical Whitepaper)

**버전**: 1.0  
**작성일**: 2026년 8월 29일  
**작성자**: JTech-CO / HowSheet 프로젝트  
**참고 문서**: HowSheet 초안, HowSheet 디자인 백서 v1.0, 웹 프로젝트용 기술 백서 템플릿

---

## 1. 프로젝트 개요 (Project Overview)

### 1.1. 프로젝트 명

**HowSheet - 누구나 만드는 단일 페이지 단계별 해결 가이드**

- **표기명**: HowSheet
- **프로젝트 슬러그**: `howsheet`
- **한 줄 정의**: 복잡한 절차를 작성·검증·배포 가능한 체크리스트형 단일 페이지 가이드로 변환하는 로컬 우선 웹 도구
- **핵심 결과물**: 편집 가능한 HowSheet JSON과 네트워크 없이 열 수 있는 읽기 전용 단일 HTML

### 1.2. 목적 (Purpose)

HowSheet는 계정 복구, 프로그램 설치, 기기 설정, 학교 행정 절차, 서버 구축처럼 여러 단계를 정확한 순서로 수행해야 하는 작업을 비전문가도 따라갈 수 있는 형태로 바꾸는 것을 목적으로 한다.

기존의 메신저 설명, 긴 Markdown 문서, 블로그 게시글, PDF 매뉴얼은 다음 문제가 있다.

1. 독자가 현재 어느 단계까지 진행했는지 알기 어렵다.
2. 성공·실패 여부와 예외 상황이 본문에 섞여 있어 필요한 해결책을 찾기 어렵다.
3. 조건에 따라 다음 단계가 달라지는 절차를 선형 문서로 표현하기 어렵다.
4. 작성자가 수정 가능한 원본과 독자에게 전달할 최종본이 명확히 분리되지 않는다.
5. 링크가 사라지거나 서비스가 종료되면 문서 배포가 중단될 수 있다.
6. 모바일에서 긴 기술 문서를 읽고 명령어를 복사하며 진행하기 불편하다.

HowSheet는 이를 해결하기 위해 다음 목표를 둔다.

- 폼 기반 편집기로 제목, 대상 사용자, 준비물, 경고, 단계, 분기, 오류 해결, 완료 화면을 구조화한다.
- 기존 Markdown 기술 문서를 가져와 HowSheet 데이터 구조의 초안으로 변환한다.
- 독자가 체크박스와 선택지를 따라가며 현재 진행률과 다음 행동을 명확히 알 수 있게 한다.
- 작성 데이터는 JSON으로 보존하고, 배포본은 CSS·JavaScript·이미지를 포함한 단일 HTML로 생성한다.
- 작성·열람·진행 상태 저장의 기본 기능은 계정, 서버, 데이터베이스 없이 브라우저 내부에서 동작한다.
- 브라우저 인쇄 기능을 통해 별도 PDF 생성 엔진 없이 인쇄용 문서로 저장할 수 있게 한다.

#### 1.2.1. MVP 범위

MVP는 다음 네 가지 실행 모드로 구성한다.

1. **작성 모드(Author Mode)**: 가이드의 구조와 콘텐츠를 편집한다.
2. **미리보기 모드(Preview Mode)**: 독자 화면과 동일한 구조로 동작을 검증한다.
3. **내보내기 모드(Export Mode)**: JSON 또는 단일 HTML을 생성한다.
4. **리더 모드(Reader Mode)**: 내보낸 HTML에서 체크·분기·진행 저장·인쇄를 수행한다.

#### 1.2.2. MVP 비범위

다음 기능은 초기 버전에 포함하지 않는다.

- 계정 생성, 로그인, 사용자 간 실시간 공동 편집
- 서버 기반 공개 가이드 호스팅과 검색
- 클라우드 동기화 및 기기 간 진행 상태 공유
- 익명 통계, 행동 분석, 피드백 수집
- QR 코드 생성 및 템플릿 마켓
- AI 자동 작성 및 자동 번역
- 서버에서 실행되는 PDF 렌더링

이 항목은 데이터 모델과 컴포넌트를 확장 가능하게 설계하되, MVP 번들에는 포함하지 않는다.

#### 1.2.3. 타깃 사용자

1. 가족이나 지인에게 컴퓨터·스마트폰 사용법을 설명하는 사람
2. 반복 문의를 줄이려는 고객 지원 담당자
3. 수업·실습·동아리 운영 절차를 안내하는 교사와 학생
4. 설치·초기화·운영 절차를 배포하는 소규모 서비스 운영자
5. Markdown 기술 문서를 비전문가용 가이드로 변환하려는 개발자

#### 1.2.4. 대표 활용 시나리오

- 모바일 Discord 계정을 이용해 PC 로그인 복구하기
- Raspberry Pi에서 NVMe 파티션을 생성하고 자동 마운트하기
- 부모님 스마트폰에 앱 설치 및 권한 설정하기
- 서버 랙 조립부터 전원·네트워크 점검까지 진행하기
- 프로그램 제거, 잔여 파일 삭제, 설정 초기화하기

### 1.3. 핵심 차별점 (Key Differentiators)

1. **로컬 우선(Local-first)**  
   작성 중인 원본과 독자의 진행 상태를 기본적으로 브라우저 내부에 저장한다. MVP 핵심 기능은 계정과 백엔드 없이 동작하며, 민감한 계정 복구·기기 설정 문서를 외부 서버로 전송하지 않는다.

2. **독립 실행형 배포(Portable Single File)**  
   최종 가이드는 외부 JavaScript, CSS, 폰트, 이미지 호스팅에 의존하지 않는 단일 HTML로 내보낸다. 이메일, 메신저, USB, 사내 파일 서버, GitHub Pages 등 전달 방식과 무관하게 같은 리더 경험을 유지한다.

3. **절차 구조 검증(Validated Procedure Graph)**  
   단계 누락, 존재하지 않는 분기 대상, 순환 분기, 도달할 수 없는 단계, 준비되지 않은 이미지 자산을 내보내기 전에 검사한다. 단순 문서 편집기가 아니라 실행 가능한 절차 모델을 만든다.

4. **작성자와 독자의 화면 분리(Author–Reader Separation)**  
   작성자는 복잡한 구조와 분기 조건을 편집하지만, 독자는 현재 필요한 한 단계와 성공 확인만 본다. 같은 데이터에서 편집 UI와 읽기 전용 UI를 분리해 정보 과부하를 줄인다.

5. **모바일 실행성(Mobile-operable)**  
   독자 화면은 한 손 조작, 44px 이상 터치 대상, 명령어 복사, 접이식 오류 해결, 고정형 다음 행동 영역을 기준으로 설계한다.

### 1.4. 제품 성공 기준

MVP의 기술적 성공은 다음 조건을 모두 만족하는 상태로 정의한다.

- 신규 사용자가 샘플 없이 10분 안에 5단계 가이드를 작성하고 HTML로 내보낼 수 있다.
- 내보낸 HTML을 네트워크가 끊긴 상태에서 열어 모든 텍스트, 이미지, 분기, 체크 기능을 사용할 수 있다.
- 동일 브라우저·프로필에서 페이지를 닫고 다시 열었을 때 진행 상태가 복원된다.
- 잘못된 분기 대상이나 순환 구조가 있는 가이드는 내보내기가 차단되고 수정 위치가 표시된다.
- 360px 너비 모바일 화면에서 가로 스크롤 없이 핵심 기능을 사용할 수 있다.
- 키보드만으로 작성 폼과 리더 체크리스트를 조작할 수 있다.

---

## 2. 상세 기능 요구사항 (Detailed Requirements)

### 2.1. 시스템 환경 및 인터페이스 (System & Interface)

#### 2.1.1. 실행 환경

- **애플리케이션 형태**: 정적 호스팅 가능한 클라이언트 사이드 SPA
- **백엔드**: MVP에서는 사용하지 않음
- **네트워크 의존성**: 편집기 최초 로드 외 핵심 작성 기능은 네트워크 없이 유지 가능하도록 설계
- **내보낸 리더 HTML**: 외부 요청이 전혀 없어야 하며 `file://`, 정적 웹 서버, 로컬 서버에서 실행 가능
- **저장소**:
  - 편집 원본·자산: IndexedDB
  - UI 환경 설정: LocalStorage
  - 리더 진행 상태: LocalStorage, 실패 시 세션 메모리 폴백
- **브라우저 기준**: Chromium 계열, Firefox, Safari의 현대 버전
- **지원 제외**: Internet Explorer, JavaScript 비활성 환경, ES 모듈을 지원하지 않는 구형 브라우저

#### 2.1.2. 뷰 모드

- **Mobile First**를 기본 전략으로 한다.
- 리더 화면은 320px부터 정상 동작해야 한다.
- 작성 화면은 360px부터 사용할 수 있으나, 1024px 이상에서 개요·편집기·검사 패널을 동시에 표시한다.
- 데스크톱 작성 화면의 최대 작업 너비는 1440px이며, 중앙 편집 열은 720~800px를 유지한다.
- 내보낸 HTML은 단일 열 리더 레이아웃을 기본으로 하고, 데스크톱에서 보조 목차를 선택적으로 표시한다.

#### 2.1.3. 테마 정책

- 테마 값: `system | light | dark`
- 기본값: `system`
- CSS Custom Properties를 이용하여 런타임에 전환한다.
- 작성기 환경 설정과 가이드 기본 테마는 서로 분리한다.
- 독자는 가이드가 허용한 경우에만 테마를 변경할 수 있다.
- 내보낸 HTML에는 라이트·다크 토큰을 모두 포함한다.

#### 2.1.4. 제품 모드

| 모드     | 경로/상태            | 목적                                | 편집 가능 여부 |
| -------- | -------------------- | ----------------------------------- | -------------- |
| 대시보드 | `/`                  | 로컬 가이드 목록, 새 문서, 가져오기 | 가능           |
| 작성     | `/guide/:id/edit`    | 구조·콘텐츠 편집                    | 가능           |
| 미리보기 | `/guide/:id/preview` | 실제 분기와 진행 흐름 검증          | 원본 변경 없음 |
| 내보내기 | 모달/패널            | JSON·HTML 생성, 검사 결과 확인      | 설정만 가능    |
| 리더     | 내보낸 HTML          | 독자용 실행 화면                    | 읽기 전용      |

#### 2.1.5. 기능 요구사항 목록

| ID     | 기능                            | 우선순위 | 수용 기준                                            |
| ------ | ------------------------------- | -------: | ---------------------------------------------------- |
| FR-001 | 가이드 생성·이름 변경·복제·삭제 |     Must | 로컬 목록에서 즉시 반영되고 새로고침 후 유지         |
| FR-002 | 제목·요약·대상 사용자 입력      |     Must | 필수값 검증과 문자 수 표시 제공                      |
| FR-003 | 시작 전 준비물 관리             |     Must | 추가·삭제·재정렬·필수 여부 지정 가능                 |
| FR-004 | 중요 경고 관리                  |     Must | 심각도와 확인 필요 여부 지정 가능                    |
| FR-005 | 번호형 단계 카드 편집           |     Must | 단계 제목·설명·성공 기준과 콘텐츠 블록 편집 가능     |
| FR-006 | 명령어·링크·이미지 블록         |     Must | 복사, 안전 링크, 대체 텍스트, 캡션 지원              |
| FR-007 | 성공 여부 체크                  |     Must | 각 활성 단계의 완료 상태를 저장하고 진행률 갱신      |
| FR-008 | 조건 분기                       |     Must | 선택 결과에 따라 다음 단계가 결정되고 오류 구조 차단 |
| FR-009 | 오류 및 해결 방법               |     Must | 단계별·전체 공통 문제를 접이식 패널로 표시           |
| FR-010 | 완료 화면                       |     Must | 완료 메시지, 요약, 재시작·인쇄 동작 제공             |
| FR-011 | 독자 진행 상태 저장             |     Must | 동일 가이드/개정판 단위로 저장·복원·초기화           |
| FR-012 | JSON 내보내기·가져오기          |     Must | 스키마 버전 포함, 검증 실패 시 구체적 오류 표시      |
| FR-013 | 단일 HTML 내보내기              |     Must | 외부 자원 요청 없이 독립 실행                        |
| FR-014 | 브라우저 인쇄/PDF               |     Must | 인쇄 전용 레이아웃으로 모든 활성 단계 출력           |
| FR-015 | 라이트·다크 모드                |     Must | 시스템 동기화와 수동 변경 지원                       |
| FR-016 | Markdown 가져오기               |   Should | 제목·단계·코드·이미지·경고를 구조화 초안으로 변환    |
| FR-017 | 자동 저장·복구                  |   Should | 입력 후 500ms 이내 예약 저장, 비정상 종료 후 복원    |
| FR-018 | 키보드 재정렬                   |   Should | 드래그 없이 단계와 블록 순서 변경 가능               |
| FR-019 | 검증 요약 패널                  |   Should | 오류를 클릭하면 해당 필드로 이동                     |
| FR-020 | 샘플 템플릿                     |    Could | 예시 3종 이상을 새 문서 기반으로 선택 가능           |

### 2.2. 사용자 상호작용 로직 (Interaction Logic)

#### 2.2.1. 작성 흐름

1. 사용자는 새 가이드, JSON 가져오기, Markdown 가져오기 중 하나를 선택한다.
2. 새 가이드 생성 시 최소 기본 구조를 자동 생성한다.
   - 메타데이터
   - 준비물 섹션
   - 경고 섹션
   - 기본 단계 1개
   - 완료 화면
3. 폼 입력은 지역 상태에 즉시 반영한다.
4. 변경 후 500ms 동안 추가 입력이 없으면 IndexedDB에 자동 저장한다.
5. 저장 상태는 `저장 중 → 저장됨 → 저장 실패`로 표시한다.
6. 단계나 블록을 추가·삭제·재정렬하면 안정적인 ID는 유지하고 `order`만 다시 계산한다.
7. 미리보기를 열면 현재 초안의 스냅샷을 사용하며, 미리보기 체크 상태는 원본 편집 데이터와 분리한다.
8. 내보내기 시 전체 검증을 실행하고, `error`가 하나라도 있으면 HTML 내보내기를 차단한다.

#### 2.2.2. 독자 흐름

1. HTML 실행 시 내장 JSON을 읽고 스키마와 무결성을 검사한다.
2. 가이드 ID와 개정 번호를 바탕으로 저장된 진행 상태를 찾는다.
3. 이전 진행 상태가 있으면 `이어하기`와 `처음부터`를 제공한다.
4. 준비물과 필수 경고를 확인한 뒤 첫 단계로 이동한다.
5. 사용자는 단계 내용을 읽고 명령어를 복사하거나 링크를 연다.
6. 성공 기준을 충족하면 체크박스를 선택한다.
7. 분기 선택지가 있으면 하나를 선택하고 해당 규칙으로 다음 단계를 계산한다.
8. 진행 중 오류가 발생하면 현재 단계의 해결 방법을 펼친다.
9. 활성 경로의 종료 단계에 도달하면 완료 화면을 표시한다.
10. 사용자는 진행 초기화, 전체 단계 보기, 인쇄/PDF 저장을 수행할 수 있다.

#### 2.2.3. 이벤트 처리

- **텍스트 입력**: 상태는 즉시 갱신하고, 영속 저장은 500ms debounce를 적용한다.
- **드래그 재정렬**: 드래그 종료 시에만 순서를 확정한다. 키보드 사용자는 이동 버튼 또는 단축키를 사용한다.
- **단계 삭제**: 삭제 전에 참조 중인 분기 규칙 수를 표시한다. 참조가 있으면 대상 대체 또는 규칙 삭제를 요구한다.
- **이미지 삽입**: 파일 선택 즉시 MIME·크기·해상도를 검사하고, 브라우저에서 리사이즈·압축한 뒤 Blob으로 저장한다.
- **명령어 복사**: Clipboard API를 우선 사용하고 실패하면 선택 영역 기반 폴백을 사용한다.
- **외부 링크**: `http:`와 `https:`만 허용하며 새 탭에서는 `noopener,noreferrer`를 적용한다.
- **내보내기**: 동기 처리로 UI가 멈추지 않도록 자산 변환 단계를 비동기로 실행하고 진행 상태를 표시한다.

#### 2.2.4. 데이터 검증

검증은 `필드 검증`, `문서 검증`, `내보내기 검증`의 세 단계로 나눈다.

**필드 검증**

- 제목: 1~120자
- 대상 사용자: 0~200자
- 단계 제목: 1~100자
- 본문 텍스트 블록: 블록당 최대 20,000자
- 링크 URL: `https:`, `http:`만 허용
- 이미지: `image/png`, `image/jpeg`, `image/webp`, `image/gif` 허용
- 이미지 원본: 파일당 최대 5MB
- 이미지 대체 텍스트: 장식 이미지가 아닌 경우 필수

**문서 검증**

- 단계가 1개 이상 존재해야 한다.
- 시작 단계 ID가 실제 단계와 일치해야 한다.
- 모든 분기 대상 ID가 존재해야 한다.
- 분기 조건의 우선순위가 중복되지 않아야 한다.
- 기본 다음 단계는 단계당 최대 1개다.
- 순환 분기는 MVP에서 허용하지 않는다.
- 시작 단계에서 도달할 수 없는 단계는 경고 또는 오류로 표시한다.
- 종료 단계가 최소 1개 존재해야 한다.
- 필수 경고에 확인 문구가 비어 있으면 오류로 처리한다.

**내보내기 검증**

- 모든 Blob 자산이 Data URL로 변환 가능한지 검사한다.
- HTML 내보내기 예상 크기가 20MB를 넘으면 경고한다.
- 30MB를 넘으면 기본 설정에서 차단하고 이미지 최적화를 안내한다.
- 사용자 입력 HTML, 스크립트 URL, 이벤트 핸들러 속성이 남아 있지 않은지 검사한다.
- 스키마 버전과 리더 런타임의 호환 범위를 검사한다.

#### 2.2.5. Markdown 가져오기 규칙

Markdown 가져오기는 원문을 완전히 이해하는 AI 변환이 아니라, 명시적 규칙에 따른 구조 초안 생성 기능이다. 변환 후 사용자가 매핑 결과를 확인해야 한다.

| Markdown 패턴                            | HowSheet 매핑              |
| ---------------------------------------- | -------------------------- |
| 첫 번째 `# 제목`                         | 가이드 제목                |
| 첫 H2 이전 문단                          | 가이드 요약                |
| `## 대상`, `## 대상 사용자`              | 대상 사용자 설명           |
| `## 준비물`, `## 시작 전 준비` 아래 목록 | 준비물 항목                |
| `> [!WARNING]`, `> [!CAUTION]`           | 경고 블록                  |
| `## 1. 제목`, `## 단계 1`, 일반 H2       | 단계 후보                  |
| 일반 문단                                | 설명 블록                  |
| fenced code block                        | 명령어/코드 블록           |
| 이미지 문법                              | 이미지 블록                |
| 링크 단독 문단                           | 링크 블록                  |
| `## 오류`, `## 문제 해결`, `## FAQ`      | 공통 오류 해결 섹션        |
| 체크리스트 `- [ ]`                       | 준비물 또는 성공 기준 후보 |

가져오기 결과에는 다음 상태를 표시한다.

- `mapped`: 규칙에 따라 확정적으로 매핑됨
- `needsReview`: 다중 해석이 가능하여 검토 필요
- `unmapped`: 구조화하지 못하고 일반 Markdown 블록으로 유지

### 2.3. 데이터 모델 (Data Model)

#### 2.3.1. 모델 개요

1. **GuideDocument**: 가이드 전체 원본과 버전 정보
2. **GuideMeta**: 제목, 설명, 대상, 작성자, 언어, 테마
3. **PreparationItem**: 시작 전 준비물
4. **WarningBlock**: 개인정보 삭제, 초기화, 계정 잠금 등 중요 경고
5. **GuideStep**: 번호가 있는 실행 단계
6. **ContentBlock**: 텍스트, 코드, 링크, 이미지, 체크리스트, 결정 질문
7. **BranchRule**: 조건과 다음 단계의 연결
8. **TroubleshootingItem**: 증상·원인·해결 방법
9. **CompletionConfig**: 완료 화면과 후속 행동
10. **AssetRecord**: 편집기 내부 이미지 Blob과 내보내기 메타데이터
11. **ReaderProgress**: 독자의 로컬 진행 상태
12. **ValidationIssue**: 오류·경고·정보 메시지

#### 2.3.2. TypeScript 도메인 타입

```ts
export type ThemePreference = 'system' | 'light' | 'dark';
export type Severity = 'info' | 'warning' | 'danger';
export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'blocked';

export interface GuideDocument {
  schemaVersion: '1.0';
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  meta: GuideMeta;
  preparation: PreparationItem[];
  warnings: WarningBlock[];
  steps: GuideStep[];
  startStepId: string;
  troubleshooting: TroubleshootingItem[];
  completion: CompletionConfig;
  assets: AssetManifestItem[];
  settings: GuideSettings;
}

export interface GuideMeta {
  title: string;
  summary?: string;
  audience?: string;
  author?: string;
  language: string;
  estimatedMinutes?: number;
  tags?: string[];
}

export interface GuideSettings {
  defaultTheme: ThemePreference;
  allowThemeSwitch: boolean;
  allowProgressReset: boolean;
  showOverallOutline: boolean;
  printMode: 'active-path' | 'all-steps';
}

export interface PreparationItem {
  id: string;
  label: string;
  detail?: string;
  required: boolean;
  link?: SafeLink;
  order: number;
}

export interface WarningBlock {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  requiresAcknowledgement: boolean;
  acknowledgementLabel?: string;
  order: number;
}

export interface GuideStep {
  id: string;
  order: number;
  title: string;
  summary?: string;
  blocks: ContentBlock[];
  successCriteria?: string;
  completionMode: 'checkbox' | 'choice' | 'automatic';
  branchRules: BranchRule[];
  defaultNextStepId?: string;
  troubleshootingIds: string[];
  optional: boolean;
}

export type ContentBlock =
  TextBlock | CodeBlock | LinkBlock | ImageBlock | ChecklistBlock | DecisionBlock | DividerBlock;

export interface BaseBlock {
  id: string;
  order: number;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  markdown: string;
}

export interface CodeBlock extends BaseBlock {
  type: 'code';
  language?: string;
  code: string;
  copyLabel?: string;
}

export interface LinkBlock extends BaseBlock {
  type: 'link';
  label: string;
  url: string;
  description?: string;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  assetId: string;
  alt: string;
  caption?: string;
}

export interface ChecklistBlock extends BaseBlock {
  type: 'checklist';
  items: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
}

export interface DecisionBlock extends BaseBlock {
  type: 'decision';
  question: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  required: boolean;
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
}

export interface BranchRule {
  id: string;
  sourceBlockId?: string;
  operator: 'equals' | 'notEquals' | 'checked' | 'notChecked';
  value?: string | boolean;
  targetStepId: string;
  priority: number;
}

export interface TroubleshootingItem {
  id: string;
  scope: 'global' | 'step';
  stepId?: string;
  symptom: string;
  likelyCause?: string;
  resolution: ContentBlock[];
  order: number;
}

export interface CompletionConfig {
  title: string;
  message: string;
  showSummary: boolean;
  primaryAction?: SafeLink;
  secondaryAction?: SafeLink;
}

export interface SafeLink {
  label: string;
  url: string;
}

export interface AssetManifestItem {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  checksum: string;
}
```

#### 2.3.3. ReaderProgress 모델

```ts
export interface ReaderProgress {
  guideId: string;
  revision: number;
  startedAt: string;
  updatedAt: string;
  currentStepId: string;
  activePath: string[];
  stepState: Record<
    string,
    {
      status: StepStatus;
      completedAt?: string;
      checkedItemIds?: string[];
      selectedOptionByBlock?: Record<string, string>;
    }
  >;
  acknowledgedWarningIds: string[];
  completed: boolean;
}
```

진행 상태 키는 다음 형식을 사용한다.

```text
howsheet:progress:{guideId}:r{revision}
```

- `revision`이 변경되면 기존 진행 상태를 자동으로 덮어쓰지 않는다.
- 동일 기기·브라우저 프로필을 사용하는 사람은 같은 진행 상태를 공유할 수 있다.
- MVP의 “독자별 저장”은 로그인 사용자 식별이 아니라 **브라우저 프로필별 로컬 저장**을 의미한다.

#### 2.3.4. 최소 JSON 예시

```json
{
  "schemaVersion": "1.0",
  "id": "guide-discord-pc-recovery",
  "revision": 1,
  "createdAt": "2026-08-29T12:00:00.000Z",
  "updatedAt": "2026-08-29T12:00:00.000Z",
  "meta": {
    "title": "모바일 Discord 계정으로 PC 로그인 복구하기",
    "summary": "모바일에 로그인된 계정을 이용해 PC 로그인을 복구합니다.",
    "audience": "모바일 Discord에는 로그인되어 있지만 PC 비밀번호를 잊은 사용자",
    "language": "ko-KR"
  },
  "preparation": [],
  "warnings": [],
  "steps": [
    {
      "id": "step-1",
      "order": 0,
      "title": "모바일 계정 정보 확인",
      "blocks": [
        {
          "id": "block-1",
          "order": 0,
          "type": "text",
          "markdown": "모바일 앱에서 등록된 이메일 또는 전화번호를 확인합니다."
        }
      ],
      "successCriteria": "계정에 연결된 이메일 또는 전화번호를 확인했습니다.",
      "completionMode": "checkbox",
      "branchRules": [],
      "troubleshootingIds": [],
      "optional": false
    }
  ],
  "startStepId": "step-1",
  "troubleshooting": [],
  "completion": {
    "title": "복구 절차 완료",
    "message": "PC에서 Discord에 로그인할 수 있는지 확인하세요.",
    "showSummary": true
  },
  "assets": [],
  "settings": {
    "defaultTheme": "system",
    "allowThemeSwitch": true,
    "allowProgressReset": true,
    "showOverallOutline": true,
    "printMode": "active-path"
  }
}
```

#### 2.3.5. 스키마 버전 정책

- `schemaVersion`은 `major.minor` 문자열을 사용한다.
- minor 변경은 하위 호환 필드 추가에 사용한다.
- major 변경은 자동 마이그레이션 또는 사용자 확인이 필요한 구조 변경에 사용한다.
- 가져오기 시 현재보다 높은 major 버전은 읽기 전용 미리보기만 허용하거나 가져오기를 중단한다.
- 마이그레이션은 원본 복사본을 만든 뒤 수행한다.

### 2.4. 출력 및 성능 기준 (Output & Performance)

#### 2.4.1. 결과물 형식

1. **HowSheet JSON**
   - 확장자: `.howsheet.json`
   - MIME: `application/json`
   - 편집 가능한 원본 교환 형식
   - 이미지 자산은 기본적으로 Base64 Data URL 또는 별도 자산 맵으로 포함

2. **독립 실행형 HTML**
   - 확장자: `.html`
   - MIME: `text/html`
   - CSS, 리더 런타임, 가이드 JSON, 이미지 자산을 한 파일에 포함
   - 외부 CDN, API, 분석 스크립트, 웹폰트 요청 금지

3. **PDF**
   - 브라우저의 인쇄 대화상자에서 사용자가 저장
   - HowSheet가 PDF 파일을 직접 생성하지 않음
   - 인쇄 CSS는 단계 번호, 경고, 코드, 링크 URL, 오류 해결을 보존

#### 2.4.2. 성능 예산

| 항목                             |                 목표 |  최대 허용 |
| -------------------------------- | -------------------: | ---------: |
| 편집기 초기 JavaScript 압축 크기 |           300KB 이하 | 500KB 이하 |
| 빈 가이드 편집기 LCP             |           2.0초 이내 | 2.5초 이내 |
| 폼 입력 반응                     |            50ms 이내 | 100ms 이내 |
| 자동 저장 예약                   | 마지막 입력 후 500ms |   1초 이내 |
| 100단계 가이드 검증              |           100ms 이내 | 300ms 이내 |
| 20MB HTML 내보내기               |             3초 이내 |   8초 이내 |
| 리더 초기 렌더링                 |             1초 이내 |   2초 이내 |
| 체크 후 진행 상태 저장           |           100ms 이내 | 250ms 이내 |

성능 목표는 일반적인 중급 모바일 기기와 데스크톱 환경을 기준으로 하며, 이미지 압축 시간은 입력 파일 크기에 따라 별도 표시한다.

#### 2.4.3. 품질 기준

- **접근성**: WCAG 2.2 AA 수준을 목표로 자동 검사와 수동 검사를 병행
- **반응형**: 320px~1920px에서 핵심 기능 가로 스크롤 금지
- **키보드**: 모든 버튼, 입력, 체크, 분기, 모달, 재정렬 기능 접근 가능
- **데이터 안전성**: 저장 실패 시 편집 내용을 메모리에서 유지하고 즉시 재시도 또는 JSON 백업 제공
- **오프라인성**: 내보낸 HTML은 네트워크 패널에서 외부 요청 0건
- **보안성**: 대표 XSS 페이로드를 Markdown, 제목, 링크, 코드, 이미지 캡션에 삽입해도 실행되지 않아야 함
- **인쇄성**: A4 세로 기준 텍스트 잘림과 인터랙션 전용 UI 출력 금지

---

## 3. 기술 스택 및 라이브러리 (Tech Stack)

### 3.1. Core

- **Frontend**: React + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router 또는 경량 동등 라우터
- **Styling**: CSS Modules + CSS Custom Properties + PostCSS
- **Backend**: 없음(MVP)
- **Database**: IndexedDB
- **Local Preferences/Progress**: LocalStorage
- **Deployment**: GitHub Pages, Cloudflare Pages, Netlify 등 정적 호스팅
- **Package Manager**: pnpm 권장
- **Runtime Policy**: `package.json`과 lockfile에서 정확한 버전을 고정하고 자동 메이저 업데이트 금지

#### 3.1.1. 프레임워크 선택 이유

- React는 복합 폼, 동적 블록, 미리보기, 리더 런타임을 컴포넌트 단위로 재사용하기 적합하다.
- TypeScript는 분기 규칙과 콘텐츠 블록의 판별 가능한 유니온을 정적으로 검증할 수 있다.
- Vite는 편집기 번들과 별개로 리더 CSS·런타임을 raw/inline 자산으로 가져오는 빌드 구성이 단순하다.
- CSS Modules는 작성기 스타일의 충돌을 줄이고, 내보내기용 리더 스타일은 별도 정적 CSS로 유지할 수 있다.

### 3.2. Libraries & Tools

| 라이브러리/도구       | 필수 여부 | 용도                          | 주요 설정                                |
| --------------------- | --------- | ----------------------------- | ---------------------------------------- |
| Zustand               | 필수      | 편집 문서·UI 상태 관리        | 문서 상태와 일시 UI 상태 스토어 분리     |
| React Hook Form       | 필수      | 메타·설정·블록 폼 처리        | `mode: onBlur`, 동적 필드 배열 사용      |
| Zod                   | 필수      | JSON 스키마·폼·가져오기 검증  | `safeParse`, 버전별 스키마 분리          |
| Dexie                 | 필수      | IndexedDB 접근과 마이그레이션 | `guides`, `assets`, `recovery` 테이블    |
| unified/remark        | 필수      | Markdown AST 파싱             | GFM 지원, raw HTML 비활성 또는 별도 살균 |
| DOMPurify             | 필수      | 렌더링 HTML 살균              | 금지 태그·속성 명시, URI 프로토콜 제한   |
| dnd-kit               | 선택      | 단계·블록 드래그 재정렬       | 키보드 센서와 충돌 감지 적용             |
| Lucide React          | 선택      | 일관된 선형 아이콘            | 필요한 아이콘만 트리 셰이킹              |
| Vitest                | 필수      | 단위·통합 테스트              | jsdom과 순수 함수 테스트 분리            |
| React Testing Library | 필수      | 컴포넌트 상호작용 테스트      | 사용자 행동 중심 쿼리 사용               |
| Playwright            | 필수      | E2E·브라우저·인쇄 테스트      | Chromium/Firefox/WebKit 프로젝트         |
| axe-core              | 필수      | 자동 접근성 검사              | 주요 화면별 심각 오류 0건                |
| ESLint                | 필수      | 코드 품질                     | TypeScript, React Hooks, 접근성 규칙     |
| Prettier              | 필수      | 포맷 일관성                   | Markdown·JSON 포함                       |

#### 3.2.1. 사용하지 않는 라이브러리

- **서버 PDF 라이브러리**: MVP는 브라우저 인쇄를 사용한다.
- **무거운 WYSIWYG 에디터**: 블록별 폼 편집이 구조 검증과 내보내기 안정성에 유리하다.
- **전역 UI 프레임워크**: 불필요한 CSS와 JavaScript가 리더 HTML에 포함되는 것을 막는다.
- **외부 웹폰트 로더**: 오프라인 단일 HTML 요구사항과 충돌한다.

---

## 4. 아키텍처 및 로직 (Architecture & Logic)

### 4.1. 상태 관리 전략 (State Management)

#### 4.1.1. 상태 범위

**영속 도메인 상태**

- GuideDocument
- AssetRecord
- 로컬 가이드 목록 메타데이터
- 마지막 성공 저장 스냅샷

**세션 UI 상태**

- 현재 선택한 단계·블록
- 열린 패널·모달
- 드래그 중인 항목
- 검증 이슈 목록
- 내보내기 진행률
- 토스트 메시지

**리더 상태**

- ReaderProgress
- 현재 활성 단계
- 선택된 분기 옵션
- 오류 해결 패널 열림 상태
- 테마

#### 4.1.2. 스토어 예시

```ts
interface GuideEditorState {
  document: GuideDocument | null;
  selectedStepId: string | null;
  selectedBlockId: string | null;
  dirty: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  validationIssues: ValidationIssue[];

  loadGuide: (id: string) => Promise<void>;
  updateMeta: (patch: Partial<GuideMeta>) => void;
  addStep: (afterStepId?: string) => void;
  updateStep: (stepId: string, patch: Partial<GuideStep>) => void;
  removeStep: (stepId: string) => void;
  reorderSteps: (activeId: string, overId: string) => void;
  validate: () => ValidationIssue[];
  save: () => Promise<void>;
}
```

#### 4.1.3. 업데이트 규칙

- 상태 업데이트는 불변성을 유지한다.
- 식별자 생성에는 `crypto.randomUUID()`를 우선 사용한다.
- `order`는 UI 정렬용이며 참조는 항상 ID로 한다.
- 자동 저장 중 추가 변경이 발생하면 최신 스냅샷을 다시 저장한다.
- 저장 완료 응답이 오래된 스냅샷에 해당하면 `saved`로 표시하지 않는다.
- 삭제·대규모 가져오기 전에는 복구 스냅샷을 남긴다.

### 4.2. 시스템 아키텍처

```text
┌────────────────────────────────────────────────────────────┐
│                       HowSheet Editor                      │
├────────────────────────────────────────────────────────────┤
│  Dashboard  │  Author Form  │  Preview  │  Export Panel   │
├────────────────────────────────────────────────────────────┤
│     React Components + Domain Hooks + Validation UI        │
├────────────────────────────────────────────────────────────┤
│ Guide Store │ UI Store │ Markdown Importer │ Branch Engine │
├────────────────────────────────────────────────────────────┤
│ Zod Schema  │ Sanitizer │ Asset Pipeline │ Export Builder  │
├────────────────────────────────────────────────────────────┤
│ IndexedDB (Guide/Asset/Recovery) │ LocalStorage (Prefs)    │
└───────────────────────────┬────────────────────────────────┘
                            │ Export
                            ▼
┌────────────────────────────────────────────────────────────┐
│                Standalone Reader HTML                     │
├────────────────────────────────────────────────────────────┤
│ Inline CSS │ Inline Reader Runtime │ Embedded Guide JSON   │
│ Embedded Data URL Assets │ LocalStorage Reader Progress    │
└────────────────────────────────────────────────────────────┘
```

### 4.3. 주요 동작 파이프라인 (Main Workflow)

#### 4.3.1. 애플리케이션 초기화

1. 루트 렌더링 전에 테마 설정을 읽어 깜빡임을 방지한다.
2. IndexedDB 스키마를 열고 필요한 마이그레이션을 수행한다.
3. 로컬 가이드 메타데이터를 로드한다.
4. 복구 스냅샷이 있으면 사용자에게 복원 여부를 묻는다.
5. 라우트에 따라 대시보드 또는 편집 문서를 로드한다.
6. IndexedDB를 사용할 수 없으면 메모리 모드와 JSON 백업 안내를 활성화한다.

#### 4.3.2. 작성 및 자동 저장

```text
Input Event
  → Local Form State Update
  → Guide Store Patch
  → dirty=true
  → 500ms Debounce
  → Zod Partial Validation
  → IndexedDB Transaction
  → savedAt 갱신
  → dirty=false
```

- 트랜잭션에는 문서와 자산 메타데이터를 함께 기록한다.
- 이미지 Blob은 별도 `assets` 테이블에 저장해 텍스트 수정 시 중복 쓰기를 피한다.
- 저장 실패 시 이전 성공 스냅샷은 유지한다.

#### 4.3.3. Markdown 가져오기

```text
Markdown File/Text
  → UTF-8 Decode
  → AST Parse
  → Section Classifier
  → Block Mapper
  → Import Draft
  → Mapping Review UI
  → Zod Validation
  → New GuideDocument
```

- HTML 노드는 기본적으로 일반 텍스트로 취급한다.
- 로컬 이미지 경로는 자동으로 파일을 읽을 수 없으므로 누락 자산으로 표시한다.
- 원격 이미지는 자동 다운로드하지 않으며 링크 블록 또는 수동 이미지 업로드로 전환한다.
- 가져오기 전 원문을 복구 메타데이터에 보관할 수 있다.

#### 4.3.4. 분기 실행

1. 현재 단계의 필수 성공 조건을 확인한다.
2. `branchRules`를 `priority` 오름차순으로 평가한다.
3. 첫 번째로 참인 규칙의 `targetStepId`를 선택한다.
4. 일치 규칙이 없으면 `defaultNextStepId`를 사용한다.
5. 다음 단계가 없으면 완료 화면으로 이동한다.
6. 새 경로가 기존 경로와 충돌하면 이후 경로의 완료 상태를 보존하되 비활성 상태로 표시한다.
7. 사용자가 이전 단계의 결정을 변경하면 해당 지점 이후 활성 경로를 다시 계산한다.

#### 4.3.5. JSON 내보내기

1. 문서 전체 검증
2. 자산 Blob을 Data URL로 변환
3. JSON 직렬화
4. 체크섬 계산
5. Blob 생성
6. 안전한 파일명으로 다운로드

파일명 예시:

```text
모바일-Discord-계정으로-PC-로그인-복구하기.r1.howsheet.json
```

#### 4.3.6. 단일 HTML 내보내기

```text
GuideDocument
  → Full Validation
  → Content Sanitization
  → Asset Inlining/Optimization
  → Safe JSON Serialization
  → Reader Template Injection
  → CSP Nonce Generation
  → HTML Blob
  → Download
```

내보낸 HTML의 기본 구조는 다음과 같다.

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <style>
      /* reader.css inline */
    </style>
  </head>
  <body>
    <div id="howsheet-root"></div>
    <script id="howsheet-data" type="application/json">
      {
        "schemaVersion": "1.0"
      }
    </script>
    <script>
      /* reader runtime inline */
    </script>
  </body>
</html>
```

가이드 JSON은 JavaScript 객체 리터럴로 직접 삽입하지 않고 `application/json` 스크립트의 `textContent`로 읽는다. 직렬화 시 `<`, `>`, `&`, U+2028, U+2029를 이스케이프해 태그 조기 종료와 스크립트 문맥 탈출을 방지한다.

#### 4.3.7. 리더 진행 저장

- 체크·선택·경로 변경 직후 100ms debounce로 LocalStorage에 저장한다.
- 저장 실패 시 상단에 “이 브라우저에서는 진행 상태가 유지되지 않을 수 있음”을 표시한다.
- `storage` 이벤트를 수신해 같은 가이드를 여러 탭에서 열었을 때 최신 진행 상태를 동기화한다.
- 개정 번호가 달라진 상태를 발견하면 자동 병합하지 않고 새 버전 시작 또는 이전 상태 보기만 제공한다.

#### 4.3.8. 인쇄/PDF 흐름

1. 현재 활성 경로 또는 전체 단계를 사용자가 선택한다.
2. 숨겨진 분기와 인터랙션 버튼을 인쇄용 문서 구조로 변환한다.
3. 링크에는 선택적으로 URL을 텍스트로 노출한다.
4. 코드 블록은 줄바꿈 여부를 설정하고 페이지 잘림을 최소화한다.
5. `window.print()`를 호출한다.

### 4.4. 핵심 알고리즘 (Core Algorithms)

#### 4.4.1. 분기 그래프 검증

가이드를 방향 그래프로 간주한다.

- 노드: `GuideStep`
- 간선: `branchRules.targetStepId`와 `defaultNextStepId`
- 시작 노드: `startStepId`

검증 순서:

1. 모든 간선의 대상 노드 존재 여부 검사
2. DFS 색상 마킹으로 순환 구조 검사
3. 시작 노드에서 BFS로 도달 가능한 노드 계산
4. 도달 불가능 단계 식별
5. 종료 노드가 존재하는지 검사
6. 조건이 완전히 동일한 중복 규칙 검사

```ts
function detectCycle(graph: Map<string, string[]>): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string): string[] | null => {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      return [...path.slice(start), node];
    }
    if (visited.has(node)) return null;

    visiting.add(node);
    path.push(node);

    for (const next of graph.get(node) ?? []) {
      const cycle = dfs(next);
      if (cycle) return cycle;
    }

    path.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };

  for (const node of graph.keys()) {
    const cycle = dfs(node);
    if (cycle) return cycle;
  }
  return null;
}
```

#### 4.4.2. 활성 경로 계산

- 진행률 분모는 전체 단계 수가 아니라 현재 선택으로 결정된 **활성 경로의 필수 단계 수**다.
- 아직 도달하지 않은 분기의 경우 기본 경로를 임시 계산하되 “예상 진행률”로 취급한다.
- 분기 선택 변경 시 변경 지점 이후 경로를 재생성한다.
- 이전에 완료했지만 현재 경로에서 제외된 단계는 `skipped`로 표시하고 기록은 삭제하지 않는다.

```text
progress = completedRequiredStepsOnActivePath / requiredStepsOnActivePath
```

#### 4.4.3. 콘텐츠 안전화

1. Markdown을 AST로 파싱한다.
2. 허용 노드만 HTML로 변환한다.
3. DOMPurify로 2차 살균한다.
4. 링크 프로토콜을 검사한다.
5. 코드 블록은 항상 텍스트 노드로 렌더링한다.
6. 이미지 `src`는 내장 Data URL 또는 안전한 `blob:` 미리보기만 허용한다.
7. `style`, `on*`, `srcdoc`, `javascript:`, `data:text/html`을 제거한다.

#### 4.4.4. 이미지 최적화

- EXIF 방향을 적용한다.
- 최대 긴 변 1920px로 축소한다.
- 사진은 WebP 또는 JPEG, 투명 이미지·도식은 WebP 또는 PNG를 사용한다.
- 애니메이션 GIF는 변환하지 않고 크기 경고를 표시한다.
- 압축 후 결과가 원본보다 크면 원본을 유지한다.
- SHA-256 체크섬으로 동일 자산 중복을 제거한다.
- Base64 변환으로 약 33% 크기 증가가 발생하므로 내보내기 예상 용량을 사전 계산한다.

#### 4.4.5. 안전한 파일명 생성

- 운영체제 금지 문자 `<>:"/\\|?*` 제거
- 연속 공백과 하이픈 정리
- 앞뒤 점·공백 제거
- 최대 80자로 제한
- 빈 결과는 `howsheet-guide` 사용
- 개정 번호와 확장자를 후행 추가

### 4.5. 저장소 설계

#### 4.5.1. IndexedDB 테이블

```ts
class HowSheetDB extends Dexie {
  guides!: Table<StoredGuide, string>;
  assets!: Table<StoredAsset, string>;
  recovery!: Table<RecoverySnapshot, string>;

  constructor() {
    super('howsheet-db');
    this.version(1).stores({
      guides: 'id, updatedAt, meta.title',
      assets: 'id, guideId, checksum',
      recovery: 'guideId, createdAt',
    });
  }
}
```

- `guides`: 자산 본문을 제외한 GuideDocument
- `assets`: Blob, MIME, 크기, 체크섬
- `recovery`: 비정상 종료 또는 가져오기 전 스냅샷
- 가이드 삭제 시 관련 자산을 하나의 트랜잭션으로 삭제한다.

#### 4.5.2. LocalStorage 키

```text
howsheet:editor:theme
howsheet:editor:lastGuideId
howsheet:editor:panelLayout
howsheet:progress:{guideId}:r{revision}
```

개인정보, 토큰, 원문 파일 경로는 LocalStorage에 저장하지 않는다.

### 4.6. 오류 처리

| 오류 유형           | 사용자 메시지                     | 복구 전략                                  |
| ------------------- | --------------------------------- | ------------------------------------------ |
| IndexedDB 열기 실패 | 로컬 저장소를 사용할 수 없음      | 메모리 모드, JSON 내보내기 상시 노출       |
| 자동 저장 실패      | 마지막 변경이 저장되지 않음       | 재시도, 수동 백업, 이전 스냅샷 유지        |
| 손상된 JSON         | 파일을 읽을 수 없음               | 경로와 필드 단위 오류 제공, 원본 변경 없음 |
| 상위 스키마 버전    | 현재 버전에서 편집 불가           | 읽기 전용 정보 표시 또는 중단              |
| 이미지 변환 실패    | 이미지를 처리할 수 없음           | 원본 제거·다른 형식 업로드 안내            |
| 분기 순환           | 단계가 반복되는 경로 존재         | 순환 경로를 단계명으로 표시, 내보내기 차단 |
| 클립보드 실패       | 자동 복사 실패                    | 코드 전체 선택 버튼 제공                   |
| 진행 저장 실패      | 진행 상태가 유지되지 않을 수 있음 | 세션 메모리 사용, JSON 원본에는 영향 없음  |
| 인쇄 팝업 차단      | 인쇄 창을 열 수 없음              | 브라우저 메뉴의 인쇄 안내                  |

### 4.7. 확장 아키텍처

MVP 이후 다음 모듈을 별도 경계로 추가한다.

- `hosting-adapter`: 공개 가이드 업로드와 버전 배포
- `template-registry`: 템플릿 검색·복제
- `qr-service`: 가이드 URL QR 생성
- `feedback-adapter`: 익명 완료·오류 피드백
- `collaboration`: 계정·권한·공동 편집
- `ai-assistant`: 문서 구조화·요약·쉬운 표현 변환

핵심 `GuideDocument`와 `ReaderRuntime`은 서버 기능이 추가되어도 독립 실행형 내보내기를 유지해야 한다.

---

## 5. UI 구현 가이드 (Implementation Guide)

### 5.1. 디자인 토큰 (Design Tokens)

#### 5.1.1. 색상

```css
:root {
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;
  --color-bg: #f7f8fa;
  --color-surface: #ffffff;
  --color-surface-subtle: #f1f5f9;
  --color-text: #111827;
  --color-text-muted: #4b5563;
  --color-border: #d1d5db;
  --color-success: #15803d;
  --color-warning: #9a3412;
  --color-danger: #b91c1c;
  --color-info: #0369a1;
}

[data-theme='dark'] {
  --color-brand-600: #60a5fa;
  --color-brand-700: #93c5fd;
  --color-bg: #0b1120;
  --color-surface: #111827;
  --color-surface-subtle: #172033;
  --color-text: #f8fafc;
  --color-text-muted: #cbd5e1;
  --color-border: #334155;
  --color-success: #4ade80;
  --color-warning: #fb923c;
  --color-danger: #f87171;
  --color-info: #38bdf8;
}
```

#### 5.1.2. 타이포그래피

- **기본 폰트**: `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Apple SD Gothic Neo`, `Noto Sans KR`, `sans-serif`
- **코드 폰트**: `ui-monospace`, `SFMono-Regular`, `Consolas`, `Liberation Mono`, `monospace`
- **기본 크기**: 16px
- **본문 줄 높이**: 1.65
- **최소 본문 크기**: 모바일 16px 유지
- **제목 스케일**: `clamp()` 기반 반응형

#### 5.1.3. 간격·모서리·그림자

- **Spacing Unit**: 4px
- **주요 간격**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px
- **Radius**: 8px(입력), 12px(카드), 16px(주요 패널)
- **Touch Target**: 최소 44×44px
- **Shadow**: 상태 구분이 필요한 부유 패널에만 최소 사용

#### 5.1.4. Breakpoints

- Mobile: `0–639px`
- Tablet: `640–1023px`
- Desktop: `1024–1439px`
- Wide: `1440px 이상`

### 5.2. 공통 컴포넌트 (Shared Components)

#### Button

```ts
type ButtonProps = {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
};
```

- 로딩 중 중복 클릭 차단
- 아이콘 단독 버튼은 `aria-label` 필수
- 위험 버튼은 확인 없이 주요 화면에 단독 배치하지 않음

#### Field / Input / Textarea

`Field`가 라벨·도움말·글자 수·오류 영역을 소유하고, `Input`·`Textarea`는 컨트롤 박스 규격만 소유하며 항상 `Field` 안에서 렌더링한다. (`File_Structure.md` §7 D-05)

**`Field`의 책임**

- 모든 입력은 시각적 라벨과 연결된 `id`를 가진다.
- 도움말, 글자 수, 오류 메시지 영역을 고정 순서로 제공한다.
- 오류는 색상뿐 아니라 아이콘·문구·`aria-describedby`로 표현한다.

**`Input`·`Textarea`의 책임**

- 최소 높이, 패딩, 포커스 링 등 컨트롤 박스 규격만 담당한다. 라벨·오류 연결을 자체 구현하지 않는다.

#### Modal / Dialog

- Portal 사용
- 열릴 때 첫 의미 있는 요소로 포커스 이동
- 닫힐 때 트리거로 포커스 복귀
- `Escape` 닫기 지원, 파괴적 작업 중에는 확인 절차 적용
- 배경 스크롤 잠금과 포커스 트랩 적용

#### Toast

- 저장 완료 같은 저중요도 상태에 사용
- 오류는 토스트만으로 끝내지 않고 해당 화면에 지속 메시지를 남긴다.
- `aria-live="polite"` 또는 중요 오류에 `assertive` 사용

#### StepCard

- 단계 번호, 제목, 요약, 상태, 콘텐츠, 성공 기준, 오류 해결을 포함
- 작성 모드와 리더 모드의 표현 컴포넌트를 분리하되 콘텐츠 렌더러는 공유
- 현재 단계는 `aria-current="step"` 사용

#### CodeBlock

- 코드 내용은 텍스트로 렌더링
- 복사 버튼, 언어 라벨, 줄바꿈 토글 제공
- 명령어 앞의 프롬프트 문자 `$`는 복사 대상에서 제외할 수 있음

#### ProgressBar

- 시각 막대와 숫자 텍스트를 함께 제공
- `role="progressbar"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` 설정
- 분기 전에는 “예상 진행률” 라벨을 구분할 수 있음

### 5.3. 작성기 전용 컴포넌트

- `GuideOutline`: 준비물, 경고, 단계, 오류 해결, 완료 섹션의 계층 목록
- `GuideMetaForm`: 제목·대상·요약·예상 시간 입력
- `PreparationEditor`: 항목 추가·필수 여부·링크 설정
- `WarningEditor`: 심각도와 확인 체크 설정
- `StepEditor`: 단계 기본 정보와 콘텐츠 블록 목록
- `BlockEditor`(구 `BlockToolbar`): 텍스트·명령어·링크·이미지·체크리스트·결정 블록 편집. 확정 이름은 `BlockEditor`이며 별도 `BlockToolbar` 컴포넌트를 만들지 않는다. 고정 순서 블록 추가 목록은 `BlockTypePicker`가 담당한다. (`File_Structure.md` §7 D-03)
- `BranchRuleEditor`: 조건·우선순위·대상 단계 설정
- `TroubleshootingEditor`: 증상·원인·해결 블록 편집
- `ValidationPanel`: 오류·경고 필터와 필드 이동
- `ExportDialog`: 형식, 파일명, 용량, 검사 결과, 인쇄 설정

### 5.4. 리더 전용 컴포넌트

- `GuideIntro`: 제목, 대상, 예상 시간, 요약
- `PreparationChecklist`: 시작 전 준비물 확인
- `WarningGate`: 필수 경고 동의 전 진행 차단
- `ReaderStep`: 현재 단계와 성공 확인
- `DecisionOptions`: 분기 선택
- `TroubleshootingAccordion`: 현재 단계에 관련된 문제 해결
- `StickyActionBar`: 이전, 완료 확인, 다음
- `CompletionScreen`: 완료 메시지, 요약, 인쇄, 초기화
- `ReaderSettings`: 테마, 진행 초기화, 전체 개요

이 목록은 리더 화면에서 쓰이는 컴포넌트이며 배치 그룹과 일치하지 않는다. `DecisionOptions`는 작성기 미리보기와 공유하므로 `components/content/`에, `StickyActionBar`는 `components/layout/`에 둔다. (`File_Structure.md` §2.1)

### 5.5. 인쇄 스타일

```css
@media print {
  .editor-only,
  .reader-actions,
  .theme-toggle,
  .copy-button,
  .toast-region {
    display: none !important;
  }

  .step-card,
  .warning-card,
  pre,
  figure {
    break-inside: avoid;
  }

  body {
    background: #fff;
    color: #000;
    font-size: 11pt;
  }

  a[href^='http']::after {
    content: ' (' attr(href) ')';
    font-size: 0.85em;
  }
}
```

---

## 6. 파일 구조 (File Structure)

파일 구조는 이 문서에서 정의하지 않는다. **`docs/File_Structure.md`를 기준 문서로 사용한다.**

기술 백서와 디자인 백서가 각각 다른 트리를 유지하면 그룹 이름, 컴포넌트 이름, 스타일 파일 구성이 서로 어긋나 구현 중 드리프트가 발생한다. 두 백서의 파일 구조를 하나로 통합해 `docs/File_Structure.md`로 분리했다.

해당 문서에서 확인할 내용:

| 찾는 것                                              | 위치                   |
| ---------------------------------------------------- | ---------------------- |
| 저장소 최상위 구조, 설정 파일, CI, 검증 산출물 경로  | `File_Structure.md` §1 |
| `src/` 전체 트리와 디렉터리별 책임                   | `File_Structure.md` §2 |
| 모듈 경계 규칙, 살균 경계, 번들 분리, 리더 이중 구현 | `File_Structure.md` §3 |
| 컴포넌트·모듈 파일 명명 규칙                         | `File_Structure.md` §4 |
| `tests/` 구조와 기준 픽스처                          | `File_Structure.md` §5 |
| `scripts/` 구조와 검증 스크립트                      | `File_Structure.md` §6 |
| 확정된 구조 결정 9건과 그 근거                       | `File_Structure.md` §7 |
| phase별 디렉터리 생성 시점                           | `File_Structure.md` §9 |

이 절이 담고 있던 모듈 경계 규칙(§6.1)은 `File_Structure.md` §3으로 옮겼다. 본 백서의 §2.3 데이터 모델, §4 아키텍처, §5 UI 구현 가이드, §7 주의사항은 변경 없이 유효하며, 그 내용을 어느 파일에 배치할지는 `File_Structure.md`가 정한다.

---

## 7. 개발 시 주의사항 (Implementation Notes)

### 7.1. 보안 (Security)

1. 사용자 Markdown의 raw HTML은 기본 비활성화한다.
2. `dangerouslySetInnerHTML`은 살균된 Markdown 렌더링 경계 한 곳에서만 사용한다.
3. 허용 링크 프로토콜은 `http:`와 `https:`로 제한한다.
4. 외부 링크에는 `target="_blank" rel="noopener noreferrer"`를 적용한다.
5. 파일명, 제목, 캡션, 코드, 오류 메시지를 HTML 문자열 결합에 직접 삽입하지 않는다.
6. JSON 내보내기와 HTML 임베딩 직렬화 함수를 분리한다.
7. 내보낸 HTML은 `eval`, `new Function`, 동적 스크립트 삽입을 사용하지 않는다.
8. 이미지 SVG 업로드는 MVP에서 차단한다. SVG가 필요하면 신뢰된 아이콘 세트만 코드 번들에 포함한다.
9. Blob URL은 컴포넌트 해제 또는 교체 시 `URL.revokeObjectURL()`로 해제한다.
10. 샘플 XSS 픽스처를 CI에서 매번 실행한다.

### 7.2. 개인정보 및 데이터 정책

- 작성 내용은 기본적으로 사용자의 브라우저를 벗어나지 않는다.
- 분석 도구와 광고 스크립트를 MVP에 포함하지 않는다.
- 내보낸 HTML은 네트워크 요청을 수행하지 않는다.
- 로컬 저장 삭제 기능은 가이드별 삭제와 전체 데이터 초기화를 분리한다.
- 삭제 전 JSON 백업을 선택할 수 있게 한다.
- 민감한 비밀번호, 복구 코드, 주민등록번호를 가이드 본문에 직접 적지 말라는 경고 템플릿을 제공한다.

### 7.3. 성능 최적화 (Optimization)

- 작성기 화면과 미리보기/내보내기 모듈을 코드 스플리팅한다.
- 단계 목록은 100개 이상일 때 가상화를 검토하되, MVP는 단순 DOM과 측정으로 시작한다.
- 상태 선택자를 세분화해 한 블록 입력이 전체 단계 목록을 다시 렌더링하지 않도록 한다.
- 이미지 디코딩과 압축은 가능한 경우 Worker 또는 비동기 흐름으로 이동한다.
- 내보내기 중 변환된 자산은 체크섬 기준으로 캐시한다.
- DOMPurify와 Markdown 렌더링 결과는 블록 내용 변경 시에만 재계산한다.
- 리더 런타임은 작성기 라이브러리를 포함하지 않는 독립 번들로 유지한다.

### 7.4. 접근성 (Accessibility)

- 단계 번호만으로 의미를 전달하지 않고 제목을 함께 읽게 한다.
- 체크박스 라벨에 성공 기준 전체 문장을 연결한다.
- 분기 선택지는 라디오 그룹으로 구현한다.
- 접이식 오류 해결은 `button`, `aria-expanded`, `aria-controls`를 사용한다.
- 단계 이동 후 새 단계 제목에 프로그램적으로 포커스를 이동하되 스크린 리더에만 과도한 알림이 발생하지 않게 한다.
- 드래그 재정렬에는 키보드 대체 동작과 위치 변경 알림을 제공한다.
- 색상 대비, 200% 확대, 고대비 모드, 동작 감소 설정을 테스트한다.
- 완료 상태는 체크 아이콘·문구·색상을 함께 사용한다.

### 7.5. 브라우저 및 파일 실행 이슈

1. `file://` 환경의 LocalStorage 동작은 브라우저별 차이가 있으므로 기능 감지 후 경고한다.
2. Safari 개인 정보 보호 모드에서는 IndexedDB 또는 저장 용량이 제한될 수 있다.
3. Clipboard API는 보안 컨텍스트가 아닌 로컬 파일에서 제한될 수 있으므로 폴백이 필요하다.
4. 매우 큰 Data URL 이미지는 모바일 브라우저 메모리를 압박할 수 있다.
5. 인쇄 결과는 브라우저와 운영체제의 여백·머리글 설정에 따라 달라질 수 있다.
6. 모바일 브라우저의 동적 주소 표시줄 때문에 `100vh` 대신 `100dvh`와 폴백을 사용한다.
7. 다크 모드에서 인쇄할 때는 강제로 흰 배경·검정 텍스트를 적용한다.

### 7.6. 테스트 계획

#### 단위 테스트

- Zod 스키마의 정상·경계·오류 케이스
- 분기 규칙 평가 순서
- 순환·도달 불가 단계 검출
- 활성 경로와 진행률 계산
- 안전한 파일명 생성
- JSON 안전 직렬화
- URL 프로토콜 필터
- Markdown 섹션 매핑
- 이미지 중복 체크섬

#### 통합 테스트

- 5단계 가이드 생성 → 자동 저장 → 새로고침 복원
- Markdown 가져오기 → 매핑 수정 → 저장
- 단계 삭제 시 분기 참조 처리
- JSON 내보내기 → 재가져오기 동등성
- 이미지 포함 HTML 내보내기 → 오프라인 열기
- 이전 분기 선택 변경 → 이후 활성 경로 재계산
- 리더 진행 저장 → 새로고침 복원 → 초기화

#### E2E 테스트

- 데스크톱 작성 전 과정
- 360px 모바일 리더 전 과정
- 키보드 전용 작성과 리더 진행
- 다크·라이트·시스템 테마
- 브라우저 인쇄 미리보기
- Chromium, Firefox, WebKit에서 단일 HTML 실행
- 외부 네트워크 차단 상태에서 자산 누락 0건

#### 보안 테스트

- `<script>`, 이벤트 핸들러, `javascript:` 링크
- `</script>`를 포함한 JSON 문자열
- 악성 SVG 및 `data:text/html`
- Markdown 이미지 URL과 링크 속성 우회
- 비정상적으로 깊은 Markdown 구조와 초대형 입력

### 7.7. 릴리스 완료 기준 (Definition of Done)

- Must 요구사항 100% 구현
- 치명·높음 등급 접근성 오류 0건
- 분기·가져오기·내보내기 핵심 순수 함수 테스트 커버리지 90% 이상
- 전체 코드 테스트 커버리지 80% 이상 목표
- 지원 브라우저 E2E 통과
- 외부 요청 0건인 샘플 HTML 검증 통과
- 20MB 이하 샘플 내보내기와 재실행 통과
- 저장소 손상·용량 초과·클립보드 실패의 사용자 메시지 확인
- README에 로컬 개발, 빌드, 배포, 데이터 삭제 방법 문서화

### 7.8. 단계별 구현 순서

1. GuideDocument 타입·Zod 스키마·기본 데이터
2. IndexedDB 저장소와 로컬 가이드 대시보드
3. 메타·준비물·경고·단계 편집기
4. 콘텐츠 블록 렌더러와 이미지 자산 파이프라인
5. 분기 규칙 편집기와 그래프 검증
6. 리더 화면과 진행 상태 저장
7. JSON 가져오기·내보내기
8. 독립 실행형 HTML 빌더
9. Markdown 가져오기와 매핑 검토
10. 인쇄 스타일, 접근성, 브라우저 QA

---

## 부록 A. MVP 권장 템플릿 구조

```text
가이드 소개
├── 제목
├── 대상 사용자
├── 예상 소요 시간
└── 요약

시작 전
├── 준비물 체크리스트
└── 필수 경고 확인

진행
├── 단계 1
│   ├── 설명
│   ├── 명령어/링크/이미지
│   ├── 오류 해결
│   └── 성공 확인
├── 단계 2
│   └── 조건 분기
└── 단계 N

완료
├── 완료 메시지
├── 수행 요약
├── 인쇄/PDF
└── 진행 초기화
```

## 부록 B. 공개 확장 시 API 경계

향후 공개 호스팅 기능이 추가될 경우 편집기 도메인과 다음 인터페이스만 연결한다.

```ts
export interface GuidePublishingAdapter {
  publish(document: GuideDocument): Promise<{
    publicId: string;
    revision: number;
    url: string;
  }>;
  unpublish(publicId: string): Promise<void>;
  fetch(publicId: string, revision?: number): Promise<GuideDocument>;
}
```

서버 기능이 추가되어도 단일 HTML 내보내기와 로컬 JSON 보존은 제거하지 않는다.
