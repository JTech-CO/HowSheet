/**
 * 메모리 모드 배너.
 *
 * 기준: 기술 백서 §7.5, 하네스 M3 DoD 6.
 *
 * IndexedDB를 쓸 수 없을 때 "새로고침하면 사라질 수 있음"을 계속 알리고
 * JSON 백업 경로를 함께 제시한다. 닫히는 토스트로 만들지 않는다. 배너가
 * 사라지면 사용자가 위험을 모른 채 오래 작업하게 된다.
 */

import type { StorageMode } from '../../../storage/db.ts';
import styles from './StorageUnavailableBanner.module.css';

export interface StorageUnavailableBannerProps {
  mode: StorageMode | null;
  reason?: string;
  /** JSON 백업 동작. M8 전에는 열린 문서를 파일로 내려받는 최소 경로다. */
  onBackup?: () => void;
}

export function StorageUnavailableBanner({
  mode,
  reason,
  onBackup,
}: StorageUnavailableBannerProps) {
  if (mode !== 'memory') return null;

  return (
    <div className={styles.banner} role="alert" data-testid="storage-banner">
      <div>
        <strong>이 브라우저에서 로컬 저장소를 쓸 수 없습니다.</strong>
        <p className={styles.body}>
          작업 내용이 메모리에만 있습니다. <b>페이지를 닫거나 새로고침하면 사라집니다.</b> 중요한
          내용은 JSON으로 내려받아 두세요.
          {reason === undefined ? null : <span className={styles.reason}> ({reason})</span>}
        </p>
      </div>
      {onBackup === undefined ? null : (
        <button
          type="button"
          className={[styles.action, 'focus-ring'].join(' ')}
          onClick={onBackup}
        >
          JSON으로 백업
        </button>
      )}
    </div>
  );
}
