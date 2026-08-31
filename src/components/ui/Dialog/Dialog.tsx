/**
 * 모달 대화상자.
 *
 * 기준: 기술 백서 §5.2 `Modal / Dialog`, 디자인 백서 §2.2.1(삭제 확인).
 *
 * 네이티브 `<dialog>` 대신 직접 구현한다. `showModal()`의 동작이 환경마다
 * 달라 포커스 이동과 Escape 처리를 테스트로 고정하기 어렵다.
 *
 * - 열릴 때 `initialFocusRef` 또는 첫 포커스 가능 요소로 이동한다. 삭제처럼
 *   위험한 동작은 취소 버튼을 가리켜 실수를 줄인다.
 * - Escape로 닫는다.
 * - Tab이 대화상자를 벗어나지 않는다.
 * - 닫히면 열기 전 요소로 포커스를 되돌린다.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

import styles from './Dialog.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  /** 열릴 때 포커스를 받을 요소. 위험한 동작에서는 취소 버튼을 가리킨다. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  children?: ReactNode;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  initialFocusRef,
  footer,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = `${titleId}-description`;

  const focusables = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (panel === null) return [];
    return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
  }, []);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const target = initialFocusRef?.current ?? focusables()[0] ?? panelRef.current;
    target?.focus();

    return () => {
      returnFocusRef.current?.focus();
    };
  }, [open, initialFocusRef, focusables]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, focusables]);

  if (!open) return null;

  return (
    <div className={styles.backdrop}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
        tabIndex={-1}
      >
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        {description === undefined ? null : (
          <p className={styles.description} id={descriptionId}>
            {description}
          </p>
        )}
        {children}
        {footer === undefined ? null : <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
