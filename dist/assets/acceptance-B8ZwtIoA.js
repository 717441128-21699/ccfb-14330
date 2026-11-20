import{P as z,D as V,g as q,c as J,u as Q,p as X,a as Y,b as Z,i as tt}from"./pipeline-service-1hYrmd4H.js";const d=960,b=540,y=240,S=135,P=4,A=6,st=20260817;function et(){const s=document.getElementById("app");s.innerHTML=`
    <div class="acceptance">
      <h1>验收指标自测（合成赛璐珞 + 水彩背景）</h1>
      <div class="sub">
        流程：4K 理想母版 → 盒式下采样成标清（${y}×${S}）→ WebGL2 管线放大回 ${d}×${b} → 与母版比对。
        验收线：PSNR ≥ 32 dB；单帧 ≤ 500 ms；双线不合并；平涂无色差。
      </div>
      <div class="row" style="margin-bottom:14px">
        <button id="run" class="btn primary" style="max-width:220px">开始跑验收（${A} 帧）</button>
      </div>
      <div id="metrics"></div>
      <div id="regions"></div>
      <div id="stability"></div>
      <h3 style="margin-top:20px">第 1 帧：理想母版 / 标清输入 / 放大结果 / 差值图</h3>
      <div class="shots" id="shots"></div>
      <h3>运行日志</h3>
      <div class="log-box" id="log"></div>
    </div>`}function D(s){const c=document.getElementById("log");c.textContent+=`[${new Date().toLocaleTimeString()}] ${s}
`,c.scrollTop=c.scrollHeight}function x(s,c,i,n=""){return`<div class="metric-card"><div class="k">${s}</div><div class="v ${i===null?"":i?"good":"bad"}">${c}${n}</div></div>`}async function at(){const s=document.getElementById("run");s.classList.add("disabled");try{D("初始化 WebGL2 管线…");const c=new z,i={...V,scale:P},n=[],o=[],M=[],m=[],a=[];for(let t=0;t<A;t++){const{scene:e,sd:l}=q({seed:st,width:d,height:b,motionPhase:t*.75,includeBackground:!0,includeCel:!0},y,S);D(`帧 ${t+1}: 合成完成，执行 GPU 放大…`);const{image:r,metrics:h}=await c.upscaleImage(l,i);m.push(h.elapsedMs),n.push(r),o.push(e.composite),M.push(l);const p=J(l,i.inkThreshold,i.flatThreshold);a.push(Q(p,y,S,d,b)),D(`帧 ${t+1}: GPU 耗时 ${h.elapsedMs.toFixed(2)} ms`)}const u=n.map((t,e)=>X(t,o[e])),v=u.reduce((t,e)=>t+e.psnrDb,0)/u.length,g=Y(n[0],o[0],a[0]),G={psnrDb:u[0].psnrDb,mse:u[0].mse,width:d,height:b,linePsnrDb:g.line,flatPsnrDb:g.flat,backgroundPsnrDb:g.background},k=[...m].sort((t,e)=>t-e),L=k[Math.floor(k.length/2)],W=k[k.length-1];let E=0,T=0;const _=t=>{const e=new Float32Array(t.width*t.height);for(let l=0;l<e.length;l++){const r=l*4,h=.299*t.data[r]+.587*t.data[r+1]+.114*t.data[r+2];e[l]=h<i.inkThreshold?1:0}return e},B=n.map(_);for(let t=1;t<B.length;t++){let e=1/0;for(const l of[0,1,-1]){let r=0,h=0;for(let p=0;p<b;p++)for(let f=1;f<d-1;f++){const $=p*d+f;r+=Math.abs(B[t][$]-B[t-1][$+l]),h++}e=Math.min(e,r/h)}E+=e,T++}const K=E/Math.max(1,T),I=Math.round(430),R=(t,e,l)=>{let r=0,h=!1;for(let p=l;p<d;p++){const f=(e*d+p)*4,C=.299*t.data[f]+.587*t.data[f+1]+.114*t.data[f+2]<i.inkThreshold;C&&!h&&r++,h=C}return r},U=R(o[0],I,Math.round(170)),N=R(n[0],I,Math.round(170))>=U;let F=0,w=0;const O=new Map,j=t=>{const e=t%d,l=Math.floor(t/d);if(e===0||l===0||e===d-1||l===b-1)return!1;for(let r=-1;r<=1;r++)for(let h=-1;h<=1;h++)if(a[0][(l+r)*d+(e+h)]!==1)return!1;return!0};for(let t=0;t<d*b;t++){if(!j(t))continue;const e=t*4,l=Math.abs(n[0].data[e]-o[0].data[e])+Math.abs(n[0].data[e+1]-o[0].data[e+1])+Math.abs(n[0].data[e+2]-o[0].data[e+2]);w=Math.max(w,l);const r=Math.floor(t%d/P),p=Math.floor(Math.floor(t/d)/P)*y+r,f={r:n[0].data[e],g:n[0].data[e+1],b:n[0].data[e+2]},$=O.get(p);$?F=Math.max(F,Math.abs($.r-f.r)+Math.abs($.g-f.g)+Math.abs($.b-f.b)):O.set(p,f)}const H={psnr:G,medianMs:L,maxMs:W,lineDrift:K,parallelLinesOk:N,flatMaxDelta:F,flatTruthDelta:w,params:i};nt(H,u.map(t=>t.psnrDb),g.counts),await dt(o[0],M[0],n[0]),D(`验收完成：PSNR=${v.toFixed(2)}dB 中位耗时=${L.toFixed(1)}ms 双线=${N?"保持分离":"被合并！"}`),c.dispose(),window.__acceptanceResult=H}catch(c){D(`失败：${c.stack??c}`)}finally{s.classList.remove("disabled")}}function nt(s,c,i){const n=s.psnr.psnrDb>=32,o=s.maxMs<=500,M=s.lineDrift<=.02,m=s.flatMaxDelta<=2;document.getElementById("metrics").innerHTML=`
    <div class="metric-grid">
      ${x("整体 PSNR（第1帧）",s.psnr.psnrDb.toFixed(2),n," dB")}
      ${x("性能：中位耗时",s.medianMs.toFixed(1),o," ms")}
      ${x("性能：最大耗时",s.maxMs.toFixed(1),o," ms")}
      ${x("帧间线宽漂移率",(s.lineDrift*100).toFixed(2),M,"%")}
      ${x("平行双线",s.parallelLinesOk?"保持分离":"被合并",s.parallelLinesOk)}
      ${x("平涂块内色差",String(s.flatMaxDelta),m," /255")}
    </div>
    <div class="sub">逐帧 PSNR：${c.map(u=>u.toFixed(2)+"dB").join("，")}（验收线 32 dB）
    <br/>平涂对真值最大偏差 ${s.flatTruthDelta}（受标清下采样信息损失限制，仅报告；块内色差才是“平涂必须单色”的硬指标）</div>`;const a=u=>Number.isFinite(u)?u.toFixed(2)+" dB":"∞ dB";document.getElementById("regions").innerHTML=`
    <h3>分区 PSNR（第 1 帧，像素占比 线/平涂/背景 =
      ${(i[0]/(d*b)*100).toFixed(1)}% /
      ${(i[1]/(d*b)*100).toFixed(1)}% /
      ${(i[2]/(d*b)*100).toFixed(1)}%）</h3>
    <table class="region-table">
      <tr><th>分区</th><th>PSNR</th><th>处理策略</th></tr>
      <tr><td>墨线区</td><td>${a(s.psnr.linePsnrDb)}</td><td>覆盖率场重建，膨胀防毛刺，同公式逐帧一致</td></tr>
      <tr><td>平涂区</td><td>${a(s.psnr.flatPsnrDb)}</td><td>双线性常量色 + 可选量化，无渐变带</td></tr>
      <tr><td>水彩背景区</td><td>${a(s.psnr.backgroundPsnrDb)}</td><td>Lanczos3/双线性混合，保纸纹压振铃</td></tr>
    </table>`,document.getElementById("stability").innerHTML=`
    <h3>判定汇总</h3>
    <table class="region-table">
      <tr><th>验收项</th><th>要求</th><th>实测</th><th>结论</th></tr>
      <tr><td>整体 PSNR</td><td>≥ 32 dB</td><td>${s.psnr.psnrDb.toFixed(2)} dB</td><td>${n?"✅ 通过":"❌ 未达标"}</td></tr>
      <tr><td>单帧性能</td><td>≤ 500 ms</td><td>${s.maxMs.toFixed(1)} ms（最大）</td><td>${o?"✅ 通过":"❌ 未达标"}</td></tr>
      <tr><td>帧间线宽</td><td>漂移率 ≤ 2%</td><td>${(s.lineDrift*100).toFixed(2)}%</td><td>${M?"✅ 通过":"❌ 未达标"}</td></tr>
      <tr><td>平行双线</td><td>不糊成一根</td><td>${s.parallelLinesOk?"段数一致":"段数减少"}</td><td>${s.parallelLinesOk?"✅ 通过":"❌ 未达标"}</td></tr>
      <tr><td>平涂均匀性</td><td>块内色差 ≤ 2</td><td>${s.flatMaxDelta}</td><td>${m?"✅ 通过":"❌ 未达标"}</td></tr>
    </table>`}async function dt(s,c,i){const n=document.getElementById("shots");n.innerHTML="";const o=Z(d,b);for(let m=0;m<d*b;m++){const a=m*4;o.data[a]=Math.min(255,Math.abs(s.data[a]-i.data[a])*4),o.data[a+1]=Math.min(255,Math.abs(s.data[a+1]-i.data[a+1])*4),o.data[a+2]=Math.min(255,Math.abs(s.data[a+2]-i.data[a+2])*4),o.data[a+3]=255}const M=[["4K 理想母版（真值）",s],[`标清输入 ${y}×${S}（放大显示）`,c],["WebGL2 放大结果",i],["差值图 ×4",o]];for(const[m,a]of M){const u=document.createElement("div"),v=document.createElement("div");v.className="sub",v.textContent=m;const g=document.createElement("canvas");g.width=a.width,g.height=a.height,g.getContext("2d").putImageData(new ImageData(a.data,a.width,a.height),0,0),u.append(v,g),n.appendChild(u)}await Promise.all(M.map(async([,m])=>(await tt(m)).close()))}et();document.getElementById("run").addEventListener("click",()=>void at());
//# sourceMappingURL=acceptance-B8ZwtIoA.js.map
