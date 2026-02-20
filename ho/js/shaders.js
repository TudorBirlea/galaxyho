const NOISE_GLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm4(vec3 p){float f=0.,a=.5;for(int i=0;i<4;i++){f+=a*snoise(p);p*=2.1;a*=.48;}return f;}
float warpedNoise(vec3 p,float w){vec3 q=vec3(fbm4(p),fbm4(p+vec3(5.2,1.3,2.8)),fbm4(p+vec3(1.7,9.2,4.1)));return fbm4(p+w*q);}
mat2 rot2d(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hsh(float n){return fract(sin(n)*43758.5453);}
`;

export { NOISE_GLSL };

// ── Star: fullscreen quad + ray-marched shader (matches experiment-stars.html) ──

export const STAR_VERT = `varying vec2 vUV;
void main(){
  vUV=position.xy;
  gl_Position=vec4(position.xy,0.9999,1.);
}`;

export const STAR_FRAG = `precision highp float;
varying vec2 vUV;
uniform float u_time;
uniform float u_starRadius;
uniform float u_highTemp;
uniform float u_spotAmount;
uniform float u_granuleScale;
uniform vec3 u_starColor;
uniform float u_euvMix;
uniform mat4 u_invViewProj;
${NOISE_GLSL}

vec3 ACESFilm(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);}

vec3 hash33(vec3 p){
  p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453);
}
float voronoi3D(vec3 p){
  vec3 ip=floor(p);vec3 fp=fract(p);float d1=10.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 nb=vec3(float(x),float(y),float(z));
    vec3 diff=nb+hash33(ip+nb)-fp;
    float d=dot(diff,diff);if(d<d1)d1=d;
  }
  return sqrt(d1);
}

vec3 tempToColor(float tempK){
  float t=clamp(tempK,1000.,40000.)/100.;float r,g,b;
  if(t<=66.)r=255.;else r=329.698727446*pow(t-60.,-0.1332047592);
  if(t<=66.)g=99.4708025861*log(t)-161.1195681661;else g=288.1221695283*pow(t-60.,-0.0755148492);
  if(t>=66.)b=255.;else if(t<=19.)b=0.;else b=138.5177312231*log(t-10.)-305.0447927307;
  return clamp(vec3(r,g,b)/255.,0.,1.);
}

vec3 colorGrade(vec3 baseCol,vec3 tint,float intensity){
  float lum=dot(baseCol,vec3(0.2126,0.7152,0.0722));
  vec3 tinted=tint*(lum*2.8+0.04);
  float blend=intensity*(1.-lum*0.35);
  return mix(baseCol,tinted,blend);
}

float starFbm(vec3 p,float freq,int octaves){
  float sum=0.,amp=1.,f=freq;
  for(int i=0;i<8;i++){if(i>=octaves)break;sum+=snoise(p*f)*amp;f*=2.;amp*=.5;}
  return sum;
}

float raySphere(vec3 ro,vec3 rd,float radius){
  float b=dot(ro,rd);float c=dot(ro,ro)-radius*radius;
  float disc=b*b-c;if(disc<0.)return -1.;return -b-sqrt(disc);
}

