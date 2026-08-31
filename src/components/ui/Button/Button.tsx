/**
 * 기본 버튼. 기준: 기술 백서 §5.2 Button, 디자인 백서 §2.2.3·§5.
 *
 * 상태는 `data-*`와 `aria-*`로 표현하고 상태 전용 클래스를 늘리지 않는다.
 * (File_Structure.md §4)
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 진행 중 표시. 버튼을 비활성화하고 스크린 리더에 상태를 전한다. */
  busy?: boolean;
  /** React 19에서는 ref가 일반 prop이다. 대화상자의 초기 포커스에 쓴다. */
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={[styles.button, 'focus-ring', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={size}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}
