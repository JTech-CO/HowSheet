/**
 * 리더 상태 전이.
 *
 * 기준: 기술 백서 §2.2.2(독자 흐름), §2.3.3(진행 상태 모델), §4.3.4(분기 실행),
 * §4.3.7(리더 진행 저장). 하네스 M7 DoD 1·2·5·7, INV-09·INV-10·INV-11.
 *
 * **프레임워크에 의존하지 않는다.** React·DOM·저장소를 모르고 시각도 읽지
 * 않는다(`now`를 받는다). 앱 내 리더(`store/reader.store.ts`)와 내보낸 HTML
 * (`reader-runtime/index.ts`)이 같은 함수를 부른다. 그래야 INV-09의 의미
 * 정합성이 손으로 유지하는 약속이 아니라 구조가 된다.
 *
 * 분기 판정은 `features/branching`이 이미 갖고 있다. 여기서 다시 만들지 않는다.
 */

import type {
  GuideDocument,
  GuideSettings,
  GuideStep,
  ThemePreference,
} from '../domain/guide.types.ts';
import {
  createReaderProgress,
  type ReaderProgress,
  type ReaderStepState,
} from '../domain/progress.types.ts';
import {
  buildStepIndex,
  isStepAnswered,
  resolveNextStep,
  type StepAnswers,
} from '../features/branching/branch-engine.ts';
import {
  calculateActivePath,
  calculateProgress,
  reconcileStepStates,
  type ActivePath,
  type AnswerMap,
  type ProgressSummary,
} from '../features/branching/path-calculator.ts';

/** 리더가 화면에 그리는 데 필요한 전부. 파생값은 여기서 한 번만 계산한다. */
export interface ReaderSnapshot {
  readonly progress: ReaderProgress;
  readonly path: ActivePath;
  readonly summary: ProgressSummary;
}

/**
 * 다음 단계로 갈 수 없는 이유.
 *
 * `missing-target`은 완료가 아니다. 디자인 §7.3이 리더에 오류 화면을 요구하므로
 * 둘을 구별해야 한다. M6의 `BranchOutcome`이 이미 그렇게 나눠 두었다.
 */
export type AdvanceBlock =
  | { kind: 'not-answered'; stepId: string }
  | { kind: 'missing-target'; stepId: string; targetStepId: string };

export type AdvanceResult =
  { kind: 'moved' | 'completed'; snapshot: ReaderSnapshot } | AdvanceBlock;

/** 진행 상태를 분기 엔진이 읽는 모양으로 바꾼다. */
export function toAnswerMap(progress: ReaderProgress): AnswerMap {
  const map: Record<string, StepAnswers> = {};
  for (const [stepId, state] of Object.entries(progress.stepState)) {
    map[stepId] = {
      ...(state.checkedItemIds === undefined ? {} : { checkedItemIds: state.checkedItemIds }),
      ...(state.selectedOptionByBlock === undefined
        ? {}
        : { selectedOptionByBlock: state.selectedOptionByBlock }),
    };
  }
  return map;
}

/**
 * 진행 상태에서 경로·상태·진행률을 다시 계산한다.
 *
 * 커서가 새 경로에서 빠졌으면 경로 안의 가장 가까운 앞 단계로 되돌린다.
 * 그러지 않으면 `reconcileStepStates`가 경로 밖 단계를 `active`로 만들어
 * §4.3.4-6("완료 상태를 보존하되 비활성으로 표시")과 커서가 모순된다.
 */
export function recompute(doc: GuideDocument, progress: ReaderProgress): ReaderSnapshot {
  const path = calculateActivePath(doc, toAnswerMap(progress));

  let currentStepId = progress.currentStepId;
  if (!path.stepIds.includes(currentStepId)) {
    // 되돌아갈 곳이 없으면 경로의 첫 단계다. 경로가 비었으면 그대로 둔다 -
    // `startNotFound`는 오류 화면이 받는다.
    currentStepId = path.stepIds[path.stepIds.length - 1] ?? currentStepId;
  }

  // 완료한 뒤에는 어느 단계도 `active`가 아니다. 커서를 그대로 넘기면 마지막
  // 단계가 `active`로 덮여 `completedAt`이 있는데도 진행률 분자에서 빠진다.
  const cursor = progress.completed ? undefined : currentStepId;

  const stepState = reconcileStepStates(doc, path.stepIds, progress.stepState, cursor);
  const next: ReaderProgress = {
    ...progress,
    currentStepId,
    activePath: path.stepIds,
    stepState,
  };

  return { progress: next, path, summary: calculateProgress(doc, path, stepState, currentStepId) };
}

