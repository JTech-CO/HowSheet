/**
 * 리더 흐름 통합 테스트.
 *
 * 기준: 하네스 M7 DoD 1·2·3·5·6·7·9. 검증 블록이 이 경로를 직접 호출한다.
 *
 * 실제 스토어와 실제 `reader-runtime`을 쓴다. 진행 계산을 대역으로 넣으면
 * M7이 확인하려는 "화면이 실제 판정을 따르는가"가 대역의 동작이 된다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseGuideDocument } from '@/domain/guide.schema.ts';
import type { GuideDocument } from '@/domain/guide.types.ts';
import { createReaderStorage } from '@/reader-runtime/reader-storage.ts';
import type { ReaderKeyValueStore } from '@/reader-runtime/reader-storage.ts';
import { configureReaderStore, resetReaderStore } from '@/store/reader.store.ts';

import { guideStoreDeps } from '@/store/guide.store.ts';

import { renderApp, resetStore, setupStorage, store } from '../editor-core/harness.tsx';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');

function fixture(name: string): GuideDocument {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, `${name}.howsheet.json`), 'utf8'),
  );
  const outcome = parseGuideDocument(raw);
  if (!outcome.ok) throw new Error(`${name} 파싱 실패`);
  return outcome.document;
}

/** 리더가 쓰는 키·값 저장소. 테스트가 내용을 직접 볼 수 있게 Map을 노출한다. */
function memoryStore(): ReaderKeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

let progressStore: ReturnType<typeof memoryStore>;

beforeEach(() => {
  setupStorage();
  progressStore = memoryStore();
  configureReaderStore({
    // 저장을 즉시 반영해 테스트가 타이머를 기다리지 않게 한다. 예약 시점 자체는
    // `tests/unit/reader/reader-storage.test.ts`가 가짜 시계로 확인한다.
    storage: createReaderStorage({ store: progressStore, debounceMs: 0, maxWaitMs: 0 }),
    now: () => new Date().toISOString(),
  });
});

afterEach(() => {
  cleanup();
  configureReaderStore(null);
  resetReaderStore();
  vi.useRealTimers();
});

const user = () => userEvent.setup();

/**
 * 픽스처를 저장소에 그대로 심고 리더를 연다.
 *
 * 편집기를 거치지 않는다. 편집 UI로 분기 픽스처를 다시 만들면 이 테스트가
 * 리더가 아니라 편집기를 확인하게 된다.
 */
async function plant(name: string): Promise<GuideDocument> {
  const doc = fixture(name);
  await store().initStorage();
  await guideStoreDeps().guides.save(doc);
  return doc;
}

async function openReader(name: string): Promise<GuideDocument> {
  const doc = await plant(name);
  resetStore();
  renderApp(`/guide/${doc.id}/preview`);
  await screen.findByTestId('reader-root');
  return doc;
}

/** 필수 준비물과 필수 경고를 모두 확인한다. */
async function passIntroGate(doc: GuideDocument): Promise<void> {
  const person = user();
  const checks = screen.queryAllByTestId('preparation-check');
  for (const [index, item] of [...doc.preparation].sort((a, b) => a.order - b.order).entries()) {
    if (!item.required) continue;
    const box = checks[index];
    if (box !== undefined) await person.click(box);
  }
  for (const box of screen.queryAllByTestId('warning-ack')) {
    await person.click(box);
  }
}

describe('시작 게이트 (M7 DoD 1)', () => {
  it('준비물과 필수 경고를 확인하기 전에는 시작할 수 없다', async () => {
    const doc = await openReader('valid-linear-5step');

    expect(screen.getByTestId('reader-start')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('reader-start-blocked').textContent).toContain('확인하면');

    await passIntroGate(doc);
    await waitFor(() =>
      expect(screen.getByTestId('reader-start')).toHaveProperty('disabled', false),
    );
  });

  it('시작 화면은 단계 내용을 노출하지 않는다', async () => {
    await openReader('valid-linear-5step');
    // 디자인 §2.4.10 - 무엇이 필요한지까지다.
    expect(screen.queryByTestId('reader-step')).toBeNull();
  });

  it('시작하기 전에는 진행을 저장하지 않는다', async () => {
    await openReader('valid-linear-5step');
    // 화면을 여는 것만으로 진행이 생기면 다음 방문에 "0단계 이어하기"가 뜬다.
    expect(progressStore.map.size).toBe(0);
  });
});

