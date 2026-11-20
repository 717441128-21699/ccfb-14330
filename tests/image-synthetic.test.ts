import { describe, expect, it } from 'vitest';
import {
  classifyRegions,
  createImage,
  downsampleBox,
  psnr,
  psnrByRegion,
  RgbaImage,
  setPx,
  upscaleMaskNearest,
} from '../src/core/image';
import { generateSdMaster, generateSyntheticScene } from '../src/core/synthetic';
import { SyntheticSceneSpec } from '../src/types';

const W4K = 960;
const H4K = 540;
const SD_W = 240;
const SD_H = 135;

function baseSpec(overrides: Partial<SyntheticSceneSpec> = {}): SyntheticSceneSpec {
  return {
    seed: 42,
    width: W4K,
    height: H4K,
    motionPhase: 0,
    includeBackground: true,
    includeCel: true,
    ...overrides,
  };
}

describe('downsampleBox', () => {
  it('4x 下采样纯色图像颜色不变', () => {
    const src = createImage(8, 8);
    for (let p = 0; p < 8 * 8; p++) {
      src.data[p * 4] = 200;
      src.data[p * 4 + 1] = 100;
      src.data[p * 4 + 2] = 50;
      src.data[p * 4 + 3] = 255;
    }
    const dst = downsampleBox(src, 2, 2);
    expect(dst.width).toBe(2);
    expect([...dst.data.slice(0, 4)]).toEqual([200, 100, 50, 255]);
  });

  it('非整数倍缩放抛错', () => {
    expect(() => downsampleBox(createImage(10, 10), 3, 3)).toThrow();
  });
});

describe('psnr', () => {
  it('完全相同的图 PSNR 为 Infinity', () => {
    const a = createImage(4, 4);
    const b = createImage(4, 4);
    expect(psnr(a, b).psnrDb).toBe(Infinity);
  });

  it('已知恒定误差对应理论 PSNR', () => {
    const a = createImage(4, 4);
    const b = createImage(4, 4);
    a.data.fill(255);
    b.data.fill(255);
    for (let p = 0; p < 4 * 4; p++) {
      a.data[p * 4] = 100;
      b.data[p * 4] = 110; // R 通道误差 10，三通道 MSE = 100/3
    }
    const expected = 10 * Math.log10((255 * 255) / (100 / 3));
    expect(psnr(a, b).psnrDb).toBeCloseTo(expected, 5);
  });
});

