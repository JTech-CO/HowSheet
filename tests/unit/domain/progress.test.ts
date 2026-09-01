import { describe, expect, it } from 'vitest';

import {
  PROGRESS_KEY_PREFIX,
  createReaderProgress,
  parseReaderProgressKey,
  readerProgressKey,
} from '@/domain/progress.types.ts';

describe('진행 저장 키 (INV-10)', () => {
  it('howsheet:progress:{guideId}:r{revision} 형식이다', () => {
    expect(readerProgressKey('guide-1', 3)).toBe('howsheet:progress:guide-1:r3');
  });

  it('접두사가 고정돼 있다', () => {
    expect(PROGRESS_KEY_PREFIX).toBe('howsheet:progress');
  });

  it('revision이 다르면 키가 달라진다 - 자동 덮어쓰기가 불가능하다', () => {
    expect(readerProgressKey('g', 1)).not.toBe(readerProgressKey('g', 2));
  });

  it('guideId가 다르면 키가 달라진다', () => {
    expect(readerProgressKey('a', 1)).not.toBe(readerProgressKey('b', 1));
  });

  it.each([
    ['guide-1', 1],
    ['guide:with:colons', 12],
    ['가이드-한글', 0],
  ])('%s / r%d 왕복', (guideId, revision) => {
    expect(parseReaderProgressKey(readerProgressKey(guideId, revision))).toEqual({
      guideId,
      revision,
    });
  });

  it.each([
    'howsheet:progress:guide-1',
    'howsheet:progress::r1',
    'howsheet:progress:guide-1:rX',
    'other:progress:guide-1:r1',
    'howsheet:progress:guide-1:r',
    '',
  ])("형식이 아닌 '%s'는 null", (key) => {
    expect(parseReaderProgressKey(key)).toBeNull();
  });
});

describe('createReaderProgress', () => {
  const progress = createReaderProgress('guide-1', 2, 'step-1', '2026-08-30T00:00:00.000Z');

  it('시작 단계를 현재 단계이자 활성 경로로 둔다', () => {
    expect(progress.currentStepId).toBe('step-1');
    expect(progress.activePath).toEqual(['step-1']);
    expect(progress.stepState['step-1']?.status).toBe('active');
  });

  it('아무것도 완료하지 않은 상태로 시작한다', () => {
    expect(progress.completed).toBe(false);
    expect(progress.acknowledgedWarningIds).toEqual([]);
  });

  it('guideId와 revision을 보존한다', () => {
    expect(progress.guideId).toBe('guide-1');
    expect(progress.revision).toBe(2);
  });

  it('같은 입력이면 같은 결과다 (결정론)', () => {
    const again = createReaderProgress('guide-1', 2, 'step-1', '2026-08-30T00:00:00.000Z');
    expect(JSON.stringify(again)).toBe(JSON.stringify(progress));
  });
});
