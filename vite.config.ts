import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 편집기 번들 설정. 리더 런타임의 독립 번들은 scripts/build-reader-runtime.mjs가
// 단독으로 소유한다. (File_Structure.md §3.4, D-08)
export default defineConfig({
  // BrowserRouter가 중첩 경로(/guide/:id/edit)를 쓰므로 절대 base가 필요하다.
  // 하위 경로 배포 시 VITE_BASE로 덮어쓴다.
  base: process.env.VITE_BASE ?? '/',
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
