/**
 * 보일 방식 고르기.
 *
 * 기준: v2 제품정의 §5(디자인 축 4종). 하네스 P2 할 일 2, DoD 2·4.
 *
 * 축마다 라디오 하나다. 네이티브 라디오를 쓰는 이유는 화살표 키 이동과 그룹
 * 안에서 하나만 켜지는 성질을 브라우저가 이미 지키기 때문이다. 버튼으로 다시
 * 만들면 그 둘을 손으로 구현하게 되고, 그러면 틀릴 자리가 생긴다. (DoD 2·4)
 *
 * `components/ui`에 두지 않는다. 축 목록이라는 도메인을 알기 때문이다.
 * (하네스 P2 주의, `UI_DOMAIN_INDEPENDENCE`)
 */

import { useId } from 'react';

import { DESIGN_AXES, type DesignAxisId, type DesignChoice } from '../../../domain/spec.types.ts';
import styles from './DesignPicker.module.css';

export interface DesignPickerProps {
  value: DesignChoice;
  onChange: (axis: DesignAxisId, option: string) => void;
}

export function DesignPicker({ value, onChange }: DesignPickerProps) {
  // 같은 화면에 두 번 그려도 라디오 그룹이 섞이지 않게 인스턴스마다 이름을 나눈다.
  const group = useId();

  return (
    <div className={styles.wrapper}>
      {DESIGN_AXES.map((axis) => (
        <fieldset key={axis.id} className={styles.axis} data-testid={'design-axis-' + axis.id}>
          <legend className={styles.legend}>
            {axis.label}
            <span className={styles.hint}>{axis.hint}</span>
          </legend>

          <div className={styles.options}>
            {axis.options.map((option) => {
              const chosen = value[axis.id] === option.id;
              return (
                <label
                  key={option.id}
                  className={styles.option}
                  data-chosen={chosen}
                  title={option.requirement}
                >
                  <input
                    type="radio"
                    className={[styles.input, 'focus-ring'].join(' ')}
                    name={group + '-' + axis.id}
                    value={option.id}
                    checked={chosen}
                    data-testid={'design-' + axis.id + '-' + option.id}
                    onChange={() => onChange(axis.id, option.id)}
                  />
                  <span className={styles.label}>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
