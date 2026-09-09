/**
 * 브라우저 키·값 저장소를 얻는 방법.
 *
 * 기준: v2 제품정의 §7(키 취급). 하네스 P4 할 일 1.
 *
 * `PreferenceStore`(화면 설정)와 `ApiKeyStore`(자격 증명)는 **정책이 다르다.**
 * 허용 목록, 마스킹, 삭제 버튼, 로그 금지가 한쪽에만 있다. 그래서 두 모듈을
 * 나눠 둔다.
 *
 * 다만 "이 브라우저에서 localStorage를 쓸 수 있는가"를 알아내는 방법은 정책이
 * 아니라 환경 탐지다. 양쪽에 각자 두면 사생활 보호 모드 판정이 두 벌이 되고,
 * 한쪽만 고쳐지는 날이 온다. 그 부분만 여기로 모은다.
 *
 * `localStorage`를 만지는 곳은 `src/storage/` 안뿐이다. (verify:architecture)
 */

/** 우리가 기대하는 최소 저장소 모양. 테스트가 대역을 넣을 수 있다. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/**
 * 브라우저의 `localStorage`. 쓸 수 없으면 `null`.
 *
 * 접근 자체가 던지는 환경이 있고, 사생활 보호 모드는 읽기는 되면서 쓰기에서만
 * 던지기도 한다. 그래서 존재 확인이 아니라 **실제로 한 번 써 본다.**
 */
export function detectBrowserStore(): KeyValueStore | null {
  try {
    const store = globalThis.localStorage;
    if (store === undefined || store === null) return null;
    const probe = '__howsheet_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

/** 탭이 살아 있는 동안만 남는 대역. */
export function createMemoryKeyValueStore(): KeyValueStore {
  const map = new Map<string, string>();
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
