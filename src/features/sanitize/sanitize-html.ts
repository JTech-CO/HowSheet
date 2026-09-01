/**
 * HTML 살균.
 *
 * 기준: 기술 백서 §4.4.3(콘텐츠 안전화), §7.1(보안), INV-07·INV-15.
 *
 * 프레임워크에 의존하지 않는 순수 함수다. React 화면은 `MarkdownText`를 통해,
 * 내보낸 HTML은 리더 런타임이 직접 이 함수를 부른다. 살균기를 두 벌 만들면
 * "경계 한 곳" 규칙과 INV-07이 동시에 깨진다. (File_Structure.md §3.3)
 *
 * 정책은 **허용 목록**이다. 금지 목록만 두면 새 태그·속성이 나올 때마다 구멍이
 * 생긴다. 금지 목록은 그 위에 얹는 이중 확인일 뿐이다.
 */

import createDOMPurify from 'dompurify';

import { isAllowedUrl } from '../../domain/guide.types.ts';

/** Markdown이 만들어 낼 수 있는 태그만 허용한다. GFM 표와 작업 목록 포함. */
export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'input',
  'sup',
  'sub',
  'span',
] as const;

/** 허용 속성. `style`과 `on*`은 어떤 경우에도 들어오지 않는다. */
export const ALLOWED_ATTR = [
  'href',
  'title',
  'alt',
  'src',
  'width',
  'height',
  'colspan',
  'rowspan',
  'start',
  'align',
  'lang',
  'dir',
  'type',
  'checked',
  'disabled',
  'id',
] as const;

/** 허용 목록을 뚫는 시도를 한 번 더 막는다. (기술 §4.4.3-7) */
export const FORBID_TAGS = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'template',
  'link',
  'meta',
  'base',
  'noscript',
  'canvas',
  'audio',
  'video',
  'source',
  'track',
  'portal',
] as const;

/**
 * URI가 아닌 허용 속성.
 *
 * DOMPurify는 자기 `URI_SAFE_ATTRIBUTES` 목록에 없는 속성 값을 전부
 * `ALLOWED_URI_REGEXP`에 통과시킨다. 우리 정규식은 http/blob/data:image만
 * 허용하므로, 명시하지 않으면 `type="checkbox"`·`colspan="2"` 같은 평범한 값이
 * 조용히 사라진다. GFM 작업 목록 체크박스가 통째로 없어지는 것을 보고 알았다.
 */
export const URI_SAFE_ATTR = [
  'type',
  'checked',
  'disabled',
  'width',
  'height',
  'colspan',
  'rowspan',
  'start',
  'align',
  'dir',
  'lang',
] as const;

export const FORBID_ATTR = [
  'style',
  'srcdoc',
  'srcset',
  'formaction',
  'action',
  'ping',
  'background',
  'dynsrc',
  'lowsrc',
  'xlink:href',
] as const;

/**
 * 링크 URI 허용 패턴.
 *
 * 상대 경로도 막는다. 내보낸 단일 HTML은 어디서 열릴지 모르므로 상대 링크는
 * 의미가 없고, `//evil.example` 같은 프로토콜 상대 URL이 절대 링크로 살아난다.
 */
const SAFE_LINK_URI = /^https?:\/\//i;

/**
 * 이미지 `src` 허용 패턴.
 *
 * `blob:`는 편집 중 로컬 미리보기, `data:image/...`는 내보낸 HTML의 내장
 * 이미지다. **원격 http(s) 이미지는 허용하지 않는다.** 자동으로 네트워크에
 * 나가면 INV-15가 깨지고, 독자의 접속 사실이 제3자에게 새어 나간다.
 * SVG는 스크립트를 품을 수 있어 제외한다. (기술 §7.1-8)
 */
const SAFE_IMAGE_SRC = /^(?:blob:|data:image\/(?:png|jpeg|gif|webp);base64,)/i;

/**
 * DOMPurify가 1차로 통과시킬 URI. 이보다 좁히는 판정은 아래 훅이 태그별로 한다.
 * 기본값은 `blob:`과 `data:image/...`를 버리기 때문에 명시해야 한다.
 * SVG data URL은 여기서부터 들어오지 못한다. (기술 §7.1-8)
 */
const ALLOWED_URI_REGEXP = /^(?:https?:|blob:|data:image\/(?:png|jpeg|gif|webp);base64,)/i;

