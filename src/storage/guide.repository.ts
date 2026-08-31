/**
 * 가이드 CRUD·복제·삭제.
 *
 * 기준: 기술 백서 §4.3.2(저장 규칙), §4.5, §4.6. 하네스 M3 DoD 1~3.
 *
 * 문서 저장은 `guides` 테이블만 건드린다. 텍스트를 고칠 때마다 이미지 Blob을
 * 다시 쓰지 않기 위해서다. (M3 주의)
 */

import {
  type RecoverySnapshot,
  type StorageBackend,
  type StoredAsset,
  type StoredGuide,
} from './db.ts';
import type { GuideDocument } from '../domain/guide.types.ts';

/** 대시보드 목록에 필요한 만큼만 담은 요약. 문서 전체를 읽지 않는다. */
export interface GuideSummary {
  id: string;
  title: string;
  updatedAt: string;
  revision: number;
  stepCount: number;
}

export interface DuplicateOptions {
  /** 새 문서 ID. */
  newGuideId: string;
  /** 자산 ID 생성기. 자산은 테이블 전역이라 복제 시 반드시 새로 만든다. */
  newAssetId: () => string;
  now: string;
  title?: string;
}

function summarize(guide: StoredGuide): GuideSummary {
  return {
    id: guide.id,
    title: guide.meta.title,
    updatedAt: guide.updatedAt,
    revision: guide.revision,
    stepCount: guide.steps.length,
  };
}

export class GuideRepository {
  constructor(private readonly backend: StorageBackend) {}

