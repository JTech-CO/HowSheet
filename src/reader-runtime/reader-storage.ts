/**
 * 리더 진행 저장.
 *
 * 기준: 기술 백서 §4.3.7(리더 진행 저장), §4.5.2(키 네임스페이스), §7.5(브라우저 이슈).
 * 하네스 M7 DoD 4·5·6·7·8, INV-10·INV-11.
 *
 * `storage/local-storage.ts`를 import하지 않는다. 그 모듈은 reader-runtime의
 * 허용 경로 밖이고(File_Structure.md §3.2-3), 내보낸 HTML에는 그 계층이 없다.
 * 대신 최소 저장소 모양만 받는다. 앱 내 리더는 `PreferenceStore`를 이 모양으로
 * 감싸 넘긴다.
 *
 * 같은 이유로 `features/autosave`의 예약기도 쓰지 않는다. 편집기의 500ms/1초와
 * 리더의 100ms/250ms는 다른 계약이고, 그 모듈은 허용 목록 밖이다.
 */

import {
  parseReaderProgressKey,
  readerProgressKey,
  type ReaderProgress,
} from '../domain/progress.types.ts';

/** M7 DoD 4 - 체크·분기 변경 후 목표 100ms. */
export const READER_SAVE_DEBOUNCE_MS = 100;
/** M7 DoD 4 - 첫 미저장 변경 기준 하드 상한. */
export const READER_SAVE_MAX_WAIT_MS = 250;

export type ReaderStorageMode = 'persistent' | 'session';

/**
 * 이 모듈이 기대하는 최소 저장소 모양.
 *
 * `storage/local-storage.ts`의 `KeyValueStore`와 같은 모양이지만 그것을
 * import하지 않는다. 타입이 같아 호출자가 그대로 넘길 수 있다.
 */
export interface ReaderKeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/** 테스트가 시간을 쥐기 위한 최소 시계. */
export interface ReaderClock {
  now(): number;
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

const systemClock: ReaderClock = {
  now: () => Date.now(),
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms) as unknown as number,
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle);
  },
};

export interface ReaderStorage {
  readonly mode: ReaderStorageMode;
  /** persistent가 아닌 이유. 지속 배너의 근거다. (M7 DoD 7) */
  readonly unavailableReason: string | undefined;
  load(guideId: string, revision: number): ReaderProgress | null;
  /** 다른 revision에 남아 있는 진행. 큰 revision이 앞이다. (M7 DoD 6) */
  findOtherRevisions(guideId: string, exceptRevision: number): number[];
  /** 저장을 예약한다. 목표 100ms, 상한 250ms. */
  scheduleSave(progress: ReaderProgress): void;
  /** 예약을 무시하고 지금 쓴다. */
  flush(): void;
  clear(guideId: string, revision: number): void;
  /**
   * 다른 탭의 `storage` 이벤트를 해석한다. 적용할 것이 없으면 `null`.
   * 무한 ping-pong을 막는 판정이 전부 여기 있다. (M7 DoD 8)
   */
  interpretExternalChange(
    guideId: string,
    revision: number,
    key: string | null,
    newValue: string | null,
  ): ExternalChange | null;
  dispose(): void;
}

/** 다른 탭이 알린 변화. `cleared`는 그쪽에서 진행을 지웠다는 뜻이다. */
export type ExternalChange = { kind: 'updated'; progress: ReaderProgress } | { kind: 'cleared' };

