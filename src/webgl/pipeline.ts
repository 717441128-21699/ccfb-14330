/**
 * 赛璐珞放大 WebGL2 管线。
 *
 * pass 编排（输入 SD 纹理 srcTex）：
 *   A classify    SD 尺寸：分区 + 墨线覆盖率            -> maskA
 *   B dilate      SD 尺寸：线掩码膨胀 ×N（ping-pong）   -> maskA/maskB
 *   C lanczos_h/v 4K 尺寸：可分离 Lanczos3 放大         -> lzH -> lz4k
 *   D composite   4K 尺寸：线/平涂/背景分区合成          -> out4k
 *
 * 所有 pass 对同一输入 + 同一参数产生逐位一致输出（shader 无随机量），
 * 这是整镜批量处理不产生帧间闪烁的基础。
 */
import { PipelineMetrics, UpscaleParams } from '../types';
import { createFullscreenVao, createGlContext, createProgram, GlContext, Program, RenderTarget, uniform } from './gl-utils';
import vertSource from './shaders/fullscreen.vert.glsl?raw';
import classifySource from './shaders/classify.frag.glsl?raw';
import dilateSource from './shaders/dilate.frag.glsl?raw';
import lanczosHSource from './shaders/lanczos_h.frag.glsl?raw';
import lanczosVSource from './shaders/lanczos_v.frag.glsl?raw';
import compositeSource from './shaders/composite.frag.glsl?raw';

export interface UpscaleResult {
  /** 4K 输出纹理（调用方可直接绘制到画布做预览，禁止自行 delete） */
  texture: WebGLTexture;
  width: number;
  height: number;
  metrics: PipelineMetrics;
}

export class UpscalePipeline {
  private ctx: GlContext;
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private classifyProg: Program;
  private dilateProg: Program;
  private lanczosHProg: Program;
  private lanczosVProg: Program;
  private compositeProg: Program;

  private maskA: RenderTarget;
  private maskB: RenderTarget;
  private lzH: RenderTarget;
  private lz4k: RenderTarget;
  private out4k: RenderTarget;
  private srcTexture: WebGLTexture;
  private srcWidth = 0;
  private srcHeight = 0;

  private pendingQuery: WebGLQuery | null = null;
  private lastGpuMs: number | null = null;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.ctx = createGlContext(canvas);
    this.gl = this.ctx.gl;
    this.vao = createFullscreenVao(this.gl);
    this.classifyProg = createProgram(this.gl, vertSource, classifySource);
    this.dilateProg = createProgram(this.gl, vertSource, dilateSource);
    this.lanczosHProg = createProgram(this.gl, vertSource, lanczosHSource);
    this.lanczosVProg = createProgram(this.gl, vertSource, lanczosVSource);
    this.compositeProg = createProgram(this.gl, vertSource, compositeSource);

    this.maskA = new RenderTarget(this.gl);
    this.maskB = new RenderTarget(this.gl);
    this.lzH = new RenderTarget(this.gl);
    this.lz4k = new RenderTarget(this.gl);
    this.out4k = new RenderTarget(this.gl);

