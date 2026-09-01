/**
 * 자산 Blob URL 수명 관리.
 *
 * 기준: 기술 백서 §7.1-9, 디자인 백서 §5.9(이미지 없음), 하네스 M5 DoD 9.
 *
 * `URL.createObjectURL`은 해제하지 않으면 문서가 살아 있는 동안 Blob을 붙잡는다.
 * 이미지 20장을 편집하는 화면에서 교체를 반복하면 그대로 메모리가 샌다. 이
 * 훅이 **교체·삭제·unmount 세 경우 모두** 해제를 책임진다.
 *
 * URL을 effect가 아니라 렌더 중 `useMemo`로 만든다. effect에서 만들면 상태를
 * 한 번 더 바꿔야 하고, 그 사이 렌더에서 이미지가 빈 채로 깜빡인다. 대신
 * StrictMode 개발 빌드는 렌더를 두 번 돌리므로 마운트마다 URL 하나가 남는다.
 * 프로덕션 빌드에는 그 이중 호출이 없다.
 *
 * 컴포넌트가 아니라 훅이 소유한다. `GuideImage`는 리더 런타임과 공유하는
 * 표시 컴포넌트라 브라우저 자원 관리를 넣지 않는다.
 */

import { useEffect, useMemo } from 'react';

import { toBlob } from '../../storage/asset.repository.ts';
import type { StoredAsset } from '../../storage/db.ts';

export type AssetUrlStatus = 'ready' | 'missing';

export interface AssetUrlState {
  url: string | null;
  status: AssetUrlStatus;
}

/**
 * 자산에서 Blob URL을 만든다. 자산이 바뀌면 이전 URL을 해제하고 새로 만든다.
 * `asset`이 undefined면 `missing` 상태다. 자산이 사라져 재연결이 필요한 경우다.
 */
export function useAssetUrl(asset: StoredAsset | undefined): AssetUrlState {
  // 자산 본문이 바뀌면 다시 만든다. id만 보면 같은 id로 교체한 이미지를 놓친다.
  const url = useMemo(
    () => (asset === undefined ? null : URL.createObjectURL(toBlob(asset))),
    [asset],
  );

  useEffect(() => {
    if (url === null) return;
    // 교체·삭제·unmount 모두 이 정리 함수를 지난다. (M5 DoD 9)
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return { url, status: asset === undefined ? 'missing' : 'ready' };
}

/**
 * 여러 자산의 Blob URL을 한꺼번에 만든다. 목록이 바뀌면 이전 URL을 모두 해제한다.
 * 블록마다 훅을 부를 수 없는 곳(미리보기·리더 목록)에서 쓴다. (M5 DoD 9)
 */
export function useAssetUrls(assets: readonly StoredAsset[]): Record<string, string> {
  const urls = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, URL.createObjectURL(toBlob(asset))])),
    [assets],
  );

  useEffect(() => {
    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, [urls]);

  return urls;
}
