/**
 * 스튜디오 문서 스토어.
 *
 * 기준: v2 제품정의 §2(사용자 흐름), §8 INV-07. 하네스 P1 할 일 1·3·4.
 *
 * 문서 하나를 메모리에 들고, 저장소와 자동 저장에 이어 준다. 화면은 여기만 본다.
 *
 * **저장 실패가 메모리 내용을 덮지 않는다.** 저장은 메모리를 저장소로 밀어내는
 * 방향이고, 실패하면 저장소가 뒤처질 뿐 편집 중인 자료는 그대로다. (INV-07)
 */

import { create } from 'zustand';

import { createStudioDocument } from '../domain/studio.defaults.ts';
import type { StudioDocument } from '../domain/studio.types.ts';
import {
  createAutosaveScheduler,
  type AutosaveScheduler,
} from '../features/autosave/autosave.service.ts';
import {
  openDocumentStore,
  type DocumentStore,
  type StorageMode,
} from '../storage/document.store.ts';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface StudioStoreDeps {
  documents: DocumentStore;
  now: () => string;
}

let deps: StudioStoreDeps | null = null;
let initPromise: Promise<void> | null = null;
let scheduler: AutosaveScheduler | null = null;

/** 테스트와 부트스트랩이 저장소·시각을 주입한다. */
export function configureStudioStore(next: StudioStoreDeps | null): void {
  deps = next;
  initPromise = null;
  scheduler?.dispose();
  scheduler = null;
}

export function studioStoreDeps(): StudioStoreDeps {
  if (deps === null) throw new Error('studio.store가 아직 설정되지 않았습니다.');
  return deps;
}

async function ensureDeps(): Promise<StudioStoreDeps> {
  if (deps !== null) return deps;
  initPromise ??= (async () => {
    deps = { documents: await openDocumentStore(), now: () => new Date().toISOString() };
  })();
  await initPromise;
  return studioStoreDeps();
}

export interface StudioStoreState {
  document: StudioDocument | null;
  status: LoadStatus;
  loadError?: string;

  storageMode: StorageMode | null;
  storageUnavailableReason?: string;

  dirty: boolean;
  saveState: SaveState;
  saveError?: string;

  init: () => Promise<void>;
  setSource: (source: string) => void;
  clearSource: () => void;
  save: () => Promise<void>;
  reset: () => void;
}

const INITIAL = {
  document: null as StudioDocument | null,
  status: 'idle' as LoadStatus,
  loadError: undefined as string | undefined,
  storageMode: null as StorageMode | null,
  storageUnavailableReason: undefined as string | undefined,
  dirty: false,
  saveState: 'idle' as SaveState,
  saveError: undefined as string | undefined,
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useStudioStore = create<StudioStoreState>((set, get) => ({
  ...INITIAL,

  async init() {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading' });

    const { documents, now } = await ensureDeps();
    const state = documents.state();

    try {
      const stored = await documents.load();
      set({
        document: stored ?? createStudioDocument(now()),
        status: 'ready',
        storageMode: state.mode,
        ...(state.unavailableReason === undefined
          ? {}
          : { storageUnavailableReason: state.unavailableReason }),
      });
    } catch (error) {
      // 여기 오는 것은 저장소가 폴백까지 실패한 경우다. 빈 문서로 시작하되
      // 이유를 남긴다. 화면을 못 쓰게 만들지 않는다.
      set({
        document: createStudioDocument(now()),
        status: 'ready',
        loadError: describe(error),
        storageMode: state.mode,
      });
    }
  },

  setSource(source) {
    const current = get().document;
    if (current === null || current.source === source) return;

    set({ document: { ...current, source }, dirty: true });
    schedulerFor(get, set).request();
  },

  clearSource() {
    get().setSource('');
  },

  async save() {
    const current = get().document;
    if (current === null) return;

    const { documents, now } = await ensureDeps();
    const snapshot: StudioDocument = { ...current, updatedAt: now() };

    set({ saveState: 'saving', saveError: undefined });

    try {
      await documents.save(snapshot);
    } catch (error) {
      // 메모리 문서는 그대로 둔다. 저장소만 뒤처진 상태이고, 다음 저장이
      // 최신 내용으로 다시 시도한다. (INV-07)
      set({ saveState: 'error', saveError: describe(error), dirty: true });
      return;
    }

    const after = get().document;
    const mode = documents.state();

    set({
      // 저장하는 사이에 더 입력했을 수 있다. 그때는 메모리를 스냅샷으로
      // 덮지 않는다 - 덮으면 그 사이의 타이핑이 사라진다.
      ...(after !== null && after.source === current.source
        ? { document: snapshot, dirty: false, saveState: 'saved' as SaveState }
        : { dirty: true, saveState: 'saved' as SaveState }),
      storageMode: mode.mode,
      ...(mode.unavailableReason === undefined
        ? {}
        : { storageUnavailableReason: mode.unavailableReason }),
    });
  },

  reset() {
    set({ ...INITIAL });
  },
}));

/**
 * 자동 저장 예약기. 첫 변경 시점에 만든다.
 *
 * 모듈 로드 시점에 만들면 화면을 열지 않은 테스트도 타이머를 잡는다.
 */
function schedulerFor(
  get: () => StudioStoreState,
  set: (partial: Partial<StudioStoreState>) => void,
): AutosaveScheduler {
  scheduler ??= createAutosaveScheduler({
    save: () => get().save(),
    onError: (error) => {
      set({ saveState: 'error', saveError: describe(error) });
    },
  });
  return scheduler;
}

/** 테스트가 예약기를 직접 밀어낼 때 쓴다. */
export function flushStudioAutosave(): Promise<void> {
  return scheduler?.flush() ?? Promise.resolve();
}

export function resetStudioStore(): void {
  scheduler?.dispose();
  scheduler = null;
  useStudioStore.setState({ ...INITIAL });
}
