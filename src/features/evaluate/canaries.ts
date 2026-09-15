/**
 * 일부러 나쁘게 만든 프롬프트 - 카나리아.
 *
 * 기준: 하네스 P8 주의 - "이 phase의 값어치는 '돌아간다'가 아니라 '나쁜 프롬프트를
 * 잡아낸다'다. 일부러 나쁜 프롬프트를 넣어 평가셋이 떨어뜨리는지 확인한다."
 *
 * ## 평가 명령의 일부다
 *
 * 카나리아를 단위 테스트에만 두면 `pnpm eval:prompts`는 채점기가 눈을 감아도
 * 통과한다. 그래서 실행기가 매번 좋은 프롬프트에 변이를 가하고, **기대한 검사가
 * 실제로 걸리는지** 본다. 하나라도 빠져나가면 평가 전체가 실패한다.
 *
 * ## 변이로 만든다
 *
 * 나쁜 프롬프트 파일을 따로 두면 조립기 문구가 바뀔 때마다 그 파일도 손으로
 * 고쳐야 하고, 고치지 않으면 엉뚱한 이유로 떨어진다. 좋은 프롬프트를 받아
 * 한 가지만 망가뜨리면 "이 검사가 이 결함을 잡는다"가 정확히 드러난다.
 */

import { PROHIBITIONS } from '../../domain/prompt.rules.ts';
import { ELEMENTS } from '../../domain/spec.types.ts';
import type { StudioDocument } from '../../domain/studio.types.ts';
import type { CheckId } from './grade.ts';
import {
  ELEMENT_KEYWORDS,
  OUTPUT_REQUIREMENT_GROUPS,
  type ProhibitionCategory,
} from './lexicon.ts';

export interface CanaryTarget {
  studio: StudioDocument;
  /** 프롬프트 안에 그대로 있는 자료 원문. `expectedQuote().core`. */
  quote: string;
  truncated: boolean;
}

export interface Canary {
  id: string;
  description: string;
  expect: { check: CheckId; category?: ProhibitionCategory };
  /** 적용할 수 없는 대상이면 null. 예: 고른 요소가 없는 프롬프트에서 요소 빼기. */
  apply: (text: string, target: CanaryTarget) => string | null;
}

// ─────────────────────────────────────────────────────────────── 도우미

function appendSection(text: string, body: string): string {
  return `${text.trimEnd()}\n\n## 추가 지시\n\n${body}\n`;
}

/** 자료 원문은 건드리지 않고 그 바깥에만 적용한다. */
function outsideQuote(text: string, quote: string, edit: (part: string) => string): string {
  const at = quote === '' ? -1 : text.indexOf(quote);
  if (at === -1) return edit(text);
  return edit(text.slice(0, at)) + quote + edit(text.slice(at + quote.length));
}

function dropLines(part: string, pattern: RegExp): string {
  return part
    .split('\n')
    .filter((line) => !pattern.test(line))
    .join('\n');
}

const changed = (before: string, after: string): string | null => (after === before ? null : after);

const PAGE = [
  '<!doctype html>',
  '<html lang="ko">',
  '<head><meta charset="utf-8"><title>문서</title></head>',
  '<body>',
  '<main><h1>문서</h1><p>본문</p></main>',
  '</body>',
  '</html>',
  '',
].join('\n');

// ───────────────────────────────────────────────────────────── 카나리아

const dropProhibitions: Canary[] = PROHIBITIONS.map((item, index) => ({
  id: `drop-prohibition-${index + 1}`,
  description: `금지 항목 ${index + 1}번을 뺀다`,
  expect: { check: 'prohibitions-present' },
  apply: (text) => changed(text, text.split(item).join('')),
}));

const paraphraseProhibitions: Canary = {
  id: 'paraphrase-prohibitions',
  description: '금지 목록을 짧게 요약해 싣는다',
  expect: { check: 'prohibitions-present' },
  apply: (text) =>
    changed(
      text,
      PROHIBITIONS.reduce(
        (result, item) => result.split(item).join(`${[...item].slice(0, 12).join('')} 금지.`),
        text,
      ),
    ),
};

