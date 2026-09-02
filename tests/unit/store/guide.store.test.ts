import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetRepository } from '@/storage/asset.repository.ts';
import { createMemoryBackend, type StorageBackend } from '@/storage/db.ts';
import { GuideRepository } from '@/storage/guide.repository.ts';
import { RecoveryRepository } from '@/storage/recovery.repository.ts';
import {
  configureBackendOpener,
  configureGuideStore,
  findStepReferences,
  moveById,
  resetGuideStore,
  useGuideStore,
} from '@/store/guide.store.ts';

const FIXED_NOW = '2026-08-31T00:00:00.000Z';

/** 밖에서 풀 수 있는 Promise. 클로저 대입은 TS가 좁혀 버려 호출할 수 없다. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** 예약된 마이크로태스크가 모두 끝나게 한다. */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

let idCounter = 0;
const nextId = (prefix: string) => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

interface Harness {
  backend: StorageBackend;
  guides: GuideRepository;
  /** 다음 저장을 실패시킨다. 성공 스냅샷 보존을 확인할 때 쓴다. */
  failNextSave: (error: Error) => void;
}

function setup(): Harness {
  const backend = createMemoryBackend('테스트');
  const guides = new GuideRepository(backend);

  let pendingFailure: Error | null = null;
  const realSave = guides.save.bind(guides);
  guides.save = async (document) => {
    if (pendingFailure !== null) {
      const error = pendingFailure;
      pendingFailure = null;
      throw error;
    }
    await realSave(document);
  };

  configureGuideStore({
    guides,
    assets: new AssetRepository(backend),
    recovery: new RecoveryRepository(backend),
    mode: 'memory',
    newId: nextId,
    now: () => FIXED_NOW,
  });

  return {
    backend,
    guides,
    failNextSave: (error) => {
      pendingFailure = error;
    },
  };
}

const store = () => useGuideStore.getState();

async function openNewGuide(): Promise<string> {
  const id = await store().createGuide();
  await store().loadGuide(id);
  return id;
}

beforeEach(() => {
  resetGuideStore();
  setup();
});

