import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isTerminalStep, normalizeDocumentOrder } from '@/domain/guide.defaults.ts';
import { parseGuideDocument } from '@/domain/guide.schema.ts';
import type { GuideDocument } from '@/domain/guide.types.ts';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');

// 구분자는 소스에 리터럴로 두지 않는다. 포매터가 일반 공백으로 바꾸면
// 단언이 조용히 무의미해진다.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

const fixtureNames = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith('.howsheet.json'))
  .sort();

function load(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function documentOf(name: string): GuideDocument {
  const outcome = parseGuideDocument(load(name));
  if (!outcome.ok) throw new Error(`${name} 파싱 실패`);
  return outcome.document;
}

/**
 * 시작 단계에서 도달할 수 없는 단계.
 * 간선은 기술 백서 §4.4.1대로 `branchRules.targetStepId`와 `defaultNextStepId` 둘 다다.
 */
function unreachableSteps(doc: GuideDocument): string[] {
  const byId = new Map(doc.steps.map((step) => [step.id, step]));
  const seen = new Set<string>();
  const queue = [doc.startStepId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const step = byId.get(id);
    if (step === undefined) continue;
    for (const rule of step.branchRules) queue.push(rule.targetStepId);
    if (step.defaultNextStepId !== undefined) queue.push(step.defaultNextStepId);
  }

  return doc.steps.filter((step) => !seen.has(step.id)).map((step) => step.id);
}

describe('기준 픽스처 (하네스 §0.10, M2 DoD 8)', () => {
  it('§0.10이 요구한 10종이 모두 있다', () => {
    expect(fixtureNames).toEqual([
      'invalid-cycle.howsheet.json',
      'invalid-duplicate-priority.howsheet.json',
      'invalid-missing-target.howsheet.json',
      'invalid-no-terminal.howsheet.json',
      'invalid-unreachable.howsheet.json',
      'large-100-step.howsheet.json',
      'valid-branched.howsheet.json',
      'valid-linear-5step.howsheet.json',
      'valid-minimal.howsheet.json',
      'xss-guide.howsheet.json',
    ]);
  });

  // invalid-* 픽스처는 M2 시점에 스키마를 통과해야 한다. 그래프 판정은 M6이 맡고,
  // 스키마가 잘못된 참조를 미리 걸러 버리면 M6이 검사할 대상이 사라진다.
  it.each(fixtureNames)('%s 가 스키마를 통과한다', (name) => {
    const outcome = parseGuideDocument(load(name));
    expect(outcome.result.issues).toEqual([]);
    expect(outcome.ok).toBe(true);
  });

  it.each(fixtureNames)('%s 는 두 번 검증해도 결과가 같다', (name) => {
    const first = JSON.stringify(parseGuideDocument(load(name)).result.issues);
    const second = JSON.stringify(parseGuideDocument(load(name)).result.issues);
    expect(second).toBe(first);
  });

  it.each(fixtureNames)('%s 는 JSON 왕복 후에도 동등하다', (name) => {
    const doc = documentOf(name);
    const roundTripped = parseGuideDocument(JSON.parse(JSON.stringify(doc)));
    expect(roundTripped.ok).toBe(true);
    expect(roundTripped.document).toEqual(doc);
  });

  // 파싱이 알려진 필드를 하나도 잃지 않아야 M8의 canonical 왕복이 성립한다.
  it.each(fixtureNames)('%s 는 파싱해도 원본과 동일하다', (name) => {
    expect(documentOf(name)).toEqual(load(name));
  });

  it.each(fixtureNames)('%s 는 order 정규화 후에도 유효하다', (name) => {
    const doc = documentOf(name);
    const normalized = normalizeDocumentOrder(doc);
    expect(parseGuideDocument(normalized).ok).toBe(true);
    // 정규화는 참조를 건드리지 않는다. (INV-04)
    expect(normalized.startStepId).toBe(doc.startStepId);
    expect(normalized.steps.map((s) => s.id)).toEqual(doc.steps.map((s) => s.id));
  });
});

describe('픽스처가 맡은 역할을 실제로 담고 있다', () => {
  it('valid-minimal은 기술 백서 §2.3.4의 모양이다', () => {
    const doc = documentOf('valid-minimal.howsheet.json');
    expect(doc.steps).toHaveLength(1);
    expect(doc.startStepId).toBe(doc.steps[0]!.id);
    expect(isTerminalStep(doc.steps[0]!)).toBe(true);
  });

  it('valid-linear-5step이 블록 7종과 자산·경고 3단계·오류해결 2범위를 담는다', () => {
    const doc = documentOf('valid-linear-5step.howsheet.json');
    expect(doc.steps).toHaveLength(5);

    // 7종이 다 있어야 M5의 exhaustive 렌더러 검사가 의미를 갖는다.
    const types = new Set(doc.steps.flatMap((s) => s.blocks.map((b) => b.type)));
    expect(types).toEqual(
      new Set(['text', 'code', 'link', 'image', 'checklist', 'decision', 'divider']),
    );

    expect(doc.assets.length).toBeGreaterThan(0);
    expect(new Set(doc.warnings.map((w) => w.severity))).toEqual(
      new Set(['danger', 'warning', 'info']),
    );
    expect(new Set(doc.troubleshooting.map((t) => t.scope))).toEqual(new Set(['global', 'step']));
    expect(doc.preparation.length).toBeGreaterThan(0);
  });

  it('이미지 블록이 실제 자산을 참조하고 장식용 alt 사례도 있다', () => {
    const doc = documentOf('valid-linear-5step.howsheet.json');
    const images = doc.steps.flatMap((s) => s.blocks.filter((b) => b.type === 'image'));
    expect(images.length).toBeGreaterThanOrEqual(2);

    const assetIds = new Set(doc.assets.map((a) => a.id));
    for (const image of images) expect(assetIds.has(image.assetId)).toBe(true);

    expect(images.some((i) => i.alt !== '')).toBe(true);
    expect(images.some((i) => i.alt === '')).toBe(true);
  });

  it('valid-branched는 결정 블록과 분기 규칙을 갖는다', () => {
    const doc = documentOf('valid-branched.howsheet.json');
    const start = doc.steps.find((s) => s.id === doc.startStepId)!;
    expect(start.branchRules.length).toBeGreaterThanOrEqual(2);
    expect(start.blocks.some((b) => b.type === 'decision')).toBe(true);
  });

  // priority를 읽지 않고 배열 순서로 평가하는 엔진은 M6 DoD 2에서 걸려야 한다.
  it('valid-branched의 배열 순서와 priority 순서가 어긋난다', () => {
    const doc = documentOf('valid-branched.howsheet.json');
    const rules = doc.steps.find((s) => s.id === doc.startStepId)!.branchRules;
    const byArray = rules.map((r) => r.id);
    const byPriority = [...rules].sort((a, b) => a.priority - b.priority).map((r) => r.id);
    expect(byArray).not.toEqual(byPriority);
    // 0부터 연속이면 인덱스와 혼동해도 드러나지 않는다.
    expect(rules.map((r) => r.priority)).not.toEqual([0, 1]);
  });

  it('코퍼스가 분기 연산자 4종을 모두 쓴다', () => {
    const operators = new Set(
      fixtureNames.flatMap((name) =>
        documentOf(name).steps.flatMap((s) => s.branchRules.map((r) => r.operator)),
      ),
    );
    expect(operators).toEqual(new Set(['equals', 'notEquals', 'checked', 'notChecked']));
  });

  it('코퍼스가 완료 방식 3종을 모두 쓴다', () => {
    const modes = new Set(
      fixtureNames.flatMap((name) => documentOf(name).steps.map((s) => s.completionMode)),
    );
    expect(modes).toEqual(new Set(['checkbox', 'choice', 'automatic']));
  });

  it('invalid-missing-target의 대상이 없고, 다른 단계는 모두 도달 가능하다', () => {
    const doc = documentOf('invalid-missing-target.howsheet.json');
    const ids = new Set(doc.steps.map((s) => s.id));
    const targets = doc.steps.flatMap((s) => s.branchRules.map((r) => r.targetStepId));
    expect(targets.some((t) => !ids.has(t))).toBe(true);
    // 도달 불가가 섞이면 M6이 어느 규칙을 검사하는지 분리되지 않는다.
    expect(unreachableSteps(doc)).toEqual([]);
  });

  it('invalid-cycle의 순환은 분기 간선으로 닫히고 종료 단계는 도달 가능하다', () => {
    const doc = documentOf('invalid-cycle.howsheet.json');
    // 닫는 간선이 branchRules여야 defaultNextStepId만 간선으로 보는 구현이 걸린다.
    const closing = doc.steps
      .find((s) => s.id === 'step-c')!
      .branchRules.map((r) => r.targetStepId);
    expect(closing).toContain('step-a');
    expect(doc.steps.filter(isTerminalStep).map((s) => s.id)).toEqual(['step-exit']);
    expect(unreachableSteps(doc)).toEqual([]);
    expect(doc.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('invalid-cycle과 invalid-no-terminal은 서로 다른 그래프다', () => {
    expect(documentOf('invalid-cycle.howsheet.json').steps.some(isTerminalStep)).toBe(true);
    expect(documentOf('invalid-no-terminal.howsheet.json').steps.some(isTerminalStep)).toBe(false);
  });

  it('invalid-no-terminal에 자기 자신을 가리키는 간선이 있다', () => {
    const doc = documentOf('invalid-no-terminal.howsheet.json');
    expect(doc.steps.some((s) => s.defaultNextStepId === s.id)).toBe(true);
  });

  it('invalid-unreachable에는 아무도 가리키지 않는 단계가 있다', () => {
    expect(unreachableSteps(documentOf('invalid-unreachable.howsheet.json'))).not.toEqual([]);
  });

  it('invalid-duplicate-priority에 우선순위 중복과 동일 조건 규칙이 함께 있다', () => {
    const doc = documentOf('invalid-duplicate-priority.howsheet.json');
    const rules = doc.steps.flatMap((s) => s.branchRules);

    const priorities = rules.map((r) => r.priority);
    expect(new Set(priorities).size).toBeLessThan(priorities.length);

    // 기술 백서 §4.4.1 6단계 — 조건이 완전히 같은 중복 규칙
    const conditions = rules.map((r) => `${r.sourceBlockId}|${r.operator}|${String(r.value)}`);
    expect(new Set(conditions).size).toBeLessThan(conditions.length);
  });

  // M5 DoD 2와 M12 DoD 2가 열거한 페이로드 종류를 모두 담아야
  // test:security가 실제로 무엇인가를 검사한다.
  it('xss-guide가 대표 페이로드를 모두 담고 있다', () => {
    const raw = readFileSync(path.join(FIXTURE_DIR, 'xss-guide.howsheet.json'), 'utf8');
    for (const payload of [
      '<script',
      '</script>',
      'onerror=',
      'onload=',
      'onmouseover=',
      'javascript:',
      'vbscript:',
      'data:text/html',
      'data:image/svg+xml',
      '<svg',
      'srcdoc',
      LINE_SEPARATOR,
      PARAGRAPH_SEPARATOR,
    ]) {
      expect(raw).toContain(payload);
    }
  });

  it('xss-guide의 URL 필드는 스키마를 통과하는 값만 쓴다', () => {
    // 위험한 스킴은 Markdown 본문에 두어 M5 살균기가 처리하게 한다.
    // URL 필드에 두면 스키마에서 걸려 살균 경로를 검증할 수 없다.
    const doc = documentOf('xss-guide.howsheet.json');
    const urls = doc.steps.flatMap((s) =>
      s.blocks.flatMap((b) => (b.type === 'link' ? [b.url] : [])),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith('https://') || url.startsWith('http://')).toBe(true);
    }
  });

  it('large-100-step이 100단계이고 분기가 충분히 섞여 있다', () => {
    const doc = documentOf('large-100-step.howsheet.json');
    expect(doc.steps).toHaveLength(100);

    // 순수 선형이면 어떤 구현이든 예산을 통과해 M6 DoD 10 벤치마크가 무의미해진다.
    const branching = doc.steps.filter((s) => s.branchRules.length > 0);
    expect(branching.length).toBeGreaterThanOrEqual(20);

    const edges = doc.steps.reduce(
      (sum, s) => sum + s.branchRules.length + (s.defaultNextStepId === undefined ? 0 : 1),
      0,
    );
    expect(edges).toBeGreaterThan(doc.steps.length * 1.5);
  });
});
