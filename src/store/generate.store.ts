/**
 * 생성 스토어.
 *
 * 기준: v2 제품정의 §6, §8 INV-02·INV-07. 하네스 P5 DoD 1·3·5, P6 할 일·DoD 3.
 *
 * ## 이전 결과를 덮지 않는다
 *
 * 새로 만든 결과는 목록 앞에 **쌓인다.** 재생성이 앞의 것을 지우지 않으므로
 * 확인을 받을 이유도 없다 - 마음에 들지 않으면 목록에서 돌아가면 된다.
 * (P6 DoD 3)
 *
 * 취소도 목록을 건드리지 않는다. 진행 중이던 스트림만 버린다. (P5 DoD 5)
 *
 * ## 자료와 선택을 건드리지 않는다
 *
 * 이 스토어는 `studio.store`에 쓰지 않는다. 생성이 실패해도 붙여넣은 자료와
 * 고른 것이 그대로 남는 것은 그 때문이다. (P5 DoD 3, INV-07)
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

/**
 * 목록에 쌓인 결과 하나.
 *
 * 회차는 스토어가 붙인다. 파일명이 회차를 쓰는데(P6 DoD 2), "몇 번째로
 * 만들었는가"는 합성기가 아니라 목록을 든 쪽이 아는 것이다.
 */
export interface GeneratedResult extends SynthesisOutcome {
  revision: number;
}

/**
 * 들고 있을 결과의 수.
 *
 * 프롬프트 하나가 수십 KB일 수 있어 무한히 쌓으면 탭이 무거워진다. 열 개면
 * "방금 것과 그 전 것"을 오가기에 넉넉하고, 넘치면 가장 오래된 것부터 버린다.
 */
export const MAX_RESULTS = 10;

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
  /** 만든 결과들. **앞이 최신이다.** */
  results: GeneratedResult[];
  /** 지금 보고 있는 결과의 자리. */
  selected: number;
  /** 결과조차 만들지 못한 예외. 폴백이 성공하면 여기가 아니라 결과의 `fallback`에 담긴다. */
  error?: SynthesisError;

  generate: (studio: StudioDocument) => Promise<void>;
  cancel: () => void;
  selectResult: (index: number) => void;
}

const INITIAL = {
  status: 'idle' as GenerateStatus,
  streaming: '',
  results: [] as GeneratedResult[],
  selected: 0,
  error: undefined as SynthesisError | undefined,
};

/** 지금 보고 있는 결과. 없으면 null. */
export function currentResult(state: GenerateStoreState): GeneratedResult | null {
  return state.results[state.selected] ?? null;
}

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

      // 앞에 쌓고 그것을 본다. 이전 결과는 뒤로 밀릴 뿐 사라지지 않는다.
      //
      // 회차는 계속 올라간다. 상한에 걸려 오래된 것이 빠져도 번호를 다시 쓰지
      // 않는다 - 같은 이름의 파일이 두 번 내려가면 어느 쪽이 어느 것인지 모른다.
      const previous = get().results;
      const revision = (previous[0]?.revision ?? 0) + 1;

      set({
        status: 'done',
        results: [{ ...outcome, revision }, ...previous].slice(0, MAX_RESULTS),
        selected: 0,
        streaming: '',
        error: undefined,
      });
    } catch (error) {
      const classified = classifySynthesisError(error);
      if (classified.kind === 'aborted') {
        // 목록을 그대로 둔다. (P5 DoD 5)
        set({ status: get().results.length === 0 ? 'idle' : 'done', streaming: '' });
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

  selectResult(index) {
    if (index < 0 || index >= get().results.length) return;
    set({ selected: index });
  },
}));

export function resetGenerateStore(): void {
  controller?.abort();
  controller = null;
  useGenerateStore.setState({ ...INITIAL, results: [] });
}
