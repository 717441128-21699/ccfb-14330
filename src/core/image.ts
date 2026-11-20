/**
 * CPU 端图像工具：PSNR、参考图下采样、分区统计、Blob/ImageBitmap 互转。
 * 下采样仅用于生成测试参考（4K 原图 -> 标清），正式放大管线全部在 WebGL2。
 */
import { rgbDistance } from './math';

export interface RgbaImage {
  width: number;
  height: number;
  /** 长度 = width*height*4 的 Uint8ClampedArray（固定由 ArrayBuffer 支撑，可直接构造 ImageData） */
  data: Uint8ClampedArray<ArrayBuffer>;
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(new ArrayBuffer(width * height * 4)) };
}

export function setPx(img: RgbaImage, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

export function getPx(img: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

/**
 * 高质量区域平均下采样（box filter，覆盖所有源像素）。
 * 用于把 4K 合成原图缩小成标清输入，模拟“只有标清母版”的场景。
 * 要求宽高均为整数倍缩放。
 */
export function downsampleBox(src: RgbaImage, dstW: number, dstH: number): RgbaImage {
  if (src.width % dstW !== 0 || src.height % dstH !== 0) {
    throw new Error(`downsampleBox 要求整数倍缩放: ${src.width}x${src.height} -> ${dstW}x${dstH}`);
  }
  const sx = src.width / dstW;
  const sy = src.height / dstH;
  const dst = createImage(dstW, dstH);
  const area = sx * sy;
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      let r = 0, g = 0, b = 0, a = 0;
      const x0 = dx * sx, y0 = dy * sy;
      for (let yy = 0; yy < sy; yy++) {
        for (let xx = 0; xx < sx; xx++) {
          const i = ((y0 + yy) * src.width + (x0 + xx)) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          a += src.data[i + 3];
        }
      }
      const o = (dy * dstW + dx) * 4;
      dst.data[o] = r / area;
      dst.data[o + 1] = g / area;
      dst.data[o + 2] = b / area;
      dst.data[o + 3] = a / area;
    }
  }
  return dst;
}

/**
 * PSNR（峰值信噪比），按 8bit 每通道、RGB 三通道累计 MSE。
 * 两张图尺寸必须一致。alpha 不参与。
 */
export function psnr(a: RgbaImage, b: RgbaImage): { psnrDb: number; mse: number } {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`PSNR 输入尺寸不一致: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  let sum = 0;
  const n = a.width * a.height * 3;
  for (let p = 0; p < a.width * a.height; p++) {
    const i = p * 4;
    const dr = a.data[i] - b.data[i];
    const dg = a.data[i + 1] - b.data[i + 1];
    const db = a.data[i + 2] - b.data[i + 2];
    sum += dr * dr + dg * dg + db * db;
  }
  const mse = sum / n;
  if (mse === 0) return { psnrDb: Infinity, mse: 0 };
  return { psnrDb: 10 * Math.log10((255 * 255) / mse), mse };
}

/** 分区掩码：0=线条 1=平涂 2=背景。与 GPU 端 classify.glsl 的判定口径保持一致 */
export type RegionId = 0 | 1 | 2;

export function classifyRegions(
  img: RgbaImage,
  inkThreshold: number,
  flatThreshold: number,
): Uint8Array {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h);
  const lum = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (lum[p] < inkThreshold) {
        mask[p] = 0; // 线条
        continue;
      }
      // 3x3 邻域最大色差
      let maxDist = 0;
      const cx = data[p * 4], cy = data[p * 4 + 1], cz = data[p * 4 + 2];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = (ny * w + nx) * 4;
          const d = rgbDistance([cx, cy, cz], [data[ni], data[ni + 1], data[ni + 2]]);
          if (d > maxDist) maxDist = d;
        }
      }
      mask[p] = maxDist < flatThreshold ? 1 : 2; // 平涂 / 背景
    }
  }
  return mask;
}

/** 把 SD 尺寸的分区掩码放大到 4K（最近邻即可，仅用于分区 PSNR 统计） */
export function upscaleMaskNearest(mask: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
      out[y * dw + x] = mask[sy * sw + sx];
    }
  }
  return out;
}

/** 按分区掩码分别统计 PSNR */
export function psnrByRegion(
  a: RgbaImage,
  b: RgbaImage,
  regionMask: Uint8Array,
): { line: number; flat: number; background: number; counts: [number, number, number] } {
  const sums = [0, 0, 0];
  const counts = [0, 0, 0];
  for (let p = 0; p < a.width * a.height; p++) {
    const r = regionMask[p];
    const i = p * 4;
    const dr = a.data[i] - b.data[i];
    const dg = a.data[i + 1] - b.data[i + 1];
    const db = a.data[i + 2] - b.data[i + 2];
    sums[r] += dr * dr + dg * dg + db * db;
    counts[r] += 3;
  }
  const mses = sums.map((s, idx) => (counts[idx] ? s / counts[idx] : 0));
  const toDb = (mse: number) => (mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse));
  return {
    line: toDb(mses[0]),
    flat: toDb(mses[1]),
    background: toDb(mses[2]),
    counts: [counts[0] / 3, counts[1] / 3, counts[2] / 3] as [number, number, number],
  };
}

export async function imageToBlob(img: RgbaImage): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

export async function blobToImage(blob: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: bitmap.width,
      height: bitmap.height,
      data: new Uint8ClampedArray(imageData.data),
    };  } finally {
    bitmap.close();
  }
}

export async function imageToBitmap(img: RgbaImage): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  canvas.getContext('2d')!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return createImageBitmap(canvas);
}