function memoryStore(): ReaderKeyValueStore {
  const map = new Map<string, string>();
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

/** 형태가 `ReaderProgress`인지 본다. zod를 쓸 수 없으므로 손으로 본다. (D-11) */
function parseProgress(raw: string | null): ReaderProgress | null {
  if (raw === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // 손상된 진행은 "진행 없음"이다. 독자에게 파싱 오류를 보여 줄 이유가 없고
    // "처음부터"가 언제나 가능하다. **덮어쓰기 전에 지우지는 않는다.**
    return null;
  }

  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<ReaderProgress>;

  if (typeof candidate.guideId !== 'string') return null;
  if (typeof candidate.revision !== 'number') return null;
  if (typeof candidate.currentStepId !== 'string') return null;
  if (!Array.isArray(candidate.activePath)) return null;
  if (typeof candidate.stepState !== 'object' || candidate.stepState === null) return null;
  if (!Array.isArray(candidate.acknowledgedWarningIds)) return null;
  if (typeof candidate.startedAt !== 'string' || typeof candidate.updatedAt !== 'string') {
    return null;
  }

  return candidate as ReaderProgress;
}

export interface CreateReaderStorageOptions {
  /** 주면 이것을 쓴다. `null`이면 세션 메모리로 시작한다. */
  store: ReaderKeyValueStore | null;
  clock?: ReaderClock;
  debounceMs?: number;
  maxWaitMs?: number;
  unavailableReason?: string;
}

export function createReaderStorage(options: CreateReaderStorageOptions): ReaderStorage {
  const clock = options.clock ?? systemClock;
  const debounceMs = options.debounceMs ?? READER_SAVE_DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? READER_SAVE_MAX_WAIT_MS;

  let store: ReaderKeyValueStore = options.store ?? memoryStore();
  let mode: ReaderStorageMode = options.store === null ? 'session' : 'persistent';
  let reason: string | undefined =
    options.store === null
      ? (options.unavailableReason ?? '이 브라우저에서 로컬 저장소를 쓸 수 없습니다.')
      : undefined;

  let timer: number | null = null;
  let firstRequestAt: number | null = null;
  let queued: ReaderProgress | null = null;
  let disposed = false;

  /** 자기가 방금 쓴 값. 자기 쓰기가 에코로 돌아오는 것을 끊는다. (M7 DoD 8) */
  let lastWritten: { key: string; value: string } | null = null;

  const degrade = (error: unknown) => {
    if (mode === 'session') return;
    store = memoryStore();
    mode = 'session';
    reason =
      error instanceof Error ? `${error.name}: ${error.message}` : '로컬 저장소에 쓸 수 없습니다.';
  };

  const write = (progress: ReaderProgress) => {
    const key = readerProgressKey(progress.guideId, progress.revision);
    const value = JSON.stringify(progress);
    lastWritten = { key, value };
    try {
      store.setItem(key, value);
    } catch (error) {
      // 세션 모드로 떨어져도 진행은 이어진다. 배너가 그 사실을 알린다. (DoD 7)
      degrade(error);
      try {
        store.setItem(key, value);
      } catch {
        // 전환 후의 메모리 저장소는 던지지 않는다. 여기 오면 이 한 값만 잃는다.
      }
    }
  };

  const clearTimer = () => {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
  };

  const run = () => {
    clearTimer();
    firstRequestAt = null;
    const pending = queued;
    queued = null;
    if (pending !== null) write(pending);
  };

  return {
    get mode() {
      return mode;
    },
    get unavailableReason() {
      return reason;
    },

    load(guideId, revision) {
      const key = readerProgressKey(guideId, revision);
      let raw: string | null;
      try {
        raw = store.getItem(key);
      } catch {
        return null;
      }

      const progress = parseProgress(raw);
      if (progress === null) return null;

      // **키를 신뢰하고 본문이 어긋나면 버린다.** 본문을 믿으면 INV-10의
      // revision 격리가 본문 조작으로 뚫린다.
      if (progress.guideId !== guideId || progress.revision !== revision) return null;
      return progress;
    },

    findOtherRevisions(guideId, exceptRevision) {
      const found: number[] = [];
      try {
        for (let index = 0; index < store.length; index += 1) {
          const key = store.key(index);
          if (key === null) continue;
          const parsed = parseReaderProgressKey(key);
          if (parsed === null) continue;
          if (parsed.guideId !== guideId || parsed.revision === exceptRevision) continue;
          found.push(parsed.revision);
        }
      } catch {
        // 열거가 막힌 저장소다. 부분 목록으로 진행한다.
      }
      return found.sort((a, b) => b - a);
    },

    scheduleSave(progress) {
      if (disposed) return;
      queued = progress;

      const now = clock.now();
      firstRequestAt ??= now;

      // 목표는 debounce지만 첫 변경으로부터 상한을 넘기지 않는다. (DoD 4)
      const deadline = Math.min(now + debounceMs, firstRequestAt + maxWaitMs);
      clearTimer();
      timer = clock.setTimeout(run, Math.max(0, deadline - now));
    },

    flush() {
      run();
    },

    clear(guideId, revision) {
      clearTimer();
      queued = null;
      firstRequestAt = null;
      const key = readerProgressKey(guideId, revision);
      lastWritten = { key, value: '' };
      try {
        store.removeItem(key);
      } catch {
        // 지우지 못해도 화면을 막지 않는다.
      }
    },

    interpretExternalChange(guideId, revision, key, newValue) {
      // 세션 모드는 다른 탭과 저장소를 공유하지 않는다. 남의 상태를 받아
      // 자기 것을 덮으면 저장 못 하는 탭의 작업이 사라진다.
      if (mode === 'session') return null;
      if (key === null) return null;
      if (key !== readerProgressKey(guideId, revision)) return null;

      // 자기 쓰기의 에코. 여기서 끊지 않으면 두 탭이 서로를 영원히 갱신한다.
      if (lastWritten !== null && lastWritten.key === key && lastWritten.value === newValue) {
        return null;
      }

      if (newValue === null) return { kind: 'cleared' };

      const progress = parseProgress(newValue);
      if (progress === null) return null;
      if (progress.guideId !== guideId || progress.revision !== revision) return null;
      return { kind: 'updated', progress };
    },

    dispose() {
      disposed = true;
      clearTimer();
      queued = null;
      firstRequestAt = null;
    },
  };
}

/**
 * 원격 변경을 적용할지 판정한다.
 *
 * `updatedAt` 동률은 **무시한다.** 적용하면 두 탭이 같은 밀리초의 값을 서로
 * 주고받으며 영원히 갱신한다. 시계 해상도가 ms라 100ms 예약에서도 실제로
 * 일어난다. (M7 DoD 8)
 */
export function shouldApplyRemote(local: ReaderProgress, remote: ReaderProgress): boolean {
  return remote.updatedAt > local.updatedAt;
}
