import { describe, expect, it } from 'vitest';

import { createReaderProgress, readerProgressKey } from '@/domain/progress.types.ts';
import type { ReaderProgress } from '@/domain/progress.types.ts';
import {
  READER_SAVE_DEBOUNCE_MS,
  READER_SAVE_MAX_WAIT_MS,
  createReaderStorage,
  shouldApplyRemote,
  type ReaderClock,
  type ReaderKeyValueStore,
} from '@/reader-runtime/reader-storage.ts';

const GUIDE = 'guide-1';
const AT = '2026-09-03T00:00:00.000Z';

/** 시간을 직접 돌리는 시계. 실제 타이머를 쓰면 100ms 계약을 잴 수 없다. */
function fakeClock() {
  let current = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; run: () => void }>();

  const clock: ReaderClock = {
    now: () => current,
    setTimeout: (handler, ms) => {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { at: current + ms, run: handler });
      return handle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle);
    },
  };

  return {
    clock,
    /** `ms`만큼 흘려 예약된 것을 실행한다. */
    advance(ms: number) {
      current += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= current) {
          timers.delete(handle);
          timer.run();
        }
      }
    },
  };
}

function memoryStore(): ReaderKeyValueStore & { map: Map<string, string> } {
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

function progress(revision = 1, updatedAt = AT): ReaderProgress {
  return { ...createReaderProgress(GUIDE, revision, 'step-1', AT), updatedAt };
}

describe('저장 예약 시점 (M7 DoD 4)', () => {
  it('목표는 100ms, 하드 상한은 250ms다', () => {
    expect(READER_SAVE_DEBOUNCE_MS).toBe(100);
    expect(READER_SAVE_MAX_WAIT_MS).toBe(250);
  });

  it('마지막 변경에서 100ms에 쓰고 그전에는 쓰지 않는다', () => {
    const store = memoryStore();
    const { clock, advance } = fakeClock();
    const storage = createReaderStorage({ store, clock });

    storage.scheduleSave(progress());
    advance(99);
    expect(store.map.size).toBe(0);

    advance(1);
    expect(store.map.size).toBe(1);
  });

  it('변경이 이어져도 첫 변경에서 250ms 안에 쓴다', () => {
    const store = memoryStore();
    const { clock, advance } = fakeClock();
    const storage = createReaderStorage({ store, clock });

    // 50ms마다 계속 바꾼다. debounce만 있으면 영원히 미뤄진다.
    for (let elapsed = 0; elapsed < 300; elapsed += 50) {
      storage.scheduleSave(progress());
      advance(50);
      if (elapsed >= 200) break;
    }
    expect(store.map.size).toBe(1);
  });

  it('flush는 예약을 기다리지 않는다', () => {
    const store = memoryStore();
    const { clock } = fakeClock();
    const storage = createReaderStorage({ store, clock });

    storage.scheduleSave(progress());
    storage.flush();
    expect(store.map.size).toBe(1);
  });

  it('dispose 후에는 예약하지 않는다', () => {
    const store = memoryStore();
    const { clock, advance } = fakeClock();
    const storage = createReaderStorage({ store, clock });

    storage.dispose();
    storage.scheduleSave(progress());
    advance(500);
    expect(store.map.size).toBe(0);
  });
});

describe('revision 격리 (INV-10, M7 DoD 6)', () => {
  it('키가 revision별로 갈린다', () => {
    const store = memoryStore();
    const storage = createReaderStorage({ store });

    storage.scheduleSave(progress(1));
    storage.flush();
    storage.scheduleSave(progress(2));
    storage.flush();

    expect([...store.map.keys()].sort()).toEqual([
      readerProgressKey(GUIDE, 1),
      readerProgressKey(GUIDE, 2),
    ]);
  });

  it('다른 revision의 진행을 찾아 알린다', () => {
    const store = memoryStore();
    const storage = createReaderStorage({ store });

    for (const revision of [1, 2, 5]) {
      storage.scheduleSave(progress(revision));
      storage.flush();
    }
    expect(storage.findOtherRevisions(GUIDE, 2)).toEqual([5, 1]);
    expect(storage.findOtherRevisions('other-guide', 1)).toEqual([]);
  });

  it('본문이 키와 어긋나면 버린다', () => {
    const store = memoryStore();
    // 본문을 믿으면 revision 격리가 본문 조작으로 뚫린다.
    store.setItem(readerProgressKey(GUIDE, 1), JSON.stringify(progress(9)));

    expect(createReaderStorage({ store }).load(GUIDE, 1)).toBeNull();
  });

  it('손상된 JSON은 진행 없음으로 다루고 지우지는 않는다', () => {
    const store = memoryStore();
    const key = readerProgressKey(GUIDE, 1);
    store.setItem(key, '{깨진');

    expect(createReaderStorage({ store }).load(GUIDE, 1)).toBeNull();
    // 하네스 M7 주의 - 사용자의 이전 작업을 임의로 지우지 않는다.
    expect(store.map.has(key)).toBe(true);
  });

  it('형태가 다른 값도 진행 없음이다', () => {
    const store = memoryStore();
    store.setItem(readerProgressKey(GUIDE, 1), JSON.stringify({ guideId: GUIDE }));
    expect(createReaderStorage({ store }).load(GUIDE, 1)).toBeNull();
  });
});

describe('저장 실패와 세션 폴백 (M7 DoD 7)', () => {
  it('저장소가 없으면 세션 모드로 시작하고 이유를 남긴다', () => {
    const storage = createReaderStorage({ store: null, unavailableReason: '테스트' });
    expect(storage.mode).toBe('session');
    expect(storage.unavailableReason).toBe('테스트');
  });

  it('쓰기가 던지면 세션으로 떨어지고 진행은 이어진다', () => {
    const failing: ReaderKeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('용량 초과', 'QuotaExceededError');
      },
      removeItem: () => {},
      key: () => null,
      length: 0,
    };
    const storage = createReaderStorage({ store: failing });
    expect(storage.mode).toBe('persistent');

    storage.scheduleSave(progress());
    storage.flush();

    expect(storage.mode).toBe('session');
    expect(storage.unavailableReason).toContain('QuotaExceededError');
    // 던지지 않는다. 저장 실패가 독자의 진행을 멈추면 안 된다.
  });

  it('세션 모드는 새로고침 전까지 돌아오지 않는다', () => {
    let shouldFail = true;
    const flaky: ReaderKeyValueStore = {
      getItem: () => null,
      setItem: () => {
        if (shouldFail) throw new Error('일시 실패');
      },
      removeItem: () => {},
      key: () => null,
      length: 0,
    };
    const storage = createReaderStorage({ store: flaky });
    storage.scheduleSave(progress());
    storage.flush();
    expect(storage.mode).toBe('session');

    shouldFail = false;
    storage.scheduleSave(progress());
    storage.flush();
    // 배너가 깜빡이면 독자가 신뢰할 수 없다. 세션은 세션으로 남는다.
    expect(storage.mode).toBe('session');
  });
});

