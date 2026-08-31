import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readerProgressKey } from '@/domain/progress.types.ts';
import {
  DisallowedKeyError,
  EDITOR_KEYS,
  PreferenceStore,
  isAllowedKey,
  type KeyValueStore,
} from '@/storage/local-storage.ts';

/** 동작을 제어할 수 있는 최소 저장소 대역. */
function fakeStore(
  options: { failOnSet?: boolean } = {},
): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (options.failOnSet) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
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

describe('키 허용 목록 (M3 DoD 7)', () => {
  it.each([
    EDITOR_KEYS.theme,
    EDITOR_KEYS.lastGuideId,
    EDITOR_KEYS.panelLayout,
    'howsheet:progress:guide-1:r1',
    'howsheet:progress:가이드:r42',
  ])("'%s'는 허용한다", (key) => {
    expect(isAllowedKey(key)).toBe(true);
  });

  // 기술 백서 §7.2 — 비밀번호·복구 코드·원문 파일 경로는 저장하지 않는다.
  it.each([
    'howsheet:editor:password',
    'howsheet:editor:recoveryCode',
    'howsheet:editor:sourceFilePath',
    'howsheet:progress:guide-1',
    'howsheet:progress:guide-1:rX',
    'howsheet:secret',
    'other-app:theme',
    '',
  ])("'%s'는 거부한다", (key) => {
    expect(isAllowedKey(key)).toBe(false);
  });

  it('허용하지 않는 키에 쓰려 하면 던진다', () => {
    const store = new PreferenceStore({ store: fakeStore() });
    expect(() => store.set('howsheet:editor:password', 'hunter2')).toThrow(DisallowedKeyError);
    expect(() => store.get('howsheet:editor:password')).toThrow(DisallowedKeyError);
    expect(() => store.remove('howsheet:editor:password')).toThrow(DisallowedKeyError);
  });

  it('거부된 키는 실제로 저장되지 않는다', () => {
    const backing = fakeStore();
    const store = new PreferenceStore({ store: backing });
    try {
      store.set('howsheet:editor:password', 'hunter2');
    } catch {
      // 의도된 예외
    }
    expect(backing.map.size).toBe(0);
  });

  it('진행 키는 INV-10 형식만 통과한다', () => {
    expect(isAllowedKey(readerProgressKey('guide-1', 3))).toBe(true);
  });
});

describe('읽기·쓰기', () => {
  it('문자열을 왕복한다', () => {
    const store = new PreferenceStore({ store: fakeStore() });
    store.set(EDITOR_KEYS.theme, 'dark');
    expect(store.get(EDITOR_KEYS.theme)).toBe('dark');
  });

  it('JSON을 왕복한다', () => {
    const store = new PreferenceStore({ store: fakeStore() });
    store.setJson(EDITOR_KEYS.panelLayout, { left: 240, right: 320 });
    expect(store.getJson(EDITOR_KEYS.panelLayout)).toEqual({ left: 240, right: 320 });
  });

  it('깨진 JSON은 null로 돌려준다', () => {
    const backing = fakeStore();
    backing.map.set(EDITOR_KEYS.panelLayout, '{ 깨짐');
    const store = new PreferenceStore({ store: backing });
    expect(store.getJson(EDITOR_KEYS.panelLayout)).toBeNull();
  });

  it('없는 키는 null이다', () => {
    const store = new PreferenceStore({ store: fakeStore() });
    expect(store.get(EDITOR_KEYS.theme)).toBeNull();
  });

  it('우리 키만 나열하고 지운다', () => {
    const backing = fakeStore();
    backing.map.set(EDITOR_KEYS.theme, 'dark');
    backing.map.set('howsheet:progress:g:r1', '{}');
    backing.map.set('other-app:data', 'keep');

    const store = new PreferenceStore({ store: backing });
    expect(store.ownedKeys()).toEqual(['howsheet:editor:theme', 'howsheet:progress:g:r1']);

    store.clearOwned();
    expect([...backing.map.keys()]).toEqual(['other-app:data']);
  });
});

describe('세션 폴백 (기술 §7.5)', () => {
  it('저장소가 없으면 세션 모드로 시작하고 이유를 알린다', () => {
    const store = new PreferenceStore({ store: null });
    expect(store.state().mode).toBe('session');
    expect(store.state().unavailableReason).toBeTruthy();
  });

  it('세션 모드에서도 읽고 쓸 수 있다', () => {
    const store = new PreferenceStore({ store: null });
    store.set(EDITOR_KEYS.theme, 'light');
    expect(store.get(EDITOR_KEYS.theme)).toBe('light');
  });

  it('쓰기가 실패하면 예외를 내보내지 않고 세션 모드로 전환한다', () => {
    const store = new PreferenceStore({ store: fakeStore({ failOnSet: true }) });
    expect(store.state().mode).toBe('persistent');

    expect(() => store.set(EDITOR_KEYS.theme, 'dark')).not.toThrow();

    expect(store.state().mode).toBe('session');
    expect(store.state().unavailableReason).toContain('QuotaExceededError');
    // 이번 세션 동안은 값이 유지된다.
    expect(store.get(EDITOR_KEYS.theme)).toBe('dark');
  });

  it('전환 시 이미 저장돼 있던 우리 키를 옮긴다', () => {
    const backing = fakeStore();
    backing.map.set(EDITOR_KEYS.lastGuideId, 'guide-1');
    const store = new PreferenceStore({ store: backing });

    // 이후 쓰기부터 실패하게 만든다.
    backing.setItem = () => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    };

    store.set(EDITOR_KEYS.theme, 'dark');

    expect(store.state().mode).toBe('session');
    expect(store.get(EDITOR_KEYS.lastGuideId)).toBe('guide-1');
    expect(store.get(EDITOR_KEYS.theme)).toBe('dark');
  });

  it('한 번 세션으로 떨어지면 계속 세션이다', () => {
    const store = new PreferenceStore({ store: fakeStore({ failOnSet: true }) });
    store.set(EDITOR_KEYS.theme, 'dark');
    store.set(EDITOR_KEYS.lastGuideId, 'g');
    expect(store.state().mode).toBe('session');
    expect(store.get(EDITOR_KEYS.lastGuideId)).toBe('g');
  });
});

describe('index.html 인라인 테마 스크립트와의 결속 (M2 이월)', () => {
  // 인라인 스크립트는 번들 밖이라 어떤 검사도 닿지 않는다. 여기서 문자열을
  // 직접 묶어 두지 않으면 EDITOR_KEYS.theme을 바꿨을 때 첫 페인트 전에 읽는
  // 키만 옛 이름으로 남아 테마가 조용히 깜빡인다. (디자인 백서 §3.4)
  const html = readFileSync(fileURLToPath(new URL('../../../index.html', import.meta.url)), 'utf8');

  it('인라인 스크립트가 EDITOR_KEYS.theme과 같은 키를 읽는다', () => {
    expect(html).toContain(`localStorage.getItem('${EDITOR_KEYS.theme}')`);
  });

  it('인라인 스크립트가 읽는 키는 허용 목록을 통과한다', () => {
    const found = html.match(/localStorage\.getItem\('([^']+)'\)/g) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const call of found) {
      const key = /'([^']+)'/.exec(call)?.[1] ?? '';
      expect(isAllowedKey(key)).toBe(true);
    }
  });
});
