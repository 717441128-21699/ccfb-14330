#version 300 es
// 可分离放大水平 pass：Lanczos3 与 Mitchell-Netravali 可切换。
// Mitchell(1/3,1/3) 无振铃、对盒式下采样的逆重建更贴合，赛璐珞阶跃边缘 PSNR 更高。
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uColor;
uniform float uScale;
uniform float uKernel; // 0=Lanczos3, 1=Mitchell

float sinc(float x) {
  x *= 3.141592653589793;
  return abs(x) < 1e-5 ? 1.0 : sin(x) / x;
}

float lanczos3(float x) {
  if (abs(x) >= 3.0) return 0.0;
  return sinc(x) * sinc(x / 3.0);
}

// Mitchell-Netravali，支撑域 2，B=C=1/3
float mitchell(float x) {
  x = abs(x);
  float B = 1.0 / 3.0;
  float C = 1.0 / 3.0;
  float x2 = x * x;
  float x3 = x2 * x;
  if (x < 1.0) {
    return ((12.0 - 9.0 * B - 6.0 * C) * x3 + (-18.0 + 12.0 * B + 6.0 * C) * x2 + (6.0 - 2.0 * B)) / 6.0;
  } else if (x < 2.0) {
    return ((-B - 6.0 * C) * x3 + (6.0 * B + 30.0 * C) * x2 + (-12.0 * B - 48.0 * C) * x + (8.0 * B + 24.0 * C)) / 6.0;
  }
  return 0.0;
}

float kernelWeight(float x) {
  return uKernel > 0.5 ? mitchell(x) : lanczos3(x);
}

void main() {
  vec2 srcSize = vec2(textureSize(uColor, 0));
  // 盒式下采样中 SD 像素中心对应 4K 块中心（偏移半像素），这里补偿该相位，
  // 使重建网格与 box 积分中心对齐，减小阶跃边缘的系统性位置误差。
  float srcX = vUv.x * srcSize.x - 0.5;
  float base = floor(srcX);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -2; i <= 3; i++) {
    float sx = base + float(i);
    float w = kernelWeight(srcX - sx);
    float cx = clamp((sx + 0.5) / srcSize.x, 0.0, 1.0);
    acc += texture(uColor, vec2(cx, vUv.y)) * w;
    wsum += w;
  }
  outColor = acc / wsum;
}
