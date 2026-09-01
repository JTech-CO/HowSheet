/**
 * 선택 분기 블록.
 *
 * 기준: FR-006·FR-008, 디자인 백서 §4.3.4(Decision Option Card).
 *
 * 여기서는 **선택만** 받는다. 어떤 단계로 가는지는 `features/branching`이
 * 정한다. 렌더러가 대상 단계를 계산하면 작성기와 리더가 분기 로직을 각자
 * 갖게 되고, 그 순간 INV-09를 손으로 유지해야 한다. (하네스 §3.3 절대 금지)
 */

import { useId } from 'react';

import type { DecisionOption } from '../../../domain/guide.types.ts';
import styles from './DecisionOptions.module.css';

export interface DecisionOptionsProps {
  question: string;
  options: DecisionOption[];
  required: boolean;
  selectedId?: string | null;
  onSelect?: (optionId: string) => void;
}

export function DecisionOptions({
  question,
  options,
  required,
  selectedId = null,
  onSelect,
}: DecisionOptionsProps) {
  const groupName = useId();
  const readOnly = onSelect === undefined;

  return (
    <fieldset className={styles.group} data-testid="decision-options">
      <legend className={styles.question}>
        {question}
        {required ? <span className={styles.required}> (선택 필요)</span> : null}
      </legend>

      <div className={styles.options}>
        {options.map((option) => (
          <label className={styles.option} key={option.id} data-selected={selectedId === option.id}>
            <input
              className={[styles.input, 'focus-ring'].join(' ')}
              type="radio"
              name={groupName}
              value={option.id}
              checked={selectedId === option.id}
              disabled={readOnly}
              onChange={() => onSelect?.(option.id)}
            />
            <span>
              <span className={styles.optionLabel}>{option.label}</span>
              {option.description === undefined || option.description === '' ? null : (
                <span className={styles.optionDescription}>{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
