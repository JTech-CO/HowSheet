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
  const report = useMemo(() => markdownToSafeHtmlWithReport(markdown), [markdown]);

  useEffect(() => {
    if (report.blockedRemoteImages > 0) onBlockedRemoteImages?.(report.blockedRemoteImages);
  }, [report.blockedRemoteImages, onBlockedRemoteImages]);

  if (report.html === '') return null;

  return (
    <div
      className={[styles.markdown, className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: report.html }}
    />
  );
}
