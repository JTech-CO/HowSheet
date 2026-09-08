import { describe, expect, it } from 'vitest';

import {
  countCharacters,
  createStudioDocument,
  estimateTokens,
  isStudioDocument,
} from '@/domain/studio.defaults.ts';
import { STUDIO_DOCUMENT_VERSION } from '@/domain/studio.types.ts';

/** 기준: v2 제품정의 §3. 하네스 P1 DoD 5. */

describe('createStudioDocument', () => {
  it('빈 자료로 시작한다', () => {
    const doc = createStudioDocument('2026-09-08T00:00:00.000Z');
    expect(doc).toEqual({
      version: STUDIO_DOCUMENT_VERSION,
      source: '',
      updatedAt: '2026-09-08T00:00:00.000Z',
    });
  });
});

describe('isStudioDocument', () => {
  const valid = createStudioDocument('2026-09-08T00:00:00.000Z');

  it('우리 문서를 통과시킨다', () => {
    expect(isStudioDocument(valid)).toBe(true);
  });

  it('다른 버전을 거부한다', () => {
    expect(isStudioDocument({ ...valid, version: 99 })).toBe(false);
  });

  it('필드 타입이 다르면 거부한다', () => {
    expect(isStudioDocument({ ...valid, source: 123 })).toBe(false);
    expect(isStudioDocument({ ...valid, updatedAt: null })).toBe(false);
  });

  it('객체가 아니면 거부한다', () => {
    for (const value of [null, undefined, 'x', 42, [], true]) {
      expect(isStudioDocument(value)).toBe(false);
    }
  });
});

describe('countCharacters', () => {
  it('빈 문자열은 0', () => {
    expect(countCharacters('')).toBe(0);
  });

  it('한글을 글자 수로 센다', () => {
    expect(countCharacters('안녕하세요')).toBe(5);
  });

  it('이모지를 하나로 센다', () => {
    // UTF-16 길이로 세면 2가 되어 사용자가 보는 것과 어긋난다.
    expect('🙂'.length).toBe(2);
    expect(countCharacters('🙂')).toBe(1);
  });
});

describe('estimateTokens', () => {
  it('빈 문자열은 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('길수록 커진다', () => {
    expect(estimateTokens('가'.repeat(200))).toBeGreaterThan(estimateTokens('가'.repeat(100)));
    expect(estimateTokens('a'.repeat(200))).toBeGreaterThan(estimateTokens('a'.repeat(100)));
  });

  it('음수가 나오지 않는다', () => {
    for (const text of ['', ' ', '\n\n', '가', 'a', '🙂']) {
      expect(estimateTokens(text)).toBeGreaterThanOrEqual(0);
    }
  });

  it('한글을 라틴 문자보다 촘촘하게 센다', () => {
    // 같은 글자 수라면 한글 쪽 토큰이 더 많아야 한다. 한 덩어리로 묶어 세면
    // 한국어 문서의 크기를 크게 낮잡는다.
    expect(estimateTokens('가'.repeat(100))).toBeGreaterThan(estimateTokens('a'.repeat(100)));
  });

  it('한자와 가나도 촘촘한 쪽으로 센다', () => {
    expect(estimateTokens('漢'.repeat(100))).toBeGreaterThan(estimateTokens('a'.repeat(100)));
    expect(estimateTokens('あ'.repeat(100))).toBeGreaterThan(estimateTokens('a'.repeat(100)));
  });

  it('어림수라는 계약만 지킨다', () => {
    // 정확한 값은 모델의 토크나이저만 안다. 여기서 특정 숫자를 고정하면
    // 지킬 수 없는 약속이 된다. 크기 감각이 맞는지만 본다.
    const tokens = estimateTokens('a'.repeat(4000));
    expect(tokens).toBeGreaterThan(500);
    expect(tokens).toBeLessThan(2000);
  });
});
