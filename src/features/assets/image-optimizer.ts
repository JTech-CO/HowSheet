/**
 * 이미지 검증과 최적화.
 *
 * 기준: 기술 백서 §2.2.4(필드 검증), §4.4.4(이미지 최적화), §7.1-8.
 * 하네스 M5 DoD 5~8, 주의("대용량 GIF를 자동 변환해 애니메이션 의미를 바꾸지 않는다").
 *
 * 판정과 계산은 순수 함수로 두고, 디코딩·인코딩만 주입받는다. 캔버스에 의존하는
 * 코드를 섞으면 상한·축소 비율 같은 규칙을 브라우저 없이는 확인할 수 없다.
 */

import {
  ALLOWED_IMAGE_MIME_TYPES,
  FIELD_LIMITS,
  type AllowedImageMimeType,
} from '../../domain/guide.types.ts';
import { ISSUE_CODES, type IssueCode } from '../../domain/validation.types.ts';

/** §4.4.4 - 긴 변 상한. */
export const MAX_LONG_EDGE = 1920;

/** 사진 재인코딩 품질. 0.82는 육안 손실과 용량의 통상적 절충점이다. */
export const ENCODE_QUALITY = 0.82;

export interface ImageIssue {
  code: IssueCode;
  message: string;
}

export interface ImageFileInfo {
  type: string;
  size: number;
  name: string;
}

/** 허용 MIME인지. SVG는 목록에 없으므로 자동으로 걸린다. (기술 §7.1-8) */
export function isAllowedImageType(type: string): type is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * 저장 전 차단 판정. 여기서 막힌 파일은 IndexedDB에 닿지 않는다. (M5 DoD 5·6)
 *
 * 확장자가 아니라 MIME을 본다. `.png`로 이름만 바꾼 SVG를 통과시키지 않기
 * 위해서다. 브라우저가 주는 `File.type`은 내용 기반 스니핑을 포함한다.
 */
