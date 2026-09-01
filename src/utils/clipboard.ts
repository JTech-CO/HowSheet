/**
 * 클립보드 복사와 폴백.
 *
 * 기준: 기술 백서 §2.2.3(명령어 복사), 하네스 M5 DoD 10.
 *
 * Clipboard API는 권한, 비보안 컨텍스트(`file://`), 포커스 없는 문서에서 흔히
 * 실패한다. 내보낸 단일 HTML은 대부분 `file://`로 열리므로 실패가 예외가 아니라
 * 기본에 가깝다. 실패했을 때 "복사 실패"만 띄우면 사용자는 명령어를 손으로
 * 옮겨 적어야 한다. 그래서 실패 시 텍스트를 **선택 상태로 만들어** 사용자가
 * 곧바로 Ctrl+C를 누를 수 있게 한다.
 */

export type CopyOutcome =
  /** 클립보드에 바로 들어갔다. */
  | 'copied'
  /** 클립보드는 막혔지만 텍스트를 선택해 두었다. 사용자가 Ctrl+C를 누르면 된다. */
  | 'selected'
  /** 둘 다 되지 않았다. */
  | 'failed';

export interface CopyTextOptions {
  /** 실패 시 선택할 요소. 보통 코드 블록의 `<pre>`다. */
  fallbackTarget?: HTMLElement | null;
}

/** 텍스트를 복사한다. 결과로 무엇이 일어났는지 알려 준다. */
export async function copyText(text: string, options: CopyTextOptions = {}): Promise<CopyOutcome> {
  if (await writeToClipboard(text)) return 'copied';
  return selectElementText(options.fallbackTarget ?? null) ? 'selected' : 'failed';
}

async function writeToClipboard(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard === undefined || typeof clipboard.writeText !== 'function') return false;

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    // 권한 거부, 비보안 컨텍스트, 포커스 없음. 폴백으로 넘어간다.
    return false;
  }
}

/** 요소의 텍스트를 통째로 선택한다. 성공하면 true. */
export function selectElementText(element: HTMLElement | null): boolean {
  if (element === null) return false;

  const selection = window.getSelection();
  if (selection === null) return false;

  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    return !selection.isCollapsed;
  } catch {
    return false;
  }
}

/** 결과를 사용자에게 보여 줄 문장으로. 화면마다 문구가 갈리지 않게 한 곳에 둔다. */
export function copyOutcomeMessage(outcome: CopyOutcome): string {
  switch (outcome) {
    case 'copied':
      return '복사했습니다';
    case 'selected':
      return '복사가 막혀 있어 전체를 선택했습니다. Ctrl+C로 복사하세요';
    case 'failed':
      return '복사하지 못했습니다. 직접 선택해 복사하세요';
  }
}
