/**
 * 독자 진행 상태 모델.
 *
 * 기준: 기술 백서 §2.3.3.
 * 저장 키 형식은 INV-10이 고정한다. 형식이 한 곳에만 있어야 revision 격리가
 * 깨지지 않으므로 키 생성·해석 함수를 여기 함께 둔다.
 */

import type { StepStatus } from './guide.types.ts';

export interface ReaderStepState {
  status: StepStatus;
  completedAt?: string;
  checkedItemIds?: string[];
  /** 결정 블록 ID → 선택한 옵션 ID. */
  selectedOptionByBlock?: Record<string, string>;
}

export interface ReaderProgress {
  guideId: string;
  revision: number;
  startedAt: string;
  updatedAt: string;
  currentStepId: string;
  activePath: string[];
  stepState: Record<string, ReaderStepState>;
  acknowledgedWarningIds: string[];
  completed: boolean;
}

/** INV-10 - 진행 키 형식. */
export const PROGRESS_KEY_PREFIX = 'howsheet:progress';

/**
 * `howsheet:progress:{guideId}:r{revision}`
 *
 * revision이 다르면 키가 달라져 기존 진행 상태를 자동으로 덮어쓰지 않는다.
 */
export function readerProgressKey(guideId: string, revision: number): string {
  return `${PROGRESS_KEY_PREFIX}:${guideId}:r${revision}`;
}

/** 진행 키에서 guideId와 revision을 되꺼낸다. 형식이 아니면 null. */
export function parseReaderProgressKey(key: string): { guideId: string; revision: number } | null {
  const prefix = `${PROGRESS_KEY_PREFIX}:`;
  if (!key.startsWith(prefix)) return null;

  const rest = key.slice(prefix.length);
  const separator = rest.lastIndexOf(':r');
  if (separator <= 0) return null;

  const guideId = rest.slice(0, separator);
  const revisionText = rest.slice(separator + 2);
  if (guideId === '' || !/^\d+$/.test(revisionText)) return null;

  return { guideId, revision: Number(revisionText) };
}

/** 아직 아무것도 진행하지 않은 상태. */
export function createReaderProgress(
  guideId: string,
  revision: number,
  startStepId: string,
  now: string,
): ReaderProgress {
  return {
    guideId,
    revision,
    startedAt: now,
    updatedAt: now,
    currentStepId: startStepId,
    activePath: [startStepId],
    stepState: { [startStepId]: { status: 'active' } },
    acknowledgedWarningIds: [],
    completed: false,
  };
}
