/**
 * 리더 진행 스토어.
 *
 * 기준: 기술 백서 §4.1.1(상태 범위), §4.3.7(리더 진행 저장), §2.2.2(독자 흐름).
 * 하네스 M7 할 일 2~7, DoD 1~9.
 *
 * **`guide.store`와 분리한다.** 독자 진행은 다른 저장소(LocalStorage)에 다른
 * 수명으로 살고, 문서를 바꾸지 않는다. 한 스토어에 두면 리더에서 체크만 해도
 * 편집기의 `dirty`가 서고 자동 저장이 헛돈다.
 *
 * **판정은 `reader-runtime`이 한다.** 이 파일은 React에 붙이고 저장소를 물릴
 * 뿐이다. 상태 전이를 여기 다시 쓰면 내보낸 HTML과 앱 내 리더가 갈라지고
 * INV-09를 손으로 유지해야 한다.
 */

import { create } from 'zustand';

import type { GuideDocument, ThemePreference } from '../domain/guide.types.ts';
import type { ReaderProgress } from '../domain/progress.types.ts';
import {
  acknowledgeWarning as acknowledgeWarningState,
  advance as advanceState,
  canEnterSteps,
  cursorWasDropped,
  goBack as goBackState,
  recompute,
  resumeProgress,
  selectOption as selectOptionState,
  setChecked as setCheckedState,
  setStepCompleted,
  startProgress,
  type AdvanceBlock,
  type ReaderSnapshot,
} from '../reader-runtime/reader-state.ts';
import {
  createReaderStorage,
  shouldApplyRemote,
  type ReaderStorage,
} from '../reader-runtime/reader-storage.ts';
import { PreferenceStore } from '../storage/local-storage.ts';

/** 리더가 보여 주는 화면. */
export type ReaderPhase = 'intro' | 'steps' | 'completed' | 'error';

export interface ReaderStoreDeps {
  storage: ReaderStorage;
  now: () => string;
}

let deps: ReaderStoreDeps | null = null;

/** 앱은 실제 LocalStorage를, 테스트는 대역을 넣는다. */
export function configureReaderStore(next: ReaderStoreDeps | null): void {
  deps?.storage.dispose();
  deps = next;
}

/**
 * 기본 의존성. `PreferenceStore`를 `ReaderKeyValueStore` 모양으로 감싼다.
 *
 * `reader-runtime`은 `storage/`를 import할 수 없으므로(허용 목록 밖) 어댑터가
 * 이쪽에 있다. 내보낸 HTML은 같은 자리에 `window.localStorage`를 직접 넣는다.
 */
function defaultDeps(): ReaderStoreDeps {
  const preferences = new PreferenceStore();
  const state = preferences.state();

  const storage = createReaderStorage({
    store:
      state.mode === 'session'
        ? null
        : {
            getItem: (key) => preferences.get(key),
            setItem: (key, value) => preferences.set(key, value),
            removeItem: (key) => preferences.remove(key),
            key: (index) => preferences.ownedKeys()[index] ?? null,
            get length() {
              return preferences.ownedKeys().length;
            },
          },
    ...(state.unavailableReason === undefined
      ? {}
      : { unavailableReason: state.unavailableReason }),
  });

  return { storage, now: () => new Date().toISOString() };
}

function readerDeps(): ReaderStoreDeps {
  deps ??= defaultDeps();
  return deps;
}

export interface ReaderStoreState {
  document: GuideDocument | null;
  snapshot: ReaderSnapshot | null;
  phase: ReaderPhase;
  /** 저장이 지속되는가. `session`이면 지속 배너를 띄운다. (M7 DoD 7) */
  persistence: 'persistent' | 'session';
  persistenceReason: string | undefined;
  /** 다음으로 못 간 이유. 결정 블록 근처에 표시한다. */
  block: AdvanceBlock | null;
  /** 저장된 진행이 있어 이어하기를 물을 수 있는 상태. (M7 DoD 5) */
  resumeCandidate: ReaderProgress | null;
  /** 다른 revision에 남은 진행. 이어쓰기·새 버전 선택에 쓴다. (M7 DoD 6) */
  otherRevisions: number[];
  /** 저장된 커서가 문서에서 사라져 처음으로 되돌렸는가. */
  cursorReset: boolean;
  /** 시작 화면에서 체크한 준비물. 진행 모델에 자리가 없어 여기 둔다. */
  checkedPreparationIds: string[];
  /** 독자가 고른 테마. `allowThemeSwitch`가 꺼져 있으면 무시된다. */
  themeOverride: ThemePreference | null;
  /**
   * 시작 전 경고 확인이 바뀔 때마다 오른다.
   *
   * 확인 목록 자체는 스토어 밖 집합이라 zustand가 변화를 알 수 없다. 이 숫자가
   * 화면을 다시 그리게 한다. 목록을 상태로 옮기면 `restart`·`resetProgress`가
   * 두 곳을 함께 비워야 하고, 그중 하나를 빠뜨리기 쉽다.
   */
  acknowledgedTick: number;

