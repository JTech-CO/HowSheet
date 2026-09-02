/**
 * 분기 편집·검증 패널 통합 테스트.
 *
 * 기준: 하네스 M6 할 일 6·7, DoD 4·9. 검증 블록이 이 경로를 직접 호출한다.
 *
 * 실제 스토어와 실제 그래프 검증기를 쓴다. 검증 결과를 대역으로 넣으면 M6이
 * 확인하려는 "화면이 실제 판정을 보여 주는가"가 대역의 동작이 된다.
 */

import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderApp, setupStorage, store } from '../editor-core/harness.tsx';

beforeEach(() => {
  setupStorage();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const user = () => userEvent.setup();

/** 편집 화면을 열고 첫 단계로 간다. */
async function openStep(): Promise<string> {
  const id = await store().createGuide({ title: '분기 테스트' });
  renderApp(`/guide/${id}/edit`);
  await screen.findByTestId('title-preview');

  const steps = await screen.findAllByTestId('outline-step');
  await user().click(steps[0]!);
  await screen.findByTestId('step-editor');
  return id;
}

/** 선택 분기 블록을 하나 만든다. 분기 규칙의 기준이 된다. */
async function addDecisionBlock(): Promise<void> {
  await user().click(screen.getByTestId('add-block-decision'));
  await screen.findByTestId('decision-options');
}

describe('분기 규칙 편집 (M6 할 일 6)', () => {
  it('기준 블록이 없으면 규칙을 추가할 수 없다', async () => {
    await openStep();
    expect(screen.getByTestId('branch-rule-add')).toHaveProperty('disabled', true);
  });

  it('규칙을 추가하면 조건·기준·선택지·대상을 따로 고른다', async () => {
    await openStep();
    await addDecisionBlock();

    await user().click(screen.getByTestId('branch-rule-add'));
    await screen.findByTestId('branch-rule');

    // 디자인 §2.4.6 - 한 행에 압축하지 않는다. 네 입력이 각각 존재한다.
    expect(screen.getByTestId('branch-rule-operator')).toBeTruthy();
    expect(screen.getByTestId('branch-rule-source')).toBeTruthy();
    expect(screen.getByTestId('branch-rule-value')).toBeTruthy();
    expect(screen.getByTestId('branch-rule-target')).toBeTruthy();
    expect(screen.getByTestId('branch-rule-priority').textContent).toContain('우선순위 1');
  });

  it('규칙 순서를 바꾸면 우선순위가 다시 매겨진다', async () => {
    await openStep();
    await addDecisionBlock();

    await user().click(screen.getByTestId('branch-rule-add'));
    await user().click(screen.getByTestId('branch-rule-add'));
    await waitFor(() => expect(screen.getAllByTestId('branch-rule')).toHaveLength(2));

    const rulesOf = () => {
      const step = store().document!.steps[0]!;
      return [...step.branchRules].sort((a, b) => a.priority - b.priority).map((rule) => rule.id);
    };
    const before = rulesOf();

    const second = screen.getAllByTestId('branch-rule')[1]!;
    await user().click(within(second).getByRole('button', { name: /위로/ }));

    await waitFor(() => expect(rulesOf()).toEqual([before[1], before[0]]));
    // 우선순위가 0..n-1로 다시 매겨진다. 편집기로는 중복이 생기지 않는다.
    expect(
      store()
        .document!.steps[0]!.branchRules.map((rule) => rule.priority)
        .sort(),
    ).toEqual([0, 1]);
  });

  it('규칙을 지운다', async () => {
    await openStep();
    await addDecisionBlock();
    await user().click(screen.getByTestId('branch-rule-add'));
    await screen.findByTestId('branch-rule');

    await user().click(screen.getByTestId('branch-rule-remove'));
    await waitFor(() => expect(screen.queryByTestId('branch-rule')).toBeNull());
  });

  it('연산자를 바꾸면 맞지 않는 기준 블록을 놓아준다', async () => {
    await openStep();
    await addDecisionBlock();
    await user().click(screen.getByTestId('branch-rule-add'));
    await screen.findByTestId('branch-rule');

    const blockId = store().document!.steps[0]!.blocks.find((b) => b.type === 'decision')!.id;
    await user().selectOptions(screen.getByTestId('branch-rule-source'), blockId);
    await waitFor(() =>
      expect(store().document!.steps[0]!.branchRules[0]!.sourceBlockId).toBe(blockId),
    );

    // checked는 체크리스트가 기준이다. 결정 블록을 그대로 두면 규칙이 조용히
    // 영원한 거짓이 된다.
    await user().selectOptions(screen.getByTestId('branch-rule-operator'), 'checked');
    await waitFor(() =>
      expect(store().document!.steps[0]!.branchRules[0]!.sourceBlockId).toBeUndefined(),
    );
  });
});

describe('경로 요약 (디자인 §2.4.6)', () => {
  it('규칙이 없어도 그 외의 경우 카드는 보인다', async () => {
    // 단계 화면에서는 그 단계만 요약한다. 규칙이 0개여도 기본 경로는 보여야
    // 사용자가 "여기서 끝난다"를 알 수 있다.
    await openStep();
    expect(screen.queryByTestId('branch-summary-rule')).toBeNull();
    expect(screen.getByTestId('branch-summary-default').textContent).toContain('완료 화면');
  });

  it('문서 전체 요약에서 분기가 없으면 그렇게 말한다', async () => {
    await openStep();
    await user().click(screen.getByTestId('outline-validation'));
    expect(await screen.findByTestId('branch-summary-empty')).toBeTruthy();
  });

  it('그 외의 경우 카드는 항상 있고 기본값은 완료다', async () => {
    await openStep();
    await addDecisionBlock();
    await user().click(screen.getByTestId('branch-rule-add'));
    await screen.findByTestId('branch-summary');

    expect(screen.getByTestId('branch-summary-default').textContent).toContain('완료 화면');
    expect(screen.getByTestId('branch-default-target')).toHaveProperty('value', '');
  });

  it('규칙을 문장으로 보여 준다', async () => {
    await openStep();
    await addDecisionBlock();

    const blockId = store().document!.steps[0]!.blocks.find((b) => b.type === 'decision')!.id;
    const optionId = store().document!.steps[0]!.blocks.find((b) => b.type === 'decision')!
      .options[0]!.id;

    await user().type(screen.getAllByTestId('decision-option-label')[0]!, '모바일');
    await user().click(screen.getByTestId('branch-rule-add'));
    await screen.findByTestId('branch-rule');

    await user().selectOptions(screen.getByTestId('branch-rule-source'), blockId);
    await user().selectOptions(screen.getByTestId('branch-rule-value'), optionId);

    await waitFor(() =>
      expect(screen.getByTestId('branch-summary-rule').textContent).toContain(
        "선택이 '모바일'이면",
      ),
    );
  });
});

describe('검증 패널 (M6 DoD 4, 디자인 §4.3.8)', () => {
  async function openValidation(): Promise<void> {
    await user().click(screen.getByTestId('outline-validation'));
    await screen.findByTestId('validation-panel');
  }

  it('오류가 없으면 내보낼 수 있다고 알린다', async () => {
    await openStep();
    await openValidation();

    const status = screen.getByTestId('validation-status');
    expect(status.textContent).toContain('내보낼 수 있습니다');
    expect(status.dataset['exportable']).toBe('true');
  });

  it('없는 대상을 가리키면 오류로 보고하고 내보내기를 막는다', async () => {
    await openStep();
    // 스토어를 직접 써서 화면으로는 만들 수 없는 상태를 넣는다.
    const stepId = store().document!.steps[0]!.id;
    store().updateStep(stepId, { defaultNextStepId: 'step-does-not-exist' });

    await openValidation();

    const status = screen.getByTestId('validation-status');
    expect(status.dataset['exportable']).toBe('false');
    expect(
      screen
        .getAllByTestId('validation-issue')
        .some((node) => node.textContent?.includes('이동할')),
    ).toBe(true);
  });

  it('이슈에 필드 경로와 해결 문구가 함께 나온다', async () => {
    await openStep();
    const stepId = store().document!.steps[0]!.id;
    store().updateStep(stepId, { defaultNextStepId: 'step-does-not-exist' });

    await openValidation();

    const issue = screen.getAllByTestId('validation-issue')[0]!;
    expect(within(issue).getByTestId('validation-issue-path').textContent).toContain('steps[0]');
    expect(issue.textContent).toContain('다시 고릅니다');
  });

  it('이슈를 누르면 그 단계로 이동한다 (FR-019)', async () => {
    await openStep();
    const stepId = store().document!.steps[0]!.id;
    store().updateStep(stepId, { defaultNextStepId: 'step-does-not-exist' });

    await openValidation();
    await user().click(screen.getAllByTestId('validation-issue-link')[0]!);

    expect(await screen.findByTestId('step-editor')).toBeTruthy();
  });
});

describe('참조 중인 단계 삭제 (M6 DoD 9)', () => {
  /** 1단계가 2단계를 기본 경로로 가리키게 만든다. */
  async function twoLinkedSteps(): Promise<{ first: string; second: string }> {
    await openStep();
    const secondId = store().addStep()!;
    const firstId = store().document!.steps[0]!.id;
    store().updateStep(firstId, { defaultNextStepId: secondId });
    return { first: firstId, second: secondId };
  }

  it('처리 방법을 고르기 전에는 삭제 버튼이 눌리지 않는다', async () => {
    const { second } = await twoLinkedSteps();

    const outlineSteps = await screen.findAllByTestId('outline-step');
    await user().click(outlineSteps[1]!);
    await screen.findByTestId('step-editor');
    await user().click(screen.getByTestId('step-remove'));

    const confirm = await screen.findByTestId('step-remove-confirm');
    expect(confirm).toHaveProperty('disabled', true);
    expect(screen.getByTestId('step-remove-plan')).toBeTruthy();

    // 아직 문서를 바꾸지 않았다.
    expect(store().document!.steps.some((step) => step.id === second)).toBe(true);

    // 차단이 화면에만 있으면 스토어를 직접 부르는 경로로 뚫린다. 계약은
    // 스토어에 있어야 한다. (M6 DoD 9)
    expect(store().removeStep(second)).toMatchObject({ status: 'needsPlan' });
    expect(store().document!.steps.some((step) => step.id === second)).toBe(true);
  });

  it('규칙 삭제를 고르면 끊긴 참조를 남기지 않는다', async () => {
    const { first, second } = await twoLinkedSteps();

    const outlineSteps = await screen.findAllByTestId('outline-step');
    await user().click(outlineSteps[1]!);
    await screen.findByTestId('step-editor');
    await user().click(screen.getByTestId('step-remove'));

    await user().selectOptions(await screen.findByTestId('step-remove-plan'), 'drop');
    await user().click(screen.getByTestId('step-remove-confirm'));

    await waitFor(() => expect(store().document!.steps).toHaveLength(1));
    expect(store().document!.steps.some((step) => step.id === second)).toBe(false);
    expect(
      store().document!.steps.find((step) => step.id === first)?.defaultNextStepId,
    ).toBeUndefined();
  });

  it('대체 대상을 고르면 참조가 그쪽으로 옮겨간다', async () => {
    const { first } = await twoLinkedSteps();
    const third = store().addStep()!;

    const outlineSteps = await screen.findAllByTestId('outline-step');
    await user().click(outlineSteps[1]!);
    await screen.findByTestId('step-editor');
    await user().click(screen.getByTestId('step-remove'));

    await user().selectOptions(await screen.findByTestId('step-remove-plan'), third);
    await user().click(screen.getByTestId('step-remove-confirm'));

    await waitFor(() => expect(store().document!.steps).toHaveLength(2));
    expect(store().document!.steps.find((step) => step.id === first)?.defaultNextStepId).toBe(
      third,
    );
  });

  it('참조가 없으면 처리 방법을 묻지 않는다', async () => {
    await openStep();
    store().addStep();

    const outlineSteps = await screen.findAllByTestId('outline-step');
    await user().click(outlineSteps[1]!);
    await screen.findByTestId('step-editor');
    await user().click(screen.getByTestId('step-remove'));

    const confirm = await screen.findByTestId('step-remove-confirm');
    expect(confirm).toHaveProperty('disabled', false);
    expect(screen.queryByTestId('step-remove-plan')).toBeNull();
  });
});

describe('선택지 편집 (M5에서 이월)', () => {
  it('선택지를 더하고 지운다', async () => {
    await openStep();
    await addDecisionBlock();

    expect(screen.getAllByTestId('decision-option')).toHaveLength(2);

    await user().click(screen.getByTestId('decision-option-add'));
    await waitFor(() => expect(screen.getAllByTestId('decision-option')).toHaveLength(3));

    await user().click(screen.getAllByTestId('decision-option-remove')[0]!);
    await waitFor(() => expect(screen.getAllByTestId('decision-option')).toHaveLength(2));
  });

  it('선택지를 가리키던 분기 규칙도 함께 지운다', async () => {
    await openStep();
    await addDecisionBlock();

    const decision = store().document!.steps[0]!.blocks.find((b) => b.type === 'decision')!;
    const optionId = decision.options[0]!.id;

    await user().click(screen.getByTestId('branch-rule-add'));
    await screen.findByTestId('branch-rule');
    await user().selectOptions(screen.getByTestId('branch-rule-source'), decision.id);
    await user().selectOptions(screen.getByTestId('branch-rule-value'), optionId);
    await waitFor(() => expect(store().document!.steps[0]!.branchRules[0]!.value).toBe(optionId));

    await user().click(screen.getAllByTestId('decision-option-remove')[0]!);

    // 고아 규칙을 남기지 않는다. 선택지가 사라지면 그 규칙은 영원한 거짓이다.
    await waitFor(() => expect(store().document!.steps[0]!.branchRules).toHaveLength(0));
  });
});
