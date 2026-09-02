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
          // Dexie보다 먼저 전역 indexedDB를 채운다. 테스트 파일의 import 순서에
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
      // 임계는 하네스가 phase별로 지정한 대상에만 건다. glob 키는 저장소 루트
      // 기준 상대 경로에 맞춰지고 경로 정규화가 pathe라 Windows에서도 같다.
      //
      // vitest 4의 glob 임계는 전역 임계의 **면제가 아니라 추가**다. 전역을 함께
      // 걸면 glob에 걸린 파일까지 전역 계산에 들어간다. 그래서 M12에서 전체
      // 임계를 더해도 이 90%가 무뎌지지 않는다.
      //
      // 전역 임계를 지금 정의하지 않는 이유: M6 DoD 11이 요구하지 않고, 아직
      // 측정한 적 없는 수치에 맞춰 임계를 정하면 게이트가 아니라 스냅샷이 된다.
      // 전체 80%는 M12 DoD 4가 같은 객체 최상위에 더한다.
      thresholds: {
        // M6 DoD 11 - 분기·그래프·진행률 핵심 모듈.
        'src/features/branching/**': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
