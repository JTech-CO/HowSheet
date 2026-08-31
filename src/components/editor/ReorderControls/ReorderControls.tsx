/**
 * 키보드·모바일 재정렬 컨트롤.
 *
 * 기준: FR-018(드래그 없이 순서 변경), 디자인 백서 §2.2.1(재정렬).
 *
 * 드래그는 M11에서 dnd-kit으로 얹는다. 그때도 이 버튼은 남는다. 드래그만
 * 제공하면 키보드 사용자가 재정렬할 수 없다. (INV-13, 디자인 §1.4 원칙 5)
 */

import { IconButton } from '../../ui/IconButton/IconButton.tsx';
import styles from './ReorderControls.module.css';

export interface ReorderControlsProps {
  /** 1부터 세는 현재 위치. 라벨과 알림 문장에 쓴다. */
  position: number;
  total: number;
  itemLabel: string;
  onMove: (delta: number) => void;
}

/** "4단계 중 2번째로 이동됨" — 이동 후 라이브 영역에 알릴 문장. (디자인 §2.2.1) */
export function reorderAnnouncement(itemLabel: string, position: number, total: number): string {
  return `${itemLabel}이(가) ${total}개 중 ${position}번째로 이동됨`;
}

export function ReorderControls({ position, total, itemLabel, onMove }: ReorderControlsProps) {
  return (
    <div className={styles.controls}>
      <IconButton
        label={`${itemLabel} 위로 이동`}
        disabled={position <= 1}
        onClick={() => onMove(-1)}
      >
        ↑
      </IconButton>
      <IconButton
        label={`${itemLabel} 아래로 이동`}
        disabled={position >= total}
        onClick={() => onMove(1)}
      >
        ↓
      </IconButton>
    </div>
  );
}
