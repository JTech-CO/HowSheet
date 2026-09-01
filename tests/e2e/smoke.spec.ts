import { expect, test } from '@playwright/test';

/**
 * 하네스 M1 DoD 4 - 앱이 `/`에서 렌더링되고 브라우저 콘솔 error가 0건이다.
 * 하네스 M1 DoD 8 / INV-15 - 외부 웹폰트·분석 스크립트 요청이 없다.
 *
 * M4에서 대시보드가 실제 화면이 되면서 스캐폴딩 문구가 사라졌다. 판정 대상은
 * 그대로다: 렌더링, 콘솔 오류 0건, 외부 요청 0건.
 */
test.describe('M1 스모크', () => {
  test('대시보드가 / 에서 렌더링되고 콘솔 error가 없다', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: '내 가이드' })).toBeVisible();
    await expect(page.getByTestId('create-guide')).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('외부 호스트로 나가는 요청이 없다 (INV-15)', async ({ page }) => {
    const external: string[] = [];

    page.on('request', (request) => {
      const url = new URL(request.url());
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (url.protocol !== 'data:' && url.protocol !== 'blob:' && !local) {
        external.push(request.url());
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '내 가이드' })).toBeVisible();

    expect(external).toEqual([]);
  });

  test('알 수 없는 경로는 404 화면을 보여준다', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('찾을 수 없습니다');
  });
});
