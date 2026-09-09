/**
 * 결과 화면 흐름.
 *
 * 기준: v2 제품정의 §3(결과). 하네스 P6 DoD 1·2·3·4.
 *
 * 실제 화면과 실제 스토어를 쓰고 스트림만 바꾼다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const KEY = 'sk-ant-api03-' + 'r'.repeat(80);
const NOW = '2026-09-09T00:00:00.000Z';
const SOURCE = '# 배포 절차\n\n본문 한 줄';

function body(title: string): string {
  return [`# ${title}`, ...PROHIBITIONS].join('\n');
}

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

function setup(stream: StreamPrompt) {
  const keys = createApiKeyStore({ store: memoryStore({ [API_KEY_STORAGE_KEY]: KEY }) });

  configureStudioStore({ documents: createMemoryStore('테스트'), now: () => NOW });
  configureSettingsStore({ keys });
  configureGenerateStore(createSynthesizeDeps({ keys, stream }));
  resetStudioStore();
  resetSettingsStore();
  resetGenerateStore();
}

/** 부를 때마다 다른 결과를 주는 스트림. 회차를 구분하려고 쓴다. */
function countingStream(): StreamPrompt {
  let count = 0;
  return async () => {
    count += 1;
    return body(`결과 ${count}`);
  };
}

/** 붙여넣은 자료를 스토어로 직접 넣는다. 파일명이 그 자료에서 나온다. */
async function generateWith(source: string) {
  await screen.findByTestId('prompt-generate');
  useStudioStore.getState().setSource(source);
  await userEvent.click(screen.getByTestId('prompt-generate'));
  await screen.findByTestId('prompt-text');
}

/** 클립보드를 갈아 끼운다. jsdom에는 `navigator.clipboard`가 없다. */
function withClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

/** 내려받기를 가로챈다. 실제 파일을 만들지 않고 이름과 내용만 본다. */
function watchDownloads() {
  const saved: Array<{ name: string; type: string; text: string }> = [];
  const blobs = new Map<string, Blob>();

  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const url = `blob:test/${blobs.size}`;
      blobs.set(url, blob);
      return url;
    },
    revokeObjectURL: () => {},
  });

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.getAttribute('href') ?? '');
    saved.push({ name: this.download, type: blob?.type ?? '', text: '' });
  });

  return { saved };
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

describe('복사 (DoD 1)', () => {
  it('클립보드에 들어가면 그렇게 알린다', async () => {
    const written: string[] = [];
    withClipboard(async (text) => {
      written.push(text);
    });
    setup(async () => body('복사 대상'));
    render(<StudioPage />);

    await generateWith(SOURCE);
    await userEvent.click(screen.getByTestId('copy-button'));

    await waitFor(() =>
      expect(screen.getByTestId('copy-message').textContent).toContain('복사했습니다'),
    );
    expect(written[0]).toContain('복사 대상');
  });

  it('클립보드가 막히면 전문을 선택하고 그 사실을 말한다', async () => {
    // `file://`이나 권한 거부에서 흔하다. "복사 실패"만 띄우면 사용자는
    // 프롬프트를 손으로 옮겨 적어야 한다.
    withClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    setup(async () => body('선택 대상'));
    render(<StudioPage />);

    await generateWith(SOURCE);
    await userEvent.click(screen.getByTestId('copy-button'));

    await waitFor(() =>
      expect(screen.getByTestId('copy-message').textContent).toContain('전체를 선택했습니다'),
    );

    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(false);
    expect(selection?.toString()).toContain('선택 대상');
  });

  it('클립보드가 아예 없어도 폴백이 선다', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    setup(async () => body('폴백 대상'));
    render(<StudioPage />);

    await generateWith(SOURCE);
    await userEvent.click(screen.getByTestId('copy-button'));

    await waitFor(() =>
      expect(screen.getByTestId('copy-message').textContent).toContain('전체를 선택했습니다'),
    );
  });

  it('화면에 보이는 것이 아니라 프롬프트 전문을 복사한다', async () => {
    const written: string[] = [];
    withClipboard(async (text) => {
      written.push(text);
    });
    setup(async () => body('전문'));
    render(<StudioPage />);

    await generateWith(SOURCE);
    await userEvent.click(screen.getByTestId('copy-button'));

    await waitFor(() => expect(written).toHaveLength(1));
    for (const item of PROHIBITIONS) expect(written[0]).toContain(item);
  });
});

