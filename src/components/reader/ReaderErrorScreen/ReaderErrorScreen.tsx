/**
 * 리더 오류 화면.
 *
 * 기준: 디자인 백서 §5.9(리더: 잘못된 가이드 오류 화면), §7.3(분기 결과가 없는 경우).
 * 하네스 M7 할 일 1, DoD 3.
 *
 * **완료 화면과 구별한다.** 분기 대상이 없는 것과 가이드가 끝난 것은 다르다.
 * 둘을 한 화면으로 합치면 망가진 문서에서 독자가 "끝났다"고 믿는다.
 *
 * 독자는 문서를 고칠 수 없다. 그래서 무엇이 잘못됐는지 알려 주되 고치라고 하지
 * 않고, 만든 사람에게 알릴 거리를 준다.
 */

import { Button } from '../../ui/Button/Button.tsx';
import styles from './ReaderErrorScreen.module.css';

export type ReaderErrorKind = 'missing-target' | 'start-not-found' | 'cycle';

export interface ReaderErrorScreenProps {
  kind: ReaderErrorKind;
  /** 문제가 난 단계 제목. 독자가 만든 사람에게 전할 수 있는 표현이다. */
  stepTitle?: string;
  /** 찾지 못한 대상 ID. 작성자가 고칠 때 필요하다. */
  targetStepId?: string;
  onRestart?: () => void;
}

const TITLES: Record<ReaderErrorKind, string> = {
  'missing-target': '다음 단계를 찾을 수 없습니다',
  'start-not-found': '가이드를 열 수 없습니다',
  cycle: '단계가 제자리를 맴돕니다',
};

const BODIES: Record<ReaderErrorKind, string> = {
  'missing-target':
    '이 가이드의 분기가 존재하지 않는 단계를 가리키고 있습니다. 독자가 고칠 수 있는 문제가 아닙니다.',
  'start-not-found': '시작 단계가 지정되어 있지 않거나 존재하지 않습니다.',
  cycle: '진행 경로가 앞선 단계로 되돌아가 끝나지 않습니다.',
};

export function ReaderErrorScreen({
  kind,
  stepTitle,
  targetStepId,
  onRestart,
}: ReaderErrorScreenProps) {
  return (
    <div className={styles.screen} role="alert" data-testid="reader-error">
      <h1 className={styles.title}>{TITLES[kind]}</h1>
      <p className={styles.body}>{BODIES[kind]}</p>

      {stepTitle === undefined && targetStepId === undefined ? null : (
        <dl className={styles.detail} data-testid="reader-error-detail">
          {stepTitle === undefined ? null : (
            <>
              <dt>문제가 생긴 단계</dt>
              <dd>{stepTitle}</dd>
            </>
          )}
          {targetStepId === undefined ? null : (
            <>
              <dt>찾지 못한 대상</dt>
              <dd>
                <code>{targetStepId}</code>
              </dd>
            </>
          )}
        </dl>
      )}

      <p className={styles.help}>이 내용을 가이드를 만든 사람에게 알려 주면 고칠 수 있습니다.</p>

      {onRestart === undefined ? null : (
        <Button variant="secondary" data-testid="reader-error-restart" onClick={onRestart}>
          처음부터 다시 시작
        </Button>
      )}
    </div>
  );
}
