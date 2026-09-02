import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseGuideDocument } from '@/domain/guide.schema.ts';
import type { GuideDocument } from '@/domain/guide.types.ts';
import {
  acknowledgeWarning,
  advance,
  canAdvance,
  canEnterSteps,
  cursorWasDropped,
  goBack,
  needsSuccessCheck,
  recompute,
  resumeProgress,
  selectOption,
  setChecked,
  setStepCompleted,
  startProgress,
  toAnswerMap,
} from '@/reader-runtime/reader-state.ts';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');

function fixture(name: string): GuideDocument {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, `${name}.howsheet.json`), 'utf8'),
  );
  const outcome = parseGuideDocument(raw);
  if (!outcome.ok) throw new Error(`${name} 파싱 실패`);
  return outcome.document;
}

const linear = fixture('valid-linear-5step');
const branched = fixture('valid-branched');

const AT = '2026-09-03T00:00:00.000Z';
const LATER = '2026-09-03T00:10:00.000Z';

const stepOf = (doc: GuideDocument, id: string) => doc.steps.find((step) => step.id === id)!;

describe('진입 게이트 (M7 DoD 1)', () => {
  it('필수 준비물을 모두 체크해야 들어갈 수 있다', () => {
    const required = linear.preparation.filter((item) => item.required).map((item) => item.id);
    expect(required.length).toBeGreaterThan(0);

    expect(canEnterSteps(linear, new Set(), new Set(ackAll(linear)))).toBe(false);
    expect(canEnterSteps(linear, new Set(required), new Set(ackAll(linear)))).toBe(true);
  });

  it('선택 준비물은 게이트가 아니다', () => {
    const optional = linear.preparation.filter((item) => !item.required);
    const required = linear.preparation.filter((item) => item.required).map((item) => item.id);

    // 선택 항목을 빼고도 통과한다.
    expect(canEnterSteps(linear, new Set(required), new Set(ackAll(linear)))).toBe(true);
    expect(optional.length).toBeGreaterThanOrEqual(0);
  });

  it('필수 확인 경고를 모두 확인해야 들어갈 수 있다', () => {
    const required = linear.preparation.filter((item) => item.required).map((item) => item.id);
    const acks = ackAll(linear);
    expect(acks.length).toBeGreaterThan(0);

    expect(canEnterSteps(linear, new Set(required), new Set())).toBe(false);
    expect(canEnterSteps(linear, new Set(required), new Set(acks))).toBe(true);
  });

  it('준비물도 필수 경고도 없으면 공허참이다', () => {
    const bare: GuideDocument = { ...linear, preparation: [], warnings: [] };
    expect(canEnterSteps(bare, new Set(), new Set())).toBe(true);
  });
});

function ackAll(doc: GuideDocument): string[] {
  return doc.warnings.filter((w) => w.requiresAcknowledgement).map((w) => w.id);
}

describe('진행 게이트 (M7 DoD 2)', () => {
  it('필수 선택지를 고르기 전에는 넘어갈 수 없다', () => {
    const start = stepOf(branched, 'step-start');
    expect(canAdvance(start, undefined)).toBe(false);
    expect(canAdvance(start, { selectedOptionByBlock: { 'block-decide': 'opt-pc' } })).toBe(true);
  });

  it('필수 체크리스트 항목이 남아 있으면 넘어갈 수 없다', () => {
    const mobile = stepOf(branched, 'step-mobile');
    expect(canAdvance(mobile, undefined)).toBe(false);
    expect(canAdvance(mobile, { checkedItemIds: ['chk-m1'] })).toBe(true);
  });

  // 성공 체크는 진행률의 분자이지 게이트가 아니다. 게이트로 삼으면
  // `successCriteria`가 없는 checkbox 단계에서 영원히 못 넘어간다.
  it('성공 체크는 게이트가 아니다', () => {
    const pc = stepOf(branched, 'step-pc');
    expect(pc.completionMode).toBe('checkbox');
    expect(canAdvance(pc, undefined)).toBe(true);
  });

  it('성공 기준이 없으면 체크박스를 그리지 않는다', () => {
    const pc = stepOf(branched, 'step-pc');
    expect(pc.successCriteria).toBeUndefined();
    expect(needsSuccessCheck(pc)).toBe(false);
  });
});

