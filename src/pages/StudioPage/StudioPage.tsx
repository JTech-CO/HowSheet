/**
 * 스튜디오 화면.
 *
 * 기준: v2 제품정의 §2(사용자 흐름), §3(화면).
 *
 * v2는 화면이 하나다. 자료를 붙여넣고, 담을 것과 보일 방식을 고르고, 프롬프트를
 * 받아 복사한다. 그 전부가 이 파일 아래에 붙는다.
 *
 * 아직 채우지 않은 영역은 어느 phase가 맡는지 표시해 둔다. 빈 화면을 두면 다음
 * phase가 자리를 다시 정하게 된다.
 */

import { useEffect } from 'react';

import { AppHeader } from '../../components/layout/AppHeader/AppHeader.tsx';
import { SectionHeader } from '../../components/layout/SectionHeader/SectionHeader.tsx';
import { SaveStatus } from '../../components/studio/SaveStatus/SaveStatus.tsx';
import { SourceInput } from '../../components/studio/SourceInput/SourceInput.tsx';
import { useStudioStore } from '../../store/studio.store.ts';
import styles from './StudioPage.module.css';

/** 아직 만들지 않은 영역. 어느 phase가 채우는지 함께 적는다. */
function Pending({ phase, children }: { phase: string; children: string }) {
  return (
    <p className={styles.pending}>
      <span className={styles.phase}>{phase}</span>
      {children}
    </p>
  );
}

export function StudioPage() {
  const document = useStudioStore((state) => state.document);
  const status = useStudioStore((state) => state.status);
  const saveState = useStudioStore((state) => state.saveState);
  const saveError = useStudioStore((state) => state.saveError);
  const storageMode = useStudioStore((state) => state.storageMode);
  const storageUnavailableReason = useStudioStore((state) => state.storageUnavailableReason);
  const init = useStudioStore((state) => state.init);
  const setSource = useStudioStore((state) => state.setSource);
  const clearSource = useStudioStore((state) => state.clearSource);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className={styles.page}>
      <AppHeader
        subtitle="프롬프트 스튜디오"
        status={
          <SaveStatus
            saveState={saveState}
            storageMode={storageMode}
            {...(saveError === undefined ? {} : { saveError })}
            {...(storageUnavailableReason === undefined ? {} : { storageUnavailableReason })}
          />
        }
      />

      <main className={styles.main}>
        <section className={styles.section} aria-labelledby="source-heading">
          <SectionHeader
            id="source-heading"
            title="자료"
            description="한 페이지로 만들고 싶은 내용을 붙여넣습니다. 붙여넣은 자료는 이 브라우저 밖으로 나가지 않습니다."
          />
          {status === 'ready' && document !== null ? (
            <SourceInput value={document.source} onChange={setSource} onClear={clearSource} />
          ) : (
            <p className={styles.loading} role="status">
              불러오는 중입니다.
            </p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="elements-heading">
          <SectionHeader
            id="elements-heading"
            title="담을 것"
            description="다이어그램, 순서도, 비교표 같은 요소를 고릅니다. 고르지 않으면 자료를 보고 정합니다."
          />
          <Pending phase="P2">요소 토글 10종</Pending>
        </section>

        <section className={styles.section} aria-labelledby="design-heading">
          <SectionHeader
            id="design-heading"
            title="보일 방식"
            description="색, 톤, 밀도, 타이포를 고릅니다."
          />
          <Pending phase="P2">디자인 축 4종</Pending>
        </section>

        <section className={styles.section} aria-labelledby="result-heading">
          <SectionHeader
            id="result-heading"
            title="프롬프트"
            description="여기서 만든 프롬프트를 Claude나 ChatGPT에 붙여넣습니다."
          />
          <Pending phase="P3·P5">템플릿 조립과 AI 합성, 복사·다운로드</Pending>
        </section>
      </main>
    </div>
  );
}
