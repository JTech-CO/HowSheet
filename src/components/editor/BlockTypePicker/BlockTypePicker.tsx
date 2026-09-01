/**
 * 블록 추가 목록.
 *
 * 기준: FR-006, 디자인 백서 §2.2.1(블록 추가), §2.4.5.
 *
 * **순서를 고정한다.** 최근 사용 순으로 재배치하면 버튼 위치가 매번 달라져
 * 학습 비용이 늘고 근육 기억이 무너진다. (디자인 §2.2.1)
 */

import { CONTENT_BLOCK_TYPES, type ContentBlockType } from '../../../domain/guide.types.ts';
import styles from './BlockTypePicker.module.css';

const LABELS: Record<ContentBlockType, string> = {
  text: '텍스트',
  code: '명령어',
  link: '링크',
  image: '이미지',
  checklist: '체크리스트',
  decision: '선택 분기',
  divider: '구분선',
};

/** 아이콘 대신 쓰는 글리프. 아이콘 세트는 M11에서 붙인다. */
const GLYPHS: Record<ContentBlockType, string> = {
  text: '¶',
  code: '>_',
  link: '↗',
  image: '▣',
  checklist: '☑',
  decision: '⑂',
  divider: '─',
};

export interface BlockTypePickerProps {
  onAdd: (type: ContentBlockType) => void;
}

export function BlockTypePicker({ onAdd }: BlockTypePickerProps) {
  return (
    <div className={styles.picker} role="group" aria-label="블록 추가">
      {CONTENT_BLOCK_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className={[styles.button, 'focus-ring'].join(' ')}
          data-testid={`add-block-${type}`}
          onClick={() => onAdd(type)}
        >
          <span className={styles.glyph} aria-hidden="true">
            {GLYPHS[type]}
          </span>
          {LABELS[type]}
        </button>
      ))}
    </div>
  );
}

export { LABELS as BLOCK_TYPE_LABELS };
