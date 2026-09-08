/**
 * 스튜디오 작업 문서.
 *
 * 기준: v2 제품정의 §2(사용자 흐름).
 *
 * 사용자가 만드는 것은 문서 **하나**다. v1처럼 여러 가이드를 관리하지 않는다.
 * 자료를 붙여넣고 방향을 고르면 프롬프트가 나오는 한 흐름이라, 그 흐름의 상태를
 * 담는 그릇도 하나면 된다.
 *
 * 타입과 상수만 둔다. 로직은 `studio.defaults.ts`가 갖는다.
 */

/** 문서 형식 버전. 저장된 문서를 읽을 때 모양이 맞는지 판단한다. */
export const STUDIO_DOCUMENT_VERSION = 1;

export interface StudioDocument {
  version: typeof STUDIO_DOCUMENT_VERSION;
  /** 사용자가 붙여넣은 원문. Markdown일 수도 평문일 수도 있다. */
  source: string;
  updatedAt: string;
}

/**
 * 자료 길이 상한.
 *
 * Haiku 4.5의 컨텍스트는 200K 토큰이고 그 절반쯤을 자료에 쓴다고 보면 넉넉하다.
 * 상한을 두는 이유는 모델 한계보다 **브라우저**다 - 입력할 때마다 살균
 * 파이프라인이 전체를 다시 도는데, 그보다 길어지면 타이핑이 눈에 띄게 밀린다.
 *
 * 넘으면 자르지 않는다. 자르는 것은 사용자가 모르게 자료를 잃는 일이다.
 * 경고하고 그대로 둔다. (하네스 P1 주의)
 */
export const SOURCE_LENGTH_WARN = 200_000;
