/**
 * 스크린 리더 알림 영역.
 *
 * 재정렬처럼 시각적으로만 드러나는 변화를 말로 전한다. (디자인 §2.2.1)
 *
 * 같은 문장을 다시 알려야 할 때가 있다. 내용이 같으면 보조 기술이 변화를
 * 감지하지 못하므로 `messageKey`를 `key`로 써서 노드를 새로 만든다. effect로
 * 비웠다 채우면 렌더가 두 번 돌고, 그 사이의 빈 문자열이 읽힐 수 있다.
 */

export interface LiveRegionProps {
  message: string;
  messageKey: number;
  /** 저장 실패처럼 즉시 알려야 하는 것만 assertive로 둔다. */
  politeness?: 'polite' | 'assertive';
}

export function LiveRegion({ message, messageKey, politeness = 'polite' }: LiveRegionProps) {
  return (
    <div className="sr-only" role="status" aria-live={politeness} aria-atomic="true">
      <span key={messageKey}>{message}</span>
    </div>
  );
}
