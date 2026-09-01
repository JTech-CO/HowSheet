// @vitest-environment jsdom
//
// DOMPurify에는 DOM이 필요하다. 하네스 M5 검증 블록이 이 파일을 `tests/unit`
// 경로로 호출하므로 프로젝트는 unit(node)이지만 이 파일만 jsdom으로 돌린다.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  markdownToRawHtml,
  markdownToSafeHtml,
  markdownToSafeHtmlWithReport,
} from '@/features/sanitize/markdown-to-html.ts';
import { resetSanitizer, sanitizeHtml } from '@/features/sanitize/sanitize-html.ts';

beforeEach(() => {
  resetSanitizer();
});

const FORBIDDEN_SELECTOR =
  'script, iframe, object, embed, svg, math, style, form, input:not([type=checkbox]), meta, base, link, noscript';

const DANGEROUS_URI = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html|data\s*:\s*image\/svg)/i;

/**
 * 실행 가능한 잔재가 남았는지 **DOM으로** 본다.
 *
 * 문자열 검사로는 판정할 수 없다. 코드 블록 안의 `&lt;img onerror=...&gt;`는
 * 이스케이프된 텍스트지 속성이 아닌데, 문자열 매칭은 이를 위반으로 잡는다.
 * 반대로 속성 이름을 나눠 쓴 우회는 문자열 검사를 빠져나간다.
 */
function hasExecutableResidue(html: string): boolean {
  const host = document.createElement('div');
  host.innerHTML = html;

  if (host.querySelector(FORBIDDEN_SELECTOR) !== null) return true;

  for (const node of host.querySelectorAll('*')) {
    for (const attribute of node.attributes) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) return true;
      if (name === 'srcdoc' || name === 'style') return true;
      if ((name === 'href' || name === 'src') && DANGEROUS_URI.test(attribute.value)) return true;
    }
  }
  return false;
}

