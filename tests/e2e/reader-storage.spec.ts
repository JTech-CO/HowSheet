import { expect, test, type Page } from '@playwright/test';

/**
 * 하네스 M7 - 진행 저장·복원·다른 탭 동기화.
 *
 * chromium 단독으로 돈다(하네스 M7 검증 블록). 실제 LocalStorage와 실제
 * `storage` 이벤트가 필요하고, 그 동작은 브라우저마다 다르지 않다.
 */

const PROGRESS_KEY_PREFIX = 'howsheet:progress';

async function createAndOpenReader(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('create-guide').click();
  await expect(page.getByTestId('title-preview')).toBeVisible();
  const id = page.url().split('/guide/')[1]?.split('/')[0] ?? '';

  // 기본 경로로 두 단계를 잇는다. 잇지 않으면 활성 경로가 1단계에서 끝나
  // "다음"이 곧바로 완료가 된다.
  await page.getByTestId('outline-add-step').click();
  await page.getByTestId('outline-step').first().click();
  await expect(page.getByTestId('step-editor')).toBeVisible();

  const target = page.getByTestId('branch-default-target');
  await target.selectOption((await target.locator('option').nth(1).getAttribute('value')) ?? '');
  await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });

  await page.goto(`/guide/${id}/preview`);
  await expect(page.getByTestId('reader-root')).toBeVisible();
  return id;
}

/** 저장된 진행 본문. 디바운스가 끝났는지 내용으로 확인할 때 쓴다. */
async function storedProgress(page: Page): Promise<string | null> {
  const [key] = await progressKeys(page);
  if (key === undefined) return null;
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** 우리 네임스페이스의 진행 키만 읽는다. */
async function progressKeys(page: Page): Promise<string[]> {
  return page.evaluate((prefix) => {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
    return keys.sort();
  }, PROGRESS_KEY_PREFIX);
}

test.describe('M7 리더 - 진행 저장', () => {
  test('시작 전에는 진행을 쓰지 않는다', async ({ page }) => {
    await createAndOpenReader(page);
    expect(await progressKeys(page)).toEqual([]);
  });

  test('진행은 revision별 키로 저장된다 (INV-10)', async ({ page }) => {
    const id = await createAndOpenReader(page);
    await page.getByTestId('reader-start').click();
    await expect(page.getByTestId('reader-step')).toBeVisible();

    await expect.poll(async () => (await progressKeys(page)).length, { timeout: 3000 }).toBe(1);

    const [key] = await progressKeys(page);
    // 템플릿 리터럴 안에서는 역슬래시가 먹히므로 문자 클래스를 그대로 쓴다.
    expect(key).toMatch(new RegExp('^' + PROGRESS_KEY_PREFIX + ':' + id + ':r[0-9]+$'));
  });

  test('새로고침 후 이어하기가 뜨고 진행이 복원된다 (DoD 5)', async ({ page }) => {
    const id = await createAndOpenReader(page);
    await page.getByTestId('reader-start').click();
    await expect(page.getByTestId('reader-step')).toBeVisible();

    await page.getByTestId('reader-next').click();
    const before = await page.getByTestId('reader-step').getAttribute('data-step-id');

    // 키 개수만 보면 첫 저장에서 이미 1이라 두 번째 저장을 기다리지 못한다.
    // 새 커서가 실제로 실릴 때까지 본문으로 확인한다.
    await expect
      .poll(async () => (await storedProgress(page))?.includes(before ?? '') ?? false, {
        timeout: 3000,
      })
      .toBe(true);

    await page.goto(`/guide/${id}/preview`);
    await expect(page.getByTestId('resume-prompt')).toBeVisible();

    await page.getByTestId('resume-continue').click();
    await expect(page.getByTestId('reader-step')).toHaveAttribute('data-step-id', before ?? '');
  });

  test('처음부터를 고르면 시작 화면으로 돌아간다', async ({ page }) => {
    const id = await createAndOpenReader(page);
    await page.getByTestId('reader-start').click();
    await expect(page.getByTestId('reader-step')).toBeVisible();
    await expect.poll(async () => (await progressKeys(page)).length, { timeout: 3000 }).toBe(1);

    await page.goto(`/guide/${id}/preview`);
    await page.getByTestId('resume-restart').click();
    await expect(page.getByTestId('guide-intro')).toBeVisible();
  });

  test('LocalStorage에는 진행과 편집기 키만 들어간다 (기술 §7.2)', async ({ page }) => {
    await createAndOpenReader(page);
    await page.getByTestId('reader-start').click();
    await expect.poll(async () => (await progressKeys(page)).length, { timeout: 3000 }).toBe(1);

    const all = await page.evaluate(() => {
      const keys: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key !== null) keys.push(key);
      }
      return keys;
    });

    for (const key of all) {
      expect(key).toMatch(/^howsheet:(editor|progress):/);
    }
  });

  test('다른 탭의 변경을 무한 반복 없이 반영한다 (DoD 8)', async ({ page, context }) => {
    const id = await createAndOpenReader(page);
    await page.getByTestId('reader-start').click();
    await expect(page.getByTestId('reader-step')).toBeVisible();
    await expect.poll(async () => (await progressKeys(page)).length, { timeout: 3000 }).toBe(1);

    // 두 번째 탭에서 진행을 앞으로 옮긴다.
    const other = await context.newPage();
    await other.goto(`/guide/${id}/preview`);
    await other.getByTestId('resume-continue').click();
    await expect(other.getByTestId('reader-step')).toBeVisible();
    await other.getByTestId('reader-next').click();

    const movedTo = await other.getByTestId('reader-step').getAttribute('data-step-id');

    // 첫 탭이 그 변경을 따라온다.
    await expect(page.getByTestId('reader-step')).toHaveAttribute('data-step-id', movedTo ?? '', {
      timeout: 5000,
    });

    // ping-pong이 없다면 값이 안정된다. 두 번 연속 같은 값이어야 한다.
    const first = await page.evaluate(
      (key) => localStorage.getItem(key),
      (await progressKeys(page))[0] ?? '',
    );
    await page.waitForTimeout(600);
    const second = await page.evaluate(
      (key) => localStorage.getItem(key),
      (await progressKeys(page))[0] ?? '',
    );
    expect(second).toBe(first);

    await other.close();
  });
});
