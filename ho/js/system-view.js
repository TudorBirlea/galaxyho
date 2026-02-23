import * as THREE from 'three';
import { CONFIG } from './config.js';
import { STAR_VERT, STAR_FRAG, PLANET_VERT, PLANET_FRAG, RING_VERT, RING_FRAG,
         ATMOS_VERT, ATMOS_FRAG, BLACK_HOLE_FRAG, COMET_TAIL_VERT, COMET_TAIL_FRAG } from './shaders.js';
import { mulberry32 } from './utils.js';
import { generatePlanets, generateAsteroidBelt, generateComets } from './data.js';
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

  // v3: Asteroid belt
  const beltData = generateAsteroidBelt(star, planets);
  if (beltData) {
    const beltCfg = CONFIG.asteroidBelt;
    const rockGeo = new THREE.OctahedronGeometry(1, 0);
    const rockMat = new THREE.MeshBasicMaterial({ color: 0x554433 });
    const count = beltCfg.rockCount;
    const belt = new THREE.InstancedMesh(rockGeo, rockMat, count);
    belt.renderOrder = 1;

    const beltRng = mulberry32(beltData.beltSeed);
    const dummy = new THREE.Object3D();
    const beltWidth = beltData.beltOuterRadius - beltData.beltInnerRadius;

    for (let i = 0; i < count; i++) {
      const angle = beltRng() * Math.PI * 2;
      const r = beltData.beltInnerRadius + beltRng() * beltWidth;
      const y = (beltRng() - 0.5) * beltCfg.verticalSpread;
      dummy.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      const s = beltCfg.rockScaleMin + beltRng() * (beltCfg.rockScaleMax - beltCfg.rockScaleMin);
      dummy.scale.setScalar(s);
      dummy.rotation.set(beltRng() * Math.PI, beltRng() * Math.PI, beltRng() * Math.PI);
      dummy.updateMatrix();
      belt.setMatrixAt(i, dummy.matrix);
    }
    belt.instanceMatrix.needsUpdate = true;
    systemGroup.add(belt);
    app.asteroidBeltMesh = belt;
  }

  // v3: Comets
  const comets = generateComets(star);
  for (const c of comets) {
    const cCfg = CONFIG.comets;
    // Comet head
    const headGeo = new THREE.SphereGeometry(cCfg.headSize, 8, 8);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xccddff });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.renderOrder = 1;
    systemGroup.add(headMesh);

    // Comet coma glow
    const comaGeo = new THREE.SphereGeometry(cCfg.headSize * 3, 8, 8);
    const comaMat = new THREE.MeshBasicMaterial({
      color: 0x88bbff, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const comaMesh = new THREE.Mesh(comaGeo, comaMat);
    comaMesh.renderOrder = 1;
    systemGroup.add(comaMesh);

    // Comet tail particles
    const tailCount = cCfg.trailParticles;
    const tailPos = new Float32Array(tailCount * 3);
    const tailAlpha = new Float32Array(tailCount);
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
    tailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(tailAlpha, 1));
    const tailMat = new THREE.ShaderMaterial({
      vertexShader: COMET_TAIL_VERT, fragmentShader: COMET_TAIL_FRAG,
      uniforms: { u_color: { value: new THREE.Vector3(0.5, 0.7, 1.0) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const tailPoints = new THREE.Points(tailGeo, tailMat);
    tailPoints.renderOrder = 1;
    systemGroup.add(tailPoints);

    app.cometEntries.push({ headMesh, comaMesh, tailPoints, data: c });
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
  app.asteroidBeltMesh = null;
  app.cometEntries = [];
  app.neutronBeamGroup = null;
}

const _ivp = new THREE.Matrix4();
const _tailDir = new THREE.Vector3();

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

  // v3: Rotate asteroid belt
  if (app.asteroidBeltMesh) {
    app.asteroidBeltMesh.rotation.y = time * CONFIG.asteroidBelt.orbitSpeedBase;
  }

  // v3: Update comets
  const cCfg = CONFIG.comets;
  for (const ce of app.cometEntries) {
    const c = ce.data;
    // Kepler equation: M = E - e*sin(E)
    const M = c.orbitPhase + time * cCfg.speedMultiplier / Math.pow(c.semiMajorAxis, 1.5);
    let E = M;
    for (let k = 0; k < 5; k++) E = M + c.eccentricity * Math.sin(E);

    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const trueAnomaly = Math.atan2(
      Math.sqrt(1 - c.eccentricity * c.eccentricity) * sinE,
      cosE - c.eccentricity
    );
    const r = c.semiMajorAxis * (1 - c.eccentricity * cosE);

    const ci = Math.cos(c.orbitInclination), si = Math.sin(c.orbitInclination);
    const cx = Math.cos(trueAnomaly) * r;
    const cz = Math.sin(trueAnomaly) * r;
    const cy = cz * si;
    const czFinal = cz * ci;

    ce.headMesh.position.set(cx, cy, czFinal);
    ce.comaMesh.position.set(cx, cy, czFinal);

    // Tail: points away from star (anti-sunward)
    _tailDir.set(cx, cy, czFinal).normalize();
    const tailLen = 1.5 + 3.0 / Math.max(r, 1);
    const tailGeo = ce.tailPoints.geometry;
    const tailPos = tailGeo.attributes.position.array;
    const tailAlpha = tailGeo.attributes.aAlpha.array;
    const tailCount = cCfg.trailParticles;

    for (let i = 0; i < tailCount; i++) {
      const t = i / tailCount;
      const spread = t * 0.3;
      const lateralX = Math.sin(i * 7.3 + c.seed * 0.01) * spread;
      const lateralY = Math.cos(i * 5.7 + c.seed * 0.02) * spread;
      tailPos[i * 3]     = cx + _tailDir.x * t * tailLen + lateralX;
      tailPos[i * 3 + 1] = cy + _tailDir.y * t * tailLen + lateralY;
      tailPos[i * 3 + 2] = czFinal + _tailDir.z * t * tailLen;
      tailAlpha[i] = cCfg.tailBrightness * (1 - t);
    }
    tailGeo.attributes.position.needsUpdate = true;
    tailGeo.attributes.aAlpha.needsUpdate = true;
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
