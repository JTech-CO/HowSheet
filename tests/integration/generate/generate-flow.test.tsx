/**
 * 프롬프트 생성 흐름.
 *
 * 기준: v2 제품정의 §6, §8 INV-02·INV-06·INV-07. 하네스 P5 DoD 1·2·3·4·5·6.
 *
 * 실제 화면과 실제 스토어를 쓰고 **스트림만** 바꾼다. 요청이 실제로 어디로
 * 나가는지는 `tests/unit/synthesize/anthropic.client.test.ts`가 진짜 SDK로 본다.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROHIBITIONS } from '@/domain/prompt.rules.ts';
import type { StreamPrompt } from '@/features/synthesize/anthropic.client.ts';
import { createSynthesizeDeps } from '@/features/synthesize/deps.ts';
import { StudioPage } from '@/pages/StudioPage/StudioPage.tsx';
import { API_KEY_STORAGE_KEY, createApiKeyStore } from '@/storage/api-key.store.ts';
import type { KeyValueStore } from '@/storage/browser-store.ts';
import { createMemoryStore } from '@/storage/document.store.ts';
import { configureGenerateStore, resetGenerateStore } from '@/store/generate.store.ts';
import { configureSettingsStore, resetSettingsStore } from '@/store/settings.store.ts';
import { configureStudioStore, resetStudioStore, useStudioStore } from '@/store/studio.store.ts';

const KEY = 'sk-ant-api03-' + 'g'.repeat(80);
const NOW = '2026-09-09T00:00:00.000Z';
const WITH_PROHIBITIONS = ['# AI가 쓴 프롬프트', ...PROHIBITIONS].join('\n');

function memoryStore(seed: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

function setup({ key, stream }: { key?: string; stream?: StreamPrompt } = {}) {
  const backing = key === undefined ? memoryStore() : memoryStore({ [API_KEY_STORAGE_KEY]: key });
  const keys = createApiKeyStore({ store: backing });

  // 키를 직접 읽지 않는다. 그 길은 features/synthesize 안에만 있다.
  // (verify:architecture API_KEY_READER)
  const deps = createSynthesizeDeps({ keys, stream: stream ?? (async () => WITH_PROHIBITIONS) });

  configureStudioStore({ documents: createMemoryStore('테스트'), now: () => NOW });
  configureSettingsStore({ keys });
  configureGenerateStore(deps);
  resetStudioStore();
  resetSettingsStore();
  resetGenerateStore();
}

/** 결과를 손으로 풀어 줄 수 있는 스트림. 진행 중 상태를 붙잡는다. */
function gatedStream() {
  let resolve: ((text: string) => void) | null = null;
  let reject: ((error: unknown) => void) | null = null;
  let emit: ((delta: string) => void) | null = null;

  const stream: StreamPrompt = (request) =>
    new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
      emit = (delta) => request.onDelta?.(delta);
      request.signal?.addEventListener('abort', () => {
        rej(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' }));
      });
    });

  return {
    stream,
    started: () => resolve !== null,
    emit: (delta: string) => emit?.(delta),
    finish: (text: string) => resolve?.(text),
    fail: (error: unknown) => reject?.(error),
  };
}

function failingStream(error: unknown): StreamPrompt {
  return async () => {
    throw error;
  };
}

function apiError(status: number) {
  return Object.assign(new Error('api error'), { status, name: 'APIError' });
}

async function generate() {
  await userEvent.click(await screen.findByTestId('prompt-generate'));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetGenerateStore();
  configureStudioStore(null);
  configureSettingsStore(null);
  configureGenerateStore(null);
});

