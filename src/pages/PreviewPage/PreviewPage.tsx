/**
 * 리더 화면 (미리보기 경로).
 *
 * 기준: 기술 백서 §2.1.4(원본 변경 없음), §2.2.1-7, §2.2.2(독자 흐름),
 * 디자인 백서 §2.4.10~§2.4.12. 하네스 M7 할 일 1·3·5·6·7.
 *
 * `File_Structure.md` §3.5가 "`components/reader/*`는 앱 내 리더와
 * `/guide/:id/preview` 미리보기를 담당한다"고 확정했다. 별도 리더 라우트를
 * 만들지 않는다. 기술 §2.1.4 표에서 '리더' 모드의 경로 칸은 라우트가 아니라
 * "내보낸 HTML"이고, 그것은 M9가 만든다.
 *
 * 저장 완료를 기다리지 않는다. 편집 중인 메모리 문서가 있으면 그것을 그대로
 * 쓰고, 없으면 저장소에서 읽는다. 이 화면은 문서를 **바꾸지 않는다**.
 *
 * 진행 상태는 `reader.store`가 갖는다. `guide.store`에 넣으면 리더에서 체크만
 * 해도 편집기의 `dirty`가 서고 자동 저장이 헛돈다. (기술 §4.1.1)
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { GuideDocument } from '../../domain/guide.types.ts';
import { CompletionScreen } from '../../components/reader/CompletionScreen/CompletionScreen.tsx';
import { GuideIntro } from '../../components/reader/GuideIntro/GuideIntro.tsx';
import { ReaderErrorScreen } from '../../components/reader/ReaderErrorScreen/ReaderErrorScreen.tsx';
import { ReaderProgressHeader } from '../../components/reader/ReaderProgressHeader/ReaderProgressHeader.tsx';
import { ReaderStep } from '../../components/reader/ReaderStep/ReaderStep.tsx';
import { ResumePrompt } from '../../components/reader/ResumePrompt/ResumePrompt.tsx';
import { TroubleshootingAccordion } from '../../components/reader/TroubleshootingAccordion/TroubleshootingAccordion.tsx';
import { AppHeader } from '../../components/layout/AppHeader/AppHeader.tsx';
import { useAssetUrls } from '../../features/assets/useAssetUrl.ts';
import { canEnterSteps } from '../../reader-runtime/reader-state.ts';
import type { StoredAsset } from '../../storage/db.ts';
import { guideStoreDeps, useGuideStore } from '../../store/guide.store.ts';
import { acknowledgedBeforeStartIds, useReaderStore } from '../../store/reader.store.ts';
import styles from './PreviewPage.module.css';

export function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const openDocument = useGuideStore((state) => state.document);
  const initStorage = useGuideStore((state) => state.initStorage);

  const [loaded, setLoaded] = useState<GuideDocument | null>(null);
  const [assets, setAssets] = useState<StoredAsset[]>([]);
  const [notFound, setNotFound] = useState(false);

  const draft = openDocument?.id === id ? openDocument : loaded;
  const assetUrls = useAssetUrls(assets);

  const reader = useReaderStore();

  useEffect(() => {
    if (id === undefined) return;
    if (openDocument?.id === id) return;

    void (async () => {
      await initStorage();
      const found = await guideStoreDeps().guides.get(id);
      if (found === undefined) {
        setNotFound(true);
        return;
      }
      setLoaded(found);
      setAssets(await guideStoreDeps().assets.listByGuide(id));
    })();
  }, [id, openDocument, initStorage]);

  // 편집 중인 문서를 미리 볼 때는 스토어가 이미 읽어 둔 자산을 쓴다.
  useEffect(() => {
    if (id === undefined || openDocument?.id !== id) return;
    void (async () => {
      await initStorage();
      setAssets(await guideStoreDeps().assets.listByGuide(id));
    })();
  }, [id, openDocument, initStorage]);

  // 문서가 준비되면 리더를 연다. 저장된 진행이 있으면 이어하기를 묻는다.
  const openReader = useReaderStore((state) => state.open);
  useEffect(() => {
    if (draft === null) return;
    openReader(draft);
  }, [draft, openReader]);

  // 다른 탭의 변경을 받는다. 화면을 떠나면 해제한다. 해제하지 않으면 편집기
  // 화면에서도 리더 상태가 갱신되고, 두 번 마운트되면 같은 이벤트를 두 번 적용한다.
  const applyExternalChange = useReaderStore((state) => state.applyExternalChange);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      applyExternalChange(event.key, event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [applyExternalChange]);

  const closeReader = useReaderStore((state) => state.close);
  useEffect(() => () => closeReader(), [closeReader]);

  if (notFound) {
    return (
      <>
        <AppHeader />
        <div className={styles.page}>
          <h1>가이드를 찾을 수 없습니다</h1>
          <Link to="/">대시보드로 돌아가기</Link>
        </div>
      </>
    );
  }

  if (draft === null) {
    return (
      <>
        <AppHeader />
        <p className={styles.page}>불러오는 중…</p>
      </>
    );
  }

  const title = draft.meta.title.trim() === '' ? '제목 없는 가이드' : draft.meta.title;
  const resolveAssetUrl = (assetId: string) => assetUrls[assetId] ?? null;

  const globalTroubleshooting = draft.troubleshooting.filter((item) => item.scope === 'global');

  return (
    <>
      <AppHeader
        documentTitle={title}
        actions={
          <Link className={[styles.back, 'focus-ring'].join(' ')} to={`/guide/${draft.id}/edit`}>
            편집기로 돌아가기
          </Link>
        }
      />

      <main className={styles.page} data-testid="reader-root">
        {/* 저장이 지속되지 않으면 그 사실을 계속 알린다. (M7 DoD 7) */}
        {reader.persistence === 'session' ? (
          <p className={styles.persistBanner} role="alert" data-testid="reader-persist-banner">
            {`진행 상태를 이 브라우저에 저장할 수 없습니다. 페이지를 닫으면 사라질 수 있습니다.` +
              (reader.persistenceReason === undefined ? '' : ` (${reader.persistenceReason})`)}
          </p>
        ) : null}

        <ReaderBody
          document={draft}
          resolveAssetUrl={resolveAssetUrl}
          globalTroubleshootingCount={globalTroubleshooting.length}
        />

        {reader.phase === 'intro' ? (
          <TroubleshootingAccordion
            items={globalTroubleshooting}
            title="자주 겪는 문제"
            resolveAssetUrl={resolveAssetUrl}
          />
        ) : null}
      </main>
    </>
  );
}

