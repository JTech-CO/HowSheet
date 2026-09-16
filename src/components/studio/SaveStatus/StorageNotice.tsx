/**
 * 저장이 어긋났을 때의 자세한 안내.
 *
 * 기준: v2 제품정의 §8 INV-07·INV-10. 하네스 P1 DoD 2.
 *
 * 헤더가 아니라 본문 맨 위에 그린다. 헤더에 문단을 넣었더니 좁은 화면에서 상자가
 * 세로로 길어지며 위쪽이 잘리고 본문을 덮었다. 읽어야 할 내용일수록 흐름 안에
 * 둔다. (출시 점검 2026-09-16)
 */

import type { StorageMode } from '../../../storage/document.store.ts';
import type { SaveState } from '../../../store/studio.store.ts';
import styles from './SaveStatus.module.css';

export interface StorageNoticeProps {
  saveState: SaveState;
  saveError?: string;
  storageMode: StorageMode | null;
  storageUnavailableReason?: string;
}

export function StorageNotice({
  saveState,
  saveError,
  storageMode,
  storageUnavailableReason,
}: StorageNoticeProps) {
  const memoryOnly = storageMode === 'memory';
  const failed = saveState === 'error' && saveError !== undefined;

  if (!memoryOnly && !failed) return null;

  return (
    <div className={styles.notice} data-print="hide">
      {failed ? (
        <p className={styles.detail} role="status" data-testid="save-error">
          {saveError} 자료는 화면에 그대로 있습니다. 중요한 내용은 복사해 두세요.
        </p>
      ) : null}

      {memoryOnly ? (
        <p className={styles.detail} role="alert" data-testid="storage-memory">
          <strong>이 브라우저에서 저장소를 쓸 수 없습니다.</strong> 작업 내용이 이 탭에만 있습니다.
          새로고침하거나 탭을 닫으면 사라집니다.
          {storageUnavailableReason === undefined ? null : (
            <span className={styles.reason}> ({storageUnavailableReason})</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
