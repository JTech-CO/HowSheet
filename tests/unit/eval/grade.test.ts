import { describe, expect, it } from 'vitest';

import { OUTPUT_REQUIREMENTS, PROHIBITIONS } from '@/domain/prompt.rules.ts';
import { DEFAULT_DESIGN } from '@/domain/spec.defaults.ts';
import { ELEMENTS, ELEMENT_IDS, type ElementId } from '@/domain/spec.types.ts';
import { STUDIO_DOCUMENT_VERSION, type StudioDocument } from '@/domain/studio.types.ts';
import { composePrompt } from '@/features/compose/compose.ts';
import { gradePrompt, type CheckId, type GradeResult } from '@/features/evaluate/grade.ts';
import { PROHIBITION_CATEGORIES } from '@/features/evaluate/lexicon.ts';

/**
 * 기준: 하네스 P8 DoD 1·2·3·5. 제품정의 §5.1·§6.2, INV-04·INV-06.
 *
 * 채점기가 **무엇을 떨어뜨리는지**를 검사 하나씩 본다. 좋은 프롬프트가 통과하는
 * 것만 보면 모든 것을 통과시키는 채점기가 만점을 받는다.
 */

const SOURCE = [
  '# 배포 절차',
  '',
  '1. `pnpm build`로 빌드한다. 보통 90초가 걸린다.',
  '2. v3.1.0 태그를 올린다.',
  '3. 화면 글리치가 보이면 캐시를 비운다.',
  '',
].join('\n');

