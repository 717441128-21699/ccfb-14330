/**
 * 合成测试画面生成器。
 *
 * 流程：先在 4K 分辨率下逐像素合成“理想母版”（赛璐珞线稿+平涂 / 水彩背景），
 * 再用区域平均下采样得到标清输入，模拟八十年代只有 SD 母版的素材状况。
 * 放大管线的任务就是：SD -> 4K，尽量还原这个理想母版。
 *
 * 全部基于确定性 PRNG 与解析距离场，同种子逐帧可复现；
 * 赛璐珞层按 motionPhase 做亚像素平移，背景层保持静止（与真实制作一致）。
 */
import { clamp, clamp01, mulberry32, smoothstep } from './math';
import { createImage, downsampleBox, RgbaImage, setPx } from './image';
import { SyntheticSceneSpec } from '../types';

export interface SyntheticScene {
  /** 4K 理想母版（线稿+平涂+背景的完整合成） */
  composite: RgbaImage;
  /** 仅水彩背景层（无赛璐珞） */
  background: RgbaImage;
  /** 赛璐珞层（RGBA，alpha=0 处透明） */
  cel: RgbaImage;
  /** 4K 分区真值：0=线条 1=平涂 2=背景 */
  regions: Uint8Array;
}

interface Vec2 {
  x: number;
  y: number;
}

/* ---------------- 距离场基元（解析式，天然抗锯齿） ---------------- */

function sdSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = clamp01(len2 === 0 ? 0 : (wx * vx + wy * vy) / len2);
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return Math.sqrt(dx * dx + dy * dy);
}

function sdCircle(p: Vec2, c: Vec2, r: number): number {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return Math.sqrt(dx * dx + dy * dy) - r;
}

/** 平滑覆盖率：d 在 halfW 内为 1，边界 1px 软化 */
function strokeCoverage(d: number, halfW: number, soft = 0.75): number {
  return 1 - smoothstep(halfW - soft, halfW + soft, d);
}

/* ---------------- 值噪声（纸纹 / 水彩边缘） ----------------
 * 整数哈希 + 低频网格预计算 + 双线性插值：
 * 逐像素只做网格查表，避免在热循环里调用字符串哈希，整帧生成毫秒级完成。
 */

function intHash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function latticeRand(seed: number, ix: number, iy: number): number {
  return intHash(ix, iy, seed) / 4294967296;
}

/** 预计算的分形噪声网格，sample 时双线性插值 */
class FbmField {
  private grid: Float32Array;
  constructor(
    private seed: number,
    private gw: number,
    private gh: number,
    private octaves: number,
  ) {
    this.grid = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        this.grid[y * gw + x] = this.computeFbm(x, y);
      }
    }
  }

  private computeFbm(x: number, y: number): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < this.octaves; o++) {
      const gx = x * freq;
      const gy = y * freq;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const v00 = latticeRand(this.seed + o * 1013, ix, iy);
      const v10 = latticeRand(this.seed + o * 1013, ix + 1, iy);
      const v01 = latticeRand(this.seed + o * 1013, ix, iy + 1);
      const v11 = latticeRand(this.seed + o * 1013, ix + 1, iy + 1);
      const top = v00 + (v10 - v00) * sx;
      const bot = v01 + (v11 - v01) * sx;
      sum += (top + (bot - top) * sy) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** 按连续坐标采样（网格外 clamp） */
  sample(x: number, y: number): number {
    const gx = clamp(x, 0, this.gw - 1.0001);
    const gy = clamp(y, 0, this.gh - 1.0001);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const i00 = this.grid[iy * this.gw + ix];
    const i10 = this.grid[iy * this.gw + ix + 1];
    const i01 = this.grid[(iy + 1) * this.gw + ix];
    const i11 = this.grid[(iy + 1) * this.gw + ix + 1];
    const top = i00 + (i10 - i00) * fx;
    const bot = i01 + (i11 - i01) * fx;
    return top + (bot - top) * fy;
  }
}

/* ---------------- 水彩背景 ---------------- */

interface Wash {
  c: Vec2;
  r: number;
  color: [number, number, number];
  alpha: number;
}

