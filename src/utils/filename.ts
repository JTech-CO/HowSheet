/**
 * 안전한 내보내기 파일명.
 *
 * 기준: 기술 백서 §4.3.5, §4.4.5. 하네스 M8 할 일 3, DoD 7.
 *
 * 파일명은 사용자가 고른 제목에서 만든다. 제목은 자유 입력이고 파일 시스템은
 * 자유롭지 않다. 규칙을 여기 한 곳에 모아 두는 이유는 M8 JSON과 M9 HTML이
 * **같은 규칙**을 써야 하기 때문이다. 확장자만 다르다.
 */

/** §4.4.5가 지정한 운영체제 금지 문자. */
const FORBIDDEN_CHARACTERS = /[<>:"/\\|?*]/g;

/**
 * 제어 문자(Unicode `Cc`: U+0000~U+001F, U+007F~U+009F).
 *
 * §4.4.5의 목록에는 없지만 어느 운영체제에서도 파일명에 넣을 수 없다. 눈에
 * 보이지 않으므로 제목에 섞여 들어와도 사용자가 알아채지 못하고, 남겨 두면
 * 저장 자체가 실패한다. 목록에 없는 것이 허용이라는 뜻은 아니다.
 *
 * 숫자 이스케이프 대신 유니코드 속성을 쓴다. 소스에 제어 문자를 직접 넣지
 * 않아도 되고, C1 영역(U+0080~U+009F)까지 함께 걸린다.
 */
const CONTROL_CHARACTERS = /\p{Cc}/gu;

/**
 * Windows 예약 장치 이름.
 *
 * 확장자를 붙여도 예약이 풀리지 않아 `CON.r1.howsheet.json`도 저장할 수 없다.
 * §4.4.5는 문자만 말하지만, 저장할 수 없는 이름을 만들어 주는 것은 "안전한
 * 파일명"이 아니다. 접미사를 붙여 피한다.
 */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** 이름이 비었을 때 쓰는 값. (§4.4.5) */
export const FILENAME_FALLBACK = 'howsheet-guide';

/** 확장자를 뺀 이름의 상한. (§4.4.5) */
export const FILENAME_MAX_LENGTH = 80;

/** HowSheet JSON 교환 형식의 확장자. (§2.4.1) */
export const HOWSHEET_JSON_EXTENSION = '.howsheet.json';

/**
 * 제목을 파일 시스템이 받는 이름으로 바꾼다. 확장자와 개정 번호는 붙이지 않는다.
 *
 * 순서가 중요하다. 금지 문자를 지운 **뒤에** 공백을 정리해야 `a / b`가
 * `a-b`가 되지 `a--b`로 남지 않는다.
 */
export function safeFileName(title: string): string {
  const cleaned = title
    // 공백은 지우지 않고 하이픈으로 바꾼다. 지우면 단어가 붙어 읽을 수 없다.
    //
    // 제어 문자보다 **먼저** 온다. 탭과 줄바꿈은 제어 문자이면서 공백이다.
    // 순서를 바꾸면 `줄1\n줄2`가 `줄1줄2`로 붙어 두 단어가 하나가 된다.
    .replace(/\s+/g, '-')
    .replace(CONTROL_CHARACTERS, '')
    .replace(FORBIDDEN_CHARACTERS, '')
    // 금지 문자를 지운 자리에서 하이픈이 겹칠 수 있으므로 마지막에 접는다.
    .replace(/-+/g, '-');

  const trimmed = trimEdges(cleaned);
  if (trimmed === '') return FILENAME_FALLBACK;

  const limited = trimEdges(truncateToCodePoints(trimmed, FILENAME_MAX_LENGTH));
  if (limited === '') return FILENAME_FALLBACK;

  // 예약 이름은 대소문자를 가리지 않는다. 접미사를 붙여도 80자를 넘지 않는다.
  return RESERVED_NAMES.test(limited) ? `${limited}-guide` : limited;
}

/**
 * `.r{revision}.howsheet.json`까지 붙인 완성 파일명. (§4.3.5, DoD 7)
 *
 * 개정 번호가 이름에 들어가야 같은 가이드의 두 개정을 한 폴더에 둘 수 있다.
 * 없으면 브라우저가 `(1)`을 붙여 어느 쪽이 최신인지 알 수 없게 만든다.
 */
export function guideFileName(title: string, revision: number): string {
  return `${safeFileName(title)}.r${revision}${HOWSHEET_JSON_EXTENSION}`;
}

/**
 * 앞뒤의 점·공백·하이픈을 지운다.
 *
 * 앞의 점은 유닉스에서 숨김 파일을 만들고, 뒤의 점과 공백은 Windows가 조용히
 * 잘라내 이름이 달라진다. 하이픈은 금지 문자는 아니지만 치환의 부산물이라
 * 가장자리에 남을 이유가 없다.
 */
function trimEdges(value: string): string {
  return value.replace(/^[.\s-]+/, '').replace(/[.\s-]+$/, '');
}

/**
 * 코드 포인트 기준으로 자른다.
 *
 * `String.prototype.slice`는 UTF-16 단위라 이모지와 일부 한자를 반쪽으로
 * 잘라 짝 없는 서로게이트를 남긴다. 그 문자열은 파일명에 넣을 수 없다.
 */
function truncateToCodePoints(value: string, limit: number): string {
  const points = [...value];
  return points.length <= limit ? value : points.slice(0, limit).join('');
}
