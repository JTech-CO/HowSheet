/**
 * 저장소 백엔드.
 *
 * 기준: 기술 백서 §2.1.1(저장소 역할), §4.5(저장소 설계), §4.6(오류 처리),
 * §7.5(브라우저 이슈).
 *
 * IndexedDB를 열 수 없는 환경(Safari 개인 정보 보호 모드, `file://`, 용량 차단)
 * 에서도 앱이 죽지 않아야 하므로 백엔드를 인터페이스로 두고 Dexie 구현과
 * 메모리 구현을 함께 제공한다. (M3 DoD 5·6)
 *
 * 두 구현은 **관찰 가능한 동작이 같아야 한다.** 롤백·복제·중첩·close 의미가
 * 갈리면 DoD 3(무결성)은 IndexedDB에서만 성립하고, 정작 폴백 모드에서 깨진다.
 * 아래 주석에서 "Dexie와 같다"고 적은 곳은 모두 테스트로 묶여 있다.
 *
 * 이 파일 밖에서 Dexie나 `indexedDB`를 직접 만지지 않는다. (File_Structure.md §3.2-5)
 */

import Dexie, { type Table } from 'dexie';

import type { GuideDocument } from '../domain/guide.types.ts';

/** `guides` 테이블은 자산 본문을 제외한 GuideDocument를 그대로 담는다. (§4.5.1) */
export type StoredGuide = GuideDocument;

/**
 * `assets` 테이블. 이미지 본문은 여기에만 있고 문서에는 manifest만 남는다.
 *
 * 본문을 `Blob`이 아니라 `ArrayBuffer`로 저장한다. 기술 백서 §4.5.1이 말하는
 * "Blob, MIME, 크기, 체크섬"을 그대로 담되 표현만 바꾼 것이다. 이유는 둘이다.
 *
 *   - Safari에는 IndexedDB에 저장한 Blob이 되살아나지 않는 알려진 문제가 있다.
 *     ArrayBuffer는 어느 구현에서나 구조화 복제가 보장된다.
 *   - jsdom + fake-indexeddb에서 Blob은 **빈 객체로 복제된다.** 즉 Blob으로
 *     두면 이미지 바이트 왕복(M3 DoD 1)을 테스트로 확인할 방법이 없다.
 *
 * 호출자는 `AssetRepository.toBlob()`으로 동기 변환해 쓴다. Blob 재구성이
 * 동기라서 트랜잭션 안에서 `await`가 필요 없다는 점도 중요하다.
 */
export interface StoredAsset {
  id: string;
  guideId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  width?: number;
  height?: number;
  createdAt: string;
  bytes: ArrayBuffer;
}

export type RecoveryReason = 'import' | 'bulk-edit' | 'migration' | 'manual';

/**
 * 되돌릴 수 있는 마지막 성공 스냅샷. 가져오기와 대량 변경 앞에서 만든다.
 *
 * 자산 본문은 담지 않는다. 자산 본문의 보호는 스냅샷이 아니라 **트랜잭션**이
 * 맡는다(`RecoveryRepository.withSnapshot`이 작업 전체를 트랜잭션으로 감싼다).
 * `assetIds`는 복원 시점에 없어진 자산을 알아내 재연결을 안내하는 용도다.
 * (§4.5.1)
 *
 * `existed: false`는 "스냅샷 시점에 이 가이드가 없었다"는 뜻이다. 새 가이드를
 * 만드는 가져오기가 실패했을 때 부분 결과를 지워야 하므로, 없음도 상태로
 * 기록한다. (INV-08)
 */
export interface RecoverySnapshot {
  guideId: string;
  createdAt: string;
  reason: RecoveryReason;
  /** `existed`가 false면 undefined. */
  document?: GuideDocument;
  existed: boolean;
  assetIds: string[];
}

export type StorageMode = 'indexeddb' | 'memory';

