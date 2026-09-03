import { describe, expect, it } from 'vitest';

import {
  FILENAME_FALLBACK,
  FILENAME_MAX_LENGTH,
  guideFileName,
  safeFileName,
} from '@/utils/filename.ts';

/**
 * 하네스 M8 DoD 7 - 안전한 파일명.
 * 기준: 기술 백서 §4.3.5, §4.4.5.
 */

/**
 * 짝 없는 서로게이트. 뒤따르는 하위가 없는 상위, 또는 앞선 상위가 없는 하위.
 *
 * `String.isWellFormed`가 이 일을 하지만 lib이 es2024여야 한다. 이 저장소는
 * 그보다 낮게 고정돼 있고, 테스트 하나 때문에 컴파일 대상을 올리지 않는다.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
describe('safeFileName - 금지 문자 (§4.4.5)', () => {
  it('운영체제 금지 문자 9종을 모두 지운다', () => {
    // 하나씩 확인한다. 한 문자열에 몰아넣으면 정규식에서 하나가 빠져도
    // 나머지가 지워져 통과한다.
    for (const character of ['<', '>', ':', '"', '/', '\\', '|', '?', '*']) {
      expect(safeFileName(`a${character}b`)).toBe('ab');
    }
  });

  it('제어 문자를 지운다', () => {
    expect(safeFileName(`탭\t줄바꿈\n널${String.fromCharCode(0)}`)).toBe('탭-줄바꿈-널');
  });

  it('한글과 하이픈은 그대로 둔다', () => {
    expect(safeFileName('모바일 Discord 계정으로 PC 로그인 복구하기')).toBe(
      '모바일-Discord-계정으로-PC-로그인-복구하기',
    );
  });
});

describe('safeFileName - 공백과 가장자리 정리 (§4.4.5)', () => {
  it('연속 공백을 하이픈 하나로 접는다', () => {
    expect(safeFileName('a   b')).toBe('a-b');
  });

  it('금지 문자를 지운 자리에서 하이픈이 겹치지 않는다', () => {
    expect(safeFileName('a / b')).toBe('a-b');
  });

  it('연속 하이픈을 하나로 접는다', () => {
    expect(safeFileName('a---b')).toBe('a-b');
  });

  it('앞뒤의 점과 공백을 지운다', () => {
    expect(safeFileName('  ..이름..  ')).toBe('이름');
  });

  it('앞의 점을 지워 숨김 파일을 만들지 않는다', () => {
    expect(safeFileName('.gitignore')).toBe('gitignore');
  });
});

describe('safeFileName - 상한과 폴백 (§4.4.5)', () => {
  it('80자로 자른다', () => {
    expect(safeFileName('가'.repeat(200))).toHaveLength(FILENAME_MAX_LENGTH);
  });

  it('80자 이하는 그대로 둔다', () => {
    const name = '가'.repeat(FILENAME_MAX_LENGTH);
    expect(safeFileName(name)).toBe(name);
  });

  it('이모지를 반쪽으로 자르지 않는다', () => {
    // 이모지는 UTF-16 2단위다. slice로 자르면 짝 없는 서로게이트가 남는다.
    // 끝 문자가 서로게이트인지 보는 것으로는 판정할 수 없다 - 이모지로 끝나는
    // 정상 문자열도 하위 서로게이트로 끝난다. 짝이 맞는지를 봐야 한다.
    const cut = safeFileName('🙂'.repeat(200));
    expect([...cut]).toHaveLength(FILENAME_MAX_LENGTH);
    expect(cut).not.toMatch(LONE_SURROGATE);
  });

  it('자른 자리에 하이픈이 남지 않는다', () => {
    expect(safeFileName(`${'가'.repeat(FILENAME_MAX_LENGTH - 1)} 뒤`)).not.toMatch(/-$/);
  });

  it('빈 제목은 폴백을 쓴다', () => {
    expect(safeFileName('')).toBe(FILENAME_FALLBACK);
  });

  it('금지 문자만 있는 제목도 폴백을 쓴다', () => {
    expect(safeFileName('///???')).toBe(FILENAME_FALLBACK);
  });

  it('공백과 점만 있는 제목도 폴백을 쓴다', () => {
    expect(safeFileName('  ...  ')).toBe(FILENAME_FALLBACK);
  });
});

describe('safeFileName - Windows 예약 이름', () => {
  it('예약 장치 이름을 그대로 쓰지 않는다', () => {
    // 확장자를 붙여도 예약이 풀리지 않아 CON.r1.howsheet.json도 저장할 수 없다.
    for (const reserved of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9']) {
      expect(safeFileName(reserved)).toBe(`${reserved}-guide`);
    }
  });

  it('예약 이름을 포함하기만 하면 건드리지 않는다', () => {
    expect(safeFileName('CONFIG')).toBe('CONFIG');
  });
});

describe('guideFileName - revision suffix (DoD 7)', () => {
  it('.r{revision}.howsheet.json을 붙인다', () => {
    expect(guideFileName('내 가이드', 1)).toBe('내-가이드.r1.howsheet.json');
  });

  it('revision 0도 그대로 쓴다', () => {
    // 스키마가 nonnegative라 0이 통과한다. 진행 키 규칙도 r0을 허용한다.
    expect(guideFileName('내 가이드', 0)).toBe('내-가이드.r0.howsheet.json');
  });

  it('개정마다 다른 이름이 나와 한 폴더에 함께 둘 수 있다', () => {
    expect(guideFileName('같은 제목', 1)).not.toBe(guideFileName('같은 제목', 2));
  });

  it('빈 제목에도 확장자가 붙는다', () => {
    expect(guideFileName('', 3)).toBe(`${FILENAME_FALLBACK}.r3.howsheet.json`);
  });
});
