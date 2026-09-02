/**
 * 완료 화면.
 *
 * 기준: FR-011, 기술 백서 §2.2.2-9, 디자인 백서 §2.4.12. 하네스 M7 할 일 7, DoD 3.
 *
 * `allowProgressReset`이 꺼져 있으면 초기화 버튼을 **비활성이 아니라 아예 그리지
 * 않는다.** 없는 기능을 비활성으로 보여 주면 그 이유를 댈 수 없다. (디자인 §2.2.3)
 *
 * 링크는 `LinkCard`를 재사용한다. `http`·`https` 판정이 두 곳에 생기면 한 곳이
 * 뒤처진다. (INV-07)
 */

import type { CompletionConfig, GuideDocument } from '../../../domain/guide.types.ts';
import type { ProgressSummary } from '../../../features/branching/path-calculator.ts';
import { LinkCard } from '../../content/LinkCard/LinkCard.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import styles from './CompletionScreen.module.css';

export interface CompletionScreenProps {
  completion: CompletionConfig;
  settings: GuideDocument['settings'];
  summary: ProgressSummary;
  /** 시작·마지막 갱신 시각. 소요 시간 표시에 쓴다. */
  startedAt: string;
  updatedAt: string;
  onRestart: () => void;
  onReview: () => void;
}

/** 로컬에서 계산 가능한 경우에만 보여 준다. (디자인 §2.4.12) */
function elapsedText(startedAt: string, updatedAt: string): string | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(updatedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

  const minutes = Math.round((end - start) / 60_000);
  if (minutes < 1) return '1분 미만';
  if (minutes < 60) return `약 ${minutes}분`;
  return `약 ${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export function CompletionScreen({
  completion,
  settings,
  summary,
  startedAt,
  updatedAt,
  onRestart,
  onReview,
}: CompletionScreenProps) {
  const elapsed = elapsedText(startedAt, updatedAt);

  return (
    <div className={styles.screen} data-testid="completion-screen">
      <h1 className={styles.title}>{completion.title}</h1>
      <p className={styles.message}>{completion.message}</p>

      {completion.showSummary ? (
        <dl className={styles.summary} data-testid="completion-summary">
          <dt>지나온 단계</dt>
          <dd>{`${summary.pathLength}개`}</dd>
          <dt>완료한 필수 단계</dt>
          <dd>{`${summary.completedRequired} / ${summary.totalRequired}`}</dd>
          {elapsed === null ? null : (
            <>
              <dt>걸린 시간</dt>
              <dd>{elapsed}</dd>
            </>
          )}
        </dl>
      ) : null}

      {completion.primaryAction === undefined ? null : (
        <LinkCard label={completion.primaryAction.label} url={completion.primaryAction.url} />
      )}
      {completion.secondaryAction === undefined ? null : (
        <LinkCard label={completion.secondaryAction.label} url={completion.secondaryAction.url} />
      )}

      <div className={styles.actions}>
        <Button variant="secondary" data-testid="completion-review" onClick={onReview}>
          단계 다시 보기
        </Button>
        {settings.allowProgressReset ? (
          <Button variant="secondary" data-testid="completion-restart" onClick={onRestart}>
            처음부터 다시 시작
          </Button>
        ) : null}
      </div>
    </div>
  );
}
