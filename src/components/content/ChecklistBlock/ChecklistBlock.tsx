/**
 * 체크리스트 블록.
 *
 * 기준: FR-006, 디자인 백서 §5.6.3.
 *
 * 체크 상태는 이 컴포넌트가 갖지 않는다. 작성기 미리보기와 리더는 상태의
 * 출처가 다르고(초안 스냅샷 대 `ReaderProgress`), 컴포넌트가 자기 상태를 들면
 * 두 화면의 진행이 갈린다. (기술 §2.2.1-7, INV-09)
 */

import type { ChecklistItem } from '../../../domain/guide.types.ts';
import styles from './ChecklistBlock.module.css';

export interface ChecklistBlockProps {
  items: ChecklistItem[];
  /** 체크된 항목 ID. 넘기지 않으면 모두 해제 상태다. */
  checkedIds?: readonly string[];
  /** 없으면 읽기 전용으로 그린다. 미리보기·인쇄에서 쓴다. */
  onToggle?: (itemId: string, checked: boolean) => void;
}

export function ChecklistBlock({ items, checkedIds = [], onToggle }: ChecklistBlockProps) {
  const checked = new Set(checkedIds);
  const readOnly = onToggle === undefined;

  return (
    <ul className={styles.list} role="list" data-testid="checklist-block">
      {items.map((item) => (
        <li className={styles.item} key={item.id}>
          <label className={styles.label}>
            <input
              className={[styles.input, 'focus-ring'].join(' ')}
              type="checkbox"
              checked={checked.has(item.id)}
              disabled={readOnly}
              onChange={(event) => onToggle?.(item.id, event.target.checked)}
            />
            <span>
              {item.label}
              {item.required ? null : <span className={styles.optional}> (선택)</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
