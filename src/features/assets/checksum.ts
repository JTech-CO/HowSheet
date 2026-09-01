/**
 * 자산 체크섬.
 *
 * 기준: 기술 백서 §4.4.4(SHA-256 체크섬으로 중복 제거), 하네스 M5 DoD 8.
 *
 * 접두사를 붙인 문자열을 쓴다. 나중에 알고리즘을 바꿔도 저장된 값이 어느
 * 알고리즘으로 계산됐는지 남아 있어야 재계산 여부를 판단할 수 있다.
 */

export const CHECKSUM_ALGORITHM = 'sha256';

/** `sha256-<hex>` 형식인지 본다. */
export function isChecksum(value: string): boolean {
  return new RegExp(`^${CHECKSUM_ALGORITHM}-[0-9a-f]{64}$`).test(value);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 바이트의 SHA-256을 `sha256-<hex>`로 돌려준다.
 *
 * `crypto.subtle`은 보안 컨텍스트에서만 있다. `file://`로 연 편집기에서는
 * 없을 수 있으므로 호출자가 실패를 다룰 수 있게 던진다. 조용히 약한 해시로
 * 대체하면 서로 다른 이미지가 같은 체크섬을 받아 중복 제거가 데이터를 뭉갠다.
 */
export async function checksumOf(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error(
      '이 컨텍스트에서는 SHA-256을 계산할 수 없습니다. https 또는 localhost에서 열어 주세요.',
    );
  }
  return `${CHECKSUM_ALGORITHM}-${toHex(await subtle.digest('SHA-256', bytes))}`;
}
