import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

// 테스트 배치는 File_Structure.md §5.1(D-07)이 고정한다.
//   - unit        : 순수 함수·도메인. node 환경.
//   - dom         : 통합 테스트와 컴포넌트 병치 렌더링 테스트. jsdom 환경.
// 커버리지 측정 대상은 src/** 이며 테스트 파일 자신은 제외한다.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          // 확장자를 좁히면 tests/unit의 .test.tsx가 어느 프로젝트에도 잡히지 않아
          // 조용히 건너뛴다. DOM이 필요한 테스트는 여기서 시끄럽게 실패해야 한다.
          include: ['tests/unit/**/*.test.{ts,tsx}'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          // 저장소 모듈보다 먼저 전역 indexedDB를 채운다. 테스트 파일의 import 순서에
          // 기대면 저장소 통합 테스트가 조용히 메모리 백엔드로 떨어진다.
          setupFiles: ['./tests/setup/fake-indexeddb.ts'],
          include: ['tests/integration/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // D-07은 대상을 src/**로 두고 테스트 파일 자신만 제외한다.
      exclude: ['src/**/*.test.{ts,tsx}'],
      reporter: ['text', 'json-summary'],
      // 임계는 아직 걸지 않는다. 측정한 적 없는 수치에 맞춰 임계를 정하면
      // 게이트가 아니라 스냅샷이 된다. 하네스 P7이 대상과 값을 정한 뒤에 더한다.
      //
      // v1이 걸어 둔 `src/features/branching/**` 90%는 P2에서 지웠다. 그
      // 디렉터리는 P0에서 사라졌고, 대상이 없는 임계는 통과가 아니라 빈
      // 게이트다. (CLAUDE.md "게이트가 비면 지운다")
    },
  },
});