describe('순수 도우미', () => {
  const items = [
    { id: 'a', order: 0 },
    { id: 'b', order: 1 },
    { id: 'c', order: 2 },
  ];

  it('moveById는 order만 다시 매기고 ID는 그대로 둔다', () => {
    const moved = moveById(items, 'a', 1);
    expect(moved?.map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(moved?.map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it('범위를 벗어나면 null이다', () => {
    expect(moveById(items, 'a', -1)).toBeNull();
    expect(moveById(items, 'c', 1)).toBeNull();
    expect(moveById(items, '없음', 1)).toBeNull();
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const snapshot = structuredClone(items);
    moveById(items, 'a', 2);
    expect(items).toEqual(snapshot);
  });
});

describe('가이드 생성과 열기 (M4 DoD 1)', () => {
  it('새 가이드는 첫 단계가 있는 기본 문서로 열린다', async () => {
    await openNewGuide();

    const doc = store().document;
    expect(doc).not.toBeNull();
    expect(doc?.steps).toHaveLength(1);
    expect(doc?.startStepId).toBe(doc?.steps[0]?.id);
    expect(store().status).toBe('ready');
    expect(store().dirty).toBe(false);
  });

  it('생성 직후 목록에 나타난다 (FR-001)', async () => {
    await store().createGuide({ title: '첫 가이드' });
    expect(store().library.map((item) => item.title)).toEqual(['첫 가이드']);
  });

  it('없는 가이드를 열면 missing이다', async () => {
    await store().loadGuide('없음');
    expect(store().status).toBe('missing');
    expect(store().document).toBeNull();
  });
});

describe('편집과 변경 추적', () => {
  it('메타 수정이 dirty와 변경 번호를 올린다', async () => {
    await openNewGuide();
    const before = store().changeSeq;

    store().updateMeta({ title: '고친 제목' });

    expect(store().document?.meta.title).toBe('고친 제목');
    expect(store().dirty).toBe(true);
    expect(store().changeSeq).toBe(before + 1);
  });

  it('저장 실패 표시는 타자로 지워지지 않는다', async () => {
    const harness = setup();
    await openNewGuide();
    store().updateMeta({ title: 'x' });
    harness.failNextSave(new Error('디스크 없음'));
    await store().save();
    expect(store().saveState).toBe('error');

    store().updateMeta({ title: 'xy' });
    expect(store().saveState).toBe('error');
  });

  it('문서가 없으면 편집 액션이 아무 일도 하지 않는다', () => {
    expect(store().addStep()).toBeNull();
    expect(store().addPreparation()).toBeNull();
    expect(store().moveStep('없음', 1)).toBe(false);
    expect(store().changeSeq).toBe(0);
  });
});

describe('준비물과 경고 (FR-003·FR-004)', () => {
  it('추가·수정·삭제·재정렬이 동작한다', async () => {
    await openNewGuide();

    const first = store().addPreparation();
    const second = store().addPreparation();
    expect(store().document?.preparation).toHaveLength(2);

    store().updatePreparation(first!, { label: '드라이버', required: false });
    expect(store().document?.preparation[0]?.label).toBe('드라이버');
    expect(store().document?.preparation[0]?.required).toBe(false);

    expect(store().movePreparation(second!, -1)).toBe(true);
    expect(store().document?.preparation.map((item) => item.id)).toEqual([second, first]);
    expect(store().document?.preparation.map((item) => item.order)).toEqual([0, 1]);

    store().removePreparation(first!);
    expect(store().document?.preparation).toHaveLength(1);
    expect(store().document?.preparation[0]?.order).toBe(0);
  });

  it('경고는 기본 심각도가 주의다', async () => {
    await openNewGuide();
    const id = store().addWarning();
    expect(store().document?.warnings[0]?.severity).toBe('warning');

    store().updateWarning(id!, { severity: 'danger', requiresAcknowledgement: true });
    expect(store().document?.warnings[0]?.severity).toBe('danger');
  });

  it('수정 패치가 ID를 덮어쓰지 못한다', async () => {
    await openNewGuide();
    const id = store().addPreparation();
    store().updatePreparation(id!, { id: '바꾼-아이디' } as never);
    expect(store().document?.preparation[0]?.id).toBe(id);
  });
});

describe('단계 재정렬 (M4 DoD 6, INV-04)', () => {
  it('재정렬 후 모든 ID가 유지되고 order만 정규화된다', async () => {
    await openNewGuide();
    store().addStep();
    store().addStep();

    const before = store().document!.steps.map((step) => step.id);
    const blockIdsBefore = store().document!.steps.flatMap((step) =>
      step.blocks.map((block) => block.id),
    );
    const startBefore = store().document!.startStepId;

    expect(store().moveStep(before[2]!, -1)).toBe(true);

    const after = store().document!.steps;
    expect(new Set(after.map((step) => step.id))).toEqual(new Set(before));
    expect(after.map((step) => step.id)).toEqual([before[0], before[2], before[1]]);
    expect(after.map((step) => step.order)).toEqual([0, 1, 2]);
    expect(store().document!.startStepId).toBe(startBefore);
    expect(store().document!.steps.flatMap((step) => step.blocks.map((block) => block.id))).toEqual(
      expect.arrayContaining(blockIdsBefore),
    );
  });

  it('reorderSteps는 대상 위치로 옮긴다', async () => {
    await openNewGuide();
    store().addStep();
    store().addStep();
    const ids = store().document!.steps.map((step) => step.id);

    expect(store().reorderSteps(ids[0]!, ids[2]!)).toBe(true);
    expect(store().document!.steps.map((step) => step.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('같은 자리로 옮기면 아무 일도 하지 않는다', async () => {
    await openNewGuide();
    const ids = store().document!.steps.map((step) => step.id);
    const seq = store().changeSeq;
    expect(store().reorderSteps(ids[0]!, ids[0]!)).toBe(false);
    expect(store().changeSeq).toBe(seq);
  });
});

describe('단계 추가·복제·삭제', () => {
  it('지정한 단계 바로 뒤에 추가한다', async () => {
    await openNewGuide();
    const first = store().document!.steps[0]!.id;
    store().addStep();
    const inserted = store().addStep(first);

    expect(store().document!.steps.map((step) => step.id)[1]).toBe(inserted);
    expect(store().document!.steps.map((step) => step.order)).toEqual([0, 1, 2]);
  });

  it('복제는 새 ID를 쓰고 분기 규칙을 가져오지 않는다', async () => {
    await openNewGuide();
    const source = store().document!.steps[0]!;
    store().updateStep(source.id, {
      title: '원본',
      branchRules: [{ id: 'rule-1', operator: 'checked', targetStepId: source.id, priority: 10 }],
    });

    const copyId = store().duplicateStep(source.id);
    const copy = store().document!.steps.find((step) => step.id === copyId)!;

    expect(copyId).not.toBe(source.id);
    expect(copy.title).toBe('원본 (사본)');
    expect(copy.branchRules).toEqual([]);
    expect(copy.blocks.map((block) => block.id)).not.toEqual(source.blocks.map((b) => b.id));
    // 원본은 그대로다.
    expect(store().document!.steps[0]!.branchRules).toHaveLength(1);
  });

  it('마지막 단계는 삭제하지 않는다', async () => {
    await openNewGuide();
    expect(store().removeStep(store().document!.steps[0]!.id)).toEqual({
      status: 'rejected',
      reason: 'lastStep',
    });
    expect(store().document!.steps).toHaveLength(1);
  });

  it('삭제는 끊긴 참조를 정리하고 영향 범위를 알려 준다', async () => {
    await openNewGuide();
    store().addStep();
    const [first, second] = store().document!.steps.map((step) => step.id);

    store().updateStep(first!, {
      defaultNextStepId: second!,
      branchRules: [{ id: 'rule-1', operator: 'checked', targetStepId: second!, priority: 10 }],
    });

    // 참조가 있으면 처리 방법 없이는 지우지 않는다. (M6 DoD 9)
    const blocked = store().removeStep(second!);
    expect(blocked).toEqual({
      status: 'needsPlan',
      impact: { defaultNextFrom: [first], branchRuleFrom: [first], wasStartStep: false },
    });
    expect(store().document!.steps).toHaveLength(2);

    const outcome = store().removeStep(second!, { kind: 'dropRules' });
    expect(outcome).toMatchObject({ status: 'removed' });

    const remaining = store().document!.steps[0]!;
    expect(remaining.defaultNextStepId).toBeUndefined();
    expect(remaining.branchRules).toEqual([]);
  });

  it('시작 단계를 지우면 첫 단계가 새 시작점이 된다', async () => {
    await openNewGuide();
    store().addStep();
    const [first, second] = store().document!.steps.map((step) => step.id);

    const outcome = store().removeStep(first!);

    expect(outcome).toMatchObject({ status: 'removed' });
    expect(outcome).toMatchObject({ impact: { wasStartStep: true } });
    expect(store().document!.startStepId).toBe(second);
  });

  it('findStepReferences는 문서를 바꾸지 않는다', async () => {
    await openNewGuide();
    const doc = store().document!;
    const snapshot = structuredClone(doc);
    findStepReferences(doc, doc.steps[0]!.id);
    expect(store().document).toEqual(snapshot);
  });
});

describe('블록 편집', () => {
  it('첫 텍스트 블록의 markdown을 고친다', async () => {
    await openNewGuide();
    const step = store().document!.steps[0]!;
    const block = step.blocks[0]!;

    store().updateBlock(step.id, block.id, { markdown: '본문' } as never);

    const updated = store().document!.steps[0]!.blocks[0]!;
    expect(updated).toMatchObject({ id: block.id, type: 'text', markdown: '본문' });
  });

  it('패치가 블록 타입을 바꾸지 못한다', async () => {
    await openNewGuide();
    const step = store().document!.steps[0]!;
    const block = step.blocks[0]!;

    store().updateBlock(step.id, block.id, { type: 'code' } as never);

    expect(store().document!.steps[0]!.blocks[0]!.type).toBe('text');
  });
});

describe('가이드 복제 (M4 DoD 7)', () => {
  it('새 문서 ID를 만들고 원본을 바꾸지 않는다', async () => {
    const sourceId = await openNewGuide();
    store().updateMeta({ title: '원본 가이드' });
    await store().save();
    const before = structuredClone(store().document!);

    const copyId = await store().duplicateGuide(sourceId);
    expect(copyId).not.toBe(sourceId);

    await store().loadGuide(sourceId);
    expect(store().document).toEqual(before);

    await store().loadGuide(copyId);
    expect(store().document!.id).toBe(copyId);
    expect(store().document!.meta.title).toBe('원본 가이드 (사본)');
    expect(store().document!.revision).toBe(1);
  });
});

describe('저장 (M4 DoD 2·4·5)', () => {
  it('저장하면 새로고침 후에도 마지막 성공 상태가 복원된다', async () => {
    const id = await openNewGuide();
    store().updateMeta({ title: '제목', audience: '대상' });
    store().addPreparation();
    store().addWarning();
    for (let i = 0; i < 4; i += 1) store().addStep();

    await store().save();
    expect(store().saveState).toBe('saved');
    expect(store().dirty).toBe(false);

    // "새로고침" - 스토어를 비우고 저장소에서 다시 읽는다.
    resetGuideStore();
    await store().loadGuide(id);

    const doc = store().document!;
    expect(doc.meta.title).toBe('제목');
    expect(doc.meta.audience).toBe('대상');
    expect(doc.preparation).toHaveLength(1);
    expect(doc.warnings).toHaveLength(1);
    expect(doc.steps).toHaveLength(5);
  });

  it('저장할 변경이 없으면 저장소를 건드리지 않는다', async () => {
    const harness = setup();
    await openNewGuide();
    const spy = vi.spyOn(harness.guides, 'save');

    await store().save();

    expect(spy).not.toHaveBeenCalled();
    expect(store().saveState).toBe('idle');
  });

  // 오래된 응답이 최신 변경을 덮거나 saved로 오표시하면 안 된다.
  it('저장 중 들어온 변경 때문에 오래된 응답을 saved로 표시하지 않는다', async () => {
    const harness = setup();
    const id = await openNewGuide();

    const gate = deferred();
    const realSave = harness.guides.save.bind(harness.guides);
    harness.guides.save = async (document) => {
      await realSave(document);
      await gate.promise;
    };

    store().updateMeta({ title: '첫 번째' });
    const saving = store().save();
    expect(store().saveState).toBe('saving');

    // 쓰기가 저장소에 닿아 응답 대기에 들어갈 때까지 보낸다.
    await flushMicrotasks();

    // 저장이 도는 동안 사용자가 계속 친다.
    store().updateMeta({ title: '두 번째' });
    gate.resolve();
    await saving;

    expect(store().saveState).toBe('saving');
    expect(store().dirty).toBe(true);
    // 최신 메모리 값이 오래된 스냅샷으로 덮이지 않았다.
    expect(store().document!.meta.title).toBe('두 번째');

    harness.guides.save = realSave;
    await store().save();

    expect(store().saveState).toBe('saved');
    expect(store().dirty).toBe(false);

    resetGuideStore();
    await store().loadGuide(id);
    expect(store().document!.meta.title).toBe('두 번째');
  });

  it('저장 실패 시 메모리 편집 내용과 이전 성공 스냅샷이 모두 남는다', async () => {
    const harness = setup();
    const id = await openNewGuide();

    store().updateMeta({ title: '성공한 제목' });
    await store().save();
    expect(store().saveState).toBe('saved');

    store().updateMeta({ title: '실패할 제목' });
    harness.failNextSave(new Error('용량 초과'));
    await store().save();

    expect(store().saveState).toBe('error');
    expect(store().saveError).toContain('용량 초과');
    // 메모리 편집 내용은 그대로다.
    expect(store().document!.meta.title).toBe('실패할 제목');
    expect(store().dirty).toBe(true);
    // 저장소의 마지막 성공 스냅샷도 그대로다.
    expect((await harness.guides.get(id))!.meta.title).toBe('성공한 제목');
  });

  it('실패 뒤 다시 저장하면 성공한다', async () => {
    const harness = setup();
    await openNewGuide();
    store().updateMeta({ title: 'A' });
    harness.failNextSave(new Error('일시 오류'));
    await store().save();
    expect(store().saveState).toBe('error');

    await store().save();
    expect(store().saveState).toBe('saved');
    expect(store().saveError).toBeUndefined();
  });

  it('저장이 updatedAt을 갱신한다', async () => {
    await openNewGuide();
    store().updateMeta({ title: 'A' });
    await store().save();
    expect(store().document!.updatedAt).toBe(FIXED_NOW);
    expect(store().lastSavedAt).toBe(FIXED_NOW);
  });
});

describe('삭제와 이름 변경 (FR-001)', () => {
  it('이름을 바꾸면 목록과 저장소가 함께 바뀐다', async () => {
    const harness = setup();
    const id = await store().createGuide({ title: '옛 이름' });

    await store().renameGuide(id, '새 이름');

    expect(store().library[0]?.title).toBe('새 이름');
    expect((await harness.guides.get(id))!.meta.title).toBe('새 이름');
  });

  it('열려 있는 문서의 이름 변경이 메모리에도 반영된다', async () => {
    const id = await openNewGuide();
    await store().renameGuide(id, '바뀐 이름');
    expect(store().document!.meta.title).toBe('바뀐 이름');
  });

  it('삭제하면 목록에서 사라지고 열려 있던 문서가 닫힌다', async () => {
    const id = await openNewGuide();
    await store().removeGuide(id);

    expect(store().library).toEqual([]);
    expect(store().document).toBeNull();
    expect(store().status).toBe('idle');
  });
});

describe('저장소 초기화 경합', () => {
  // Firefox E2E에서 3번에 1번꼴로 재현됐다. IndexedDB가 열리기 전에 CTA를
  // 누르면 `guideStoreDeps()`가 던지고, 그 예외가 클릭 핸들러 안에서 사라져
  // 사용자에게는 "버튼이 안 눌린다"로 보였다.
  it('저장소가 열리기 전에 누른 새 가이드 버튼이 조용히 실패하지 않는다', async () => {
    const gate = deferred();
    configureBackendOpener(async () => {
      await gate.promise;
      return createMemoryBackend('테스트');
    });
    resetGuideStore();

    // 화면이 초기화를 시작하자마자 사용자가 누른다.
    const initializing = store().initStorage();
    const creating = store().createGuide({ title: '급한 클릭' });

    gate.resolve();
    await initializing;
    const id = await creating;

    expect(id).toBeTruthy();
    await store().refreshLibrary();
    expect(store().library.map((item) => item.title)).toEqual(['급한 클릭']);

    configureBackendOpener(null);
  });

  it('여러 번 불러도 저장소를 한 번만 연다', async () => {
    let opens = 0;
    configureBackendOpener(async () => {
      opens += 1;
      return createMemoryBackend('테스트');
    });
    resetGuideStore();

    await Promise.all([store().initStorage(), store().initStorage(), store().initStorage()]);
    await store().initStorage();

    expect(opens).toBe(1);
    expect(store().storageMode).toBe('memory');

    configureBackendOpener(null);
  });
});

describe('체크리스트 항목 (M5 할 일 1)', () => {
  /** 체크리스트 블록 하나를 가진 단계를 만든다. */
  async function withChecklist() {
    await openNewGuide();
    const stepId = store().document!.steps[0]!.id;
    const blockId = store().addBlock(stepId, 'checklist')!;
    return { stepId, blockId };
  }

  const itemsOf = (stepId: string, blockId: string) => {
    const block = store()
      .document!.steps.find((step) => step.id === stepId)!
      .blocks.find((entry) => entry.id === blockId)!;
    if (block.type !== 'checklist') throw new Error('체크리스트가 아니다');
    return block.items;
  };

  it('기본 항목은 하나다', async () => {
    const { stepId, blockId } = await withChecklist();
    expect(itemsOf(stepId, blockId)).toHaveLength(1);
  });

  it('항목을 더하면 주입된 newId로 ID가 생긴다', async () => {
    const { stepId, blockId } = await withChecklist();
    const id = store().addChecklistItem(stepId, blockId);

    expect(id).toMatch(/^item-\d+$/);
    const items = itemsOf(stepId, blockId);
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({ id, label: '', required: true });
  });

  it('항목을 더해도 다른 필드는 그대로다', async () => {
    const { stepId, blockId } = await withChecklist();
    const first = itemsOf(stepId, blockId)[0]!;
    store().updateBlock(stepId, blockId, {
      items: [{ ...first, label: '전원 확인' }],
    } as never);

    store().addChecklistItem(stepId, blockId);

    expect(itemsOf(stepId, blockId)[0]).toEqual({ ...first, label: '전원 확인' });
  });

  it('항목을 지운다', async () => {
    const { stepId, blockId } = await withChecklist();
    const added = store().addChecklistItem(stepId, blockId)!;

    expect(store().removeChecklistItem(stepId, blockId, added)).toBe(true);
    expect(itemsOf(stepId, blockId).map((item) => item.id)).not.toContain(added);
  });

  it('없는 항목을 지우면 false이고 문서를 건드리지 않는다', async () => {
    const { stepId, blockId } = await withChecklist();
    const before = store().document;

    expect(store().removeChecklistItem(stepId, blockId, 'item-nope')).toBe(false);
    expect(store().document).toBe(before);
  });

  it('체크리스트가 아닌 블록에는 항목을 더하지 않는다', async () => {
    await openNewGuide();
    const stepId = store().document!.steps[0]!.id;
    const textBlockId = store().document!.steps[0]!.blocks[0]!.id;

    expect(store().addChecklistItem(stepId, textBlockId)).toBeNull();
    expect(store().removeChecklistItem(stepId, textBlockId, 'item-1')).toBe(false);
    expect(store().moveChecklistItem(stepId, textBlockId, 'item-1', 1)).toBe(false);
  });

  it('항목 순서를 바꾸고 ID는 유지한다 (INV-04)', async () => {
    const { stepId, blockId } = await withChecklist();
    const second = store().addChecklistItem(stepId, blockId)!;
    const first = itemsOf(stepId, blockId)[0]!.id;

    expect(store().moveChecklistItem(stepId, blockId, second, -1)).toBe(true);
    expect(itemsOf(stepId, blockId).map((item) => item.id)).toEqual([second, first]);
  });

  it('경계를 넘는 이동은 false이고 아무것도 바꾸지 않는다', async () => {
    const { stepId, blockId } = await withChecklist();
    const second = store().addChecklistItem(stepId, blockId)!;
    const before = store().document;

    expect(store().moveChecklistItem(stepId, blockId, second, 1)).toBe(false);
    expect(store().moveChecklistItem(stepId, blockId, second, -2)).toBe(false);
    expect(store().document).toBe(before);
  });

  it('다른 단계와 다른 블록을 건드리지 않는다', async () => {
    const { stepId, blockId } = await withChecklist();
    const otherBlockId = store().addBlock(stepId, 'checklist')!;
    const otherStepId = store().addStep()!;

    const otherBefore = itemsOf(stepId, otherBlockId);
    const otherStepBefore = store().document!.steps.find((step) => step.id === otherStepId);

    store().addChecklistItem(stepId, blockId);

    expect(itemsOf(stepId, otherBlockId)).toEqual(otherBefore);
    expect(store().document!.steps.find((step) => step.id === otherStepId)).toEqual(
      otherStepBefore,
    );
  });

  it('항목 변경은 dirty로 잡히고 저장 대상이 된다', async () => {
    const { stepId, blockId } = await withChecklist();
    await store().save();
    expect(store().dirty).toBe(false);

    store().addChecklistItem(stepId, blockId);
    expect(store().dirty).toBe(true);
  });
});
