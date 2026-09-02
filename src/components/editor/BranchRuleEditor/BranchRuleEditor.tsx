/**
 * 분기 규칙 편집.
 *
 * 기준: 디자인 백서 §2.4.6(분기 편집 화면), 기술 백서 §2.3.2.
 * 하네스 M6 할 일 6, DoD 2.
 *
 * 디자인 §2.4.6이 정한 것을 그대로 따른다.
 *   - 조건·값·대상을 한 행에 억지로 압축하지 않는다. 세로로 쌓는다.
 *   - 규칙마다 우선순위를 표시한다.
 *   - 기본 경로는 별도 `그 외의 경우` 카드로 둔다.
 *   - 순환·누락·도달 불가 오류는 해당 대상 선택 **바로 아래**에 표시한다.
 *
 * 단계를 화면 번호로 참조하지 않는다. `Select`의 값은 언제나 단계 ID이고 번호는
 * 표시에만 쓴다. (하네스 M6 주의)
 */

import type { BranchOperator, BranchRule, GuideStep } from '../../../domain/guide.types.ts';
import type { ValidationIssue } from '../../../domain/validation.types.ts';
import { orderedBranchRules } from '../../../features/branching/branch-engine.ts';
import { Button } from '../../ui/Button/Button.tsx';
import { Field } from '../../ui/Field/Field.tsx';
import { Select } from '../../ui/Select/Select.tsx';
import { describeStepTarget } from '../BranchSummary/BranchSummary.tsx';
import { ReorderControls } from '../ReorderControls/ReorderControls.tsx';
import styles from './BranchRuleEditor.module.css';

const OPERATOR_LABELS: Record<BranchOperator, string> = {
  equals: '선택이 다음과 같으면',
  notEquals: '선택이 다음과 다르면',
  checked: '필수 항목을 모두 체크했으면',
  notChecked: '필수 항목이 남아 있으면',
};

/** 결정 블록과 체크리스트 블록만 분기 기준이 될 수 있다. */
function branchSources(step: GuideStep) {
  return step.blocks.filter((block) => block.type === 'decision' || block.type === 'checklist');
}

/** 이 연산자가 쓸 수 있는 기준 블록 타입. */
function sourceTypeFor(operator: BranchOperator): 'decision' | 'checklist' {
  return operator === 'equals' || operator === 'notEquals' ? 'decision' : 'checklist';
}

export interface BranchRuleEditorProps {
  step: GuideStep;
  /** 대상 후보. `order` 순으로 넘긴다. */
  steps: readonly GuideStep[];
  /** 이 단계에 걸린 그래프 이슈. 대상 선택 바로 아래에 건다. */
  issues: readonly ValidationIssue[];
  onAddRule: () => void;
  onUpdateRule: (ruleId: string, patch: Partial<BranchRule>) => void;
  onRemoveRule: (ruleId: string) => void;
  onMoveRule: (ruleId: string, delta: number) => void;
  onUpdateStep: (patch: Partial<GuideStep>) => void;
}