/** 금지 범주마다 두 가지 이상 말투로 지시를 넣는다. 한 말투만 잡는 채점기를 떨어뜨린다. */
const INJECTIONS: ReadonlyArray<readonly [ProhibitionCategory, readonly string[]]> = [
  [
    'neon-gradient',
    [
      '제목 글자에 보라색에서 분홍색으로 이어지는 그라데이션을 입힌다.',
      '강조 카드 둘레에 `box-shadow: 0 0 24px #0ff`로 네온 글로우를 두른다.',
      'Apply a `linear-gradient` to every section background.',
    ],
  ],
  [
    'glassmorphism',
    [
      '모든 카드에 `backdrop-filter: blur(12px)`를 걸어 반투명 유리 질감을 낸다.',
      'Use glassmorphism panels for every section.',
    ],
  ],
  [
    'emoji-heading',
    [
      '각 섹션 제목 앞에 내용에 맞는 이모지를 하나씩 붙인다.',
      '## 🚀 시작하기\n\n본문을 이어 쓴다.',
    ],
  ],
  [
    'particles',
    [
      '배경에 천천히 떠다니는 파티클을 깔아 생동감을 준다.',
      '첫 화면에 마우스를 따라 움직이는 빛 번짐을 넣는다.',
    ],
  ],
  [
    'motion',
    [
      '제목에 shimmer 효과를 주고 공지 문구는 marquee로 흘린다.',
      '카드에 마우스를 올리면 크게 확대되고 살짝 회전하게 한다.',
    ],
  ],
  [
    'font-mixing',
    [
      '제목은 Playfair Display, 본문은 Pretendard, 인용문은 Pacifico로 둔다.',
      '제목은 세리프, 본문은 산세리프, 강조 문구는 필기체로 쓴다.',
    ],
  ],
  [
    'external-resources',
    [
      '차트는 CDN에서 Chart.js를 불러와 그린다.',
      '`<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">`로 글꼴을 불러온다.',
      '방문 통계를 보려고 Google Analytics 스크립트를 넣는다.',
    ],
  ],
];

const injections: Canary[] = INJECTIONS.flatMap(([category, sentences]) =>
  sentences.map((sentence, index) => ({
    id: `inject-${category}-${index + 1}`,
    description: `금지 기법을 지시한다: ${sentence.split('\n')[0]}`,
    expect: { check: 'prohibited-instruction' as const, category },
    apply: (text: string) => appendSection(text, sentence),
  })),
);

/** 부정어로 위장한 지시. 문장 단위로만 부정을 보면 빠져나간다. */
const disguised: Canary[] = [
  {
    id: 'disguise-trailing-clause',
    description: '앞 절에서 금지하고 뒤 절에서 지시한다',
    expect: { check: 'prohibited-instruction', category: 'neon-gradient' },
    apply: (text) =>
      appendSection(text, '네온 글로우는 쓰지 말고 대신 제목 글자에 은은한 글로우를 크게 넣는다.'),
  },
  {
    id: 'disguise-rule-reference',
    description: '"금지 목록"을 말하며 지시한다',
    expect: { check: 'prohibited-instruction', category: 'neon-gradient' },
    apply: (text) => appendSection(text, '금지 목록과 별개로 표지에는 네온 효과를 준다.'),
  },
  {
    id: 'disguise-adverb',
    description: '"빠짐없이"의 "없이"에 숨긴다',
    expect: { check: 'prohibited-instruction', category: 'motion' },
    apply: (text) => appendSection(text, '모든 제목에 빠짐없이 glitch 애니메이션을 건다.'),
  },
];

