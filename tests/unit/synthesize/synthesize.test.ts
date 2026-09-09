import { describe, expect, it, vi } from 'vitest';

import { PROHIBITIONS } from '@/domain/prompt.rules.ts';
import { createStudioDocument } from '@/domain/studio.defaults.ts';
import type { StudioDocument } from '@/domain/studio.types.ts';
import { composePrompt, missingProhibitions } from '@/features/compose/compose.ts';
import type { StreamPrompt } from '@/features/synthesize/anthropic.client.ts';
import {
  ensureProhibitions,
  synthesizePrompt,
  type SynthesizeDeps,
} from '@/features/synthesize/synthesize.ts';

/**
 * 기준: v2 제품정의 §6.3, §8 INV-02·INV-06·INV-07. 하네스 P5 DoD 1·3·4·5.
 */

const NOW = '2026-09-09T00:00:00.000Z';
const KEY = 'sk-ant-api03-' + 'k'.repeat(80);

function studio(patch: Partial<StudioDocument> = {}): StudioDocument {
  return { ...createStudioDocument(NOW), source: '자료 본문', ...patch };
}

function deps(overrides: Partial<SynthesizeDeps> = {}): SynthesizeDeps {
  return {
    readApiKey: () => KEY,
    stream: async () => '# AI가 쓴 프롬프트',
    ...overrides,
  };
}

function apiError(status: number, name = 'APIError') {
  return Object.assign(new Error('api error'), { status, name });
}

describe('키가 없을 때 (DoD 1, INV-02)', () => {
  it('템플릿으로 조립하고 그 사실을 담는다', async () => {
    const document = studio();
    const outcome = await synthesizePrompt(document, deps({ readApiKey: () => null }));

    expect(outcome.origin).toBe('template');
    expect(outcome.fallback).toEqual({ reason: 'no-key' });
    expect(outcome.text).toBe(composePrompt(document).text);
  });

  it('빈 문자열 키도 없는 것으로 본다', async () => {
    const outcome = await synthesizePrompt(studio(), deps({ readApiKey: () => '' }));
    expect(outcome.origin).toBe('template');
  });

  it('키가 없으면 요청을 아예 보내지 않는다', async () => {
    const stream = vi.fn<StreamPrompt>();
    await synthesizePrompt(studio(), deps({ readApiKey: () => null, stream }));
    expect(stream).not.toHaveBeenCalled();
  });
});

describe('키가 있을 때 (DoD 1)', () => {
  it('AI 결과를 쓰고 출처를 ai로 남긴다', async () => {
    const text = ['# AI 프롬프트', ...PROHIBITIONS].join('\n');
    const outcome = await synthesizePrompt(studio(), deps({ stream: async () => text }));

    expect(outcome.origin).toBe('ai');
    expect(outcome.text).toBe(text);
    expect(outcome.fallback).toBeUndefined();
  });

  it('시스템 프롬프트와 초안을 함께 넘긴다', async () => {
    const stream = vi.fn<StreamPrompt>(async () => '결과');
    const document = studio();

    await synthesizePrompt(document, deps({ stream }));

    const request = stream.mock.calls[0]?.[0];
    expect(request?.apiKey).toBe(KEY);
    expect(request?.system).toContain('프롬프트를 쓰는 사람');
    // 자료를 두 번 조립하지 않는다. P3의 결과가 그대로 재료다.
    expect(request?.user).toContain(composePrompt(document).text);
  });

  it('조각 콜백을 그대로 넘긴다 (할 일 3)', async () => {
    const onDelta = vi.fn();
    const stream: StreamPrompt = async (request) => {
      request.onDelta?.('조각');
      return '결과';
    };

    await synthesizePrompt(studio(), deps({ stream }), { onDelta });

    expect(onDelta).toHaveBeenCalledWith('조각');
  });

  it('빈 응답은 실패로 보고 템플릿으로 간다', async () => {
    const outcome = await synthesizePrompt(studio(), deps({ stream: async () => '   \n ' }));

    expect(outcome.origin).toBe('template');
    expect(outcome.fallback).toEqual({ reason: 'empty-response' });
  });
});

