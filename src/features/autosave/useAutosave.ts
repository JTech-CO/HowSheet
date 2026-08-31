/**
 * 자동 저장 배선.
 *
 * 기준: 기술 백서 §4.3.2, FR-017. 하네스 M4 DoD 3·4·5.
 *
 * 스토어의 변경 번호(`changeSeq`)를 구독해 예약기를 두드린다. 저장 시점 판단은
 * `autosave.service.ts`가, 오래된 응답 판정은 `guide.store.ts`가 맡는다. 이
 * 훅은 둘을 잇기만 한다.
 */

import { useEffect, useRef } from 'react';

import {
  createAutosaveScheduler,
  type AutosaveClock,
  type AutosaveScheduler,
} from './autosave.service.ts';
import { useGuideStore } from '../../store/guide.store.ts';

export interface UseAutosaveOptions {
  /** 끄면 예약하지 않는다. 미리보기처럼 편집이 아닌 화면에서 쓴다. */
  enabled?: boolean;
  debounceMs?: number;
  maxWaitMs?: number;
  clock?: AutosaveClock;
}

export interface AutosaveHandle {
  /** 지금 저장한다. 화면을 떠나기 전이나 명시적 저장 버튼에서 쓴다. */
  flush: () => Promise<void>;
  pending: () => boolean;
}

export function useAutosave(options: UseAutosaveOptions = {}): AutosaveHandle {
  const { enabled = true } = options;
  const changeSeq = useGuideStore((state) => state.changeSeq);
  const savedSeq = useGuideStore((state) => state.savedSeq);
  const documentId = useGuideStore((state) => state.document?.id ?? null);

  const schedulerRef = useRef<AutosaveScheduler | null>(null);

  // 예약기는 문서 하나에 하나다. 문서가 바뀌면 이전 예약을 버린다.
  useEffect(() => {
    const scheduler = createAutosaveScheduler({
      save: () => useGuideStore.getState().save(),
      ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
      ...(options.maxWaitMs === undefined ? {} : { maxWaitMs: options.maxWaitMs }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
    schedulerRef.current = scheduler;

    return () => {
      // 화면을 떠날 때 남은 변경을 흘려보내지 않는다. 예약 중이던 것을 마지막에
      // 한 번 저장한다. (M4 DoD 5 — 편집 내용을 잃지 않는다)
      if (scheduler.pending()) void scheduler.flush();
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [documentId, options.debounceMs, options.maxWaitMs, options.clock]);

  useEffect(() => {
    if (!enabled) return;
    if (documentId === null) return;
    if (changeSeq === savedSeq) return;
    schedulerRef.current?.request();
  }, [enabled, documentId, changeSeq, savedSeq]);

  return {
    flush: async () => {
      await schedulerRef.current?.flush();
    },
    pending: () => schedulerRef.current?.pending() ?? false,
  };
}
