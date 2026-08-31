/**
 * 이미지 자산 저장.
 *
 * 기준: 기술 백서 §4.3.2, §4.5.1. 하네스 M3 DoD 2, M5 DoD 8(checksum 중복 제거).
 *
 * 이미지 본문은 `assets` 테이블에만 있다. 문서에는 manifest 항목만 남으므로
 * 텍스트 수정이 Blob을 다시 쓰지 않는다. (M3 주의)
 */

import type { StorageBackend, StoredAsset } from './db.ts';
import type { AssetManifestItem } from '../domain/guide.types.ts';

export interface PutAssetInput {
  id: string;
  guideId: string;
  fileName: string;
  mimeType: string;
  checksum: string;
  blob: Blob;
  byteSize?: number;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface PutAssetResult {
  asset: StoredAsset;
  /** 같은 checksum의 자산이 이미 있어 기존 것을 재사용했으면 true. */
  deduplicated: boolean;
}

/**
 * 저장된 바이트를 Blob으로 되돌린다. 동기라서 트랜잭션 안에서도 안전하다.
 * `URL.createObjectURL`에 넘긴 뒤에는 반드시 해제한다. (기술 §9-9)
 */
export function toBlob(asset: StoredAsset): Blob {
  return new Blob([asset.bytes], { type: asset.mimeType });
}

/** 저장된 자산에서 문서에 넣을 manifest 항목을 만든다. */
export function toManifestItem(asset: StoredAsset): AssetManifestItem {
  const item: AssetManifestItem = {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    checksum: asset.checksum,
  };
  if (asset.width !== undefined) item.width = asset.width;
  if (asset.height !== undefined) item.height = asset.height;
  return item;
}

export class AssetRepository {
  constructor(private readonly backend: StorageBackend) {}

  /**
   * 자산을 저장한다.
   *
   * 같은 가이드 안에 같은 checksum이 이미 있으면 Blob을 다시 쓰지 않고 기존
   * 항목을 돌려준다. 같은 이미지를 두 번 올려도 저장 Blob이 중복되지 않는다.
   * (M5 DoD 8)
   */
  async put(input: PutAssetInput): Promise<PutAssetResult> {
    // Blob → ArrayBuffer 변환은 **트랜잭션 밖에서** 끝낸다. 저장소와 무관한
    // await를 트랜잭션 안에서 하면 IndexedDB 트랜잭션이 그 사이에 커밋된다.
    const bytes = await input.blob.arrayBuffer();

    // 중복 확인과 쓰기가 한 트랜잭션이어야 한다. 나뉘면 같은 이미지를 동시에
    // 두 번 올릴 때 둘 다 "없음"을 보고 바이트가 두 벌 저장된다. (M5 DoD 8)
    return this.backend.transaction(async (tx) => {
      const candidates = await tx.assets.where('checksum', input.checksum);
      const existing = candidates.find((asset) => asset.guideId === input.guideId);
      if (existing !== undefined) {
        return { asset: existing, deduplicated: true };
      }

      const asset: StoredAsset = {
        id: input.id,
        guideId: input.guideId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteSize: input.byteSize ?? bytes.byteLength,
        checksum: input.checksum,
        createdAt: input.createdAt,
        bytes,
        ...(input.width === undefined ? {} : { width: input.width }),
        ...(input.height === undefined ? {} : { height: input.height }),
      };

      await tx.assets.put(asset);
      return { asset, deduplicated: false };
    });
  }

  async get(id: string): Promise<StoredAsset | undefined> {
    return this.backend.assets.get(id);
  }

  async listByGuide(guideId: string): Promise<StoredAsset[]> {
    return this.backend.assets.where('guideId', guideId);
  }

  /** 같은 가이드 안에서 checksum이 일치하는 자산. */
  async findByChecksum(guideId: string, checksum: string): Promise<StoredAsset | undefined> {
    const candidates = await this.backend.assets.where('checksum', checksum);
    return candidates.find((asset) => asset.guideId === guideId);
  }

  async remove(id: string): Promise<void> {
    await this.backend.assets.delete(id);
  }

  /**
   * 문서가 더는 참조하지 않는 자산을 지운다.
   *
   * 문서와 자산을 함께 읽어야 하므로 트랜잭션 안에서 판단한다. 어떤 이미지
   * 블록도 가리키지 않고 manifest에도 없는 것만 지운다.
   */
  async removeUnreferenced(guideId: string): Promise<string[]> {
    return this.backend.transaction(async (tx) => {
      const guide = await tx.guides.get(guideId);
      if (guide === undefined) return [];

      const referenced = new Set<string>(guide.assets.map((item) => item.id));
      for (const step of guide.steps) {
        for (const block of step.blocks) {
          if (block.type === 'image') referenced.add(block.assetId);
        }
      }

      const stored = await tx.assets.where('guideId', guideId);
      const removed: string[] = [];
      for (const asset of stored) {
        if (referenced.has(asset.id)) continue;
        await tx.assets.delete(asset.id);
        removed.push(asset.id);
      }
      return removed;
    });
  }

  /** 가이드가 참조하지만 저장소에 없는 자산 ID. 가져오기 검증에 쓴다. */
  async findMissing(guideId: string): Promise<string[]> {
    return this.backend.transaction(async (tx) => {
      const guide = await tx.guides.get(guideId);
      if (guide === undefined) return [];

      const stored = new Set((await tx.assets.where('guideId', guideId)).map((asset) => asset.id));
      const referenced = new Set<string>(guide.assets.map((item) => item.id));
      for (const step of guide.steps) {
        for (const block of step.blocks) {
          if (block.type === 'image') referenced.add(block.assetId);
        }
      }

      return [...referenced].filter((id) => !stored.has(id)).sort();
    });
  }

  /** 가이드 자산의 총 바이트. 내보내기 예상 크기 계산의 입력이다. */
  async totalBytes(guideId: string): Promise<number> {
    const assets = await this.listByGuide(guideId);
    return assets.reduce((sum, asset) => sum + asset.byteSize, 0);
  }
}
