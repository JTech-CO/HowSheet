/**
 * 합성에 필요한 것을 엮는다.
 *
 * 기준: v2 제품정의 §8 INV-01. 하네스 P5 할 일 1.
 *
 * 이 파일이 있는 이유는 **키가 지나가는 길을 이 디렉터리 안에 가두기** 위해서다.
 * 스토어가 직접 `readForAnthropicRequest()`를 부르면 키를 만지는 곳이 하나 늘고,
 * `verify:architecture`의 `API_KEY_READER` 규칙이 그것을 막는다.
 *
 * 스토어는 여기서 만든 묶음을 받아 쓰기만 한다. 전체 키를 보지 않는다.
 */

import { sharedApiKeyStore, type ApiKeyStore } from '../../storage/api-key.store.ts';
import { createAnthropicStreamer, type StreamPrompt } from './anthropic.client.ts';
import type { SynthesizeDeps } from './synthesize.ts';

export interface CreateSynthesizeDepsOptions {
  /** 테스트가 대역 저장소를 넣는다. */
  keys?: ApiKeyStore;
  /** 테스트가 대역 스트림을 넣는다. */
  stream?: StreamPrompt;
}

/**
 * 테스트도 이 함수를 거친다.
 *
 * 테스트가 `readForAnthropicRequest()`를 직접 부르면 키를 만지는 곳이 하나 늘고
 * 규칙이 거기를 허용해야 한다. 대역을 받아들이는 편이 경계를 좁게 유지한다.
 */
export function createSynthesizeDeps(options: CreateSynthesizeDepsOptions = {}): SynthesizeDeps {
  const keys = options.keys ?? sharedApiKeyStore();
  return {
    readApiKey: () => keys.readForAnthropicRequest(),
    stream: options.stream ?? createAnthropicStreamer(),
  };
}
