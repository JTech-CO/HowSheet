/**
 * 프롬프트 사양 - 무엇을 담고 어떻게 보일까.
 *
 * 기준: v2 제품정의 §4(요소 버튼 10종), §5(디자인 축 4종). 하네스 P2 할 일 1·2·3.
 *
 * 각 항목에 **프롬프트에 들어갈 요구 문구**를 함께 둔다. 제품정의 §4의 표가
 * 버튼과 요구를 짝지어 정의하므로, 둘을 떼어 놓으면 P3의 조립기가 같은 목록을
 * 다시 만들게 되고 한쪽만 고쳐지는 날이 온다.
 *
 * 타입과 동결된 데이터만 둔다. 로직은 `spec.defaults.ts`가 갖는다.
 */

// ────────────────────────────────────────────────────────── 요소 (무엇을 담을까)

export const ELEMENT_IDS = [
  'diagram',
  'flowchart',
  'infographic',
  'code',
  'comparison',
  'timeline',
  'checklist',
  'steps',
  'glossary',
  'faq',
] as const;

export type ElementId = (typeof ELEMENT_IDS)[number];

export interface ElementSpec {
  id: ElementId;
  label: string;
  /** 버튼 아래 한 줄 설명. 무엇을 고르는 것인지 알려 준다. */
  hint: string;
  /** 이 요소를 고르면 생성 프롬프트에 들어가는 요구. (§4) */
  requirement: string;
}

export const ELEMENTS: readonly ElementSpec[] = [
  {
    id: 'diagram',
    label: '다이어그램',
    hint: '구성 요소와 관계',
    requirement:
      '구성 요소와 그 관계를 인라인 SVG 다이어그램으로 그린다. 이미지 링크를 쓰지 않는다. ' +
      '도형마다 이름을 글자로 적고, 선에는 관계를 나타내는 짧은 라벨을 붙인다.',
  },
  {
    id: 'flowchart',
    label: '순서도',
    hint: '분기와 종료 조건',
    requirement:
      '절차를 위에서 아래로 흐르는 순서도로 그린다. 분기에는 판단 기준을, 각 끝에는 ' +
      '종료 조건을 명시한다. 어느 경로로도 끝에 도달할 수 있어야 한다.',
  },
  {
    id: 'infographic',
    label: '인포그래픽',
    hint: '핵심 수치 강조',
    requirement:
      '핵심 수치를 크게 배치한다. 숫자마다 단위와 그 값이 어디서 왔는지를 함께 적는다. ' +
      '자료에 없는 수치를 지어내지 않는다.',
  },
  {
    id: 'code',
    label: '코드 블럭',
    hint: '명령어와 예제',
    requirement:
      '코드와 명령어를 코드 블럭으로 넣는다. 언어를 표시하고 줄바꿈과 들여쓰기를 ' +
      '보존한다. 복사 버튼을 붙이되 복사가 실패해도 전체 선택으로 쓸 수 있게 한다.',
  },
  {
    id: 'comparison',
    label: '비교표',
    hint: '항목 × 기준',
    requirement:
      '항목을 행으로, 비교 기준을 열로 하는 표를 만든다. 우열을 매기지 말고 ' +
      '차이를 드러낸다. 좁은 화면에서는 표가 가로로 스크롤되게 한다.',
  },
  {
    id: 'timeline',
    label: '타임라인',
    hint: '시간 축 사건',
    requirement:
      '사건을 시간 축에 배열한다. 한 시점에 일어난 일과 기간에 걸친 일을 시각적으로 ' +
      '구분한다. 자료에 시점이 없는 항목은 넣지 않는다.',
  },
  {
    id: 'checklist',
    label: '체크리스트',
    hint: '실행 가능한 항목',
    requirement:
      '실행 가능한 항목을 체크리스트로 만든다. 항목마다 "무엇을 보면 done인지" ' +
      '완료 판정 기준을 함께 적는다.',
  },
  {
    id: 'steps',
    label: '단계 절차',
    hint: '번호가 붙은 순서',
    requirement:
      '번호를 붙인 단계로 순서를 나눈다. 각 단계에 그 단계가 성공했는지 확인하는 ' +
      '방법을 적는다.',
  },
  {
    id: 'glossary',
    label: '용어 정리',
    hint: '자료에 나온 용어',
    requirement:
      '자료에 실제로 나온 용어만 골라 뜻을 적는다. 자료에 없는 용어를 새로 ' + '가져오지 않는다.',
  },
  {
    id: 'faq',
    label: 'FAQ',
    hint: '자료가 답할 수 있는 질문',
    requirement:
      '자료가 답할 수 있는 질문만 묻고 답한다. 답을 자료에서 찾을 수 없는 질문은 ' + '넣지 않는다.',
  },
];

// ──────────────────────────────────────────────────── 디자인 축 (어떻게 보일까)