    const tex = this.gl.createTexture();
    if (!tex) throw new Error('源纹理分配失败');
    this.srcTexture = tex;
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  }

  get supportsGpuTimer(): boolean {
    return this.ctx.timerExt !== null;
  }

  /**
   * 直接上传 RGBA 像素缓冲（推荐路径）：绕开 ImageBitmap 的内部格式/色彩空间转换。
   * 开启 UNPACK_FLIP_Y：像素缓冲顶行（图像顶行）进入纹理 t=1，
   * 使全屏 vUv.y=1（屏幕顶）采到图像顶行，FBO 方向与图像一致。
   * 配套 readPixels 不再翻转（FBO 顶行即图像顶行，readPixels 底先行正好给出顶先行）。
   */
  uploadSourcePixels(width: number, height: number, rgba: Uint8ClampedArray<ArrayBuffer>): { width: number; height: number } {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    this.srcWidth = width;
    this.srcHeight = height;
    return { width, height };
  }

  private beginQuery(): WebGLQuery | null {
    const ext = this.ctx.timerExt;
    if (!ext) return null;
    const q = this.gl.createQuery();
    if (!q) return null;
    this.gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    return q;
  }

  /** 取上一帧 GPU 时间（查询结果隔帧可用，避免同步停顿） */
  private collectLastQuery(): number | null {
    const ext = this.ctx.timerExt;
    if (!ext || !this.pendingQuery) return null;
    const available = this.gl.getQueryParameter(this.pendingQuery, this.gl.QUERY_RESULT_AVAILABLE);
    const disjoint = this.gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (available && !disjoint) {
      const ns = this.gl.getQueryParameter(this.pendingQuery, this.gl.QUERY_RESULT) as number;
      this.gl.deleteQuery(this.pendingQuery);
      this.pendingQuery = null;
      return ns / 1e6;
    }
    if (available) {
      this.gl.deleteQuery(this.pendingQuery);
      this.pendingQuery = null;
    }
    return null;
  }

  private drawTo(target: RenderTarget): void {
    target.bind();
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  /**
   * 执行完整放大管线。
   * 调用前需先 uploadSourcePixels()。结果纹理与计时通过返回值给出。
   */
  upscale(params: UpscaleParams): UpscaleResult {
    const gl = this.gl;
    const sw = this.srcWidth;
    const sh = this.srcHeight;
    if (sw === 0 || sh === 0) {
      throw new Error('尚未上传源帧，请先调用 uploadSourcePixels()');
    }
    const dw = Math.round(sw * params.scale);
    const dh = Math.round(sh * params.scale);

    this.maskA.ensureSize(sw, sh);
    this.maskB.ensureSize(sw, sh);
    this.lzH.ensureSize(dw, sh);
    this.lz4k.ensureSize(dw, dh);
    this.out4k.ensureSize(dw, dh);

    const cpuStart = performance.now();
    const query = this.beginQuery();
    gl.bindVertexArray(this.vao);

    // ---- Pass A：分类 ----
    gl.useProgram(this.classifyProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    gl.uniform1i(uniform(this.classifyProg, gl, 'uColor'), 0);
    gl.uniform1f(uniform(this.classifyProg, gl, 'uInkThreshold'), params.inkThreshold / 255);
    gl.uniform1f(uniform(this.classifyProg, gl, 'uFlatThreshold'), params.flatThreshold / 255);
    this.drawTo(this.maskA);

    // ---- Pass B：线掩码膨胀（lineDilateRadius 次，ping-pong） ----
    gl.useProgram(this.dilateProg.program);
    let current = this.maskA;
    let other = this.maskB;
    const iters = Math.max(0, Math.round(params.lineDilateRadius));
    for (let i = 0; i < iters; i++) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, current.texture);
      gl.uniform1i(uniform(this.dilateProg, gl, 'uMask'), 0);
      this.drawTo(other);
      [current, other] = [other, current];
    }
    const finalMask = current;

    // ---- Pass C：Lanczos3 可分离放大 ----
    gl.useProgram(this.lanczosHProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    gl.uniform1i(uniform(this.lanczosHProg, gl, 'uColor'), 0);
    gl.uniform1f(uniform(this.lanczosHProg, gl, 'uScale'), params.scale);
    gl.uniform1f(uniform(this.lanczosHProg, gl, 'uKernel'), params.upscaleKernel);
    this.drawTo(this.lzH);

    gl.useProgram(this.lanczosVProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.lzH.texture);
    gl.uniform1i(uniform(this.lanczosVProg, gl, 'uColor'), 0);
    gl.uniform1f(uniform(this.lanczosVProg, gl, 'uScale'), params.scale);
    gl.uniform1f(uniform(this.lanczosVProg, gl, 'uKernel'), params.upscaleKernel);
    this.drawTo(this.lz4k);

    // ---- Pass D：分区合成 ----
    gl.useProgram(this.compositeProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    gl.uniform1i(uniform(this.compositeProg, gl, 'uColor'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lz4k.texture);
    gl.uniform1i(uniform(this.compositeProg, gl, 'uLanczos'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, finalMask.texture);
    gl.uniform1i(uniform(this.compositeProg, gl, 'uMask'), 2);
    gl.uniform1f(uniform(this.compositeProg, gl, 'uLineSoftness'), params.lineSoftness);
    gl.uniform1f(uniform(this.compositeProg, gl, 'uRegionFeather'), params.regionFeather);
    gl.uniform1f(uniform(this.compositeProg, gl, 'uTextureSharpen'), params.textureSharpen);
    gl.uniform1f(uniform(this.compositeProg, gl, 'uFlatLevels'), params.flatLevels);
    gl.uniform1f(uniform(this.compositeProg, gl, 'uScale'), params.scale);
    this.drawTo(this.out4k);

    gl.flush();
    const cpuElapsed = performance.now() - cpuStart;
    if (query) {
      gl.endQuery(this.ctx.timerExt!.TIME_ELAPSED_EXT);
      if (this.pendingQuery) this.gl.deleteQuery(this.pendingQuery);
      this.pendingQuery = query;
    }
    const gpuMs = this.collectLastQuery() ?? this.lastGpuMs ?? cpuElapsed;
    this.lastGpuMs = gpuMs;

    return {
      texture: this.out4k.texture,
      width: dw,
      height: dh,
      metrics: {
        elapsedMs: gpuMs,
        upscaleMs: gpuMs,
        outputWidth: dw,
        outputHeight: dh,
      },
    };
  }

  /**
   * 把 4K 输出读回到 CPU（ImageData 顶先行顺序）。
   * 上传开了 UNPACK_FLIP_Y，使 FBO 顶行 = 图像顶行；
   * 但 readPixels 按 FBO 自底向上返回（首元素是 FBO 底行 = 图像底行），
   * 而 ImageData/putImageData 需要顶先行，因此这里做一次行翻转。
   */
  readPixels(): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
    const gl = this.gl;
    const { width, height } = this.out4k;
    const raw = new Uint8Array(width * height * 4);
    this.out4k.bind();
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const flipped = new Uint8ClampedArray(new ArrayBuffer(raw.length));
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
      const srcStart = (height - 1 - y) * rowBytes;
      flipped.set(raw.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
    }
    return { width, height, data: flipped };
  }

  /** 直接把 4K 结果 blit 到默认帧缓冲（画布预览，省一次读回） */
  blitToCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    const gl = this.gl;
    canvas.width = this.out4k.width;
    canvas.height = this.out4k.height;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.out4k.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0, 0, this.out4k.width, this.out4k.height,
      0, 0, canvas.width, canvas.height,
      gl.COLOR_BUFFER_BIT, gl.LINEAR,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    const gl = this.gl;
    [this.maskA, this.maskB, this.lzH, this.lz4k, this.out4k].forEach((t) => t.dispose());
    gl.deleteTexture(this.srcTexture);
    if (this.pendingQuery) gl.deleteQuery(this.pendingQuery);
  }
}
