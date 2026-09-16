/**
 * 살균된 Markdown 렌더링.
 *
 * 기준: 기술 백서 §7.1-2, File_Structure.md §3.3, INV-07.
 *
 * **프로젝트 전체에서 `dangerouslySetInnerHTML`을 쓰는 유일한 컴포넌트다.**
 * `scripts/verify-architecture.mjs`가 이 경계를 강제하므로, 다른 곳에서 같은
 * prop을 쓰면 게이트가 막는다.
 *
 * 원문을 그대로 받아 이 안에서 살균한다. 호출부가 "이미 살균한 HTML"을 넘기는
 * 경로를 두지 않는다. 그 약속은 코드 리뷰로만 지켜지고, 한 번 어긋나면 INV-07이
 * 통째로 무너진다.
 */

import { useEffect, useMemo } from 'react';

import { markdownToSafeHtmlWithReport } from '../../../features/sanitize/markdown-to-html.ts';
import styles from './MarkdownText.module.css';

export interface MarkdownTextProps {
  /** **원문** Markdown. 살균은 이 컴포넌트가 한다. */
  markdown: string;
  /** 원격 이미지를 막았을 때 알린다. 편집기가 안내 문구를 띄운다. (INV-15) */
  onBlockedRemoteImages?: (count: number) => void;
  className?: string;
}

export function MarkdownText({ markdown, onBlockedRemoteImages, className }: MarkdownTextProps) {
  /*
    변환은 실패할 수 있다. 깊게 중첩된 인용이나 목록(`'> '.repeat(3000)` 같은
    2KB 한 줄)에서 remark가 재귀 한계에 부딪혀 `RangeError`를 던진다. 렌더 중에
    나는 예외라 잡지 않으면 화면 전체가 언마운트된다.

    붙여넣은 자료는 신뢰할 수 없는 입력이라는 규칙이 여기에도 그대로 적용된다.
    실패를 결과의 한 종류로 다루고, 원문 보기는 계속 쓸 수 있게 둔다.
  */
  const report = useMemo(() => {
    try {
      return markdownToSafeHtmlWithReport(markdown);
    } catch (error) {
      // 재귀 한계만 자료 탓이다. 나머지(살균기가 돌 수 없는 환경, 파이프라인
      // 고장)까지 여기서 삼키면 모든 사용자에게 "자료가 너무 깊습니다"로 보이고
      // 회귀를 알아챌 신호가 사라진다. 그런 실패는 오류 경계로 올린다.
      if (error instanceof RangeError) return null;
      throw error;
    }
  }, [markdown]);

  const blocked = report?.blockedRemoteImages ?? 0;

  useEffect(() => {
    if (blocked > 0) onBlockedRemoteImages?.(blocked);
  }, [blocked, onBlockedRemoteImages]);

  if (report === null) {
    return (
      <p
        className={[styles.failed, className].filter(Boolean).join(' ')}
        role="status"
        data-testid="markdown-failed"
      >
        이 자료는 미리보기로 바꾸지 못했습니다. 인용이나 목록이 너무 깊게 겹쳐 있을 때 생깁니다.
        원문 보기로는 그대로 읽을 수 있고, 프롬프트도 원문으로 만듭니다.
      </p>
    );
  }

  if (report.html === '') return null;

  return (
    <div
      className={[styles.markdown, className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: report.html }}
    />
  );
}