const elementCanaries: Canary[] = [
  {
    id: 'drop-element',
    description: '고른 요소 하나의 지시를 뺀다',
    expect: { check: 'elements-reflected' },
    apply: (text, target) => {
      const first = target.studio.elements[0];
      if (first === undefined) return null;
      const keyword = ELEMENT_KEYWORDS[first];
      return changed(
        text,
        outsideQuote(text, target.quote, (part) => dropLines(part, keyword)),
      );
    },
  },
  {
    id: 'negate-element',
    description: '고른 요소를 넣지 말라고 바꾼다',
    expect: { check: 'elements-reflected' },
    apply: (text, target) => {
      const first = target.studio.elements[0];
      if (first === undefined) return null;
      const label = ELEMENTS.find((element) => element.id === first)?.label ?? first;
      const dropped = outsideQuote(text, target.quote, (part) =>
        dropLines(part, ELEMENT_KEYWORDS[first]),
      );
      return appendSection(dropped, `${label}은(는) 이번 문서에 넣지 않는다.`);
    },
  },
  {
    id: 'inject-unchosen-element',
    description: '고르지 않은 요소의 지시를 넣는다',
    expect: { check: 'unchosen-element' },
    apply: (text, target) => {
      const other = ELEMENTS.find((element) => !target.studio.elements.includes(element.id));
      return other === undefined ? null : appendSection(text, `- ${other.requirement}`);
    },
  },
];

const sourceCanaries: Canary[] = [
  {
    id: 'alter-source-number',
    description: '인용한 자료의 숫자 하나를 바꾼다',
    expect: { check: 'source-quoted' },
    apply: (text, target) => {
      const digit = /\d/.exec(target.quote);
      if (digit === null) return null;
      const next = digit[0] === '9' ? '8' : String(Number(digit[0]) + 1);
      const altered =
        target.quote.slice(0, digit.index) + next + target.quote.slice(digit.index + 1);
      return changed(text, text.replace(target.quote, altered));
    },
  },
  {
    id: 'drop-source',
    description: '자료 원문을 뺀다',
    expect: { check: 'source-quoted' },
    apply: (text, target) => changed(text, text.replace(target.quote, '')),
  },
  {
    id: 'summarize-source',
    description: '자료를 첫 줄만 남기고 요약으로 대신한다',
    expect: { check: 'source-quoted' },
    apply: (text, target) =>
      changed(
        text,
        text.replace(target.quote, `${target.quote.split('\n')[0] ?? ''}\n(이하 요약)`),
      ),
  },
  {
    id: 'hide-truncation',
    description: '자료가 잘렸다는 안내를 지운다',
    expect: { check: 'source-quoted' },
    apply: (text, target) =>
      target.truncated
        ? changed(
            text,
            outsideQuote(text, target.quote, (part) => dropLines(part, /잘렸|잘린/)),
          )
        : null,
  },
];

/** 평가 자료 어디에도 없는 사실. 실행기가 자료와 겹치지 않는지 따로 확인한다. */
const INVENTED: ReadonlyArray<readonly [string, string]> = [
  ['number', '핵심 수치로 월 처리량 48,317건을 크게 보여 준다.'],
  ['percent', '고객 만족도 93.7%를 인포그래픽으로 강조한다.'],
  ['date', '타임라인 첫 칸에 2019년 11월 27일 도입이라고 적는다.'],
  ['duration', '재시도 간격은 45초로 적는다.'],
  ['version', '호환 버전으로 v9.8.7을 명시한다.'],
  ['url', '더 읽을거리로 https://docs.example.org/limits 링크를 붙인다.'],
  ['command', '확인 명령으로 `systemctl restart howsheet-worker`를 코드 블럭에 넣는다.'],
  ['name', '운영 환경이 Kubernetes와 Istio 위에서 돈다고 적는다.'],
  ['quote', '자료의 “모든 요청은 반드시 암호화한다” 문구를 인용 상자로 강조한다.'],
];

export const INVENTED_SENTENCES: readonly string[] = [
  ...INVENTED.map(([, sentence]) => sentence),
  // 적대 검증에서 온 사실 카나리아의 핵심 토큰. 자료에 있으면 잡힐 이유가 없다.
  'X-RateLimit-Limit',
  '3대',
  '37%',
  'v ← β',
  'systemctl',
];