const PAYLOADS: { name: string; markdown: string }[] = [
  { name: 'script 태그', markdown: '<script>alert(1)</script>' },
  { name: 'script 조기 종료', markdown: '</script><script>alert(1)</script>' },
  { name: 'img onerror', markdown: '<img src=x onerror=alert(1)>' },
  { name: 'javascript: 링크', markdown: '[클릭](javascript:alert(1))' },
  { name: 'vbscript: 링크', markdown: '<a href="vbscript:alert(1)">vbscript</a>' },
  {
    name: 'data:text/html 링크',
    markdown: '[데이터](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  },
  { name: 'raw html onmouseover', markdown: '<div onmouseover="alert(1)">raw</div>' },
  { name: 'svg onload', markdown: '<svg onload=alert(1)><circle r="1"/></svg>' },
  {
    name: 'svg data URL 이미지',
    markdown: '<img src="data:image/svg+xml,%3Csvg onload%3Dalert(1)%3E">',
  },
  { name: 'iframe srcdoc', markdown: '<iframe srcdoc="<script>alert(1)</script>"></iframe>' },
  { name: 'style 태그', markdown: '<style>body{display:none}</style>' },
  { name: 'style 속성', markdown: '<p style="position:fixed;inset:0">덮기</p>' },
  { name: 'form action', markdown: '<form action="https://evil.example"><input name="x"></form>' },
  {
    name: 'meta refresh',
    markdown: '<meta http-equiv="refresh" content="0;url=https://evil.example">',
  },
  { name: 'base 태그', markdown: '<base href="https://evil.example/">' },
  { name: 'object 태그', markdown: '<object data="https://evil.example/x.swf"></object>' },
  { name: 'embed 태그', markdown: '<embed src="https://evil.example/x">' },
  { name: '이미지 alt 탈출', markdown: '![이미지](x" onerror="alert(1))' },
  { name: '대문자 우회', markdown: '<SCRIPT>alert(1)</SCRIPT>' },
  { name: '개행 삽입 우회', markdown: '<img\nsrc=x\nonerror=alert(1)>' },
  { name: 'MathML', markdown: '<math><mtext><script>alert(1)</script></mtext></math>' },
  {
    name: 'noscript 우회',
    markdown: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  },
  { name: 'a href 대소문자 섞기', markdown: '<a href="JaVaScRiPt:alert(1)">x</a>' },
  { name: 'DOM 클로버링', markdown: '<a id="attributes"></a><a id="body"></a>' },
];

describe('XSS 페이로드 실행 0건 (M5 DoD 2, INV-07)', () => {
  it.each(PAYLOADS)('$name', ({ markdown }) => {
    const html = markdownToSafeHtml(markdown);
    expect(hasExecutableResidue(html)).toBe(false);
  });

  it('실제로 DOM에 넣어도 스크립트가 생기지 않는다', () => {
    const host = document.createElement('div');
    for (const payload of PAYLOADS) {
      host.innerHTML = markdownToSafeHtml(payload.markdown);
      expect(host.querySelectorAll('script, iframe, object, embed, svg, style, form')).toHaveLength(
        0,
      );
      for (const node of host.querySelectorAll('*')) {
        for (const attribute of node.attributes) {
          expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
        }
      }
    }
  });

  // 이 단언이 없으면 페이로드 목록을 비워도 위 테스트가 통과한다.
  it('페이로드 표가 비어 있지 않다', () => {
    expect(PAYLOADS.length).toBeGreaterThanOrEqual(20);
  });
});

describe('1단계 - raw HTML 제거 (기술 §7.1-1)', () => {
  it('remark 단계에서 이미 raw HTML이 사라진다', () => {
    const raw = markdownToRawHtml('<div onmouseover="alert(1)">raw</div>\n\n정상 문단');
    expect(raw).not.toContain('<div');
    expect(raw).not.toContain('onmouseover');
    expect(raw).toContain('정상 문단');
  });

  it('코드 펜스 안의 HTML은 텍스트로 보존된다 (M5 DoD 3)', () => {
    const html = markdownToSafeHtml('```html\n<script>alert(1)</script>\n```');
    expect(html).toContain('&lt;script&gt;');
    expect(hasExecutableResidue(html)).toBe(false);
  });

  it('인라인 코드도 텍스트로 보존된다', () => {
    const html = markdownToSafeHtml('`<img src=x onerror=alert(1)>`');
    expect(html).toContain('<code>');
    expect(html).toContain('&lt;img');
    expect(hasExecutableResidue(html)).toBe(false);
  });
});

describe('링크 정책 (M5 DoD 4, 기술 §7.1-3·4)', () => {
  it('http·https 링크는 새 탭 + noopener noreferrer', () => {
    const html = markdownToSafeHtml('[문서](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('허용하지 않는 프로토콜은 링크를 푼다', () => {
    const html = markdownToSafeHtml('[클릭](javascript:alert(1))');
    expect(html).not.toContain('href');
    expect(html).toContain('클릭');
  });

  it('상대 경로와 프로토콜 상대 URL을 막는다', () => {
    for (const url of ['/local/path', '//evil.example/x', 'mailto:a@b.c', 'tel:123']) {
      expect(markdownToSafeHtml(`[x](${url})`)).not.toContain('href');
    }
  });
});

describe('이미지 정책 (기술 §7.1-8, INV-15)', () => {
  it('원격 이미지는 src를 지우고 대체 텍스트를 남긴다', () => {
    const report = markdownToSafeHtmlWithReport('![설명](https://example.com/a.png)');
    const host = document.createElement('div');
    host.innerHTML = report.html;

    const image = host.querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBeNull();
    expect(image?.getAttribute('alt')).toBe('설명');
    expect(report.blockedRemoteImages).toBe(1);
  });

  it('내장 data URL 이미지와 blob 미리보기는 허용한다', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sanitizeHtml(`<img src="${dataUrl}" alt="x">`)).toContain(dataUrl);
    expect(sanitizeHtml('<img src="blob:http://localhost/abc" alt="x">')).toContain('blob:');
  });

  it('SVG data URL은 막는다', () => {
    const html = sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="x">');
    expect(html).not.toContain('data:image/svg');
  });
});

describe('허용 목록', () => {
  it('일반 Markdown 서식은 살아남는다', () => {
    const html = markdownToSafeHtml(
      '# 제목\n\n**굵게** *기울임* ~~취소~~\n\n- 하나\n- 둘\n\n> 인용\n\n| a | b |\n| - | - |\n| 1 | 2 |',
    );
    for (const fragment of [
      '<h1>',
      '<strong>',
      '<em>',
      '<del>',
      '<ul>',
      '<blockquote>',
      '<table>',
    ]) {
      expect(html).toContain(fragment);
    }
  });

  it('GFM 작업 목록 체크박스는 비활성 상태로만 남는다', () => {
    const html = markdownToSafeHtml('- [x] 완료\n- [ ] 미완료');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled');
  });

  it('type 속성은 input 밖에서 살아남지 않는다', () => {
    const html = sanitizeHtml('<a href="https://a.example" type="javascript:alert(1)">x</a>');
    expect(html).not.toContain('type=');
    expect(html).toContain('href="https://a.example"');
  });

  it('표와 이미지의 비-URI 속성은 보존된다', () => {
    expect(sanitizeHtml('<table><tr><td colspan="2">x</td></tr></table>')).toContain('colspan="2"');
    expect(sanitizeHtml('<img src="blob:http://x/1" alt="a" width="10">')).toContain('width="10"');
  });

  it('체크박스가 아닌 input은 통째로 사라진다', () => {
    const html = sanitizeHtml('<input type="text" name="x"><input type="image" src="x">');
    expect(html).not.toContain('<input');
  });

  it('빈 입력은 빈 문자열이다', () => {
    expect(markdownToSafeHtml('')).toBe('');
    expect(markdownToSafeHtml('   \n  ')).toBe('');
  });
});
