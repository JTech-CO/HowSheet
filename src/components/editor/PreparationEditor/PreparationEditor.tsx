/**
 * 준비물 편집.
 *
 * 기준: FR-003, 디자인 백서 §2.4.3.
 *
 * 항목을 행 단위로 편집하고 필수/선택을 명확히 보여 준다. 빈 준비물 섹션도
 * 허용한다. 리더에서는 자동으로 숨긴다.
 */

import type { PreparationItem } from '../../../domain/guide.types.ts';
import { Button } from '../../ui/Button/Button.tsx';
import { Checkbox } from '../../ui/Checkbox/Checkbox.tsx';
import { Field } from '../../ui/Field/Field.tsx';
import { Input } from '../../ui/Input/Input.tsx';
import { Textarea } from '../../ui/Textarea/Textarea.tsx';
import { ReorderControls } from '../ReorderControls/ReorderControls.tsx';
import styles from './PreparationEditor.module.css';

export interface PreparationEditorProps {
  items: PreparationItem[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<PreparationItem>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
}

export function PreparationEditor({
  items,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: PreparationEditorProps) {
  return (
    <div className={styles.editor}>
      {items.length === 0 ? (
        <p className={styles.empty}>
          준비물이 없어도 됩니다. 필요한 도구나 계정이 있으면 추가하세요.
        </p>
      ) : (
        <ul className={styles.list} role="list">
          {items.map((item, index) => (
            <li className={styles.item} key={item.id} data-testid="preparation-item">
              <div className={styles.itemHeader}>
                <span className={styles.index}>{index + 1}</span>
                <ReorderControls
                  position={index + 1}
                  total={items.length}
                  itemLabel={`준비물 ${index + 1}`}
                  onMove={(delta) => onMove(item.id, delta)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(item.id)}
                  data-testid="preparation-remove"
                >
                  준비물 삭제
                </Button>
              </div>

              <Field label={`준비물 ${index + 1} 이름`} hideLabel required>
                {(control) => (
                  <Input
                    {...control}
                    value={item.label}
                    placeholder="예: 공유기 관리자 비밀번호"
                    onChange={(event) => onUpdate(item.id, { label: event.target.value })}
                  />
                )}
              </Field>

              <Checkbox
                label="필수 항목"
                hint="선택으로 두면 리더가 없어도 진행할 수 있습니다."
                checked={item.required}
                onChange={(event) => onUpdate(item.id, { required: event.target.checked })}
              />

              <details className={styles.details}>
                <summary className={styles.summary}>자세히 설명 · 링크</summary>
                <div className={styles.detailsBody}>
                  <Field label="설명">
                    {(control) => (
                      <Textarea
                        {...control}
                        rows={2}
                        value={item.detail ?? ''}
                        onChange={(event) =>
                          onUpdate(item.id, {
                            detail: event.target.value === '' ? undefined : event.target.value,
                          })
                        }
                      />
                    )}
                  </Field>
                  <div className={styles.linkRow}>
                    <Field label="링크 이름">
                      {(control) => (
                        <Input
                          {...control}
                          value={item.link?.label ?? ''}
                          onChange={(event) =>
                            onUpdate(item.id, {
                              link: buildLink(event.target.value, item.link?.url ?? ''),
                            })
                          }
                        />
                      )}
                    </Field>
                    <Field label="링크 주소" help="http 또는 https만 사용할 수 있습니다.">
                      {(control) => (
                        <Input
                          {...control}
                          type="url"
                          value={item.link?.url ?? ''}
                          onChange={(event) =>
                            onUpdate(item.id, {
                              link: buildLink(item.link?.label ?? '', event.target.value),
                            })
                          }
                        />
                      )}
                    </Field>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" onClick={onAdd} data-testid="preparation-add">
        + 준비물 추가
      </Button>
    </div>
  );
}

/** 이름과 주소가 모두 있어야 링크다. 반쪽 링크를 저장하면 검증에서 걸린다. */
function buildLink(label: string, url: string): PreparationItem['link'] {
  if (label.trim() === '' || url.trim() === '') return undefined;
  return { label: label.trim(), url: url.trim() };
}
