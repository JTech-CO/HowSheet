/**
 * 안전한 내보내기 파일명.
 *
 * 기준: v2 제품정의 §3(결과 - `.md` 다운로드). 하네스 P6 DoD 2.
 *
 * 파일명은 사용자가 붙여넣은 자료에서 만든다. 자료는 자유 입력이고 파일
 * 시스템은 자유롭지 않다. 금지 문자, 제어 문자, 예약 이름, 길이를 여기 한
 * 곳에서 다룬다.
 *
 * 규칙 자체는 v1에서 왔다. 확장자와 접미사만 v2의 것으로 바꿨고, 쓰이지 않게
 * 된 `.howsheet.json` 경로는 지웠다.
 */

/** 운영체제가 파일명에 허용하지 않는 문자. */
const FORBIDDEN_CHARACTERS = /[<>:"/\\|?*]/g;

/**
 * 제어 문자(Unicode `Cc`: U+0000~U+001F, U+007F~U+009F).
 *
 * 어느 운영체제에서도 파일명에 넣을 수 없다. 눈에 보이지 않으므로 자료에
 * 섞여 들어와도 사용자가 알아채지 못하고, 남겨 두면 저장 자체가 실패한다.
 *
 * 숫자 이스케이프 대신 유니코드 속성을 쓴다. 소스에 제어 문자를 직접 넣지
 * 않아도 되고, C1 영역(U+0080~U+009F)까지 함께 걸린다.
 */
const CONTROL_CHARACTERS = /\p{Cc}/gu;

/**
 * Windows 예약 장치 이름.
 *
 * 확장자를 붙여도 예약이 풀리지 않아 `CON.r1.md`도 저장할 수 없다. 저장할 수
 * 없는 이름을 만들어 주는 것은 "안전한 파일명"이 아니다. 접미사를 붙여 피한다.
 */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** 이름을 만들 수 없을 때 쓰는 값. */
export const FILENAME_FALLBACK = 'howsheet-prompt';

/** 확장자를 뺀 이름의 상한. */
export const FILENAME_MAX_LENGTH = 80;

/** 내려받는 프롬프트의 확장자. 붙여넣기 좋게 Markdown으로 낸다. */
export const PROMPT_EXTENSION = '.md';

/**
 * 제목을 파일 시스템이 받는 이름으로 바꾼다. 확장자와 회차는 붙이지 않는다.
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
  return RESERVED_NAMES.test(limited) ? `${limited}-prompt` : limited;
}

/**
 * 붙여넣은 자료에서 파일명에 쓸 제목을 뽑는다.
 *
 * v2에는 제목 필드가 없다. 자료의 **첫 줄**을 쓴다 - 대부분 제목이거나 첫
 * 문장이고, 여러 자료로 만든 프롬프트를 한 폴더에 두었을 때 서로 구분된다.
 *
 * Markdown 제목 표시(`#`)와 목록 표시를 걷어낸다. 남는 것이 없으면 빈
 * 문자열을 주고, 이름을 만드는 쪽이 기본값으로 떨어진다.
 */
export function promptTitleFromSource(source: string): string {
  for (const line of source.split('\n')) {
    const cleaned = line.replace(/^[\s#>*-]+/u, '').trim();
    if (cleaned !== '') return cleaned;
  }
  return '';
}

/**
 * `.r{n}.md`까지 붙인 완성 파일명. (P6 DoD 2)
 *
 * 회차가 이름에 들어가야 같은 자료로 여러 번 만든 프롬프트를 한 폴더에 둘 수
 * 있다. 없으면 브라우저가 `(1)`을 붙여 어느 쪽이 최신인지 알 수 없게 만든다.
 */
export function promptFileName(source: string, revision: number): string {
  return `${safeFileName(promptTitleFromSource(source))}.r${revision}${PROMPT_EXTENSION}`;
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
