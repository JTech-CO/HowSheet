/**
 * 스튜디오 화면.
 *
 * 기준: v2 제품정의 §2(사용자 흐름), §3(화면).
 *
 * v2는 화면이 하나다. 자료를 붙여넣고, 담을 것과 보일 방식을 고르고, 프롬프트를
 * 받아 복사한다. 그 전부가 이 파일 아래에 붙는다.
 *
 * 네 영역이 모두 찼다. P5까지 오면서 마지막 자리인 결과 영역이 채워졌고,
 * P6이 그 안에 복사·다운로드·이전 결과를 더한다.
 */

import { useEffect } from 'react';

import { AppHeader } from '../../components/layout/AppHeader/AppHeader.tsx';
import { ApiKeySettings } from '../../components/settings/ApiKeySettings/ApiKeySettings.tsx';
import { SectionHeader } from '../../components/layout/SectionHeader/SectionHeader.tsx';
import { DesignPicker } from '../../components/studio/DesignPicker/DesignPicker.tsx';
import { ElementPicker } from '../../components/studio/ElementPicker/ElementPicker.tsx';
import { PromptResult } from '../../components/studio/PromptResult/PromptResult.tsx';
import { SaveStatus } from '../../components/studio/SaveStatus/SaveStatus.tsx';
import { SourceInput } from '../../components/studio/SourceInput/SourceInput.tsx';
import { useGenerateStore } from '../../store/generate.store.ts';
import { useSettingsStore } from '../../store/settings.store.ts';
import { useStudioStore } from '../../store/studio.store.ts';
import styles from './StudioPage.module.css';

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
  const toggleElement = useStudioStore((state) => state.toggleElement);
  const setDesign = useStudioStore((state) => state.setDesign);

  const apiKey = useSettingsStore((state) => state.key);
  const apiKeyError = useSettingsStore((state) => state.keyError);
  const apiKeyJustSaved = useSettingsStore((state) => state.justSaved);
  const initSettings = useSettingsStore((state) => state.initSettings);
  const saveKey = useSettingsStore((state) => state.saveKey);
  const removeKey = useSettingsStore((state) => state.removeKey);

  const generateStatus = useGenerateStore((state) => state.status);
  const streaming = useGenerateStore((state) => state.streaming);
  const results = useGenerateStore((state) => state.results);
  const selected = useGenerateStore((state) => state.selected);
  const generateError = useGenerateStore((state) => state.error);
  const generate = useGenerateStore((state) => state.generate);
  const cancel = useGenerateStore((state) => state.cancel);
  const selectResult = useGenerateStore((state) => state.selectResult);

  useEffect(() => {
    void init();
    initSettings();
  }, [init, initSettings]);

  // 문서가 오기 전에는 선택 UI를 그리지 않는다. 기본값으로 먼저 그리면
  // 저장된 선택이 도착하는 순간 화면이 한 번 뒤집힌다.
  const ready = status === 'ready' && document !== null;

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
        {/* 종이에서는 프롬프트만 남는다. 만들기 위한 입력은 감춘다. (P7 DoD 5) */}
        <section className={styles.section} aria-labelledby="source-heading" data-print="hide">
          {/*
            키가 있으면 자료가 Anthropic으로 간다. 그 사실을 적지 않으면 이 문구가
            거짓이 된다. INV-03은 Anthropic 전송을 허용하지만, 허용과 고지는
            다른 문제다. (출시 점검 2026-09-16)
          */}
          <SectionHeader
            id="source-heading"
            title="자료"
            description={
              apiKey.present
                ? '한 페이지로 만들고 싶은 내용을 붙여넣습니다. 프롬프트를 만들 때 자료가 api.anthropic.com으로 전송됩니다. 그 밖으로는 나가지 않습니다.'
                : '한 페이지로 만들고 싶은 내용을 붙여넣습니다. 키가 없으므로 자료는 이 브라우저 밖으로 나가지 않습니다.'
            }
          />
          {ready ? (
            <SourceInput value={document.source} onChange={setSource} onClear={clearSource} />
          ) : (
            <p className={styles.loading} role="status">
              불러오는 중입니다.
            </p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="elements-heading" data-print="hide">
          <SectionHeader
            id="elements-heading"
            title="담을 것"
            description="다이어그램, 순서도, 비교표 같은 요소를 고릅니다. 여러 개를 고를 수 있습니다."
          />
          {ready ? <ElementPicker selected={document.elements} onToggle={toggleElement} /> : null}
        </section>

        <section className={styles.section} aria-labelledby="design-heading" data-print="hide">
          <SectionHeader
            id="design-heading"
            title="보일 방식"
            description="색, 톤, 밀도, 타이포를 고릅니다. 축마다 하나씩 정해져 있습니다."
          />
          {ready ? <DesignPicker value={document.design} onChange={setDesign} /> : null}
        </section>

        <section className={styles.section} aria-labelledby="result-heading">
          <SectionHeader
            id="result-heading"
            title="프롬프트"
            description="여기서 만든 프롬프트를 Claude나 ChatGPT에 붙여넣습니다. 복사하거나 .md로 내려받을 수 있습니다."
          />
          {ready ? (
            <PromptResult
              status={generateStatus}
              streaming={streaming}
              results={results}
              selected={selected}
              hasKey={apiKey.present}
              source={document.source}
              {...(generateError === undefined ? {} : { error: generateError })}
              onGenerate={() => void generate(document)}
              onCancel={cancel}
              onSelect={selectResult}
            />
          ) : null}
        </section>

        <section className={styles.section} aria-labelledby="settings-heading" data-print="hide">
          <SectionHeader
            id="settings-heading"
            title="설정"
            description="API 키를 넣으면 AI가 프롬프트를 다듬습니다. 키가 없어도 템플릿으로 동작합니다."
          />
          <ApiKeySettings
            state={apiKey}
            justSaved={apiKeyJustSaved}
            {...(apiKeyError === undefined ? {} : { error: apiKeyError })}
            onSave={saveKey}
            onRemove={removeKey}
          />
        </section>
      </main>
    </div>
  );
}
