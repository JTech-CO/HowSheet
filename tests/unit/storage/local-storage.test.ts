import { describe, expect, it } from 'vitest';

import { API_KEY_STORAGE_KEY } from '@/storage/api-key.store.ts';
import {
  DisallowedKeyError,
  PREFERENCE_KEYS,
  PreferenceStore,
  isAllowedKey,
  type KeyValueStore,
} from '@/storage/local-storage.ts';

/**
 * 기준: v2 제품정의 §7(키 취급), §8 INV-01·INV-03.
 *
 * 이 허용 목록이 느슨해지면 API 키가 화면 설정 경로로 새어 들어올 수 있다.
 * P0에서 v1의 리더 진행 키 규칙을 걷어내면서 목록을 다시 정했으므로, 여기서
 * 그 모양을 고정한다.
 */

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

/** 쓰기가 언제나 실패하는 저장소. 사생활 보호 모드를 흉내 낸다. */
function failingStore(): KeyValueStore {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
    key: () => null,
    length: 0,
  };
}

describe('키 허용 목록 (INV-01·INV-03)', () => {
  it('v2 화면 설정 키를 허용한다', () => {
    expect(isAllowedKey(PREFERENCE_KEYS.theme)).toBe(true);
  });

  it('목록에 없는 키는 거부한다', () => {
    for (const key of ['theme', 'howsheet:unknown', 'other:theme', '']) {
      expect(isAllowedKey(key)).toBe(false);
    }
  });

  it('네임스페이스 접두사만으로는 통과하지 못한다', () => {
    // 접두사 규칙이면 자격 증명이 이 경로로 저장될 수 있다. 정확한 목록이어야
    // 한다. API 키가 목록에 없다는 단언은 tests/unit/api-key에 둔다 - P4의
    // 검증 블록이 그쪽을 돌린다.
    expect(isAllowedKey('howsheet:theme:extra')).toBe(false);
    expect(isAllowedKey('howsheet:secret')).toBe(false);
  });

  it('v1의 리더 진행 키를 더는 허용하지 않는다', () => {
    expect(isAllowedKey('howsheet:progress:guide-1:r1')).toBe(false);
    expect(isAllowedKey('howsheet:editor:theme')).toBe(false);
  });

  it('허용 목록이 비어 있지 않다', () => {
    // 목록이 비면 위 거부 단언이 전부 공허하게 통과한다.
    expect(Object.values(PREFERENCE_KEYS).length).toBeGreaterThan(0);
  });
});

describe('PreferenceStore', () => {
  it('허용된 키를 읽고 쓴다', () => {
    const store = new PreferenceStore({ store: memoryStore() });
    store.set(PREFERENCE_KEYS.theme, 'dark');
    expect(store.get(PREFERENCE_KEYS.theme)).toBe('dark');
  });

  it('허용되지 않은 키 쓰기를 던져서 막는다', () => {
    const store = new PreferenceStore({ store: memoryStore() });
    expect(() => store.set(API_KEY_STORAGE_KEY, 'sk-ant-secret')).toThrow(DisallowedKeyError);
  });

  it('허용되지 않은 키는 값이 이미 있어도 읽지 못한다', () => {
    // 조용히 null을 주지 않고 던진다. 다른 버전이나 확장이 남긴 값을 우리
    // 경로로 끌어들이려는 시도는 실수이지 정상 흐름이 아니다.
    const store = new PreferenceStore({
      store: memoryStore({ [API_KEY_STORAGE_KEY]: 'sk-ant-x' }),
    });
    expect(() => store.get(API_KEY_STORAGE_KEY)).toThrow(DisallowedKeyError);
  });

  it('쓰기가 실패하면 세션 모드로 떨어지고 이유를 남긴다', () => {
    const store = new PreferenceStore({ store: failingStore() });
    store.set(PREFERENCE_KEYS.theme, 'dark');

    expect(store.state().mode).toBe('session');
    expect(store.state().unavailableReason).toBeTruthy();
    // 세션 모드에서도 값은 살아 있어야 한다. 던지면 화면이 멈춘다.
    expect(store.get(PREFERENCE_KEYS.theme)).toBe('dark');
  });

  it('remove가 값을 지운다', () => {
    const store = new PreferenceStore({ store: memoryStore() });
    store.set(PREFERENCE_KEYS.theme, 'light');
    store.remove(PREFERENCE_KEYS.theme);
    expect(store.get(PREFERENCE_KEYS.theme)).toBeNull();
  });
});
