import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { DashboardPage } from '../pages/DashboardPage/DashboardPage';
import { EditorPage } from '../pages/EditorPage/EditorPage';
import { NotFoundPage } from '../pages/NotFoundPage/NotFoundPage';
import { PreviewPage } from '../pages/PreviewPage/PreviewPage';

/** 라우트 표는 기술 백서 §2.1.4를 따른다. */
export function AppRouter() {
  return (
    // VITE_BASE로 하위 경로에 배포할 때 라우터도 같은 base를 써야 한다.
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/guide/:id/edit" element={<EditorPage />} />
        <Route path="/guide/:id/preview" element={<PreviewPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