interface BrushStroke {
  a: Vec2;
  b: Vec2;
  width: number;
  color: [number, number, number];
  alpha: number;
  seed: number;
}

function buildBackground(seed: number, w: number, h: number): { img: RgbaImage } {
  const img = createImage(w, h);
  const rand = mulberry32(seed);
  const scale = w / 960; // 设计稿基于 960 宽坐标，等比缩放到实际分辨率

  // 大块水彩晕染：软边径向色块
  const washes: Wash[] = [];
  for (let i = 0; i < 5; i++) {
    washes.push({
      c: { x: (0.15 + rand() * 0.7) * w, y: (0.15 + rand() * 0.7) * h },
      r: (0.18 + rand() * 0.22) * w,
      color: [
        120 + rand() * 80,
        130 + rand() * 70,
        160 + rand() * 70,
      ],
      alpha: 0.10 + rand() * 0.12,
    });
  }

  // 毛笔笔触：带噪声宽度调制的宽笔触，保留明显笔痕
  const strokes: BrushStroke[] = [];
  for (let i = 0; i < 7; i++) {
    strokes.push({
      a: { x: rand() * w, y: rand() * h },
      b: { x: rand() * w, y: rand() * h },
      width: (10 + rand() * 26) * scale,
      color: [90 + rand() * 60, 80 + rand() * 50, 70 + rand() * 40],
      alpha: 0.10 + rand() * 0.16,
      seed: Math.floor(rand() * 1e9),
    });
  }

  const paperBase: [number, number, number] = [238, 232, 218];
  const grainCell = 3.2 * scale; // 纸纹颗粒尺度（4K 下约 3px）

  // 预计算噪声网格（覆盖全图 + 八度上采样余量），逐像素只做双线性查表
  const grainField = new FbmField(seed, Math.ceil(w / grainCell) + 2, Math.ceil(h / grainCell) + 2, 3);
  const fiberField = new FbmField(seed + 77, Math.ceil(w / (42 * scale)) + 2, Math.ceil(h / (42 * scale)) + 2, 2);
  const washField = new FbmField(seed + 3, Math.ceil(w / (60 * scale)) + 2, Math.ceil(h / (60 * scale)) + 2, 2);
  const strokeFields = strokes.map(
    (s) => new FbmField(s.seed, Math.ceil(w / (18 * scale)) + 2, Math.ceil(h / (18 * scale)) + 2, 2),
  );

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = paperBase[0];
      let g = paperBase[1];
      let b = paperBase[2];

      // 纸纹：细颗粒 + 低频起伏（幅度刻意加大，与赛璐珞平涂的零纹理形成明确对照）
      const grain = grainField.sample(x / grainCell, y / grainCell); // 0~1
      const fiber = fiberField.sample(x / (42 * scale), y / (42 * scale));
      const grainDelta = (grain - 0.5) * 22 + (fiber - 0.5) * 14;
      r += grainDelta;
      g += grainDelta * 0.95;
      b += grainDelta * 0.85;

      // 水彩晕染（软边 + 轻微噪声扰动边缘）
      for (let wi = 0; wi < washes.length; wi++) {
        const wash = washes[wi];
        const dx = x - wash.c.x;
        const dy = y - wash.c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const edgeNoise = (washField.sample(x / (60 * scale), y / (60 * scale)) - 0.5) * 24 * scale;
        const t = clamp01(1 - smoothstep(wash.r * 0.55, wash.r + edgeNoise, d));
        const a = t * wash.alpha;
        r += (wash.color[0] - r) * a;
        g += (wash.color[1] - g) * a;
        b += (wash.color[2] - b) * a;
      }

      // 毛笔笔触：宽度受噪声调制，边缘粗糙，模拟笔锋
      for (let si = 0; si < strokes.length; si++) {
        const s = strokes[si];
        const d = sdSegment({ x, y }, s.a, s.b);
        const wobble = (strokeFields[si].sample(x / (18 * scale), y / (18 * scale)) - 0.5) * s.width * 0.35;
        const cov = strokeCoverage(d + wobble, s.width / 2, 1.2 * scale) * s.alpha;
        r += (s.color[0] - r) * cov;
        g += (s.color[1] - g) * cov;
        b += (s.color[2] - b) * cov;
      }

      setPx(img, x, y, clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255), 255);
    }
  }
  return { img };
}