/** 백엔드가 제공해야 하는 최소 컬렉션 연산. */
export interface StorageCollection<T> {
  get(key: string): Promise<T | undefined>;
  put(value: T): Promise<void>;
  delete(key: string): Promise<void>;
  toArray(): Promise<T[]>;
  /** 인덱스 동등 조회. 인덱스가 없는 필드는 지원하지 않는다. */
  where(index: string, value: string): Promise<T[]>;
  clear(): Promise<void>;
}

/**
 * 트랜잭션 안에서만 쓰는 컬렉션 묶음.
 *
 * `backend.guides`가 아니라 여기의 `tx.guides`를 써야 한다.
 *
 * IndexedDB 트랜잭션은 이벤트 루프가 대기 중인 요청 없이 한 바퀴 돌면 스스로
 * 커밋한다. 콜백이 `file.arrayBuffer()`나 `crypto.subtle.digest()`처럼 저장소
 * 밖의 Promise를 그냥 await하면 실제 브라우저에서는 그 사이에 커밋이 일어나고,
 * Dexie는 뒤늦게 `PrematureCommitError`로 거부한다. 즉 **작업이 실패로 끝나는데
 * 앞부분은 이미 커밋돼 있다.** 그래서 두 가지를 둔다.
 *
 *   - `waitFor` - 트랜잭션을 살려 둔 채 기다리는 정식 경로.
 *   - 스코프 이탈 확인 - 트랜잭션이 끝난 뒤 이 스코프를 쓰면
 *     `TransactionEscapedError`로 즉시 실패시킨다. 롤백되지 않을 쓰기를 조용히
 *     통과시키지 않는다.
 *
 * 그래도 남을 수 있는 부분 커밋은 `RecoveryRepository.withSnapshot`의 두 번째
 * 겹이 치운다. (INV-08)
 *
 * fake-indexeddb는 유휴 시 자동 커밋을 실제 브라우저만큼 엄격히 흉내 내지
 * 않아서, 이 실패 모드 자체는 통합 테스트로 재현되지 않는다. 재현 가능한 것은
 * 이탈 확인과 `waitFor` 경로이고, 둘 다 테스트로 묶여 있다.
 */
export interface StorageTransactionScope {
  readonly guides: StorageCollection<StoredGuide>;
  readonly assets: StorageCollection<StoredAsset>;
  readonly recovery: StorageCollection<RecoverySnapshot>;
  /**
   * 트랜잭션 안에서 저장소 밖의 Promise를 기다린다.
   * `file.arrayBuffer()`, `crypto.subtle.digest()`처럼 IndexedDB와 무관한
   * 작업은 반드시 이것을 거쳐야 트랜잭션이 살아 있는 채로 이어진다.
   */
  waitFor<T>(promise: PromiseLike<T> | T): Promise<T>;
}

