/**
 * Markdown → 안전한 HTML.
 *
 * 기준: 기술 백서 §4.4.3(콘텐츠 안전화 1~3단계), §7.1-1, INV-07.
 *
 * 두 단계를 거친다.
 *
 *   1. remark로 AST를 만들고 **허용 노드만** HTML로 옮긴다. `remark-rehype`에
 *      `allowDangerousHtml`을 주지 않으므로 원문 안의 raw HTML 노드는 이 시점에
 *      통째로 사라진다. (기술 §7.1-1 - raw HTML 기본 비활성)
 *   2. `sanitize-html.ts`가 2차 살균한다.
 *
 * 1단계만으로 충분해 보여도 2단계를 뺄 수 없다. remark 플러그인이 바뀌거나
 * 새 노드 타입이 생기면 1단계의 가정이 조용히 무너진다. 실행 금지(INV-07)는
 * 한 겹으로 지킬 계약이 아니다.
 */

import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

import { sanitizeHtmlWithReport, type SanitizeReport } from './sanitize-html.ts';

/**
 * 고정된 파이프라인. `freeze()`로 이후 플러그인 추가를 막는다.
 * 호출부가 파이프라인을 바꿔 raw HTML을 켜는 경로를 없앤다.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  // allowDangerousHtml을 주지 않는다. 이 한 줄이 raw HTML 차단의 1단계다.
  .use(remarkRehype)
  .use(rehypeStringify)
  .freeze();

/**
 * 1단계까지만 수행한다. **화면에 직접 넣지 않는다.**
 * 테스트가 단계별로 확인할 수 있게 내보낼 뿐이다.
 */
export function markdownToRawHtml(markdown: string): string {
  return String(processor.processSync(markdown));
}

/** Markdown을 렌더링 가능한 안전한 HTML로 바꾼다. 화면은 이 함수만 쓴다. */
export function markdownToSafeHtml(markdown: string): string {
  return markdownToSafeHtmlWithReport(markdown).html;
}

/** 무엇을 막았는지까지 필요할 때. 편집기가 안내 문구를 띄운다. */
export function markdownToSafeHtmlWithReport(markdown: string): SanitizeReport {
  if (markdown.trim() === '') {
    return { html: '', blockedRemoteImages: 0 };
  }
  return sanitizeHtmlWithReport(markdownToRawHtml(markdown));
}
