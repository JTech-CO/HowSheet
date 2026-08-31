/**
 * 가이드 개요.
 *
 * 기준: 기술 백서 §5.3 `GuideOutline`, 디자인 백서 §2.1.2(왼쪽 개요).
 *
 * 섹션 탐색과 단계 선택을 맡는다. 섹션 이름은 편집기·리더와 같은 말을 쓴다.
 * (File_Structure.md §4)
 */

import type { GuideDocument } from '../../../domain/guide.types.ts';
import type { EditorSection } from '../../../store/guide.store.ts';
import { Button } from '../../ui/Button/Button.tsx';
import styles from './GuideOutline.module.css';

export interface GuideOutlineProps {
  document: GuideDocument;
  section: EditorSection;
  selectedStepId: string | null;
  onSelectSection: (section: EditorSection) => void;
  onSelectStep: (stepId: string) => void;
  onAddStep: () => void;
  /** 방금 추가된 단계. 잠시 강조해 위치를 알려 준다. (디자인 §2.2.1) */
  highlightStepId?: string | null;
}

const SECTIONS: { id: EditorSection; label: string }[] = [
  { id: 'meta', label: '기본 정보' },
  { id: 'preparation', label: '준비물' },
  { id: 'warnings', label: '경고' },
];

export function GuideOutline({
  document,
  section,
  selectedStepId,
  onSelectSection,
  onSelectStep,
  onAddStep,
  highlightStepId = null,
}: GuideOutlineProps) {
  const steps = [...document.steps].sort((a, b) => a.order - b.order);

  return (
    <nav className={styles.outline} aria-label="가이드 개요">
      <ul className={styles.sections} role="list">
        {SECTIONS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={[styles.sectionButton, 'focus-ring'].join(' ')}
              aria-current={section === item.id ? 'true' : undefined}
              onClick={() => onSelectSection(item.id)}
            >
              {item.label}
              {item.id === 'preparation' && document.preparation.length > 0 ? (
                <span className={styles.count}>{document.preparation.length}</span>
              ) : null}
              {item.id === 'warnings' && document.warnings.length > 0 ? (
                <span className={styles.count}>{document.warnings.length}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <h2 className={styles.groupTitle} id="outline-steps">
        단계 <span className={styles.count}>{steps.length}</span>
      </h2>
      <ul className={styles.steps} role="list" aria-labelledby="outline-steps">
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              className={[styles.stepButton, 'focus-ring'].join(' ')}
              data-testid="outline-step"
              data-highlight={highlightStepId === step.id ? 'true' : undefined}
              aria-current={section === 'steps' && selectedStepId === step.id ? 'true' : undefined}
              onClick={() => onSelectStep(step.id)}
            >
              <span className={styles.stepIndex}>{index + 1}</span>
              <span className={styles.stepTitle}>
                {step.title.trim() === '' ? '제목 없는 단계' : step.title}
              </span>
              {step.id === document.startStepId ? (
                <span className={styles.startBadge}>시작</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <Button variant="secondary" size="sm" onClick={onAddStep} data-testid="outline-add-step">
        + 단계 추가
      </Button>
    </nav>
  );
}