describe('진행 시작과 이어하기 (M7 DoD 5)', () => {
  it('시작하면 첫 단계가 현재 단계다', () => {
    const snapshot = startProgress(linear, AT, ackAll(linear));
    expect(snapshot.progress.currentStepId).toBe(linear.startStepId);
    expect(snapshot.progress.acknowledgedWarningIds).toEqual(ackAll(linear));
    expect(snapshot.progress.revision).toBe(linear.revision);
  });

  it('저장된 진행을 이어받으면 커서와 답변이 살아난다', () => {
    let snapshot = startProgress(branched, AT);
    snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-pc', AT);
    const advanced = advance(snapshot, branched, AT);
    expect(advanced.kind).toBe('moved');
    if (advanced.kind !== 'moved') return;

    const restored = resumeProgress(branched, advanced.snapshot.progress);
    expect(restored.progress.currentStepId).toBe('step-pc');
    expect(restored.progress.stepState['step-start']?.selectedOptionByBlock).toEqual({
      'block-decide': 'opt-pc',
    });
  });

  it('문서가 바뀌어 커서가 사라지면 그 사실을 알린다', () => {
    const snapshot = startProgress(linear, AT);
    const moved = { ...snapshot.progress, currentStepId: 'step-gone' };
    expect(cursorWasDropped(linear, moved)).toBe(true);
    expect(cursorWasDropped(linear, snapshot.progress)).toBe(false);
  });

  it('커서가 사라져도 기록은 지우지 않는다 (M7 주의)', () => {
    let snapshot = startProgress(linear, AT);
    const first = linear.steps[0]!.id;
    snapshot = setStepCompleted(snapshot, linear, first, true, AT);

    const restored = resumeProgress(linear, {
      ...snapshot.progress,
      currentStepId: 'step-gone',
    });
    expect(restored.progress.stepState[first]?.completedAt).toBe(AT);
  });
});

describe('상태 전이', () => {
  it('체크는 순서·중복에 영향받지 않게 정규화된다', () => {
    let snapshot = startProgress(branched, AT);
    snapshot = setChecked(snapshot, branched, 'step-mobile', 'chk-m1', true, AT);
    snapshot = setChecked(snapshot, branched, 'step-mobile', 'chk-m1', true, LATER);
    expect(snapshot.progress.stepState['step-mobile']?.checkedItemIds).toEqual(['chk-m1']);
  });

  it('체크를 풀면 목록에서 빠진다', () => {
    let snapshot = startProgress(branched, AT);
    snapshot = setChecked(snapshot, branched, 'step-mobile', 'chk-m1', true, AT);
    snapshot = setChecked(snapshot, branched, 'step-mobile', 'chk-m1', false, LATER);
    expect(snapshot.progress.stepState['step-mobile']?.checkedItemIds).toEqual([]);
  });

  it('선택은 경로를 바꾼다', () => {
    let snapshot = startProgress(branched, AT);
    expect(snapshot.path.stepIds).toEqual(['step-start']);

    // step-mobile의 notChecked 규칙이 미체크 상태에서 참이라 경로가 끝까지 이어진다.
    snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-mobile', AT);
    expect(snapshot.path.stepIds).toEqual(['step-start', 'step-mobile', 'step-finish']);
  });

  it('성공 체크를 풀면 completedAt이 사라진다', () => {
    const first = linear.steps[0]!.id;
    let snapshot = startProgress(linear, AT);
    snapshot = setStepCompleted(snapshot, linear, first, true, AT);
    expect(snapshot.progress.stepState[first]?.completedAt).toBe(AT);

    snapshot = setStepCompleted(snapshot, linear, first, false, LATER);
    expect(snapshot.progress.stepState[first]?.completedAt).toBeUndefined();
  });

  it('경고 확인은 중복으로 쌓이지 않는다', () => {
    const warningId = ackAll(linear)[0]!;
    let snapshot = startProgress(linear, AT);
    snapshot = acknowledgeWarning(snapshot, linear, warningId, AT);
    snapshot = acknowledgeWarning(snapshot, linear, warningId, LATER);
    expect(snapshot.progress.acknowledgedWarningIds).toEqual([warningId]);
  });
});

