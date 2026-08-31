import { expect, test } from '@playwright/test';

/**
 * 하네스 M4 — 대시보드·작성기 코어·자동 저장.
 *
 * 실제 브라우저의 IndexedDB를 쓴다. 단위·통합 테스트는 메모리 백엔드로 도는
 * 만큼, 여기서만 확인되는 것이 있다: 진짜 새로고침 후 복원(DoD 2)과 자동 저장이
 * 사람이 타자를 치는 속도에서 실제로 도는지(DoD 3).
 */

/**
 * 저장소를 직접 비우지 않는다. Playwright는 테스트마다 새 브라우저 컨텍스트를
 * 주고 IndexedDB·LocalStorage도 그 컨텍스트에 갇힌다. 직접 지우려 하면
 * `indexedDB.databases()`가 없는 Firefox에서 걸리고, 앱이 연결을 쥐고 있는
 * 동안 `deleteDatabase`가 blocked 상태로 멈춘다.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('M4 편집기 기본 흐름', () => {
  test('새 가이드를 만들면 첫 단계가 있는 편집 화면이 열린다 (DoD 1)', async ({ page }) => {
    await expect(page.getByText('아직 만든 가이드가 없습니다')).toBeVisible();

    await page.getByTestId('create-guide').click();

    await expect(page).toHaveURL(/\/guide\/[^/]+\/edit$/);
    await expect(page.getByTestId('title-preview')).toHaveText('제목 없는 가이드');
    await expect(page.getByTestId('outline-step')).toHaveCount(1);
  });

  test('입력한 내용이 자동 저장되고 새로고침 후에도 남는다 (DoD 2·3·8)', async ({ page }) => {
    await page.getByTestId('create-guide').click();
    await expect(page.getByTestId('title-preview')).toBeVisible();

    await page.getByLabel(/가이드 제목/).fill('공유기 인터넷 복구');
    await page.getByLabel(/대상 사용자/).fill('처음 만져 보는 사람');

    // 저장 버튼을 누르지 않는다. 자동 저장만으로 저장됨에 도달해야 한다.
    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });

    await page.reload();

    await expect(page.getByLabel(/가이드 제목/)).toHaveValue('공유기 인터넷 복구');
    await expect(page.getByLabel(/대상 사용자/)).toHaveValue('처음 만져 보는 사람');
  });

  test('준비물·경고·단계를 더하고 새로고침해도 유지된다 (DoD 2)', async ({ page }) => {
    await page.getByTestId('create-guide').click();
    await expect(page.getByTestId('title-preview')).toBeVisible();
    await page.getByLabel(/가이드 제목/).fill('프린터 용지 걸림');

    await page.getByRole('button', { name: '준비물' }).click();
    await page.getByTestId('preparation-add').click();
    await page.getByLabel(/준비물 1 이름/).fill('장갑');

    await page.getByRole('button', { name: '경고' }).click();
    await page.getByTestId('warning-add').click();
    await page.getByLabel(/^제목/).fill('전원을 먼저 뽑으세요');

    for (let i = 0; i < 4; i += 1) {
      await page.getByTestId('outline-add-step').click();
    }
    await expect(page.getByTestId('outline-step')).toHaveCount(5);

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.reload();

    await expect(page.getByTestId('outline-step')).toHaveCount(5);
    await page.getByRole('button', { name: '준비물' }).click();
    await expect(page.getByLabel(/준비물 1 이름/)).toHaveValue('장갑');
    await page.getByRole('button', { name: '경고' }).click();
    await expect(page.getByLabel(/^제목/)).toHaveValue('전원을 먼저 뽑으세요');
  });

  test('단계 재정렬 후에도 내용이 따라간다 (DoD 6)', async ({ page }) => {
    await page.getByTestId('create-guide').click();
    await expect(page.getByTestId('title-preview')).toBeVisible();

    await page.getByTestId('outline-step').first().click();
    await page.getByLabel(/단계 제목/).fill('첫 번째 단계');
    await page.getByTestId('outline-add-step').click();
    await page.getByLabel(/단계 제목/).fill('두 번째 단계');

    // 두 번째 단계를 위로 올린다.
    await page.getByRole('button', { name: /단계 2 위로 이동/ }).click();

    await expect(page.getByTestId('outline-step').first()).toContainText('두 번째 단계');
    await expect(page.getByTestId('step-number')).toHaveText('단계 1');
    await expect(page.getByLabel(/단계 제목/)).toHaveValue('두 번째 단계');

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.reload();
    await expect(page.getByTestId('outline-step').first()).toContainText('두 번째 단계');
  });

  test('대시보드에서 복제하고 삭제할 수 있다 (DoD 7, FR-001)', async ({ page }) => {
    await page.getByTestId('create-guide').click();
    await page.getByLabel(/가이드 제목/).fill('원본 가이드');
    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });

    await page.getByRole('link', { name: 'HowSheet' }).click();
    await expect(page.getByTestId('guide-card')).toHaveCount(1);

    await page.getByTestId('guide-duplicate').click();
    await expect(page.getByTestId('guide-card')).toHaveCount(2);
    await expect(page.getByText('원본 가이드 (사본)')).toBeVisible();

    // 삭제는 확인을 거친다. 취소 버튼에 초기 포커스가 있다.
    await page.getByTestId('guide-remove').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: '취소' })).toBeFocused();
    await page.getByTestId('remove-confirm').click();

    await expect(page.getByTestId('guide-card')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('guide-card')).toHaveCount(1);
  });

  test('미리보기는 저장을 기다리지 않고 현재 초안을 보여 준다', async ({ page }) => {
    await page.getByTestId('create-guide').click();
    await page.getByLabel(/가이드 제목/).fill('초안 제목');

    await page.getByRole('button', { name: '미리보기' }).click();

    await expect(page).toHaveURL(/\/preview$/);
    await expect(page.getByRole('heading', { level: 1, name: '초안 제목' })).toBeVisible();
  });
});