describe('금지 목록 강제 (DoD 4, INV-06)', () => {
  it('빠져 있으면 덧붙이고 그 사실을 남긴다', async () => {
    const outcome = await synthesizePrompt(
      studio(),
      deps({ stream: async () => '# 금지 없는 결과' }),
    );

    expect(outcome.origin).toBe('ai');
    expect(outcome.prohibitionsAppended).toBe(true);
    // 조용히 통과시키지 않는다. 덧붙인 뒤에는 하나도 빠져 있지 않다.
    expect(missingProhibitions(outcome.text)).toEqual([]);
    expect(outcome.text).toContain('빠져 있어 덧붙임');
  });

  it('하나만 빠져도 그것만 덧붙인다', async () => {
    const dropped = PROHIBITIONS[3] ?? '';
    const text = ['# 결과', ...PROHIBITIONS.filter((item) => item !== dropped)].join('\n');

    const outcome = await synthesizePrompt(studio(), deps({ stream: async () => text }));

    expect(outcome.prohibitionsAppended).toBe(true);
    expect(missingProhibitions(outcome.text)).toEqual([]);
  });

  it('다 들어 있으면 건드리지 않는다', async () => {
    const text = ['# 결과', ...PROHIBITIONS].join('\n');
    const outcome = await synthesizePrompt(studio(), deps({ stream: async () => text }));

    expect(outcome.prohibitionsAppended).toBe(false);
    expect(outcome.text).toBe(text);
  });

  it('템플릿 결과는 덧붙일 것이 없다', async () => {
    const outcome = await synthesizePrompt(studio(), deps({ readApiKey: () => null }));

    expect(outcome.prohibitionsAppended).toBe(false);
    expect(missingProhibitions(outcome.text)).toEqual([]);
  });
});

describe('ensureProhibitions', () => {
  it('빈 텍스트에 전부 덧붙인다', () => {
    const result = ensureProhibitions('');
    expect(result.appended).toBe(true);
    expect(missingProhibitions(result.text)).toEqual([]);
  });

  it('덧붙였다는 사실이 글자로 남는다', () => {
    expect(ensureProhibitions('x').text).toContain('빠져 있어 덧붙임');
  });
});

describe('실패 (DoD 2·3)', () => {
  it.each([
    [401, 'auth'],
    [429, 'rate-limit'],
    [500, 'server'],
  ])('status %i면 템플릿으로 가고 이유를 %s로 남긴다', async (status, kind) => {
    const outcome = await synthesizePrompt(
      studio(),
      deps({
        stream: async () => {
          throw apiError(status);
        },
      }),
    );

    expect(outcome.origin).toBe('template');
    expect(outcome.fallback?.reason).toBe('error');
    if (outcome.fallback?.reason === 'error') expect(outcome.fallback.error.kind).toBe(kind);
  });

  it('실패해도 쓸 수 있는 프롬프트가 나온다 (INV-02)', async () => {
    const document = studio();
    const outcome = await synthesizePrompt(
      document,
      deps({
        stream: async () => {
          throw apiError(429);
        },
      }),
    );

    expect(outcome.text).toBe(composePrompt(document).text);
    expect(missingProhibitions(outcome.text)).toEqual([]);
  });

  it('문서를 건드리지 않는다 (INV-07)', async () => {
    const document = studio({ elements: ['code'] });
    const before = JSON.stringify(document);

    await synthesizePrompt(
      document,
      deps({
        stream: async () => {
          throw apiError(500);
        },
      }),
    );

    expect(JSON.stringify(document)).toBe(before);
  });
});

describe('취소 (DoD 5)', () => {
  it('폴백을 만들지 않고 그대로 던진다', async () => {
    const aborted = Object.assign(new Error('stop'), { name: 'APIUserAbortError' });

    await expect(
      synthesizePrompt(
        studio(),
        deps({
          stream: async () => {
            throw aborted;
          },
        }),
      ),
    ).rejects.toBe(aborted);
  });

  it('신호를 그대로 넘긴다', async () => {
    const stream = vi.fn<StreamPrompt>(async () => '결과');
    const controller = new AbortController();

    await synthesizePrompt(studio(), deps({ stream }), { signal: controller.signal });

    expect(stream.mock.calls[0]?.[0].signal).toBe(controller.signal);
  });
});

describe('자료 길이 정보', () => {
  it('조립기의 측정을 그대로 옮긴다', async () => {
    const source = 'ㄱ'.repeat(120);
    const outcome = await synthesizePrompt(studio({ source }), deps({ readApiKey: () => null }));

    expect(outcome.sourceCharacters).toBe(120);
    expect(outcome.includedCharacters).toBe(120);
    expect(outcome.truncated).toBe(false);
  });
});
