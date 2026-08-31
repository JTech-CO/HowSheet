/**
 * 앱 헤더.
 *
 * 기준: 디자인 백서 §2.1.2(높이 64px sticky), §2.3.1(헤더 구성).
 * 로고, 현재 문서 제목, 저장 상태, 오른쪽 액션을 담는다.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useUiStore } from '../../../store/ui.store.ts';
import { ThemeToggle } from '../../ui/ThemeToggle/ThemeToggle.tsx';
import styles from './AppHeader.module.css';

export interface AppHeaderProps {
  /** 편집 중인 문서 제목. 대시보드에서는 비운다. */
  documentTitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
}

export function AppHeader({ documentTitle, status, actions }: AppHeaderProps) {
  const themeMode = useUiStore((state) => state.themeMode);
  const initTheme = useUiStore((state) => state.initTheme);
  const setThemeMode = useUiStore((state) => state.setThemeMode);

  // 선행 스니펫이 정한 값을 스토어로 끌어온다. DOM은 이미 맞춰져 있다.
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <header className={styles.header}>
      <Link className={[styles.brand, 'focus-ring'].join(' ')} to="/">
        HowSheet
      </Link>

      {documentTitle === undefined ? null : (
        <>
          <span className={styles.divider} aria-hidden="true">
            /
          </span>
          <p className={styles.title}>{documentTitle}</p>
        </>
      )}

      {status}

      <div className={styles.actions}>
        {actions}
        <ThemeToggle mode={themeMode} onChange={setThemeMode} />
      </div>
    </header>
  );
}
