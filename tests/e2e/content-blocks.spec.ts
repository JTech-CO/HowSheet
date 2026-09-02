import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

/**
 * 하네스 M5 - 콘텐츠 블록 렌더러·Markdown 안전화·이미지 자산.
 *
 * 단위 테스트는 jsdom에서 살균 결과 문자열을 본다. 여기서는 **실제 브라우저가
 * 그 HTML을 파싱한 뒤**에도 스크립트가 실행되지 않는지 본다. jsdom은 인라인
 * 스크립트를 실행하지 않으므로 그 확인은 여기서만 가능하다. (M5 DoD 2)
 */

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'assets',
);

/** 편집 화면을 열고 단계 편집 섹션까지 간다. */
async function openStepEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('create-guide').click();
  await expect(page.getByTestId('title-preview')).toBeVisible();
  await page.getByTestId('outline-step').first().click();
  await expect(page.getByTestId('step-editor')).toBeVisible();
}

test.describe('M5 콘텐츠 블록', () => {
  test('블록 7종을 모두 추가할 수 있고 순서가 고정이다 (DoD 1)', async ({ page }) => {
    await openStepEditor(page);

    // 기본 문서에 텍스트 블록 하나가 있다.
    await expect(page.getByTestId('block-editor')).toHaveCount(1);

    for (const type of ['code', 'link', 'image', 'checklist', 'decision', 'divider']) {
      await page.getByTestId(`add-block-${type}`).click();
    }

    await expect(page.getByTestId('block-editor')).toHaveCount(7);

    // 추가 버튼의 순서는 도메인 목록과 같고 사용에 따라 바뀌지 않는다.
    const labels = await page.getByRole('group', { name: '블록 추가' }).getByRole('button').all();
    const texts = await Promise.all(labels.map((button) => button.textContent()));
    expect(texts.map((text) => text?.replace(/[^가-힣]/g, ''))).toEqual([
      '텍스트',
      '명령어',
      '링크',
      '이미지',
      '체크리스트',
      '선택분기',
      '구분선',
    ]);
  });

  test('XSS 페이로드가 미리보기에서 실행되지 않는다 (DoD 2, INV-07)', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    await openStepEditor(page);

    const payload = [
      '<script>alert("script")</script>',
      '<img src=x onerror=alert("img")>',
      '<svg onload=alert("svg")></svg>',
      '[클릭](javascript:alert("link"))',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '정상 **굵은** 문단',
    ].join('\n\n');

    await page.getByTestId('block-text').fill(payload);
    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });

    await page.getByRole('button', { name: '미리보기' }).click();
    const step = page.getByTestId('preview-step');
    await expect(step).toBeVisible();

    // 정상 Markdown은 살아남는다.
    await expect(step.locator('strong', { hasText: '굵은' })).toBeVisible();

    // 위험한 것은 전부 사라진다. 앱 자신의 번들 script와 섞이지 않게 단계 안만 본다.
    expect(await step.locator('script, iframe, svg, object, embed').count()).toBe(0);
    expect(await step.locator('[onerror], [onload], [srcdoc]').count()).toBe(0);
    expect(await step.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(dialogs).toEqual([]);
  });

  test('코드 블록은 텍스트로 보존되고 복사할 수 있다 (DoD 3·10)', async ({ page }) => {
    await openStepEditor(page);
    await page.getByTestId('add-block-code').click();

    const code = '</script><script>alert(1)</script>\necho "hi"';
    await page.getByTestId('block-code').fill(code);

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.getByRole('button', { name: '미리보기' }).click();

    const block = page.getByTestId('code-block');
    await expect(block).toBeVisible();
    // 텍스트로 남는다. 태그로 해석되지 않았다.
    await expect(block.locator('code')).toHaveText(code);
    expect(await block.locator('script').count()).toBe(0);

    // 복사는 성공하거나(권한 있음) 선택 폴백으로 넘어간다. 둘 다 사용자가 쓸 수 있다.
    await block.getByTestId('copy-button').click();
    await expect(block.getByTestId('copy-message')).not.toBeEmpty();
  });

  test('링크는 http·https만 새 탭 링크가 된다 (DoD 4)', async ({ page }) => {
    await openStepEditor(page);
    await page.getByTestId('add-block-link').click();
    await page.getByTestId('block-link-label').fill('문서');
    await page.getByTestId('block-link-url').fill('https://example.com/docs');

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.getByRole('button', { name: '미리보기' }).click();

    const link = page.getByTestId('link-card').getByRole('link');
    await expect(link).toHaveAttribute('href', 'https://example.com/docs');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('허용하지 않는 프로토콜은 링크로 만들지 않는다 (DoD 4)', async ({ page }) => {
    await openStepEditor(page);
    await page.getByTestId('add-block-link').click();
    await page.getByTestId('block-link-label').fill('클릭');
    await page.getByTestId('block-link-url').fill('javascript:alert(1)');

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.getByRole('button', { name: '미리보기' }).click();

    await expect(page.getByTestId('link-blocked')).toBeVisible();
    expect(await page.getByTestId('link-card').getByRole('link').count()).toBe(0);
  });

  test('SVG 업로드는 차단된다 (DoD 5, 기술 §7.1-8)', async ({ page }) => {
    await openStepEditor(page);
    await page.getByTestId('add-block-image').click();

    await page.getByTestId('block-image-input').setInputFiles(path.join(FIXTURES, 'blocked.svg'));

    await expect(page.getByTestId('image-issues')).toContainText('PNG, JPEG, WebP, GIF만');
    expect(await page.getByTestId('block-image-preview').count()).toBe(0);
  });

  test('같은 이미지를 두 블록에 넣으면 자산이 하나다 (DoD 8)', async ({ page }) => {
    await openStepEditor(page);

    await page.getByTestId('add-block-image').click();
    await page.getByTestId('add-block-image').click();

    const inputs = page.getByTestId('block-image-input');
    await inputs.nth(0).setInputFiles(path.join(FIXTURES, 'duplicate-a.png'));
    await expect(page.getByTestId('block-image-preview')).toHaveCount(1);

    await inputs.nth(1).setInputFiles(path.join(FIXTURES, 'duplicate-b.png'));
    await expect(page.getByTestId('block-image-preview')).toHaveCount(2);

    // 바이트가 같으므로 checksum이 같고, 저장소는 기존 자산을 재사용한다.
    const blocks = page.locator('[data-testid="block-editor"][data-type="image"]');
    const first = await blocks.nth(0).getAttribute('data-asset-id');
    const second = await blocks.nth(1).getAttribute('data-asset-id');

    expect(first).not.toBe('');
    expect(second).toBe(first);
  });

  test('업로드한 이미지가 미리보기에 나오고 대체 텍스트가 붙는다', async ({ page }) => {
    await openStepEditor(page);
    await page.getByTestId('add-block-image').click();

    await page
      .getByTestId('block-image-input')
      .setInputFiles(path.join(FIXTURES, 'transparent-diagram.png'));
    await expect(page.getByTestId('block-image-preview')).toBeVisible();
    await page.getByTestId('block-image-alt').fill('공유기 뒷면 도식');

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.getByRole('button', { name: '미리보기' }).click();

    await expect(page.getByRole('img', { name: '공유기 뒷면 도식' })).toBeVisible();
  });

  test('장식용으로 선언하면 대체 텍스트를 묻지 않고 보조 기술에서 숨긴다 (DoD 6)', async ({
    page,
  }) => {
    await openStepEditor(page);
    await page.getByTestId('add-block-image').click();

    await page
      .getByTestId('block-image-input')
      .setInputFiles(path.join(FIXTURES, 'transparent-diagram.png'));
    await expect(page.getByTestId('block-image-preview')).toBeVisible();

    // 선언 전에는 대체 텍스트를 묻는다.
    await expect(page.getByTestId('block-image-alt')).toBeVisible();

    await page.getByTestId('block-image-decorative').check();
    await expect(page.getByTestId('block-image-alt')).toHaveCount(0);

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.getByRole('button', { name: '미리보기' }).click();

    const image = page.getByTestId('guide-image').locator('img');
    await expect(image).toHaveAttribute('role', 'presentation');
    await expect(image).toHaveAttribute('alt', '');
  });

  test('체크리스트 항목을 늘리고 줄일 수 있다 (M5 할 일 1)', async ({ page }) => {
    await openStepEditor(page);
    await page.getByTestId('add-block-checklist').click();

    await expect(page.getByTestId('checklist-item')).toHaveCount(1);
    // 항목이 하나면 지울 수 없다.
    await expect(page.getByTestId('checklist-item-remove')).toBeDisabled();

    await page.getByTestId('checklist-item-add').click();
    await expect(page.getByTestId('checklist-item')).toHaveCount(2);

    const labels = page.getByTestId('checklist-item-label');
    await labels.nth(0).fill('전원 확인');
    await labels.nth(1).fill('케이블 확인');

    await page.getByTestId('checklist-item-remove').first().click();
    await expect(page.getByTestId('checklist-item')).toHaveCount(1);
    await expect(page.getByTestId('checklist-item-label')).toHaveValue('케이블 확인');

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.getByRole('button', { name: '미리보기' }).click();
    await expect(page.getByText('케이블 확인')).toBeVisible();
  });

  test('원격 이미지 Markdown은 네트워크로 나가지 않는다 (INV-15)', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (url.protocol !== 'data:' && url.protocol !== 'blob:' && !local) external.push(url.href);
    });

    await openStepEditor(page);
    await page.getByTestId('block-text').fill('![원격](https://example.com/tracker.png)');

    await expect(page.getByTestId('save-state')).toContainText('저장됨', { timeout: 5000 });
    await page.getByRole('button', { name: '미리보기' }).click();
    await expect(page.getByTestId('preview-step')).toBeVisible();

    expect(external).toEqual([]);
    // 대체 텍스트는 남는다. (디자인 §5.9)
    await expect(page.locator('img[alt="원격"]')).toHaveCount(1);
    await expect(page.locator('img[alt="원격"]')).not.toHaveAttribute('src', /.+/);
  });
});
