import { afterEach, describe, expect, it } from 'vitest';

import { parseGuideDocument } from '@/domain/guide.schema.ts';
import { toBlob } from '@/storage/asset.repository.ts';
import {
  TransactionEscapedError,
  createMemoryBackend,
  openStorage,
  type HowSheetDatabase,
  type StorageTransactionScope,
} from '@/storage/db.ts';

import {
  BACKENDS,
  FIXED_NOW,
  createContext,
  makeAssetInput,
  makeBlob,
  makeGuide,
  makeStoredAsset,
  nextId,
} from './helpers.ts';
import type { TestContext } from './helpers.ts';

let context: TestContext | undefined;

async function fresh(): Promise<TestContext> {
  context = await createContext();
  return context;
}

afterEach(async () => {
  await context?.close();
  context = undefined;
});

describe('CRUD 왕복 (M3 DoD 1)', () => {
  it('생성 → 읽기 → 수정 → 삭제 후 데이터가 정확히 일치한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();

    await ctx.guides.save(guide);
    const read = await ctx.guides.get(guide.id);
    expect(read).toEqual(guide);

    const updated = {
      ...guide,
      updatedAt: '2026-09-01T00:00:00.000Z',
      meta: { ...guide.meta, title: '고친 제목' },
    };
    await ctx.guides.save(updated);
    expect(await ctx.guides.get(guide.id)).toEqual(updated);

    await ctx.guides.remove(guide.id);
    expect(await ctx.guides.get(guide.id)).toBeUndefined();
  });

  it('저장한 문서가 스키마를 다시 통과한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    const read = await ctx.guides.get(guide.id);
    expect(parseGuideDocument(read).ok).toBe(true);
  });

  it('목록은 최근 수정 순이다', async () => {
    const ctx = await fresh();
    const older = { ...makeGuide(), updatedAt: '2026-08-01T00:00:00.000Z' };
    const newer = { ...makeGuide(), updatedAt: '2026-08-20T00:00:00.000Z' };
    await ctx.guides.save(older);
    await ctx.guides.save(newer);

    expect((await ctx.guides.list()).map((s) => s.id)).toEqual([newer.id, older.id]);
  });

  it('없는 가이드를 읽으면 undefined다', async () => {
    const ctx = await fresh();
    expect(await ctx.guides.get('없음')).toBeUndefined();
    expect(await ctx.guides.exists('없음')).toBe(false);
  });
});

describe('삭제와 자산 (M3 DoD 2)', () => {
  it('가이드를 지우면 관련 자산이 같은 트랜잭션에서 사라지고 고아가 0건이다', async () => {
    const ctx = await fresh();
    const keep = makeGuide();
    const drop = makeGuide();
    await ctx.guides.save(keep);
    await ctx.guides.save(drop);

    await ctx.assets.put(makeAssetInput(drop.id, { checksum: 'sha256-a' }));
    await ctx.assets.put(makeAssetInput(drop.id, { checksum: 'sha256-b' }));
    await ctx.assets.put(makeAssetInput(keep.id, { checksum: 'sha256-c' }));

    await ctx.guides.remove(drop.id);

    expect(await ctx.assets.listByGuide(drop.id)).toEqual([]);
    expect(await ctx.assets.listByGuide(keep.id)).toHaveLength(1);
    expect(await ctx.guides.findOrphanAssets()).toEqual([]);
  });

  it('삭제는 복구 스냅샷도 함께 정리한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    await ctx.recovery.capture(guide.id, { reason: 'manual', now: FIXED_NOW });

    await ctx.guides.remove(guide.id);

    expect(await ctx.recovery.get(guide.id)).toBeUndefined();
    expect(await ctx.guides.findOrphanSnapshots()).toEqual([]);
  });

  it('전체 초기화 후 세 테이블이 모두 비어 있다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    await ctx.assets.put(makeAssetInput(guide.id));
    await ctx.recovery.capture(guide.id, { reason: 'manual', now: FIXED_NOW });

    await ctx.guides.clearAll();

    expect(await ctx.guides.list()).toEqual([]);
    expect(await ctx.assets.listByGuide(guide.id)).toEqual([]);
    expect(await ctx.recovery.list()).toEqual([]);
  });
});

