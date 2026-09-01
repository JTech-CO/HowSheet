#!/usr/bin/env node
/**
 * 기준 자산 픽스처 생성.
 *
 * 기준: 하네스 §0.10("성능용 대용량 자산은 저장소 크기를 불필요하게 키우지
 * 않도록 결정론적 생성 스크립트를 사용할 수 있다"), File_Structure.md §5.
 *
 * 손으로 만든 이미지를 커밋하는 대신 여기서 만든다. 같은 입력이면 언제나
 * 같은 바이트가 나오므로 checksum 중복 제거(M5 DoD 8) 검증에 쓸 수 있다.
 *
 * PNG를 직접 인코딩한다. 이미지 라이브러리를 추가하면 devDependency가 늘고,
 * 그 버전이 바뀌면 픽스처 바이트가 바뀐다. IHDR·IDAT·IEND 세 청크면 충분하다.
 *
 * §0.10은 `photo-large.jpg`를 적었지만 File_Structure.md §5가 "이름은 재량이고
 * 역할은 계약"이라고 명시한다. JPEG 인코더를 직접 쓰는 것은 이 스크립트의
 * 목적(의존성 없이 결정론적)과 맞지 않아 PNG로 만든다. 역할(긴 변 상한 검증)은
 * 그대로다.
 */

import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'assets');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC-32. PNG 청크마다 필요하다. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * RGBA PNG를 만든다. `pixel(x, y)`는 `[r, g, b, a]`를 돌려준다.
 * 압축 수준을 고정해 같은 입력이 같은 바이트가 되게 한다.
 */
function encodePng(width, height, pixel) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // 필터 타입 None
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 격자 무늬. 결정론적이고 압축이 잘 되지 않아 실제 사진에 가깝다. */
function checkerboard(x, y) {
  const shade = ((x >> 3) + (y >> 3)) % 2 === 0 ? 60 : 200;
  return [shade, (shade + x) % 256, (shade + y) % 256, 255];
}

/** 가운데만 불투명한 도식. 다크 모드 대비 확인용. */
function transparentDiagram(x, y) {
  const inside = x > 20 && x < 108 && y > 20 && y < 60;
  return inside ? [37, 99, 235, 255] : [0, 0, 0, 0];
}

const FILES = [
  {
    name: 'photo-large.png',
    role: '긴 변 1920px 상한 검증 (2400×1600)',
    build: () => encodePng(2400, 1600, checkerboard),
  },
  {
    name: 'transparent-diagram.png',
    role: '투명 배경 도식. 다크 모드 대비 검증',
    build: () => encodePng(128, 80, transparentDiagram),
  },
  {
    name: 'duplicate-a.png',
    role: 'checksum 중복 제거 검증 - b와 바이트가 같다',
    build: () => encodePng(64, 64, checkerboard),
  },
  {
    name: 'duplicate-b.png',
    role: 'checksum 중복 제거 검증 - a와 바이트가 같다',
    build: () => encodePng(64, 64, checkerboard),
  },
  {
    name: 'blocked.svg',
    role: 'SVG 업로드 차단 검증. 스크립트를 품은 SVG다',
    build: () =>
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">\n' +
          '  <script>alert(1)</script>\n' +
          '  <circle cx="32" cy="32" r="30" fill="red" onload="alert(2)"/>\n' +
          '</svg>\n',
        'utf8',
      ),
  },
];

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const written = [];
  for (const file of FILES) {
    const bytes = file.build();
    await writeFile(path.join(OUTPUT_DIR, file.name), bytes);
    written.push({ name: file.name, bytes: bytes.length, role: file.role });
  }

  const a = written.find((file) => file.name === 'duplicate-a.png');
  const b = written.find((file) => file.name === 'duplicate-b.png');
  if (a === undefined || b === undefined || a.bytes !== b.bytes) {
    console.error('duplicate-a.png와 duplicate-b.png의 바이트 수가 다릅니다.');
    process.exitCode = 1;
    return;
  }

  console.log(`generate:fixture-assets - ${written.length}개 생성`);
  for (const file of written) {
    console.log(`  ${file.name.padEnd(26)} ${String(file.bytes).padStart(8)}B  ${file.role}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