describe('선형 흐름 (M7 DoD 3)', () => {
  it('시작부터 완료까지 간다', async () => {
    const doc = await openReader('valid-linear-5step');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));

    await screen.findByTestId('reader-step');

    for (let index = 0; index < doc.steps.length; index += 1) {
      const current = screen.getByTestId('reader-step').getAttribute('data-step-id');
      if (current === 'step-4') {
        // 필수 체크리스트 항목이 있는 단계. (DoD 2)
        await user().click(screen.getAllByRole('checkbox')[0]!);
      }
      await user().click(screen.getByTestId('reader-next'));
      if (screen.queryByTestId('completion-screen') !== null) break;
      await screen.findByTestId('reader-step');
    }

    expect(await screen.findByTestId('completion-screen')).toBeTruthy();
  });

  it('필수 항목을 답하기 전에는 다음이 막힌다 (DoD 2)', async () => {
    const doc = await openReader('valid-linear-5step');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');

    // step-4까지 간다.
    while (screen.getByTestId('reader-step').getAttribute('data-step-id') !== 'step-4') {
      await user().click(screen.getByTestId('reader-next'));
      await screen.findByTestId('reader-step');
    }

    await user().click(screen.getByTestId('reader-next'));
    expect(await screen.findByTestId('reader-blocked')).toBeTruthy();
    expect(screen.getByTestId('reader-step').getAttribute('data-step-id')).toBe('step-4');
  });

  it('단계가 바뀌면 제목으로 포커스가 간다 (DoD 9)', async () => {
    const doc = await openReader('valid-linear-5step');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');

    // 최초 진입에서는 옮기지 않는다. 요청하지 않은 포커스 이동을 만들지 않는다.
    expect(document.activeElement).not.toBe(screen.getByTestId('reader-step-title'));

    await user().click(screen.getByTestId('reader-next'));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('reader-step-title')),
    );
  });
});

describe('분기 흐름 (M7 DoD 3)', () => {
  it('선택에 따라 다른 경로로 간다', async () => {
    const doc = await openReader('valid-branched');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');

    // 선택과 이동은 분리돼 있다. 고른다고 바로 넘어가지 않는다. (디자인 §2.2.2)
    await user().click(screen.getAllByRole('radio')[0]!);
    expect(screen.getByTestId('reader-step').getAttribute('data-step-id')).toBe('step-start');

    await user().click(screen.getByTestId('reader-next'));
    await waitFor(() =>
      expect(screen.getByTestId('reader-step').getAttribute('data-step-id')).toBe('step-pc'),
    );
  });

  it('선택을 바꾸면 이후 경로가 다시 계산된다 (DoD 5)', async () => {
    const doc = await openReader('valid-branched');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');

    await user().click(screen.getAllByRole('radio')[1]!);
    await user().click(screen.getByTestId('reader-next'));
    await waitFor(() =>
      expect(screen.getByTestId('reader-step').getAttribute('data-step-id')).toBe('step-mobile'),
    );

    await user().click(screen.getByTestId('reader-back'));
    await waitFor(() =>
      expect(screen.getByTestId('reader-step').getAttribute('data-step-id')).toBe('step-start'),
    );

    await user().click(screen.getAllByRole('radio')[0]!);
    await user().click(screen.getByTestId('reader-next'));
    await waitFor(() =>
      expect(screen.getByTestId('reader-step').getAttribute('data-step-id')).toBe('step-pc'),
    );
  });

  it('진행률 분모는 활성 경로의 필수 단계 수다 (M6 DoD 8)', async () => {
    const doc = await openReader('valid-branched');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-progress');

    await user().click(screen.getAllByRole('radio')[0]!);

    // 문서에는 단계가 4개지만 PC 경로는 3개다.
    expect(doc.steps).toHaveLength(4);
    await waitFor(() =>
      expect(screen.getByTestId('reader-progress-ratio').textContent).toContain('필수 3개'),
    );
  });
});

