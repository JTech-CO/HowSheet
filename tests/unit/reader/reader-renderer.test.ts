// @vitest-environment jsdom
//
// DOMPurify에는 DOM이 필요하다. 하네스 M7 검증 블록이 `tests/unit/reader`를
// 호출하므로 프로젝트는 unit(node)이고 이 파일만 jsdom으로 돌린다.

import { beforeEach, describe, expect, it } from 'vitest';

import type { ContentBlock, GuideStep } from '@/domain/guide.types.ts';
import {
  escapeHtml,
  renderBlock,
  renderRichText,
  renderStep,
  type RenderContext,
} from '@/reader-runtime/reader-renderer.ts';
import { resetSanitizer } from '@/features/sanitize/sanitize-html.ts';

beforeEach(() => {
  resetSanitizer();
});

const ctx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  resolveAssetUrl: () => 'blob:http://localhost/x',
  richTextByBlock: {},
  ...overrides,
});

/** 렌더 결과를 DOM으로 본다. 문자열 매칭은 이스케이프된 텍스트를 위반으로 잡는다. */
function parse(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

describe('텍스트 이스케이프 (INV-07)', () => {
  it('꺾쇠와 따옴표를 엔티티로 바꾼다', () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;',
    );
  });

  it('단계 제목에 태그를 넣어도 태그가 되지 않는다', () => {
    const step: GuideStep = {
      id: 's',
      order: 0,
      title: '<img src=x onerror=alert(1)>',
      summary: '<script>alert(1)</script>',
      blocks: [],
      completionMode: 'checkbox',
      branchRules: [],
      troubleshootingIds: [],
      optional: false,
    };
    const host = parse(renderStep(step, ctx()));
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('script')).toBeNull();
    expect(host.textContent).toContain('<script>alert(1)</script>');
  });
});

describe('본문 재살균 (D-12)', () => {
  it('미리 렌더된 HTML을 한 번 더 살균한다', () => {
    const dirty = '<p>본문</p><script>alert(1)</script><img src=x onerror=alert(2)>';
    const html = renderRichText(dirty);

    const host = parse(html);
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('[onerror]')).toBeNull();
    expect(host.textContent).toContain('본문');
  });

  it('살균은 멱등이라 두 번 통과해도 결과가 같다', () => {
    // 이 성질이 깨지면 미리보기와 내보낸 리더가 갈라진다. (INV-09)
    const once = renderRichText('<p>A &amp; B</p><a href="https://a.example">링크</a>');
    expect(renderRichText(once)).toBe(once);
  });

  it('텍스트 블록은 미리 렌더된 HTML을 쓴다', () => {
    const block: ContentBlock = { id: 'b1', order: 0, type: 'text', markdown: '**굵게**' };
    const html = renderBlock(
      block,
      ctx({ richTextByBlock: { b1: '<p><strong>굵게</strong></p>' } }),
    );
    expect(parse(html).querySelector('strong')?.textContent).toBe('굵게');
  });

  it('미리 렌더된 것이 없으면 본문이 비어 있다', () => {
    const block: ContentBlock = { id: 'b1', order: 0, type: 'text', markdown: '무시된다' };
    expect(parse(renderBlock(block, ctx())).textContent).toBe('');
  });
});

