import { StrictMode, type ReactNode } from 'react';

type ProvidersProps = {
  children: ReactNode;
};

/**
 * 전역 Provider 조립 지점.
 *
 * M1 시점에는 StrictMode만 둔다. 저장소·스토어 Provider는 각각 M3·M4에서
 * 이 파일에 추가한다. (File_Structure.md §9)
 */
export function Providers({ children }: ProvidersProps) {
  return <StrictMode>{children}</StrictMode>;
}
