/**
 * Anthropic API 키 저장소.
 *
 * 기준: v2 제품정의 §7(키 취급 7개 규칙), §8 INV-01. 하네스 P4 할 일 1, DoD 1~5.
 *
 * ## 이 파일이 유일하다
 *
 * **프로젝트에서 키를 만지는 모듈은 여기 하나다.** 저장 키 문자열이 다른
 * 파일에 나타나면 `verify:architecture`의 `API_KEY_BOUNDARY`가 잡는다.
 * 규칙이 강제하는 것은 "다른 경로가 생기지 않는다"이고, 그래야 마스킹·삭제·
 * 로그 금지 같은 규칙이 실제로 지켜지는 지점이 하나로 남는다. (DoD 5)
 *
 * ## 왜 브라우저에 두는가
 *
 * Anthropic 문서가 브라우저 키 사용을 **명시적으로 위험하다고** 경고하면서도
 * "신뢰된 사용자만 쓰는 내부 도구"를 예외로 인정한다. HowSheet는 사용자가 자기
 * 기기에서 자기 키로 자기 작업을 하는 도구라 그 예외에 해당한다. 백엔드를 두면
 * 호스팅·요금·인증이 생기고, 붙여넣은 자료가 남의 서버를 거치게 된다.
 *
 * 공짜로 얻는 안전이 아니므로 §7의 일곱 규칙을 못박는다.
 *
 * ## 밖으로 나가는 것과 나가지 않는 것
 *
 * - `state()`는 **마스킹된 형태만** 준다. 전체 키가 담기지 않는다. (DoD 2)
 * - 전체 키를 얻는 길은 `readForAnthropicRequest()` 하나뿐이고, 이름이 곧
 *   허용된 용도다. `api.anthropic.com` 요청에 싣는 것 말고는 쓰지 않는다. (INV-01)
 * - 오류는 입력을 **되풀이하지 않는다.** 잘못 붙여넣은 값이 그대로 오류 메시지에
 *   실리면 그것이 화면과 콘솔에 남는다. (DoD 4)
 */

import {
  createMemoryKeyValueStore,
  detectBrowserStore,
  type KeyValueStore,
} from './browser-store.ts';

/**
 * 저장 키.
 *
 * `PreferenceStore`의 허용 목록에 **넣지 않는다.** 넣는 순간 화면 설정 경로로
 * 키를 읽고 쓸 수 있게 되고, 이 파일의 규칙이 우회된다. (하네스 P4 주의)
 */
export const API_KEY_STORAGE_KEY = 'howsheet:apiKey';

/** Anthropic 키의 접두사. */
export const API_KEY_PREFIX = 'sk-ant-';

/**
 * 최소 길이.
 *
 * 실제 키는 100자가 넘지만 형식이 바뀔 수 있으므로 넉넉히 아래로 잡는다.
 * 여기서 거르려는 것은 "붙여넣다 만 값"이지 정확한 형식이 아니다.
 */
export const API_KEY_MIN_LENGTH = 20;

export type ApiKeyMode = 'persistent' | 'memory';

export interface ApiKeyState {
  present: boolean;
  /** `sk-ant-...4자리`. 키가 없으면 null. **전체 키를 담지 않는다.** (§7-5) */
  masked: string | null;
  mode: ApiKeyMode;
  /** 메모리로 떨어진 이유. persistent에서는 undefined. */
  unavailableReason?: string;
}

/** 형식 검사 결과. 실패 이유에 입력을 싣지 않는다. (DoD 4) */
export type ApiKeyCheck = { ok: true; key: string } | { ok: false; reason: string };

export class InvalidApiKeyError extends Error {
  constructor(reason: string) {
    // reason은 이 파일이 만든 문장이다. 사용자가 넣은 값은 들어오지 않는다.
    super(reason);
    this.name = 'InvalidApiKeyError';
  }
}

/**
 * 화면에 보여 줄 형태.
 *
 * 앞의 접두사와 **뒤 네 자리**만 남긴다. 사용자가 "어느 키인지" 알아보는 데는
 * 그만큼이면 충분하고, 어깨너머로 보이거나 스크린샷에 남아도 복원할 수 없다.
 */
export function maskApiKey(key: string): string {
  const tail = key.length >= API_KEY_MIN_LENGTH ? key.slice(-4) : '';
  return `${API_KEY_PREFIX}...${tail}`;
}

/**
 * 붙여넣은 값이 키의 모양인지 본다.
 *
 * 통과시키지 못한 이유를 문장으로 돌려주되 **입력을 인용하지 않는다.**
 */
export function checkApiKey(value: string): ApiKeyCheck {
  const key = value.trim();

  if (key === '') return { ok: false, reason: '키를 입력하세요.' };

  if (!key.startsWith(API_KEY_PREFIX)) {
    return {
      ok: false,
      reason: `Anthropic 키는 ${API_KEY_PREFIX}로 시작합니다. 붙여넣은 값은 그렇지 않습니다.`,
    };
  }

  if (key.length < API_KEY_MIN_LENGTH) {
    return {
      ok: false,
      reason: `키가 너무 짧습니다. ${API_KEY_MIN_LENGTH}자 이상이어야 합니다. 일부만 붙여넣지 않았는지 확인하세요.`,
    };
  }

  if (/\s/u.test(key)) {
    return {
      ok: false,
      reason: '키 가운데에 공백이나 줄바꿈이 있습니다. 줄이 잘려 붙여넣어졌을 수 있습니다.',
    };
  }

  return { ok: true, key };
}

