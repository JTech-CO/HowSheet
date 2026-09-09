/**
 * 생성 스토어.
 *
 * 기준: v2 제품정의 §6, §8 INV-02·INV-07. 하네스 P5 DoD 1·3·5.
 *
 * ## 취소가 이전 결과를 지우지 않는다
 *
 * 새 결과가 들어올 때만 `result`를 바꾼다. 취소는 진행 중이던 스트림만 버린다.
 * 사용자가 "다시 만들기"를 눌렀다가 멈췄을 때 앞의 결과까지 사라지면, 되돌릴
 * 방법이 없다. (DoD 5)
 *
 * ## 자료와 선택을 건드리지 않는다
 *
 * 이 스토어는 `studio.store`에 쓰지 않는다. 생성이 실패해도 붙여넣은 자료와
 * 고른 것이 그대로 남는 것은 그 때문이다. (DoD 3, INV-07)
 */

import { create } from 'zustand';

import type { StudioDocument } from '../domain/studio.types.ts';
import { classifySynthesisError, type SynthesisError } from '../features/synthesize/errors.ts';
import { createSynthesizeDeps } from '../features/synthesize/deps.ts';
import {
  synthesizePrompt,
  type SynthesisOutcome,
  type SynthesizeDeps,
} from '../features/synthesize/synthesize.ts';

export type GenerateStatus = 'idle' | 'running' | 'done' | 'error';

let deps: SynthesizeDeps | null = null;
let controller: AbortController | null = null;

/** 테스트와 부트스트랩이 주입한다. */
export function configureGenerateStore(next: SynthesizeDeps | null): void {
  deps = next;
}

function generateDeps(): SynthesizeDeps {
  deps ??= createSynthesizeDeps();
  return deps;
}

export interface GenerateStoreState {
  status: GenerateStatus;
  /** 스트리밍 중 차오르는 텍스트. 완성되면 비운다. */
  streaming: string;
  /** 마지막으로 완성된 결과. */
  result: SynthesisOutcome | null;
  /** 결과조차 만들지 못한 예외. 폴백이 성공하면 여기가 아니라 `result.fallback`에 담긴다. */
  error?: SynthesisError;

  generate: (studio: StudioDocument) => Promise<void>;
  cancel: () => void;
}

const INITIAL = {
  status: 'idle' as GenerateStatus,
  streaming: '',
  result: null as SynthesisOutcome | null,
  error: undefined as SynthesisError | undefined,
};

export const useGenerateStore = create<GenerateStoreState>((set, get) => ({
  ...INITIAL,

  async generate(studio) {
    if (get().status === 'running') return;

    controller = new AbortController();
    set({ status: 'running', streaming: '', error: undefined });

    try {
      const outcome = await synthesizePrompt(studio, generateDeps(), {
        signal: controller.signal,
        onDelta: (delta) => {
          // 취소한 뒤 늦게 도착하는 조각은 버린다.
          if (get().status === 'running') set({ streaming: get().streaming + delta });
        },
      });
      set({ status: 'done', result: outcome, streaming: '', error: undefined });
    } catch (error) {
      const classified = classifySynthesisError(error);
      if (classified.kind === 'aborted') {
        // 이전 결과를 그대로 둔다. (DoD 5)
        set({ status: get().result === null ? 'idle' : 'done', streaming: '' });
        return;
      }
      // 여기까지 오는 것은 폴백조차 만들지 못한 경우다. 자료는 건드리지 않는다.
      set({ status: 'error', error: classified, streaming: '' });
    } finally {
      controller = null;
    }
  },

  cancel() {
    controller?.abort();
  },
}));

export function resetGenerateStore(): void {
  controller?.abort();
  controller = null;
  useGenerateStore.setState({ ...INITIAL });
}
