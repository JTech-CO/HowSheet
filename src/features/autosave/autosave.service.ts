/**
 * 자동 저장 예약기.
 *
 * 기준: 기술 백서 §4.1.3(업데이트 규칙), §4.3.2(작성 및 자동 저장), FR-017.
 * 하네스 M4 DoD 3·4.
 *
 * 마지막 입력에서 500ms 뒤에 저장한다. 다만 계속 입력하는 동안 저장이 무한정
 * 밀리면 안 되므로, 첫 미저장 변경으로부터 1초가 지나면 입력 중이라도 저장한다.
 * (M4 DoD 3 - 500ms 목표, 1초 하드 상한)
 *
 * 저장은 한 번에 하나만 진행한다. 진행 중에 들어온 변경은 저장이 끝난 뒤 최신
 * 스냅샷으로 다시 예약한다. 두 저장을 겹쳐 보내면 어느 쪽이 마지막인지 저장소
 * 수준에서 보장할 수 없다. (기술 §4.1.3)
 *
 * 타이머와 시계를 주입받는다. 테스트가 실시간을 기다리지 않아야 DoD 3의 상한을
 * 실제로 단언할 수 있다.
 */

/** FR-017 - 입력 후 500ms 이내 예약. */
export const AUTOSAVE_DEBOUNCE_MS = 500;

/** M4 DoD 3 - 첫 미저장 변경 기준 하드 상한. */
export const AUTOSAVE_MAX_WAIT_MS = 1000;

export type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface AutosaveClock {
  now(): number;
  setTimeout(handler: () => void, ms: number): TimeoutHandle;
  clearTimeout(handle: TimeoutHandle): void;
}

/** 기본 시계. 브라우저와 Node 양쪽에서 같은 이름을 쓴다. */
export const systemClock: AutosaveClock = {
  now: () => Date.now(),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle);
  },
};

export interface AutosaveSchedulerOptions {
  /** 실제 저장. 거부하면 `onError`로 알리고 예약 상태는 유지한다. */
  save: () => Promise<void>;
  onError?: (error: unknown) => void;
  debounceMs?: number;
  maxWaitMs?: number;
  clock?: AutosaveClock;
}

export interface AutosaveScheduler {
  /** 변경이 생겼음을 알린다. 저장 시점은 이 객체가 정한다. */
  request(): void;
  /** 예약을 무시하고 지금 저장한다. 진행 중이면 그것이 끝난 뒤 한 번 더 돈다. */
  flush(): Promise<void>;
  /** 예약을 취소한다. 진행 중인 저장은 중단하지 않는다. */
  cancel(): void;
  /** 예약이 걸려 있거나 저장이 진행 중이면 true. */
  pending(): boolean;
  /** 예약을 취소하고 더 이상 받지 않는다. */
  dispose(): void;
}

export function createAutosaveScheduler(options: AutosaveSchedulerOptions): AutosaveScheduler {
  const clock = options.clock ?? systemClock;
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;

  let timer: TimeoutHandle | null = null;
  /** 첫 미저장 변경 시각. 하드 상한의 기준점이다. */
  let firstRequestAt: number | null = null;
  let running = false;
  /** 저장이 도는 동안 들어온 변경. 끝나면 다시 예약한다. */
  let requestedWhileRunning = false;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  };

  const runSave = async (): Promise<void> => {
    clearTimer();
    firstRequestAt = null;

    if (running) {
      // 겹치지 않는다. 끝난 뒤 다시 예약한다.
      requestedWhileRunning = true;
      return;
    }

    running = true;
    try {
      await options.save();
    } catch (error) {
      // 예약기는 살아 있어야 한다. 실패해도 다음 변경에서 다시 시도한다.
      options.onError?.(error);
    } finally {
      running = false;
    }

    if (requestedWhileRunning && !disposed) {
      requestedWhileRunning = false;
      schedule();
    }
  };

  function schedule(): void {
    if (disposed) return;

    const now = clock.now();
    firstRequestAt ??= now;

    // 마지막 입력 기준 500ms와 첫 변경 기준 1초 중 이른 쪽.
    const deadline = Math.min(now + debounceMs, firstRequestAt + maxWaitMs);
    const delay = Math.max(0, deadline - now);

    clearTimer();
    timer = clock.setTimeout(() => {
      timer = null;
      void runSave();
    }, delay);
  }

  return {
    request() {
      if (disposed) return;
      if (running) {
        requestedWhileRunning = true;
        return;
      }
      schedule();
    },

    async flush() {
      if (disposed) return;
      await runSave();
    },

    cancel() {
      clearTimer();
      firstRequestAt = null;
      requestedWhileRunning = false;
    },

    pending() {
      return timer !== null || running || requestedWhileRunning;
    },

    dispose() {
      disposed = true;
      clearTimer();
      firstRequestAt = null;
      requestedWhileRunning = false;
    },
  };
}
