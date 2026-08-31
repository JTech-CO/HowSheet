import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// 지원 브라우저 3종을 모두 프로젝트로 둔다. M1은 chromium만 실행하지만
// M7 이후 test:e2e가 세 프로젝트를 모두 통과해야 한다. (하네스 §0.9, M12 DoD 5)
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // 기본값(CPU 절반)으로 두면 Firefox 인스턴스가 한꺼번에 뜨면서 컨텍스트
  // 생성이 30초 타임아웃에 걸린다. 제품 결함이 아니라 자원 경합인데, 게이트가
  // 흔들리면 진짜 실패와 구분할 수 없다. 로컬도 상한을 둔다. (하네스 §0.9)
  workers: process.env['CI'] ? 1 : 4,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
