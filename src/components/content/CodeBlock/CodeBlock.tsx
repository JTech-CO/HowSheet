/**
 * 코드·명령어 블록.
 *
 * 기준: FR-006, 기술 백서 §4.4.3-5, 디자인 백서 §4.3.6, 하네스 M5 DoD 3·10.
 *
 * 코드는 **항상 텍스트 노드**로 렌더링한다. React가 문자열 자식을 이스케이프
 * 하므로 `</script>`나 `<img onerror=...>`가 그대로 텍스트로 남는다. 여기에
 * 하이라이터를 붙여 HTML을 만들기 시작하면 INV-07의 표면이 넓어진다. MVP는
 * 하이라이팅을 하지 않는다.
 */

import { useId, useRef, useState } from 'react';

import { CopyButton } from '../CopyButton/CopyButton.tsx';
import styles from './CodeBlock.module.css';

export interface CodeBlockProps {
  code: string;
  language?: string;
  copyLabel?: string;
}

export function CodeBlock({ code, language, copyLabel }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement | null>(null);
  const [wrap, setWrap] = useState(false);
  const labelId = useId();

  const languageLabel = language === undefined || language === '' ? '명령어' : language;

  return (
    <figure className={styles.block} data-testid="code-block">
      <figcaption className={styles.header}>
        <span className={styles.language} id={labelId}>
          {languageLabel}
        </span>
        <span className={styles.actions}>
          <button
            type="button"
            className={[styles.toggle, 'focus-ring'].join(' ')}
            aria-pressed={wrap}
            onClick={() => setWrap((value) => !value)}
          >
            줄바꿈
          </button>
          <CopyButton
            text={code}
            fallbackTarget={preRef}
            {...(copyLabel === undefined ? {} : { label: copyLabel })}
          />
        </span>
      </figcaption>

      {/* tabIndex로 키보드 사용자도 가로 스크롤할 수 있게 한다. (INV-12) */}
      <pre
        ref={preRef}
        className={styles.pre}
        data-wrap={wrap ? 'true' : 'false'}
        tabIndex={0}
        role="group"
        aria-labelledby={labelId}
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
}
