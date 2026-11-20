/**
 * 应用服务层：素材合成、单帧/批量放大、结果落库。
 * 一个 PipelineService 实例持有一张离屏画布与一条 WebGL2 管线，
 * 整镜批量复用同一 GL 上下文，避免逐帧重建 shader。
 */
import { DEFAULT_PARAMS, FrameRecord, PipelineMetrics, ShotRecord, SyntheticSceneSpec, UpscaleParams } from '../types';
import { generateSdMaster, SyntheticScene } from '../core/synthetic';
import { blobToImage, imageToBlob, RgbaImage } from '../core/image';
import { UpscalePipeline } from '../webgl/pipeline';
import { putFrame, StoredFrame } from '../db/db';

export interface BatchProgress {
  done: number;
  total: number;
  currentFrameId: string;
  metrics: PipelineMetrics | null;
}

export interface ProcessResult {
  frame: StoredFrame;
  metrics: PipelineMetrics;
}

export class PipelineService {
  private canvas: OffscreenCanvas | null = null;
  private pipeline: UpscalePipeline | null = null;
  private initError: Error | null = null;

  /** 懒初始化：构造时不碰 GPU，首次使用时才建上下文，避免初始化失败拖垮整个 UI */
  private ensure(): UpscalePipeline {
    if (this.initError) throw this.initError;
    if (!this.pipeline) {
      try {
        this.canvas = new OffscreenCanvas(64, 64);
        this.pipeline = new UpscalePipeline(this.canvas);
      } catch (err) {
        this.initError = err as Error;
        throw err;
      }
    }
    return this.pipeline;
  }

  get initErrorMessage(): string | null {
    return this.initError?.message ?? null;
  }

  get gpuTimerSupported(): boolean {
    return this.pipeline?.supportsGpuTimer ?? false;
  }

  /**
   * 为一个镜头合成 count 帧测试素材（4K 母版 -> 盒式下采样 SD），
   * SD 帧落库；4K 母版仅保留在返回值里供测试/真值比对，不入库。
   */
  async synthesizeShotFrames(
    shotId: string,
    count: number,
    sdW: number,
    sdH: number,
    scale: number,
    seed: number,
  ): Promise<{ frames: StoredFrame[]; references: Map<string, SyntheticScene> }> {
    const references = new Map<string, SyntheticScene>();
    const frames: StoredFrame[] = [];
    for (let i = 0; i < count; i++) {
      const spec: SyntheticSceneSpec = {
        seed,
        width: sdW * scale,
        height: sdH * scale,
        // 亚像素级运动：整镜头位移连续，用于检验帧间线宽稳定性
        motionPhase: i * 0.75,
        includeBackground: true,
        includeCel: true,
      };
      const { scene, sd } = generateSdMaster(spec, sdW, sdH);
      const sourceBlob = await imageToBlob(sd);
      const frame: StoredFrame = {
        shotId,
        id: `frame_${shotId}_${i.toString(3).padStart(3, '0')}`,
        index: i,
        sourceBlob,
        width: sdW,
        height: sdH,
        targetWidth: sdW * scale,
        targetHeight: sdH * scale,
      };
      await putFrame(frame);
      frames.push(frame);
      references.set(frame.id, scene);
    }
    return { frames, references };
  }

  /** 单帧处理：读库 -> GPU 放大 -> PNG 落库，返回更新后的帧记录与计时 */
  async processFrame(frame: StoredFrame, params: UpscaleParams): Promise<ProcessResult> {
    if (!frame.sourceBlob) throw new Error(`帧 ${frame.id} 缺少源素材`);
    const srcImage = await blobToImage(frame.sourceBlob);
    let metrics: PipelineMetrics;
    let resultImage: RgbaImage;
    try {
      const pipeline = this.ensure();
      pipeline.uploadSourcePixels(srcImage.width, srcImage.height, srcImage.data);
      const result = pipeline.upscale(params);
      metrics = result.metrics;
      const pixels = pipeline.readPixels();
      resultImage = { width: pixels.width, height: pixels.height, data: pixels.data };
    } finally {
      // srcImage 为纯数据，无需释放位图句柄
    }
    const resultBlob = await imageToBlob(resultImage);
    const updated: StoredFrame = {
      ...frame,
      resultBlob,
      paramsSnapshot: { ...params },
      elapsedMs: metrics.elapsedMs,
      targetWidth: resultImage.width,
      targetHeight: resultImage.height,
    };
    await putFrame(updated);
    return { frame: updated, metrics };
  }

  /** 整镜批量：同一参数跑全部帧，逐帧回调进度 */
  async processShot(
    shot: ShotRecord,
    frames: StoredFrame[],
    onProgress?: (p: BatchProgress) => void,
  ): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];
    const total = frames.length;
    for (let i = 0; i < total; i++) {
      const r = await this.processFrame(frames[i], shot.params);
      results.push(r);
      onProgress?.({
        done: i + 1,
        total,
        currentFrameId: r.frame.id,
        metrics: r.metrics,
      });
    }
    return results;
  }

  /**
   * 不落库的纯计算处理，供测试/验收页直接拿 ImageData 做 PSNR 比对。
   * 输入 SD ImageData，输出 4K ImageData。
   */
  async upscaleImage(source: RgbaImage, params: UpscaleParams): Promise<{ image: RgbaImage; metrics: PipelineMetrics }> {
    const pipeline = this.ensure();
    pipeline.uploadSourcePixels(source.width, source.height, source.data);
    const result = pipeline.upscale(params);
    const pixels = pipeline.readPixels();
    return {
      image: { width: pixels.width, height: pixels.height, data: pixels.data },
      metrics: result.metrics,
    };
  }

  dispose(): void {
    this.pipeline?.dispose();
  }
}

export { DEFAULT_PARAMS };
export type { FrameRecord };
