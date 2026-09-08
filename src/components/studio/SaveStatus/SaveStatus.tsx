/**
 * 저장 상태 표시.
 *
 * 기준: v2 제품정의 §8 INV-07·INV-09. 하네스 P1 DoD 2.
 *
 * 저장 실패를 조용히 넘기지 않는다. 자료가 메모리에만 있다는 사실을 사용자가
 * 알아야 브라우저를 닫기 전에 복사해 둘 수 있다.
 *
 * 색만으로 구분하지 않는다. 상태마다 다른 **문구**가 나온다. (INV-09)
 */

import type { StorageMode } from '../../../storage/document.store.ts';
import type { SaveState } from '../../../store/studio.store.ts';
import styles from './SaveStatus.module.css';

export interface SaveStatusProps {
  saveState: SaveState;
  saveError?: string;
  storageMode: StorageMode | null;
  storageUnavailableReason?: string;
}

function label(saveState: SaveState, dirtyMemory: boolean): string {
  if (saveState === 'saving') return '저장 중';
  if (saveState === 'error') return '저장하지 못했습니다';
  if (saveState === 'saved') return dirtyMemory ? '이 탭에만 있습니다' : '저장됨';
  return '';
}

export function SaveStatus({
  saveState,
  saveError,
  storageMode,
  storageUnavailableReason,
}: SaveStatusProps) {
  const memoryOnly = storageMode === 'memory';
  const text = label(saveState, memoryOnly);

  if (text === '' && !memoryOnly) return null;

  return (
    <div className={styles.wrapper}>
      {text === '' ? null : (
        <p className={styles.state} role="status" data-state={saveState} data-testid="save-state">
          {text}
        </p>
      )}

      {saveState === 'error' && saveError !== undefined ? (
        <p className={styles.detail} data-testid="save-error">
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
