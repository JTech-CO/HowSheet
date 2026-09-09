/**
 * 키보드 완주, 포커스 표시, 상태 표현, 스크린 리더 알림.
 *
 * 기준: v2 제품정의 §8 INV-09. 하네스 P7 DoD 1·2·4.
 *
 * 여기서는 **마우스를 한 번도 쓰지 않는다.** `click()`을 부르는 순간 이 파일이
 * 검증하려는 것이 사라진다.
 */

import { expect, test, type Page } from '@playwright/test';

/** 지금 포커스된 요소의 `data-testid`. */
function focusedTestId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
}

/** 탭만으로 목표에 닿는다. 닿지 못하면 실패한다 - 그것이 곧 DoD 1 위반이다. */
async function tabTo(page: Page, testId: string, limit = 60): Promise<void> {
  for (let step = 0; step < limit; step += 1) {
    if ((await focusedTestId(page)) === testId) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`탭 ${limit}번으로 ${testId}에 닿지 못했습니다.`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('source-input')).toBeVisible();
});

test('자료 입력부터 복사까지 키보드만으로 끝낸다 (DoD 1)', async ({ page }) => {
  await tabTo(page, 'source-input');
  await page.keyboard.type('# 배포 절차\n\n1. 빌드한다\n2. 태그를 올린다');

  await tabTo(page, 'element-diagram');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('element-diagram')).toHaveAttribute('aria-pressed', 'true');

  // 라디오 그룹은 화살표로 옮긴다. 브라우저가 지키는 동작이다.
  await tabTo(page, 'design-color-monotone');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('design-color-accent')).toBeChecked();

  await tabTo(page, 'prompt-generate');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('prompt-text')).toBeVisible();

  await tabTo(page, 'copy-button');
  await page.keyboard.press('Enter');

  // 복사됐든 선택으로 떨어졌든 결과를 말로 알려야 한다.
  await expect(page.getByTestId('copy-message')).not.toBeEmpty();
});

test('탭으로 닿는 모든 곳에 포커스 표시가 보인다 (DoD 1)', async ({ page }) => {
  // 결과 영역의 버튼까지 탭 순서에 올린다.
  await page.getByTestId('prompt-generate').click();
  await expect(page.getByTestId('prompt-text')).toBeVisible();

  // 누른 버튼에 포커스가 남아 있으면 그 뒤만 돌게 된다. 문서 처음부터 시작한다.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });

  const seen: Array<{ name: string; outlineStyle: string; outlineWidth: number }> = [];

  // 한 요소만 보면 그 요소가 쓰는 경로만 검사한다. 실제로 탭이 닿는 곳을
  // 전부 돌아 한 곳이라도 표시가 없으면 걸리게 한다.
  for (let step = 0; step < 60; step += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate((first: boolean) => {
      const element = document.activeElement;
      if (element === null || element === document.body) return null;

      // 한 바퀴를 돈 것은 이름이 아니라 **같은 노드**로 판정한다. 이름이 없는
      // 버튼이 여럿이라 이름으로 보면 두 번째에서 멈춘다.
      if (element.hasAttribute('data-e2e-start')) return { done: true };
      if (first) element.setAttribute('data-e2e-start', '1');

      const style = getComputedStyle(element);
      return {
        done: false,
        name: element.getAttribute('data-testid') ?? element.tagName.toLowerCase(),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    }, seen.length === 0);

    // 문서 끝에서 브라우저 UI로 빠졌다가 다시 문서 처음으로 돌아온다.
    // 거기서 멈추면 절반만 보게 되므로 건너뛰고 계속 돈다.
    if (focused === null) continue;
    if (focused.done === true) break;
    seen.push({
      name: focused.name ?? '',
      outlineStyle: focused.outlineStyle ?? 'none',
      outlineWidth: focused.outlineWidth ?? 0,
    });
  }

  // 돌아본 것이 없으면 아래 단언이 공허하게 통과한다.
  expect(seen.length).toBeGreaterThan(15);

  const invisible = seen.filter((item) => item.outlineStyle === 'none' || item.outlineWidth < 2);
  expect(invisible).toEqual([]);
});

test('상태를 색이 아니라 글자로도 말한다 (DoD 2)', async ({ page }) => {
  const diagram = page.getByTestId('element-diagram');

  // 켜기 전에는 표시가 없다. 이 단언이 없으면 아래가 공허해진다.
  await expect(diagram).not.toContainText('✓');

  await tabTo(page, 'element-diagram');
  await page.keyboard.press('Space');

  await expect(diagram).toContainText('✓');
  await expect(diagram).toHaveAttribute('aria-pressed', 'true');

  await tabTo(page, 'prompt-generate');
  await page.keyboard.press('Enter');

  // 출처도 글자로 적힌다.
  await expect(page.getByTestId('prompt-origin')).toContainText('템플릿으로 조립');
  await expect(page.getByTestId('prompt-plan')).toContainText('키가 없어');
});

test('시작과 완료를 스크린 리더에 알린다 (DoD 4)', async ({ page }) => {
  const live = page.locator('[aria-live]').first();

  await tabTo(page, 'source-input');
  await page.keyboard.type('자료');

  await tabTo(page, 'prompt-generate');
  await page.keyboard.press('Enter');

  // 완료가 빨라 시작 문장을 놓칠 수 있다. 둘 중 하나는 반드시 잡힌다.
  await expect(live).toContainText(/만드는 중입니다|프롬프트를 만들었습니다/);
  await expect(live).toContainText('프롬프트를 만들었습니다');
  await expect(live).toContainText('1회차');

  // 다시 만들면 회차가 올라가 같은 문장이 반복되지 않는다.
  await tabTo(page, 'prompt-generate');
  await page.keyboard.press('Enter');
  await expect(live).toContainText('2회차');
});

test('알림 경로가 하나다 (DoD 4)', async ({ page }) => {
  await tabTo(page, 'prompt-generate');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('prompt-text')).toBeVisible();

  // 보이는 문구에 role을 또 붙이면 같은 말이 두 번 읽힌다.
  const regions = await page.locator('[aria-live], [role="status"], [role="alert"]').count();
  expect(regions).toBeLessThanOrEqual(2);
});
