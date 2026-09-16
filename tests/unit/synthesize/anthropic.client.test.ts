import { describe, expect, it, vi } from 'vitest';

import { createAnthropicStreamer } from '@/features/synthesize/anthropic.client.ts';
import { classifySynthesisError } from '@/features/synthesize/errors.ts';
import { DEFAULT_DESIGN } from '@/domain/spec.defaults.ts';
import { ELEMENT_IDS } from '@/domain/spec.types.ts';
import { estimateTokens } from '@/domain/studio.defaults.ts';
import { STUDIO_DOCUMENT_VERSION } from '@/domain/studio.types.ts';
import { MAX_SOURCE_CHARACTERS, composePrompt } from '@/features/compose/compose.ts';
import {
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
  outputTokenBudget,
} from '@/features/synthesize/model.ts';

/**
 * 기준: v2 제품정의 §6.1, §8 INV-01·INV-08. 하네스 P5 DoD 2·6.
 *
 * 여기서 지키는 것은 둘이다.
 *
 * 1. **요청이 `api.anthropic.com`으로만 나간다.** (DoD 6, INV-08)
 * 2. `errors.ts`의 구조 판정이 **실제 SDK 오류**와 맞는다. 모양만 흉내 낸
 *    테스트로는 SDK가 바뀌었을 때 조용히 어긋난다.
 */

const KEY = 'sk-ant-api03-' + 't'.repeat(80);

function sse(events: Array<[string, unknown]>): Response {
  const body = events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function textStream(chunks: string[], stopReason = 'end_turn'): Response {
  return sse([
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: DEFAULT_MODEL,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ],
    [
      'content_block_start',
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ],
    ...chunks.map(
      (text) =>
        [
          'content_block_delta',
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
        ] as [string, unknown],
    ),
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 3 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ]);
}

function errorResponse(status: number, type: string): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message: 'nope' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** 인자 타입을 명시해야 `mock.calls[0][0]`을 읽을 수 있다. */
function spyFetch(respond: () => Response | Promise<Response>) {
  return vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(respond()),
  ) as unknown as ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
}

function streamerWith(fetchImpl: typeof globalThis.fetch) {
  return createAnthropicStreamer({ fetch: fetchImpl });
}