/* ---------------- 赛璐珞层 ---------------- */

interface CelShape {
  kind: 'flatCircle' | 'flatPoly';
  c: Vec2;
  r: number;
  fill: [number, number, number];
  /** 轮廓线宽（4K 像素），0 表示无轮廓 */
  outline: number;
  /** 线宽随角度的起伏幅度，模拟画师手上轻重 */
  pressureAmp: number;
}

export interface CelDesign {
  shapes: CelShape[];
  /** 双线压力测试：一对近距离平行圆弧，验证放大后不糊成一根 */
  parallelArcs: { c: Vec2; r1: number; r2: number; width: number; a0: number; a1: number }[];
  /** 自由线段（手画线，带宽度起伏） */
  strokes: { a: Vec2; b: Vec2; width: number; seed: number }[];
}

/** 标准测试场景设计稿（960 坐标系，乘以 scale 适配实际宽度） */
function designCel(scale: number): CelDesign {
  const s = scale;
  const shapes: CelShape[] = [
    // 大圆：平涂红 + 随角度变宽的墨线
    {
      kind: 'flatCircle',
      c: { x: 330 * s, y: 300 * s },
      r: 150 * s,
      fill: [228, 92, 78],
      outline: 13 * s,
      pressureAmp: 4.5 * s,
    },
    // 小圆：平涂蓝，细线
    {
      kind: 'flatCircle',
      c: { x: 660 * s, y: 180 * s },
      r: 78 * s,
      fill: [86, 132, 206],
      outline: 9 * s,
      pressureAmp: 2.5 * s,
    },
    // 黄色块：无轮廓的纯平涂，检验色块内绝对均匀
    {
      kind: 'flatCircle',
      c: { x: 700 * s, y: 420 * s },
      r: 95 * s,
      fill: [238, 206, 110],
      outline: 0,
      pressureAmp: 0,
    },
  ];

  const parallelArcs = [
    {
      c: { x: 170 * s, y: 430 * s },
      r1: 96 * s,
      // 线宽 10px、净间距 12px（4K），SD 下约 2.5px 间距 —— 最容易被糊成一根的压力 case
      r2: 96 * s + 22 * s,
      width: 10 * s,
      a0: -0.9,
      a1: 1.4,
    },
  ];

  const strokes = [
    { a: { x: 470 * s, y: 470 * s }, b: { x: 880 * s, y: 500 * s }, width: 8 * s, seed: 11 },
    { a: { x: 120 * s, y: 140 * s }, b: { x: 420 * s, y: 90 * s }, width: 6 * s, seed: 22 },
  ];

  return { shapes, parallelArcs, strokes };
}

const INK: [number, number, number] = [26, 23, 30];

