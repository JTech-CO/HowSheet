/**
 * 경고 편집.
 *
 * 기준: FR-004, 디자인 백서 §2.4.4, §4.3.2(Warning Card).
 *
 * 위험(danger)을 고르면 도움말을 띄운다. 빨간색을 남발하면 진짜 위험이 묻힌다.
 * (디자인 §1.4 원칙 2 — 위험은 숨기지 않고 과장하지 않는다)
 */

import type { Severity, WarningBlock } from '../../../domain/guide.types.ts';
import { Button } from '../../ui/Button/Button.tsx';
import { Checkbox } from '../../ui/Checkbox/Checkbox.tsx';
import { Field } from '../../ui/Field/Field.tsx';
import { Input } from '../../ui/Input/Input.tsx';
import { Select } from '../../ui/Select/Select.tsx';
import { Textarea } from '../../ui/Textarea/Textarea.tsx';
import { ReorderControls } from '../ReorderControls/ReorderControls.tsx';
import styles from './WarningEditor.module.css';

const SEVERITY_ORDER: Severity[] = ['info', 'warning', 'danger'];

const SEVERITY_LABELS: Record<Severity, string> = {
  info: '안내',
  warning: '주의',
  danger: '위험',
};

export interface WarningEditorProps {
  items: WarningBlock[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<WarningBlock>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
}

export function WarningEditor({ items, onAdd, onUpdate, onRemove, onMove }: WarningEditorProps) {
  return (
    <div className={styles.editor}>
      {items.length === 0 ? (
        <p className={styles.empty}>
          경고가 없어도 됩니다. 되돌릴 수 없는 작업이 있으면 추가하세요.
        </p>
      ) : (
        <ul className={styles.list} role="list">
          {items.map((item, index) => (
            <li className={styles.item} key={item.id} data-testid="warning-item">
              <div className={styles.itemHeader}>
                <ReorderControls
                  position={index + 1}
                  total={items.length}
                  itemLabel={`경고 ${index + 1}`}
                  onMove={(delta) => onMove(item.id, delta)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(item.id)}
                  data-testid="warning-remove"
                >
                  경고 삭제
                </Button>
              </div>

              <Field
                label="심각도"
                {...(item.severity === 'danger'
                  ? { help: '빨간색은 실제 데이터 손실·장치 손상 위험에만 사용합니다.' }
                  : {})}
              >
                {(control) => (
                  <Select
                    {...control}
                    value={item.severity}
                    onChange={(event) =>
                      onUpdate(item.id, { severity: event.target.value as Severity })
                    }
                  >
                    {SEVERITY_ORDER.map((severity) => (
                      <option key={severity} value={severity}>
                        {SEVERITY_LABELS[severity]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="제목" required>
                {(control) => (
                  <Input
                    {...control}
                    value={item.title}
                    onChange={(event) => onUpdate(item.id, { title: event.target.value })}
                  />
                )}
              </Field>

              <Field label="본문" required>
                {(control) => (
                  <Textarea
                    {...control}
                    rows={3}
                    value={item.body}
                    onChange={(event) => onUpdate(item.id, { body: event.target.value })}
                  />
                )}
              </Field>

              <Checkbox
                label="독자가 확인해야 진행할 수 있음"
                checked={item.requiresAcknowledgement}
                onChange={(event) =>
                  onUpdate(item.id, { requiresAcknowledgement: event.target.checked })
                }
              />

              {item.requiresAcknowledgement ? (
                <Field label="확인 라벨" help="비우면 기본 문구를 사용합니다.">
                  {(control) => (
                    <Input
                      {...control}
                      value={item.acknowledgementLabel ?? ''}
                      placeholder="위 내용을 확인했습니다"
                      onChange={(event) =>
                        onUpdate(item.id, {
                          acknowledgementLabel:
                            event.target.value === '' ? undefined : event.target.value,
                        })
                      }
                    />
                  )}
                </Field>
              ) : null}

              {/* 디자인 §2.4.4 — 미리보기 카드 */}
              <div className={styles.preview} data-severity={item.severity}>
                <p className={styles.previewSeverity}>{SEVERITY_LABELS[item.severity]}</p>
                <p className={styles.previewTitle}>
                  {item.title.trim() === '' ? '제목 없음' : item.title}
                </p>
                <p className={styles.previewBody}>{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" onClick={onAdd} data-testid="warning-add">
        + 경고 추가
      </Button>
    </div>
  );
}
