/**
 * 분기 실행 엔진.
 *
 * 기준: 기술 백서 §4.3.4(분기 실행), §2.3.2(`BranchRule`).
 * 하네스 M6 DoD 1~3, INV-06, INV-09.
 *
 * **단계 하나에서 다음 단계 하나를 고르는 것**만 한다. 활성 경로 전체와
 * 진행률은 `path-calculator.ts`가, 그래프 판정은 `graph-validator.ts`가 맡는다.
 *
 * 작성기 미리보기와 내보낸 리더가 이 파일 하나를 공유한다. 분기 로직을 리더용으로
 * 복제하면 INV-09를 손으로 유지해야 한다. 그래서 의존은 `domain`까지만이고
 * React·저장소·시각·난수를 쓰지 않는다. (File_Structure.md §3.3)
 *
 * 결정론(M6 DoD 1)은 순수성만으로는 부족하다. 네 가지를 함께 지킨다.
 *   1. 규칙 정렬 키가 `(priority, 배열 인덱스)`인 전순서다. `sort`의 안정성에
 *      기대지 않고 tiebreak를 비교자에 명시한다.
 *   2. `selectedOptionByBlock`은 키 조회만 한다. `Object.keys` 순서에 결과가
 *      걸리는 지점을 만들지 않는다.
 *   3. `checkedItemIds`는 Set으로 정규화한다. 순서와 중복이 결과를 바꾸지 않는다.
 *   4. 입력을 변형하지 않고 어떤 입력에도 던지지 않는다. 망가진 규칙은 예외가
 *      아니라 `false`로 흡수한다.
 */

import type {
  BranchRule,
  ChecklistBlock,
  ContentBlock,
  DecisionBlock,
  GuideStep,
} from '../../domain/guide.types.ts';
import type { ReaderStepState } from '../../domain/progress.types.ts';

/** 한 단계에서 독자가 남긴 답변. `ReaderProgress.stepState[stepId]`를 그대로 넘길 수 있다. */
export type StepAnswers = Pick<ReaderStepState, 'checkedItemIds' | 'selectedOptionByBlock'>;

/** 다음 단계를 무엇이 정했는가. 경로 요약과 "왜 이 단계로 왔는가" 안내에 쓴다. */
export type BranchVia = 'rule' | 'default';

/**
 * 문서를 보지 않고 내릴 수 있는 결정.
 *
 * `complete`와 `indeterminate`를 나누는 이유: 전자는 **평가를 마쳤는데** 아무
 * 규칙도 참이 아니고 기본 다음도 없는 상태이고(기술 §4.3.4-5), 후자는 아직
 * 독자가 답하지 않아 평가 자체가 성립하지 않는 상태다. 둘을 합치면 답하지 않은
 * 분기 단계가 "완료 가능"으로 잡혀 예상 진행률이 거짓말을 한다.
 */
export type BranchSelection =
  | { kind: 'next'; stepId: string; via: BranchVia; ruleId?: string }
  | { kind: 'complete' }
  | { kind: 'indeterminate' };

/**
 * 대상 존재 여부까지 확인한 결과.
 *
 * `missing-target`을 `complete`와 같은 값으로 표현하지 않는다. 디자인 §7.3은
 * 리더가 "분기 결과가 없는 경우" 오류 화면을 띄우라고 하는데, 둘이 구별되지
 * 않으면 망가진 문서에서 조용히 완료 화면이 뜬다.
 */
export type BranchOutcome =
  | BranchSelection
  | { kind: 'missing-target'; targetStepId: string; via: BranchVia; ruleId?: string };

/** 단계 ID → 단계. 경로 계산과 그래프 검증이 한 번 만들어 돌려 쓴다. (M6 DoD 10) */
export function buildStepIndex(steps: readonly GuideStep[]): ReadonlyMap<string, GuideStep> {
  return new Map(steps.map((step) => [step.id, step]));
}