export function validateImageFile(file: ImageFileInfo): ImageIssue[] {
  const issues: ImageIssue[] = [];

  if (!isAllowedImageType(file.type)) {
    issues.push({
      code: ISSUE_CODES.IMAGE_MIME_NOT_ALLOWED,
      message: `${file.type === '' ? '알 수 없는 형식' : file.type}은(는) 넣을 수 없습니다. PNG, JPEG, WebP, GIF만 가능합니다.`,
    });
  }

  if (file.size > FIELD_LIMITS.imageBytesMax) {
    issues.push({
      code: ISSUE_CODES.IMAGE_TOO_LARGE,
      message: `이미지는 ${Math.floor(FIELD_LIMITS.imageBytesMax / 1024 / 1024)}MB를 넘을 수 없습니다. (${formatBytes(file.size)})`,
    });
  }

  return issues;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * 긴 변을 상한에 맞춘 목표 크기. 비율은 유지하고 확대하지 않는다.
 * 반올림 때문에 0이 되지 않도록 최소 1을 보장한다.
 */
export function targetDimensions(source: Dimensions, maxLongEdge = MAX_LONG_EDGE): Dimensions {
  const longEdge = Math.max(source.width, source.height);
  if (longEdge <= maxLongEdge) return { width: source.width, height: source.height };

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * 재인코딩 결과를 쓸지 원본을 유지할지.
 * 변환 결과가 더 크면 원본을 유지한다. (기술 §4.4.4)
 */
export function shouldKeepOriginal(originalBytes: number, optimizedBytes: number): boolean {
  return optimizedBytes >= originalBytes;
}

/**
 * 애니메이션 GIF인지 판정한다.
 *
 * GIF89a의 Graphic Control Extension(`0x21 0xF9`)이 두 번 이상 나오면 프레임이
 * 여럿이다. 애니메이션을 정지 이미지로 재인코딩하면 "이 화면이 이렇게 움직인다"는
 * 설명이 통째로 사라지므로, 변환하지 않고 크기만 경고한다. (M5 주의)
 */
export function isAnimatedGif(bytes: ArrayBuffer): boolean {
  const view = new Uint8Array(bytes);
  if (view.length < 6) return false;
  // "GIF87a" / "GIF89a"
  if (view[0] !== 0x47 || view[1] !== 0x49 || view[2] !== 0x46) return false;

  let frames = 0;
  for (let index = 0; index + 1 < view.length; index += 1) {
    if (view[index] === 0x21 && view[index + 1] === 0xf9) {
      frames += 1;
      if (frames > 1) return true;
    }
  }
  return false;
}

/** 원본 형식별 출력 형식. 투명이 있을 수 있는 형식은 PNG 계열을 유지한다. */
export function outputMimeType(sourceType: AllowedImageMimeType): AllowedImageMimeType {
  // 사진(JPEG)은 JPEG로, 도식·투명 이미지(PNG/WebP)는 PNG/WebP로 남긴다.
  // GIF는 아래 optimizeImage가 아예 변환 대상에서 제외한다.
  return sourceType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
}

// ────────────────────────────────────────────────────── 최적화

export interface DecodedImage {
  width: number;
  height: number;
  /** 원본 비트맵. 인코더가 그대로 받는다. */
  source: unknown;
  close?: () => void;
}

export interface ImageCodec {
  /** EXIF 방향을 적용해 디코딩한다. */
  decode(blob: Blob): Promise<DecodedImage>;
  encode(image: DecodedImage, target: Dimensions, mimeType: string, quality: number): Promise<Blob>;
}

export interface OptimizeResult {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  /**
   * 원본을 유지했거나 재인코딩이 이득이 아니었던 이유. 최적화했으면 undefined.
   * `not-smaller`는 축소는 했지만 바이트가 줄지 않은 경우다. 이때도 상한을
   * 지키기 위해 변환 결과를 쓴다.
   */
  keptOriginalBecause?: 'animated-gif' | 'already-small' | 'not-smaller';
  issues: ImageIssue[];
}

export interface OptimizeOptions {
  maxLongEdge?: number;
  quality?: number;
}

/**
 * 이미지를 저장 가능한 형태로 만든다.
 *
 * 검증에서 걸리면 변환을 시도하지 않고 이슈만 돌려준다. 차단된 파일을 굳이
 * 디코딩해 볼 이유가 없다.
 */
export async function optimizeImage(
  file: File | Blob,
  codec: ImageCodec,
  options: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const info: ImageFileInfo = {
    type: file.type,
    size: file.size,
    name: file instanceof File ? file.name : 'image',
  };

  const issues = validateImageFile(info);
  if (issues.length > 0) {
    return { blob: file, mimeType: file.type, width: 0, height: 0, issues };
  }

  const sourceType = file.type as AllowedImageMimeType;
  const maxLongEdge = options.maxLongEdge ?? MAX_LONG_EDGE;

  // 애니메이션 GIF는 손대지 않는다. (M5 주의)
  if (sourceType === 'image/gif' && isAnimatedGif(await file.arrayBuffer())) {
    const decoded = await codec.decode(file);
    decoded.close?.();
    return {
      blob: file,
      mimeType: sourceType,
      width: decoded.width,
      height: decoded.height,
      keptOriginalBecause: 'animated-gif',
      issues: [],
    };
  }

  const decoded = await codec.decode(file);
  try {
    const target = targetDimensions(decoded, maxLongEdge);
    const alreadySmall = target.width === decoded.width && target.height === decoded.height;

    const outputType = outputMimeType(sourceType);
    const encoded = await codec.encode(
      decoded,
      target,
      outputType,
      options.quality ?? ENCODE_QUALITY,
    );

    // 축소가 필요 없고 재인코딩이 이득도 아니면 원본이 낫다.
    if (alreadySmall && shouldKeepOriginal(file.size, encoded.size)) {
      return {
        blob: file,
        mimeType: sourceType,
        width: decoded.width,
        height: decoded.height,
        keptOriginalBecause: 'already-small',
        issues: [],
      };
    }

    // 여기부터는 축소가 실제로 일어났다. 결과가 원본보다 크더라도 긴 변 상한을
    // 지키는 쪽을 택한다. DoD 7의 "상한 이하"와 "더 크면 원본 유지"가 부딪히면
    // 상한이 우선이다. 원본을 남기면 내보내기 용량이 통제 밖으로 나간다.
    return {
      blob: encoded,
      mimeType: outputType,
      width: target.width,
      height: target.height,
      ...(shouldKeepOriginal(file.size, encoded.size)
        ? { keptOriginalBecause: 'not-smaller' as const }
        : {}),
      issues: [],
    };
  } finally {
    decoded.close?.();
  }
}

/**
 * 브라우저 코덱.
 *
 * `createImageBitmap`의 `imageOrientation: 'from-image'`가 EXIF 방향을 적용한다.
 * 직접 EXIF를 파싱하지 않는다. (기술 §4.4.4)
 *
 * 인코딩은 `OffscreenCanvas`를 먼저 쓰고, 없거나 실패하면 일반 `<canvas>`로
 * 떨어진다. Safari/WebKit에는 `OffscreenCanvas.convertToBlob`이 없는 빌드가
 * 있어서, 하나만 쓰면 그 브라우저에서 이미지 첨부가 통째로 실패한다.
 */
export function createBrowserImageCodec(): ImageCodec {
  return {
    async decode(blob) {
      const bitmap = await decodeBitmap(blob);
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      };
    },

    async encode(image, target, mimeType, quality) {
      const bitmap = image.source as ImageBitmap;

      const offscreen = await encodeWithOffscreenCanvas(bitmap, target, mimeType, quality);
      if (offscreen !== null) return offscreen;

      return encodeWithCanvasElement(bitmap, target, mimeType, quality);
    },
  };
}

/** EXIF 방향 옵션을 지원하지 않는 브라우저에서는 옵션 없이 디코딩한다. */
async function decodeBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(blob);
  }
}

async function encodeWithOffscreenCanvas(
  bitmap: ImageBitmap,
  target: Dimensions,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'function') return null;

  try {
    const canvas = new OffscreenCanvas(target.width, target.height);
    const context = canvas.getContext('2d');
    if (context === null) return null;
    if (typeof canvas.convertToBlob !== 'function') return null;

    context.drawImage(bitmap, 0, 0, target.width, target.height);
    return await canvas.convertToBlob({ type: mimeType, quality });
  } catch {
    return null;
  }
}

async function encodeWithCanvasElement(
  bitmap: ImageBitmap,
  target: Dimensions,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('캔버스 2D 컨텍스트를 만들 수 없습니다.');
  context.drawImage(bitmap, 0, 0, target.width, target.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new Error('이미지를 인코딩하지 못했습니다.'));
        else resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}
