/** 체크박스. 라벨을 붙여 접근 이름을 보장한다. */

import { useId, type InputHTMLAttributes } from 'react';

import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: string;
}

export function Checkbox({ label, hint, className, ...rest }: CheckboxProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className={styles.wrapper}>
      <input
        {...rest}
        id={id}
        type="checkbox"
        className={[styles.input, 'focus-ring', className].filter(Boolean).join(' ')}
        {...(hint === undefined ? {} : { 'aria-describedby': hintId })}
      />
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint === undefined ? null : (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}
