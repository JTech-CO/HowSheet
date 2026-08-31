/**
 * 테마 전환 버튼 묶음.
 *
 * 기준: FR-015, 디자인 백서 §2.1.6.
 *
 * 표시만 한다. 저장과 `data-theme` 적용은 `store/ui.store.ts`가 맡는다.
 * `components/ui`는 도메인을 모르므로 모드 값도 문자열 리터럴로 받는다.
 * (File_Structure.md §3.2-7)
 */

import styles from './ThemeToggle.module.css';

export type ThemeToggleMode = 'system' | 'light' | 'dark';

const ORDER: ThemeToggleMode[] = ['system', 'light', 'dark'];

const LABELS: Record<ThemeToggleMode, string> = {
  system: '시스템',
  light: '라이트',
  dark: '다크',
};

export interface ThemeToggleProps {
  mode: ThemeToggleMode;
  onChange: (mode: ThemeToggleMode) => void;
}

export function ThemeToggle({ mode, onChange }: ThemeToggleProps) {
  return (
    <div className={styles.toggle} role="group" aria-label="테마">
      {ORDER.map((option) => (
        <button
          key={option}
          type="button"
          className={[styles.option, 'focus-ring'].join(' ')}
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
