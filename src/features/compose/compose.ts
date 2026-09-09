/**
 * 템플릿 프롬프트 조립기.
 *
 * 기준: v2 제품정의 §6.3(키가 없을 때), §8 INV-02·INV-06. 하네스 P3 전부.
 *
 * 자료와 선택을 받아 **프롬프트 텍스트**를 만든다. 결과 페이지를 만들지 않는다.
 * (INV-04)
 *
 * ## 순수 함수다
 *
 * 시각도 난수도 쓰지 않는다. 같은 입력에서 언제나 같은 출력이 나온다. (DoD 3)
 * 그래야 P5의 AI 합성과 결과를 비교할 수 있고, 실패했을 때 같은 자리로 돌아올
 * 수 있다.
 *
 * ## 왜 키 없이도 도는가
 *
 * 키를 요구하는 첫 화면은 제품을 보여 주지 못한다. AI가 쓴 것만 못하지만, 이
 * 조립기만으로도 붙여넣어 쓸 수 있는 프롬프트가 나온다. (INV-02)
 */

import { PROHIBITIONS, OUTPUT_REQUIREMENTS } from '../../domain/prompt.rules.ts';
import { DESIGN_AXES, ELEMENTS } from '../../domain/spec.types.ts';
import type { StudioDocument } from '../../domain/studio.types.ts';

/**
 * 프롬프트에 실을 자료의 상한.
 *
 * 만든 프롬프트는 사용자가 Claude나 ChatGPT에 붙여넣는다. 자료가 길수록 거기서
 * 한 번에 받아 주지 못할 확률이 올라간다. 그래서 상한을 둔다.
 *
 * 넘으면 **자르되 반드시 밝힌다.** 조용히 자르는 것은 사용자가 모르게 자료를
 * 잃는 일이다. (하네스 P3 주의, DoD 6)
 */
export const MAX_SOURCE_CHARACTERS = 60_000;

export interface ComposeOptions {
  /** 자료 상한. 테스트와 P5가 바꾼다. */
  maxSourceCharacters?: number;
}

export interface ComposedPrompt {
  /** 사용자가 복사해 붙여넣는 프롬프트 전문. */
  text: string;
  /** 자료 전체 길이 (코드 포인트). */
  sourceCharacters: number;
  /** 그중 실제로 실린 길이. */
  includedCharacters: number;
  /** 잘렸는가. 화면이 이 값으로 안내한다. */
  truncated: boolean;
}

/**
 * 자료를 감쌀 울타리.
 *
 * 자료 안에 백틱 세 개가 들어 있으면 울타리가 거기서 닫혀, 자료의 뒷부분이
 * 프롬프트의 지시문으로 읽힌다. 자료에 나오는 가장 긴 백틱 줄보다 하나 길게
 * 잡는다.
 */