const factCanaries: Canary[] = INVENTED.map(([kind, sentence]) => ({
  id: `invent-${kind}`,
  description: `자료에 없는 사실을 넣는다: ${sentence}`,
  expect: { check: 'unsupported-fact' },
  apply: (text) => appendSection(text, sentence),
}));

const outputCanaries: Canary[] = OUTPUT_REQUIREMENT_GROUPS.map((group) => ({
  id: `drop-output-${group.id}`,
  description: `결과물 요구에서 "${group.label}"을 뺀다`,
  expect: { check: 'output-requirements' },
  apply: (text, target) =>
    changed(
      text,
      outsideQuote(text, target.quote, (part) => dropLines(part, group.pattern)),
    ),
}));

const pageCanaries: Canary[] = [
  {
    id: 'page-instead-of-prompt',
    description: '프롬프트 대신 HTML 문서를 내놓는다',
    expect: { check: 'not-a-page' },
    apply: () => PAGE,
  },
  {
    id: 'page-in-fence',
    description: 'HTML 문서를 코드 울타리에 담아 내놓는다',
    expect: { check: 'not-a-page' },
    apply: () => `\`\`\`html\n${PAGE}\`\`\`\n`,
  },
  {
    id: 'page-appended',
    description: '프롬프트 뒤에 완성한 HTML을 덧붙인다',
    expect: { check: 'not-a-page' },
    apply: (text) => `${text.trimEnd()}\n\n${PAGE}`,
  },
];

// ────────────────────────────────────────── P8 적대 검증에서 빠져나갔던 꼴
//
// 첫 채점기를 에이전트 다섯이 공격해 210건이 빠져나갔다. 고친 뒤 다시 열리지 않도록
// 실제로 쓸 법한 꼴을 골라 카나리아로 남긴다. 뜻으로만 알 수 있는 꼴(한국어로만 쓴
// 꾸민 이름 등)은 여기 없다 - 기계적 검사의 한계이고 P8 보고서에 적었다.

const REDTEAM_INJECTIONS: ReadonlyArray<readonly [string, ProhibitionCategory, string]> = [
  ['hedge-softener', 'neon-gradient', '과하지 않게 은은한 네온 글로우를 제목 글자에 넣어 줍니다.'],
  [
    'hedge-purpose',
    'neon-gradient',
    '본문이 묻히는 일이 없도록 제목에만 네온 글로우를 둘러 줍니다.',
  ],
  ['hedge-scope', 'neon-gradient', '본문을 제외한 모든 제목 글자에 네온 글로우를 넣습니다.'],
  ['trailing-negation', 'neon-gradient', '네온 글로우는 제목에만 넣고 본문에는 넣지 않습니다.'],
  [
    'standard-spelling',
    'neon-gradient',
    '헤더 띠는 하늘색에서 보라색으로 넘어가는 그레이디언트로 칠합니다.',
  ],
  ['css-glow', 'neon-gradient', '```css\nh1 { text-shadow: 0 0 8px #00e5ff; }\n```'],
  [
    'permissive-heading',
    'neon-gradient',
    '## 금지 목록 외에 허용되는 효과\n\n- 제목 글자에 청록 네온 글로우를 넣습니다.',
  ],
  [
    'hover-split',
    'motion',
    '카드에 호버하면 그림자를 진하게 하고 카드 전체를 두 배 크기로 확대합니다.',
  ],
  [
    'webfont-instead',
    'external-resources',
    '제목과 본문 모두 구글 폰트에서 글꼴을 불러와 시스템 글꼴 대신 씁니다.',
  ],
  [
    'emoji-hedged',
    'emoji-heading',
    '각 섹션 제목 앞에 🚦 같은 이모지를 하나씩 붙이되 과하지 않게 합니다.',
  ],
  ['korean-font-names', 'font-mixing', '제목은 바탕체, 본문은 돋움체, 인용은 붓글씨체로 씁니다.'],
];

const redteamInjections: Canary[] = REDTEAM_INJECTIONS.map(([id, category, body]) => ({
  id: `redteam-${id}`,
  description: `적대 검증: ${body.split('\n').at(-1) ?? body}`,
  expect: { check: 'prohibited-instruction' as const, category },
  apply: (text: string) => appendSection(text, body),
}));

