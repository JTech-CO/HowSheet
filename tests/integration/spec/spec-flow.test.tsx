/**
 * 요소·디자인 선택 흐름.
 *
 * 기준: v2 제품정의 §4·§5, §8 INV-09. 하네스 P2 DoD 1·2·3·4.
 *
 * 실제 스토어와 실제 화면을 쓰고 저장소만 바꾼다. 스토어를 흉내 내면 DoD 3이
 * 검증하려는 저장·복원이 테스트 대역의 동작이 된다.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_DESIGN } from '@/domain/spec.defaults.ts';
import { DESIGN_AXES, DESIGN_AXIS_IDS, ELEMENTS } from '@/domain/spec.types.ts';
import { StudioPage } from '@/pages/StudioPage/StudioPage.tsx';
import {
  DOCUMENT_KEY,
  STORE_NAME,
  createMemoryStore,
  openDocumentStore,
  type DocumentStore,
} from '@/storage/document.store.ts';
import { configureStudioStore, resetStudioStore, useStudioStore } from '@/store/studio.store.ts';

const NOW = '2026-09-08T00:00:00.000Z';
const store = () => useStudioStore.getState();

function setup(documents: DocumentStore = createMemoryStore('테스트')): DocumentStore {
  configureStudioStore({ documents, now: () => NOW });
  resetStudioStore();
  return documents;
}

/**
 * 첫 저장을 붙잡아 두는 저장소.
 *
 * 저장이 도는 동안 사용자가 무언가 더 누르는 상황을 만든다. 실제 IndexedDB
 * 쓰기는 빨라서 이 틈이 잘 열리지 않는데, 열렸을 때 잃는 것은 사용자의 선택이다.
 */
function gatedStore() {
  const inner = createMemoryStore('테스트');
  let release: (() => void) | null = null;
  let gated = true;

  const store: DocumentStore = {
    state: () => inner.state(),
    load: () => inner.load(),
    save: async (document) => {
      if (gated) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        gated = false;
      }
      await inner.save(document);
    },
    clear: () => inner.clear(),
  };

  return {
    store,
    waiting: () => release !== null,
    release: () => {
      release?.();
      release = null;
    },
  };
}

/** 새로고침을 흉내 낸다. 메모리 상태를 버리고 저장소만 남긴다. */
function reload(documents: DocumentStore) {
  cleanup();
  configureStudioStore({ documents, now: () => NOW });
  resetStudioStore();
  render(<StudioPage />);
}

function radios(axis: string): HTMLInputElement[] {
  const group = screen.getByTestId('design-axis-' + axis);
  return within(group).getAllByRole('radio') as HTMLInputElement[];
}

afterEach(() => {
  cleanup();
  configureStudioStore(null);
});

describe('요소 고르기 (DoD 1)', () => {
  beforeEach(() => setup());

  it('열 종이 모두 버튼으로 있다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('element-diagram');

    for (const element of ELEMENTS) {
      const button = screen.getByTestId('element-' + element.id);
      expect(button.textContent).toContain(element.label);
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('하나도 고르지 않아도 진행할 수 있고 그때 자료를 보고 정한다고 알린다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('element-diagram');

    expect(store().document?.elements).toEqual([]);
    expect(screen.getByTestId('elements-empty').textContent).toContain('자료를 보고 정합니다');
    // 막지 않는다. 다음 단계가 그대로 보인다.
    expect(screen.getByText('프롬프트')).toBeTruthy();
  });

  it('고르면 안내가 바뀌고 다시 누르면 해제된다', async () => {
    render(<StudioPage />);
    await userEvent.click(await screen.findByTestId('element-code'));

    expect(store().document?.elements).toEqual(['code']);
    expect(screen.queryByTestId('elements-empty')).toBeNull();
    expect(screen.getByTestId('elements-chosen').textContent).toContain('1개');

    await userEvent.click(screen.getByTestId('element-code'));
    expect(store().document?.elements).toEqual([]);
    expect(screen.getByTestId('elements-empty')).toBeTruthy();
  });

  it('여러 개를 고르면 카탈로그 순서로 담긴다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('element-faq');

    await userEvent.click(screen.getByTestId('element-faq'));
    await userEvent.click(screen.getByTestId('element-diagram'));

    // 고른 순서가 아니라 목록 순서다. P3의 프롬프트가 결정적이어야 한다.
    expect(store().document?.elements).toEqual(['diagram', 'faq']);
  });
});

describe('디자인 고르기 (DoD 2)', () => {
  beforeEach(() => setup());

  it('축마다 정확히 하나가 선택돼 있다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('design-axis-color');

    for (const axis of DESIGN_AXES) {
      const checked = radios(axis.id).filter((radio) => radio.checked);
      expect(checked).toHaveLength(1);
      expect(checked[0]?.value).toBe(DEFAULT_DESIGN[axis.id]);
    }
  });

  it('다른 값을 고르면 앞의 값이 풀린다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('design-color-full');

    await userEvent.click(screen.getByTestId('design-color-full'));

    expect(store().document?.design.color).toBe('full');
    expect(radios('color').filter((radio) => radio.checked)).toHaveLength(1);
  });

  it('이미 선택된 값을 다시 눌러도 선택 없음이 되지 않는다', async () => {
    render(<StudioPage />);
    const current = await screen.findByTestId('design-color-monotone');

    await userEvent.click(current);

    expect(store().document?.design.color).toBe('monotone');
    expect(radios('color').filter((radio) => radio.checked)).toHaveLength(1);
  });

  it('한 축을 바꿔도 다른 축은 그대로다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('design-tone-academic');

    await userEvent.click(screen.getByTestId('design-tone-academic'));

    expect(store().document?.design.tone).toBe('academic');
    expect(store().document?.design.color).toBe(DEFAULT_DESIGN.color);
    expect(store().document?.design.density).toBe(DEFAULT_DESIGN.density);
  });

  it('스토어가 모르는 축 값을 거부한다 (DoD 5)', async () => {
    render(<StudioPage />);
    await screen.findByTestId('design-axis-color');

    store().setDesign('color', 'neon');

    // 축이 비지 않는다. 모르는 값은 들어오지 못하고 앞의 값이 남는다.
    expect(store().document?.design.color).toBe(DEFAULT_DESIGN.color);
  });
});

