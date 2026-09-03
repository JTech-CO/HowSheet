/**
 * 하네스 M8 - JSON 왕복, 가져오기 트랜잭션, 마이그레이션 복구.
 *
 * 단위 테스트가 순수 함수를 보고 여기서는 **저장소를 낀 실제 경로**를 본다.
 * DoD 1(왕복 동일), DoD 4(실패가 기존 레코드를 안 건드림), DoD 5(복사본과
 * 복귀)는 저장소 없이는 확인할 수 없다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseGuideDocument } from '@/domain/guide.schema.ts';
import type { GuideDocument } from '@/domain/guide.types.ts';
import { ISSUE_CODES } from '@/domain/validation.types.ts';
import { checksumOf } from '@/features/assets/checksum.ts';
import { canonicalJson, exportGuideJson } from '@/features/export-json/json-exporter.ts';
import { toManifestItem } from '@/storage/asset.repository.ts';
import type { StorageBackend } from '@/storage/db.ts';
import { RecoveryRepository } from '@/storage/recovery.repository.ts';
import {
  configureGuideStore,
  resetGuideStore,
  useGuideStore,
  type ImportGuideResult,
} from '@/store/guide.store.ts';

import {
  FIXED_NOW,
  createContext,
  makeGuide,
  nextId,
  type TestContext,
} from '../storage/helpers.ts';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).buffer;

let context: TestContext;

const store = () => useGuideStore.getState();

beforeEach(async () => {
  context = await createContext();
  configureGuideStore({
    guides: context.guides,
    assets: context.assets,
    recovery: context.recovery,
    mode: context.backend.mode,
    newId: nextId,
    now: () => FIXED_NOW,
  });
  resetGuideStore();
});

afterEach(async () => {
  await context.close();
});

/** 이미지 블록 하나와 그 자산을 가진 가이드를 저장소에 심는다. */
async function plantGuideWithAsset(): Promise<GuideDocument> {
  const base = makeGuide();
  const assetId = nextId('asset');
  const checksum = await checksumOf(PNG);

  const stored = await context.assets.put({
    id: assetId,
    guideId: base.id,
    fileName: 'diagram.png',
    mimeType: 'image/png',
    checksum,
    blob: new Blob([PNG], { type: 'image/png' }),
    width: 800,
    height: 450,
    createdAt: FIXED_NOW,
  });

  const document: GuideDocument = {
    ...base,
    assets: [toManifestItem(stored.asset)],
    steps: base.steps.map((step, index) =>
      index > 0
        ? step
        : {
            ...step,
            blocks: [
              ...step.blocks,
              { id: nextId('block'), order: 90, type: 'image', assetId, alt: '그림' },
              { id: nextId('block'), order: 91, type: 'image', assetId, alt: '같은 그림' },
            ],
          },
    ),
  };

  await context.guides.save(document);
  return document;
}

async function importText(text: string): Promise<ImportGuideResult> {
  return store().importGuideFromJson(text);
}

