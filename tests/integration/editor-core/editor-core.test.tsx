import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
} from '@/features/autosave/autosave.service.ts';
import { useAutosave } from '@/features/autosave/useAutosave.ts';

import { createFakeClock } from '../../unit/autosave/fake-clock.ts';
import { renderApp, resetStore, setupStorage, store, type EditorHarness } from './harness.tsx';

let harness: EditorHarness;

beforeEach(() => {
  harness = setupStorage();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** 실시간 사용자. 자동 저장 타이밍을 재지 않는 테스트에서 쓴다. */
const user = () => userEvent.setup();

/** 편집 화면을 연다. 기본 섹션은 기본 정보다. (디자인 §2.4.2) */
async function openEditorOnNewGuide(): Promise<string> {
  const id = await store().createGuide({ title: '' });
  renderApp(`/guide/${id}/edit`);
  await screen.findByTestId('title-preview');
  return id;
}

/** 개요에서 단계를 골라 단계 편집 화면으로 넘어간다. */
async function showStep(index = 0): Promise<void> {
  const steps = await screen.findAllByTestId('outline-step');
  await user().click(steps[index]!);
  await screen.findByTestId('step-editor');
}

describe('새 가이드 (M4 DoD 1)', () => {
  it('대시보드에서 만들면 첫 단계가 있는 편집 화면이 열린다', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: '내 가이드' });

    await user().click(await screen.findByTestId('create-guide'));

    // 편집 화면으로 이동하고 첫 단계가 이미 개요에 있다.
    expect(await screen.findByTestId('title-preview')).toBeTruthy();
    expect(store().document?.steps).toHaveLength(1);
    expect(screen.getAllByTestId('outline-step')).toHaveLength(1);

    await showStep();
    expect(screen.getByTestId('step-number').textContent).toBe('단계 1');
  });

  it('빈 대시보드는 빈 상태와 활용 예시를 보여 준다', async () => {
    renderApp('/');
    expect(await screen.findByText('아직 만든 가이드가 없습니다')).toBeTruthy();
    expect(screen.getByText('공유기 인터넷 연결 복구')).toBeTruthy();
  });

  it('없는 가이드를 열면 안내 화면이 나온다', async () => {
    renderApp('/guide/없음/edit');
    expect(await screen.findByRole('heading', { name: '가이드를 찾을 수 없습니다' })).toBeTruthy();
  });
});

describe('입력과 복원 (M4 DoD 2)', () => {
  it('제목·대상·준비물·경고·5단계를 입력하면 저장 후 그대로 복원된다', async () => {
    const id = await openEditorOnNewGuide();
    const person = user();

    await person.type(screen.getByLabelText(/가이드 제목/), '공유기 복구');
    await person.type(screen.getByLabelText(/대상 사용자/), '처음 만져 보는 사람');

    await person.click(screen.getByRole('button', { name: '준비물' }));
    await person.click(await screen.findByTestId('preparation-add'));
    await person.type(screen.getByLabelText(/준비물 1 이름/), '관리자 비밀번호');

    await person.click(screen.getByRole('button', { name: '경고' }));
    await person.click(await screen.findByTestId('warning-add'));
    await person.type(screen.getByLabelText(/^제목/), '초기화 주의');

    // 첫 단계는 이미 있으므로 4개를 더 만들어 5개로 맞춘다.
    for (let i = 0; i < 4; i += 1) {
      await person.click(screen.getByTestId('outline-add-step'));
    }
    expect(store().document?.steps).toHaveLength(5);

    await store().save();
    await waitFor(() => expect(store().saveState).toBe('saved'));

    // "새로고침" — 화면과 메모리 상태를 모두 버리고 저장소에서 다시 읽는다.
    cleanup();
    resetStore();
    renderApp(`/guide/${id}/edit`);
    await screen.findByTestId('title-preview');

    const restored = store().document!;
    expect(restored.meta.title).toBe('공유기 복구');
    expect(restored.meta.audience).toBe('처음 만져 보는 사람');
    expect(restored.preparation[0]?.label).toBe('관리자 비밀번호');
    expect(restored.warnings[0]?.title).toBe('초기화 주의');
    expect(restored.steps).toHaveLength(5);
  });

  it('제목 미리보기가 입력을 따라간다 (디자인 §2.4.2)', async () => {
    await openEditorOnNewGuide();
    expect(screen.getByTestId('title-preview').textContent).toBe('제목 없는 가이드');

    await user().type(screen.getByLabelText(/가이드 제목/), '프린터 용지 걸림');

    expect(screen.getByTestId('title-preview').textContent).toBe('프린터 용지 걸림');
  });
});

