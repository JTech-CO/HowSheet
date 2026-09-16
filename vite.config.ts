import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 앱 번들 설정. v2는 번들이 하나다.
export default defineConfig({
  // v2는 화면이 하나라 라우터가 없다. 상대 base면 루트든 하위 경로든 같은
  // 산출물이 그대로 동작한다. 절대 base가 필요하다던 근거(v1의 BrowserRouter
  // 중첩 경로)는 P0에서 사라졌다. (출시 점검 2026-09-16)
  base: process.env.VITE_BASE ?? './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    modules: {
      // 클래스명은 CSS Modules 지역 범위를 사용한다. (File_Structure.md §4)
      localsConvention: 'camelCaseOnly',
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // 외부 요청 0건 원칙상 자산 인라인 임계값을 명시적으로 고정한다. (INV-02, INV-15)
    assetsInlineLimit: 4096,
  },
});
