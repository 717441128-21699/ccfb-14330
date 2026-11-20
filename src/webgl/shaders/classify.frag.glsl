#version 300 es
// Pass A（SD 分辨率）：像素分区分类 + 墨线覆盖率估计
// 输出 RGBA：R=线条硬掩码 G=平涂硬掩码 B=背景硬掩码 A=墨线覆盖率(0~1)
precision highp float;
in vec2 vUv;
out vec4 outMask;

uniform sampler2D uColor;
uniform float uInkThreshold;   // 0~1
uniform float uFlatThreshold;  // 0~1（RGB 欧氏距离）

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// 赛璐珞墨线的标准墨色（与合成器 INK 一致）
const vec3 INK_COLOR = vec3(26.0 / 255.0, 23.0 / 255.0, 30.0 / 255.0);

void main() {
  vec2 texel = 1.0 / vec2(textureSize(uColor, 0));
  vec3 c = texture(uColor, vUv).rgb;
  float l = luma(c);

  // 邻域最大色差：平涂色块内部为 0，纹理/边缘处显著
  float maxDist = 0.0;
  float underL = l; // 邻域最大亮度，作为“墨线底下颜色”的亮度估计
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec3 n = texture(uColor, vUv + vec2(float(xx), float(yy)) * texel).rgb;
      maxDist = max(maxDist, length(c - n));
      underL = max(underL, luma(n));
    }
  }

  float isLine = step(l, uInkThreshold);
  float isFlat = (1.0 - isLine) * step(maxDist, uFlatThreshold);
  float isBg = (1.0 - isLine) * step(uFlatThreshold, maxDist);

  // 墨线覆盖率：以“邻域最亮（底色）→ 墨色”为两端，把当前像素亮度映射成 0~1。
  // 抗锯齿边缘像素的亮度天然落在两端之间，因此得到连续覆盖率，与真值边缘渐变对齐。
  float inkL = luma(INK_COLOR);
  float cov = clamp((underL - l) / max(1e-4, underL - inkL), 0.0, 1.0);
  // 硬线区内覆盖率向 1 平滑靠拢（而非硬切），保留线芯到边缘的自然衰减
  cov = max(cov, isLine * smoothstep(uInkThreshold * 1.4, uInkThreshold * 0.4, l));

  outMask = vec4(isLine, isFlat, isBg, cov);
}
