/**
 * 링크 프로토콜 허용 판정.
 *
 * 기준: v2 제품정의 §8 INV-05. v1에서는 `domain/guide.types.ts`에 있었고
 * `docs/archive/v1/File_Structure.md` §3.3이 이 자리를 예정해 두었다.
 *
 * 살균기가 유일한 소비자다. 도메인 모델이 사라지면서 여기로 옮겼다 - 링크
 * 판정은 가이드 문서의 개념이 아니라 문자열의 성질이다.
 *
 * 이 판정을 다른 곳에서 다시 구현하지 않는다. 살균기와 미리보기가 각자
 * 판정하면 규칙이 갈린다.
 */

/** 허용 링크 프로토콜. */
export const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'] as const;

/**
 * `http:`·`https:`만 통과시킨다.
 *
 * `new URL`은 브라우저 API가 아니라 ECMAScript 표준이라 어느 환경에서나 쓸 수
 * 있다. 파싱 실패는 거부로 다룬다 - 주소가 아닌 것을 주소로 취급하지 않는다.
 */
export function isAllowedUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(parsed.protocol);
  } catch {
    return false;
  }
}
