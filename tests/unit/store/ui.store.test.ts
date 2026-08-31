import { beforeEach, describe, expect, it } from 'vitest';

import { PreferenceStore, EDITOR_KEYS, type KeyValueStore } from '@/storage/local-storage.ts';
import { configureThemeStore, resetUiStore, resolveTheme, useUiStore } from '@/store/ui.store.ts';

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
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

const ui = () => useUiStore.getState();

beforeEach(() => {
  resetUiStore();
  configureThemeStore(new PreferenceStore({ store: memoryStore() }));
});

describe('섹션과 단계 선택', () => {
  it('기본 섹션은 기본 정보다', () => {
    expect(ui().section).toBe('meta');
    expect(ui().selectedStepId).toBeNull();
  });

  it('단계를 고르면 단계 섹션으로 넘어간다', () => {
    ui().selectStep('step-1');
    expect(ui().section).toBe('steps');
    expect(ui().selectedStepId).toBe('step-1');
  });

  it('선택 해제는 섹션을 바꾸지 않는다', () => {
    ui().selectSection('warnings');
    ui().selectStep(null);
    expect(ui().section).toBe('warnings');
    expect(ui().selectedStepId).toBeNull();
  });
});

describe('알림', () => {
  it('같은 문장을 다시 알릴 수 있게 키를 올린다', () => {
    ui().announce('이동됨');
    const first = ui().announcementKey;
    ui().announce('이동됨');

    expect(ui().announcement).toBe('이동됨');
    expect(ui().announcementKey).toBe(first + 1);
  });
});

describe('테마 (FR-015)', () => {
  it('system은 OS 설정을 따른다', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('선택한 모드를 허용 목록 키에 저장한다', () => {
    const backing = memoryStore();
    configureThemeStore(new PreferenceStore({ store: backing }));

    ui().setThemeMode('dark');

    expect(ui().themeMode).toBe('dark');
    expect(backing.map.get(EDITOR_KEYS.theme)).toBe('dark');
  });

  it('저장된 값이 없으면 system으로 시작한다', () => {
    ui().initTheme();
    expect(ui().themeMode).toBe('system');
  });

  it('저장된 값을 읽어 온다', () => {
    const backing = memoryStore();
    backing.map.set(EDITOR_KEYS.theme, 'light');
    configureThemeStore(new PreferenceStore({ store: backing }));

    ui().initTheme();

    expect(ui().themeMode).toBe('light');
  });

  it('알 수 없는 값은 무시하고 system으로 둔다', () => {
    const backing = memoryStore();
    backing.map.set(EDITOR_KEYS.theme, 'neon');
    configureThemeStore(new PreferenceStore({ store: backing }));

    ui().initTheme();

    expect(ui().themeMode).toBe('system');
  });
});
