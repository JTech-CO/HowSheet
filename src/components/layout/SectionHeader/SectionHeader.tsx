/** 섹션 제목과 액션. 스튜디오 화면의 각 영역 상단에 온다. */

import type { ReactNode } from 'react';

import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /**
   * 제목 요소의 id. 감싸는 `<section>`이 `aria-labelledby`로 가리킨다.
   *
   * 섹션에 `aria-label`을 따로 붙이지 않고 이 id를 쓰는 이유는, 화면에 보이는
   * 제목과 보조 기술이 읽는 이름이 갈라지지 않게 하기 위해서다.
   */
  id?: string;
}

export function SectionHeader({ title, description, actions, id }: SectionHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <h2 className={styles.title} {...(id === undefined ? {} : { id })}>
          {title}
        </h2>
        {description === undefined ? null : <p className={styles.description}>{description}</p>}
      </div>
      {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
