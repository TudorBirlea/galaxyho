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

export const STAR_VERT = `varying vec3 vPosition;varying vec3 vNormal;varying vec3 vViewDir;
void main(){
  vPosition=position;
  vNormal=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(position,1.);
  vViewDir=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;

export const STAR_FRAG = `precision highp float;
varying vec3 vPosition;varying vec3 vNormal;varying vec3 vViewDir;
uniform float u_time;uniform float u_highTemp;uniform float u_spotAmount;uniform float u_granuleScale;uniform float u_euvMix;uniform vec3 u_starColor;
${NOISE_GLSL}

// Black-body temperature to RGB (Tanner Helland polynomial fit)
vec3 tempToColor(float tempK){
  float t=clamp(tempK,1000.,40000.)/100.;
  float r,g,b;
  if(t<=66.) r=255.; else r=329.698727446*pow(t-60.,-0.1332047592);
  if(t<=66.) g=99.4708025861*log(t)-161.1195681661; else g=288.1221695283*pow(t-60.,-0.0755148492);
  if(t>=66.) b=255.; else if(t<=19.) b=0.; else b=138.5177312231*log(t-10.)-305.0447927307;
  return clamp(vec3(r,g,b)/255.,0.,1.);
}

// Color grading — recolor star surface using the spectral color from galaxy map
vec3 colorGrade(vec3 baseCol,vec3 tint,float intensity){
  float lum=dot(baseCol,vec3(0.2126,0.7152,0.0722));
  vec3 tinted=tint*(lum*2.2+0.08);
  return mix(baseCol,tinted,intensity);
}

// ACES filmic tonemapping
vec3 ACESFilm(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);
}

// FBM for star surface
float starFbm(vec3 p,float freq,int octaves){
  float sum=0.,amp=1.,f=freq;
  for(int i=0;i<8;i++){
    if(i>=octaves) break;
    sum+=snoise(p*f)*amp;
    f*=2.0; amp*=0.5;
  }
  return sum;
}

