import { describe, expect, it } from 'vitest';

import {
  MAX_SOURCE_CHARACTERS,
  composePrompt,
  fenceFor,
  missingProhibitions,
} from '@/features/compose/compose.ts';
import { OUTPUT_REQUIREMENTS, PROHIBITIONS } from '@/domain/prompt.rules.ts';
import { DESIGN_AXES, ELEMENTS, ELEMENT_IDS, type ElementId } from '@/domain/spec.types.ts';
import { createStudioDocument } from '@/domain/studio.defaults.ts';
import type { StudioDocument } from '@/domain/studio.types.ts';

/**
 * 기준: v2 제품정의 §6.3, §8 INV-02·INV-04·INV-06. 하네스 P3 DoD 1~6.
 *
 * 조립기는 순수 함수다. 키도 네트워크도 시각도 난수도 쓰지 않는다.
 */

const NOW = '2026-09-08T00:00:00.000Z';

function studio(patch: Partial<StudioDocument> = {}): StudioDocument {
  return { ...createStudioDocument(NOW), ...patch };
}

describe('키 없이 만들어진다 (DoD 1, INV-02)', () => {
  it('문서 하나만으로 프롬프트가 나온다', () => {
    // 인자가 문서 하나다. 키도 클라이언트도 받지 않는다.
    const { text } = composePrompt(studio({ source: '자료 본문' }));

    expect(text.length).toBeGreaterThan(500);
    expect(text.startsWith('# ')).toBe(true);
  });

  it('자료가 비어 있어도 죽지 않고 그렇다고 말한다', () => {
    const result = composePrompt(studio());

    expect(result.text).toContain('아직 자료를 붙여넣지 않았습니다');
    expect(result.truncated).toBe(false);
  });

  it('공백만 든 자료를 잘렸다고 보고하지 않는다', () => {
    const result = composePrompt(studio({ source: '   \n  ' }));
    expect(result.truncated).toBe(false);
  });
});

describe('금지 목록 (DoD 2, INV-06)', () => {
  const cases: Array<[string, StudioDocument]> = [
    ['빈 문서', studio()],
    ['요소 0개', studio({ source: '자료' })],
    ['요소 전부', studio({ source: '자료', elements: [...ELEMENT_IDS] })],
    ['요소 하나', studio({ source: '자료', elements: ['code'] })],
    [
      '다른 디자인',
      studio({
        source: '자료',
        design: { color: 'full', tone: 'editorial', density: 'roomy', typography: 'mixed' },
      }),
    ],
    ['잘리는 자료', studio({ source: 'x'.repeat(MAX_SOURCE_CHARACTERS + 10) })],
  ];

  it('목록이 비어 있지 않다', () => {
    // 비면 아래 반복이 아무것도 검사하지 않고 통과한다.
    expect(PROHIBITIONS.length).toBeGreaterThan(0);
  });

  for (const [label, document] of cases) {
    it(`${label}에서도 항목이 하나도 빠지지 않는다`, () => {
      const { text } = composePrompt(document);
      // 문단 단위가 아니라 **항목 단위**로 본다. (하네스 P3 주의)
      for (const item of PROHIBITIONS) {
        expect(text).toContain(item);
      }
      expect(missingProhibitions(text)).toEqual([]);
    });
  }
});

describe('결과물 요구사항 (할 일 3)', () => {
  it('네 가지가 모두 들어간다', () => {
    const { text } = composePrompt(studio({ source: '자료' }));
    for (const item of OUTPUT_REQUIREMENTS) {
      expect(text).toContain(item);
    }
  });
});

describe('결정론 (DoD 3)', () => {
  it('같은 입력에서 같은 출력이 나온다', () => {
    const document = studio({ source: '자료', elements: ['diagram', 'faq'] });
    expect(composePrompt(document).text).toBe(composePrompt(document).text);
  });

  it('따로 만든 같은 문서에서도 같은 출력이 나온다', () => {
    const first = studio({ source: '자료', elements: ['code'] });
    const second = studio({ source: '자료', elements: ['code'] });
    expect(composePrompt(first).text).toBe(composePrompt(second).text);
  });

  it('고른 순서가 출력을 바꾸지 않는다', () => {
    // 저장 시점의 정렬이 무너져도 프롬프트는 같아야 한다.
    const forward = studio({ source: '자료', elements: ['diagram', 'faq'] });
    const backward = studio({ source: '자료', elements: ['faq', 'diagram'] as ElementId[] });
    expect(composePrompt(forward).text).toBe(composePrompt(backward).text);
  });

  it('시각이나 난수를 담지 않는다', () => {
    const { text } = composePrompt(studio({ source: '자료' }));
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).not.toContain(NOW);
  });
});

