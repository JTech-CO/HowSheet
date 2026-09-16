import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PREFERENCE_KEYS } from '@/storage/local-storage.ts';

/**
 * 기준: 출시 점검 2026-09-16.
 *
 * `index.html`의 테마 선행 스니펫은 React보다 먼저 돌아야 해서 모듈이 아니라
 * 인라인 스크립트다. 그래서 저장 키를 import하지 못하고 문자열로 적는다. 그
 * 문자열이 v1 키(`howsheet:editor:theme`)로 남아 있던 동안 고른 테마가 새로고침마다
 * 깜빡였다. `verify:architecture`는 `index.html`을 보지 않는다. 여기서 맞춘다.
 */

const INDEX_HTML = readFileSync(
  fileURLToPath(new URL('../../../index.html', import.meta.url)),
  'utf8',
);

describe('index.html', () => {
  it('테마 스니펫이 앱과 같은 저장 키를 읽는다', () => {
    const keys = [...INDEX_HTML.matchAll(/localStorage\.getItem\('([^']+)'\)/gu)].map(
      (match) => match[1],
    );

    expect(keys).toEqual([PREFERENCE_KEYS.theme]);
  });

  it('스크립트가 막혀도 백지가 아니다', () => {
    expect(INDEX_HTML).toMatch(/<noscript>[\s\S]*HowSheet[\s\S]*<\/noscript>/u);
  });

  it('v1 제품 설명이 남아 있지 않다', () => {
    expect(INDEX_HTML).not.toContain('단계별 해결 가이드');
  });
});
