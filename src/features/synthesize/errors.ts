/**
 * 합성 실패를 종류로 나눈다.
 *
 * 기준: 하네스 P5 DoD 2(네트워크 오류·429·401이 각각 다른 안내로 구분된다).
 *
 * ## 왜 SDK 오류 클래스로 `instanceof`를 쓰지 않는가
 *
 * 이 판정은 순수 함수라야 node 단위 테스트에서 SDK 없이 돌고, SDK를 올릴 때
 * 클래스 이름이 바뀌어도 조용히 무너지지 않는다. 대신 **구조**를 본다 -
 * `status` 숫자와 이름. 그 구조가 실제 SDK 오류와 맞는지는
 * `tests/unit/synthesize/anthropic.client.test.ts`가 진짜 오류 객체로 확인한다.
 *
 * ## 메시지에 키를 담지 않는다
 *
 * 여기서 만드는 문장은 전부 우리가 쓴 것이다. 예외의 `message`를 그대로
 * 옮기지 않는다 - 요청 오류 본문에 헤더가 실려 오는 구현이 있다. (P4 DoD 4)
 */

export type SynthesisErrorKind =
  'aborted' | 'auth' | 'rate-limit' | 'network' | 'server' | 'request' | 'unknown';

export interface SynthesisError {
  kind: SynthesisErrorKind;
  /** 화면에 그대로 보여 줄 안내. 종류마다 다르다. (DoD 2) */
  message: string;
  /** 같은 요청을 다시 보내 볼 만한가. */
  retryable: boolean;
}

const MESSAGES: Record<SynthesisErrorKind, { message: string; retryable: boolean }> = {
  aborted: { message: '생성을 취소했습니다.', retryable: true },
  auth: {
    message:
      '키가 거부됐습니다. 키가 만료됐거나 잘못 붙여넣었을 수 있습니다. 설정에서 키를 다시 넣어 보세요.',
    retryable: false,
  },
  'rate-limit': {
    message:
      '요청이 너무 잦습니다. 잠시 뒤에 다시 시도하세요. 계정의 사용 한도에 걸렸을 수도 있습니다.',
    retryable: true,
  },
  network: {
    message:
      '네트워크에 닿지 못했습니다. 연결을 확인하고 다시 시도하세요. 오프라인이면 템플릿으로도 쓸 수 있습니다.',
    retryable: true,
  },
  server: {
    message: 'Anthropic 쪽에서 오류가 났습니다. 잠시 뒤에 다시 시도하세요.',
    retryable: true,
  },
  request: {
    message: '요청이 거부됐습니다. 자료가 너무 길지 않은지 확인하고 다시 시도하세요.',
    retryable: false,
  },
  unknown: { message: '알 수 없는 이유로 생성하지 못했습니다.', retryable: true },
};

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function nameOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

export function classifySynthesisError(error: unknown): SynthesisError {
  const name = nameOf(error);

  // 취소가 먼저다. 사용자가 멈춘 것을 실패로 안내하면 안 된다. (DoD 5)
  if (name === 'AbortError' || name === 'APIUserAbortError') {
    return { kind: 'aborted', ...MESSAGES.aborted };
  }

  const status = statusOf(error);
  if (status === 401 || status === 403) return { kind: 'auth', ...MESSAGES.auth };
  if (status === 429) return { kind: 'rate-limit', ...MESSAGES['rate-limit'] };
  if (status !== null && status >= 500) return { kind: 'server', ...MESSAGES.server };
  if (status !== null && status >= 400) return { kind: 'request', ...MESSAGES.request };

  // 연결 실패에는 status가 없다. SDK는 `APIConnectionError`로, 브라우저 fetch는
  // `TypeError`로 온다.
  if (
    name === 'APIConnectionError' ||
    name === 'APIConnectionTimeoutError' ||
    name === 'TypeError'
  ) {
    return { kind: 'network', ...MESSAGES.network };
  }

  return { kind: 'unknown', ...MESSAGES.unknown };
}

/** 안내가 종류마다 실제로 다른지 본다. 테스트와 화면이 함께 쓴다. */
export function synthesisErrorMessages(): Record<SynthesisErrorKind, string> {
  return Object.fromEntries(
    Object.entries(MESSAGES).map(([kind, value]) => [kind, value.message]),
  ) as Record<SynthesisErrorKind, string>;
}
