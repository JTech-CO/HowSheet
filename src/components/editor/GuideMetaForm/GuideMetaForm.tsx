/**
 * 가이드 기본 정보 폼.
 *
 * 기준: FR-002, 기술 백서 §2.2.4(데이터 검증), 디자인 백서 §2.4.2(필드 순서).
 *
 * React Hook Form은 **비제어**로 쓴다. 값의 단일 기준은 `guide.store`이고,
 * RHF은 blur 시점 검증과 오류 메시지만 맡는다. 폼이 문서 사본을 따로 들고
 * 양방향으로 맞추면 자동 저장과 경합한다. (하네스 M4 주의)
 *
 * 문서가 바뀌면 `reset`으로 DOM 값을 새 문서에 맞춘다. 매 입력마다 reset하지
 * 않는다. 그러면 커서가 튄다.
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { FIELD_LIMITS, type GuideMeta } from '../../../domain/guide.types.ts';
import { Field } from '../../ui/Field/Field.tsx';
import { Input } from '../../ui/Input/Input.tsx';
import { Textarea } from '../../ui/Textarea/Textarea.tsx';
import styles from './GuideMetaForm.module.css';

export interface GuideMetaFormProps {
  /** 문서 식별자. 바뀌면 폼을 새 문서 값으로 되돌린다. */
  documentId: string;
  meta: GuideMeta;
  onChange: (patch: Partial<GuideMeta>) => void;
}

interface MetaFormValues {
  title: string;
  summary: string;
  audience: string;
  estimatedMinutes: string;
  author: string;
  language: string;
}

function toFormValues(meta: GuideMeta): MetaFormValues {
  return {
    title: meta.title,
    summary: meta.summary ?? '',
    audience: meta.audience ?? '',
    estimatedMinutes: meta.estimatedMinutes === undefined ? '' : String(meta.estimatedMinutes),
    author: meta.author ?? '',
    language: meta.language,
  };
}

/** 빈 문자열은 선택 필드의 "없음"이다. `''`를 저장하면 검증이 통과해 버린다. */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function GuideMetaForm({ documentId, meta, onChange }: GuideMetaFormProps) {
  const {
    register,
    reset,
    formState: { errors },
  } = useForm<MetaFormValues>({
    mode: 'onBlur',
    defaultValues: toFormValues(meta),
  });

  useEffect(() => {
    reset(toFormValues(meta));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 문서가 바뀔 때만 되돌린다.
  }, [documentId, reset]);

  return (
    <form className={styles.form} noValidate>
      <Field
        label="가이드 제목"
        required
        maxLength={FIELD_LIMITS.titleMax}
        value={meta.title}
        {...(errors.title?.message === undefined ? {} : { error: errors.title.message })}
      >
        {(control) => (
          <Input
            {...control}
            {...register('title', {
              required: '제목을 입력하세요.',
              maxLength: {
                value: FIELD_LIMITS.titleMax,
                message: `제목은 ${FIELD_LIMITS.titleMax}자를 넘을 수 없습니다.`,
              },
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                onChange({ title: event.target.value });
              },
            })}
            placeholder="예: 공유기 인터넷 연결이 끊길 때"
          />
        )}
      </Field>

      {/* 디자인 §2.4.2 — 제목 아래에 실제 리더의 제목을 작게 보여 준다. */}
      <p className={styles.preview}>
        <span className={styles.previewLabel}>리더에서 보이는 제목</span>
        <span className={styles.previewTitle} data-testid="title-preview">
          {meta.title.trim() === '' ? '제목 없는 가이드' : meta.title}
        </span>
      </p>

      <Field label="한 줄 요약" help="무엇을 해결하는 가이드인지 한 문장으로 적습니다.">
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            {...register('summary', {
              onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
                onChange({ summary: optional(event.target.value) });
              },
            })}
          />
        )}
      </Field>

      <Field
        label="대상 사용자"
        maxLength={FIELD_LIMITS.audienceMax}
        value={meta.audience ?? ''}
        help="이 가이드를 따라 할 사람을 적습니다."
        {...(errors.audience?.message === undefined ? {} : { error: errors.audience.message })}
      >
        {(control) => (
          <Input
            {...control}
            {...register('audience', {
              maxLength: {
                value: FIELD_LIMITS.audienceMax,
                message: `대상 사용자는 ${FIELD_LIMITS.audienceMax}자를 넘을 수 없습니다.`,
              },
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                onChange({ audience: optional(event.target.value) });
              },
            })}
            placeholder="예: 인터넷 설정을 처음 만져 보는 사람"
          />
        )}
      </Field>

      <div className={styles.row}>
        <Field
          label="예상 소요 시간(분)"
          {...(errors.estimatedMinutes?.message === undefined
            ? {}
            : { error: errors.estimatedMinutes.message })}
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              min={1}
              max={600}
              inputMode="numeric"
              {...register('estimatedMinutes', {
                validate: (value) =>
                  value.trim() === '' ||
                  (Number.isInteger(Number(value)) && Number(value) > 0) ||
                  '1 이상의 정수를 입력하세요.',
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  const raw = event.target.value.trim();
                  const parsed = Number(raw);
                  onChange({
                    estimatedMinutes:
                      raw === '' || !Number.isInteger(parsed) || parsed <= 0 ? undefined : parsed,
                  });
                },
              })}
            />
          )}
        </Field>

        <Field label="작성자">
          {(control) => (
            <Input
              {...control}
              {...register('author', {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  onChange({ author: optional(event.target.value) });
                },
              })}
            />
          )}
        </Field>

        <Field label="언어" help="BCP 47 태그. 예: ko-KR">
          {(control) => (
            <Input
              {...control}
              {...register('language', {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  const value = event.target.value.trim();
                  // 언어는 필수다. 비우면 저장하지 않고 마지막 값을 유지한다.
                  if (value !== '') onChange({ language: value });
                },
              })}
            />
          )}
        </Field>
      </div>
    </form>
  );
}
