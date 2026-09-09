import { describe, expect, it } from 'vitest';

import { OUTPUT_REQUIREMENTS, PROHIBITIONS } from '@/domain/prompt.rules.ts';

/**
 * 기준: v2 제품정의 §5.1. 하네스 P3 DoD 2, 주의.
 *
 * 이 파일이 지키는 것은 하나다. **목록이 비거나 얇아지지 않는다.** 조립기 쪽
 * 검사는 "목록의 모든 항목이 출력에 있는가"를 보는데, 목록이 비면 그 검사가
 * 전부 공허하게 통과한다.
 */

describe('금지 목록 (INV-06)', () => {
  it('제품정의 §5.1의 일곱 줄이 그대로 있다', () => {
    expect(PROHIBITIONS).toHaveLength(7);
  });

  it('항목이 겹치지 않는다', () => {
    expect(new Set(PROHIBITIONS).size).toBe(PROHIBITIONS.length);
  });

  it('항목이 지시로 읽힐 만큼 길다', () => {
    // 빈 문자열이나 한두 글자로 갈아 끼워도 개수 검사는 통과한다.
    for (const item of PROHIBITIONS) {
      expect(item.trim().length).toBeGreaterThan(15);
    }
  });

  it('§5.1이 이름으로 지정한 것을 각각 덮는다', () => {
    // 항목을 다른 문구로 조용히 바꾸면 여기서 걸린다.
    const keywords = ['네온', 'backdrop-blur', '이모지', '파티클', 'shimmer', '폰트', 'CDN'];
    for (const keyword of keywords) {
      expect(PROHIBITIONS.some((item) => item.includes(keyword))).toBe(true);
    }
  });

  it('항목이 서로를 포함하지 않는다', () => {
    // 한 항목이 다른 항목의 부분 문자열이면 "빠짐없이 들어갔는가" 검사가
    // 한 항목만으로도 통과할 수 있다.
    for (const item of PROHIBITIONS) {
      const others = PROHIBITIONS.filter((candidate) => candidate !== item);
      expect(others.some((candidate) => candidate.includes(item))).toBe(false);
    }
  });
});

describe('결과물 요구사항', () => {
  it('하네스가 이름으로 지정한 넷이 있다', () => {
    expect(OUTPUT_REQUIREMENTS).toHaveLength(4);
    expect(new Set(OUTPUT_REQUIREMENTS).size).toBe(4);
  });

  it('단일 HTML·외부 요청 0건·인쇄·320px를 각각 말한다', () => {
    const keywords = ['HTML 파일 하나', '외부 요청', '인쇄', '320px'];
    for (const keyword of keywords) {
      expect(OUTPUT_REQUIREMENTS.some((item) => item.includes(keyword))).toBe(true);
    }
  });
});
