/**
 * 프롬프트 채점기. **기계적 검사만** 한다.
 *
 * 기준: 하네스 P8 할 일 3, DoD 1·2·3. 제품정의 §5.1·§6.2, §8 INV-04·INV-06.
 * 채점 자동화 범위: 2026-09-15 사용자 확정 - AI 채점은 쓰지 않고, 붙일 자리만
 * `docs/HowSheet_v2_평가_AI채점_가이드.md`에 적는다.
 *
 * ## 무엇이든 채점한다
 *
 * 입력은 프롬프트 텍스트와 그것을 만든 작업 문서다. 템플릿이 만든 것인지 AI가
 * 쓴 것인지 묻지 않는다. 템플릿 출력에만 맞춘 검사(요구 문구가 그대로 있는가)는
 * AI 출력을 채점하지 못하고, 그러면 이 평가셋이 지켜야 할 쪽을 지키지 못한다.
 *
 * ## 판정은 통과·실패 둘뿐이다
 *
 * 점수를 매기지 않는다. 점수는 "몇 점이면 되는가"를 다시 정해야 하고, 그 사이에
 * 나쁜 프롬프트가 "그래도 80점"으로 통과한다. (하네스 P8 DoD 5)
 *
 * ## 무엇을 못 보는가
 *
 * 한국어로만 쓴 꾸민 사실, 동의어로 돌려 말한 금지 기법, 자료의 엉뚱한 부분을
 * 가리키는 지시 같은 **뜻**의 문제는 보지 못한다. P8 적대 검증에서 확인한 목록이
 * `artifacts/qa/phase-reports/P8.md`에 있고, AI 채점 가이드 §2가 그 자리를 맡는다.
 */

import { OUTPUT_REQUIREMENTS, PROHIBITIONS } from '../../domain/prompt.rules.ts';
import { DEFAULT_DESIGN } from '../../domain/spec.defaults.ts';
import { DESIGN_AXES, ELEMENTS, ELEMENT_IDS, type ElementId } from '../../domain/spec.types.ts';
import { STUDIO_DOCUMENT_VERSION, type StudioDocument } from '../../domain/studio.types.ts';
import { MAX_SOURCE_CHARACTERS, composePrompt } from '../compose/compose.ts';
import { buildSystemPrompt, buildUserMessage } from '../synthesize/system-prompt.ts';
import {
  FACT_KIND_LABELS,
  createBasis,
  extractClaimedQuotes,
  extractFacts,
  isSupported,
  type FactBasis,
  type FactCandidate,
} from './facts.ts';
import {
  ANSWER_INSTEAD,
  ELEMENT_KEYWORDS,
  EMOJI,
  EMOJI_LIKE,
  EMOJI_WORD,
  FONT_CATEGORIES,
  HEADING_WORD,
  HOVER_EFFECT,
  HOVER_TRIGGER,
  NAMED_FONTS,
  OUTPUT_REQUIREMENT_GROUPS,
  PROHIBITED_TERMS,
  PROHIBITION_DISABLING,
  PROHIBITION_EXCEPTION,
  PROHIBITION_REFERENCE,
  REQUIREMENT_CLAUSE,
  REQUIREMENT_SECTION,
  SOURCE_DISTRUST_CLAIM,
  SOURCE_DISTRUST_COMMAND,
  SOURCE_REFERENCE,
  STYLING_SUFFIX,
  type ProhibitionCategory,
  type Term,
} from './lexicon.ts';
import {
  isLocallyNegated,
  isOptional,
  isTermNegated,
  normalizeNewlines,
  removeAll,
  segmentClauses,
  type Clause,
} from './text.ts';

