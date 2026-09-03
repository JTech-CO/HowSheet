/**
 * 텍스트를 파일로 내려받는다.
 *
 * 기준: 기술 백서 §4.3.5-5·6(Blob 생성 → 안전한 파일명으로 다운로드), §4.6.
 *
 * `utils/`에 두는 이유가 두 가지다.
 *
 *   - `EditorPage`는 스토어의 `document`를 같은 이름의 지역 변수로 받아 전역
 *     `document`를 가린다. 그 파일 안에서 `document.createElement`를 쓰면
 *     `GuideDocument`를 건드리게 된다. 호출만 하게 두면 그 함정이 없다.
 *   - 내보내기는 M8 JSON과 M9 HTML 두 곳에서 필요하고 절차가 같다.
 *
 * `domain/`에는 둘 수 없다. DOM 전역을 쓰므로 `verify:architecture`가 막는다.
 */

/**
 * Blob URL을 만들어 내려받고 해제한다.
 *
 * `URL.revokeObjectURL`을 반드시 부른다. 부르지 않으면 문서가 살아 있는 동안
 * Blob이 메모리에 남고, 이미지를 담은 내보내기는 수십 MB다. (기술 §9-9)
 */
export function downloadText(fileName: string, mimeType: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));

  try {
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    // 클릭 자체는 문서에 붙지 않아도 되지만 일부 브라우저가 무시한다.
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
