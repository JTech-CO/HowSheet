/**
 * 기본 문서와 순서 정규화.
 *
 * 기준: 기술 백서 §2.3.4(최소 JSON), §4.1.3(식별자·order 규칙).
 *
 * 시간과 ID는 주입받는다. 순수 함수로 두어야 픽스처 생성과 테스트가
 * 결정론적이고, domain이 브라우저 API에 의존하지 않는다. (M1 DoD 5)
 */

import {
  SCHEMA_VERSION,
  type CompletionConfig,
  type ContentBlock,
  type GuideDocument,
  type GuideSettings,
  type GuideStep,
} from './guide.types.ts';

/** ID 생성기. 런타임은 `crypto.randomUUID()`를 주입한다. (§4.1.3) */
export type IdFactory = (prefix: string) => string;

export interface CreateGuideOptions {
  id: string;
  now: string;
  newId: IdFactory;
  title?: string;
  language?: string;
}

export const DEFAULT_SETTINGS: GuideSettings = {
  defaultTheme: 'system',
  allowThemeSwitch: true,
  allowProgressReset: true,
  showOverallOutline: true,
  printMode: 'active-path',
};

export const DEFAULT_COMPLETION: CompletionConfig = {
  title: '완료했습니다',
  message: '모든 단계를 마쳤습니다. 결과가 예상과 같은지 확인하세요.',
  showSummary: true,
};

/** 새 가이드의 첫 단계. 분기도 기본 다음 단계도 없으므로 그 자체가 종료 단계다. */
export function createFirstStep(newId: IdFactory): GuideStep {
  const blocks: ContentBlock[] = [
    {
      id: newId('block'),
      order: 0,
      type: 'text',
      markdown: '',
    },
  ];

  return {
    id: newId('step'),
    order: 0,
    title: '첫 단계',
    blocks,
    completionMode: 'checkbox',
    branchRules: [],
    troubleshootingIds: [],
    optional: false,
  };
}

/**
 * 새 가이드 문서.
 *
 * M2 DoD 1 — 제목 입력 전 임시 상태를 빼면 시작 단계 하나와 최소 하나의
 * 종료 가능 경로를 갖는다. 첫 단계에 분기와 `defaultNextStepId`가 없으므로
 * 그 단계가 곧 종료 지점이다.
 */
export function createGuideDocument(options: CreateGuideOptions): GuideDocument {
  const firstStep = createFirstStep(options.newId);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id,
    revision: 1,
    createdAt: options.now,
    updatedAt: options.now,
    meta: {
      title: options.title ?? '제목 없는 가이드',
      language: options.language ?? 'ko-KR',
    },
    preparation: [],
    warnings: [],
    steps: [firstStep],
    startStepId: firstStep.id,
    troubleshooting: [],
    completion: { ...DEFAULT_COMPLETION },
    assets: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// ────────────────────────────────────────────────────── order 정규화

interface Ordered {
  order: number;
}

/**
 * 표시 순서를 0..n-1로 다시 매긴다.
 *
 * M2 DoD 5 / INV-04 — `order`만 바꾸고 ID와 참조는 건드리지 않는다.
 * 원본 배열을 변경하지 않고 새 배열을 돌려준다.
 */
export function normalizeOrder<T extends Ordered>(items: readonly T[]): T[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => (item.order === index ? item : { ...item, order: index }));
}

/**
 * 문서 전체의 `order`를 정규화한다.
 * 단계, 준비물, 경고, 오류 해결, 각 단계의 블록, 오류 해결의 해결 블록이 대상이다.
 */
export function normalizeDocumentOrder(doc: GuideDocument): GuideDocument {
  return {
    ...doc,
    preparation: normalizeOrder(doc.preparation),
    warnings: normalizeOrder(doc.warnings),
    troubleshooting: normalizeOrder(doc.troubleshooting).map((item) => ({
      ...item,
      resolution: normalizeOrder(item.resolution),
    })),
    steps: normalizeOrder(doc.steps).map((step) => ({
      ...step,
      blocks: normalizeOrder(step.blocks),
    })),
  };
}

/**
 * 분기도 기본 다음 단계도 없는 단계. 활성 경로가 여기서 끝난다.
 * 완전한 그래프 판정은 M6의 graph-validator가 맡는다.
 */
export function isTerminalStep(step: GuideStep): boolean {
  return step.branchRules.length === 0 && step.defaultNextStepId === undefined;
}