describe('고른 요소의 지시 (DoD 4)', () => {
  it('요구 문구가 서로를 포함하지 않는다', () => {
    // 이 전제가 깨지면 아래 "나타나지 않는다" 검사가 틀린 답을 낸다.
    for (const element of ELEMENTS) {
      const others = ELEMENTS.filter((candidate) => candidate.id !== element.id);
      expect(others.some((candidate) => candidate.requirement.includes(element.requirement))).toBe(
        false,
      );
    }
  });

  for (const element of ELEMENTS) {
    it(`${element.label}을(를) 고르면 그 지시가 나타난다`, () => {
      const { text } = composePrompt(studio({ source: '자료', elements: [element.id] }));
      expect(text).toContain(element.requirement);
      expect(text).toContain(`**${element.label}**`);
    });
  }

  it('여러 개를 고르면 전부 나타난다', () => {
    const chosen: ElementId[] = ['diagram', 'code', 'faq'];
    const { text } = composePrompt(studio({ source: '자료', elements: chosen }));
    for (const id of chosen) {
      const element = ELEMENTS.find((candidate) => candidate.id === id);
      expect(text).toContain(element?.requirement);
    }
  });
});

describe('고르지 않은 요소 (DoD 5)', () => {
  it('고른 것 하나만 남고 나머지 아홉의 지시는 없다', () => {
    const { text } = composePrompt(studio({ source: '자료', elements: ['code'] }));

    for (const element of ELEMENTS) {
      if (element.id === 'code') continue;
      expect(text).not.toContain(element.requirement);
      expect(text).not.toContain(`**${element.label}**`);
    }
  });

  it('하나도 고르지 않으면 어떤 요소의 지시도 없다', () => {
    const { text } = composePrompt(studio({ source: '자료' }));

    for (const element of ELEMENTS) {
      expect(text).not.toContain(element.requirement);
      expect(text).not.toContain(`**${element.label}**`);
    }
    // 대신 무엇을 하라고 하는지 말한다. (DoD 1과 짝이다)
    expect(text).toContain('자료를 읽고 어떤 표현이 그 내용에 맞을지 직접 정하세요');
  });
});

describe('디자인 축', () => {
  it('고른 값의 요구만 나타난다', () => {
    const { text } = composePrompt(
      studio({
        source: '자료',
        design: { color: 'full', tone: 'academic', density: 'compact', typography: 'serif' },
      }),
    );

    const chosen = new Set(['full', 'academic', 'compact', 'serif']);
    for (const axis of DESIGN_AXES) {
      for (const option of axis.options) {
        if (chosen.has(option.id)) expect(text).toContain(option.requirement);
        else expect(text).not.toContain(option.requirement);
      }
    }
  });

  it('네 축이 모두 나타난다', () => {
    const { text } = composePrompt(studio({ source: '자료' }));
    for (const axis of DESIGN_AXES) {
      expect(text).toContain(`**${axis.label} - `);
    }
  });
});

