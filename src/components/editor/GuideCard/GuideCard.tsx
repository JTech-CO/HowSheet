/**
 * 대시보드 가이드 카드.
 *
 * 기준: 디자인 백서 §2.4.1(가이드 카드 정보), FR-001.
 *
 * 검증 상태와 내보내기는 각각 M6·M9에서 붙는다. 지금 없는 것을 비활성 버튼으로
 * 미리 보여 주지 않는다. 쓸 수 없는 버튼은 정보가 아니라 소음이다.
 */

import { Link } from 'react-router-dom';

import type { GuideSummary } from '../../../storage/guide.repository.ts';
import { Button } from '../../ui/Button/Button.tsx';
import styles from './GuideCard.module.css';

export interface GuideCardProps {
  guide: GuideSummary;
  onDuplicate: () => void;
  onRename: () => void;
  onRemove: () => void;
}

/** 로케일 의존을 피하려고 직접 만든다. 테스트가 실행 환경에 흔들리지 않는다. */
export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function GuideCard({ guide, onDuplicate, onRename, onRemove }: GuideCardProps) {
  const title = guide.title.trim() === '' ? '제목 없는 가이드' : guide.title;

  return (
    <li className={styles.card} data-testid="guide-card">
      <h3 className={styles.title}>
        <Link className={[styles.titleLink, 'focus-ring'].join(' ')} to={`/guide/${guide.id}/edit`}>
          {title}
        </Link>
      </h3>

      {guide.audience === undefined ? null : <p className={styles.audience}>{guide.audience}</p>}

      <dl className={styles.meta}>
        <div>
          <dt>단계</dt>
          <dd>{guide.stepCount}개</dd>
        </div>
        <div>
          <dt>마지막 수정</dt>
          <dd>
            <time dateTime={guide.updatedAt}>{formatUpdatedAt(guide.updatedAt)}</time>
          </dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onRename} data-testid="guide-rename">
          이름 변경
        </Button>
        <Button variant="ghost" size="sm" onClick={onDuplicate} data-testid="guide-duplicate">
          복제
        </Button>
        <Button variant="ghost" size="sm" onClick={onRemove} data-testid="guide-remove">
          삭제
        </Button>
      </div>
    </li>
  );
}
