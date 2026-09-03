import { describe, expect, it } from 'vitest';

import { parseDataUrl, toDataUrl } from '@/features/assets/data-url.ts';

/** 하네스 M8 할 일 2 - 자산 Data URL 직렬화·복원. */

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

/** 처음으로 어긋난 위치. 같으면 -1. 어긋난 자리를 알려 주는 편이 진단에 낫다. */
function firstMismatch(a: Uint8Array, b: Uint8Array): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return index;
  }
  return -1;
}

describe('toDataUrl', () => {
  it('data: URL 형식으로 만든다', () => {
    expect(toDataUrl(bytes(1, 2, 3), 'image/png')).toBe('data:image/png;base64,AQID');
  });

  it('빈 바이트도 형식을 지킨다', () => {
    expect(toDataUrl(bytes(), 'image/png')).toBe('data:image/png;base64,');
  });

  it('큰 바이트에서 스택이 넘치지 않는다', () => {
    // String.fromCharCode(...bytes)는 인자를 스택에 펼쳐 RangeError를 낸다.
    // 5MB 이미지는 인자 500만 개다.
    const large = new Uint8Array(600_000).fill(65).buffer;
    expect(() => toDataUrl(large, 'image/png')).not.toThrow();
  });
});

describe('parseDataUrl', () => {
  it('왕복하면 같은 바이트가 나온다', () => {
    const source = bytes(0, 127, 128, 255, 13, 10);
    const parsed = parseDataUrl(toDataUrl(source, 'image/webp'));

    expect(parsed?.mimeType).toBe('image/webp');
    expect(new Uint8Array(parsed!.bytes)).toEqual(new Uint8Array(source));
  });

  it('큰 바이트도 왕복한다', () => {
    const source = new Uint8Array(600_000).map((_, index) => index % 256);
    const parsed = parseDataUrl(toDataUrl(source.buffer, 'image/png'));

    // toEqual로 60만 요소를 비교하면 vitest의 깊은 비교가 5초 예산을 넘긴다.
    // 코덱이 아니라 단언이 느린 것이므로 직접 훑는다.
    expect(parsed?.bytes.byteLength).toBe(source.byteLength);
    expect(firstMismatch(source, new Uint8Array(parsed!.bytes))).toBe(-1);
  });

  it('돌려준 ArrayBuffer가 정확한 길이다', () => {
    // 뷰의 buffer를 그대로 넘기면 byteOffset이 0이 아닐 때 버퍼 전체가 해시된다.
    const parsed = parseDataUrl(toDataUrl(bytes(1, 2, 3), 'image/png'));
    expect(parsed!.bytes.byteLength).toBe(3);
  });

  it('data: URL이 아니면 null', () => {
    for (const value of ['https://example.com/a.png', 'blob:abc', '', 'image/png;base64,AQID']) {
      expect(parseDataUrl(value)).toBeNull();
    }
  });

  it('base64가 아닌 data: URL은 받지 않는다', () => {
    // 퍼센트 인코딩 Data URL은 우리가 만들지 않는 형식이다. 조용히 받아 주면
    // 어디서 왔는지 모르는 바이트가 저장소에 들어온다.
    expect(parseDataUrl('data:image/png,%89PNG')).toBeNull();
  });

  it('MIME이 비면 받지 않는다', () => {
    expect(parseDataUrl('data:;base64,AQID')).toBeNull();
  });

  it('base64를 디코딩할 수 없으면 null', () => {
    expect(parseDataUrl('data:image/png;base64,!!!не base64!!!')).toBeNull();
  });
});
