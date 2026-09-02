/**
 * 진행률 표시.
 *
 * 기준: 디자인 백서 §4.3.7(색상만이 아니라 숫자를 항상 표시), §5.8.
 * 하네스 M7 할 일 7, DoD 8.
 *
 * 분모는 전체 단계가 아니라 **활성 경로의 필수 단계 수**다. M6의
 * `calculateProgress`가 이미 그렇게 센다.
 *
 * 아직 답하지 않은 분기가 있으면 경로가 추정이다. 그때는 "현재 경로 기준"을
 * 함께 적는다. 그 문구가 없으면 숫자가 확정처럼 보인다.
 */

import type { ProgressSummary } from '../../../features/branching/path-calculator.ts';
import styles from './ReaderProgressHeader.module.css';

export interface ReaderProgressHeaderProps {
  summary: ProgressSummary;
}

export function ReaderProgressHeader({ summary }: ReaderProgressHeaderProps) {
  const percent = Math.round(summary.ratio * 100);
  const position = summary.currentIndex < 0 ? 1 : summary.currentIndex + 1;

  return (
    <div className={styles.header} data-testid="reader-progress">
      <p className={styles.counts}>
        <span className={styles.position}>{`${summary.pathLength}단계 중 ${position}번째`}</span>
        {summary.totalRequired === 0 ? null : (
          <span className={styles.ratio} data-testid="reader-progress-ratio">
            {`필수 ${summary.totalRequired}개 중 ${summary.completedRequired}개 완료`}
          </span>
        )}
        {summary.estimated ? (
          <span className={styles.estimated} data-testid="reader-progress-estimated">
            현재 경로 기준
          </span>
        ) : null}
      </p>

      {/* 분모가 0이면 막대를 그리지 않는다. 채울 것이 없는 막대는 오해를 만든다. */}
      {summary.totalRequired === 0 ? null : (
        <div
          className={styles.track}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={summary.estimated ? '진행률 (현재 경로 기준 예상)' : '진행률'}
        >
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
