/**
 * 자료 입력.
 *
 * 기준: v2 제품정의 §3(화면). 하네스 P1 할 일 1·2·5, DoD 5.
 *
 * 원문과 미리보기를 한 자리에서 오간다. 나란히 두지 않는 이유는 좁은 화면에서
 * 둘 다 쓸모없어지기 때문이다. 320px에서 두 칸으로 나누면 어느 쪽도 읽히지 않는다.
 */

import { useId, useState } from 'react';

import { countCharacters, estimateTokens } from '../../../domain/studio.defaults.ts';
import { SOURCE_LENGTH_WARN } from '../../../domain/studio.types.ts';
import { MAX_SOURCE_CHARACTERS } from '../../../features/compose/compose.ts';
import { Button } from '../../ui/Button/Button.tsx';
import { Textarea } from '../../ui/Textarea/Textarea.tsx';
import { MarkdownText } from '../../content/MarkdownText/MarkdownText.tsx';
import styles from './SourceInput.module.css';

export interface SourceInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

type Mode = 'write' | 'preview';

export function SourceInput({ value, onChange, onClear }: SourceInputProps) {
  const [mode, setMode] = useState<Mode>('write');
  const textareaId = useId();
  const countsId = useId();

  const characters = countCharacters(value);
  const tokens = estimateTokens(value);
  // 공백만 있는 자료는 조립기가 자르지 않는다(compose.ts의 빈 자료 분기).
  const willTruncate = characters > MAX_SOURCE_CHARACTERS && value.trim() !== '';
  const tooLong = characters > SOURCE_LENGTH_WARN;

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.modes} role="group" aria-label="보기 전환">
          <Button
            variant={mode === 'write' ? 'primary' : 'ghost'}
            aria-pressed={mode === 'write'}
            data-testid="source-mode-write"
            onClick={() => setMode('write')}
          >
            원문
          </Button>
          <Button
            variant={mode === 'preview' ? 'primary' : 'ghost'}
            aria-pressed={mode === 'preview'}
            data-testid="source-mode-preview"
            onClick={() => setMode('preview')}
          >
            미리보기
          </Button>
        </div>

        <Button
          variant="ghost"
          data-testid="source-clear"
          disabled={value === ''}
          onClick={onClear}
        >
          지우기
        </Button>
      </div>

      {mode === 'write' ? (
        <Textarea
          id={textareaId}
          aria-describedby={countsId}
          aria-label="자료"
          className={styles.input}
          data-testid="source-input"
          rows={16}
          placeholder="한 페이지로 만들고 싶은 내용을 붙여넣습니다."
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className={styles.preview} data-testid="source-preview">
          {value === '' ? (
            <p className={styles.empty}>아직 자료가 없습니다.</p>
          ) : (
            <MarkdownText markdown={value} />
          )}
        </div>
      )}

      <p className={styles.counts} id={countsId} data-testid="source-counts">
        <span>{characters.toLocaleString('ko-KR')}자</span>
        <span aria-hidden="true">·</span>
        {/*
          "약"을 반드시 붙인다. 정확한 토큰 수는 모델의 토크나이저만 알고,
          여기 값은 크기를 가늠하기 위한 어림수다. (P1 DoD 5, 주의)
        */}
        <span>약 {tokens.toLocaleString('ko-KR')}토큰</span>
      </p>

      {/*
        잘림은 생성한 뒤가 아니라 붙여넣은 자리에서 알린다. 예전 문구는
        "자르지 않고 그대로 두니"라고 했는데, 그 문구가 보이는 모든 경우가
        이미 상한을 넘겨 잘리는 경우였다. (출시 점검 2026-09-16)
      */}
      {willTruncate ? (
        <p className={styles.warning} role="status" data-testid="source-will-truncate">
          자료가 {MAX_SOURCE_CHARACTERS.toLocaleString('ko-KR')}자를 넘습니다. 프롬프트에는 앞의{' '}
          {MAX_SOURCE_CHARACTERS.toLocaleString('ko-KR')}자만 싣고, 잘렸다는 사실을 프롬프트에
          적습니다. 남길 부분을 직접 고르려면 자료를 줄이세요.
        </p>
      ) : null}

      {tooLong ? (
        // 잘림 경고와 함께 뜬다. 둘 다 알림 영역이면 한꺼번에 두 번 읽힌다.
        <p className={styles.warning} data-testid="source-too-long">
          자료가 {SOURCE_LENGTH_WARN.toLocaleString('ko-KR')}자를 넘습니다. 입력과 미리보기가 느려질
          수 있습니다. 입력 칸에는 전문이 그대로 남습니다.
        </p>
      ) : null}
    </div>
  );
}
