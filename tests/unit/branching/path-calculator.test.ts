import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseGuideDocument } from '@/domain/guide.schema.ts';
import type { GuideDocument } from '@/domain/guide.types.ts';
import type { ReaderStepState } from '@/domain/progress.types.ts';
import type { StepAnswers } from '@/features/branching/branch-engine.ts';
import {
  calculateActivePath,
  calculateProgress,
  isRequiredStep,
  reconcileStepStates,
  type AnswerMap,
} from '@/features/branching/path-calculator.ts';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');

function fixture(name: string): GuideDocument {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, `${name}.howsheet.json`), 'utf8'),
  );
  const outcome = parseGuideDocument(raw);
  if (!outcome.ok) throw new Error(`${name} 파싱 실패`);
  return outcome.document;
}

const branched = fixture('valid-branched');
const linear = fixture('valid-linear-5step');

const pick = (optionId: string): StepAnswers => ({
  selectedOptionByBlock: { 'block-decide': optionId },
});

const AT = '2026-09-02T00:00:00.000Z';

describe('활성 경로 (M6 DoD 1)', () => {
  it('선형 문서는 전체 단계가 경로다', () => {
    const path = calculateActivePath(linear, {});
    expect(path.stepIds).toEqual(linear.steps.map((step) => step.id));
    expect(path.end).toEqual({ reason: 'complete' });
  });

  it('선택에 따라 경로가 갈린다', () => {
    const toPc = calculateActivePath(branched, { 'step-start': pick('opt-pc') });
    expect(toPc.stepIds).toEqual(['step-start', 'step-pc', 'step-finish']);

    const toMobile = calculateActivePath(branched, {
      'step-start': pick('opt-mobile'),
      'step-mobile': { checkedItemIds: ['chk-m1'] },
    });
    expect(toMobile.stepIds).toEqual(['step-start', 'step-mobile', 'step-finish']);
  });

  it('아직 고르지 않은 분기에서 끊고 예상으로 표시한다', () => {
    // step-start에는 defaultNextStepId가 없다. 최저 우선순위 규칙의 대상을 골라
    // 이으면 독자가 하지 않은 답을 발명하는 것이다.
    const path = calculateActivePath(branched, {});
    expect(path.stepIds).toEqual(['step-start']);
    expect(path.estimated).toBe(true);
    expect(path.end).toEqual({ reason: 'indeterminate', stepId: 'step-start' });
  });

  it('기본 경로로 이은 구간은 예상이다', () => {
    const path = calculateActivePath(linear, {});
    expect(path.estimated).toBe(true);
    expect(path.confirmedLength).toBe(0);
  });

  it('답한 구간까지는 확정이다', () => {
    const path = calculateActivePath(branched, {
      'step-start': pick('opt-pc'),
      'step-pc': {},
    });
    expect(path.confirmedLength).toBe(2);
    expect(path.stepIds).toHaveLength(3);
  });

  it('같은 입력을 30번 넣어도 경로가 같다', () => {
    const answers: AnswerMap = { 'step-start': pick('opt-mobile') };
    const first = calculateActivePath(branched, answers);
    for (let i = 0; i < 30; i += 1) {
      expect(calculateActivePath(branched, answers)).toEqual(first);
    }
  });

  it('입력을 변형하지 않는다', () => {
    const before = structuredClone(branched);
    calculateActivePath(branched, { 'step-start': pick('opt-pc') });
    expect(branched).toEqual(before);
  });
});