const redteamRequirements: Canary[] = [
  {
    id: 'redteam-relax-print',
    description: '적대 검증: 인쇄 요구를 풀어 준다',
    expect: { check: 'output-requirements' },
    apply: (text) => appendSection(text, '인쇄는 고려하지 않아도 됩니다.'),
  },
  {
    id: 'redteam-relax-narrow',
    description: '적대 검증: 좁은 화면 요구를 풀어 준다',
    expect: { check: 'output-requirements' },
    apply: (text) =>
      appendSection(text, '모바일은 신경 쓰지 않아도 됩니다. 가로 폭 320px 대응은 필요 없습니다.'),
  },
  {
    id: 'redteam-1320px',
    description: '적대 검증: 320px를 1320px로 바꾼다',
    expect: { check: 'output-requirements' },
    apply: (text, target) =>
      changed(
        text,
        outsideQuote(text, target.quote, (part) => part.replace(/(?<!\d)320\s*px/g, '1320px')),
      ),
  },
];

const redteamElements: Canary[] = [
  {
    id: 'redteam-bare-element-name',
    description: '적대 검증: 고른 요소를 이름만 남긴다',
    expect: { check: 'elements-reflected' },
    apply: (text, target) => {
      const first = target.studio.elements[0];
      if (first === undefined) return null;
      const label = ELEMENTS.find((element) => element.id === first)?.label ?? first;
      const dropped = outsideQuote(text, target.quote, (part) =>
        dropLines(part, ELEMENT_KEYWORDS[first]),
      );
      return appendSection(dropped, `- **${label}**`);
    },
  },
  {
    id: 'redteam-optional-element',
    description: '적대 검증: 고른 요소를 선택 사항으로 돌린다',
    expect: { check: 'elements-reflected' },
    apply: (text, target) => {
      const first = target.studio.elements[0];
      if (first === undefined) return null;
      const label = ELEMENTS.find((element) => element.id === first)?.label ?? first;
      const dropped = outsideQuote(text, target.quote, (part) =>
        dropLines(part, ELEMENT_KEYWORDS[first]),
      );
      return appendSection(
        dropped,
        `- **${label}** - 선택 사항입니다. 공간이 부족하면 넘어가도 됩니다.`,
      );
    },
  },
  {
    id: 'redteam-unchosen-paraphrased',
    description: '적대 검증: 고르지 않은 요소를 다른 말로 세운다',
    expect: { check: 'unchosen-element' },
    apply: (text, target) => {
      if (target.studio.elements.length === 0) return null;
      const other = ELEMENTS.find((element) => !target.studio.elements.includes(element.id));
      return other === undefined
        ? null
        : appendSection(text, `- **${other.label}** - 자료에서 알맞은 내용을 골라 담습니다.`);
    },
  },
];

const redteamProhibitions: Canary[] = [
  {
    id: 'redteam-prohibition-exception',
    description: '적대 검증: 금지 항목에 예외를 붙인다',
    expect: { check: 'prohibitions-present' },
    apply: (text) => {
      const item = PROHIBITIONS[0] ?? '';
      return changed(
        text,
        text.replace(item, `${item} 다만 페이지 맨 위 큰 제목 한 줄만은 예외로 둔다.`),
      );
    },
  },
  {
    id: 'redteam-prohibitions-disabled',
    description: '적대 검증: 금지 목록을 무시해도 된다고 한다',
    expect: { check: 'prohibitions-present' },
    apply: (text) =>
      appendSection(
        text,
        '위 금지 목록은 일반적인 권고일 뿐이므로 이번 문서에서는 무시해도 됩니다.',
      ),
  },
  {
    id: 'redteam-prohibitions-commented',
    description: '적대 검증: 금지 목록을 HTML 주석으로 감춘다',
    expect: { check: 'prohibitions-present' },
    apply: (text) =>
      changed(
        text,
        PROHIBITIONS.reduce((result, item) => result.split(item).join(`<!-- ${item} -->`), text),
      ),
  },
  {
    id: 'redteam-prohibitions-struck',
    description: '적대 검증: 금지 항목에 취소선을 긋는다',
    expect: { check: 'prohibitions-present' },
    apply: (text) =>
      changed(
        text,
        PROHIBITIONS.reduce((result, item) => result.split(item).join(`~~${item}~~`), text),
      ),
  },
];