describe('블록 렌더 (INV-09)', () => {
  it('코드는 텍스트로 남는다', () => {
    const block: ContentBlock = {
      id: 'b',
      order: 0,
      type: 'code',
      code: '</script><script>alert(1)</script>',
    };
    const host = parse(renderBlock(block, ctx()));
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('code')?.textContent).toBe('</script><script>alert(1)</script>');
  });

  it('http·https 링크만 새 탭으로 연다', () => {
    const safe: ContentBlock = {
      id: 'b',
      order: 0,
      type: 'link',
      label: '문서',
      url: 'https://example.com',
    };
    const link = parse(renderBlock(safe, ctx())).querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>x</script>', '/relative'])(
    '%s는 링크로 만들지 않는다',
    (url) => {
      const block: ContentBlock = { id: 'b', order: 0, type: 'link', label: '클릭', url };
      const host = parse(renderBlock(block, ctx()));
      expect(host.querySelector('a')).toBeNull();
      expect(host.textContent).toContain('http');
    },
  );

  it('장식용 이미지는 alt를 비우고 presentation으로 낸다', () => {
    const block: ContentBlock = {
      id: 'b',
      order: 0,
      type: 'image',
      assetId: 'a1',
      alt: '무시된다',
      decorative: true,
    };
    const img = parse(renderBlock(block, ctx())).querySelector('img');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('role')).toBe('presentation');
  });

  it('자산이 없으면 대체 텍스트를 보여 준다', () => {
    const block: ContentBlock = { id: 'b', order: 0, type: 'image', assetId: 'a1', alt: '도식' };
    const host = parse(renderBlock(block, ctx({ resolveAssetUrl: () => null })));
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('도식');
  });

  it('체크리스트는 체크 상태를 반영한다', () => {
    const block: ContentBlock = {
      id: 'chk',
      order: 0,
      type: 'checklist',
      items: [
        { id: 'i1', label: '전원', required: true },
        { id: 'i2', label: '케이블', required: false },
      ],
    };
    const host = parse(renderBlock(block, ctx({ checkedItemIds: ['i1'] })));
    const boxes = host.querySelectorAll('input[type=checkbox]');
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[1] as HTMLInputElement).checked).toBe(false);
    expect(host.textContent).toContain('(선택)');
  });

  it('선택지는 고른 것을 반영하고 경로 변경을 알린다', () => {
    const block: ContentBlock = {
      id: 'dec',
      order: 0,
      type: 'decision',
      question: '어느 기기입니까?',
      required: true,
      options: [
        { id: 'o1', label: 'PC' },
        { id: 'o2', label: '모바일', description: '휴대폰' },
      ],
    };
    const host = parse(renderBlock(block, ctx({ selectedOptionByBlock: { dec: 'o2' } })));
    const radios = host.querySelectorAll('input[type=radio]');
    expect((radios[1] as HTMLInputElement).checked).toBe(true);
    expect(host.textContent).toContain('선택을 변경하면 이후 진행 경로가 바뀝니다');
  });

  it('선택지 라벨의 태그도 텍스트로 남는다', () => {
    const block: ContentBlock = {
      id: 'dec',
      order: 0,
      type: 'decision',
      question: '<script>alert(1)</script>',
      required: true,
      options: [{ id: 'o1', label: '<img src=x onerror=alert(1)>' }],
    };
    const host = parse(renderBlock(block, ctx()));
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
  });

  it('구분선은 hr이다', () => {
    const block: ContentBlock = { id: 'b', order: 0, type: 'divider' };
    expect(parse(renderBlock(block, ctx())).querySelector('hr')).not.toBeNull();
  });

  it('미지원 타입은 조용히 사라지지 않는다', () => {
    const rogue = { id: 'x', order: 0, type: 'hologram' } as unknown as ContentBlock;
    const host = parse(renderBlock(rogue, ctx()));
    expect(host.querySelector('[role=alert]')?.textContent).toContain('hologram');
  });
});

describe('단계 렌더', () => {
  it('블록을 order 순으로 그린다', () => {
    const step: GuideStep = {
      id: 's',
      order: 0,
      title: '단계',
      blocks: [
        { id: 'b2', order: 1, type: 'divider' },
        { id: 'b1', order: 0, type: 'code', code: 'echo hi' },
      ],
      completionMode: 'checkbox',
      branchRules: [],
      troubleshootingIds: [],
      optional: false,
    };
    const host = parse(renderStep(step, ctx()));
    const children = host.querySelector('.hs-blocks')?.children ?? [];
    expect(children[0]?.getAttribute('data-block')).toBe('code');
    expect(children[1]?.getAttribute('data-block')).toBe('divider');
  });
});
