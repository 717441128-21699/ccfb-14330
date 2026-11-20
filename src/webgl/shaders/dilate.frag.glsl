#version 300 es
// Pass B（SD 分辨率）：线条掩码 3x3 最大膨胀，把墨线抗锯齿边缘纳入线区。
// 每次调用膨胀 1 像素，CPU 端按 lineDilateRadius 做 ping-pong 迭代。
// G/B/A 通道原样透传。
precision highp float;
in vec2 vUv;
out vec4 outMask;

uniform sampler2D uMask;

void main() {
  vec2 texel = 1.0 / vec2(textureSize(uMask, 0));
  float line = 0.0;
  vec4 center = vec4(0.0);
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec4 s = texture(uMask, vUv + vec2(float(xx), float(yy)) * texel);
      line = max(line, s.r);
      if (xx == 0 && yy == 0) center = s;
    }
  }
  outMask = vec4(line, center.g, center.b, center.a);
}
