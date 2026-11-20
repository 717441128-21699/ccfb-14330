import { expect, test } from '@playwright/test';

test.describe('主工作台冒烟', () => {
  test('页面加载即创建默认集，WebGL2 状态正常显示', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./index.html');
    await expect(page.locator('#gpu-status')).toContainText(/WebGL2 就绪/);
    await expect(page.locator('#episode-select option')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('新建镜头合成 8 帧素材，胶片条全部渲染', async ({ page }) => {
    await page.goto('./index.html');
    await page.click('#btn-new-shot');
    await expect(page.locator('.frame-cell')).toHaveCount(8, { timeout: 60_000 });
    await expect(page.locator('#shot-select option')).toHaveCount(1);
  });

  test('单帧处理后出现结果标记与耗时徽章，且耗时 ≤ 500ms', async ({ page }) => {
    await page.goto('./index.html');
    await page.click('#btn-new-shot');
    await page.waitForSelector('.frame-cell', { state: 'attached', timeout: 60_000 });
    await page.click('#btn-process-one');
    await page.waitForSelector('.frame-cell.done', { timeout: 60_000 });
    const badge = page.locator('#perf-badge');
    await expect(badge).toBeVisible();
    const text = await badge.textContent();
    const ms = Number((text ?? '').replace(/[^\d.]/g, ''));
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(500);
  });

  test('整镜批量跑完全部帧，进度文案给出平均/最大耗时', async ({ page }) => {
    await page.goto('./index.html');
    await page.click('#btn-new-shot');
    await page.waitForSelector('.frame-cell', { state: 'attached', timeout: 60_000 });
    await page.click('#btn-process-all');
    await page.waitForFunction(() => document.querySelectorAll('.frame-cell.done').length === 8, null, {
      timeout: 120_000,
    });
    await expect(page.locator('#progress')).toContainText('整镜完成');
  });

  test('三种比对模式可切换且不报错', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./index.html');
    await page.click('#btn-new-shot');
    await page.waitForSelector('.frame-cell', { state: 'attached', timeout: 60_000 });
    await page.click('#btn-process-one');
    await page.waitForSelector('.frame-cell.done', { timeout: 60_000 });
    for (const mode of ['wipe', 'diff', 'blink']) {
      await page.click(`.mode-btn[data-mode="${mode}"]`);
      await expect(page.locator(`.mode-btn[data-mode="${mode}"]`)).toHaveClass(/active/);
    }
    expect(errors).toEqual([]);
  });
});