describe('트랜잭션 롤백 (M3 DoD 3)', () => {
  it('트랜잭션 중 오류가 나도 마지막 성공 문서와 자산이 유지된다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    const asset = await ctx.assets.put(makeAssetInput(guide.id, { checksum: 'sha256-keep' }));

    const boom = new Error('의도적 실패');
    await expect(
      ctx.backend.transaction(async () => {
        await ctx.backend.guides.put({ ...guide, meta: { ...guide.meta, title: '덮어쓴 제목' } });
        await ctx.backend.assets.delete(asset.asset.id);
        throw boom;
      }),
    ).rejects.toThrow('의도적 실패');

    expect((await ctx.guides.get(guide.id))?.meta.title).toBe(guide.meta.title);
    expect(await ctx.assets.get(asset.asset.id)).toBeDefined();
  });

  it('복제 중 실패하면 사본이 남지 않는다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    await expect(
      ctx.guides.duplicate('존재하지-않음', {
        newGuideId: 'copy-1',
        newAssetId: () => nextId('asset'),
        now: FIXED_NOW,
      }),
    ).rejects.toThrow();

    expect(await ctx.guides.get('copy-1')).toBeUndefined();
    expect(await ctx.guides.list()).toHaveLength(1);
  });
});

describe('복구 스냅샷 (M3 DoD 4)', () => {
  it('스냅샷을 만들고 되돌릴 수 있다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    await ctx.recovery.capture(guide.id, { reason: 'import', now: FIXED_NOW });
    await ctx.guides.save({ ...guide, meta: { ...guide.meta, title: '가져오기로 덮어씀' } });

    const result = await ctx.recovery.restore(guide.id);
    expect(result.restored).toBe(true);
    expect((await ctx.guides.get(guide.id))?.meta.title).toBe(guide.meta.title);
    // 되돌리기 직전 문서를 돌려줘야 호출자가 복원을 취소할 수 있다.
    expect(result.replaced?.meta.title).toBe('가져오기로 덮어씀');
  });

  it('withSnapshot은 실패 시 문서를 되돌리고 예외를 다시 던진다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    await expect(
      ctx.recovery.withSnapshot(guide.id, { reason: 'import', now: FIXED_NOW }, async (tx) => {
        await tx.guides.put({ ...guide, meta: { ...guide.meta, title: '망가진 가져오기' } });
        throw new Error('가져오기 실패');
      }),
    ).rejects.toThrow('가져오기 실패');

    expect((await ctx.guides.get(guide.id))?.meta.title).toBe(guide.meta.title);
  });

  it('withSnapshot은 성공하면 결과를 그대로 돌려준다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    const result = await ctx.recovery.withSnapshot(
      guide.id,
      { reason: 'bulk-edit', now: FIXED_NOW },
      async () => 'done',
    );
    expect(result).toBe('done');
  });

  it('스냅샷이 없으면 복원이 false를 돌려준다', async () => {
    const ctx = await fresh();
    expect(await ctx.recovery.restore('없음')).toEqual({ restored: false, missingAssets: [] });
  });

  it('스냅샷이 가리키지만 사라진 자산을 알려준다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    const asset = await ctx.assets.put(makeAssetInput(guide.id));

    await ctx.recovery.capture(guide.id, { reason: 'manual', now: FIXED_NOW });
    await ctx.assets.remove(asset.asset.id);

    expect(await ctx.recovery.missingAssets(guide.id)).toEqual([asset.asset.id]);
  });
});

