import { describe, expect, it } from 'vitest';

import {
  isNegative,
  isOptional,
  isTermNegated,
  normalizeNewlines,
  removeAll,
  segmentClauses,
} from '@/features/evaluate/text.ts';

/**
 * 기준: 하네스 P8 할 일 3.
 *
 * 채점기는 금지 기법의 **이름**이 나오는지가 아니라 그것을 **지시하는지**를 본다.
 * 좋은 프롬프트일수록 "네온을 쓰지 않는다"처럼 이름을 많이 적기 때문이다.
 */

const positive = (text: string) =>
  segmentClauses(text)
    .filter((clause) => !clause.negated)
    .map((clause) => clause.text.trim());

describe('줄바꿈', () => {
  it('CRLF와 CR을 LF로 맞춘다', () => {
    expect(normalizeNewlines('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('문자열을 정규식 특수 문자와 무관하게 모두 지운다', () => {
    expect(removeAll('a (b) a (b)', ['(b)'])).toBe('a  a ');
  });
});

describe('부정 문맥', () => {
  it('절 끝의 부정 서술어를 알아본다', () => {
    expect(isNegative('네온 글로우를 쓰지 않는다.')).toBe(true);
    expect(isNegative('그라데이션은 금지 사항입니다.')).toBe(true);
    expect(isNegative('웹폰트는 필요 없다.')).toBe(true);
    expect(isNegative('**비교표**는 두지 마.')).toBe(true);
    expect(isNegative('Avoid neon glow.')).toBe(true);
    expect(isNegative('네온 글로우를 넣는다.')).toBe(false);
  });

  it('"없이"는 절을 끊어 앞 조각만 부정한다', () => {
    expect(positive('그라데이션 없이 단색으로 칠한다.')).toEqual(['단색으로 칠한다.']);
  });

  it.each([
    ['완곡 표현', '과하지 않게 은은한 네온 글로우를 제목 글자에 넣어 줍니다.'],
    ['목적 어미', '본문이 묻히는 일이 없도록 제목에만 네온 글로우를 둘러 줍니다.'],
    ['관형어', '페이지 전체에 이음매 없는 그라데이션 배경을 깝니다.'],
    ['범위 한정', '429 안내를 제외한 모든 제목 글자에 네온 글로우를 넣습니다.'],
  ])('부정어가 절 안에 있어도 서술어가 긍정이면 지시다 - %s', (_, sentence) => {
    // P8 적대 검증에서 이 꼴이 모두 채점기를 빠져나갔다.
    expect(isNegative(sentence)).toBe(false);
  });

  it('"넣고"에서 끊어 뒤의 부정이 앞의 지시를 덮지 않게 한다', () => {
    expect(positive('네온 글로우는 제목에만 넣고 본문에는 넣지 않습니다.')).toEqual([
      '네온 글로우는 제목에만 넣고',
    ]);
  });

  it('"대신"과 "아니라"는 바로 앞 낱말만 부정한다', () => {
    const [clause] = segmentClauses('구글 폰트에서 글꼴을 불러와 시스템 글꼴 대신 씁니다.');
    expect(clause!.negated).toBe(false);
    const near = segmentClauses('그라데이션 대신 단색을 쓴다.')[0]!;
    expect(isTermNegated(near, 0, '그라데이션'.length)).toBe(true);
    const far = segmentClauses('구글 폰트에서 글꼴을 불러와 시스템 글꼴 대신 씁니다.')[0]!;
    expect(isTermNegated(far, 0, '구글 폰트'.length)).toBe(false);
  });

  it('영어 부정은 낱말 바로 앞에서만 본다', () => {
    const [clause] = segmentClauses('headings get a glowing outline, no underline');
    expect(
      isTermNegated(clause!, clause!.text.indexOf('glow'), clause!.text.indexOf('glow') + 4),
    ).toBe(false);
    const [without] = segmentClauses('use cards without any glow');
    const at = without!.text.indexOf('glow');
    expect(isTermNegated(without!, at, at + 4)).toBe(true);
  });

  it('"금지 목록"과 "빠짐없이", "예외 없이"는 부정이 아니다', () => {
    expect(isNegative('금지 목록과 별개로 네온을 넣는다.')).toBe(false);
    expect(positive('모든 제목에 빠짐없이 네온을 넣는다.')).toContain('네온을 넣는다.');
  });

  it('선택 사항과 "넘어가도 된다"는 약한 부정이다', () => {
    expect(isOptional('비교표는 선택 사항입니다.')).toBe(true);
    expect(isOptional('공간이 부족하면 넘어가도 됩니다.')).toBe(true);
    expect(isOptional('비교표를 만든다.')).toBe(false);
  });

  it('앞 절의 부정이 뒤 절의 지시를 가리지 않는다', () => {
    const clauses = positive('네온은 쓰지 말고 대신 제목에 글로우를 크게 넣는다.');
    expect(clauses).toContain('제목에 글로우를 크게 넣는다.');
    expect(clauses.some((clause) => clause.includes('네온'))).toBe(false);
  });

  it('쉼표에서 끊지 않는다 - 끊으면 나열한 금지 문장이 위반이 된다', () => {
    expect(positive('네온, 글로우, 그라데이션은 쓰지 않는다.')).toEqual([]);
  });

  it('제목 전체가 금지를 뜻할 때만 부정 구역을 연다', () => {
    const text = '## 금지 목록 외에 허용되는 효과\n\n- 제목에 네온을 넣는다.';
    expect(positive(text)).toEqual(['금지 목록 외에 허용되는 효과', '- 제목에 네온을 넣는다.']);
  });

  it('부정 구역 안이라도 "대신 이렇게" 제목은 이어받지 않는다', () => {
    const text = '## 하지 말 것\n\n- 네온\n\n### 대신 이렇게 합니다\n\n- 제목에 네온을 넣는다.';
    expect(positive(text)).toEqual(['대신 이렇게 합니다', '- 제목에 네온을 넣는다.']);
  });

  it('부정 목록 안의 "단," 항목은 예외를 두는 지시다', () => {
    const text = '다음은 쓰지 않는다:\n\n- 네온\n- 단, 제목에는 네온을 넣는다.';
    expect(positive(text)).toEqual(['- 단, 제목에는 네온을 넣는다.']);
  });

  it('부정어가 있어도 긍정 서술어로 끝나는 머리 줄은 목록을 부정하지 않는다', () => {
    const text =
      '배경을 칠하지 않고 아래 효과만으로 눈에 띄게 합니다:\n\n- 테두리에 네온을 두른다.';
    expect(positive(text)).toContain('- 테두리에 네온을 두른다.');
  });

  it('코드 울타리의 줄에 언어를 달아 둔다', () => {
    const [clause] = segmentClauses('```bash\npg_restore -j 4\n```');
    expect(clause).toMatchObject({ text: 'pg_restore -j 4', fence: 'bash' });
  });

  it('부정 제목 아래 구역 전체와 그 아래 낮은 제목이 부정이다', () => {
    const text = [
      '## 하지 말 것',
      '- 네온',
      '### 색',
      '- 그라데이션',
      '## 보일 방식',
      '- 모노톤',
    ].join('\n');
    expect(positive(text)).toEqual(['보일 방식', '- 모노톤']);
  });

  it('굵은 글씨만으로 된 부정 제목도 구역을 연다', () => {
    expect(positive('**금지**\n\n- 네온\n\n## 담을 것\n\n- 표')).toEqual(['담을 것', '- 표']);
  });

  it('부정으로 끝나는 머리 줄 뒤의 목록이 부정이다', () => {
    const text = '다음은 쓰지 않는다:\n\n- 네온\n- 글로우\n\n본문은 16px로 둔다.';
    expect(positive(text)).toEqual(['본문은 16px로 둔다.']);
  });

  it('줄바꿈으로 접힌 문단을 한 줄로 읽는다', () => {
    // 물리적인 줄로 자르면 첫 줄에 부정어가 없어 지시로 읽힌다.
    expect(positive('제목 글자에 네온 효과를 쓰지\n않는다.')).toEqual([]);
  });

  it('제목·목록·표·울타리는 앞 줄에 붙지 않는다', () => {
    const clauses = segmentClauses('문단이다\n## 제목\n- 항목\n| 표 |\n```\n코드\n```');
    expect(clauses.map((clause) => clause.text.trim())).toEqual([
      '문단이다',
      '제목',
      '- 항목',
      '| 표 |',
      '코드',
    ]);
  });
});