function studio(patch: Partial<StudioDocument> = {}): StudioDocument {
  return {
    version: STUDIO_DOCUMENT_VERSION,
    source: SOURCE,
    elements: ['steps', 'code'],
    design: DEFAULT_DESIGN,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

const template = (doc: StudioDocument, maxSourceCharacters?: number) =>
  composePrompt(doc, maxSourceCharacters === undefined ? {} : { maxSourceCharacters }).text;

const withSection = (text: string, body: string) => `${text}\n\n## 추가 지시\n\n${body}\n`;

function checks(result: GradeResult): CheckId[] {
  return result.findings.map((finding) => finding.check);
}

function categories(result: GradeResult): string[] {
  return result.findings.flatMap((finding) => (finding.category ? [finding.category] : []));
}

describe('조립기 출력은 통과한다', () => {
  it('기본 선택', () => {
    const doc = studio();
    const result = gradePrompt({ text: template(doc), studio: doc });
    expect(result.findings).toEqual([]);
    expect(result.passed).toBe(true);
    // 공허 방지: 실제로 텍스트를 들여다봤다.
    expect(result.measured.clauses).toBeGreaterThan(20);
  });

  it('혼합 타이포 × 기술 톤 × 요소 전부 - P8에서 찾은 폰트 모순이 다시 생기지 않는다', () => {
    const doc = studio({
      elements: [...ELEMENT_IDS],
      design: { color: 'full', tone: 'technical', density: 'compact', typography: 'mixed' },
    });
    expect(gradePrompt({ text: template(doc), studio: doc }).findings).toEqual([]);
  });

  it('요소 0개', () => {
    const doc = studio({ elements: [] });
    expect(gradePrompt({ text: template(doc), studio: doc }).passed).toBe(true);
  });
});

describe('좋은 프롬프트를 떨어뜨리지 않는다 (P8 청팀 검증)', () => {
  // 적대 검증으로 채점기를 조인 뒤 좋은 프롬프트 35건 중 33건이 떨어졌다. 그때 오탐이던 꼴이다.
  it.each([
    ['낱말 곁의 부정', '웹폰트를 불러오지 않도록 시스템 글꼴 스택만 씁니다.'],
    ['목적 부정', '그라데이션이 생기지 않도록 모든 면은 단색으로 칠합니다.'],
    ['표 칸의 부정', '| 타이포 | 산세리프 | 웹폰트·네온 없음 |'],
    ['부정한 이름', 'MathJax나 KaTeX 같은 수식 라이브러리는 쓰지 않습니다.'],
    ['가상 선택자', '키보드 포커스는 `:focus-visible`에 2px 실선 윤곽선으로 보이게 합니다.'],
    ['명암비', '본문과 배경의 명암비는 4.5:1 이상을 지킵니다.'],
    ['인쇄 여백', '인쇄는 A4 세로, 상하 15mm·좌우 12mm 여백으로 맞춥니다.'],
    ['굵기 값', '강조는 굵기(제목 700, 본문 400)와 크기로만 합니다.'],
    ['글자 크기 비율', '본문 16px/1.6, 제목 크기는 본문의 1.25배씩 키웁니다.'],
    ['요소 안의 스크롤', '좁은 화면에서 표 안쪽의 가로 스크롤은 생겨도 됩니다.'],
    [
      'CSS 울타리',
      '```css\n:root { --ink: #111111; font: 16px/1.6 -apple-system, Roboto, sans-serif; }\n```',
    ],
    [
      '되돌아가는 화살표',
      '노드에 호버 효과는 주지 않고, 3단계에서 2단계로 되돌아가는 화살표는 점선으로 그립니다.',
    ],
    ['완성본을 내라는 지시', '완성본 HTML 파일 하나만 출력하세요.'],
    ['제안하는 제목', '섹션은 자료 순서를 따라 "배포 절차", "캐시 비우기"로 둡니다.'],
  ])('%s', (_, sentence) => {
    const doc = studio();
    expect(
      gradePrompt({ text: withSection(template(doc), sentence), studio: doc }).findings,
    ).toEqual([]);
  });

  it('제목으로 요소를 세우고 그 아래에서 무엇을 담을지 말하면 반영된 것이다', () => {
    const doc = studio({ elements: ['diagram'] });
    const diagram = ELEMENTS.find((element) => element.id === 'diagram')!;
    const text = template(doc).replace(
      `- **${diagram.label}** - ${diagram.requirement}`,
      '### 다이어그램\n\n- 빌드와 태그의 순서를 인라인 SVG로 그립니다.',
    );
    expect(gradePrompt({ text, studio: doc }).findings).toEqual([]);
  });

  it('"결과물 구성" 구역의 요소 지시를 결과물 요구로 착각하지 않는다', () => {
    const doc = studio({ elements: ['steps'] });
    const steps = ELEMENTS.find((element) => element.id === 'steps')!;
    const text = template(doc)
      .replace('## 1. 담을 것', '## 결과물 구성')
      .replace(
        `- **${steps.label}** - ${steps.requirement}`,
        '1. **단계 절차** - 세 단계를 번호로 나눕니다.',
      );
    expect(gradePrompt({ text, studio: doc }).findings).toEqual([]);
  });

  it('문서 제목에 요소 이름이 있다고 반영된 것은 아니다', () => {
    const doc = studio({ elements: ['diagram'] });
    const diagram = ELEMENTS.find((element) => element.id === 'diagram')!;
    const text = template(doc)
      .replace('# 한 페이지 문서 만들기', '# 배포 절차 한 페이지 문서 (다이어그램)')
      .replace(`- **${diagram.label}** - ${diagram.requirement}`, '');
    expect(checks(gradePrompt({ text, studio: doc }))).toContain('elements-reflected');
  });
});

describe('금지 목록 (DoD 1, INV-06)', () => {
  it('범주가 금지 항목과 하나씩 짝을 이룬다', () => {
    // 금지 항목을 더하고 범주를 더하지 않으면 그 항목은 채점되지 않는다.
    expect(PROHIBITION_CATEGORIES).toHaveLength(PROHIBITIONS.length);
  });

  it.each(PROHIBITIONS.map((item, index) => [index + 1, item] as const))(
    '%i번 항목이 빠지면 떨어진다',
    (_, item) => {
      const doc = studio();
      const text = template(doc).split(item).join('');
      expect(checks(gradePrompt({ text, studio: doc }))).toContain('prohibitions-present');
    },
  );

  it('자료 안에 금지 목록이 있어도 프롬프트의 목록을 대신하지 못한다', () => {
    const doc = studio({ source: `${SOURCE}\n${PROHIBITIONS.join('\n')}\n` });
    const text = template(doc).replace(`- ${PROHIBITIONS[0]}\n`, '');
    expect(checks(gradePrompt({ text, studio: doc }))).toContain('prohibitions-present');
  });

  it.each([
    ['neon-gradient', '제목 글자에 그라데이션을 입힌다.'],
    ['glassmorphism', '카드에 `backdrop-filter: blur(8px)`를 건다.'],
    ['emoji-heading', '각 섹션 제목 앞에 이모지를 붙인다.'],
    ['particles', '배경에 떠다니는 파티클을 깐다.'],
    ['motion', '공지 문구는 marquee로 흘린다.'],
    ['font-mixing', '제목은 세리프, 본문은 산세리프, 인용은 손글씨로 쓴다.'],
    ['external-resources', 'CDN에서 Chart.js를 불러온다.'],
  ])('금지 기법 %s를 지시하면 떨어진다', (category, sentence) => {
    const doc = studio();
    const result = gradePrompt({ text: withSection(template(doc), sentence), studio: doc });
    expect(categories(result)).toContain(category);
  });

  it('같은 말을 부정 문맥에서 쓰면 통과한다', () => {
    const doc = studio();
    const text = withSection(
      template(doc),
      '그라데이션 대신 단색으로 칠하고, 제목에 이모지를 붙이지 않는다. 웹폰트 없이 시스템 글꼴만 쓴다.',
    );
    expect(gradePrompt({ text, studio: doc }).findings).toEqual([]);
  });

  it('제목 자체의 이모지는 부정 구역 안에서도 위반이다', () => {
    const doc = studio();
    const text = template(doc).replace('## 4. 하지 말 것', '## 🚫 하지 말 것');
    expect(categories(gradePrompt({ text, studio: doc }))).toContain('emoji-heading');
  });

  it('자료의 내용인 말은 자료를 옮긴 것으로 본다 - 자료에 없으면 위반이다', () => {
    const doc = studio();
    const quoting = withSection(template(doc), '3단계의 화면 글리치 대처를 강조한다.');
    expect(gradePrompt({ text: quoting, studio: doc }).findings).toEqual([]);

    const inventing = withSection(template(doc), '제목에 glitch 효과를 준다.');
    expect(categories(gradePrompt({ text: inventing, studio: doc }))).toContain('motion');
  });
});

describe('결과물 요구 (§6.2-5)', () => {
  it.each(OUTPUT_REQUIREMENTS.map((item, index) => [index + 1, item] as const))(
    '%i번 요구가 빠지면 떨어진다',
    (_, item) => {
      const doc = studio();
      const text = template(doc).split(item).join('').replace('HTML 파일 하나만', '결과만');
      expect(checks(gradePrompt({ text, studio: doc }))).toContain('output-requirements');
    },
  );

  it('금지 항목 안의 "오프라인"으로 요구를 채우지 못한다', () => {
    const doc = studio();
    const text = template(doc).split(OUTPUT_REQUIREMENTS[1]!).join('');
    const result = gradePrompt({ text, studio: doc });
    expect(result.findings.some((finding) => finding.message.includes('외부 요청'))).toBe(true);
  });
});

describe('요소 (DoD 2)', () => {
  it('고른 요소의 지시가 빠지면 떨어진다', () => {
    const doc = studio({ elements: ['diagram'] });
    const diagram = ELEMENTS.find((element) => element.id === 'diagram')!;
    const text = template(doc).replace(`- **${diagram.label}** - ${diagram.requirement}`, '');
    expect(checks(gradePrompt({ text, studio: doc }))).toContain('elements-reflected');
  });

  it('규칙 문구 안의 "코드 블럭"으로 요소를 채우지 못한다', () => {
    // 결과물 요구 3번에 "코드 블럭"이 나온다.
    const doc = studio({ elements: ['code'] });
    const code = ELEMENTS.find((element) => element.id === 'code')!;
    const text = template(doc).replace(`- **${code.label}** - ${code.requirement}`, '');
    expect(checks(gradePrompt({ text, studio: doc }))).toContain('elements-reflected');
  });

  it.each(ELEMENT_IDS)('%s를 넣지 말라고 하면 반영되지 않은 것이다', (id: ElementId) => {
    const doc = studio({ elements: [id] });
    const element = ELEMENTS.find((candidate) => candidate.id === id)!;
    const text = template(doc).replace(
      `- **${element.label}** - ${element.requirement}`,
      `- ${element.label}은(는) 넣지 않는다.`,
    );
    expect(checks(gradePrompt({ text, studio: doc }))).toContain('elements-reflected');
  });

  it('고르지 않은 요소의 지시가 들어가면 떨어진다', () => {
    const doc = studio({ elements: ['steps'] });
    const faq = ELEMENTS.find((element) => element.id === 'faq')!;
    const text = withSection(template(doc), `- ${faq.requirement}`);
    expect(checks(gradePrompt({ text, studio: doc }))).toContain('unchosen-element');
  });
});

describe('자료 충실도 (DoD 3)', () => {
  it('원문이 한 글자라도 바뀌면 떨어진다', () => {
    const doc = studio();
    const text = template(doc).replace('90초', '60초');
    expect(checks(gradePrompt({ text, studio: doc }))).toContain('source-quoted');
  });

  it('잘렸다고 밝히지 않으면 떨어진다', () => {
    const doc = studio();
    const text = template(doc, 40);
    expect(gradePrompt({ text, studio: doc, maxSourceCharacters: 40 }).passed).toBe(true);

    const hidden = text.replace(/^> \*\*주의: 자료가 잘렸습니다\.\*\*.*$/m, '');
    const result = gradePrompt({ text: hidden, studio: doc, maxSourceCharacters: 40 });
    expect(checks(result)).toContain('source-quoted');
  });

  it.each([
    ['숫자', '빌드는 45초 안에 끝난다고 적는다.'],
    ['버전', 'v3.2.0 태그라고 적는다.'],
    ['명령', '`pnpm deploy --prod`를 코드 블럭에 넣는다.'],
    ['이름', '배포 대상은 Vercel이라고 적는다.'],
    ['인용', '자료의 “배포 전에 반드시 승인을 받는다” 문장을 강조한다.'],
  ])('자료에 없는 %s가 있으면 떨어진다', (_, sentence) => {
    const doc = studio();
    const result = gradePrompt({ text: withSection(template(doc), sentence), studio: doc });
    expect(checks(result)).toContain('unsupported-fact');
  });

  it('자료에 있는 사실은 형식을 바꿔 적어도 통과한다', () => {
    const doc = studio();
    const text = withSection(
      template(doc),
      '빌드 90초, 태그 v3.1.0, 명령 `pnpm build`를 단계마다 적는다.',
    );
    expect(gradePrompt({ text, studio: doc }).findings).toEqual([]);
  });
});

describe('페이지가 아니라 프롬프트다 (INV-04)', () => {
  it.each([
    ['문서 전체', '<!doctype html>\n<html><body><h1>배포</h1></body></html>'],
    ['울타리 안의 문서', '```html\n<html lang="ko"><body></body></html>\n```'],
  ])('%s를 내놓으면 떨어진다', (_, page) => {
    const doc = studio();
    expect(checks(gradePrompt({ text: page, studio: doc }))).toContain('not-a-page');
  });
});