function renderCel(design: CelDesign, w: number, h: number, offset: Vec2): { cel: RgbaImage; regions: Uint8Array } {
  const cel = createImage(w, h);
  const regions = new Uint8Array(w * h).fill(2); // 默认背景
  const { data } = cel;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p: Vec2 = { x: x - offset.x, y: y - offset.y };
      let fillCov = 0;
      let fillColor: [number, number, number] = [0, 0, 0];
      let inkCov = 0;

      for (const shape of design.shapes) {
        const d = sdCircle(p, shape.c, shape.r);
        const inside = 1 - smoothstep(-0.75, 0.75, d);
        if (inside > fillCov) {
          fillCov = inside;
          fillColor = shape.fill;
        }
        if (shape.outline > 0) {
          const theta = Math.atan2(p.y - shape.c.y, p.x - shape.c.x);
          const localHalf = (shape.outline + shape.pressureAmp * Math.sin(theta * 3 + 0.6)) / 2;
          const cov = strokeCoverage(Math.abs(d), localHalf, 0.75);
          if (cov > inkCov) inkCov = cov;
        }
      }

      // 平行圆弧
      for (const arc of design.parallelArcs) {
        const dx = p.x - arc.c.x;
        const dy = p.y - arc.c.y;
        const theta = Math.atan2(dy, dx);
        if (theta >= arc.a0 && theta <= arc.a1) {
          const d1 = Math.abs(Math.sqrt(dx * dx + dy * dy) - arc.r1);
          const d2 = Math.abs(Math.sqrt(dx * dx + dy * dy) - arc.r2);
          inkCov = Math.max(inkCov, strokeCoverage(d1, arc.width / 2, 0.75));
          inkCov = Math.max(inkCov, strokeCoverage(d2, arc.width / 2, 0.75));
        }
      }

      // 自由笔触（宽度沿路径起伏）
      for (const st of design.strokes) {
        const d = sdSegment(p, st.a, st.b);
        const vx = st.b.x - st.a.x;
        const vy = st.b.y - st.a.y;
        const t = clamp01((p.x - st.a.x) * vx + (p.y - st.a.y) * vy) / Math.max(1, vx * vx + vy * vy);
        const wobble = Math.sin(t * Math.PI * 4 + st.seed) * st.width * 0.18;
        inkCov = Math.max(inkCov, strokeCoverage(d, (st.width + wobble) / 2, 0.75));
      }

      if (fillCov <= 0.001 && inkCov <= 0.001) continue;

      const i = (y * w + x) * 4;
      // 先平涂、再墨线覆盖（赛璐珞实际工艺：线稿在色层之上）
      let r = 0, g = 0, b = 0, a = 0;
      if (fillCov > 0) {
        r = fillColor[0];
        g = fillColor[1];
        b = fillColor[2];
        a = fillCov * 255;
      }
      if (inkCov > 0) {
        r = r * (1 - inkCov) + INK[0] * inkCov;
        g = g * (1 - inkCov) + INK[1] * inkCov;
        b = b * (1 - inkCov) + INK[2] * inkCov;
        a = Math.max(a, inkCov * 255);
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;

      // 分区真值：墨线覆盖过半算线条；否则有填充算平涂
      const pid = y * w + x;
      if (inkCov >= 0.5) regions[pid] = 0;
      else if (fillCov >= 0.5) regions[pid] = 1;
    }
  }
  return { cel, regions };
}

/** 合成完整场景（默认 4K 尺寸） */
export function generateSyntheticScene(spec: SyntheticSceneSpec): SyntheticScene {
  const { width: w, height: h, seed, motionPhase, includeBackground, includeCel } = spec;
  const scale = w / 960;

  const background = includeBackground
    ? buildBackground(seed, w, h).img
    : createImage(w, h);
  if (!includeBackground) {
    background.data.fill(255);
    for (let p = 0; p < w * h; p++) background.data[p * 4 + 3] = 255;
  }

  const design = designCel(scale);
  const offset: Vec2 = { x: motionPhase, y: motionPhase * 0.35 };
  const rendered = includeCel ? renderCel(design, w, h, offset) : { cel: createImage(w, h), regions: new Uint8Array(w * h).fill(2) };

  // 合成 cel 到背景
  const composite = createImage(w, h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const a = rendered.cel.data[i + 3] / 255;
    composite.data[i] = rendered.cel.data[i] * a + background.data[i] * (1 - a);
    composite.data[i + 1] = rendered.cel.data[i + 1] * a + background.data[i + 1] * (1 - a);
    composite.data[i + 2] = rendered.cel.data[i + 2] * a + background.data[i + 2] * (1 - a);
    composite.data[i + 3] = 255;
  }

  return { composite, background, cel: rendered.cel, regions: rendered.regions };
}

/**
 * 完整测试素材：4K 理想母版 + 下采样后的标清输入。
 * sdW/sdH 必须能整除 4K 尺寸。
 */
export function generateSdMaster(
  spec: SyntheticSceneSpec,
  sdW: number,
  sdH: number,
): { scene: SyntheticScene; sd: RgbaImage } {
  const scene = generateSyntheticScene(spec);
  const sd = downsampleBox(scene.composite, sdW, sdH);
  return { scene, sd };
}
