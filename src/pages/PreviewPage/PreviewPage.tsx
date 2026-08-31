/**
 * 미리보기 화면.
 *
 * 기준: 기술 백서 §2.1.4(원본 변경 없음), §2.2.1-7, 디자인 백서 §2.4.8.
 *
 * 저장 완료를 기다리지 않는다. 편집 중인 메모리 문서가 있으면 그것을 그대로
 * 쓰고, 없으면 저장소에서 읽는다. 이 화면은 문서를 **바꾸지 않는다**.
 *
 * 실제 리더 렌더링(분기 실행·진행 상태·완료 화면)은 M7에서 붙는다. 여기서는
 * 초안 구조를 읽기 전용으로 확인한다. 그때도 별도 미리보기 렌더러를 만들지
 * 않고 리더 컴포넌트를 그대로 쓴다. (File_Structure.md §4)
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { GuideDocument } from '../../domain/guide.types.ts';
import { AppHeader } from '../../components/layout/AppHeader/AppHeader.tsx';
import { guideStoreDeps, useGuideStore } from '../../store/guide.store.ts';
import styles from './PreviewPage.module.css';

export function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const openDocument = useGuideStore((state) => state.document);
  const initStorage = useGuideStore((state) => state.initStorage);

  const [loaded, setLoaded] = useState<GuideDocument | null>(null);
  const [notFound, setNotFound] = useState(false);

  const draft = openDocument?.id === id ? openDocument : loaded;

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
    })();
  }, [id, openDocument, initStorage]);

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

  const steps = [...draft.steps].sort((a, b) => a.order - b.order);

  return (
    <>
      <AppHeader
        documentTitle={draft.meta.title.trim() === '' ? '제목 없는 가이드' : draft.meta.title}
        actions={
          <Link className={[styles.back, 'focus-ring'].join(' ')} to={`/guide/${draft.id}/edit`}>
            편집기로 돌아가기
          </Link>
        }
      />

      <main className={styles.page}>
        <p className={styles.notice}>
          구조 미리보기입니다. 분기 실행과 진행 상태를 포함한 실제 리더 화면은 다음 단계에서
          연결됩니다.
        </p>

        <h1 className={styles.title}>
          {draft.meta.title.trim() === '' ? '제목 없는 가이드' : draft.meta.title}
        </h1>
        {draft.meta.summary === undefined ? null : (
          <p className={styles.summary}>{draft.meta.summary}</p>
        )}
        {draft.meta.audience === undefined ? null : (
          <p className={styles.audience}>대상: {draft.meta.audience}</p>
        )}

        {draft.preparation.length > 0 ? (
          <section aria-labelledby="preview-preparation">
            <h2 id="preview-preparation">시작 전 준비물</h2>
            <ul role="list">
              {[...draft.preparation]
                .sort((a, b) => a.order - b.order)
                .map((item) => (
                  <li key={item.id}>
                    {item.label === '' ? '(이름 없음)' : item.label}
                    {item.required ? null : ' (선택)'}
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {draft.warnings.length > 0 ? (
          <section aria-labelledby="preview-warnings">
            <h2 id="preview-warnings">경고</h2>
            <ul role="list">
              {[...draft.warnings]
                .sort((a, b) => a.order - b.order)
                .map((item) => (
                  <li key={item.id} data-severity={item.severity}>
                    <strong>{item.title === '' ? '(제목 없음)' : item.title}</strong> — {item.body}
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="preview-steps">
          <h2 id="preview-steps">단계 {steps.length}개</h2>
          <ol className={styles.steps} role="list">
            {steps.map((step) => (
              <li key={step.id}>
                <strong>{step.title === '' ? '(제목 없는 단계)' : step.title}</strong>
                {step.summary === undefined ? null : <p>{step.summary}</p>}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
