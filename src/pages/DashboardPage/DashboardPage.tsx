/**
 * 로컬 대시보드.
 *
 * 기준: FR-001, 디자인 백서 §2.4.1, 기술 백서 §2.1.4.
 *
 * JSON·Markdown 가져오기와 샘플 템플릿은 각각 M8·M10·M12에서 붙는다. 지금
 * 없는 기능을 비활성 버튼으로 미리 늘어놓지 않는다.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppHeader } from '../../components/layout/AppHeader/AppHeader.tsx';
import { GuideCard } from '../../components/editor/GuideCard/GuideCard.tsx';
import { StorageUnavailableBanner } from '../../components/editor/StorageUnavailableBanner/StorageUnavailableBanner.tsx';
import { Button } from '../../components/ui/Button/Button.tsx';
import { Dialog } from '../../components/ui/Dialog/Dialog.tsx';
import { EmptyState } from '../../components/ui/EmptyState/EmptyState.tsx';
import { Field } from '../../components/ui/Field/Field.tsx';
import { Input } from '../../components/ui/Input/Input.tsx';
import { useGuideStore } from '../../store/guide.store.ts';
import styles from './DashboardPage.module.css';

interface RenameTarget {
  id: string;
  title: string;
}

export function DashboardPage() {
  const navigate = useNavigate();

  const library = useGuideStore((state) => state.library);
  const libraryStatus = useGuideStore((state) => state.libraryStatus);
  const storageMode = useGuideStore((state) => state.storageMode);
  const storageUnavailableReason = useGuideStore((state) => state.storageUnavailableReason);
  const initStorage = useGuideStore((state) => state.initStorage);
  const refreshLibrary = useGuideStore((state) => state.refreshLibrary);
  const createGuide = useGuideStore((state) => state.createGuide);
  const duplicateGuide = useGuideStore((state) => state.duplicateGuide);
  const renameGuide = useGuideStore((state) => state.renameGuide);
  const removeGuide = useGuideStore((state) => state.removeGuide);

  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const cancelRemoveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void (async () => {
      await initStorage();
      await refreshLibrary();
    })();
  }, [initStorage, refreshLibrary]);

  const removeTarget = library.find((guide) => guide.id === removeTargetId) ?? null;

  const onCreate = async () => {
    setCreating(true);
    try {
      const id = await createGuide();
      navigate(`/guide/${id}/edit`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <AppHeader />

      <div className={styles.page}>
        <StorageUnavailableBanner
          mode={storageMode}
          {...(storageUnavailableReason === undefined ? {} : { reason: storageUnavailableReason })}
        />

        <div className={styles.intro}>
          <div>
            <h1 className={styles.heading}>내 가이드</h1>
            <p className={styles.lede}>
              모든 가이드는 이 브라우저에만 저장됩니다. 서버로 보내지 않습니다.
            </p>
          </div>
          <Button variant="primary" onClick={onCreate} busy={creating} data-testid="create-guide">
            새 가이드 만들기
          </Button>
        </div>

        {libraryStatus === 'loading' ? (
          <p className={styles.loading}>불러오는 중…</p>
        ) : library.length === 0 ? (
          <EmptyState
            title="아직 만든 가이드가 없습니다"
            description="문제 하나를 골라 단계로 쪼개 보세요. 첫 단계는 이미 만들어 둡니다."
            examples={[
              '공유기 인터넷 연결 복구',
              '신입 사원 첫날 계정 설정',
              '프린터 용지 걸림 해결',
            ]}
            action={
              <Button variant="primary" onClick={onCreate} busy={creating}>
                새 가이드 만들기
              </Button>
            }
          />
        ) : (
          <ul className={styles.grid} role="list">
            {library.map((guide) => (
              <GuideCard
                key={guide.id}
                guide={guide}
                onRename={() => setRenameTarget({ id: guide.id, title: guide.title })}
                onDuplicate={() => void duplicateGuide(guide.id)}
                onRemove={() => setRemoveTargetId(guide.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={renameTarget !== null}
        title="가이드 이름 변경"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button onClick={() => setRenameTarget(null)}>취소</Button>
            <Button
              variant="primary"
              data-testid="rename-confirm"
              onClick={() => {
                if (renameTarget === null) return;
                void renameGuide(renameTarget.id, renameTarget.title);
                setRenameTarget(null);
              }}
            >
              이름 바꾸기
            </Button>
          </>
        }
      >
        <Field label="가이드 제목" required>
          {(control) => (
            <Input
              {...control}
              value={renameTarget?.title ?? ''}
              data-testid="rename-input"
              onChange={(event) =>
                setRenameTarget((current) =>
                  current === null ? null : { ...current, title: event.target.value },
                )
              }
            />
          )}
        </Field>
      </Dialog>

      {/* 디자인 §2.2.1 — 주요 버튼은 위험 색상, 초기 포커스는 취소 버튼에 둔다. */}
      <Dialog
        open={removeTarget !== null}
        title="가이드를 삭제할까요?"
        description={
          removeTarget === null
            ? undefined
            : `"${removeTarget.title || '제목 없는 가이드'}"와 그 이미지가 함께 지워집니다. 되돌릴 수 없습니다.`
        }
        onClose={() => setRemoveTargetId(null)}
        initialFocusRef={cancelRemoveRef}
        footer={
          <>
            <Button ref={cancelRemoveRef} onClick={() => setRemoveTargetId(null)}>
              취소
            </Button>
            <Button
              variant="danger"
              data-testid="remove-confirm"
              onClick={() => {
                if (removeTargetId !== null) void removeGuide(removeTargetId);
                setRemoveTargetId(null);
              }}
            >
              삭제
            </Button>
          </>
        }
      />
    </>
  );
}