describe('복제', () => {
  it('문서와 자산 ID를 새로 만들고 이미지 참조를 다시 연결한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    const assetId = nextId('asset');

    const withImage = {
      ...guide,
      assets: [
        {
          id: assetId,
          fileName: 'a.png',
          mimeType: 'image/png',
          byteSize: 11,
          checksum: 'sha256-img',
        },
      ],
      steps: guide.steps.map((step) => ({
        ...step,
        blocks: [
          ...step.blocks,
          { id: 'img-block', order: 1, type: 'image' as const, assetId, alt: '설명' },
        ],
      })),
    };

    await ctx.guides.save(withImage);
    await ctx.assets.put(makeAssetInput(guide.id, { id: assetId, checksum: 'sha256-img' }));

    const copy = await ctx.guides.duplicate(guide.id, {
      newGuideId: 'copy-1',
      newAssetId: () => 'asset-copied',
      now: '2026-09-02T00:00:00.000Z',
    });

    expect(copy.id).toBe('copy-1');
    expect(copy.assets[0]?.id).toBe('asset-copied');
    const copiedBlock = copy.steps[0]?.blocks.find((b) => b.type === 'image');
    expect(copiedBlock?.type === 'image' && copiedBlock.assetId).toBe('asset-copied');

    // 자산 본문도 새 ID로 복사된다.
    const copiedAssets = await ctx.assets.listByGuide('copy-1');
    expect(copiedAssets.map((a) => a.id)).toEqual(['asset-copied']);

    // 원본은 변경되지 않는다.
    const original = await ctx.guides.get(guide.id);
    expect(original).toEqual(withImage);
    expect((await ctx.assets.listByGuide(guide.id)).map((a) => a.id)).toEqual([assetId]);
  });

  it('복제본도 스키마를 통과한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    const copy = await ctx.guides.duplicate(guide.id, {
      newGuideId: 'copy-2',
      newAssetId: () => nextId('asset'),
      now: FIXED_NOW,
    });
    expect(parseGuideDocument(copy).ok).toBe(true);
  });
});

describe('자산 저장', () => {
  it('같은 checksum을 두 번 올려도 Blob이 중복 저장되지 않는다 (M5 DoD 8)', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    const first = await ctx.assets.put(makeAssetInput(guide.id, { checksum: 'sha256-same' }));
    const second = await ctx.assets.put(makeAssetInput(guide.id, { checksum: 'sha256-same' }));

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(await ctx.assets.listByGuide(guide.id)).toHaveLength(1);
  });

  it('다른 가이드의 같은 checksum은 별개로 저장한다', async () => {
    const ctx = await fresh();
    const a = makeGuide();
    const b = makeGuide();
    await ctx.guides.save(a);
    await ctx.guides.save(b);

    await ctx.assets.put(makeAssetInput(a.id, { checksum: 'sha256-shared' }));
    await ctx.assets.put(makeAssetInput(b.id, { checksum: 'sha256-shared' }));

    expect(await ctx.assets.listByGuide(a.id)).toHaveLength(1);
    expect(await ctx.assets.listByGuide(b.id)).toHaveLength(1);
  });

  it('문서를 여러 번 저장해도 자산을 다시 쓰지 않는다 (M3 주의)', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    await ctx.assets.put(makeAssetInput(guide.id));

    const writesAfterSetup = ctx.writes.assets;
    for (let i = 0; i < 5; i += 1) {
      await ctx.guides.save({ ...guide, updatedAt: `2026-09-0${i + 1}T00:00:00.000Z` });
    }

    expect(ctx.writes.assets).toBe(writesAfterSetup);
  });

  it('참조되지 않는 자산만 정리한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    const keptId = nextId('asset');

    await ctx.guides.save({
      ...guide,
      assets: [
        {
          id: keptId,
          fileName: 'k.png',
          mimeType: 'image/png',
          byteSize: 11,
          checksum: 'sha256-k',
        },
      ],
    });
    await ctx.assets.put(makeAssetInput(guide.id, { id: keptId, checksum: 'sha256-k' }));
    const stray = await ctx.assets.put(makeAssetInput(guide.id, { checksum: 'sha256-stray' }));

    expect(await ctx.assets.removeUnreferenced(guide.id)).toEqual([stray.asset.id]);
    expect((await ctx.assets.listByGuide(guide.id)).map((a) => a.id)).toEqual([keptId]);
  });

  it('참조하지만 없는 자산을 보고한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save({
      ...guide,
      assets: [
        {
          id: 'asset-missing',
          fileName: 'm.png',
          mimeType: 'image/png',
          byteSize: 1,
          checksum: 'x',
        },
      ],
    });
    expect(await ctx.assets.findMissing(guide.id)).toEqual(['asset-missing']);
  });

  it('자산 총 바이트를 더한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    await ctx.assets.put(makeAssetInput(guide.id, { checksum: 'a', byteSize: 100 }));
    await ctx.assets.put(makeAssetInput(guide.id, { checksum: 'b', byteSize: 250 }));
    expect(await ctx.assets.totalBytes(guide.id)).toBe(350);
  });
});