describe('다음 단계 (M7 DoD 3)', () => {
  it('답하지 않으면 못 넘어간다', () => {
    const snapshot = startProgress(branched, AT);
    expect(advance(snapshot, branched, AT)).toEqual({
      kind: 'not-answered',
      stepId: 'step-start',
    });
  });

  it('떠나는 단계에 완료 시각을 남긴다', () => {
    let snapshot = startProgress(branched, AT);
    snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-pc', AT);

    const moved = advance(snapshot, branched, LATER);
    expect(moved.kind).toBe('moved');
    if (moved.kind !== 'moved') return;
    // 이것이 없으면 choice·automatic 단계가 진행률 분자에 영원히 안 들어간다.
    expect(moved.snapshot.progress.stepState['step-start']?.completedAt).toBe(LATER);
  });

  it('선형 픽스처를 끝까지 완주한다', () => {
    let snapshot = startProgress(linear, AT);

    for (let index = 0; index < linear.steps.length - 1; index += 1) {
      // step-4에는 필수 체크리스트 항목이 있다. 답해야 넘어간다. (DoD 2)
      const stepId = snapshot.progress.currentStepId;
      if (stepId === 'step-4') {
        expect(advance(snapshot, linear, AT).kind).toBe('not-answered');
        snapshot = setChecked(snapshot, linear, stepId, 'chk-1', true, AT);
      }

      const result = advance(snapshot, linear, AT);
      expect(result.kind).toBe('moved');
      if (result.kind !== 'moved') return;
      snapshot = result.snapshot;
    }

    const done = advance(snapshot, linear, AT);
    expect(done.kind).toBe('completed');
    if (done.kind !== 'completed') return;
    expect(done.snapshot.progress.completed).toBe(true);
  });

  it('분기 픽스처를 두 경로 모두 완주한다', () => {
    for (const [option, expected] of [
      ['opt-pc', ['step-start', 'step-pc', 'step-finish']],
      ['opt-mobile', ['step-start', 'step-mobile', 'step-finish']],
    ] as const) {
      let snapshot = startProgress(branched, AT);
      snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', option, AT);

      const first = advance(snapshot, branched, AT);
      expect(first.kind).toBe('moved');
      if (first.kind !== 'moved') return;
      snapshot = first.snapshot;

      if (option === 'opt-mobile') {
        snapshot = setChecked(snapshot, branched, 'step-mobile', 'chk-m1', true, AT);
      }

      const second = advance(snapshot, branched, AT);
      expect(second.kind).toBe('moved');
      if (second.kind !== 'moved') return;
      snapshot = second.snapshot;

      expect(snapshot.path.stepIds).toEqual([...expected]);
      expect(advance(snapshot, branched, AT).kind).toBe('completed');
    }
  });

  it('없는 대상은 완료가 아니라 오류다', () => {
    const doc = fixture('invalid-missing-target');
    let snapshot = startProgress(doc, AT);
    snapshot = setChecked(snapshot, doc, 'step-1', 'chk-1', true, AT);

    const result = advance(snapshot, doc, AT);
    expect(result.kind).toBe('missing-target');
    expect(result).not.toMatchObject({ kind: 'completed' });
  });
});

describe('경로 변경과 skipped (M7 DoD 5, 주의)', () => {
  it('선택을 바꾸면 지나온 단계가 skipped가 되고 기록은 남는다', () => {
    let snapshot = startProgress(branched, AT);
    snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-pc', AT);

    const moved = advance(snapshot, branched, AT);
    if (moved.kind !== 'moved') throw new Error('이동 실패');
    snapshot = setStepCompleted(moved.snapshot, branched, 'step-pc', true, AT);

    // 되돌아가 선택을 바꾼다.
    snapshot = goBack(snapshot, branched, LATER);
    snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-mobile', LATER);

    expect(snapshot.path.stepIds).not.toContain('step-pc');
    // 비활성 경로의 기록을 지우지 않는다. (하네스 M7 주의)
    expect(snapshot.progress.stepState['step-pc']).toMatchObject({
      status: 'skipped',
      completedAt: AT,
    });
  });

  it('선택을 되돌리면 최초 상태와 같아진다', () => {
    let snapshot = startProgress(branched, AT);
    snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-pc', AT);
    const first = snapshot.path.stepIds;

    snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-mobile', AT);
    snapshot = selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-pc', AT);

    expect(snapshot.path.stepIds).toEqual(first);
  });

  it('이전 단계로 돌아가도 활성 경로를 벗어나지 않는다', () => {
    let snapshot = startProgress(linear, AT);
    const start = snapshot.progress.currentStepId;

    // 첫 단계에서 뒤로 가면 그대로다.
    expect(goBack(snapshot, linear, AT).progress.currentStepId).toBe(start);

    const moved = advance(snapshot, linear, AT);
    if (moved.kind !== 'moved') throw new Error('이동 실패');
    snapshot = goBack(moved.snapshot, linear, LATER);
    expect(snapshot.progress.currentStepId).toBe(start);
  });
});

describe('결정론', () => {
  it('같은 진행에서 30번 재계산해도 결과가 같다', () => {
    const snapshot = startProgress(branched, AT);
    const first = JSON.stringify(recompute(branched, snapshot.progress));
    for (let index = 0; index < 30; index += 1) {
      expect(JSON.stringify(recompute(branched, snapshot.progress))).toBe(first);
    }
  });

  it('입력 문서를 변형하지 않는다', () => {
    const before = structuredClone(branched);
    const snapshot = startProgress(branched, AT);
    selectOption(snapshot, branched, 'step-start', 'block-decide', 'opt-pc', AT);
    expect(branched).toEqual(before);
  });

  it('답변 지도는 진행 상태에서 그대로 나온다', () => {
    let snapshot = startProgress(branched, AT);
    snapshot = setChecked(snapshot, branched, 'step-mobile', 'chk-m1', true, AT);
    expect(toAnswerMap(snapshot.progress)['step-mobile']).toEqual({ checkedItemIds: ['chk-m1'] });
  });
});
