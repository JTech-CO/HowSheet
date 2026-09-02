/**
 * 활성 경로와 진행률 계산.
 *
 * 기준: 기술 백서 §4.4.2(활성 경로 계산), §4.3.4-6·7, §2.3.3(진행 상태 모델).
 * 하네스 M6 DoD 1·7·8.
 *
 * 순수 함수다. 같은 `(문서, 답변)`이면 항상 같은 결과를 낸다. 시각·난수·저장소를
 * 읽지 않고 입력을 변형하지 않는다.
 *
 * **`status`는 파생값이고 나머지 세 필드가 저장 사실이다.** `ReaderStepState`의
 * `status`는 단일 필드라 `skipped`로 덮는 순간 `completed`가 사라진다. 다행히
 * 재구성할 수 없는 정보는 `completedAt`뿐이라(`active`는 커서에서, `pending`은
 * 기본값에서 다시 나온다) 그것을 지우지 않으면 §4.3.4-6의 "완료 상태를 보존하되
 * 비활성으로 표시한다"가 성립한다. 복원할 수 없는 보존은 보존이 아니다.
 */

import type { GuideDocument, GuideStep } from '../../domain/guide.types.ts';
import type { ReaderStepState } from '../../domain/progress.types.ts';
import { buildStepIndex, selectBranchTarget, type StepAnswers } from './branch-engine.ts';

/** 단계 ID → 답변. 키가 없으면 아직 도달하지 않은 단계다. */
export type AnswerMap = Readonly<Record<string, StepAnswers>>;

/**
 * 경로가 끝난 이유.
 *
 * `complete` 외에는 전부 `graph-validator`가 이슈로 잡는 상태다. 계산기는
 * 판정하지 않고 왜 멈췄는지만 알린다. 편집 중인 미완성 문서도 계속 통과해야
 * 하므로 던지지 않는다.
 */
export type PathEnd =
  | { reason: 'complete' }
  | { reason: 'indeterminate'; stepId: string }
  | { reason: 'missingTarget'; stepId: string; targetStepId: string }
  | { reason: 'cycle'; stepId: string; targetStepId: string }
  | { reason: 'startNotFound'; startStepId: string };

export interface ActivePath {
  /** 시작 단계부터 순서대로. 중복이 없다. `ReaderProgress.activePath`에 그대로 들어간다. */
  stepIds: string[];
  /** 실제 답변으로 확정된 앞 구간의 길이. `0 <= confirmedLength <= stepIds.length` */
  confirmedLength: number;
  /** 기본 경로 추정을 포함하거나 잘려 있으면 true. 기술 §4.4.2의 "예상 진행률". */
  estimated: boolean;
  end: PathEnd;
}

export interface ProgressSummary {
  /** 활성 경로의 필수 단계 중 완료된 수. */
  completedRequired: number;
  /** 진행률 분모. 전체 단계가 아니라 **활성 경로의 필수 단계 수**다. (M6 DoD 8) */
  totalRequired: number;
  /** 0~1. 분모가 0이면 0. 백분율 변환과 반올림은 화면이 한다. */
  ratio: number;
  /** true면 "예상 진행률"로 표시한다. */
  estimated: boolean;
  /** "3 / 7 단계"용. 완료율이 아니라 위치다. */
  pathLength: number;
  /** 활성 경로에서 현재 단계의 0부터 세는 위치. 경로에 없으면 -1. */
  currentIndex: number;
}

/**
 * 진행률 분모에 드는 단계인가.
 *
 * `GuideStep.optional`이 유일한 원본이다. `completionMode`는 *어떻게* 완료
 * 처리하는지이지 *분모에 드는지*가 아니다. 둘을 잇는 문장이 백서에 없다.
 */
export function isRequiredStep(step: GuideStep): boolean {
  return !step.optional;
}

/**
 * 활성 경로를 계산한다. (기술 §4.4.2)
 *
 * 시작 단계부터 `selectBranchTarget`을 반복 호출한다. 아직 답하지 않은 분기에서는
 * `defaultNextStepId`가 있으면 그것으로 잇고 `estimated`를 세운다. 기본 경로가
 * 없으면 **거기서 자른다.** 최저 우선순위 규칙의 대상을 골라 잇는 것은 독자가
 * 하지 않은 답을 발명하는 것이다.
 *
 * 이미 지나온 단계가 다시 나오면 즉시 멈춘다. 이 상한은 **탐지 수단이 아니라
 * 방어**다. 순환의 탐지와 차단은 `graph-validator`가 `CYCLE_DETECTED`로 한다.
 * (하네스 M6 주의 - max iteration으로 숨기지 않는다)
 */
