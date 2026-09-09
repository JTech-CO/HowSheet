import { describe, expect, it } from 'vitest';

import {
  FILENAME_FALLBACK,
  FILENAME_MAX_LENGTH,
  PROMPT_EXTENSION,
  promptFileName,
  promptTitleFromSource,
  safeFileName,
} from '@/utils/filename.ts';

/**
 * 기준: v2 제품정의 §3(결과). 하네스 P6 DoD 2.
 *
 * 파일명 규칙은 v1에서 왔지만 소비자가 없어 테스트도 없었다. P6이 이 규칙을
 * 실제로 쓰기 시작하므로 여기서 고정한다.
 */

describe('promptTitleFromSource', () => {
  it('첫 줄을 쓴다', () => {
    expect(promptTitleFromSource('배포 절차\n본문')).toBe('배포 절차');
  });

  it('앞의 빈 줄을 건너뛴다', () => {
    expect(promptTitleFromSource('\n\n   \n회의록\n본문')).toBe('회의록');
  });

  it('Markdown 제목과 목록 표시를 걷어낸다', () => {
    expect(promptTitleFromSource('# 배포 절차')).toBe('배포 절차');
    expect(promptTitleFromSource('### 배포')).toBe('배포');
    expect(promptTitleFromSource('- 첫 항목')).toBe('첫 항목');
    expect(promptTitleFromSource('> 인용')).toBe('인용');
  });

  it('쓸 것이 없으면 빈 문자열이다', () => {
    for (const source of ['', '   ', '\n\n', '###', '---']) {
      expect(promptTitleFromSource(source)).toBe('');
    }
  });
});

describe('safeFileName', () => {
  it('운영체제 금지 문자를 지운다', () => {
    expect(safeFileName('a/b:c*d?e"f<g>h|i')).toBe('abcdefghi');
  });

  it('공백을 하이픈으로 바꾸고 겹친 하이픈을 접는다', () => {
    expect(safeFileName('배포   절차')).toBe('배포-절차');
    expect(safeFileName('a / b')).toBe('a-b');
  });

  it('줄바꿈이 단어를 붙이지 않는다', () => {
    // 제어 문자를 먼저 지우면 `줄1줄2`로 붙어 두 단어가 하나가 된다.
    expect(safeFileName('줄1\n줄2')).toBe('줄1-줄2');
  });

  it('앞뒤의 점·공백·하이픈을 지운다', () => {
    // 앞의 점은 유닉스에서 숨김 파일을, 뒤의 점은 Windows에서 다른 이름을 만든다.
    expect(safeFileName('  .이름.  ')).toBe('이름');
  });

  it('Windows 예약 이름을 피한다', () => {
    for (const name of ['CON', 'con', 'PRN', 'nul', 'COM1', 'lpt9']) {
      expect(safeFileName(name)).toBe(`${name}-prompt`);
    }
  });

  it('상한을 코드 포인트로 자른다', () => {
    // UTF-16 단위로 자르면 이모지가 반쪽이 되어 파일명에 넣을 수 없다.
    const emoji = '🙂'.repeat(FILENAME_MAX_LENGTH + 10);
    const cut = safeFileName(emoji);

    expect([...cut]).toHaveLength(FILENAME_MAX_LENGTH);
    expect(cut).not.toContain('�');
  });

  it('비면 기본값으로 떨어진다', () => {
    for (const title of ['', '   ', '///', '...']) {
      expect(safeFileName(title)).toBe(FILENAME_FALLBACK);
    }
  });
});

describe('promptFileName (DoD 2)', () => {
  it('자료의 첫 줄과 회차와 확장자를 붙인다', () => {
    expect(promptFileName('# 배포 절차\n\n본문', 1)).toBe(`배포-절차.r1${PROMPT_EXTENSION}`);
    expect(promptFileName('# 배포 절차\n\n본문', 12)).toBe(`배포-절차.r12${PROMPT_EXTENSION}`);
  });

  it('확장자가 .md다', () => {
    expect(PROMPT_EXTENSION).toBe('.md');
    expect(promptFileName('제목', 1).endsWith('.md')).toBe(true);
  });

  it('자료가 비어도 이름을 만든다', () => {
    expect(promptFileName('', 1)).toBe(`${FILENAME_FALLBACK}.r1${PROMPT_EXTENSION}`);
  });

  it('회차가 다르면 이름도 다르다', () => {
    // 같은 이름으로 두 번 내려가면 브라우저가 `(1)`을 붙여 어느 쪽이 어느
    // 것인지 알 수 없게 만든다.
    const names = [1, 2, 3].map((revision) => promptFileName('같은 자료', revision));
    expect(new Set(names).size).toBe(3);
  });

  it('금지 문자가 든 자료에서도 저장할 수 있는 이름이 나온다', () => {
    const name = promptFileName('# a/b:c*d?e\n본문', 1);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
    expect(name).toBe(`abcde.r1${PROMPT_EXTENSION}`);
  });
});
