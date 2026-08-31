/**
 * 복구 스냅샷.
 *
 * 기준: 기술 백서 §4.1.3("삭제·대규모 가져오기 전에는 복구 스냅샷을 남긴다"),
 * §4.5.1, §4.6. 하네스 M3 DoD 4, INV-08.
 *
 * 가져오기·대량 변경은 반드시 `withSnapshot`을 거친다. 두 겹으로 막는다.
 *
 *   1. 작업 전체를 **트랜잭션**으로 감싼다. 실패하면 문서와 자산 Blob이 함께
 *      되돌아간다. 자산은 스냅샷에 담기지 않으므로 이 겹이 없으면 실패한
 *      가져오기가 이미지 바이트를 영구히 지운다.
 *   2. 트랜잭션 밖에 **스냅샷**을 먼저 남긴다. 트랜잭션 보장이 깨진 경우(조기
 *      커밋, 브라우저 종료)에도 문서를 되돌릴 근거가 된다.
 *
 * 성공하면 스냅샷은 같은 트랜잭션 안에서 사라진다. 남겨 두면 나중에 더 새로운
 * 작업을 조용히 덮어쓰는 시한폭탄이 된다.
 */

import type {
  RecoveryReason,
  RecoverySnapshot,
  StorageBackend,
  StorageTransactionScope,
} from './db.ts';
import type { GuideDocument } from '../domain/guide.types.ts';

export interface SnapshotOptions {
  reason: RecoveryReason;
  now: string;
}

export interface RestoreResult {
  /** 스냅샷이 있어 되돌렸으면 true. */
  restored: boolean;
  /**
   * 되돌리기 **직전**의 문서. 호출자가 "복원 취소"를 제공할 수 있다.
   * 없으면 그 시점에 문서가 없었다는 뜻이다.
   */
  replaced?: GuideDocument;
  /** 스냅샷이 가리키지만 지금은 없는 자산 ID. 재연결 안내에 쓴다. */
  missingAssets: string[];
}

export class RecoveryRepository {
  constructor(private readonly backend: StorageBackend) {}

  /**
   * 현재 저장된 문서로 스냅샷을 만든다. 가이드당 하나만 유지한다.
   *
   * 아직 없는 가이드도 `existed: false`로 기록한다. 새 가이드를 만드는
   * 가져오기가 실패했을 때 "원래 없었음"으로 되돌릴 근거가 필요하다. (INV-08)
   */
  async capture(guideId: string, options: SnapshotOptions): Promise<RecoverySnapshot> {
    return this.backend.transaction(async (tx) => {
      const guide = await tx.guides.get(guideId);
      const assets = await tx.assets.where('guideId', guideId);

      const snapshot: RecoverySnapshot = {
        guideId,
        createdAt: options.now,
        reason: options.reason,
        existed: guide !== undefined,
        assetIds: assets.map((asset) => asset.id).sort(),
        ...(guide === undefined ? {} : { document: guide }),
      };

      await tx.recovery.put(snapshot);
      return snapshot;
    });
  }

  async get(guideId: string): Promise<RecoverySnapshot | undefined> {
    return this.backend.recovery.get(guideId);
  }

  async list(): Promise<RecoverySnapshot[]> {
    return this.backend.recovery.toArray();
  }

  async discard(guideId: string): Promise<void> {
    await this.backend.recovery.delete(guideId);
  }

  /**
   * 스냅샷 시점의 상태로 되돌린다. 스냅샷이 없으면 `restored: false`다.
   *
   * 되돌리기는 **한 번만** 된다. 적용한 스냅샷은 같은 트랜잭션에서 지운다.
   * 남겨 두면 같은 스냅샷이 두 번째로 적용되면서 그 사이의 편집을 통째로
   * 날린다. 직전 문서는 `replaced`로 돌려주므로 호출자가 되돌리기를 취소할 수
   * 있다.
   */
  async restore(guideId: string): Promise<RestoreResult> {
    return this.backend.transaction(async (tx) => {
      const snapshot = await tx.recovery.get(guideId);
      if (snapshot === undefined) return { restored: false, missingAssets: [] };

      const current = await tx.guides.get(guideId);
      await applySnapshot(tx, snapshot);

      const stored = new Set((await tx.assets.where('guideId', guideId)).map((asset) => asset.id));
      const missingAssets = snapshot.assetIds.filter((id) => !stored.has(id));

      await tx.recovery.delete(guideId);

      return {
        restored: true,
        missingAssets,
        ...(current === undefined ? {} : { replaced: current }),
      };
    });
  }

