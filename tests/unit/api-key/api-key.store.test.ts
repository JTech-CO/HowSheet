import { describe, expect, it } from 'vitest';

import {
  API_KEY_MIN_LENGTH,
  API_KEY_PREFIX,
  API_KEY_STORAGE_KEY,
  InvalidApiKeyError,
  checkApiKey,
  createApiKeyStore,
  maskApiKey,
} from '@/storage/api-key.store.ts';
import type { KeyValueStore } from '@/storage/browser-store.ts';
import { isAllowedKey } from '@/storage/local-storage.ts';

/**
 * 기준: v2 제품정의 §7(키 취급 7개 규칙), §8 INV-01. 하네스 P4 DoD 2·3·4·5.
 *
 * 여기서 지키는 것은 셋이다. **전체 키가 상태로 새어 나가지 않는다**,
 * **오류가 입력을 되풀이하지 않는다**, **삭제가 실제로 지운다**.
 */

const SECRET = 'a'.repeat(80);
const KEY = `${API_KEY_PREFIX}api03-${SECRET}WXYZ`;

function memoryStore(seed: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** 쓰기와 지우기가 언제나 실패하는 저장소. 사생활 보호 모드를 흉내 낸다. */
function failingStore(seed: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: () => {
      throw new Error(`QuotaExceededError while writing ${KEY}`);
    },
    removeItem: () => {
      throw new Error(`SecurityError while removing ${KEY}`);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe('허용 목록 분리 (하네스 P4 주의)', () => {
  it('키가 화면 설정 허용 목록에 없다', () => {
    // 넣는 순간 PreferenceStore 경로로 키를 읽고 쓸 수 있게 되고,
    // 마스킹·삭제·로그 금지 규칙이 통째로 우회된다.
    expect(isAllowedKey(API_KEY_STORAGE_KEY)).toBe(false);
  });
});

describe('maskApiKey (§7-5)', () => {
  it('접두사와 뒤 네 자리만 남긴다', () => {
    expect(maskApiKey(KEY)).toBe(`${API_KEY_PREFIX}...WXYZ`);
  });

  it('가운데를 흘리지 않는다', () => {
    const masked = maskApiKey(KEY);
    expect(masked).not.toContain(SECRET);
    expect(masked).not.toContain('a'.repeat(5));
    expect(masked.length).toBeLessThan(20);
  });

  it('짧은 값에서는 꼬리도 남기지 않는다', () => {
    expect(maskApiKey('sk-ant-1234')).toBe(`${API_KEY_PREFIX}...`);
  });
});

describe('checkApiKey', () => {
  it('제대로 된 키를 통과시키고 앞뒤 공백을 턴다', () => {
    const result = checkApiKey(`  ${KEY}\n`);
    expect(result).toEqual({ ok: true, key: KEY });
  });

  it.each([
    ['빈 값', ''],
    ['공백만', '   '],
    ['접두사 없음', `not-a-key-${SECRET}`],
    ['너무 짧음', `${API_KEY_PREFIX}abc`],
    ['가운데 줄바꿈', `${API_KEY_PREFIX}api03-${SECRET}\nWXYZ`],
  ])('%s은(는) 거부한다', (_label, value) => {
    expect(checkApiKey(value).ok).toBe(false);
  });

  it('거부 이유가 입력을 되풀이하지 않는다 (DoD 4)', () => {
    for (const value of [
      `not-a-key-${SECRET}`,
      `${API_KEY_PREFIX}api03-${SECRET}\nWXYZ`,
      `${API_KEY_PREFIX}${'b'.repeat(12)}`,
    ]) {
      const result = checkApiKey(value);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).not.toContain(value.trim());
      // 꼬리 여덟 글자도 나오면 안 된다. 그것이 곧 비밀의 조각이다.
      expect(result.reason).not.toContain(value.trim().slice(-8));
    }
  });

  it('최소 길이가 0이 아니다', () => {
    // 0이면 위의 "너무 짧음" 검사가 공허해진다.
    expect(API_KEY_MIN_LENGTH).toBeGreaterThan(8);
  });
});

describe('저장과 상태 (DoD 2)', () => {
  it('저장한 키를 요청용 접근자로만 돌려준다', () => {
    const store = createApiKeyStore({ store: memoryStore() });
    store.save(KEY);

    expect(store.readForAnthropicRequest()).toBe(KEY);
  });

  it('상태에 전체 키가 담기지 않는다', () => {
    const store = createApiKeyStore({ store: memoryStore() });
    store.save(KEY);

    const state = store.state();
    expect(state.present).toBe(true);
    expect(state.masked).toBe(`${API_KEY_PREFIX}...WXYZ`);
    // 필드를 하나 늘리면서 실수로 전체 키를 담는 것을 잡는다.
    expect(JSON.stringify(state)).not.toContain(SECRET);
  });

  it('키가 없으면 없다고 말한다', () => {
    const store = createApiKeyStore({ store: memoryStore() });
    expect(store.state()).toMatchObject({ present: false, masked: null });
    expect(store.readForAnthropicRequest()).toBeNull();
  });

  it('빈 문자열이 저장돼 있어도 없는 것으로 다룬다', () => {
    const store = createApiKeyStore({ store: memoryStore({ [API_KEY_STORAGE_KEY]: '' }) });
    expect(store.state().present).toBe(false);
  });

  it('형식이 아니면 던지고 저장하지 않는다', () => {
    const store = createApiKeyStore({ store: memoryStore() });

    expect(() => store.save('not-a-key')).toThrow(InvalidApiKeyError);
    expect(store.state().present).toBe(false);
  });

  it('던지는 오류에 입력이 실리지 않는다 (DoD 4)', () => {
    const store = createApiKeyStore({ store: memoryStore() });
    const bad = `not-a-key-${SECRET}`;

    try {
      store.save(bad);
      expect.unreachable('던져야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidApiKeyError);
      expect(String(error)).not.toContain(SECRET);
    }
  });
});

describe('삭제 (DoD 3)', () => {
  it('실제로 지우고 상태가 없음으로 바뀐다', () => {
    const backing = memoryStore();
    const store = createApiKeyStore({ store: backing });
    store.save(KEY);

    store.remove();

    expect(store.state().present).toBe(false);
    expect(store.readForAnthropicRequest()).toBeNull();
    // 상태만 바꾸고 저장소에 남겨 두는 구현을 잡는다.
    expect(backing.getItem(API_KEY_STORAGE_KEY)).toBeNull();
  });

  it('지우지 못하면 그 사실을 알린다', () => {
    const store = createApiKeyStore({ store: failingStore({ [API_KEY_STORAGE_KEY]: KEY }) });
    expect(store.state().present).toBe(true);

    store.remove();

    const state = store.state();
    expect(state.present).toBe(false);
    expect(state.mode).toBe('memory');
    expect(state.unavailableReason).toContain('남아 있을 수 있으니');
    expect(JSON.stringify(state)).not.toContain(SECRET);
  });
});

describe('저장소를 쓸 수 없을 때 (INV-07)', () => {
  it('저장소가 없으면 메모리로 떨어지고 이유를 남긴다', () => {
    const store = createApiKeyStore({ store: null });

    expect(store.state().mode).toBe('memory');
    expect(store.state().unavailableReason).toBeTruthy();
    // 떨어진 뒤에도 이 탭에서는 쓸 수 있어야 한다.
    store.save(KEY);
    expect(store.readForAnthropicRequest()).toBe(KEY);
  });

  it('쓰기가 실패해도 던지지 않고 메모리로 옮긴다', () => {
    const store = createApiKeyStore({ store: failingStore() });

    expect(() => store.save(KEY)).not.toThrow();
    expect(store.state().mode).toBe('memory');
    expect(store.readForAnthropicRequest()).toBe(KEY);
  });

  it('폴백 이유에 예외 메시지를 붙이지 않는다 (DoD 4)', () => {
    // 저장소가 던진 오류에 키가 실려 있을 수 있다. 그것을 그대로 이유로
    // 옮기면 화면과 콘솔에 키가 남는다.
    const store = createApiKeyStore({ store: failingStore() });
    store.save(KEY);

    expect(store.state().unavailableReason).not.toContain(SECRET);
    expect(store.state().unavailableReason).not.toContain('QuotaExceededError');
  });
});
