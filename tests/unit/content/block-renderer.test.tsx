// @vitest-environment jsdom
//
// 콘텐츠 렌더러는 DOM이 필요하다. 하네스 M5 검증 블록이 `tests/unit/content`를
// 호출하므로 프로젝트는 unit(node)이고 이 파일만 jsdom으로 돌린다.

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BlockRenderer } from '@/components/content/BlockRenderer/BlockRenderer.tsx';
import { CONTENT_BLOCK_TYPES, type ContentBlock } from '@/domain/guide.types.ts';
import { createBlock } from '@/domain/guide.defaults.ts';
import { resetSanitizer } from '@/features/sanitize/sanitize-html.ts';

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

/**
 * 타입별로 내용이 채워진 블록.
 * 빈 블록은 아무것도 그리지 않는 것이 정상이라 소진 검사에 쓸 수 없다.
 */
function filledBlock(type: (typeof CONTENT_BLOCK_TYPES)[number]): ContentBlock {
  const block = createBlock(type, nextId, 0);
  switch (block.type) {
    case 'text':
      return { ...block, markdown: '본문' };
    case 'code':
      return { ...block, code: 'echo hi' };
    case 'link':
      return { ...block, label: '문서', url: 'https://example.com' };
    case 'image':
      return { ...block, alt: '설명' };
    case 'decision':
      return { ...block, question: '어느 쪽인가요?' };
    default:
      return block;
  }
}

beforeEach(() => {
  resetSanitizer();
});

afterEach(cleanup);

describe('판별 유니온 소진 처리 (M5 DoD 1)', () => {
  // 이 표가 도메인 목록과 어긋나면 아래 테스트가 실패한다. 새 타입을 추가하고
  // 렌더러만 고치면 여기서 걸린다.
  it('도메인이 정의한 블록 타입은 7종이다', () => {
    expect([...CONTENT_BLOCK_TYPES].sort()).toEqual([
      'checklist',
      'code',
      'decision',
      'divider',
      'image',
      'link',
      'text',
    ]);
  });

  it.each([...CONTENT_BLOCK_TYPES])('%s 블록이 무언가를 그린다', (type) => {
    const { container } = render(<BlockRenderer block={filledBlock(type)} />);

    // 조용히 아무것도 그리지 않는 타입이 있으면 안 된다. (DoD 1)
    expect(container.querySelector('*')).not.toBeNull();
    expect(screen.queryByTestId('unsupported-block')).toBeNull();
  });

  it('미지원 타입은 조용히 무시되지 않고 경고로 드러난다', () => {
    const rogue = { id: 'x', order: 0, type: 'hologram' } as unknown as ContentBlock;
    render(<BlockRenderer block={rogue} />);

    const notice = screen.getByTestId('unsupported-block');
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.textContent).toContain('hologram');
  });
});

describe('텍스트 블록', () => {
  it('Markdown을 살균해 렌더링한다', () => {
    const block: ContentBlock = {
      id: 'b1',
      order: 0,
      type: 'text',
      markdown: '**굵게** <script>alert(1)</script>',
    };
    const { container } = render(<BlockRenderer block={block} />);

    expect(container.querySelector('strong')?.textContent).toBe('굵게');
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('코드 블록 (M5 DoD 3·10)', () => {
  const block: ContentBlock = {
    id: 'b1',
    order: 0,
    type: 'code',
    language: 'html',
    code: '</script><script>alert(1)</script>',
  };

  it('코드는 HTML로 해석되지 않고 텍스트로 남는다', () => {
    const { container } = render(<BlockRenderer block={block} />);

    const code = container.querySelector('code');
    expect(code?.textContent).toBe('</script><script>alert(1)</script>');
    // 텍스트 노드다. 자식 엘리먼트가 생기지 않는다.
    expect(code?.querySelector('script')).toBeNull();
    expect(code?.children).toHaveLength(0);
  });

  it('언어 라벨을 보여 주고 비어 있으면 명령어로 표시한다', () => {
    render(<BlockRenderer block={block} />);
    expect(screen.getByText('html')).toBeTruthy();

    cleanup();
    render(<BlockRenderer block={{ ...block, language: undefined }} />);
    expect(screen.getByText('명령어')).toBeTruthy();
  });

  it('Clipboard API가 성공하면 복사했다고 알린다', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(<BlockRenderer block={block} />);
    await userEvent.click(screen.getByTestId('copy-button'));

    expect(writeText).toHaveBeenCalledWith(block.code);
    expect(screen.getByTestId('copy-message').textContent).toContain('복사했습니다');
    vi.unstubAllGlobals();
  });

  // DoD 10 - 실패해도 사용자가 스스로 복사할 수 있어야 한다.
  it('Clipboard API가 실패하면 코드 전체를 선택해 준다', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: async () => {
          throw new Error('권한 없음');
        },
      },
    });

    render(<BlockRenderer block={block} />);
    await userEvent.click(screen.getByTestId('copy-button'));

    expect(screen.getByTestId('copy-message').textContent).toContain('선택했습니다');
    const selection = window.getSelection();
    expect(selection?.toString()).toContain('alert(1)');
    vi.unstubAllGlobals();
  });

  it('Clipboard API 자체가 없어도 폴백이 동작한다', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });

    render(<BlockRenderer block={block} />);
    await userEvent.click(screen.getByTestId('copy-button'));

    expect(screen.getByTestId('copy-message').textContent).toContain('선택했습니다');
    vi.unstubAllGlobals();
  });
});