  /** 최근 수정 순 목록. */
  async list(): Promise<GuideSummary[]> {
    const guides = await this.backend.guides.toArray();
    return guides
      .map(summarize)
      .sort((a, b) => (a.updatedAt === b.updatedAt ? 0 : a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async get(id: string): Promise<GuideDocument | undefined> {
    return this.backend.guides.get(id);
  }

  async exists(id: string): Promise<boolean> {
    return (await this.backend.guides.get(id)) !== undefined;
  }

  /**
   * 문서를 저장한다. 자산 테이블은 건드리지 않는다.
   * 호출자가 `updatedAt`을 갱신해서 넘긴다. 저장소가 시각을 만들지 않아야
   * 테스트가 결정론적이다.
   */
  async save(document: GuideDocument): Promise<void> {
    await this.backend.guides.put(document);
  }

  /**
   * 가이드와 그 자산을 **한 트랜잭션에서** 지운다.
   * 중간에 실패하면 문서도 자산도 남는다. 고아 자산이 생기지 않는다. (M3 DoD 2)
   */
  async remove(id: string): Promise<void> {
    await this.backend.transaction(async (tx) => {
      const assets = await tx.assets.where('guideId', id);
      for (const asset of assets) {
        await tx.assets.delete(asset.id);
      }
      await tx.recovery.delete(id);
      await tx.guides.delete(id);
    });
  }

  /**
   * 가이드를 복제한다.
   *
   * 문서 ID와 자산 ID를 새로 만들고, 이미지 블록의 `assetId` 참조를 새 ID로
   * 다시 연결한다. 단계·블록 ID는 문서 안에서만 의미가 있으므로 유지한다.
   * 원본은 어떤 경우에도 변경하지 않는다.
   */
  async duplicate(sourceId: string, options: DuplicateOptions): Promise<GuideDocument> {
    return this.backend.transaction(async (tx) => {
      const source = await tx.guides.get(sourceId);
      if (source === undefined) {
        throw new Error(`복제할 가이드를 찾을 수 없습니다: ${sourceId}`);
      }

      const sourceAssets = await tx.assets.where('guideId', sourceId);
      const assetIdMap = new Map<string, string>();
      for (const asset of sourceAssets) {
        assetIdMap.set(asset.id, options.newAssetId());
      }

      const copy: GuideDocument = {
        ...structuredClone(source),
        id: options.newGuideId,
        revision: 1,
        createdAt: options.now,
        updatedAt: options.now,
        meta: {
          ...structuredClone(source.meta),
          title: options.title ?? `${source.meta.title} (사본)`,
        },
        assets: source.assets.map((item) => ({
          ...item,
          id: assetIdMap.get(item.id) ?? item.id,
        })),
        steps: structuredClone(source.steps).map((step) => ({
          ...step,
          blocks: step.blocks.map((block) =>
            block.type === 'image'
              ? { ...block, assetId: assetIdMap.get(block.assetId) ?? block.assetId }
              : block,
          ),
        })),
      };

      const copiedAssets: StoredAsset[] = sourceAssets.map((asset) => ({
        ...asset,
        id: assetIdMap.get(asset.id) ?? asset.id,
        guideId: options.newGuideId,
        createdAt: options.now,
      }));

      await tx.guides.put(copy);
      for (const asset of copiedAssets) {
        await tx.assets.put(asset);
      }

      return copy;
    });
  }

  /**
   * 어떤 가이드에도 속하지 않는 자산.
   * 삭제가 트랜잭션이라 정상 경로에서는 항상 빈 배열이다. (M3 DoD 2)
   *
   * 두 테이블을 트랜잭션 안에서 함께 읽는다. 밖에서 각각 읽으면 그 사이에 끼어든
   * 쓰기 때문에 없는 고아를 보고하거나 있는 고아를 놓친다.
   */
  async findOrphanAssets(): Promise<StoredAsset[]> {
    return this.backend.transaction(async (tx) => {
      const guides = await tx.guides.toArray();
      const assets = await tx.assets.toArray();
      const ids = new Set(guides.map((guide) => guide.id));
      return assets.filter((asset) => !ids.has(asset.guideId));
    });
  }

  /** 어떤 가이드에도 속하지 않는 복구 스냅샷. */
  async findOrphanSnapshots(): Promise<RecoverySnapshot[]> {
    return this.backend.transaction(async (tx) => {
      const guides = await tx.guides.toArray();
      const snapshots = await tx.recovery.toArray();
      const ids = new Set(guides.map((guide) => guide.id));
      return snapshots.filter((snapshot) => !ids.has(snapshot.guideId));
    });
  }

  /**
   * 고아 자산·스냅샷을 실제로 지운다.
   *
   * 삭제가 트랜잭션이므로 정상 경로에서는 지울 것이 없다. 하지만 브라우저가
   * 트랜잭션 도중에 죽거나 이전 버전이 남긴 찌꺼기가 있을 수 있고, 자산 Blob은
   * 용량을 크게 먹으므로 "찾기"만 있고 "치우기"가 없으면 안 된다. 시작 시점의
   * 청소 경로다. (기술 §4.6)
   */
  async removeOrphans(): Promise<{ assets: string[]; snapshots: string[] }> {
    return this.backend.transaction(async (tx) => {
      const ids = new Set((await tx.guides.toArray()).map((guide) => guide.id));

      const assets: string[] = [];
      for (const asset of await tx.assets.toArray()) {
        if (ids.has(asset.guideId)) continue;
        await tx.assets.delete(asset.id);
        assets.push(asset.id);
      }

      const snapshots: string[] = [];
      for (const snapshot of await tx.recovery.toArray()) {
        if (ids.has(snapshot.guideId)) continue;
        await tx.recovery.delete(snapshot.guideId);
        snapshots.push(snapshot.guideId);
      }

      return { assets: assets.sort(), snapshots: snapshots.sort() };
    });
  }

  /** 전체 데이터 초기화. 가이드별 삭제와 분리된 경로다. (기술 §7.2) */
  async clearAll(): Promise<void> {
    await this.backend.transaction(async (tx) => {
      await tx.assets.clear();
      await tx.recovery.clear();
      await tx.guides.clear();
    });
  }
}
