import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createGuideDocument } from '@/domain/guide.defaults.ts';
import { parseGuideDocument, validateGuideDocument } from '@/domain/guide.schema.ts';
import type { GuideDocument, GuideStep } from '@/domain/guide.types.ts';
import { ISSUE_CODES, summarize, type IssueCode } from '@/domain/validation.types.ts';
import {
  analyzeGuideGraph,
  buildStepGraph,
  detectCycles,
  reachableStepIds,
  validateGuideGraph,
} from '@/features/branching/graph-validator.ts';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');

function fixture(name: string): GuideDocument {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, `${name}.howsheet.json`), 'utf8'),
  );
  const outcome = parseGuideDocument(raw);
  if (!outcome.ok) throw new Error(`${name} 파싱 실패`);
  return outcome.document;
}

const codesOf = (doc: GuideDocument): IssueCode[] =>
  validateGuideGraph(doc).issues.map((issue) => issue.code);

let counter = 0;
const newId = (prefix: string) => `${prefix}-${(counter += 1)}`;

/** 단계 골격 하나. 분기만 바꿔 가며 쓴다. */
function step(id: string, overrides: Partial<GuideStep> = {}): GuideStep {
  return {
    id,
    order: 0,
    title: id,
    blocks: [],
    completionMode: 'checkbox',
    branchRules: [],
    troubleshootingIds: [],
    optional: false,
    ...overrides,
  };
}

/** 단계 목록만 바꾼 문서. 스키마를 통과하지 않아도 그래프 판정은 돌아야 한다. */
function docWith(steps: GuideStep[], startStepId = steps[0]?.id ?? 'none'): GuideDocument {
  counter = 0;
  const base = createGuideDocument({
    id: 'guide-graph',
    now: '2026-09-02T00:00:00.000Z',
    newId,
    title: '그래프 테스트',
  });
  return {
    ...base,
    startStepId,
    steps: steps.map((entry, index) => ({ ...entry, order: index })),
  };
}

describe('정상 문서 (M6 DoD 4)', () => {
  it.each(['valid-minimal', 'valid-linear-5step', 'valid-branched', 'large-100-step'])(
    '%s는 그래프 이슈가 없다',
    (name) => {
      const result = validateGuideGraph(fixture(name));
      expect(result.issues).toEqual([]);
      expect(result.exportable).toBe(true);
    },
  );
});

describe('간선 대상 누락 (M6 DoD 4)', () => {
  it('없는 대상을 error로 보고하고 내보내기를 막는다', () => {
    const result = validateGuideGraph(fixture('invalid-missing-target'));
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.BRANCH_TARGET_NOT_FOUND);

    expect(issue?.severity).toBe('error');
    expect(issue?.stage).toBe('document');
    expect(issue?.path).toBe('steps[0].branchRules[0].targetStepId');
    expect(result.exportable).toBe(false);
  });

  it('defaultNextStepId도 간선이다', () => {
    const doc = docWith([step('a', { defaultNextStepId: 'nope' })]);
    const issue = validateGuideGraph(doc).issues.find(
      (i) => i.code === ISSUE_CODES.BRANCH_TARGET_NOT_FOUND,
    );
    expect(issue?.path).toBe('steps[0].defaultNextStepId');
  });

  it('없는 대상은 도달 집합을 오염시키지 않는다', () => {
    const doc = docWith([step('a', { defaultNextStepId: 'nope' })]);
    expect([...reachableStepIds(buildStepGraph(doc))]).toEqual(['a']);
  });
});

