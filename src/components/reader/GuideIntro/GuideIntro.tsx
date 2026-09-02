/**
 * 리더 시작 화면.
 *
 * 기준: 기술 백서 §2.2.2-4, 디자인 백서 §2.4.10. 하네스 M7 할 일 1, DoD 1.
 *
 * **시작 화면에서 전체 단계 내용을 노출하지 않는다.** (디자인 §2.4.10)
 * 무엇을 하는 가이드인지, 무엇이 필요한지, 무엇을 조심해야 하는지까지다.
 *
 * 준비물·경고 게이트를 통과하기 전에는 CTA가 비활성이다. 비활성 이유를 함께
 * 적는다 - 눌리지 않는 버튼만 두면 독자가 무엇을 해야 할지 모른다.
 */

import type { GuideDocument } from '../../../domain/guide.types.ts';
import { Button } from '../../ui/Button/Button.tsx';
import { PreparationChecklist } from '../PreparationChecklist/PreparationChecklist.tsx';
import { WarningGate } from '../WarningGate/WarningGate.tsx';
import styles from './GuideIntro.module.css';

export interface GuideIntroProps {
  document: GuideDocument;
  checkedPreparationIds: ReadonlySet<string>;
  acknowledgedWarningIds: ReadonlySet<string>;
  canEnter: boolean;
  onTogglePreparation: (itemId: string, checked: boolean) => void;
  onAcknowledgeWarning: (warningId: string) => void;
  onStart: () => void;
}

/** 게이트를 통과하지 못한 이유. 무엇을 해야 하는지 말한다. */
function blockedReason(
  document: GuideDocument,
  checkedPreparationIds: ReadonlySet<string>,
  acknowledgedWarningIds: ReadonlySet<string>,
): string | null {
  const preparation = document.preparation.filter(
    (item) => item.required && !checkedPreparationIds.has(item.id),
  ).length;
  const warnings = document.warnings.filter(
    (warning) => warning.requiresAcknowledgement && !acknowledgedWarningIds.has(warning.id),
  ).length;

  if (preparation === 0 && warnings === 0) return null;

  const parts: string[] = [];
  if (preparation > 0) parts.push(`준비물 ${preparation}개`);
  if (warnings > 0) parts.push(`주의 사항 ${warnings}개`);
  return `${parts.join('와 ')}를 확인하면 시작할 수 있습니다.`;
}

export function GuideIntro({
  document,
  checkedPreparationIds,
  acknowledgedWarningIds,
  canEnter,
  onTogglePreparation,
  onAcknowledgeWarning,
  onStart,
}: GuideIntroProps) {
  const reason = blockedReason(document, checkedPreparationIds, acknowledgedWarningIds);

  return (
    <div className={styles.intro} data-testid="guide-intro">
      <header className={styles.header}>
        <h1 className={styles.title}>{document.meta.title}</h1>
        {document.meta.summary === undefined ? null : (
          <p className={styles.summary}>{document.meta.summary}</p>
        )}
        <dl className={styles.meta}>
          {document.meta.audience === undefined ? null : (
            <>
              <dt>대상</dt>
              <dd>{document.meta.audience}</dd>
            </>
          )}
          <dt>단계</dt>
          <dd>{`${document.steps.length}개`}</dd>
          {document.meta.estimatedMinutes === undefined ? null : (
            <>
              <dt>예상 시간</dt>
              <dd>{`약 ${document.meta.estimatedMinutes}분`}</dd>
            </>
          )}
        </dl>
      </header>

      <PreparationChecklist
        items={document.preparation}
        checkedIds={checkedPreparationIds}
        onToggle={onTogglePreparation}
      />

      <WarningGate
        warnings={document.warnings}
        acknowledgedIds={acknowledgedWarningIds}
        onAcknowledge={onAcknowledgeWarning}
      />

      <div className={styles.actions}>
        <Button disabled={!canEnter} data-testid="reader-start" onClick={onStart}>
          첫 단계 시작
        </Button>
        {reason === null ? null : (
          <p className={styles.reason} data-testid="reader-start-blocked">
            {reason}
          </p>
        )}
      </div>
    </div>
  );
}