/**
 * `priority` 오름차순. 동률은 `branchRules` 배열 인덱스가 작은 쪽이 이긴다.
 *
 * 동률 자체는 `graph-validator`가 `DUPLICATE_BRANCH_PRIORITY` 오류로 잡는다.
 * 엔진은 그 상태에서도 결정적으로 동작해야 하므로 던지지 않는다. 관대한 엔진과
 * 엄격한 검증기는 서로 다른 일을 한다.
 *
 * 원본 배열을 정렬하지 않는다. 호출자의 문서를 건드리면 자동 저장이 헛돈다.
 */
export function orderedBranchRules(step: GuideStep): readonly BranchRule[] {
  return step.branchRules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => a.rule.priority - b.rule.priority || a.index - b.index)
    .map((entry) => entry.rule);
}

function findBlock(step: GuideStep, blockId: string | undefined): ContentBlock | undefined {
  if (blockId === undefined) return undefined;
  return step.blocks.find((block) => block.id === blockId);
}

function decisionSource(step: GuideStep, rule: BranchRule): DecisionBlock | null {
  const block = findBlock(step, rule.sourceBlockId);
  return block !== undefined && block.type === 'decision' ? block : null;
}

function checklistSource(step: GuideStep, rule: BranchRule): ChecklistBlock | null {
  const block = findBlock(step, rule.sourceBlockId);
  return block !== undefined && block.type === 'checklist' ? block : null;
}

/** 이 체크리스트 블록의 필수 항목이 전부 체크됐는가. 필수 항목이 없으면 공허참이다. */
function allRequiredChecked(block: ChecklistBlock, answers: StepAnswers | undefined): boolean {
  // 순서·중복이 결과를 바꾸지 못하게 정규화한다. `checkedItemIds`는 블록별이
  // 아니라 단계 단위 평면 배열이라(기술 §2.3.3) 블록의 항목과 교차시켜야 한다.
  const checked = new Set(answers?.checkedItemIds ?? []);
  return block.items.every((item) => !item.required || checked.has(item.id));
}

/**
 * 규칙 하나가 참인가. 던지지 않는다.
 *
 * **소스를 해석할 수 없으면 연산자와 무관하게 `false`다.** `notEquals`·
 * `notChecked`가 true로 새면 망가진 규칙이 경로를 가로챈다. 소스 해석 실패는
 * 세 가지다 - `sourceBlockId`가 없음, 그 ID의 블록이 없음, 블록 타입이 연산자와
 * 맞지 않음. 단계 안의 유일한 블록을 암묵적으로 찾는 폴백은 두지 않는다.
 * 블록이 하나 추가되는 순간 경로가 조용히 바뀐다.
 *
 * 미응답의 의미가 연산자마다 다르다는 점에 주의한다. 선택지는 "아직 없음"이
 * 어느 쪽도 아니라 `equals`·`notEquals` 둘 다 false이고, 체크박스는 "아직 안
 * 함"이 곧 사실이라 `notChecked`가 true다.
 */
export function evaluateBranchRule(
  rule: BranchRule,
  step: GuideStep,
  answers?: StepAnswers,
): boolean {
  switch (rule.operator) {
    case 'equals':
    case 'notEquals': {
      const block = decisionSource(step, rule);
      if (block === null) return false;
      // 선택지 ID는 문자열이다. boolean이나 누락은 망가진 규칙이므로 양쪽 다 false다.
      if (typeof rule.value !== 'string') return false;

      const selected = answers?.selectedOptionByBlock?.[block.id];
      if (selected === undefined) return false;
      return rule.operator === 'equals' ? selected === rule.value : selected !== rule.value;
    }

    case 'checked':
    case 'notChecked': {
      const block = checklistSource(step, rule);
      if (block === null) return false;
      // `value`는 읽지 않는다. 항목 ID를 참조하기 시작하면 항목 삭제가 규칙을
      // 조용히 깬다. 체크리스트 분기는 블록 단위 참조다. (PROGRESS 2026-09-02)
      const satisfied = allRequiredChecked(block, answers);
      return rule.operator === 'checked' ? satisfied : !satisfied;
    }

    default:
      return unsupportedOperator(rule.operator);
  }
}

