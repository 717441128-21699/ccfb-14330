(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))n(o);new MutationObserver(o=>{for(const s of o)if(s.type==="childList")for(const i of s.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&n(i)}).observe(document,{childList:!0,subtree:!0});function t(o){const s={};return o.integrity&&(s.integrity=o.integrity),o.referrerPolicy&&(s.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?s.credentials="include":o.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function n(o){if(o.ep)return;o.ep=!0;const s=t(o);fetch(o.href,s)}})();const vt={scale:4,inkThreshold:92,lineDilateRadius:1,lineSoftness:.12,flatThreshold:10,flatLevels:0,textureSharpen:1,textureThreshold:24,regionFeather:2.5,upscaleKernel:0};function j(r){let e=r>>>0;return()=>{e|=0,e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}let X=0;function V(r){X=X+1&65535;const e=Math.floor(Math.random()*65535).toString(16).padStart(4,"0");return`${r}_${Date.now().toString(36)}_${X.toString(16).padStart(4,"0")}${e}`}function D(r,e,t){return r<e?e:r>t?t:r}function I(r){return r<0?0:r>1?1:r}function G(r,e,t){const n=I((t-r)/(e-r));return n*n*(3-2*n)}function Y(r,e){const t=r[0]-e[0],n=r[1]-e[1],o=r[2]-e[2];return Math.sqrt(t*t+n*n+o*o)}function A(r,e){return{width:r,height:e,data:new Uint8ClampedArray(new ArrayBuffer(r*e*4))}}function J(r,e,t,n,o,s,i=255){const a=(t*r.width+e)*4;r.data[a]=n,r.data[a+1]=o,r.data[a+2]=s,r.data[a+3]=i}function Z(r,e,t){if(r.width%e!==0||r.height%t!==0)throw new Error(`downsampleBox 要求整数倍缩放: ${r.width}x${r.height} -> ${e}x${t}`);const n=r.width/e,o=r.height/t,s=A(e,t),i=n*o;for(let a=0;a<t;a++)for(let c=0;c<e;c++){let l=0,h=0,x=0,f=0;const g=c*n,u=a*o;for(let y=0;y<o;y++)for(let v=0;v<n;v++){const E=((u+y)*r.width+(g+v))*4;l+=r.data[E],h+=r.data[E+1],x+=r.data[E+2],f+=r.data[E+3]}const m=(a*e+c)*4;s.data[m]=l/i,s.data[m+1]=h/i,s.data[m+2]=x/i,s.data[m+3]=f/i}return s}function Et(r,e){if(r.width!==e.width||r.height!==e.height)throw new Error(`PSNR 输入尺寸不一致: ${r.width}x${r.height} vs ${e.width}x${e.height}`);let t=0;const n=r.width*r.height*3;for(let s=0;s<r.width*r.height;s++){const i=s*4,a=r.data[i]-e.data[i],c=r.data[i+1]-e.data[i+1],l=r.data[i+2]-e.data[i+2];t+=a*a+c*c+l*l}const o=t/n;return o===0?{psnrDb:1/0,mse:0}:{psnrDb:10*Math.log10(65025/o),mse:o}}function Tt(r,e,t){const{width:n,height:o,data:s}=r,i=new Uint8Array(n*o),a=new Float32Array(n*o);for(let c=0;c<n*o;c++){const l=c*4;a[c]=.299*s[l]+.587*s[l+1]+.114*s[l+2]}for(let c=0;c<o;c++)for(let l=0;l<n;l++){const h=c*n+l;if(a[h]<e){i[h]=0;continue}let x=0;const f=s[h*4],g=s[h*4+1],u=s[h*4+2];for(let m=-1;m<=1;m++){const y=c+m;if(!(y<0||y>=o))for(let v=-1;v<=1;v++){const E=l+v;if(E<0||E>=n)continue;const d=(y*n+E)*4,T=Y([f,g,u],[s[d],s[d+1],s[d+2]]);T>x&&(x=T)}}i[h]=x<t?1:2}return i}function wt(r,e,t,n,o){const s=new Uint8Array(n*o);for(let i=0;i<o;i++){const a=Math.min(t-1,Math.floor((i+.5)*t/o));for(let c=0;c<n;c++){const l=Math.min(e-1,Math.floor((c+.5)*e/n));s[i*n+c]=r[a*e+l]}}return s}function St(r,e,t){const n=[0,0,0],o=[0,0,0];for(let a=0;a<r.width*r.height;a++){const c=t[a],l=a*4,h=r.data[l]-e.data[l],x=r.data[l+1]-e.data[l+1],f=r.data[l+2]-e.data[l+2];n[c]+=h*h+x*x+f*f,o[c]+=3}const s=n.map((a,c)=>o[c]?a/o[c]:0),i=a=>a===0?1/0:10*Math.log10(65025/a);return{line:i(s[0]),flat:i(s[1]),background:i(s[2]),counts:[o[0]/3,o[1]/3,o[2]/3]}}async function K(r){const e=new OffscreenCanvas(r.width,r.height);return e.getContext("2d").putImageData(new ImageData(r.data,r.width,r.height),0,0),e.convertToBlob({type:"image/png"})}async function tt(r){const e=await createImageBitmap(r);try{const n=new OffscreenCanvas(e.width,e.height).getContext("2d");n.drawImage(e,0,0);const o=n.getImageData(0,0,e.width,e.height);return{width:e.width,height:e.height,data:new Uint8ClampedArray(o.data)}}finally{e.close()}}async function bt(r){const e=new OffscreenCanvas(r.width,r.height);return e.getContext("2d").putImageData(new ImageData(r.data,r.width,r.height),0,0),createImageBitmap(e)}function q(r,e,t){const n=t.x-e.x,o=t.y-e.y,s=r.x-e.x,i=r.y-e.y,a=n*n+o*o,c=I(a===0?0:(s*n+i*o)/a),l=s-n*c,h=i-o*c;return Math.sqrt(l*l+h*h)}function et(r,e,t){const n=r.x-e.x,o=r.y-e.y;return Math.sqrt(n*n+o*o)-t}function _(r,e,t=.75){return 1-G(e-t,e+t,r)}function nt(r,e,t){let n=r*374761393+e*668265263+t*1442695041|0;return n=Math.imul(n^n>>>13,1274126177),(n^n>>>16)>>>0}function F(r,e,t){return nt(e,t,r)/4294967296}class z{constructor(e,t,n,o){this.seed=e,this.gw=t,this.gh=n,this.octaves=o,this.grid=new Float32Array(t*n);for(let s=0;s<n;s++)for(let i=0;i<t;i++)this.grid[s*t+i]=this.computeFbm(i,s)}grid;computeFbm(e,t){let n=0,o=.5,s=1,i=0;for(let a=0;a<this.octaves;a++){const c=e*s,l=t*s,h=Math.floor(c),x=Math.floor(l),f=c-h,g=l-x,u=f*f*(3-2*f),m=g*g*(3-2*g),y=F(this.seed+a*1013,h,x),v=F(this.seed+a*1013,h+1,x),E=F(this.seed+a*1013,h,x+1),d=F(this.seed+a*1013,h+1,x+1),T=y+(v-y)*u,w=E+(d-E)*u;n+=(T+(w-T)*m)*o,i+=o,o*=.5,s*=2}return n/i}sample(e,t){const n=D(e,0,this.gw-1.0001),o=D(t,0,this.gh-1.0001),s=Math.floor(n),i=Math.floor(o),a=n-s,c=o-i,l=this.grid[i*this.gw+s],h=this.grid[i*this.gw+s+1],x=this.grid[(i+1)*this.gw+s],f=this.grid[(i+1)*this.gw+s+1],g=l+(h-l)*a,u=x+(f-x)*a;return g+(u-g)*c}}function rt(r,e,t){const n=A(e,t),o=j(r),s=e/960,i=[];for(let u=0;u<5;u++)i.push({c:{x:(.15+o()*.7)*e,y:(.15+o()*.7)*t},r:(.18+o()*.22)*e,color:[120+o()*80,130+o()*70,160+o()*70],alpha:.1+o()*.12});const a=[];for(let u=0;u<7;u++)a.push({a:{x:o()*e,y:o()*t},b:{x:o()*e,y:o()*t},width:(10+o()*26)*s,color:[90+o()*60,80+o()*50,70+o()*40],alpha:.1+o()*.16,seed:Math.floor(o()*1e9)});const c=[238,232,218],l=3.2*s,h=new z(r,Math.ceil(e/l)+2,Math.ceil(t/l)+2,3),x=new z(r+77,Math.ceil(e/(42*s))+2,Math.ceil(t/(42*s))+2,2),f=new z(r+3,Math.ceil(e/(60*s))+2,Math.ceil(t/(60*s))+2,2),g=a.map(u=>new z(u.seed,Math.ceil(e/(18*s))+2,Math.ceil(t/(18*s))+2,2));for(let u=0;u<t;u++)for(let m=0;m<e;m++){let y=c[0],v=c[1],E=c[2];const d=h.sample(m/l,u/l),T=x.sample(m/(42*s),u/(42*s)),w=(d-.5)*22+(T-.5)*14;y+=w,v+=w*.95,E+=w*.85;for(let b=0;b<i.length;b++){const p=i[b],R=m-p.c.x,k=u-p.c.y,C=Math.sqrt(R*R+k*k),W=(f.sample(m/(60*s),u/(60*s))-.5)*24*s,N=I(1-G(p.r*.55,p.r+W,C))*p.alpha;y+=(p.color[0]-y)*N,v+=(p.color[1]-v)*N,E+=(p.color[2]-E)*N}for(let b=0;b<a.length;b++){const p=a[b],R=q({x:m,y:u},p.a,p.b),k=(g[b].sample(m/(18*s),u/(18*s))-.5)*p.width*.35,C=_(R+k,p.width/2,1.2*s)*p.alpha;y+=(p.color[0]-y)*C,v+=(p.color[1]-v)*C,E+=(p.color[2]-E)*C}J(n,m,u,D(y,0,255),D(v,0,255),D(E,0,255),255)}return{img:n}}function ot(r){const e=r,t=[{kind:"flatCircle",c:{x:330*e,y:300*e},r:150*e,fill:[228,92,78],outline:13*e,pressureAmp:4.5*e},{kind:"flatCircle",c:{x:660*e,y:180*e},r:78*e,fill:[86,132,206],outline:9*e,pressureAmp:2.5*e},{kind:"flatCircle",c:{x:700*e,y:420*e},r:95*e,fill:[238,206,110],outline:0,pressureAmp:0}],n=[{c:{x:170*e,y:430*e},r1:96*e,r2:96*e+22*e,width:10*e,a0:-.9,a1:1.4}],o=[{a:{x:470*e,y:470*e},b:{x:880*e,y:500*e},width:8*e,seed:11},{a:{x:120*e,y:140*e},b:{x:420*e,y:90*e},width:6*e,seed:22}];return{shapes:t,parallelArcs:n,strokes:o}}const O=[26,23,30];function st(r,e,t,n){const o=A(e,t),s=new Uint8Array(e*t).fill(2),{data:i}=o;for(let a=0;a<t;a++)for(let c=0;c<e;c++){const l={x:c-n.x,y:a-n.y};let h=0,x=[0,0,0],f=0;for(const d of r.shapes){const T=et(l,d.c,d.r),w=1-G(-.75,.75,T);if(w>h&&(h=w,x=d.fill),d.outline>0){const b=Math.atan2(l.y-d.c.y,l.x-d.c.x),p=(d.outline+d.pressureAmp*Math.sin(b*3+.6))/2,R=_(Math.abs(T),p,.75);R>f&&(f=R)}}for(const d of r.parallelArcs){const T=l.x-d.c.x,w=l.y-d.c.y,b=Math.atan2(w,T);if(b>=d.a0&&b<=d.a1){const p=Math.abs(Math.sqrt(T*T+w*w)-d.r1),R=Math.abs(Math.sqrt(T*T+w*w)-d.r2);f=Math.max(f,_(p,d.width/2,.75)),f=Math.max(f,_(R,d.width/2,.75))}}for(const d of r.strokes){const T=q(l,d.a,d.b),w=d.b.x-d.a.x,b=d.b.y-d.a.y,p=I((l.x-d.a.x)*w+(l.y-d.a.y)*b)/Math.max(1,w*w+b*b),R=Math.sin(p*Math.PI*4+d.seed)*d.width*.18;f=Math.max(f,_(T,(d.width+R)/2,.75))}if(h<=.001&&f<=.001)continue;const g=(a*e+c)*4;let u=0,m=0,y=0,v=0;h>0&&(u=x[0],m=x[1],y=x[2],v=h*255),f>0&&(u=u*(1-f)+O[0]*f,m=m*(1-f)+O[1]*f,y=y*(1-f)+O[2]*f,v=Math.max(v,f*255)),i[g]=u,i[g+1]=m,i[g+2]=y,i[g+3]=v;const E=a*e+c;f>=.5?s[E]=0:h>=.5&&(s[E]=1)}return{cel:o,regions:s}}function it(r){const{width:e,height:t,seed:n,motionPhase:o,includeBackground:s,includeCel:i}=r,a=e/960,c=s?rt(n,e,t).img:A(e,t);if(!s){c.data.fill(255);for(let g=0;g<e*t;g++)c.data[g*4+3]=255}const l=ot(a),h={x:o,y:o*.35},x=i?st(l,e,t,h):{cel:A(e,t),regions:new Uint8Array(e*t).fill(2)},f=A(e,t);for(let g=0;g<e*t;g++){const u=g*4,m=x.cel.data[u+3]/255;f.data[u]=x.cel.data[u]*m+c.data[u]*(1-m),f.data[u+1]=x.cel.data[u+1]*m+c.data[u+1]*(1-m),f.data[u+2]=x.cel.data[u+2]*m+c.data[u+2]*(1-m),f.data[u+3]=255}return{composite:f,background:c,cel:x.cel,regions:x.regions}}function at(r,e,t){const n=it(r),o=Z(n.composite,e,t);return{scene:n,sd:o}}function ct(r){const e=r.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,premultipliedAlpha:!1,powerPreference:"high-performance"});if(!e)throw new Error("当前环境不支持 WebGL2，请使用最新版 Chrome/Edge/Firefox");const t=e.getExtension("EXT_disjoint_timer_query_webgl2");return{gl:e,timerExt:t}}function Q(r,e,t){const n=r.createShader(e);if(!n)throw new Error("createShader 返回空");if(r.shaderSource(n,t),r.compileShader(n),!r.getShaderParameter(n,r.COMPILE_STATUS)){const o=r.getShaderInfoLog(n)??"未知编译错误";throw r.deleteShader(n),new Error(`Shader 编译失败:
${o}
--- 源码 ---
${t}`)}return n}function M(r,e,t){const n=Q(r,r.VERTEX_SHADER,e),o=Q(r,r.FRAGMENT_SHADER,t),s=r.createProgram();if(!s)throw new Error("createProgram 返回空");if(r.attachShader(s,n),r.attachShader(s,o),r.linkProgram(s),r.deleteShader(n),r.deleteShader(o),!r.getProgramParameter(s,r.LINK_STATUS)){const i=r.getProgramInfoLog(s)??"未知链接错误";throw r.deleteProgram(s),new Error(`Program 链接失败: ${i}`)}return{program:s,uniforms:new Map}}function S(r,e,t){let n=r.uniforms.get(t);return n===void 0&&(n=e.getUniformLocation(r.program,t),r.uniforms.set(t,n)),n}class U{constructor(e){this.gl=e;const t=e.createTexture(),n=e.createFramebuffer();if(!t||!n)throw new Error("RenderTarget 资源分配失败");this.texture=t,this.framebuffer=n}texture;framebuffer;width=0;height=0;ensureSize(e,t){if(this.width===e&&this.height===t)return;const n=this.gl;n.bindTexture(n.TEXTURE_2D,this.texture),n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,e,t,0,n.RGBA,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,this.framebuffer),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,this.texture,0);const o=n.checkFramebufferStatus(n.FRAMEBUFFER);if(o!==n.FRAMEBUFFER_COMPLETE)throw new Error(`Framebuffer 不完整: 0x${o.toString(16)} (${e}x${t})`);this.width=e,this.height=t}bind(){this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,this.framebuffer),this.gl.viewport(0,0,this.width,this.height)}dispose(){this.gl.deleteTexture(this.texture),this.gl.deleteFramebuffer(this.framebuffer)}}function lt(r){const e=r.createVertexArray();if(!e)throw new Error("VAO 分配失败");const t=r.createBuffer();if(!t)throw new Error("顶点缓冲分配失败");const n=new Float32Array([-1,-1,0,0,3,-1,2,0,-1,3,0,2]);return r.bindVertexArray(e),r.bindBuffer(r.ARRAY_BUFFER,t),r.bufferData(r.ARRAY_BUFFER,n,r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,16,0),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,2,r.FLOAT,!1,16,8),r.bindVertexArray(null),e}const L=`#version 300 es
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
`,ut=`#version 300 es
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
`,ht=`#version 300 es
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
`,ft=`#version 300 es
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
`,dt=`#version 300 es
// 可分离放大垂直 pass：Lanczos3 与 Mitchell-Netravali 可切换。
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
  float srcY = vUv.y * srcSize.y - 0.5;
  float base = floor(srcY);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int j = -2; j <= 3; j++) {
    float sy = base + float(j);
    float w = kernelWeight(srcY - sy);
    float cy = clamp((sy + 0.5) / srcSize.y, 0.0, 1.0);
    acc += texture(uColor, vec2(vUv.x, cy)) * w;
    wsum += w;
  }
  outColor = acc / wsum;
}
`,xt=`#version 300 es
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
`;class mt{ctx;gl;vao;classifyProg;dilateProg;lanczosHProg;lanczosVProg;compositeProg;maskA;maskB;lzH;lz4k;out4k;srcTexture;srcWidth=0;srcHeight=0;pendingQuery=null;lastGpuMs=null;constructor(e){this.ctx=ct(e),this.gl=this.ctx.gl,this.vao=lt(this.gl),this.classifyProg=M(this.gl,L,ut),this.dilateProg=M(this.gl,L,ht),this.lanczosHProg=M(this.gl,L,ft),this.lanczosVProg=M(this.gl,L,dt),this.compositeProg=M(this.gl,L,xt),this.maskA=new U(this.gl),this.maskB=new U(this.gl),this.lzH=new U(this.gl),this.lz4k=new U(this.gl),this.out4k=new U(this.gl);const t=this.gl.createTexture();if(!t)throw new Error("源纹理分配失败");this.srcTexture=t,this.gl.bindTexture(this.gl.TEXTURE_2D,t),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MIN_FILTER,this.gl.LINEAR),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MAG_FILTER,this.gl.LINEAR),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_WRAP_S,this.gl.CLAMP_TO_EDGE),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_WRAP_T,this.gl.CLAMP_TO_EDGE)}get supportsGpuTimer(){return this.ctx.timerExt!==null}uploadSourcePixels(e,t,n){const o=this.gl;return o.bindTexture(o.TEXTURE_2D,this.srcTexture),o.pixelStorei(o.UNPACK_FLIP_Y_WEBGL,!0),o.pixelStorei(o.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,e,t,0,o.RGBA,o.UNSIGNED_BYTE,n),this.srcWidth=e,this.srcHeight=t,{width:e,height:t}}beginQuery(){const e=this.ctx.timerExt;if(!e)return null;const t=this.gl.createQuery();return t?(this.gl.beginQuery(e.TIME_ELAPSED_EXT,t),t):null}collectLastQuery(){const e=this.ctx.timerExt;if(!e||!this.pendingQuery)return null;const t=this.gl.getQueryParameter(this.pendingQuery,this.gl.QUERY_RESULT_AVAILABLE),n=this.gl.getParameter(e.GPU_DISJOINT_EXT);if(t&&!n){const o=this.gl.getQueryParameter(this.pendingQuery,this.gl.QUERY_RESULT);return this.gl.deleteQuery(this.pendingQuery),this.pendingQuery=null,o/1e6}return t&&(this.gl.deleteQuery(this.pendingQuery),this.pendingQuery=null),null}drawTo(e){e.bind(),this.gl.drawArrays(this.gl.TRIANGLES,0,3)}upscale(e){const t=this.gl,n=this.srcWidth,o=this.srcHeight;if(n===0||o===0)throw new Error("尚未上传源帧，请先调用 uploadSourcePixels()");const s=Math.round(n*e.scale),i=Math.round(o*e.scale);this.maskA.ensureSize(n,o),this.maskB.ensureSize(n,o),this.lzH.ensureSize(s,o),this.lz4k.ensureSize(s,i),this.out4k.ensureSize(s,i);const a=performance.now(),c=this.beginQuery();t.bindVertexArray(this.vao),t.useProgram(this.classifyProg.program),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.srcTexture),t.uniform1i(S(this.classifyProg,t,"uColor"),0),t.uniform1f(S(this.classifyProg,t,"uInkThreshold"),e.inkThreshold/255),t.uniform1f(S(this.classifyProg,t,"uFlatThreshold"),e.flatThreshold/255),this.drawTo(this.maskA),t.useProgram(this.dilateProg.program);let l=this.maskA,h=this.maskB;const x=Math.max(0,Math.round(e.lineDilateRadius));for(let m=0;m<x;m++)t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,l.texture),t.uniform1i(S(this.dilateProg,t,"uMask"),0),this.drawTo(h),[l,h]=[h,l];const f=l;t.useProgram(this.lanczosHProg.program),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.srcTexture),t.uniform1i(S(this.lanczosHProg,t,"uColor"),0),t.uniform1f(S(this.lanczosHProg,t,"uScale"),e.scale),t.uniform1f(S(this.lanczosHProg,t,"uKernel"),e.upscaleKernel),this.drawTo(this.lzH),t.useProgram(this.lanczosVProg.program),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.lzH.texture),t.uniform1i(S(this.lanczosVProg,t,"uColor"),0),t.uniform1f(S(this.lanczosVProg,t,"uScale"),e.scale),t.uniform1f(S(this.lanczosVProg,t,"uKernel"),e.upscaleKernel),this.drawTo(this.lz4k),t.useProgram(this.compositeProg.program),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.srcTexture),t.uniform1i(S(this.compositeProg,t,"uColor"),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.lz4k.texture),t.uniform1i(S(this.compositeProg,t,"uLanczos"),1),t.activeTexture(t.TEXTURE2),t.bindTexture(t.TEXTURE_2D,f.texture),t.uniform1i(S(this.compositeProg,t,"uMask"),2),t.uniform1f(S(this.compositeProg,t,"uLineSoftness"),e.lineSoftness),t.uniform1f(S(this.compositeProg,t,"uRegionFeather"),e.regionFeather),t.uniform1f(S(this.compositeProg,t,"uTextureSharpen"),e.textureSharpen),t.uniform1f(S(this.compositeProg,t,"uFlatLevels"),e.flatLevels),t.uniform1f(S(this.compositeProg,t,"uScale"),e.scale),this.drawTo(this.out4k),t.flush();const g=performance.now()-a;c&&(t.endQuery(this.ctx.timerExt.TIME_ELAPSED_EXT),this.pendingQuery&&this.gl.deleteQuery(this.pendingQuery),this.pendingQuery=c);const u=this.collectLastQuery()??this.lastGpuMs??g;return this.lastGpuMs=u,{texture:this.out4k.texture,width:s,height:i,metrics:{elapsedMs:u,upscaleMs:u,outputWidth:s,outputHeight:i}}}readPixels(){const e=this.gl,{width:t,height:n}=this.out4k,o=new Uint8Array(t*n*4);this.out4k.bind(),e.readPixels(0,0,t,n,e.RGBA,e.UNSIGNED_BYTE,o);const s=new Uint8ClampedArray(new ArrayBuffer(o.length)),i=t*4;for(let a=0;a<n;a++){const c=(n-1-a)*i;s.set(o.subarray(c,c+i),a*i)}return{width:t,height:n,data:s}}blitToCanvas(e){const t=this.gl;e.width=this.out4k.width,e.height=this.out4k.height,t.bindFramebuffer(t.READ_FRAMEBUFFER,this.out4k.framebuffer),t.bindFramebuffer(t.DRAW_FRAMEBUFFER,null),t.blitFramebuffer(0,0,this.out4k.width,this.out4k.height,0,0,e.width,e.height,t.COLOR_BUFFER_BIT,t.LINEAR),t.bindFramebuffer(t.FRAMEBUFFER,null)}dispose(){const e=this.gl;[this.maskA,this.maskB,this.lzH,this.lz4k,this.out4k].forEach(t=>t.dispose()),e.deleteTexture(this.srcTexture),this.pendingQuery&&e.deleteQuery(this.pendingQuery)}}const gt="cel-remaster-db",pt=1;let B=null;function H(){return B||(B=new Promise((r,e)=>{const t=indexedDB.open(gt,pt);t.onupgradeneeded=()=>{const n=t.result;n.objectStoreNames.contains("episodes")||n.createObjectStore("episodes",{keyPath:"id"}),n.objectStoreNames.contains("shots")||n.createObjectStore("shots",{keyPath:"id"}).createIndex("episodeId","episodeId",{unique:!1}),n.objectStoreNames.contains("frames")||n.createObjectStore("frames",{keyPath:"id"}).createIndex("shotId","shotId",{unique:!1})},t.onsuccess=()=>r(t.result),t.onerror=()=>e(t.error)}),B)}function P(r,e,t){return H().then(n=>new Promise((o,s)=>{const i=n.transaction(r,e),a=t(i.objectStore(r));a.onsuccess=()=>o(a.result),a.onerror=()=>s(a.error)}))}async function Rt(r,e){const t={id:V("ep"),code:r,title:e,createdAt:Date.now()};return await P("episodes","readwrite",n=>n.put(t)),t}async function Pt(){return(await P("episodes","readonly",e=>e.getAll())).sort((e,t)=>e.code.localeCompare(t.code))}async function At(r,e,t,n){const o={id:V("shot"),episodeId:r,code:e,name:t,createdAt:Date.now(),params:n,frames:[]};return await P("shots","readwrite",s=>s.put(o)),o}async function Ct(r){return(await P("shots","readonly",t=>t.index("episodeId").getAll(r))).sort((t,n)=>t.code.localeCompare(n.code))}async function Mt(r){await P("shots","readwrite",e=>e.put(r))}async function Ut(r){const e=await H();await new Promise((t,n)=>{const o=e.transaction(["shots","frames"],"readwrite");o.objectStore("shots").delete(r);const i=o.objectStore("frames").index("shotId").openCursor(IDBKeyRange.only(r));i.onsuccess=()=>{const a=i.result;a&&(a.delete(),a.continue())},o.oncomplete=()=>t(),o.onerror=()=>n(o.error)})}async function $(r){await P("frames","readwrite",e=>e.put(r))}async function Lt(r){return(await P("frames","readonly",t=>t.index("shotId").getAll(r))).sort((t,n)=>t.index-n.index)}class _t{canvas=null;pipeline=null;initError=null;ensure(){if(this.initError)throw this.initError;if(!this.pipeline)try{this.canvas=new OffscreenCanvas(64,64),this.pipeline=new mt(this.canvas)}catch(e){throw this.initError=e,e}return this.pipeline}get initErrorMessage(){return this.initError?.message??null}get gpuTimerSupported(){return this.pipeline?.supportsGpuTimer??!1}async synthesizeShotFrames(e,t,n,o,s,i){const a=new Map,c=[];for(let l=0;l<t;l++){const h={seed:i,width:n*s,height:o*s,motionPhase:l*.75,includeBackground:!0,includeCel:!0},{scene:x,sd:f}=at(h,n,o),g=await K(f),u={shotId:e,id:`frame_${e}_${l.toString(3).padStart(3,"0")}`,index:l,sourceBlob:g,width:n,height:o,targetWidth:n*s,targetHeight:o*s};await $(u),c.push(u),a.set(u.id,x)}return{frames:c,references:a}}async processFrame(e,t){if(!e.sourceBlob)throw new Error(`帧 ${e.id} 缺少源素材`);const n=await tt(e.sourceBlob);let o,s;try{const c=this.ensure();c.uploadSourcePixels(n.width,n.height,n.data),o=c.upscale(t).metrics;const h=c.readPixels();s={width:h.width,height:h.height,data:h.data}}finally{}const i=await K(s),a={...e,resultBlob:i,paramsSnapshot:{...t},elapsedMs:o.elapsedMs,targetWidth:s.width,targetHeight:s.height};return await $(a),{frame:a,metrics:o}}async processShot(e,t,n){const o=[],s=t.length;for(let i=0;i<s;i++){const a=await this.processFrame(t[i],e.params);o.push(a),n?.({done:i+1,total:s,currentFrameId:a.frame.id,metrics:a.metrics})}return o}async upscaleImage(e,t){const n=this.ensure();n.uploadSourcePixels(e.width,e.height,e.data);const o=n.upscale(t),s=n.readPixels();return{image:{width:s.width,height:s.height,data:s.data},metrics:o.metrics}}dispose(){this.pipeline?.dispose()}}export{vt as D,_t as P,St as a,A as b,Tt as c,Rt as d,Ct as e,At as f,at as g,Mt as h,bt as i,Lt as j,Ut as k,Pt as l,V as m,tt as n,Et as p,wt as u};
//# sourceMappingURL=pipeline-service-1hYrmd4H.js.map