/**
 * 진행을 새로 만든다.
 *
 * **시작 화면 진입만으로 만들지 않는다.** 첫 단계 진입 CTA를 누른 시점에
 * 부른다. 화면을 열자마자 만들면 다음 방문에서 "0단계 이어하기"가 뜬다.
 */
export function startProgress(
  doc: GuideDocument,
  now: string,
  acknowledgedWarningIds: readonly string[] = [],
): ReaderSnapshot {
  const base = createReaderProgress(doc.id, doc.revision, doc.startStepId, now);
  return recompute(doc, { ...base, acknowledgedWarningIds: [...acknowledgedWarningIds] });
}

/**
 * 저장된 진행을 이어받는다.
 *
 * 문서가 그 사이 바뀌어 저장된 커서가 사라졌을 수 있다. 그때는 경로 안으로
 * 되돌리되 **기록은 지우지 않는다.** (하네스 M7 주의)
 */
export function resumeProgress(doc: GuideDocument, restored: ReaderProgress): ReaderSnapshot {
  return recompute(doc, { ...restored, guideId: doc.id, revision: doc.revision });
}

/** 저장된 커서가 새 문서에서 사라졌는가. 화면이 "처음으로 돌아갑니다"를 알릴 때 쓴다. */
export function cursorWasDropped(doc: GuideDocument, restored: ReaderProgress): boolean {
  return !buildStepIndex(doc.steps).has(restored.currentStepId);
}

// ────────────────────────────────────────────────────── 진입 게이트

/**
 * 첫 단계로 들어갈 수 있는가. (M7 DoD 1)
 *
 * 필수 준비물을 모두 체크했고 필수 확인 경고를 모두 확인해야 한다. 준비물
 * 체크는 진행 모델에 자리가 없으므로(§2.3.3) 호출자가 들고 있는 집합을 받는다.
 * 이어하기는 이 게이트를 지나지 않는다 - 이미 한 번 통과한 독자다. (§2.2.2)
 */
export function canEnterSteps(
  doc: GuideDocument,
  checkedPreparationIds: ReadonlySet<string>,
  acknowledgedWarningIds: ReadonlySet<string>,
): boolean {
  const preparationReady = doc.preparation.every(
    (item) => !item.required || checkedPreparationIds.has(item.id),
  );
  const warningsReady = doc.warnings.every(
    (warning) => !warning.requiresAcknowledgement || acknowledgedWarningIds.has(warning.id),
  );
  return preparationReady && warningsReady;
}

/**
 * 이 단계에서 다음으로 넘어갈 수 있는가. (M7 DoD 2)
 *
 * `completionMode`가 아니라 실제 입력을 본다. `checkbox`인데 성공 기준이 없는
 * 단계, `automatic`인데 성공 기준 문장만 있는 단계가 픽스처에 실제로 있다.
 * 모드를 게이트로 삼으면 그 문서들이 완주할 수 없다.
 */
export function canAdvance(step: GuideStep, answers: StepAnswers | undefined): boolean {
  // 성공 체크는 `completedAt`으로 기록하고 진행률의 분자가 된다. 게이트는
  // 아니다. 체크를 게이트로 삼으면 `successCriteria`가 없는 `checkbox` 단계
  // (픽스처에 실제로 있다)에서 영원히 못 넘어간다.
  return isStepAnswered(step, answers);
}

/** 성공 체크박스를 그릴 단계인가. 기준 문장이 없으면 체크할 것이 없다. */
export function needsSuccessCheck(step: GuideStep): boolean {
  return step.completionMode === 'checkbox' && step.successCriteria !== undefined;
}

// ────────────────────────────────────────────────────── 상태 전이

function patchStep(
  progress: ReaderProgress,
  stepId: string,
  update: (state: ReaderStepState) => ReaderStepState,
  now: string,
): ReaderProgress {
  const before = progress.stepState[stepId] ?? { status: 'active' };
  return {
    ...progress,
    updatedAt: now,
    stepState: { ...progress.stepState, [stepId]: update(before) },
  };
}

/** 경고 확인. 진행이 만들어지기 전에도 부를 수 있게 ID 집합만 다룬다. */
export function acknowledgeWarning(
  snapshot: ReaderSnapshot,
  doc: GuideDocument,
  warningId: string,
  now: string,
): ReaderSnapshot {
  if (snapshot.progress.acknowledgedWarningIds.includes(warningId)) return snapshot;
  return recompute(doc, {
    ...snapshot.progress,
    updatedAt: now,
    acknowledgedWarningIds: [...snapshot.progress.acknowledgedWarningIds, warningId],
  });
}