describe('어느 쪽으로 만드는지 밝힌다 (DoD 1)', () => {
  it('키가 없으면 템플릿이라고 미리 알린다', async () => {
    setup();
    render(<StudioPage />);

    expect((await screen.findByTestId('prompt-plan')).textContent).toContain('템플릿으로 조립');
  });

  it('키가 있으면 AI가 다듬는다고 미리 알린다', async () => {
    setup({ key: KEY });
    render(<StudioPage />);

    expect((await screen.findByTestId('prompt-plan')).textContent).toContain('AI가 자료에 맞게');
  });

  it('키 없이 만들면 템플릿 배지와 이유가 뜬다', async () => {
    setup();
    render(<StudioPage />);

    await generate();

    const origin = await screen.findByTestId('prompt-origin');
    expect(origin.textContent).toContain('템플릿으로 조립');
    expect((await screen.findByTestId('prompt-fallback')).textContent).toContain('키가 없어');
    // 키가 없어도 쓸 수 있는 프롬프트가 나온다. (INV-02)
    expect((await screen.findByTestId('prompt-text')).textContent).toContain(
      '한 페이지 문서 만들기',
    );
  });

  it('키가 있으면 AI 배지가 뜨고 AI 결과가 실린다', async () => {
    setup({ key: KEY });
    render(<StudioPage />);

    await generate();

    expect((await screen.findByTestId('prompt-origin')).textContent).toContain('AI가 다듬음');
    expect((await screen.findByTestId('prompt-text')).textContent).toContain('AI가 쓴 프롬프트');
    expect(screen.queryByTestId('prompt-fallback')).toBeNull();
  });
});

describe('스트리밍과 취소 (할 일 3, DoD 5)', () => {
  it('오는 조각을 화면에 차곡차곡 보여 준다', async () => {
    const gate = gatedStream();
    setup({ key: KEY, stream: gate.stream });
    render(<StudioPage />);

    await generate();
    await waitFor(() => expect(gate.started()).toBe(true));

    gate.emit('첫 조각 ');
    gate.emit('둘째 조각');

    await waitFor(() =>
      expect(screen.getByTestId('prompt-streaming').textContent).toBe('첫 조각 둘째 조각'),
    );

    gate.finish(WITH_PROHIBITIONS);
    await waitFor(() => expect(screen.getByTestId('prompt-text')).toBeTruthy());
  });

  it('진행 중에만 취소 버튼이 있다', async () => {
    const gate = gatedStream();
    setup({ key: KEY, stream: gate.stream });
    render(<StudioPage />);

    expect(screen.queryByTestId('prompt-cancel')).toBeNull();

    await generate();
    await waitFor(() => expect(screen.getByTestId('prompt-cancel')).toBeTruthy());

    gate.finish(WITH_PROHIBITIONS);
    await waitFor(() => expect(screen.queryByTestId('prompt-cancel')).toBeNull());
  });

  it('취소해도 앞의 결과가 남는다', async () => {
    const first = gatedStream();
    setup({ key: KEY, stream: first.stream });
    render(<StudioPage />);

    await generate();
    await waitFor(() => expect(first.started()).toBe(true));
    first.finish(['# 첫 결과', ...PROHIBITIONS].join('\n'));
    await waitFor(() => expect(screen.getByTestId('prompt-text').textContent).toContain('첫 결과'));

    // 두 번째 생성을 시작했다가 멈춘다.
    await userEvent.click(screen.getByTestId('prompt-generate'));
    await waitFor(() => expect(screen.getByTestId('prompt-cancel')).toBeTruthy());
    await userEvent.click(screen.getByTestId('prompt-cancel'));

    await waitFor(() => expect(screen.queryByTestId('prompt-cancel')).toBeNull());
    // 지워지지 않는다. 되돌릴 방법이 없기 때문이다.
    expect(screen.getByTestId('prompt-text').textContent).toContain('첫 결과');
  });

  it('취소를 실패로 안내하지 않는다', async () => {
    const gate = gatedStream();
    setup({ key: KEY, stream: gate.stream });
    render(<StudioPage />);

    await generate();
    await waitFor(() => expect(gate.started()).toBe(true));
    await userEvent.click(screen.getByTestId('prompt-cancel'));

    await waitFor(() => expect(screen.queryByTestId('prompt-cancel')).toBeNull());
    expect(screen.queryByTestId('prompt-error')).toBeNull();
    expect(screen.queryByTestId('prompt-fallback')).toBeNull();
  });
});

