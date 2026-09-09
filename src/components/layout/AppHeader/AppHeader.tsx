/**
 * 앱 헤더.
 *
 * 기준: v2 제품정의 §3(화면). 배치 근거는
 * `docs/archive/v1/HowSheet_디자인_백서.md` §2.1.2(높이 64px sticky)에서 왔다.
 *
 * v2는 화면이 하나라 라우터가 없다. 브랜드는 링크가 아니라 글자다 - 갈 곳이
 * 없는 링크를 두면 키보드 사용자가 아무 일도 일어나지 않는 정지점을 지난다.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { useUiStore } from '../../../store/ui.store.ts';
import { ThemeToggle } from '../../ui/ThemeToggle/ThemeToggle.tsx';
import styles from './AppHeader.module.css';

export interface AppHeaderProps {
  /** 브랜드 옆에 붙는 부제. 지금 무엇을 하는 화면인지 알린다. */
  subtitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
}

export function AppHeader({ subtitle, status, actions }: AppHeaderProps) {
  const themeMode = useUiStore((state) => state.themeMode);
  const initTheme = useUiStore((state) => state.initTheme);
  const setThemeMode = useUiStore((state) => state.setThemeMode);

  // 선행 스니펫이 정한 값을 스토어로 끌어온다. DOM은 이미 맞춰져 있다.
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <header className={styles.header}>
      <p className={styles.brand}>HowSheet</p>

      {subtitle === undefined ? null : (
        <>
          <span className={styles.divider} aria-hidden="true">
            /
          </span>
          <p className={styles.title}>{subtitle}</p>
        </>
      )}

      {status}

      <div className={styles.actions} data-print="hide">
        {actions}
        <ThemeToggle mode={themeMode} onChange={setThemeMode} />
      </div>
    </header>
  );
}