export function BranchRuleEditor({
  step,
  steps,
  issues,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
  onMoveRule,
  onUpdateStep,
}: BranchRuleEditorProps) {
  const rules = orderedBranchRules(step);
  const sources = branchSources(step);

  /** 이 규칙의 대상 선택 아래에 붙을 이슈. 경로 접미사로 고른다. */
  const issuesForRule = (rule: BranchRule) => {
    const index = step.branchRules.indexOf(rule);
    return issues.filter((issue) => issue.path.includes(`branchRules[${index}]`));
  };

  const defaultIssues = issues.filter((issue) => issue.path.endsWith('defaultNextStepId'));

  return (
    <div className={styles.editor} data-testid="branch-rule-editor">
      {sources.length === 0 ? (
        <p className={styles.note}>
          분기 기준이 될 블록이 없습니다. 이 단계에 선택 분기나 체크리스트 블록을 먼저 추가합니다.
        </p>
      ) : null}

      <ol className={styles.rules} role="list">
        {rules.map((rule, index) => {
          const ruleIssues = issuesForRule(rule);
          const allowedType = sourceTypeFor(rule.operator);
          const source = step.blocks.find((block) => block.id === rule.sourceBlockId);
          const options = source?.type === 'decision' ? source.options : [];

          return (
            <li key={rule.id} className={styles.rule} data-testid="branch-rule">
              <div className={styles.ruleHeader}>
                <span className={styles.priority} data-testid="branch-rule-priority">
                  우선순위 {index + 1}
                </span>
                <ReorderControls
                  position={index + 1}
                  total={rules.length}
                  itemLabel={`분기 규칙 ${index + 1}`}
                  onMove={(delta) => onMoveRule(rule.id, delta)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="branch-rule-remove"
                  onClick={() => onRemoveRule(rule.id)}
                >
                  규칙 삭제
                </Button>
              </div>

              <Field label="조건">
                {(control) => (
                  <Select
                    {...control}
                    value={rule.operator}
                    data-testid="branch-rule-operator"
                    onChange={(event) => {
                      const operator = event.target.value as BranchOperator;
                      // 연산자를 바꾸면 기준 블록 타입이 달라진다. 맞지 않는
                      // 기준을 그대로 두면 규칙이 조용히 영원한 거짓이 된다.
                      const keep =
                        source !== undefined && source.type === sourceTypeFor(operator)
                          ? { operator }
                          : { operator, sourceBlockId: undefined, value: undefined };
                      onUpdateRule(rule.id, keep);
                    }}
                  >
                    {Object.entries(OPERATOR_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="기준 블록" required>
                {(control) => (
                  <Select
                    {...control}
                    value={rule.sourceBlockId ?? ''}
                    data-testid="branch-rule-source"
                    onChange={(event) =>
                      onUpdateRule(rule.id, {
                        sourceBlockId: event.target.value === '' ? undefined : event.target.value,
                        value: undefined,
                      })
                    }
                  >
                    <option value="">고르지 않음</option>
                    {sources
                      .filter((block) => block.type === allowedType)
                      .map((block, blockIndex) => (
                        <option key={block.id} value={block.id}>
                          {block.type === 'decision'
                            ? `선택 분기 ${blockIndex + 1}`
                            : `체크리스트 ${blockIndex + 1}`}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>

              {allowedType === 'decision' ? (
                <Field label="선택지" required>
                  {(control) => (
                    <Select
                      {...control}
                      value={typeof rule.value === 'string' ? rule.value : ''}
                      data-testid="branch-rule-value"
                      onChange={(event) =>
                        onUpdateRule(rule.id, {
                          value: event.target.value === '' ? undefined : event.target.value,
                        })
                      }
                    >
                      <option value="">고르지 않음</option>
                      {options.map((option, optionIndex) => (
                        <option key={option.id} value={option.id}>
                          {option.label.trim() === '' ? `선택지 ${optionIndex + 1}` : option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}

              <Field
                label="이동할 단계"
                required
                {...(ruleIssues[0] === undefined ? {} : { error: ruleIssues[0].message })}
              >
                {(control) => (
                  <Select
                    {...control}
                    value={rule.targetStepId}
                    data-testid="branch-rule-target"
                    onChange={(event) =>
                      onUpdateRule(rule.id, { targetStepId: event.target.value })
                    }
                  >
                    {steps.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {describeStepTarget(candidate.id, steps)}
                      </option>
                    ))}
                    {steps.some((candidate) => candidate.id === rule.targetStepId) ? null : (
                      <option value={rule.targetStepId}>
                        {describeStepTarget(rule.targetStepId, steps)}
                      </option>
                    )}
                  </Select>
                )}
              </Field>

              {/* 첫 이슈는 Field가 이미 보여 준다. 나머지를 대상 아래에 잇는다. */}
              {ruleIssues.slice(1).map((issue) => (
                <p key={issue.code} className={styles.issue} role="alert">
                  {issue.message}
                </p>
              ))}
            </li>
          );
        })}
      </ol>

      <Button
        variant="secondary"
        size="sm"
        data-testid="branch-rule-add"
        disabled={sources.length === 0}
        onClick={onAddRule}
      >
        분기 규칙 추가
      </Button>

      {/* 기본 경로는 별도 카드다. (디자인 §2.4.6) */}
      <section className={styles.fallback} data-testid="branch-default">
        <h3 className={styles.fallbackTitle}>그 외의 경우</h3>
        <Field
          label="이동할 단계"
          help="비워 두면 여기서 가이드가 끝납니다."
          {...(defaultIssues[0] === undefined ? {} : { error: defaultIssues[0].message })}
        >
          {(control) => (
            <Select
              {...control}
              value={step.defaultNextStepId ?? ''}
              data-testid="branch-default-target"
              onChange={(event) =>
                onUpdateStep({
                  defaultNextStepId: event.target.value === '' ? undefined : event.target.value,
                })
              }
            >
              <option value="">완료 화면으로</option>
              {steps
                .filter((candidate) => candidate.id !== step.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {describeStepTarget(candidate.id, steps)}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </section>
    </div>
  );
}
