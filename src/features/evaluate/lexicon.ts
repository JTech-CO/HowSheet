/**
 * 채점기가 찾는 말들.
 *
 * 기준: v2 제품정의 §4(요소), §5.1(금지 목록), §6.2-5(결과물 요구). 하네스 P8 할 일 3.
 *
 * 규칙과 데이터를 떼어 둔다. 채점 절차(`grade.ts`)는 이 목록이 무엇을 담는지
 * 모르고, 이 목록은 절차가 어떻게 도는지 모른다. 오탐·미탐을 고칠 때 손대는
 * 곳이 여기 한 곳이어야 한다.
 *
 * ## 모호한 말과 모호하지 않은 말
 *
 * `linear-gradient`나 `<script src="https://…">`는 쓰는 순간 금지 기법이다.
 * 반면 "글리치"나 "CDN"은 자료가 다루는 **내용**일 수 있다 - 회의록이 "화면
 * 글리치 버그"를 적었거나 기술 문서가 CDN 캐시를 설명할 수 있다. 그런 말은
 * `ambiguous`로 표시하고, 그 말이 자료에 나오면 자료를 옮긴 것으로 본다.
 *
 * 이 예외가 뚫리는 길이 있다. 자료에 "네온"이 나오면 네온 글로우를 지시하는
 * 프롬프트가 통과한다. 기계적 검사의 한계이고 `docs/HowSheet_v2_평가_AI채점_가이드.md`에
 * 적어 두었다.
 */

import type { ElementId } from '../../domain/spec.types.ts';

// ─────────────────────────────────────────────────────────────── 금지 기법

/**
 * 금지 목록 범주. `PROHIBITIONS`와 **같은 순서**다. 테스트가 길이를 맞춰 본다 -
 * 금지 항목을 하나 더하고 범주를 더하지 않으면 그 항목은 채점되지 않는다.
 */
export const PROHIBITION_CATEGORIES = [
  'neon-gradient',
  'glassmorphism',
  'emoji-heading',
  'particles',
  'motion',
  'font-mixing',
  'external-resources',
] as const;

export type ProhibitionCategory = (typeof PROHIBITION_CATEGORIES)[number];

/** 이 말이 뒤따르면 자료의 낱말이라도 꾸밈 지시다. "글리치 버그"는 내용이고 "글리치 효과"는 기법이다. */
export const STYLING_SUFFIX = /^\s*(?:효과|애니메이션|연출|스타일|effect|animation|style)/i;

/** 호버 동작의 계기와 결과. 절이 둘로 나뉘어도 같은 줄이면 하나의 지시로 본다. */
export const HOVER_TRIGGER =
  /hover|호버|마우스\s*오버|(?:마우스|커서|포인터)[^.。\n]{0,15}(?:올리|가져가|올려놓)/i;
/** "되돌아가는 화살표"의 "돌아가"는 동작이 아니다. (P8 청팀 검증) */
export const HOVER_EFFECT =
  /확대|회전|커지|키우|키워|부풀|기울|(?<!되)돌리|(?<!되)돌아가|튀어|scale|rotate/i;

/**
 * 프롬프트 대신 결과물을 내놓는다는 말. "완성본 HTML 파일 하나만 출력하라"는 지시이지
 * 답이 아니다 - "완성본은 아래와 같다"처럼 **내놓는** 말만 본다.
 */
export const ANSWER_INSTEAD =
  /완성본(?:은|을)?\s*(?:아래|다음|여기)|(?:아래|다음|여기)(?:는|은|에|가)?\s*[^.。\n]{0,12}완성본(?:입니다|이에요)|완성(?:한)?\s*(?:문서|페이지|결과물)(?:은|는)\s*(?:아래|다음)|(?:완성본|결과물)을?\s*(?:[가-힣]+\s*)?드립니다/;

export interface Term {
  pattern: RegExp;
  /** 자료의 내용일 수도 있는 말인가. 그렇다면 자료에 나올 때 예외로 둔다. */
  ambiguous: boolean;
}

const plain = (pattern: RegExp): Term => ({ pattern, ambiguous: false });
const content = (pattern: RegExp): Term => ({ pattern, ambiguous: true });

/** 부정 문맥이 아닌 절에서 이 말이 나오면 위반이다. */
export const PROHIBITED_TERMS: Readonly<
  Record<Exclude<ProhibitionCategory, 'emoji-heading' | 'font-mixing'>, readonly Term[]>
