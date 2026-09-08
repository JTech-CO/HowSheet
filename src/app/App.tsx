import { StudioPage } from '../pages/StudioPage/StudioPage';

/**
 * v2는 화면이 하나라 라우터가 없다.
 *
 * v1은 대시보드·편집기·미리보기 세 라우트를 `react-router-dom`으로 나눴다.
 * 자료 입력부터 프롬프트 복사까지가 한 흐름이라 나눌 경계가 없고, 라우터를
 * 남겨 두면 쓰지 않는 의존성이 번들에 남는다. (v2 제품정의 §3)
 */
export function App() {
  return <StudioPage />;
}
