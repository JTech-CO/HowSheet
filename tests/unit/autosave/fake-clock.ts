/**
 * 결정론적 시계.
 *
 * 실시간을 기다리면 M4 DoD 3의 "500ms 목표, 1초 하드 상한"을 테스트가 확인할
 * 수 없다. 느슨하게 재면 상한이 깨져도 통과하고, 촘촘하게 재면 CI에서 흔들린다.
 */

import type { AutosaveClock, TimeoutHandle } from '@/features/autosave/autosave.service.ts';

interface Scheduled {
  at: number;
  fn: () => void;
}

export interface FakeClock {
  clock: AutosaveClock;
  /** 현재 시각. */
  now: () => number;
  /** ms만큼 진행하며 만기된 타이머를 순서대로 실행한다. */
  advance: (ms: number) => Promise<void>;
  /** 대기 중인 타이머 개수. */
  pendingTimers: () => number;
}

/** 예약된 마이크로태스크가 모두 끝나게 한다. */
export async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

export function createFakeClock(): FakeClock {
  let current = 0;
  let nextId = 1;
  const timers = new Map<number, Scheduled>();

  const clock: AutosaveClock = {
    now: () => current,
    setTimeout: (fn, ms) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: current + ms, fn });
      return id as unknown as TimeoutHandle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as unknown as number);
    },
  };

  return {
    clock,
    now: () => current,
    pendingTimers: () => timers.size,
    async advance(ms) {
      const target = current + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        current = due[1].at;
        due[1].fn();
        await flushMicrotasks();
      }
      current = target;
      await flushMicrotasks();
    },
  };
}
