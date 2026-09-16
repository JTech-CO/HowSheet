/**
 * Anthropic 호출.
 *
 * 기준: v2 제품정의 §6.1, §7, §8 INV-01·INV-08. 하네스 P5 할 일 1·3, DoD 6.
 *
 * ## `dangerouslyAllowBrowser: true`를 켜는 근거
 *
 * 이름 그대로의 뜻이다. Anthropic 문서는 브라우저에서 키를 쓰는 것을 **위험하다고
 * 명시**한다. 키가 사용자의 기기에 놓이고, 확장·XSS·스크린샷에 노출될 수 있기
 * 때문이다.
 *
 * 같은 문서가 "신뢰된 사용자만 쓰는 내부 도구"를 예외로 인정한다. HowSheet는
 * 사용자가 **자기 기기에서 자기 키로 자기 작업을** 하는 도구다. 백엔드를 두면
 * 호스팅·요금·인증이 생기고, 더 나쁘게는 붙여넣은 자료가 남의 서버를 거친다
 * (INV-03이 막으려는 것이 바로 그것이다).
 *
 * 그래서 켜되 값을 치른다 - §7의 일곱 규칙, 전용 키 안내, 마스킹, 삭제 버튼.
 * 이 파일과 `storage/api-key.store.ts` 둘이 그 값을 지키는 자리다.
 *
 * ## 이 파일만 키를 요청에 싣는다
 *
 * `verify:architecture`의 `API_KEY_READER` 규칙이 `readForAnthropicRequest`를
 * 부를 수 있는 곳을 이 디렉터리로 묶는다. (INV-01)
 */

import { DEFAULT_MODEL, outputTokenBudget } from './model.ts';

export interface StreamRequest {
  apiKey: string;
  system: string;
  user: string;
  model?: string;
  signal?: AbortSignal;
  /** 조각이 올 때마다 부른다. 화면이 차오르는 것을 보여 준다. (할 일 3) */
  onDelta?: (delta: string) => void;
}

/** 합성 한 번. 실패하면 던진다. 분류는 `errors.ts`가 한다. */
export type StreamPrompt = (request: StreamRequest) => Promise<string>;

export interface CreateStreamerOptions {
  /** 테스트가 요청 URL을 확인할 때 넣는다. 없으면 전역 `fetch`. */
  fetch?: typeof globalThis.fetch;
}

export function createAnthropicStreamer(options: CreateStreamerOptions = {}): StreamPrompt {
  return async ({ apiKey, system, user, model, signal, onDelta }) => {
    /*
      SDK를 **여기서** 불러온다. 첫 화면은 자료를 붙여넣고 고르는 일만 하고,
      키가 없으면 템플릿 경로로 끝나 SDK가 아예 필요 없다(INV-02). 정적으로
      import하면 그 사용자도 150KB를 내려받는다.

      같은 출처에서 오는 청크 하나가 늘 뿐, 외부 요청은 그대로 0건이다. (INV-08)
    */
    const {
      default: Anthropic,
      APIConnectionError,
      APIConnectionTimeoutError,
      APIUserAbortError,
    } = await import('@anthropic-ai/sdk');

    /**
     * SDK 오류에 판별할 수 있는 이름을 붙인다.
     *
     * SDK의 오류 클래스는 `name`을 따로 세우지 않아 전부 `'Error'`로 온다.
     * 연결 실패와 취소는 `status`도 없어서, 구조만 보는 `errors.ts`가 둘을
     * 구분하지 못한다. 클래스를 아는 곳은 SDK를 불러온 여기뿐이다.
     * `instanceof`는 번들 후 클래스 이름이 뭉개져도 그대로 동작한다.
     *
     * 이 번역이 실제 SDK 오류와 맞는지는
     * `tests/unit/synthesize/anthropic.client.test.ts`가 진짜 응답으로 확인한다.
     */
    const tagError = (error: unknown): unknown => {
      if (error instanceof APIUserAbortError) {
        return Object.assign(error, { name: 'APIUserAbortError' });
      }
      if (error instanceof APIConnectionTimeoutError) {
        return Object.assign(error, { name: 'APIConnectionTimeoutError' });
      }
      if (error instanceof APIConnectionError) {
        return Object.assign(error, { name: 'APIConnectionError' });
      }
      return error;
    };

    const client = new Anthropic({
      apiKey,
      // 위 주석의 근거로 켠다. 백엔드가 없고, 키는 사용자의 것이며,
      // 요청은 `api.anthropic.com` 한 곳으로만 나간다. (INV-01, INV-08)
      dangerouslyAllowBrowser: true,
      // 재시도를 SDK에 맡기지 않는다. 429나 5xx를 조용히 두 번 더 보내면
      // 사용자는 왜 오래 걸리는지 모르고, DoD 2의 안내도 그만큼 늦게 뜬다.
      maxRetries: 0,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });

    const stream = client.messages.stream(
      {
        model: model ?? DEFAULT_MODEL,
        // 초안 크기에서 예산을 뽑되 모델의 출력 한계 안에 둔다. 고정 상한은 긴
        // 자료에서 반드시 잘리고, 한계를 넘긴 예산은 요청 자체가 거부된다.
        max_tokens: outputTokenBudget(user, model ?? DEFAULT_MODEL),
        system,
        messages: [{ role: 'user', content: user }],
      },
      // 취소는 여기로 들어간다. 취소된 요청은 `APIUserAbortError`로 온다.
      signal === undefined ? {} : { signal },
    );

    if (onDelta !== undefined) stream.on('text', onDelta);

    let message;
    try {
      // `finalText()`가 아니라 메시지 전체를 받는다. `stop_reason`을 봐야
      // 잘린 응답을 완성본으로 내미는 일을 막을 수 있다.
      message = await stream.finalMessage();
    } catch (error) {
      throw tagError(error);
    }

    /*
      끝까지 오지 않은 응답은 실패다.

      시스템 프롬프트가 자료를 그대로 인용하라고 요구하므로, 중간에 끊긴 출력은
      인용이 문장 중간에서 잘린 프롬프트다. 그것을 "AI가 다듬었습니다"라고 내밀면
      사용자는 잘린 줄 모르고 다른 AI에 붙여넣는다. 던져서 템플릿으로 떨어뜨린다.
      템플릿은 언제나 완성된 프롬프트다. (INV-02)

      **허용 목록으로 판정한다.** `max_tokens`만 막던 판은 `refusal`과
      `model_context_window_exceeded`를 완성본으로 통과시켰다. 새 stop_reason이
      생겨도 기본이 "막는다"여야 한다. (출시 점검 2026-09-16)
    */
    if (message.stop_reason !== 'end_turn' && message.stop_reason !== 'stop_sequence') {
      const truncated = message.stop_reason === 'max_tokens';
      throw Object.assign(
        new Error(
          truncated ? '출력 상한에서 응답이 끊겼습니다.' : '응답이 끝까지 오지 않았습니다.',
        ),
        { name: truncated ? 'PromptTruncatedError' : 'PromptIncompleteError' },
      );
    }

    return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  };
}
