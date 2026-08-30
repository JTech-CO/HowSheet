import { Link } from 'react-router-dom';

import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <main className={styles.page}>
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>주소가 바뀌었거나 삭제된 화면일 수 있습니다.</p>
      <Link className={styles.link} to="/">
        대시보드로 돌아가기
      </Link>
    </main>
  );
}
