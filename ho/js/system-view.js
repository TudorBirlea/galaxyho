import * as THREE from 'three';
import { CONFIG } from './config.js?v=3.7';
import { STAR_VERT, STAR_FRAG, PLANET_VERT, PLANET_FRAG, RING_VERT, RING_FRAG,
         ATMOS_VERT, ATMOS_FRAG, BLACK_HOLE_FRAG } from './shaders.js?v=3.7';
import { mulberry32 } from './utils.js?v=3.7';
import { generatePlanets, generateAsteroidBelt } from './data.js?v=3.7';
import { systemGroup, camera, renderer } from './engine.js?v=3.7';
import { app } from './app.js?v=3.7';

// Texture cache — shared across system visits
const textureCache = {};
const textureLoader = new THREE.TextureLoader();

function loadPlanetTexture(path) {
  if (textureCache[path]) return textureCache[path];
  const tex = textureLoader.load(path);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  textureCache[path] = tex;
  return tex;
}

// 1x1 dark fallback texture (shown while real texture loads)
const fallbackTex = new THREE.DataTexture(new Uint8Array([10, 10, 15, 255]), 1, 1, THREE.RGBAFormat);
fallbackTex.needsUpdate = true;

export function buildSystemView(star) {
  clearSystemView();
  const sc = CONFIG.spectral[star.spectralClass];

  // ── v3: Determine star rendering based on remnant type ──
  let starRadius;
  let starFragShader = STAR_FRAG;
  let starUniforms;

  if (star.remnantType === 'blackHole') {
    const bhCfg = CONFIG.remnants.blackHole;
    starRadius = 4 * bhCfg.starScale;
    starFragShader = BLACK_HOLE_FRAG;
    starUniforms = {
      u_time: { value: 0 },
      u_starRadius: { value: starRadius },
      u_invViewProj: { value: new THREE.Matrix4() },
      u_diskTilt: { value: bhCfg.diskTilt || 0.3 },
    };
  } else if (star.remnantType === 'neutronStar') {
    const nsCfg = CONFIG.remnants.neutronStar;
    starRadius = 4 * nsCfg.starScale;
    starUniforms = {
      u_time: { value: 0 },
      u_starRadius: { value: starRadius },
      u_highTemp: { value: nsCfg.tempK },
      u_spotAmount: { value: 0 },
      u_granuleScale: { value: 2.0 },
      u_euvMix: { value: 0.88 },
      u_starColor: { value: new THREE.Vector3(0.5, 0.6, 1.0) },
      u_invViewProj: { value: new THREE.Matrix4() },
      u_rotSpeed: { value: 0.5 },
    };
  } else if (star.remnantType === 'whiteDwarf') {
    const wdCfg = CONFIG.remnants.whiteDwarf;
    starRadius = 4 * wdCfg.starScale;
    starUniforms = {
      u_time: { value: 0 },
      u_starRadius: { value: starRadius },
      u_highTemp: { value: wdCfg.tempK },
      u_spotAmount: { value: 0.02 },
      u_granuleScale: { value: 1.5 },
      u_euvMix: { value: 0.88 },
      u_starColor: { value: new THREE.Vector3(0.6, 0.7, 1.0) },
      u_invViewProj: { value: new THREE.Matrix4() },
      u_rotSpeed: { value: 0.008 },
    };
  } else {
    starRadius = 4 * sc.starScale;
    starUniforms = {
      u_time: { value: 0 },
      u_starRadius: { value: starRadius },
      u_highTemp: { value: sc.tempK },
      u_spotAmount: { value: sc.spots },
      u_granuleScale: { value: sc.granuleScale },
      u_euvMix: { value: 0.88 },
      u_starColor: { value: new THREE.Vector3(sc.euvTint[0], sc.euvTint[1], sc.euvTint[2]) },
      u_invViewProj: { value: new THREE.Matrix4() },
      u_rotSpeed: { value: 0.012 },
    };
  }

  // Central star — fullscreen quad with ray-marched shader
  const starGeo = new THREE.PlaneGeometry(2, 2);
  app.systemStarMesh = new THREE.Mesh(starGeo, new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: starFragShader,
    uniforms: starUniforms,
    depthWrite: false,
    depthTest: false,
  }));
  app.systemStarMesh.frustumCulled = false;
  app.systemStarMesh.renderOrder = -1;
  systemGroup.add(app.systemStarMesh);

  // Invisible depth sphere
  const depthSphere = new THREE.Mesh(
    new THREE.SphereGeometry(starRadius, 32, 32),
    new THREE.MeshBasicMaterial({ colorWrite: false })
  );
  depthSphere.renderOrder = 0;
  systemGroup.add(depthSphere);

  // Star glow sprite — additive billboard for ambient scene fill
  if (star.remnantType !== 'blackHole') {
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256; glowCanvas.height = 256;
    const gCtx = glowCanvas.getContext('2d');
    const grad = gCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,230,180,1.0)');
    grad.addColorStop(0.08, 'rgba(255,210,150,0.7)');
    grad.addColorStop(0.25, 'rgba(255,180,100,0.25)');
    grad.addColorStop(0.5, 'rgba(255,150,60,0.08)');
    grad.addColorStop(0.8, 'rgba(255,120,40,0.02)');
    grad.addColorStop(1, 'rgba(255,100,30,0)');
    gCtx.fillStyle = grad;
    gCtx.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowColor = star.remnantType
      ? new THREE.Color(0.6, 0.7, 1.0) // neutron/white dwarf: blue-white
      : new THREE.Color(sc.euvTint[0], sc.euvTint[1], sc.euvTint[2]);
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: glowColor,
      transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    }));
    glowSprite.scale.setScalar(starRadius * 7);
    systemGroup.add(glowSprite);
    app.starGlowSprite = glowSprite;
  }

  // v3: Neutron star beams
  if (star.remnantType === 'neutronStar') {
    const nsCfg = CONFIG.remnants.neutronStar;
    const beamLen = nsCfg.beamLength;
    const beamGeo = new THREE.ConeGeometry(0.3, beamLen, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xaabbff, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const beam1 = new THREE.Mesh(beamGeo, beamMat);
    beam1.position.set(0, starRadius + beamLen / 2, 0);
    const beam2 = new THREE.Mesh(beamGeo, beamMat.clone());
    beam2.position.set(0, -(starRadius + beamLen / 2), 0);
    beam2.rotation.x = Math.PI;
    const beamGroup = new THREE.Group();
    beamGroup.add(beam1);
    beamGroup.add(beam2);
    beamGroup.rotation.x = 0.4; // tilt axis
    systemGroup.add(beamGroup);
    app.neutronBeamGroup = beamGroup;
  }

  // Planets
  const planets = generatePlanets(star);
  const orbitLineMat = new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.3, depthWrite: false });

  for (const p of planets) {
    const geo = new THREE.SphereGeometry(1, 48, 48);
    const planetTex = p.texturePath ? loadPlanetTexture(p.texturePath) : fallbackTex;
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
      uniforms: {
        u_time: { value: 0 }, u_type: { value: p.shaderType }, u_seed: { value: (p.seed % 1000) / 1000 },
        u_lightDir: { value: new THREE.Vector3(0, 0, 1) },
        u_tex: { value: planetTex },
        u_atmosCol: { value: new THREE.Vector3(p.atmosCol[0], p.atmosCol[1], p.atmosCol[2]) },
        u_atmosStr: { value: p.atmosStr },
        u_spinRate: { value: p.spinRate },
      },
    }));
    mesh.scale.setScalar(p.visualSize);
    mesh.renderOrder = 1;
    mesh.userData = { planet: p };
    systemGroup.add(mesh);

    // v2: Ray-marched atmospheric scattering mesh
    let atmosMesh = null;
    const pt = CONFIG.planetTypes[p.type];
    if (pt.scatter && pt.scatter.strength > 0) {
      const scc = pt.scatter;
      const atmosR = p.visualSize * scc.shell;
      atmosMesh = new THREE.Mesh(
        new THREE.SphereGeometry(atmosR, 48, 48),
        new THREE.ShaderMaterial({
          vertexShader: ATMOS_VERT, fragmentShader: ATMOS_FRAG,
          uniforms: {
            u_lightDir: { value: new THREE.Vector3(0, 0, 1) },
            u_camPos: { value: camera.position },
            u_center: { value: new THREE.Vector3() },
            u_planetR: { value: p.visualSize },
            u_atmosR: { value: atmosR },
            u_scaleH: { value: scc.scaleH },
            u_scatterCoeff: { value: new THREE.Vector3(scc.coeff[0], scc.coeff[1], scc.coeff[2]) },
            u_density: { value: scc.density },
            u_strength: { value: scc.strength },
          },
          transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
        })
      );
      atmosMesh.renderOrder = 2;
      systemGroup.add(atmosMesh);
    }

    // Ring
    let ring = null;
    if (p.hasRings) {
      const rRng = mulberry32(p.seed + 999);
      const ri = p.visualSize * 1.4, ro = p.visualSize * (2 + rRng() * 0.6);
      ring = new THREE.Mesh(
        new THREE.RingGeometry(ri, ro, 128, 4),
        new THREE.ShaderMaterial({
          vertexShader: RING_VERT, fragmentShader: RING_FRAG,
          uniforms: {
            u_innerR: { value: ri }, u_outerR: { value: ro }, u_seed: { value: (p.seed % 1000) / 1000 },
            // v2: planet shadow uniforms
            u_planetCenter: { value: new THREE.Vector3() },
            u_planetR: { value: p.visualSize },
          },
          transparent: true, side: THREE.DoubleSide, depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2 + (rRng() - 0.5) * 0.3;
      ring.rotation.z = (rRng() - 0.5) * 0.2;
      ring.renderOrder = 1;
      systemGroup.add(ring);
    }

    // Orbit line
    const oPts = [];
    for (let k = 0; k <= 128; k++) {
      const a = (k / 128) * Math.PI * 2;
      oPts.push(new THREE.Vector3(Math.cos(a) * p.orbitRadius, 0, Math.sin(a) * p.orbitRadius));
    }
    const oLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(oPts), orbitLineMat);
    oLine.renderOrder = 1;
    systemGroup.add(oLine);

    // v3: Decorative moons
    const moonMeshes = [];
    if (p.moons && p.moons.length > 0) {
      for (const moon of p.moons) {
        const moonGeo = new THREE.SphereGeometry(moon.size, 12, 12);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.renderOrder = 1;
        systemGroup.add(moonMesh);
        moonMeshes.push({ mesh: moonMesh, data: moon });
      }
    }

    app.systemPlanets.push({ mesh, ring, data: p, orbitLine: oLine, atmosMesh, moonMeshes });
  }

  // v3: Asteroid belt — Points geometry for visibility
  const beltData = generateAsteroidBelt(star, planets);
  if (beltData) {
    const beltCfg = CONFIG.asteroidBelt;
    const count = beltCfg.rockCount;
    const beltRng = mulberry32(beltData.beltSeed);
    const beltWidth = beltData.beltOuterRadius - beltData.beltInnerRadius;

    const bPos = new Float32Array(count * 3);
    const bSizes = new Float32Array(count);
    const bColors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const angle = beltRng() * Math.PI * 2;
      const r = beltData.beltInnerRadius + beltRng() * beltWidth;
      const y = (beltRng() - 0.5) * beltCfg.verticalSpread;
      bPos[i * 3]     = Math.cos(angle) * r;
      bPos[i * 3 + 1] = y;
      bPos[i * 3 + 2] = Math.sin(angle) * r;
      bSizes[i] = beltCfg.rockScaleMin + beltRng() * (beltCfg.rockScaleMax - beltCfg.rockScaleMin);
      // Slight color variation (brownish-gray)
      const v = 0.35 + beltRng() * 0.25;
      bColors[i * 3]     = v * 1.1;
      bColors[i * 3 + 1] = v * 0.95;
      bColors[i * 3 + 2] = v * 0.8;
    }

    const beltGeo = new THREE.BufferGeometry();
    beltGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    beltGeo.setAttribute('size', new THREE.BufferAttribute(bSizes, 1));
    beltGeo.setAttribute('color', new THREE.BufferAttribute(bColors, 3));

    const beltMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        varying vec3 vC;
        void main(){
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * (150.0 / -mv.z), 1.0, 4.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if(d > 1.0) discard;
          float alpha = (1.0 - d * d) * 0.7;
          gl_FragColor = vec4(vC * 0.8, alpha);
        }`,
      transparent: true, vertexColors: true, depthWrite: false,
    });

    const beltPoints = new THREE.Points(beltGeo, beltMat);
    beltPoints.renderOrder = 1;
    systemGroup.add(beltPoints);
    app.asteroidBeltMesh = beltPoints;
  }

  // v3: Planet selection ring indicator
  const selRingGeo = new THREE.RingGeometry(1, 1.08, 64);
  const selRingMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv;
      void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `precision highp float;
      varying vec2 vUv;
      uniform float u_time;
      void main(){
        float pulse=0.5+0.5*sin(u_time*3.0);
        float alpha=mix(0.25,0.5,pulse);
        gl_FragColor=vec4(0.5,0.75,1.0,alpha);
      }`,
    uniforms: { u_time: { value: 0 } },
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const selRing = new THREE.Mesh(selRingGeo, selRingMat);
  selRing.rotation.x = -Math.PI / 2;
  selRing.visible = false;
  selRing.renderOrder = 3;
  systemGroup.add(selRing);
  app.selectionRing = selRing;
  app.selectedPlanetId = null;

  // System starfield (3D points with parallax) — boosted brightness
  const sN = 2000, sPos = new Float32Array(sN * 3), sSz = new Float32Array(sN);
  for (let i = 0; i < sN; i++) {
    const r = 60 + Math.random() * 300, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    sPos[i*3] = r*Math.sin(ph)*Math.cos(th); sPos[i*3+1] = r*Math.sin(ph)*Math.sin(th); sPos[i*3+2] = r*Math.cos(ph);
    sSz[i] = 0.5 + Math.random() * 1.5;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('size', new THREE.BufferAttribute(sSz, 1));
  const sfMat = new THREE.ShaderMaterial({
    vertexShader: `attribute float size;
      uniform float u_boost;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1);gl_PointSize=size*u_boost*(150./-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float u_boost;
      void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(vec3(.8,.85,.9),(1.-smoothstep(0.,1.,d))*0.5*u_boost);}`,
    uniforms: { u_boost: { value: 2.5 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  systemGroup.add(new THREE.Points(sGeo, sfMat));
  app.starfieldMat = sfMat;
}

export function clearSystemView() {
  while (systemGroup.children.length) {
    const c = systemGroup.children[0];
    systemGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
  }
  app.systemPlanets = [];
  app.systemStarMesh = null;
  app.asteroidBeltMesh = null;
  app.neutronBeamGroup = null;
  app.selectionRing = null;
  app.selectedPlanetId = null;
  app.starGlowSprite = null;
  app.starfieldMat = null;
}

const _ivp = new THREE.Matrix4();

export function updateSystemView(time) {
  if (app.systemStarMesh) {
    app.systemStarMesh.material.uniforms.u_time.value = time;
    _ivp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    app.systemStarMesh.material.uniforms.u_invViewProj.value.copy(_ivp);
  }
  const ld = new THREE.Vector3();
  const worldLd = new THREE.Vector3();
  for (const p of app.systemPlanets) {
    const a = p.data.orbitPhase + time * p.data.orbitSpeed;
    const px = Math.cos(a) * p.data.orbitRadius;
    const pz = Math.sin(a) * p.data.orbitRadius;
    p.mesh.position.set(px, 0, pz);
    p.mesh.material.uniforms.u_time.value = time;
    ld.set(-px, 0, -pz).normalize().transformDirection(camera.matrixWorldInverse);
    p.mesh.material.uniforms.u_lightDir.value.copy(ld);

    if (p.ring) {
      p.ring.position.set(px, 0, pz);
      // v2: update planet shadow center for ring shader
      p.ring.material.uniforms.u_planetCenter.value.set(px, 0, pz);
    }

    // v2: update atmosphere mesh position + uniforms
    if (p.atmosMesh) {
      p.atmosMesh.position.set(px, 0, pz);
      const am = p.atmosMesh.material.uniforms;
      am.u_center.value.set(px, 0, pz);
      am.u_camPos.value.copy(camera.position);
      // World-space light direction (toward star at origin)
      worldLd.set(-px, 0, -pz).normalize();
      am.u_lightDir.value.copy(worldLd);
    }

    // v3: Update moons
    if (p.moonMeshes) {
      for (const moon of p.moonMeshes) {
        const ma = moon.data.orbitPhase + time * moon.data.orbitSpeed;
        const mx = px + Math.cos(ma) * moon.data.orbitRadius;
        const mz = pz + Math.sin(ma) * moon.data.orbitRadius;
        moon.mesh.position.set(mx, 0, mz);
      }
    }
  }

  // v3: Update selection ring
  if (app.selectionRing && app.selectedPlanetId !== null) {
    const sp = app.systemPlanets.find(p => p.data.id === app.selectedPlanetId);
    if (sp) {
      const pos = sp.mesh.position;
      const scale = sp.data.visualSize * 1.6;
      app.selectionRing.position.set(pos.x, 0.01, pos.z);
      app.selectionRing.scale.setScalar(scale);
      app.selectionRing.material.uniforms.u_time.value = time;
      app.selectionRing.visible = true;
    }
  }

  // v3: Rotate asteroid belt
  if (app.asteroidBeltMesh) {
    app.asteroidBeltMesh.rotation.y = time * CONFIG.asteroidBelt.orbitSpeedBase;
  }

  // v3: Rotate neutron star beams
  if (app.neutronBeamGroup) {
    app.neutronBeamGroup.rotation.z = time * 2.0;
  }
}

// ── Planet snapshot renderer ──
const SNAP_SIZE = 128;
let snapScene, snapCam, snapRT, snapCanvas, snapCtx;

function initSnap() {
  if (snapScene) return;
  snapScene = new THREE.Scene();
  snapCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  snapCam.position.set(0, 0, 3.2);
  snapCam.lookAt(0, 0, 0);
  snapRT = new THREE.WebGLRenderTarget(SNAP_SIZE, SNAP_SIZE);
  snapCanvas = document.createElement('canvas');
  snapCanvas.width = SNAP_SIZE;
  snapCanvas.height = SNAP_SIZE;
  snapCtx = snapCanvas.getContext('2d');
}

export function capturePlanetSnapshot(planetEntry) {
  initSnap();
  const geo = new THREE.SphereGeometry(1, 48, 48);
  const mat = planetEntry.mesh.material.clone();
  mat.uniforms.u_lightDir.value = new THREE.Vector3(0.5, 0.25, 0.75).normalize();
  const mesh = new THREE.Mesh(geo, mat);
  snapScene.add(mesh);

  let ringMesh = null;
  if (planetEntry.ring) {
    ringMesh = planetEntry.ring.clone();
    ringMesh.position.set(0, 0, 0);
    snapScene.add(ringMesh);
  }

  const savedColor = new THREE.Color();
  renderer.getClearColor(savedColor);
  const savedAlpha = renderer.getClearAlpha();
  const savedTarget = renderer.getRenderTarget();

  renderer.setRenderTarget(snapRT);
  renderer.setClearColor(0x060810, 1);
  renderer.clear();
  renderer.render(snapScene, snapCam);

  const px = new Uint8Array(SNAP_SIZE * SNAP_SIZE * 4);
  renderer.readRenderTargetPixels(snapRT, 0, 0, SNAP_SIZE, SNAP_SIZE, px);

  renderer.setRenderTarget(savedTarget);
  renderer.setClearColor(savedColor, savedAlpha);

  snapScene.remove(mesh);
  geo.dispose();
  mat.dispose();
  if (ringMesh) snapScene.remove(ringMesh);

  const img = snapCtx.createImageData(SNAP_SIZE, SNAP_SIZE);
  for (let y = 0; y < SNAP_SIZE; y++) {
    const src = (SNAP_SIZE - 1 - y) * SNAP_SIZE * 4;
    const dst = y * SNAP_SIZE * 4;
    for (let x = 0; x < SNAP_SIZE; x++) {
      const si = src + x * 4, di = dst + x * 4;
      img.data[di] = px[si]; img.data[di+1] = px[si+1];
      img.data[di+2] = px[si+2]; img.data[di+3] = 255;
    }
  }
  snapCtx.putImageData(img, 0, 0);
  return snapCanvas.toDataURL();
}