void main(){
  // Reconstruct camera ray from Three.js camera
  vec4 farClip=u_invViewProj*vec4(vUV,1.,1.);
  farClip/=farClip.w;
  vec3 rd=normalize(farClip.xyz-cameraPosition);

  // Work in normalized space (star radius = 1, matching experiment)
  vec3 ro=cameraPosition/u_starRadius;
  float slowTime=u_time*0.04;

  vec3 col=vec3(0.);
  float hit=raySphere(ro,rd,1.);

  // Closest approach to star center (for corona)
  float bc=dot(ro,rd);
  float closestDist=length(ro+rd*max(-bc,0.));
  float edgeDist=max(0.,closestDist-1.);

  // ── Star surface ──
  if(hit>0.){
    vec3 hitPos=ro+rd*hit;
    vec3 normal=normalize(hitPos);

    float c2=cos(slowTime*0.3),s2=sin(slowTime*0.3);
    vec3 surfCoord=vec3(c2*normal.x+s2*normal.z,normal.y,-s2*normal.x+c2*normal.z);
    float gScale=5.*u_granuleScale;

    // Voronoi cellular convection + FBM detail
    float cell=voronoi3D(surfCoord*gScale*0.6);
    float cellPattern=1.-smoothstep(0.,0.22,cell);
    float detail=(starFbm(surfCoord,gScale,3)+1.)*0.5;
    float granuleNoise=cellPattern*0.7+detail*0.3;

    // Sunspots
    float spotNoise=snoise(surfCoord*gScale*0.15+vec3(slowTime*0.1,0.,slowTime*0.05));
    float sunspots=max(0.,spotNoise*3.2-2.1)*u_spotAmount;

    // Bright regions
    float brightNoise=snoise(surfCoord*gScale*0.08+vec3(0.,slowTime*0.15,0.));
    float brightSpot=max(0.,brightNoise*1.8-1.);

    float total=clamp(granuleNoise-sunspots+brightSpot,0.,1.5);
    total=pow(total,1.25);
    float highTemp=u_highTemp;
    float lowTemp=highTemp*0.12;
    float pixelTemp=mix(lowTemp,highTemp,total);
    vec3 starCol=tempToColor(pixelTemp);

    // Limb darkening
    float NdotV=max(dot(normal,normalize(ro-hitPos)),0.);
    float limb=pow(NdotV,0.5);
    float limbTemp=mix(lowTemp*1.2,pixelTemp,pow(NdotV,0.55));
    vec3 limbCol=tempToColor(limbTemp);
    starCol=mix(limbCol,starCol,pow(NdotV,0.35));
    starCol*=limb;

    // Brightness boost
    float brightnessBoost=1.2+clamp((highTemp-4000.)/15000.,0.,1.)*0.6;
    starCol*=brightnessBoost;

    // EUV color grading
    starCol=colorGrade(starCol,u_starColor,u_euvMix);

    // Re-saturate
    float postLum=dot(starCol,vec3(0.2126,0.7152,0.0722));
    starCol=mix(vec3(postLum),starCol,1.4);
    starCol=max(starCol,vec3(0.));

    col=starCol;
  }

  // ── Corona glow ──
  vec3 glowColor=colorGrade(tempToColor(u_highTemp),u_starColor,0.75);
  float glow1=exp(-edgeDist*7.)*0.50;
  float glow2=exp(-edgeDist*2.5)*0.10;
  float glow3=exp(-edgeDist*0.7)*0.018;
  float coronaBoost=1.+clamp((u_highTemp-4000.)/20000.,0.,0.4);
  float totalGlow=(glow1+glow2+glow3)*coronaBoost;

  // Coronal streamers
  vec3 closestOnSphere=normalize(ro+rd*max(-bc,0.));
  float streamerNoise=snoise(closestOnSphere*3.+vec3(0.,slowTime*0.05,0.));
  float streamer=max(0.,streamerNoise*1.5-0.3)*exp(-edgeDist*3.)*0.12;
  totalGlow+=streamer;

  // Background starfield (miss pixels only)
  if(hit<0.){
    vec3 d=normalize(rd);
    float theta=acos(clamp(d.y,-1.,1.));
    float phi=atan(d.z,d.x);
    float glowMask=1.-clamp(totalGlow*4.,0.,1.);
    for(int layer=0;layer<3;layer++){
      float fl=float(layer);
      float density=120.+fl*80.;
      vec2 grid=vec2(phi*density,theta*density);
      vec2 cellId=floor(grid);
      vec2 cellUV=fract(grid)-0.5;
      float h=fract(sin(dot(cellId+fl*50.,vec2(127.1,311.7)))*43758.5453);
      float threshold=0.96+fl*0.015;
      if(h>threshold){
        vec2 starOff=vec2(
          fract(sin(dot(cellId+fl*50.,vec2(269.5,183.3)))*43758.5453),
          fract(sin(dot(cellId+fl*50.,vec2(419.2,371.9)))*43758.5453)
        )-0.5;
        float dist=length(cellUV-starOff*0.6);
        float brightness=(h-threshold)/(1.-threshold);
        float twinkle=0.7+0.3*sin(u_time*(1.+h*3.)+h*100.);
        float point=exp(-dist*dist*800.)*brightness*twinkle;
        vec3 sCol=mix(vec3(0.6,0.7,1.),vec3(1.,0.85,0.7),fract(h*7.));
        float dimmer=1.-fl*0.3;
        col+=sCol*point*dimmer*0.5*glowMask;
      }
    }
  }

  // Corona overlay (all pixels including surface, before tonemapping)
  {
    float whiteness=exp(-edgeDist*3.);
    vec3 gc=mix(glowColor,vec3(1.),whiteness*0.5);
    col+=gc*totalGlow;
  }

  // Prominences (miss pixels near limb)
  if(hit<0.&&edgeDist<0.6){
    vec3 surfPoint=normalize(ro+rd*max(-bc,0.));
    float cr=cos(slowTime*0.15),sr=sin(slowTime*0.15);
    vec3 promCoord=vec3(cr*surfPoint.x+sr*surfPoint.z,surfPoint.y,-sr*surfPoint.x+cr*surfPoint.z);
    float promNoise=snoise(promCoord*2.5)*0.55+snoise(promCoord*5.)*0.3;
    float promActive=smoothstep(0.2,0.55,promNoise);
    float promHeight=promActive*(0.15+0.25*max(0.,snoise(promCoord*1.2)));
    if(promHeight>0.01){
      float normH=clamp(edgeDist/promHeight,0.,1.);
      float arcShape=sin(normH*3.14159)*(1.-normH*0.4);
      float lateral=snoise(promCoord*8.+vec3(slowTime*0.1));
      float lateralMask=smoothstep(-0.2,0.3,lateral);
      float promGlw=promActive*arcShape*lateralMask*exp(-edgeDist*5.);
      vec3 promBaseCol=colorGrade(tempToColor(u_highTemp*0.8),u_starColor,0.7);
      vec3 promTipCol=mix(u_starColor*0.6,vec3(1.,0.5,0.2),0.4);
      vec3 promColor=mix(promBaseCol,promTipCol,normH*0.7);
      col+=promColor*promGlw*0.7;
    }
  }

  // Tonemapping + vignette
  col=ACESFilm(col*1.5);
  float vig=1.-0.3*dot(vUV*0.5,vUV*0.5);
  col*=vig;
  col=pow(col,vec3(0.95));

  gl_FragColor=vec4(col,1.);
}`;

export const PLANET_VERT = `varying vec3 vPosition;varying vec3 vNormal;varying vec3 vViewDir;
void main(){
  vPosition=position;
  vNormal=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(position,1.);
  vViewDir=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;

export const PLANET_FRAG = `precision highp float;
varying vec3 vPosition;varying vec3 vNormal;varying vec3 vViewDir;
uniform float u_time;uniform float u_type;uniform float u_seed;uniform vec3 u_lightDir;
uniform sampler2D u_tex;
uniform vec3 u_atmosCol;
uniform float u_atmosStr;
uniform float u_spinRate;
${NOISE_GLSL}

float pfbm(vec3 p,float freq,int octaves){
  float sum=0.,amp=0.5;
  for(int i=0;i<8;i++){
    if(i>=octaves) break;
    sum+=snoise(p*freq)*amp;
    freq*=2.; amp*=0.5;
  }
  return sum;
}

vec3 ACESFilm(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);
}

vec2 sphereUV(vec3 n){
  float u=atan(n.z,n.x)/6.28318+0.5;
  float v=asin(clamp(n.y,-1.,1.))/3.14159+0.5;
  return vec2(u,1.-v);
}

void main(){
  float time=u_time;
  vec3 pos=normalize(vPosition);
  vec3 N=normalize(vNormal);
  vec3 V=normalize(vViewDir);
  vec3 L=normalize(u_lightDir);

  // Spin rotation (per-planet speed)
  float spinSpeed=u_spinRate*0.3;
  float rc=cos(time*spinSpeed),rs=sin(time*spinSpeed);
  vec3 spun=vec3(rc*pos.x+rs*pos.z,pos.y,-rs*pos.x+rc*pos.z);

  // Texture UVs from spun surface
  vec2 texUV=sphereUV(spun);

  // Noise coordinates (seed offset for variety)
  vec3 nn=spun+vec3(u_seed*7.3,u_seed*3.7,u_seed*9.1);

  // UV warping based on seed
  vec2 wUV=texUV;
  wUV.x+=pfbm(nn*2.,2.,4)*0.04;
  wUV.y+=pfbm(nn*2.+vec3(5.),2.,4)*0.025;

  // Sample texture with warped UVs
  vec3 texCol=texture2D(u_tex,wUV).rgb;

  // Subtle color grade shift per seed
  float warmShift=(u_seed-0.5)*0.15;
  texCol=mix(texCol,texCol*vec3(1.+warmShift,1.,1.-warmShift),0.4);

  // Per-type procedural overlays on texture
  float tp=u_type;
  bool emissive=false;

  if(tp<0.5){
    // TERRAN: clouds + polar caps
    float clouds=pfbm(nn+vec3(time*0.008,0.,time*0.005),2.8,4);
    clouds=smoothstep(0.05,0.50,clouds);
    texCol=mix(texCol,vec3(0.95,0.97,1.),clouds*0.45);
    float polar=smoothstep(0.72,0.92,abs(nn.y)+pfbm(nn,3.,4)*0.08);
    texCol=mix(texCol,vec3(0.90,0.93,0.97),polar*0.6);
  } else if(tp<1.5){
    // DESERT: dune detail + dust haze
    float dunes=pfbm(nn+vec3(8.),5.,3)*0.5+0.5;
    texCol*=0.85+dunes*0.3;
    float dusty=exp(-nn.y*nn.y*8.)*pfbm(nn+vec3(time*0.002),1.5,4)*0.5;
    texCol=mix(texCol,vec3(0.70,0.50,0.30),clamp(dusty,0.,1.)*0.15);
  } else if(tp<2.5){
    // ICE: crack network + frost
    float cr1=1.-smoothstep(0.,0.06,abs(snoise(nn*5.)));
    float cr2=1.-smoothstep(0.,0.04,abs(snoise(nn*3.5+vec3(20.))));
    float cracks=max(cr1*0.8,cr2*0.5);
    texCol=mix(texCol,vec3(0.08,0.15,0.30),cracks*0.4);
    float frost=smoothstep(0.85,0.95,abs(nn.y));
    texCol=mix(texCol,vec3(0.90,0.93,0.97),frost*0.3);
  } else if(tp<3.5){
    // GAS GIANT: turbulent wisps
    float turb=pfbm(nn*1.5+vec3(time*0.002,0.,0.),3.,4);
    float wisps=pfbm(nn*3.+vec3(nn.y*2.+time*0.003,0.,0.),5.,3);
    texCol*=1.+turb*0.12;
    texCol+=vec3(0.04,0.06,0.10)*smoothstep(0.2,0.6,wisps);
  } else if(tp<4.5){
    // LAVA: emissive veins over crust texture
    emissive=true;
    float v1=abs(snoise(nn*4.+vec3(time*0.005,0.,0.)));
    float v2=abs(snoise(nn*7.+vec3(0.,time*0.003,5.)));
    float veins=1.-smoothstep(0.,0.10,min(v1,v2));
    float pools=smoothstep(-0.15,0.10,-pfbm(nn,2.,4));
    float heat=clamp(veins*0.65+pools*0.50,0.,1.);
    float pulse=0.90+0.10*sin(time*0.2+pfbm(nn,2.,4)*4.);
    vec3 magma=mix(vec3(0.70,0.10,0.),vec3(1.,0.55,0.05),heat);
    texCol=mix(texCol*0.6,magma*pulse,heat*0.8);
  } else if(tp<5.5){
    // OCEAN: cloud cover + cyclones
    float cl=pfbm(nn*0.9+vec3(time*0.007,time*0.004,0.),2.5,5);
    float cover=smoothstep(-0.10,0.40,cl);
    float cyclone=snoise(vec3(atan(nn.z,nn.x)*1.5,nn.y*4.,time*0.003));
    cover+=smoothstep(0.35,0.55,cyclone)*0.15;
    texCol=mix(texCol,vec3(0.88,0.92,0.96),clamp(cover,0.,1.)*0.55);
  } else {
    // WATER: thick banded clouds (sub-Neptune)
    float lat=nn.y;
    float bandNoise=pfbm(nn*2.+vec3(time*0.004,0.,0.),3.,4);
    float bands=sin(lat*12.+bandNoise*3.)*0.5+0.5;
    float cl=pfbm(nn*1.2+vec3(time*0.006,time*0.003,0.),2.5,5);
    float cover=smoothstep(-0.20,0.30,cl);
    cover=max(cover,bands*0.3);
    vec3 cloudCol=mix(vec3(0.55,0.62,0.72),vec3(0.75,0.80,0.88),bands);
    texCol=mix(texCol,cloudCol,cover*0.65);
  }

  vec3 surface=texCol;

  // Lighting
  float NdL=dot(N,L);
  float lit=smoothstep(-0.08,0.20,NdL);

  // Desaturate bright textures slightly to tame hot pixels
  float texLum=dot(surface,vec3(0.2126,0.7152,0.0722));
  surface=mix(surface,vec3(texLum),smoothstep(0.45,0.85,texLum)*0.25);

  vec3 col;
  if(emissive){
    float glow=length(surface)/1.73;
    col=surface*(0.03+lit*0.25)+surface*glow*0.6;
    // Night-side lava glow
    float nightGlow=smoothstep(0.1,-0.3,NdL);
    col+=surface*nightGlow*0.25;
  } else {
    col=surface*(0.02+lit*0.42);
    // Per-type specular
    if(tp<0.5){
      // Terran: specular on water (dark) areas
      float brightness=dot(surface,vec3(0.3,0.5,0.2));
      float waterMask=1.-smoothstep(0.05,0.18,brightness);
      vec3 halfDir=normalize(L+V);
      float spec=pow(max(dot(N,halfDir),0.),60.);
      col+=vec3(1.,0.97,0.90)*spec*0.12*lit*waterMask;
    } else if(tp>4.5){
      // Ocean (5) and Water (6): full-surface specular
      vec3 halfDir=normalize(L+V);
      float spec=pow(max(dot(N,halfDir),0.),60.);
      col+=vec3(1.,0.98,0.92)*spec*0.18*lit;
    } else if(tp>1.5&&tp<2.5){
      // Ice: subtle cool specular
      vec3 halfDir=normalize(L+V);
      float spec=pow(max(dot(N,halfDir),0.),40.);
      col+=vec3(0.9,0.95,1.)*spec*0.10*lit;
    }
  }

  // Atmosphere rim glow (per-planet colors from uniform)
  if(u_atmosStr>0.01){
    float NdV=max(dot(N,V),0.);
    float rim=pow(1.-NdV,4.0);
    col+=u_atmosCol*rim*u_atmosStr*(0.15+lit*0.50);
  }

  // Tonemapping
  col=ACESFilm(col*0.9);
  col=pow(col,vec3(0.96));
  gl_FragColor=vec4(col,1.);
}`;

export const RING_VERT = `varying float vR;varying vec3 vWorldNormal;varying vec3 vWorldPos;
void main(){vR=length(position.xy);vWorldNormal=normalize((modelMatrix*vec4(normal,0.)).xyz);
  vWorldPos=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export const RING_FRAG = `precision highp float;
varying float vR;varying vec3 vWorldNormal;varying vec3 vWorldPos;
uniform float u_innerR;uniform float u_outerR;uniform float u_seed;
float hsh(float n){return fract(sin(n)*43758.5453);}
float hsh2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){float rP=clamp((vR-u_innerR)/(u_outerR-u_innerR),0.,1.);
  float angle=atan(vWorldPos.z,vWorldPos.x);
  float an=hsh2(vec2(angle*8.,u_seed))*.3+hsh2(vec2(angle*20.,u_seed*1.5))*.15;
  float rn=hsh(rP*50.+u_seed)*.4+hsh(rP*120.+u_seed*2.)*.2+hsh(rP*300.+u_seed*3.)*.1;
  float density=.4+rn+an;density*=smoothstep(0.,.15,rP)*smoothstep(1.,.85,rP);
  float gc=.45+hsh(u_seed*7.)*.1,gw=.08+hsh(u_seed*11.)*.04;
  float gap=smoothstep(gc-gw,gc,rP)*smoothstep(gc+gw,gc,rP);density*=1.-gap*(.7+hsh(u_seed*13.)*.3);
  float gap2=smoothstep(.22,.25,rP)*smoothstep(.28,.25,rP);density*=1.-gap2*.4;
  vec3 L=normalize(-vWorldPos);float lit=.2+.8*abs(dot(vWorldNormal,L));
  float rH=hsh(u_seed*1.23);vec3 dc=rH<.33?vec3(.75,.65,.52):rH<.66?vec3(.65,.58,.50):vec3(.72,.58,.43);
  dc*=.85+.3*hsh2(vec2(rP*15.+angle*3.,u_seed));
  vec3 col=dc*density*lit;float alpha=clamp(density*.6,0.,.75);
  if(alpha<.02)discard;gl_FragColor=vec4(col,alpha);}`;

export const GALAXY_STAR_VERT = `
attribute float aSize;
attribute float aSeed;
attribute float aBright;
attribute float aVisited;
varying vec3 vCol;
varying float vBright;
varying float vVisited;
uniform float u_time;
void main(){
  vCol=color;
  vVisited=aVisited;
  vBright=aBright*(0.88+0.12*sin(u_time*(1.5+aSeed*3.0)+aSeed*80.0));
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_PointSize=clamp(aSize*(1200.0/-mv.z),1.0,128.0);
  gl_Position=projectionMatrix*mv;
}`;

export const GALAXY_STAR_FRAG = `
precision highp float;
varying vec3 vCol;
varying float vBright;
varying float vVisited;
void main(){
  vec2 uv=gl_PointCoord-0.5;
  float d=length(uv);

  // Bright Gaussian core
  float core=exp(-d*d*120.0);

  // 4-point diffraction spikes
  float sH=exp(-abs(uv.y)*35.0)*exp(-abs(uv.x)*5.5);
  float sV=exp(-abs(uv.x)*35.0)*exp(-abs(uv.y)*5.5);
  float spikes=(sH+sV)*0.25;

  // Soft halos (two layers) — colored with saturated hue
  float halo=exp(-d*4.0)*0.40;
  float halo2=exp(-d*10.0)*0.55;

  float total=core+spikes+halo+halo2;

  // Saturate the star color for vivid EUV look
  float lum=dot(vCol,vec3(0.2126,0.7152,0.0722));
  vec3 saturated=mix(vec3(lum),vCol,1.6);
  saturated=max(saturated,vec3(0.0));

  // Luminance compensation — warmer (dimmer) stars get stronger glow
  float lumComp=1.0+0.5*(1.0-clamp(lum*2.5,0.0,1.0));

  // White-hot core grading into vivid spectral color
  vec3 col=mix(saturated,vec3(1.0),smoothstep(0.0,0.9,core));

  // Halo gets the saturated color with luminance compensation
  vec3 haloCol=saturated*(halo+halo2)*1.5*lumComp;
  vec3 coreCol=col*(core+spikes);
  col=coreCol+haloCol;
  col*=vBright;

  // Visited ring indicator — prominent teal ring + inner glow
  if(vVisited>0.5){
    float ring=smoothstep(0.15,0.19,d)*smoothstep(0.32,0.24,d);
    col+=vec3(0.2,0.8,0.55)*ring*0.9;
    // Subtle inner fill to mark as charted
    float fill=1.0-smoothstep(0.0,0.20,d);
    col+=vec3(0.1,0.4,0.3)*fill*0.15;
  }

  if(total<0.005) discard;
  gl_FragColor=vec4(col,min(total,1.0));
}`;

// ── Ship marker in galaxy view ──

export const SHIP_MARKER_VERT = `
uniform float u_time;
void main(){
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  float pulse=0.9+0.1*sin(u_time*3.0);
  gl_PointSize=clamp(18.0*pulse*(-1.0/mv.z)*600.0,4.0,48.0);
  gl_Position=projectionMatrix*mv;
}`;

export const SHIP_MARKER_FRAG = `
precision highp float;
uniform float u_time;
void main(){
  vec2 uv=gl_PointCoord-0.5;
  float d=length(uv);

  // Diamond shape
  float diamond=1.0-smoothstep(0.0,0.02,abs(uv.x)+abs(uv.y)-0.28);

  // Outer glow
  float glow=exp(-d*8.0)*0.4;
  float pulse=0.85+0.15*sin(u_time*2.5);

  vec3 col=vec3(0.3,0.9,0.65)*(diamond+glow)*pulse;
  float alpha=(diamond+glow)*pulse;
  if(alpha<0.01)discard;
  gl_FragColor=vec4(col,min(alpha,1.0));
}`;

// ── Nebula clouds in galaxy view ──

export const NEBULA_VERT = `
varying vec2 vUv;
void main(){
  vUv=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

export const NEBULA_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float u_time;
uniform vec3 u_color;
uniform float u_seed;
${NOISE_GLSL}

void main(){
  vec2 p=(vUv-0.5)*2.0;
  float r=length(p);

  // Radial falloff
  float falloff=1.0-smoothstep(0.3,1.0,r);

  // Animated FBM noise
  vec3 noiseCoord=vec3(p*1.5+u_seed*10.0,u_time*0.01+u_seed);
  float n=fbm4(noiseCoord)*0.5+0.5;
  float n2=fbm4(noiseCoord*2.0+vec3(50.0))*0.5+0.5;

  float density=n*n2*falloff*falloff;
  density=smoothstep(0.05,0.5,density)*0.07;

  vec3 col=u_color*density;
  if(density<0.001)discard;
  gl_FragColor=vec4(col,density);
}`;
