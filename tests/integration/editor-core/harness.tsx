/**
 * 편집기 코어 통합 테스트 도우미.
 *
 * 실제 라우터와 실제 스토어를 쓰고 저장소만 메모리 백엔드로 바꾼다. 스토어를
 * 흉내 내면 M4 DoD가 검증하려는 경합·복원 동작이 테스트 대역의 동작이 된다.
 */

import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { DashboardPage } from '@/pages/DashboardPage/DashboardPage.tsx';
import { EditorPage } from '@/pages/EditorPage/EditorPage.tsx';
import { PreviewPage } from '@/pages/PreviewPage/PreviewPage.tsx';
import { AssetRepository } from '@/storage/asset.repository.ts';
import { createMemoryBackend, type StorageBackend } from '@/storage/db.ts';
import { GuideRepository } from '@/storage/guide.repository.ts';
import { PreferenceStore, type KeyValueStore } from '@/storage/local-storage.ts';
import { RecoveryRepository } from '@/storage/recovery.repository.ts';
import { configureGuideStore, resetGuideStore, useGuideStore } from '@/store/guide.store.ts';
import { configureThemeStore, resetUiStore } from '@/store/ui.store.ts';

export const FIXED_NOW = '2026-08-31T00:00:00.000Z';

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function memoryKeyValueStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
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

export interface EditorHarness {
  backend: StorageBackend;
  guides: GuideRepository;
  /** 다음 저장을 실패시킨다. */
  failNextSave: (error: Error) => void;
  /** 저장을 붙잡아 둔다. 반환한 함수를 부르면 풀린다. */
  holdSaves: () => () => void;
}

/** 저장소를 새로 만들고 스토어에 물린다. */
export function setupStorage(): EditorHarness {
  const backend = createMemoryBackend('테스트');
  const guides = new GuideRepository(backend);

  let pendingFailure: Error | null = null;
  let gate: Promise<void> | null = null;
  const realSave = guides.save.bind(guides);

  guides.save = async (document) => {
    if (pendingFailure !== null) {
      const error = pendingFailure;
      pendingFailure = null;
      throw error;
    }
    // 쓰기 **전에** 막는다. 뒤에서 막으면 "저장 중"인 동안 이미 저장소가
    // 바뀌어 있어, 저장을 붙잡아 두는 테스트가 아무것도 증명하지 못한다.
    if (gate !== null) await gate;
    await realSave(document);
  };

  configureGuideStore({
    guides,
    assets: new AssetRepository(backend),
    recovery: new RecoveryRepository(backend),
    mode: 'memory',
    newId: nextId,
    now: () => new Date().toISOString(),
  });

  // 테마는 실제 localStorage 대신 메모리를 쓴다.
  configureThemeStore(new PreferenceStore({ store: memoryKeyValueStore() }));

  resetGuideStore();
  resetUiStore();

  return {
    backend,
    guides,
    failNextSave: (error) => {
      pendingFailure = error;
    },
    holdSaves: () => {
      let release: () => void = () => {};
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = null;
        release();
      };
    },
  };
}

/** 라우터 표는 `app/router.tsx`와 같다. */
export function renderApp(initialPath: string): RenderResult {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/guide/:id/edit" element={<EditorPage />} />
        <Route path="/guide/:id/preview" element={<PreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

export const store = () => useGuideStore.getState();

/** 새로고침을 흉내 낸다. 메모리 상태를 버리고 저장소만 남긴다. */
export function resetStore(): void {
  resetGuideStore();
  resetUiStore();
}
