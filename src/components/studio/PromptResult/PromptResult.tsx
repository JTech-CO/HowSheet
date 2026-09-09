/**
 * 프롬프트 생성과 결과.
 *
 * 기준: v2 제품정의 §3(생성·결과), §6.3. 하네스 P5 할 일 3, DoD 1·2·5.
 *
 * 여기서 지키는 것.
 *
 * - **어느 쪽으로 만들었는지 반드시 밝힌다.** AI가 다듬었는지 템플릿으로
 *   조립했는지가 배지에 글자로 적힌다. 색으로만 구분하지 않는다. (DoD 1, INV-09)
 * - 실패는 종류마다 다른 문장으로 안내한다. (DoD 2)
 * - 만드는 중에는 취소할 수 있고, 취소해도 앞의 결과가 남는다. (DoD 5)
 *
 * 복사·다운로드·이전 결과 보기는 P6이 붙인다.
 */

import type { SynthesisError } from '../../../features/synthesize/errors.ts';
import type { SynthesisOutcome } from '../../../features/synthesize/synthesize.ts';
import type { GenerateStatus } from '../../../store/generate.store.ts';
import { Button } from '../../ui/Button/Button.tsx';
import styles from './PromptResult.module.css';

export interface PromptResultProps {
  status: GenerateStatus;
  streaming: string;
  result: SynthesisOutcome | null;
  error?: SynthesisError;
  /** 키가 있는지. 누르기 전에 무슨 일이 일어날지 알려 준다. */
  hasKey: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}

function fallbackNotice(result: SynthesisOutcome): string | null {
  if (result.fallback === undefined) return null;
  if (result.fallback.reason === 'no-key') {
    return 'API 키가 없어 템플릿으로 조립했습니다. 설정에서 키를 넣으면 AI가 자료에 맞게 다듬습니다.';
  }
  if (result.fallback.reason === 'empty-response') {
    return 'AI가 빈 응답을 돌려줘 템플릿으로 조립했습니다. 다시 시도해 보세요.';
  }
  return `AI 합성에 실패해 템플릿으로 조립했습니다. ${result.fallback.error.message}`;
}

export function PromptResult({
  status,
  streaming,
  result,
  error,
  hasKey,
  onGenerate,
  onCancel,
}: PromptResultProps) {
  const running = status === 'running';
  const notice = result === null ? null : fallbackNotice(result);

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <Button variant="primary" data-testid="prompt-generate" busy={running} onClick={onGenerate}>
          {result === null ? '프롬프트 만들기' : '다시 만들기'}
        </Button>
        {running ? (
          <Button variant="secondary" data-testid="prompt-cancel" onClick={onCancel}>
            취소
          </Button>
        ) : null}
        <p className={styles.hint} data-testid="prompt-plan">
          {hasKey ? 'AI가 자료에 맞게 다듬습니다.' : '키가 없어 템플릿으로 조립합니다.'}
        </p>
      </div>

      {running ? (
        <div className={styles.running}>
          <p className={styles.status} role="status">
            만드는 중입니다. 취소해도 앞의 결과는 남습니다.
          </p>
          {/* 차오르는 것을 그대로 보여 준다. 텍스트로만 넣는다. */}
          <pre className={styles.text} data-testid="prompt-streaming">
            {streaming}
          </pre>
        </div>
      ) : null}

      {status === 'error' && error !== undefined ? (
        <p className={styles.error} role="alert" data-testid="prompt-error">
          {error.message}
        </p>
      ) : null}

      {result !== null && !running ? (
        <div className={styles.result}>
          <p className={styles.meta} data-testid="prompt-origin">
            {/* 색이 아니라 글자로 말한다. (INV-09) */}
            <span className={styles.badge}>
              {result.origin === 'ai' ? 'AI가 다듬음' : '템플릿으로 조립'}
            </span>
            <span className={styles.note}>
              {result.origin === 'ai'
                ? 'Claude Haiku가 자료에 맞게 다시 썼습니다.'
                : 'AI 없이 규칙으로 조립했습니다.'}
            </span>
          </p>

          {notice === null ? null : (
            <p className={styles.warning} data-testid="prompt-fallback">
              {notice}
            </p>
          )}

          {result.prohibitionsAppended ? (
            <p className={styles.warning} data-testid="prompt-prohibitions-appended">
              AI 출력에 금지 목록이 빠져 있어 덧붙였습니다. 프롬프트 끝을 확인하세요.
            </p>
          ) : null}

          {result.truncated ? (
            <p className={styles.warning} data-testid="prompt-truncated">
              자료 {result.sourceCharacters.toLocaleString('ko-KR')}자 중 앞의{' '}
              {result.includedCharacters.toLocaleString('ko-KR')}자만 실었습니다. 프롬프트 안에도
              같은 내용을 적어 두었습니다.
            </p>
          ) : null}

          <pre className={styles.text} data-testid="prompt-text">
            {result.text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