/**
 * 살균 결과와 함께 무엇을 막았는지 알려 준다.
 *
 * 원격 이미지만 센다. 사용자가 원인을 알아야 고칠 수 있는 유일한 항목이라서다
 * (INV-15로 막았고, 이미지를 내려받아 첨부하면 해결된다). 링크 차단은 세지
 * 않는다. DOMPurify가 먼저 지우는 경우와 우리 훅이 지우는 경우가 섞여 숫자가
 * 실제 차단 건수와 어긋난다. 잘못된 숫자를 보여 주느니 보여 주지 않는다.
 */
export interface SanitizeReport {
  html: string;
  /** 원격 주소라서 `src`를 제거한 이미지 수. */
  blockedRemoteImages: number;
}

interface PurifierState {
  blockedRemoteImages: number;
}

const state: PurifierState = { blockedRemoteImages: 0 };

type Purifier = ReturnType<typeof createDOMPurify>;

let instance: Purifier | null = null;

/**
 * 살균기를 처음 쓸 때 만든다.
 *
 * 모듈을 import하는 것만으로 `window`를 건드리지 않는다. Node에서 이 모듈을
 * import하는 검증 스크립트가 있고, 거기서 터지면 안 된다.
 */
function purifier(): Purifier {
  if (instance !== null) return instance;

  const view = (globalThis as { window?: unknown }).window;
  if (view === undefined) {
    throw new Error('sanitizeHtml에는 DOM이 필요합니다. 브라우저나 jsdom에서 호출하세요.');
  }

  const created = createDOMPurify(view as Parameters<typeof createDOMPurify>[0]);

  // 속성 살균이 끝난 뒤 링크·이미지·체크박스를 우리 규칙으로 한 번 더 조인다.
  created.addHook('afterSanitizeAttributes', (node) => {
    const element = node as unknown as Element;
    const tag = element.tagName;
    if (typeof tag !== 'string') return;

    // `type`은 input에서만 의미가 있다. URI-safe로 표시한 탓에 다른 태그에서는
    // 임의 문자열이 그대로 통과하므로 여기서 떼어 낸다.
    if (tag !== 'INPUT') element.removeAttribute('type');

    if (tag === 'A') hardenAnchor(element);
    else if (tag === 'IMG') hardenImage(element);
    else if (tag === 'INPUT') hardenInput(element);
  });

  instance = created;
  return created;
}

/** 외부 링크는 새 탭 + `noopener noreferrer`. 허용 밖 프로토콜은 링크를 푼다. */
function hardenAnchor(element: Element): void {
  const href = element.getAttribute('href');

  if (href === null || !SAFE_LINK_URI.test(href) || !isAllowedUrl(href)) {
    element.removeAttribute('href');
    element.removeAttribute('target');
    element.removeAttribute('rel');
    return;
  }

  // 기술 §7.1-4 - 새 탭 링크에서 opener를 넘기지 않는다.
  element.setAttribute('target', '_blank');
  element.setAttribute('rel', 'noopener noreferrer');
}

/** 원격 이미지는 `src`를 지운다. `alt`는 남겨 대체 텍스트가 보이게 한다. */
function hardenImage(element: Element): void {
  const src = element.getAttribute('src');
  if (src === null || !SAFE_IMAGE_SRC.test(src)) {
    element.removeAttribute('src');
    if (src !== null) state.blockedRemoteImages += 1;
  }
  if (element.getAttribute('alt') === null) element.setAttribute('alt', '');
}

/** GFM 작업 목록의 체크박스만 남긴다. 그 밖의 input은 통째로 뺀다. */
function hardenInput(element: Element): void {
  if (element.getAttribute('type') !== 'checkbox') {
    element.remove();
    return;
  }
  element.setAttribute('disabled', '');
}

/** 살균한다. 무엇을 막았는지도 함께 돌려준다. */
export function sanitizeHtmlWithReport(html: string): SanitizeReport {
  state.blockedRemoteImages = 0;

  const clean = purifier().sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    FORBID_TAGS: [...FORBID_TAGS],
    FORBID_ATTR: [...FORBID_ATTR],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP,
    ADD_URI_SAFE_ATTR: [...URI_SAFE_ATTR],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    // DOM 클로버링 방지. `id`·`name`이 폼 프로퍼티를 가리는 것을 막는다.
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
  });

  return { html: clean, blockedRemoteImages: state.blockedRemoteImages };
}

/** 살균한 HTML만 필요할 때. */
export function sanitizeHtml(html: string): string {
  return sanitizeHtmlWithReport(html).html;
}

/** 테스트가 살균기를 새로 만들게 한다. */
export function resetSanitizer(): void {
  instance = null;
}
