/**
 * 자산 바이트 ↔ `data:` URL.
 *
 * 기준: 기술 백서 §2.4.1(자산은 Base64 Data URL 또는 자산 맵으로 포함),
 * §4.3.5-2. 하네스 M8 할 일 2.
 *
 * `checksum.ts` 옆에 두는 이유는 같다. 가져오기와 내보내기가 **같은 변환**을
 * 써야 하고, 양쪽에 각자 두면 한쪽만 고쳐지는 날이 온다. M9의 HTML 인라이너도
 * 같은 인코딩을 쓴다.
 *
 * `Blob`이나 `FileReader`를 쓰지 않는다. 순수 함수라야 node 환경 단위 테스트와
 * 브라우저에서 같은 코드로 돌고, 트랜잭션 안에서 await 없이 부를 수 있다.
 */

/** `data:<mime>;base64,<payload>` 한 건을 분해한 결과. */
export interface ParsedDataUrl {
  mimeType: string;
  bytes: ArrayBuffer;
}

/**
 * base64 변환을 8KB씩 나눠 한다.
 *
 * `String.fromCharCode(...bytes)`는 인자를 스택에 펼치므로 큰 이미지에서
 * `RangeError: Maximum call stack size exceeded`가 난다. 5MB 이미지는 인자
 * 500만 개다.
 */
const CHUNK_SIZE = 8192;

/** 바이트를 `data:<mime>;base64,...`로. */
export function toDataUrl(bytes: ArrayBuffer, mimeType: string): string {
  return `data:${mimeType};base64,${toBase64(bytes)}`;
}

/**
 * `data:` URL을 MIME과 바이트로 되돌린다. 형식이 아니면 `null`.
 *
 * 던지지 않고 `null`을 돌려준다. 호출자는 자산 하나가 깨졌다고 가져오기 전체를
 * 중단하는 대신, 어느 자산이 왜 깨졌는지 이슈로 모아 보고해야 한다. (M8 DoD 3)
 */
export function parseDataUrl(value: string): ParsedDataUrl | null {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(value);
  if (match === null) return null;

  const mimeType = match[1] ?? '';
  const isBase64 = match[2] !== undefined;
  const payload = match[3] ?? '';

  // base64가 아닌 Data URL은 받지 않는다. 이미지 바이트를 퍼센트 인코딩으로
  // 싣는 것은 우리가 만들지 않는 형식이고, 조용히 받아 주면 어디서 왔는지
  // 모르는 바이트가 저장소에 들어온다.
  if (!isBase64 || mimeType === '') return null;

  const bytes = fromBase64(payload);
  return bytes === null ? null : { mimeType, bytes };
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

/** 디코딩할 수 없으면 `null`. `atob`는 잘못된 입력에 던진다. */
function fromBase64(payload: string): ArrayBuffer | null {
  let binary: string;
  try {
    binary = atob(payload);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