describe('순환 (M6 DoD 6, INV-06)', () => {
  it('순환 경로가 시작과 끝 노드를 모두 포함한다', () => {
    const doc = fixture('invalid-cycle');
    const cycles = analyzeGuideGraph(doc).cycles;

    expect(cycles).toHaveLength(1);
    const cyclePath = cycles[0]!.path;
    expect(cyclePath[0]).toBe(cyclePath[cyclePath.length - 1]);
    expect(cyclePath).toHaveLength(4);
  });

  it('메시지에 읽을 수 있는 경로가 들어간다', () => {
    const issue = validateGuideGraph(fixture('invalid-cycle')).issues.find(
      (i) => i.code === ISSUE_CODES.CYCLE_DETECTED,
    );
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('→');
    // 제목을 쓰되 진입 노드가 앞뒤에 모두 보여야 경로로 읽힌다.
    expect(issue?.message.split('→')).toHaveLength(4);
  });

  it('자기 자신을 가리키는 간선도 순환이다', () => {
    const doc = docWith([step('a', { defaultNextStepId: 'a' })]);
    const cycles = detectCycles(buildStepGraph(doc));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.path).toEqual(['a', 'a']);
  });

  it('도달할 수 없는 영역의 순환도 보고한다', () => {
    // 시작 노드에서만 탐색하면 b↔c가 숨는다.
    const doc = docWith([
      step('a'),
      step('b', { defaultNextStepId: 'c' }),
      step('c', { defaultNextStepId: 'b' }),
    ]);
    expect(detectCycles(buildStepGraph(doc))).toHaveLength(1);
  });

  it('순환이 둘이면 둘 다 보고한다', () => {
    const doc = docWith([
      step('a', { defaultNextStepId: 'a' }),
      step('b', { defaultNextStepId: 'c' }),
      step('c', { defaultNextStepId: 'b' }),
    ]);
    expect(detectCycles(buildStepGraph(doc))).toHaveLength(2);
  });

  it('같은 고리를 진입 지점만 바꿔 여러 번 세지 않는다', () => {
    const doc = docWith([
      step('a', { defaultNextStepId: 'b' }),
      step('b', { defaultNextStepId: 'c' }),
      step('c', { defaultNextStepId: 'a' }),
    ]);
    expect(detectCycles(buildStepGraph(doc))).toHaveLength(1);
  });
});

describe('도달 불가 (M6 DoD 5)', () => {
  it('warning으로 보고하고 단계 ID와 제목을 담는다', () => {
    const result = validateGuideGraph(fixture('invalid-unreachable'));
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.UNREACHABLE_STEP);

    expect(issue?.severity).toBe('warning');
    expect(issue?.stepId).toBe('step-orphan');
    expect(issue?.message).toContain('step-orphan');
    expect(issue?.message).toContain('아무도 가리키지 않는 단계');
  });

  // 하네스 DoD 4의 error 열거에 도달 불가가 없다. DoD 5가 따로 "설계된
  // severity"라고 부른다. 그래서 내보내기를 막지 않는다.
  it('도달 불가만으로는 내보내기가 막히지 않는다', () => {
    expect(validateGuideGraph(fixture('invalid-unreachable')).exportable).toBe(true);
  });

  it('시작 단계가 없으면 도달 불가를 쏟아붓지 않는다', () => {
    // START_STEP_NOT_FOUND는 스키마가 이미 발행한다. 여기서 또 내면 두 건이 되고,
    // 도달 불가까지 내면 모든 단계에 경고가 붙어 진짜 문제가 묻힌다.
    const doc = docWith([step('a'), step('b')], 'step-nope');
    const codes = codesOf(doc);
    expect(codes).not.toContain(ISSUE_CODES.UNREACHABLE_STEP);
    expect(codes).not.toContain(ISSUE_CODES.START_STEP_NOT_FOUND);
    expect(validateGuideDocument(doc).issues.map((i) => i.code)).toContain(
      ISSUE_CODES.START_STEP_NOT_FOUND,
    );
  });
});

describe('종료 단계 (M6 DoD 4)', () => {
  it('종료할 수 없는 문서를 error로 막는다', () => {
    const result = validateGuideGraph(fixture('invalid-no-terminal'));
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.NO_TERMINAL_STEP);
    expect(issue?.severity).toBe('error');
    expect(result.exportable).toBe(false);
  });

  it('규칙만 있고 기본 다음이 없는 단계는 종료 가능하다', () => {
    // out-degree 0으로 정의하면 이런 정상 문서가 오탐으로 차단된다.
    const doc = docWith([
      step('a', {
        branchRules: [{ id: 'r', operator: 'checked', targetStepId: 'a', priority: 0 }],
      }),
    ]);
    expect(analyzeGuideGraph(doc).terminalStepIds).toEqual(['a']);
    expect(codesOf(doc)).not.toContain(ISSUE_CODES.NO_TERMINAL_STEP);
  });

  it('도달할 수 없는 종료 단계는 종료로 세지 않는다', () => {
    const doc = docWith([step('a', { defaultNextStepId: 'a' }), step('orphan')]);
    const analysis = analyzeGuideGraph(doc);
    expect(analysis.terminalStepIds).toEqual([]);
    expect(analysis.result.issues.map((i) => i.code)).toContain(ISSUE_CODES.NO_TERMINAL_STEP);
  });

  it('단계가 없으면 종료 단계 부재를 말하지 않는다', () => {
    const doc = docWith([], 'none');
    expect(codesOf(doc)).not.toContain(ISSUE_CODES.NO_TERMINAL_STEP);
  });
});

