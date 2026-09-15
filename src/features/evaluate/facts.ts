/**
 * 자료에 없는 사실을 찾는다.
 *
 * 기준: 하네스 P8 DoD 3. 제품정의 §6.2-1("없는 사실을 만들지 않는다").
 *
 * ## 무엇을 사실로 보는가
 *
 * 한국어 문장이 자료에 근거하는지는 기계로 판정할 수 없다. 대신 **꾸며 내면
 * 티가 나는 토큰**만 뽑아 자료와 대조한다.
 *
 * - 숫자 (수치·날짜·비율) - 뒤에 붙은 단위와 함께
 * - 버전 (`v2.4.1`)
 * - URL·이메일·도메인
 * - 코드 조각 (백틱 안의 명령·식별자, 코드 울타리의 줄)
 * - 대문자나 숫자가 섞인 라틴 이름 (제품명·약어)
 * - "자료의 “…”"처럼 자료에서 따왔다고 주장하는 인용
 *
 * ## 숫자는 단위와 함께 맞춘다
 *
 * 규칙 문구에는 "## 3. 결과물"처럼 작은 숫자가 흔하다. 숫자만 맞추면 "노드 3대"가
 * 그 "3" 덕에 통과한다. 규칙 문구의 숫자는 **같은 단위**일 때만 근거로 본다. 자료의
 * 숫자는 단위 없이 적힌 표 칸이 많아 조금 너그럽게 맞춘다. (P8 적대 검증)
 *
 * ## 사실이 아닌 숫자
 *
 * 제품정의 §6.2-3이 디자인을 CSS로 옮길 수 있게 쓰라고 요구한다. 그러면 `16px`,
 * 줄 간격 `1.6`, 대비 `4.5:1` 같은 숫자가 반드시 나온다. 결과물을 **어떻게 만들지**에
 * 대한 지시이지 자료에 대한 주장이 아니다. 단위나 바로 앞의 디자인 낱말로 가려낸다.
 *
 * 가려내는 규칙이 넓을수록 꾸민 숫자가 새어 나간다. "재시도 간격 45초"는 "간격"
 * 뒤에 오지만 단위가 "초"라서 사실로 본다. "전월 대비 37%"의 "대비"는 디자인 낱말이
 * 아니다.
 */

import { NAME_ALLOWLIST } from './lexicon.ts';
import { collapseWhitespace } from './text.ts';

export type FactKind =
  'number' | 'version' | 'url' | 'email' | 'domain' | 'code' | 'name' | 'quote';

export const FACT_KIND_LABELS: Readonly<Record<FactKind, string>> = {
  number: '숫자',
  version: '버전',
  url: 'URL',
  email: '이메일',
  domain: '도메인',
  code: '코드 조각',
  name: '이름',
  quote: '자료 인용',
};

export interface FactCandidate {
  kind: FactKind;
  value: string;
  /** 숫자 뒤에 붙은 단위. 한글 한 자, `%`, 또는 라틴 낱말. 없으면 빈 문자열. */
  unit?: string;
}

/** 대조할 바탕. 자료와 규칙 문구에서 한 번씩 만든다. */
export interface FactBasis {
  /** 숫자 → 함께 적힌 단위들. */
  numbers: ReadonlyMap<string, ReadonlySet<string>>;
  versions: ReadonlySet<string>;
  names: ReadonlySet<string>;
  raw: string;
  lower: string;
  collapsed: string;
  /** 규칙 문구처럼 단위까지 같아야 근거로 치는 바탕인가. */
  exactUnits: boolean;
}

const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const VERSION = /(?<![\w.])(?:v\d+(?:\.\d+)*|\d+(?:\.\d+){2,})(?!\.?\w)/gi;
const URL_PATTERN = /https?:\/\/[^\s)<>"'`\]]+/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const DOMAIN =
  /(?<![\w@./-])(?:(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|kr|co|ai|cloud|internal|local|corp|jp|xyz)|[a-z0-9-]+(?:\.[a-z0-9-]+){1,}\.[a-z]{2,6})(?![\w-])/gi;
