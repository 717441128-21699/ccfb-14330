/**
 * 主应用控制器：集/镜头/帧三级素材管理 + 单帧调参 + 整镜批量 + 叠画比对。
 */
import { DEFAULT_PARAMS, EpisodeRecord, FrameRecord, ShotRecord, UpscaleParams } from '../types';
import * as db from '../db/db';
import { StoredFrame } from '../db/db';
import { PipelineService } from '../services/pipeline-service';
import { ParamPanel } from './param-panel';
import { CompareViewer, CompareMode } from './compare-viewer';
import { blobToImage, imageToBitmap } from '../core/image';
import { makeId } from '../core/math';

interface AppState {
  episodes: EpisodeRecord[];
  shots: ShotRecord[];
  frames: StoredFrame[];
  currentEpisodeId: string | null;
  currentShotId: string | null;
  currentFrameId: string | null;
  params: UpscaleParams;
  busy: boolean;
  progress: string;
  lastElapsedMs: number | null;
}

const SD_W = 240;
const SD_H = 135;
const FRAME_COUNT = 8;

export class RemasterApp {
  private state: AppState = {
    episodes: [],
    shots: [],
    frames: [],
    currentEpisodeId: null,
    currentShotId: null,
    currentFrameId: null,
    params: { ...DEFAULT_PARAMS },
    busy: false,
    progress: '',
    lastElapsedMs: null,
  };

