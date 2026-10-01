(() => {
  'use strict';

  const demos = [
    ['Ray-traced spheres', 'Analytic sphere intersections, hard shadows, specular light, and reflected color rendered per pixel.', 'RAY', '3D'],
    ['Ray-marched torus', 'A signed-distance torus twists through a neon-lit procedural space.', 'SDF', '3D'],
    ['Neon tunnel', 'Polar coordinates and repeating geometry create an endless synthwave flight.', 'GLSL', '3D'],
    ['Fractal fold', 'Repeated space folds build crystalline geometry from a compact distance function.', 'FRACTAL', '3D'],
    ['Metaball field', 'Smooth-min blending joins animated spheres into one liquid surface.', 'SDF', '3D'],
    ['Infinite grid', 'A perspective ground plane, horizon glow, and procedural grid with no texture files.', 'GRID', '3D'],
    ['Chrome orb', 'Environment reflections, Fresnel color, and a glossy procedural sphere.', 'PBR', '3D'],
    ['Terrain scan', 'Layered waves form a height field scanned by a moving light band.', 'HEIGHT', '3D'],
    ['Particle galaxy', 'A volumetric spiral assembled from repeated points and accumulated light.', 'VOLUME', '3D'],
    ['Shader stress test', 'Dense iterative geometry and color math provide a compact GPU workout.', 'BENCH', '3D'],
    ['Plasma', 'Four sine fields mix into a constantly shifting indexed-color surface.', 'PLASMA', 'RETRO'],
    ['Checker warp', 'A perspective checkerboard bends like the classic 16-bit floor effect.', 'WARP', 'RETRO'],
    ['Copper bars', 'Raster-timed color bands recreate a signature home-computer display trick.', 'COPPER', 'RETRO'],
    ['Boing ball', 'A shaded red-and-white checker sphere bounces over a grid floor.', 'BOING', 'RETRO'],
    ['Starfield', 'Layered points accelerate from screen center to simulate hyperspace.', 'STARS', 'RETRO'],
    ['Rotozoom', 'A tiny procedural texture rotates and scales beneath every output pixel.', 'ROTO', 'RETRO'],
    ['Sine scroller', 'A pixel-style greeting travels across the screen on a wave path.', 'SCROLL', 'RETRO'],
    ['Pixel fire', 'A cellular heat buffer rises into a palette-mapped flame simulation.', 'FIRE', 'RETRO'],
    ['Blitter bobs', 'Colorful sprite-like circles trail across calculated motion paths.', 'BOBS', 'RETRO'],
    ['Moiré rings', 'Two moving ring fields interfere to form animated optical patterns.', 'MOIRE', 'RETRO']
  ].map((item, index) => ({ title: item[0], description: item[1], badge: item[2], group: item[3], index }));

  const glCanvas = document.querySelector('#gl-canvas');
  const retroCanvas = document.querySelector('#retro-canvas');
  const retro = retroCanvas.getContext('2d', { alpha: false });
  const title = document.querySelector('#active-demo-title');
  const number = document.querySelector('#active-demo-number');
  const engine = document.querySelector('#active-demo-engine');
  const description = document.querySelector('#active-demo-description');
  const fpsMeter = document.querySelector('#fps-meter');
  const pauseButton = document.querySelector('#pause-demo');
  const qualitySelect = document.querySelector('#quality-select');
  const errorBox = document.querySelector('#webgl-error');
  const viewport = document.querySelector('#interactive-viewport');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let active = 0;
  let paused = false;
  let quality = Number(qualitySelect.value);
  let start = performance.now();
  let previous = start;
  let fpsStart = start;
  let frames = 0;
  let animationId = 0;
  let stars = [];
  let fire = null;
  const pointer = { x: .5, y: .5, down: false };
  let pulse = 0;
  let hueShift = 0;

  function demoCard(demo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'demo-card';
    button.dataset.demo = demo.index;
    button.setAttribute('aria-label', `Run ${demo.title}`);
    button.innerHTML = `<span class="demo-thumb thumb-${demo.index}"><i></i></span><span><small>${demo.group === '3D' ? `3D_${String(demo.index + 1).padStart(2, '0')}` : `FX_${String(demo.index - 9).padStart(2, '0')}`} · ${demo.badge}</small><strong>${demo.title}</strong><em>${demo.description}</em></span><b>RUN →</b>`;
    button.addEventListener('click', () => selectDemo(demo.index, false));
    return button;
  }

  demos.slice(0, 10).forEach(demo => document.querySelector('#three-d-grid').append(demoCard(demo)));
  demos.slice(10).forEach(demo => document.querySelector('#retro-grid').append(demoCard(demo)));

  const gl = glCanvas.getContext('webgl', { antialias: false, powerPreference: 'high-performance' });
  let program = null;
  let uniforms = {};

  const vertexSource = `
    attribute vec2 a_position;
    void main(){ gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  const fragmentSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_pointer;
    uniform float u_pulse;
    uniform int u_mode;
    #define PI 3.14159265

    mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    vec3 pal(float t){ return .55+.45*cos(6.283*(vec3(.08,.42,.72)*t+vec3(.02,.12,.22))); }
    float sdSphere(vec3 p,float r){ return length(p)-r; }
    float sdTorus(vec3 p,vec2 t){ vec2 q=vec2(length(p.xz)-t.x,p.y); return length(q)-t.y; }
    float smin(float a,float b,float k){ float h=max(k-abs(a-b),0.0)/k; return min(a,b)-h*h*k*.25; }

    float scene(vec3 p){
      float t=u_time;
      if(u_mode==0){
        float a=sdSphere(p-vec3(-.75,.05,0.),.72);
        float b=sdSphere(p-vec3(.62,.18,.28),.55);
        return min(min(a,b),p.y+1.0);
      }
      if(u_mode==1){ p.xz*=rot(t*.3); p.xy*=rot(sin(t*.4)*.6); return sdTorus(p,vec2(1.0,.24)); }
      if(u_mode==3){
        for(int i=0;i<5;i++){ p=abs(p)-vec3(.55,.48,.5); p.xy*=rot(.65+t*.04); p*=1.12; }
        return length(p)-.3;
      }
      if(u_mode==4){
        float d=9.0;
        for(int i=0;i<5;i++){ float fi=float(i); vec3 c=vec3(sin(t*.7+fi*1.7),cos(t*.8+fi*1.1),sin(t*.55+fi*2.2))*.72; d=smin(d,sdSphere(p-c,.48),.5); }
        return d;
      }
      if(u_mode==6){ return sdSphere(p,.95); }
      if(u_mode==9){
        p.xz*=rot(t*.18);
        float d=99.0;
        for(int i=0;i<7;i++){ p=abs(p)-vec3(.45,.35,.4); p.yz*=rot(.72); d=min(d,length(p)-.18); }
        return d;
      }
      return 9.0;
    }

    vec3 normalAt(vec3 p){ float e=.002; return normalize(vec3(scene(p+vec3(e,0,0))-scene(p-vec3(e,0,0)),scene(p+vec3(0,e,0))-scene(p-vec3(0,e,0)),scene(p+vec3(0,0,e))-scene(p-vec3(0,0,e)))); }

    vec3 rimeColor(float rim, vec3 base){ return rim*base*.7; }
    vec3 march(vec3 ro,vec3 rd){
      float depth=0.0; float glow=0.0;
      for(int i=0;i<84;i++){ vec3 p=ro+rd*depth; float d=scene(p); glow+=.002/(.02+abs(d)); if(abs(d)<.001||depth>18.0) break; depth+=d*.72; }
      if(depth>18.0) return vec3(.015,.025,.07)+pal(rd.y*.5+.5)*pow(max(rd.y+.2,0.0),3.0)*.18;
      vec3 p=ro+rd*depth, n=normalAt(p), light=normalize(vec3(-.5,.8,-.6));
      float diff=max(dot(n,light),0.0), spec=pow(max(dot(reflect(-light,n),-rd),0.0),40.0), rim=pow(1.0-max(dot(n,-rd),0.0),3.0);
      vec3 base=pal(depth*.08+float(u_mode)*.11);
      if(u_mode==0) base=mix(vec3(.1,.75,.7),vec3(1.,.3,.55),step(.05,p.x));
      if(u_mode==6) base=mix(pal(reflect(rd,n).y*.7+u_time*.03),vec3(.9,.95,1.),spec);
      return base*(.16+diff*.9)+spec+rimeColor(rim,base)+min(glow*.002, .22)*base;
    }
    vec3 tunnel(vec2 uv){
      float r=max(length(uv),.001), a=atan(uv.y,uv.x);
      float z=1.0/r+u_time*.5;
      float bands=smoothstep(.07,0.0,abs(fract(z*1.4)-.5)-.43);
      float spokes=smoothstep(.08,0.0,abs(fract(a/PI*6.0+sin(z)*.1)-.5)-.42);
      return pal(z*.14+a*.2)*(bands+spokes)*(.18/r);
    }

    vec3 gridScene(vec2 uv){
      vec3 ro=vec3(0.,1.45,-3.), rd=normalize(vec3(uv.x,uv.y-.2,1.45));
      rd.yz*=rot(-.23); float t=(-1.0-ro.y)/rd.y;
      if(t<0.0) return pal(uv.y*.2)*pow(max(uv.y+.25,0.0),3.0)*.25;
      vec3 p=ro+rd*t; float gx=min(abs(fract(p.x)-.5),abs(fract(p.z)-.5));
      float line=1.0-smoothstep(.018,.07,gx); float fade=exp(-t*.13);
      return mix(vec3(.025,.03,.09),pal(p.z*.035+u_time*.04),line)*fade+vec3(.95,.18,.5)*pow(fade,5.0)*.25;
    }

    vec3 terrain(vec2 uv){
      vec3 col=vec3(.02,.025,.07);
      for(int i=0;i<34;i++){ float fi=float(i), z=fi/34.0; float y=-.62+z*.82+.08*sin(uv.x*8.0+z*14.0+u_time)+.035*sin(uv.x*23.0-z*18.0); float line=.005/abs(uv.y-y); col+=pal(z+u_time*.02)*line*(1.0-z)*.35; }
      return col;
    }

    vec3 galaxy(vec2 uv){
      vec3 col=vec3(.01,.015,.045); vec2 p=uv;
      for(int i=0;i<18;i++){ float fi=float(i); p*=rot(.22+sin(u_time*.1)*.01); float a=atan(p.y,p.x); float r=length(p); vec2 cell=fract(p*(3.0+fi*.14)+vec2(fi*.37,a))-0.5; float star=.004/(.002+dot(cell,cell)); col+=pal(fi*.08+u_time*.015)*star*exp(-r*.8)*.055; p*=1.025; }
      return col;
    }

    void main(){
      vec2 uv=(gl_FragCoord.xy*2.0-u_resolution.xy)/min(u_resolution.x,u_resolution.y);
      vec2 cursor=(u_pointer-.5)*2.0;
      uv+=cursor*vec2(.24,-.18);
      vec3 col;
      if(u_mode==2) col=tunnel(uv);
      else if(u_mode==5) col=gridScene(uv);
      else if(u_mode==7) col=terrain(uv);
      else if(u_mode==8) col=galaxy(uv);
      else {
        vec3 ro=vec3(0.,0.,-3.4), rd=normalize(vec3(uv,1.55));
        if(u_mode==3||u_mode==9){ ro.xz*=rot(u_time*.12); rd.xz*=rot(u_time*.12); }
        col=march(ro,rd);
      }
      col=pow(max(col,0.0),vec3(.82));
      float ring=exp(-18.0*abs(length(uv-cursor*.35)-u_pulse*.7));
      col+=pal(u_time*.08+u_pulse)*ring*u_pulse*.8;
      col*=1.0-.18*dot(uv*.5,uv*.5);
      gl_FragColor=vec4(col,1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function setupWebGL() {
    if (!gl) return false;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = {
        time: gl.getUniformLocation(program, 'u_time'),
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        mode: gl.getUniformLocation(program, 'u_mode'),
        pointer: gl.getUniformLocation(program, 'u_pointer'),
        pulse: gl.getUniformLocation(program, 'u_pulse')
      };
      return true;
    } catch (error) {
      console.error('WebGL setup failed:', error);
      errorBox.textContent = `WebGL could not start: ${error.message}`;
      errorBox.hidden = false;
      return false;
    }
  }

  const webglReady = setupWebGL();

  function selectDemo(index, scroll) {
    active = index;
    start = performance.now();
    fire = null;
    pulse = .45;
    document.querySelectorAll('.demo-card').forEach(card => card.classList.toggle('active', Number(card.dataset.demo) === active));
    const demo = demos[active];
    title.textContent = demo.title;
    description.textContent = demo.description;
    number.textContent = active < 10 ? `3D_${String(active + 1).padStart(2, '0')}` : `FX_${String(active - 9).padStart(2, '0')}`;
    engine.textContent = active < 10 ? `WEBGL · ${demo.badge}` : `CANVAS 2D · ${demo.badge}`;
    glCanvas.hidden = active >= 10;
    retroCanvas.hidden = active < 10;
    errorBox.hidden = active >= 10 || webglReady;
    if (scroll) document.querySelector('#demo-stage').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function resizeCanvas(canvas, scale) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5) * scale;
    const width = Math.max(320, Math.round(rect.width * dpr));
    const height = Math.max(180, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  function renderWebGL(time) {
    if (!webglReady) return;
    resizeCanvas(glCanvas, quality);
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.useProgram(program);
    gl.uniform1f(uniforms.time, time);
    gl.uniform2f(uniforms.resolution, glCanvas.width, glCanvas.height);
    gl.uniform1i(uniforms.mode, active);
    gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
    gl.uniform1f(uniforms.pulse, pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function lowRes() {
    const ratio = retroCanvas.parentElement.clientWidth / Math.max(retroCanvas.parentElement.clientHeight, 1);
    const w = Math.max(240, Math.round(420 * quality));
    const h = Math.max(150, Math.round(w / ratio));
    if (retroCanvas.width !== w || retroCanvas.height !== h) { retroCanvas.width = w; retroCanvas.height = h; fire = null; }
    retro.imageSmoothingEnabled = false;
    return [w, h];
  }

  const palette = t => `hsl(${(185 + t * 170) % 360} 75% ${48 + Math.sin(t) * 10}%)`;
  function renderRetro(time) {
    const [w, h] = lowRes();
    const t = time + hueShift * .12;
    const mx = (pointer.x - .5) * w;
    const my = (pointer.y - .5) * h;
    retro.fillStyle = '#07101f';
    retro.fillRect(0, 0, w, h);

    if (active === 10 || active === 11 || active === 15 || active === 19) {
      const image = retro.createImageData(w, h), data = image.data;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        let v;
        if (active === 10) v = (Math.sin((x+mx)*.055+t*2)+Math.sin((y+my)*.07-t*1.4)+Math.sin((x+y)*.04+t)+Math.sin(Math.hypot(x-w/2-mx*.45,y-h/2-my*.45)*.065-t*2))*.25;
        else if (active === 11) { const px=(x-w/2-mx*.45)/(y*.035+4), py=(180+my*.6)/(y*.035+4)+t*8; v=((Math.floor(px)+Math.floor(py))&1)*2-1; }
        else if (active === 15) { const c=Math.cos(t*.65+mx*.006),s=Math.sin(t*.65+mx*.006), nx=(x-w/2)*c-(y-h/2)*s, ny=(x-w/2)*s+(y-h/2)*c; v=((Math.floor(nx/(18+8*Math.sin(t*.3)))^Math.floor(ny/(18+8*Math.sin(t*.3))))&1)*2-1; }
        else { const d1=Math.hypot(x-w*.42-mx*.4-Math.sin(t)*35,y-h*.5-my*.35),d2=Math.hypot(x-w*.58+mx*.4-Math.cos(t*.8)*35,y-h*.5+my*.35); v=Math.sin(d1*.24)+Math.sin(d2*.24); }
        const hue=(190+v*85+t*18+hueShift*22)%360, rgb=hslToRgb(hue/360,.78,.52);
        for(let oy=0;oy<2;oy++) for(let ox=0;ox<2;ox++){ const i=((y+oy)*w+x+ox)*4; data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255; }
      }
      retro.putImageData(image,0,0);
    } else if (active === 12) {
      for(let y=0;y<h;y++){ const wave=Math.sin(y*.09+t*2)*.5+.5; retro.fillStyle=`rgb(${60+wave*195},${30+wave*90},${120+wave*110})`; retro.fillRect(0,y,w,1); }
      retro.fillStyle='rgba(255,255,255,.8)'; for(let y=8;y<h;y+=22) retro.fillRect(0,y+Math.sin(t+y*.05)*4,w,2);
    } else if (active === 13) {
      const floor=h*.76, radius=Math.min(w,h)*(.22+pulse*.05), cx=w*.5+mx*.45, cy=floor-radius-Math.abs(Math.sin(t*1.8))*h*.35+my*.12;
      retro.strokeStyle='#2fc4bd'; for(let y=floor;y<h;y+=12) { retro.globalAlpha=(y-floor)/(h-floor); retro.beginPath();retro.moveTo(0,y);retro.lineTo(w,y);retro.stroke(); }
      retro.globalAlpha=1; retro.save();retro.beginPath();retro.arc(cx,cy,radius,0,PI2);retro.clip();
      const cell=radius/3; for(let yy=-3;yy<3;yy++) for(let xx=-3;xx<3;xx++){ retro.fillStyle=(xx+yy)&1?'#ef577d':'#fff2c7';retro.fillRect(cx+xx*cell,cy+yy*cell,cell+1,cell+1); }
      const g=retro.createRadialGradient(cx-radius*.35,cy-radius*.4,2,cx,cy,radius);g.addColorStop(0,'rgba(255,255,255,.65)');g.addColorStop(.7,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(0,0,40,.45)');retro.fillStyle=g;retro.fillRect(cx-radius,cy-radius,radius*2,radius*2);retro.restore();
    } else if (active === 14) {
      if(stars.length!==150) stars=Array.from({length:150},()=>({x:(Math.random()-.5)*w,y:(Math.random()-.5)*h,z:Math.random()*w+1}));
      retro.translate(w/2+mx*.4,h/2+my*.4); for(const star of stars){ star.z-=2.5+quality*4+pulse*9;if(star.z<1)star.z=w;const x=star.x/star.z*w,y=star.y/star.z*w,r=Math.max(.5,(1-star.z/w)*3);retro.fillStyle=palette(star.z*.01+t*.08+hueShift);retro.fillRect(x,y,r,r); } retro.setTransform(1,0,0,1,0,0);
    } else if (active === 16) {
      retro.font=`bold ${Math.max(20,w*.075)}px monospace`;retro.textBaseline='middle'; const msg='*** MARCIELO TECH WORKBENCH · WEBGL · LINUX · REPAIR · CREATE · '; const span=retro.measureText(msg).width; const x=w-(t*90)%span;
      for(let i=-1;i<3;i++){ const xx=x+i*span; for(let c=0;c<msg.length;c++){ const part=msg[c], px=xx+retro.measureText(msg.slice(0,c)).width, py=h*.5+my*.35+Math.sin(px*(.025+pointer.x*.018)+t*3)*h*(.12+pointer.y*.12);retro.fillStyle=palette(c*.09+t*.12+hueShift);retro.fillText(part,px,py); } }
    } else if (active === 17) {
      const fw=180,fh=120;if(!fire||fire.length!==fw*fh)fire=new Uint8Array(fw*fh);for(let x=0;x<fw;x++)fire[(fh-1)*fw+x]=Math.random()>.42?255:120;const spark=Math.max(2,Math.floor(pointer.x*fw));for(let x=Math.max(1,spark-7);x<Math.min(fw-1,spark+7);x++)fire[(fh-2)*fw+x]=Math.min(255,210+pulse*90);
      for(let y=0;y<fh-1;y++)for(let x=1;x<fw-1;x++){const below=(y+1)*fw+x;fire[y*fw+x]=Math.max(0,((fire[below]+fire[below-1]+fire[below+1]+fire[Math.min(fh-1,y+2)*fw+x])/4)-(Math.random()*10));}
      const img=retro.createImageData(fw,fh);for(let i=0;i<fire.length;i++){const v=fire[i]/255;img.data[i*4]=Math.min(255,v*440);img.data[i*4+1]=Math.max(0,(v-.25)*320);img.data[i*4+2]=Math.max(0,(v-.72)*500);img.data[i*4+3]=255;} const temp=document.createElement('canvas');temp.width=fw;temp.height=fh;temp.getContext('2d').putImageData(img,0,0);retro.drawImage(temp,0,0,w,h);
    } else if (active === 18) {
      retro.globalCompositeOperation='lighter';for(let i=0;i<30;i++){const a=t*(.45+i*.007)+i*.72,x=w/2+mx*.35+Math.sin(a*1.7+i)*w*.38,y=h/2+my*.35+Math.cos(a*1.25-i)*h*.35,r=7+(i%5)*3+pulse*8;retro.fillStyle=palette(i*.11+t*.1+hueShift);retro.beginPath();retro.arc(x,y,r,0,PI2);retro.fill();}retro.globalCompositeOperation='source-over';
    }

    if (pulse > .02) {
      retro.save();
      retro.globalCompositeOperation = 'lighter';
      retro.strokeStyle = `hsla(${190 + hueShift * 47},90%,70%,${Math.min(.9,pulse)})`;
      retro.lineWidth = 2 + pulse * 8;
      retro.beginPath();
      retro.arc(pointer.x*w, pointer.y*h, 12 + (1-pulse)*90, 0, PI2);
      retro.stroke();
      retro.restore();
    }
  }

  const PI2 = Math.PI * 2;
  function hslToRgb(h,s,l){let r,g,b;if(s===0){r=g=b=l;}else{const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);}return[Math.round(r*255),Math.round(g*255),Math.round(b*255)];}

  function frame(now) {
    animationId = requestAnimationFrame(frame);
    if (paused || document.hidden) return;
    const elapsed = (now - start) / 1000;
    if (active < 10) renderWebGL(elapsed); else renderRetro(elapsed);
    pulse = Math.max(0, pulse - .022);
    frames++;
    if (now - fpsStart > 600) { fpsMeter.textContent = `${Math.round(frames * 1000 / (now - fpsStart))} FPS`; frames=0;fpsStart=now; }
    previous = now;
  }

  function updatePointer(event) {
    const rect = viewport.getBoundingClientRect();
    pointer.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    pointer.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  }

  viewport.addEventListener('pointerdown', event => {
    pointer.down = true;
    updatePointer(event);
    pulse = 1;
    hueShift = (hueShift + .23) % 10;
    viewport.setPointerCapture?.(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (pointer.down || event.pointerType === 'mouse') updatePointer(event);
  });
  viewport.addEventListener('pointerup', event => {
    pointer.down = false;
    updatePointer(event);
    if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointercancel', () => { pointer.down = false; });

  pauseButton.addEventListener('click', () => { paused=!paused;pauseButton.textContent=paused?'Resume':'Pause';pauseButton.setAttribute('aria-pressed',String(paused));if(!paused){start+=performance.now()-previous;fpsStart=performance.now();frames=0;} });
  document.querySelector('#restart-demo').addEventListener('click',()=>{start=performance.now();fire=null;stars=[];pulse=1;hueShift=0;pointer.x=.5;pointer.y=.5;});
  qualitySelect.addEventListener('change',()=>{quality=Number(qualitySelect.value);fire=null;});
  document.querySelector('#fullscreen-demo').addEventListener('click',()=>{const target=document.querySelector('.demo-viewport');if(document.fullscreenElement)document.exitFullscreen();else target.requestFullscreen?.();});
  window.addEventListener('beforeunload',()=>cancelAnimationFrame(animationId));

  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  selectDemo(webglReady ? 0 : 10, false);
  animationId = requestAnimationFrame(frame);
})();