  open: (doc: GuideDocument) => void;
  /** 준비물 체크. 저장하지 않는다. (§2.3.3에 자리가 없다) */
  togglePreparation: (itemId: string, checked: boolean) => void;
  acknowledgeWarning: (warningId: string) => void;
  /** 첫 단계로 들어간다. 게이트를 통과하지 못하면 아무 일도 하지 않는다. */
  enterSteps: () => boolean;
  resume: () => void;
  restart: () => void;
  setChecked: (stepId: string, itemId: string, checked: boolean) => void;
  selectOption: (stepId: string, blockId: string, optionId: string) => void;
  setStepCompleted: (stepId: string, completed: boolean) => void;
  next: () => void;
  back: () => void;
  /** 진행을 지우고 시작 화면으로. `allowProgressReset`은 화면이 판정한다. */
  resetProgress: () => void;
  setThemeOverride: (mode: ThemePreference | null) => void;
  /** 다른 탭의 `storage` 이벤트. 적용할 것이 없으면 아무 일도 하지 않는다. */
  applyExternalChange: (key: string | null, newValue: string | null) => void;
  close: () => void;
}

const INITIAL = {
  document: null as GuideDocument | null,
  snapshot: null as ReaderSnapshot | null,
  phase: 'intro' as ReaderPhase,
  persistence: 'persistent' as 'persistent' | 'session',
  persistenceReason: undefined as string | undefined,
  block: null as AdvanceBlock | null,
  resumeCandidate: null as ReaderProgress | null,
  otherRevisions: [] as number[],
  cursorReset: false,
  checkedPreparationIds: [] as string[],
  themeOverride: null as ThemePreference | null,
  acknowledgedTick: 0,
};

