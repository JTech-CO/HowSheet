/**
 * API 키 설정 흐름.
 *
 * 기준: v2 제품정의 §7, §8 INV-01. 하네스 P4 DoD 1·2·3·4·6.
 *
 * 실제 화면과 실제 스토어를 쓰고 저장소만 바꾼다. 여기서 지키는 것은 "화면에
 * 전체 키가 남지 않는다"와 "이 흐름이 아무 데도 요청을 보내지 않는다"다.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudioPage } from '@/pages/StudioPage/StudioPage.tsx';
import { API_KEY_PREFIX, API_KEY_STORAGE_KEY, createApiKeyStore } from '@/storage/api-key.store.ts';
import type { KeyValueStore } from '@/storage/browser-store.ts';
import { createMemoryStore } from '@/storage/document.store.ts';
import { configureSettingsStore, resetSettingsStore } from '@/store/settings.store.ts';
import { configureStudioStore, resetStudioStore } from '@/store/studio.store.ts';

const SECRET = 'z'.repeat(80);
const KEY = `${API_KEY_PREFIX}api03-${SECRET}WXYZ`;
const MASKED = `${API_KEY_PREFIX}...WXYZ`;

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

function setup(backing: KeyValueStore = memoryStore()): KeyValueStore {
  configureStudioStore({
    documents: createMemoryStore('테스트'),
    now: () => '2026-09-09T00:00:00.000Z',
  });
  configureSettingsStore({ keys: createApiKeyStore({ store: backing }) });
  resetStudioStore();
  resetSettingsStore();
  return backing;
}

/** 이 흐름 동안 나가는 모든 요청을 잡는다. 하나라도 있으면 INV-01이 위태롭다. */
function watchNetwork() {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);

  const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {});
  const beacon = vi.fn(() => true);
  if ('sendBeacon' in navigator) vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });

  return {
    calls: () => fetchSpy.mock.calls.length + openSpy.mock.calls.length + beacon.mock.calls.length,
  };
}

/** 콘솔로 새어 나가는 것을 잡는다. (DoD 4) */
function watchConsole() {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((name) => vi.spyOn(console, name).mockImplementation(() => {}));
  return {
    text: () =>
      spies
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map((argument) => String(argument))
        .join('\n'),
  };
}

async function saveKey(value: string) {
  await userEvent.type(await screen.findByTestId('api-key-input'), value);
  await userEvent.click(screen.getByTestId('api-key-save'));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  configureStudioStore(null);
  configureSettingsStore(null);
});

describe('위험 안내 (DoD 6)', () => {
  beforeEach(() => setup());

  it('브라우저에 저장된다는 사실을 접지 않고 보여 준다', async () => {
    render(<StudioPage />);

    const warning = await screen.findByTestId('api-key-warning');
    expect(warning.textContent).toContain('이 브라우저에');
    expect(warning.textContent).toContain('api.anthropic.com');
  });

  it('전용 키를 새로 발급해 쓰라고 안내한다 (§7-7)', async () => {
    render(<StudioPage />);

    const notice = await screen.findByTestId('api-key-dedicated');
    expect(notice.textContent).toContain('새로 발급');
    expect(notice.textContent).toContain('폐기');
  });

  it('키 삭제 버튼이 키가 없어도 자리에 있다 (§7-4)', async () => {
    render(<StudioPage />);

    // "있다"만 보면 감춰 둔 버튼도 통과한다. 눈에 보이는 자리에 있어야 한다.
    const remove = (await screen.findByTestId('api-key-remove')) as HTMLButtonElement;
    expect(remove.hidden).toBe(false);
    expect(remove.getAttribute('aria-hidden')).toBeNull();
    expect(remove.textContent).toContain('키 삭제');
    // 지울 키가 없을 때는 누를 수 없다. 자리는 지키되 헛되이 눌리지 않는다.
    expect(remove.disabled).toBe(true);
  });
});

