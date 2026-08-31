/**
 * 단계 편집.
 *
 * 기준: FR-005, 디자인 백서 §2.4.5, §4.3.1(Step Card).
 *
 * 단계 번호는 데이터 순서에서 자동 계산한다. 직접 입력하지 않는다.
 * (디자인 §2.4.5)
 *
 * 콘텐츠 블록은 M4에서 기본 텍스트 블록만 편집한다. 블록 추가·타입 선택·
 * 명령어·이미지 편집은 M5의 `BlockEditor`/`BlockTypePicker`가 맡는다.
 */

import type { CompletionMode, ContentBlock, GuideStep } from '../../../domain/guide.types.ts';
import { FIELD_LIMITS } from '../../../domain/guide.types.ts';
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
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** 편집 가능한 첫 텍스트 블록. M4의 콘텐츠 편집 범위다. */
function firstTextBlock(step: GuideStep): Extract<ContentBlock, { type: 'text' }> | undefined {
  return step.blocks.find(
    (block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text',
  );
}

export function StepEditor({
  step,
  index,
  total,
  canRemove,
  onUpdate,
  onUpdateBlock,
  onMove,
  onDuplicate,
  onRemove,
}: StepEditorProps) {
  const textBlock = firstTextBlock(step);
  const otherBlocks = step.blocks.filter((block) => block.id !== textBlock?.id);

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
        {textBlock === undefined ? null : (
          <Field label="본문" help="Markdown을 쓸 수 있습니다.">
            {(control) => (
              <Textarea
                {...control}
                rows={6}
                value={textBlock.markdown}
                maxLength={FIELD_LIMITS.textBlockMax}
                data-testid="step-text-block"
                onChange={(event) => onUpdateBlock(textBlock.id, { markdown: event.target.value })}
              />
            )}
          </Field>
        )}
        {otherBlocks.length === 0 ? null : (
          <p className={styles.otherBlocks}>
            이 단계에는 다른 블록 {otherBlocks.length}개가 있습니다. 명령어·링크·이미지·체크리스트·
            선택 블록 편집은 다음 단계에서 추가됩니다.
          </p>
        )}
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

      <p className={styles.branchNote}>
        다음 단계와 조건 분기 설정은 분기 편집 화면에서 추가됩니다.
        {step.branchRules.length > 0
          ? ` 현재 분기 규칙 ${step.branchRules.length}개가 있습니다.`
          : null}
      </p>
    </div>
  );
}