describe('내려받기 (DoD 2)', () => {
  it('파일명이 자료와 회차와 확장자를 따른다', async () => {
    const downloads = watchDownloads();
    setup(async () => body('한 번'));
    render(<StudioPage />);

    await generateWith('# 배포 절차\n\n본문');
    await userEvent.click(screen.getByTestId('prompt-download'));

    expect(downloads.saved[0]?.name).toBe('배포-절차.r1.md');
    expect(downloads.saved[0]?.type).toBe('text/markdown;charset=utf-8');
  });

  it('자료에 든 금지 문자가 파일명에 남지 않는다', async () => {
    const downloads = watchDownloads();
    setup(async () => body('금지 문자'));
    render(<StudioPage />);

    await generateWith('# a/b:c*d?e\n본문');
    await userEvent.click(screen.getByTestId('prompt-download'));

    expect(downloads.saved[0]?.name).toBe('abcde.r1.md');
    expect(downloads.saved[0]?.name).not.toMatch(/[<>:"/\\|?*]/);
  });

  it('다시 만들면 회차가 올라가 이름이 겹치지 않는다', async () => {
    const downloads = watchDownloads();
    setup(countingStream());
    render(<StudioPage />);

    await generateWith('# 배포 절차\n\n본문');
    await userEvent.click(screen.getByTestId('prompt-download'));

    await userEvent.click(screen.getByTestId('prompt-generate'));
    await waitFor(() => expect(screen.getByTestId('prompt-text').textContent).toContain('결과 2'));
    await userEvent.click(screen.getByTestId('prompt-download'));

    expect(downloads.saved.map((item) => item.name)).toEqual([
      '배포-절차.r1.md',
      '배포-절차.r2.md',
    ]);
  });

  it('자료가 비어도 내려받을 수 있다', async () => {
    const downloads = watchDownloads();
    setup(async () => body('빈 자료'));
    render(<StudioPage />);

    await screen.findByTestId('prompt-generate');
    await userEvent.click(screen.getByTestId('prompt-generate'));
    await screen.findByTestId('prompt-text');
    await userEvent.click(screen.getByTestId('prompt-download'));

    expect(downloads.saved[0]?.name).toBe('howsheet-prompt.r1.md');
  });
});

describe('재생성과 이전 결과 (DoD 3)', () => {
  it('다시 만들어도 앞의 결과가 목록에 남는다', async () => {
    setup(countingStream());
    render(<StudioPage />);

    await generateWith(SOURCE);
    expect(screen.queryByTestId('prompt-history')).toBeNull();

    await userEvent.click(screen.getByTestId('prompt-generate'));
    await waitFor(() => expect(screen.getByTestId('prompt-text').textContent).toContain('결과 2'));

    // 덮지 않는다. 앞의 것이 목록에 그대로 있다.
    expect(screen.getByTestId('prompt-history-1')).toBeTruthy();
    expect(screen.getByTestId('prompt-history-2')).toBeTruthy();
  });

  it('이전 결과로 돌아가 볼 수 있다', async () => {
    setup(countingStream());
    render(<StudioPage />);

    await generateWith(SOURCE);
    await userEvent.click(screen.getByTestId('prompt-generate'));
    await waitFor(() => expect(screen.getByTestId('prompt-text').textContent).toContain('결과 2'));

    await userEvent.click(screen.getByTestId('prompt-history-1'));

    expect(screen.getByTestId('prompt-text').textContent).toContain('결과 1');
    expect(screen.getByTestId('prompt-history-1').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('prompt-history-2').getAttribute('aria-pressed')).toBe('false');
  });

  it('이전 결과를 볼 때 그 회차로 내려받는다', async () => {
    const downloads = watchDownloads();
    setup(countingStream());
    render(<StudioPage />);

    await generateWith('# 배포 절차\n\n본문');
    await userEvent.click(screen.getByTestId('prompt-generate'));
    await waitFor(() => expect(screen.getByTestId('prompt-text').textContent).toContain('결과 2'));

    await userEvent.click(screen.getByTestId('prompt-history-1'));
    await userEvent.click(screen.getByTestId('prompt-download'));

    expect(downloads.saved[0]?.name).toBe('배포-절차.r1.md');
  });

  it('어느 것을 보고 있는지 색이 아니라 글자로도 안다', async () => {
    setup(countingStream());
    render(<StudioPage />);

    await generateWith(SOURCE);
    await userEvent.click(screen.getByTestId('prompt-generate'));
    await waitFor(() => expect(screen.getByTestId('prompt-history')).toBeTruthy());

    // 회차 번호와 "(최신)"이 글자로 적혀 있다. (INV-09)
    expect(screen.getByTestId('prompt-history-2').textContent).toContain('2회차');
    expect(screen.getByTestId('prompt-history-2').textContent).toContain('최신');
    expect(screen.getByTestId('prompt-history-1').textContent).toContain('1회차');
  });
});

describe('긴 프롬프트 (DoD 4)', () => {
  const cssPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../src/components/studio/PromptResult/PromptResult.module.css',
  );

  it('전문 상자가 줄을 접도록 선언돼 있다', () => {
    // jsdom은 레이아웃을 계산하지 않아 "가로 스크롤이 없다"를 직접 잴 수 없다.
    // 대신 그것을 만드는 선언이 실제로 있는지 본다. 실기기 확인은 P7이 맡는다.
    const css = readFileSync(cssPath, 'utf8');
    const block = css.slice(css.indexOf('.text {'), css.indexOf('}', css.indexOf('.text {')));

    expect(block).toContain('white-space: pre-wrap');
    expect(block).toContain('overflow-wrap: anywhere');
    // 고정 폭을 주면 접기 선언이 있어도 넘친다.
    expect(block).not.toMatch(/\n\s*width:/);
  });

  it('아주 긴 한 줄도 그대로 담는다', async () => {
    const long = 'x'.repeat(20_000);
    setup(async () => `${body('긴 줄')}\n${long}`);
    render(<StudioPage />);

    await generateWith(SOURCE);

    expect(screen.getByTestId('prompt-text').textContent).toContain(long);
  });
});