const CODE_SPAN = /`([^`\n]+)`/g;
const FORMULA = /[^\s,.:;()가-힣]+\s*[←⇐]\s*[^,。\n가-힣]+/g;
const NAME = /(?<![\w-])[A-Za-z][A-Za-z0-9]*(?:[-+.#][A-Za-z0-9]+)*/g;
/** 색 코드는 3·6·8자리다. "#4821" 같은 티켓 번호는 색이 아니다. */
const HEX_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![\w])/gi;

export function canonicalNumber(raw: string): string {
  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) ? String(value) : raw;
}

function canonicalVersion(raw: string): string {
  return raw.toLowerCase().replace(/^v/, '');
}

function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?]+$/, '').replace(/\/$/, '');
}

function unitAfter(text: string, end: number): string {
  const match = /^\s?([가-힣]|%|[A-Za-z]+)/.exec(text.slice(end));
  return (match?.[1] ?? '').toLowerCase();
}

/**
 * 바탕을 만든다.
 *
 * @param exactUnits 규칙 문구처럼 단위가 같을 때만 근거로 칠 것인가.
 */
export function createBasis(texts: readonly string[], exactUnits = false): FactBasis {
  const raw = texts.join('\n');

  const versions = new Set<string>();
  for (const match of raw.matchAll(VERSION)) versions.add(canonicalVersion(match[0]));
  // 버전 안의 숫자를 따로 세지 않는다. "v2.4.1"이 "1"을 아무 단위에나 허락하게 된다.
  const withoutVersions = raw.replace(VERSION, ' ');

  const numbers = new Map<string, Set<string>>();
  for (const match of withoutVersions.matchAll(NUMBER)) {
    const start = match.index ?? 0;
    const before = withoutVersions.slice(0, start);
    const after = withoutVersions.slice(start + match[0].length);
    // 목록 번호와 식별자 속 숫자("s3://", "sha256")는 자료가 말하는 수가 아니다.
    if (/(?:^|\n)\s*(?:#{1,6}\s*)?$/.test(before) && /^[.)]\s/.test(after)) continue;
    if (/[A-Za-z_]-?$/.test(before)) continue;
    const key = canonicalNumber(match[0]);
    const units = numbers.get(key) ?? new Set<string>();
    units.add(unitAfter(withoutVersions, start + match[0].length));
    numbers.set(key, units);
  }

  // 시각 "14:00"은 "오후 2시", "15:10"은 "3시 10분"으로 풀어 쓰기도 한다.
  const add = (key: string, unit: string) => {
    const units = numbers.get(key) ?? new Set<string>();
    units.add(unit);
    numbers.set(key, units);
  };
  for (const match of withoutVersions.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)) {
    const hour = Number(match[1]);
    add(String(hour), '시');
    if (hour > 12) add(String(hour - 12), '시');
    if (Number(match[2]) > 0) add(String(Number(match[2])), '분');
  }

  const names = new Set<string>();
  for (const match of raw.matchAll(NAME)) names.add(match[0].toLowerCase());

  return {
    numbers,
    versions,
    names,
    raw,
    lower: raw.toLowerCase(),
    collapsed: collapseWhitespace(raw),
    exactUnits,
  };
}

// ───────────────────────────────────────────────────────── 코드 조각 예외

/** 결과물을 만드는 방법을 말하는 코드. 자료와 무관하다. */
const STYLE_CODE: readonly RegExp[] = [
  /^<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>$/i, // HTML 태그
  /^<!doctype\s+html>$/i,
  /^@(?:media|page|supports|font-face|keyframes|layer)\b/i, // at-rule
  // CSS 선언. 속성 이름은 소문자만 - `X-RateLimit-Limit: 1000` 같은 HTTP 헤더를 삼키지 않는다.
  /^[a-z][a-z-]*\s*:\s*[^;{}]+;?$/,
  // 사용자 정의 속성. 값이 있거나 흔한 접두어일 때만 - `--clean` 같은 명령 옵션과 가른다.
  /^--[a-z][\w-]*\s*:\s*[^;{}]+;?$|^var\(--[\w-]+\)$|^--(?:color|space|font|size|radius|gap|line|text|bg|border|shadow|z|w|h)(?:-[\w-]+)?$/,
  /^\(\s*(?:max|min)-(?:width|height)\s*:\s*[\d.]+(?:px|rem|em)\s*\)$/i, // 미디어 조건
  // 글꼴 스택. 끝이 일반 계열 이름이어야 한다.
  /^(?:["']?[A-Za-z-][\w\s-]*["']?\s*,\s*)+["']?(?:sans-serif|serif|monospace|system-ui|cursive|ui-monospace|ui-serif|ui-sans-serif)["']?$/i,
  /^(?:#[0-9a-f]{3,8}|[\d.]+(?:px|rem|em|pt|vh|vw|ch)|[a-z-]+\([^()]*\))$/i, // 값
  /^[a-z][a-z0-9-]*$/, // 소문자 키워드 하나 (`system-ui`, `details`)
  /^\.[a-z][\w-]*$/i, // 클래스 선택자나 확장자 (`.callout`, `.html`)
  /^::?[a-z-]+(?:\([^)]*\))?$/, // 가상 선택자 (`:focus-visible`, `::marker`)
  /^(?:<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>)+$/i, // 태그 여럿 (`<pre><code>`)
  /^[a-z][\w-]*="[^"]*"$/, // 속성 (`role="img"`)
  /^(?:navigator|document|window|element)\.[\w.]+(?:\([^)]*\))?$/, // 브라우저 API
  // 단위가 붙은 값이 하나라도 있는 값 목록 (`1px solid`, `0 0 1rem`)
  /^(?=.*\d(?:px|rem|em|%|pt))(?:[\d.]+(?:px|rem|em|%|pt)?|#[0-9a-f]{3,8}|[a-z-]+)(?:\s+(?:[\d.]+(?:px|rem|em|%|pt)?|#[0-9a-f]{3,8}|[a-z-]+))+$/i,
];

/** HTML 요소 이름. 선택자가 이 이름과 클래스·가상 선택자로만 이뤄졌으면 CSS다. */
const HTML_TAGS = new Set(
  (
    'html body main header footer nav section article aside div span p a h1 h2 h3 h4 h5 h6 ' +
    'ul ol li dl dt dd table thead tbody tfoot tr th td caption figure figcaption img svg ' +
    'pre code kbd samp blockquote details summary button input label strong em small mark hr'
  ).split(' '),
);

function isSelector(text: string): boolean {
  const parts = text
    .trim()
    .split(/\s*[\s>+~,]\s*/)
    .filter((part) => part !== '');
  return (
    parts.length > 0 &&
    parts.every((part) => {
      const tag = /^([a-z][a-z0-9]*)?((?:[.#][\w-]+|::?[\w-]+(?:\([^)]*\))?)*)$/.exec(part);
      return tag !== null && (tag[1] === undefined || HTML_TAGS.has(tag[1])) && part !== '';
    })
  );
}

/** 알려진 글꼴 이름이 하나라도 든 글꼴 스택 (일반 계열 이름이 끝에 없어도). */
const FONT_STACK = /^(?:["']?[A-Za-z-][\w\s-]*["']?\s*,\s*)+["']?[A-Za-z-][\w\s-]*["']?$/;
const KNOWN_FONT =
  /system-ui|-apple-system|blinkmacsystemfont|segoe|malgun|apple sd|georgia|times|consolas|menlo|monospace|serif|noto|roboto|helvetica|arial/i;

/** 사용자 정의 속성 이름만 적힌 코드는 CSS를 말하는 절에서만 CSS로 본다. `--clean` 같은 명령 옵션과 가른다. */
const CSS_CONTEXT = /색|배경|변수|속성|CSS|var|강조|경계선|글꼴|간격|테두리|스타일/;

/** 낱말 하나짜리 코드. 대문자가 섞였으면 이름 검사로 넘긴다 (`viewBox`는 되고 `Kubernetes`는 안 된다). */
const SINGLE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*$/;

function isStyleCode(code: string, clause: string): boolean {
  // 외부 주소를 담은 태그는 결과물 방법이 아니다. 주소가 사실 검사를 비켜 가지 않게 한다.
  if (/https?:\/\//i.test(code)) return false;
  if (STYLE_CODE.some((pattern) => pattern.test(code))) return true;
  if (FONT_STACK.test(code) && KNOWN_FONT.test(code)) return true;
  if (/^--[a-z][\w-]*$/.test(code) && CSS_CONTEXT.test(clause)) return true;
  // 선택자, 또는 선택자와 선언 블록 (`pre code`, `h1 { font-size: 1.75rem }`)
  const rule = /^([^{}]+?)\s*(?:\{\s*([^{}]*)\})?$/.exec(code);
  if (rule === null || !isSelector(rule[1] ?? '')) return false;
  const body = rule[2];
  return (
    body === undefined ||
    body
      .split(';')
      .every(
        (declaration) =>
          declaration.trim() === '' || /^[a-z-]+\s*:\s*[^:]+$/.test(declaration.trim()),
      )
  );
}

// ───────────────────────────────────────────────────────── 숫자 예외

const DESIGN_UNIT_AFTER =
  /^\s*(?:px|rem|em|pt|vh|vw|vmin|vmax|ch|fr|deg|dpi|dppx|mm|cm|픽셀)(?![A-Za-z])/i;
const DESIGN_SEQUENCE_AFTER =
  /^(?:\s*(?:[,/·~\-–×x]|에서|부터|to)\s*\d+(?:\.\d+)?)+\s*(?:px|rem|em|pt|mm|cm)(?![A-Za-z])/i;
const DESIGN_WORD =
  '줄\\s*간격|행간|line-height|자간|letter-spacing|굵기|font-weight|명도\\s*대비|명암비|contrast|투명도|opacity|z-index|배율|종횡비|aspect-ratio|본문\\s*폭|최대\\s*폭|max-width|min-width|너비|width|높이|height|글자\\s*크기|font-size|간격|여백|margin|padding|gap|radius|모서리|두께|border';
/** 디자인 낱말 뒤에 온 숫자. 표 칸을 건너도, 뒤로 숫자 목록이 이어져도 같은 문맥이다. */
const DESIGN_CONTEXT_BEFORE = new RegExp(
  `(?:${DESIGN_WORD})\\s*(?:은|는|이|가|을|를|:|=|\\(|\\||약|최대|최소|기준)*\\s*(?:[가-힣]{1,3}\\s+)?` +
    '(?:\\d+(?:\\.\\d+)?\\s*(?:px|rem|em|%)?\\s*[,/·:x×~\\-]\\s*)*$',
  'i',
);
/** 이런 말이 절에 있으면 그 단위는 결과물의 치수다. */
const SCALE_CONTEXT = /크기|글자|제목|본문|비율|키우|키웁|scale/;
const ZOOM_CONTEXT = /확대|zoom|배율/i;
const LINE_LENGTH_CONTEXT = /폭|한\s*줄|줄\s*길이|너비/;
const UI_TIMING_CONTEXT = /복사|버튼|토스트|애니메이션|전환|transition|포커스|사라지|표시했다/i;
/** 폭·높이·투명도 뒤의 퍼센트는 레이아웃이다. */
const LAYOUT_PERCENT_BEFORE =
  /(?:폭|너비|width|높이|height|투명도|opacity)\s*(?:은|는|이|가|을|를|:)?\s*$/i;
/** 이 단위가 붙으면 디자인 문맥이라도 사실이다. "간격 45초". */
const FACT_UNIT_AFTER =
  /^\s*(?:초|분|시간|일|주|개월|달|년|건|명|회|번|원|달러|억|만|천|배|퍼센트|%|대|곳|ms|sec|min|[KMGT]B|req)/i;
const COUNTER_AFTER =
  /^\s*(?:개(?![월국사년])|가지|단계|열|단|줄|행|칸|섹션|문단|항목|번째|장|페이지|쪽|문장|단어|컬럼|종|columns?|rows?|sections?|items?|steps?)/i;
/** 이보다 큰 CSS 치수는 결과물 방법이 아니라 내용일 가능성이 높다 ("4000px 넘는 사진"). */
const MAX_DESIGN_PIXELS = 2000;

function isInstructionNumber(text: string, start: number, end: number, raw: string): boolean {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const value = Number(raw.replace(/,/g, ''));

  // 식별자의 일부 ("h1", "EC2", "utf-8"). 이름 검사가 따로 본다.
  if (/[A-Za-z_]-?$/.test(before)) return true;
  // 번호 ("3. 표를 만든다", "1) ... 2) ...", "## 1.") - 줄 중간의 인용 제목 번호도 같다
  if (value < 100) {
    if (/^\)(?:\s|$)/.test(after) && /(?:^|\s)$/.test(before)) return true;
    // 점 번호는 절 첫머리나 따옴표 바로 뒤에서만. "요청은 12. 다음은"의 12는 문장 끝의 수다.
    if (/^\.(?:\s|$)/.test(after) && /^(?:\s*(?:#{1,6}|[-*+])?\s*|.*["“'(])$/.test(before))
      return true;
  }
  // CSS 단위와 줄임 표기 ("16px/1.6")
  if (
    (DESIGN_UNIT_AFTER.test(after) && value <= MAX_DESIGN_PIXELS) ||
    DESIGN_SEQUENCE_AFTER.test(after)
  ) {
    return true;
  }
  if (/\d(?:px|rem|em)\s*\/\s*$/.test(before)) return true;
  // 접근성 지침 판 ("WCAG 2.1")
  if (/WCAG\s*$/i.test(before)) return true;
  // 명도 대비 "4.5:1" - 대비를 말할 때만
  const nearby = before.slice(-24);
  const contrast = /대비|contrast|명도|명암/i;
  if (/^\s*:\s*1(?!\d)/.test(after) && contrast.test(nearby)) return true;
  if (raw === '1' && /\d(?:\.\d+)?\s*:\s*$/.test(before) && contrast.test(before.slice(-32)))
    return true;
  // 굵기 값 ("제목 700, 본문 400")
  if (value >= 100 && value <= 900 && value % 100 === 0 && /굵기|weight/i.test(text)) return true;
  if (FACT_UNIT_AFTER.test(after)) {
    if (/^\s*%/.test(after)) {
      return LAYOUT_PERCENT_BEFORE.test(before.slice(-16)) || ZOOM_CONTEXT.test(text);
    }
    if (/^\s*배/.test(after)) return SCALE_CONTEXT.test(text);
    if (/^\s*(?:초|ms)/.test(after)) return UI_TIMING_CONTEXT.test(text);
    return false;
  }
  // 한 줄 글자 수 ("35~40자")
  if (/^\s*(?:[~\-–]\s*\d+\s*)?자/.test(after) && value <= 120 && LINE_LENGTH_CONTEXT.test(text)) {
    return true;
  }
  // 디자인 낱말 뒤
  if (DESIGN_CONTEXT_BEFORE.test(before.slice(-48))) return true;
  // 문서 구조를 세는 작은 수 ("3단계", "2열", "2, 3, 4단계")
  const counted = after.replace(/^(?:\s*[,·~\-–]\s*\d+)+/, '');
  if (COUNTER_AFTER.test(counted) && value <= 20) return true;

  return false;
}

// ─────────────────────────────────────────────────────────── 추출

/**
 * 절 하나에서 사실 후보를 뽑는다. 결과물을 만드는 방법에 관한 토큰은 뺀다.
 *
 * 먼저 뽑은 것은 텍스트에서 지워 같은 글자가 두 번 세어지지 않게 한다 -
 * URL 안의 숫자가 숫자로 또 잡히면 보고서가 같은 위반을 여러 번 적는다.
 */
export function extractFacts(clause: string): FactCandidate[] {
  const facts: FactCandidate[] = [];
  let text = clause;

  const take = (
    pattern: RegExp,
    kind: FactKind,
    map: (whole: string, group: string) => string | null,
  ) => {
    // 캡처 그룹이 없는 패턴이면 두 번째 인자는 위치(number)다.
    text = text.replace(pattern, (whole: string, group: unknown) => {
      const value = map(whole, typeof group === 'string' ? group : '');
      if (value !== null) facts.push({ kind, value });
      return ' ';
    });
  };

  const identifiers: string[] = [];
  take(CODE_SPAN, 'code', (_, group) => {
    const code = group.trim();
    if (code === '' || isStyleCode(code, clause)) return null;
    if (SINGLE_IDENTIFIER.test(code)) {
      identifiers.push(code);
      return null;
    }
    return code;
  });
  // 이름 검사가 보도록 텍스트에 되돌려 둔다.
  if (identifiers.length > 0) text = `${text} ${identifiers.join(' ')}`;

  // 식. "v ← β · v"처럼 자료에 없는 갱신식을 지어내면 여기서 걸린다.
  take(FORMULA, 'code', (whole) => collapseWhitespace(whole));
  take(URL_PATTERN, 'url', (whole) => trimUrl(whole));
  take(EMAIL, 'email', (whole) => whole);
  take(DOMAIN, 'domain', (whole) => whole);
  take(VERSION, 'version', (whole) => canonicalVersion(whole));
  text = text.replace(HEX_COLOR, ' ');

  for (const match of text.matchAll(NAME)) {
    const token = match[0];
    const lower = token.toLowerCase();
    // 대문자도 숫자도 없는 라틴 낱말은 CSS·HTML 어휘일 가능성이 높아 보지 않는다.
    if (!/[A-Z]/.test(token) && !/\d/.test(token.slice(1))) continue;
    if (NAME_ALLOWLIST.has(lower)) continue;
    if (lower.split(/[-+.#]/).every((part) => NAME_ALLOWLIST.has(part))) continue;
    facts.push({ kind: 'name', value: token });
  }

  for (const match of text.matchAll(NUMBER)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const end = start + raw.length;
    if (isInstructionNumber(text, start, end, raw)) continue;
    facts.push({ kind: 'number', value: canonicalNumber(raw), unit: unitAfter(text, end) });
  }

  return facts;
}

const QUOTE_OPEN = '[“"「『]';
const QUOTE_BODY = '([^”"」』\\n]{2,160})';
const QUOTE_CLOSE = '[”"」』]';

/**
 * 자료에서 따왔다고 주장하는 인용. 절로 쪼개기 전의 텍스트에서 찾는다 - 두 문장짜리 인용이
 * 끊기지 않게.
 *
 * "자료의 “…”"처럼 **바로 붙은** 주장만 본다. "자료 순서를 따라 “경사 하강법이란”"은
 * 제안하는 제목이고, "본문 `…"Apple SD Gothic Neo"`"의 "본문"은 글꼴 이야기다. (P8 청팀 검증)
 */
const CLAIMED_QUOTES: readonly RegExp[] = [
  new RegExp(
    `(?:자료|원문)(?:의|에서|에\\s*따르면|에\\s*(?:나온|적힌|있는|쓰인)|대로)\\s*(?:문장|문구|표현|말)?\\s*${QUOTE_OPEN}${QUOTE_BODY}${QUOTE_CLOSE}`,
    'g',
  ),
  new RegExp(
    `${QUOTE_OPEN}${QUOTE_BODY}${QUOTE_CLOSE}\\s*(?:이?라는|라고)?\\s*(?:말|문장|문구|표현)?(?:을|를)?\\s*인용`,
    'g',
  ),
];

export function extractClaimedQuotes(text: string): FactCandidate[] {
  const quotes = new Map<string, FactCandidate>();
  for (const pattern of CLAIMED_QUOTES) {
    for (const match of text.matchAll(pattern)) {
      const value = collapseWhitespace(match[1] ?? '');
      if (value !== '') quotes.set(value, { kind: 'quote', value });
    }
  }
  return [...quotes.values()];
}

export function isSupported(fact: FactCandidate, basis: FactBasis): boolean {
  switch (fact.kind) {
    case 'number': {
      const units = basis.numbers.get(fact.value);
      if (units === undefined) return false;
      const unit = fact.unit ?? '';
      if (basis.exactUnits) return units.has(unit);
      return unit === '' || units.has(unit) || units.has('');
    }
    case 'version':
      return basis.versions.has(fact.value);
    case 'url':
    case 'email':
    case 'domain':
      return basis.lower.includes(fact.value.toLowerCase());
    case 'code':
      return (
        basis.raw.includes(fact.value) || basis.collapsed.includes(collapseWhitespace(fact.value))
      );
    case 'name':
      return basis.names.has(fact.value.toLowerCase());
    case 'quote':
      return basis.collapsed.includes(fact.value);
  }
}
