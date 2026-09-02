/**
 * 리더 단계 화면.
 *
 * 기준: 기술 백서 §2.2.2(독자 흐름), §4.3.4(분기 실행), 디자인 백서 §2.4.11.
 * 하네스 M7 할 일 1·7, DoD 2·3·9.
 *
 * 콘텐츠는 `components/content`의 `BlockRenderer`가 그린다. 리더용 렌더러를
 * 따로 만들지 않는다 - 미리보기와 리더가 갈라지면 INV-09를 손으로 유지해야 한다.
 *
 * **단계 이동 후 제목에 포커스를 옮긴다.** (DoD 9) 최초 마운트에서는 옮기지
 * 않는다 - 사용자가 요청하지 않은 포커스 이동은 만들지 않는다.
 *
 * 진행 차단 사유는 화면 상단이 아니라 **막고 있는 입력 근처**에 표시한다.
 * 상단 오류 요약은 무엇을 고쳐야 하는지 알려 주지 못한다. (디자인 §2.4.11)
 */

import { useEffect, useRef } from 'react';

import type { GuideStep } from '../../../domain/guide.types.ts';
import type { ReaderStepState } from '../../../domain/progress.types.ts';
import type { AdvanceBlock } from '../../../reader-runtime/reader-state.ts';
import { needsSuccessCheck } from '../../../reader-runtime/reader-state.ts';
import { BlockRenderer } from '../../content/BlockRenderer/BlockRenderer.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import { Checkbox } from '../../ui/Checkbox/Checkbox.tsx';
import styles from './ReaderStep.module.css';

export interface ReaderStepProps {
  step: GuideStep;
  /** 활성 경로에서 1부터 세는 위치. */
  position: number;
  total: number;
  state: ReaderStepState | undefined;
  /** 다음으로 못 가는 이유. `null`이면 막힌 것이 없다. */
  block: AdvanceBlock | null;
  canGoBack: boolean;
  /** 활성 경로의 마지막 단계인가. 버튼 문구가 달라진다. */
  isLast: boolean;
  onToggleChecklistItem: (blockId: string, itemId: string, checked: boolean) => void;
  onSelectOption: (blockId: string, optionId: string) => void;
  onToggleSuccess: (completed: boolean) => void;
  onNext: () => void;
  onBack: () => void;
  resolveAssetUrl?: (assetId: string) => string | null;
}

export function ReaderStep({
  step,
  position,
  total,
  state,
  block,
  canGoBack,
  isLast,
  onToggleChecklistItem,
  onSelectOption,
  onToggleSuccess,
  onNext,
  onBack,
  resolveAssetUrl,
}: ReaderStepProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const mountedStepRef = useRef<string | null>(null);

  useEffect(() => {
    // 최초 마운트에서는 옮기지 않는다. 단계가 **바뀐** 뒤에만 옮긴다. (DoD 9)
    if (mountedStepRef.current !== null && mountedStepRef.current !== step.id) {
      headingRef.current?.focus();
    }
    mountedStepRef.current = step.id;
  }, [step.id]);

  const blocks = [...step.blocks].sort((a, b) => a.order - b.order);
  const completed = state?.completedAt !== undefined;
  const showSuccessCheck = needsSuccessCheck(step);

  return (
    <article className={styles.step} data-testid="reader-step" data-step-id={step.id}>
      <header className={styles.header}>
        <p className={styles.position}>{`${total}단계 중 ${position}번째`}</p>
        {/*
          tabIndex -1은 포커스를 프로그램으로만 옮기기 위한 것이다. 탭 순서에
          넣지 않는다. 제목이 논리적 시작점이라 여기로 옮긴다. (DoD 9)
        */}
        <h1 className={styles.title} tabIndex={-1} ref={headingRef} data-testid="reader-step-title">
          {step.title}
        </h1>
        {step.summary === undefined || step.summary === '' ? null : (
          <p className={styles.summary}>{step.summary}</p>
        )}
      </header>

      <div className={styles.blocks}>
        {blocks.map((entry) => (
          <BlockRenderer
            key={entry.id}
            block={entry}
            checkedItemIds={state?.checkedItemIds ?? []}
            onToggleChecklistItem={onToggleChecklistItem}
            selectedOptionId={state?.selectedOptionByBlock?.[entry.id] ?? null}
            onSelectOption={onSelectOption}
            {...(resolveAssetUrl === undefined ? {} : { resolveAssetUrl })}
          />
        ))}
      </div>

      {step.successCriteria === undefined || step.successCriteria === '' ? null : (
        <section className={styles.success} data-testid="reader-success">
          <h2 className={styles.successTitle}>이렇게 되면 성공입니다</h2>
          <p className={styles.successBody}>{step.successCriteria}</p>
          {/*
            `automatic` 단계는 기준 문장만 보여 주고 체크박스를 그리지 않는다.
            완료 방식의 단일 원본은 `completionMode`이고 `successCriteria`는 문장이다.
          */}
          {showSuccessCheck ? (
            <Checkbox
              label="확인했습니다"
              checked={completed}
              data-testid="reader-success-check"
              onChange={(event) => onToggleSuccess(event.target.checked)}
            />
          ) : null}
        </section>
      )}

      {block === null ? null : (
        <p className={styles.blocked} role="status" data-testid="reader-blocked">
          {block.kind === 'not-answered'
            ? '이 단계의 필수 항목을 먼저 확인하거나 선택하세요.'
            : '다음 단계를 찾을 수 없습니다. 가이드를 만든 사람에게 알려 주세요.'}
        </p>
      )}

      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={!canGoBack}
          data-testid="reader-back"
          onClick={onBack}
        >
          이전
        </Button>
        <Button data-testid="reader-next" onClick={onNext}>
          {isLast ? '완료' : '다음 단계'}
        </Button>
      </div>
    </article>
  );
}