describe('링크 블록 (M5 DoD 4)', () => {
  it('http·https는 새 탭 링크로 만든다', () => {
    render(
      <BlockRenderer
        block={{ id: 'b', order: 0, type: 'link', label: '문서', url: 'https://example.com' }}
      />,
    );

    const link = screen.getByRole('link', { name: /문서/ });
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    '/rel',
  ])('%s는 링크로 만들지 않고 이유를 보여 준다', (url) => {
    render(<BlockRenderer block={{ id: 'b', order: 0, type: 'link', label: '클릭', url }} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTestId('link-blocked').textContent).toContain('http');
  });
});

describe('이미지 블록', () => {
  const block: ContentBlock = {
    id: 'b',
    order: 0,
    type: 'image',
    assetId: 'asset-1',
    alt: '공유기 뒷면',
    caption: '전원 단자 위치',
  };

  it('주소를 찾으면 그린다', () => {
    render(<BlockRenderer block={block} resolveAssetUrl={() => 'blob:http://localhost/x'} />);

    const image = screen.getByRole('img', { name: '공유기 뒷면' });
    expect(image.getAttribute('src')).toBe('blob:http://localhost/x');
    expect(screen.getByText('전원 단자 위치')).toBeTruthy();
  });

  it('자산이 없으면 대체 텍스트와 재연결을 보여 준다 (디자인 §5.9)', () => {
    const onReconnect = vi.fn();
    render(<BlockRenderer block={block} onReconnectAsset={onReconnect} />);

    const missing = screen.getByTestId('image-missing');
    expect(missing.textContent).toContain('이미지를 불러오지 못했습니다');
    expect(missing.textContent).toContain('공유기 뒷면');
    expect(screen.getByRole('button', { name: '자산 다시 연결' })).toBeTruthy();
  });

  it('빈 alt는 장식 이미지로 보고 보조 기술에서 숨긴다', () => {
    render(
      <BlockRenderer
        block={{ ...block, alt: '', caption: undefined }}
        resolveAssetUrl={() => 'blob:http://localhost/x'}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(within(screen.getByTestId('guide-image')).getByRole('presentation')).toBeTruthy();
  });
});

describe('체크리스트·선택 블록', () => {
  it('체크 상태를 밖에서 받고 토글을 위로 올린다', async () => {
    const onToggle = vi.fn();
    const block: ContentBlock = {
      id: 'b',
      order: 0,
      type: 'checklist',
      items: [
        { id: 'i1', label: '전원 확인', required: true },
        { id: 'i2', label: '케이블 확인', required: false },
      ],
    };

    render(
      <BlockRenderer block={block} checkedItemIds={['i1']} onToggleChecklistItem={onToggle} />,
    );

    expect((screen.getByRole('checkbox', { name: /전원 확인/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /케이블 확인/ }));
    expect(onToggle).toHaveBeenCalledWith('b', 'i2', true);
  });

  it('토글 핸들러가 없으면 읽기 전용이다', () => {
    const block: ContentBlock = {
      id: 'b',
      order: 0,
      type: 'checklist',
      items: [{ id: 'i1', label: '전원 확인', required: true }],
    };
    render(<BlockRenderer block={block} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('선택 분기는 고른 값을 위로 올린다', async () => {
    const onSelect = vi.fn();
    const block: ContentBlock = {
      id: 'b',
      order: 0,
      type: 'decision',
      question: '불이 켜졌나요?',
      required: true,
      options: [
        { id: 'o1', label: '켜짐' },
        { id: 'o2', label: '꺼짐', description: '아무 불도 없음' },
      ],
    };

    render(<BlockRenderer block={block} onSelectOption={onSelect} />);

    expect(screen.getByText('아무 불도 없음')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: /꺼짐/ }));
    expect(onSelect).toHaveBeenCalledWith('b', 'o2');
  });
});
