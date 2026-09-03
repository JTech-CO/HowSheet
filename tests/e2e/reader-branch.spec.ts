import { expect, test, type Page } from '@playwright/test';

/**
 * 하네스 M7 - 분기 가이드의 선택·경로 재계산.
 *
 * 편집기로 분기를 만들고 리더에서 실행한다. 픽스처를 저장소에 직접 심을 수단이
 * 브라우저에는 없으므로, 편집기가 만든 문서를 그대로 쓴다. 이렇게 하면 M6의
 * 편집기와 M7의 리더가 같은 문서 위에서 만난다는 것도 함께 확인된다.
 */

/**
 * 자동 저장이 끝나기를 기다리는 예산.
 *
 * 제품 계약(500ms 목표, 1초 하드 상한)은 가짜 시계를 쓰는
 * `tests/unit/autosave`가 판정한다. 여기 값은 "저장이 끝난 뒤에 이동한다"를
 * 위한 하네스 예산일 뿐이라 제품 기준을 낮추지 않는다. 5초로 두면 워커 4개가
 * 붙는 Firefox에서 브라우저 기동 경합만으로 넘어간다.
 */
const SAVED_TIMEOUT_MS = 15_000;

async function buildBranchedGuide(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('create-guide').click();
  await expect(page.getByTestId('title-preview')).toBeVisible();
  const id = page.url().split('/guide/')[1]?.split('/')[0] ?? '';

  // 단계 3개: 시작 → (A | B)
  await page.getByTestId('outline-add-step').click();
  await page.getByTestId('outline-add-step').click();

  // 첫 단계에 선택 분기 블록과 규칙을 만든다.
  await page.getByTestId('outline-step').first().click();
  await expect(page.getByTestId('step-editor')).toBeVisible();
  await page.getByTestId('add-block-decision').click();
  await page.getByTestId('block-decision-question').fill('어느 쪽입니까?');
  await page.getByTestId('decision-option-label').nth(0).fill('왼쪽');
  await page.getByTestId('decision-option-label').nth(1).fill('오른쪽');

  await page.getByTestId('branch-rule-add').click();
  await expect(page.getByTestId('branch-rule')).toBeVisible();

  const sourceOptions = await page.getByTestId('branch-rule-source').locator('option').all();
  const blockValue = (await sourceOptions[1]?.getAttribute('value')) ?? '';
  await page.getByTestId('branch-rule-source').selectOption(blockValue);

  const valueOptions = await page.getByTestId('branch-rule-value').locator('option').all();
  await page
    .getByTestId('branch-rule-value')
    .selectOption((await valueOptions[2]?.getAttribute('value')) ?? '');

  // 오른쪽을 고르면 3단계로 간다. 그 외에는 2단계로.
  const targets = await page.getByTestId('branch-rule-target').locator('option').all();
  await page
    .getByTestId('branch-rule-target')
    .selectOption((await targets[2]?.getAttribute('value')) ?? '');
  await page
    .getByTestId('branch-default-target')
    .selectOption(
      (await page
        .getByTestId('branch-default-target')
        .locator('option')
        .nth(1)
        .getAttribute('value')) ?? '',
    );

  await expect(page.getByTestId('save-state')).toContainText('저장됨', {
    timeout: SAVED_TIMEOUT_MS,
  });
  await page.goto(`/guide/${id}/preview`);
  await expect(page.getByTestId('reader-root')).toBeVisible();
  return id;
}

test.describe('M7 리더 - 분기 흐름', () => {
  test('선택하지 않으면 다음으로 갈 수 없다 (DoD 2)', async ({ page }) => {
    await buildBranchedGuide(page);
    await page.getByTestId('reader-start').click();
    await expect(page.getByTestId('reader-step')).toBeVisible();

    await page.getByTestId('reader-next').click();
    await expect(page.getByTestId('reader-blocked')).toBeVisible();
  });

  test('선택과 이동은 분리돼 있다 (디자인 §2.2.2)', async ({ page }) => {
    await buildBranchedGuide(page);
    await page.getByTestId('reader-start').click();

    const first = await page.getByTestId('reader-step').getAttribute('data-step-id');
    await page.getByRole('radio').first().check();
    // 고른다고 바로 넘어가지 않는다.
    await expect(page.getByTestId('reader-step')).toHaveAttribute('data-step-id', first ?? '');
  });

  test('선택에 따라 경로가 갈리고 되돌리면 다시 계산된다 (DoD 3·5)', async ({ page }) => {
    await buildBranchedGuide(page);
    await page.getByTestId('reader-start').click();
    await expect(page.getByTestId('reader-step')).toBeVisible();

    await page.getByRole('radio').nth(1).check();
    await page.getByTestId('reader-next').click();
    const viaSecond = await page.getByTestId('reader-step').getAttribute('data-step-id');

    await page.getByTestId('reader-back').click();
    await expect(page.getByTestId('reader-step')).toBeVisible();

    await page.getByRole('radio').nth(0).check();
    await page.getByTestId('reader-next').click();
    const viaFirst = await page.getByTestId('reader-step').getAttribute('data-step-id');

    expect(viaFirst).not.toBe(viaSecond);
  });
});