void main(){
  float slowTime=u_time*0.04;
  vec3 pos=normalize(vPosition);
  vec3 N=normalize(vNormal);
  vec3 V=normalize(vViewDir);
  float NdV=max(dot(N,V),0.);

  // Animate surface: slowly rotate noise sampling coordinates
  float c2=cos(slowTime*0.3),s2=sin(slowTime*0.3);
  vec3 surfCoord=vec3(c2*pos.x+s2*pos.z,pos.y,-s2*pos.x+c2*pos.z);
  float gScale=5.0*u_granuleScale;

  // Layer 1: Base granule noise (4 octaves FBM)
  float granuleNoise=(starFbm(surfCoord,gScale,4)+1.)*0.5;

  // Layer 2: Sunspots (low-freq, discrete via max(0,...))
  float spotFreq=gScale*0.15;
  float spotNoise=snoise(surfCoord*spotFreq+vec3(slowTime*0.1,0.,slowTime*0.05));
  float sunspots=max(0.,spotNoise*2.7-1.9)*u_spotAmount;

  // Layer 3: Bright regions
  float brightFreq=gScale*0.08;
  float brightNoise=snoise(surfCoord*brightFreq+vec3(0.,slowTime*0.15,0.));
  float brightSpot=max(0.,brightNoise*1.4-0.9);

  // Combine into temperature variation
  float total=clamp(granuleNoise-sunspots+brightSpot,0.,1.5);
  float highTemp=u_highTemp;
  float lowTemp=highTemp*0.25;
  float pixelTemp=mix(lowTemp,highTemp,total);

  // Per-pixel color from temperature
  vec3 starCol=tempToColor(pixelTemp);

  // Limb darkening
  float limb=pow(NdV,0.4);
  float limbTemp=mix(lowTemp*1.5,pixelTemp,pow(NdV,0.6));
  vec3 limbCol=tempToColor(limbTemp);
  starCol=mix(limbCol,starCol,pow(NdV,0.3));
  starCol*=limb;

  // Brightness boost — base ensures all stars glow, hotter stars still brighter
  float brightnessBoost=1.4+clamp((highTemp-4000.)/20000.,0.,1.)*0.5;
  starCol*=brightnessBoost;

  // Color grade surface with the galaxy-map spectral color
  starCol=colorGrade(starCol,u_starColor,u_euvMix);

  // Corona glow at edges
  float edge=1.-NdV;
  vec3 coronaCol=colorGrade(tempToColor(highTemp),u_starColor,min(u_euvMix*1.3,1.0));
  float coronaGlow=pow(edge,2.5)*1.2+pow(edge,5.)*2.5;
  starCol+=coronaCol*coronaGlow*0.9;

  // Tonemapping + saturation recovery (ACES desaturates, so we re-boost)
  starCol=ACESFilm(starCol*1.8);
  float postLum=dot(starCol,vec3(0.2126,0.7152,0.0722));
  starCol=mix(vec3(postLum),starCol,1.35);
  starCol=max(starCol,vec3(0.));
  // Output HDR — values above 1.0 feed the bloom pass for glow
  starCol*=1.5;

  gl_FragColor=vec4(starCol,1.);
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
uniform float u_time;uniform float u_type;uniform float u_seed;uniform float u_atm;uniform vec3 u_lightDir;
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

vec3 sunDir=normalize(vec3(1.,0.4,0.6));

// ── Terran ──
vec3 surfTerran(vec3 nn,float time){
  float cont=pfbm(nn,2.2,5);
  float detail=pfbm(nn+vec3(7.7),5.,3)*0.2;
  float landMask=smoothstep(-0.05,0.12,cont+detail);
  float elev=smoothstep(0.1,0.6,cont);
  float polar=smoothstep(0.7,0.9,abs(nn.y)+cont*0.08);
  vec3 ocean=mix(vec3(0.01,0.04,0.18),vec3(0.03,0.12,0.30),smoothstep(-0.4,0.,cont));
  vec3 landCol=mix(vec3(0.12,0.25,0.06),vec3(0.22,0.18,0.08),smoothstep(0.2,0.5,elev));
  landCol=mix(landCol,vec3(0.35,0.30,0.25),smoothstep(0.55,0.8,elev));
  vec3 col=mix(ocean,landCol,landMask);
  col=mix(col,vec3(0.90,0.93,0.97),polar);
  float clouds=pfbm(nn+vec3(time*0.008,0.,time*0.005),2.8,4);
  clouds=smoothstep(0.05,0.50,clouds);
  col=mix(col,vec3(0.95,0.97,1.),clouds*0.50);
  return col;
}

// ── Desert ──
vec3 surfDesert(vec3 nn){
  float terrain=pfbm(nn,2.5,5)*0.5+0.5;
  float dunes=pfbm(nn+vec3(8.),5.,3)*0.5+0.5;
  float craterMask=smoothstep(0.65,0.72,pfbm(nn*1.2,1.5,3)*0.5+0.5);
  vec3 rust=vec3(0.52,0.20,0.08);
  vec3 ochre=vec3(0.65,0.38,0.15);
  vec3 sand=vec3(0.76,0.58,0.32);
  vec3 col=mix(rust,ochre,terrain);
  col=mix(col,sand,dunes*0.4);
  col=mix(col,rust*0.5,craterMask*0.5);
  float frost=smoothstep(0.90,0.97,abs(nn.y));
  col=mix(col,vec3(0.80,0.72,0.62),frost);
  return col;
}

// ── Ice ──
vec3 surfIce(vec3 nn){
  float terrain=pfbm(nn,2.,4)*0.5+0.5;
  float crack1=1.-smoothstep(0.,0.06,abs(snoise(nn*5.)));
  float crack2=1.-smoothstep(0.,0.04,abs(snoise(nn*3.5+vec3(20.))));
  float cracks=max(crack1*0.8,crack2*0.5);
  vec3 iceCol=mix(vec3(0.62,0.72,0.82),vec3(0.82,0.87,0.92),terrain);
  iceCol=mix(iceCol,vec3(0.10,0.18,0.35),cracks);
  float stain=smoothstep(0.55,0.70,pfbm(nn*1.2+vec3(40.),1.8,3)*0.5+0.5);
  iceCol=mix(iceCol,vec3(0.72,0.65,0.55),stain*0.10);
  return iceCol;
}

// ── Gas Giant ──
vec3 surfGas(vec3 nn,float time){
  float lat=nn.y;
  float turb=pfbm(nn*1.5+vec3(time*0.002,0.,0.),3.,4);
  float bands=sin(lat*20.+turb*2.5)*0.5+0.5;
  float fine=sin(lat*50.+turb*4.)*0.5+0.5;
  bands=bands*0.7+fine*0.3;
  vec3 darkBlue=vec3(0.04,0.08,0.22);
  vec3 midBlue=vec3(0.12,0.22,0.42);
  vec3 lightBlue=vec3(0.30,0.45,0.60);
  vec3 col=mix(darkBlue,midBlue,bands);
  col=mix(col,lightBlue,fine*0.3);
  float eq=exp(-lat*lat*6.);
  col=mix(col,vec3(0.20,0.30,0.45),eq*0.2);
  float wisps=pfbm(nn*3.+vec3(lat*2.+time*0.003,0.,0.),5.,3);
  col+=vec3(0.05,0.08,0.12)*smoothstep(0.2,0.6,wisps);
  return col;
}

// ── Lava ──
vec3 surfLava(vec3 nn,float time){
  float plates=pfbm(nn,2.,4);
  float vein1=abs(snoise(nn*4.+vec3(time*0.005,0.,0.)));
  float vein2=abs(snoise(nn*7.+vec3(0.,time*0.003,5.)));
  float veins=1.-smoothstep(0.,0.10,min(vein1,vein2));
  float pools=smoothstep(-0.15,0.10,-plates);
  float heat=clamp(veins*0.65+pools*0.50,0.,1.);
  float pulse=0.90+0.10*sin(time*0.2+plates*4.);
  vec3 crustCol=mix(vec3(0.04,0.03,0.025),vec3(0.10,0.07,0.05),plates*0.5+0.5);
  vec3 magmaCol=mix(vec3(0.70,0.10,0.),vec3(1.,0.55,0.05),heat);
  return mix(crustCol,magmaCol*pulse,heat);
}

// ── Ocean ──
vec3 surfOcean(vec3 nn,float time){
  float depth=pfbm(nn,1.8,4);
  float curr=snoise(nn*3.5+vec3(time*0.006,0.,time*0.004))*0.15;
  vec3 deepBlue=vec3(0.005,0.015,0.10);
  vec3 midOcean=vec3(0.015,0.06,0.20);
  vec3 shallow=vec3(0.04,0.14,0.28);
  float dv=depth*0.5+0.5+curr;
  vec3 col=mix(deepBlue,midOcean,smoothstep(0.3,0.55,dv));
  col=mix(col,shallow,smoothstep(0.6,0.85,dv));
  float isle=smoothstep(0.63,0.66,depth);
  col=mix(col,vec3(0.14,0.20,0.07),isle*0.5);
  float cl=pfbm(nn*0.9+vec3(time*0.007,time*0.004,0.),2.5,5);
  float cover=smoothstep(-0.10,0.40,cl);
  float cyclone=snoise(vec3(atan(nn.z,nn.x)*1.5,nn.y*4.,time*0.003));
  cover+=smoothstep(0.35,0.55,cyclone)*0.15;
  cover=clamp(cover,0.,1.);
  col=mix(col,vec3(0.88,0.92,0.96),cover*0.60);
  return col;
}

void main(){
  float time=u_time;
  vec3 pos=normalize(vPosition);
  vec3 N=normalize(vNormal);
  vec3 V=normalize(vViewDir);
  vec3 L=normalize(u_lightDir);

  // Slowly rotate surface for animation
  float rc=cos(time*0.3),rs=sin(time*0.3);
  vec3 nn=vec3(rc*pos.x+rs*pos.z,pos.y,-rs*pos.x+rc*pos.z);
  // Add seed offset for variety
  nn+=vec3(u_seed*0.73,u_seed*0.37,u_seed*0.91);

  // Get surface color per type
  vec3 surface=vec3(0.5);
  bool emissive=false;
  float tp=u_type;

  if(tp<0.5) surface=surfTerran(nn,time);           // 0: terran
  else if(tp<1.5) surface=surfDesert(nn);            // 1: desert
  else if(tp<2.5) surface=surfIce(nn);               // 2: ice
  else if(tp<3.5) surface=surfGas(nn,time);          // 3: gas_giant
  else if(tp<4.5){ surface=surfLava(nn,time); emissive=true; } // 4: lava
  else surface=surfOcean(nn,time);                   // 5: ocean

  // Lighting
  float NdL=dot(N,L);
  float lit=smoothstep(-0.08,0.20,NdL);
  float ambient=0.03;

  vec3 col;
  if(emissive){
    float glow=length(surface)/1.73;
    col=surface*(ambient+lit*0.35)+surface*glow*1.1;
  } else {
    col=surface*(ambient+lit*0.95);
    // Specular for watery/icy planets
    if(tp<0.5||tp>1.5&&tp<2.5||tp>4.5){
      vec3 halfDir=normalize(L+V);
      float spec=pow(max(dot(N,halfDir),0.),50.);
      col+=vec3(0.9)*spec*0.20*lit;
    }
  }

  // Atmosphere rim glow
  if(u_atm>0.01){
    float NdV=max(dot(N,V),0.);
    float rim=pow(1.-NdV,3.5);
    vec3 atmosCol=vec3(0.3,0.5,0.9);
    float atmosStr=0.30;
    if(tp<0.5){ atmosCol=vec3(0.35,0.55,1.); atmosStr=0.35; }
    else if(tp<1.5){ atmosCol=vec3(0.60,0.35,0.15); atmosStr=0.12; }
    else if(tp<2.5){ atmosCol=vec3(0.40,0.55,0.75); atmosStr=0.08; }
    else if(tp<3.5){ atmosCol=vec3(0.15,0.25,0.50); atmosStr=0.25; }
    else if(tp<4.5){ atmosCol=vec3(0.70,0.20,0.05); atmosStr=0.25; }
    else{ atmosCol=vec3(0.20,0.40,0.85); atmosStr=0.40; }
    col+=atmosCol*rim*atmosStr*(0.3+lit*0.7);
  }

  // Tonemapping
  col=ACESFilm(col*1.3);
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

  // Visited ring indicator — subtle teal glow ring
  if(vVisited>0.5){
    float ring=smoothstep(0.18,0.22,d)*smoothstep(0.35,0.28,d);
    col+=vec3(0.15,0.7,0.5)*ring*0.5*vBright;
  }

  if(total<0.005) discard;
  gl_FragColor=vec4(col,min(total,1.0));
}`;
