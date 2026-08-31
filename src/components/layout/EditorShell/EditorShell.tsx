/**
 * 작성 화면 골격.
 *
 * 기준: 디자인 백서 §2.1.2(데스크톱 3열), §2.1.3·§2.1.4(태블릿·모바일 단일 열).
 *
 * 오른쪽 인스펙터(검증·분기 요약·내보내기 준비 상태)는 M6·M9에서 붙는다.
 * 지금은 개요와 중앙 편집기 두 열만 둔다.
 */

import type { ReactNode } from 'react';

import styles from './EditorShell.module.css';

export interface EditorShellProps {
  outline: ReactNode;
  children: ReactNode;
}

export function EditorShell({ outline, children }: EditorShellProps) {
  return (
    <div className={styles.shell}>
      <aside className={styles.outline}>{outline}</aside>
      <main className={styles.main} id="main">
        {children}
      </main>
    </div>
  );
}
