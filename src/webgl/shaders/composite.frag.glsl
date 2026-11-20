#version 300 es
// Pass D（4K 分辨率）：分区合成
//   线条区  -> 以 Lanczos 边缘渐变为基础，覆盖率场把线芯压向标准墨色并抑制光晕，
//              既保住抗锯齿过渡（高 PSNR），又用同一公式逐帧稳定线宽
//   平涂区  -> 双线性颜色 + 可选量化，色块内部严格单色，无阶梯/渐变带
//   背景区  -> Lanczos3 与双线性按 uTextureSharpen 混合，保住纸纹笔触且控制振铃
// 抗振铃：Lanczos 负瓣会在阶跃边缘产生过冲（黑线外的光晕），用 SD 邻域值域钳制消除。
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uColor;    // SD 原图（硬件双线性）
uniform sampler2D uLanczos;  // 4K Lanczos3 结果
uniform sampler2D uMask;     // SD 分区 RGBA（双线性采样获得软化边界）
uniform float uLineSoftness;   // 覆盖率软化参数
uniform float uRegionFeather;  // 分区软化宽度（4K 像素）
uniform float uTextureSharpen; // 0=双线性 1=纯 Lanczos3
uniform float uFlatLevels;     // 0=不量化，>1=每通道量化级数
uniform float uScale;

const vec3 INK_COLOR = vec3(26.0 / 255.0, 23.0 / 255.0, 30.0 / 255.0);

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 quantize(vec3 c, float levels) {
  float l = levels - 1.0;
  return floor(c * l + 0.5) / l;
}

void main() {
  vec3 bilinear = texture(uColor, vUv).rgb;
  vec3 lanczos = texture(uLanczos, vUv).rgb;
  vec4 m = texture(uMask, vUv);

  float lineW = m.r;
  float flatW = m.g;
  float bgW = m.b;
  float inkCov = clamp(m.a, 0.0, 1.0);

  // ---- 抗振铃：取 SD 原图 3x3 邻域的逐通道值域，把 Lanczos 过冲钳制回邻域真实
  // 出现过的颜色范围内，消除黑线外的光晕 ----
  vec2 sdTexel = 1.0 / vec2(textureSize(uColor, 0));
  vec3 lo = vec3(1.0);
  vec3 hi = vec3(0.0);
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec3 n = texture(uColor, vUv + vec2(float(xx), float(yy)) * sdTexel).rgb;
      lo = min(lo, n);
      hi = max(hi, n);
    }
  }
  vec3 lanczosClamped = clamp(lanczos, lo, hi);

  // 分区软化：把硬掩码的 0.5 过渡带按 uRegionFeather 拉宽（换算回 SD texel 比例）
  float fe = clamp(uRegionFeather / max(1.0, uScale), 0.0, 0.49);
  vec3 w = vec3(
    smoothstep(0.5 - fe, 0.5 + fe, lineW),
    smoothstep(0.5 - fe, 0.5 + fe, flatW),
    smoothstep(0.5 - fe, 0.5 + fe, bgW)
  );
  // NEAREST 硬分区：平涂块内部 flatW 恒为 1，保证内部颜色不被其他分区稀释（杜绝渐变带）
  vec2 maskSize = vec2(textureSize(uMask, 0));
  vec2 maskNearestUv = (floor(vUv * maskSize) + 0.5) / maskSize;
  vec4 hard = texture(uMask, maskNearestUv);
  if (hard.g > 0.5) {
    w = vec3(0.0, 1.0, 0.0);
  }
  float wsum = max(w.x + w.y + w.z, 1e-5);
  w /= wsum;

  // 平涂色：硬分区内部取所属 SD 块的 nearest 原色，保证块内 16 个 4K 像素严格同色
  //（块内色差为 0，满足“平涂区域必须还是一个颜色”）；边缘混合交给分区软化权重。
  vec2 sdSize = vec2(textureSize(uColor, 0));
  vec2 nearestUv = (floor(vUv * sdSize) + 0.5) / sdSize;
  vec3 flatColor = texture(uColor, nearestUv).rgb;
  if (uFlatLevels > 1.0) {
    flatColor = quantize(flatColor, uFlatLevels);
  }

  // 背景色：抗振铃后的 Lanczos 与双线性混合，保纸纹且无过冲
  vec3 bgColor = mix(bilinear, lanczosClamped, clamp(uTextureSharpen, 0.0, 1.0));

  // 线条色（解析边缘重建）：
  // 真值墨线模型为 color = (1-cov)*底色 + cov*INK。在 4K 用抗振铃 Lanczos 的暗度
  // 精确反推覆盖率 cov4k，底色取 SD 邻域最亮像素（线旁的平涂/背景纯色），
  // 直接按该线性模型重建，比“Lanczos 暗色再向 INK 混合”更贴合真值、边缘 PSNR 更高。
  float s = max(0.05, uLineSoftness);
  float inkL = luma(INK_COLOR);
  vec3 baseColor = clamp(hi, 0.0, 1.0);
  float baseL = luma(baseColor);
  float cov4k = clamp((baseL - luma(lanczosClamped)) / max(1e-4, baseL - inkL), 0.0, 1.0);
  float lineRegion = smoothstep(0.5 - fe, 0.5 + fe, lineW);
  float inkA = smoothstep(0.5 - s, 0.5 + s, cov4k) * lineRegion;
  // 线区：解析混合为主；线芯仍收敛到标准墨色保证墨色纯度
  vec3 analyticLine = mix(baseColor, INK_COLOR, inkA);
  vec3 lineColor = mix(lanczosClamped, analyticLine, lineRegion);

  // 分区加权混合：线/平涂/背景各自取专属颜色，交界处由软化权重无缝过渡
  vec3 color = w.x * lineColor + w.y * flatColor + w.z * bgColor;
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
