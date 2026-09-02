/**
 * 편집 문서 스토어.
 *
 * 기준: 기술 백서 §4.1.1(상태 범위), §4.1.2(스토어 예시), §4.1.3(업데이트 규칙),
 * §4.3.2(작성 및 자동 저장). 하네스 M4 DoD 1~7, INV-04, INV-08.
 *
 * 여기에는 **영속 도메인 상태**만 둔다. 선택한 단계·열린 패널 같은 일시 UI
 * 상태는 `ui.store.ts`가 갖는다. 두 가지를 한 스토어에 두면 UI 조작이 문서
 * 변경으로 잘못 집계돼 자동 저장이 헛돈다. (기술 §4.1.1)
 *
 * 폼은 이 스토어를 단일 기준으로 삼는다. 폼 지역 상태에 문서를 복제해 두고
 * 양방향 동기화하지 않는다. (하네스 M4 주의)
 */

import { create } from 'zustand';

import {
  createBlock,
  createFirstStep,
  createGuideDocument,
  normalizeOrder,
  type IdFactory,
} from '../domain/guide.defaults.ts';
import { ISSUE_CODES } from '../domain/validation.types.ts';
import type {
  BranchRule,
  ChecklistBlock,
  ChecklistItem,
  ContentBlock,
  DecisionBlock,
  DecisionOption,
  ContentBlockType,
  GuideDocument,
  GuideMeta,
  GuideSettings,
  GuideStep,
  PreparationItem,
  WarningBlock,
} from '../domain/guide.types.ts';
import { checksumOf } from '../features/assets/checksum.ts';
import {
  createBrowserImageCodec,
  optimizeImage,
  type ImageCodec,
  type ImageIssue,
} from '../features/assets/image-optimizer.ts';
import { AssetRepository, toManifestItem } from '../storage/asset.repository.ts';
import {
  openStorage,
  type StorageBackend,
  type StorageMode,
  type StoredAsset,
} from '../storage/db.ts';
import { GuideRepository, type GuideSummary } from '../storage/guide.repository.ts';
import { RecoveryRepository } from '../storage/recovery.repository.ts';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

/** 편집 화면이 다루는 섹션. 개요와 중앙 편집기가 같은 이름을 쓴다. */
export type EditorSection = 'meta' | 'preparation' | 'warnings' | 'steps' | 'validation';

export interface GuideStoreDeps {
  guides: GuideRepository;
  assets: AssetRepository;
  recovery: RecoveryRepository;
  mode: StorageMode;
  storageUnavailableReason?: string;
  newId: IdFactory;
  now: () => string;
}

/**
 * 삭제되는 단계를 가리키던 참조를 어떻게 할지. (기술 §2.2.3, 하네스 M6 DoD 9)
 *
 *   - `retarget` - 참조를 다른 단계로 옮긴다.
 *   - `dropRules` - 참조하던 분기 규칙과 기본 경로를 지운다.
 */
export type StepRemovalPlan = { kind: 'retarget'; targetStepId: string } | { kind: 'dropRules' };

/**
 * 단계 삭제 결과.
 *
 * `needsPlan`이면 **문서를 하나도 바꾸지 않았다.** 참조가 있는 단계를 영향 처리
 * 없이 지울 수 없다는 것이 DoD 9다. M4까지는 참조를 조용히 고쳐서 지웠다.
 */
export type RemoveStepOutcome =
  | { status: 'removed'; impact: StepReferenceImpact }
  | { status: 'needsPlan'; impact: StepReferenceImpact }
  | { status: 'rejected'; reason: 'notFound' | 'lastStep' | 'invalidTarget' };

/** 선택지 삭제가 건드릴 분기 규칙 처리. `BranchRule.value`가 선택지 ID를 가리킨다. */
export type OptionRemovalPlan = { kind: 'retarget'; optionId: string } | { kind: 'dropRules' };

export type RemoveOptionOutcome =
  | { status: 'removed' }
  | { status: 'needsPlan'; referencingRuleIds: string[] }
  | { status: 'rejected'; reason: 'notFound' | 'lastOption' };

/** 단계 삭제가 함께 건드린 참조. 삭제 확인 대화상자가 미리 보여 준다. */
export interface StepReferenceImpact {
  /** `defaultNextStepId`가 이 단계를 가리키던 단계 ID. */
  defaultNextFrom: string[];
  /** 분기 규칙이 이 단계를 가리키던 단계 ID. */
  branchRuleFrom: string[];
  /** 이 단계가 시작 단계였는가. */
  wasStartStep: boolean;
}

export interface GuideStoreState {
  // ── 라이브러리 (대시보드)
  library: GuideSummary[];
  libraryStatus: LoadStatus;

  // ── 저장소 상태 (M3 DoD 6 배너)
  storageMode: StorageMode | null;
  storageUnavailableReason?: string;

  // ── 열린 문서
  document: GuideDocument | null;
  /**
   * 열린 문서의 자산 본문. 이미지 미리보기가 쓴다.
   * 문서의 `assets`는 manifest(메타)이고 이쪽이 실제 바이트다. (기술 §4.5.1)
   */
  loadedAssets: Record<string, StoredAsset>;
  status: LoadStatus;
  loadError?: string;

  // ── 저장
  dirty: boolean;
  saveState: SaveState;
  saveError?: string;
  lastSavedAt?: string;
  /**
   * 변경마다 증가한다. 저장 응답이 최신 상태에 해당하는지 판정하는 유일한
   * 기준이다. 오래된 응답을 `saved`로 표시하지 않기 위해 필요하다. (M4 DoD 4)
   */
  changeSeq: number;
  /** 저장소에 커밋된 마지막 `changeSeq`. */
  savedSeq: number;