> = {
  'neon-gradient': [
    content(/네온|neon/i),
    content(/글로우|glow/i),
    content(/그라데이션|그러데이션/),
    plain(/(?:repeating-)?(?:linear|radial|conic)-gradient/i),
    plain(/gradient\s*(?:text|background|border|overlay|mesh|fill|button|heading|title)/i),
    plain(/(?:text|background|mesh|colou?r)\s*gradient/i),
    content(/(?<![A-Za-z])gradients?(?![A-Za-z])/i),
    // "그래디언트 벡터"는 경사 하강법의 말이다. 시각 효과와 붙어 나올 때만 잡는다.
    plain(
      /그(?:라|래|레이)디언트\s*(?:배경|텍스트|글자|제목|효과|색|오버레이|테두리|버튼|띠)|그(?:라|래|레이)디언트(?:로|으로)\s*(?:칠|채우|깔|입히|넣|두르)/,
    ),
    plain(/(?:배경|텍스트|글자|제목|색)(?:에|을|를|의|으로|로)?\s*그(?:라|래|레이)디언트/),
    // 색 이름이나 색 코드 둘 이상을 잇는 전환은 이름을 말하지 않아도 그라데이션이다.
    plain(
      /(?:색|#[0-9a-f]{3,8}`?)\s*에서\s*[^.。\n]{0,30}(?:색|#[0-9a-f]{3,8}`?)\s*(?:으로|로)\s*[^.。\n]{0,12}(?:넘어가|이어지|번지|흐르)/i,
    ),
    plain(
      /(?:색|청록|보라|분홍|주황|하늘)(?:에서|부터)\s*[가-힣]{1,4}(?:색)?(?:으로|로)\s*(?:넘어가|이어지|번지)/,
    ),
    content(/오로라|aurora|무지개\s*색|rainbow/i),
    content(/형광|발광|빛나(?:게|는|도록|보이)|luminous|halo/i),
    plain(/text-shadow\s*:\s*0\s+0\s+\d|box-shadow\s*:\s*0\s+0\s+\d+px\s+(?:\d+px\s+)?#/i),
    plain(/background-clip\s*:\s*text/i),
  ],
  glassmorphism: [
    content(/글래스\s*모피즘|glass\s*-?\s*morphism/i),
    plain(/backdrop-filter|backdrop-blur|backdrop\s+blur/i),
    plain(
      /반투명\s*유리|유리\s*(?:질감|효과|패널|카드)|유리처럼|frosted\s*glass|젖빛\s*유리|translucent|see-through|blurred/i,
    ),
    plain(/반투명한?\s*(?:판|카드|패널|상자)/),
    plain(
      /(?:배경|뒤)\s*(?:를|을|가)?\s*(?:흐리게|흐릿하게|흐릿한)|배경\s*블러|블러\s*(?:배경|효과|패널)|filter\s*:\s*blur/i,
    ),
  ],
  particles: [
    content(/파티클|particles?/i),
    content(/블롭|(?<![A-Za-z])blobs?(?![A-Za-z])/i),
    plain(
      /떠다니|떠오르며|떠돌|흩날리|흩뿌|부유하는|floating\s+(?:shapes?|orbs?|particles?|blobs?|bubbles?|dots?)/i,
    ),
    plain(/색\s*덩어리|물방울처럼\s*둥근|별\s*모양\s*점|점들이\s*[^.。\n]{0,12}(?:반짝|움직|흔들)/),
    plain(/@keyframes\s+(?:drift|float|floating|bubble|particle)/i),
    plain(
      /(?:마우스|커서|포인터)\s*(?:를|의|가)?\s*(?:따라|추적|주변|위치|움직임)|(?:위치|움직임)을\s*따라\s*(?:움직|옮겨)/i,
    ),
    plain(
      /(?:mouse|cursor|pointer)[\s-]*(?:tracking|follow(?:ing)?|trail|spotlight)|mousemove|pointermove/i,
    ),
  ],
  motion: [
    content(/shimmer|쉬머|시머/i),
    content(/marquee|마퀴|마키/i),
    content(/glitch|글리치/i),
    plain(/빛줄기가?\s*[^.。\n]{0,12}훑|반짝이는\s*로딩|skeleton\s*(?:shimmer|loading)/i),
    plain(/전광판|끝없이\s*흘러|흐르는\s*(?:텍스트|문구|띠|글자)|옆으로\s*흐르/),
    plain(/지직거|노이즈\s*효과|색이\s*어긋나/),
    plain(
      /(?:hover|호버|마우스\s*오버|(?:마우스|커서|포인터)[^.。\n]{0,15}(?:올리|가져가|올려놓))[^\n]{0,40}(?:확대|회전|커지|키우|키워|부풀|기울|(?<!되)돌리|(?<!되)돌아가|튀어|scale|rotate)/i,
    ),
    plain(/(?:확대|회전|scale|rotate)[^\n]{0,40}(?:hover|호버)/i),
  ],
  'external-resources': [
    plain(
      /(?:https?:)?\/\/(?:[\w-]+\.)*(?:jsdelivr|unpkg|cdnjs|googleapis|gstatic|bootstrapcdn|fontawesome|typekit|esm\.(?:sh|run)|skypack)/i,
    ),
    content(
      /(?<![A-Za-z])(?:jsdelivr|unpkg|cdnjs|esm\.(?:sh|run)|skypack|googleapis|gstatic)(?![A-Za-z])/i,
    ),
    plain(/(?:https?:)?\/\/cdn[\w-]*\./i),
    plain(/<script[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i),
    plain(/<link[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//i),
    // 태그 속성 값으로 들어간 외부 주소 (srcset, poster, <image href> ...)
    plain(/<(?!a\s)[a-z][\w-]*\s[^>]*=\s*["']?[^"'>]*https?:\/\//i),
    plain(/@import|url\(\s*["']?(?:https?:)?\/\//i),
    plain(/import\s*(?:\(\s*)?["'](?:https?:)?\/\//i),
    plain(/fetch\s*\(|XMLHttpRequest|sendBeacon|iframe/i),
    plain(
      /(?:열\s*때|열면|로드\s*시|실시간으로)[^.。\n]{0,30}(?:받아\s*와|가져와|불러와|요청을\s*보내)|(?:초|분|시간)\s*마다[^.。\n]{0,30}(?:다시\s*)?(?:받아\s*와|가져와|불러와)/,
    ),
    content(/유튜브|youtube|구글\s*지도|google\s*maps/i),
    plain(/favicon\.ico|favicon[^.。\n]{0,20}(?:주소|사이트|URL)/i),
    plain(/(?:로그|통계|분석)\s*서버로\s*(?:전송|보내)|조회수를\s*집계|열람\s*기록을/),
    content(
      /웹\s*(?:폰트|글꼴)|web\s*-?\s*fonts?|google\s*fonts|구글\s*(?:폰트|글꼴)|adobe\s*fonts|typekit/i,
    ),
    content(
      /애널리틱스|analytics|gtag|google\s*tag|구글\s*태그|태그\s*매니저|GTM-|plausible|mixpanel|hotjar|amplitude|추적\s*스크립트|트래킹\s*(?:스크립트|코드|픽셀)|tracking\s*(?:script|pixel|code)/i,
    ),
    content(
      /CDN[^.。\n]{0,40}(?:불러|로드|load|import|include|가져|받아|연결|링크|넣|쓰|사용)|(?:불러|로드|load|import|include|가져)[^.。\n]{0,40}CDN/i,
    ),
    plain(
      /(?:외부|external)[^.。\n]{0,20}(?:스크립트|script|라이브러리|library|스타일\s*시트|stylesheet|이미지|image|폰트|font|글꼴|리소스|resource|파일|서버|사이트|주소)[^.。\n]{0,20}(?:불러|로드|load|import|include|가져|링크|연결|받아)/i,
    ),
    // 주소에서 **꾸밈 자원**을 가져오라는 말만 본다. "스토리지 주소에서 백업 파일을 받아와"는 자료의 절차다.
    plain(
      /(?:사이트|서버|주소|URL|링크)[^.。\n]{0,25}(?:이미지|로고|아이콘|스크립트|글꼴|폰트|스타일|영상|지도)[^.。\n]{0,30}(?:불러|가져|로드|받아)/i,
    ),
    // 인라인으로 넣을 수 없는 크기의 라이브러리는 이름만으로 외부 요청을 뜻한다.
    content(
      /(?<![A-Za-z#\w])(?:chart\.?js|d3(?:\.js)?(?!\w)|mermaid|font\s*awesome|bootstrap|jquery|tailwind(?:\s*css)?|alpine\.?js|three\.?js|lottie|gsap|animate\.css|swiper|highlight\.js|prism\.?js|katex|mathjax|google\s*charts|leaflet|mapbox|plotly|echarts|clipboard\.js)(?![A-Za-z])/i,
    ),
  ],
};

/** 제목에 붙은 그림 문자. ©·®·™·‼·⁉는 그림 문자로 분류되지만 장식이 아니다. */
export const EMOJI = /(?![©®™‼⁉])\p{Extended_Pictographic}/u;

/** 그림 문자처럼 쓰이는 다른 표기: 키캡 숫자(1️⃣), 국기(🇰🇷), 단축 코드(:rocket:). */
export const EMOJI_LIKE =
  /[0-9#*]️?⃣|[\u{1F1E6}-\u{1F1FF}]{2}|(?<![\w:]):[a-z0-9_+-]{2,}:(?![\w:])/u;

export const EMOJI_WORD = /이모지|이모티콘|emoji|아이콘\s*문자/i;

export const HEADING_WORD =
  /제목|헤딩|heading|타이틀|title|소제목|머리글|머리말|헤더|머리에|열\s*머리|섹션\s*(?:이름|명|머리)|첫\s*줄|<h[1-6]|(?<![A-Za-z])h[1-6](?!\d)/i;

/** 코드용 고정폭은 세지 않는다. (2026-09-15 사용자 확정) */
export const FONT_CATEGORIES: Readonly<Record<'serif' | 'sans' | 'handwriting' | 'display', Term>> =
  {
    serif: content(/(?<!산\s?)세리프|명조|바탕체|(?<!sans[-\s]?)(?<![A-Za-z])serif(?![A-Za-z])/i),
    sans: content(/산\s?세리프|sans[-\s]?serif|고딕|gothic|돋움체|굴림체/i),
    handwriting: content(
      /손\s?글씨|손으로\s*쓴\s*듯한|필기체|붓글씨|펜글씨|붓펜|궁서체|cursive|handwriting|캘리그라피|calligraphy/i,
    ),
    display: content(
      /디스플레이\s*용?\s*(?:[가-힣]+\s*)?(?:서체|폰트|글꼴)|display\s*(?:font|typeface)|장식(?:용)?\s*(?:서체|폰트|글꼴)|레터링|decorative\s*font|둥근모꼴|임팩트체/i,
    ),
  };

/** 이름으로 부른 글꼴과 그 계열. 이름이 곧 계열 하나를 쓴다는 뜻이다. */
export const NAMED_FONTS: ReadonlyArray<{
  pattern: RegExp;
  category: keyof typeof FONT_CATEGORIES;
}> = [
  {
    pattern:
      /pretendard|spoqa|inter(?![a-z])|roboto|open\s*sans|lato|montserrat|poppins|나눔\s*(?:고딕|스퀘어)|nanum\s*(?:gothic|square)|noto\s*sans|ibm\s*plex\s*sans|source\s*sans|gowun\s*dodum|gmarket\s*sans|s-core\s*dream|에스코어\s*드림|raleway|helvetica|arial/i,
    category: 'sans',
  },
  {
    pattern:
      /playfair|lora|merriweather|noto\s*serif|나눔\s*명조|nanum\s*myeongjo|ibm\s*plex\s*serif|source\s*serif|gowun\s*batang|georgia|times\s*new\s*roman|리디\s*바탕|마루\s*부리/i,
    category: 'serif',
  },
  {
    pattern:
      /pacifico|dancing\s*script|caveat|나눔\s*(?:손\s*글씨|바른\s*펜|펜)|nanum\s*(?:pen|brush)|brush\s*script|comic\s*sans/i,
    category: 'handwriting',
  },
  {
    pattern:
      /bebas\s*neue|oswald|black\s*han\s*sans|do\s*hyeon|lobster|jua(?![a-z])|(?:배민|배달의\s*민족)\s*(?:도현|주아|한나)|도현체|잘난체|impact/i,
    category: 'display',
  },
];

// ──────────────────────────────────────────────────────────────────── 요소

/**
 * 요소를 가리키는 말.
 *
 * AI는 조립기의 문장을 다시 쓰므로 요구 문구 그대로를 기대할 수 없다. 대신 그
 * 요소의 **이름**이 부정 문맥이 아닌 곳에 나오는지 본다. "단계"나 "코드"처럼
 * 흔한 말은 넣지 않는다 - 넣으면 무엇이든 반영된 것으로 잡힌다.
 */
export const ELEMENT_KEYWORDS: Readonly<Record<ElementId, RegExp>> = {
  diagram: /다이어그램|구성도|관계도|diagram/i,
  flowchart: /순서도|흐름도|플로(?:우)?\s*차트|flow\s*-?\s*chart/i,
  infographic: /인포그래픽|infographic/i,
  code: /코드\s*블[럭록]|code\s*blocks?/i,
  comparison: /비교\s*(?:표|테이블)|comparison\s*table/i,
  timeline: /타임라인|연대표|time\s*line/i,
  checklist: /체크\s*리스트|점검표|check\s*list/i,
  steps:
    /단계\s*절차|단계별\s*(?:절차|안내|순서)|번호(?:를)?\s*(?:붙인|매긴)\s*(?:\d+\s*)?단계|번호\s*목록|step[-\s]*by[-\s]*step/i,
  glossary: /용어\s*정리|용어집|용어\s*설명|glossary/i,
  faq: /(?<![A-Za-z])FAQ(?![A-Za-z])|자주\s*묻는\s*질문/i,
};

// ──────────────────────────────────────────────────────────── 결과물 요구

/** 제품정의 §6.2-5의 네 가지. 하나라도 말하지 않으면 결과물이 그것을 지킬 이유가 없다. */
export const OUTPUT_REQUIREMENT_GROUPS = [
  {
    id: 'single-html',
    label: '단일 HTML 파일',
    pattern:
      /HTML\s*파일\s*(?:하나|한\s*개|1개)|(?:하나|한|단일|1개)의?\s*HTML\s*파일|HTML\s*(?:한|단일)\s*파일|\.?html`?\s*파일\s*(?:하나|한\s*개)|단일\s*HTML|single[\s-]+(?:self-contained\s+)?HTML|self-contained\s+HTML/i,
    /** 요구를 말한 뒤 풀어 주는 말. 요구 낱말이 있으니 있다고만 세면 이런 문장이 요구를 채운다. */
    relaxation:
      /(?:여러|별도(?:의)?|따로)\s*파일[^.。\n]{0,15}(?:나눠도|나누어도|괜찮|된다|됩니다)|하나로\s*묶지\s*않아도|파일로\s*나눠도/,
  },
  {
    id: 'offline',
    label: '외부 요청 0건',
    pattern:
      /외부\s*(?:[가-힣]+\s*)?요청|오프라인|인터넷이?\s*(?:끊긴|없는|없이)|네트워크\s*없이|offline|external\s*requests?/i,
    relaxation:
      /외부\s*(?:[가-힣]+\s*)?요청[^.。\n]{0,15}(?:있어도|괜찮|허용|받아도)|오프라인[^.。\n]{0,20}(?:요구하지\s*않|고려하지\s*않|필요\s*없|신경\s*쓰지)/,
  },
  {
    id: 'print',
    label: '인쇄',
    pattern: /인쇄(?!체)|@media\s*print|(?<![A-Za-z])print/i,
    relaxation: /인쇄[^.。\n]{0,15}(?:고려하지\s*않|필요\s*없|신경\s*쓰지\s*않|않아도)/,
  },
  {
    id: 'narrow',
    label: '320px',
    pattern: /(?<!\d)320\s*(?:px|픽셀)/i,
    // 표·코드가 **그 요소 안에서** 스크롤하는 것은 요구 그대로다. (OUTPUT_REQUIREMENTS 4번)
    relaxation:
      /(?<!(?:안쪽의|안에서|안의|내부의)\s)가로\s*스크롤[^.。\n]{0,12}(?:생겨도|있어도|괜찮|허용)|(?:모바일|좁은\s*화면|320\s*(?:px|픽셀))[^.。\n]{0,25}(?:신경\s*쓰지\s*않|고려하지\s*않|대응(?:은|하지)?\s*(?:필요\s*없|않))/,
  },
] as const;

/** 결과물 요구를 다루는 구역 제목. 요소 반영을 볼 때 이 구역은 뺀다. "결과물 구성"은 아니다. */
export const REQUIREMENT_SECTION =
  /결과물\s*요구|요구\s*사항|요구사항|출력\s*(?:형식|조건)|반드시\s*지킬|requirements?/i;

/** 결과물 요구를 다루는 절. "표와 다이어그램은 그 안에서 스크롤한다"가 요소 지시로 세어지지 않게 한다. */
export const REQUIREMENT_CLAUSE =
  /인쇄(?!체)|print|스크롤|페이지\s*경계|(?<!\d)320\s*(?:px|픽셀)|오프라인|외부\s*요청|HTML\s*파일/i;

/** 금지 목록을 가리키는 말. 무력화 문장이 **목록에 대해** 말하는지 본다. */
export const PROHIBITION_REFERENCE =
  /금지\s*(?:목록|항목|사항)|(?:위|아래|이|앞의)\s*(?:의\s*)?(?:목록|항목)|(?:다음|아래|위)(?:은|는)\s|첫째|둘째|셋째|넷째|다섯째/;

/** 금지 목록을 무력화하는 말. 목록이 그대로 있어도 "무시해도 된다"가 붙으면 없는 것이다. */
export const PROHIBITION_DISABLING =
  /무시(?:해도|하세요|한다|합니다)|적용하지\s*않아도|적용\s*안\s*함|참고용|권고일\s*뿐|권장\s*사항일\s*뿐|따르지\s*않아도|자유롭게\s*(?:무시|바꿔|어겨)|예시일\s*뿐|오히려\s*적극|(?:목록|항목|금지)[^.。\n]{0,10}해제(?:됨|한다|합니다|해도)|\[해제/;

/** 금지 항목 뒤에 붙은 예외. "단색만 허용"처럼 더 좁히는 말은 예외가 아니다. */
export const PROHIBITION_EXCEPTION =
  /다만|단[,.]\s|예외로|제외하고는|(?<!만\s?)허용|해도\s*된다|받아\s*와도|괜찮|해제|무시/;

/** 자료를 믿지 말라는 명령. 부정 명령 그 자체라 부정 문맥이어도 본다. */
export const SOURCE_DISTRUST_COMMAND = /읽지\s*말|참고하지\s*말|내용을\s*옮기지\s*말|믿지\s*말/;

/** 자료를 틀렸다거나 가짜라고 하는 말. 부정 문맥("가상의 값은 넣지 않는다")이면 뜻이 반대라 본다. */
export const SOURCE_DISTRUST_CLAIM =
  /정정|오기(?:이며|이다|입니다)|값이?\s*(?:서로\s*)?바뀌어\s*있|오래된\s*내용|형식\s*예시|예시일\s*뿐|가상의\s*값|그럴듯한\s*(?:값|수치)으로|담당자에게\s*받은/;

/** 자료를 가리키는 말. 위의 두 말이 **자료에 대해** 말하는지 본다. */
export const SOURCE_REFERENCE = /자료|원문|위\s*표|아래\s*표|표의\s*값|값은|절은|수치/;

// ─────────────────────────────────────────────────────────────── 사실 검사

/**
 * 자료에 없어도 사실이 아닌 라틴 문자 이름.
 *
 * 대문자나 숫자가 섞인 라틴 토큰은 제품명·약어·버전일 가능성이 높아 자료에
 * 있어야 한다. 다만 결과물을 **어떻게 만들지** 말하는 데 필요한 이름 - 웹 기술,
 * 시스템 글꼴, 키 이름 - 은 자료와 무관하다. 소문자로 적는다.
 */
export const NAME_ALLOWLIST: ReadonlySet<string> = new Set(
  [
    // 웹 기술
    'html html5 css css3 svg js javascript dom url uri id ui ux aria wcag aa aaa',
    'viewbox currentcolor preserveaspectratio',
    'rgb rgba hsl hsla oklch hex utf-8 utf8 markdown md pdf png json faq ai a4 a3 b5 ok',
    'h1 h2 h3 h4 h5 h6 doctype pc http https api grid flexbox clipboard localstorage',
    'sessionstorage db on off q a sha sha-256 sha256 yaml csv jpg jpeg gif webp ico woff woff2',
    // 결과물을 만드는 방법으로 이름이 불리는 라이브러리. 쓰라고 하면 금지 기법 검사가 잡는다.
    'mathjax katex chart.js d3 mermaid jquery bootstrap tailwind',
    // 대상 AI
    'claude chatgpt gpt',
    // 시스템 글꼴 스택
    'system-ui blinkmacsystemfont segoe helvetica neue arial apple sd gothic neo malgun roboto',
    'georgia times new roman batang applemyungjo menlo monaco consolas courier',
    'sfmono-regular liberation mono dejavu ubuntu noto sans serif kr',
    // 키 이름
    'tab enter space shift esc escape ctrl cmd alt',
  ]
    .join(' ')
    .split(' '),
);
