/**
 * 합성에 쓰는 모델과 그 한계.
 *
 * 기준: v2 제품정의 §6.1. 하네스 P5 주의.
 *
 * **기본 모델을 임의로 바꾸지 않는다.** 값을 고르는 근거는 제품정의에 있고,
 * 바꾸려면 거기부터 고친다. 테스트가 이 상수를 고정한다.
 */

import { estimateTokens } from '../../domain/studio.defaults.ts';

/**
 * `claude-haiku-4-5`.
 *
 * 200K 컨텍스트, 입력 $1 / 출력 $5 per MTok. 프롬프트 작문에는 충분하고 싸다.
 * 사고(thinking)는 쓰지 않는다 - Haiku 4.5는 `budget_tokens` 방식이고, 여기서
 * 필요한 일은 추론이 아니라 다시 쓰기다.
 */
export const DEFAULT_MODEL = 'claude-haiku-4-5';

/**
 * 출력 상한의 바닥과 천장.
 *
 * 시스템 프롬프트가 "자료 원문은 결과 프롬프트 안에 그대로 인용해 남긴다"를
 * 요구하므로, 출력은 초안보다 짧을 수 없다. 상한을 8,000으로 못박아 두면 긴
 * 자료에서 **반드시** 잘린다. 그래서 초안 크기에서 예산을 뽑는다.
 *
 * 바닥 8,000은 짧은 자료에서도 요소 열 개의 지시를 다 쓸 수 있는 크기다. 산식이
 * 이 값을 넘는 지점은 초안 약 4,400토큰이다.
 *
 * 천장은 조립기의 자료 상한(`MAX_SOURCE_CHARACTERS`)을 옮길 수 있는 크기여야
 * 한다. 그보다 낮으면 허용된 자료인데도 AI 경로가 늘 잘린다. 그 관계는 주석이
 * 아니라 `tests/unit/synthesize/anthropic.client.test.ts`가 지킨다.
 *
 * 이 계산은 한글·CJK·라틴 자료에서만 맞는다. `estimateTokens`가 조밀하다고 세는
 * 문자 집합이 그 셋뿐이라, 키릴·타이·아랍 자료는 실제보다 적게 잡혀 천장에
 * 닿기 전에 잘릴 수 있다. 그때도 잘린 결과를 내밀지는 않는다.
 */
export const MIN_OUTPUT_TOKENS = 8_000;
export const MAX_OUTPUT_TOKENS = 60_000;
export const OUTPUT_BUDGET_RATIO = 1.6;

/**
 * 모델이 한 번에 낼 수 있는 출력 토큰.
 *
 * 모델마다 다르고, 넘겨서 요청하면 400이 온다. 그 400은 "자료가 너무 깁니다"로
 * 안내되므로 사용자는 엉뚱한 곳을 고치게 된다. 모르는 모델에는 보수적인 값을
 * 준다 - 낮게 잡아 템플릿으로 떨어지는 편이 요청이 거부되는 것보다 낫다.
 * (출시 점검 2026-09-16)
 */
const MODEL_OUTPUT_LIMITS: Readonly<Record<string, number>> = {
  // Haiku 4.5의 최대 출력은 64,000토큰이다. (Anthropic 모델 문서)
  'claude-haiku-4-5': 64_000,
};
const UNKNOWN_MODEL_OUTPUT_LIMIT = 8_192;

/**
 * 초안을 다시 쓰는 데 줄 출력 예산.
 *
 * 다시 쓰면서 요소별 지시가 길어지므로 초안보다 넉넉히 잡는다. 배율 1.6은 인용을
 * 그대로 옮기고 요소마다 지시를 구체화해도 남는 크기다. `max_tokens`는 상한일
 * 뿐이고 요금은 실제로 낸 토큰만큼이라, 넉넉히 잡아도 짧게 끝나면 비용이 늘지
 * 않는다. 어림수는 `estimateTokens`와 같은 근거를 쓴다 - 정확한 토큰 수는 모델만
 * 안다.
 */
export function outputTokenBudget(draft: string, model: string = DEFAULT_MODEL): number {
  const limit = MODEL_OUTPUT_LIMITS[model] ?? UNKNOWN_MODEL_OUTPUT_LIMIT;
  const ceiling = Math.min(MAX_OUTPUT_TOKENS, limit);
  const estimated = Math.ceil(estimateTokens(draft) * OUTPUT_BUDGET_RATIO) + 1_000;
  return Math.min(ceiling, Math.max(Math.min(MIN_OUTPUT_TOKENS, ceiling), estimated));
}
