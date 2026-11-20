import { expect, test } from '@playwright/test';

interface AcceptanceResult {
  psnr: { psnrDb: number; linePsnrDb: number; flatPsnrDb: number; backgroundPsnrDb: number };
  medianMs: number;
  maxMs: number;
  lineDrift: number;
  parallelLinesOk: boolean;
  flatMaxDelta: number;
}

declare global {
  interface Window {
    __acceptanceResult?: AcceptanceResult;
  }
}

test.describe('验收指标（合成赛璐珞 + 水彩）', () => {
  test('PSNR ≥ 32dB、单帧 ≤ 500ms、双线不合并、平涂无色差、线宽稳定', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message + '\n' + (e.stack ?? '')));
    await page.goto('./acceptance.html');
    await page.click('#run');

    await page.waitForFunction(() => window.__acceptanceResult !== undefined, null, { timeout: 180_000 });
    expect(errors).toEqual([]);

    const r = await page.evaluate(() => window.__acceptanceResult!);
    console.log('METRICS ' + JSON.stringify(r));

    // 硬验收线
    expect(r.psnr.psnrDb).toBeGreaterThanOrEqual(32);
    expect(r.maxMs).toBeLessThanOrEqual(500);
    expect(r.parallelLinesOk).toBe(true);
    expect(r.flatMaxDelta).toBeLessThanOrEqual(2);
    expect(r.lineDrift).toBeLessThanOrEqual(0.02);

    // 分区 PSNR 辅助断言（非片方硬指标，仅防分区质量回退）
    expect(r.psnr.flatPsnrDb).toBeGreaterThan(34);
    expect(r.psnr.linePsnrDb).toBeGreaterThan(27);
    expect(r.psnr.backgroundPsnrDb).toBeGreaterThan(29);

    // 页面判定表全部 ✅
    const rows = await page.locator('.region-table tbody tr, .stability tr').count();
    expect(rows).toBeGreaterThan(0);
    await expect(page.locator('text=❌')).toHaveCount(0);

    // 四张对比图全部渲染
    await expect(page.locator('#shots canvas')).toHaveCount(4);
  });
});
