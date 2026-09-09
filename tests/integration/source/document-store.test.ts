/**
 * 작업 문서 저장소.
 *
 * 기준: v2 제품정의 §8 INV-07. 하네스 P1 DoD 1·2.
 *
 * `dom` 프로젝트라 `tests/setup/fake-indexeddb.ts`가 전역 `indexedDB`를 먼저
 * 채운다. 그 순서가 어긋나면 저장소가 조용히 메모리로 떨어져, IndexedDB 경로를
 * 한 번도 건드리지 않은 채 통과한다.
 */

import { describe, expect, it } from 'vitest';

import { createStudioDocument } from '@/domain/studio.defaults.ts';
import {
  DOCUMENT_KEY,
  STORE_NAME,
  createMemoryStore,
  openDocumentStore,
} from '@/storage/document.store.ts';

let counter = 0;
/** 테스트마다 다른 DB를 쓴다. 실행 순서에 기대지 않는다. */
function freshName(): string {
  counter += 1;
  return `howsheet-test-${counter}-${Date.now()}`;
}

async function open() {
  const store = await openDocumentStore({ name: freshName() });
  // 조용히 메모리로 떨어졌으면 이 파일의 단언이 전부 무의미해진다.
  expect(store.state().mode).toBe('indexeddb');
  return store;
}

describe('IndexedDB 왕복', () => {
  it('처음에는 문서가 없다', async () => {
    const store = await open();
    expect(await store.load()).toBeNull();
  });

  it('저장한 문서를 그대로 돌려준다', async () => {
    const store = await open();
    const doc = { ...createStudioDocument('2026-09-08T00:00:00.000Z'), source: '# 제목\n본문' };

    await store.save(doc);
    expect(await store.load()).toEqual(doc);
  });

  it('두 번째 저장이 첫 번째를 덮는다', async () => {
    const store = await open();
    const first = createStudioDocument('2026-09-08T00:00:00.000Z');

    await store.save({ ...first, source: '처음' });
    await store.save({ ...first, source: '나중' });

    expect((await store.load())?.source).toBe('나중');
  });

  it('큰 자료도 왕복한다', async () => {
    // LocalStorage였다면 상한과 동기 쓰기가 문제가 되는 크기다.
    const store = await open();
    const source = '가'.repeat(300_000);

    await store.save({ ...createStudioDocument('2026-09-08T00:00:00.000Z'), source });
    expect((await store.load())?.source).toHaveLength(300_000);
  });

  it('clear가 문서를 지운다', async () => {
    const store = await open();
    await store.save(createStudioDocument('2026-09-08T00:00:00.000Z'));
    await store.clear();

    expect(await store.load()).toBeNull();
  });

  it('같은 이름으로 다시 열면 값이 남아 있다', async () => {
    // 새로고침을 흉내 낸다. (DoD 1)
    const name = freshName();
    const first = await openDocumentStore({ name });
    await first.save({ ...createStudioDocument('2026-09-08T00:00:00.000Z'), source: '남아라' });

    const second = await openDocumentStore({ name });
    expect((await second.load())?.source).toBe('남아라');
  });
});

describe('모양이 다른 값', () => {
  it('올릴 수 없는 값은 없는 것으로 다룬다', async () => {
    // 아는 옛 버전은 P2가 더한 올림 경로가 살린다. 여기서 보는 것은 그 경로도
    // 손댈 수 없는 값이다. 남의 데이터를 우리 문서인 척 화면에 올리지 않는다.
    // (올림 경로 자체는 tests/unit/spec/studio-document.test.ts가 본다.)
    const name = freshName();
    const store = await openDocumentStore({ name });
    expect(store.state().mode).toBe('indexeddb');

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => {
        const tx = request.result.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ version: 99, junk: true }, DOCUMENT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    expect(await store.load()).toBeNull();
  });
});

describe('열기 실패 (INV-07)', () => {
  /** 원래 전역을 지키고 되돌린다. 다른 테스트가 진짜 IndexedDB를 써야 한다. */
  function withIndexedDb(replacement: unknown, run: () => Promise<void>): Promise<void> {
    const real = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: replacement,
      configurable: true,
      writable: true,
    });
    return run().finally(() => {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: real,
        configurable: true,
        writable: true,
      });
    });
  }

  it('열기가 실패하면 던지지 않고 메모리로 떨어진다', async () => {
    // 저장소를 못 열었다고 예외를 올리면 화면이 뜨지도 않는다.
    const broken = {
      open: () => {
        const request: Record<string, unknown> = { error: new Error('열기 거부됨') };
        queueMicrotask(() => {
          (request['onerror'] as (() => void) | undefined)?.();
        });
        return request;
      },
    };

    await withIndexedDb(broken, async () => {
      const store = await openDocumentStore({ name: freshName() });
      expect(store.state().mode).toBe('memory');
      expect(store.state().unavailableReason).toContain('열기 거부됨');
    });
  });

  it('IndexedDB가 아예 없으면 메모리로 떨어진다', async () => {
    await withIndexedDb(undefined, async () => {
      const store = await openDocumentStore({ name: freshName() });
      expect(store.state().mode).toBe('memory');
      // 떨어진 뒤에도 읽고 쓸 수 있어야 한다.
      await store.save(createStudioDocument('2026-09-08T00:00:00.000Z'));
      expect(await store.load()).not.toBeNull();
    });
  });
});

describe('메모리 폴백 (INV-07)', () => {
  it('이유를 담고 값은 유지한다', async () => {
    const store = createMemoryStore('테스트 강제 폴백');
    const doc = { ...createStudioDocument('2026-09-08T00:00:00.000Z'), source: '메모리' };

    expect(store.state()).toEqual({ mode: 'memory', unavailableReason: '테스트 강제 폴백' });

    await store.save(doc);
    expect((await store.load())?.source).toBe('메모리');
  });

  it('저장이 던지지 않는다', async () => {
    // 저장 실패로 입력이 막히면 사용자는 작업 자체를 못 한다.
    const store = createMemoryStore('이유');
    await expect(
      store.save(createStudioDocument('2026-09-08T00:00:00.000Z')),
    ).resolves.toBeUndefined();
  });
});
