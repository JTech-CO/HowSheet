/**
 * 폼 필드 껍데기.
 *
 * 기준: 기술 백서 §5.2 `Field / Input / Textarea`, `File_Structure.md` §4 D-05.
 *
 * 라벨·도움말·글자 수·오류 메시지와 `aria-describedby` 연결을 **여기서만**
 * 소유한다. `Input`·`Textarea`는 박스 규격만 갖고 항상 이 안에서 렌더링한다.
 * 컨트롤이 필요로 하는 속성은 render prop으로 내려 준다. 컨트롤이 스스로
 * id를 만들면 라벨 연결이 두 곳에서 관리돼 반드시 어긋난다.
 */

import { useId, type ReactNode } from 'react';

import styles from './Field.module.css';

/** 컨트롤에 그대로 펴 넣는 속성. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
  maxLength?: number;
}

export interface FieldProps {
  label: string;
  /** 라벨을 시각적으로 숨긴다. 접근 이름은 그대로 남는다. */
  hideLabel?: boolean;
  help?: string;
  error?: string;
  required?: boolean;
  /** 글자 수 표시를 켠다. FR-002의 "문자 수 표시". */
  maxLength?: number;
  value?: string;
  children: (control: FieldControlProps) => ReactNode;
}

export function Field({
  label,
  hideLabel = false,
  help,
  error,
  required = false,
  maxLength,
  value,
  children,
}: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const countId = `${id}-count`;

  const showCount = maxLength !== undefined && value !== undefined;
  const describedBy = [
    help === undefined ? null : helpId,
    showCount ? countId : null,
    error === undefined ? null : errorId,
  ]
    .filter((item): item is string => item !== null)
    .join(' ');

  const control: FieldControlProps = {
    id,
    ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
    ...(error === undefined ? {} : { 'aria-invalid': true as const }),
    ...(required ? { required: true } : {}),
    ...(maxLength === undefined ? {} : { maxLength }),
  };

  return (
    <div className={styles.field} data-invalid={error === undefined ? undefined : 'true'}>
      <label className={hideLabel ? 'sr-only' : styles.label} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children(control)}

      <div className={styles.meta}>
        <div className={styles.messages}>
          {help === undefined ? null : (
            <p className={styles.help} id={helpId}>
              {help}
            </p>
          )}
          {error === undefined ? null : (
            <p className={styles.error} id={errorId}>
              {error}
            </p>
          )}
        </div>
        {showCount ? (
          <p className={styles.count} id={countId}>
            <span className="sr-only">글자 수 </span>
            {value.length}/{maxLength}
          </p>
        ) : null}
      </div>
    </div>
  );
}
