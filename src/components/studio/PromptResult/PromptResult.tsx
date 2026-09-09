/**
 * 프롬프트 생성과 결과.
 *
 * 기준: v2 제품정의 §3(생성·결과), §6.3. 하네스 P5 할 일 3·DoD 1·2·5,
 * P6 할 일 전부·DoD 1·2·3.
 *
 * 여기서 지키는 것.
 *
 * - **어느 쪽으로 만들었는지 반드시 밝힌다.** AI가 다듬었는지 템플릿으로
 *   조립했는지가 배지에 글자로 적힌다. 색으로만 구분하지 않는다. (P5 DoD 1, INV-09)
 * - 실패는 종류마다 다른 문장으로 안내한다. (P5 DoD 2)
 * - 만드는 중에는 취소할 수 있고, 취소해도 앞의 결과가 남는다. (P5 DoD 5)
 * - 복사가 막히면 전문을 선택 상태로 만든다. (P6 DoD 1)
 * - 다시 만들어도 앞의 결과가 목록에 남아 언제든 돌아갈 수 있다. (P6 DoD 3)
 */

import { useRef } from 'react';

import type { SynthesisError } from '../../../features/synthesize/errors.ts';
import type { GeneratedResult, GenerateStatus } from '../../../store/generate.store.ts';
import { downloadText } from '../../../utils/download.ts';
import { promptFileName } from '../../../utils/filename.ts';
import { CopyButton } from '../../content/CopyButton/CopyButton.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import styles from './PromptResult.module.css';

/** `.md`로 내려받는다. 붙여넣는 것이 목적이라 서식 없는 텍스트가 맞다. */
const MARKDOWN_MIME = 'text/markdown;charset=utf-8';

export interface PromptResultProps {
  status: GenerateStatus;
  streaming: string;
  /** 만든 결과들. 앞이 최신이다. */
  results: readonly GeneratedResult[];
  selected: number;
  error?: SynthesisError;
  /** 키가 있는지. 누르기 전에 무슨 일이 일어날지 알려 준다. */
  hasKey: boolean;
  /** 파일명을 만드는 데 쓰는 자료. (DoD 2) */
  source: string;
  onGenerate: () => void;
  onCancel: () => void;
  onSelect: (index: number) => void;
}

function fallbackNotice(result: GeneratedResult): string | null {
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
  results,
  selected,
  error,
  hasKey,
  source,
  onGenerate,
  onCancel,
  onSelect,
}: PromptResultProps) {
  // 복사가 막혔을 때 선택할 대상. 전문이 들어 있는 상자다. (DoD 1)
  const textRef = useRef<HTMLPreElement>(null);

  const running = status === 'running';
  const result = results[selected] ?? null;
  const notice = result === null ? null : fallbackNotice(result);

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <Button variant="primary" data-testid="prompt-generate" busy={running} onClick={onGenerate}>
          {results.length === 0 ? '프롬프트 만들기' : '다시 만들기'}
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
          {results.length > 1 ? (
            <div
              className={styles.history}
              role="group"
              aria-label="만든 결과"
              data-testid="prompt-history"
            >
              {results.map((item, index) => (
                <Button
                  key={item.revision}
                  size="sm"
                  variant={index === selected ? 'primary' : 'ghost'}
                  aria-pressed={index === selected}
                  data-testid={'prompt-history-' + String(item.revision)}
                  onClick={() => onSelect(index)}
                >
                  {/* 순서를 색이 아니라 글자로 말한다. (INV-09) */}
                  {item.revision}회차{index === 0 ? ' (최신)' : ''}
                </Button>
              ))}
            </div>
          ) : null}

          <p className={styles.meta} data-testid="prompt-origin">
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

          <div className={styles.actions}>
            {/* 복사가 막히면 아래 상자를 통째로 선택한다. (DoD 1) */}
            <CopyButton text={result.text} fallbackTarget={textRef} label="프롬프트 복사" />
            <Button
              variant="secondary"
              data-testid="prompt-download"
              onClick={() =>
                downloadText(promptFileName(source, result.revision), MARKDOWN_MIME, result.text)
              }
            >
              .md 내려받기
            </Button>
          </div>

          <pre className={styles.text} data-testid="prompt-text" ref={textRef}>
            {result.text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
