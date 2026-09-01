/**
 * 링크 블록.
 *
 * 기준: FR-006, 기술 백서 §7.1-3·4, 하네스 M5 DoD 4.
 *
 * 프로토콜 판정은 `domain`의 `isAllowedUrl` 하나만 쓴다. 렌더러가 자기 규칙을
 * 따로 두면 스키마 검증과 화면이 어긋난다. (File_Structure.md §3.3)
 *
 * 허용하지 않는 주소는 링크로 만들지 않고 **왜 막혔는지 보여 준다.** 조용히
 * 텍스트로 떨어뜨리면 작성자가 자기 실수를 모른 채 내보낸다.
 */

import { isAllowedUrl } from '../../../domain/guide.types.ts';
import styles from './LinkCard.module.css';

export interface LinkCardProps {
  label: string;
  url: string;
  description?: string;
}

export function LinkCard({ label, url, description }: LinkCardProps) {
  const safe = isAllowedUrl(url);
  const text = label.trim() === '' ? url : label;

  return (
    <div className={styles.card} data-safe={safe ? 'true' : 'false'} data-testid="link-card">
      {safe ? (
        <a
          className={[styles.link, 'focus-ring'].join(' ')}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {text}
          <span className="sr-only"> (새 탭에서 열림)</span>
        </a>
      ) : (
        <p className={styles.blocked} data-testid="link-blocked">
          <strong>{text}</strong>
          <span className={styles.blockedReason}>
            http 또는 https 주소가 아니라 링크로 만들지 않았습니다.
          </span>
        </p>
      )}

      {description === undefined || description === '' ? null : (
        <p className={styles.description}>{description}</p>
      )}
      {safe ? <p className={styles.url}>{url}</p> : null}
    </div>
  );
}
