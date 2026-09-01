/**
 * 복사 버튼.
 *
 * 기준: FR-006, 기술 백서 §2.2.3(명령어 복사), 하네스 M5 DoD 10.
 *
 * Clipboard API가 막히면 대상 텍스트를 선택 상태로 만들고 그 사실을 말로
 * 알린다. 결과 문구는 `role="status"`로 노출해 스크린 리더도 받는다.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';

import { copyOutcomeMessage, copyText, type CopyOutcome } from '../../../utils/clipboard.ts';
import styles from './CopyButton.module.css';

export interface CopyButtonProps {
  /** 복사할 원문. 화면 표시가 아니라 이 값이 클립보드로 간다. */
  text: string;
  /** 복사 실패 시 선택할 요소. 보통 코드 블록 본문이다. */
  fallbackTarget?: RefObject<HTMLElement | null>;
  label?: string;
}

/** 결과 문구를 지우는 시간. 너무 짧으면 스크린 리더가 읽기 전에 사라진다. */
const MESSAGE_MS = 4000;

export function CopyButton({ text, fallbackTarget, label = '복사' }: CopyButtonProps) {
  const [outcome, setOutcome] = useState<CopyOutcome | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const onCopy = async () => {
    const result = await copyText(text, { fallbackTarget: fallbackTarget?.current ?? null });
    setOutcome(result);

    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOutcome(null), MESSAGE_MS);
  };

  return (
    <span className={styles.wrapper}>
      <button
        type="button"
        className={[styles.button, 'focus-ring'].join(' ')}
        data-testid="copy-button"
        onClick={() => void onCopy()}
      >
        {label}
      </button>
      <span className={styles.message} role="status" data-testid="copy-message">
        {outcome === null ? '' : copyOutcomeMessage(outcome)}
      </span>
    </span>
  );
}
