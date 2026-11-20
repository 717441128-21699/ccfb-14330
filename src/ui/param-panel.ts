/**
 * 放大参数面板：所有参数实时双向绑定，变更触发 onParamsChange 回调。
 * 每个控件带中文说明，直接对应赛璐珞重制的工艺控制点。
 */
import { UpscaleParams } from '../types';

interface SliderSpec {
  key: keyof UpscaleParams;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderSpec[] = [
  { key: 'inkThreshold', label: '墨线亮度阈值', hint: '亮度低于该值的像素判定为墨线（0~255）', min: 20, max: 160, step: 1 },
  { key: 'lineDilateRadius', label: '线区膨胀半径', hint: '把墨线抗锯齿边缘纳入线区，消除边缘毛刺（SD 像素）', min: 0, max: 3, step: 1 },
  { key: 'lineSoftness', label: '线条锐度', hint: '越小线条越硬；同参数逐帧一致，线宽不漂移', min: 0.05, max: 0.9, step: 0.01 },
  { key: 'flatThreshold', label: '平涂色差阈值', hint: '邻域色差低于该值视为平涂色块（0~255）', min: 2, max: 40, step: 1 },
  { key: 'flatLevels', label: '平涂量化级数', hint: '0=不量化；>1 时按级数取整，彻底消除渐变带', min: 0, max: 32, step: 1 },
  { key: 'textureSharpen', label: '背景纹理锐度', hint: 'Lanczos3 与双线性混合，1=纯 Lanczos 保纸纹，0=完全柔化', min: 0, max: 1, step: 0.05 },
  { key: 'textureThreshold', label: '背景判定阈值', hint: '邻域色差高于该值归入水彩背景处理', min: 8, max: 60, step: 1 },
  { key: 'regionFeather', label: '分区软化宽度', hint: '线/平涂/背景交界处的羽化宽度（4K 像素）', min: 0, max: 4, step: 0.25 },
];

export class ParamPanel {
  readonly element: HTMLElement;
  private params: UpscaleParams;
  private onChange: (p: UpscaleParams) => void;
  private inputs = new Map<string, HTMLInputElement>();
  private valueLabels = new Map<string, HTMLElement>();

  constructor(initial: UpscaleParams, onChange: (p: UpscaleParams) => void) {
    this.params = { ...initial };
    this.onChange = onChange;
    this.element = document.createElement('div');
    this.element.className = 'param-panel';
    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = '放大参数（单帧调好 → 整镜复用）';
    this.element.appendChild(title);

    // 放大倍数
    const scaleRow = document.createElement('div');
    scaleRow.className = 'param-row';
    scaleRow.innerHTML = `<label>放大倍数</label>`;
    const select = document.createElement('select');
    select.className = 'select-scale';
    for (const s of [2, 3, 4, 6, 8]) {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = `${s}x（${s * 240}×${s * 135} 级）`;
      if (s === this.params.scale) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      this.params = { ...this.params, scale: Number(select.value) };
      this.onChange(this.params);
    });
    scaleRow.appendChild(select);
    this.element.appendChild(scaleRow);

    // 放大核选择
    const kernelRow = document.createElement('div');
    kernelRow.className = 'param-row';
    kernelRow.innerHTML = `<label>放大核函数</label>`;
    const kernelSelect = document.createElement('select');
    kernelSelect.className = 'select-kernel';
    const kernels: Array<[number, string]> = [
      [0, 'Lanczos3（锐利，默认，PSNR 最优）'],
      [1, 'Mitchell（无振铃，边缘更柔和）'],
    ];
    for (const [v, label] of kernels) {
      const opt = document.createElement('option');
      opt.value = String(v);
      opt.textContent = label;
      if (v === this.params.upscaleKernel) opt.selected = true;
      kernelSelect.appendChild(opt);
    }
    kernelSelect.addEventListener('change', () => {
      this.params = { ...this.params, upscaleKernel: Number(kernelSelect.value) };
      this.onChange(this.params);
    });
    kernelRow.appendChild(kernelSelect);
    this.element.appendChild(kernelRow);

    for (const spec of SLIDERS) {
      const row = document.createElement('div');
      row.className = 'param-row';
      const label = document.createElement('label');
      label.textContent = spec.label;
      label.title = spec.hint;
      const value = document.createElement('span');
      value.className = 'param-value';
      value.textContent = String(this.params[spec.key]);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(this.params[spec.key]);
      input.title = spec.hint;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        this.params = { ...this.params, [spec.key]: v };
        value.textContent = String(v);
        this.onChange(this.params);
      });
      const hint = document.createElement('small');
      hint.className = 'param-hint';
      hint.textContent = spec.hint;
      row.append(label, value, input, hint);
      this.element.appendChild(row);
      this.inputs.set(spec.key, input);
      this.valueLabels.set(spec.key, value);
    }
  }

  /** 镜头切换等场景下外部回写参数 */
  setParams(params: UpscaleParams): void {
    this.params = { ...params };
    for (const spec of SLIDERS) {
      const input = this.inputs.get(spec.key);
      const label = this.valueLabels.get(spec.key);
      if (input) input.value = String(this.params[spec.key]);
      if (label) label.textContent = String(this.params[spec.key]);
    }
    const scaleSelect = this.element.querySelector('.select-scale');
    if (scaleSelect) (scaleSelect as HTMLSelectElement).value = String(this.params.scale);
    const kernelSel = this.element.querySelector('.select-kernel');
    if (kernelSel) (kernelSel as HTMLSelectElement).value = String(this.params.upscaleKernel);
  }

  getParams(): UpscaleParams {
    return { ...this.params };
  }
}
