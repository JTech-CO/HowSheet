/**
 * 한 줄 입력 박스. 규격만 소유한다.
 * 라벨·오류·글자 수는 `Field`가 갖는다. 항상 `Field` 안에서 쓴다. (D-05)
 */

import type { InputHTMLAttributes } from 'react';

import styles from './Input.module.css';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = 'text', ...rest }: InputProps) {
  return (
    <input
      {...rest}
      type={type}
      className={[styles.input, 'focus-ring', className].filter(Boolean).join(' ')}
    />
  );
}