export const useReaderStore = create<ReaderStoreState>((set, get) => {
  /** 상태를 저장하고 예약한다. 저장은 이 한 곳에서만 예약된다. */
  const commit = (snapshot: ReaderSnapshot, phase?: ReaderPhase) => {
    const { storage } = readerDeps();
    storage.scheduleSave(snapshot.progress);
    set({
      snapshot,
      block: null,
      persistence: storage.mode,
      persistenceReason: storage.unavailableReason,
      ...(phase === undefined ? {} : { phase }),
    });
  };

  /** 진행이 아직 없으면 아무 일도 하지 않는 액션들의 공통 가드. */
  const withSnapshot = (run: (snapshot: ReaderSnapshot, doc: GuideDocument) => void) => {
    const { snapshot, document } = get();
    if (snapshot === null || document === null) return;
    run(snapshot, document);
  };

  return {
    ...INITIAL,

    open(doc) {
      const { storage } = readerDeps();
      const restored = storage.load(doc.id, doc.revision);

      set({
        ...INITIAL,
        document: doc,
        persistence: storage.mode,
        persistenceReason: storage.unavailableReason,
        resumeCandidate: restored,
        otherRevisions: storage.findOtherRevisions(doc.id, doc.revision),
        cursorReset: restored !== null && cursorWasDropped(doc, restored),
      });
    },

    togglePreparation(itemId, checked) {
      set((state) => {
        const next = new Set(state.checkedPreparationIds);
        if (checked) next.add(itemId);
        else next.delete(itemId);
        return { checkedPreparationIds: [...next].sort() };
      });
    },

    acknowledgeWarning(warningId) {
      const { snapshot, document } = get();
      if (document === null) return;

      // 진행이 만들어지기 전이면 시작 화면의 목록에만 담아 둔다. 첫 단계 진입
      // 시점에 함께 실린다. 여기서 진행을 만들면 다음 방문에 0단계 이어하기가 뜬다.
      if (snapshot === null) {
        acknowledgedBeforeStart.add(warningId);
        set({ acknowledgedTick: get().acknowledgedTick + 1 });
        return;
      }

      commit(acknowledgeWarningState(snapshot, document, warningId, readerDeps().now()));
    },

    enterSteps() {
      const { document } = get();
      if (document === null) return false;
      if (!canEnterSteps(document, new Set(get().checkedPreparationIds), acknowledgedBeforeStart)) {
        return false;
      }

      commit(startProgress(document, readerDeps().now(), [...acknowledgedBeforeStart]), 'steps');
      return true;
    },

    resume() {
      const { document, resumeCandidate } = get();
      if (document === null || resumeCandidate === null) return;

      const snapshot = resumeProgress(document, resumeCandidate);
      // 이어하기는 준비물·경고 게이트를 지나지 않는다. 이미 통과한 독자다.
      commit(snapshot, snapshot.progress.completed ? 'completed' : 'steps');
    },

    restart() {
      const { document } = get();
      if (document === null) return;
      acknowledgedBeforeStart.clear();
      set({ ...INITIAL, document, phase: 'intro', resumeCandidate: null });
    },

    setChecked(stepId, itemId, checked) {
      withSnapshot((snapshot, doc) => {
        commit(setCheckedState(snapshot, doc, stepId, itemId, checked, readerDeps().now()));
      });
    },

    selectOption(stepId, blockId, optionId) {
      withSnapshot((snapshot, doc) => {
        commit(selectOptionState(snapshot, doc, stepId, blockId, optionId, readerDeps().now()));
      });
    },

    setStepCompleted(stepId, completed) {
      withSnapshot((snapshot, doc) => {
        commit(setStepCompleted(snapshot, doc, stepId, completed, readerDeps().now()));
      });
    },

    next() {
      withSnapshot((snapshot, doc) => {
        const result = advanceState(snapshot, doc, readerDeps().now());
        if (result.kind === 'not-answered' || result.kind === 'missing-target') {
          set({ block: result, ...(result.kind === 'missing-target' ? { phase: 'error' } : {}) });
          return;
        }
        commit(result.snapshot, result.kind === 'completed' ? 'completed' : 'steps');
      });
    },

    back() {
      withSnapshot((snapshot, doc) => {
        commit(goBackState(snapshot, doc, readerDeps().now()), 'steps');
      });
    },

    resetProgress() {
      const { document } = get();
      if (document === null) return;
      readerDeps().storage.clear(document.id, document.revision);
      acknowledgedBeforeStart.clear();
      set({ ...INITIAL, document, resumeCandidate: null });
    },

    setThemeOverride(mode) {
      set({ themeOverride: mode });
    },

    applyExternalChange(key, newValue) {
      const { document, snapshot } = get();
      if (document === null) return;

      const change = readerDeps().storage.interpretExternalChange(
        document.id,
        document.revision,
        key,
        newValue,
      );
      if (change === null) return;

      if (change.kind === 'cleared') {
        // 다른 탭이 초기화했다. **저장을 예약하지 않는다.** 예약하면 그 초기화가
        // 즉시 되살아난다. (M7 DoD 8)
        acknowledgedBeforeStart.clear();
        set({ ...INITIAL, document, resumeCandidate: null });
        return;
      }

      if (snapshot !== null && !shouldApplyRemote(snapshot.progress, change.progress)) return;

      // 원격 상태를 그대로 받는다. 저장을 예약하지 않아야 ping-pong이 끊긴다.
      const next = recompute(document, change.progress);
      set({
        snapshot: next,
        phase: next.progress.completed ? 'completed' : 'steps',
        block: null,
      });
    },

    close() {
      readerDeps().storage.flush();
      acknowledgedBeforeStart.clear();
      set({ ...INITIAL });
    },
  };
});

/**
 * 첫 단계 진입 전에 확인한 경고.
 *
 * 진행이 아직 없어서 `ReaderProgress`에 담을 수 없다. 진입 시점에 함께 실린다.
 * 스토어 상태로 두지 않는 이유는 `restart`·`resetProgress`가 `INITIAL`로
 * 되돌릴 때 이것도 함께 비워야 하는데, 두 곳에서 같은 초기화를 반복하면
 * 하나를 빠뜨리기 쉽기 때문이다.
 */
const acknowledgedBeforeStart = new Set<string>();

export function resetReaderStore(): void {
  acknowledgedBeforeStart.clear();
  useReaderStore.setState({ ...INITIAL });
}

/** 시작 화면에서 확인한 경고 목록. 화면이 체크 상태를 그릴 때 읽는다. */
export function acknowledgedBeforeStartIds(): ReadonlySet<string> {
  return acknowledgedBeforeStart;
}