export interface StorageBackend {
  readonly mode: StorageMode;
  /** 메모리 모드로 떨어진 이유. IndexedDB 모드에서는 undefined. */
  readonly unavailableReason?: string;
  readonly guides: StorageCollection<StoredGuide>;
  readonly assets: StorageCollection<StoredAsset>;
  readonly recovery: StorageCollection<RecoverySnapshot>;
  /**
   * 세 테이블에 걸친 읽기·쓰기 트랜잭션. 예외가 나면 전부 되돌린다.
   * 콜백 안에서는 인자로 받은 스코프의 컬렉션만 쓴다.
   */
  transaction<T>(run: (tx: StorageTransactionScope) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const DATABASE_NAME = 'howsheet-db';
export const DATABASE_VERSION = 1;

/** §4.5.1 스키마. 인덱스를 바꾸면 버전을 올리고 마이그레이션을 붙인다. */
export const DATABASE_STORES = {
  guides: 'id, updatedAt, meta.title',
  assets: 'id, guideId, checksum',
  recovery: 'guideId, createdAt',
} as const;

/** IndexedDB `open()`이 끝내 정착하지 않을 때 폴백으로 넘어가는 시간. */
export const OPEN_TIMEOUT_MS = 5_000;

/**
 * 트랜잭션이 이미 끝난 뒤에 그 스코프로 저장소를 만졌다.
 * 거의 항상 콜백 안에서 `tx.waitFor()` 없이 외부 Promise를 await한 경우다.
 */
export class TransactionEscapedError extends Error {
  constructor(readonly operation: string) {
    super(
      `트랜잭션이 이미 끝난 뒤에 ${operation}이(가) 실행됐습니다. ` +
        '트랜잭션 콜백 안에서 저장소 밖의 Promise를 기다릴 때는 tx.waitFor()를 쓰세요. ' +
        '(기술 백서 §4.6, INV-08)',
    );
    this.name = 'TransactionEscapedError';
  }
}

/** 닫힌 백엔드를 다시 썼다. Dexie의 DatabaseClosedError와 같은 자리다. */
export class StorageClosedError extends Error {
  constructor(readonly operation: string) {
    super(`저장소가 닫혀 있습니다: ${operation}`);
    this.name = 'StorageClosedError';
  }
}

// ────────────────────────────────────────────────────── 값 복사

/**
 * 저장 경계에서 값을 복사한다.
 *
 * IndexedDB는 구조화 복제를 하므로 넣은 객체와 꺼낸 객체는 서로 다른 참조다.
 * 메모리 백엔드도 같아야 한다. 같은 참조를 돌려주면 호출자의 제자리 수정이
 * 트랜잭션 스냅샷을 그대로 통과해 롤백을 무력화한다. (M3 DoD 3, INV-08)
 *
 * `structuredClone`을 쓰지 않는다. jsdom의 구현이 `Blob`을 복제하지 못해
 * 통합 테스트에서 자산 저장이 통째로 던진다. `Blob`은 불변이므로 참조를 그대로
 * 넘겨도 관찰 가능한 차이가 없다.
 */
export function cloneStored<T>(value: T): T {
  return cloneUnknown(value) as T;
}

function cloneUnknown(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;

  // Blob·File은 불변이다. 바이트를 다시 복사할 이유가 없다.
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) {
    const view = value as Uint8Array;
    return new (view.constructor as Uint8ArrayConstructor)(
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
    );
  }
  if (Array.isArray(value)) return value.map(cloneUnknown);
  if (value instanceof Map) {
    return new Map([...value].map(([k, v]) => [cloneUnknown(k), cloneUnknown(v)]));
  }
  if (value instanceof Set) return new Set([...value].map(cloneUnknown));

  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) copy[key] = cloneUnknown(item);
  return copy;
}

// ────────────────────────────────────────────────────── Dexie 구현

export class HowSheetDatabase extends Dexie {
  guides!: Table<StoredGuide, string>;
  assets!: Table<StoredAsset, string>;
  recovery!: Table<RecoverySnapshot, string>;

  constructor(name: string = DATABASE_NAME) {
    super(name);
    this.version(DATABASE_VERSION).stores(DATABASE_STORES);
  }
}

/** 연산 직전에 부르는 확인. 트랜잭션 스코프가 아직 유효한지 본다. */
type Guard = (operation: string) => void;

const NO_GUARD: Guard = () => {};

// 모두 async다. 확인 실패를 동기 throw가 아니라 거부된 Promise로 돌려줘야
// 호출부가 `.catch`만으로 일관되게 다룰 수 있다.
function dexieCollection<T>(
  table: Table<T, string>,
  guard: Guard = NO_GUARD,
): StorageCollection<T> {
  return {
    get: async (key) => {
      guard('get');
      return table.get(key);
    },
    put: async (value) => {
      guard('put');
      await table.put(value);
    },
    delete: async (key) => {
      guard('delete');
      await table.delete(key);
    },
    toArray: async () => {
      guard('toArray');
      return table.toArray();
    },
    where: async (index, value) => {
      guard('where');
      return table.where(index).equals(value).toArray();
    },
    clear: async () => {
      guard('clear');
      await table.clear();
    },
  };
}

// ────────────────────────────────────────────────────── 메모리 구현

