import { useParams } from 'react-router-dom';

import styles from './PreviewPage.module.css';

/** 미리보기. 리더와 동일한 컴포넌트를 사용하며 M7에서 구현한다. */
export function PreviewPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className={styles.page}>
      <h1>미리보기</h1>
      <p>가이드 ID: {id}</p>
    </main>
  );
}