export interface ApiKeyStore {
  state(): ApiKeyState;
  /**
   * 전체 키. **`api.anthropic.com` 요청에 싣는 용도로만 부른다.** (INV-01)
   *
   * 화면 상태, 로그, 오류 보고, 분석 어디에도 이 값을 넣지 않는다. 이름이 길고
   * 구체적인 것은 의도한 것이다 - 호출부가 무엇을 하는 중인지 드러난다.
   */
  readForAnthropicRequest(): string | null;
  /** 형식이 아니면 `InvalidApiKeyError`를 던진다. */
  save(value: string): void;
  remove(): void;
}

export interface CreateApiKeyStoreOptions {
  /** 주입하면 이것을 쓴다. 없으면 브라우저 localStorage를 찾는다. */
  store?: KeyValueStore | null;
}

/**
 * 키 저장소를 만든다.
 *
 * localStorage를 쓸 수 없으면 메모리로 떨어진다. 그때 키는 이 탭에서만 살아
 * 있으므로 화면이 그 사실을 알려야 한다. 저장하지 못한다고 입력을 막지 않는다.
 */
let sharedStore: ApiKeyStore | null = null;

/**
 * 앱이 쓰는 **하나뿐인** 키 저장소.
 *
 * 설정 화면과 합성 경로가 각자 `createApiKeyStore()`를 부르면 인스턴스가 둘이
 * 된다. 평소에는 둘 다 같은 localStorage를 읽어 티가 나지 않지만, 저장소를 쓸 수
 * 없는 환경에서는 각자 다른 메모리를 들고 화면과 실제 전송이 어긋난다. 저장에
 * 실패해 메모리로 내려간 뒤 "키 삭제"를 누르면 화면은 "없음"인데 다른 인스턴스는
 * 남은 키로 계속 요청을 보낸다. (출시 점검 2026-09-16)
 *
 * 테스트는 대역을 주입하므로 이 함수를 거치지 않는다.
 */
export function sharedApiKeyStore(): ApiKeyStore {
  sharedStore ??= createApiKeyStore();
  return sharedStore;
}

export function createApiKeyStore(options: CreateApiKeyStoreOptions = {}): ApiKeyStore {
  const provided = options.store === undefined ? detectBrowserStore() : options.store;

  let store: KeyValueStore;
  let mode: ApiKeyMode;
  let reason: string | undefined;

  if (provided === null) {
    store = createMemoryKeyValueStore();
    mode = 'memory';
    reason = '이 브라우저에서 로컬 저장소를 쓸 수 없어 키가 이 탭에만 남습니다.';
  } else {
    store = provided;
    mode = 'persistent';
    reason = undefined;
  }

  // 이유에 예외 메시지를 붙이지 않는다. 저장소 구현에 따라 그 안에 값이 실린다.
  const degrade = (why: string): void => {
    store = createMemoryKeyValueStore();
    mode = 'memory';
    reason = why;
  };

  const readRaw = (): string | null => {
    try {
      const value = store.getItem(API_KEY_STORAGE_KEY);
      return value === null || value === '' ? null : value;
    } catch {
      // 읽지 못하면 없는 것으로 다룬다. 여기서 던지면 화면이 뜨지 않는다.
      return null;
    }
  };

  return {
    state() {
      const key = readRaw();
      return {
        present: key !== null,
        masked: key === null ? null : maskApiKey(key),
        mode,
        ...(reason === undefined ? {} : { unavailableReason: reason }),
      };
    },

    readForAnthropicRequest: readRaw,

    save(value) {
      const checked = checkApiKey(value);
      if (!checked.ok) throw new InvalidApiKeyError(checked.reason);

      try {
        store.setItem(API_KEY_STORAGE_KEY, checked.key);
      } catch {
        degrade('로컬 저장소에 쓰지 못해 키가 이 탭에만 남습니다. 새로고침하면 사라집니다.');
        try {
          store.setItem(API_KEY_STORAGE_KEY, checked.key);
        } catch {
          // 메모리 대역은 던지지 않는다. 여기 오면 키 하나를 잃을 뿐이고,
          // 그 사실은 `state().present`가 false로 드러낸다.
        }
      }
    },

    remove() {
      try {
        store.removeItem(API_KEY_STORAGE_KEY);
      } catch {
        // 지우지 못했으면 아직 남아 있는 것이다. 조용히 지나가지 않는다. 대역으로
        // 갈아 끼워 이 탭에서 더는 읽히지 않게 하고, 남아 있을 수 있다고 알린다.
        degrade(
          '로컬 저장소에서 키를 지우지 못했습니다. 이 탭에서는 더 이상 쓰이지 않지만, ' +
            '브라우저에 남아 있을 수 있으니 사이트 데이터를 지우고 키를 폐기하세요.',
        );
      }
    },
  };
}