export const CHECK_IDS = [
  'prohibitions-present',
  'prohibited-instruction',
  'output-requirements',
  'elements-reflected',
  'unchosen-element',
  'source-quoted',
  'unsupported-fact',
  'not-a-page',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export const CHECK_LABELS: Readonly<Record<CheckId, string>> = {
  'prohibitions-present': '금지 목록이 그대로, 유효하게 실렸다 (DoD 1, INV-06)',
  'prohibited-instruction': '금지 기법을 지시하지 않는다 (DoD 1)',
  'output-requirements': '결과물 요구 4종을 말하고 풀어 주지 않는다 (§6.2-5)',
  'elements-reflected': '고른 요소가 모두 반영됐다 (DoD 2)',
  'unchosen-element': '고르지 않은 요소의 지시가 없다',
  'source-quoted': '자료 원문을 그대로 인용하고 뒤집지 않는다 (DoD 3)',
  'unsupported-fact': '자료에 없는 사실이 없다 (DoD 3)',
  'not-a-page': '페이지가 아니라 프롬프트다 (INV-04)',
};

export interface Finding {
  check: CheckId;
  category?: ProhibitionCategory;
  message: string;
  /** 문제가 된 절이나 줄. 보고서에서 사람이 바로 찾아가게 한다. */
  excerpt?: string;
}

export interface GradeInput {
  text: string;
  studio: StudioDocument;
  /** 조립기가 쓴 자료 상한. 잘린 프롬프트를 채점할 때 필요하다. */
  maxSourceCharacters?: number;
}

export interface GradeResult {
  passed: boolean;
  findings: Finding[];
  /**
   * 실제로 들여다본 양. 절이나 사실 후보가 0이면 검사가 텍스트를 보지 못한
   * 것이다. 평가셋 실행기가 합계로 공허 여부를 판정한다.
   */
  measured: { clauses: number; facts: number };
}

// ──────────────────────────────────────────────────────────── 규칙 문구

let corpusCache: FactBasis | undefined;

/**
 * 제품이 스스로 쓰는 문구 전체의 사실 바탕.
 *
 * 여기 나오는 숫자·이름은 자료에 대한 주장이 아니다. 조립기 골격, 요소·디자인
 * 요구, 금지·요구 목록, AI에게 주는 지시가 모두 들어간다. 숫자는 단위까지 같아야
 * 근거로 친다 - "## 3."의 3이 "노드 3대"를 허락하지 않게.
 */
export function ruleBasis(): FactBasis {
  if (corpusCache === undefined) {
    const skeleton = (elements: ElementId[]): StudioDocument => ({
      version: STUDIO_DOCUMENT_VERSION,
      source: '',
      elements,
      design: DEFAULT_DESIGN,
      updatedAt: '',
    });
    corpusCache = createBasis(
      [
        ...PROHIBITIONS,
        ...OUTPUT_REQUIREMENTS,
        ...ELEMENTS.flatMap((element) => [element.label, element.hint, element.requirement]),
        ...DESIGN_AXES.flatMap((axis) => [
          axis.label,
          axis.hint,
          ...axis.options.flatMap((option) => [option.label, option.requirement]),
        ]),
        composePrompt(skeleton([])).text,
        composePrompt(skeleton([...ELEMENT_IDS])).text,
        buildSystemPrompt(),
        buildUserMessage(''),
      ],
      true,
    );
  }
  return corpusCache;
}

/** 코드 울타리 중 결과물 방법을 보여 주는 언어. 나머지 울타리의 줄은 자료에 있어야 한다. */
const STYLE_FENCES = new Set(['css', 'html', 'svg', 'xml', 'markdown', 'md']);

// ─────────────────────────────────────────────────────────── 자료 인용

export interface ExpectedQuote {
  /** 프롬프트에 그대로 있어야 하는 원문. 앞뒤 공백을 걷었다. */
  core: string;
  total: number;
  included: number;
}

export function expectedQuote(source: string, limit = MAX_SOURCE_CHARACTERS): ExpectedQuote {
  const characters = [...normalizeNewlines(source)];
  const included = Math.min(characters.length, limit);
  return {
    core: characters.slice(0, included).join('').trim(),
    total: characters.length,
    included,
  };
}

function firstMissingLine(text: string, core: string): string | undefined {
  return core.split('\n').find((line) => line.trim() !== '' && !text.includes(line));
}

const numberPattern = (count: number) =>
  `(?:${count.toLocaleString('ko-KR').replace(/,/g, ',?')}|${count})`;

function checkSource(text: string, source: string, limit: number, out: Finding[]) {
  const quote = expectedQuote(source, limit);
  if (quote.core === '') return { quote, at: -1 };

  const at = text.indexOf(quote.core);
  if (at === -1) {
    const missing = firstMissingLine(text, quote.core);
    out.push({
      check: 'source-quoted',
      message: '자료 원문이 그대로 인용돼 있지 않다',
      ...(missing === undefined ? {} : { excerpt: missing }),
    });
    return { quote, at };
  }

  // 울타리 안에 자료 말고 다른 것이 들어 있으면 그것도 자료로 읽힌다.
  const before = text.slice(0, at);
  const after = text.slice(at + quote.core.length);
  const opened = /(?:^|\n)[ \t]*(?:`{3,}|~{3,})[^\n]*\n$/.test(before);
  const closed = /^\s*\n[ \t]*(?:`{3,}|~{3,})/.test(after);
  // 앞에 열린 채 닫히지 않은 울타리가 있으면 자료는 그 울타리 한가운데에 있다.
  const insideFence =
    before.split('\n').filter((line) => /^[ \t]*(?:`{3,}|~{3,})/.test(line)).length % 2 === 1;
  if (opened !== closed || (!opened && insideFence)) {
    out.push({
      check: 'source-quoted',
      message: '자료를 담은 울타리 안에 자료가 아닌 내용이 섞여 있다',
    });
  }

  if (quote.included < quote.total) {
    const notice = new RegExp(
      `${numberPattern(quote.total)}\\s*자[^\\n]{0,40}?${numberPattern(quote.included)}\\s*자`,
    );
    const line = text.split('\n').find((candidate) => notice.test(candidate)) ?? '';
    const honest =
      /잘렸|잘린|잘라|truncat/i.test(line) && !/없이\s*모두|모두\s*실었|거의\s*없/.test(line);
    if (!honest) {
      out.push({
        check: 'source-quoted',
        message: `자료가 잘렸는데 전체 ${quote.total}자 중 ${quote.included}자를 실었다고 밝히지 않았다`,
      });
    }
  }

  return { quote, at };
}

/** 자료 줄을 숫자만 바꿔 다시 적은 곳. 원본을 싣고 변조한 사본을 따로 두는 수법이다. */
function checkTamperedCopies(instruction: string, core: string, out: Finding[]) {
  const shape = (line: string) => line.trim().replace(/[\d,.]+/g, '#');
  const originals = new Map<string, string>();
  for (const line of core.split('\n')) {
    if (line.trim().length >= 12 && /\d/.test(line)) originals.set(shape(line), line.trim());
  }
  for (const line of instruction.split('\n')) {
    const original = originals.get(shape(line));
    if (original !== undefined && original !== line.trim()) {
      out.push({
        check: 'source-quoted',
        message: '자료의 줄을 숫자만 바꿔 다시 적었다',
        excerpt: line.trim(),
      });
      return;
    }
  }
}

// ─────────────────────────────────────────────────────────────── 채점

interface Hit {
  word: string;
  index: number;
}

const globalPatterns = new WeakMap<RegExp, RegExp>();

function globalOf(pattern: RegExp): RegExp {
  let global = globalPatterns.get(pattern);
  if (global === undefined) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    global = new RegExp(pattern.source, flags);
    globalPatterns.set(pattern, global);
  }
  return global;
}

/**
 * 모호한 말이 자료에 나오면 자료를 옮긴 것으로 본다. (`lexicon.ts` 머리말)
 *
 * @param local 절·구역의 부정은 빼고 낱말 곁의 부정만 볼 것인가.
 */
function hit(term: Term, clause: Clause, sourceLower: string, local = false): Hit | null {
  // 빠른 거절: 대부분의 절에는 아무 말도 없다.
  if (!term.pattern.test(clause.text)) return null;
  for (const match of clause.text.matchAll(globalOf(term.pattern))) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const styling = STYLING_SUFFIX.test(clause.text.slice(end));
    if (term.ambiguous && !styling && sourceLower.includes(match[0].toLowerCase())) continue;
    if (local ? isLocallyNegated(clause.text, index, end) : isTermNegated(clause, index, end))
      continue;
    return { word: match[0], index };
  }
  return null;
}

function checkProhibitedTerms(clauses: readonly Clause[], sourceLower: string, out: Finding[]) {
  // 호버의 계기와 결과가 한 줄의 다른 절에 있는 경우. "호버 상태가 되면 그림자를 진하게
  // 하고 행 전체를 두 배로 확대한다"는 "하고"에서 끊겨 절 하나만 봐서는 안 보인다.
  const hoverLines = new Set(
    clauses
      .filter(
        (clause) =>
          hit({ pattern: HOVER_TRIGGER, ambiguous: false }, clause, sourceLower, true) !== null,
      )
      .map((clause) => clause.line),
  );
  const motion = clauses.find(
    (clause) =>
      hoverLines.has(clause.line) &&
      hit({ pattern: HOVER_EFFECT, ambiguous: false }, clause, sourceLower) !== null,
  );
  if (motion !== undefined) {
    out.push({
      check: 'prohibited-instruction',
      category: 'motion',
      message: '호버에서 요소를 확대하거나 회전시키라고 한다',
      excerpt: motion.text.trim(),
    });
  }

  for (const clause of clauses) {
    for (const [category, terms] of Object.entries(PROHIBITED_TERMS)) {
      for (const term of terms) {
        const found = hit(term, clause, sourceLower);
        if (found === null) continue;
        out.push({
          check: 'prohibited-instruction',
          category: category as ProhibitionCategory,
          message: `금지 기법을 지시한다: "${found.word}"`,
          excerpt: clause.text.trim(),
        });
        break;
      }
    }
  }
}

const EMOJI_TERM: Term = { pattern: EMOJI, ambiguous: true };
const EMOJI_LIKE_TERM: Term = { pattern: EMOJI_LIKE, ambiguous: true };
const EMOJI_WORD_TERM: Term = { pattern: EMOJI_WORD, ambiguous: true };

function checkEmojiHeadings(clauses: readonly Clause[], sourceLower: string, out: Finding[]) {
  const report = (clause: Clause, message: string) =>
    out.push({
      check: 'prohibited-instruction',
      category: 'emoji-heading',
      message,
      excerpt: clause.text.trim(),
    });

  const lines = new Map<number, Clause[]>();
  for (const clause of clauses) {
    const group = lines.get(clause.line) ?? [];
    group.push(clause);
    lines.set(clause.line, group);
  }

  for (const group of lines.values()) {
    const first = group[0];
    if (first === undefined) continue;
    const decorative = (clause: Clause) => EMOJI.test(clause.text) || EMOJI_LIKE.test(clause.text);

    // 제목 자체의 그림 문자는 부정 구역 안에서도 위반이다. 그 제목이 본보기가 된다.
    const shown = group.find(
      (clause) =>
        (clause.heading ||
          /<h[1-6][^>]*>/i.test(clause.text) ||
          /\*\*\s*(?:\p{Extended_Pictographic}|[0-9#*]️?⃣)/u.test(clause.text)) &&
        decorative(clause),
    );
    if (shown !== undefined) {
      report(shown, '제목에 이모지가 있다');
      continue;
    }

    // 같은 줄에서 제목을 말하고 이모지를 붙이라고 하면 위반이다. 문장이 둘로 나뉘어도 본다.
    if (!group.some((clause) => HEADING_WORD.test(clause.text))) continue;
    const told = group.find(
      (clause) =>
        hit(EMOJI_TERM, clause, sourceLower) !== null ||
        hit(EMOJI_LIKE_TERM, clause, sourceLower) !== null ||
        hit(EMOJI_WORD_TERM, clause, sourceLower) !== null,
    );
    if (told !== undefined) report(told, '제목에 이모지를 붙이라고 지시한다');
  }
}

function checkFontMixing(clauses: readonly Clause[], sourceLower: string, out: Finding[]) {
  const seen = new Map<string, string>();
  for (const clause of clauses) {
    for (const [category, term] of Object.entries(FONT_CATEGORIES)) {
      if (hit(term, clause, sourceLower) !== null) seen.set(category, clause.text.trim());
    }
    for (const named of NAMED_FONTS) {
      if (hit({ pattern: named.pattern, ambiguous: true }, clause, sourceLower) !== null) {
        seen.set(named.category, clause.text.trim());
      }
    }
  }
  if (seen.size >= 3) {
    out.push({
      check: 'prohibited-instruction',
      category: 'font-mixing',
      message: `제목·본문 폰트 계열을 ${seen.size}가지 지시한다: ${[...seen.keys()].join(', ')}`,
      excerpt: [...new Set(seen.values())].join(' / '),
    });
  }
}

/** 금지 목록이 있어도 무력화된 경우. 주석·울타리·취소선 안에 있거나, 예외·무시가 붙었다. */
function checkProhibitionsLive(
  instruction: string,
  clauses: readonly Clause[],
  sourceLower: string,
  out: Finding[],
) {
  const visible = instruction
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\1[^\n]*/g, '\n')
    .replace(/~~[^~\n]+~~/g, ' ');

  for (const item of PROHIBITIONS.filter((candidate) => !visible.includes(candidate))) {
    out.push({
      check: 'prohibitions-present',
      message: '금지 항목이 그대로 실려 있지 않다',
      excerpt: item,
    });
  }

  for (const line of visible.split('\n')) {
    const item = PROHIBITIONS.find((candidate) => line.includes(candidate));
    if (item === undefined) continue;
    const rest = line.split(item).join(' ');
    if (PROHIBITION_EXCEPTION.test(rest) || /해제|무시/.test(rest)) {
      out.push({
        check: 'prohibitions-present',
        message: '금지 항목에 예외나 해제를 붙였다',
        excerpt: line.trim(),
      });
    }
  }

  const itemSections = new Set(
    clauses
      .filter((clause) => PROHIBITIONS.some((item) => clause.text.includes(item.slice(0, 12))))
      .map((clause) => clause.section),
  );
  const disablingTerm: Term = { pattern: PROHIBITION_DISABLING, ambiguous: true };
  for (const clause of clauses) {
    if (clause.fence !== undefined) continue;
    // 목록을 가리키며 무력화하는 문장, 또는 목록이 든 구역의 제목이 "참고"라고 하는 경우.
    const disabling =
      (PROHIBITION_REFERENCE.test(clause.text) &&
        hit(disablingTerm, clause, sourceLower, true) !== null) ||
      (clause.heading &&
        itemSections.has(clause.text) &&
        /참고|이전\s*버전|예시|적용\s*안/.test(clause.text));
    if (disabling) {
      out.push({
        check: 'prohibitions-present',
        message: '금지 목록을 따르지 않아도 된다고 한다',
        excerpt: clause.text.trim(),
      });
      return;
    }
  }
}

function checkOutputRequirements(scanned: string, clauses: readonly Clause[], out: Finding[]) {
  // "320px에서 가로 스크롤이 생기지 않아야 한다"가 바로 그 요구라서 부정을 가리지 않는다.
  for (const group of OUTPUT_REQUIREMENT_GROUPS) {
    if (!group.pattern.test(scanned)) {
      out.push({
        check: 'output-requirements',
        message: `결과물 요구를 말하지 않는다: ${group.label}`,
      });
    }
  }
  // 풀어 주는 말은 절이 끊겨도 한 줄 안에서 본다. "외부 요청이 있어도 괜찮고 오프라인은 요구하지 않는다".
  const lines = new Map<number, string>();
  for (const clause of clauses) {
    if (clause.fence !== undefined) continue;
    lines.set(clause.line, `${lines.get(clause.line) ?? ''} ${clause.text}`);
  }
  for (const group of OUTPUT_REQUIREMENT_GROUPS) {
    for (const line of lines.values()) {
      if (!group.relaxation.test(line)) continue;
      out.push({
        check: 'output-requirements',
        message: `결과물 요구를 풀어 준다: ${group.label}`,
        excerpt: line.trim(),
      });
      break;
    }
  }
}

/** 요소 지시로 셀 수 있는 절인가. 결과물 요구와 제목은 요소를 담지 않는다. */
function isInstructionClause(clause: Clause): boolean {
  return (
    clause.fence === undefined &&
    !REQUIREMENT_SECTION.test(clause.section) &&
    !REQUIREMENT_CLAUSE.test(clause.text)
  );
}

function checkElements(
  studio: StudioDocument,
  instruction: string,
  clauses: readonly Clause[],
  out: Finding[],
) {
  const candidates = clauses.filter(isInstructionClause);
  const substantive = (clause: Clause, keyword?: RegExp) =>
    (keyword === undefined ? clause.text : clause.text.replace(keyword, '')).replace(
      /[\s*_\-:：.,()[\]0-9·|]/g,
      '',
    ).length >= 4;
  const names = (clause: Clause, keyword: RegExp) => {
    const match = keyword.exec(clause.text);
    return (
      match !== null &&
      !isOptional(clause.text) &&
      !isTermNegated(clause, match.index, match.index + match[0].length)
    );
  };

  for (const id of studio.elements) {
    const keyword = ELEMENT_KEYWORDS[id];
    const reflected = candidates.some((clause) => {
      if (!names(clause, keyword)) return false;
      // 제목으로 요소를 세우고("### 다이어그램") 그 아래에서 무엇을 담을지 말하는 꼴.
      // 문서 제목 "# 한 페이지 문서 (다이어그램 · 비교표)"는 요소를 세운 제목이 아니다.
      if (clause.heading) {
        const rest = clause.text.replace(keyword, '').replace(/[^가-힣A-Za-z]/g, '');
        if (rest.length > 8) return false;
        return candidates.some(
          (child) =>
            child.section === clause.text && !child.heading && !child.negated && substantive(child),
        );
      }
      // 이름만 적힌 줄("2. **코드 블럭**")은 무엇을 담을지 말하지 않는다.
      return substantive(clause, keyword);
    });
    if (!reflected) {
      const label = ELEMENTS.find((element) => element.id === id)?.label ?? id;
      out.push({ check: 'elements-reflected', message: `고른 요소가 없다: ${label}` });
    }
  }

  // 아무것도 고르지 않았으면 AI가 자료를 보고 정한다. (제품정의 §4)
  if (studio.elements.length === 0) return;

  for (const element of ELEMENTS) {
    if (studio.elements.includes(element.id)) continue;
    const keyword = ELEMENT_KEYWORDS[element.id];
    const verbatim = instruction.includes(element.requirement);
    const itemized = candidates.find((clause) => {
      const match = keyword.exec(clause.text);
      if (match === null || isTermNegated(clause, match.index, match.index + match[0].length)) {
        return false;
      }
      // 목록 항목이나 제목으로 **그 요소를 세운** 곳만 본다. 지나가며 이름을 말한 곳은 아니다.
      // "복구 흐름 다이어그램 (순서도)"처럼 고른 요소를 함께 부르는 제목은 고른 요소의 구역이다.
      const lead = clause.text.slice(0, match.index);
      const alsoChosen = studio.elements.some((chosen) =>
        ELEMENT_KEYWORDS[chosen].test(clause.text),
      );
      return !alsoChosen && (clause.heading || /^\s*(?:[-*+]|\d+[.)])\s*(?:\*\*)?\s*$/.test(lead));
    });
    if (verbatim || itemized !== undefined) {
      out.push({
        check: 'unchosen-element',
        message: `고르지 않은 요소의 지시가 있다: ${element.label}`,
        excerpt: itemized?.text.trim() ?? element.requirement,
      });
    }
  }
}

function checkFacts(
  instruction: string,
  clauses: readonly Clause[],
  bases: readonly FactBasis[],
  out: Finding[],
): number {
  let count = 0;
  const reported = new Set<string>();
  const judge = (fact: FactCandidate, excerpt: string) => {
    count += 1;
    const key = `${fact.kind}:${fact.value}:${fact.unit ?? ''}`;
    if (bases.some((basis) => isSupported(fact, basis)) || reported.has(key)) return;
    reported.add(key);
    out.push({
      check: 'unsupported-fact',
      message: `자료에 없는 ${FACT_KIND_LABELS[fact.kind]}: ${fact.value}${fact.unit ?? ''}`,
      excerpt,
    });
  };

  for (const clause of clauses) {
    if (clause.fence === 'css') continue;
    if (
      clause.fence !== undefined &&
      !STYLE_FENCES.has(clause.fence) &&
      !/[가-힣]/.test(clause.text)
    ) {
      // 명령·설정 울타리의 줄은 통째로 자료에 있어야 한다. 명령을 지어내면 여기서 걸린다.
      // 한글이 든 줄은 페이지 개요 같은 글이라 아래에서 글로 본다.
      const line = clause.text.trim();
      if (line.length >= 3) judge({ kind: 'code', value: line }, line);
      continue;
    }
    for (const fact of extractFacts(clause.text)) {
      // "MathJax 같은 라이브러리는 쓰지 않는다"의 이름은 주장이 아니다.
      if (fact.kind === 'name') {
        const at = clause.text.indexOf(fact.value);
        if (at !== -1 && isTermNegated(clause, at, at + fact.value.length)) continue;
      }
      judge(fact, clause.text.trim());
    }
  }
  for (const quote of extractClaimedQuotes(instruction)) judge(quote, quote.value);
  return count;
}

function checkSourceTrust(clauses: readonly Clause[], sourceLower: string, out: Finding[]) {
  for (const clause of clauses) {
    if (clause.fence !== undefined || !SOURCE_REFERENCE.test(clause.text)) continue;
    // 명령("읽지 말고")은 부정 문맥이어도, 주장("가상의 값")은 부정 문맥이 아닐 때만 본다.
    const match =
      SOURCE_DISTRUST_COMMAND.exec(clause.text) ??
      (clause.negated ? null : SOURCE_DISTRUST_CLAIM.exec(clause.text));
    if (match === null || sourceLower.includes(match[0].toLowerCase())) continue;
    out.push({
      check: 'source-quoted',
      message: '자료를 믿지 말거나 다른 값을 쓰라고 한다',
      excerpt: clause.text.trim(),
    });
    return;
  }
}

const PAGE_LINE = /(?:^|\n)[ \t]*(?:<!doctype\s+html|<html[\s>]|<\/html>|<body[\s>]|<\/body>)/i;

export function gradePrompt(input: GradeInput): GradeResult {
  const text = normalizeNewlines(input.text);
  const source = normalizeNewlines(input.studio.source);
  const sourceLower = source.toLowerCase();
  const limit = input.maxSourceCharacters ?? MAX_SOURCE_CHARACTERS;
  const findings: Finding[] = [];

  // ── 자료 원문 (DoD 3) ──────────────────────────────────────────────
  const { quote, at } = checkSource(text, source, limit, findings);

  // 여기서부터는 **지시문**만 본다. 자료 안의 "네온"이나 수치는 자료의 몫이다.
  const instruction =
    at === -1 ? text : `${text.slice(0, at)}\n${text.slice(at + quote.core.length)}`;
  if (quote.core !== '') checkTamperedCopies(instruction, quote.core, findings);

  // ── 페이지가 아니다 (INV-04) ───────────────────────────────────────
  if (PAGE_LINE.test(instruction) || ANSWER_INSTEAD.test(instruction)) {
    findings.push({ check: 'not-a-page', message: '프롬프트가 아니라 HTML 문서를 내놓았다' });
  }

  // ── 금지 목록 (DoD 1, INV-06) ──────────────────────────────────────
  const allClauses = segmentClauses(instruction);
  checkProhibitionsLive(instruction, allClauses, sourceLower, findings);

  // 금지 항목 자체는 금지 기법의 이름을 담고 있으므로 걷어 내고 본다.
  const scanned = removeAll(instruction, PROHIBITIONS);
  const clauses = segmentClauses(scanned);
  checkProhibitedTerms(clauses, sourceLower, findings);
  checkEmojiHeadings(clauses, sourceLower, findings);
  checkFontMixing(clauses, sourceLower, findings);

  // ── 결과물 요구 (§6.2-5) ───────────────────────────────────────────
  checkOutputRequirements(scanned, clauses, findings);

  // ── 요소 (DoD 2) ───────────────────────────────────────────────────
  checkElements(input.studio, instruction, clauses, findings);

  // ── 자료 충실도 (DoD 3) ────────────────────────────────────────────
  checkSourceTrust(clauses, sourceLower, findings);
  const sourceBasis = createBasis([
    source,
    // 잘림 안내의 숫자는 조립기가 센 것이다.
    `${quote.total}자 ${quote.included}자 ${quote.total - quote.included}자`,
  ]);
  const facts = checkFacts(scanned, clauses, [sourceBasis, ruleBasis()], findings);

  return {
    passed: findings.length === 0,
    findings,
    measured: { clauses: clauses.length, facts },
  };
}
