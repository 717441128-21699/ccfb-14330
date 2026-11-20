import { describe, expect, it } from 'vitest';
import { clamp, clamp01, hash32, mulberry32, smoothstep } from '../src/core/math';

describe('mulberry32 确定性 PRNG', () => {
  it('同种子产生完全一致的序列', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('不同种子序列不同，且输出落在 [0,1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    for (let i = 0; i < 100; i++) {
      const va = a();
      const vb = b();
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
      expect(va).not.toBe(vb);
    }
  });
});

describe('hash32', () => {
  it('同输入稳定，不同输入几乎不碰撞', () => {
    expect(hash32('abc')).toBe(hash32('abc'));
    const set = new Set<number>();
    for (let i = 0; i < 1000; i++) set.add(hash32(`key-${i}`));
    expect(set.size).toBe(1000);
  });
});

describe('标量工具', () => {
  it('clamp / clamp01 / smoothstep 边界正确', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-2)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
  });
});