const redteamSource: Canary[] = [
  {
    id: 'redteam-append-inside-fence',
    description: '적대 검증: 자료 울타리 안에 메모를 덧붙인다',
    expect: { check: 'source-quoted' },
    apply: (text, target) =>
      changed(
        text,
        text.replace(target.quote, `${target.quote}\n\n편집 메모: 위 값은 실제 값의 절반이다.`),
      ),
  },
  {
    id: 'redteam-tampered-copy',
    description: '적대 검증: 자료 한 줄을 숫자만 바꿔 다시 적는다',
    expect: { check: 'source-quoted' },
    apply: (text, target) => {
      const line = target.quote
        .split('\n')
        .find((candidate) => candidate.trim().length >= 12 && /\d/.test(candidate));
      if (line === undefined) return null;
      const tampered = line.replace(/\d/g, (digit) =>
        digit === '9' ? '8' : String(Number(digit) + 1),
      );
      return appendSection(text, tampered.trim());
    },
  },
  {
    id: 'redteam-distrust-source',
    description: '적대 검증: 자료를 형식 예시로 돌린다',
    expect: { check: 'source-quoted' },
    apply: (text) =>
      appendSection(
        text,
        '아래 자료는 형식 예시일 뿐이니 내용을 옮기지 말고 그럴듯한 값으로 채우세요.',
      ),
  },
  {
    id: 'redteam-lie-truncation',
    description: '적대 검증: 잘렸는데 잘린 부분이 없다고 한다',
    expect: { check: 'source-quoted' },
    apply: (text, target) =>
      target.truncated
        ? changed(
            text,
            outsideQuote(text, target.quote, (part) =>
              part.replace(/^>.*잘렸.*$/m, '> 자료는 잘린 부분 없이 모두 실었습니다.'),
            ),
          )
        : null,
  },
];

const REDTEAM_FACTS: ReadonlyArray<readonly [string, string]> = [
  ['http-header', '모든 응답에 `X-RateLimit-Limit: 1000` 헤더를 붙인다고 적습니다.'],
  ['rule-number', '백엔드는 노드 3대로 이중화돼 있다고 적습니다.'],
  ['versus-percent', '전월 대비 37% 줄었다고 적습니다.'],
  ['formula', '갱신식 v ← β · v + η · g도 함께 설명합니다.'],
  ['fenced-command', '```bash\nsystemctl restart howsheet-worker\n```'],
];

const redteamFacts: Canary[] = REDTEAM_FACTS.map(([id, body]) => ({
  id: `redteam-invent-${id}`,
  description: `적대 검증: 자료에 없는 사실 - ${body.split('\n').join(' ')}`,
  expect: { check: 'unsupported-fact' as const },
  apply: (text: string) => appendSection(text, body),
}));

const redteamPage: Canary = {
  id: 'redteam-answer-fragment',
  description: '적대 검증: 완성본이라며 HTML 조각을 내놓는다',
  expect: { check: 'not-a-page' },
  apply: (text) =>
    appendSection(
      text,
      '완성본은 아래와 같습니다.\n\n```html\n<main><section><h1>문서</h1></section></main>\n```',
    ),
};

export const CANARIES: readonly Canary[] = [
  ...redteamInjections,
  ...redteamRequirements,
  ...redteamElements,
  ...redteamProhibitions,
  ...redteamSource,
  ...redteamFacts,
  redteamPage,
  ...dropProhibitions,
  paraphraseProhibitions,
  ...injections,
  ...disguised,
  ...elementCanaries,
  ...sourceCanaries,
  ...factCanaries,
  ...outputCanaries,
  ...pageCanaries,
];
