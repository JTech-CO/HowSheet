import { describe, expect, it, vi } from 'vitest';

import { checksumOf, isChecksum } from '@/features/assets/checksum.ts';
import {
  MAX_LONG_EDGE,
  isAllowedImageType,
  isAnimatedGif,
  optimizeImage,
  outputMimeType,
  shouldKeepOriginal,
  targetDimensions,
  validateImageFile,
  type DecodedImage,
  type ImageCodec,
} from '@/features/assets/image-optimizer.ts';

const MB = 1024 * 1024;

describe('형식 허용 (M5 DoD 5, 기술 §7.1-8)', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])('%s는 허용한다', (type) => {
    expect(isAllowedImageType(type)).toBe(true);
    expect(validateImageFile({ type, size: 1000, name: 'a' })).toEqual([]);
  });

  it.each(['image/svg+xml', 'text/html', 'application/pdf', 'image/bmp', ''])(
    '%s는 막는다',
    (type) => {
      expect(isAllowedImageType(type)).toBe(false);
      const issues = validateImageFile({ type, size: 1000, name: 'a' });
      expect(issues.map((issue) => issue.code)).toContain('IMAGE_MIME_NOT_ALLOWED');
    },
  );

  it('SVG는 이름을 png로 바꿔도 MIME으로 걸린다', () => {
    const issues = validateImageFile({ type: 'image/svg+xml', size: 100, name: 'safe.png' });
    expect(issues).toHaveLength(1);
  });
});

describe('크기 제한 (M5 DoD 6)', () => {
  it('5MB까지는 통과한다', () => {
    expect(validateImageFile({ type: 'image/png', size: 5 * MB, name: 'a' })).toEqual([]);
  });

  it('5MB를 넘으면 막는다', () => {
    const issues = validateImageFile({ type: 'image/png', size: 5 * MB + 1, name: 'a' });
    expect(issues.map((issue) => issue.code)).toEqual(['IMAGE_TOO_LARGE']);
    expect(issues[0]?.message).toContain('5MB');
    // 차단이므로 error다. warning으로 내려가면 저장이 그대로 통과한다.
    expect(issues[0]?.severity).toBe('error');
  });

  it('형식과 크기가 모두 잘못되면 둘 다 보고한다', () => {
    const issues = validateImageFile({ type: 'image/svg+xml', size: 9 * MB, name: 'a' });
    expect(issues.map((issue) => issue.code).sort()).toEqual([
      'IMAGE_MIME_NOT_ALLOWED',
      'IMAGE_TOO_LARGE',
    ]);
  });
});

