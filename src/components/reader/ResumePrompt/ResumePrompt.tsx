/**
 * 이어하기 / 처음부터.
 *
 * 기준: 기술 백서 §2.2.2-3, 디자인 백서 §2.4.10. 하네스 M7 DoD 5·6.
 *
 * 다른 revision의 진행이 남아 있으면 그 사실을 함께 알린다. 키가 revision별로
 * 갈리므로(INV-10) 덮어쓰지 않지만, 독자에게는 "이전 버전에서 하던 것이 있다"가
 * 보여야 새 버전을 처음부터 시작할지 판단할 수 있다.
 */

import { Button } from '../../ui/Button/Button.tsx';
import styles from './ResumePrompt.module.css';

export interface ResumePromptProps {
  /** 이어할 진행이 있는가. */
  hasProgress: boolean;
  /** 활성 경로에서 몇 번째 단계까지 갔는가. 1부터 센다. */
  position: number;
  total: number;
  /** 저장된 커서가 문서에서 사라져 처음으로 되돌렸는가. */
  cursorReset: boolean;
  /** 다른 revision에 남은 진행. 큰 것이 앞이다. */
  otherRevisions: readonly number[];
  currentRevision: number;
  onResume: () => void;
  onRestart: () => void;
}

export function ResumePrompt({
  hasProgress,
  position,
  total,
  cursorReset,
  otherRevisions,
  currentRevision,
  onResume,
  onRestart,
}: ResumePromptProps) {
  if (!hasProgress && otherRevisions.length === 0) return null;

  return (
    <section className={styles.prompt} data-testid="resume-prompt">
      {hasProgress ? (
        <>
          <p className={styles.line}>
            {cursorReset
              ? '가이드가 수정되어 이전에 보던 단계가 없어졌습니다. 처음부터 다시 시작합니다.'
              : `이전에 ${total}단계 중 ${position}번째까지 진행했습니다.`}
          </p>
          <div className={styles.actions}>
            <Button data-testid="resume-continue" onClick={onResume}>
              이어하기
            </Button>
            <Button variant="secondary" data-testid="resume-restart" onClick={onRestart}>
              처음부터
            </Button>
          </div>
        </>
      ) : null}

      {otherRevisions.length === 0 ? null : (
        <p className={styles.note} data-testid="resume-other-revisions">
          {`다른 버전(개정 ${otherRevisions.join(', ')})에서 진행하던 기록이 있습니다. ` +
            `지금 보는 것은 개정 ${currentRevision}이고, 그 기록은 지워지지 않습니다.`}
        </p>
      )}
    </section>
  );
}