  // ── 액션
  initStorage: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  createGuide: (options?: { title?: string }) => Promise<string>;
  duplicateGuide: (id: string) => Promise<string>;
  renameGuide: (id: string, title: string) => Promise<void>;
  removeGuide: (id: string) => Promise<void>;

  loadGuide: (id: string) => Promise<void>;
  refreshAssets: () => Promise<void>;
  closeGuide: () => void;

  updateMeta: (patch: Partial<GuideMeta>) => void;
  updateSettings: (patch: Partial<GuideSettings>) => void;

  addPreparation: () => string | null;
  updatePreparation: (id: string, patch: Partial<PreparationItem>) => void;
  removePreparation: (id: string) => void;
  movePreparation: (id: string, delta: number) => boolean;

  addWarning: () => string | null;
  updateWarning: (id: string, patch: Partial<WarningBlock>) => void;
  removeWarning: (id: string) => void;
  moveWarning: (id: string, delta: number) => boolean;

  addStep: (afterStepId?: string) => string | null;
  updateStep: (id: string, patch: Partial<GuideStep>) => void;
  duplicateStep: (id: string) => string | null;
  /**
   * 단계를 지운다. 참조가 있으면 `plan` 없이는 지우지 않는다. (M6 DoD 9)
   * `plan`을 주지 않고 부르면 영향 범위만 조사해 `needsPlan`으로 돌려준다.
   */
  removeStep: (id: string, plan?: StepRemovalPlan) => RemoveStepOutcome;
  moveStep: (id: string, delta: number) => boolean;
  reorderSteps: (activeId: string, overId: string) => boolean;
  updateBlock: (stepId: string, blockId: string, patch: Partial<ContentBlock>) => void;
  addBlock: (stepId: string, type: ContentBlockType, afterBlockId?: string) => string | null;
  removeBlock: (stepId: string, blockId: string) => void;
  moveBlock: (stepId: string, blockId: string, delta: number) => boolean;

  /**
   * 체크리스트 항목 CRUD.
   *
   * 라벨·필수 여부 수정은 `updateBlock`으로 충분하지만 추가는 ID가 필요하고
   * ID는 주입된 `newId`만 만들 수 있다. 삭제·이동도 같은 자리에 두어야
   * 준비물·경고·블록의 add/remove/move 모양과 어긋나지 않는다.
   *
   * 선택지(`decision`)는 여기 없다. `BranchRule.value`가 선택지 ID를 직접
   * 참조하므로 삭제는 참조 무결성 처리가 먼저다. M6이 붙인다.
   */
  addChecklistItem: (stepId: string, blockId: string) => string | null;
  removeChecklistItem: (stepId: string, blockId: string, itemId: string) => boolean;
  moveChecklistItem: (stepId: string, blockId: string, itemId: string, delta: number) => boolean;

  /**
   * 분기 규칙 CRUD. (M6 할 일 6)
   *
   * `moveBranchRule`은 이동 후 `priority`를 0..n-1로 다시 매긴다. 편집기로는
   * 우선순위 중복이 생기지 않게 하고, 가져온 문서의 중복은 검증기가 잡는다.
   */
  addBranchRule: (stepId: string) => string | null;
  updateBranchRule: (stepId: string, ruleId: string, patch: Partial<BranchRule>) => void;
  removeBranchRule: (stepId: string, ruleId: string) => boolean;
  moveBranchRule: (stepId: string, ruleId: string, delta: number) => boolean;

  /**
   * 선택지 CRUD. (M5에서 M6으로 넘긴 항목)
   *
   * 삭제는 `BranchRule.value`가 그 선택지 ID를 가리키는지 먼저 본다. 가리키는
   * 규칙이 있으면 `plan` 없이 지우지 않는다. 단계 삭제와 같은 계약이다.
   */
  addDecisionOption: (stepId: string, blockId: string) => string | null;
  removeDecisionOption: (
    stepId: string,
    blockId: string,
    optionId: string,
    plan?: OptionRemovalPlan,
  ) => RemoveOptionOutcome;
  moveDecisionOption: (stepId: string, blockId: string, optionId: string, delta: number) => boolean;

  /**
   * 이미지 파일을 검증·최적화해 자산으로 저장하고 블록에 연결한다.
   * 오류가 있으면 저장하지 않고 그대로 돌려준다. 경고는 저장한 뒤 함께
   * 돌려준다. (M5 DoD 5·6)
   */
  attachImage: (
    stepId: string,
    blockId: string,
    file: File,
    codec?: ImageCodec,
  ) => Promise<ImageIssue[]>;

  save: () => Promise<void>;
}

// ────────────────────────────────────────────────────── 의존성

let deps: GuideStoreDeps | null = null;
/** 진행 중인 초기화. 여러 화면이 동시에 불러도 저장소는 한 번만 연다. */
let initPromise: Promise<void> | null = null;
/** 저장소를 여는 방법. 테스트가 느린 백엔드를 넣어 초기화 경합을 재현한다. */
let backendOpener: () => Promise<StorageBackend> = () => openStorage();

/** 테스트와 부트스트랩이 저장소·ID·시각을 주입한다. */
export function configureGuideStore(next: GuideStoreDeps): void {
  deps = next;
  initPromise = null;
}

/** 주입한 opener로 처음부터 다시 초기화한다. `null`이면 기본 동작으로 되돌린다. */
export function configureBackendOpener(open: (() => Promise<StorageBackend>) | null): void {
  backendOpener = open ?? (() => openStorage());
  deps = null;
  initPromise = null;
}

