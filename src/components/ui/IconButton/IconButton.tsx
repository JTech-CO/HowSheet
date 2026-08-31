/**
 * 아이콘 전용 버튼.
 *
 * 라벨이 시각적으로 보이지 않으므로 `label`을 필수로 받아 접근 이름을
 * 강제한다. 이름 없는 아이콘 버튼은 만들 수 없다. (디자인 §1.4 원칙 5)
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 접근 이름. 시각적으로는 숨지만 반드시 있어야 한다. */
  label: string;
  children: ReactNode;
}

export function IconButton({
  label,
  type = 'button',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={[styles.iconButton, 'focus-ring', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
