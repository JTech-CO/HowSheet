import { describe, expect, it } from 'vitest';

import { createGuideDocument } from '@/domain/guide.defaults.ts';
import type { GuideDocument } from '@/domain/guide.types.ts';
import {
  DATABASE_NAME,
  DATABASE_STORES,
  DATABASE_VERSION,
  StorageClosedError,
  cloneStored,
  createMemoryBackend,
  openStorage,
  type HowSheetDatabase,
  type StoredAsset,
} from '@/storage/db.ts';

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

function guide(title = '제목'): GuideDocument {
  return createGuideDocument({
    id: nextId('guide'),
    now: '2026-08-31T00:00:00.000Z',
    newId: nextId,
    title,
  });
}

function asset(guideId: string, overrides: Partial<StoredAsset> = {}): StoredAsset {
  return {
    id: nextId('asset'),
    guideId,
    fileName: 'a.png',
    mimeType: 'image/png',
    byteSize: 10,
    checksum: 'sha256-a',
    createdAt: '2026-08-31T00:00:00.000Z',
    bytes: new TextEncoder().encode('x').buffer as ArrayBuffer,
    ...overrides,
  };
}

describe('스키마 계약 (기술 §4.5.1)', () => {
  it('DB 이름·버전·스토어 정의가 백서와 일치한다', () => {
    expect(DATABASE_NAME).toBe('howsheet-db');
    expect(DATABASE_VERSION).toBe(1);
    expect(DATABASE_STORES).toEqual({
      guides: 'id, updatedAt, meta.title',
      assets: 'id, guideId, checksum',
      recovery: 'guideId, createdAt',
    });
  });
});

describe('메모리 백엔드 기본 연산', () => {
  it('put·get·delete·toArray가 동작한다', async () => {
    const backend = createMemoryBackend('테스트');
    const g = guide();

    await backend.guides.put(g);
    expect(await backend.guides.get(g.id)).toEqual(g);
    expect(await backend.guides.toArray()).toHaveLength(1);

    await backend.guides.delete(g.id);
    expect(await backend.guides.get(g.id)).toBeUndefined();
    expect(await backend.guides.toArray()).toEqual([]);
  });

  it('없는 키를 지워도 던지지 않는다', async () => {
    const backend = createMemoryBackend('테스트');
    await expect(backend.guides.delete('없음')).resolves.toBeUndefined();
  });

  it('인덱스 동등 조회가 동작한다', async () => {
    const backend = createMemoryBackend('테스트');
    await backend.assets.put(asset('g-1', { checksum: 'a' }));
    await backend.assets.put(asset('g-1', { checksum: 'b' }));
    await backend.assets.put(asset('g-2', { checksum: 'a' }));

    expect(await backend.assets.where('guideId', 'g-1')).toHaveLength(2);
    expect(await backend.assets.where('checksum', 'a')).toHaveLength(2);
  });

  it('meta.title 같은 점 표기 인덱스를 읽는다', async () => {
    const backend = createMemoryBackend('테스트');
    await backend.guides.put(guide('찾을 제목'));
    await backend.guides.put(guide('다른 제목'));

    const found = await backend.guides.where('meta.title', '찾을 제목');
    expect(found).toHaveLength(1);
    expect(found[0]?.meta.title).toBe('찾을 제목');
  });

  it('clear가 컬렉션을 비운다', async () => {
    const backend = createMemoryBackend('테스트');
    await backend.guides.put(guide());
    await backend.guides.clear();
    expect(await backend.guides.toArray()).toEqual([]);
  });
});

