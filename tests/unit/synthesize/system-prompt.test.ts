import { describe, expect, it } from 'vitest';

import { OUTPUT_REQUIREMENTS, PROHIBITIONS } from '@/domain/prompt.rules.ts';
import {
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
} from '@/features/synthesize/model.ts';
import { buildSystemPrompt, buildUserMessage } from '@/features/synthesize/system-prompt.ts';

/**
 * 기준: v2 제품정의 §6.1·§6.2, §8 INV-04·INV-06. 하네스 P5 할 일 2, 주의.
 */

describe('모델 (하네스 P5 주의)', () => {
  it('기본 모델이 claude-haiku-4-5다', () => {
    // 임의로 바꾸지 않는다. 바꾸려면 제품정의 §6.1부터 고친다.
    expect(DEFAULT_MODEL).toBe('claude-haiku-4-5');
  });

  it('출력 예산의 천장이 기본 모델의 출력 한계 안에 있다', () => {
    // Haiku 4.5의 최대 출력은 64,000토큰이다. 넘기면 요청이 400으로 거부되고,
    // 그 400은 "자료가 너무 깁니다"로 안내된다. (출시 점검 2026-09-16)
    expect(MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(64_000);
    expect(MIN_OUTPUT_TOKENS).toBeLessThan(MAX_OUTPUT_TOKENS);
  });
});

describe('시스템 프롬프트 (§6.2)', () => {
  const system = buildSystemPrompt();

  it('결과 페이지가 아니라 프롬프트를 쓰라고 못박는다 (INV-04)', () => {
    expect(system).toContain('프롬프트를 쓰는 사람');
    expect(system).toContain('HTML을 출력하지 않는다');
  });

  it.each([
    ['1. 근거 있는 내용만', '실제로 근거가 있는 내용만'],
    ['2. 요소마다 구체적으로', '구체적으로 지정한다'],
    ['3. CSS로 옮길 수준', 'CSS로 옮길 수 있는 수준'],
    ['4. 금지 목록을 그대로', '그대로 싣는다'],
    ['5. 결과물 요구사항', '결과물 요구사항을 결과 프롬프트에 싣는다'],
    ['6. 한 페이지 분량', '한 페이지 분량을 넘기지 않게'],
  ])('§6.2의 %s를 담는다', (_label, phrase) => {
    expect(system).toContain(phrase);
  });

  it('금지 목록을 항목 단위로 전부 담는다 (INV-06)', () => {
    expect(PROHIBITIONS.length).toBeGreaterThan(0);
    for (const item of PROHIBITIONS) expect(system).toContain(item);
  });

  it('결과물 요구사항을 전부 담는다', () => {
    for (const item of OUTPUT_REQUIREMENTS) expect(system).toContain(item);
  });

  it('설명을 붙이지 말라고 한다', () => {
    expect(system).toContain('프롬프트 전문만 출력한다');
  });

  it('같은 입력에서 같은 시스템 프롬프트가 나온다', () => {
    expect(buildSystemPrompt()).toBe(system);
    expect(system).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('사용자 메시지', () => {
  it('조립한 초안을 그대로 재료로 넘긴다', () => {
    const draft = '# 초안\n\n본문';
    const message = buildUserMessage(draft);

    expect(message).toContain(draft);
    expect(message).toContain('구체적으로 지정해 다시 써라');
  });

  it('금지 목록과 요구사항을 남기라고 한다', () => {
    expect(buildUserMessage('x')).toContain('금지 목록과 요구사항은 그대로 남긴다');
  });
});