export const DESIGN_AXIS_IDS = ['color', 'tone', 'density', 'typography'] as const;
export type DesignAxisId = (typeof DESIGN_AXIS_IDS)[number];

export interface DesignOption {
  id: string;
  label: string;
  /** 이 값을 고르면 생성 프롬프트에 들어가는 요구. CSS로 옮길 수 있어야 한다. (§6.2-3) */
  requirement: string;
}

export interface DesignAxis {
  id: DesignAxisId;
  label: string;
  hint: string;
  options: readonly DesignOption[];
}

export const DESIGN_AXES: readonly DesignAxis[] = [
  {
    id: 'color',
    label: '색',
    hint: '얼마나 색을 쓸지',
    options: [
      {
        id: 'monotone',
        label: '모노톤',
        requirement:
          '무채색만 쓴다. 배경·본문·보조 텍스트·경계선을 명도 차이로만 구분하고, ' +
          '강조는 색이 아니라 굵기와 크기로 한다.',
      },
      {
        id: 'accent',
        label: '절제된 컬러',
        requirement:
          '무채색을 기본으로 하고 강조색 **하나만** 쓴다. 그 색은 링크와 현재 상태에만 ' +
          '쓰고 장식에는 쓰지 않는다.',
      },
      {
        id: 'full',
        label: '풀 컬러',
        requirement:
          '색을 자유롭게 쓰되 역할을 정해 둔다. 같은 의미에는 같은 색을 쓰고, ' +
          '색 하나에 두 가지 뜻을 담지 않는다.',
      },
    ],
  },
  {
    id: 'tone',
    label: '톤',
    hint: '누가 읽을지',
    options: [
      {
        id: 'academic',
        label: '학술',
        requirement:
          '논문에 가까운 톤. 정의를 앞세우고 근거를 본문에 붙인다. 여백을 넉넉히 두고 ' +
          '본문 폭을 좁게 유지해 긴 글을 읽기 좋게 한다.',
      },
      {
        id: 'technical',
        label: '기술',
        requirement:
          '기술 문서 톤. 코드·명령어·설정값을 고정폭으로 두고 본문과 뚜렷이 구분한다. ' +
          '경고와 주의는 눈에 띄되 요란하지 않게 한다.',
      },
      {
        id: 'business',
        label: '비즈니스',
        requirement:
          '보고서 톤. 결론을 먼저 두고 근거를 뒤에 둔다. 수치와 비교를 앞세우고 ' +
          '문단은 짧게 끊는다.',
      },
      {
        id: 'education',
        label: '교육',
        requirement:
          '설명 자료 톤. 개념을 하나씩 소개하고 예를 바로 뒤에 붙인다. 용어를 처음 ' +
          '쓸 때 풀어 준다.',
      },
      {
        id: 'editorial',
        label: '에디토리얼',
        requirement:
          '읽는 글 톤. 제목과 본문의 크기 차이를 크게 두고 문단 사이를 넉넉히 띄운다. ' +
          '표와 목록보다 문장을 앞세운다.',
      },
    ],
  },
  {
    id: 'density',
    label: '밀도',
    hint: '얼마나 촘촘하게',
    options: [
      {
        id: 'roomy',
        label: '여백 넉넉',
        requirement: '간격 스케일을 크게 잡는다. 섹션 사이를 크게 띄우고 한 화면에 적게 담는다.',
      },
      {
        id: 'standard',
        label: '표준',
        requirement: '간격을 일정한 스케일로 두고 섹션 구분이 보일 만큼만 띄운다.',
      },
      {
        id: 'compact',
        label: '조밀',
        requirement:
          '간격을 좁게 잡아 한 화면에 많이 담는다. 다만 줄 간격은 줄이지 않는다 - ' +
          '줄이면 본문을 읽을 수 없다.',
      },
    ],
  },
  {
    id: 'typography',
    label: '타이포',
    hint: '글꼴 계열',
    options: [
      {
        id: 'sans',
        label: '산세리프',
        requirement: '제목과 본문 모두 산세리프 시스템 폰트 스택을 쓴다. 웹폰트를 불러오지 않는다.',
      },
      {
        id: 'serif',
        label: '세리프',
        requirement: '제목과 본문 모두 세리프 시스템 폰트 스택을 쓴다. 웹폰트를 불러오지 않는다.',
      },
      {
        id: 'mixed',
        label: '혼합',
        requirement:
          '제목은 세리프, 본문은 산세리프로 둔다. 코드는 고정폭이다. 폰트 계열은 ' +
          '이 셋을 넘지 않는다.',
      },
    ],
  },
];

/** 축마다 하나씩 고른 결과. 선택 없음 상태가 없다. (P2 DoD 2) */
export type DesignChoice = Record<DesignAxisId, string>;
