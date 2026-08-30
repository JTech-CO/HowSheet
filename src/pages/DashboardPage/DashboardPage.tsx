import styles from './DashboardPage.module.css';

/**
 * 로컬 대시보드. M1에서는 앱이 `/`에서 렌더링되는지 확인할 최소 화면만 둔다.
 * 가이드 목록·생성·가져오기는 M4에서 구현한다. (하네스 M1 주의, M4 할 일 1)
 */
export function DashboardPage() {
  return (
    <main className={styles.page}>
      <h1>HowSheet</h1>
      <p className={styles.lede}>누구나 만드는 단일 페이지 단계별 해결 가이드</p>
      <p className={styles.scaffoldNote} data-testid="scaffold-note">
        M1 기반 스캐폴딩 상태입니다. 가이드 목록과 작성 기능은 M4에서 추가됩니다.
      </p>
    </main>
  );
}
