import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DESIGN_AXES, ELEMENT_IDS } from '@/domain/spec.types.ts';
import {
  EVAL_SOURCES,
  EVAL_SOURCE_KINDS,
  TRUNCATION_LIMIT,
  allDesigns,
  buildCases,
  designKey,
  elementSetsFor,
} from '@/features/evaluate/cases.ts';

/**
 * 기준: 하네스 P8 할 일 1·2 - 고정 자료 5종 이상 × 선택 조합.
 *
 * 사례 공간이 줄어들면 평가가 조용히 가벼워진다. 여기서 크기와 덮는 범위를 못박는다.
 */

const SOURCES_DIR = fileURLToPath(new URL('../../fixtures/eval/sources/', import.meta.url));

function loadTexts(): Map<string, string> {
  return new Map(
    EVAL_SOURCES.map((source) => [
      source.id,
      readFileSync(`${SOURCES_DIR}${source.id}.md`, 'utf8'),
    ]),
  );
}

describe('자료', () => {
  it('하네스가 지정한 다섯 종류를 모두 갖는다', () => {
    expect(EVAL_SOURCES.length).toBeGreaterThanOrEqual(5);
    for (const kind of EVAL_SOURCE_KINDS) {
      expect(EVAL_SOURCES.some((source) => source.kind === kind)).toBe(true);
    }
  });

  it('자료 파일이 모두 있고 잘림 사례를 만들 만큼 길다', () => {
    for (const [id, text] of loadTexts()) {
      expect([...text].length, id).toBeGreaterThan(TRUNCATION_LIMIT);
    }
  });

  it('자료에 맞는 요소는 카탈로그에 있는 값이다', () => {
    for (const source of EVAL_SOURCES) {
      expect(source.fit.length).toBeGreaterThan(0);
      for (const id of source.fit) expect(ELEMENT_IDS).toContain(id);
    }
  });
});

describe('선택 조합', () => {
  it('디자인 축의 모든 조합을 한 번씩 만든다', () => {
    const designs = allDesigns();
    const expected = DESIGN_AXES.reduce((count, axis) => count * axis.options.length, 1);
    expect(designs).toHaveLength(expected);
    expect(new Set(designs.map(designKey)).size).toBe(expected);
  });

  it('요소는 없음·자료에 맞는 것·전부·하나씩을 돈다', () => {
    const sets = elementSetsFor(EVAL_SOURCES[0]!);
    expect(sets.map((set) => set.id).slice(0, 3)).toEqual(['none', 'fit', 'all']);
    expect(sets).toHaveLength(3 + ELEMENT_IDS.length);
  });

  it('사례 수가 자료 × (요소 조합 × 디자인 + 잘림 1)이다', () => {
    const cases = buildCases(loadTexts());
    const perSource = (3 + ELEMENT_IDS.length) * allDesigns().length + 1;
    expect(cases).toHaveLength(EVAL_SOURCES.length * perSource);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
  });

  it('모든 요소와 모든 디자인 값이 어딘가에서 쓰인다', () => {
    const cases = buildCases(loadTexts());
    for (const id of ELEMENT_IDS) {
      expect(cases.some((item) => item.studio.elements.includes(id))).toBe(true);
    }
    for (const axis of DESIGN_AXES) {
      for (const option of axis.options) {
        expect(cases.some((item) => item.design[axis.id] === option.id)).toBe(true);
      }
    }
  });

  it('자료 줄바꿈을 LF로 맞춘다', () => {
    const texts = new Map(loadTexts());
    const first = EVAL_SOURCES[0]!.id;
    texts.set(first, (texts.get(first) ?? '').replace(/\n/g, '\r\n'));
    expect(buildCases(texts)[0]!.studio.source.includes('\r')).toBe(false);
  });

  it('자료가 빠지면 조용히 건너뛰지 않고 던진다', () => {
    const texts = loadTexts();
    texts.delete(EVAL_SOURCES[0]!.id);
    expect(() => buildCases(texts)).toThrow(EVAL_SOURCES[0]!.id);
  });
});