describe('IndexedDB 폴백 (M3 DoD 5·6)', () => {
  it('초기화 실패 시 예외 없이 메모리 모드로 들어간다', async () => {
    const backend = await openStorage({
      name: 'howsheet-fail-probe',
      createDatabase: () => {
        throw new Error('IndexedDB를 열 수 없습니다');
      },
    });

    expect(backend.mode).toBe('memory');
    expect(backend.unavailableReason).toContain('IndexedDB를 열 수 없습니다');
    await backend.close();
  });

  it('메모리 모드에서도 CRUD와 롤백이 동작한다', async () => {
    const ctx = await createContext({ backend: createMemoryBackend('테스트') });
    context = ctx;

    const guide = makeGuide();
    await ctx.guides.save(guide);
    expect(await ctx.guides.get(guide.id)).toEqual(guide);

    await expect(
      ctx.backend.transaction(async () => {
        await ctx.backend.guides.put({ ...guide, meta: { ...guide.meta, title: '덮어씀' } });
        throw new Error('실패');
      }),
    ).rejects.toThrow('실패');

    expect((await ctx.guides.get(guide.id))?.meta.title).toBe(guide.meta.title);
  });

  it('메모리 모드는 이유를 노출해 배너와 JSON 백업 안내를 띄울 수 있다', async () => {
    const backend = createMemoryBackend('Safari 사생활 보호 모드');
    expect(backend.mode).toBe('memory');
    expect(backend.unavailableReason).toBe('Safari 사생활 보호 모드');
    await backend.close();
  });

  it('open이 실패해도 기존 DB를 새로 만들지 않는다 (M3 주의)', async () => {
    // 마이그레이션 실패를 삼키고 빈 DB를 만들면 데이터 유실이 숨는다.
    // openStorage는 실패를 메모리 모드로 드러낼 뿐 DB를 지우지 않는다.
    let deleted = false;
    const fakeDb = {
      open: () => Promise.reject(new Error('VersionError')),
      close: () => {},
      delete: () => {
        deleted = true;
        return Promise.resolve();
      },
    } as unknown as HowSheetDatabase;

    const backend = await openStorage({ name: 'x', createDatabase: () => fakeDb });
    expect(backend.mode).toBe('memory');
    expect(deleted).toBe(false);
    await backend.close();
  });
});

describe('테스트 격리 (M3 DoD 8)', () => {
  it('각 컨텍스트는 빈 저장소로 시작한다', async () => {
    const first = await createContext();
    await first.guides.save(makeGuide());
    expect(await first.guides.list()).toHaveLength(1);
    await first.close();

    const second = await createContext();
    expect(await second.guides.list()).toEqual([]);
    await second.close();
  });
});

/**
 * 무결성은 두 백엔드에서 똑같이 성립해야 한다.
 *
 * IndexedDB에서만 성립하면 정작 폴백 모드(DoD 5·6이 요구하는 바로 그 모드)에서
 * 데이터가 깨진다. 아래 단언은 두 백엔드를 같은 코드로 통과한다.
 */
