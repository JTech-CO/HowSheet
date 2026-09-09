/**
 * 프롬프트 합성. AI가 되면 AI로, 안 되면 템플릿으로.
 *
 * 기준: v2 제품정의 §6.2·§6.3, §8 INV-02·INV-06·INV-07. 하네스 P5 할 일 4,
 * DoD 1·3·4.
 *
 * ## 템플릿을 먼저 만든다
 *
 * 어떤 경로로 가든 P3의 조립을 **먼저** 돌린다. 두 가지를 얻는다.
 *
 * - 키가 없거나 요청이 실패해도 돌려줄 것이 이미 손에 있다. (INV-02, INV-07)
 * - AI에게 줄 재료가 그 초안이다. 자료를 두 번 조립하지 않는다.
 *
 * ## 취소는 결과가 아니다
 *
 * 사용자가 멈춘 것은 실패가 아니므로 폴백을 만들지 않고 **그대로 던진다.**
 * 호출자가 이전 결과를 지키게 두는 것이 DoD 5다.
 */

import type { StudioDocument } from '../../domain/studio.types.ts';
import { composePrompt, missingProhibitions } from '../compose/compose.ts';
import { classifySynthesisError, type SynthesisError } from './errors.ts';
import { buildSystemPrompt, buildUserMessage } from './system-prompt.ts';
import type { StreamPrompt } from './anthropic.client.ts';

export type PromptOrigin = 'ai' | 'template';

export type SynthesisFallback =
  { reason: 'no-key' } | { reason: 'empty-response' } | { reason: 'error'; error: SynthesisError };

export interface SynthesisOutcome {
  text: string;
  /** 어느 쪽으로 만들었는가. 화면이 반드시 밝힌다. (DoD 1) */
  origin: PromptOrigin;
  /** 템플릿으로 간 이유. AI로 갔으면 undefined. */
  fallback?: SynthesisFallback;
  /** 금지 목록이 빠져 있어 덧붙였는가. (DoD 4) */
  prohibitionsAppended: boolean;
  truncated: boolean;
  sourceCharacters: number;
  includedCharacters: number;
}

export interface SynthesizeDeps {
  /** 전체 키를 읽는 길. `storage/api-key.store.ts`의 접근자를 그대로 받는다. */
  readApiKey: () => string | null;
  stream: StreamPrompt;
}

export interface SynthesizeOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  model?: string;
}

/**
 * 빠진 금지 항목을 덧붙인다.
 *
 * **조용히 통과시키지 않는다.** 덧붙이고, 덧붙였다는 사실을 돌려준다.
 * (하네스 P5 주의, INV-06)
 */
export function ensureProhibitions(text: string): { text: string; appended: boolean } {
  const missing = missingProhibitions(text);
  if (missing.length === 0) return { text, appended: false };

  const block = [
    '',
    '## 하지 말 것 (빠져 있어 덧붙임)',
    '',
    '아래는 예외 없이 지킵니다.',
    '',
    ...missing.map((item) => `- ${item}`),
    '',
  ].join('\n');

  return { text: `${text.trimEnd()}\n${block}`, appended: true };
}

export async function synthesizePrompt(
  studio: StudioDocument,
  deps: SynthesizeDeps,
  options: SynthesizeOptions = {},
): Promise<SynthesisOutcome> {
  const template = composePrompt(studio);

  const base = {
    truncated: template.truncated,
    sourceCharacters: template.sourceCharacters,
    includedCharacters: template.includedCharacters,
  };

  const asTemplate = (fallback: SynthesisFallback): SynthesisOutcome => ({
    text: template.text,
    origin: 'template',
    fallback,
    // 조립기의 출력에는 금지 목록이 언제나 들어 있다. P3이 그것을 보장한다.
    prohibitionsAppended: false,
    ...base,
  });

  const key = deps.readApiKey();
  if (key === null || key === '') return asTemplate({ reason: 'no-key' });

  let raw: string;
  try {
    raw = await deps.stream({
      apiKey: key,
      system: buildSystemPrompt(),
      user: buildUserMessage(template.text),
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onDelta === undefined ? {} : { onDelta: options.onDelta }),
    });
  } catch (error) {
    // 취소는 폴백을 만들지 않는다. 호출자가 이전 결과를 지킨다. (DoD 5)
    //
    // 신호를 먼저 본다. 우리가 멈춘 것을 아는 가장 확실한 근거이고, 오류의
    // 모양이 SDK 버전에 따라 달라져도 흔들리지 않는다.
    if (options.signal?.aborted === true) throw error;

    const classified = classifySynthesisError(error);
    if (classified.kind === 'aborted') throw error;
    return asTemplate({ reason: 'error', error: classified });
  }

  // 빈 응답도 실패다. 빈 화면을 "완성된 프롬프트"라고 내밀지 않는다.
  if (raw.trim() === '') return asTemplate({ reason: 'empty-response' });

  const checked = ensureProhibitions(raw);
  return {
    text: checked.text,
    origin: 'ai',
    prohibitionsAppended: checked.appended,
    ...base,
  };
}
