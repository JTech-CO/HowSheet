/**
 * 분기 경로의 문장식 요약.
 *
 * 기준: 디자인 백서 §2.4.6("상단에 간단한 문장식 요약을 보여준다",
 * "전체 그래프 시각화는 MVP 필수가 아니며 텍스트 경로 요약으로 대체한다").
 * 하네스 M6 할 일 6.
 *
 * 문장을 만드는 두 함수는 순수 함수로 분리해 두었다. 규칙을 사람 말로 옮기는
 * 규칙이 화면 코드에 묻히면 테스트할 수 없고, M7의 리더 안내와 M9의 내보내기
 * 요약이 같은 문장을 다시 짜게 된다.
 *
 * **단계를 화면 번호로 부르지 않는다.** 표시에는 순서 번호를 쓰지만 참조는
 * 언제나 ID다. (하네스 M6 주의)
 */

import type { BranchRule, GuideStep } from '../../../domain/guide.types.ts';
import { orderedBranchRules } from '../../../features/branching/branch-engine.ts';
import styles from './BranchSummary.module.css';

/** "3단계 «모바일에서 설정 열기»" 처럼 부른다. 없는 단계는 그렇게 말한다. */
export function describeStepTarget(targetStepId: string, steps: readonly GuideStep[]): string {
  const index = steps.findIndex((step) => step.id === targetStepId);
  if (index === -1) return `없는 단계(${targetStepId})`;

  const title = steps[index]!.title.trim();
  return title === '' ? `${index + 1}단계` : `${index + 1}단계 «${title}»`;
}

function describeCondition(rule: BranchRule, owner: GuideStep): string {
  const source = owner.blocks.find((block) => block.id === rule.sourceBlockId);

  if (source === undefined) {
    return rule.sourceBlockId === undefined
      ? '기준 블록을 고르지 않았으면'
      : `기준 블록(${rule.sourceBlockId})이 없으면`;
  }

  if (source.type === 'decision') {
    const option = source.options.find((entry) => entry.id === rule.value);
    const label =
      option === undefined ? String(rule.value ?? '(고르지 않음)') : option.label.trim();
    const shown = label === '' ? '(이름 없는 선택지)' : label;
    return rule.operator === 'equals' ? `선택이 '${shown}'이면` : `선택이 '${shown}'이 아니면`;
  }

  if (source.type === 'checklist') {
    return rule.operator === 'checked' ? '필수 항목을 모두 체크했으면' : '필수 항목이 남아 있으면';
  }

  return `기준 블록이 ${source.type}이라 조건을 판정할 수 없으면`;
}

/** "선택이 '모바일'이면 → 3단계 «모바일에서 설정 열기»로 이동" (디자인 §2.4.6) */
export function describeBranchRule(
  rule: BranchRule,
  owner: GuideStep,
  steps: readonly GuideStep[],
): string {
  return `${describeCondition(rule, owner)} → ${describeStepTarget(rule.targetStepId, steps)}로 이동`;
}

/** "그 외의 경우 → 4단계로 이동". 대상이 없으면 완료다. (M6 DoD 3) */
export function describeDefaultPath(owner: GuideStep, steps: readonly GuideStep[]): string {
  if (owner.defaultNextStepId === undefined) return '그 외의 경우 → 완료 화면';
  return `그 외의 경우 → ${describeStepTarget(owner.defaultNextStepId, steps)}로 이동`;
}

export interface BranchSummaryProps {
  steps: readonly GuideStep[];
  /** 주면 그 단계만, 없으면 분기가 있는 모든 단계를 요약한다. */
  stepId?: string;
  onSelectStep?: (stepId: string) => void;
}

export function BranchSummary({ steps, stepId, onSelectStep }: BranchSummaryProps) {
  const shown =
    stepId === undefined
      ? steps.filter((step) => step.branchRules.length > 0)
      : steps.filter((step) => step.id === stepId);

  if (shown.length === 0) {
    return (
      <p className={styles.empty} data-testid="branch-summary-empty">
        분기 규칙이 없습니다. 모든 독자가 같은 순서로 진행합니다.
      </p>
    );
  }

  return (
    <div className={styles.summary} data-testid="branch-summary">
      {shown.map((step) => (
        <section key={step.id} className={styles.group}>
          {stepId === undefined ? (
            <h3 className={styles.stepTitle}>
              {onSelectStep === undefined ? (
                describeStepTarget(step.id, steps)
              ) : (
                <button
                  type="button"
                  className={[styles.stepLink, 'focus-ring'].join(' ')}
                  onClick={() => onSelectStep(step.id)}
                >
                  {describeStepTarget(step.id, steps)}
                </button>
              )}
            </h3>
          ) : null}

          <ol className={styles.rules} role="list">
            {orderedBranchRules(step).map((rule, index) => (
              <li key={rule.id} className={styles.rule} data-testid="branch-summary-rule">
                <span className={styles.priority} aria-hidden="true">
                  {index + 1}
                </span>
                <span className="sr-only">{`우선순위 ${index + 1}번째. `}</span>
                {describeBranchRule(rule, step, steps)}
              </li>
            ))}
            <li
              className={[styles.rule, styles.fallback].join(' ')}
              data-testid="branch-summary-default"
            >
              <span className={styles.priority} aria-hidden="true">
                –
              </span>
              {describeDefaultPath(step, steps)}
            </li>
          </ol>
        </section>
      ))}
    </div>
  );
}