describe('왕복 (DoD 1)', () => {
  it('자산 없는 문서가 그대로 돌아온다', async () => {
    const source = makeGuide();
    await context.guides.save(source);

    const exported = await store().exportGuideToJson(source.id);
    const result = await importText(exported!.text);

    expect(result.ok).toBe(true);
    const restored = await context.guides.get(result.guideId!);
    // ID와 시각은 새 가이드의 것이다. 나머지 내용이 같아야 한다.
    expect({ ...restored!, id: '', createdAt: '', updatedAt: '' }).toEqual({
      ...source,
      id: '',
      createdAt: '',
      updatedAt: '',
    });
  });

  it('자산 바이트와 checksum이 원본과 같다', async () => {
    const source = await plantGuideWithAsset();

    const exported = await store().exportGuideToJson(source.id);
    const result = await importText(exported!.text);
    expect(result.ok).toBe(true);

    const restoredAssets = await context.assets.listByGuide(result.guideId!);
    expect(restoredAssets).toHaveLength(1);
    expect(restoredAssets[0]!.checksum).toBe(source.assets[0]!.checksum);
    // 저장된 바이트로 다시 계산해도 같아야 한다. manifest만 옮겨졌을 수 있다.
    expect(await checksumOf(restoredAssets[0]!.bytes)).toBe(source.assets[0]!.checksum);
  });

  it('이미지 블록 참조가 새 자산 ID로 이어진다', async () => {
    const source = await plantGuideWithAsset();

    const exported = await store().exportGuideToJson(source.id);
    const result = await importText(exported!.text);

    const restored = await context.guides.get(result.guideId!);
    const imageBlocks = restored!.steps
      .flatMap((step) => step.blocks)
      .filter((block) => block.type === 'image');
    const storedIds = new Set(
      (await context.assets.listByGuide(result.guideId!)).map((asset) => asset.id),
    );

    expect(imageBlocks).toHaveLength(2);
    for (const block of imageBlocks) expect(storedIds.has(block.assetId)).toBe(true);
    // 원본 자산 ID가 그대로 남아 있으면 다른 가이드의 행을 덮어쓴 것이다.
    for (const block of imageBlocks) expect(block.assetId).not.toBe(source.assets[0]!.id);
  });

  it('두 번째 내보내기가 첫 번째와 같다 (DoD 2)', async () => {
    const source = await plantGuideWithAsset();

    const first = await store().exportGuideToJson(source.id);
    const second = await store().exportGuideToJson(source.id);

    expect(second!.text).toBe(first!.text);
    expect(second!.fileName).toBe(first!.fileName);
  });

  it('가져온 문서를 다시 내보내면 자산 데이터가 같다 (DoD 8)', async () => {
    const source = await plantGuideWithAsset();
    const first = await store().exportGuideToJson(source.id);
    const result = await importText(first!.text);

    const again = await store().exportGuideToJson(result.guideId!);
    const a = JSON.parse(first!.text).assetData as Record<string, string>;
    const b = JSON.parse(again!.text).assetData as Record<string, string>;

    // 키(자산 ID)는 새로 발급돼 다르지만 담긴 데이터는 한 벌이고 같아야 한다.
    expect(Object.keys(b)).toHaveLength(1);
    expect(Object.values(b)).toEqual(Object.values(a));
  });
});

describe('가져오기 실패 (DoD 4)', () => {
  it('손상 JSON은 어떤 레코드도 만들지 않는다', async () => {
    const before = await context.guides.list();
    const writes = { ...context.writes };

    const result = await importText('{ 손상 }');

    expect(result.ok).toBe(false);
    expect(await context.guides.list()).toEqual(before);
    expect(context.writes).toEqual(writes);
  });

  it('실패가 열려 있는 문서를 건드리지 않는다', async () => {
    const source = makeGuide();
    await context.guides.save(source);
    await store().loadGuide(source.id);
    store().updateMeta({ title: '편집 중' });

    await importText('[]');

    expect(store().document?.id).toBe(source.id);
    expect(store().document?.meta.title).toBe('편집 중');
  });

  it('기존 가이드를 덮어쓰지 않고 새로 만든다', async () => {
    const source = makeGuide();
    await context.guides.save(source);
    const exported = await store().exportGuideToJson(source.id);

    // 같은 문서를 그대로 다시 가져온다. 파일 안의 id는 source.id다.
    const result = await importText(exported!.text);

    expect(result.guideId).not.toBe(source.id);
    expect(await context.guides.get(source.id)).toEqual(source);
    expect((await context.guides.list()).length).toBe(2);
  });

  it('자산이 깨졌으면 문서도 만들지 않는다', async () => {
    const source = await plantGuideWithAsset();
    const exported = await store().exportGuideToJson(source.id);
    const payload = JSON.parse(exported!.text);
    payload.assetData[source.assets[0]!.id] = 'data:image/png;base64,AAAA';

    const before = (await context.guides.list()).length;
    const result = await importText(canonicalJson(payload));

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(ISSUE_CODES.ASSET_CHECKSUM_MISMATCH);
    // 문서만 들어가고 자산이 빠지면 ASSET_REF_NOT_FOUND인 가이드가 남는다.
    expect((await context.guides.list()).length).toBe(before);
  });
});

