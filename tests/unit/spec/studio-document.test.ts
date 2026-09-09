import { describe, expect, it } from 'vitest';

import { DEFAULT_DESIGN } from '@/domain/spec.defaults.ts';
import {
  createStudioDocument,
  isStudioDocument,
  migrateStudioDocument,
} from '@/domain/studio.defaults.ts';
import { STUDIO_DOCUMENT_VERSION } from '@/domain/studio.types.ts';

/**
 * 기준: v2 제품정의 §8 INV-07. 하네스 P2 DoD 2·3·5.
 *
 * 여기서 지키는 것은 하나다. **버전이 올라도 사용자가 붙여넣어 둔 자료가
 * 사라지지 않는다.** 모양 검사만 두고 버전을 올리면 저장된 문서가 통째로
 * "없는 것"이 되어 조용히 지워진다.
 */

const NOW = '2026-09-08T00:00:00.000Z';

describe('createStudioDocument', () => {
  it('빈 자료와 기본 선택으로 시작한다 (DoD 2)', () => {
    expect(createStudioDocument(NOW)).toEqual({
      version: STUDIO_DOCUMENT_VERSION,
      source: '',
      elements: [],
      design: DEFAULT_DESIGN,
      updatedAt: NOW,
    });
  });

  it('기본값 객체를 공유하지 않는다', () => {
    // 같은 객체를 돌려주면 한 문서의 축을 바꿀 때 기본값 자체가 바뀐다.
    const first = createStudioDocument(NOW);
    expect(first.design).not.toBe(DEFAULT_DESIGN);
    first.design.color = 'full';
    expect(DEFAULT_DESIGN.color).toBe('monotone');
    expect(createStudioDocument(NOW).design.color).toBe('monotone');
  });
});

describe('isStudioDocument', () => {
  const valid = createStudioDocument(NOW);

  it('우리 문서를 통과시킨다', () => {
    expect(isStudioDocument(valid)).toBe(true);
  });

  it('선택 필드가 없으면 거부한다', () => {
    const { elements: _elements, ...withoutElements } = valid;
    const { design: _design, ...withoutDesign } = valid;
    expect(isStudioDocument(withoutElements)).toBe(false);
    expect(isStudioDocument(withoutDesign)).toBe(false);
  });

  it('다른 버전과 다른 타입을 거부한다', () => {
    expect(isStudioDocument({ ...valid, version: 1 })).toBe(false);
    expect(isStudioDocument({ ...valid, source: 123 })).toBe(false);
    expect(isStudioDocument({ ...valid, updatedAt: null })).toBe(false);
  });

  it('객체가 아니면 거부한다', () => {
    for (const value of [null, undefined, 'x', 42, [], true]) {
      expect(isStudioDocument(value)).toBe(false);
    }
  });
});

describe('migrateStudioDocument (INV-07)', () => {
  it('v1 문서의 자료를 그대로 살린다', () => {
    const v1 = { version: 1, source: '잃으면 안 되는 자료', updatedAt: NOW };

    const migrated = migrateStudioDocument(v1);

    expect(migrated).toEqual({
      version: STUDIO_DOCUMENT_VERSION,
      source: '잃으면 안 되는 자료',
      elements: [],
      design: DEFAULT_DESIGN,
      updatedAt: NOW,
    });
  });

  it('v1 문서는 모양 검사만으로는 통과하지 못한다', () => {
    // 이 두 단언이 함께 서야 올림 경로가 실제로 하는 일이 있다는 뜻이다.
    const v1 = { version: 1, source: '자료', updatedAt: NOW };
    expect(isStudioDocument(v1)).toBe(false);
    expect(migrateStudioDocument(v1)).not.toBeNull();
  });

  it('현재 버전 문서를 그대로 돌려준다', () => {
    const current = { ...createStudioDocument(NOW), source: '내용', elements: ['code'] };
    expect(migrateStudioDocument(current)).toEqual({ ...current, elements: ['code'] });
  });

  it('모르는 요소만 버리고 아는 요소를 남긴다 (DoD 5)', () => {
    const migrated = migrateStudioDocument({
      ...createStudioDocument(NOW),
      elements: ['diagram', 'chart', 'code'],
    });
    expect(migrated?.elements).toEqual(['diagram', 'code']);
  });

  it('모르는 축 값만 기본값으로 되돌린다 (DoD 5)', () => {
    const migrated = migrateStudioDocument({
      ...createStudioDocument(NOW),
      design: { color: 'neon', tone: 'academic', density: 'compact', typography: 'serif' },
    });
    expect(migrated?.design).toEqual({
      color: DEFAULT_DESIGN.color,
      tone: 'academic',
      density: 'compact',
      typography: 'serif',
    });
  });

  it('올릴 수 없는 값은 null이다', () => {
    for (const value of [
      null,
      undefined,
      'x',
      42,
      { version: 99, source: '', updatedAt: NOW },
      { version: 1, source: 123, updatedAt: NOW },
      { version: 1, source: '', updatedAt: null },
      { source: '', updatedAt: NOW },
    ]) {
      expect(migrateStudioDocument(value)).toBeNull();
    }
  });
});
