/**
 * 오류 해결 아코디언.
 *
 * 기준: FR-010, 디자인 백서 §4.3.5. 하네스 M7 할 일 1, DoD 3.
 *
 * `<details>`를 쓴다. 직접 만든 아코디언은 키보드·스크린 리더 동작을 다시
 * 짜야 하고, 인쇄에서 접힌 내용이 사라진다. 브라우저 기본 요소는 둘 다 공짜다.
 *
 * 전역 항목과 단계 항목을 나눠 보여 준다. `scope`가 이긴다 - `global`인데
 * `stepId`가 있는 항목은 전역에만 넣는다. 그러지 않으면 같은 항목이 두 번 뜬다.
 */

import type { ContentBlock, TroubleshootingItem } from '../../../domain/guide.types.ts';
import { BlockRenderer } from '../../content/BlockRenderer/BlockRenderer.tsx';
import styles from './TroubleshootingAccordion.module.css';

export interface TroubleshootingAccordionProps {
  items: readonly TroubleshootingItem[];
  title: string;
  resolveAssetUrl?: (assetId: string) => string | null;
}

export function TroubleshootingAccordion({
  items,
  title,
  resolveAssetUrl,
}: TroubleshootingAccordionProps) {
  if (items.length === 0) return null;

  const ordered = [...items].sort((a, b) => a.order - b.order);

  return (
    <section className={styles.section} data-testid="troubleshooting">
      <h2 className={styles.title}>{title}</h2>
      {ordered.map((item) => (
        <details key={item.id} className={styles.item} data-testid="troubleshooting-item">
          <summary className={[styles.summary, 'focus-ring'].join(' ')}>{item.symptom}</summary>
          <div className={styles.body}>
            {item.likelyCause === undefined ? null : (
              <p className={styles.cause}>{`짐작되는 원인: ${item.likelyCause}`}</p>
            )}
            {[...item.resolution]
              .sort((a, b) => a.order - b.order)
              .map((block: ContentBlock) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  {...(resolveAssetUrl === undefined ? {} : { resolveAssetUrl })}
                />
              ))}
          </div>
        </details>
      ))}
    </section>
  );
}
