/** 빈 상태. 대시보드의 "아직 만든 가이드가 없습니다" 등. (디자인 §2.4.1) */

import type { ReactNode } from 'react';

import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** 활용 예시처럼 목록으로 보여 줄 항목. */
  examples?: string[];
  action?: ReactNode;
}

export function EmptyState({ title, description, examples, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>{title}</h2>
      {description === undefined ? null : <p className={styles.description}>{description}</p>}
      {examples === undefined || examples.length === 0 ? null : (
        <ul className={styles.examples} role="list">
          {examples.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
      )}
      {action === undefined ? null : <div className={styles.action}>{action}</div>}
    </div>
  );
}
