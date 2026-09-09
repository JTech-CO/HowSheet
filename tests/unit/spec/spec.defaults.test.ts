import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DESIGN,
  isDesignOptionId,
  isElementId,
  normalizeDesign,
  normalizeElements,
  toggleElement,
} from '@/domain/spec.defaults.ts';
import {
  DESIGN_AXES,
  DESIGN_AXIS_IDS,
  ELEMENTS,
  ELEMENT_IDS,
  type ElementId,
} from '@/domain/spec.types.ts';

/**
 * 기준: v2 제품정의 §4·§5. 하네스 P2 DoD 1·2·5.
 *
 * 여기서 지키는 것은 "알 수 없는 값이 도메인에 들어오지 않는다"와 "축은 비지
 * 않는다" 두 가지다.
 */

describe('카탈로그 (§4·§5)', () => {
  it('요소가 열 종이고 목록과 상세가 같은 순서다', () => {
    // 목록이 비면 아래의 거부 단언이 전부 공허하게 통과한다.
    expect(ELEMENT_IDS).toHaveLength(10);
    expect(ELEMENTS.map((element) => element.id)).toEqual([...ELEMENT_IDS]);
  });

  it('요소 아이디가 겹치지 않는다', () => {
    expect(new Set(ELEMENT_IDS).size).toBe(ELEMENT_IDS.length);
  });

  it('요소마다 프롬프트에 넣을 요구 문구가 있다', () => {
    // P3의 조립기가 이 문구를 그대로 쓴다. 비면 고른 요소가 프롬프트에
    // 아무 흔적도 남기지 않는다.
    for (const element of ELEMENTS) {
      expect(element.label.length).toBeGreaterThan(0);
      expect(element.hint.length).toBeGreaterThan(0);
      expect(element.requirement.length).toBeGreaterThan(20);
    }
  });

  it('디자인 축이 네 종이고 축마다 선택지가 둘 이상이다', () => {
    expect(DESIGN_AXIS_IDS).toHaveLength(4);
    expect(DESIGN_AXES.map((axis) => axis.id)).toEqual([...DESIGN_AXIS_IDS]);

    for (const axis of DESIGN_AXES) {
      // 선택지가 하나뿐인 축은 고를 것이 없으므로 축이 아니다.
      expect(axis.options.length).toBeGreaterThan(1);
      expect(new Set(axis.options.map((option) => option.id)).size).toBe(axis.options.length);
      for (const option of axis.options) {
        expect(option.requirement.length).toBeGreaterThan(10);
      }
    }
  });

  it('제품정의가 요구한 축을 담는다', () => {
    const color = DESIGN_AXES.find((axis) => axis.id === 'color');
    expect(color?.options.map((option) => option.id)).toContain('monotone');
    const tone = DESIGN_AXES.find((axis) => axis.id === 'tone');
    expect(tone?.options.map((option) => option.id)).toEqual(
      expect.arrayContaining(['academic', 'technical', 'business']),
    );
  });
});

describe('기본 선택 (DoD 2)', () => {
  it('축마다 값이 하나씩 있고 모두 실제 선택지다', () => {
    for (const axis of DESIGN_AXIS_IDS) {
      expect(isDesignOptionId(axis, DEFAULT_DESIGN[axis])).toBe(true);
    }
    expect(Object.keys(DEFAULT_DESIGN).sort()).toEqual([...DESIGN_AXIS_IDS].sort());
  });
});

describe('isElementId (DoD 5)', () => {
  it('아는 값을 통과시킨다', () => {
    for (const id of ELEMENT_IDS) expect(isElementId(id)).toBe(true);
  });

  it('모르는 값을 거부한다', () => {
    for (const value of ['', 'DIAGRAM', 'chart', null, undefined, 3, {}, ['diagram']]) {
      expect(isElementId(value)).toBe(false);
    }
  });
});

describe('isDesignOptionId (DoD 5)', () => {
  it('그 축의 값만 통과시킨다', () => {
    expect(isDesignOptionId('color', 'monotone')).toBe(true);
    expect(isDesignOptionId('tone', 'academic')).toBe(true);
  });

  it('다른 축의 값을 거부한다', () => {
    // 축을 섞어 넣으면 색 축에 톤 값이 들어앉는다.
    expect(isDesignOptionId('color', 'academic')).toBe(false);
    expect(isDesignOptionId('tone', 'monotone')).toBe(false);
  });

  it('문자열이 아닌 값을 거부한다', () => {
    for (const value of [null, undefined, 1, {}, []]) {
      expect(isDesignOptionId('color', value)).toBe(false);
    }
  });
});

describe('normalizeElements (DoD 5)', () => {
  it('배열이 아니면 빈 선택으로 본다', () => {
    for (const value of [null, undefined, 'diagram', 7, {}]) {
      expect(normalizeElements(value)).toEqual([]);
    }
  });

  it('모르는 값만 버리고 나머지를 살린다', () => {
    // 통째로 버리면 앱을 올린 사용자의 선택이 한꺼번에 사라진다.
    expect(normalizeElements(['diagram', 'nope', 'code', 42])).toEqual(['diagram', 'code']);
  });

  it('중복을 접는다', () => {
    expect(normalizeElements(['code', 'code', 'code'])).toEqual(['code']);
  });

  it('고른 순서가 아니라 카탈로그 순서로 돌려준다', () => {
    // P3의 조립기가 결정적이어야 한다. 같은 선택에서 같은 프롬프트가 나온다.
    expect(normalizeElements(['faq', 'diagram', 'code'])).toEqual(['diagram', 'code', 'faq']);
    expect(normalizeElements(['code', 'faq', 'diagram'])).toEqual(['diagram', 'code', 'faq']);
  });
});

describe('normalizeDesign (DoD 2·5)', () => {
  it('객체가 아니면 전부 기본값이다', () => {
    for (const value of [null, undefined, 'monotone', 5, []]) {
      expect(normalizeDesign(value)).toEqual(DEFAULT_DESIGN);
    }
  });

  it('아는 값을 유지한다', () => {
    const design = normalizeDesign({ color: 'full', tone: 'academic' });
    expect(design.color).toBe('full');
    expect(design.tone).toBe('academic');
  });

  it('모르는 축 값만 기본값으로 되돌린다', () => {
    const design = normalizeDesign({ color: 'neon', tone: 'business' });
    expect(design.color).toBe(DEFAULT_DESIGN.color);
    expect(design.tone).toBe('business');
  });

  it('어떤 입력에도 축이 비지 않는다', () => {
    for (const value of [{}, { color: null }, { tone: 'x', density: 'y', typography: 'z' }]) {
      const design = normalizeDesign(value);
      for (const axis of DESIGN_AXIS_IDS) {
        expect(isDesignOptionId(axis, design[axis])).toBe(true);
      }
    }
  });
});

describe('toggleElement', () => {
  it('없으면 켜고 있으면 끈다', () => {
    expect(toggleElement([], 'code')).toEqual(['code']);
    expect(toggleElement(['code'], 'code')).toEqual([]);
  });

  it('카탈로그 순서를 지킨다', () => {
    expect(toggleElement(['faq'], 'diagram')).toEqual(['diagram', 'faq']);
  });

  it('입력 배열을 건드리지 않는다', () => {
    const current: ElementId[] = ['code'];
    toggleElement(current, 'faq');
    expect(current).toEqual(['code']);
  });
});