describe('자동 저장 타이밍 (M4 DoD 3)', () => {
  /** 훅만 붙인 최소 컴포넌트. 시계를 주입해 시각을 정확히 잰다. */
  function AutosaveProbe({ clock }: { clock: ReturnType<typeof createFakeClock>['clock'] }) {
    useAutosave({ clock });
    return null;
  }

  it('마지막 입력에서 500ms에 저장하고 그전에는 하지 않는다', async () => {
    const id = await store().createGuide({ title: '' });
    await store().loadGuide(id);

    const fake = createFakeClock();
    render(<AutosaveProbe clock={fake.clock} />);
    const saveSpy = vi.spyOn(harness.guides, 'save');

    await act(async () => {
      store().updateMeta({ title: '자동 저장' });
    });

    await act(async () => {
      await fake.advance(AUTOSAVE_DEBOUNCE_MS - 1);
    });
    expect(saveSpy).not.toHaveBeenCalled();

    await act(async () => {
      await fake.advance(1);
    });
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0]?.[0]?.meta.title).toBe('자동 저장');
  });

  it('입력이 이어져도 첫 변경에서 1초 안에 저장한다', async () => {
    const id = await store().createGuide({ title: '' });
    await store().loadGuide(id);

    const fake = createFakeClock();
    render(<AutosaveProbe clock={fake.clock} />);
    const saveSpy = vi.spyOn(harness.guides, 'save');

    // 250ms 간격으로 계속 고친다. debounce만 있으면 영원히 저장되지 않는다.
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        store().updateMeta({ title: `타자 ${i}` });
      });
      await act(async () => {
        await fake.advance(250);
      });
    }

    expect(saveSpy).toHaveBeenCalled();
    expect(fake.now()).toBeLessThanOrEqual(AUTOSAVE_MAX_WAIT_MS);
  });

  it('편집 화면이 자동 저장에 실제로 연결돼 있다', async () => {
    const id = await openEditorOnNewGuide();
    const saveSpy = vi.spyOn(harness.guides, 'save');

    await user().type(screen.getByLabelText(/가이드 제목/), '연결 확인');

    // 실시간이다. 상한(1초)에 여유를 둔다.
    await waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 2000 });
    expect((await harness.guides.get(id))?.meta.title).toBe('연결 확인');
  });
});

