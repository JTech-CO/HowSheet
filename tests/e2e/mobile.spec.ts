/**
 * 320px 대응.
 *
 * 기준: v2 제품정의 §8 INV-10. 하네스 P7 DoD 3.
 *
 * 320px는 아직 쓰이는 가장 좁은 화면이다. 여기서 가로로 밀리면 본문을 읽을 수
 * 없고, 누를 자리가 44px보다 작으면 손가락으로 겨냥할 수 없다.
 */

import { expect, test, type Page } from '@playwright/test';

const NARROW = { width: 320, height: 800 };

/** 문서 전체가 가로로 넘치는지. */
function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      // 스크롤을 스스로 감당하지 않으면서 넘치는 요소.
      //
      // 인라인 요소는 제외한다. `scrollWidth`/`clientWidth`가 인라인 박스에서
      // 무엇을 뜻하는지 엔진마다 달라(Firefox는 `strong`·`span`을 넘친다고
      // 보고한다) 실제 넘침과 구분되지 않는다. 페이지를 가로로 미는 것은
      // 블록·플렉스·그리드 상자다.
      leaking: [...document.querySelectorAll('body *')]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.overflowX !== 'visible' || style.display === 'none') return false;
          if (style.display.startsWith('inline') || element.clientWidth === 0) return false;
          return element.scrollWidth > element.clientWidth + 1;
        })
        .map((element) => element.tagName + '.' + element.className)
        .slice(0, 5),
    };
  });
}

/**
 * 누를 수 있는 것들의 실제 크기.
 *
 * 라디오와 체크박스는 상자 자체가 작다. 감싸는 라벨이 누르는 자리이므로 그것을
 * 잰다. 화면 밖이거나 감춰진 것은 세지 않는다.
 */
function touchTargets(page: Page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, a[href], input, textarea, select')];

    return nodes
      .map((node) => {
        const target =
          node instanceof HTMLInputElement && (node.type === 'radio' || node.type === 'checkbox')
            ? (node.closest('label') ?? node)
            : node;
        const box = target.getBoundingClientRect();
        return {
          name:
            (node.getAttribute('data-testid') ?? node.tagName.toLowerCase()) +
            (node instanceof HTMLInputElement ? ':' + node.type : ''),
          width: Math.round(box.width),
          height: Math.round(box.height),
          hidden: box.width === 0 && box.height === 0,
        };
      })
      .filter((item) => !item.hidden);
  });
}

test.use({ viewport: NARROW });

test('320px에서 가로 스크롤이 없다 (DoD 3)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('source-input')).toBeVisible();

  // 아주 긴 한 줄은 가로 스크롤을 만드는 가장 흔한 원인이다.
  await page.getByTestId('source-input').fill('# 배포 절차\n\n' + 'x'.repeat(4000));
  await page.getByTestId('prompt-generate').click();
  await expect(page.getByTestId('prompt-text')).toBeVisible();

  const overflow = await horizontalOverflow(page);

  // DoD가 말하는 것이 이것이다. 넘치는 요소 목록은 원인을 짚기 위한 보조다.
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.leaking).toEqual([]);
});

test('누를 자리가 44px 이상이다 (DoD 3, INV-10)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('source-input')).toBeVisible();

  await page.getByTestId('prompt-generate').click();
  await expect(page.getByTestId('prompt-text')).toBeVisible();
  // 회차 버튼까지 화면에 올린다.
  await page.getByTestId('prompt-generate').click();
  await expect(page.getByTestId('prompt-history')).toBeVisible();

  const targets = await touchTargets(page);

  // 잴 것이 없으면 아래 단언이 전부 공허하게 통과한다.
  expect(targets.length).toBeGreaterThan(20);

  const small = targets.filter((item) => item.height < 44 || item.width < 44);
  expect(small).toEqual([]);
});

test('요소 격자가 좁은 화면에서 한 칸으로 접힌다 (DoD 3)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('element-diagram')).toBeVisible();

  const columns = await page.evaluate(() => {
    const first = document.querySelector('[data-testid="element-diagram"]');
    const second = document.querySelector('[data-testid="element-flowchart"]');
    if (first === null || second === null) return -1;
    // 두 번째가 첫 번째와 같은 줄에 있으면 두 칸 이상이다.
    return first.getBoundingClientRect().top === second.getBoundingClientRect().top ? 2 : 1;
  });

  expect(columns).toBe(1);
});

test('저장소가 막혀도 경고가 320px 안에서 읽힌다 (INV-10, 출시 점검 2026-09-16)', async ({
  page,
}) => {
  // 사생활 보호 모드처럼 IndexedDB가 없는 브라우저를 만든다. 저장이 안 된다는
  // 경고가 가장 필요한 상태에서, 그 경고가 헤더 안에서 1,079px로 늘어나 위로
  // 잘리고 본문을 덮었다.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  });
  await page.goto('/');

  const notice = page.getByTestId('storage-memory');
  await expect(notice).toBeVisible();
  // 첫 편집 뒤 헤더 이름표가 붙은 상태까지 잰다.
  await page.getByTestId('source-input').fill('내용');
  await expect(page.getByTestId('save-state')).toBeVisible();

  const layout = await page.evaluate(() => {
    const header = document.querySelector('header');
    const banner = document.querySelector('[data-testid="storage-memory"]');
    if (header === null || banner === null) return null;
    const headerBox = header.getBoundingClientRect();
    const bannerBox = banner.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      headerTop: headerBox.top,
      headerBottom: headerBox.bottom,
      bannerTop: bannerBox.top,
      bannerLeft: bannerBox.left,
      bannerRight: bannerBox.right,
      bannerWidth: bannerBox.width,
    };
  });

  expect(layout).not.toBeNull();
  if (layout === null) return;
  // 화면 위로 잘리지 않는다.
  expect(layout.headerTop).toBeGreaterThanOrEqual(0);
  expect(layout.bannerTop).toBeGreaterThanOrEqual(layout.headerBottom);
  // 좁은 기둥으로 찌그러지지 않고 가로로 넘치지도 않는다.
  expect(layout.bannerLeft).toBeGreaterThanOrEqual(0);
  expect(layout.bannerRight).toBeLessThanOrEqual(layout.viewport);
  expect(layout.bannerWidth).toBeGreaterThan(layout.viewport / 2);

  const overflow = await horizontalOverflow(page);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.leaking).toEqual([]);
});