export function calculateActivePath(doc: GuideDocument, answers: AnswerMap): ActivePath {
  const stepIndex = buildStepIndex(doc.steps);
  const stepIds: string[] = [];
  const seen = new Set<string>();

  let cursor = stepIndex.get(doc.startStepId);
  if (cursor === undefined) {
    return {
      stepIds,
      confirmedLength: 0,
      estimated: false,
      end: { reason: 'startNotFound', startStepId: doc.startStepId },
    };
  }

  let confirmedLength = 0;
  let estimated = false;

  for (;;) {
    stepIds.push(cursor.id);
    seen.add(cursor.id);

    const answered = Object.hasOwn(answers, cursor.id);
    if (answered && !estimated) confirmedLength = stepIds.length;

    const selection = selectBranchTarget(cursor, answers[cursor.id]);

    if (selection.kind === 'complete') {
      return { stepIds, confirmedLength, estimated, end: { reason: 'complete' } };
    }

    if (selection.kind === 'indeterminate') {
      // 답을 기다리는 분기다. 여기서 끊고 예상 진행률로 표시한다.
      return {
        stepIds,
        confirmedLength,
        estimated: true,
        end: { reason: 'indeterminate', stepId: cursor.id },
      };
    }

    // 규칙이 아니라 기본 경로로 이었고 아직 답하지 않았다면 추정 구간이 시작된다.
    if (!answered) estimated = true;

    const next = stepIndex.get(selection.stepId);
    if (next === undefined) {
      return {
        stepIds,
        confirmedLength,
        estimated,
        end: {
          reason: 'missingTarget',
          stepId: cursor.id,
          targetStepId: selection.stepId,
        },
      };
    }

    if (seen.has(next.id)) {
      return {
        stepIds,
        confirmedLength,
        estimated,
        end: { reason: 'cycle', stepId: cursor.id, targetStepId: next.id },
      };
    }

    cursor = next;
  }
}

/**
 * 활성 경로 기준으로 단계 상태를 다시 매긴다. (M6 DoD 7)
 *
 * 경로에서 빠진 단계는 `skipped`가 되고 `completedAt`·`checkedItemIds`·
 * `selectedOptionByBlock`은 **그대로 남는다**. 경로에 다시 들어오면
 * `completedAt`으로 `completed`를 복원한다. 그러지 않으면 A→B→A로 답을 되돌린
 * 결과가 최초 A와 달라져 상태가 `(문서, 답변)`의 함수가 아니라 이력의 함수가 된다.
 *
 * 키 삽입 순서는 활성 경로 순 → 나머지는 문서 순이다. INV-09와 자동 저장의
 * 스냅샷 비교가 직렬화 결과에 의존한다.
 */
/** 상태를 뺀 나머지에 남길 것이 있는가. `status`는 파생값이라 세지 않는다. */
function hasRecord(state: ReaderStepState): boolean {
  return (
    state.completedAt !== undefined ||
    state.checkedItemIds !== undefined ||
    state.selectedOptionByBlock !== undefined
  );
}

export function reconcileStepStates(
  doc: GuideDocument,
  activePath: readonly string[],
  previous: Readonly<Record<string, ReaderStepState>>,
  currentStepId?: string,
): Record<string, ReaderStepState> {
  const onPath = new Set(activePath);
  const next: Record<string, ReaderStepState> = {};

  const assign = (stepId: string) => {
    const before = previous[stepId];
    const carried: ReaderStepState = {
      status: 'pending',
      ...(before?.completedAt === undefined ? {} : { completedAt: before.completedAt }),
      ...(before?.checkedItemIds === undefined ? {} : { checkedItemIds: before.checkedItemIds }),
      ...(before?.selectedOptionByBlock === undefined
        ? {}
        : { selectedOptionByBlock: before.selectedOptionByBlock }),
    };

    if (!onPath.has(stepId)) {
      // 기록은 지우지 않는다. 상태만 비활성으로 바꾼다. (§4.3.4-6)
      //
      // 남길 기록이 없으면 항목 자체를 만들지 않는다. 잠시 경로에 있었다는
      // 사실만으로 빈 `skipped`를 남기면 상태가 (문서, 답변)의 함수가 아니라
      // 이력의 함수가 되고, A → B → A로 되돌린 결과가 최초와 달라진다.
      if (!hasRecord(carried)) return;
      next[stepId] = { ...carried, status: 'skipped' };
      return;
    }

    if (stepId === currentStepId) {
      next[stepId] = { ...carried, status: 'active' };
      return;
    }

    next[stepId] = {
      ...carried,
      status: carried.completedAt === undefined ? 'pending' : 'completed',
    };
  };

  for (const stepId of activePath) assign(stepId);
  for (const step of doc.steps) {
    if (Object.hasOwn(next, step.id)) continue;
    if (previous[step.id] === undefined) continue;
    assign(step.id);
  }

  return next;
}

/**
 * 진행률. (M6 DoD 8, 기술 §4.4.2)
 *
 * ```text
 * progress = completedRequiredStepsOnActivePath / requiredStepsOnActivePath
 * ```
 *
 * 분모가 0이면 0을 돌려준다. 완료 화면 전환은 이 값이 아니라
 * `ReaderProgress.completed`가 판정한다.
 */
export function calculateProgress(
  doc: GuideDocument,
  path: ActivePath,
  stepState: Readonly<Record<string, ReaderStepState>>,
  currentStepId?: string,
): ProgressSummary {
  const stepIndex = buildStepIndex(doc.steps);

  let totalRequired = 0;
  let completedRequired = 0;

  for (const stepId of path.stepIds) {
    const step = stepIndex.get(stepId);
    if (step === undefined || !isRequiredStep(step)) continue;
    totalRequired += 1;
    if (stepState[stepId]?.status === 'completed') completedRequired += 1;
  }

  return {
    completedRequired,
    totalRequired,
    ratio: totalRequired === 0 ? 0 : completedRequired / totalRequired,
    estimated: path.estimated,
    pathLength: path.stepIds.length,
    currentIndex: currentStepId === undefined ? -1 : path.stepIds.indexOf(currentStepId),
  };
}