describe('경로가 끝나는 이유', () => {
  it('순환에 들어가면 던지지 않고 멈춘다', () => {
    // invalid-cycle의 순환(a → b → c → a)은 기본 경로로만 닫힌다. step-a의
    // 규칙을 거짓으로 만들어야 그 경로로 들어간다.
    const doc = fixture('invalid-cycle');
    const start = doc.steps.find((step) => step.id === doc.startStepId)!;
    const intoCycle: GuideDocument = {
      ...doc,
      steps: doc.steps.map((step) => (step.id === start.id ? { ...step, branchRules: [] } : step)),
    };

    const path = calculateActivePath(intoCycle, {});
    expect(path.end.reason).toBe('cycle');
    // 방문한 단계가 중복되지 않는다. 무한 루프에 빠지지 않았다는 뜻이다.
    expect(new Set(path.stepIds).size).toBe(path.stepIds.length);
    expect(path.stepIds.length).toBeLessThanOrEqual(doc.steps.length);
  });

  it('자기 자신을 가리키는 간선에서도 멈춘다', () => {
    const doc = fixture('invalid-no-terminal');
    const path = calculateActivePath(doc, {});
    expect(path.end.reason).toBe('cycle');
  });

  it('없는 대상에서 멈춘다', () => {
    const doc = fixture('invalid-missing-target');
    const path = calculateActivePath(doc, { 'step-1': { checkedItemIds: ['chk-1'] } });
    expect(path.end).toEqual({
      reason: 'missingTarget',
      stepId: 'step-1',
      targetStepId: 'step-does-not-exist',
    });
  });

  it('시작 단계가 없으면 빈 경로다', () => {
    const doc: GuideDocument = { ...linear, startStepId: 'step-nope' };
    const path = calculateActivePath(doc, {});
    expect(path.stepIds).toEqual([]);
    expect(path.end).toEqual({ reason: 'startNotFound', startStepId: 'step-nope' });
  });
});

describe('경로 변경과 skipped (M6 DoD 7)', () => {
  const completed = (): Record<string, ReaderStepState> => ({
    'step-start': { status: 'completed', completedAt: AT },
    'step-pc': { status: 'completed', completedAt: AT },
    'step-finish': { status: 'pending' },
  });

  it('경로에서 빠진 완료 단계는 기록을 유지한 채 skipped가 된다', () => {
    const next = reconcileStepStates(
      branched,
      ['step-start', 'step-mobile', 'step-finish'],
      completed(),
    );

    expect(next['step-pc']).toEqual({ status: 'skipped', completedAt: AT });
  });

  it('경로에 돌아오면 completedAt으로 completed를 복원한다', () => {
    const skipped = reconcileStepStates(
      branched,
      ['step-start', 'step-mobile', 'step-finish'],
      completed(),
    );
    const restored = reconcileStepStates(
      branched,
      ['step-start', 'step-pc', 'step-finish'],
      skipped,
    );

    expect(restored['step-pc']).toEqual({ status: 'completed', completedAt: AT });
  });

  it('A → B → A로 되돌리면 최초 상태와 같다 (DoD 1)', () => {
    const first = reconcileStepStates(
      branched,
      ['step-start', 'step-pc', 'step-finish'],
      completed(),
    );
    const away = reconcileStepStates(branched, ['step-start', 'step-mobile', 'step-finish'], first);
    const back = reconcileStepStates(branched, ['step-start', 'step-pc', 'step-finish'], away);
    expect(back).toEqual(first);
  });

  it('답변 기록을 지우지 않는다', () => {
    const previous: Record<string, ReaderStepState> = {
      'step-mobile': {
        status: 'completed',
        completedAt: AT,
        checkedItemIds: ['chk-m1'],
        selectedOptionByBlock: { 'block-x': 'opt-1' },
      },
    };
    const next = reconcileStepStates(branched, ['step-start', 'step-pc'], previous);

    expect(next['step-mobile']).toEqual({
      status: 'skipped',
      completedAt: AT,
      checkedItemIds: ['chk-m1'],
      selectedOptionByBlock: { 'block-x': 'opt-1' },
    });
  });

  it('현재 단계만 active다', () => {
    const next = reconcileStepStates(
      branched,
      ['step-start', 'step-pc', 'step-finish'],
      completed(),
      'step-pc',
    );
    expect(next['step-pc']?.status).toBe('active');
    expect(next['step-start']?.status).toBe('completed');
  });

  it('기록이 없던 단계는 새로 만들지 않는다', () => {
    const next = reconcileStepStates(branched, ['step-start'], {});
    expect(Object.keys(next)).toEqual(['step-start']);
  });

  it('남길 기록이 없으면 빈 skipped를 만들지 않는다', () => {
    // 잠시 경로에 있었다는 사실만으로 항목을 남기면 상태가 이력의 함수가 된다.
    const onPath = reconcileStepStates(branched, ['step-start', 'step-pc'], {});
    const offPath = reconcileStepStates(branched, ['step-start'], onPath);
    expect(Object.keys(offPath)).toEqual(['step-start']);
  });

  it('키 순서는 활성 경로 순 다음 문서 순이다', () => {
    const next = reconcileStepStates(
      branched,
      ['step-start', 'step-mobile', 'step-finish'],
      completed(),
    );
    expect(Object.keys(next)).toEqual(['step-start', 'step-mobile', 'step-finish', 'step-pc']);
  });
});

