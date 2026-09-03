import { expect, test, type Page } from '@playwright/test';

/**
 * 하네스 M7 - 진행 저장·복원·다른 탭 동기화.
 *
 * 하네스 M7 검증 블록은 chromium만 지정하지만 `playwright.config.ts`에 브라우저
 * 제한이 없어 세 프로젝트에서 모두 돈다. 그대로 둔다 - 실제로 webkit에서만
 * 드러난 결함이 있었다. 디바운스가 끝났는지 판정하는 폴링이 느슨해서, 저장이
 * 끝나기 전에 새로고침해도 통과했다. (M8에서 고침)
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
  await expect(page.getByTestId('save-state')).toContainText('저장됨', {
    timeout: SAVED_TIMEOUT_MS,
  });

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

/** 저장된 커서. 디바운스가 실제로 끝났는지 판정하는 유일하게 정확한 값이다. */
async function storedCurrentStepId(page: Page): Promise<string | null> {
  const raw = await storedProgress(page);
  if (raw === null) return null;
  try {
    return (JSON.parse(raw) as { currentStepId?: string }).currentStepId ?? null;
  } catch {
    return null;
  }
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
    // 새 커서가 실제로 실릴 때까지 기다린다.
    //
    // 본문에 ID가 들어 있는지로 보면 안 된다. `activePath`가 경로의 모든 단계
    // ID를 담고 있어 **첫 저장부터** 다음 단계 ID가 문자열에 들어 있다. 그래서
    // 부분 문자열 검사는 언제나 즉시 참이 되고, 디바운스가 끝나기 전에 새로
    // 고침해 webkit에서 이전 커서로 이어하기가 됐다. 커서 필드만 본다.
    await expect.poll(async () => await storedCurrentStepId(page), { timeout: 3000 }).toBe(before);

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
