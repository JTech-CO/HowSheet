/**
 * 사양 기본값과 검증.
 *
 * 기준: v2 제품정의 §5(기본값). 하네스 P2 DoD 1·2·5.
 *
 * 순수 함수만 둔다.
 */

import {
  DESIGN_AXES,
  ELEMENT_IDS,
  type DesignAxisId,
  type DesignChoice,
  type ElementId,
} from './spec.types.ts';

/**
 * 축별 기본 선택. 제품정의 §5가 굵게 표시한 값이다.
 *
 * 목록에서 계산하지 않고 여기 적는다. "첫 번째 항목"으로 두면 목록 순서를
 * 바꾸는 순간 기본값이 조용히 따라 바뀐다.
 */
export const DEFAULT_DESIGN: DesignChoice = {
  color: 'monotone',
  tone: 'technical',
  density: 'standard',
  typography: 'sans',
};

export function isElementId(value: unknown): value is ElementId {
  return typeof value === 'string' && (ELEMENT_IDS as readonly string[]).includes(value);
}

function axisById(id: DesignAxisId) {
  return DESIGN_AXES.find((axis) => axis.id === id);
}

/** 그 축이 실제로 제공하는 값인지 본다. */
export function isDesignOptionId(axis: DesignAxisId, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return axisById(axis)?.options.some((option) => option.id === value) ?? false;
}

/**
 * 저장된 값에서 쓸 수 있는 요소만 추린다.
 *
 * 모르는 값을 만나면 **그것만** 버리고 나머지는 살린다. 통째로 버리면 앱을
 * 업그레이드했을 때 사용자의 선택이 한꺼번에 사라진다. 중복도 접는다.
 */
export function normalizeElements(value: unknown): ElementId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ElementId>();
  for (const item of value) {
    if (isElementId(item)) seen.add(item);
  }
  // 화면과 프롬프트의 순서를 카탈로그 순서로 고정한다. 고른 순서를 따르면
  // 같은 선택에서 다른 프롬프트가 나와 P3의 결정론이 깨진다.
  return ELEMENT_IDS.filter((id) => seen.has(id));
}

/**
 * 저장된 값에서 디자인 선택을 복원한다.
 *
 * 축마다 값이 **반드시** 하나 있어야 한다. 모르는 값이거나 비어 있으면 그 축만
 * 기본값으로 되돌리고 나머지 축은 유지한다. (DoD 2)
 */
export function normalizeDesign(value: unknown): DesignChoice {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_DESIGN };

  for (const axis of DESIGN_AXES) {
    const candidate = source[axis.id];
    if (isDesignOptionId(axis.id, candidate)) result[axis.id] = candidate as string;
  }

  return result;
}

/** 요소를 켜고 끈다. 카탈로그 순서를 유지한다. */
export function toggleElement(current: readonly ElementId[], id: ElementId): ElementId[] {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return ELEMENT_IDS.filter((candidate) => next.has(candidate));
}
