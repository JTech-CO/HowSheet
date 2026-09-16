import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MarkdownToHtml from '@/features/sanitize/markdown-to-html.ts';
import { AppErrorBoundary } from '@/app/AppErrorBoundary.tsx';
import { Providers } from '@/app/providers.tsx';
import { MarkdownText } from '@/components/content/MarkdownText/MarkdownText.tsx';
import { createStudioDocument } from '@/domain/studio.defaults.ts';
import { markdownToSafeHtmlWithReport } from '@/features/sanitize/markdown-to-html.ts';
import { resetStudioStore, useStudioStore } from '@/store/studio.store.ts';

/**
 * 기준: v2 제품정의 §8 INV-07·INV-09. 출시 점검 2026-09-16 (미리보기 크래시).
 *
 * 렌더 중 예외가 나면 React는 루트를 통째로 언마운트한다. 잡는 자리가 없으면
 * 사용자는 빈 흰 화면을 보고 자료가 사라졌다고 읽는다. 실제 브라우저에서
 * `'> '.repeat(3000)`을 미리보기로 바꾸면 `RangeError`가 났다.
 *
 * 엔진마다 스택 한계가 달라 "이 입력이 반드시 던진다"에 테스트를 걸 수 없다.
 * 그래서 **변환이 던졌을 때 무엇을 하는가**를 고정한다.
 */

vi.mock('@/features/sanitize/markdown-to-html.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof MarkdownToHtml>();
  return { ...actual, markdownToSafeHtmlWithReport: vi.fn(actual.markdownToSafeHtmlWithReport) };
});

const converter = vi.mocked(markdownToSafeHtmlWithReport);
const NOW = '2026-09-16T00:00:00.000Z';
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function Boom(): never {
  throw new Error('자료 내용이 섞여 올 수 있는 오류 문구');
}

function seedStudio(source: string, storageMode: 'indexeddb' | 'memory'): void {
  useStudioStore.setState({
    document: { ...createStudioDocument(NOW), source },
    status: 'ready',
    storageMode,
  });
}

beforeEach(() => {
  converter.mockClear();
  // React가 잡힌 오류를 콘솔로 한 번 더 내보낸다. 테스트 출력만 조용히 한다.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  converter.mockReset();
  vi.restoreAllMocks();
  resetStudioStore();
  if (originalLocation !== undefined) Object.defineProperty(window, 'location', originalLocation);
  if (originalClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
  else Object.defineProperty(navigator, 'clipboard', originalClipboard);
});

describe('미리보기 변환이 던져도 화면이 살아 있다', () => {
  it('재귀 한계는 안내로 바꾼다', () => {
    converter.mockImplementation(() => {
      throw new RangeError('Maximum call stack size exceeded');
    });

    render(<MarkdownText markdown={'> '.repeat(3000)} />);

    const failed = screen.getByTestId('markdown-failed');
    expect(failed.textContent).toContain('원문');
  });

  it('다른 실패는 자료 탓으로 돌리지 않고 경계로 올린다', () => {
    // 살균기가 돌 수 없는 환경 같은 실패를 "자료가 너무 깊다"로 덮으면 회귀를
    // 알아챌 신호가 사라진다.
    converter.mockImplementation(() => {
      throw new Error('이 환경에서는 살균기를 쓸 수 없습니다.');
    });

    render(
      <AppErrorBoundary>
        <MarkdownText markdown="본문" />
      </AppErrorBoundary>,
    );

    expect(screen.queryByTestId('markdown-failed')).toBeNull();
    expect(screen.getByTestId('app-error')).toBeTruthy();
  });

  it('평소에는 그대로 그린다', () => {
    converter.mockImplementation(() => ({ html: '<p>본문</p>', blockedRemoteImages: 0 }));

    const { container } = render(<MarkdownText markdown="본문" />);

    expect(screen.queryByTestId('markdown-failed')).toBeNull();
    expect(container.textContent).toContain('본문');
  });
});

describe('오류 경계 (빈 화면을 막는다)', () => {
  it('앱의 Providers가 실제로 경계를 두른다', () => {
    // 경계를 직접 렌더하는 테스트만 있으면 providers.tsx에서 한 줄을 지워도
    // 모든 게이트가 초록이다. 앱이 쓰는 조립 지점을 그대로 렌더한다.
    render(
      <Providers>
        <Boom />
      </Providers>,
    );

    expect(screen.getByTestId('app-error')).toBeTruthy();
  });

  it('오류 문구를 화면에 싣지 않고 제목으로 포커스를 옮긴다', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    const alert = screen.getByTestId('app-error');
    expect(alert.textContent).not.toContain('자료 내용이 섞여');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('저장된 자료는 새로고침으로 돌아온다고 말하고 되돌릴 길을 준다', () => {
    seedStudio('붙여넣은 자료', 'indexeddb');

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByTestId('app-error').textContent).toContain('저장돼 있습니다');
    expect(screen.queryByTestId('app-error-memory')).toBeNull();
    expect(screen.getByTestId('app-error-reset')).toBeTruthy();
  });

  it('메모리 모드에서는 새로고침하면 사라진다고 말하고 복사를 먼저 권한다', () => {
    // 여기서 "돌아옵니다"라고 말하면 사용자는 믿고 누르고 자료를 잃는다.
    seedStudio('이 탭에만 있는 자료', 'memory');

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    const alert = screen.getByTestId('app-error');
    expect(screen.getByTestId('app-error-memory').textContent).toContain('사라지므로');
    expect(alert.textContent).not.toContain('저장돼 있습니다');
    expect(screen.queryByTestId('app-error-reset')).toBeNull();
    expect(screen.getByTestId('app-error-copy')).toBeTruthy();
  });

  it('클립보드가 막히면 자료를 펼쳐 직접 고르게 한다', async () => {
    seedStudio('복사해야 하는 자료', 'memory');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    await userEvent.click(screen.getByTestId('app-error-copy'));

    await waitFor(() => expect(screen.getByTestId('app-error-source')).toBeTruthy());
    expect(screen.getByTestId('app-error-source').textContent).toBe('복사해야 하는 자료');
  });

  it('새로고침 버튼이 실제로 다시 불러온다', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    await userEvent.click(screen.getByTestId('app-error-reload'));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('멀쩡한 화면은 건드리지 않는다', () => {
    render(
      <AppErrorBoundary>
        <p>정상</p>
      </AppErrorBoundary>,
    );

    expect(screen.queryByTestId('app-error')).toBeNull();
    expect(screen.getByText('정상')).toBeTruthy();
  });
});