describe('다른 탭 동기화 (M7 DoD 8)', () => {
  it('자기 쓰기의 에코는 무시한다', () => {
    const store = memoryStore();
    const storage = createReaderStorage({ store });
    const value = progress();

    storage.scheduleSave(value);
    storage.flush();

    const key = readerProgressKey(GUIDE, 1);
    // 여기서 끊지 않으면 두 탭이 서로를 영원히 갱신한다.
    expect(storage.interpretExternalChange(GUIDE, 1, key, store.map.get(key) ?? null)).toBeNull();
  });

  it('다른 키는 무시한다', () => {
    const storage = createReaderStorage({ store: memoryStore() });
    expect(storage.interpretExternalChange(GUIDE, 1, 'howsheet:editor:theme', 'dark')).toBeNull();
    expect(storage.interpretExternalChange(GUIDE, 1, readerProgressKey(GUIDE, 2), '{}')).toBeNull();
    expect(storage.interpretExternalChange(GUIDE, 1, null, null)).toBeNull();
  });

  it('다른 탭의 갱신을 받는다', () => {
    const storage = createReaderStorage({ store: memoryStore() });
    const remote = progress(1, '2026-09-03T01:00:00.000Z');

    expect(
      storage.interpretExternalChange(
        GUIDE,
        1,
        readerProgressKey(GUIDE, 1),
        JSON.stringify(remote),
      ),
    ).toEqual({ kind: 'updated', progress: remote });
  });

  it('다른 탭의 초기화를 받는다', () => {
    const storage = createReaderStorage({ store: memoryStore() });
    expect(storage.interpretExternalChange(GUIDE, 1, readerProgressKey(GUIDE, 1), null)).toEqual({
      kind: 'cleared',
    });
  });

  it('세션 모드에서는 원격을 적용하지 않는다', () => {
    // 저장 못 하는 탭이 남의 상태를 받아 자기 것을 덮으면 세션 작업이 사라진다.
    const storage = createReaderStorage({ store: null });
    expect(
      storage.interpretExternalChange(
        GUIDE,
        1,
        readerProgressKey(GUIDE, 1),
        JSON.stringify(progress()),
      ),
    ).toBeNull();
  });

  it('updatedAt 동률은 적용하지 않는다', () => {
    const local = progress(1, AT);
    const same = progress(1, AT);
    const newer = progress(1, '2026-09-03T01:00:00.000Z');

    // 동률을 적용하면 같은 밀리초의 값을 두 탭이 영원히 주고받는다.
    expect(shouldApplyRemote(local, same)).toBe(false);
    expect(shouldApplyRemote(local, newer)).toBe(true);
    expect(shouldApplyRemote(newer, local)).toBe(false);
  });
});

describe('초기화', () => {
  it('예약된 저장까지 함께 취소한다', () => {
    const store = memoryStore();
    const { clock, advance } = fakeClock();
    const storage = createReaderStorage({ store, clock });

    storage.scheduleSave(progress());
    storage.clear(GUIDE, 1);
    advance(500);

    // 취소하지 않으면 지운 직후 예약이 되살아난다.
    expect(store.map.size).toBe(0);
  });
});