describe('合成场景结构', () => {
  it('4K 母版与 SD 尺寸正确，alpha 全不透明', () => {
    const { scene, sd } = generateSdMaster(baseSpec(), SD_W, SD_H);
    expect(scene.composite.width).toBe(W4K);
    expect(scene.composite.height).toBe(H4K);
    expect(sd.width).toBe(SD_W);
    expect(sd.height).toBe(SD_H);
    let transparent = 0;
    for (let p = 0; p < W4K * H4K; p++) {
      if (scene.composite.data[p * 4 + 3] !== 255) transparent++;
    }
    expect(transparent).toBe(0);
  });

  it('同种子同相位逐像素一致（可复现）', () => {
    const a = generateSyntheticScene(baseSpec()).composite;
    const b = generateSyntheticScene(baseSpec()).composite;
    expect(Buffer.from(a.data.buffer)).toEqual(Buffer.from(b.data.buffer));
  });

  it('平涂色块内部存在大面积严格常量颜色区域', () => {
    const { scene } = generateSdMaster(baseSpec(), SD_W, SD_H);
    const mask = scene.regions;
    // 统计平涂区每种颜色的最大连通式计数（简化：直接统计完全相同 RGB 的像素数）
    const counts = new Map<string, number>();
    for (let p = 0; p < W4K * H4K; p++) {
      if (mask[p] !== 1) continue;
      const i = p * 4;
      const key = `${scene.composite.data[i]},${scene.composite.data[i + 1]},${scene.composite.data[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const largest = Math.max(...counts.values());
    // 最大单色平涂区域应占到整幅画面的 1% 以上
    expect(largest).toBeGreaterThan(W4K * H4K * 0.01);
  });

  it('背景层含纹理：相邻像素存在显著色差，而平涂区没有', () => {
    const { scene } = generateSdMaster(baseSpec(), SD_W, SD_H);
    const img = scene.composite;
    let bgVariation = 0;
    let flatVariation = 0;
    let bgCount = 0;
    let flatCount = 0;
    // 只统计区域内部像素（四邻域同区），排除线/色块抗锯齿边缘混入平涂统计
    const isInterior = (p: number): boolean => {
      const x = p % W4K;
      const y = Math.floor(p / W4K);
      if (x === 0 || y === 0 || x === W4K - 1 || y === H4K - 1) return false;
      const r = scene.regions[p];
      return (
        scene.regions[p - 1] === r &&
        scene.regions[p + 1] === r &&
        scene.regions[p - W4K] === r &&
        scene.regions[p + W4K] === r
      );
    };
    for (let y = 1; y < H4K; y++) {
      for (let x = 1; x < W4K; x++) {
        const p = y * W4K + x;
        if (!isInterior(p)) continue;
        const i = p * 4;
        const j = (y * W4K + x - 1) * 4;
        const d = Math.abs(img.data[i] - img.data[j]) + Math.abs(img.data[i + 1] - img.data[j + 1]);
        if (scene.regions[p] === 2) {
          bgVariation += d;
          bgCount++;
        } else if (scene.regions[p] === 1) {
          flatVariation += d;
          flatCount++;
        }
      }
    }
    expect(flatCount).toBeGreaterThan(1000);
    expect(bgCount).toBeGreaterThan(1000);
    expect(bgVariation / bgCount).toBeGreaterThan(4 * (flatVariation / Math.max(1, flatCount)));
  });

  it('赛璐珞层运动时背景保持静止', () => {
    const s0 = generateSyntheticScene(baseSpec({ motionPhase: 0 }));
    const s4 = generateSyntheticScene(baseSpec({ motionPhase: 3 }));
    expect(Buffer.from(s0.background.data.buffer)).toEqual(Buffer.from(s4.background.data.buffer));
    expect(Buffer.from(s0.composite.data.buffer)).not.toEqual(Buffer.from(s4.composite.data.buffer));
  });
});

describe('分区分类（CPU 参考实现）', () => {
  it('SD 帧能分出全部三类区域，且线条占比合理', () => {
    const { sd } = generateSdMaster(baseSpec(), SD_W, SD_H);
    const mask = classifyRegions(sd, 92, 10);
    const counts = [0, 0, 0];
    for (const r of mask) counts[r]++;
    const total = SD_W * SD_H;
    expect(counts[0]).toBeGreaterThan(total * 0.02); // 线条至少 2%
    expect(counts[1]).toBeGreaterThan(total * 0.05); // 平涂至少 5%
    expect(counts[2]).toBeGreaterThan(total * 0.1); // 背景至少 10%
  });

  it('平行双线在 SD 掩码中保持两条独立的线', () => {
    const { scene, sd } = generateSdMaster(baseSpec(), SD_W, SD_H);
    const mask = classifyRegions(sd, 92, 10);
    // 在弧线所在行扫描“线条段”数量（弧线圆心约 (170/4, 430/4)，半径约 24~29 SD px）
    const cx = Math.round(170 / 4);
    const cy = Math.round(430 / 4);
    const rowY = cy;
    let segments = 0;
    let inLine = false;
    for (let x = cx; x < SD_W; x++) {
      const isLine = mask[rowY * SD_W + x] === 0;
      if (isLine && !inLine) segments++;
      inLine = isLine;
    }
    expect(segments).toBeGreaterThanOrEqual(2);
    // 4K 真值里两条线确实分离
    const truth = scene.regions;
    const truthRow = Math.round(430);
    let truthSegments = 0;
    let truthInLine = false;
    for (let x = Math.round(170); x < W4K; x++) {
      const isLine = truth[truthRow * W4K + x] === 0;
      if (isLine && !truthInLine) truthSegments++;
      truthInLine = isLine;
    }
    expect(truthSegments).toBeGreaterThanOrEqual(2);
  });

  it('掩码最近邻放大保持分区类别', () => {
    const { sd } = generateSdMaster(baseSpec(), SD_W, SD_H);
    const mask = classifyRegions(sd, 92, 10);
    const big = upscaleMaskNearest(mask, SD_W, SD_H, W4K, H4K);
    expect(big.length).toBe(W4K * H4K);
    const counts = [0, 0, 0];
    for (const r of big) counts[r]++;
    expect(counts[0] + counts[1] + counts[2]).toBe(W4K * H4K);
  });
});

describe('psnrByRegion', () => {
  it('按分区统计且零误差为 Infinity', () => {
    const { sd } = generateSdMaster(baseSpec(), SD_W, SD_H);
    const mask = classifyRegions(sd, 92, 10);
    const bigMask = upscaleMaskNearest(mask, SD_W, SD_H, W4K, H4K);
    const a: RgbaImage = createImage(W4K, H4K);
    const report = psnrByRegion(a, a, bigMask);
    expect(report.line).toBe(Infinity);
    expect(report.flat).toBe(Infinity);
    expect(report.counts[0]).toBeGreaterThan(0);
  });

  it('手工三色块分区 PSNR 与全局计算一致', () => {
    const w = 6;
    const h = 2;
    const a = createImage(w, h);
    const b = createImage(w, h);
    const mask = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      mask[x] = x < 2 ? 0 : x < 4 ? 1 : 2;
      mask[w + x] = mask[x];
      setPx(a, x, 0, 50, 50, 50);
      setPx(a, x, 1, 50, 50, 50);
      setPx(b, x, 0, 60, 60, 60);
      setPx(b, x, 1, 60, 60, 60);
    }
    const report = psnrByRegion(a, b, mask);
    // 每像素三通道各差 10 => 每通道 MSE=100
    const expected = 10 * Math.log10((255 * 255) / 100);
    expect(report.line).toBeCloseTo(expected, 5);
    expect(report.flat).toBeCloseTo(expected, 5);
    expect(report.background).toBeCloseTo(expected, 5);
  });
});
