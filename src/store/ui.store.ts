/**
 * 일시 UI 상태 스토어.
 *
 * 기준: 기술 백서 §4.1.1(세션 UI 상태). 하네스 M4 할 일 2.
 *
 * 문서 스토어와 분리한다. 선택한 단계나 열린 드로어가 문서 변경으로 집계되면
 * 자동 저장이 헛돌고 `dirty` 판정이 틀어진다. 여기 있는 값은 저장되지 않고
 * 새로고침하면 사라진다.
 */

import { create } from 'zustand';

import type { ThemePreference } from '../domain/guide.types.ts';
import type { ThemeToggleMode } from '../components/ui/ThemeToggle/ThemeToggle.tsx';
import { EDITOR_KEYS, PreferenceStore } from '../storage/local-storage.ts';
import type { EditorSection } from './guide.store.ts';

// `components/ui`는 도메인을 모르므로 테마 모드를 문자열 리터럴로 선언한다.
// 두 선언이 어긋나면 여기서 컴파일이 깨진다. (File_Structure.md §3.2-7)
const _themeModeToDomain: ThemePreference = 'system' as ThemeToggleMode;
const _themeModeFromDomain: ThemeToggleMode = 'system' as ThemePreference;
void _themeModeToDomain;
void _themeModeFromDomain;

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
  /** 중앙 편집기가 보여 주는 섹션. 개요와 같은 이름을 쓴다. */
  section: EditorSection;
  selectedStepId: string | null;
  /** 태블릿·모바일에서 개요 드로어가 열려 있는가. (디자인 §2.1.3·§2.1.4) */
  outlineOpen: boolean;

  /**
   * 스크린 리더 알림. 재정렬처럼 시각적으로만 드러나는 변화를 말로 전한다.
   * 같은 문장을 다시 알릴 수 있게 `announcementKey`를 함께 올린다.
   * (디자인 §2.2.1 재정렬)
   */
  announcement: string;
  announcementKey: number;

  /**
   * 편집기 테마. 문서의 `settings.defaultTheme`과는 다른 값이다.
   * 이쪽은 작성자의 화면 설정이고 저장 위치는 `EDITOR_KEYS.theme`이다.
   * 첫 페인트 전 적용은 `index.html`의 선행 스니펫이 같은 키로 처리한다.
   */
  themeMode: ThemePreference;

  initTheme: () => void;
  setThemeMode: (mode: ThemePreference) => void;
  selectSection: (section: EditorSection) => void;
  selectStep: (stepId: string | null) => void;
  setOutlineOpen: (open: boolean) => void;
  announce: (message: string) => void;
  reset: () => void;
}

const INITIAL = {
  section: 'meta' as EditorSection,
  selectedStepId: null,
  outlineOpen: false,
  announcement: '',
  announcementKey: 0,
  themeMode: 'system' as ThemePreference,
};

/** 선택한 모드를 문서 루트에 반영한다. themes.css가 이 속성을 읽는다. */
function applyTheme(mode: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const prefersDark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  root.dataset['theme'] = resolveTheme(mode, prefersDark);
  root.dataset['themeMode'] = mode;
}

export const useUiStore = create<UiStoreState>((set) => ({
  ...INITIAL,

  initTheme() {
    const stored = preferenceStore().get(EDITOR_KEYS.theme);
    const mode = isThemePreference(stored) ? stored : 'system';
    applyTheme(mode);
    set({ themeMode: mode });
  },

  setThemeMode(mode) {
    preferenceStore().set(EDITOR_KEYS.theme, mode);
    applyTheme(mode);
    set({ themeMode: mode });
  },

  selectSection(section) {
    set({ section });
  },

  selectStep(stepId) {
    set(stepId === null ? { selectedStepId: null } : { section: 'steps', selectedStepId: stepId });
  },

  setOutlineOpen(open) {
    set({ outlineOpen: open });
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
