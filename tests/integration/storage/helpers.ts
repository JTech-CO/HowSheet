/**
 * 저장소 통합 테스트 도우미.
 *
 * 전역 `indexedDB`는 `tests/setup/fake-indexeddb.ts`가 setupFiles로 먼저
 * 채운다. 여기서 import하면 Dexie가 이미 평가된 뒤라 늦는다.
 * 테스트마다 DB 이름을 다르게 주어 실행 순서에 의존하지 않게 한다. (M3 DoD 8)
 */

import { createGuideDocument } from '@/domain/guide.defaults.ts';
import type { GuideDocument } from '@/domain/guide.types.ts';
import { AssetRepository } from '@/storage/asset.repository.ts';
import {
  createMemoryBackend,
  openStorage,
  type StorageBackend,
  type StorageCollection,
  type StorageTransactionScope,
  type StoredAsset,
} from '@/storage/db.ts';
import { GuideRepository } from '@/storage/guide.repository.ts';
import { RecoveryRepository } from '@/storage/recovery.repository.ts';

let dbCounter = 0;

export const FIXED_NOW = '2026-08-31T00:00:00.000Z';

export interface TestContext {
  backend: StorageBackend;
  guides: GuideRepository;
  assets: AssetRepository;
  recovery: RecoveryRepository;
  /** 각 컬렉션의 put 호출 횟수. Blob 재기록 여부를 확인할 때 쓴다. */
  writes: { guides: number; assets: number; recovery: number };
  close: () => Promise<void>;
}

/** put 호출을 세는 얇은 래퍼. 동작은 그대로 위임한다. */
function countingCollection<T>(
  inner: StorageCollection<T>,
  onPut: () => void,
): StorageCollection<T> {
  return {
    get: (key) => inner.get(key),
    put: async (value) => {
      onPut();
      await inner.put(value);
    },
    delete: (key) => inner.delete(key),
    toArray: () => inner.toArray(),
    where: (index, value) => inner.where(index, value),
    clear: () => inner.clear(),
  };
}

export interface CreateContextOptions {
  /** 메모리 백엔드로 강제한다. 폴백 경로를 같은 테스트로 돌릴 때 쓴다. */
  backend?: StorageBackend;
}

/**
 * 두 백엔드를 같은 단언으로 돌리기 위한 표.
 *
 * DoD 3(무결성)이 IndexedDB에서만 성립하면 정작 폴백 모드에서 데이터가 깨진다.
 * 무결성에 관한 테스트는 이 표로 두 번 돌린다. (M3 DoD 5·6)
 */
export const BACKENDS: ReadonlyArray<{
  name: string;
  make: () => Promise<StorageBackend> | StorageBackend | undefined;
}> = [
  { name: 'indexeddb', make: () => undefined },
  { name: 'memory', make: () => createMemoryBackend('테스트 강제 폴백') },
];

export async function createContext(options: CreateContextOptions = {}): Promise<TestContext> {
  dbCounter += 1;
  let base: StorageBackend;
  if (options.backend === undefined) {
    base = await openStorage({ name: `howsheet-test-${dbCounter}-${Date.now()}` });
    // openStorage는 실패를 삼키고 메모리로 떨어진다. 그게 제품에서는 옳지만
    // 테스트에서는 IndexedDB 경로가 조용히 사라진 채 통과하게 만든다.
    // 여기서 시끄럽게 실패시킨다. (M3 DoD 8)
    if (base.mode !== 'indexeddb') {
      throw new Error(
        `테스트가 IndexedDB를 열지 못했습니다: ${base.unavailableReason ?? '이유 없음'}`,
      );
    }
  } else {
    base = options.backend;
  }

  const writes = { guides: 0, assets: 0, recovery: 0 };
  const backend: StorageBackend = {
    mode: base.mode,
    ...(base.unavailableReason === undefined ? {} : { unavailableReason: base.unavailableReason }),
    guides: countingCollection(base.guides, () => (writes.guides += 1)),
    assets: countingCollection(base.assets, () => (writes.assets += 1)),
    recovery: countingCollection(base.recovery, () => (writes.recovery += 1)),
    // 트랜잭션 스코프도 함께 센다. 저장소 연산이 스코프로 옮겨 간 뒤에도
    // "문서 저장이 Blob을 다시 쓰지 않는다"를 실제로 관찰할 수 있어야 한다.
    transaction: (run) =>
      base.transaction((tx: StorageTransactionScope) =>
        run({
          guides: countingCollection(tx.guides, () => (writes.guides += 1)),
          assets: countingCollection(tx.assets, () => (writes.assets += 1)),
          recovery: countingCollection(tx.recovery, () => (writes.recovery += 1)),
          waitFor: (promise) => tx.waitFor(promise),
        }),
      ),
    close: () => base.close(),
  };

  return {
    backend,
    guides: new GuideRepository(backend),
    assets: new AssetRepository(backend),
    recovery: new RecoveryRepository(backend),
    writes,
    close: () => base.close(),
  };
}

let idCounter = 0;

/** 결정론적 ID. 테스트가 시각이나 난수에 의존하지 않게 한다. */
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function makeGuide(overrides: Partial<GuideDocument> = {}): GuideDocument {
  const base = createGuideDocument({
    id: nextId('guide'),
    now: FIXED_NOW,
    newId: nextId,
    title: '테스트 가이드',
  });
  return { ...base, ...overrides };
}

export function makeBlob(text = 'image-bytes'): Blob {
  return new Blob([text], { type: 'image/png' });
}

/** 저장소에 그대로 넣을 수 있는 자산 레코드. 트랜잭션 안에서 쓴다. */
export function makeStoredAsset(
  guideId: string,
  overrides: Partial<StoredAsset> = {},
): StoredAsset {
  const bytes = new TextEncoder().encode('image-bytes').buffer as ArrayBuffer;
  return {
    id: nextId('asset'),
    guideId,
    fileName: 'shot.png',
    mimeType: 'image/png',
    byteSize: bytes.byteLength,
    checksum: 'sha256-aaa',
    createdAt: FIXED_NOW,
    bytes,
    ...overrides,
  };
}

export function makeAssetInput(
  guideId: string,
  overrides: Partial<Omit<StoredAsset, 'blob'>> & { blob?: Blob } = {},
) {
  const blob = overrides.blob ?? makeBlob();
  return {
    id: overrides.id ?? nextId('asset'),
    guideId,
    fileName: overrides.fileName ?? 'shot.png',
    mimeType: overrides.mimeType ?? 'image/png',
    checksum: overrides.checksum ?? 'sha256-aaa',
    createdAt: overrides.createdAt ?? FIXED_NOW,
    blob,
    ...(overrides.byteSize === undefined ? {} : { byteSize: overrides.byteSize }),
    ...(overrides.width === undefined ? {} : { width: overrides.width }),
    ...(overrides.height === undefined ? {} : { height: overrides.height }),
  };
}
