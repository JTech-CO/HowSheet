/**
 * 일시 UI 상태 스토어.
 *
 * 기준: v2 제품정의 §3(화면).
 *
 * 여기 있는 값은 화면 상태다. 테마만 저장되고 나머지는 새로고침하면 사라진다.
 *
 * v1에는 선택한 단계·열린 개요 같은 편집기 상태가 함께 있었다. v2는 화면이
 * 하나라 그 개념이 없어졌고, 남은 것은 테마와 알림뿐이다.
 */

import { create } from 'zustand';

import type { ThemeToggleMode } from '../components/ui/ThemeToggle/ThemeToggle.tsx';
import { PREFERENCE_KEYS, PreferenceStore } from '../storage/local-storage.ts';

/**
 * 테마 선택 값.
 *
 * v1에서는 `domain/guide.types.ts`가 소유하고 `components/ui`가 자기 리터럴을
 * 따로 선언했다. 도메인 모델이 사라져 여기가 단일 기준이 된다.
 */
export type ThemePreference = ThemeToggleMode;

/** 선택한 모드를 실제 테마로 바꾼다. `system`은 OS 설정을 따른다. */
export function resolveTheme(mode: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * 테마 저장소. 첫 사용 시점에 만든다.
 * 모듈 로드 시점에 만들면 테스트가 import만 해도 브라우저 저장소를 건드린다.
 */
let preferences: PreferenceStore | null = null;

function preferenceStore(): PreferenceStore {
  preferences ??= new PreferenceStore();
  return preferences;
}

/** 테스트가 대역을 넣는다. */
export function configureThemeStore(store: PreferenceStore | null): void {
  preferences = store;
}

export interface UiStoreState {
  themeMode: ThemePreference;
  /** 스크린 리더 알림. 같은 문구를 다시 읽히려면 key가 바뀌어야 한다. */
  announcement: string;
  announcementKey: number;

  initTheme: () => void;
  setThemeMode: (mode: ThemePreference) => void;
  announce: (message: string) => void;
  reset: () => void;
}

const INITIAL = {
  themeMode: 'system' as ThemePreference,
  announcement: '',
  announcementKey: 0,
};

function applyTheme(mode: ThemePreference): void {
  const prefersDark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  root.dataset['theme'] = resolveTheme(mode, prefersDark);
  root.dataset['themeMode'] = mode;
}

export const useUiStore = create<UiStoreState>((set) => ({
  ...INITIAL,

  initTheme() {
    const stored = preferenceStore().get(PREFERENCE_KEYS.theme);
    const mode = isThemePreference(stored) ? stored : 'system';
    applyTheme(mode);
    set({ themeMode: mode });
  },

  setThemeMode(mode) {
    preferenceStore().set(PREFERENCE_KEYS.theme, mode);
    applyTheme(mode);
    set({ themeMode: mode });
  },

  announce(message) {
    set((state) => ({ announcement: message, announcementKey: state.announcementKey + 1 }));
  },

  reset() {
    set({ ...INITIAL });
  },
}));

export function resetUiStore(): void {
  useUiStore.setState({ ...INITIAL });
}