describe('키보드와 색 없는 표시 (DoD 4, INV-09)', () => {
  beforeEach(() => setup());

  it('요소 버튼을 스페이스와 엔터로 켜고 끈다', async () => {
    render(<StudioPage />);
    const button = await screen.findByTestId('element-timeline');

    button.focus();
    await userEvent.keyboard('[Space]');
    expect(store().document?.elements).toEqual(['timeline']);

    await userEvent.keyboard('[Enter]');
    expect(store().document?.elements).toEqual([]);
  });

  it('요소 버튼에 탭으로 닿는다', async () => {
    render(<StudioPage />);
    const first = await screen.findByTestId('element-diagram');

    first.focus();
    await userEvent.tab();

    expect(globalThis.document.activeElement).toBe(screen.getByTestId('element-flowchart'));
  });

  it('디자인 라디오를 화살표로 옮긴다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('design-axis-color');
    const [first, second] = radios('color');

    first?.focus();
    await userEvent.keyboard('[ArrowDown]');

    expect(second?.checked).toBe(true);
    expect(store().document?.design.color).toBe(second?.value);
  });

  it('선택 상태를 색이 아닌 것으로도 알린다', async () => {
    render(<StudioPage />);
    const button = await screen.findByTestId('element-code');

    // 켜기 전에는 표시가 없다. 이 단언이 없으면 아래 단언이 공허해진다.
    expect(button.textContent).not.toContain('✓');

    await userEvent.click(button);

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('✓');
  });

  it('디자인 선택을 보조 기술이 읽을 수 있다', async () => {
    render(<StudioPage />);
    await screen.findByTestId('design-axis-tone');

    // 네이티브 라디오라 checked가 그대로 접근성 상태다. 색에 기대지 않는다.
    expect(radios('tone').filter((radio) => radio.checked)).toHaveLength(1);
    expect(screen.getByTestId('design-axis-tone').tagName).toBe('FIELDSET');
  });
});

describe('선택 저장 (DoD 3)', () => {
  it('새로고침해도 요소와 디자인이 남아 있다', async () => {
    const documents = setup();
    render(<StudioPage />);

    await userEvent.click(await screen.findByTestId('element-flowchart'));
    await userEvent.click(screen.getByTestId('design-density-compact'));
    await waitFor(() => expect(store().saveState).toBe('saved'));

    reload(documents);

    await waitFor(() =>
      expect(screen.getByTestId('element-flowchart').getAttribute('aria-pressed')).toBe('true'),
    );
    expect((screen.getByTestId('design-density-compact') as HTMLInputElement).checked).toBe(true);
    expect(store().document?.elements).toEqual(['flowchart']);
  });

  it('자료와 선택이 함께 남는다', async () => {
    const documents = setup();
    render(<StudioPage />);

    await userEvent.type(await screen.findByTestId('source-input'), '자료');
    await userEvent.click(screen.getByTestId('element-glossary'));
    await waitFor(() => expect(store().saveState).toBe('saved'));

    reload(documents);

    await waitFor(() => expect(store().document?.source).toBe('자료'));
    expect(store().document?.elements).toEqual(['glossary']);
  });

  it('저장하는 사이에 누른 토글이 사라지지 않는다 (INV-07)', async () => {
    // 첫 저장을 붙잡아 둔 채로 하나 더 켠다. 저장이 끝날 때 스냅샷으로 메모리를
    // 덮으면 그 사이의 선택이 사라진다. 자료만 비교하는 구현이 여기서 걸린다.
    const gate = gatedStore();
    setup(gate.store);
    render(<StudioPage />);

    await userEvent.click(await screen.findByTestId('element-steps'));
    await waitFor(() => expect(gate.waiting()).toBe(true));

    await userEvent.click(screen.getByTestId('element-checklist'));
    gate.release();

    await waitFor(() => expect(store().saveState).toBe('saved'));
    expect(store().document?.elements).toEqual(['checklist', 'steps']);
  });
});

describe('옛 문서 올림 (INV-07)', () => {
  /** 저장소에 날것 그대로 밀어 넣는다. 타입을 우회해야 옛 모양을 만들 수 있다. */
  function seed(name: string, record: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => {
        const tx = request.result.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record, DOCUMENT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  it('v1 문서를 열어도 자료가 남고 축이 채워진다', async () => {
    // v1은 elements와 design이 없었다. 모양 검사만 하면 이 문서가 통째로
    // 버려지고 사용자가 붙여넣어 둔 자료가 사라진다.
    const name = `howsheet-p2-${Date.now()}`;
    const documents = await openDocumentStore({ name });
    // 조용히 메모리로 떨어졌으면 이 테스트가 아무것도 보지 않는다.
    expect(documents.state().mode).toBe('indexeddb');
    await seed(name, { version: 1, source: 'v1에서 넘어온 자료', updatedAt: NOW });

    setup(documents);
    render(<StudioPage />);

    const input = (await screen.findByTestId('source-input')) as HTMLTextAreaElement;
    expect(input.value).toBe('v1에서 넘어온 자료');
    expect(store().document?.elements).toEqual([]);
    for (const axis of DESIGN_AXIS_IDS) {
      expect(radios(axis).filter((radio) => radio.checked)).toHaveLength(1);
    }
  });
});
