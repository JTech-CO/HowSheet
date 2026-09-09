/**
 * 담을 것 고르기.
 *
 * 기준: v2 제품정의 §4(요소 10종). 하네스 P2 할 일 1, DoD 1·4.
 *
 * 토글 버튼을 쓴다. 체크박스로 두면 "고르지 않아도 된다"는 성질이 화면에서
 * 잘 드러나지만, 열 개가 세로로 늘어서 자료 영역을 화면 밖으로 밀어낸다.
 * 버튼 격자는 접히면서도 각 항목이 눌린 상태를 그대로 보인다.
 *
 * `components/ui`에 두지 않는다. 요소 목록이라는 도메인을 알기 때문이다.
 * (하네스 P2 주의, `UI_DOMAIN_INDEPENDENCE`)
 */

import { ELEMENTS, type ElementId } from '../../../domain/spec.types.ts';
import styles from './ElementPicker.module.css';

export interface ElementPickerProps {
  selected: readonly ElementId[];
  onToggle: (id: ElementId) => void;
}

export function ElementPicker({ selected, onToggle }: ElementPickerProps) {
  return (
    <div className={styles.wrapper}>
      <ul className={styles.grid} aria-label="담을 요소">
        {ELEMENTS.map((element) => {
          const chosen = selected.includes(element.id);
          return (
            <li key={element.id} className={styles.cell}>
              <button
                type="button"
                className={[styles.element, 'focus-ring'].join(' ')}
                /*
                  누른 상태를 색이 아니라 표시와 글자 굵기로도 드러낸다.
                  색만으로 표현하면 색각 이상이나 고대비 모드에서 상태를 읽을
                  수 없다. (INV-09, DoD 4)
                */
                aria-pressed={chosen}
                data-chosen={chosen}
                data-testid={'element-' + element.id}
                onClick={() => onToggle(element.id)}
              >
                <span className={styles.mark} aria-hidden="true">
                  {chosen ? '\u2713' : ''}
                </span>
                <span className={styles.body}>
                  <span className={styles.label}>{element.label}</span>
                  <span className={styles.hint}>{element.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected.length === 0 ? (
        // 0개도 정상이다. 막지 않고, 그때 무슨 일이 생기는지 알린다. (DoD 1)
        <p className={styles.note} data-testid="elements-empty">
          아직 고른 요소가 없습니다. 이대로 진행하면 자료를 보고 정합니다.
        </p>
      ) : (
        <p className={styles.note} data-testid="elements-chosen">
          {selected.length}개를 골랐습니다. 다시 누르면 해제됩니다.
        </p>
      )}
    </div>
  );
}
