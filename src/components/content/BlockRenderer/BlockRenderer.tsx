/**
 * 콘텐츠 블록 렌더러.
 *
 * 기준: FR-006, File_Structure.md §2.1(판별 유니온 exhaustive 분기),
 * 하네스 M5 DoD 1.
 *
 * 작성기 미리보기와 리더가 같은 컴포넌트를 쓴다. 별도 미리보기 렌더러를 만들지
 * 않는다. (File_Structure.md §4)
 *
 * 미지원 타입을 **조용히 무시하지 않는다.** 두 겹으로 막는다.
 *
 *   1. `never` 소진 검사 - 새 블록 타입이 생기면 `typecheck`가 깨진다.
 *   2. 런타임 안내 - 스키마가 앞서간 문서를 열었을 때 빈 화면 대신 무엇을
 *      못 그렸는지 보여 준다. 컴파일 검사는 배포된 리더가 미래 문서를 여는
 *      경우를 잡지 못한다.
 */

import type { ContentBlock } from '../../../domain/guide.types.ts';
import { ChecklistBlock } from '../ChecklistBlock/ChecklistBlock.tsx';
import { CodeBlock } from '../CodeBlock/CodeBlock.tsx';
import { DecisionOptions } from '../DecisionOptions/DecisionOptions.tsx';
import { GuideImage } from '../GuideImage/GuideImage.tsx';
import { LinkCard } from '../LinkCard/LinkCard.tsx';
import { MarkdownText } from '../MarkdownText/MarkdownText.tsx';
import styles from './BlockRenderer.module.css';

export interface BlockInteractions {
  /** 체크된 체크리스트 항목 ID. */
  checkedItemIds?: readonly string[];
  onToggleChecklistItem?: (blockId: string, itemId: string, checked: boolean) => void;
  /** 선택된 분기 옵션 ID(블록별). */
  selectedOptionId?: string | null;
  onSelectOption?: (blockId: string, optionId: string) => void;
}

export interface BlockRendererProps extends BlockInteractions {
  block: ContentBlock;
  /** `assetId`를 표시 가능한 주소로 바꾼다. 없으면 이미지가 없는 것으로 본다. */
  resolveAssetUrl?: (assetId: string) => string | null;
  /** 작성기에서만 넘긴다. 자산이 사라졌을 때의 재연결 동작. */
  onReconnectAsset?: (assetId: string) => void;
  onBlockedRemoteImages?: (count: number) => void;
}

export function BlockRenderer(props: BlockRendererProps) {
  const { block } = props;

  switch (block.type) {
    case 'text':
      return (
        <MarkdownText
          markdown={block.markdown}
          {...(props.onBlockedRemoteImages === undefined
            ? {}
            : { onBlockedRemoteImages: props.onBlockedRemoteImages })}
        />
      );

    case 'code':
      return (
        <CodeBlock
          code={block.code}
          {...(block.language === undefined ? {} : { language: block.language })}
          {...(block.copyLabel === undefined ? {} : { copyLabel: block.copyLabel })}
        />
      );

    case 'link':
      return (
        <LinkCard
          label={block.label}
          url={block.url}
          {...(block.description === undefined ? {} : { description: block.description })}
        />
      );

    case 'image':
      return (
        <GuideImage
          src={props.resolveAssetUrl?.(block.assetId) ?? null}
          alt={block.alt}
          {...(block.decorative === undefined ? {} : { decorative: block.decorative })}
          {...(block.caption === undefined ? {} : { caption: block.caption })}
          {...(props.onReconnectAsset === undefined
            ? {}
            : { onReconnect: () => props.onReconnectAsset?.(block.assetId) })}
        />
      );

    case 'checklist':
      return (
        <ChecklistBlock
          items={block.items}
          {...(props.checkedItemIds === undefined ? {} : { checkedIds: props.checkedItemIds })}
          {...(props.onToggleChecklistItem === undefined
            ? {}
            : {
                onToggle: (itemId: string, checked: boolean) =>
                  props.onToggleChecklistItem?.(block.id, itemId, checked),
              })}
        />
      );

    case 'decision':
      return (
        <DecisionOptions
          question={block.question}
          options={block.options}
          required={block.required}
          {...(props.selectedOptionId === undefined ? {} : { selectedId: props.selectedOptionId })}
          {...(props.onSelectOption === undefined
            ? {}
            : { onSelect: (optionId: string) => props.onSelectOption?.(block.id, optionId) })}
        />
      );

    case 'divider':
      return <hr className={styles.divider} />;

    default:
      return <UnsupportedBlock block={block} />;
  }
}

/**
 * 여기 도달했다는 것은 타입에 없는 블록이 문서에 들어 있다는 뜻이다.
 * `never` 할당이 컴파일 타임에, 아래 렌더링이 런타임에 그것을 드러낸다.
 */
function UnsupportedBlock({ block }: { block: never }) {
  const unknown = block as { type?: unknown; id?: unknown };
  const type = typeof unknown.type === 'string' ? unknown.type : '알 수 없음';

  return (
    <div className={styles.unsupported} role="alert" data-testid="unsupported-block">
      <strong>지원하지 않는 콘텐츠 블록입니다: {type}</strong>
      <span className={styles.unsupportedHint}>
        더 새로운 버전에서 만든 가이드일 수 있습니다. 최신 버전으로 열어 보세요.
      </span>
    </div>
  );
}