  private service = new PipelineService();
  private viewer!: CompareViewer;
  private paramPanel!: ParamPanel;
  private refs: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement) {
    this.renderShell();
    this.paramPanel = new ParamPanel(this.state.params, (p) => this.onParamsChange(p));
    this.refs['param-slot'].appendChild(this.paramPanel.element);
    this.viewer = new CompareViewer(this.refs['viewer-slot']);
    this.bindControls();
    void this.bootstrap();
  }

  /* ---------------- 骨架 ---------------- */

  private renderShell(): void {
    this.root.innerHTML = `
      <header class="app-header">
        <div class="brand">赛璐珞 4K 重制工作台</div>
        <div class="header-meta">
          <span id="gpu-status"></span>
          <span id="perf-badge" class="perf-badge hidden"></span>
        </div>
      </header>
      <div class="app-body">
        <aside class="sidebar">
          <section class="side-section">
            <h3>素材管理</h3>
            <div class="row">
              <button id="btn-new-episode" class="btn">新建集</button>
            </div>
            <select id="episode-select" class="full"></select>
            <div class="row">
              <button id="btn-new-shot" class="btn">新建镜头并合成 ${FRAME_COUNT} 帧</button>
            </div>
            <select id="shot-select" class="full" size="6"></select>
            <div class="row danger">
              <button id="btn-delete-shot" class="btn ghost">删除当前镜头</button>
            </div>
          </section>
          <section class="side-section" id="param-slot"></section>
          <section class="side-section">
            <h3>处理</h3>
            <div class="row">
              <button id="btn-process-one" class="btn primary">处理当前帧</button>
              <button id="btn-process-all" class="btn primary">整镜批量跑</button>
            </div>
            <div id="progress" class="progress"></div>
          </section>
        </aside>
        <main class="main-area">
          <div class="viewer-toolbar">
            <div class="mode-group" id="mode-group">
              <button data-mode="blink" class="btn mode-btn active">闪烁比对</button>
              <button data-mode="wipe" class="btn mode-btn">滑块比对</button>
              <button data-mode="diff" class="btn mode-btn">差值视图</button>
            </div>
            <label class="inline">闪烁间隔(ms)
              <input id="blink-interval" type="number" value="350" min="80" max="2000" step="10" />
            </label>
            <label class="inline">差值增益
              <input id="diff-gain" type="range" min="1" max="10" value="4" />
            </label>
          </div>
          <div id="viewer-slot" class="viewer-slot"></div>
          <div class="filmstrip" id="filmstrip"></div>
        </main>
      </div>`;
    const ids = [
      'gpu-status', 'perf-badge', 'btn-new-episode', 'episode-select', 'btn-new-shot',
      'shot-select', 'btn-delete-shot', 'param-slot', 'btn-process-one', 'btn-process-all',
      'progress', 'mode-group', 'blink-interval', 'diff-gain', 'viewer-slot', 'filmstrip',
    ];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) this.refs[id] = el;
    }
  }

  private bindControls(): void {
    this.refs['btn-new-episode'].addEventListener('click', () => this.createEpisode());
    this.refs['btn-new-shot'].addEventListener('click', () => this.createShotWithFrames());
    this.refs['btn-delete-shot'].addEventListener('click', () => this.deleteCurrentShot());
    this.refs['episode-select'].addEventListener('change', (e) => this.selectEpisode((e.target as HTMLSelectElement).value));
    this.refs['shot-select'].addEventListener('change', (e) => this.selectShot((e.target as HTMLSelectElement).value));
    this.refs['btn-process-one'].addEventListener('click', () => this.processCurrentFrame());
    this.refs['btn-process-all'].addEventListener('click', () => this.processAllFrames());
    this.refs['mode-group'].addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-mode]') as HTMLButtonElement | null;
      if (!btn) return;
      this.refs['mode-group'].querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.viewer.setMode(btn.dataset.mode as CompareMode);
    });
    this.refs['blink-interval'].addEventListener('change', (e) => {
      this.viewer.setBlinkInterval(Number((e.target as HTMLInputElement).value));
    });
    this.refs['diff-gain'].addEventListener('input', (e) => {
      this.viewer.setDiffGain(Number((e.target as HTMLInputElement).value));
    });
  }

  private async bootstrap(): Promise<void> {
    // 主动初始化一次管线，仅用于探测能力；失败时显示错误但保留外壳可用
    try {
      const probe = new OffscreenCanvas(64, 64);
      const gl = probe.getContext('webgl2');
      if (!gl) throw new Error('当前浏览器不支持 WebGL2');
      this.refs['gpu-status'].textContent = gl.getExtension('EXT_disjoint_timer_query_webgl2')
        ? 'WebGL2 就绪 · GPU 计时可用'
        : 'WebGL2 就绪 · GPU 计时不可用（回退 CPU 计时）';
    } catch (err) {
      this.refs['gpu-status'].textContent = `WebGL2 不可用：${(err as Error).message}`;
    }
    const episodes = await db.listEpisodes();
    this.state.episodes = episodes;
    if (episodes.length === 0) {
      const ep = await db.createEpisode('EP_01', '第一集');
      this.state.episodes = [ep];
    }
    this.refreshEpisodeSelect();
    await this.selectEpisode(this.state.episodes[0].id);
  }

  /* ---------------- 集/镜头 ---------------- */

  private refreshEpisodeSelect(): void {
    const sel = this.refs['episode-select'] as HTMLSelectElement;
    sel.innerHTML = '';
    for (const ep of this.state.episodes) {
      const opt = document.createElement('option');
      opt.value = ep.id;
      opt.textContent = `${ep.code} · ${ep.title}`;
      sel.appendChild(opt);
    }
    if (this.state.currentEpisodeId) sel.value = this.state.currentEpisodeId;
  }

  private async createEpisode(): Promise<void> {
    const n = this.state.episodes.length + 1;
    const code = `EP_${String(n).padStart(2, '0')}`;
    const ep = await db.createEpisode(code, `第${n}集`);
    this.state.episodes = [...this.state.episodes, ep];
    this.refreshEpisodeSelect();
    await this.selectEpisode(ep.id);
  }

  private async selectEpisode(episodeId: string): Promise<void> {
    this.state.currentEpisodeId = episodeId;
    this.state.shots = await db.listShots(episodeId);
    const sel = this.refs['shot-select'] as HTMLSelectElement;
    sel.innerHTML = '';
    for (const shot of this.state.shots) {
      const opt = document.createElement('option');
      opt.value = shot.id;
      opt.textContent = `${shot.code} · ${shot.name}（${shot.frames?.length ?? 0} 帧）`;
      sel.appendChild(opt);
    }
    if (this.state.shots.length > 0) {
      await this.selectShot(this.state.shots[0].id);
    } else {
      this.state.frames = [];
      this.state.currentShotId = null;
      this.renderFilmstrip();
    }
  }

  private async createShotWithFrames(): Promise<void> {
    if (this.state.busy || !this.state.currentEpisodeId) return;
    this.setBusy(true, '正在合成测试素材（4K 母版 → 标清母版）…');
    try {
      const n = this.state.shots.length + 1;
      const code = `SC_${String(n).padStart(3, '0')}`;
      const shot = await db.createShot(this.state.currentEpisodeId, code, `镜头 ${n}`, { ...DEFAULT_PARAMS });
      const { frames } = await this.service.synthesizeShotFrames(
        shot.id, FRAME_COUNT, SD_W, SD_H, DEFAULT_PARAMS.scale, makeId('seed').length * 7919 + n,
      );
      shot.frames = frames as unknown as FrameRecord[];
      await db.updateShot(shot);
      this.state.shots = [...this.state.shots, shot];
      await this.selectEpisode(shot.episodeId);
      const sel = this.refs['shot-select'] as HTMLSelectElement;
      sel.value = shot.id;
      await this.selectShot(shot.id);
      this.setProgress(`已生成 ${frames.length} 帧标清素材（${SD_W}×${SD_H}），放大目标 ${SD_W * 4}×${SD_H * 4}`);
    } finally {
      this.setBusy(false, '');
    }
  }

  private async selectShot(shotId: string): Promise<void> {
    const shot = this.state.shots.find((s) => s.id === shotId);
    if (!shot) return;
    this.state.currentShotId = shotId;
    this.state.params = { ...shot.params };
    this.paramPanel.setParams(this.state.params);
    this.state.frames = await db.listFrames(shotId);
    this.state.currentFrameId = this.state.frames[0]?.id ?? null;
    this.renderFilmstrip();
    await this.refreshViewer();
  }

  private async deleteCurrentShot(): Promise<void> {
    if (!this.state.currentShotId) return;
    await db.deleteShot(this.state.currentShotId);
    if (this.state.currentEpisodeId) await this.selectEpisode(this.state.currentEpisodeId);
  }

  /* ---------------- 参数与处理 ---------------- */

  private onParamsChange(params: UpscaleParams): void {
    this.state.params = params;
    const shot = this.state.shots.find((s) => s.id === this.state.currentShotId);
    if (shot) {
      shot.params = { ...params };
      void db.updateShot(shot);
    }
  }

  private setBusy(busy: boolean, progress: string): void {
    this.state.busy = busy;
    this.setProgress(progress);
    document.body.classList.toggle('busy', busy);
    this.refs['btn-process-one'].classList.toggle('disabled', busy);
    this.refs['btn-process-all'].classList.toggle('disabled', busy);
  }

  private setProgress(text: string): void {
    this.state.progress = text;
    this.refs['progress'].textContent = text;
  }

  private async processCurrentFrame(): Promise<void> {
    const frame = this.state.frames.find((f) => f.id === this.state.currentFrameId);
    if (!frame || this.state.busy) return;
    this.setBusy(true, `处理帧 ${frame.index + 1}/${this.state.frames.length} …`);
    try {
      const { frame: updated, metrics } = await this.service.processFrame(frame, this.state.params);
      this.mergeFrame(updated);
      this.state.lastElapsedMs = metrics.elapsedMs;
      this.showPerf(metrics.elapsedMs);
      await this.refreshViewer();
      this.setProgress(`帧 ${frame.index + 1} 完成：4K 放大耗时 ${metrics.elapsedMs.toFixed(1)} ms`);
    } catch (err) {
      this.setProgress(`处理失败：${(err as Error).message}`);
    } finally {
      this.setBusy(false, this.state.progress);
    }
  }

  private async processAllFrames(): Promise<void> {
    if (this.state.busy || this.state.frames.length === 0) return;
    const shot = this.state.shots.find((s) => s.id === this.state.currentShotId);
    if (!shot) return;
    this.setBusy(true, '批量处理启动…');
    try {
      const results = await this.service.processShot(shot, this.state.frames, (p) => {
        this.setProgress(`批量进度 ${p.done}/${p.total}（当前帧 GPU ${p.metrics?.elapsedMs.toFixed(1) ?? '-'} ms）`);
      });
      for (const r of results) this.mergeFrame(r.frame);
      const avg = results.reduce((s, r) => s + r.metrics.elapsedMs, 0) / results.length;
      const max = Math.max(...results.map((r) => r.metrics.elapsedMs));
      this.showPerf(avg);
      this.setProgress(`整镜完成：平均 ${avg.toFixed(1)} ms/帧，最大 ${max.toFixed(1)} ms/帧（验收线 500 ms）`);
      this.renderFilmstrip();
      await this.refreshViewer();
    } catch (err) {
      this.setProgress(`批量失败：${(err as Error).message}`);
    } finally {
      this.setBusy(false, this.state.progress);
    }
  }

  private mergeFrame(updated: StoredFrame): void {
    const idx = this.state.frames.findIndex((f) => f.id === updated.id);
    if (idx >= 0) this.state.frames[idx] = updated;
    this.renderFilmstrip();
  }

  private showPerf(ms: number): void {
    const badge = this.refs['perf-badge'];
    badge.classList.remove('hidden');
    badge.textContent = `${ms.toFixed(1)} ms/帧`;
    badge.classList.toggle('fail', ms > 500);
    badge.classList.toggle('pass', ms <= 500);
  }

  /* ---------------- 胶片条与查看器 ---------------- */

  private renderFilmstrip(): void {
    const strip = this.refs['filmstrip'];
    strip.innerHTML = '';
    for (const frame of this.state.frames) {
      const cell = document.createElement('button');
      cell.className = 'frame-cell';
      if (frame.id === this.state.currentFrameId) cell.classList.add('selected');
      if (frame.resultBlob) cell.classList.add('done');
      cell.title = `帧 ${frame.index + 1}${frame.resultBlob ? '（已处理）' : ''}`;
      const thumb = document.createElement('canvas');
      thumb.width = 120;
      thumb.height = Math.round((120 * frame.height) / frame.width);
      cell.appendChild(thumb);
      const label = document.createElement('span');
      label.textContent = `#${frame.index + 1}`;
      cell.appendChild(label);
      void this.drawThumb(thumb, frame.sourceBlob);
      cell.addEventListener('click', () => {
        this.state.currentFrameId = frame.id;
        this.renderFilmstrip();
        void this.refreshViewer();
      });
      strip.appendChild(cell);
    }
  }

  private async drawThumb(canvas: HTMLCanvasElement, blob: Blob | undefined): Promise<void> {
    if (!blob) return;
    const bmp = await createImageBitmap(blob);
    try {
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    } finally {
      bmp.close();
    }
  }

  private async refreshViewer(): Promise<void> {
    const frame = this.state.frames.find((f) => f.id === this.state.currentFrameId);
    if (!frame) {
      this.viewer.setImages(null, null);
      return;
    }
    const sourceBmp = frame.sourceBlob ? await imageToBitmap(await blobToImage(frame.sourceBlob)) : null;
    const resultBmp = frame.resultBlob ? await imageToBitmap(await blobToImage(frame.resultBlob)) : null;
    this.viewer.setImages(sourceBmp, resultBmp);
  }
}
