import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { Providers } from './app/providers';
import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('#root 컨테이너를 찾을 수 없습니다.');
}

createRoot(container).render(
  <Providers>
    <App />
  </Providers>,
);