describe('실패 안내 (DoD 2)', () => {
  it.each([
    ['401', apiError(401), '키가 거부됐습니다'],
    ['429', apiError(429), '요청이 너무 잦습니다'],
    [
      '네트워크',
      Object.assign(new Error('down'), { name: 'APIConnectionError' }),
      '네트워크에 닿지 못했습니다',
    ],
  ])('%s는 그 상황에 맞는 문장을 낸다', async (_label, error, phrase) => {
    setup({ key: KEY, stream: failingStream(error) });
    render(<StudioPage />);

    await generate();

    const fallback = await screen.findByTestId('prompt-fallback');
    expect(fallback.textContent).toContain(phrase);
    // 실패해도 쓸 수 있는 프롬프트가 함께 나온다. (INV-02)
    expect((await screen.findByTestId('prompt-origin')).textContent).toContain('템플릿으로 조립');
    expect(screen.getByTestId('prompt-text').textContent).toContain('한 페이지 문서 만들기');
  });

  it('세 상황이 서로 다른 문장을 낸다', async () => {
    const seen: string[] = [];

    for (const error of [
      apiError(401),
      apiError(429),
      Object.assign(new Error('down'), { name: 'APIConnectionError' }),
    ]) {
      setup({ key: KEY, stream: failingStream(error) });
      render(<StudioPage />);
      await generate();
      seen.push((await screen.findByTestId('prompt-fallback')).textContent ?? '');
      cleanup();
    }

    expect(new Set(seen).size).toBe(3);
  });
});

describe('실패가 입력을 지우지 않는다 (DoD 3, INV-07)', () => {
  it('자료와 고른 요소가 그대로 남는다', async () => {
    setup({ key: KEY, stream: failingStream(apiError(500)) });
    render(<StudioPage />);

    await userEvent.type(await screen.findByTestId('source-input'), '지켜야 할 자료');
    await userEvent.click(screen.getByTestId('element-code'));

    await generate();
    await screen.findByTestId('prompt-fallback');

    expect((screen.getByTestId('source-input') as HTMLTextAreaElement).value).toBe(
      '지켜야 할 자료',
    );
    expect(screen.getByTestId('element-code').getAttribute('aria-pressed')).toBe('true');
    expect(useStudioStore.getState().document?.source).toBe('지켜야 할 자료');
    expect(useStudioStore.getState().document?.elements).toEqual(['code']);
  });
});

describe('금지 목록 강제 (DoD 4, INV-06)', () => {
  it('AI가 빠뜨리면 덧붙이고 그 사실을 알린다', async () => {
    setup({ key: KEY, stream: async () => '# 금지 목록이 빠진 결과' });
    render(<StudioPage />);

    await generate();

    const notice = await screen.findByTestId('prompt-prohibitions-appended');
    expect(notice.textContent).toContain('덧붙였습니다');

    const text = screen.getByTestId('prompt-text').textContent ?? '';
    for (const item of PROHIBITIONS) expect(text).toContain(item);
  });

  it('다 들어 있으면 덧붙였다고 하지 않는다', async () => {
    setup({ key: KEY });
    render(<StudioPage />);

    await generate();
    await screen.findByTestId('prompt-origin');

    expect(screen.queryByTestId('prompt-prohibitions-appended')).toBeNull();
  });
});

describe('외부 요청 (DoD 6, INV-08)', () => {
  it('화면 흐름 자체는 아무 데도 요청을 보내지 않는다', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {});

    setup({ key: KEY });
    render(<StudioPage />);
    await generate();
    await screen.findByTestId('prompt-origin');

    // 요청은 주입한 스트림 하나를 지난다. 실제 목적지 검사는 client 단위 테스트가 한다.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