export function fenceFor(text: string): string {
  let longest = 0;
  let run = 0;
  for (const character of text) {
    if (character === '`') {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * 금지 목록 중 이 텍스트에 빠진 항목.
 *
 * P5가 AI 출력을 검사할 때 쓴다. AI가 빠뜨렸으면 조용히 통과시키지 않고
 * 조립기가 덧붙인다. (하네스 P5 DoD 4, 주의)
 */
export function missingProhibitions(text: string): string[] {
  return PROHIBITIONS.filter((item) => !text.includes(item));
}

function elementSection(chosen: readonly string[]): string {
  if (chosen.length === 0) {
    // 0개도 정상이다. 여기서 요소 목록을 늘어놓으면 "고르지 않은 요소의 지시가
    // 나타나지 않는다"는 약속이 깨진다. (DoD 5)
    return [
      '고를 요소를 지정하지 않았습니다. 자료를 읽고 어떤 표현이 그 내용에 맞을지 직접 정하세요.',
      '자료가 요구하지 않는 형식을 억지로 넣지 마세요.',
    ].join('\n');
  }

  return ELEMENTS.filter((element) => chosen.includes(element.id))
    .map((element) => `- **${element.label}** - ${element.requirement}`)
    .join('\n');
}

function designSection(design: StudioDocument['design']): string {
  return DESIGN_AXES.map((axis) => {
    const option = axis.options.find((candidate) => candidate.id === design[axis.id]);
    // 정규화를 거친 문서라면 여기서 undefined가 나오지 않는다. 그래도 나오면
    // 그 축을 빼고 나머지를 살린다. 프롬프트가 통째로 죽는 것보다 낫다.
    return option === undefined
      ? null
      : `- **${axis.label} - ${option.label}** - ${option.requirement}`;
  })
    .filter((line) => line !== null)
    .join('\n');
}

function sourceSection(
  source: string,
  limit: number,
): { body: string; included: number; total: number } {
  const characters = [...source];
  const total = characters.length;

  if (source.trim() === '') {
    // 빈 자료는 잘린 자료가 아니다. `included`를 0으로 두면 공백만 든 문서가
    // "잘렸다"고 보고되어 화면이 없는 손실을 알린다.
    return {
      body: '아직 자료를 붙여넣지 않았습니다. 이 프롬프트를 쓰기 전에 자료를 채우세요.',
      included: total,
      total,
    };
  }

  const included = Math.min(total, limit);
  const quoted = included === total ? source : characters.slice(0, included).join('');
  const fence = fenceFor(quoted);

  const notice =
    included === total
      ? []
      : [
          `> **주의: 자료가 잘렸습니다.** 전체 ${total.toLocaleString('ko-KR')}자 중 앞의 ` +
            `${included.toLocaleString('ko-KR')}자만 실었고 ` +
            `${(total - included).toLocaleString('ko-KR')}자가 빠져 있습니다. ` +
            '빠진 부분의 내용을 추측하지 마세요.',
          '',
        ];

  return { body: [...notice, fence, quoted, fence].join('\n'), included, total };
}

function numbered(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function bulleted(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

/**
 * 자료와 선택을 프롬프트 한 장으로 조립한다.
 *
 * 키가 없어도 돈다. 네트워크도 쓰지 않는다. (INV-02)
 */
export function composePrompt(
  studio: StudioDocument,
  options: ComposeOptions = {},
): ComposedPrompt {
  const limit = options.maxSourceCharacters ?? MAX_SOURCE_CHARACTERS;
  const source = sourceSection(studio.source, limit);

  const text = [
    '# 한 페이지 문서 만들기',
    '',
    '아래 **자료**를 읽고 그 내용을 한 페이지짜리 문서로 만들어 주세요.',
    '',
    '자료에 없는 사실을 지어내지 마세요. 근거가 없는 항목은 넣지 말고, 자료가 다루지 않는',
    '부분은 비워 두세요. 문서의 언어는 자료의 언어를 따릅니다.',
    '',
    '한 페이지 분량을 넘기지 마세요. 자료가 길면 요약하고, 덜 중요한 것을 덜어 내세요.',
    '',
    '## 1. 담을 것',
    '',
    elementSection(studio.elements),
    '',
    '## 2. 보일 방식',
    '',
    designSection(studio.design),
    '',
    '## 3. 결과물 요구사항',
    '',
    numbered(OUTPUT_REQUIREMENTS),
    '',
    '## 4. 하지 말 것',
    '',
    '아래는 예외 없이 지킵니다. 하나라도 어겼다면 고쳐서 다시 내세요.',
    '',
    bulleted(PROHIBITIONS),
    '',
    '## 5. 자료',
    '',
    source.body,
    '',
    '---',
    '',
    '완성한 HTML 파일 하나만 내놓으세요. 설명이나 사과를 덧붙이지 마세요.',
    '',
  ].join('\n');

  return {
    text,
    sourceCharacters: source.total,
    includedCharacters: source.included,
    truncated: source.included < source.total,
  };
}