  /** 스냅샷이 가리키지만 지금은 없는 자산 ID. 복원 전 미리 보여 줄 때 쓴다. */
  async missingAssets(guideId: string): Promise<string[]> {
    return this.backend.transaction(async (tx) => {
      const snapshot = await tx.recovery.get(guideId);
      if (snapshot === undefined) return [];

      const stored = new Set((await tx.assets.where('guideId', guideId)).map((asset) => asset.id));
      return snapshot.assetIds.filter((id) => !stored.has(id));
    });
  }

  /**
   * 스냅샷을 남기고 작업을 수행한다. 실패하면 되돌리고 예외를 다시 던진다.
   *
   * `run`은 트랜잭션 스코프를 받는다. 그 안에서는 `tx.guides` 같은 스코프
   * 컬렉션만 쓰고, 저장소 밖의 Promise는 `tx.waitFor()`로 기다린다.
   *
   * 가져오기 실패가 현재 열려 있는 문서나 기존 레코드를 바꾸지 않아야 한다.
   * 새 가이드를 만드는 가져오기가 실패하면 부분 결과(문서·자산)를 지운다.
   * (INV-08, M8 DoD 4)
   */
  async withSnapshot<T>(
    guideId: string,
    options: SnapshotOptions,
    run: (tx: StorageTransactionScope) => Promise<T>,
  ): Promise<T> {
    const snapshot = await this.capture(guideId, options);

    try {
      return await this.backend.transaction(async (tx) => {
        const result = await run(tx);
        // 성공한 작업의 스냅샷은 같은 커밋에서 사라진다. 롤백되면 스냅샷도
        // 함께 되살아나므로 실패 경로의 근거는 그대로 남는다.
        await tx.recovery.delete(guideId);
        return result;
      });
    } catch (error) {
      try {
        await this.rollbackTo(snapshot);
        // 되돌리기가 끝났으면 스냅샷은 할 일을 다 했다. 남겨 두면 나중에
        // `restore`가 이미 정리된 상태를 한 번 더 적용한다. `existed: false`
        // 스냅샷이 남으면 같은 ID로 새로 만든 가이드를 지워 버린다.
        await this.discard(guideId);
      } catch {
        // 되돌리기까지 실패했으면 스냅샷을 남긴 채 원래 오류를 그대로 올린다.
        // 사용자는 복구 화면에서 다시 시도할 수 있다.
      }
      throw error;
    }
  }

  /** 트랜잭션이 지켜 주지 못한 경우를 대비한 두 번째 겹. */
  private async rollbackTo(snapshot: RecoverySnapshot): Promise<void> {
    await this.backend.transaction((tx) => applySnapshot(tx, snapshot));
  }
}

/**
 * 스냅샷 상태를 문서에 적용한다.
 * `existed: false`면 "원래 없었음"이므로 문서와 그 자산을 지운다.
 */
async function applySnapshot(
  tx: StorageTransactionScope,
  snapshot: RecoverySnapshot,
): Promise<void> {
  if (snapshot.existed && snapshot.document !== undefined) {
    await tx.guides.put(snapshot.document);
    return;
  }

  for (const asset of await tx.assets.where('guideId', snapshot.guideId)) {
    await tx.assets.delete(asset.id);
  }
  await tx.guides.delete(snapshot.guideId);
}

/** 문서 스냅샷을 JSON 문자열로. 저장소를 쓸 수 없을 때의 백업 경로다. */
export function snapshotToJson(document: GuideDocument): string {
  return JSON.stringify(document, null, 2);
}
