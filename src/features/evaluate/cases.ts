/**
 * 평가 사례 - 고정 자료 × 선택 조합.
 *
 * 기준: 하네스 P8 할 일 1·2.
 *
 * ## 조합을 고르지 않고 전부 돈다
 *
 * 디자인 축은 3 × 5 × 3 × 3 = 135가지다. 몇 개를 골라 돌리면 "왜 그 조합인가"가
 * 남고, 고르지 않은 조합에서 규칙 문구끼리 부딪히는 일을 놓친다 - P8에서 찾은
 * 폰트 모순이 바로 '혼합' 타이포 × '기술' 톤 조합에서만 나왔다. 조립기는 빠르므로
 * 전부 돈다.
 *
 * 요소는 2^10을 다 돌지 않는다. 요소 문구는 서로 독립이라 조합이 새 문장을 만들지
 * 않는다. 없음·전부·자료에 맞는 것·하나씩(10)을 돈다.
 *
 * 순수 모듈이다. 자료 파일은 실행기가 읽어 넘긴다.
 */

import { DEFAULT_DESIGN } from '../../domain/spec.defaults.ts';
import {
  DESIGN_AXES,
  DESIGN_AXIS_IDS,
  ELEMENT_IDS,
  type DesignChoice,
  type ElementId,
} from '../../domain/spec.types.ts';
import { STUDIO_DOCUMENT_VERSION, type StudioDocument } from '../../domain/studio.types.ts';
import { normalizeNewlines } from './text.ts';

/** 하네스 P8 할 일 1이 이름으로 지정한 다섯 종류. */
export const EVAL_SOURCE_KINDS = ['technical', 'meeting', 'procedure', 'data', 'concept'] as const;
export type EvalSourceKind = (typeof EVAL_SOURCE_KINDS)[number];

export const EVAL_SOURCE_KIND_LABELS: Readonly<Record<EvalSourceKind, string>> = {
  technical: '기술 문서',
  meeting: '회의록',
  procedure: '절차',
  data: '데이터',
  concept: '개념 설명',
};

export interface EvalSource {
  /** `tests/fixtures/eval/sources/<id>.md` */
  id: string;
  kind: EvalSourceKind;
  /** 사람이 이 자료로 페이지를 만든다면 고를 요소. */
  fit: readonly ElementId[];
}

export const EVAL_SOURCES: readonly EvalSource[] = [
  { id: 'api-rate-limit', kind: 'technical', fit: ['diagram', 'code', 'comparison'] },
  { id: 'release-meeting', kind: 'meeting', fit: ['timeline', 'checklist', 'faq'] },
  { id: 'db-restore', kind: 'procedure', fit: ['flowchart', 'code', 'checklist', 'steps'] },
  { id: 'support-inquiries', kind: 'data', fit: ['infographic', 'comparison', 'timeline'] },
  { id: 'gradient-descent', kind: 'concept', fit: ['diagram', 'glossary', 'faq'] },
];

/** 평가 문서의 시각. 조립기는 시각을 쓰지 않지만 문서 모양을 채운다. */
export const EVAL_UPDATED_AT = '2026-01-01T00:00:00.000Z';

/** 잘림 안내를 채점하기 위한 상한. 자료는 모두 이보다 길어야 한다. */
export const TRUNCATION_LIMIT = 600;

export interface ElementSet {
  id: string;
  elements: ElementId[];
}

function inCatalogOrder(ids: readonly ElementId[]): ElementId[] {
  return ELEMENT_IDS.filter((id) => ids.includes(id));
}

export function elementSetsFor(source: EvalSource): ElementSet[] {
  return [
    { id: 'none', elements: [] },
    { id: 'fit', elements: inCatalogOrder(source.fit) },
    { id: 'all', elements: [...ELEMENT_IDS] },
    ...ELEMENT_IDS.map((id) => ({ id: `only-${id}`, elements: [id] })),
  ];
}

/** 디자인 축의 모든 조합. 축 순서대로 펼친다. */
export function allDesigns(): DesignChoice[] {
  let designs: Array<Partial<DesignChoice>> = [{}];
  for (const axis of DESIGN_AXES) {
    designs = designs.flatMap((partial) =>
      axis.options.map((option) => ({ ...partial, [axis.id]: option.id })),
    );
  }
  return designs as DesignChoice[];
}

export function designKey(design: DesignChoice): string {
  return DESIGN_AXIS_IDS.map((axis) => design[axis]).join('-');
}

export function caseId(sourceId: string, setId: string, design: DesignChoice): string {
  return `${sourceId}.${setId}.${designKey(design)}`;
}

export interface EvalCase {
  id: string;
  source: EvalSource;
  elementSet: string;
  design: DesignChoice;
  studio: StudioDocument;
  maxSourceCharacters?: number;
}

/**
 * 사례를 만든다. 자료 텍스트가 빠진 것이 있으면 던진다 - 조용히 건너뛰면 자료
 * 종류 하나가 통째로 채점되지 않은 채 평가가 통과한다.
 */
export function buildCases(texts: ReadonlyMap<string, string>): EvalCase[] {
  const designs = allDesigns();
  const cases: EvalCase[] = [];

  for (const source of EVAL_SOURCES) {
    const text = texts.get(source.id);
    if (text === undefined) throw new Error(`평가 자료가 없습니다: ${source.id}`);
    // 붙여넣기 칸은 줄바꿈을 LF로 준다. 저장소 체크아웃이 CRLF여도 같게 맞춘다.
    const body = normalizeNewlines(text);

    const studio = (elements: ElementId[], design: DesignChoice): StudioDocument => ({
      version: STUDIO_DOCUMENT_VERSION,
      source: body,
      elements,
      design,
      updatedAt: EVAL_UPDATED_AT,
    });

    for (const set of elementSetsFor(source)) {
      for (const design of designs) {
        cases.push({
          id: caseId(source.id, set.id, design),
          source,
          elementSet: set.id,
          design,
          studio: studio(set.elements, design),
        });
      }
    }

    cases.push({
      id: caseId(source.id, 'fit-truncated', DEFAULT_DESIGN),
      source,
      elementSet: 'fit-truncated',
      design: DEFAULT_DESIGN,
      studio: studio(inCatalogOrder(source.fit), DEFAULT_DESIGN),
      maxSourceCharacters: TRUNCATION_LIMIT,
    });
  }

  return cases;
}
