import { useParams } from 'react-router-dom';

import styles from './EditorPage.module.css';

/** 작성 화면. 편집기 코어는 M4에서 구현한다. */
export function EditorPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className={styles.page}>
      <h1>가이드 작성</h1>
      <p>가이드 ID: {id}</p>
    </main>
  );
}