/** 소진 검사. 새 연산자가 생기면 여기서 컴파일이 깨진다. */
function unsupportedOperator(operator: never): false {
  void operator;
  return false;
}

/**
 * 이 단계가 다음으로 넘어갈 만큼 답해졌는가. (기술 §4.3.4-1 "필수 성공 조건")
 *
 * `selectBranchTarget`은 이 값을 **보지 않는다.** 디자인 §2.2.2가 선택과 이동을
 * 분리하라고 하므로 게이팅은 호출부(다음 단계 버튼, `StepStatus='blocked'`)의
 * 몫이다. 같은 판정을 두 곳에서 다시 짜지 않도록 여기서 내보낸다.
 */
export function isStepAnswered(step: GuideStep, answers?: StepAnswers): boolean {
  for (const block of step.blocks) {
    if (block.type === 'checklist' && !allRequiredChecked(block, answers)) return false;
    if (block.type === 'decision' && block.required) {
      if (answers?.selectedOptionByBlock?.[block.id] === undefined) return false;
    }
  }
  return true;
}

/** 이 단계에 아직 답을 기다리는 분기 입력이 있는가. */
function awaitsAnswer(step: GuideStep, answers: StepAnswers | undefined): boolean {
  return step.branchRules.some((rule) => {
    if (rule.operator === 'equals' || rule.operator === 'notEquals') {
      const block = decisionSource(step, rule);
      return block !== null && answers?.selectedOptionByBlock?.[block.id] === undefined;
    }
    return false;
  });
}

/**
 * 기술 §4.3.4의 2~5단계. 문서를 모르므로 대상이 실재하는지는 보지 않는다.
 *
 * 1. `priority` 오름차순으로 평가하고 **첫 참 규칙에서 멈춘다**. 뒤 규칙은
 *    평가하지 않는다.
 * 2. 참인 규칙이 없으면 `defaultNextStepId`.
 * 3. 그것도 없으면 완료. 단 아직 답하지 않은 선택지 분기가 남아 있으면
 *    `indeterminate`다 - 완료로 단정할 근거가 없다.
 */
export function selectBranchTarget(step: GuideStep, answers?: StepAnswers): BranchSelection {
  for (const rule of orderedBranchRules(step)) {
    if (!evaluateBranchRule(rule, step, answers)) continue;
    return { kind: 'next', stepId: rule.targetStepId, via: 'rule', ruleId: rule.id };
  }

  if (step.defaultNextStepId !== undefined) {
    return { kind: 'next', stepId: step.defaultNextStepId, via: 'default' };
  }

  return awaitsAnswer(step, answers) ? { kind: 'indeterminate' } : { kind: 'complete' };
}

/**
 * 다음 단계 판정의 단일 진입점. 작성기 미리보기와 리더가 이것을 공유한다. (INV-09)
 *
 * 대상이 문서에 없으면 `defaultNextStepId`로 폴백하지 **않는다**. 폴백하면 누락이
 * 숨고, 그 문서가 그대로 내보내진다.
 */
export function resolveNextStep(
  step: GuideStep,
  answers: StepAnswers | undefined,
  stepIndex: ReadonlyMap<string, GuideStep>,
): BranchOutcome {
  const selection = selectBranchTarget(step, answers);
  if (selection.kind !== 'next') return selection;
  if (stepIndex.has(selection.stepId)) return selection;

  return {
    kind: 'missing-target',
    targetStepId: selection.stepId,
    via: selection.via,
    ...(selection.ruleId === undefined ? {} : { ruleId: selection.ruleId }),
  };
}
