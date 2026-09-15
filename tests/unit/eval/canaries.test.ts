import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_DESIGN } from '@/domain/spec.defaults.ts';
import { STUDIO_DOCUMENT_VERSION, type StudioDocument } from '@/domain/studio.types.ts';
import { composePrompt } from '@/features/compose/compose.ts';
import { CANARIES, INVENTED_SENTENCES, type Canary } from '@/features/evaluate/canaries.ts';
import { EVAL_SOURCES } from '@/features/evaluate/cases.ts';
import { CHECK_IDS, expectedQuote, gradePrompt } from '@/features/evaluate/grade.ts';
import { PROHIBITION_CATEGORIES } from '@/features/evaluate/lexicon.ts';

/**
 * 기준: 하네스 P8 주의 - 일부러 나쁜 프롬프트를 넣어 평가셋이 떨어뜨리는지 확인한다.
 *
 * `pnpm eval:prompts`가 같은 일을 전체 자료로 한다. 여기서는 모든 검사와 금지
 * 범주가 카나리아를 하나 이상 갖는지, 카나리아가 실제로 잡히는지를 빠르게 본다.
 */

const SOURCES_DIR = fileURLToPath(new URL('../../fixtures/eval/sources/', import.meta.url));
const source = readFileSync(`${SOURCES_DIR}db-restore.md`, 'utf8');

function doc(elements: StudioDocument['elements']): StudioDocument {
  return {
    version: STUDIO_DOCUMENT_VERSION,
    source,
    elements,
    design: DEFAULT_DESIGN,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const bases = [
  { name: '요소 넷', studio: doc(['flowchart', 'code', 'checklist', 'steps']), limit: undefined },
  { name: '잘린 자료', studio: doc(['steps']), limit: 600 },
];

const expectLabel = (canary: Canary) =>
  canary.expect.category === undefined
    ? canary.expect.check
    : `${canary.expect.check}:${canary.expect.category}`;

describe('카나리아 목록', () => {
  it('모든 검사에 카나리아가 있다', () => {
    for (const check of CHECK_IDS) {
      expect(
        CANARIES.some((canary) => canary.expect.check === check),
        check,
      ).toBe(true);
    }
  });

  it('모든 금지 범주에 카나리아가 있다', () => {
    for (const category of PROHIBITION_CATEGORIES) {
      expect(
        CANARIES.some((canary) => canary.expect.category === category),
        category,
      ).toBe(true);
    }
  });

  it('id가 겹치지 않는다', () => {
    expect(new Set(CANARIES.map((canary) => canary.id)).size).toBe(CANARIES.length);
  });

  it('꾸민 사실이 평가 자료 어디에도 없다', () => {
    for (const { id } of EVAL_SOURCES) {
      const text = readFileSync(`${SOURCES_DIR}${id}.md`, 'utf8');
      for (const sentence of INVENTED_SENTENCES) expect(text.includes(sentence), id).toBe(false);
    }
  });
});

describe.each(bases)('카나리아가 잡힌다 - $name', ({ studio, limit }) => {
  const text = composePrompt(
    studio,
    limit === undefined ? {} : { maxSourceCharacters: limit },
  ).text;
  const quote = expectedQuote(studio.source, limit);
  const target = { studio, quote: quote.core, truncated: quote.included < quote.total };
  const grade = (candidate: string) =>
    gradePrompt({
      text: candidate,
      studio,
      ...(limit === undefined ? {} : { maxSourceCharacters: limit }),
    });

  it('바탕은 통과한다', () => {
    expect(grade(text).findings).toEqual([]);
  });

  it.each(CANARIES.map((canary) => [canary.id, expectLabel(canary), canary] as const))(
    '%s → %s',
    (_, __, canary) => {
      const mutated = canary.apply(text, target);
      if (mutated === null) return;
      const found = grade(mutated).findings.some(
        (finding) =>
          finding.check === canary.expect.check &&
          (canary.expect.category === undefined || finding.category === canary.expect.category),
      );
      expect(found).toBe(true);
    },
  );
});
