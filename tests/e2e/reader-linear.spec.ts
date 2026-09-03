import { expect, test, type Page } from '@playwright/test';

/**
 * 하네스 M7 - 선형 가이드의 시작 → 진행 → 완료.
 *
 * 통합 테스트는 jsdom에서 돈다. 여기서는 **실제 브라우저의 포커스와 LocalStorage**를
 * 본다. jsdom은 둘 다 흉내만 내므로 DoD 9(포커스 이동)와 DoD 5(새로고침 복원)는
 * 여기서만 실제로 확인된다.
 */

/** 편집기로 최소 가이드를 만들고 미리보기(리더)로 넘어간다. */
/**
 * 자동 저장이 끝나기를 기다리는 예산.
 *
 * 제품 계약(500ms 목표, 1초 하드 상한)은 가짜 시계를 쓰는
 * `tests/unit/autosave`가 판정한다. 여기 값은 "저장이 끝난 뒤에 이동한다"를
 * 위한 하네스 예산일 뿐이라 제품 기준을 낮추지 않는다. 5초로 두면 워커 4개가
 * 붙는 Firefox에서 브라우저 기동 경합만으로 넘어간다.
 */
const SAVED_TIMEOUT_MS = 15_000;

async function createAndOpenReader(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('create-guide').click();
  await expect(page.getByTestId('title-preview')).toBeVisible();

  const url = page.url();
  const id = url.split('/guide/')[1]?.split('/')[0] ?? '';

  // 단계를 둘 더 만들고 첫 단계에서 이어지도록 기본 경로를 잇는다.
  // 잇지 않으면 활성 경로가 1단계에서 끝난다 - M6의 경로 계산이 간선을 따른다.
  await page.getByTestId('outline-add-step').click();
  await page.getByTestId('outline-step').first().click();
  await expect(page.getByTestId('step-editor')).toBeVisible();

  const target = page.getByTestId('branch-default-target');
  await target.selectOption((await target.locator('option').nth(1).getAttribute('value')) ?? '');
  await expect(page.getByTestId('save-state')).toContainText('저장됨', {
    timeout: SAVED_TIMEOUT_MS,
  });

  await page.goto(`/guide/${id}/preview`);
  await expect(page.getByTestId('reader-root')).toBeVisible();
  return id;
}

test.describe('M7 리더 - 선형 흐름', () => {
  test('시작 화면에서 단계로 들어가고 완료까지 간다 (DoD 1·3)', async ({ page }) => {
    await createAndOpenReader(page);

    // 준비물·필수 경고가 없는 기본 문서라 게이트가 공허참이다.
    await expect(page.getByTestId('reader-start')).toBeEnabled();
    await page.getByTestId('reader-start').click();

    await expect(page.getByTestId('reader-step')).toBeVisible();
    await expect(page.getByTestId('reader-progress')).toContainText('2단계 중 1번째');

    await page.getByTestId('reader-next').click();
    await expect(page.getByTestId('reader-progress')).toContainText('2단계 중 2번째');

    await page.getByTestId('reader-next').click();
    await expect(page.getByTestId('completion-screen')).toBeVisible();
    // 마지막 단계도 완료로 센다. 커서가 남아 있으면 분자에서 빠진다.
    await expect(page.getByTestId('completion-summary')).toContainText('2 / 2');
  });

  test('단계 이동 후 제목에 포커스가 간다 (DoD 9)', async ({ page }) => {
    await createAndOpenReader(page);
    await page.getByTestId('reader-start').click();
    await expect(page.getByTestId('reader-step')).toBeVisible();

    await page.getByTestId('reader-next').click();
    await expect(page.getByTestId('reader-step-title')).toBeFocused();
  });

  test('키보드만으로 완주할 수 있다 (DoD 9)', async ({ page }) => {
    await createAndOpenReader(page);

    // 시작 버튼까지 탭으로 간 뒤 Enter로 누른다.
    const start = page.getByTestId('reader-start');
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('reader-step')).toBeVisible();

    await page.getByTestId('reader-next').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('reader-step-title')).toBeFocused();

    await page.getByTestId('reader-next').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('completion-screen')).toBeVisible();
  });

  test('진행률은 숫자로도 표시된다 (INV-12)', async ({ page }) => {
    await createAndOpenReader(page);
    await page.getByTestId('reader-start').click();

    // 색만으로 상태를 표현하지 않는다.
    await expect(page.getByTestId('reader-progress')).toContainText('번째');
  });
});
