/**
 * 프레임워크 비의존 콘텐츠 렌더러.
 *
 * 기준: 기술 백서 §5.2(콘텐츠 렌더러 공유), §7.1(살균 경계).
 * File_Structure.md §3.3·§7 D-12. 하네스 M7 할 일 2, DoD 10, INV-07·INV-09·INV-11.
 *
 * **D-12: `features/sanitize/sanitize-html.ts`만 쓴다.** `markdown-to-html.ts`를
 * import하면 unified·remark 4종이 리더 번들 폐포에 따라 들어온다(실측 6건 대
 * 1건). Markdown → HTML 변환은 내보내기(M9)가 미리 끝내 문서 **본문에** 싣고,
 * 리더는 렌더 직전에 한 번 더 살균한다. 그 두 번째 살균이 의미를 가지려면
 * 살균이 멱등이어야 하고, 그 단언은 `tests/unit/security/sanitize.test.ts`가
 * 게이트로 잡고 있다.
 *
 * React를 쓰지 않는다. `components/content/`의 8종과 **같은 의미**를 내야 하고
 * (INV-09), 그 정합성은 M9의 parity 테스트가 판정한다.
 */

import type {
  ChecklistBlock,
  CodeBlock,
  ContentBlock,
  DecisionBlock,
  GuideStep,
  ImageBlock,
  LinkBlock,
} from '../domain/guide.types.ts';
import { isAllowedUrl } from '../domain/guide.types.ts';
import { sanitizeHtml } from '../features/sanitize/sanitize-html.ts';

/** M9 내보내기가 미리 렌더해 실은 HTML. 데이터 스크립트에는 원문 Markdown이 남는다. */
export type PreRenderedHtml = string;

export interface RenderContext {
  /** `assetId` → 표시 가능한 주소. 없으면 자산이 사라진 상태다. */
  resolveAssetUrl(assetId: string): string | null;
  /** `blockId` → 미리 렌더된 본문 HTML. 없으면 그 블록은 본문 없이 그려진다. */
  readonly richTextByBlock: Readonly<Record<string, PreRenderedHtml>>;
  /** 독자가 이 단계에서 체크한 항목. */
  readonly checkedItemIds?: readonly string[];
  /** 결정 블록 ID → 고른 선택지 ID. */
  readonly selectedOptionByBlock?: Readonly<Record<string, string>>;
}

/**
 * 텍스트를 HTML에 넣기 전에 이스케이프한다.
 *
 * 살균기는 **태그 구조**를 다루고 이 함수는 **텍스트 자리**를 다룬다. 둘은
 * 다른 일이다. 사용자 문자열을 이스케이프 없이 템플릿에 끼우면 살균기를
 * 거치지 않는 경로가 생긴다. (INV-07)
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 미리 렌더된 본문을 한 번 더 살균한다. 살균은 멱등이므로 결과가 변하지 않는다. */
export function renderRichText(html: PreRenderedHtml): string {
  return sanitizeHtml(html);
}

function renderCode(block: CodeBlock): string {
  const language = block.language === undefined ? '명령어' : block.language;
  return [
    '<figure class="hs-code" data-block="code">',
    `<figcaption>${escapeHtml(language)}</figcaption>`,
    // 코드는 텍스트다. 이스케이프하면 태그로 해석되지 않는다. (M5 DoD 3)
    `<pre tabindex="0"><code>${escapeHtml(block.code)}</code></pre>`,
    '</figure>',
  ].join('');
}

function renderLink(block: LinkBlock): string {
  if (!isAllowedUrl(block.url)) {
    // http·https가 아니면 링크로 만들지 않는다. 주소는 텍스트로 보여 준다.
    return [
      '<p class="hs-link-blocked" data-block="link">',
      `${escapeHtml(block.label)} - http 또는 https 주소만 열 수 있습니다: `,
      `<span>${escapeHtml(block.url)}</span>`,
      '</p>',
    ].join('');
  }

  const description =
    block.description === undefined
      ? ''
      : `<span class="hs-link-desc">${escapeHtml(block.description)}</span>`;

  return [
    '<p class="hs-link" data-block="link">',
    `<a href="${escapeHtml(block.url)}" target="_blank" rel="noopener noreferrer">`,
    escapeHtml(block.label),
    '</a>',
    description,
    '</p>',
  ].join('');
}

