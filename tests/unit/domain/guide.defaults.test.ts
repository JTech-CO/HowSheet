import { describe, expect, it } from 'vitest';

import {
  createGuideDocument,
  isTerminalStep,
  normalizeDocumentOrder,
  normalizeOrder,
} from '@/domain/guide.defaults.ts';
import { parseGuideDocument } from '@/domain/guide.schema.ts';
import { CONTENT_BLOCK_TYPES, SCHEMA_VERSION, type GuideDocument } from '@/domain/guide.types.ts';

let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;

function make(overrides: Partial<Parameters<typeof createGuideDocument>[0]> = {}): GuideDocument {
  counter = 0;
  return createGuideDocument({
    id: 'guide-1',
    now: '2026-08-30T00:00:00.000Z',
    newId,
    ...overrides,
  });
}

describe('createGuideDocument', () => {
  it('현재 스키마 버전으로 만든다', () => {
    expect(make().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('주입한 id·시각·제목을 그대로 쓴다', () => {
    const doc = make({ id: 'guide-x', now: '2020-01-01T00:00:00.000Z', title: '제목' });
    expect(doc.id).toBe('guide-x');
    expect(doc.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(doc.updatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(doc.meta.title).toBe('제목');
  });

  it('같은 입력이면 같은 문서를 만든다 (결정론)', () => {
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
  });

  it('revision은 1에서 시작한다', () => {
    expect(make().revision).toBe(1);
  });

  it('첫 단계가 종료 단계다 (M2 DoD 1)', () => {
    const doc = make();
    expect(doc.steps).toHaveLength(1);
    expect(isTerminalStep(doc.steps[0]!)).toBe(true);
  });

  it('빈 제목으로 만들면 스키마가 거부한다 - 임시 상태를 숨기지 않는다', () => {
    const doc = make({ title: '' });
    expect(parseGuideDocument(doc).ok).toBe(false);
  });

  it('기본 설정이 기술 백서 §2.3.4와 같다', () => {
    expect(make().settings).toEqual({
      defaultTheme: 'system',
      allowThemeSwitch: true,
      allowProgressReset: true,
      showOverallOutline: true,
      printMode: 'active-path',
    });
  });
});

describe('normalizeOrder (M2 DoD 5, INV-04)', () => {
  it('0부터 연속 번호를 매긴다', () => {
    const result = normalizeOrder([
      { id: 'c', order: 9 },
      { id: 'a', order: 1 },
      { id: 'b', order: 4 },
    ]);
    expect(result.map((x) => [x.id, x.order])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('ID를 바꾸지 않는다', () => {
    const before = [
      { id: 'x', order: 3 },
      { id: 'y', order: 0 },
    ];
    const after = normalizeOrder(before);
    expect(new Set(after.map((i) => i.id))).toEqual(new Set(before.map((i) => i.id)));
  });

  it('원본 배열을 변경하지 않는다', () => {
    const before = [
      { id: 'x', order: 3 },
      { id: 'y', order: 0 },
    ];
    const snapshot = JSON.stringify(before);
    normalizeOrder(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('이미 정규화된 항목은 같은 객체를 유지한다', () => {
    const item = { id: 'a', order: 0 };
    expect(normalizeOrder([item])[0]).toBe(item);
  });

  it('빈 배열을 처리한다', () => {
    expect(normalizeOrder([])).toEqual([]);
  });
});

describe('normalizeDocumentOrder (M2 DoD 5)', () => {
  function scrambled(): GuideDocument {
    const doc = structuredClone(make()) as GuideDocument;
    doc.steps.push({
      id: 'step-second',
      order: 99,
      title: '두 번째',
      blocks: [
        { id: 'b-1', order: 7, type: 'text', markdown: 'a' },
        { id: 'b-2', order: 2, type: 'text', markdown: 'b' },
      ],
      completionMode: 'checkbox',
      branchRules: [],
      troubleshootingIds: [],
      optional: false,
    });
    doc.steps[0]!.order = 50;
    doc.startStepId = doc.steps[0]!.id;
    doc.steps[0]!.defaultNextStepId = 'step-second';
    return doc;
  }

  it('order만 다시 매기고 ID와 참조는 그대로 둔다', () => {
    const before = scrambled();
    const after = normalizeDocumentOrder(before);

    expect(after.steps.map((s) => s.order)).toEqual([0, 1]);
    expect(after.steps.map((s) => s.id)).toEqual(before.steps.map((s) => s.id));
    expect(after.startStepId).toBe(before.startStepId);
    expect(after.steps[0]?.defaultNextStepId).toBe(before.steps[0]?.defaultNextStepId);
  });

  it('블록 order도 정규화하되 블록 ID는 유지한다', () => {
    const after = normalizeDocumentOrder(scrambled());
    const second = after.steps.find((s) => s.id === 'step-second');
    expect(second?.blocks.map((b) => [b.id, b.order])).toEqual([
      ['b-2', 0],
      ['b-1', 1],
    ]);
  });

  it('정규화 후에도 문서가 유효하다', () => {
    expect(parseGuideDocument(normalizeDocumentOrder(scrambled())).ok).toBe(true);
  });

  it('원본 문서를 변경하지 않는다', () => {
    const before = scrambled();
    const snapshot = JSON.stringify(before);
    normalizeDocumentOrder(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('두 번 정규화해도 결과가 같다 (멱등)', () => {
    const once = normalizeDocumentOrder(scrambled());
    expect(JSON.stringify(normalizeDocumentOrder(once))).toBe(JSON.stringify(once));
  });
});

describe('isTerminalStep', () => {
  const step = (over: Record<string, unknown> = {}) => ({
    id: 's',
    order: 0,
    title: 't',
    blocks: [],
    completionMode: 'checkbox' as const,
    branchRules: [],
    troubleshootingIds: [],
    optional: false,
    ...over,
  });

  it('분기도 기본 다음 단계도 없으면 종료 단계다', () => {
    expect(isTerminalStep(step())).toBe(true);
  });

  it('기본 다음 단계가 있으면 종료 단계가 아니다', () => {
    expect(isTerminalStep(step({ defaultNextStepId: 'other' }))).toBe(false);
  });

  it('분기 규칙이 있으면 종료 단계가 아니다', () => {
    expect(
      isTerminalStep(
        step({
          branchRules: [{ id: 'r', operator: 'checked', targetStepId: 'other', priority: 0 }],
        }),
      ),
    ).toBe(false);
  });
});

describe('ContentBlock 판별자 목록', () => {
  it('기술 백서 §2.3.2의 7종과 일치한다', () => {
    expect([...CONTENT_BLOCK_TYPES]).toEqual([
      'text',
      'code',
      'link',
      'image',
      'checklist',
      'decision',
      'divider',
    ]);
  });
});
