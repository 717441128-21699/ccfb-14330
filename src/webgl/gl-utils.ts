/**
 * WebGL2 底层工具：上下文、shader 编译、program、FBO/纹理封装。
 */

/** EXT_disjoint_timer_query_webgl2（部分 TS lib 版本未收录，这里显式声明） */
export interface DisjointTimerQueryExt {
  readonly TIME_ELAPSED_EXT: GLenum;
  readonly GPU_DISJOINT_EXT: GLenum;
}

export interface GlContext {
  gl: WebGL2RenderingContext;
  timerExt: DisjointTimerQueryExt | null;
}

export function createGlContext(canvas: HTMLCanvasElement | OffscreenCanvas): GlContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  }) as WebGL2RenderingContext | null;
  if (!gl) {
    throw new Error('当前环境不支持 WebGL2，请使用最新版 Chrome/Edge/Firefox');
  }
  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') as unknown as DisjointTimerQueryExt | null;
  return { gl, timerExt };
}

export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader 返回空');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '未知编译错误';
    gl.deleteShader(shader);
    throw new Error(`Shader 编译失败:\n${log}\n--- 源码 ---\n${source}`);
  }
  return shader;
}

export interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

export function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): Program {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram 返回空');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '未知链接错误';
    gl.deleteProgram(program);
    throw new Error(`Program 链接失败: ${log}`);
  }
  return { program, uniforms: new Map() };
}

export function uniform(p: Program, gl: WebGL2RenderingContext, name: string): WebGLUniformLocation | null {
  let loc = p.uniforms.get(name);
  if (loc === undefined) {
    loc = gl.getUniformLocation(p.program, name);
    p.uniforms.set(name, loc);
  }
  return loc;
}

/** 颜色附件纹理 + FBO，懒分配、按尺寸复用 */
export class RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width = 0;
  height = 0;

  constructor(private gl: WebGL2RenderingContext) {
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error('RenderTarget 资源分配失败');
    this.texture = tex;
    this.framebuffer = fbo;
  }

  ensureSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer 不完整: 0x${status.toString(16)} (${width}x${height})`);
    }
    this.width = width;
    this.height = height;
  }

  bind(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.viewport(0, 0, this.width, this.height);
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteFramebuffer(this.framebuffer);
  }
}

/**
 * 全屏三角形 VAO：显式顶点缓冲（NDC 位置 + UV），覆盖整个裁剪空间。
 * 三个顶点 (-1,-1)/(3,-1)/(-1,3)，UV 越界部分由三角形裁剪掉，屏幕内为标准 0~1。
 */
export function createFullscreenVao(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('VAO 分配失败');
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('顶点缓冲分配失败');
  // 每顶点: ndcX, ndcY, u, v（步长 16 字节）
  const vertices = new Float32Array([
    -1, -1, 0, 0,
     3, -1, 2, 0,
    -1,  3, 0, 2,
  ]);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);
  return vao;
}
