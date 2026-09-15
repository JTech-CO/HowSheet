/**
 * 프롬프트를 채점할 단위로 쪼갠다.
 *
 * 기준: 하네스 P8 할 일 3.
 *
 * ## 왜 절 단위인가
 *
 * 좋은 프롬프트일수록 금지 기법의 **이름**을 많이 적는다. "네온 글로우를 쓰지
 * 않는다"는 금지 목록 그대로이고 "네온 글로우를 넣는다"는 위반이다. 단어만 세면
 * 둘을 가르지 못한다. 그래서 부정을 절마다 판정한다.
 *
 * ## 부정은 서술어가 정한다
 *
 * 한국어 문장의 부정은 끝에 온다. "과하지 않게 은은한 네온 글로우를 넣는다"에는
 * "않"이 있지만 서술어는 "넣는다"다. 절 어디에든 부정어가 있으면 부정으로 보던
 * 첫 판은 P8 적대 검증에서 이런 완곡 표현에 줄줄이 뚫렸다. 그래서 **절의 끝**이
 * 부정 서술어일 때만 그 절을 부정으로 본다.
 *
 * 절은 연결 어미("넣고", "쓰되", "말고", "않고", "없이", "대신")에서 끊는다. "네온은
 * 제목에만 넣고 본문에는 넣지 않는다"를 한 절로 두면 끝의 부정이 앞의 지시를 덮는다.
 *
 * 쉼표에서는 끊지 않는다. "네온, 글로우, 그라데이션은 쓰지 않는다"를 쉼표로
 * 자르면 앞의 두 조각에 서술어가 없어 멀쩡한 금지 문장이 위반으로 잡힌다.
 *
 * ## 부정이 번지는 범위
 *
 * - 절 끝의 부정 서술어
 * - "하지 말 것", "금지" **그 자체인** 제목 아래 구역
 * - 부정 서술어로 끝나고 쌍점으로 닫는 줄 뒤에 이어지는 목록
 *
 * 영어의 부정과 "X 대신", "X가 아니라"는 낱말 가까이에서만 본다. `isTermNegated`.
 */

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** 공백을 한 칸으로 접는다. 인용 비교에서 줄바꿈 차이를 흡수한다. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 텍스트에서 주어진 문자열을 모두 지운다. 정규식 특수 문자를 신경 쓰지 않아도 된다. */
export function removeAll(text: string, items: readonly string[]): string {
  let result = text;
  for (const item of items) {
    if (item !== '') result = result.split(item).join('');
  }
  return result;
}

