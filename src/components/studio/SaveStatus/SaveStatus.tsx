/**
 * 저장 상태 표시.
 *
 * 기준: v2 제품정의 §8 INV-07·INV-09·INV-10. 하네스 P1 DoD 2.
 *
 * 저장 실패를 조용히 넘기지 않는다. 자료가 메모리에만 있다는 사실을 사용자가
 * 알아야 브라우저를 닫기 전에 복사해 둘 수 있다.
 *
 * 색만으로 구분하지 않는다. 상태마다 다른 **문구**가 나온다. (INV-09)
 *
 * ## 짧은 이름표만 헤더에 둔다
 *
 * 설명 상자까지 헤더에 넣었더니 320px에서 폭 44px·높이 1,079px로 늘어나 위쪽이
 * 화면 밖으로 나가고 본문을 덮었다. 헤더는 한두 줄짜리 sticky 막대라 문단을
 * 담을 자리가 아니다. 자세한 안내는 `StorageNotice`가 본문 맨 위에서 보여 준다.
 * (출시 점검 2026-09-16)
 */

import type { StorageMode } from '../../../storage/document.store.ts';
import type { SaveState } from '../../../store/studio.store.ts';
import styles from './SaveStatus.module.css';

export interface SaveStatusProps {
  saveState: SaveState;
  storageMode: StorageMode | null;
}

function saveStatusLabel(saveState: SaveState, dirtyMemory: boolean): string {
  if (saveState === 'saving') return '저장 중';
  if (saveState === 'error') return '저장하지 못했습니다';
  if (saveState === 'saved') return dirtyMemory ? '이 탭에만 있습니다' : '저장됨';
  return '';
}

export function SaveStatus({ saveState, storageMode }: SaveStatusProps) {
  const text = saveStatusLabel(saveState, storageMode === 'memory');

  if (text === '') return null;

  return (
    <p
      className={styles.state}
      role="status"
      data-print="hide"
      data-state={saveState}
      data-testid="save-state"
    >
      {text}
    </p>
  );
}
