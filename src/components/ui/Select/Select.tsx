/** 선택 박스. 규격만 소유한다. 항상 `Field` 안에서 쓴다. (D-05) */

import type { SelectHTMLAttributes } from 'react';

import styles from './Select.module.css';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={[styles.select, 'focus-ring', className].filter(Boolean).join(' ')}
    >
      {children}
    </select>
  );
}
