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
  /** 대시보드 카드가 보여 주는 대상 사용자 요약. (디자인 §2.4.1) */
  audience?: string;
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
    ...(guide.meta.audience === undefined ? {} : { audience: guide.meta.audience }),
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
   * 삭제가 트랜잭션이므로 정상 경로에서는 지울 것이 없다. 브라우저가 트랜잭션
   * 도중에 죽거나 이전 버전이 남긴 찌꺼기를 치우기 위한 경로다.
   *
   * **지금 제품 코드에 호출자가 없다. 의도된 것이다.**
   *
   * 고아 판정 기준이 "`guides`에 그 id가 있는가" 하나뿐이라, 버려도 되는
   * 찌꺼기와 아직 복구에 필요한 증거가 같은 모양으로 보인다. 부분 커밋으로
   * `guides` 행만 사라진 상태에서 남은 `existed: true` 스냅샷은 그 문서의
   * 마지막 사본이고, 이 함수는 그것을 지운다. 시작 시 자동 호출은 INV-08이
   * 지키라고 한 바로 그 스냅샷을 없앤다.
   *
   * 호출하려면 셋을 먼저 만족해야 한다.
   *   1. 진행 중인 `withSnapshot`이 없음이 보장될 것. `capture()` 커밋 직후부터
   *      작업 트랜잭션이 스냅샷을 지우기 전까지 정상 진행 중인 상태가 고아로
   *      보인다.
   *   2. 살아 있는 스냅샷의 `assetIds`를 고아 자산 판정에서 제외할 것.
   *      스냅샷만 살려 두면 그것이 가리키는 이미지가 사라져 반쪽 복구가 된다.
   *   3. 다른 탭이 같은 저장소를 쓰고 있지 않음이 보장될 것. 지금 저장소에는
   *      탭 간 조정 장치가 없다.
   *
   * 사용자가 누르는 정리 경로는 M12 데이터 관리 화면에서 붙인다. 자동 실행은
   * 복구 화면과 가져오기 실패 처리가 생기는 M8 뒤에 다시 판단한다.
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
