import { describe, expect, it } from 'vitest';

import {
  classifySynthesisError,
  synthesisErrorMessages,
  type SynthesisErrorKind,
} from '@/features/synthesize/errors.ts';

/**
 * 기준: 하네스 P5 DoD 2(네트워크 오류·429·401이 각각 다른 안내로 구분된다).
 *
 * "다른 안내"가 실제로 다른지 본다. 한 문장으로 뭉치면 세 상황이 같은 화면을
 * 내고, 사용자는 무엇을 고쳐야 하는지 알 수 없다.
 */

/** SDK 오류의 모양을 흉내 낸다. 실제 오류로 하는 확인은 client 테스트가 한다. */
function apiError(status: number, name = 'APIError') {
  return Object.assign(new Error('api error'), { status, name });
}

describe('종류 판정', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
    [400, 'request'],
    [404, 'request'],
    [413, 'request'],
  ])('status %i는 %s', (status, kind) => {
    expect(classifySynthesisError(apiError(status)).kind).toBe(kind);
  });

  it.each(['AbortError', 'APIUserAbortError'])('%s는 취소다', (name) => {
    expect(classifySynthesisError(Object.assign(new Error('stop'), { name })).kind).toBe('aborted');
  });

  it.each(['APIConnectionError', 'APIConnectionTimeoutError', 'TypeError'])(
    '%s는 네트워크다',
    (name) => {
      expect(classifySynthesisError(Object.assign(new Error('boom'), { name })).kind).toBe(
        'network',
      );
    },
  );

  it('취소가 status보다 먼저다', () => {
    // 취소를 실패로 안내하면 사용자가 하지 않은 잘못을 고치려 든다.
    const aborted = Object.assign(new Error('stop'), { name: 'APIUserAbortError', status: 500 });
    expect(classifySynthesisError(aborted).kind).toBe('aborted');
  });

  it('모르는 값은 unknown이다', () => {
    for (const value of [null, undefined, 'x', 42, {}, new Error('plain')]) {
      expect(classifySynthesisError(value).kind).toBe('unknown');
    }
  });
});

describe('안내 문장 (DoD 2)', () => {
  const messages = synthesisErrorMessages();
  const kinds = Object.keys(messages) as SynthesisErrorKind[];

  it('종류마다 문장이 다르다', () => {
    expect(new Set(Object.values(messages)).size).toBe(kinds.length);
  });

  it('401·429·네트워크가 서로 다른 것을 말한다', () => {
    expect(messages.auth).toContain('키');
    expect(messages['rate-limit']).toContain('잦습니다');
    expect(messages.network).toContain('네트워크');
    expect(messages.auth).not.toBe(messages['rate-limit']);
    expect(messages['rate-limit']).not.toBe(messages.network);
  });

  it('무엇을 하면 되는지 말한다', () => {
    for (const kind of kinds) {
      expect(messages[kind].length).toBeGreaterThan(10);
    }
  });

  it('키를 담지 않는다 (P4 DoD 4)', () => {
    for (const kind of kinds) {
      expect(messages[kind]).not.toContain('sk-ant-');
    }
  });

  it('어떤 종류에서도 예외 메시지를 옮기지 않는다', () => {
    // 요청 오류 본문에 헤더가 실려 오는 구현이 있다. 한 갈래만 보면 나머지
    // 갈래가 새는 것을 놓친다 - unknown 갈래가 특히 그렇다.
    const secret = 'x-api-key: sk-ant-secret-value';
    const cases: unknown[] = [
      Object.assign(new Error(secret), { status: 401, name: 'APIError' }),
      Object.assign(new Error(secret), { status: 429, name: 'APIError' }),
      Object.assign(new Error(secret), { status: 500, name: 'APIError' }),
      Object.assign(new Error(secret), { status: 400, name: 'APIError' }),
      Object.assign(new Error(secret), { name: 'APIConnectionError' }),
      Object.assign(new Error(secret), { name: 'APIUserAbortError' }),
      new Error(secret),
      { message: secret },
      secret,
    ];

    const kinds = new Set<string>();
    for (const error of cases) {
      const classified = classifySynthesisError(error);
      kinds.add(classified.kind);
      expect(classified.message).not.toContain('sk-ant-secret-value');
    }
    // 갈래를 실제로 다 지났는지 본다. 한 갈래만 돌면 이 검사가 공허해진다.
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });
});

describe('재시도 안내', () => {
  it('키 문제는 다시 보내도 소용없다고 본다', () => {
    expect(classifySynthesisError(apiError(401)).retryable).toBe(false);
  });

  it('한도와 네트워크는 다시 시도할 만하다고 본다', () => {
    expect(classifySynthesisError(apiError(429)).retryable).toBe(true);
    expect(
      classifySynthesisError(Object.assign(new Error('x'), { name: 'APIConnectionError' }))
        .retryable,
    ).toBe(true);
  });
});
