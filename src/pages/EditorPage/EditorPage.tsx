/**
 * 작성 화면.
 *
 * 기준: 기술 백서 §2.1.4, §2.2.1, §4.3.2 / 디자인 백서 §2.1.2, §2.4.2~§2.4.5.
 * 하네스 M4 DoD 1~8.
 *
 * 문서의 단일 기준은 `guide.store`다. 이 화면은 스토어를 읽어 그리고 액션을
 * 부를 뿐 문서 사본을 따로 들지 않는다. (하네스 M4 주의)
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { GuideMetaForm } from '../../components/editor/GuideMetaForm/GuideMetaForm.tsx';
import { GuideOutline } from '../../components/editor/GuideOutline/GuideOutline.tsx';
import { PreparationEditor } from '../../components/editor/PreparationEditor/PreparationEditor.tsx';
import { SaveStateIndicator } from '../../components/editor/SaveStateIndicator/SaveStateIndicator.tsx';
import { SectionHeader } from '../../components/editor/SectionHeader/SectionHeader.tsx';
import { StepEditor } from '../../components/editor/StepEditor/StepEditor.tsx';
import { StorageUnavailableBanner } from '../../components/editor/StorageUnavailableBanner/StorageUnavailableBanner.tsx';
import { WarningEditor } from '../../components/editor/WarningEditor/WarningEditor.tsx';
import { reorderAnnouncement } from '../../components/editor/ReorderControls/ReorderControls.tsx';
import { AppHeader } from '../../components/layout/AppHeader/AppHeader.tsx';
import { EditorShell } from '../../components/layout/EditorShell/EditorShell.tsx';
import { Button } from '../../components/ui/Button/Button.tsx';
import { Dialog } from '../../components/ui/Dialog/Dialog.tsx';
import { Field } from '../../components/ui/Field/Field.tsx';
import { Select } from '../../components/ui/Select/Select.tsx';
import { LiveRegion } from '../../components/ui/LiveRegion/LiveRegion.tsx';
import { useAutosave } from '../../features/autosave/useAutosave.ts';
import { BranchSummary } from '../../components/editor/BranchSummary/BranchSummary.tsx';
import { ValidationPanel } from '../../components/editor/ValidationPanel/ValidationPanel.tsx';
import { validateGuideDocument } from '../../domain/guide.schema.ts';
import { summarize, type ValidationIssue } from '../../domain/validation.types.ts';
import { validateGuideGraph } from '../../features/branching/graph-validator.ts';
import {
  findChecklistBlock,
  findStepReferences,
  needsRemovalPlan,
  useGuideStore,
  type StepRemovalPlan,
} from '../../store/guide.store.ts';
import { useUiStore } from '../../store/ui.store.ts';
import styles from './EditorPage.module.css';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const document = useGuideStore((state) => state.document);
  const loadedAssets = useGuideStore((state) => state.loadedAssets);
  const status = useGuideStore((state) => state.status);
  const dirty = useGuideStore((state) => state.dirty);
  const saveState = useGuideStore((state) => state.saveState);
  const saveError = useGuideStore((state) => state.saveError);
  const storageMode = useGuideStore((state) => state.storageMode);
  const storageUnavailableReason = useGuideStore((state) => state.storageUnavailableReason);

  const initStorage = useGuideStore((state) => state.initStorage);
  const loadGuide = useGuideStore((state) => state.loadGuide);

  const section = useUiStore((state) => state.section);
  const selectedStepId = useUiStore((state) => state.selectedStepId);
  const announcement = useUiStore((state) => state.announcement);
  const announcementKey = useUiStore((state) => state.announcementKey);
  const selectSection = useUiStore((state) => state.selectSection);
  const selectStep = useUiStore((state) => state.selectStep);
  const announce = useUiStore((state) => state.announce);

  const [highlightStepId, setHighlightStepId] = useState<string | null>(null);
  const [removeStepId, setRemoveStepId] = useState<string | null>(null);
  /** 참조가 있는 단계를 지울 때 고른 처리 방법. 고르기 전에는 삭제하지 않는다. */
  const [removalTargetId, setRemovalTargetId] = useState<string>('');
  const cancelRemoveRef = useRef<HTMLButtonElement | null>(null);
  const stepTitleFocusRef = useRef<string | null>(null);

  useAutosave();

  // 화면을 떠날 때 문서를 버리지 않는다. 미리보기는 저장 완료를 기다리지 않고
  // 이 메모리 초안을 그대로 쓴다. (기술 §2.2.1-7) 다른 문서를 열면
  // `loadGuide`가 알아서 갈아 끼운다.
  useEffect(() => {
    if (id === undefined) return;
    void (async () => {
      await initStorage();
      await loadGuide(id);
    })();
  }, [id, initStorage, loadGuide]);

  // 새 단계를 만들면 제목 입력으로 포커스를 옮긴다. (디자인 §2.2.1 단계 추가)
  useEffect(() => {
    if (stepTitleFocusRef.current === null) return;
    if (selectedStepId !== stepTitleFocusRef.current) return;
    stepTitleFocusRef.current = null;
    const input = window.document.querySelector<HTMLInputElement>(
      '[data-testid="step-editor"] input',
    );
    input?.focus();
  }, [selectedStepId]);

  if (status === 'loading' || status === 'idle') {
    return (
      <>
        <AppHeader />
        <p className={styles.notice}>불러오는 중…</p>
      </>
    );
  }

  if (status === 'missing') {
    return (
      <>
        <AppHeader />
        <div className={styles.notice}>
          <h1>가이드를 찾을 수 없습니다</h1>
          <p>주소가 바뀌었거나 이미 삭제된 가이드입니다.</p>
          <Link to="/">대시보드로 돌아가기</Link>
        </div>
      </>
    );
  }

  if (document === null) {
    return (
      <>
        <AppHeader />
        <div className={styles.notice} role="alert">
          <h1>가이드를 열지 못했습니다</h1>
          <Link to="/">대시보드로 돌아가기</Link>
        </div>
      </>
    );
  }

  const store = useGuideStore.getState;
  const steps = [...document.steps].sort((a, b) => a.order - b.order);
  const activeStepId = selectedStepId ?? steps[0]?.id ?? null;
  const activeIndex = steps.findIndex((step) => step.id === activeStepId);
  const activeStep = activeIndex === -1 ? steps[0] : steps[activeIndex];
  const removeTarget = steps.find((step) => step.id === removeStepId) ?? null;
  const removeImpact = removeTarget === null ? null : findStepReferences(document, removeTarget.id);
  const removeNeedsPlan = removeImpact !== null && needsRemovalPlan(removeImpact);

  // 문서 검증과 그래프 검증을 합친다. 합성은 호출자의 일이다 - `domain`은
  // `features`를 import할 수 없고, 반대로 그래프 검증기가 스키마를 끌어오면
  // zod가 리더 번들 폐포에 들어간다. (D-11)
  const validation = summarize([
    ...validateGuideDocument(document).issues,
    ...validateGuideGraph(document).issues,
  ]);
  const stepIssues: ValidationIssue[] =
    activeStep === undefined
      ? []
      : validation.issues.filter((issue) => issue.stepId === activeStep.id);

  const onAddStep = (afterStepId?: string) => {
    const newId = store().addStep(afterStepId);
    if (newId === null) return;
    selectStep(newId);
    stepTitleFocusRef.current = newId;
    setHighlightStepId(newId);
    announce(`단계가 추가되었습니다. 총 ${document.steps.length + 1}개입니다.`);
    window.setTimeout(() => setHighlightStepId(null), 1500);
  };

  return (
    <>
      <AppHeader
        documentTitle={document.meta.title.trim() === '' ? '제목 없는 가이드' : document.meta.title}
        status={
          <SaveStateIndicator
            state={saveState}
            dirty={dirty}
            {...(saveError === undefined ? {} : { error: saveError })}
          />
        }
        actions={
          <Button size="sm" onClick={() => navigate(`/guide/${document.id}/preview`)}>
            미리보기
          </Button>
        }
      />

      <LiveRegion message={announcement} messageKey={announcementKey} />

      <EditorShell
        outline={
          <GuideOutline
            document={document}
            section={section}
            selectedStepId={activeStepId}
            highlightStepId={highlightStepId}
            onSelectSection={selectSection}
            onSelectStep={selectStep}
            onAddStep={() => onAddStep()}
            issueCount={validation.issues.length}
          />
        }
      >
        <StorageUnavailableBanner
          mode={storageMode}
          {...(storageUnavailableReason === undefined ? {} : { reason: storageUnavailableReason })}
        />

        {section === 'meta' ? (
          <>
            <SectionHeader title="기본 정보" description="독자가 가장 먼저 보는 내용입니다." />
            <GuideMetaForm
              documentId={document.id}
              meta={document.meta}
              onChange={(patch) => store().updateMeta(patch)}
            />
          </>
        ) : null}

        {section === 'preparation' ? (
          <>
            <SectionHeader
              title="준비물"
              description="시작 전에 손에 있어야 하는 것들입니다. 비워 두어도 됩니다."
            />
            <PreparationEditor
              items={[...document.preparation].sort((a, b) => a.order - b.order)}
              onAdd={() => {
                store().addPreparation();
                announce('준비물이 추가되었습니다.');
              }}
              onUpdate={(itemId, patch) => store().updatePreparation(itemId, patch)}
              onRemove={(itemId) => {
                store().removePreparation(itemId);
                announce('준비물이 삭제되었습니다.');
              }}
              onMove={(itemId, delta) => {
                if (!store().movePreparation(itemId, delta)) return;
                const items = [...store().document!.preparation].sort((a, b) => a.order - b.order);
                const position = items.findIndex((item) => item.id === itemId) + 1;
                announce(reorderAnnouncement('준비물', position, items.length));
              }}
            />
          </>
        ) : null}

        {section === 'warnings' ? (
          <>
            <SectionHeader
              title="경고"
              description="되돌릴 수 없는 작업이나 손상 위험을 미리 알립니다."
            />
            <WarningEditor
              items={[...document.warnings].sort((a, b) => a.order - b.order)}
              onAdd={() => {
                store().addWarning();
                announce('경고가 추가되었습니다.');
              }}
              onUpdate={(itemId, patch) => store().updateWarning(itemId, patch)}
              onRemove={(itemId) => {
                store().removeWarning(itemId);
                announce('경고가 삭제되었습니다.');
              }}
              onMove={(itemId, delta) => {
                if (!store().moveWarning(itemId, delta)) return;
                const items = [...store().document!.warnings].sort((a, b) => a.order - b.order);
                const position = items.findIndex((item) => item.id === itemId) + 1;
                announce(reorderAnnouncement('경고', position, items.length));
              }}
            />
          </>
        ) : null}

        {section === 'steps' && activeStep !== undefined ? (
          <>
            <SectionHeader
              title="단계 편집"
              description="번호는 순서에서 자동으로 계산됩니다."
              actions={
                <Button size="sm" onClick={() => onAddStep(activeStep.id)}>
                  + 단계 추가
                </Button>
              }
            />
            <StepEditor
              step={activeStep}
              index={activeIndex === -1 ? 0 : activeIndex}
              total={steps.length}
              canRemove={steps.length > 1}
              onUpdate={(patch) => store().updateStep(activeStep.id, patch)}
              onUpdateBlock={(blockId, patch) => store().updateBlock(activeStep.id, blockId, patch)}
              assets={loadedAssets}
              onAddBlock={(type, afterBlockId) => {
                store().addBlock(activeStep.id, type, afterBlockId);
                announce('블록이 추가되었습니다.');
              }}
              onRemoveBlock={(blockId) => {
                store().removeBlock(activeStep.id, blockId);
                announce('블록이 삭제되었습니다.');
              }}
              onMoveBlock={(blockId, delta) => {
                if (!store().moveBlock(activeStep.id, blockId, delta)) return;
                const ordered = [...(store().document?.steps ?? [])]
                  .find((step) => step.id === activeStep.id)
                  ?.blocks.slice()
                  .sort((a, b) => a.order - b.order);
                const position = (ordered ?? []).findIndex((block) => block.id === blockId) + 1;
                announce(reorderAnnouncement('블록', position, ordered?.length ?? 0));
              }}
              onAddChecklistItem={(blockId) => {
                if (store().addChecklistItem(activeStep.id, blockId) === null) return;
                announce('체크리스트 항목이 추가되었습니다.');
              }}
              onRemoveChecklistItem={(blockId, itemId) => {
                if (!store().removeChecklistItem(activeStep.id, blockId, itemId)) return;
                announce('체크리스트 항목이 삭제되었습니다.');
              }}
              onMoveChecklistItem={(blockId, itemId, delta) => {
                if (!store().moveChecklistItem(activeStep.id, blockId, itemId, delta)) return;
                const items =
                  findChecklistBlock(store().document!, activeStep.id, blockId)?.items ?? [];
                const position = items.findIndex((item) => item.id === itemId) + 1;
                announce(reorderAnnouncement('체크리스트 항목', position, items.length));
              }}
              onAddDecisionOption={(blockId) => {
                if (store().addDecisionOption(activeStep.id, blockId) === null) return;
                announce('선택지가 추가되었습니다.');
              }}
              onRemoveDecisionOption={(blockId, optionId) => {
                const outcome = store().removeDecisionOption(activeStep.id, blockId, optionId);
                if (outcome.status === 'removed') {
                  announce('선택지가 삭제되었습니다.');
                  return;
                }
                if (outcome.status === 'needsPlan') {
                  // 분기 규칙이 이 선택지를 가리킨다. 규칙을 함께 지운다.
                  // 대체 선택지 고르기는 규칙 편집에서 직접 바꿀 수 있다.
                  store().removeDecisionOption(activeStep.id, blockId, optionId, {
                    kind: 'dropRules',
                  });
                  announce(
                    `선택지와 이 선택지를 쓰던 분기 규칙 ${outcome.referencingRuleIds.length}개를 함께 삭제했습니다.`,
                  );
                }
              }}
              onMoveDecisionOption={(blockId, optionId, delta) => {
                store().moveDecisionOption(activeStep.id, blockId, optionId, delta);
              }}
              steps={steps}
              issues={stepIssues}
              onAddRule={() => {
                if (store().addBranchRule(activeStep.id) === null) return;
                announce('분기 규칙이 추가되었습니다.');
              }}
              onUpdateRule={(ruleId, patch) =>
                store().updateBranchRule(activeStep.id, ruleId, patch)
              }
              onRemoveRule={(ruleId) => {
                if (!store().removeBranchRule(activeStep.id, ruleId)) return;
                announce('분기 규칙이 삭제되었습니다.');
              }}
              onMoveRule={(ruleId, delta) => {
                if (!store().moveBranchRule(activeStep.id, ruleId, delta)) return;
                const rules =
                  store().document?.steps.find((step) => step.id === activeStep.id)?.branchRules ??
                  [];
                const position =
                  [...rules]
                    .sort((a, b) => a.priority - b.priority)
                    .findIndex((rule) => rule.id === ruleId) + 1;
                announce(reorderAnnouncement('분기 규칙', position, rules.length));
              }}
              onPickImage={(blockId, file) => store().attachImage(activeStep.id, blockId, file)}
              onMove={(delta) => {
                if (!store().moveStep(activeStep.id, delta)) return;
                const ordered = [...store().document!.steps].sort((a, b) => a.order - b.order);
                const position = ordered.findIndex((step) => step.id === activeStep.id) + 1;
                announce(reorderAnnouncement(`단계 ${position}`, position, ordered.length));
              }}
              onDuplicate={() => {
                const copyId = store().duplicateStep(activeStep.id);
                if (copyId === null) return;
                selectStep(copyId);
                announce('단계가 복제되었습니다.');
              }}
              onRemove={() => setRemoveStepId(activeStep.id)}
            />
          </>
        ) : null}

        {section === 'validation' ? (
          <>
            <SectionHeader
              title="검증"
              description="내보내기 전에 고쳐야 할 것과 확인하면 좋은 것입니다."
            />
            <ValidationPanel
              result={validation}
              onSelectIssue={(issue) => {
                // 이슈에서 그 단계로 이동한다. 문서 전체 이슈는 기본 정보로 보낸다.
                if (issue.stepId !== undefined) {
                  selectStep(issue.stepId);
                  return;
                }
                selectSection(issue.path.startsWith('warnings') ? 'warnings' : 'meta');
              }}
            />

            <SectionHeader title="경로 요약" description="분기가 있는 단계의 이동 규칙입니다." />
            <BranchSummary steps={steps} onSelectStep={(stepId) => selectStep(stepId)} />
          </>
        ) : null}
      </EditorShell>

      {/*
        디자인 §2.2.1·기술 §2.2.3 - 참조가 있으면 **대체 대상 선택 또는 규칙
        삭제**를 요구한다. 스토어가 `plan` 없이는 지우지 않으므로(M6 DoD 9)
        여기서 고르지 않으면 삭제 버튼이 아무 일도 하지 않는 것이 아니라
        애초에 눌리지 않는다.
      */}
      <Dialog
        open={removeTarget !== null}
        title="단계를 삭제할까요?"
        description={
          removeImpact === null
            ? undefined
            : impactSentence(
                removeTarget?.title ?? '',
                removeImpact.defaultNextFrom.length + removeImpact.branchRuleFrom.length,
                removeImpact.wasStartStep,
              )
        }
        onClose={() => {
          setRemoveStepId(null);
          setRemovalTargetId('');
        }}
        initialFocusRef={cancelRemoveRef}
        footer={
          <>
            <Button
              ref={cancelRemoveRef}
              onClick={() => {
                setRemoveStepId(null);
                setRemovalTargetId('');
              }}
            >
              취소
            </Button>
            <Button
              variant="danger"
              data-testid="step-remove-confirm"
              disabled={removeNeedsPlan && removalTargetId === ''}
              onClick={() => {
                if (removeStepId === null) return;

                const plan: StepRemovalPlan | undefined = !removeNeedsPlan
                  ? undefined
                  : removalTargetId === 'drop'
                    ? { kind: 'dropRules' }
                    : { kind: 'retarget', targetStepId: removalTargetId };

                const outcome = store().removeStep(removeStepId, plan);
                if (outcome.status !== 'removed') return;

                setRemoveStepId(null);
                setRemovalTargetId('');
                selectStep(null);
                announce('단계가 삭제되었습니다.');
              }}
            >
              단계 삭제
            </Button>
          </>
        }
      >
        {removeNeedsPlan && removeTarget !== null ? (
          <Field
            label="이 단계를 가리키던 연결을 어떻게 할까요?"
            required
            help="고르기 전에는 삭제할 수 없습니다."
          >
            {(control) => (
              <Select
                {...control}
                value={removalTargetId}
                data-testid="step-remove-plan"
                onChange={(event) => setRemovalTargetId(event.target.value)}
              >
                <option value="">고르지 않음</option>
                <option value="drop">가리키던 분기 규칙과 기본 경로를 지웁니다</option>
                {steps
                  .filter((step) => step.id !== removeTarget.id)
                  .map((step, index) => (
                    <option key={step.id} value={step.id}>
                      {`${index + 1}단계 «${step.title.trim() === '' ? '제목 없는 단계' : step.title}»로 옮깁니다`}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        ) : null}
      </Dialog>
    </>
  );
}

function impactSentence(title: string, referenceCount: number, wasStartStep: boolean): string {
  const name = title.trim() === '' ? '제목 없는 단계' : title;
  const parts = [`"${name}"을(를) 지웁니다.`];
  if (referenceCount > 0) {
    parts.push(
      `다른 단계 ${referenceCount}곳에서 이 단계를 가리키고 있습니다. 그 연결도 함께 끊깁니다.`,
    );
  }
  if (wasStartStep) parts.push('시작 단계였으므로 첫 번째 단계가 새 시작점이 됩니다.');
  return parts.join(' ');
}
