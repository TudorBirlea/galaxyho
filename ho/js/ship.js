import * as THREE from 'three';
import { CONFIG } from './config.js?v=5.0';
import { app } from './app.js?v=5.0';
import { camera, controls, systemGroup } from './engine.js?v=5.0';
import { easeInOutCubic } from './utils.js?v=5.0';
import { getUpgradeEffects } from './gameplay.js?v=5.0';

const _desiredCam = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _liveEnd = new THREE.Vector3();
const _origin = new THREE.Vector3();

export function createShipMesh() {
  const group = new THREE.Group();

  // ── Fuselage: sleek elongated shape (two cones joined at base) ──
  const noseCone = new THREE.ConeGeometry(0.08, 0.22, 8);
  noseCone.rotateX(Math.PI / 2);
  noseCone.translate(0, 0, 0.11);
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x8ab4c8 });
  group.add(new THREE.Mesh(noseCone, bodyMat));

  const rearCone = new THREE.ConeGeometry(0.1, 0.18, 8);
  rearCone.rotateX(-Math.PI / 2);
  rearCone.translate(0, 0, -0.06);
  group.add(new THREE.Mesh(rearCone, bodyMat));

  // Central body cylinder connecting the cones
  const bodyCyl = new THREE.CylinderGeometry(0.085, 0.1, 0.06, 8);
  bodyCyl.rotateX(Math.PI / 2);
  bodyCyl.translate(0, 0, 0.0);
  group.add(new THREE.Mesh(bodyCyl, bodyMat));

  // ── Cockpit canopy — small emissive dome on top ──
  const cockpitGeo = new THREE.SphereGeometry(0.04, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const cockpitMat = new THREE.MeshBasicMaterial({ color: 0x60ddff });
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
  cockpit.position.set(0, 0.055, 0.06);
  group.add(cockpit);

  // ── Delta wings — custom triangular geometry for swept-back look ──
  function makeWing(side) {
    const verts = new Float32Array([
      0, 0, 0.04,           // root leading edge
      side * 0.28, -0.01, -0.12,  // tip (swept back, slightly down)
      0, 0, -0.1,           // root trailing edge
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x6a9db0, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }
  group.add(makeWing(1));
  group.add(makeWing(-1));

  // ── Vertical stabilizer (dorsal fin) ──
  const finVerts = new Float32Array([
    0, 0.02, -0.04,   // base front
    0, 0.14, -0.10,   // top
    0, 0.02, -0.12,   // base rear
  ]);
  const finGeo = new THREE.BufferGeometry();
  finGeo.setAttribute('position', new THREE.BufferAttribute(finVerts, 3));
  finGeo.computeVertexNormals();
  const finMat = new THREE.MeshBasicMaterial({ color: 0x7aaabb, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(finGeo, finMat));

  // ── Engine nacelles — two small cylinders at wing roots ──
  const nacelleGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.12, 6);
  nacelleGeo.rotateX(Math.PI / 2);
  const nacelleMat = new THREE.MeshBasicMaterial({ color: 0x607888 });
  const nac1 = new THREE.Mesh(nacelleGeo, nacelleMat);
  nac1.position.set(0.1, -0.01, -0.06);
  group.add(nac1);
  const nac2 = new THREE.Mesh(nacelleGeo.clone(), nacelleMat);
  nac2.position.set(-0.1, -0.01, -0.06);
  group.add(nac2);

  // ── Engine glow sprites (one per nacelle + main) ──
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 64; glowCanvas.height = 64;
  const gCtx = glowCanvas.getContext('2d');
  const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(100,210,255,1)');
  grad.addColorStop(0.12, 'rgba(80,190,255,0.8)');
  grad.addColorStop(0.35, 'rgba(60,150,240,0.25)');
  grad.addColorStop(1, 'rgba(40,100,200,0)');
  gCtx.fillStyle = grad;
  gCtx.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const makeGlow = (x, y, z, size) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(size);
    s.position.set(x, y, z);
    return s;
  };
  group.add(makeGlow(0, 0, -0.16, 0.14));     // main engine
  group.add(makeGlow(0.1, -0.01, -0.13, 0.09)); // left nacelle
  group.add(makeGlow(-0.1, -0.01, -0.13, 0.09)); // right nacelle

  // ── Hull accent stripe (thin ring around body) ──
  const stripGeo = new THREE.TorusGeometry(0.09, 0.004, 4, 16);
  stripGeo.rotateX(Math.PI / 2);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x50ccee });
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.position.set(0, 0, 0.02);
  group.add(strip);

  group.renderOrder = 5;
  systemGroup.add(group);
  app.shipMesh = group;

  // Thruster trail particles
  const tCount = CONFIG.ship.thrusterParticleCount;
  const tGeo = new THREE.BufferGeometry();
  const tPos = new Float32Array(tCount * 3);
  const tAlpha = new Float32Array(tCount);
  const tAges = new Float32Array(tCount).fill(999); // all "dead" initially
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  tGeo.setAttribute('aAlpha', new THREE.BufferAttribute(tAlpha, 1));
  tGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

  const tMat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(3.0 * (80.0 / -mv.z), 0.5, 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float falloff = 1.0 - d * d;
        vec3 col = mix(vec3(1.0, 0.7, 0.3), vec3(0.3, 0.6, 1.0), d * 0.5);
        gl_FragColor = vec4(col, falloff * vAlpha);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const tPoints = new THREE.Points(tGeo, tMat);
  tPoints.frustumCulled = false;
  tPoints.renderOrder = 4;
  systemGroup.add(tPoints);
  app.shipThrusterPoints = tPoints;
  app.shipThrusterPoints.userData = { ages: tAges, nextSlot: 0 };

  return group;
}

