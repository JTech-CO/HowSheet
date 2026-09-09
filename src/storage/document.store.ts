/**
 * 작업 문서 저장소.
 *
 * 기준: v2 제품정의 §8 INV-07(손실 없는 입력). 하네스 P1 할 일 4, DoD 1·2.
 *
 * ## 왜 IndexedDB인가
 *
 * 담는 것은 문서 하나뿐이라 LocalStorage로도 될 것 같지만 두 가지가 걸린다.
 * 붙여넣는 자료가 수백 KB일 수 있어 5MB 상한에 가까워지고, LocalStorage 쓰기는
 * **동기**라 자동 저장이 돌 때마다 그 크기만큼 메인 스레드가 멈춘다.
 *
 * ## 왜 Dexie가 아닌가
 *
 * 오브젝트 스토어 하나에 키 하나다. Dexie가 주는 쿼리·마이그레이션·테이블 관계가
 * 전부 필요 없는데 번들에는 다 들어온다. v1은 테이블 셋에 트랜잭션이 필요해서
 * 값을 했지만 v2는 아니다.
 *
 * ## 메모리 폴백
 *
 * 사생활 보호 모드나 저장소가 막힌 환경에서 IndexedDB 열기가 실패한다. 그때
 * **던지지 않고** 메모리로 떨어진다. 저장이 안 된다고 입력까지 막으면 사용자는
 * 작업 자체를 못 한다. 대신 어느 모드인지 노출해 화면이 알릴 수 있게 한다.
 */

import { migrateStudioDocument } from '../domain/studio.defaults.ts';
import type { StudioDocument } from '../domain/studio.types.ts';

export const DATABASE_NAME = 'howsheet';
export const DATABASE_VERSION = 1;
export const STORE_NAME = 'document';
/** 문서가 하나뿐이므로 키도 하나로 고정한다. */
export const DOCUMENT_KEY = 'current';

/** IndexedDB `open()`이 끝내 정착하지 않을 때 폴백으로 넘어가는 시간. */
export const OPEN_TIMEOUT_MS = 5_000;

export type StorageMode = 'indexeddb' | 'memory';

export interface DocumentStoreState {
  mode: StorageMode;
  /** 메모리로 떨어진 이유. IndexedDB 모드에서는 undefined. */
  unavailableReason?: string;
}

export interface DocumentStore {
  state(): DocumentStoreState;
  load(): Promise<StudioDocument | null>;
  save(document: StudioDocument): Promise<void>;
  clear(): Promise<void>;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 약속을 지키지 못하는 환경을 위한 대역. 값은 탭이 살아 있는 동안만 남는다. */
export function createMemoryStore(reason: string): DocumentStore {
  let held: StudioDocument | null = null;
  return {
    state: () => ({ mode: 'memory', unavailableReason: reason }),
    load: async () => held,
    save: async (document) => {
      held = document;
    },
    clear: async () => {
      held = null;
    },
  };
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB를 열지 못했습니다.'));
    // 사생활 보호 모드에서는 열기가 성공도 실패도 하지 않고 멈춘다.
    request.onblocked = () => reject(new Error('다른 탭이 저장소를 잡고 있습니다.'));
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`저장소 열기가 ${ms}ms 안에 끝나지 않았습니다.`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('저장소 요청이 실패했습니다.'));
  });
}

export interface OpenDocumentStoreOptions {
  name?: string;
}

/**
 * 저장소를 연다. 실패하면 메모리 대역을 돌려주고 이유를 담는다.
 *
 * 이 함수는 **던지지 않는다.** 호출자가 `state().mode`로 어느 쪽인지 본다.
 */
export async function openDocumentStore(
  options: OpenDocumentStoreOptions = {},
): Promise<DocumentStore> {
  const name = options.name ?? DATABASE_NAME;

  if (typeof indexedDB === 'undefined') {
    return createMemoryStore('이 브라우저에서 IndexedDB를 쓸 수 없습니다.');
  }

  let database: IDBDatabase;
  try {
    database = await withTimeout(openDatabase(name), OPEN_TIMEOUT_MS);
  } catch (error) {
    return createMemoryStore(describe(error));
  }

  // 열기에는 성공했지만 읽기·쓰기가 막히는 환경이 있다. 첫 실패에서 메모리로
  // 넘어가고, 그 뒤로는 그 상태를 유지한다. 매번 다시 시도하면 자동 저장이
  // 돌 때마다 예외를 만든다.
  let fallback: DocumentStore | null = null;

  const degrade = (error: unknown): DocumentStore => {
    fallback ??= createMemoryStore(describe(error));
    return fallback;
  };

  const transact = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const transaction = database.transaction(STORE_NAME, mode);
    return runRequest(run(transaction.objectStore(STORE_NAME)));
  };

  return {
    state: () => fallback?.state() ?? { mode: 'indexeddb' },

    async load() {
      if (fallback !== null) return fallback.load();
      try {
        const raw = await transact('readonly', (store) => store.get(DOCUMENT_KEY));
        // 옛 형식은 올려서 살린다. 모양 검사만 하면 앱을 업데이트한 사용자가
        // 붙여넣어 둔 자료를 통째로 잃는다. 올릴 수 없는 값만 없는 것으로 다룬다.
        return migrateStudioDocument(raw);
      } catch (error) {
        return degrade(error).load();
      }
    },

    async save(document) {
      if (fallback !== null) return fallback.save(document);
      try {
        await transact('readwrite', (store) => store.put(document, DOCUMENT_KEY));
      } catch (error) {
        // 메모리로 떨어지되 값은 지킨다. 여기서 던지면 입력 중인 자료를 잃는다.
        await degrade(error).save(document);
      }
    },

    async clear() {
      if (fallback !== null) return fallback.clear();
      try {
        await transact('readwrite', (store) => store.delete(DOCUMENT_KEY));
      } catch (error) {
        await degrade(error).clear();
      }
    },
  };
}