describe('메모리 트랜잭션 롤백 (M3 DoD 3)', () => {
  it('성공하면 변경이 남는다', async () => {
    const backend = createMemoryBackend('테스트');
    const g = guide();
    const result = await backend.transaction(async () => {
      await backend.guides.put(g);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(await backend.guides.get(g.id)).toEqual(g);
  });

  it('실패하면 세 테이블 모두 되돌린다', async () => {
    const backend = createMemoryBackend('테스트');
    const original = guide('원래 제목');
    const keptAsset = asset(original.id);
    await backend.guides.put(original);
    await backend.assets.put(keptAsset);
    await backend.recovery.put({
      guideId: original.id,
      createdAt: '2026-08-31T00:00:00.000Z',
      reason: 'manual',
      existed: true,
      document: original,
      assetIds: [keptAsset.id],
    });

    await expect(
      backend.transaction(async () => {
        await backend.guides.put({ ...original, meta: { ...original.meta, title: '덮어씀' } });
        await backend.assets.delete(keptAsset.id);
        await backend.recovery.delete(original.id);
        throw new Error('실패');
      }),
    ).rejects.toThrow('실패');

    expect((await backend.guides.get(original.id))?.meta.title).toBe('원래 제목');
    expect(await backend.assets.get(keptAsset.id)).toBeDefined();
    expect(await backend.recovery.get(original.id)).toBeDefined();
  });

  it('트랜잭션 안에서 추가된 항목도 롤백된다', async () => {
    const backend = createMemoryBackend('테스트');
    const g = guide();
    await expect(
      backend.transaction(async () => {
        await backend.guides.put(g);
        throw new Error('실패');
      }),
    ).rejects.toThrow();
    expect(await backend.guides.get(g.id)).toBeUndefined();
  });

  it('중첩 트랜잭션은 가장 바깥에서만 되돌린다', async () => {
    const backend = createMemoryBackend('테스트');
    const outer = guide('바깥');

    await expect(
      backend.transaction(async () => {
        await backend.guides.put(outer);
        await backend.transaction(async () => {
          await backend.guides.put(guide('안쪽'));
        });
        throw new Error('바깥 실패');
      }),
    ).rejects.toThrow('바깥 실패');

    expect(await backend.guides.toArray()).toEqual([]);
  });
});

describe('메모리 모드 상태 노출 (M3 DoD 6)', () => {
  it('모드와 이유를 알려 준다', () => {
    const backend = createMemoryBackend('IndexedDB를 열 수 없습니다');
    expect(backend.mode).toBe('memory');
    expect(backend.unavailableReason).toBe('IndexedDB를 열 수 없습니다');
  });

  // Dexie의 close()는 데이터를 지우지 않는다. 메모리 백엔드가 지워 버리면
  // 방어적으로 close를 부르는 호출자가 그대로 사용자 데이터를 날린다.
  it('close는 내용을 지우지 않고 이후 사용을 막는다 - Dexie와 같은 의미', async () => {
    const backend = createMemoryBackend('테스트');
    const g = guide();
    await backend.guides.put(g);

    await backend.close();

    await expect(backend.guides.get(g.id)).rejects.toThrow(StorageClosedError);
    await expect(backend.guides.toArray()).rejects.toThrow(StorageClosedError);
    await expect(backend.transaction(async () => undefined)).rejects.toThrow(StorageClosedError);
  });
});

describe('저장 경계 복제 (M3 DoD 3, INV-08)', () => {
  it('put한 객체와 get한 객체는 다른 참조다', async () => {
    const backend = createMemoryBackend('테스트');
    const g = guide();
    await backend.guides.put(g);

    const read = await backend.guides.get(g.id);
    expect(read).toEqual(g);
    expect(read).not.toBe(g);
    expect(read).not.toBe(await backend.guides.get(g.id));
    expect(read?.meta).not.toBe(g.meta);
  });

  it('put 뒤 원본을 고쳐도 저장된 값은 그대로다', async () => {
    const backend = createMemoryBackend('테스트');
    const g = guide('원래 제목');
    await backend.guides.put(g);

    g.meta.title = '밖에서 고침';

    expect((await backend.guides.get(g.id))?.meta.title).toBe('원래 제목');
  });

  // 참조를 그대로 돌려주면 이 제자리 수정이 스냅샷을 통과해 롤백을 뚫는다.
  it('트랜잭션 안의 제자리 수정도 롤백된다', async () => {
    const backend = createMemoryBackend('테스트');
    const g = guide('원래 제목');
    await backend.guides.put(g);

    await expect(
      backend.transaction(async (tx) => {
        const live = await tx.guides.get(g.id);
        live!.meta.title = '제자리 수정';
        throw new Error('실패');
      }),
    ).rejects.toThrow('실패');

    expect((await backend.guides.get(g.id))?.meta.title).toBe('원래 제목');
  });

  it('자산 바이트는 복사되어 저장 뒤 원본을 고쳐도 남지 않는다', async () => {
    const backend = createMemoryBackend('테스트');
    const bytes = new TextEncoder().encode('bytes').buffer as ArrayBuffer;
    const a = asset('g-1', { bytes });

    await backend.assets.put(a);
    // 저장 뒤 원본 버퍼를 뭉갠다.
    new Uint8Array(bytes).fill(0);

    const read = await backend.assets.get(a.id);
    expect(read).not.toBe(a);
    expect(read?.bytes).not.toBe(bytes);
    expect(new TextDecoder().decode(read?.bytes)).toBe('bytes');
  });

  it('cloneStored는 Blob 참조를 그대로 넘긴다 - Blob은 불변이다', () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    const copy = cloneStored({ blob });
    expect(copy.blob).toBe(blob);
  });

  it('cloneStored는 중첩 배열·객체를 모두 끊는다', () => {
    const source = { a: [{ b: 1 }], c: { d: [2, 3] } };
    const copy = cloneStored(source);
    expect(copy).toEqual(source);
    expect(copy.a).not.toBe(source.a);
    expect(copy.a[0]).not.toBe(source.a[0]);
    expect(copy.c.d).not.toBe(source.c.d);
  });
});

describe('중첩 트랜잭션 실패 전파 (Dexie 동등성)', () => {
  // Dexie는 하위 트랜잭션이 실패하면 부모를 abort한다. 바깥에서 예외를 삼켜도
  // 커밋되지 않는다. 메모리 백엔드도 같아야 한다.
  it('안쪽이 실패하면 바깥에서 삼켜도 커밋되지 않는다', async () => {
    const backend = createMemoryBackend('테스트');
    const outer = guide('바깥');

    await expect(
      backend.transaction(async (tx) => {
        await tx.guides.put(outer);
        try {
          await backend.transaction(async (inner) => {
            await inner.guides.put(guide('안쪽'));
            throw new Error('안쪽 실패');
          });
        } catch {
          // 바깥이 조용히 삼킨다.
        }
        return 'ok';
      }),
    ).rejects.toThrow('안쪽 실패');

    expect(await backend.guides.toArray()).toEqual([]);
  });

  it('안쪽이 성공하면 바깥은 정상 커밋된다', async () => {
    const backend = createMemoryBackend('테스트');
    const outer = guide('바깥');

    const result = await backend.transaction(async (tx) => {
      await tx.guides.put(outer);
      await backend.transaction(async (inner) => {
        await inner.guides.put(guide('안쪽'));
      });
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(await backend.guides.toArray()).toHaveLength(2);
  });
});

describe('열기 시간 제한 (기술 §7.5)', () => {
  it('open이 정착하지 않으면 메모리 모드로 떨어진다', async () => {
    const hanging = {
      open: () => new Promise<void>(() => {}),
      close: () => {},
    } as unknown as HowSheetDatabase;

    const backend = await openStorage({
      name: '멈춘-디비',
      createDatabase: () => hanging,
      timeoutMs: 20,
    });

    expect(backend.mode).toBe('memory');
    expect(backend.unavailableReason).toContain('StorageOpenTimeoutError');
  });

  it('open이 던지면 이유를 담아 메모리 모드로 떨어진다', async () => {
    const failing = {
      open: () => Promise.reject(new Error('열 수 없음')),
      close: () => {},
    } as unknown as HowSheetDatabase;

    const backend = await openStorage({
      name: '실패-디비',
      createDatabase: () => failing,
      timeoutMs: 50,
    });

    expect(backend.mode).toBe('memory');
    expect(backend.unavailableReason).toContain('열 수 없음');
  });
});
