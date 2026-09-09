/**
 * 설정 스토어. 지금은 API 키 하나를 든다.
 *
 * 기준: v2 제품정의 §7, §8 INV-01. 하네스 P4 할 일 2, DoD 2·3.
 *
 * **전체 키를 상태에 담지 않는다.** 스토어 상태는 devtools·오류 보고·스냅샷에
 * 실리기 쉬운 자리다. 여기 있는 것은 `ApiKeyState`의 마스킹된 형태뿐이고,
 * 전체 키가 필요한 곳은 저장소의 `readForAnthropicRequest()`를 직접 부른다.
 */

import { create } from 'zustand';

import {
  InvalidApiKeyError,
  createApiKeyStore,
  type ApiKeyState,
  type ApiKeyStore,
} from '../storage/api-key.store.ts';

export interface SettingsStoreDeps {
  keys: ApiKeyStore;
}

let deps: SettingsStoreDeps | null = null;

/** 테스트와 부트스트랩이 저장소를 주입한다. */
export function configureSettingsStore(next: SettingsStoreDeps | null): void {
  deps = next;
}

function settingsStoreDeps(): SettingsStoreDeps {
  deps ??= { keys: createApiKeyStore() };
  return deps;
}

const ABSENT: ApiKeyState = { present: false, masked: null, mode: 'persistent' };

export interface SettingsStoreState {
  key: ApiKeyState;
  /** 저장 시도가 형식에서 걸린 이유. **입력을 담지 않는다.** (DoD 4) */
  keyError?: string;
  /** 방금 저장했는지. 화면이 알림을 띄운다. */
  justSaved: boolean;

  initSettings: () => void;
  /**
   * 저장에 성공했으면 `true`.
   *
   * 화면이 성공했을 때만 입력칸을 비워야 하는데, 그 판단을 상태 변화를
   * 보고 effect로 하면 렌더가 한 번 더 돈다. 결과를 그대로 돌려준다.
   */
  saveKey: (value: string) => boolean;
  removeKey: () => void;
}

const INITIAL = {
  key: ABSENT,
  keyError: undefined as string | undefined,
  justSaved: false,
};

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  ...INITIAL,

  initSettings() {
    set({ key: settingsStoreDeps().keys.state() });
  },

  saveKey(value) {
    const { keys } = settingsStoreDeps();
    try {
      keys.save(value);
    } catch (error) {
      // 형식 오류만 여기로 온다. 그 메시지는 저장소가 만든 문장이라 입력을
      // 인용하지 않는다. 다른 예외를 문자열로 만들지 않는 것도 같은 이유다.
      set({
        keyError: error instanceof InvalidApiKeyError ? error.message : '키를 저장하지 못했습니다.',
        justSaved: false,
      });
      return false;
    }

    set({ key: keys.state(), keyError: undefined, justSaved: true });
    return true;
  },

  removeKey() {
    const { keys } = settingsStoreDeps();
    keys.remove();
    set({ key: keys.state(), keyError: undefined, justSaved: false });
  },
}));

export function resetSettingsStore(): void {
  useSettingsStore.setState({ ...INITIAL });
}