interface ReaderBodyProps {
  document: GuideDocument;
  resolveAssetUrl: (assetId: string) => string | null;
  globalTroubleshootingCount: number;
}

/** 화면 갈래. 시작·단계·완료·오류 넷을 한 곳에서 가른다. */
function ReaderBody({ document, resolveAssetUrl, globalTroubleshootingCount }: ReaderBodyProps) {
  const reader = useReaderStore();
  const snapshot = reader.snapshot;

  // 시작 단계가 없으면 아무것도 진행할 수 없다. 완료가 아니라 오류다.
  if (snapshot !== null && snapshot.path.end.reason === 'startNotFound') {
    return <ReaderErrorScreen kind="start-not-found" />;
  }

  if (reader.phase === 'error' && reader.block?.kind === 'missing-target') {
    const step = document.steps.find((entry) => entry.id === reader.block?.stepId);
    return (
      <ReaderErrorScreen
        kind="missing-target"
        {...(step === undefined ? {} : { stepTitle: step.title })}
        targetStepId={reader.block.targetStepId}
        {...(document.settings.allowProgressReset
          ? { onRestart: () => reader.resetProgress() }
          : {})}
      />
    );
  }

  if (reader.phase === 'completed' && snapshot !== null) {
    return (
      <CompletionScreen
        completion={document.completion}
        settings={document.settings}
        summary={snapshot.summary}
        startedAt={snapshot.progress.startedAt}
        updatedAt={snapshot.progress.updatedAt}
        onRestart={() => reader.resetProgress()}
        onReview={() => reader.back()}
      />
    );
  }

  if (reader.phase === 'steps' && snapshot !== null) {
    const step = document.steps.find((entry) => entry.id === snapshot.progress.currentStepId);
    if (step === undefined) return <ReaderErrorScreen kind="start-not-found" />;

    const position = snapshot.path.stepIds.indexOf(step.id) + 1;
    const stepTroubleshooting = document.troubleshooting.filter(
      (item) => item.scope === 'step' && step.troubleshootingIds.includes(item.id),
    );

    return (
      <>
        <ReaderProgressHeader summary={snapshot.summary} />
        <ReaderStep
          step={step}
          position={position === 0 ? 1 : position}
          total={snapshot.path.stepIds.length}
          state={snapshot.progress.stepState[step.id]}
          block={reader.block}
          canGoBack={position > 1}
          isLast={position === snapshot.path.stepIds.length}
          onToggleChecklistItem={(blockId, itemId, checked) => {
            void blockId;
            reader.setChecked(step.id, itemId, checked);
          }}
          onSelectOption={(blockId, optionId) => reader.selectOption(step.id, blockId, optionId)}
          onToggleSuccess={(completed) => reader.setStepCompleted(step.id, completed)}
          onNext={() => reader.next()}
          onBack={() => reader.back()}
          resolveAssetUrl={resolveAssetUrl}
        />
        <TroubleshootingAccordion
          items={stepTroubleshooting}
          title="이 단계에서 막혔다면"
          resolveAssetUrl={resolveAssetUrl}
        />
      </>
    );
  }

  void globalTroubleshootingCount;

  const resumeSnapshotPosition =
    reader.resumeCandidate === null
      ? 0
      : reader.resumeCandidate.activePath.indexOf(reader.resumeCandidate.currentStepId) + 1;

  return (
    <>
      <ResumePrompt
        hasProgress={reader.resumeCandidate !== null}
        position={resumeSnapshotPosition === 0 ? 1 : resumeSnapshotPosition}
        total={reader.resumeCandidate?.activePath.length ?? document.steps.length}
        cursorReset={reader.cursorReset}
        otherRevisions={reader.otherRevisions}
        currentRevision={document.revision}
        onResume={() => reader.resume()}
        onRestart={() => reader.restart()}
      />
      <GuideIntro
        document={document}
        checkedPreparationIds={new Set(reader.checkedPreparationIds)}
        acknowledgedWarningIds={acknowledgedBeforeStartIds()}
        canEnter={canStart(document, reader)}
        onTogglePreparation={(itemId, checked) => reader.togglePreparation(itemId, checked)}
        onAcknowledgeWarning={(warningId) => reader.acknowledgeWarning(warningId)}
        onStart={() => reader.enterSteps()}
      />
    </>
  );
}

/**
 * 시작 CTA를 열 수 있는가.
 *
 * 판정은 `reader-runtime`의 `canEnterSteps`가 한다. 여기서 다시 쓰면 게이트가
 * 두 곳에 생기고 내보낸 HTML과 갈라진다. 이 함수는 입력만 모은다.
 *
 * `acknowledgedTick`을 읽는 이유: 확인 목록이 스토어 밖 집합이라 zustand가
 * 변화를 알 수 없다. 그 숫자가 다시 그리게 한다.
 */
function canStart(
  document: GuideDocument,
  reader: ReturnType<typeof useReaderStore.getState>,
): boolean {
  void reader.acknowledgedTick;
  return canEnterSteps(
    document,
    new Set(reader.checkedPreparationIds),
    acknowledgedBeforeStartIds(),
  );
}
