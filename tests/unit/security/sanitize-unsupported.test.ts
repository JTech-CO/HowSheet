// @vitest-environment jsdom
//
// DOMPurify에는 DOM이 필요하다. 살균기가 "돌 수 없는 환경"을 흉내 내려면 그
// 판정만 바꾸고 나머지는 진짜 DOM 위에서 돌린다.

import type * as DomPurifyModule from 'dompurify';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 기준: v2 제품정의 §8 INV-05. 출시 점검 2026-09-16.
 *
 * DOMPurify는 돌 수 없는 환경에서 **던지지 않고 입력을 그대로 돌려준다.** 1단계
 * (remark)가 raw HTML을 지워도 `[x](javascript:...)`에서 만든 링크는 2단계가
 * 조여야 한다. 2단계가 조용히 빠지면 호출부는 살균된 HTML이라고 믿고 그린다.
 */

vi.mock('dompurify', async (importOriginal) => {
  const actual = await importOriginal<typeof DomPurifyModule>();
  const factory = (view: Parameters<typeof actual.default>[0]) => {
    const created = actual.default(view);
    return Object.assign(created, { isSupported: false });
  };
  return { ...actual, default: factory };
});

afterEach(() => {
  vi.resetModules();
});

describe('살균기가 돌 수 없는 환경', () => {
  it('입력을 그대로 돌려주지 않고 던진다', async () => {
    const { resetSanitizer, sanitizeHtml } = await import('@/features/sanitize/sanitize-html.ts');
    resetSanitizer();

    expect(() => sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toThrow();
  });

  it('Markdown 경로도 살균되지 않은 HTML을 내놓지 않는다', async () => {
    const { resetSanitizer } = await import('@/features/sanitize/sanitize-html.ts');
    const { markdownToSafeHtml } = await import('@/features/sanitize/markdown-to-html.ts');
    resetSanitizer();

    expect(() => markdownToSafeHtml('[x](javascript:alert(1))')).toThrow();
  });
});