describe.each(BACKENDS)('백엔드 동등성 - $name', ({ make }) => {
  async function freshOn(): Promise<TestContext> {
    const backend = await make();
    context = await createContext(backend === undefined ? {} : { backend });
    return context;
  }

  it('저장한 객체와 읽은 객체는 다른 참조다 (DoD 1·3)', async () => {
    const ctx = await freshOn();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    const read = await ctx.guides.get(guide.id);
    expect(read).toEqual(guide);
    expect(read).not.toBe(guide);

    // 읽어 간 객체를 고쳐도 저장소는 그대로다.
    read!.meta.title = '읽은 뒤 고침';
    expect((await ctx.guides.get(guide.id))?.meta.title).toBe(guide.meta.title);
  });

  it('자산 Blob의 바이트가 그대로 왕복한다 (DoD 1)', async () => {
    const ctx = await freshOn();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    const stored = await ctx.assets.put(
      makeAssetInput(guide.id, { blob: makeBlob('PNG 바이트 ①②③') }),
    );

    const read = await ctx.assets.get(stored.asset.id);
    expect(read?.mimeType).toBe('image/png');
    expect(read?.byteSize).toBe(stored.asset.byteSize);
    // 바이트를 실제로 읽어 본다. 길이만 보면 빈 값이 왕복해도 통과한다.
    expect(await toBlob(read!).text()).toBe('PNG 바이트 ①②③');
  });

  it('트랜잭션 실패는 제자리 수정까지 되돌린다 (DoD 3)', async () => {
    const ctx = await freshOn();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    await expect(
      ctx.backend.transaction(async (tx) => {
        const live = await tx.guides.get(guide.id);
        live!.meta.title = '제자리 수정';
        await tx.guides.put(live!);
        throw new Error('실패');
      }),
    ).rejects.toThrow('실패');

    expect((await ctx.guides.get(guide.id))?.meta.title).toBe(guide.meta.title);
  });

  it('실패한 가져오기가 새 가이드의 부분 결과를 남기지 않는다 (INV-08)', async () => {
    const ctx = await freshOn();
    const incoming = makeGuide();

    await expect(
      ctx.recovery.withSnapshot(incoming.id, { reason: 'import', now: FIXED_NOW }, async (tx) => {
        await tx.guides.put(incoming);
        await tx.assets.put(makeStoredAsset(incoming.id, { checksum: 'sha256-partial' }));
        throw new Error('중간에 실패');
      }),
    ).rejects.toThrow('중간에 실패');

    expect(await ctx.guides.get(incoming.id)).toBeUndefined();
    expect(await ctx.assets.listByGuide(incoming.id)).toEqual([]);
    // 되돌리기가 끝났으므로 스냅샷도 남지 않는다.
    expect(await ctx.recovery.get(incoming.id)).toBeUndefined();
  });

  it('실패한 가져오기가 기존 자산 바이트를 파괴하지 않는다 (INV-08)', async () => {
    const ctx = await freshOn();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    const kept = await ctx.assets.put(
      makeAssetInput(guide.id, { checksum: 'sha256-keep', blob: makeBlob('원본 바이트') }),
    );

    await expect(
      ctx.recovery.withSnapshot(guide.id, { reason: 'import', now: FIXED_NOW }, async (tx) => {
        await tx.assets.delete(kept.asset.id);
        await tx.guides.put({ ...guide, meta: { ...guide.meta, title: '망가진 가져오기' } });
        throw new Error('가져오기 실패');
      }),
    ).rejects.toThrow('가져오기 실패');

    const restored = await ctx.assets.get(kept.asset.id);
    expect(restored).toBeDefined();
    expect(await toBlob(restored!).text()).toBe('원본 바이트');
    expect((await ctx.guides.get(guide.id))?.meta.title).toBe(guide.meta.title);
  });

  it('성공한 작업은 스냅샷을 남기지 않는다', async () => {
    const ctx = await freshOn();
    const guide = makeGuide();
    await ctx.guides.save(guide);

    await ctx.recovery.withSnapshot(
      guide.id,
      { reason: 'bulk-edit', now: FIXED_NOW },
      async (tx) => {
        await tx.guides.put({ ...guide, revision: 9 });
      },
    );

    expect(await ctx.recovery.get(guide.id)).toBeUndefined();
    expect((await ctx.guides.get(guide.id))?.revision).toBe(9);
  });

  it('복원은 한 번만 적용된다 - 남은 스냅샷이 새 작업을 덮지 않는다', async () => {
    const ctx = await freshOn();
    const guide = { ...makeGuide(), revision: 1 };
    await ctx.guides.save(guide);
    await ctx.recovery.capture(guide.id, { reason: 'manual', now: FIXED_NOW });

    await ctx.guides.save({ ...guide, revision: 9 });

    const first = await ctx.recovery.restore(guide.id);
    expect(first.restored).toBe(true);
    expect(first.replaced?.revision).toBe(9);
    expect((await ctx.guides.get(guide.id))?.revision).toBe(1);

    await ctx.guides.save({ ...guide, revision: 12 });
    expect((await ctx.recovery.restore(guide.id)).restored).toBe(false);
    expect((await ctx.guides.get(guide.id))?.revision).toBe(12);
  });

  it('고아 자산·스냅샷을 실제로 치운다', async () => {
    const ctx = await freshOn();
    const guide = makeGuide();
    await ctx.guides.save(guide);
    const orphan = await ctx.assets.put(makeAssetInput(guide.id, { checksum: 'sha256-orphan' }));
    await ctx.recovery.capture(guide.id, { reason: 'manual', now: FIXED_NOW });

    // 정상 경로(remove)는 트랜잭션이라 고아를 만들지 못한다. 브라우저가 도중에
    // 죽은 상황을 흉내 내려면 문서만 지워야 한다.
    await ctx.backend.guides.delete(guide.id);
    expect(await ctx.guides.findOrphanAssets()).toHaveLength(1);

    const swept = await ctx.guides.removeOrphans();
    expect(swept.assets).toEqual([orphan.asset.id]);
    expect(swept.snapshots).toEqual([guide.id]);
    expect(await ctx.guides.findOrphanAssets()).toEqual([]);
    expect(await ctx.guides.findOrphanSnapshots()).toEqual([]);
  });
});

