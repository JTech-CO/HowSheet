import { describe, expect, it, vi } from 'vitest';

import { createAnthropicStreamer } from '@/features/synthesize/anthropic.client.ts';
import { classifySynthesisError } from '@/features/synthesize/errors.ts';
import { DEFAULT_MODEL, MAX_OUTPUT_TOKENS } from '@/features/synthesize/model.ts';

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

function textStream(chunks: string[]): Response {
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
        delta: { stop_reason: 'end_turn', stop_sequence: null },
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

  it('모델과 출력 상한을 그대로 싣는다', async () => {
    const fetchSpy = spyFetch(() => textStream(['x']));
    const stream = streamerWith(fetchSpy);

    await stream({ apiKey: KEY, system: '시스템', user: '사용자' });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body['model']).toBe(DEFAULT_MODEL);
    expect(body['max_tokens']).toBe(MAX_OUTPUT_TOKENS);
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