export interface Clause {
  text: string;
  /** 무엇을 하지 말라고 말하는 절인가. */
  negated: boolean;
  /** Markdown 제목이거나 굵은 글씨만으로 된 줄인가. */
  heading: boolean;
  /** 1부터 센다. 같은 논리 줄의 절은 같은 번호를 갖는다. */
  line: number;
  /** 코드 울타리 안이면 그 언어(없으면 빈 문자열). 밖이면 undefined. */
  fence?: string;
  /** 이 절이 속한 구역의 제목. 없으면 빈 문자열. */
  section: string;
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const BOLD_LINE = /^\s*\*\*([^*]+)\*\*\s*[:：]?\s*$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const FENCE = /^\s*(`{3,}|~{3,})\s*([\w-]*)/;
const TABLE_ROW = /^\s*\|/;

// ─────────────────────────────────────────────────────────────── 부정 판정

/**
 * 부정 서술어로 끝나는가. 끝의 문장 부호·괄호·강조 기호를 걷고 본다.
 *
 * 목록이 길어 보이지만 하나하나가 실제 문장에서 온 것이다. "않게"나 "없도록"처럼
 * 뒤에 다른 서술어가 오는 꼴은 넣지 않는다 - 그 꼴이 완곡 표현의 통로였다.
 */
const NEGATIVE_TAIL = new RegExp(
  '(?:' +
    [
      '않(?:는다|습니다|아요|음|기|는\\s*것|을\\s*것|아야\\s*(?:한다|합니다)|' +
        '도록\\s*(?:한다|합니다|하세요|해\\s*주세요)|게\\s*(?:한다|합니다|하세요|해\\s*주세요|둔다|둡니다))',
      // "대신"과 "아니라"는 바로 앞 낱말만 부정한다. 절 전체를 덮지 않는다. (isTermNegated)
      '않고|않으며|말고|말며|없이|빼고|제외하고',
      '말\\s*것|말라|마라|말아야\\s*(?:한다|합니다)|마세요|마십시오|지\\s*마',
      '금지(?:\\s*사항)?(?:한다|합니다|이다|입니다|다|됨)?',
      '없(?:다|습니다|음|어야\\s*(?:한다|합니다)|게\\s*(?:한다|합니다|하세요)|도록\\s*(?:한다|합니다|하세요))',
      '피(?:한다|합니다|하세요|하십시오|할\\s*것)',
      '삼(?:간다|갑니다|가세요)|자제(?:한다|합니다|하세요)|배제(?:한다|합니다)',
      '제외(?:한다|합니다|하세요)|뺀다|뺍니다|빼세요|빼\\s*주세요|생략(?:한다|합니다|하세요)',
      '(?:안|못)\\s*(?:한다|합니다|쓴다|씁니다|넣는다|넣습니다|된다|됩니다)',
      '아니다|아닙니다',
    ].join('|') +
    ')$',
  'i',
);

/** 요소에만 쓰는 약한 부정. "넘어가도 된다"는 금지가 아니지만 반영도 아니다. */
const OPTIONAL_TAIL =
  /(?:넘어가도|빼도|생략해도|없어도|안\s*넣어도|두지\s*않아도)\s*(?:된다|됩니다|좋다|좋습니다|괜찮다|괜찮습니다)$|선택\s*사항(?:이다|입니다)?$/;

/**
 * 부정처럼 보이지만 부정이 아닌 말.
 *
 * "금지 목록을 따른다"는 금지하는 문장이 아니고, "빠짐없이", "예외 없이"의 "없이"는
 * 부정이 아니다. 지우지 않으면 "금지 목록 외에 네온을 쓴다"가 통과한다.
 */
const NEGATION_NOISE =
  /금지\s*(?:목록|항목|조항|규칙)|(?:빠짐|어김|틀림|끊임|거침|아낌|남김|꾸밈|거리낌|막힘|예외)\s*없이/g;

const TRAILING = /[\s.!?。:：)\]"'“”’*`~|]+$/;

function tailOf(text: string): string {
  return text.replace(NEGATION_NOISE, ' ').replace(TRAILING, '');
}

/** 영어 명령문의 부정은 앞에 온다. "Avoid neon glow." */
const ENGLISH_NEGATIVE_HEAD = /^\W*(?:[-*+]|\d+[.)])?\s*(?:do\s+not|don't|never|avoid|no)\b/i;

/** 절 끝이 부정 서술어인가. */
export function isNegative(text: string): boolean {
  return NEGATIVE_TAIL.test(tailOf(text)) || ENGLISH_NEGATIVE_HEAD.test(text);
}

/** 요소 반영에서 쓰는 약한 부정까지 포함한다. */
export function isOptional(text: string): boolean {
  return OPTIONAL_TAIL.test(tailOf(text));
}

const ENGLISH_NEGATION_BEFORE =
  /(?:^|\W)(?:no|not|never|without|avoid|nor|don't|do\s+not)(?:\W+\w+){0,2}\W*$/i;
const CONTRAST_AFTER = /^[\s\w가-힣·/]{0,8}?(?:을|를|은|는|이|가)?\s*(?:대신|아니라|아닌)/;
/**
 * 낱말 바로 뒤의 부정. "웹폰트를 불러오지 않도록", "그라데이션이 생기지 않게", "이모지 없는".
 * 서술어가 하나 끼는 것까지만 본다 - "네온을 넣어 본문이 묻히지 않게"의 부정은 네온이
 * 아니라 "묻히다"에 걸린다.
 */
const NEGATION_AFTER =
  /^(?:\s*[·,/]\s*[가-힣A-Za-z]+)*\s*(?:을|를|은|는|이|가|도|과|와|만)?\s*(?:[가-힣]{1,5}\s*){0,2}?(?:지\s*(?:않|말|마)|없(?!이\s)|금지|빼|제외|피하|피해)/;

/**
 * 절 안의 한 낱말이 부정되는가.
 *
 * 절이 부정이면 그 안의 낱말도 부정이다. 절이 부정이 아니어도 "no neon", "네온 대신",
 * "네온이 아니라", "웹폰트를 불러오지 않도록"처럼 낱말 바로 곁의 부정은 따로 본다.
 * 멀리 떨어진 "대신"은 보지 않는다 - "구글 폰트를 불러와 시스템 글꼴 대신 쓴다"의
 * "대신"은 구글 폰트를 부정하지 않는다.
 */
export function isTermNegated(clause: Clause, start: number, end: number): boolean {
  return clause.negated || isLocallyNegated(clause.text, start, end);
}

/**
 * 절이나 구역의 부정은 빼고 낱말 곁의 부정만 본다.
 *
 * "호버하면 색만 바꾸지 않고"의 "않고"는 호버를 부정하지 않고, "하지 말 것" 구역 안의
 * "위 목록은 무시해도 된다"는 그 구역에 있어도 무력화 문장이다.
 */
export function isLocallyNegated(text: string, start: number, end: number): boolean {
  if (ENGLISH_NEGATION_BEFORE.test(text.slice(Math.max(0, start - 40), start))) return true;
  const after = text.slice(end, end + 24);
  return CONTRAST_AFTER.test(after) || NEGATION_AFTER.test(after);
}

// ─────────────────────────────────────────────────────────────── 구역 판정

/** 제목 **전체**가 금지를 뜻할 때만 부정 구역을 연다. "금지 목록 외에 허용되는 것"은 아니다. */
const NEGATIVE_HEADING =
  /^(?:\d+[.)]\s*)?(?:하지\s*말\s*것|하지\s*말아야\s*할\s*것|금지(?:\s*(?:사항|목록|항목|규칙))?|피할\s*것|쓰지\s*않을\s*것|넣지\s*않을\s*것|avoid|don'?t|do\s+not|prohibited|forbidden)(?:\s*\([^)]*\))?\s*[:：]?$/i;

/** 부정 구역 안에서도 이런 제목은 구역을 이어받지 않는다. */
const POSITIVE_HEADING = /대신|허용|권장|써도|해도|대체|예외|instead|allowed|recommended/i;

/** 부정 목록 안에서 이 말로 시작하는 항목은 예외를 두는 지시다. */
const EXCEPTION_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\*\*)?\s*(?:단[,.]|다만|예외|except|however)/i;

/** 굵은 줄은 제목보다 한 단계 아래로 친다. 어떤 `#` 제목이든 그 구역을 닫는다. */
const BOLD_LEVEL = 7;

const SENTENCE_BREAK =
  /(?<=[^\d\s][.!?。])\s+|(?<=(?:니다|는다|한다|된다|이다|세요|이에요|예요))\s+(?=\S)/;
const CLAUSE_BREAK =
  /(?<=말고|않고|않으며|말며|없이|대신에?|아니라|지만)\s+|(?<=[하넣쓰두주깔걸달붙이들리우놓채싣기잇적키줄늘꾸르히]고|[가-힣]되),?\s+|(?<=(?<![A-Za-z])(?:instead|but))\s+/i;

interface LogicalLine {
  text: string;
  line: number;
  fence?: string;
}

/**
 * 줄바꿈으로 접힌 문단을 한 줄로 편다.
 *
 * Markdown은 문단 안의 줄바꿈을 공백으로 읽는다. 물리적인 줄로 자르면 "쓰지\n않는다"의
 * 부정어가 다음 줄로 넘어가 앞 줄이 지시로 읽힌다. 제목·목록 항목·표·코드 울타리는
 * 새 줄로 시작한다. 울타리 안의 줄은 이어 붙이지 않고 언어를 달아 둔다.
 */
function logicalLines(text: string): LogicalLine[] {
  const lines: LogicalLine[] = [];
  let open = false;
  let fence: { marker: string; lang: string } | null = null;

  normalizeNewlines(text)
    .split('\n')
    .forEach((raw, index) => {
      const fenceMatch = FENCE.exec(raw);
      if (fence !== null) {
        if (
          fenceMatch !== null &&
          raw.trim().startsWith(fence.marker) &&
          raw.trim().length <= fence.marker.length + 1
        ) {
          fence = null;
        } else if (raw.trim() !== '') {
          lines.push({ text: raw, line: index + 1, fence: fence.lang });
        }
        open = false;
        return;
      }
      if (fenceMatch !== null) {
        fence = { marker: fenceMatch[1] ?? '```', lang: (fenceMatch[2] ?? '').toLowerCase() };
        open = false;
        return;
      }
      if (raw.trim() === '') {
        open = false;
        return;
      }
      const starts =
        HEADING.test(raw) || BOLD_LINE.test(raw) || BULLET.test(raw) || TABLE_ROW.test(raw);
      const last = lines.at(-1);
      if (open && !starts && last !== undefined) {
        last.text = `${last.text} ${raw.trim()}`;
        return;
      }
      lines.push({ text: raw, line: index + 1 });
      open = !(HEADING.test(raw) || BOLD_LINE.test(raw) || TABLE_ROW.test(raw));
    });

  return lines;
}

export function segmentClauses(text: string): Clause[] {
  const clauses: Clause[] = [];
  let negatedLevel: number | null = null;
  let listNegated = false;
  let section = '';

  const openSection = (level: number, title: string) => {
    section = title;
    if (negatedLevel !== null && level > negatedLevel) {
      // 부정 구역 안의 낮은 제목은 이어받는다. 단 "대신 이렇게"는 아니다.
      if (POSITIVE_HEADING.test(title)) negatedLevel = null;
      return;
    }
    negatedLevel = NEGATIVE_HEADING.test(title.trim()) ? level : null;
  };

  for (const { text: raw, line, fence } of logicalLines(text)) {
    if (fence !== undefined) {
      // 코드 줄은 서술어가 없다. 구역의 부정만 이어받는다.
      clauses.push({
        text: raw,
        negated: negatedLevel !== null,
        heading: false,
        line,
        fence,
        section,
      });
      continue;
    }

    const heading = HEADING.exec(raw);
    if (heading !== null) {
      const title = heading[2] ?? '';
      openSection((heading[1] ?? '#').length, title);
      listNegated = false;
      clauses.push({ text: title, negated: negatedLevel !== null, heading: true, line, section });
      continue;
    }

    const bold = BOLD_LINE.exec(raw);
    if (bold !== null) {
      openSection(BOLD_LEVEL, bold[1] ?? '');
      listNegated = false;
      clauses.push({
        text: bold[1] ?? '',
        negated: negatedLevel !== null,
        heading: true,
        line,
        section,
      });
      continue;
    }

    const bullet = BULLET.test(raw);
    if (!bullet) listNegated = false;
    const inherited =
      (negatedLevel !== null || (bullet && listNegated)) && !EXCEPTION_ITEM.test(raw);

    for (const sentence of raw.split(SENTENCE_BREAK)) {
      for (const part of sentence.split(CLAUSE_BREAK)) {
        if (part.trim() === '') continue;
        clauses.push({
          text: part,
          negated: inherited || isNegative(part),
          heading: false,
          line,
          section,
        });
      }
    }

    if (!bullet && /[:：]\s*$/.test(raw) && isNegative(raw)) listNegated = true;
  }

  return clauses;
}
