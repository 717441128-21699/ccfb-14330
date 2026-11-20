/**
 * 确定性工具函数。
 * 这里的 PRNG 只用于 CPU 端合成数据生成与 ID 生成；
 * GPU shader 内不使用随机数，保证同参数输出可复现、帧间不闪。
 */

/** mulberry32 —— 小型确定性 PRNG，同种子序列完全一致 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从字符串生成稳定的 32 位哈希（FNV-1a） */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 生成带前缀的唯一 ID（时间戳 + 计数 + 随机后缀，但不依赖 Date.now 之外的状态） */
let idCounter = 0;
export function makeId(prefix: string): string {
  idCounter = (idCounter + 1) & 0xffff;
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(16).padStart(4, '0')}${rand}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** 平滑阶跃，GLSL smoothstep 的 CPU 版，分区软化共用同一公式 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 欧氏 RGB 距离（0~441.67） */
export function rgbDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function nowMs(): number {
  return performance.now();
}
