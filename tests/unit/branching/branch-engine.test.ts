import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseGuideDocument } from '@/domain/guide.schema.ts';
import type { BranchRule, GuideDocument, GuideStep } from '@/domain/guide.types.ts';
import {
  buildStepIndex,
  evaluateBranchRule,
  isStepAnswered,
  orderedBranchRules,
  resolveNextStep,
  selectBranchTarget,
  type StepAnswers,
} from '@/features/branching/branch-engine.ts';

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
const stepOf = (doc: GuideDocument, id: string): GuideStep => {
  const step = doc.steps.find((entry) => entry.id === id);
  if (step === undefined) throw new Error(`${id} 없음`);
  return step;
};

const start = stepOf(branched, 'step-start');
const mobile = stepOf(branched, 'step-mobile');
const finish = stepOf(branched, 'step-finish');
const index = buildStepIndex(branched.steps);

/** 결정 블록에서 옵션 하나를 고른 답변. */
const picked = (optionId: string): StepAnswers => ({
  selectedOptionByBlock: { 'block-decide': optionId },
});

describe('규칙 순서 (M6 DoD 2)', () => {
  it('배열 순서가 아니라 priority 오름차순으로 평가한다', () => {
    // 픽스처는 배열에 rule-mobile(20)을 먼저 두고 rule-pc(10)를 뒤에 두었다.
    expect(start.branchRules.map((rule) => rule.id)).toEqual(['rule-mobile', 'rule-pc']);
    expect(orderedBranchRules(start).map((rule) => rule.id)).toEqual(['rule-pc', 'rule-mobile']);
  });

  it('원본 배열을 정렬하지 않는다', () => {
    const before = start.branchRules.map((rule) => rule.id);
    orderedBranchRules(start);
    expect(start.branchRules.map((rule) => rule.id)).toEqual(before);
  });

  it('priority가 같으면 배열 인덱스가 작은 쪽이 앞이다', () => {
    const rule = (id: string, priority: number): BranchRule => ({
      id,
      operator: 'equals',
      targetStepId: 'x',
      priority,
    });
    const step = { ...start, branchRules: [rule('b', 0), rule('a', 0), rule('c', -1)] };
    expect(orderedBranchRules(step).map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('연산자 판정', () => {
  it.each([
    ['opt-mobile', true],
    ['opt-pc', false],
  ])('equals - 선택이 %s면 %s', (option, expected) => {
    const rule = start.branchRules.find((entry) => entry.id === 'rule-mobile')!;
    expect(evaluateBranchRule(rule, start, picked(option))).toBe(expected);
  });

  it.each([
    ['opt-pc', true],
    ['opt-mobile', false],
  ])('notEquals - 선택이 %s면 %s', (option, expected) => {
    const rule = start.branchRules.find((entry) => entry.id === 'rule-pc')!;
    expect(evaluateBranchRule(rule, start, picked(option))).toBe(expected);
  });

  // 이 한 줄이 픽스처의 의미를 뒤집는다. 미응답에 true를 주면 독자가 고르기도
  // 전에 priority 10인 rule-pc가 참이 되어 PC 경로로 끌려간다.
  it('notEquals는 아직 고르지 않았으면 참이 아니다', () => {
    const rule = start.branchRules.find((entry) => entry.id === 'rule-pc')!;
    expect(evaluateBranchRule(rule, start, undefined)).toBe(false);
    expect(evaluateBranchRule(rule, start, { selectedOptionByBlock: {} })).toBe(false);
  });

  it('checked - 필수 항목이 전부 체크돼야 참이다', () => {
    const rule = mobile.branchRules.find((entry) => entry.id === 'rule-mobile-done')!;
    expect(evaluateBranchRule(rule, mobile, { checkedItemIds: ['chk-m1'] })).toBe(true);
    expect(evaluateBranchRule(rule, mobile, { checkedItemIds: [] })).toBe(false);
    expect(evaluateBranchRule(rule, mobile, undefined)).toBe(false);
  });

  it('notChecked는 checked의 부정이다', () => {
    const rule = mobile.branchRules.find((entry) => entry.id === 'rule-mobile-stuck')!;
    expect(evaluateBranchRule(rule, mobile, { checkedItemIds: ['chk-m1'] })).toBe(false);
    expect(evaluateBranchRule(rule, mobile, undefined)).toBe(true);
  });

  it('checkedItemIds의 순서와 중복이 결과를 바꾸지 않는다 (M6 DoD 1)', () => {
    const rule = mobile.branchRules.find((entry) => entry.id === 'rule-mobile-done')!;
    const variants: StepAnswers[] = [
      { checkedItemIds: ['chk-m1'] },
      { checkedItemIds: ['chk-m1', 'chk-m1'] },
      { checkedItemIds: ['other', 'chk-m1'] },
      { checkedItemIds: ['chk-m1', 'other'] },
    ];
    for (const answers of variants) expect(evaluateBranchRule(rule, mobile, answers)).toBe(true);
  });

  it('checked는 value를 읽지 않는다', () => {
    const rule = mobile.branchRules.find((entry) => entry.id === 'rule-mobile-done')!;
    const withValue: BranchRule = { ...rule, value: 'chk-does-not-exist' };
    const answers: StepAnswers = { checkedItemIds: ['chk-m1'] };
    expect(evaluateBranchRule(withValue, mobile, answers)).toBe(
      evaluateBranchRule(rule, mobile, answers),
    );
  });
});

describe('소스 해석 실패는 언제나 거짓이다', () => {
  const base = start.branchRules.find((entry) => entry.id === 'rule-pc')!;

  it.each([
    ['sourceBlockId 없음', { ...base, sourceBlockId: undefined }],
    ['없는 블록', { ...base, sourceBlockId: 'block-nope' }],
    ['블록 타입 불일치', { ...base, operator: 'checked' as const, sourceBlockId: 'block-decide' }],
  ])('%s - notEquals·notChecked도 참이 되지 않는다', (_label, rule) => {
    expect(evaluateBranchRule(rule, start, picked('opt-pc'))).toBe(false);
  });

  it.each([undefined, true, false])('equals·notEquals의 value가 %s면 거짓이다', (value) => {
    const equals: BranchRule = { ...base, operator: 'equals', value };
    const notEquals: BranchRule = { ...base, operator: 'notEquals', value };
    expect(evaluateBranchRule(equals, start, picked('opt-pc'))).toBe(false);
    expect(evaluateBranchRule(notEquals, start, picked('opt-pc'))).toBe(false);
  });
});

describe('다음 단계 선택 (M6 DoD 2·3)', () => {
  it('첫 참 규칙만 선택한다', () => {
    // opt-mobile이면 rule-pc(10, 거짓)를 지나 rule-mobile(20, 참)이 선택된다.
    expect(selectBranchTarget(start, picked('opt-mobile'))).toEqual({
      kind: 'next',
      stepId: 'step-mobile',
      via: 'rule',
      ruleId: 'rule-mobile',
    });
  });

  it('먼저 참이 된 규칙 뒤는 보지 않는다', () => {
    // step-mobile에서 체크를 마치면 priority 0인 rule-mobile-done이 이긴다.
    const outcome = selectBranchTarget(mobile, { checkedItemIds: ['chk-m1'] });
    expect(outcome).toMatchObject({ kind: 'next', ruleId: 'rule-mobile-done' });
    expect(outcome).not.toMatchObject({ ruleId: 'rule-mobile-stuck' });
  });

  it('규칙이 모두 거짓이면 defaultNextStepId를 쓴다', () => {
    const pc = stepOf(branched, 'step-pc');
    expect(selectBranchTarget(pc, undefined)).toEqual({
      kind: 'next',
      stepId: 'step-finish',
      via: 'default',
    });
  });

  it('규칙도 기본 다음도 없으면 완료다', () => {
    expect(selectBranchTarget(finish, undefined)).toEqual({ kind: 'complete' });
  });

  // 완료와 미응답을 합치면 답하지 않은 분기 단계가 "완료 가능"으로 잡힌다.
  it('답을 기다리는 분기는 완료가 아니라 미확정이다', () => {
    expect(selectBranchTarget(start, undefined)).toEqual({ kind: 'indeterminate' });
    expect(selectBranchTarget(start, picked('opt-pc'))).toMatchObject({ kind: 'next' });
  });
});

describe('대상 존재 확인', () => {
  // rule-1(checked)이 참이 되도록 체크를 채운다. 미체크로는 기본 경로가 이겨서
  // 이 픽스처가 무엇을 고정하는지 확인할 수 없다.
  const checkedAnswers: StepAnswers = { checkedItemIds: ['chk-1'] };

  it('없는 대상은 완료가 아니라 missing-target이다', () => {
    const doc = fixture('invalid-missing-target');
    const first = doc.steps[0]!;
    const outcome = resolveNextStep(first, checkedAnswers, buildStepIndex(doc.steps));

    expect(outcome.kind).toBe('missing-target');
    expect(outcome).not.toMatchObject({ kind: 'complete' });
    expect(outcome).toMatchObject({ targetStepId: 'step-does-not-exist', ruleId: 'rule-1' });
  });

  it('대상이 없어도 defaultNextStepId로 넘어가지 않는다', () => {
    const doc = fixture('invalid-missing-target');
    const first = doc.steps[0]!;
    expect(first.defaultNextStepId).toBe('step-2');

    const outcome = resolveNextStep(first, checkedAnswers, buildStepIndex(doc.steps));
    expect(outcome).not.toMatchObject({ stepId: 'step-2' });
  });

  it('자기 자신을 가리켜도 던지지 않고 그대로 돌려준다', () => {
    const doc = fixture('invalid-no-terminal');
    const selfLoop = doc.steps.find((step) => step.defaultNextStepId === step.id)!;
    expect(resolveNextStep(selfLoop, undefined, buildStepIndex(doc.steps))).toMatchObject({
      kind: 'next',
      stepId: selfLoop.id,
    });
  });
});

describe('결정론 (M6 DoD 1)', () => {
  it('같은 입력을 100번 넣어도 결과가 같다', () => {
    const answers = picked('opt-mobile');
    const first = resolveNextStep(start, answers, index);
    for (let i = 0; i < 100; i += 1) {
      expect(resolveNextStep(start, answers, index)).toEqual(first);
    }
  });

  it('입력을 변형하지 않는다', () => {
    const answers = picked('opt-mobile');
    const docBefore = structuredClone(branched);
    const answersBefore = structuredClone(answers);

    resolveNextStep(start, answers, index);

    expect(branched).toEqual(docBefore);
    expect(answers).toEqual(answersBefore);
  });

  it('규칙 배열을 뒤집어도 결과가 같다', () => {
    const reversed: GuideStep = { ...start, branchRules: [...start.branchRules].reverse() };
    const answers = picked('opt-mobile');
    expect(selectBranchTarget(reversed, answers)).toEqual(selectBranchTarget(start, answers));
  });

  it('우선순위가 중복돼도 던지지 않고 30번 모두 같은 답을 낸다', () => {
    const doc = fixture('invalid-duplicate-priority');
    const step = doc.steps[0]!;
    const answers: StepAnswers = { selectedOptionByBlock: {} };
    const first = selectBranchTarget(step, answers);
    for (let i = 0; i < 30; i += 1) {
      expect(selectBranchTarget(step, answers)).toEqual(first);
    }
  });
});

describe('단계 응답 판정', () => {
  it('필수 결정 블록을 고르지 않으면 미응답이다', () => {
    expect(isStepAnswered(start, undefined)).toBe(false);
    expect(isStepAnswered(start, picked('opt-pc'))).toBe(true);
  });

  it('필수 체크리스트 항목이 남아 있으면 미응답이다', () => {
    expect(isStepAnswered(mobile, undefined)).toBe(false);
    expect(isStepAnswered(mobile, { checkedItemIds: ['chk-m1'] })).toBe(true);
  });

  it('입력이 없는 단계는 언제나 응답 완료다', () => {
    expect(isStepAnswered(finish, undefined)).toBe(true);
  });
});