describe('중복 규칙 (기술 §4.4.1 검증 6단계)', () => {
  const duplicate = fixture('invalid-duplicate-priority');

  it('우선순위 중복은 error다', () => {
    const issue = validateGuideGraph(duplicate).issues.find(
      (i) => i.code === ISSUE_CODES.DUPLICATE_BRANCH_PRIORITY,
    );
    expect(issue?.severity).toBe('error');
    expect(issue?.path).toMatch(/^steps\[\d+\]\.branchRules\[\d+\]\.priority$/);
  });

  it('조건이 완전히 같은 규칙은 warning이다', () => {
    const issue = validateGuideGraph(duplicate).issues.find(
      (i) => i.code === ISSUE_CODES.DUPLICATE_BRANCH_CONDITION,
    );
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain('실행되지 않습니다');
  });

  it('대상이 달라도 조건이 같으면 뒤 규칙은 죽은 규칙이다', () => {
    const rule = (id: string, target: string, priority: number) => ({
      id,
      operator: 'checked' as const,
      sourceBlockId: 'block-x',
      targetStepId: target,
      priority,
    });
    const doc = docWith([
      step('a', { branchRules: [rule('r1', 'a', 0), rule('r2', 'b', 1)] }),
      step('b'),
    ]);
    expect(codesOf(doc)).toContain(ISSUE_CODES.DUPLICATE_BRANCH_CONDITION);
  });

  it('value의 타입이 다르면 같은 조건이 아니다', () => {
    const rule = (id: string, value: string | boolean, priority: number) => ({
      id,
      operator: 'equals' as const,
      sourceBlockId: 'block-x',
      value,
      targetStepId: 'a',
      priority,
    });
    const doc = docWith([step('a', { branchRules: [rule('r1', true, 0), rule('r2', 'true', 1)] })]);
    expect(codesOf(doc)).not.toContain(ISSUE_CODES.DUPLICATE_BRANCH_CONDITION);
  });
});

describe('결정론과 합성 (M6 DoD 1·4)', () => {
  it.each(['valid-branched', 'invalid-cycle', 'invalid-no-terminal', 'invalid-duplicate-priority'])(
    '%s를 30번 판정해도 결과가 같다',
    (name) => {
      const doc = fixture(name);
      const first = JSON.stringify(validateGuideGraph(doc).issues);
      for (let i = 0; i < 30; i += 1) {
        expect(JSON.stringify(validateGuideGraph(doc).issues)).toBe(first);
      }
    },
  );

  it('입력 문서를 변형하지 않는다', () => {
    const doc = fixture('valid-branched');
    const before = structuredClone(doc);
    analyzeGuideGraph(doc);
    expect(doc).toEqual(before);
  });

  it('스키마 결과와 합쳐야 내보내기 가능 여부가 나온다', () => {
    // 그래프만 보면 통과하지만 스키마가 막는 문서. 합성을 빠뜨리면 통과한다.
    const doc = docWith([step('a', { title: '' })]);
    expect(validateGuideGraph(doc).exportable).toBe(true);

    const merged = summarize([
      ...validateGuideDocument(doc).issues,
      ...validateGuideGraph(doc).issues,
    ]);
    expect(merged.exportable).toBe(false);
  });
});

describe('그래프 구성', () => {
  it('나가는 간선은 priority 오름차순이고 기본 경로가 마지막이다', () => {
    const graph = buildStepGraph(fixture('valid-branched'));
    expect(graph.edges.get('step-start')?.map((edge) => edge.ruleId)).toEqual([
      'rule-pc',
      'rule-mobile',
    ]);
    expect(graph.edges.get('step-pc')?.map((edge) => edge.ruleId)).toEqual([undefined]);
  });

  it('노드는 문서 순서를 유지한다', () => {
    const doc = fixture('valid-linear-5step');
    expect(buildStepGraph(doc).nodes).toEqual(doc.steps.map((entry) => entry.id));
  });
});
