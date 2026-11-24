// Dependency-free, participant-local WebGL2 viewer of shared 3Draft meshes.
// Camera is deliberately NOT part of the shared scene. Drag = orbit, wheel = zoom, click = select.
export class WorkshopView {
  constructor(canvas, onSelect = () => {}) {
    this.canvas=canvas; this.onSelect=onSelect; this.objects=[];
    this.camera={yaw:0.6,pitch:0.35,distance:9,target:[0,0,0]};
    const gl=canvas.getContext('webgl2',{antialias:true,alpha:false});
    if(!gl)throw Error('WebGL2 unavailable');
    this.gl=gl;
    const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
    const vs=shader(gl.VERTEX_SHADER,`#version 300 es
      in vec3 position; in vec3 color;
      uniform mat4 projectionView;
      out vec3 vColor;
      void main(){gl_Position=projectionView*vec4(position,1.);vColor=color;}`);
    const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision mediump float;
      in vec3 vColor;out vec4 fragColor;
      void main(){fragColor=vec4(vColor,1.);}`);
    const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    this.program=program;this.location=gl.getUniformLocation(program,'projectionView');
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    this.vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
    gl.enableVertexAttribArray(gl.getAttribLocation(program,'position'));
    gl.vertexAttribPointer(gl.getAttribLocation(program,'position'),3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(gl.getAttribLocation(program,'color'));
    gl.vertexAttribPointer(gl.getAttribLocation(program,'color'),3,gl.FLOAT,false,24,12);
    gl.clearColor(.035,.055,.075,1);gl.enable(gl.DEPTH_TEST);
    let down=null;
    canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,yaw:this.camera.yaw,pitch:this.camera.pitch,moved:false};canvas.setPointerCapture(e.pointerId)});
    canvas.addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.abs(dx)+Math.abs(dy)>3)down.moved=true;this.camera.yaw=down.yaw-dx*.007;this.camera.pitch=Math.max(-1.5,Math.min(1.5,down.pitch+dy*.007));this.draw()});
    canvas.addEventListener('pointerup',e=>{if(down&&!down.moved)this.pick(e.offsetX,e.offsetY);down=null});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.camera.distance=Math.max(.25,Math.min(100000,this.camera.distance*Math.exp(e.deltaY*.001)));this.draw()},{passive:false});
    new ResizeObserver(()=>this.draw()).observe(canvas);
  }
  setScene(objects){this.objects=objects||[];this.draw()}
  reset(){this.camera={yaw:.6,pitch:.35,distance:9,target:[0,0,0]};this.draw()}
  fit(){const pts=this.objects.flatMap(o=>o.mesh?.positions||[]);if(!pts.length)return this.reset();const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of pts)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k])}this.camera.target=lo.map((v,k)=>(v+hi[k])/2);this.camera.distance=Math.max(2,Math.hypot(...hi.map((v,k)=>v-lo[k]))*1.6);this.draw()}
  // Column-major 4x4 matrix, projection derived from a camera basis (right, up, forward).
  basis(){const {yaw,pitch,distance,target}=this.camera;const eye=[target[0]+distance*Math.sin(yaw)*Math.cos(pitch),target[1]+distance*Math.sin(pitch),target[2]+distance*Math.cos(yaw)*Math.cos(pitch)];
    const norm=v=>{const l=Math.hypot(...v)||1;return v.map(n=>n/l)};
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const forward=norm(target.map((v,i)=>v-eye[i])),right=norm(cross(forward,[0,1,0])),up=cross(right,forward);
    return {eye,right,up,forward}}
  matrix(){const {eye,right,up,forward}=this.basis(),w=this.canvas.width,h=this.canvas.height,aspect=w/h,f=1/Math.tan(Math.PI/6),near=.01,far=Math.max(100000,this.camera.distance*100);
    const view=[right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,
      -right.reduce((s,v,i)=>s+v*eye[i],0),-up.reduce((s,v,i)=>s+v*eye[i],0),forward.reduce((s,v,i)=>s+v*eye[i],0),1];
    const proj=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
    const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=proj[k*4+r]*view[c*4+k];return out}
  draw(){const gl=this.gl,c=this.canvas,w=Math.max(1,Math.floor(c.clientWidth*devicePixelRatio)),h=Math.max(1,Math.floor(c.clientHeight*devicePixelRatio));if(c.width!==w||c.height!==h){c.width=w;c.height=h}gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const vertices=[];for(const o of this.objects){const mesh=o.mesh;if(!mesh?.faces)continue;for(const face of mesh.faces){const ids=face.v||[];if(ids.length<3)continue;const hex=(face.color||'#9aabb6').replace('#','');const s=hex.length===3?hex.split('').map(x=>x+x).join(''):hex;const rgb=[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255);if(rgb.some(x=>!Number.isFinite(x)))continue;
      for(let j=1;j<ids.length-1;j++)for(const index of [ids[0],ids[j],ids[j+1]]){const p=mesh.positions[index];if(p)vertices.push(...p,...rgb)}
    }}gl.useProgram(this.program);gl.uniformMatrix4fv(this.location,false,this.matrix());gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/6)}
  pick(x,y){const {eye,right,up,forward}=this.basis(),c=this.canvas,aspect=c.clientWidth/c.clientHeight,t=Math.tan(Math.PI/6),nx=(x/c.clientWidth*2-1)*aspect*t,ny=(1-y/c.clientHeight*2)*t;
    const d=forward.map((v,i)=>v+nx*right[i]+ny*up[i]);const norm=Math.hypot(...d);const dir=d.map(v=>v/norm),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
    let best=Infinity,name=null;for(const o of this.objects){const m=o.mesh;for(const f of m.faces||[]){const ids=f.v;for(let j=1;j<ids.length-1;j++){const a=m.positions[ids[0]],b=m.positions[ids[j]],cc=m.positions[ids[j+1]];if(!a||!b||!cc)continue;const e1=sub(b,a),e2=sub(cc,a),p=cross(dir,e2),det=dot(e1,p);if(Math.abs(det)<1e-8)continue;const inv=1/det,s=sub(eye,a),u=dot(s,p)*inv;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(dir,q)*inv;if(v<0||u+v>1)continue;const distance=dot(e2,q)*inv;if(distance>0&&distance<best){best=distance;name=o.name}}}}
    if(name)this.onSelect(name)}
}
