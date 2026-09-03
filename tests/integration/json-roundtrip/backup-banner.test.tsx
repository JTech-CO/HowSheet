/**
 * 메모리 모드 JSON 백업 경로.
 *
 * 기준: 기술 백서 §4.6("IndexedDB 열기 실패 → 메모리 모드, JSON 내보내기 상시
 * 노출"), §7.5. 하네스 M3 DoD 6이 배너를 요구했고, 내보낼 수단이 없어 버튼은
 * M8까지 렌더되지 않았다.
 */

import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderApp, setupStorage, store } from '../editor-core/harness.tsx';

/** `URL.createObjectURL`이 jsdom에 없다. 내려받은 내용을 여기서 가로챈다. */
function captureDownloads(): { texts: string[]; names: string[]; revoked: number } {
  const captured = { texts: [] as string[], names: [] as string[], revoked: 0 };

  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      // Blob.text()는 비동기라 클릭 시점에 읽을 수 없다. 생성 인자를 직접 본다.
      captured.texts.push((blob as Blob & { __text?: string }).__text ?? '');
      return 'blob:test';
    },
    revokeObjectURL: () => {
      captured.revoked += 1;
    },
  });

  // Blob 생성자를 감싸 원문을 실어 둔다.
  const RealBlob = globalThis.Blob;
  vi.stubGlobal(
    'Blob',
    class extends RealBlob {
      __text: string;
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        this.__text = parts.map(String).join('');
      }
    },
  );

  // 앵커 클릭이 jsdom에서 실제 내비게이션을 시도하지 않게 막고 파일명을 본다.
  const realCreate = window.document.createElement.bind(window.document);
  vi.spyOn(window.document, 'createElement').mockImplementation((tag: string) => {
    const element = realCreate(tag);
    if (tag === 'a') {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        captured.names.push((element as HTMLAnchorElement).download);
      });
    }
    return element;
  });

  return captured;
}

beforeEach(() => {
  setupStorage();
});

afterEach(() => {
  // vitest에 globals가 없어 RTL 자동 정리가 붙지 않는다. 직접 부르지 않으면
  // 앞 테스트의 DOM이 남아 배너가 두 개가 된다.
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('메모리 모드 백업 버튼 (§4.6)', () => {
  it('배너에 JSON 백업 버튼이 있다', async () => {
    const id = await store().createGuide({ title: '메모리 모드 가이드' });
    renderApp(`/guide/${id}/edit`);

    await expect(screen.findByTestId('storage-banner')).resolves.toBeTruthy();
    expect(screen.getByRole('button', { name: 'JSON으로 백업' })).toBeTruthy();
  });

  it('누르면 열린 문서를 .howsheet.json으로 내려받는다', async () => {
    const captured = captureDownloads();
    const id = await store().createGuide({ title: '메모리 모드 가이드' });
    renderApp(`/guide/${id}/edit`);
    await screen.findByTestId('storage-banner');

    await userEvent.click(screen.getByRole('button', { name: 'JSON으로 백업' }));

    await waitFor(() => expect(captured.names).toHaveLength(1));
    expect(captured.names[0]).toBe('메모리-모드-가이드.r1.howsheet.json');

    const payload = JSON.parse(captured.texts[0] ?? '{}');
    expect(payload.id).toBe(id);
    expect(payload.meta.title).toBe('메모리 모드 가이드');

    // Blob URL을 해제한다. 이미지를 담은 내보내기는 수십 MB다.
    expect(captured.revoked).toBe(1);
  });
});