/**
 * 실제 브라우저의 IndexedDB 트랜잭션은 유휴 상태가 되면 스스로 커밋한다.
 * 콜백이 저장소 밖 Promise를 그냥 await하면 그 사이에 커밋이 일어나 앞부분이
 * 남는다. fake-indexeddb는 그 자동 커밋을 그만큼 엄격히 흉내 내지 않으므로
 * 실패 모드 자체는 여기서 재현되지 않는다. 재현 가능한 두 가지(이탈 확인과
 * `waitFor` 경로)를 고정한다. (INV-08)
 */
describe('트랜잭션 스코프 이탈 (INV-08)', () => {
  it('트랜잭션이 끝난 뒤 스코프를 쓰면 던진다', async () => {
    const ctx = await fresh();
    let escaped: StorageTransactionScope | undefined;

    await ctx.backend.transaction(async (tx) => {
      escaped = tx;
    });

    const guide = makeGuide();
    await expect(escaped!.guides.put(guide)).rejects.toThrow(TransactionEscapedError);
    await expect(escaped!.guides.get(guide.id)).rejects.toThrow(TransactionEscapedError);
    await expect(escaped!.assets.toArray()).rejects.toThrow(TransactionEscapedError);
    // 롤백되지 않을 쓰기가 실제로 통과하지 않았다.
    expect(await ctx.guides.get(guide.id)).toBeUndefined();
  });

  it('tx.waitFor로 기다리면 트랜잭션이 살아 있고 롤백도 성립한다', async () => {
    const ctx = await fresh();
    const guide = makeGuide();

    await expect(
      ctx.backend.transaction(async (tx) => {
        await tx.guides.put(guide);
        await tx.waitFor(new Promise((resolve) => setTimeout(resolve, 5)));
        await tx.guides.put({ ...guide, revision: 2 });
        throw new Error('실패');
      }),
    ).rejects.toThrow('실패');

    expect(await ctx.guides.get(guide.id)).toBeUndefined();
  });

  it('tx.waitFor는 값을 그대로 돌려준다', async () => {
    const ctx = await fresh();
    const value = await ctx.backend.transaction(async (tx) =>
      tx.waitFor(Promise.resolve('바깥 작업 결과')),
    );
    expect(value).toBe('바깥 작업 결과');
  });
});
