/**
 * 준비물 확인.
 *
 * 기준: FR-003, 디자인 백서 §2.4.3·§2.4.10. 하네스 M7 DoD 1.
 *
 * 필수 항목을 모두 체크해야 첫 단계로 들어갈 수 있다. 선택 항목은 게이트가
 * 아니지만 목록에는 남긴다 - 독자가 무엇이 필요한지 알아야 한다.
 *
 * 체크 상태는 진행 모델에 자리가 없다(기술 §2.3.3). 화면이 들고 있고 저장하지
 * 않는다. 이어하기는 이 게이트를 지나지 않으므로 재체크를 강요하지 않는다.
 */

import type { PreparationItem } from '../../../domain/guide.types.ts';
import { Checkbox } from '../../ui/Checkbox/Checkbox.tsx';
import styles from './PreparationChecklist.module.css';

export interface PreparationChecklistProps {
  items: readonly PreparationItem[];
  checkedIds: ReadonlySet<string>;
  onToggle: (itemId: string, checked: boolean) => void;
}

export function PreparationChecklist({ items, checkedIds, onToggle }: PreparationChecklistProps) {
  // 준비물이 없으면 섹션 자체를 그리지 않는다. (디자인 §2.4.3)
  if (items.length === 0) return null;

  const ordered = [...items].sort((a, b) => a.order - b.order);

  return (
    <section className={styles.section} aria-labelledby="reader-preparation">
      <h2 id="reader-preparation" className={styles.title}>
        준비물
      </h2>
      <ul className={styles.list} role="list" data-testid="preparation-list">
        {ordered.map((item) => (
          <li key={item.id} className={styles.item} data-testid="preparation-item">
            <Checkbox
              label={item.label}
              checked={checkedIds.has(item.id)}
              data-testid="preparation-check"
              onChange={(event) => onToggle(item.id, event.target.checked)}
            />
            {item.required ? null : <span className={styles.optional}>선택</span>}
            {item.detail === undefined ? null : <p className={styles.detail}>{item.detail}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
