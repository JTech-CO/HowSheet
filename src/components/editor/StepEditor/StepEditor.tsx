/**
 * 단계 편집.
 *
 * 기준: FR-005, 디자인 백서 §2.4.5, §4.3.1(Step Card).
 *
 * 단계 번호는 데이터 순서에서 자동 계산한다. 직접 입력하지 않는다.
 * (디자인 §2.4.5)
 *
 * 콘텐츠 블록 편집은 `BlockTypePicker`(추가)와 `BlockEditor`(타입별 폼)에
 * 위임한다. 이 컴포넌트는 단계 자체의 필드와 블록 목록의 배치만 맡는다.
 */

import type {
  BranchRule,
  CompletionMode,
  ContentBlock,
  ContentBlockType,
  GuideStep,
} from '../../../domain/guide.types.ts';
import { FIELD_LIMITS } from '../../../domain/guide.types.ts';
import type { ValidationIssue } from '../../../domain/validation.types.ts';
import type { ImageIssue } from '../../../features/assets/image-optimizer.ts';
import type { StoredAsset } from '../../../storage/db.ts';
import { BlockEditor } from '../BlockEditor/BlockEditor.tsx';
import { BlockTypePicker } from '../BlockTypePicker/BlockTypePicker.tsx';
import { BranchRuleEditor } from '../BranchRuleEditor/BranchRuleEditor.tsx';
import { BranchSummary } from '../BranchSummary/BranchSummary.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import { Checkbox } from '../../ui/Checkbox/Checkbox.tsx';
import { Field } from '../../ui/Field/Field.tsx';
import { Input } from '../../ui/Input/Input.tsx';
import { Select } from '../../ui/Select/Select.tsx';
import { Textarea } from '../../ui/Textarea/Textarea.tsx';
import { ReorderControls } from '../ReorderControls/ReorderControls.tsx';
import styles from './StepEditor.module.css';

const COMPLETION_LABELS: Record<CompletionMode, string> = {
  checkbox: '체크로 완료',
  choice: '선택으로 완료',
  automatic: '자동 완료',
};

const COMPLETION_ORDER: CompletionMode[] = ['checkbox', 'choice', 'automatic'];

