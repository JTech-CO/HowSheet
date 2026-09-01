/**
 * 블록별 편집 폼.
 *
 * 기준: 기술 백서 §5.3(`BlockEditor`, 구 `BlockToolbar`), 디자인 백서 §2.4.5.
 * File_Structure.md §7 D-03 - 확정 이름은 `BlockEditor`이고 별도 `BlockToolbar`
 * 컴포넌트를 만들지 않는다.
 *
 * 판별 유니온을 소진 처리한다. 새 블록 타입이 생기면 `typecheck`가 깨진다.
 * (M5 DoD 1)
 */

import { useRef, useState } from 'react';

import type { ContentBlock } from '../../../domain/guide.types.ts';
import { ALLOWED_IMAGE_MIME_TYPES, FIELD_LIMITS } from '../../../domain/guide.types.ts';
import type { ImageIssue } from '../../../features/assets/image-optimizer.ts';
import { useAssetUrl } from '../../../features/assets/useAssetUrl.ts';
import type { StoredAsset } from '../../../storage/db.ts';
import { Button } from '../../ui/Button/Button.tsx';
import { Checkbox } from '../../ui/Checkbox/Checkbox.tsx';
import { Field } from '../../ui/Field/Field.tsx';
import { Input } from '../../ui/Input/Input.tsx';
import { Textarea } from '../../ui/Textarea/Textarea.tsx';
import { BLOCK_TYPE_LABELS } from '../BlockTypePicker/BlockTypePicker.tsx';
import { ReorderControls } from '../ReorderControls/ReorderControls.tsx';
import styles from './BlockEditor.module.css';

