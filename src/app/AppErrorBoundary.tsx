/**
 * 렌더 오류를 붙잡는 마지막 그물.
 *
 * 기준: v2 제품정의 §8 INV-07·INV-09. 출시 점검 2026-09-16.
 *
 * 경계가 없으면 렌더 중 예외 한 번에 React가 루트를 통째로 언마운트한다. 화면은
 * 아무 글자도 없는 흰 바탕이 되고, 사용자는 붙여넣은 자료가 사라졌다고 읽는다.
 * 살균 파이프라인이 깊이 중첩된 Markdown에서 실제로 던졌다
 * (`'> '.repeat(3000)`이 `RangeError`를 냈다).
 *
 * ## 왜 `components/ui`가 아니라 여기인가
 *
 * 이 화면은 제품을 안다. 자료가 저장됐는지, 새로고침하면 돌아오는지는 저장 모드에
 * 달렸다. 저장소를 쓸 수 없는 브라우저에서 "새로고침하면 돌아옵니다"라고 말하면
 * 사용자는 그 말을 믿고 누르고 자료를 잃는다. 그래서 스토어를 읽을 수 있는 앱
 * 계층에 둔다. (AGENTS.md §4 "도메인을 아는 컴포넌트는 상위 계층에 둔다")
 *
 * **오류 메시지를 화면에 싣지 않는다.** 예외 문구에 무엇이 묻어 올지 모른다.
 * 우리가 쓴 고정 문장만 보여 준다.
 *
 * React 경계는 렌더와 effect만 잡는다. 이벤트 핸들러와 비동기 실패는 각 호출부가
 * 직접 다룬다.
 */

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '../components/ui/Button/Button.tsx';
import { openDocumentStore } from '../storage/document.store.ts';
import { studioStoreDeps, useStudioStore } from '../store/studio.store.ts';
import { copyText, copyOutcomeMessage } from '../utils/clipboard.ts';
import styles from './AppErrorBoundary.module.css';

/**
 * 저장된 자료를 지우고 앱을 다시 연다.
 *
 * 크래시의 원인이 저장된 자료면 새로고침은 같은 자리로 돌아온다. 그때 나갈 길이
 * 화면에 있어야 한다. 지우지 못해도 새로고침은 한다 - 갇히는 것이 더 나쁘다.
 */
async function clearStoredDocument(): Promise<void> {
  try {
    let documents;
    try {
      documents = studioStoreDeps().documents;
    } catch {
      documents = await openDocumentStore();
    }
    await documents.clear();
  } finally {
    window.location.reload();
  }
}

export function AppErrorScreen() {
  const heading = useRef<HTMLHeadingElement>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  // 오류가 난 순간의 상태를 읽는다. 구독하지 않는다 - 이 화면에서는 더 바뀌지 않는다.
  const { document, storageMode } = useStudioStore.getState();
  const source = document?.source ?? '';
  const memoryOnly = storageMode === 'memory';

  // 화면이 통째로 바뀌었다. 포커스가 사라진 자리에 두지 않는다. (INV-09)
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const onCopy = async () => {
    const outcome = await copyText(source);
    if (outcome === 'copied') {
      setCopyMessage(copyOutcomeMessage(outcome));
    } else {
      // 클립보드가 막혔다. 전문을 펼쳐 직접 고를 수 있게 한다.
      setShowSource(true);
      setCopyMessage('복사가 막혀 있어 자료를 아래에 펼쳤습니다. 직접 선택해 복사하세요');
    }
  };

  return (
    <div className={styles.wrapper} role="alert" data-testid="app-error">
      <h1 className={styles.title} ref={heading} tabIndex={-1}>
        화면을 그리지 못했습니다
      </h1>

      {memoryOnly ? (
        <p className={styles.body} data-testid="app-error-memory">
          <strong>이 브라우저에서는 저장소를 쓸 수 없어 자료가 이 탭에만 있습니다.</strong>{' '}
          새로고침하면 사라지므로 먼저 자료를 복사하세요.
        </p>
      ) : (
        <p className={styles.body}>
          붙여넣은 자료는 이 브라우저에 저장돼 있습니다. 새로고침하면 마지막으로 저장된 자료가
          돌아옵니다. 방금 고친 부분이 저장되기 전이었을 수 있으니 필요하면 먼저 복사하세요.
        </p>
      )}

      <p className={styles.body}>
        미리보기에서 났다면 자료의 인용이나 목록이 너무 깊게 겹쳐 있는 것입니다. 새로고침한 뒤
        &lsquo;원문&rsquo;으로 보면 그대로 읽을 수 있습니다.
      </p>

      <div className={styles.actions}>
        {source === '' ? null : (
          <Button
            variant={memoryOnly ? 'primary' : 'secondary'}
            data-testid="app-error-copy"
            onClick={() => void onCopy()}
          >
            자료 복사
          </Button>
        )}
        <Button
          variant={memoryOnly ? 'secondary' : 'primary'}
          data-testid="app-error-reload"
          onClick={() => window.location.reload()}
        >
          새로고침
        </Button>
        {memoryOnly ? null : (
          <Button
            variant="danger"
            data-testid="app-error-reset"
            onClick={() => void clearStoredDocument()}
          >
            자료를 지우고 다시 시작
          </Button>
        )}
      </div>

      {copyMessage === null ? null : (
        <p className={styles.body} role="status" data-testid="app-error-copy-status">
          {copyMessage}
        </p>
      )}

      {showSource ? (
        <pre className={styles.source} data-testid="app-error-source">
          {source}
        </pre>
      ) : null}
    </div>
  );
}

interface AppErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? <AppErrorScreen /> : this.props.children;
  }
}