export function guideStoreDeps(): GuideStoreDeps {
  if (deps === null) {
    throw new Error('guide.store가 아직 설정되지 않았습니다. configureGuideStore를 먼저 부르세요.');
  }
  return deps;
}

/** §4.1.3 - 식별자는 `crypto.randomUUID()`를 우선한다. */
export function browserIdFactory(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

// ────────────────────────────────────────────────────── 순수 도우미

/** 배열에서 `id` 항목을 `delta`칸 옮기고 `order`를 다시 매긴다. ID는 그대로다. */
export function moveById<T extends { id: string; order: number }>(
  items: readonly T[],
  id: string,
  delta: number,
): T[] | null {
  const sorted = normalizeOrder(items);
  const from = sorted.findIndex((item) => item.id === id);
  if (from === -1) return null;

  const to = from + delta;
  if (to < 0 || to >= sorted.length) return null;

  const next = [...sorted];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return null;
  next.splice(to, 0, moved);

  // order만 다시 매긴다. ID와 다른 필드는 건드리지 않는다. (INV-04, M4 DoD 6)
  return next.map((item, index) => (item.order === index ? item : { ...item, order: index }));
}

/** 단계 안의 체크리스트 블록을 찾는다. 타입이 다르면 `null`이다. */
export function findChecklistBlock(
  doc: GuideDocument,
  stepId: string,
  blockId: string,
): ChecklistBlock | null {
  const block = doc.steps
    .find((step) => step.id === stepId)
    ?.blocks.find((entry) => entry.id === blockId);
  return block !== undefined && block.type === 'checklist' ? block : null;
}

/**
 * 체크리스트 항목 배열만 바꾼 문서를 돌려준다.
 *
 * `ChecklistItem`에는 `order`가 없다. 배열 순서가 곧 표시 순서라서
 * `moveById`·`normalizeOrder`를 쓸 수 없다 - 둘 다 `order` 필드를 요구한다.
 * 순서를 위해 스키마에 `order`를 더하면 저장 형식이 바뀐다. 배열로 충분한
 * 문제에 그 대가를 치를 이유가 없다.
 */
export function replaceChecklistItems(
  doc: GuideDocument,
  stepId: string,
  blockId: string,
  update: (items: readonly ChecklistItem[]) => ChecklistItem[],
): GuideDocument {
  return {
    ...doc,
    steps: doc.steps.map((step) =>
      step.id === stepId
        ? {
            ...step,
            blocks: step.blocks.map((block) =>
              block.id === blockId && block.type === 'checklist'
                ? { ...block, items: update(block.items) }
                : block,
            ),
          }
        : step,
    ),
  };
}

/** 단계 하나만 바꾼 문서. */
function mapStep(
  doc: GuideDocument,
  stepId: string,
  update: (step: GuideStep) => GuideStep,
): GuideDocument {
  return { ...doc, steps: doc.steps.map((step) => (step.id === stepId ? update(step) : step)) };
}

/**
 * 우선순위를 0..n-1로 다시 매긴다.
 *
 * 편집기로는 우선순위 중복이 생기지 않게 한다. 가져온 문서의 중복은
 * `graph-validator`가 `DUPLICATE_BRANCH_PRIORITY`로 잡는다. 규칙 ID는 그대로다.
 */
function renumberPriority(rules: readonly BranchRule[]): BranchRule[] {
  return rules.map((rule, index) =>
    rule.priority === index ? rule : { ...rule, priority: index },
  );
}

/** 결정 블록의 선택지 배열만 바꾼 문서. */
function mapDecisionOptions(
  doc: GuideDocument,
  stepId: string,
  blockId: string,
  update: (options: readonly DecisionOption[]) => DecisionOption[],
): GuideDocument {
  return mapStep(doc, stepId, (step) => ({
    ...step,
    blocks: step.blocks.map((block) =>
      block.id === blockId && block.type === 'decision'
        ? { ...block, options: update(block.options) }
        : block,
    ),
  }));
}

/** 단계 안의 결정 블록을 찾는다. 타입이 다르면 `null`이다. */
export function findDecisionBlock(
  doc: GuideDocument,
  stepId: string,
  blockId: string,
): DecisionBlock | null {
  const block = doc.steps
    .find((step) => step.id === stepId)
    ?.blocks.find((entry) => entry.id === blockId);
  return block !== undefined && block.type === 'decision' ? block : null;
}

/** 이 선택지를 `value`로 가리키는 분기 규칙. 선택지를 지우면 고아가 된다. */
export function findOptionReferences(
  doc: GuideDocument,
  blockId: string,
  optionId: string,
): string[] {
  return doc.steps
    .flatMap((step) => step.branchRules)
    .filter((rule) => rule.sourceBlockId === blockId && rule.value === optionId)
    .map((rule) => rule.id);
}

/** 대체 대상 선택이나 규칙 삭제가 필요한가. 대화상자가 폼 노출을 이걸로 정한다. */
export function needsRemovalPlan(impact: StepReferenceImpact): boolean {
  return impact.defaultNextFrom.length > 0 || impact.branchRuleFrom.length > 0;
}

/** 단계 삭제가 건드리게 될 참조를 미리 조사한다. UI가 영향 범위를 보여 줄 때 쓴다. */
export function findStepReferences(doc: GuideDocument, stepId: string): StepReferenceImpact {
  const defaultNextFrom: string[] = [];
  const branchRuleFrom: string[] = [];

  for (const step of doc.steps) {
    if (step.id === stepId) continue;
    if (step.defaultNextStepId === stepId) defaultNextFrom.push(step.id);
    if (step.branchRules.some((rule) => rule.targetStepId === stepId)) branchRuleFrom.push(step.id);
  }

  return { defaultNextFrom, branchRuleFrom, wasStartStep: doc.startStepId === stepId };
}

function emptyPreparation(id: string, order: number): PreparationItem {
  return { id, label: '', required: true, order };
}

function emptyWarning(id: string, order: number): WarningBlock {
  return {
    id,
    severity: 'warning',
    title: '',
    body: '',
    requiresAcknowledgement: false,
    order,
  };
}

function emptyStep(newId: IdFactory, order: number): GuideStep {
  const blocks: ContentBlock[] = [{ id: newId('block'), order: 0, type: 'text', markdown: '' }];
  return {
    id: newId('step'),
    order,
    title: '',
    blocks,
    completionMode: 'checkbox',
    branchRules: [],
    troubleshootingIds: [],
    optional: false,
  };
}

// ────────────────────────────────────────────────────── 스토어

export const useGuideStore = create<GuideStoreState>((set, get) => {
  /**
   * 문서를 바꾸고 변경 번호를 올린다. 모든 편집이 이 함수를 지난다.
   *
   * `saveState`는 여기서 `saved`만 지운다. `error`는 다음 저장 결과가 나올
   * 때까지 남긴다. 실패를 타자 몇 번으로 조용히 감추면 안 된다. (M4 DoD 8)
   */
  const mutate = (mutator: (doc: GuideDocument) => GuideDocument): void => {
    const current = get().document;
    if (current === null) return;

    const next = mutator(current);
    if (next === current) return;

    set((state) => ({
      document: next,
      dirty: true,
      changeSeq: state.changeSeq + 1,
      saveState: state.saveState === 'saved' ? 'idle' : state.saveState,
    }));
  };

  /** 저장소가 열릴 때까지 기다린 뒤 의존성을 준다. */
  const ensureDeps = async (): Promise<GuideStoreDeps> => {
    await get().initStorage();
    return guideStoreDeps();
  };

  return {
    library: [],
    libraryStatus: 'idle',
    storageMode: null,
    document: null,
    loadedAssets: {},
    status: 'idle',
    dirty: false,
    saveState: 'idle',
    changeSeq: 0,
    savedSeq: 0,

    /**
     * 저장소를 연다. 여러 번 불러도 한 번만 연다.
     *
     * 진행 중인 초기화를 기억해 두는 것이 중요하다. 그러지 않으면 저장소가
     * 열리기 전에 누른 버튼이 `guideStoreDeps()`에서 던지고, 그 예외가 클릭
     * 핸들러 안에서 조용히 사라진다. 사용자에게는 "버튼이 안 눌린다"로 보인다.
     */
    async initStorage() {
      initPromise ??= (async () => {
        if (deps === null) {
          const backend = await backendOpener();
          deps = {
            guides: new GuideRepository(backend),
            assets: new AssetRepository(backend),
            recovery: new RecoveryRepository(backend),
            mode: backend.mode,
            ...(backend.unavailableReason === undefined
              ? {}
              : { storageUnavailableReason: backend.unavailableReason }),
            newId: browserIdFactory,
            now: () => new Date().toISOString(),
          };
        }

        set({
          storageMode: deps.mode,
          ...(deps.storageUnavailableReason === undefined
            ? {}
            : { storageUnavailableReason: deps.storageUnavailableReason }),
        });
      })();

      await initPromise;
    },

    async refreshLibrary() {
      set({ libraryStatus: 'loading' });
      try {
        const { guides } = await ensureDeps();
        set({ library: await guides.list(), libraryStatus: 'ready' });
      } catch (error) {
        set({ libraryStatus: 'error', loadError: describeError(error) });
      }
    },

    async createGuide(options = {}) {
      const { guides, newId, now } = await ensureDeps();
      const timestamp = now();
      const doc = createGuideDocument({
        id: newId('guide'),
        now: timestamp,
        newId,
        ...(options.title === undefined ? {} : { title: options.title }),
      });

      await guides.save(doc);
      await get().refreshLibrary();
      return doc.id;
    },

    async duplicateGuide(id) {
      const { guides, newId, now } = await ensureDeps();
      const copy = await guides.duplicate(id, {
        newGuideId: newId('guide'),
        newAssetId: () => newId('asset'),
        now: now(),
      });
      await get().refreshLibrary();
      return copy.id;
    },

    async renameGuide(id, title) {
      const { guides, now } = await ensureDeps();
      const doc = await guides.get(id);
      if (doc === undefined) return;

      const renamed: GuideDocument = {
        ...doc,
        updatedAt: now(),
        meta: { ...doc.meta, title },
      };
      await guides.save(renamed);

      // 열려 있는 문서라면 메모리도 같은 값이어야 한다.
      if (get().document?.id === id) {
        set((state) => ({
          document: state.document === null ? null : { ...state.document, meta: renamed.meta },
        }));
      }
      await get().refreshLibrary();
    },

    async removeGuide(id) {
      await (await ensureDeps()).guides.remove(id);
      if (get().document?.id === id) get().closeGuide();
      await get().refreshLibrary();
    },

    /**
     * 문서를 연다.
     *
     * 이미 같은 문서를 열어 둔 상태면 메모리 내용을 유지한다. 미리보기에
     * 다녀오는 동안 저장 전 편집이 사라지면 안 된다. (기술 §2.2.1-7)
     * 진짜 새로고침은 스토어 자체가 비어 있으므로 아래 경로로 내려간다.
     */
    async loadGuide(id) {
      const open = get().document;
      if (open !== null && open.id === id) {
        set({ status: 'ready' });
        return;
      }

      set({ status: 'loading', loadError: undefined });
      try {
        const doc = await (await ensureDeps()).guides.get(id);
        if (doc === undefined) {
          set({ document: null, status: 'missing' });
          return;
        }
        set({
          document: doc,
          status: 'ready',
          dirty: false,
          saveState: 'idle',
          saveError: undefined,
          changeSeq: 0,
          savedSeq: 0,
          lastSavedAt: doc.updatedAt,
        });
        await get().refreshAssets();
      } catch (error) {
        set({ status: 'error', loadError: describeError(error) });
      }
    },

    /** 열린 문서의 자산 본문을 다시 읽는다. */
    async refreshAssets() {
      const doc = get().document;
      if (doc === null) {
        set({ loadedAssets: {} });
        return;
      }

      const list = await (await ensureDeps()).assets.listByGuide(doc.id);
      set({ loadedAssets: Object.fromEntries(list.map((asset) => [asset.id, asset])) });
    },

    closeGuide() {
      set({
        document: null,
        loadedAssets: {},
        status: 'idle',
        dirty: false,
        saveState: 'idle',
        saveError: undefined,
        lastSavedAt: undefined,
        changeSeq: 0,
        savedSeq: 0,
      });
    },

    updateMeta(patch) {
      mutate((doc) => ({ ...doc, meta: { ...doc.meta, ...patch } }));
    },

    updateSettings(patch) {
      mutate((doc) => ({ ...doc, settings: { ...doc.settings, ...patch } }));
    },

    addPreparation() {
      const doc = get().document;
      if (doc === null) return null;
      const id = guideStoreDeps().newId('prep');
      mutate((current) => ({
        ...current,
        preparation: [...current.preparation, emptyPreparation(id, current.preparation.length)],
      }));
      return id;
    },

    updatePreparation(id, patch) {
      mutate((doc) => ({
        ...doc,
        preparation: doc.preparation.map((item) =>
          item.id === id ? { ...item, ...patch, id: item.id } : item,
        ),
      }));
    },

    removePreparation(id) {
      mutate((doc) => ({
        ...doc,
        preparation: normalizeOrder(doc.preparation.filter((item) => item.id !== id)),
      }));
    },

    movePreparation(id, delta) {
      const doc = get().document;
      if (doc === null) return false;
      const moved = moveById(doc.preparation, id, delta);
      if (moved === null) return false;
      mutate((current) => ({ ...current, preparation: moved }));
      return true;
    },

    addWarning() {
      const doc = get().document;
      if (doc === null) return null;
      const id = guideStoreDeps().newId('warn');
      mutate((current) => ({
        ...current,
        warnings: [...current.warnings, emptyWarning(id, current.warnings.length)],
      }));
      return id;
    },

    updateWarning(id, patch) {
      mutate((doc) => ({
        ...doc,
        warnings: doc.warnings.map((item) =>
          item.id === id ? { ...item, ...patch, id: item.id } : item,
        ),
      }));
    },

    removeWarning(id) {
      mutate((doc) => ({
        ...doc,
        warnings: normalizeOrder(doc.warnings.filter((item) => item.id !== id)),
      }));
    },

    moveWarning(id, delta) {
      const doc = get().document;
      if (doc === null) return false;
      const moved = moveById(doc.warnings, id, delta);
      if (moved === null) return false;
      mutate((current) => ({ ...current, warnings: moved }));
      return true;
    },

    addStep(afterStepId) {
      const doc = get().document;
      if (doc === null) return null;

      const { newId } = guideStoreDeps();
      const step = emptyStep(newId, doc.steps.length);

      mutate((current) => {
        const sorted = normalizeOrder(current.steps);
        const at =
          afterStepId === undefined
            ? sorted.length
            : sorted.findIndex((item) => item.id === afterStepId) + 1;
        const insertAt = at === 0 ? sorted.length : at;

        const next = [...sorted];
        next.splice(insertAt, 0, step);
        return { ...current, steps: normalizeOrder(next.map((s, i) => ({ ...s, order: i }))) };
      });

      return step.id;
    },

    updateStep(id, patch) {
      mutate((doc) => ({
        ...doc,
        steps: doc.steps.map((step) =>
          step.id === id ? { ...step, ...patch, id: step.id } : step,
        ),
      }));
    },

    /**
     * 단계를 복제한다. 단계와 블록 ID를 새로 만든다.
     *
     * 분기 규칙은 가져오지 않는다. 같은 조건이 두 단계에서 동시에 참인 그래프가
     * 생겨 M6 검증이 바로 막힌다. 복제본은 종료 단계로 시작한다.
     */
    duplicateStep(id) {
      const doc = get().document;
      if (doc === null) return null;

      const source = doc.steps.find((step) => step.id === id);
      if (source === undefined) return null;

      const { newId } = guideStoreDeps();
      const copy: GuideStep = {
        ...structuredClone(source),
        id: newId('step'),
        title: source.title === '' ? '' : `${source.title} (사본)`,
        blocks: source.blocks.map((block) => ({ ...structuredClone(block), id: newId('block') })),
        branchRules: [],
        troubleshootingIds: [...source.troubleshootingIds],
      };
      delete copy.defaultNextStepId;

      mutate((current) => {
        const sorted = normalizeOrder(current.steps);
        const at = sorted.findIndex((step) => step.id === id) + 1;
        const next = [...sorted];
        next.splice(at, 0, copy);
        return { ...current, steps: next.map((step, index) => ({ ...step, order: index })) };
      });

      return copy.id;
    },

    updateBlock(stepId, blockId, patch) {
      mutate((doc) => ({
        ...doc,
        steps: doc.steps.map((step) =>
          step.id === stepId
            ? {
                ...step,
                blocks: step.blocks.map((block) =>
                  block.id === blockId
                    ? // id와 type은 바꾸지 않는다. 타입 변경은 블록 교체지 수정이 아니다.
                      ({ ...block, ...patch, id: block.id, type: block.type } as ContentBlock)
                    : block,
                ),
              }
            : step,
        ),
      }));
    },

    /** 블록을 추가한다. 지정한 블록 바로 뒤, 없으면 맨 끝에 넣는다. */
    addBlock(stepId, type, afterBlockId) {
      const doc = get().document;
      if (doc === null) return null;

      const step = doc.steps.find((item) => item.id === stepId);
      if (step === undefined) return null;

      const block = createBlock(type, guideStoreDeps().newId, step.blocks.length);

      mutate((current) => ({
        ...current,
        steps: current.steps.map((item) => {
          if (item.id !== stepId) return item;

          const sorted = normalizeOrder(item.blocks);
          const at =
            afterBlockId === undefined
              ? sorted.length
              : sorted.findIndex((entry) => entry.id === afterBlockId) + 1;
          const insertAt = at === 0 ? sorted.length : at;

          const next = [...sorted];
          next.splice(insertAt, 0, block);
          return { ...item, blocks: next.map((entry, index) => ({ ...entry, order: index })) };
        }),
      }));

      return block.id;
    },

    removeBlock(stepId, blockId) {
      mutate((doc) => ({
        ...doc,
        steps: doc.steps.map((step) =>
          step.id === stepId
            ? { ...step, blocks: normalizeOrder(step.blocks.filter((b) => b.id !== blockId)) }
            : step,
        ),
      }));
    },

    moveBlock(stepId, blockId, delta) {
      const doc = get().document;
      if (doc === null) return false;

      const step = doc.steps.find((item) => item.id === stepId);
      if (step === undefined) return false;

      const moved = moveById(step.blocks, blockId, delta);
      if (moved === null) return false;

      mutate((current) => ({
        ...current,
        steps: current.steps.map((item) =>
          item.id === stepId ? { ...item, blocks: moved } : item,
        ),
      }));
      return true;
    },

    addChecklistItem(stepId, blockId) {
      const doc = get().document;
      if (doc === null) return null;
      if (findChecklistBlock(doc, stepId, blockId) === null) return null;

      const item: ChecklistItem = {
        id: guideStoreDeps().newId('item'),
        label: '',
        required: true,
      };

      mutate((current) =>
        replaceChecklistItems(current, stepId, blockId, (items) => [...items, item]),
      );
      return item.id;
    },

    removeChecklistItem(stepId, blockId, itemId) {
      const doc = get().document;
      if (doc === null) return false;

      const block = findChecklistBlock(doc, stepId, blockId);
      if (block === null) return false;
      if (!block.items.some((item) => item.id === itemId)) return false;

      mutate((current) =>
        replaceChecklistItems(current, stepId, blockId, (items) =>
          items.filter((item) => item.id !== itemId),
        ),
      );
      return true;
    },

    moveChecklistItem(stepId, blockId, itemId, delta) {
      const doc = get().document;
      if (doc === null) return false;

      const block = findChecklistBlock(doc, stepId, blockId);
      if (block === null) return false;

      const from = block.items.findIndex((item) => item.id === itemId);
      if (from === -1) return false;
      const to = from + delta;
      if (to < 0 || to >= block.items.length) return false;

      mutate((current) =>
        replaceChecklistItems(current, stepId, blockId, (items) => {
          const next = [...items];
          const [moved] = next.splice(from, 1);
          if (moved === undefined) return [...items];
          next.splice(to, 0, moved);
          return next;
        }),
      );
      return true;
    },

    addBranchRule(stepId) {
      const doc = get().document;
      if (doc === null) return null;

      const step = doc.steps.find((entry) => entry.id === stepId);
      if (step === undefined) return null;

      const rule: BranchRule = {
        id: guideStoreDeps().newId('rule'),
        operator: 'equals',
        // 대상은 자기 자신으로 시작한다. 빈 문자열은 스키마가 EMPTY_ID로 막고,
        // 다른 단계를 임의로 고르면 사용자가 만들지 않은 경로가 생긴다.
        targetStepId: stepId,
        priority: step.branchRules.length,
      };

      mutate((current) =>
        mapStep(current, stepId, (entry) => ({
          ...entry,
          branchRules: [...entry.branchRules, rule],
        })),
      );
      return rule.id;
    },

    updateBranchRule(stepId, ruleId, patch) {
      mutate((doc) =>
        mapStep(doc, stepId, (step) => ({
          ...step,
          branchRules: step.branchRules.map((rule) =>
            // id는 바꾸지 않는다. 규칙 교체는 수정이 아니다. (INV-04)
            rule.id === ruleId ? ({ ...rule, ...patch, id: rule.id } as BranchRule) : rule,
          ),
        })),
      );
    },

    removeBranchRule(stepId, ruleId) {
      const doc = get().document;
      if (doc === null) return false;
      const step = doc.steps.find((entry) => entry.id === stepId);
      if (step === undefined || !step.branchRules.some((rule) => rule.id === ruleId)) return false;

      mutate((current) =>
        mapStep(current, stepId, (entry) => ({
          ...entry,
          branchRules: renumberPriority(entry.branchRules.filter((rule) => rule.id !== ruleId)),
        })),
      );
      return true;
    },

    moveBranchRule(stepId, ruleId, delta) {
      const doc = get().document;
      if (doc === null) return false;

      const step = doc.steps.find((entry) => entry.id === stepId);
      if (step === undefined) return false;

      const ordered = [...step.branchRules].sort(
        (a, b) =>
          a.priority - b.priority || step.branchRules.indexOf(a) - step.branchRules.indexOf(b),
      );
      const from = ordered.findIndex((rule) => rule.id === ruleId);
      if (from === -1) return false;
      const to = from + delta;
      if (to < 0 || to >= ordered.length) return false;

      const next = [...ordered];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return false;
      next.splice(to, 0, moved);

      mutate((current) =>
        mapStep(current, stepId, (entry) => ({ ...entry, branchRules: renumberPriority(next) })),
      );
      return true;
    },

    addDecisionOption(stepId, blockId) {
      const doc = get().document;
      if (doc === null) return null;
      if (findDecisionBlock(doc, stepId, blockId) === null) return null;

      const option: DecisionOption = { id: guideStoreDeps().newId('opt'), label: '' };
      mutate((current) =>
        mapDecisionOptions(current, stepId, blockId, (options) => [...options, option]),
      );
      return option.id;
    },

    removeDecisionOption(stepId, blockId, optionId, plan) {
      const doc = get().document;
      if (doc === null) return { status: 'rejected', reason: 'notFound' };

      const block = findDecisionBlock(doc, stepId, blockId);
      if (block === null || !block.options.some((option) => option.id === optionId)) {
        return { status: 'rejected', reason: 'notFound' };
      }
      // 선택지가 하나뿐이면 지우지 않는다. 고를 것이 없는 결정 블록은 화면에서
      // 빈 껍데기로만 남는다.
      if (block.options.length <= 1) return { status: 'rejected', reason: 'lastOption' };

      const referencingRuleIds = findOptionReferences(doc, blockId, optionId);
      if (referencingRuleIds.length > 0 && plan === undefined) {
        return { status: 'needsPlan', referencingRuleIds };
      }

      const referencing = new Set(referencingRuleIds);
      mutate((current) => {
        const withoutOption = mapDecisionOptions(current, stepId, blockId, (options) =>
          options.filter((option) => option.id !== optionId),
        );
        if (referencing.size === 0) return withoutOption;

        return {
          ...withoutOption,
          steps: withoutOption.steps.map((step) => ({
            ...step,
            branchRules:
              plan?.kind === 'retarget'
                ? step.branchRules.map((rule) =>
                    referencing.has(rule.id) ? { ...rule, value: plan.optionId } : rule,
                  )
                : renumberPriority(step.branchRules.filter((rule) => !referencing.has(rule.id))),
          })),
        };
      });

      return { status: 'removed' };
    },

    moveDecisionOption(stepId, blockId, optionId, delta) {
      const doc = get().document;
      if (doc === null) return false;

      const block = findDecisionBlock(doc, stepId, blockId);
      if (block === null) return false;

      const from = block.options.findIndex((option) => option.id === optionId);
      if (from === -1) return false;
      const to = from + delta;
      if (to < 0 || to >= block.options.length) return false;

      mutate((current) =>
        mapDecisionOptions(current, stepId, blockId, (options) => {
          const next = [...options];
          const [moved] = next.splice(from, 1);
          if (moved === undefined) return [...options];
          next.splice(to, 0, moved);
          return next;
        }),
      );
      return true;
    },

    async attachImage(stepId, blockId, file, codec) {
      const doc = get().document;
      if (doc === null) return [];

      const { assets, newId, now } = await ensureDeps();

      // 코덱은 브라우저마다 다르게 실패한다(OffscreenCanvas 부재, 디코딩 거부).
      // 그 실패가 예외로 새어 나가면 클릭 핸들러 안에서 사라져 "아무 일도 안
      // 일어남"이 된다. 사용자가 볼 수 있는 이슈로 바꾼다.
      let optimized;
      try {
        optimized = await optimizeImage(file, codec ?? createBrowserImageCodec());
      } catch (error) {
        return [
          {
            code: ISSUE_CODES.IMAGE_PROCESSING_FAILED,
            message: `이미지를 처리하지 못했습니다: ${describeError(error)}`,
            severity: 'error',
          },
        ];
      }

      // 경고는 첨부를 막지 않는다. 애니메이션 GIF의 크기 경고가 여기서 걸리면
      // 움직이는 이미지를 아예 넣을 수 없게 된다. (기술 §4.4.4)
      if (optimized.issues.some((issue) => issue.severity === 'error')) return optimized.issues;
      const notices = optimized.issues;

      const bytes = await optimized.blob.arrayBuffer();
      const checksum = await checksumOf(bytes);

      // 같은 checksum이면 저장소가 기존 자산을 돌려준다. Blob이 두 벌 생기지
      // 않는다. (M5 DoD 8)
      const stored = await assets.put({
        id: newId('asset'),
        guideId: doc.id,
        fileName: file.name,
        mimeType: optimized.mimeType,
        checksum,
        blob: optimized.blob,
        createdAt: now(),
        ...(optimized.width > 0 ? { width: optimized.width } : {}),
        ...(optimized.height > 0 ? { height: optimized.height } : {}),
      });

      const manifest = toManifestItem(stored.asset);

      mutate((current) => ({
        ...current,
        assets: current.assets.some((item) => item.id === manifest.id)
          ? current.assets.map((item) => (item.id === manifest.id ? manifest : item))
          : [...current.assets, manifest],
        steps: current.steps.map((step) =>
          step.id === stepId
            ? {
                ...step,
                blocks: step.blocks.map((block) =>
                  block.id === blockId && block.type === 'image'
                    ? { ...block, assetId: stored.asset.id }
                    : block,
                ),
              }
            : step,
        ),
      }));

      await get().refreshAssets();
      return notices;
    },

    removeStep(id, plan) {
      const doc = get().document;
      if (doc === null) return { status: 'rejected', reason: 'notFound' };
      // 마지막 단계는 지우지 않는다. 단계가 0개인 문서는 스키마상 성립하지 않는다.
      if (doc.steps.length <= 1) return { status: 'rejected', reason: 'lastStep' };
      if (!doc.steps.some((step) => step.id === id)) {
        return { status: 'rejected', reason: 'notFound' };
      }

      const impact = findStepReferences(doc, id);

      // DoD 9 - 참조가 있으면 처리 방법 없이는 지우지 않는다. 여기서 문서를
      // 하나도 바꾸지 않고 돌아간다. M4까지는 참조를 조용히 고쳐서 지웠다.
      if (needsRemovalPlan(impact) && plan === undefined) {
        return { status: 'needsPlan', impact };
      }

      if (plan?.kind === 'retarget') {
        if (plan.targetStepId === id || !doc.steps.some((s) => s.id === plan.targetStepId)) {
          return { status: 'rejected', reason: 'invalidTarget' };
        }
      }

      mutate((current) => {
        const remaining = normalizeOrder(current.steps.filter((step) => step.id !== id));

        const repaired = remaining.map((step) => {
          const next = { ...step };

          if (plan?.kind === 'retarget') {
            if (next.defaultNextStepId === id) next.defaultNextStepId = plan.targetStepId;
            next.branchRules = next.branchRules.map((rule) =>
              rule.targetStepId === id ? { ...rule, targetStepId: plan.targetStepId } : rule,
            );
            return next;
          }

          // dropRules - 끊긴 참조를 남기지 않는다.
          if (next.defaultNextStepId === id) delete next.defaultNextStepId;
          if (next.branchRules.some((rule) => rule.targetStepId === id)) {
            next.branchRules = next.branchRules.filter((rule) => rule.targetStepId !== id);
          }
          return next;
        });

        const startStepId =
          current.startStepId === id
            ? plan?.kind === 'retarget'
              ? plan.targetStepId
              : (repaired[0]?.id ?? current.startStepId)
            : current.startStepId;

        return {
          ...current,
          steps: repaired,
          startStepId,
          troubleshooting: current.troubleshooting.map((item) =>
            item.stepId === id ? { ...item, scope: 'global' as const, stepId: undefined } : item,
          ),
        };
      });

      return { status: 'removed', impact };
    },

    moveStep(id, delta) {
      const doc = get().document;
      if (doc === null) return false;
      const moved = moveById(doc.steps, id, delta);
      if (moved === null) return false;
      mutate((current) => ({ ...current, steps: moved }));
      return true;
    },

    reorderSteps(activeId, overId) {
      const doc = get().document;
      if (doc === null) return false;
      const sorted = normalizeOrder(doc.steps);
      const from = sorted.findIndex((step) => step.id === activeId);
      const to = sorted.findIndex((step) => step.id === overId);
      if (from === -1 || to === -1 || from === to) return false;
      return get().moveStep(activeId, to - from);
    },

    async save() {
      const state = get();
      const doc = state.document;
      if (doc === null) return;

      // 저장할 변경이 없다. 빈 트랜잭션을 돌리지 않는다.
      if (state.changeSeq === state.savedSeq) return;

      const seq = state.changeSeq;
      const snapshot: GuideDocument = { ...doc, updatedAt: guideStoreDeps().now() };

      set({ saveState: 'saving', saveError: undefined });

      try {
        await guideStoreDeps().guides.save(snapshot);
      } catch (error) {
        // 메모리 편집 내용은 그대로 두고, 저장소의 이전 성공 스냅샷도 건드리지
        // 않는다. 둘 다 살아 있어야 한다. (M4 DoD 5)
        set({ saveState: 'error', saveError: describeError(error), dirty: true });
        return;
      }

      const after = get();

      // 저장하는 동안 더 새로운 변경이 들어왔다. 이 응답은 최신 상태가 아니므로
      // `saved`로 표시하지 않고 메모리 문서도 덮어쓰지 않는다. 예약기가 최신
      // 스냅샷으로 한 번 더 저장한다. (M4 DoD 4, 기술 §4.1.3)
      if (after.changeSeq !== seq) {
        set({ savedSeq: seq, dirty: true, saveState: 'saving' });
        return;
      }

      set({
        document: snapshot,
        savedSeq: seq,
        dirty: false,
        saveState: 'saved',
        lastSavedAt: snapshot.updatedAt,
      });
    },
  };
});

/** 테스트가 상태를 초기화할 때 쓴다. 액션은 유지된다. */
export function resetGuideStore(): void {
  useGuideStore.setState({
    library: [],
    libraryStatus: 'idle',
    storageMode: null,
    storageUnavailableReason: undefined,
    document: null,
    loadedAssets: {},
    status: 'idle',
    loadError: undefined,
    dirty: false,
    saveState: 'idle',
    saveError: undefined,
    lastSavedAt: undefined,
    changeSeq: 0,
    savedSeq: 0,
  });
}

/** 첫 단계 생성기를 스토어 밖에서도 쓸 수 있게 다시 내보낸다. */
export { createFirstStep };
