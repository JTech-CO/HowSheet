import { StrictMode, type ReactNode } from 'react';

import { AppErrorBoundary } from './AppErrorBoundary.tsx';

type ProvidersProps = {
  children: ReactNode;
};

/**
 * 전역 Provider 조립 지점.
 *
 * Zustand 스토어는 모듈 수준이라 Provider가 필요 없다. 저장소는 화면이
 * `initStorage()`로 한 번 연다. 여기에 Context를 하나 더 끼우면 스토어가
 * 두 경로(훅과 Context)로 접근돼 테스트에서 어느 쪽을 대역으로 넣을지가
 * 흐려진다. 그래서 M4에서도 StrictMode만 둔다. (File_Structure.md §9)
 *
 * 오류 경계는 예외다. Context가 아니라 그물이고, 이것이 없으면 렌더 예외 한 번에
 * 화면이 빈 바탕이 된다. StrictMode 안쪽에 둬서 앱 전체를 덮는다.
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <StrictMode>
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </StrictMode>
  );
}
