/**
 * 인쇄.
 *
 * 기준: 하네스 P7 DoD 5.
 *
 * 종이에 남아야 하는 것은 프롬프트 전문이다. 화면에서는 상자 안에서
 * 스크롤하지만 인쇄에서 그 상한이 남으면 **첫 화면 분량만 나오고 나머지가
 * 사라진다.** 그것이 여기서 막으려는 것이다.
 */

import { expect, test, type Page } from '@playwright/test';

/** 프롬프트가 길어지도록 자료를 채우고 한 번 만든다. */
async function generateLongPrompt(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('source-input')).toBeVisible();

  const source = [
    '# 배포 절차',
    '',
    ...Array.from({ length: 200 }, (_, i) => `${i + 1}. 단계 ${i + 1}`),
  ];
  await page.getByTestId('source-input').fill(source.join('\n'));

  await page.getByTestId('prompt-generate').click();
  await expect(page.getByTestId('prompt-text')).toBeVisible();
}

test('인쇄에서 프롬프트 전문이 잘리지 않는다 (DoD 5)', async ({ page }) => {
  await generateLongPrompt(page);

  const screen = await page.getByTestId('prompt-text').evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));

  // 화면에서는 상자가 내용보다 작다. 그래야 이 테스트가 무언가를 검사한다.
  expect(screen.scrollHeight).toBeGreaterThan(screen.clientHeight);

  await page.emulateMedia({ media: 'print' });

  const printed = await page.getByTestId('prompt-text').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
    };
  });

  expect(printed.maxHeight).toBe('none');
  expect(printed.overflowY).toBe('visible');
  // 잘리지 않았다면 상자가 내용을 전부 담는다.
  expect(printed.scrollHeight).toBeLessThanOrEqual(printed.clientHeight + 1);
});

test('인쇄에서 만들기 위한 UI가 사라지고 프롬프트는 남는다 (DoD 5)', async ({ page }) => {
  await generateLongPrompt(page);
  await page.emulateMedia({ media: 'print' });

  await expect(page.getByTestId('prompt-text')).toBeVisible();
  await expect(page.getByTestId('prompt-origin')).toBeVisible();

  for (const hidden of [
    'source-input',
    'element-diagram',
    'design-color-monotone',
    'prompt-generate',
    'prompt-download',
    'copy-button',
    'api-key-input',
  ]) {
    await expect(page.getByTestId(hidden)).toBeHidden();
  }
});

test('감출 곳이 실제로 표시돼 있다 (DoD 5)', async ({ page }) => {
  await generateLongPrompt(page);

  // 표시가 하나도 없으면 위 테스트가 "원래 안 보이는 것"을 확인하고 만다.
  const marked = await page.locator('[data-print="hide"]').count();
  expect(marked).toBeGreaterThanOrEqual(6);
});
