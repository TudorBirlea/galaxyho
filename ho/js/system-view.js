import * as THREE from 'three';
import { CONFIG } from './config.js';
import { STAR_VERT, STAR_FRAG, PLANET_VERT, PLANET_FRAG, RING_VERT, RING_FRAG } from './shaders.js';
import { mulberry32 } from './utils.js';
import { generatePlanets } from './data.js';
import { systemGroup, camera, renderer } from './engine.js';
import { app } from './app.js';

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

  // Central star — fullscreen quad with ray-marched shader (matches experiment)
  const starRadius = 4 * sc.starScale;
  const starGeo = new THREE.PlaneGeometry(2, 2);
  app.systemStarMesh = new THREE.Mesh(starGeo, new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    uniforms: {
      u_time: { value: 0 },
      u_starRadius: { value: starRadius },
      u_highTemp: { value: sc.tempK },
      u_spotAmount: { value: sc.spots },
      u_granuleScale: { value: sc.granuleScale },
      u_euvMix: { value: 0.88 },
      u_starColor: { value: new THREE.Vector3(sc.euvTint[0], sc.euvTint[1], sc.euvTint[2]) },
      u_invViewProj: { value: new THREE.Matrix4() },
    },
    depthWrite: false,
    depthTest: false,
  }));
  app.systemStarMesh.frustumCulled = false;
  app.systemStarMesh.renderOrder = -1;
  systemGroup.add(app.systemStarMesh);

  // Invisible depth sphere — writes depth buffer so planets/orbits are occluded behind the star
  const depthSphere = new THREE.Mesh(
    new THREE.SphereGeometry(starRadius, 32, 32),
    new THREE.MeshBasicMaterial({ colorWrite: false })
  );
  depthSphere.renderOrder = 0;
  systemGroup.add(depthSphere);

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

    let ring = null;
    if (p.hasRings) {
      const rRng = mulberry32(p.seed + 999);
      const ri = p.visualSize * 1.4, ro = p.visualSize * (2 + rRng() * 0.6);
      ring = new THREE.Mesh(
        new THREE.RingGeometry(ri, ro, 128, 4),
        new THREE.ShaderMaterial({
          vertexShader: RING_VERT, fragmentShader: RING_FRAG,
          uniforms: { u_innerR: { value: ri }, u_outerR: { value: ro }, u_seed: { value: (p.seed % 1000) / 1000 } },
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

    app.systemPlanets.push({ mesh, ring, data: p, orbitLine: oLine });
  }

  // System starfield (3D points with parallax)
  const sN = 2000, sPos = new Float32Array(sN * 3), sSz = new Float32Array(sN);
  for (let i = 0; i < sN; i++) {
    const r = 60 + Math.random() * 300, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    sPos[i*3] = r*Math.sin(ph)*Math.cos(th); sPos[i*3+1] = r*Math.sin(ph)*Math.sin(th); sPos[i*3+2] = r*Math.cos(ph);
    sSz[i] = 0.5 + Math.random() * 1.5;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('size', new THREE.BufferAttribute(sSz, 1));
  systemGroup.add(new THREE.Points(sGeo, new THREE.ShaderMaterial({
    vertexShader: `attribute float size;void main(){vec4 mv=modelViewMatrix*vec4(position,1);gl_PointSize=size*(150./-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(vec3(.8,.85,.9),(1.-smoothstep(0.,1.,d))*.5);}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  })));
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
}

const _ivp = new THREE.Matrix4();

export function updateSystemView(time) {
  if (app.systemStarMesh) {
    app.systemStarMesh.material.uniforms.u_time.value = time;
    // Update inverse view-projection for ray reconstruction
    _ivp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    app.systemStarMesh.material.uniforms.u_invViewProj.value.copy(_ivp);
  }
  const ld = new THREE.Vector3();
  for (const p of app.systemPlanets) {
    const a = p.data.orbitPhase + time * p.data.orbitSpeed;
    const px = Math.cos(a) * p.data.orbitRadius;
    const pz = Math.sin(a) * p.data.orbitRadius;
    p.mesh.position.set(px, 0, pz);
    p.mesh.material.uniforms.u_time.value = time;
    ld.set(-px, 0, -pz).normalize().transformDirection(camera.matrixWorldInverse);
    p.mesh.material.uniforms.u_lightDir.value.copy(ld);
    if (p.ring) p.ring.position.set(px, 0, pz);
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
  // Nice 3/4 lighting angle in snapshot camera view space
  mat.uniforms.u_lightDir.value = new THREE.Vector3(0.5, 0.25, 0.75).normalize();
  const mesh = new THREE.Mesh(geo, mat);
  snapScene.add(mesh);

  // Add ring if planet has one
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

  // WebGL reads bottom-up; canvas is top-down
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