describe('마이그레이션 (DoD 5·6)', () => {
  it('경로 없는 낮은 버전은 저장소를 건드리지 않는다', async () => {
    const source = makeGuide();
    await context.guides.save(source);
    const exported = await store().exportGuideToJson(source.id);
    const older = JSON.stringify({ ...JSON.parse(exported!.text), schemaVersion: '0.9' });

    const before = (await context.guides.list()).length;
    const result = await importText(older);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.MIGRATION_UNAVAILABLE]);
    expect((await context.guides.list()).length).toBe(before);
  });

  it('높은 major는 편집 상태로 강등되지 않는다 (DoD 6)', async () => {
    const source = makeGuide();
    await context.guides.save(source);
    const exported = await store().exportGuideToJson(source.id);
    const newer = JSON.stringify({ ...JSON.parse(exported!.text), schemaVersion: '2.0' });

    const result = await importText(newer);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      ISSUE_CODES.UNSUPPORTED_SCHEMA_MAJOR,
    ]);
    expect((await context.guides.list()).length).toBe(1);
  });

  it('트랜잭션 보장이 깨져도 스냅샷이 부분 결과를 지운다 (2겹째, INV-08)', async () => {
    // `withSnapshot`은 두 겹으로 막는다 - 트랜잭션 롤백과 스냅샷 복귀다.
    // 아래 테스트는 1겹만 본다. Dexie가 알아서 되돌리므로 `rollbackTo`를 지워도
    // 통과한다(음성 검증에서 확인). 여기서는 트랜잭션이 롤백하지 **않는**
    // 백엔드를 넣어 2겹째만 남긴다. 조기 커밋·브라우저 종료가 그런 상황이다.
    const source = await plantGuideWithAsset();
    const exported = await store().exportGuideToJson(source.id);
    const before = (await context.guides.list()).length;

    const leaky: StorageBackend = {
      ...context.backend,
      // 콜백을 그냥 돌린다. 예외가 나도 앞서 쓴 것을 되돌리지 않는다.
      transaction: (run) =>
        run({
          guides: context.backend.guides,
          assets: {
            ...context.backend.assets,
            put: async () => {
              throw new Error('자산 저장 실패');
            },
          },
          recovery: context.backend.recovery,
          waitFor: async (promise) => promise,
        }),
    };

    configureGuideStore({
      guides: context.guides,
      assets: context.assets,
      recovery: new RecoveryRepository(leaky),
      mode: context.backend.mode,
      newId: nextId,
      now: () => FIXED_NOW,
    });

    await expect(importText(exported!.text)).rejects.toThrow('자산 저장 실패');

    // 문서 put은 실제로 성공했다. 스냅샷이 없으면 그 문서가 그대로 남는다.
    expect((await context.guides.list()).length).toBe(before);
  });

  it('가져오기 중 저장이 실패하면 부분 결과가 남지 않는다 (1겹째, INV-08)', async () => {
    const source = await plantGuideWithAsset();
    const exported = await store().exportGuideToJson(source.id);
    const before = (await context.guides.list()).length;

    // 자산 쓰기에서만 터뜨린다. 문서는 이미 들어간 뒤다.
    const realPut = context.backend.assets.put.bind(context.backend.assets);
    const original = context.backend.transaction.bind(context.backend);
    context.backend.transaction = (run) =>
      original((tx) =>
        run({
          ...tx,
          assets: {
            ...tx.assets,
            put: async () => {
              throw new Error('자산 저장 실패');
            },
          },
        }),
      );

    await expect(importText(exported!.text)).rejects.toThrow('자산 저장 실패');

    context.backend.transaction = original;
    void realPut;

    // 스냅샷이 existed:false였으므로 부분 결과가 지워져야 한다.
    expect((await context.guides.list()).length).toBe(before);
  });

  it('복구 스냅샷이 남지 않는다', async () => {
    const source = makeGuide();
    await context.guides.save(source);
    const exported = await store().exportGuideToJson(source.id);

    await importText(exported!.text);

    // 성공한 작업의 스냅샷은 같은 커밋에서 사라진다. 남으면 나중에 restore가
    // existed:false를 적용해 방금 만든 가이드를 지운다.
    expect(await context.recovery.list()).toEqual([]);
  });
});

describe('내보낸 파일이 픽스처와 같은 형식이다', () => {
  it('parseGuideDocument가 그대로 읽는다', async () => {
    const source = await plantGuideWithAsset();
    const exported = await store().exportGuideToJson(source.id);

    const outcome = parseGuideDocument(JSON.parse(exported!.text));
    expect(outcome.ok).toBe(true);
    expect(outcome.document).toEqual(source);
  });

  it('exportGuideJson과 스토어 경로가 같은 결과를 낸다', async () => {
    const source = await plantGuideWithAsset();
    const stored = await context.assets.listByGuide(source.id);

    const direct = exportGuideJson({
      document: source,
      assets: stored.map((asset) => ({
        id: asset.id,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
      })),
    });

    expect((await store().exportGuideToJson(source.id))!.text).toBe(direct.text);
  });
});