describe('저장 상태 표시 (M4 DoD 4·8)', () => {
  it('저장 중 → 저장됨으로 바뀌고 스크린 리더에 전달된다', async () => {
    await openEditorOnNewGuide();

    const indicator = screen.getByTestId('save-state');
    expect(indicator.getAttribute('role')).toBe('status');
    expect(indicator.getAttribute('aria-live')).toBe('polite');
    expect(indicator.textContent).toContain('저장할 변경 없음');

    const release = harness.holdSaves();
    store().updateMeta({ title: '상태 확인' });
    const saving = store().save();

    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toContain('저장 중'));

    release();
    await saving;

    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toContain('저장됨'));
  });

  it('저장 실패가 화면에 남는다', async () => {
    await openEditorOnNewGuide();

    store().updateMeta({ title: '실패' });
    harness.failNextSave(new Error('용량 초과'));
    await store().save();

    await waitFor(() => {
      const indicator = screen.getByTestId('save-state');
      expect(indicator.textContent).toContain('저장 실패');
      expect(indicator.textContent).toContain('용량 초과');
    });
  });

  // 저장 응답이 늦게 도착해도 그 사이의 입력이 saved로 덮이면 안 된다.
  it('저장 중 추가 입력이 있으면 오래된 응답을 저장됨으로 표시하지 않는다', async () => {
    const id = await openEditorOnNewGuide();

    const release = harness.holdSaves();
    store().updateMeta({ title: '첫 번째' });
    const saving = store().save();
    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toContain('저장 중'));

    store().updateMeta({ title: '두 번째' });
    release();
    await saving;

    expect(screen.getByTestId('save-state').textContent).not.toContain('저장됨');
    expect(store().dirty).toBe(true);
    expect(store().document?.meta.title).toBe('두 번째');

    await store().save();
    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toContain('저장됨'));
    expect((await harness.guides.get(id))?.meta.title).toBe('두 번째');
  });
});

describe('저장 실패와 데이터 보존 (M4 DoD 5)', () => {
  it('실패해도 메모리 편집 내용과 이전 성공 스냅샷이 모두 남는다', async () => {
    const id = await openEditorOnNewGuide();

    store().updateMeta({ title: '성공한 제목' });
    await store().save();
    await waitFor(() => expect(store().saveState).toBe('saved'));

    store().updateMeta({ title: '실패할 제목' });
    harness.failNextSave(new Error('용량 초과'));
    await store().save();

    expect(store().document?.meta.title).toBe('실패할 제목');
    expect((await harness.guides.get(id))?.meta.title).toBe('성공한 제목');
  });
});

describe('단계 재정렬과 삭제 (M4 DoD 6)', () => {
  it('위로 이동해도 모든 step ID가 유지되고 order만 다시 매겨진다', async () => {
    await openEditorOnNewGuide();
    const person = user();

    await person.click(screen.getByTestId('outline-add-step'));
    await person.click(screen.getByTestId('outline-add-step'));

    const before = store().document!.steps.map((step) => step.id);
    const blocksBefore = store().document!.steps.flatMap((s) => s.blocks.map((b) => b.id));

    // 개요에서 마지막 단계를 고르고 위로 옮긴다.
    await showStep(2);
    await person.click(screen.getByRole('button', { name: /단계 3 위로 이동/ }));

    const after = store().document!.steps;
    expect(new Set(after.map((step) => step.id))).toEqual(new Set(before));
    expect(after.map((step) => step.id)).toEqual([before[0], before[2], before[1]]);
    expect(after.map((step) => step.order)).toEqual([0, 1, 2]);
    expect(after.flatMap((s) => s.blocks.map((b) => b.id)).sort()).toEqual(blocksBefore.sort());
  });

  it('이동하면 라이브 영역에 위치를 알린다 (디자인 §2.2.1)', async () => {
    await openEditorOnNewGuide();
    const person = user();
    await person.click(screen.getByTestId('outline-add-step'));

    await showStep(1);
    await person.click(screen.getByRole('button', { name: /단계 2 위로 이동/ }));

    const live = screen.getAllByRole('status').find((node) => node.className.includes('sr-only'));
    await waitFor(() => expect(live?.textContent).toContain('2개 중 1번째로 이동됨'));
  });

  it('마지막 단계 삭제 버튼은 비활성이다', async () => {
    await openEditorOnNewGuide();
    await showStep();
    expect(screen.getByTestId('step-remove').hasAttribute('disabled')).toBe(true);
  });

  it('삭제 확인 대화상자는 취소에 포커스를 두고 Escape로 닫힌다', async () => {
    await openEditorOnNewGuide();
    const person = user();
    await person.click(screen.getByTestId('outline-add-step'));
    await screen.findByTestId('step-editor');

    await person.click(screen.getByTestId('step-remove'));

    const dialog = await screen.findByRole('dialog');
    const cancel = within(dialog).getByRole('button', { name: '취소' });
    expect(window.document.activeElement).toBe(cancel);

    await person.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store().document?.steps).toHaveLength(2);
  });

  it('확인하면 단계가 지워진다', async () => {
    await openEditorOnNewGuide();
    const person = user();
    await person.click(screen.getByTestId('outline-add-step'));
    await screen.findByTestId('step-editor');
    const removedId = store().document!.steps[1]!.id;

    await person.click(screen.getByTestId('step-remove'));
    await person.click(await screen.findByTestId('step-remove-confirm'));

    await waitFor(() => expect(store().document?.steps).toHaveLength(1));
    expect(store().document?.steps.some((step) => step.id === removedId)).toBe(false);
  });
});

