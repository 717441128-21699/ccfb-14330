/**
 * 全局数据模型与放大参数定义。
 * 所有与 IndexedDB、UI、WebGL 管线共享的类型集中在此。
 */

/** 单帧素材：原图（标清）与放大结果（4K）都以 ImageBitmap 形式驻留/落库（Blob） */
export interface FrameRecord {
  id: string;
  /** 帧序号，决定镜头内排序与批量处理顺序 */
  index: number;
  /** 原始标清帧的 Blob（PNG），合成素材生成时写入 */
  sourceBlob?: Blob;
  /** 4K 放大结果 Blob（PNG），批量/单帧处理后写入 */
  resultBlob?: Blob;
  /** 放大时使用的参数快照，保证结果可复现 */
  paramsSnapshot?: UpscaleParams;
  /** 单帧处理耗时（毫秒，GPU 计时） */
  elapsedMs?: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
}

export interface ShotRecord {
  id: string;
  episodeId: string;
  /** 镜头号，如 "SC_012" */
  code: string;
  name: string;
  createdAt: number;
  /** 整镜统一的放大参数，单帧调参后可回写 */
  params: UpscaleParams;
  frames: FrameRecord[];
}

export interface EpisodeRecord {
  id: string;
  /** 集号，如 "EP_01" */
  code: string;
  title: string;
  createdAt: number;
}

/**
 * 放大管线的全部可调参数。
 * 同一参数 + 同一输入帧 => 逐位一致的输出（shader 内无随机量），
 * 这是“单帧调好、整镜批量”不产生帧间闪烁的前提。
 */
export interface UpscaleParams {
  /** 放大倍数（2/3/4/6/8），由目标分辨率与源分辨率推算，UI 也可直接选 */
  scale: number;
  /** 墨线判定：亮度低于该阈值的像素参与线条检测，0~255 */
  inkThreshold: number;
  /** 线区膨胀半径（SD 像素），把墨线抗锯齿边缘一并纳入线区，防止边缘毛刺 */
  lineDilateRadius: number;
  /** 线条锐度：覆盖度转 alpha 的软化宽度，越小越硬；保证线宽稳定而不是忽粗忽细 */
  lineSoftness: number;
  /** 平涂色块判定：邻域最大色差（0~255 欧氏距离）低于此值视为平涂 */
  flatThreshold: number;
  /** 平涂色块量化级数（每通道 0 表示不量化，>0 时按该级数取整，消除渐变带） */
  flatLevels: number;
  /** 背景纹理锐度：Lanczos3 与双线性的混合，0=双线性 1=纯 Lanczos3 */
  textureSharpen: number;
  /** 背景层判定阈值（局部色差高于此值归入水彩背景处理） */
  textureThreshold: number;
  /** 区域混合软化宽度（4K 像素），让线/平涂/背景三个分区之间没有硬接缝 */
  regionFeather: number;
  /** 放大核：0=Lanczos3（锐利、有轻微振铃），1=Mitchell(1/3,1/3)（无振铃、边缘更干净） */
  upscaleKernel: number;
}

export const DEFAULT_PARAMS: UpscaleParams = {
  scale: 4,
  inkThreshold: 92,
  lineDilateRadius: 1,
  lineSoftness: 0.12,
  flatThreshold: 10,
  flatLevels: 0,
  textureSharpen: 1.0,
  textureThreshold: 24,
  regionFeather: 2.5,
  upscaleKernel: 0,
};

/** 合成测试素材的描述：仿赛璐珞平涂 + 仿水彩背景 */
export interface SyntheticSceneSpec {
  /** 场景随机种子（使用确定性 PRNG，同种子逐帧结构一致、仅运动项变化） */
  seed: number;
  width: number;
  height: number;
  /** 帧在镜头内的运动相位（像素位移），用于检验帧间线宽稳定性 */
  motionPhase: number;
  /** 是否渲染水彩背景层 */
  includeBackground: boolean;
  /** 是否渲染赛璐珞线稿+平涂层 */
  includeCel: boolean;
}

export interface PipelineMetrics {
  /** 全管线 GPU 耗时（毫秒） */
  elapsedMs: number;
  /** 仅放大 pass 的耗时（毫秒） */
  upscaleMs: number;
  outputWidth: number;
  outputHeight: number;
}

/** PSNR 测试结果 */
export interface PsnrReport {
  psnrDb: number;
  mse: number;
  width: number;
  height: number;
  /** 分区 PSNR：线条、平涂、背景分别统计，便于定位是哪一层拖后腿 */
  linePsnrDb: number;
  flatPsnrDb: number;
  backgroundPsnrDb: number;
}