describe('진행률 (M6 DoD 8)', () => {
  it('분모는 전체 단계가 아니라 활성 경로의 필수 단계 수다', () => {
    const answers: AnswerMap = { 'step-start': pick('opt-pc') };
    const activePath = calculateActivePath(branched, answers);
    const states = reconcileStepStates(branched, activePath.stepIds, {
      'step-start': { status: 'completed', completedAt: AT },
    });
    const progress = calculateProgress(branched, activePath, states);

    // 문서에는 단계가 4개지만 활성 경로는 3개다.
    expect(branched.steps).toHaveLength(4);
    expect(progress.totalRequired).toBe(3);
    expect(progress.completedRequired).toBe(1);
    expect(progress.ratio).toBeCloseTo(1 / 3);
  });

  it('optional 단계는 분모에서 빠진다', () => {
    const doc: GuideDocument = {
      ...branched,
      steps: branched.steps.map((step) =>
        step.id === 'step-pc' ? { ...step, optional: true } : step,
      ),
    };
    const activePath = calculateActivePath(doc, { 'step-start': pick('opt-pc') });
    const progress = calculateProgress(doc, activePath, {});

    expect(activePath.stepIds).toHaveLength(3);
    expect(progress.totalRequired).toBe(2);
  });

  it('optional은 completionMode와 무관하다', () => {
    const doc: GuideDocument = {
      ...linear,
      steps: linear.steps.map((step) => ({ ...step, completionMode: 'automatic' as const })),
    };
    expect(doc.steps.every(isRequiredStep)).toBe(true);
  });

  it('분모가 0이면 0이고 던지지 않는다', () => {
    const doc: GuideDocument = {
      ...linear,
      steps: linear.steps.map((step) => ({ ...step, optional: true })),
    };
    const progress = calculateProgress(doc, calculateActivePath(doc, {}), {});
    expect(progress.totalRequired).toBe(0);
    expect(progress.ratio).toBe(0);
  });

  it('예상 여부를 그대로 전달한다', () => {
    const activePath = calculateActivePath(linear, {});
    expect(calculateProgress(linear, activePath, {}).estimated).toBe(true);
  });

  it('현재 위치를 경로 기준으로 알려 준다', () => {
    const activePath = calculateActivePath(linear, {});
    const progress = calculateProgress(linear, activePath, {}, linear.steps[2]!.id);
    expect(progress.currentIndex).toBe(2);
    expect(progress.pathLength).toBe(5);
  });

  it('경로에 없는 단계에 서 있으면 -1이다', () => {
    const activePath = calculateActivePath(branched, { 'step-start': pick('opt-pc') });
    expect(calculateProgress(branched, activePath, {}, 'step-mobile').currentIndex).toBe(-1);
  });
});
