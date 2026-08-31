import { describe, expect, it, vi } from 'vitest';

import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  createAutosaveScheduler,
} from '@/features/autosave/autosave.service.ts';

import { createFakeClock, flushMicrotasks } from './fake-clock.ts';

/** 밖에서 풀 수 있는 Promise. 클로저 대입은 TS가 좁혀 버려 호출할 수 없다. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('예약 시점 (M4 DoD 3)', () => {
  it('기본값은 500ms 목표, 1초 하드 상한이다', () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(500);
    expect(AUTOSAVE_MAX_WAIT_MS).toBe(1000);
  });

  it('마지막 입력에서 500ms 뒤에 저장한다', async () => {
    const fake = createFakeClock();
    const save = vi.fn(async () => {});
    const scheduler = createAutosaveScheduler({ save, clock: fake.clock });

    scheduler.request();
    await fake.advance(499);
    expect(save).not.toHaveBeenCalled();

    await fake.advance(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('입력이 이어지면 예약이 뒤로 밀린다', async () => {
    const fake = createFakeClock();
    const save = vi.fn(async () => {});
    const scheduler = createAutosaveScheduler({ save, clock: fake.clock });

    scheduler.request();
    await fake.advance(300);
    scheduler.request();
    await fake.advance(300);
    // 첫 요청에서 600ms 지났지만 마지막 입력에서는 300ms뿐이다.
    expect(save).not.toHaveBeenCalled();

    await fake.advance(200);
    expect(save).toHaveBeenCalledTimes(1);
  });

  // 이 단언이 없으면 계속 타자를 치는 동안 저장이 무한정 밀린다.
  it('계속 입력해도 첫 변경에서 1초 안에 저장한다', async () => {
    const fake = createFakeClock();
    const save = vi.fn(async () => {});
    const scheduler = createAutosaveScheduler({ save, clock: fake.clock });

    scheduler.request();
    for (let elapsed = 0; elapsed < 1000; elapsed += 100) {
      await fake.advance(100);
      if (save.mock.calls.length === 0) scheduler.request();
    }

    expect(save).toHaveBeenCalledTimes(1);
    expect(fake.now()).toBeLessThanOrEqual(1000 + 100);
  });

  it('debounce와 상한을 바꿀 수 있다', async () => {
    const fake = createFakeClock();
    const save = vi.fn(async () => {});
    const scheduler = createAutosaveScheduler({
      save,
      clock: fake.clock,
      debounceMs: 50,
      maxWaitMs: 120,
    });

    scheduler.request();
    await fake.advance(50);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('중첩 방지와 실패 처리 (M4 DoD 4·5)', () => {
  it('저장이 도는 동안 들어온 변경은 끝난 뒤 한 번 더 저장한다', async () => {
    const fake = createFakeClock();
    const gates: ReturnType<typeof deferred>[] = [];
    const save = vi.fn(() => {
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    });
    const scheduler = createAutosaveScheduler({ save, clock: fake.clock });

    scheduler.request();
    await fake.advance(500);
    expect(save).toHaveBeenCalledTimes(1);

    // 저장 중에 두 번 더 변경한다. 저장은 겹치지 않는다.
    scheduler.request();
    scheduler.request();
    expect(save).toHaveBeenCalledTimes(1);

    gates[0]!.resolve();
    await flushMicrotasks();
    await fake.advance(500);

    expect(save).toHaveBeenCalledTimes(2);
    gates[1]?.resolve();
  });

  it('저장이 실패해도 예약기는 살아 있다', async () => {
    const fake = createFakeClock();
    const onError = vi.fn();
    let attempt = 0;
    const save = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('저장 실패');
    });
    const scheduler = createAutosaveScheduler({ save, onError, clock: fake.clock });

    scheduler.request();
    await fake.advance(500);
    expect(onError).toHaveBeenCalledTimes(1);

    scheduler.request();
    await fake.advance(500);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flush는 예약을 기다리지 않고 즉시 저장한다', async () => {
    const fake = createFakeClock();
    const save = vi.fn(async () => {});
    const scheduler = createAutosaveScheduler({ save, clock: fake.clock });

    scheduler.request();
    await scheduler.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(fake.pendingTimers()).toBe(0);
  });

  it('cancel은 예약을 지운다', async () => {
    const fake = createFakeClock();
    const save = vi.fn(async () => {});
    const scheduler = createAutosaveScheduler({ save, clock: fake.clock });

    scheduler.request();
    scheduler.cancel();
    await fake.advance(2000);

    expect(save).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(false);
  });

  it('dispose 후에는 예약도 flush도 받지 않는다', async () => {
    const fake = createFakeClock();
    const save = vi.fn(async () => {});
    const scheduler = createAutosaveScheduler({ save, clock: fake.clock });

    scheduler.dispose();
    scheduler.request();
    await scheduler.flush();
    await fake.advance(2000);

    expect(save).not.toHaveBeenCalled();
  });

  it('pending은 예약 중과 저장 중을 모두 보고한다', async () => {
    const fake = createFakeClock();
    const gate = deferred();
    const save = vi.fn(() => gate.promise);
    const scheduler = createAutosaveScheduler({ save, clock: fake.clock });

    expect(scheduler.pending()).toBe(false);
    scheduler.request();
    expect(scheduler.pending()).toBe(true);

    await fake.advance(500);
    expect(scheduler.pending()).toBe(true);

    gate.resolve();
    await flushMicrotasks();
    expect(scheduler.pending()).toBe(false);
  });
});
