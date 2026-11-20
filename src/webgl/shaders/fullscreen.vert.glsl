#version 300 es
// 全屏三角形顶点着色器：所有 pass 共用
// 使用显式顶点缓冲（位置 + UV），不依赖 gl_VertexID 无缓冲路径，
// 该路径在部分 ANGLE/SwiftShader 驱动上会得到错误的裁剪坐标。
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
