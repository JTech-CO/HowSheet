/**
 * 경고 확인 게이트.
 *
 * 기준: FR-004, 디자인 백서 §1.4 원칙 2(위험은 숨기지 않고 과장하지 않는다),
 * §2.4.10. 하네스 M7 DoD 1.
 *
 * `requiresAcknowledgement`가 켜진 경고만 게이트다. 나머지는 읽히기만 한다.
 * 확인 문구가 비어 있어도 리더는 멈추지 않는다 - 기본 문구로 진행한다.
 * 작성기가 `WARNING_ACK_LABEL_REQUIRED`로 이미 경고하고 있고, 여기서 멈추면
 * 검증을 통과한 문서만 열리는 셈이 된다.
 */

import type { WarningBlock } from '../../../domain/guide.types.ts';
import { Checkbox } from '../../ui/Checkbox/Checkbox.tsx';
import styles from './WarningGate.module.css';

const DEFAULT_ACK_LABEL = '위 내용을 확인했습니다';

export interface WarningGateProps {
  warnings: readonly WarningBlock[];
  acknowledgedIds: ReadonlySet<string>;
  onAcknowledge: (warningId: string) => void;
}

export function WarningGate({ warnings, acknowledgedIds, onAcknowledge }: WarningGateProps) {
  if (warnings.length === 0) return null;

  const ordered = [...warnings].sort((a, b) => a.order - b.order);

  return (
    <section className={styles.section} aria-labelledby="reader-warnings">
      <h2 id="reader-warnings" className={styles.title}>
        주의
      </h2>
      <ul className={styles.list} role="list" data-testid="warning-list">
        {ordered.map((warning) => (
          <li
            key={warning.id}
            className={styles.warning}
            data-severity={warning.severity}
            data-testid="warning-item"
          >
            <h3 className={styles.warningTitle}>{warning.title}</h3>
            <p className={styles.body}>{warning.body}</p>
            {warning.requiresAcknowledgement ? (
              <Checkbox
                label={
                  warning.acknowledgementLabel === undefined ||
                  warning.acknowledgementLabel.trim() === ''
                    ? DEFAULT_ACK_LABEL
                    : warning.acknowledgementLabel
                }
                checked={acknowledgedIds.has(warning.id)}
                data-testid="warning-ack"
                // 확인은 되돌리지 않는다. 확인을 취소해 게이트를 다시 세우는
                // 것은 독자가 원하는 동작이 아니고, 진행 모델에도 되돌림이 없다.
                disabled={acknowledgedIds.has(warning.id)}
                onChange={(event) => {
                  if (event.target.checked) onAcknowledge(warning.id);
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