export interface StepEditorProps {
  step: GuideStep;
  /** 0부터 세는 위치. 화면에는 +1해서 보여 준다. */
  index: number;
  total: number;
  /** 삭제 가능한지. 단계가 하나뿐이면 지울 수 없다. */
  canRemove: boolean;
  onUpdate: (patch: Partial<GuideStep>) => void;
  onUpdateBlock: (blockId: string, patch: Partial<ContentBlock>) => void;
  onAddBlock: (type: ContentBlockType, afterBlockId?: string) => void;
  onRemoveBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, delta: number) => void;
  onAddChecklistItem: (blockId: string) => void;
  onRemoveChecklistItem: (blockId: string, itemId: string) => void;
  onMoveChecklistItem: (blockId: string, itemId: string, delta: number) => void;
  onAddDecisionOption: (blockId: string) => void;
  onRemoveDecisionOption: (blockId: string, optionId: string) => void;
  onMoveDecisionOption: (blockId: string, optionId: string, delta: number) => void;

  /** 분기 규칙 편집. 대상 후보와 이슈는 화면이 골라 넘긴다. */
  steps: readonly GuideStep[];
  issues: readonly ValidationIssue[];
  onAddRule: () => void;
  onUpdateRule: (ruleId: string, patch: Partial<BranchRule>) => void;
  onRemoveRule: (ruleId: string) => void;
  onMoveRule: (ruleId: string, delta: number) => void;
  onPickImage: (blockId: string, file: File) => Promise<ImageIssue[]>;
  /** 이미지 블록이 가리키는 자산 본문. 미리보기에 쓴다. */
  assets: Record<string, StoredAsset>;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function StepEditor({
  step,
  index,
  total,
  canRemove,
  onUpdate,
  onUpdateBlock,
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onAddChecklistItem,
  onRemoveChecklistItem,
  onMoveChecklistItem,
  onAddDecisionOption,
  onRemoveDecisionOption,
  onMoveDecisionOption,
  steps,
  issues,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
  onMoveRule,
  onPickImage,
  assets,
  onMove,
  onDuplicate,
  onRemove,
}: StepEditorProps) {
  const blocks = [...step.blocks].sort((a, b) => a.order - b.order);

  return (
    <div className={styles.editor} data-testid="step-editor">
      <div className={styles.toolbar}>
        <span className={styles.badge} data-testid="step-number">
          단계 {index + 1}
        </span>
        <ReorderControls
          position={index + 1}
          total={total}
          itemLabel={`단계 ${index + 1}`}
          onMove={onMove}
        />
        <Button variant="ghost" size="sm" onClick={onDuplicate} data-testid="step-duplicate">
          단계 복제
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={!canRemove}
          data-testid="step-remove"
        >
          단계 삭제
        </Button>
      </div>

      <Field label="단계 제목" required maxLength={FIELD_LIMITS.stepTitleMax} value={step.title}>
        {(control) => (
          <Input
            {...control}
            value={step.title}
            placeholder="예: 공유기 전원을 다시 넣는다"
            onChange={(event) => onUpdate({ title: event.target.value })}
          />
        )}
      </Field>

      <Field label="짧은 설명" help="한 줄로 무엇을 하는 단계인지 알려 줍니다.">
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            value={step.summary ?? ''}
            onChange={(event) =>
              onUpdate({ summary: event.target.value === '' ? undefined : event.target.value })
            }
          />
        )}
      </Field>

      <section className={styles.content} aria-label="콘텐츠">
        <h3 className={styles.contentTitle}>콘텐츠</h3>

        {blocks.length === 0 ? (
          <p className={styles.otherBlocks}>블록이 없습니다. 아래에서 추가하세요.</p>
        ) : (
          <ul className={styles.blocks} role="list">
            {blocks.map((block, blockIndex) => (
              <BlockEditor
                key={block.id}
                block={block}
                index={blockIndex}
                total={blocks.length}
                asset={block.type === 'image' ? assets[block.assetId] : undefined}
                onChange={(patch) => onUpdateBlock(block.id, patch)}
                onRemove={() => onRemoveBlock(block.id)}
                onMove={(delta) => onMoveBlock(block.id, delta)}
                onAddItem={() => onAddChecklistItem(block.id)}
                onRemoveItem={(itemId) => onRemoveChecklistItem(block.id, itemId)}
                onMoveItem={(itemId, delta) => onMoveChecklistItem(block.id, itemId, delta)}
                onAddOption={() => onAddDecisionOption(block.id)}
                onRemoveOption={(optionId) => onRemoveDecisionOption(block.id, optionId)}
                onMoveOption={(optionId, delta) => onMoveDecisionOption(block.id, optionId, delta)}
                onPickImage={(file) => onPickImage(block.id, file)}
              />
            ))}
          </ul>
        )}

        <BlockTypePicker onAdd={(type) => onAddBlock(type)} />
      </section>

      <Field label="성공 기준" help="이 단계가 끝났다고 판단할 기준을 문장으로 씁니다.">
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            value={step.successCriteria ?? ''}
            onChange={(event) =>
              onUpdate({
                successCriteria: event.target.value === '' ? undefined : event.target.value,
              })
            }
          />
        )}
      </Field>

      <div className={styles.row}>
        <Field label="완료 방식">
          {(control) => (
            <Select
              {...control}
              value={step.completionMode}
              onChange={(event) =>
                onUpdate({ completionMode: event.target.value as CompletionMode })
              }
            >
              {COMPLETION_ORDER.map((mode) => (
                <option key={mode} value={mode}>
                  {COMPLETION_LABELS[mode]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className={styles.optional}>
          <Checkbox
            label="선택 사항인 단계"
            checked={step.optional}
            onChange={(event) => onUpdate({ optional: event.target.checked })}
          />
        </div>
      </div>

      <section className={styles.content} aria-label="다음 단계">
        <h3 className={styles.contentTitle}>다음 단계</h3>

        {/* 상단에 문장식 요약을 먼저 보여 준다. (디자인 §2.4.6) */}
        <BranchSummary steps={steps} stepId={step.id} />

        <BranchRuleEditor
          step={step}
          steps={steps}
          issues={issues}
          onAddRule={onAddRule}
          onUpdateRule={onUpdateRule}
          onRemoveRule={onRemoveRule}
          onMoveRule={onMoveRule}
          onUpdateStep={onUpdate}
        />
      </section>
    </div>
  );
}