describe('이어하기와 초기화 (M7 DoD 5·6)', () => {
  it('새로고침 후 진행이 복원된다', async () => {
    const doc = await openReader('valid-linear-5step');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');
    await user().click(screen.getByTestId('reader-next'));
    await waitFor(() =>
      expect(screen.getByTestId('reader-step').getAttribute('data-step-id')).toBe('step-2'),
    );

    // 새로고침. 저장소만 남는다.
    cleanup();
    resetReaderStore();
    resetStore();
    renderApp(`/guide/${doc.id}/preview`);

    const resume = await screen.findByTestId('resume-prompt');
    expect(within(resume).getByTestId('resume-continue')).toBeTruthy();

    await user().click(screen.getByTestId('resume-continue'));
    await waitFor(() =>
      expect(screen.getByTestId('reader-step').getAttribute('data-step-id')).toBe('step-2'),
    );
  });

  it('이어하기는 준비물 게이트를 다시 요구하지 않는다', async () => {
    const doc = await openReader('valid-linear-5step');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');

    cleanup();
    resetReaderStore();
    resetStore();
    renderApp(`/guide/${doc.id}/preview`);

    await user().click(await screen.findByTestId('resume-continue'));
    expect(await screen.findByTestId('reader-step')).toBeTruthy();
  });

  it('다른 revision의 진행은 덮어쓰지 않고 알려 준다', async () => {
    const doc = await openReader('valid-linear-5step');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');

    const keysBefore = [...progressStore.map.keys()];
    expect(keysBefore).toHaveLength(1);

    // 개정이 오르면 키가 갈린다. (INV-10)
    const next: GuideDocument = { ...doc, revision: doc.revision + 1 };
    await guideStoreDeps().guides.save(next);

    cleanup();
    resetReaderStore();
    resetStore();
    renderApp(`/guide/${doc.id}/preview`);

    expect(await screen.findByTestId('resume-other-revisions')).toBeTruthy();
    // 이전 개정의 기록이 그대로 남아 있다.
    expect([...progressStore.map.keys()]).toEqual(keysBefore);
  });

  it('처음부터를 고르면 시작 화면으로 돌아간다', async () => {
    const doc = await openReader('valid-linear-5step');
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');

    cleanup();
    resetReaderStore();
    resetStore();
    renderApp(`/guide/${doc.id}/preview`);

    await user().click(await screen.findByTestId('resume-restart'));
    expect(await screen.findByTestId('guide-intro')).toBeTruthy();
    expect(screen.getByTestId('reader-start')).toHaveProperty('disabled', true);
  });
});

describe('저장 실패 배너 (M7 DoD 7)', () => {
  it('세션 모드면 배너가 계속 보인다', async () => {
    configureReaderStore({
      storage: createReaderStorage({ store: null, unavailableReason: '테스트 사유' }),
      now: () => new Date().toISOString(),
    });

    const doc = await openReader('valid-linear-5step');
    const banner = await screen.findByTestId('reader-persist-banner');
    expect(banner.textContent).toContain('페이지를 닫으면');
    expect(banner.textContent).toContain('테스트 사유');

    // 진행해도 사라지지 않는다. (지속 배너)
    await passIntroGate(doc);
    await user().click(screen.getByTestId('reader-start'));
    await screen.findByTestId('reader-step');
    expect(screen.getByTestId('reader-persist-banner')).toBeTruthy();
  });
});