describe('저장 (DoD 2)', () => {
  it('저장한 뒤 전체 키가 화면 어디에도 없다', async () => {
    const backing = setup();
    render(<StudioPage />);

    await saveKey(KEY);

    await waitFor(() => expect(screen.getByTestId('api-key-masked').textContent).toBe(MASKED));
    // 입력칸을 비운다. 저장 후에 전체 키를 화면에 두지 않는다. (§7-5)
    expect((screen.getByTestId('api-key-input') as HTMLInputElement).value).toBe('');
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(document.body.textContent ?? '').not.toContain(SECRET);
    // 저장은 실제로 됐다.
    expect(backing.getItem(API_KEY_STORAGE_KEY)).toBe(KEY);
  });

  it('상태가 없음에서 저장됨으로 바뀐다', async () => {
    setup();
    render(<StudioPage />);

    expect((await screen.findByTestId('api-key-status')).textContent).toContain('없음');

    await saveKey(KEY);

    await waitFor(() =>
      expect(screen.getByTestId('api-key-status').textContent).toContain('저장됨'),
    );
  });

  it('입력이 가려진 채로 들어간다', async () => {
    setup();
    render(<StudioPage />);

    expect((await screen.findByTestId('api-key-input')).getAttribute('type')).toBe('password');
  });
});

describe('삭제 (DoD 3)', () => {
  it('저장소에서 지우고 상태를 없음으로 되돌린다', async () => {
    const backing = setup(memoryStore({ [API_KEY_STORAGE_KEY]: KEY }));
    render(<StudioPage />);

    await waitFor(() => expect(screen.getByTestId('api-key-masked').textContent).toBe(MASKED));
    await userEvent.click(screen.getByTestId('api-key-remove'));

    await waitFor(() => expect(screen.getByTestId('api-key-status').textContent).toContain('없음'));
    expect(screen.queryByTestId('api-key-masked')).toBeNull();
    expect(backing.getItem(API_KEY_STORAGE_KEY)).toBeNull();
  });
});

describe('형식 오류 (DoD 4)', () => {
  it('이유를 보여 주되 입력을 되풀이하지 않는다', async () => {
    setup();
    render(<StudioPage />);

    const bad = `not-a-key-${SECRET}`;
    await saveKey(bad);

    // 도움말과 자리표시자에도 접두사가 나오므로 오류 문장으로 짚는다.
    const error = await screen.findByText(/붙여넣은 값은 그렇지 않습니다/);
    expect(error.textContent).not.toContain(SECRET);
    expect(screen.getByTestId('api-key-status').textContent ?? '').not.toContain(SECRET);
    // 입력칸에는 일부러 남는다 (아래 테스트). 여기서 보는 것은 **우리가 만든
    // 문구**가 값을 되풀이하지 않는다는 것이다.
  });

  it('붙여넣은 값을 지우지 않는다', async () => {
    setup();
    render(<StudioPage />);

    await saveKey('sk-ant-short');

    // 형식이 틀렸다고 입력칸을 비우면 사용자가 값을 다시 찾아와야 한다.
    expect((screen.getByTestId('api-key-input') as HTMLInputElement).value).toBe('sk-ant-short');
  });

  it('콘솔에 키가 나타나지 않는다', async () => {
    setup();
    const watcher = watchConsole();
    render(<StudioPage />);

    await saveKey(`not-a-key-${SECRET}`);
    await userEvent.clear(screen.getByTestId('api-key-input'));
    await saveKey(KEY);

    expect(watcher.text()).not.toContain(SECRET);
  });
});

describe('요청 (DoD 1, INV-01)', () => {
  it('키를 저장하고 지우는 동안 외부 요청이 0건이다', async () => {
    setup();
    const network = watchNetwork();
    render(<StudioPage />);

    await saveKey(KEY);
    await waitFor(() => expect(screen.getByTestId('api-key-masked').textContent).toBe(MASKED));
    await userEvent.click(screen.getByTestId('api-key-remove'));
    await waitFor(() => expect(screen.getByTestId('api-key-status').textContent).toContain('없음'));

    // P4에는 아직 네트워크 코드가 없다. 0건이 맞고, P5가 이 검사를
    // "api.anthropic.com만"으로 좁힌다.
    expect(network.calls()).toBe(0);
  });
});

describe('저장소를 쓸 수 없을 때', () => {
  it('이 탭에만 남는다고 알린다', async () => {
    setup(null as unknown as KeyValueStore);
    configureSettingsStore({ keys: createApiKeyStore({ store: null }) });
    resetSettingsStore();
    render(<StudioPage />);

    await saveKey(KEY);

    const notice = await screen.findByTestId('api-key-memory');
    expect(notice.textContent).toContain('이 탭에');
    expect(notice.textContent).not.toContain(SECRET);
  });
});
