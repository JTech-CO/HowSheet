/**
 * 여러 줄 입력 박스. 규격만 소유한다. 항상 `Field` 안에서 쓴다. (D-05)
 */

import type { TextareaHTMLAttributes } from 'react';

import styles from './Textarea.module.css';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      rows={rows}
      className={[styles.textarea, 'focus-ring', className].filter(Boolean).join(' ')}
    />
  );
}
