import * as THREE from 'three';
import { CONFIG } from './config.js?v=5.0';
import { STAR_VERT, STAR_FRAG, PLANET_VERT, PLANET_FRAG, RING_VERT, RING_FRAG,
         ATMOS_VERT, ATMOS_FRAG, BLACK_HOLE_FRAG,
         COMET_TAIL_VERT, COMET_TAIL_FRAG } from './shaders.js?v=5.0';
import { mulberry32 } from './utils.js?v=5.0';
import { generatePlanets, generateAsteroidBelt, generateComets } from './data.js?v=5.0';
import { systemGroup, camera, renderer } from './engine.js?v=5.0';
import { app } from './app.js?v=5.0';
import { createShipMesh, positionShipAtStar, updateShip, clearShip } from './ship.js?v=5.0';
import { hashInt } from './utils.js?v=5.0';
import { getUpgradeEffects } from './gameplay.js?v=5.0';

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
      u_diskOuter: { value: 8.0 },
      u_diskBright: { value: 1.2 },
      u_dopplerStr: { value: 1.8 },
      u_spiralStr: { value: 0.35 },
      u_exposure: { value: 0.7 },
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

  // Invisible depth sphere — prevents planets rendering inside star
  // Skipped for black holes: shader handles its own shadow via geodesic tracing
  if (star.remnantType !== 'blackHole') {
    const depthSphere = new THREE.Mesh(
      new THREE.SphereGeometry(starRadius, 32, 32),
      new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    depthSphere.renderOrder = 0;
    systemGroup.add(depthSphere);
  }

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

  // v5: Event indicators (Event Scanner upgrade)
  const effects = getUpgradeEffects(app.state);
  if (effects.revealEvents) {
    for (const pe of app.systemPlanets) {
      const key = star.id + '-' + pe.data.id;
      if (app.state.resolvedEvents && app.state.resolvedEvents[key]) continue;
      if (app.state.scannedPlanets.has(key)) continue;
      // Deterministic event check (same as events.js)
      const evtRng = mulberry32(hashInt(pe.data.seed, 9999));
      if (evtRng() <= CONFIG.gameplay.eventChance) {
        // Add a small pulsing indicator sprite above the planet
        const indCanvas = document.createElement('canvas');
        indCanvas.width = 32; indCanvas.height = 32;
        const iCtx = indCanvas.getContext('2d');
        const iGrad = iCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
        iGrad.addColorStop(0, 'rgba(255,200,60,1)');
        iGrad.addColorStop(0.3, 'rgba(255,180,40,0.5)');
        iGrad.addColorStop(1, 'rgba(255,150,20,0)');
        iCtx.fillStyle = iGrad;
        iCtx.fillRect(0, 0, 32, 32);
        const indTex = new THREE.CanvasTexture(indCanvas);
        const indSprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: indTex, transparent: true, opacity: 0.7,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        indSprite.scale.setScalar(0.3);
        indSprite.renderOrder = 5;
        indSprite.userData = { eventIndicator: true, planetId: pe.data.id };
        systemGroup.add(indSprite);
      }
    }
  }

  // v4: Enhanced asteroid belt — Keplerian orbits, irregular shapes, composition colors,
  // phase-angle lighting, Gaussian vertical distribution, dust layer, large rocks, collision bursts
  const beltData = generateAsteroidBelt(star, planets);
  if (beltData) {
    const beltCfg = CONFIG.asteroidBelt;
    const count = beltCfg.rockCount;
    const beltRng = mulberry32(beltData.beltSeed);
    const bInner = beltData.beltInnerRadius;
    const bOuter = beltData.beltOuterRadius;
    const beltWidth = bOuter - bInner;

    // Per-particle attributes
    const aRadius = new Float32Array(count);
    const aAngle = new Float32Array(count);
    const aY = new Float32Array(count);
    const aSize = new Float32Array(count);
    const aSeed = new Float32Array(count);
    const aCompType = new Float32Array(count);

    // Dummy position for Three.js bounding (real positions computed in vertex shader)
    const dummyPos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      aRadius[i] = bInner + beltRng() * beltWidth;
      aAngle[i] = beltRng() * Math.PI * 2;
      // Gaussian vertical (CLT: avg of 3 randoms)
      aY[i] = ((beltRng() + beltRng() + beltRng()) / 3 - 0.5) * beltCfg.verticalSpread;
      aSize[i] = beltCfg.rockScaleMin + beltRng() * (beltCfg.rockScaleMax - beltCfg.rockScaleMin);
      aSeed[i] = beltRng();
      // Composition: 60% silicate, 25% carbonaceous, 15% metallic
      const ct = beltRng();
      aCompType[i] = ct < 0.60 ? 0.0 : ct < 0.85 ? 1.0 : 2.0;

      dummyPos[i * 3]     = Math.cos(aAngle[i]) * aRadius[i];
      dummyPos[i * 3 + 1] = aY[i];
      dummyPos[i * 3 + 2] = Math.sin(aAngle[i]) * aRadius[i];
    }

    const beltGeo = new THREE.BufferGeometry();
    beltGeo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
    beltGeo.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
    beltGeo.setAttribute('aAngle', new THREE.BufferAttribute(aAngle, 1));
    beltGeo.setAttribute('aY', new THREE.BufferAttribute(aY, 1));
    beltGeo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    beltGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    beltGeo.setAttribute('aCompType', new THREE.BufferAttribute(aCompType, 1));
    beltGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), bOuter + 2);

    const beltMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float aRadius;
        attribute float aAngle;
        attribute float aY;
        attribute float aSize;
        attribute float aSeed;
        attribute float aCompType;
        uniform float u_time;
        uniform float u_orbitSpeed;
        varying vec3 vColor;
        varying float vSeed;
        void main() {
          // Keplerian orbital speed
          float speed = u_orbitSpeed / sqrt(aRadius);
          float angle = aAngle + u_time * speed;
          vec3 worldPos = vec3(cos(angle) * aRadius, aY, sin(angle) * aRadius);

          // Color by composition type
          float v = 0.35 + aSeed * 0.25;
          vec3 baseColor;
          if (aCompType < 0.5) {
            // Silicate: warm gray-brown
            baseColor = vec3(v * 1.15, v * 0.90, v * 0.70);
          } else if (aCompType < 1.5) {
            // Carbonaceous: dark charcoal
            float d = 0.18 + aSeed * 0.12;
            baseColor = vec3(d * 0.95, d * 0.95, d * 1.0);
          } else {
            // Metallic: brighter blue-gray
            float m = 0.45 + aSeed * 0.30;
            baseColor = vec3(m * 0.90, m * 0.95, m * 1.15);
          }

          // Phase-angle lighting (star at origin)
          vec3 toStar = normalize(-worldPos);
          vec3 toCam = normalize(cameraPosition - worldPos);
          float phase = dot(toStar, toCam);
          float lightFactor = 0.25 + 0.75 * clamp(phase * 0.5 + 0.5, 0.0, 1.0);
          baseColor *= lightFactor;

          vColor = baseColor;
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(worldPos, 1.0);
          gl_PointSize = clamp(aSize * (180.0 / -mv.z), 1.0, 6.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vSeed;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv) * 2.0;
          // Irregular rocky shapes via angular distortion
          float angle = atan(uv.y, uv.x);
          float s = vSeed * 100.0;
          d += 0.10 * sin(angle * 3.0 + s)
             + 0.07 * sin(angle * 5.0 + s * 2.3)
             + 0.05 * sin(angle * 7.0 + s * 3.7)
             + 0.03 * sin(angle * 11.0 + s * 5.1);
          if (d > 0.9) discard;
          float alpha = (1.0 - smoothstep(0.5, 0.9, d)) * 0.7;
          gl_FragColor = vec4(vColor * 0.85, alpha);
        }`,
      uniforms: {
        u_time: { value: 0 },
        u_orbitSpeed: { value: beltCfg.orbitSpeedBase },
      },
      transparent: true, depthWrite: false,
    });

    const beltPoints = new THREE.Points(beltGeo, beltMat);
    beltPoints.frustumCulled = false;
    beltPoints.renderOrder = 1;
    beltPoints.userData = { beltInner: bInner, beltOuter: bOuter };
    systemGroup.add(beltPoints);
    app.asteroidBeltMesh = beltPoints;

    // ── Dust glow layer ──
    const dustGeo = new THREE.RingGeometry(bInner - 0.5, bOuter + 0.5, 128, 1);
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWP;
        void main() {
          vWP = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        varying vec3 vWP;
        uniform float u_opacity, u_time, u_inner, u_outer;
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise2d(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        void main() {
          float r = length(vWP.xz);
          float mid = (u_inner + u_outer) * 0.5;
          float hw = (u_outer - u_inner) * 0.5 + 0.5;
          float radial = 1.0 - smoothstep(0.0, 1.0, abs(r - mid) / hw);
          radial *= radial;
          float ang = atan(vWP.z, vWP.x);
          float n = noise2d(vec2(ang * 3.0, r * 0.5) + u_time * 0.01);
          float n2 = noise2d(vec2(ang * 7.0 + 10.0, r * 1.5) + u_time * 0.005);
          float density = radial * (0.5 + 0.3 * n + 0.2 * n2);
          vec3 dustCol = mix(vec3(0.5, 0.4, 0.3), vec3(0.6, 0.5, 0.35), n);
          gl_FragColor = vec4(dustCol, density * u_opacity);
        }`,
      uniforms: {
        u_opacity: { value: beltCfg.dustOpacity },
        u_time: { value: 0 },
        u_inner: { value: bInner },
        u_outer: { value: bOuter },
      },
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const dustMesh = new THREE.Mesh(dustGeo, dustMat);
    dustMesh.rotation.x = -Math.PI / 2;
    dustMesh.renderOrder = 0;
    systemGroup.add(dustMesh);
    app.asteroidDustMesh = dustMesh;

    // ── Large named rocks ──
    for (let i = 0; i < beltCfg.largeRockCount; i++) {
      const rockRng = mulberry32(beltData.beltSeed + 100 + i * 37);
      const sz = beltCfg.largeRockSizeMin + rockRng() * (beltCfg.largeRockSizeMax - beltCfg.largeRockSizeMin);
      const geo = new THREE.IcosahedronGeometry(sz, 1);
      const posAttr = geo.attributes.position;
      for (let v = 0; v < posAttr.count; v++) {
        const scale = 1.0 + (rockRng() - 0.5) * 0.4;
        posAttr.setXYZ(v, posAttr.getX(v) * scale, posAttr.getY(v) * scale, posAttr.getZ(v) * scale);
      }
      geo.computeVertexNormals();
      const colors = [0x6b5e50, 0x585858, 0x4a3e34, 0x7a7268, 0x5e4a40];
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      const orbitR = bInner + 1 + (beltWidth - 2) * (i / Math.max(beltCfg.largeRockCount - 1, 1));
      mesh.userData = { orbitR, phase: rockRng() * Math.PI * 2, rotSpeed: 0.5 + rockRng() * 2 };
      mesh.renderOrder = 1;
      systemGroup.add(mesh);
      app.asteroidRocks.push(mesh);
    }

    // ── Collision burst pool ──
    const burstMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(2.0 * (100.0 / -mv.z), 0.5, 3.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(0.8, 0.6, 0.4, (1.0 - d * d) * vAlpha);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const bpc = beltCfg.burstParticleCount;
    for (let b = 0; b < 8; b++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(bpc * 3);
      const alpha = new Float32Array(bpc);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), bOuter + 5);
      const points = new THREE.Points(geo, burstMat);
      points.visible = false;
      points.frustumCulled = false;
      points.renderOrder = 2;
      systemGroup.add(points);
      app.asteroidBursts.push({
        points,
        initPos: new Float32Array(bpc * 3),
        vel: new Float32Array(bpc * 3),
        active: false,
        spawnTime: 0,
      });
    }
    app.asteroidNextBurst = beltCfg.collisionInterval * (0.5 + Math.random());
  }

  // v4: Comets — dual tails, activity scaling, sparkle, orbit paths
  const cometDefs = generateComets(star);
  if (cometDefs.length > 0) {
    const cCfg = CONFIG.comets;

    // Shared coma texture — soft radial glow
    const comaCanvas = document.createElement('canvas');
    comaCanvas.width = 256; comaCanvas.height = 256;
    const comaCtx = comaCanvas.getContext('2d');
    const comaGrad = comaCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    comaGrad.addColorStop(0, 'rgba(200,220,255,1)');
    comaGrad.addColorStop(0.04, 'rgba(180,210,255,0.85)');
    comaGrad.addColorStop(0.12, 'rgba(150,195,255,0.4)');
    comaGrad.addColorStop(0.3, 'rgba(120,170,255,0.12)');
    comaGrad.addColorStop(0.55, 'rgba(100,150,240,0.03)');
    comaGrad.addColorStop(1, 'rgba(80,130,220,0)');
    comaCtx.fillStyle = comaGrad;
    comaCtx.fillRect(0, 0, 256, 256);
    const comaTex = new THREE.CanvasTexture(comaCanvas);

    for (const def of cometDefs) {
      // Coma sprite — soft billboard
      const comaSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: comaTex, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      }));
      comaSprite.scale.setScalar(2.5);
      comaSprite.renderOrder = 3;
      systemGroup.add(comaSprite);

      // Ion tail — blue-white, straight anti-sunward
      const ionCount = cCfg.ionCount;
      const ionGeo = new THREE.BufferGeometry();
      ionGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ionCount * 3), 3));
      ionGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(ionCount), 1));
      ionGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(ionCount), 1));
      ionGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 150);
      const ionMat = new THREE.ShaderMaterial({
        vertexShader: COMET_TAIL_VERT, fragmentShader: COMET_TAIL_FRAG,
        uniforms: { u_color: { value: new THREE.Vector3(0.45, 0.65, 1.0) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const ionPoints = new THREE.Points(ionGeo, ionMat);
      ionPoints.frustumCulled = false;
      ionPoints.renderOrder = 2;
      systemGroup.add(ionPoints);

      // Dust tail — warm gold, curved behind orbit
      const dustCount = cCfg.dustCount;
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dustCount * 3), 3));
      dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(dustCount), 1));
      dustGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(dustCount), 1));
      dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 150);
      const dustMat = new THREE.ShaderMaterial({
        vertexShader: COMET_TAIL_VERT, fragmentShader: COMET_TAIL_FRAG,
        uniforms: { u_color: { value: new THREE.Vector3(0.95, 0.75, 0.35) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const dustPoints = new THREE.Points(dustGeo, dustMat);
      dustPoints.frustumCulled = false;
      dustPoints.renderOrder = 2;
      systemGroup.add(dustPoints);

      // Orbit line — dashed ellipse
      const orbitPts = [];
      for (let k = 0; k <= 200; k++) {
        const E = (k / 200) * Math.PI * 2;
        const cosE = Math.cos(E), sinE = Math.sin(E);
        const r = def.semiMajorAxis * (1 - def.eccentricity * cosE);
        const ta = Math.atan2(Math.sqrt(1 - def.eccentricity * def.eccentricity) * sinE, cosE - def.eccentricity);
        const cx = Math.cos(ta) * r, cz = Math.sin(ta) * r;
        const ci = Math.cos(def.inclination), si = Math.sin(def.inclination);
        orbitPts.push(new THREE.Vector3(cx, cz * si, cz * ci));
      }
      const cometOrbitLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(orbitPts),
        new THREE.LineDashedMaterial({
          color: 0x446688, transparent: true, opacity: 0.15,
          dashSize: 0.5, gapSize: 0.3, depthWrite: false,
        })
      );
      cometOrbitLine.computeLineDistances();
      cometOrbitLine.renderOrder = 1;
      systemGroup.add(cometOrbitLine);

      app.cometEntries.push({
        def, comaSprite, ionPoints, dustPoints, orbitLine: cometOrbitLine,
        prevX: 0, prevY: 0, prevZ: 0,
      });
    }
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

  // v5: Ship mesh
  createShipMesh();
  positionShipAtStar(starRadius);
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
  app.asteroidDustMesh = null;
  app.asteroidRocks = [];
  app.asteroidBursts = [];
  app.asteroidNextBurst = 0;
  app.neutronBeamGroup = null;
  app.selectionRing = null;
  app.selectedPlanetId = null;
  app.starGlowSprite = null;
  app.starfieldMat = null;
  app.cometEntries = [];
  clearShip();
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

  // v5: Update event indicator positions
  for (const child of systemGroup.children) {
    if (child.userData && child.userData.eventIndicator) {
      const pe = app.systemPlanets.find(p => p.data.id === child.userData.planetId);
      if (pe) {
        child.position.set(pe.mesh.position.x, pe.mesh.position.y + pe.data.visualSize + 0.4, pe.mesh.position.z);
        child.material.opacity = 0.4 + 0.3 * Math.sin(time * 3);
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

  // v4: Update asteroid belt (Keplerian orbits via shader, dust, rocks, collision bursts)
  if (app.asteroidBeltMesh) {
    app.asteroidBeltMesh.material.uniforms.u_time.value = time;
  }
  if (app.asteroidDustMesh) {
    app.asteroidDustMesh.material.uniforms.u_time.value = time;
  }
  for (const rock of app.asteroidRocks) {
    const { orbitR, phase, rotSpeed } = rock.userData;
    const speed = CONFIG.asteroidBelt.orbitSpeedBase / Math.sqrt(orbitR);
    const angle = phase + time * speed;
    rock.position.set(Math.cos(angle) * orbitR, 0, Math.sin(angle) * orbitR);
    rock.rotation.x = time * rotSpeed * 0.7;
    rock.rotation.y = time * rotSpeed;
  }
  // Collision bursts
  if (app.asteroidBursts.length > 0) {
    const bCfg = CONFIG.asteroidBelt;
    // Spawn burst occasionally
    if (time > app.asteroidNextBurst) {
      const burst = app.asteroidBursts.find(b => !b.active);
      if (burst && app.asteroidBeltMesh) {
        const { beltInner, beltOuter } = app.asteroidBeltMesh.userData;
        const bw = beltOuter - beltInner;
        const ba = Math.random() * Math.PI * 2;
        const br = beltInner + Math.random() * bw;
        const ox = Math.cos(ba) * br, oz = Math.sin(ba) * br;
        const bpc = bCfg.burstParticleCount;
        for (let i = 0; i < bpc; i++) {
          burst.initPos[i*3]     = ox;
          burst.initPos[i*3 + 1] = (Math.random() - 0.5) * 0.2;
          burst.initPos[i*3 + 2] = oz;
          const sp = 0.3 + Math.random() * 0.6;
          const va = Math.random() * Math.PI * 2;
          burst.vel[i*3]     = Math.cos(va) * sp;
          burst.vel[i*3 + 1] = (Math.random() - 0.5) * sp * 0.4;
          burst.vel[i*3 + 2] = Math.sin(va) * sp;
        }
        burst.active = true;
        burst.spawnTime = time;
        burst.points.visible = true;
      }
      app.asteroidNextBurst = time + bCfg.collisionInterval * (0.5 + Math.random());
    }
    // Update active bursts
    const bpc = bCfg.burstParticleCount;
    for (const burst of app.asteroidBursts) {
      if (!burst.active) continue;
      const age = time - burst.spawnTime;
      if (age > bCfg.burstLifetime) {
        burst.active = false;
        burst.points.visible = false;
        continue;
      }
      const lifeFrac = age / bCfg.burstLifetime;
      const fadeOut = 1.0 - lifeFrac * lifeFrac;
      const posArr = burst.points.geometry.attributes.position.array;
      const alphaArr = burst.points.geometry.attributes.aAlpha.array;
      for (let i = 0; i < bpc; i++) {
        posArr[i*3]     = burst.initPos[i*3]     + burst.vel[i*3]     * age;
        posArr[i*3 + 1] = burst.initPos[i*3 + 1] + burst.vel[i*3 + 1] * age;
        posArr[i*3 + 2] = burst.initPos[i*3 + 2] + burst.vel[i*3 + 2] * age;
        alphaArr[i] = fadeOut * 0.7;
      }
      burst.points.geometry.attributes.position.needsUpdate = true;
      burst.points.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }

  // v3: Rotate neutron star beams
  if (app.neutronBeamGroup) {
    app.neutronBeamGroup.rotation.z = time * 2.0;
  }

  // v4: Update comets
  if (app.cometEntries.length > 0) {
    const cCfg = CONFIG.comets;
    const _antiSun = new THREE.Vector3();
    const _tangent = new THREE.Vector3();
    const _up = new THREE.Vector3(0, 1, 0);

    for (const c of app.cometEntries) {
      const def = c.def;
      const a = def.semiMajorAxis, e = def.eccentricity;

      // Kepler solver — mean anomaly → eccentric anomaly
      const M = def.orbitPhase + time * cCfg.speedMult / Math.pow(a, 1.5);
      let E = M;
      for (let k = 0; k < 5; k++) E = M + e * Math.sin(E);
      const cosE = Math.cos(E), sinE = Math.sin(E);
      const ta = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);
      const r = a * (1 - e * cosE);
      const ci = Math.cos(def.inclination), si = Math.sin(def.inclination);
      const lx = Math.cos(ta) * r, lz = Math.sin(ta) * r;
      const cx = lx, cy = lz * si, cz = lz * ci;

      // Activity factor (proximity to star)
      const activity = Math.min(Math.pow(1.0 / Math.max(r / a, 0.15), cCfg.activityExp), 4.0);

      // Anti-sunward direction
      _antiSun.set(cx, cy, cz).normalize();

      // Orbital tangent: cross(radial, up)
      _tangent.crossVectors(_antiSun, _up).normalize();
      if (_tangent.lengthSq() < 0.01) _tangent.set(1, 0, 0);

      // Coma sprite
      c.comaSprite.position.set(cx, cy, cz);
      const comaSize = (1.2 + activity * 0.8) * 1.5;
      c.comaSprite.scale.setScalar(comaSize);
      c.comaSprite.material.opacity = Math.min(0.7 + activity * 0.15, 1.0);

      // Base tail length
      const baseLen = 2.0 + 5.0 / Math.max(r, 1.0);
      const ionLen = baseLen * Math.max(activity, 0.5);

      // Ion tail — straight anti-sunward
      const iGeo = c.ionPoints.geometry;
      const iPos = iGeo.attributes.position.array;
      const iAlpha = iGeo.attributes.aAlpha.array;
      const iSize = iGeo.attributes.aSize.array;
      const ionCount = cCfg.ionCount;

      for (let i = 0; i < ionCount; i++) {
        const t01 = i / ionCount;
        const spread = t01 * 0.25;
        const s1 = Math.sin(i * 7.31 + def.seed * 0.00117) * 0.5;
        const s2 = Math.cos(i * 5.73 + def.seed * 0.00231) * 0.5;
        const s3 = Math.sin(i * 11.13 + def.seed * 0.00073) * 0.3;
        const latX = (s1 + s3) * spread, latY = s2 * spread, latZ = (s2 - s1) * spread * 0.5;

        iPos[i*3]     = cx + _antiSun.x * t01 * ionLen + latX;
        iPos[i*3 + 1] = cy + _antiSun.y * t01 * ionLen + latY;
        iPos[i*3 + 2] = cz + _antiSun.z * t01 * ionLen + latZ;

        iSize[i] = (1.0 - t01 * 0.7) * 3.5;

        let al = (1.0 - t01) * 0.6 * Math.min(activity, 2.5);
        if (t01 < 0.2) al *= 1.0 + (1.0 - t01 / 0.2) * 0.8;
        // Sparkle
        const sv = Math.sin((i + def.seed) * 127.1 + time * 3.0) * 43758.5;
        al *= (1.0 - cCfg.sparkleAmt * 0.5 + cCfg.sparkleAmt * (sv - Math.floor(sv)));
        iAlpha[i] = al;
      }
      iGeo.attributes.position.needsUpdate = true;
      iGeo.attributes.aAlpha.needsUpdate = true;
      iGeo.attributes.aSize.needsUpdate = true;

      // Dust tail — curved behind orbit
      const dLen = ionLen * 0.75;
      const dGeo = c.dustPoints.geometry;
      const dPos = dGeo.attributes.position.array;
      const dAlpha = dGeo.attributes.aAlpha.array;
      const dSize = dGeo.attributes.aSize.array;
      const dustCount = cCfg.dustCount;
      const curvature = cCfg.dustCurvature;

      for (let i = 0; i < dustCount; i++) {
        const frac = i / dustCount;
        const spread = frac * 0.4;
        const s1 = Math.sin(i * 7.31 + (def.seed + 500) * 0.00117) * 0.5;
        const s2 = Math.cos(i * 5.73 + (def.seed + 500) * 0.00231) * 0.5;
        const s3 = Math.sin(i * 11.13 + (def.seed + 500) * 0.00073) * 0.3;
        const latX = (s1 + s3) * spread, latY = s2 * spread, latZ = (s2 - s1) * spread * 0.5;
        const curve = frac * frac * curvature;

        dPos[i*3]     = cx + _antiSun.x * frac * dLen + _tangent.x * curve + latX;
        dPos[i*3 + 1] = cy + _antiSun.y * frac * dLen + _tangent.y * curve + latY;
        dPos[i*3 + 2] = cz + _antiSun.z * frac * dLen + _tangent.z * curve + latZ;

        dSize[i] = (1.0 - frac * 0.6) * 3.0;

        let al = (1.0 - frac) * 0.45 * Math.min(activity, 2.5);
        if (frac < 0.15) al *= 1.0 + (1.0 - frac / 0.15) * 0.6;
        const sv2 = Math.sin((i + def.seed + 500) * 127.1 + time * 3.0) * 43758.5;
        al *= (1.0 - cCfg.sparkleAmt * 0.5 + cCfg.sparkleAmt * (sv2 - Math.floor(sv2)));
        dAlpha[i] = al;
      }
      dGeo.attributes.position.needsUpdate = true;
      dGeo.attributes.aAlpha.needsUpdate = true;
      dGeo.attributes.aSize.needsUpdate = true;

      c.prevX = cx; c.prevY = cy; c.prevZ = cz;
    }
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
