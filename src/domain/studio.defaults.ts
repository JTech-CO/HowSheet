/**
 * 작업 문서 기본값과 측정.
 *
 * 기준: v2 제품정의 §3(화면 - 글자 수와 대략의 토큰 수). 하네스 P1 DoD 5.
 *
 * 순수 함수만 둔다. 브라우저 API를 쓰지 않아 node 환경에서 그대로 돈다.
 */

import { STUDIO_DOCUMENT_VERSION, type StudioDocument } from './studio.types.ts';

export function createStudioDocument(now: string): StudioDocument {
  return { version: STUDIO_DOCUMENT_VERSION, source: '', updatedAt: now };
}

/**
 * 저장된 값이 우리가 아는 문서인지 본다.
 *
 * 손으로 검사한다. 스키마 라이브러리를 다시 들이기에는 필드가 셋뿐이고, 그
 * 의존성이 번들에 들어가는 값이 이 검사 하나에 비해 크다.
 */
export function isStudioDocument(value: unknown): value is StudioDocument {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['version'] === STUDIO_DOCUMENT_VERSION &&
    typeof candidate['source'] === 'string' &&
    typeof candidate['updatedAt'] === 'string'
  );
}

/**
 * 한글·한자·가나 범위.
 *
 * 이 글자들은 대부분의 토크나이저에서 라틴 문자보다 훨씬 촘촘하게 쪼개진다.
 * 한 덩어리로 묶어 세면 한국어 문서의 토큰 수를 크게 낮잡는다.
 *
 * 범위를 숫자 이스케이프로 쓴다. 소스에 비ASCII 리터럴을 넣으면 편집기·포매터를
 * 거치며 조용히 바뀔 수 있고, 바뀌어도 눈으로 보이지 않는다.
 *   ぀-ヿ 가나 / 㐀-䶿 한자 확장 A
 *   一-鿿 한자 / 가-힣 한글 음절
 */
const DENSE_SCRIPT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7a3]/u;

/**
 * 대략의 토큰 수.
 *
 * **정확한 값이 아니다.** 정확한 값은 모델의 토크나이저만 알고, 그것을 브라우저로
 * 가져오려면 수 MB짜리 사전이 필요하다. 이 어림수의 쓸모는 "이 자료가 한 요청에
 * 들어갈 만한 크기인가"를 가늠하는 것뿐이라 그 정도면 충분하다.
 *
 * 두 구간으로 나눈다. 촘촘한 문자는 글자당 약 0.8토큰, 나머지는 4글자당 1토큰으로
 * 본다. 화면은 반드시 근사임을 밝힌다. (P1 DoD 5, 주의)
 */
export function estimateTokens(text: string): number {
  let dense = 0;
  let rest = 0;

  for (const character of text) {
    if (DENSE_SCRIPT.test(character)) dense += 1;
    else rest += 1;
  }

  return Math.ceil(dense * 0.8 + rest / 4);
}

/**
 * 사용자에게 보여 줄 글자 수.
 *
 * 코드 단위가 아니라 **코드 포인트**로 센다. 이모지 하나가 2로 세어지면 사용자가
 * 보는 것과 어긋난다.
 */
export function countCharacters(text: string): number {
  return [...text].length;
}
