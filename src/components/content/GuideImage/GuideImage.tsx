/**
 * 이미지 블록 표시.
 *
 * 기준: FR-006, 디자인 백서 §5.9(이미지 없음), 하네스 M5 DoD 6.
 *
 * URL 수명은 이 컴포넌트가 아니라 `features/assets/useAssetUrl.ts`가 갖는다.
 * 리더 런타임과 공유하는 표시 컴포넌트에 브라우저 자원 관리를 넣지 않는다.
 *
 * `alt`가 비어 있으면 **장식 이미지 선언**으로 해석해 보조 기술에서 숨긴다.
 * 그것이 실수인지 의도인지는 내보내기 검증이 판정한다. 화면에서 임의로
 * 대체 텍스트를 지어내지 않는다.
 */

import styles from './GuideImage.module.css';

export interface GuideImageProps {
  /** 표시할 주소. 없으면 자산이 사라진 상태로 본다. */
  src: string | null;
  alt: string;
  caption?: string;
  /** 작성기에서만 보여 줄 재연결 동작. 리더에서는 넘기지 않는다. */
  onReconnect?: () => void;
}

export function GuideImage({ src, alt, caption, onReconnect }: GuideImageProps) {
  const decorative = alt.trim() === '';

  return (
    <figure className={styles.figure} data-testid="guide-image">
      {src === null ? (
        <div className={styles.placeholder} data-testid="image-missing">
          <p className={styles.placeholderTitle}>이미지를 불러오지 못했습니다</p>
          {decorative ? null : <p className={styles.placeholderAlt}>{alt}</p>}
          {onReconnect === undefined ? null : (
            <button
              type="button"
              className={[styles.reconnect, 'focus-ring'].join(' ')}
              onClick={onReconnect}
            >
              자산 다시 연결
            </button>
          )}
        </div>
      ) : (
        <img
          className={styles.image}
          src={src}
          alt={alt}
          {...(decorative ? { role: 'presentation' } : {})}
          loading="lazy"
        />
      )}

      {caption === undefined || caption === '' ? null : (
        <figcaption className={styles.caption}>{caption}</figcaption>
      )}
    </figure>
  );
}