function renderImage(block: ImageBlock, ctx: RenderContext): string {
  const src = ctx.resolveAssetUrl(block.assetId);
  const caption =
    block.caption === undefined || block.caption === ''
      ? ''
      : `<figcaption>${escapeHtml(block.caption)}</figcaption>`;

  if (src === null) {
    const alt = block.decorative === true ? '' : escapeHtml(block.alt);
    return [
      '<figure class="hs-image" data-block="image">',
      `<div class="hs-image-missing">이미지를 불러오지 못했습니다${alt === '' ? '' : `: ${alt}`}</div>`,
      caption,
      '</figure>',
    ].join('');
  }

  // 장식용 선언이 alt 값을 이긴다. 선언과 값이 어긋나면 보조 기술이 두 번 읽는다.
  const decorative = block.decorative === true;
  const attributes = [
    `src="${escapeHtml(src)}"`,
    `alt="${decorative ? '' : escapeHtml(block.alt)}"`,
    decorative ? 'role="presentation"' : '',
    'loading="lazy"',
  ].filter(Boolean);

  return `<figure class="hs-image" data-block="image"><img ${attributes.join(' ')}>${caption}</figure>`;
}

function renderChecklist(block: ChecklistBlock, ctx: RenderContext): string {
  const checked = new Set(ctx.checkedItemIds ?? []);
  const items = block.items
    .map((item) => {
      const id = `${block.id}--${item.id}`;
      return [
        '<li>',
        `<input type="checkbox" id="${escapeHtml(id)}" data-item="${escapeHtml(item.id)}"`,
        checked.has(item.id) ? ' checked' : '',
        '>',
        `<label for="${escapeHtml(id)}">${escapeHtml(item.label)}`,
        item.required ? '' : ' <span class="hs-optional">(선택)</span>',
        '</label>',
        '</li>',
      ].join('');
    })
    .join('');

  return `<ul class="hs-checklist" data-block="checklist" data-block-id="${escapeHtml(block.id)}">${items}</ul>`;
}

function renderDecision(block: DecisionBlock, ctx: RenderContext): string {
  const selected = ctx.selectedOptionByBlock?.[block.id];
  const options = block.options
    .map((option) => {
      const id = `${block.id}--${option.id}`;
      const description =
        option.description === undefined
          ? ''
          : `<span class="hs-option-desc">${escapeHtml(option.description)}</span>`;
      return [
        '<li>',
        `<input type="radio" id="${escapeHtml(id)}" name="${escapeHtml(block.id)}"`,
        ` data-option="${escapeHtml(option.id)}"`,
        selected === option.id ? ' checked' : '',
        '>',
        `<label for="${escapeHtml(id)}">${escapeHtml(option.label)}${description}</label>`,
        '</li>',
      ].join('');
    })
    .join('');

  return [
    `<fieldset class="hs-decision" data-block="decision" data-block-id="${escapeHtml(block.id)}">`,
    `<legend>${escapeHtml(block.question)}</legend>`,
    `<ul>${options}</ul>`,
    // 선택과 이동을 분리한다. 고른다고 바로 넘어가지 않는다. (디자인 §2.2.2)
    '<p class="hs-decision-note">선택을 변경하면 이후 진행 경로가 바뀝니다.</p>',
    '</fieldset>',
  ].join('');
}

/** 블록 하나를 HTML 문자열로. 미지원 타입은 조용히 사라지지 않는다. (M5 DoD 1) */
export function renderBlock(block: ContentBlock, ctx: RenderContext): string {
  switch (block.type) {
    case 'text':
      return `<div class="hs-text" data-block="text">${renderRichText(ctx.richTextByBlock[block.id] ?? '')}</div>`;
    case 'code':
      return renderCode(block);
    case 'link':
      return renderLink(block);
    case 'image':
      return renderImage(block, ctx);
    case 'checklist':
      return renderChecklist(block, ctx);
    case 'decision':
      return renderDecision(block, ctx);
    case 'divider':
      return '<hr class="hs-divider" data-block="divider">';
    default:
      return unsupportedBlock(block);
  }
}

/** 소진 검사. 새 블록 타입이 생기면 여기서 컴파일이 깨진다. */
function unsupportedBlock(block: never): string {
  const unknown = block as { type?: unknown };
  return `<p class="hs-unsupported" role="alert">지원하지 않는 블록입니다: ${escapeHtml(String(unknown.type))}</p>`;
}

/** 단계 본문. 제목과 진행 컨트롤은 셸이 그린다. */
export function renderStep(step: GuideStep, ctx: RenderContext): string {
  const blocks = [...step.blocks]
    .sort((a, b) => a.order - b.order)
    .map((block) => renderBlock(block, ctx))
    .join('');

  const summary =
    step.summary === undefined || step.summary === ''
      ? ''
      : `<p class="hs-step-summary">${escapeHtml(step.summary)}</p>`;

  return `${summary}<div class="hs-blocks">${blocks}</div>`;
}