/** `meta.title` 같은 점 표기 인덱스를 읽는다. Dexie의 중첩 인덱스와 같은 동작이다. */
function readIndex(value: unknown, index: string): string | undefined {
  let cursor: unknown = value;
  for (const part of index.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor === undefined ? undefined : String(cursor);
}

function memoryCollection<T>(
  store: Map<string, T>,
  keyOf: (value: T) => string,
  guard: Guard,
): StorageCollection<T> {
  return {
    get: async (key) => {
      guard('get');
      const found = store.get(key);
      return found === undefined ? undefined : cloneStored(found);
    },
    put: async (value) => {
      guard('put');
      store.set(keyOf(value), cloneStored(value));
    },
    delete: async (key) => {
      guard('delete');
      store.delete(key);
    },
    toArray: async () => {
      guard('toArray');
      return [...store.values()].map((item) => cloneStored(item));
    },
    where: async (index, value) => {
      guard('where');
      return [...store.values()]
        .filter((item) => readIndex(item, index) === value)
        .map((item) => cloneStored(item));
    },
    clear: async () => {
      guard('clear');
      store.clear();
    },
  };
}

/**
 * IndexedDB를 열 수 없을 때 쓰는 백엔드.
 *
 * 새로고침하면 사라진다. 호출자는 `mode`를 보고 "페이지를 닫으면 내용이
 * 사라질 수 있음"을 안내하고 JSON 백업 경로를 열어 두어야 한다. (M3 DoD 6)
 */
export function createMemoryBackend(reason: string): StorageBackend {
  const guides = new Map<string, StoredGuide>();
  const assets = new Map<string, StoredAsset>();
  const recovery = new Map<string, RecoverySnapshot>();

  let closed = false;
  let depth = 0;
  /** 중첩 트랜잭션이 실패하면 바깥도 커밋하지 못하게 막는 표식. */
  const poison: { hit: boolean; error: unknown } = { hit: false, error: undefined };

  const guard: Guard = (operation) => {
    if (closed) throw new StorageClosedError(operation);
  };

  const scope: StorageTransactionScope = {
    guides: memoryCollection(guides, (guide) => guide.id, guard),
    assets: memoryCollection(assets, (asset) => asset.id, guard),
    recovery: memoryCollection(recovery, (snapshot) => snapshot.guideId, guard),
    waitFor: async (promise) => promise,
  };

  return {
    mode: 'memory',
    unavailableReason: reason,
    guides: scope.guides,
    assets: scope.assets,
    recovery: scope.recovery,

    async transaction<T>(run: (tx: StorageTransactionScope) => Promise<T>): Promise<T> {
      guard('transaction');

      // 중첩은 부모에 합류한다. 부모가 스냅샷을 쥐고 있으므로 여기서 또 잡지
      // 않는다. 다만 안쪽 실패는 부모를 오염시킨다 - 바깥에서 예외를 삼켜도
      // 커밋되지 않는다. Dexie가 하위 트랜잭션 실패 시 부모를 abort하는 것과
      // 같은 의미다.
      if (depth > 0) {
        depth += 1;
        try {
          return await run(scope);
        } catch (error) {
          poison.hit = true;
          poison.error = error;
          throw error;
        } finally {
          depth -= 1;
        }
      }

      const snapshot = {
        guides: new Map(guides),
        assets: new Map(assets),
        recovery: new Map(recovery),
      };

      depth = 1;
      poison.hit = false;
      poison.error = undefined;
      try {
        const result = await run(scope);
        if (poison.hit) throw poison.error;
        return result;
      } catch (error) {
        // 값은 put·get에서 이미 복제되므로 키 맵만 되돌리면 충분하다.
        guides.clear();
        assets.clear();
        recovery.clear();
        for (const [key, value] of snapshot.guides) guides.set(key, value);
        for (const [key, value] of snapshot.assets) assets.set(key, value);
        for (const [key, value] of snapshot.recovery) recovery.set(key, value);
        throw error;
      } finally {
        depth = 0;
        poison.hit = false;
        poison.error = undefined;
      }
    },

    /**
     * 연결을 닫는다. **내용은 지우지 않는다.**
     *
     * Dexie의 `close()`가 데이터를 지우지 않으므로 여기서도 지우지 않는다.
     * 예전에는 "새로고침 시 유실"을 흉내 내려고 비웠는데, 방어적으로 close를
     * 부르는 호출자가 그대로 데이터를 날리는 경로가 된다. 메모리 모드의 유실은
     * 페이지가 사라질 때 자연히 일어난다.
     */
    async close() {
      closed = true;
    },
  };
}

// ────────────────────────────────────────────────────── 열기

export interface OpenStorageOptions {
  /** 테스트가 격리된 DB 이름을 쓸 수 있게 한다. (M3 DoD 8) */
  name?: string;
  /** 주입하면 이 함수로 DB를 만든다. 실패 경로 테스트에 쓴다. */
  createDatabase?: (name: string) => HowSheetDatabase;
  /** `open()`을 포기하고 메모리로 떨어지는 시간. 0 이하면 기다리지 않는다. */
  timeoutMs?: number;
}

export function createDexieBackend(db: HowSheetDatabase): StorageBackend {
  return {
    mode: 'indexeddb',
    guides: dexieCollection(db.guides),
    assets: dexieCollection(db.assets),
    recovery: dexieCollection(db.recovery),

    transaction<T>(run: (tx: StorageTransactionScope) => Promise<T>): Promise<T> {
      return db.transaction('rw', db.guides, db.assets, db.recovery, async () => {
        const own = Dexie.currentTransaction;
        // 조기 커밋을 조용히 넘기지 않는다. 콜백이 저장소 밖 Promise를 await하면
        // Dexie 존을 벗어나 `currentTransaction`이 달라진다. 그 상태의 쓰기는
        // 롤백되지 않으므로, 데이터가 깨지기 전에 여기서 던진다.
        const guard: Guard = (operation) => {
          if (Dexie.currentTransaction !== own) throw new TransactionEscapedError(operation);
        };

        const scope: StorageTransactionScope = {
          guides: dexieCollection(db.guides, guard),
          assets: dexieCollection(db.assets, guard),
          recovery: dexieCollection(db.recovery, guard),
          waitFor: (promise) => Dexie.waitFor(promise),
        };

        return run(scope);
      });
    },

    close: async () => {
      db.close();
    },
  };
}

/**
 * 저장소를 연다. IndexedDB 초기화가 실패해도 예외를 던지지 않고 메모리
 * 모드로 떨어진다. 호출자가 crash 없이 계속 진행할 수 있어야 한다. (M3 DoD 5)
 *
 * 마이그레이션 실패를 삼키고 빈 DB를 새로 만들지 않는다. 실패는 메모리 모드와
 * 그 이유로 드러나고, 기존 IndexedDB 데이터는 건드리지 않는다. (M3 주의)
 *
 * `open()`이 아예 정착하지 않는 경우(다른 탭이 버전 변경을 막고 있는 상태 등)
 * 가 있어 시간 제한을 둔다. 무한정 기다리면 앱이 뜨지 않는다. (기술 §7.5)
 */
export async function openStorage(options: OpenStorageOptions = {}): Promise<StorageBackend> {
  const name = options.name ?? DATABASE_NAME;
  const create = options.createDatabase ?? ((dbName: string) => new HowSheetDatabase(dbName));
  const timeoutMs = options.timeoutMs ?? OPEN_TIMEOUT_MS;

  let db: HowSheetDatabase | undefined;
  try {
    db = create(name);
    await withTimeout(db.open(), timeoutMs);
  } catch (error) {
    // 열다 만 연결을 붙잡고 있지 않는다. 다른 탭의 버전 변경을 막는다.
    try {
      db?.close();
    } catch {
      // 닫기 실패는 폴백을 막지 않는다.
    }
    return createMemoryBackend(describeFailure(error));
  }

  return createDexieBackend(db);
}

class StorageOpenTimeoutError extends Error {
  constructor(ms: number) {
    super(`IndexedDB를 ${ms}ms 안에 열지 못했습니다.`);
    this.name = 'StorageOpenTimeoutError';
  }
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  if (ms <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new StorageOpenTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
