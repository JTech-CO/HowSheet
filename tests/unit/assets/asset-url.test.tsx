// @vitest-environment jsdom
//
// Blob URL 수명은 DOM API다. 하네스 M5 검증 블록이 `tests/unit/assets`를
// 호출하므로 프로젝트는 unit(node)이고 이 파일만 jsdom으로 돌린다.

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetUrl, useAssetUrls } from '@/features/assets/useAssetUrl.ts';
import type { StoredAsset } from '@/storage/db.ts';

let created: string[] = [];
let revoked: string[] = [];
let serial = 0;

beforeEach(() => {
  created = [];
  revoked = [];
  serial = 0;

  // jsdom에는 createObjectURL이 없다. 만들고 해제한 주소를 그대로 기록한다.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => {
      serial += 1;
      const url = `blob:test/${serial}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url);
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function asset(id: string, text: string): StoredAsset {
  const bytes = new TextEncoder().encode(text).buffer as ArrayBuffer;
  return {
    id,
    guideId: 'g-1',
    fileName: `${id}.png`,
    mimeType: 'image/png',
    byteSize: bytes.byteLength,
    checksum: `sha256-${id}`,
    createdAt: '2026-09-01T00:00:00.000Z',
    bytes,
  };
}

function Probe({ value }: { value: StoredAsset | undefined }) {
  const { url, status } = useAssetUrl(value);
  return <span data-testid="probe" data-status={status} data-url={url ?? ''} />;
}

describe('Blob URL 수명 (M5 DoD 9)', () => {
  it('unmount하면 해제한다', () => {
    const { unmount } = render(<Probe value={asset('a', '하나')} />);
    expect(created).toHaveLength(1);
    expect(revoked).toEqual([]);

    unmount();

    expect(revoked).toEqual(created);
  });

  it('자산을 교체하면 이전 주소를 해제한다', () => {
    const first = asset('a', '하나');
    const { rerender } = render(<Probe value={first} />);
    const firstUrl = created[0];

    rerender(<Probe value={asset('b', '둘')} />);

    expect(revoked).toContain(firstUrl);
    expect(created).toHaveLength(2);
  });

  it('같은 자산으로 다시 그려도 주소를 새로 만들지 않는다', () => {
    const value = asset('a', '하나');
    const { rerender } = render(<Probe value={value} />);
    rerender(<Probe value={value} />);
    rerender(<Probe value={value} />);

    expect(created).toHaveLength(1);
    expect(revoked).toEqual([]);
  });

  it('자산이 사라지면 주소를 해제하고 missing으로 알린다', () => {
    const { rerender, getByTestId } = render(<Probe value={asset('a', '하나')} />);
    const firstUrl = created[0];

    rerender(<Probe value={undefined} />);

    expect(revoked).toContain(firstUrl);
    expect(getByTestId('probe').dataset['status']).toBe('missing');
    expect(getByTestId('probe').dataset['url']).toBe('');
  });
});

function ListProbe({ values }: { values: StoredAsset[] }) {
  const urls = useAssetUrls(values);
  return <span data-testid="list" data-count={Object.keys(urls).length} />;
}

describe('여러 자산의 Blob URL (M5 DoD 9)', () => {
  it('목록 전체를 만들고 unmount에서 모두 해제한다', () => {
    const values = [asset('a', '하나'), asset('b', '둘'), asset('c', '셋')];
    const { getByTestId, unmount } = render(<ListProbe values={values} />);

    expect(getByTestId('list').dataset['count']).toBe('3');
    expect(created).toHaveLength(3);

    unmount();

    expect(revoked.sort()).toEqual(created.sort());
  });

  it('목록이 바뀌면 이전 주소를 모두 해제한다', () => {
    const { rerender } = render(<ListProbe values={[asset('a', '하나')]} />);
    const before = [...created];

    rerender(<ListProbe values={[asset('b', '둘'), asset('c', '셋')]} />);

    for (const url of before) expect(revoked).toContain(url);
    expect(created).toHaveLength(3);
  });
});
