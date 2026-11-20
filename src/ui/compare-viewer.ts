/**
 * 放大结果与原帧的叠画比对查看器。
 * 三种模式：
 *   blink    定时闪烁切换（模拟剪辑台 flicker 比对，帧间线宽漂移一眼可见）
 *   wipe     拖动滑块，左右分别显示原图/结果
 *   diff     像素差值放大显示（色差 ×4），光晕/毛刺位置高亮
 * 原图（SD）会用双线性放大显示到与结果相同的显示尺寸，保证逐像素对齐。
 */

export type CompareMode = 'blink' | 'wipe' | 'diff';

export class CompareViewer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private source: ImageBitmap | null = null;
  private result: ImageBitmap | null = null;
  private mode: CompareMode = 'blink';
  private blinkShowingResult = true;
  private blinkTimer: number | null = null;
  private blinkIntervalMs = 350;
  private wipePos = 0.5;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private diffGain = 4;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'compare-canvas';
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D 画布初始化失败');
    this.ctx = ctx;
    this.bindEvents();
    this.startBlink();
  }

  private bindEvents(): void {
    const onMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (this.mode === 'wipe' && this.dragging) {
        this.wipePos = Math.min(1, Math.max(0, x / rect.width));
        this.render();
      } else if (this.mode !== 'wipe' && this.dragging) {
        this.panX += e.movementX;
        this.panY += e.movementY;
        this.render();
      }
    };
    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      onMove(e);
    });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.zoom = Math.min(8, Math.max(0.25, this.zoom * factor));
      this.render();
    }, { passive: false });
  }

  setImages(source: ImageBitmap | null, result: ImageBitmap | null): void {
    this.source?.close();
    this.result?.close();
    this.source = source;
    this.result = result;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.render();
  }

  setMode(mode: CompareMode): void {
    this.mode = mode;
    this.render();
  }

  setBlinkInterval(ms: number): void {
    this.blinkIntervalMs = ms;
    this.startBlink();
  }

  setDiffGain(gain: number): void {
    this.diffGain = gain;
    if (this.mode === 'diff') this.render();
  }

  private startBlink(): void {
    if (this.blinkTimer !== null) window.clearInterval(this.blinkTimer);
    this.blinkTimer = window.setInterval(() => {
      this.blinkShowingResult = !this.blinkShowingResult;
      if (this.mode === 'blink') this.render();
    }, this.blinkIntervalMs);
  }

  /** 主渲染：按当前模式绘制 */
  render(): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w * devicePixelRatio || this.canvas.height !== h * devicePixelRatio) {
      this.canvas.width = w * devicePixelRatio;
      this.canvas.height = h * devicePixelRatio;
    }
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = '#111318';
    ctx.fillRect(0, 0, w, h);
    if (!this.result) {
      ctx.fillStyle = '#7a8290';
      ctx.font = '14px system-ui';
      ctx.fillText('暂无放大结果，请先处理当前帧', 24, 32);
      return;
    }

    const baseW = this.result.width;
    const baseH = this.result.height;
    const fit = Math.min(w / baseW, h / baseH) * this.zoom;
    const drawW = baseW * fit;
    const drawH = baseH * fit;
    const dx = (w - drawW) / 2 + this.panX;
    const dy = (h - drawH) / 2 + this.panY;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (this.mode === 'diff') {
      this.drawDiff(dx, dy, drawW, drawH);
      this.drawLabel('差值视图（色差 ×' + this.diffGain + '）', dx, dy);
      return;
    }

    if (this.mode === 'blink') {
      const img = this.blinkShowingResult ? this.result : this.source;
      if (img) ctx.drawImage(img, dx, dy, drawW, drawH);
      this.drawLabel(this.blinkShowingResult ? '放大结果 4K' : '原始标清帧（放大显示）', dx, dy);
      return;
    }

    // wipe：左结果、右原图，分界可拖
    if (this.source) ctx.drawImage(this.source, dx, dy, drawW, drawH);
    const clipW = drawW * this.wipePos;
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, clipW, drawH);
    ctx.clip();
    ctx.drawImage(this.result, dx, dy, drawW, drawH);
    ctx.restore();
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dx + clipW, dy);
    ctx.lineTo(dx + clipW, dy + drawH);
    ctx.stroke();
    this.drawLabel(`滑块比对（左：结果 / 右：原图）分界 ${(this.wipePos * 100).toFixed(0)}%`, dx, dy);
  }

  private drawDiff(dx: number, dy: number, dw: number, dh: number): void {
    if (!this.source || !this.result) return;
    // 离屏计算差值：把 SD 原图先双线性放大到结果尺寸
    const off = document.createElement('canvas');
    off.width = this.result.width;
    off.height = this.result.height;
    const octx = off.getContext('2d')!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(this.source, 0, 0, off.width, off.height);
    const a = octx.getImageData(0, 0, off.width, off.height);
    const b = octx.createImageData(off.width, off.height);
    // 直接把 result 画到第二个 canvas 再取像素
    const off2 = document.createElement('canvas');
    off2.width = this.result.width;
    off2.height = this.result.height;
    off2.getContext('2d')!.drawImage(this.result, 0, 0);
    const bData = off2.getContext('2d')!.getImageData(0, 0, off2.width, off2.height);
    for (let p = 0; p < a.data.length; p += 4) {
      b.data[p] = Math.min(255, Math.abs(a.data[p] - bData.data[p]) * this.diffGain);
      b.data[p + 1] = Math.min(255, Math.abs(a.data[p + 1] - bData.data[p + 1]) * this.diffGain);
      b.data[p + 2] = Math.min(255, Math.abs(a.data[p + 2] - bData.data[p + 2]) * this.diffGain);
      b.data[p + 3] = 255;
    }
    octx.putImageData(b, 0, 0);
    this.ctx.drawImage(off, dx, dy, dw, dh);
  }

  private drawLabel(text: string, dx: number, dy: number): void {
    this.ctx.font = '13px system-ui';
    const tw = this.ctx.measureText(text).width + 16;
    this.ctx.fillStyle = 'rgba(17,19,24,0.82)';
    this.ctx.fillRect(dx + 10, dy + 10, tw, 26);
    this.ctx.fillStyle = '#d7dde6';
    this.ctx.fillText(text, dx + 18, dy + 28);
  }

  dispose(): void {
    if (this.blinkTimer !== null) window.clearInterval(this.blinkTimer);
    this.source?.close();
    this.result?.close();
    this.canvas.remove();
  }
}