describe('요청이 나가는 곳 (DoD 6, INV-08)', () => {
  it('api.anthropic.com 한 곳으로만 보낸다', async () => {
    const fetchSpy = spyFetch(() => textStream(['안녕']));
    const stream = streamerWith(fetchSpy);

    await stream({ apiKey: KEY, system: 's', user: 'u' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(new URL(url).origin).toBe('https://api.anthropic.com');
    expect(new URL(url).pathname).toBe('/v1/messages');
  });

  it('모델과 출력 예산을 그대로 싣는다', async () => {
    const fetchSpy = spyFetch(() => textStream(['x']));
    const stream = streamerWith(fetchSpy);

    await stream({ apiKey: KEY, system: '시스템', user: '사용자' });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body['model']).toBe(DEFAULT_MODEL);
    // 짧은 초안에는 바닥이 실린다. 산식을 자기 자신과 비교하지 않고 숫자로 고정한다.
    expect(body['max_tokens']).toBe(MIN_OUTPUT_TOKENS);
    expect(body['system']).toBe('시스템');
    expect(body['stream']).toBe(true);
    // 사고를 쓰지 않는다. Haiku 4.5는 budget_tokens 방식이고 여기 필요 없다.
    expect(body['thinking']).toBeUndefined();
  });

  it('키를 헤더로만 보낸다', async () => {
    const fetchSpy = spyFetch(() => textStream(['x']));
    const stream = streamerWith(fetchSpy);

    await stream({ apiKey: KEY, system: 's', user: 'u' });

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    // URL이나 본문에 키가 실리면 로그와 히스토리에 남는다.
    expect(url).not.toContain('sk-ant-');
    expect(String(init?.body)).not.toContain('sk-ant-');
    expect(new Headers(init?.headers).get('x-api-key')).toBe(KEY);
  });
});

describe('스트리밍 (할 일 3)', () => {
  it('조각을 순서대로 흘리고 전문을 돌려준다', async () => {
    const seen: string[] = [];
    const stream = streamerWith(spyFetch(() => textStream(['한 ', '페이지 ', '문서'])));

    const text = await stream({
      apiKey: KEY,
      system: 's',
      user: 'u',
      onDelta: (delta) => seen.push(delta),
    });

    expect(seen).toEqual(['한 ', '페이지 ', '문서']);
    expect(text).toBe('한 페이지 문서');
  });
});

describe('출력 예산 (긴 자료에서 잘리지 않게)', () => {
  it('짧은 초안에도 바닥만큼은 준다', () => {
    expect(outputTokenBudget('짧다')).toBe(MIN_OUTPUT_TOKENS);
  });

  it('초안이 길수록 예산이 커진다', () => {
    // 한글 10,000자 → 어림 8,000토큰 → 8,000 × 1.6 + 1,000
    expect(outputTokenBudget('가'.repeat(10_000))).toBe(13_800);
  });

  it('자료 상한을 채운 초안도 예산 안에 들어간다', () => {
    // 천장이 자료 상한보다 작으면 허용된 자료가 언제나 잘린다. 주석이 아니라
    // 여기서 지킨다. (출시 점검 2026-09-16)
    const fullSource = '가'.repeat(MAX_SOURCE_CHARACTERS);
    const draft = composePrompt({
      version: STUDIO_DOCUMENT_VERSION,
      source: fullSource,
      elements: [...ELEMENT_IDS],
      design: DEFAULT_DESIGN,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).text;

    expect(outputTokenBudget(draft)).toBeGreaterThanOrEqual(estimateTokens(draft));
    // 그리고 그 초안에서 천장에 닿는다. 천장 위로는 올라가지 않는다.
    expect(outputTokenBudget(draft)).toBe(MAX_OUTPUT_TOKENS);
  });

  it('모르는 모델에는 보수적인 상한을 준다', () => {
    const draft = '자료'.repeat(30_000);

    // 모델이 낼 수 없는 max_tokens를 보내면 400이 오고, 그 400은 "자료가 너무
    // 깁니다"로 안내된다. 원인은 자료가 아니라 모델이다.
    expect(outputTokenBudget(draft, '모르는-모델')).toBeLessThanOrEqual(8_192);
    expect(outputTokenBudget(draft, DEFAULT_MODEL)).toBe(MAX_OUTPUT_TOKENS);
  });

  it('예산이 실제 요청에 실린다', async () => {
    const fetchSpy = spyFetch(() => textStream(['x']));
    const draft = '가'.repeat(10_000);

    await streamerWith(fetchSpy)({ apiKey: KEY, system: 's', user: draft });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body['max_tokens']).toBe(13_800);
  });
});

describe('끝까지 오지 않은 응답은 결과가 아니다', () => {
  it('stop_reason이 max_tokens면 잘림으로 던진다', async () => {
    const stream = streamerWith(spyFetch(() => textStream(['앞부분만 '], 'max_tokens')));

    await expect(stream({ apiKey: KEY, system: 's', user: 'u' })).rejects.toSatisfy(
      (error: unknown) => classifySynthesisError(error).kind === 'truncated',
    );
  });

  it.each([['refusal'], ['model_context_window_exceeded'], ['tool_use'], ['새로_생긴_이유']])(
    'stop_reason이 %s여도 완성본으로 내밀지 않는다',
    async (reason) => {
      // 허용 목록으로 판정한다. 모르는 이유는 막는 쪽이 기본이다.
      const stream = streamerWith(spyFetch(() => textStream(['조각만 '], reason)));

      await expect(stream({ apiKey: KEY, system: 's', user: 'u' })).rejects.toSatisfy(
        (error: unknown) => classifySynthesisError(error).kind === 'incomplete',
      );
    },
  );

  it('끝까지 온 응답은 그대로 돌려준다', async () => {
    const stream = streamerWith(spyFetch(() => textStream(['끝까지 ', '왔다'], 'end_turn')));

    await expect(stream({ apiKey: KEY, system: 's', user: 'u' })).resolves.toBe('끝까지 왔다');
  });
});

describe('실제 SDK 오류와 판정이 맞는다 (DoD 2)', () => {
  it.each([
    [401, 'authentication_error', 'auth'],
    [429, 'rate_limit_error', 'rate-limit'],
    [500, 'api_error', 'server'],
    [400, 'invalid_request_error', 'request'],
  ])('status %i를 %s에서 %s로 읽는다', async (status, type, kind) => {
    const stream = streamerWith(spyFetch(() => errorResponse(status, type)));

    await expect(stream({ apiKey: KEY, system: 's', user: 'u' })).rejects.toSatisfy(
      (error: unknown) => classifySynthesisError(error).kind === kind,
    );
  });

  it('연결 실패를 network로 읽는다', async () => {
    const stream = streamerWith(
      spyFetch(() => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(stream({ apiKey: KEY, system: 's', user: 'u' })).rejects.toSatisfy(
      (error: unknown) => classifySynthesisError(error).kind === 'network',
    );
  });

  it('취소를 aborted로 읽는다 (DoD 5)', async () => {
    const controller = new AbortController();
    const stream = streamerWith(
      spyFetch(() => {
        controller.abort();
        return textStream(['x']);
      }),
    );

    await expect(
      stream({ apiKey: KEY, system: 's', user: 'u', signal: controller.signal }),
    ).rejects.toSatisfy((error: unknown) => classifySynthesisError(error).kind === 'aborted');
  });

  it('오류가 키를 담아 오지 않는다', async () => {
    const stream = streamerWith(spyFetch(() => errorResponse(401, 'authentication_error')));

    await expect(stream({ apiKey: KEY, system: 's', user: 'u' })).rejects.toSatisfy(
      (error: unknown) => !String(error).includes('sk-ant-'),
    );
  });
});
