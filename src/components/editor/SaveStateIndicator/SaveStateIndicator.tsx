/**
 * 저장 상태 표시.
 *
 * 기준: 기술 백서 §2.2.1-5(저장 중 → 저장됨 → 저장 실패), 하네스 M4 DoD 8.
 *
 * 시각 표시와 스크린 리더 전달이 같은 문장을 쓴다. `role="status"`로 두어
 * 상태가 바뀔 때마다 보조 기술이 읽는다.
 */

import type { SaveState } from '../../../store/guide.store.ts';
import styles from './SaveStateIndicator.module.css';

export interface SaveStateIndicatorProps {
  state: SaveState;
  dirty: boolean;
  error?: string;
}

export function saveStateLabel(state: SaveState, dirty: boolean): string {
  switch (state) {
    case 'saving':
      return '저장 중';
    case 'saved':
      return '저장됨';
    case 'error':
      return '저장 실패';
    default:
      return dirty ? '변경됨' : '저장할 변경 없음';
  }
}

export function SaveStateIndicator({ state, dirty, error }: SaveStateIndicatorProps) {
  const label = saveStateLabel(state, dirty);

  return (
    <p
      className={styles.indicator}
      data-state={state}
      data-dirty={dirty ? 'true' : 'false'}
      data-testid="save-state"
      role="status"
      aria-live="polite"
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
      {state === 'error' && error !== undefined ? (
        <span className={styles.detail}> — {error}</span>
      ) : null}
    </p>
  );
}