/** 체크리스트 항목 토글. 분기 조건이 바뀔 수 있으므로 경로를 다시 계산한다. */
export function setChecked(
  snapshot: ReaderSnapshot,
  doc: GuideDocument,
  stepId: string,
  itemId: string,
  checked: boolean,
  now: string,
): ReaderSnapshot {
  return recompute(
    doc,
    patchStep(
      snapshot.progress,
      stepId,
      (state) => {
        const current = new Set(state.checkedItemIds ?? []);
        if (checked) current.add(itemId);
        else current.delete(itemId);
        return { ...state, checkedItemIds: [...current].sort() };
      },
      now,
    ),
  );
}

/** 선택지 고르기. **고르는 것과 이동하는 것은 다르다.** (디자인 §2.2.2) */
export function selectOption(
  snapshot: ReaderSnapshot,
  doc: GuideDocument,
  stepId: string,
  blockId: string,
  optionId: string,
  now: string,
): ReaderSnapshot {
  return recompute(
    doc,
    patchStep(
      snapshot.progress,
      stepId,
      (state) => ({
        ...state,
        selectedOptionByBlock: { ...state.selectedOptionByBlock, [blockId]: optionId },
      }),
      now,
    ),
  );
}

/** 성공 체크. `completedAt`이 곧 완료 기록이고 `status`는 거기서 파생된다. */
export function setStepCompleted(
  snapshot: ReaderSnapshot,
  doc: GuideDocument,
  stepId: string,
  completed: boolean,
  now: string,
): ReaderSnapshot {
  return recompute(
    doc,
    patchStep(
      snapshot.progress,
      stepId,
      (state) => {
        if (!completed) {
          const { completedAt: _dropped, ...rest } = state;
          return { ...rest, status: 'active' };
        }
        return { ...state, completedAt: now };
      },
      now,
    ),
  );
}

/**
 * 다음 단계로 간다. (기술 §4.3.4)
 *
 * 떠나는 단계에 `completedAt`을 남긴다. 그러지 않으면 `choice`·`automatic`
 * 단계가 진행률 분자에 영원히 들어가지 않는다.
 */
export function advance(snapshot: ReaderSnapshot, doc: GuideDocument, now: string): AdvanceResult {
  const stepIndex = buildStepIndex(doc.steps);
  const current = stepIndex.get(snapshot.progress.currentStepId);
  if (current === undefined) {
    return { kind: 'not-answered', stepId: snapshot.progress.currentStepId };
  }

  const answers = snapshot.progress.stepState[current.id];
  if (!canAdvance(current, answers)) return { kind: 'not-answered', stepId: current.id };

  const outcome = resolveNextStep(current, answers, stepIndex);
  if (outcome.kind === 'missing-target') {
    return { kind: 'missing-target', stepId: current.id, targetStepId: outcome.targetStepId };
  }
  if (outcome.kind === 'indeterminate') return { kind: 'not-answered', stepId: current.id };

  const completed = patchStep(
    snapshot.progress,
    current.id,
    (state) => ({ ...state, completedAt: state.completedAt ?? now }),
    now,
  );

  if (outcome.kind === 'complete') {
    return {
      kind: 'completed',
      snapshot: recompute(doc, { ...completed, completed: true }),
    };
  }

  return {
    kind: 'moved',
    snapshot: recompute(doc, { ...completed, currentStepId: outcome.stepId, completed: false }),
  };
}

/** 이전 단계로. 활성 경로 위에서만 움직인다. 기록은 건드리지 않는다. */
export function goBack(snapshot: ReaderSnapshot, doc: GuideDocument, now: string): ReaderSnapshot {
  const index = snapshot.path.stepIds.indexOf(snapshot.progress.currentStepId);
  const target = index <= 0 ? null : snapshot.path.stepIds[index - 1];
  if (target === null || target === undefined) return snapshot;

  return recompute(doc, {
    ...snapshot.progress,
    updatedAt: now,
    currentStepId: target,
    completed: false,
  });
}

// ────────────────────────────────────────────────────── 테마

/**
 * 리더 테마. **작성기 테마 키를 읽지 않는다.** (File_Structure.md §2.3)
 *
 * 가이드의 `defaultTheme`이 기준이고, `allowThemeSwitch`가 켜져 있을 때만
 * 독자의 선택이 이긴다.
 */
export function resolveReaderTheme(
  settings: GuideSettings,
  override: ThemePreference | null,
  prefersDark: boolean,
): 'light' | 'dark' {
  const effective =
    settings.allowThemeSwitch && override !== null ? override : settings.defaultTheme;
  if (effective === 'light' || effective === 'dark') return effective;
  return prefersDark ? 'dark' : 'light';
}