export function positionShipAtStar(starRadius) {
  if (!app.shipMesh) return;
  // Place ship beyond the outermost planet orbit
  let maxOrbit = starRadius + 2;
  for (const p of app.systemPlanets) {
    if (p.data.orbitRadius > maxOrbit) maxOrbit = p.data.orbitRadius;
  }
  const r = maxOrbit + 6;
  const angle = Math.random() * Math.PI * 2;
  app.shipMesh.position.set(Math.cos(angle) * r, 0.5, Math.sin(angle) * r);
  app.shipMesh.lookAt(0, 0.5, 0); // face star
}

export function flyShipToPlanet(targetEntry, onArrive) {
  if (!app.shipMesh || !targetEntry) return;
  if (app.shipFlightAnim) return; // already flying

  const startPos = app.shipMesh.position.clone();
  // Get live planet position + hover offset for initial distance estimate
  const hoverY = targetEntry.data.visualSize * 1.5;
  const liveEnd = targetEntry.mesh.position.clone();
  liveEnd.y += hoverY;

  const dist = startPos.distanceTo(liveEnd);
  const effects = getUpgradeEffects(app.state);
  const speedMult = effects.systemSpeedMult;
  const duration = Math.max(CONFIG.ship.flightSpeedMin, Math.min(CONFIG.ship.flightSpeedMax, dist * 0.4)) / speedMult;

  app.shipFlightAnim = {
    startPos,
    hoverY,
    arcHeightBase: dist * CONFIG.ship.arcHeightFactor,
    startTime: performance.now() / 1000,
    duration,
    targetEntry,
    onArrive,
  };
}

function evalBezier(p0, p1, p2, t, out) {
  const omt = 1 - t;
  out.x = omt * omt * p0.x + 2 * omt * t * p1.x + t * t * p2.x;
  out.y = omt * omt * p0.y + 2 * omt * t * p1.y + t * t * p2.y;
  out.z = omt * omt * p0.z + 2 * omt * t * p1.z + t * t * p2.z;
  return out;
}