export interface BlockEditorProps {
  block: ContentBlock;
  index: number;
  total: number;
  onChange: (patch: Partial<ContentBlock>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  /** 이미지 파일을 붙인다. 검증·최적화·저장은 스토어가 한다. */
  onPickImage?: (file: File) => Promise<ImageIssue[]>;
  /** 이미지 블록이 가리키는 자산. 미리보기 URL은 이 컴포넌트가 만들고 해제한다. */
  asset?: StoredAsset | undefined;
}

export function BlockEditor(props: BlockEditorProps) {
  const { block, index, total } = props;

  return (
    <li
      className={styles.block}
      data-testid="block-editor"
      data-type={block.type}
      // 중복 제거(M5 DoD 8) 확인에 쓴다. 같은 이미지를 두 블록에 넣으면 같은 값이다.
      {...(block.type === 'image' ? { 'data-asset-id': block.assetId } : {})}
    >
      <div className={styles.header}>
        <span className={styles.type}>{BLOCK_TYPE_LABELS[block.type]}</span>
        <ReorderControls
          position={index + 1}
          total={total}
          itemLabel={`${BLOCK_TYPE_LABELS[block.type]} 블록 ${index + 1}`}
          onMove={props.onMove}
        />
        <Button variant="ghost" size="sm" onClick={props.onRemove} data-testid="block-remove">
          블록 삭제
        </Button>
      </div>

      <BlockFields {...props} />
    </li>
  );
}

function BlockFields(props: BlockEditorProps) {
  const { block, onChange } = props;

  switch (block.type) {
    case 'text':
      return (
        <Field label="본문" help="Markdown을 쓸 수 있습니다. HTML은 저장되지 않습니다.">
          {(control) => (
            <Textarea
              {...control}
              rows={5}
              maxLength={FIELD_LIMITS.textBlockMax}
              value={block.markdown}
              data-testid="block-text"
              onChange={(event) =>
                onChange({ markdown: event.target.value } as Partial<ContentBlock>)
              }
            />
          )}
        </Field>
      );

    case 'code':
      return (
        <>
          <Field label="언어" help="비우면 명령어로 표시합니다.">
            {(control) => (
              <Input
                {...control}
                value={block.language ?? ''}
                placeholder="bash"
                onChange={(event) =>
                  onChange({
                    language: event.target.value === '' ? undefined : event.target.value,
                  } as Partial<ContentBlock>)
                }
              />
            )}
          </Field>
          <Field label="코드">
            {(control) => (
              <Textarea
                {...control}
                rows={5}
                value={block.code}
                data-testid="block-code"
                onChange={(event) =>
                  onChange({ code: event.target.value } as Partial<ContentBlock>)
                }
              />
            )}
          </Field>
        </>
      );

    case 'link':
      return (
        <>
          <Field label="링크 이름" required>
            {(control) => (
              <Input
                {...control}
                value={block.label}
                data-testid="block-link-label"
                onChange={(event) =>
                  onChange({ label: event.target.value } as Partial<ContentBlock>)
                }
              />
            )}
          </Field>
          <Field label="주소" required help="http 또는 https만 사용할 수 있습니다.">
            {(control) => (
              <Input
                {...control}
                type="url"
                value={block.url}
                data-testid="block-link-url"
                onChange={(event) => onChange({ url: event.target.value } as Partial<ContentBlock>)}
              />
            )}
          </Field>
          <Field label="설명">
            {(control) => (
              <Input
                {...control}
                value={block.description ?? ''}
                onChange={(event) =>
                  onChange({
                    description: event.target.value === '' ? undefined : event.target.value,
                  } as Partial<ContentBlock>)
                }
              />
            )}
          </Field>
        </>
      );

    case 'image':
      return <ImageFields {...props} />;

    case 'checklist':
      return (
        <div className={styles.items}>
          {block.items.map((item, itemIndex) => (
            <div className={styles.item} key={item.id}>
              <Field label={`항목 ${itemIndex + 1}`} hideLabel>
                {(control) => (
                  <Input
                    {...control}
                    value={item.label}
                    placeholder={`항목 ${itemIndex + 1}`}
                    onChange={(event) =>
                      onChange({
                        items: block.items.map((entry) =>
                          entry.id === item.id ? { ...entry, label: event.target.value } : entry,
                        ),
                      } as Partial<ContentBlock>)
                    }
                  />
                )}
              </Field>
              <Checkbox
                label="필수"
                checked={item.required}
                onChange={(event) =>
                  onChange({
                    items: block.items.map((entry) =>
                      entry.id === item.id ? { ...entry, required: event.target.checked } : entry,
                    ),
                  } as Partial<ContentBlock>)
                }
              />
            </div>
          ))}
          <p className={styles.note}>항목 추가·삭제는 분기 편집과 함께 다음 단계에서 붙습니다.</p>
        </div>
      );

    case 'decision':
      return (
        <>
          <Field label="질문" required>
            {(control) => (
              <Input
                {...control}
                value={block.question}
                data-testid="block-decision-question"
                onChange={(event) =>
                  onChange({ question: event.target.value } as Partial<ContentBlock>)
                }
              />
            )}
          </Field>
          <div className={styles.items}>
            {block.options.map((option, optionIndex) => (
              <Field label={`선택지 ${optionIndex + 1}`} key={option.id}>
                {(control) => (
                  <Input
                    {...control}
                    value={option.label}
                    onChange={(event) =>
                      onChange({
                        options: block.options.map((entry) =>
                          entry.id === option.id ? { ...entry, label: event.target.value } : entry,
                        ),
                      } as Partial<ContentBlock>)
                    }
                  />
                )}
              </Field>
            ))}
          </div>
          <p className={styles.note}>
            어느 선택지가 어느 단계로 가는지는 분기 편집 화면에서 정합니다.
          </p>
        </>
      );

    case 'divider':
      return <p className={styles.note}>구분선입니다. 설정할 내용이 없습니다.</p>;

    default:
      return <UnsupportedFields block={block} />;
  }
}

function ImageFields({ block, onChange, onPickImage, asset }: BlockEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [issues, setIssues] = useState<ImageIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const { url } = useAssetUrl(asset);

  if (block.type !== 'image') return null;

  const onFile = async (file: File | undefined) => {
    if (file === undefined || onPickImage === undefined) return;
    setBusy(true);
    try {
      setIssues(await onPickImage(file));
    } finally {
      setBusy(false);
      // 같은 파일을 다시 고를 수 있게 값을 비운다.
      if (inputRef.current !== null) inputRef.current.value = '';
    }
  };

  return (
    <>
      <div className={styles.imageRow}>
        {url === null ? (
          <p className={styles.note}>아직 이미지가 없습니다.</p>
        ) : (
          <img className={styles.preview} src={url} alt="" data-testid="block-image-preview" />
        )}

        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
          data-testid="block-image-input"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button size="sm" busy={busy} onClick={() => inputRef.current?.click()}>
          이미지 고르기
        </Button>
      </div>

      {issues.length === 0 ? null : (
        <ul className={styles.issues} role="list" data-testid="image-issues">
          {issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      )}

      <Field
        label="대체 텍스트"
        required
        help="비워 두면 장식용 이미지로 봅니다. 내용을 전달하는 이미지는 반드시 채웁니다."
      >
        {(control) => (
          <Input
            {...control}
            value={block.alt}
            data-testid="block-image-alt"
            onChange={(event) => onChange({ alt: event.target.value } as Partial<ContentBlock>)}
          />
        )}
      </Field>

      <Field label="캡션">
        {(control) => (
          <Input
            {...control}
            value={block.caption ?? ''}
            onChange={(event) =>
              onChange({
                caption: event.target.value === '' ? undefined : event.target.value,
              } as Partial<ContentBlock>)
            }
          />
        )}
      </Field>
    </>
  );
}

/** 소진 검사. 새 블록 타입이 생기면 여기서 컴파일이 깨진다. */
function UnsupportedFields({ block }: { block: never }) {
  const unknown = block as { type?: unknown };
  return (
    <p className={styles.note} role="alert">
      지원하지 않는 블록입니다: {String(unknown.type)}
    </p>
  );
}