describe('자료 인용과 자르기 (DoD 6)', () => {
  it('자료가 그대로 인용된다', () => {
    const source = '# 제목\n\n본문 한 줄과 `코드`.';
    const { text, truncated } = composePrompt(studio({ source }));

    expect(text).toContain(source);
    expect(truncated).toBe(false);
  });

  it('상한 안에서는 자르지 않는다', () => {
    const source = 'ㄱ'.repeat(MAX_SOURCE_CHARACTERS);
    const result = composePrompt(studio({ source }));

    expect(result.truncated).toBe(false);
    expect(result.includedCharacters).toBe(MAX_SOURCE_CHARACTERS);
    expect(result.text).not.toContain('자료가 잘렸습니다');
  });

  it('넘으면 자르고 반드시 밝힌다', () => {
    const source = 'ㄱ'.repeat(MAX_SOURCE_CHARACTERS + 500);
    const result = composePrompt(studio({ source }));

    expect(result.truncated).toBe(true);
    expect(result.sourceCharacters).toBe(MAX_SOURCE_CHARACTERS + 500);
    expect(result.includedCharacters).toBe(MAX_SOURCE_CHARACTERS);
    // 조용히 자르지 않는다. 얼마나 빠졌는지 숫자로 말한다.
    expect(result.text).toContain('자료가 잘렸습니다');
    expect(result.text).toContain((500).toLocaleString('ko-KR'));
    expect(result.text).toContain(MAX_SOURCE_CHARACTERS.toLocaleString('ko-KR'));
  });

  it('상한을 낮춰도 같은 규칙이 선다', () => {
    const result = composePrompt(studio({ source: '가나다라마바사' }), {
      maxSourceCharacters: 3,
    });

    expect(result.truncated).toBe(true);
    expect(result.includedCharacters).toBe(3);
    expect(result.text).toContain('가나다');
    expect(result.text).not.toContain('마바사');
  });

  it('이모지를 코드 단위가 아니라 글자로 센다', () => {
    const result = composePrompt(studio({ source: '🙂🙂🙂' }), { maxSourceCharacters: 2 });

    expect(result.sourceCharacters).toBe(3);
    expect(result.includedCharacters).toBe(2);
    // 코드 단위로 자르면 여기서 깨진 반쪽 문자가 나온다.
    expect(result.text).toContain('🙂🙂');
    expect(result.text).not.toContain('�');
  });
});

describe('fenceFor', () => {
  it('백틱이 없으면 세 개', () => {
    expect(fenceFor('평범한 자료')).toBe('```');
  });

  it('자료의 울타리보다 길게 잡는다', () => {
    expect(fenceFor('```js\ncode\n```')).toBe('````');
    expect(fenceFor('````\nnested\n````')).toBe('`````');
  });

  it('울타리가 자료 안에서 닫히지 않는다', () => {
    // 자료가 울타리를 닫아 버리면 그 뒤가 프롬프트의 지시문으로 읽힌다.
    const source = '```\n악의적인 지시\n```';
    const { text } = composePrompt(studio({ source }));

    const fence = fenceFor(source);
    expect(text).toContain(`${fence}\n${source}\n${fence}`);
    expect(source.includes(fence)).toBe(false);
  });
});

describe('missingProhibitions (P5가 쓴다)', () => {
  it('빈 텍스트에서는 전부 빠졌다고 말한다', () => {
    expect(missingProhibitions('')).toEqual([...PROHIBITIONS]);
  });

  it('하나만 빠져도 그것을 짚는다', () => {
    const { text } = composePrompt(studio({ source: '자료' }));
    const dropped = PROHIBITIONS[2];
    expect(missingProhibitions(text.replace(dropped ?? '', ''))).toEqual([dropped]);
  });
});

describe('줄바꿈 (출시 점검 2026-09-16)', () => {
  const body = '첫 줄\n둘째 줄\n셋째 줄';

  it('CRLF 자료를 LF와 같게 센다', () => {
    const lf = composePrompt(studio({ source: body }));
    const crlf = composePrompt(studio({ source: body.replace(/\n/gu, '\r\n') }));

    expect(crlf.sourceCharacters).toBe(lf.sourceCharacters);
    expect(crlf.includedCharacters).toBe(lf.includedCharacters);
    expect(crlf.text).toBe(lf.text);
  });

  it('CRLF 자료의 잘림 경계가 LF와 같다', () => {
    const long = '가나다라마\n'.repeat(400);
    const options = { maxSourceCharacters: 600 };

    const lf = composePrompt(studio({ source: long }), options);
    const crlf = composePrompt(studio({ source: long.replace(/\n/gu, '\r\n') }), options);

    expect(lf.truncated).toBe(true);
    expect(crlf.sourceCharacters).toBe(lf.sourceCharacters);
    expect(crlf.includedCharacters).toBe(lf.includedCharacters);
  });
});