describe('긴 변 상한 (M5 DoD 7)', () => {
  it('상한이 1920px이다', () => {
    expect(MAX_LONG_EDGE).toBe(1920);
  });

  it('상한 이하면 그대로 둔다', () => {
    expect(targetDimensions({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(targetDimensions({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });

  it('가로가 길면 가로를 상한에 맞추고 비율을 유지한다', () => {
    expect(targetDimensions({ width: 4000, height: 3000 })).toEqual({ width: 1920, height: 1440 });
  });

  it('세로가 길면 세로를 상한에 맞춘다', () => {
    expect(targetDimensions({ width: 3000, height: 4000 })).toEqual({ width: 1440, height: 1920 });
  });

  it('극단적인 비율에서도 0이 되지 않는다', () => {
    const result = targetDimensions({ width: 10000, height: 1 });
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1);
  });

  it('확대하지 않는다', () => {
    expect(targetDimensions({ width: 100, height: 50 }, 1920)).toEqual({ width: 100, height: 50 });
  });
});

describe('원본 유지 판정', () => {
  it('변환 결과가 크거나 같으면 원본을 쓴다', () => {
    expect(shouldKeepOriginal(1000, 1000)).toBe(true);
    expect(shouldKeepOriginal(1000, 1200)).toBe(true);
    expect(shouldKeepOriginal(1000, 999)).toBe(false);
  });

  it('출력 형식은 사진만 JPEG로 남긴다', () => {
    expect(outputMimeType('image/jpeg')).toBe('image/jpeg');
    expect(outputMimeType('image/png')).toBe('image/png');
    expect(outputMimeType('image/webp')).toBe('image/png');
  });
});

describe('애니메이션 GIF 판정 (M5 주의)', () => {
  function gif(frames: number): ArrayBuffer {
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
    const body: number[] = [];
    for (let i = 0; i < frames; i += 1) body.push(0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00);
    return new Uint8Array([...header, ...body]).buffer;
  }

  it('프레임이 하나면 정지 이미지다', () => {
    expect(isAnimatedGif(gif(1))).toBe(false);
  });

  it('프레임이 둘 이상이면 애니메이션이다', () => {
    expect(isAnimatedGif(gif(2))).toBe(true);
    expect(isAnimatedGif(gif(30))).toBe(true);
  });

  it('GIF가 아니면 false다', () => {
    expect(isAnimatedGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBe(false);
    expect(isAnimatedGif(new ArrayBuffer(0))).toBe(false);
  });
});

// ────────────────────────────────────────────────────── optimizeImage

/** 크기를 마음대로 정할 수 있는 가짜 코덱. 캔버스 없이 규칙만 확인한다. */
function fakeCodec(source: { width: number; height: number }, encodedSize: number): ImageCodec {
  return {
    decode: vi.fn(async (): Promise<DecodedImage> => ({
      width: source.width,
      height: source.height,
      source: null,
    })),
    encode: vi.fn(async () => new Blob([new Uint8Array(encodedSize)], { type: 'image/png' })),
  };
}

function file(type: string, size: number, name = 'a.png'): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('optimizeImage', () => {
  it('차단된 파일은 디코딩조차 하지 않는다', async () => {
    const codec = fakeCodec({ width: 100, height: 100 }, 10);
    const result = await optimizeImage(file('image/svg+xml', 100, 'a.svg'), codec);

    expect(result.issues.map((issue) => issue.code)).toContain('IMAGE_MIME_NOT_ALLOWED');
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it('상한을 넘으면 축소해서 상한 이하로 만든다 (DoD 7)', async () => {
    const codec = fakeCodec({ width: 4000, height: 2000 }, 100);
    const result = await optimizeImage(file('image/jpeg', 5000), codec);

    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(MAX_LONG_EDGE);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(960);
    expect(result.blob.size).toBe(100);
  });

  it('축소가 필요 없고 변환이 이득도 아니면 원본을 유지한다 (DoD 7)', async () => {
    const codec = fakeCodec({ width: 800, height: 600 }, 9000);
    const original = file('image/png', 5000);
    const result = await optimizeImage(original, codec);

    expect(result.blob).toBe(original);
    expect(result.keptOriginalBecause).toBe('already-small');
    expect(result.mimeType).toBe('image/png');
  });

  it('축소가 필요 없어도 변환이 작아지면 변환 결과를 쓴다', async () => {
    const codec = fakeCodec({ width: 800, height: 600 }, 1000);
    const result = await optimizeImage(file('image/jpeg', 5000), codec);

    expect(result.blob.size).toBe(1000);
    expect(result.keptOriginalBecause).toBeUndefined();
  });

  it('애니메이션 GIF는 변환하지 않는다 (M5 주의)', async () => {
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
    const frames = [0x21, 0xf9, 0x00, 0x21, 0xf9, 0x00];
    const gifFile = new File([new Uint8Array([...header, ...frames])], 'a.gif', {
      type: 'image/gif',
    });

    const codec = fakeCodec({ width: 4000, height: 4000 }, 10);
    const result = await optimizeImage(gifFile, codec);

    expect(result.blob).toBe(gifFile);
    expect(result.mimeType).toBe('image/gif');
    expect(result.keptOriginalBecause).toBe('animated-gif');
    expect(codec.encode).not.toHaveBeenCalled();
  });

  it('정지 GIF는 최적화 대상이다', async () => {
    const gifFile = new File(
      [new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x21, 0xf9])],
      'a.gif',
      {
        type: 'image/gif',
      },
    );
    const codec = fakeCodec({ width: 4000, height: 4000 }, 10);
    const result = await optimizeImage(gifFile, codec);

    expect(codec.encode).toHaveBeenCalled();
    expect(result.width).toBe(1920);
  });

  it('디코딩 자원을 반드시 닫는다', async () => {
    const close = vi.fn();
    const codec: ImageCodec = {
      decode: async () => ({ width: 100, height: 100, source: null, close }),
      encode: async () => new Blob([new Uint8Array(10)]),
    };

    await optimizeImage(file('image/png', 5000), codec);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('인코딩이 실패해도 자원을 닫는다', async () => {
    const close = vi.fn();
    const codec: ImageCodec = {
      decode: async () => ({ width: 100, height: 100, source: null, close }),
      encode: async () => {
        throw new Error('인코딩 실패');
      },
    };

    await expect(optimizeImage(file('image/png', 5000), codec)).rejects.toThrow('인코딩 실패');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('체크섬 (M5 DoD 8)', () => {
  it('같은 바이트는 같은 체크섬이다', async () => {
    const a = new TextEncoder().encode('같은 이미지').buffer as ArrayBuffer;
    const b = new TextEncoder().encode('같은 이미지').buffer as ArrayBuffer;
    expect(await checksumOf(a)).toBe(await checksumOf(b));
  });

  it('다른 바이트는 다른 체크섬이다', async () => {
    const a = new TextEncoder().encode('이미지 A').buffer as ArrayBuffer;
    const b = new TextEncoder().encode('이미지 B').buffer as ArrayBuffer;
    expect(await checksumOf(a)).not.toBe(await checksumOf(b));
  });

  it('형식은 sha256-<64자리 hex>다', async () => {
    const digest = await checksumOf(new TextEncoder().encode('x').buffer as ArrayBuffer);
    expect(isChecksum(digest)).toBe(true);
    expect(isChecksum('sha256-abc')).toBe(false);
    expect(isChecksum('md5-' + 'a'.repeat(64))).toBe(false);
  });
});

describe('애니메이션 GIF 크기 경고 (M5 DoD 5, 기술 §4.4.4)', () => {
  function animatedGif(bytes: number): File {
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
    const frames = [0x21, 0xf9, 0x00, 0x21, 0xf9, 0x00];
    const padding = new Uint8Array(Math.max(0, bytes - header.length - frames.length));
    return new File([new Uint8Array([...header, ...frames]), padding], 'a.gif', {
      type: 'image/gif',
    });
  }

  it('변환하지 않는다는 사실을 경고로 알린다', async () => {
    const codec = fakeCodec({ width: 4000, height: 4000 }, 10);
    const result = await optimizeImage(animatedGif(3 * MB), codec);

    expect(result.issues.map((issue) => issue.code)).toEqual(['IMAGE_ANIMATION_NOT_OPTIMIZED']);
    expect(result.issues[0]?.message).toContain('3.0MB');
  });

  it('경고이지 차단이 아니다', async () => {
    const codec = fakeCodec({ width: 4000, height: 4000 }, 10);
    const result = await optimizeImage(animatedGif(1 * MB), codec);

    // severity가 error면 스토어가 첨부를 막아 애니메이션 GIF를 넣을 수 없게 된다.
    expect(result.issues.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(result.keptOriginalBecause).toBe('animated-gif');
  });

  it('정지 GIF에는 경고가 없다', async () => {
    const still = new File(
      [new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x21, 0xf9])],
      'a.gif',
      {
        type: 'image/gif',
      },
    );
    const result = await optimizeImage(still, fakeCodec({ width: 100, height: 100 }, 5));
    expect(result.issues).toEqual([]);
  });
});

describe('상한과 원본 유지가 충돌할 때 (M5 DoD 7)', () => {
  it('축소가 필요하면 결과가 더 커도 변환 결과를 쓴다', async () => {
    // 원본 1000B, 인코딩 결과 9000B. 축소는 반드시 일어나야 한다.
    const codec = fakeCodec({ width: 4000, height: 3000 }, 9000);
    const result = await optimizeImage(file('image/jpeg', 1000), codec);

    expect(result.blob.size).toBe(9000);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(MAX_LONG_EDGE);
    // 유지하지 않았으므로 "유지 이유"가 붙으면 안 된다.
    expect(result.keptOriginalBecause).toBeUndefined();
    expect(result.largerThanOriginal).toBe(true);
  });

  it('축소가 필요하고 결과가 작으면 아무 표시도 없다', async () => {
    const codec = fakeCodec({ width: 4000, height: 3000 }, 100);
    const result = await optimizeImage(file('image/jpeg', 5000), codec);

    expect(result.keptOriginalBecause).toBeUndefined();
    expect(result.largerThanOriginal).toBeUndefined();
  });

  it('축소가 필요 없고 결과가 더 크면 원본을 유지한다', async () => {
    const codec = fakeCodec({ width: 800, height: 600 }, 9000);
    const original = file('image/png', 5000);
    const result = await optimizeImage(original, codec);

    expect(result.blob).toBe(original);
    expect(result.keptOriginalBecause).toBe('already-small');
    expect(result.largerThanOriginal).toBeUndefined();
  });
});