export function updateShip(time, deltaTime) {
  if (!app.shipMesh) return;

  const anim = app.shipFlightAnim;
  if (anim) {
    const elapsed = time - anim.startTime;
    const rawT = Math.min(elapsed / anim.duration, 1);
    const t = easeInOutCubic(rawT);

    // Recompute end position from LIVE planet mesh (planets orbit!)
    _liveEnd.copy(anim.targetEntry.mesh.position);
    _liveEnd.y += anim.hoverY;

    // Recompute control point (midpoint raised by arc height)
    const controlPos = _desiredTarget; // reuse temp vector
    controlPos.lerpVectors(anim.startPos, _liveEnd, 0.5);
    controlPos.y += anim.arcHeightBase;

    // Current position on bezier
    evalBezier(anim.startPos, controlPos, _liveEnd, t, app.shipMesh.position);

    // Look along curve tangent
    const tNext = Math.min(t + 0.02, 1);
    evalBezier(anim.startPos, controlPos, _liveEnd, tNext, _tangent);
    _lookAt.copy(_tangent);
    if (_lookAt.distanceTo(app.shipMesh.position) > 0.001) {
      app.shipMesh.lookAt(_lookAt);
    }

    // Camera follow during flight
    const sc = CONFIG.ship;
    _desiredCam.set(
      app.shipMesh.position.x + sc.cameraOffset[0],
      app.shipMesh.position.y + sc.cameraOffset[1],
      app.shipMesh.position.z + sc.cameraOffset[2]
    );
    controls.target.lerp(app.shipMesh.position, sc.cameraFollowLerp);
    camera.position.lerp(_desiredCam, sc.cameraFollowLerp * 0.8);

    // Spawn thruster particles while flying
    spawnThrusterParticle(app.shipMesh.position, deltaTime);

    // Arrival
    if (rawT >= 1) {
      const cb = anim.onArrive;
      const entry = anim.targetEntry;
      app.shipFlightAnim = null;
      // Settle on planet position (keep updating with orbit)
      app.shipMesh.userData.dockedPlanetId = entry.data.id;
      if (cb) cb(entry);
    }
  } else {
    // If docked at a planet, follow its orbit (ship only, not camera)
    const dockedId = app.shipMesh.userData.dockedPlanetId;
    if (dockedId !== undefined && dockedId !== null) {
      const entry = app.systemPlanets.find(p => p.data.id === dockedId);
      if (entry) {
        const pos = entry.mesh.position;
        app.shipMesh.position.set(pos.x, pos.y + entry.data.visualSize * 1.5, pos.z);
      }
    }
    // Always keep orbit center on the star (origin)
    controls.target.lerp(_origin, 0.05);
  }

  // Update thruster particle ages
  updateThrusterParticles(deltaTime);
}

function spawnThrusterParticle(shipPos, dt) {
  const tp = app.shipThrusterPoints;
  if (!tp) return;
  const ud = tp.userData;
  const posArr = tp.geometry.attributes.position.array;
  const ages = ud.ages;

  // Spawn 2-3 particles per frame while flying
  const count = Math.min(3, Math.ceil(dt * 60));
  for (let i = 0; i < count; i++) {
    const idx = ud.nextSlot;
    ud.nextSlot = (ud.nextSlot + 1) % ages.length;
    posArr[idx * 3]     = shipPos.x + (Math.random() - 0.5) * 0.06;
    posArr[idx * 3 + 1] = shipPos.y + (Math.random() - 0.5) * 0.06;
    posArr[idx * 3 + 2] = shipPos.z + (Math.random() - 0.5) * 0.06;
    ages[idx] = 0;
  }
}

function updateThrusterParticles(dt) {
  const tp = app.shipThrusterPoints;
  if (!tp) return;
  const ages = tp.userData.ages;
  const alphaArr = tp.geometry.attributes.aAlpha.array;
  const lifetime = CONFIG.ship.thrusterLifetime;

  for (let i = 0; i < ages.length; i++) {
    ages[i] += dt;
    if (ages[i] < lifetime) {
      alphaArr[i] = (1 - ages[i] / lifetime) * 0.6;
    } else {
      alphaArr[i] = 0;
    }
  }
  tp.geometry.attributes.position.needsUpdate = true;
  tp.geometry.attributes.aAlpha.needsUpdate = true;
}

export function isShipFlying() {
  return app.shipFlightAnim !== null;
}

export function clearShip() {
  app.shipMesh = null;
  app.shipThrusterPoints = null;
  app.shipFlightAnim = null;
}

export function getShipPosition() {
  return app.shipMesh ? app.shipMesh.position : null;
}