describe('가이드 복제·이름 변경·삭제 (M4 DoD 7, FR-001)', () => {
  it('복제하면 새 문서가 생기고 원본은 그대로다', async () => {
    const id = await store().createGuide({ title: '원본' });
    const before = await harness.guides.get(id);

    renderApp('/');
    await screen.findByTestId('guide-card');
    await user().click(screen.getByTestId('guide-duplicate'));

    await waitFor(() => expect(screen.getAllByTestId('guide-card')).toHaveLength(2));
    expect(await harness.guides.get(id)).toEqual(before);
    expect(
      store()
        .library.map((item) => item.title)
        .sort(),
    ).toEqual(['원본', '원본 (사본)']);
  });

  it('이름 변경 대화상자가 목록과 저장소를 함께 바꾼다', async () => {
    const id = await store().createGuide({ title: '옛 이름' });
    renderApp('/');
    await screen.findByTestId('guide-card');
    const person = user();

    await person.click(screen.getByTestId('guide-rename'));
    const input = await screen.findByTestId('rename-input');
    await person.clear(input);
    await person.type(input, '새 이름');
    await person.click(screen.getByTestId('rename-confirm'));

    await waitFor(() => expect(screen.getByTestId('guide-card').textContent).toContain('새 이름'));
    expect((await harness.guides.get(id))?.meta.title).toBe('새 이름');
  });

  it('삭제는 확인을 거치고 취소에 초기 포커스를 둔다', async () => {
    await store().createGuide({ title: '지울 가이드' });
    renderApp('/');
    await screen.findByTestId('guide-card');
    const person = user();

    await person.click(screen.getByTestId('guide-remove'));
    const dialog = await screen.findByRole('dialog');
    expect(window.document.activeElement).toBe(
      within(dialog).getByRole('button', { name: '취소' }),
    );

    await person.click(screen.getByTestId('remove-confirm'));

    await waitFor(() => expect(screen.queryByTestId('guide-card')).toBeNull());
    expect(store().library).toEqual([]);
  });
});

describe('메모리 모드 배너 (M3 DoD 6)', () => {
  it('메모리 백엔드에서는 유실 경고를 계속 띄운다', async () => {
    await openEditorOnNewGuide();
    const banner = screen.getAllByTestId('storage-banner')[0]!;
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('새로고침하면 사라집니다');
  });
});

describe('미리보기 (기술 §2.1.4)', () => {
  it('저장을 기다리지 않고 현재 초안을 보여 주며 원본을 바꾸지 않는다', async () => {
    const id = await openEditorOnNewGuide();
    const person = user();

    // 저장을 붙잡아 둔 채 미리보기로 넘어간다.
    harness.holdSaves();
    await person.type(screen.getByLabelText(/가이드 제목/), '저장 안 된 제목');
    await person.click(screen.getByRole('button', { name: '미리보기' }));

    expect(await screen.findByRole('heading', { level: 1, name: '저장 안 된 제목' })).toBeTruthy();
    // 미리보기는 문서를 바꾸지 않는다.
    expect(store().document?.meta.title).toBe('저장 안 된 제목');
    expect((await harness.guides.get(id))?.meta.title).toBe('');
  });
});
