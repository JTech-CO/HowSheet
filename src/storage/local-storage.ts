/**
 * LocalStorage 래퍼.
 *
 * 기준: v2 제품정의 §7(키 취급), §8 INV-03.
 * 보관 근거는 `docs/archive/v1/HowSheet_기술_백서.md` §7.5(브라우저 이슈)에서 왔다.
 *
 * 여기에는 **화면 설정만** 들어간다. API 키 같은 자격 증명은 담지 않는다 -
 * 마스킹·삭제·로그 금지 같은 별도 규칙이 필요해서 P4가 전용 모듈을 만든다.
 * 허용 목록에 없는 키는 쓰기 자체를 거부한다.
 *
 * `localStorage`를 직접 만지는 곳은 이 파일뿐이다. `file://`이나 사생활 보호
 * 모드에서 쓰기가 실패할 수 있으므로 세션 메모리로 떨어지고, 호출자가 그 사실을
 * 안내할 수 있게 상태를 노출한다.
 */

/** v2가 쓰는 화면 설정 키. */
export const PREFERENCE_KEYS = {
  theme: 'howsheet:theme',
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

/**
 * 쓰기가 허용되는 키인지 본다.
 *
 * 접두사 규칙이 아니라 **정확한 목록**이다. `howsheet:`로 시작하기만 하면
 * 통과시키면 자격 증명이 이 경로로 새어 들어올 수 있다.
 */
export function isAllowedKey(key: string): boolean {
  return (Object.values(PREFERENCE_KEYS) as string[]).includes(key);
}

export type PreferenceMode = 'persistent' | 'session';

export interface PreferenceStoreState {
  mode: PreferenceMode;
  /** 세션 모드로 떨어진 이유. persistent에서는 undefined. */
  unavailableReason?: string;
}

/** 이 래퍼가 기대하는 최소 저장소 모양. 테스트가 대역을 넣을 수 있다. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export class DisallowedKeyError extends Error {
  constructor(readonly key: string) {
    super(
      `허용하지 않는 저장 키입니다: ${key}. ` +
        'LocalStorage에는 테마·패널·진행 정보만 저장합니다. (기술 백서 §7.2)',
    );
    this.name = 'DisallowedKeyError';
  }
}

/** 브라우저의 `localStorage`. 접근 자체가 던질 수 있어 감싼다. */
function detectBrowserStore(): KeyValueStore | null {
  try {
    const store = globalThis.localStorage;
    if (store === undefined || store === null) return null;
    // 사생활 보호 모드는 읽기는 되고 쓰기에서 던지는 경우가 있다.
    const probe = '__howsheet_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function createMemoryStore(): KeyValueStore {
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

export interface CreatePreferenceStoreOptions {
  /** 주입하면 이것을 쓴다. 없으면 브라우저 localStorage를 찾는다. */
  store?: KeyValueStore | null;
}

/**
 * 허용 목록을 강제하고 실패 시 세션 메모리로 떨어지는 키·값 저장소.
 *
 * 쓰기가 도중에 실패해도(용량 초과 등) 예외를 밖으로 내보내지 않고 세션
 * 모드로 전환한다. 진행 상태가 세션 동안은 유지되고, 호출자는 `state()`로
 * 배너를 띄울 수 있다. (M7 DoD 7)
 */
export class PreferenceStore {
  private store: KeyValueStore;
  private mode: PreferenceMode;
  private reason: string | undefined;

  constructor(options: CreatePreferenceStoreOptions = {}) {
    const provided = options.store === undefined ? detectBrowserStore() : options.store;
    if (provided === null) {
      this.store = createMemoryStore();
      this.mode = 'session';
      this.reason = '이 브라우저에서 로컬 저장소를 쓸 수 없습니다.';
    } else {
      this.store = provided;
      this.mode = 'persistent';
      this.reason = undefined;
    }
  }

  state(): PreferenceStoreState {
    return this.mode === 'session'
      ? { mode: this.mode, unavailableReason: this.reason ?? '알 수 없는 이유' }
      : { mode: this.mode };
  }

  get(key: string): string | null {
    if (!isAllowedKey(key)) throw new DisallowedKeyError(key);
    try {
      return this.store.getItem(key);
    } catch {
      return null;
    }
  }

  /**
   * 허용하지 않는 키는 던진다. 저장 실패는 세션 모드 전환으로 흡수한다.
   *
   * 전환 자체도 실패할 수 있다(`length` getter가 던지는 저장소 구현이 있다).
   * 그때도 밖으로 예외를 내보내지 않는다. 이 메서드가 던지는 경우는 허용 목록
   * 위반뿐이라는 계약을 지켜야 호출부가 편집 흐름을 멈추지 않는다.
   */
  set(key: string, value: string): void {
    if (!isAllowedKey(key)) throw new DisallowedKeyError(key);
    try {
      this.store.setItem(key, value);
    } catch (error) {
      this.degradeToSession(error);
      try {
        this.store.setItem(key, value);
      } catch {
        // 전환 후의 메모리 저장소는 던지지 않는다. 여기 오면 이미 세션 모드이고
        // 이 한 값만 잃는다. 편집을 막지 않는다.
      }
    }
  }

  remove(key: string): void {
    if (!isAllowedKey(key)) throw new DisallowedKeyError(key);
    try {
      this.store.removeItem(key);
    } catch {
      // 지우지 못해도 진행을 막지 않는다.
    }
  }

  getJson<T>(key: string): T | null {
    const raw = this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  setJson(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }

  /**
   * 우리 네임스페이스의 키만 나열한다. 다른 앱의 키는 건드리지 않는다.
   * 저장소가 열거 중에 던지면 거기까지 모은 것을 돌려준다.
   */
  ownedKeys(): string[] {
    const keys: string[] = [];
    try {
      for (let index = 0; index < this.store.length; index += 1) {
        const key = this.store.key(index);
        if (key !== null && isAllowedKey(key)) keys.push(key);
      }
    } catch {
      // 열거가 막힌 저장소다. 부분 목록으로 진행한다.
    }
    return keys.sort();
  }

  /** 전체 데이터 초기화에서 우리 키만 지운다. (기술 §7.2) */
  clearOwned(): void {
    for (const key of this.ownedKeys()) this.remove(key);
  }

  private degradeToSession(error: unknown): void {
    if (this.mode === 'session') return;
    const carried = new Map<string, string>();
    try {
      for (const key of this.ownedKeys()) {
        const value = this.get(key);
        if (value !== null) carried.set(key, value);
      }
    } catch {
      // 옮겨 담기 실패가 전환을 막으면 안 된다. 이미 저장된 값을 잃을 뿐이고,
      // 전환을 못 하면 이후 모든 쓰기가 던진다.
    }

    this.store = createMemoryStore();
    this.mode = 'session';
    this.reason =
      error instanceof Error ? `${error.name}: ${error.message}` : '로컬 저장소에 쓸 수 없습니다.';

    for (const [key, value] of carried) this.store.setItem(key, value);
  }
}
