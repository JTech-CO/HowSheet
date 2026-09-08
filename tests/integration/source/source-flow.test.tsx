/**
 * 자료 입력 흐름.
 *
 * 기준: v2 제품정의 §8 INV-05·INV-07. 하네스 P1 DoD 1·2·3·4·6.
 *
 * 실제 스토어와 실제 화면을 쓰고 저장소만 바꾼다. 스토어를 흉내 내면 DoD가
 * 검증하려는 자동 저장·복원 동작이 테스트 대역의 동작이 된다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StudioPage } from '@/pages/StudioPage/StudioPage.tsx';
import { createMemoryStore, type DocumentStore } from '@/storage/document.store.ts';
import { configureStudioStore, resetStudioStore, useStudioStore } from '@/store/studio.store.ts';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/xss-source.md',
);

const NOW = '2026-09-08T00:00:00.000Z';
const store = () => useStudioStore.getState();

/** 저장이 언제나 실패하는 저장소. */
function failingStore(): DocumentStore {
  return {
    state: () => ({ mode: 'indexeddb' }),
    load: async () => null,
    save: async () => {
      throw new Error('저장소 쓰기 실패');
    },
    clear: async () => {},
  };
}

function setup(documents: DocumentStore = createMemoryStore('테스트')): DocumentStore {
  configureStudioStore({ documents, now: () => NOW });
  resetStudioStore();
  return documents;
}

afterEach(() => {
  cleanup();
  configureStudioStore(null);
});

describe('자료 입력 (DoD 6)', () => {
  beforeEach(() => setup());

  it('자료 없이도 화면이 뜨고 다음 단계가 보인다', async () => {
    render(<StudioPage />);

    await screen.findByTestId('source-input');
    // 아직 만들지 않은 영역도 무엇이 올지 알려 준다.
    expect(screen.getByText('요소 토글 10종')).toBeTruthy();
    expect(screen.getByTestId('source-counts').textContent).toContain('0자');
  });

  it('입력이 글자 수와 토큰 수에 반영된다 (DoD 5)', async () => {
    render(<StudioPage />);
    const input = await screen.findByTestId('source-input');

    await userEvent.type(input, '안녕하세요');

    const counts = screen.getByTestId('source-counts');
    expect(counts.textContent).toContain('5자');
    // 반드시 어림수임을 밝힌다.
    expect(counts.textContent).toContain('약');
  });

  it('지우기가 자료를 비운다', async () => {
    render(<StudioPage />);
    const input = await screen.findByTestId('source-input');

    await userEvent.type(input, '내용');
    await userEvent.click(screen.getByTestId('source-clear'));

    expect(store().document?.source).toBe('');
  });

  it('자료가 없으면 지우기를 누를 수 없다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('source-input');

    expect(screen.getByTestId('source-clear')).toHaveProperty('disabled', true);
  });
});

describe('저장과 복원 (DoD 1)', () => {
  it('새로고침해도 자료가 남아 있다', async () => {
    const documents = setup();
    render(<StudioPage />);

    const input = await screen.findByTestId('source-input');
    await userEvent.type(input, '남아야 한다');
    await waitFor(() => expect(store().saveState).toBe('saved'));

    // 새로고침을 흉내 낸다. 메모리 상태를 버리고 저장소만 남긴다.
    cleanup();
    configureStudioStore({ documents, now: () => NOW });
    resetStudioStore();
    render(<StudioPage />);

    const restored = await screen.findByTestId('source-input');
    expect((restored as HTMLTextAreaElement).value).toBe('남아야 한다');
  });

  it('저장 중에 더 입력해도 그 입력이 사라지지 않는다', async () => {
    setup();
    render(<StudioPage />);
    const input = await screen.findByTestId('source-input');

    await userEvent.type(input, '첫 입력');
    await waitFor(() => expect(store().saveState).toBe('saved'));
    await userEvent.type(input, ' 추가');

    await waitFor(() => expect(store().document?.source).toBe('첫 입력 추가'));
  });
});

describe('저장 실패 (DoD 2, INV-07)', () => {
  it('실패해도 입력한 자료가 화면에 남는다', async () => {
    setup(failingStore());
    render(<StudioPage />);
    const input = await screen.findByTestId('source-input');

    await userEvent.type(input, '잃으면 안 된다');
    await waitFor(() => expect(store().saveState).toBe('error'));

    expect((input as HTMLTextAreaElement).value).toBe('잃으면 안 된다');
    expect(store().document?.source).toBe('잃으면 안 된다');
  });

  it('실패를 화면에 알린다', async () => {
    setup(failingStore());
    render(<StudioPage />);

    await userEvent.type(await screen.findByTestId('source-input'), '내용');

    const state = await screen.findByTestId('save-state');
    expect(state.textContent).toContain('저장하지 못했습니다');
    expect(screen.getByTestId('save-error').textContent).toContain('복사해');
  });

  it('메모리 모드를 알린다', async () => {
    setup(createMemoryStore('사생활 보호 모드'));
    render(<StudioPage />);
    await screen.findByTestId('source-input');

    const banner = await screen.findByTestId('storage-memory');
    expect(banner.textContent).toContain('이 탭에만');
    expect(banner.textContent).toContain('사생활 보호 모드');
  });
});

describe('미리보기 살균 (DoD 3·4, INV-05)', () => {
  beforeEach(() => setup());

  it('XSS 픽스처를 붙여넣어도 실행 가능한 잔재가 없다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('source-input');

    // 타이핑이 아니라 스토어로 직접 넣는다. 20KB를 한 글자씩 치면 느리고,
    // 검증하려는 것은 입력 방식이 아니라 렌더 결과다.
    store().setSource(readFileSync(FIXTURE, 'utf8'));
    await userEvent.click(screen.getByTestId('source-mode-preview'));

    const preview = await screen.findByTestId('source-preview');
    expect(
      preview.querySelectorAll('script, iframe, object, embed, svg, style, form'),
    ).toHaveLength(0);
    for (const node of preview.querySelectorAll('*')) {
      for (const attribute of node.attributes) {
        expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
      }
    }
    expect(preview.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0);
  });

  it('정상 Markdown은 남는다 (DoD 4)', async () => {
    render(<StudioPage />);
    await screen.findByTestId('source-input');

    store().setSource(
      '# 제목\n\n**굵게**와 [링크](https://example.com)\n\n| 항목 | 값 |\n| --- | --- |\n| 하나 | 1 |',
    );
    await userEvent.click(screen.getByTestId('source-mode-preview'));

    const preview = await screen.findByTestId('source-preview');
    expect(preview.querySelector('strong')).toBeTruthy();
    expect(preview.querySelector('table')).toBeTruthy();
    expect(preview.querySelector('a[href="https://example.com"]')).toBeTruthy();
  });

  it('원문과 미리보기를 오갈 수 있다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('source-input');
    store().setSource('내용');

    await userEvent.click(screen.getByTestId('source-mode-preview'));
    expect(screen.queryByTestId('source-input')).toBeNull();

    await userEvent.click(screen.getByTestId('source-mode-write'));
    expect(screen.getByTestId('source-input')).toBeTruthy();
  });
});
