/**
 * 이미지 블록 표시.
 *
 * 기준: FR-006, 디자인 백서 §5.9(이미지 없음), 하네스 M5 DoD 6.
 *
 * URL 수명은 이 컴포넌트가 아니라 `features/assets/useAssetUrl.ts`가 갖는다.
 * 리더 런타임과 공유하는 표시 컴포넌트에 브라우저 자원 관리를 넣지 않는다.
 *
 * 장식 이미지 판정은 `decorative` **선언**만 본다. 빈 `alt`를 선언으로 읽지
 * 않는다 - 새 블록의 기본값이 빈 문자열이라, 그렇게 읽으면 설명을 잊은
 * 이미지가 경고 없이 보조 기술에서 사라진다. 빈 alt는 스키마가 오류로
 * 판정한다. 화면에서 임의로 대체 텍스트를 지어내지도 않는다.
 */

import styles from './GuideImage.module.css';

export interface GuideImageProps {
  /** 표시할 주소. 없으면 자산이 사라진 상태로 본다. */
  src: string | null;
  alt: string;
  caption?: string;
  /** 장식용 선언. 지정하지 않으면 내용을 전달하는 이미지로 본다. */
  decorative?: boolean;
  /** 작성기에서만 보여 줄 재연결 동작. 리더에서는 넘기지 않는다. */
  onReconnect?: () => void;
}

export function GuideImage({
  src,
  alt,
  caption,
  decorative = false,
  onReconnect,
}: GuideImageProps) {
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
          // 장식용으로 선언했으면 alt에 무엇이 적혀 있든 빈 문자열로 낸다.
          // 선언과 값이 어긋날 때 선언을 따라야 보조 기술이 두 번 읽지 않는다.
          alt={decorative ? '' : alt}
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
