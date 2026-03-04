import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js?v=7.0';
import { app } from './app.js?v=7.0';
import { controls, systemGroup } from './engine.js?v=7.0';
import { getUpgradeEffects } from './gameplay.js?v=7.0';

const _lookAt = new THREE.Vector3();
const _origin = new THREE.Vector3();

// ────────────────────────────────────────────────────────────
// Preload all GLB ship models (cached for reuse across system views)
// ────────────────────────────────────────────────────────────

export const shipModelCache = new Map(); // id → pivot Group
const gltfLoader = new GLTFLoader();

function loadShipModel(shipDef) {
  return new Promise((resolve) => {
    gltfLoader.load(shipDef.file, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      const pivot = new THREE.Group();
      model.position.set(-center.x, -center.y, -center.z);
      pivot.add(model);
      pivot.scale.setScalar(1.0 / maxDim);

      model.traverse((child) => {
        if (child.isMesh) {
          const convert = (mat) => {
            const opts = {};
            if (mat.map) opts.map = mat.map;
            else if (mat.color) opts.color = mat.color.clone();
            else opts.color = new THREE.Color(0x8ab4c8);
            if (mat.vertexColors) opts.vertexColors = true;
            if (mat.transparent) { opts.transparent = true; opts.opacity = mat.opacity; }
            if (mat.alphaMap) opts.alphaMap = mat.alphaMap;
            const basic = new THREE.MeshBasicMaterial(opts);
            if (mat.side !== undefined) basic.side = mat.side;
            mat.dispose();
            return basic;
          };
          if (Array.isArray(child.material)) {
            child.material = child.material.map(convert);
          } else {
            child.material = convert(child.material);
          }
        }
      });

      shipModelCache.set(shipDef.id, pivot);
      resolve(pivot);
    });
  });
}

export const shipModelsReady = Promise.all(CONFIG.ships.map(loadShipModel));

// ────────────────────────────────────────────────────────────
// Ship mesh creation (GLB model + engine glow sprites)
// ────────────────────────────────────────────────────────────

export function createShipMesh() {
  const group = new THREE.Group();
  const sc = CONFIG.ship;

  // ── Load GLB model into group ──
  const selectedId = (app.state && app.state.selectedShip) || 'spaceship';
  const meshScale = (app.state && app.state.shipScale !== undefined) ? app.state.shipScale : sc.meshScale;
  const addModel = (source) => {
    const clone = source.clone();
    clone.scale.multiplyScalar(meshScale); // multiply on top of unit normalization
    group.add(clone);
  };

  const cached = shipModelCache.get(selectedId);
  if (cached) {
    addModel(cached);
  } else {
    shipModelsReady.then(() => {
      const m = shipModelCache.get(selectedId) || shipModelCache.get('spaceship');
      if (m) addModel(m);
    });
  }

  // ── Engine glow sprites ──
  const half = meshScale * 0.5;
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
  group.add(makeGlow(0, 0, -half * 0.9, half * 0.35));       // main engine
  group.add(makeGlow(half * 0.25, 0, -half * 0.8, half * 0.22)); // right nacelle
  group.add(makeGlow(-half * 0.25, 0, -half * 0.8, half * 0.22)); // left nacelle

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

// ────────────────────────────────────────────────────────────
// Orbital state machine
// ────────────────────────────────────────────────────────────

// States: 'parking' | 'burn_depart' | 'transfer' | 'burn_arrive' | 'approach' | 'docked'

function createOrbitState(radius, angle, speed) {
  return {
    state: 'parking',
    orbitRadius: radius,
    orbitAngle: angle,
    orbitSpeed: speed,
    transfer: null,
    dockedPlanetId: null,
    dockedAngle: 0,
  };
}

export function positionShipAtStar(starRadius) {
  if (!app.shipMesh) return;
  // Determine parking orbit radius (beyond outermost planet)
  let maxOrbit = starRadius + 2;
  for (const p of app.systemPlanets) {
    if (p.data.orbitRadius > maxOrbit) maxOrbit = p.data.orbitRadius;
  }
  const sc = CONFIG.ship;
  const parkR = maxOrbit + sc.parkingOrbitBuffer;
  const angle = Math.random() * Math.PI * 2;

  // Position ship on parking orbit
  app.shipMesh.position.set(Math.cos(angle) * parkR, 0, Math.sin(angle) * parkR);

  // Face tangent (prograde direction, counterclockwise)
  _lookAt.set(
    Math.cos(angle + 0.1) * parkR,
    0,
    Math.sin(angle + 0.1) * parkR
  );
  app.shipMesh.lookAt(_lookAt);

  // Initialize orbital state
  app.shipOrbit = createOrbitState(parkR, angle, sc.parkingOrbitSpeed);
}

// ── Parametric Hohmann transfer helpers ──

// Solve Kepler's equation M = E - e·sin(E) for eccentric anomaly E
function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 15; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

// Position on a Hohmann half-ellipse at given progress (0 = departure, 1 = arrival)
// The ship always travels prograde (counterclockwise) through π radians.
// Returns { x, z, angle, r }
function hohmannPosition(progress, r1, r2, departureAngle, goingOutward) {
  const a = (r1 + r2) / 2;
  const e = Math.abs(r2 - r1) / (r1 + r2);

  // Mean anomaly: outward 0→π (periapsis→apoapsis), inward π→2π (apoapsis→periapsis)
  const M = goingOutward ? progress * Math.PI : Math.PI + progress * Math.PI;

  const E = solveKepler(M, e);

  // True anomaly from eccentric anomaly
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2)
  );

  // Orbital radius
  const r = e < 1e-8 ? a : a * (1 - e * e) / (1 + e * Math.cos(nu));

  // Ship's polar angle: periapsis direction + true anomaly
  //   Outward: periapsis at departure → periapsisDir = departureAngle
  //   Inward: apoapsis at departure → periapsisDir = departureAngle + π
  const periapsisDir = goingOutward ? departureAngle : departureAngle + Math.PI;
  const angle = periapsisDir + nu;

  return {
    x: Math.cos(angle) * r,
    z: Math.sin(angle) * r,
    angle,
    r,
  };
}

export function flyShipToPlanet(targetEntry, onArrive) {
  if (!app.shipMesh || !targetEntry) return;
  const orb = app.shipOrbit;
  if (!orb) return;

  // Can't fly if already in transfer
  const s = orb.state;
  if (s === 'burn_depart' || s === 'transfer' || s === 'burn_arrive' || s === 'approach') return;

  const sc = CONFIG.ship;
  const effects = getUpgradeEffects(app.state);
  const speedMult = effects.systemSpeedMult || 1;

  // Departure radius: current orbit around star
  let r1;
  if (s === 'docked' && orb.dockedPlanetId !== null) {
    const dockedEntry = app.systemPlanets.find(p => p.data.id === orb.dockedPlanetId);
    r1 = dockedEntry ? dockedEntry.data.orbitRadius : orb.orbitRadius;
    orb.orbitAngle = Math.atan2(app.shipMesh.position.z, app.shipMesh.position.x);
  } else {
    r1 = orb.orbitRadius;
  }

  // Arrival radius: target planet's orbit
  const r2 = targetEntry.data.orbitRadius;

  // Transfer duration (configurable, scaled by speed upgrades)
  const duration = sc.transferDuration / speedMult;

  orb.transfer = {
    r1,
    r2,
    targetEntry,
    onArrive,
    goingOutward: r2 > r1,
    departureAngle: 0, // set at BURN_DEPART → TRANSFER transition
    duration,
    startTime: 0,      // set at BURN_DEPART → TRANSFER transition
  };

  // Transition to departure burn
  orb.state = 'burn_depart';
  orb.transfer.burnStart = performance.now() / 1000;
  orb.dockedPlanetId = null;
}

export function updateShip(time, deltaTime) {
  if (!app.shipMesh) return;
  const orb = app.shipOrbit;
  if (!orb) return;

  const sc = CONFIG.ship;
  const burnDur = sc.burnDuration;

  switch (orb.state) {

    // ── PARKING: circular orbit around star ──
    case 'parking': {
      orb.orbitAngle += deltaTime * orb.orbitSpeed;
      const r = orb.orbitRadius;
      app.shipMesh.position.set(
        Math.cos(orb.orbitAngle) * r,
        0,
        Math.sin(orb.orbitAngle) * r
      );
      // Face tangent (prograde)
      _lookAt.set(
        Math.cos(orb.orbitAngle + 0.1) * r,
        0,
        Math.sin(orb.orbitAngle + 0.1) * r
      );
      app.shipMesh.lookAt(_lookAt);

      // Camera: drift back to star center
      controls.target.lerp(_origin, 0.05);
      break;
    }

    // ── BURN_DEPART: brief thruster burst before transfer ──
    case 'burn_depart': {
      const elapsed = time - orb.transfer.burnStart;
      const bt = Math.min(elapsed / burnDur, 1);

      // Orbit at departure radius with heavy thrusters
      const r = orb.orbitRadius;
      orb.orbitAngle += deltaTime * orb.orbitSpeed;
      app.shipMesh.position.set(
        Math.cos(orb.orbitAngle) * r,
        0,
        Math.sin(orb.orbitAngle) * r
      );
      _lookAt.set(
        Math.cos(orb.orbitAngle + 0.1) * r,
        0,
        Math.sin(orb.orbitAngle + 0.1) * r
      );
      app.shipMesh.lookAt(_lookAt);

      // Heavy thruster particles during burn
      spawnThrusterParticle(app.shipMesh.position, deltaTime, 5);

      controls.target.lerp(_origin, 0.05);

      if (bt >= 1) {
        // Begin parametric Hohmann transfer from current angle
        orb.transfer.departureAngle = orb.orbitAngle;
        orb.transfer.startTime = time;
        orb.state = 'transfer';
      }
      break;
    }

    // ── TRANSFER: parametric Hohmann half-ellipse ──
    case 'transfer': {
      const tr = orb.transfer;
      const elapsed = time - tr.startTime;
      const progress = Math.max(0, Math.min(elapsed / tr.duration, 1.0));

      // Position on Hohmann half-ellipse
      const pos = hohmannPosition(progress, tr.r1, tr.r2, tr.departureAngle, tr.goingOutward);
      app.shipMesh.position.set(pos.x, 0, pos.z);
      orb.orbitAngle = pos.angle;

      // Face velocity direction (centered finite difference on the ellipse)
      const eps = 0.002;
      const pBefore = hohmannPosition(
        Math.max(0, progress - eps), tr.r1, tr.r2, tr.departureAngle, tr.goingOutward
      );
      const pAfter = hohmannPosition(
        Math.min(1, progress + eps), tr.r1, tr.r2, tr.departureAngle, tr.goingOutward
      );
      const dx = pAfter.x - pBefore.x;
      const dz = pAfter.z - pBefore.z;
      if (dx * dx + dz * dz > 1e-10) {
        _lookAt.set(pos.x + dx * 100, 0, pos.z + dz * 100);
        app.shipMesh.lookAt(_lookAt);
      }

      // Thruster particles — light coast, brighter near planets
      let thrusterIntensity = 0.3;
      for (const p of app.systemPlanets) {
        const pa = p.data.orbitPhase + time * p.data.orbitSpeed;
        const ppx = Math.cos(pa) * p.data.orbitRadius;
        const ppz = Math.sin(pa) * p.data.orbitRadius;
        const pdx = pos.x - ppx, pdz = pos.z - ppz;
        const dist = Math.sqrt(pdx * pdx + pdz * pdz);
        const influence = p.data.visualSize * 3;
        if (dist < influence) {
          thrusterIntensity = Math.max(thrusterIntensity,
            2 + 3 * (1 - dist / influence));
        }
      }
      spawnThrusterParticle(app.shipMesh.position, deltaTime, thrusterIntensity);

      controls.target.lerp(_origin, 0.05);

      // Arrival: parametric transfer complete
      if (progress >= 1.0) {
        orb.state = 'burn_arrive';
        orb.transfer.burnStart = time;
        orb.orbitRadius = tr.r2;
        orb.orbitSpeed = tr.targetEntry.data.orbitSpeed;
      }
      break;
    }

    // ── BURN_ARRIVE: deceleration burn at target orbit ──
    case 'burn_arrive': {
      const elapsed = time - orb.transfer.burnStart;
      const bt = Math.min(elapsed / burnDur, 1);

      // Orbit at target radius, slowing angular speed
      const r = orb.orbitRadius;
      orb.orbitAngle += deltaTime * orb.orbitSpeed * (1 - bt * 0.5);
      app.shipMesh.position.set(
        Math.cos(orb.orbitAngle) * r,
        0,
        Math.sin(orb.orbitAngle) * r
      );
      _lookAt.set(
        Math.cos(orb.orbitAngle + 0.1) * r,
        0,
        Math.sin(orb.orbitAngle + 0.1) * r
      );
      app.shipMesh.lookAt(_lookAt);

      // Heavy thruster particles
      spawnThrusterParticle(app.shipMesh.position, deltaTime, 5);
      controls.target.lerp(_origin, 0.05);

      if (bt >= 1) {
        orb.state = 'approach';
        // Set orbit speed to match planet orbital speed for approach phase
        orb.orbitSpeed = orb.transfer.targetEntry.data.orbitSpeed;
      }
      break;
    }

    // ── APPROACH: orbit at planet radius, converge on planet angle ──
    case 'approach': {
      const te = orb.transfer.targetEntry;
      const planetAngle = te.data.orbitPhase + time * te.data.orbitSpeed;
      const r = orb.orbitRadius;

      // Always approach prograde (counterclockwise) — never reverse direction
      let angleDiff = normalizeAngle(planetAngle - orb.orbitAngle);
      if (angleDiff < 0) angleDiff += 2 * Math.PI; // ensure forward pursuit
      if (angleDiff < 0.08) {
        // Close enough — dock
        orb.orbitAngle = planetAngle;
        orb.state = 'docked';
        orb.dockedPlanetId = te.data.id;
        orb.dockedAngle = 0;

        // Fire arrival callback
        if (orb.transfer.onArrive) {
          orb.transfer.onArrive(te);
        }
      } else {
        // Orbit prograde faster than the planet to catch up
        orb.orbitAngle += (te.data.orbitSpeed + sc.approachSpeed) * deltaTime;
      }

      app.shipMesh.position.set(
        Math.cos(orb.orbitAngle) * r,
        0,
        Math.sin(orb.orbitAngle) * r
      );
      _lookAt.set(
        Math.cos(orb.orbitAngle + 0.1) * r,
        0,
        Math.sin(orb.orbitAngle + 0.1) * r
      );
      app.shipMesh.lookAt(_lookAt);

      // Light thruster puffs during approach
      spawnThrusterParticle(app.shipMesh.position, deltaTime, 1);
      controls.target.lerp(_origin, 0.05);
      break;
    }

    // ── DOCKED: orbit close to planet ──
    case 'docked': {
      const entry = app.systemPlanets.find(p => p.data.id === orb.dockedPlanetId);
      if (entry) {
        const pos = entry.mesh.position;
        const orbitR = entry.data.visualSize * sc.dockedOrbitMult;
        const tilt = sc.dockedOrbitTilt;
        orb.dockedAngle += deltaTime * sc.dockedOrbitSpeed;
        const a = orb.dockedAngle;
        app.shipMesh.position.set(
          pos.x + Math.cos(a) * orbitR,
          pos.y + Math.sin(a) * orbitR * tilt,
          pos.z + Math.sin(a) * orbitR
        );
        // Face tangent
        _lookAt.set(
          pos.x + Math.cos(a + 0.1) * orbitR,
          pos.y + Math.sin(a + 0.1) * orbitR * tilt,
          pos.z + Math.sin(a + 0.1) * orbitR
        );
        app.shipMesh.lookAt(_lookAt);

        // Keep stellar orbit angle in sync with planet (for undocking later)
        orb.orbitAngle = entry.data.orbitPhase + time * entry.data.orbitSpeed;
        orb.orbitRadius = entry.data.orbitRadius;
      }
      // Camera: drift back to star center
      controls.target.lerp(_origin, 0.05);
      break;
    }
  }

  // Update thruster particle ages every frame
  updateThrusterParticles(deltaTime);
}

// ── Helpers ──

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function spawnThrusterParticle(shipPos, dt, intensityMult) {
  const tp = app.shipThrusterPoints;
  if (!tp) return;
  const ud = tp.userData;
  const posArr = tp.geometry.attributes.position.array;
  const ages = ud.ages;

  const count = Math.min(3 * intensityMult, Math.ceil(dt * 60 * intensityMult));
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
  const orb = app.shipOrbit;
  if (!orb) return false;
  return orb.state !== 'parking' && orb.state !== 'docked';
}

export function getDockedPlanetId() {
  const orb = app.shipOrbit;
  if (!orb || orb.state !== 'docked') return null;
  return orb.dockedPlanetId;
}

export function swapShipModel() {
  if (!app.shipMesh) return;
  const sc = CONFIG.ship;
  const selectedId = (app.state && app.state.selectedShip) || 'spaceship';
  const cached = shipModelCache.get(selectedId) || shipModelCache.get('spaceship');
  if (!cached) return;

  const meshScale = (app.state && app.state.shipScale !== undefined) ? app.state.shipScale : sc.meshScale;

  // Remove old model children and sprites (rebuild both for scale)
  const toRemove = [];
  for (const child of app.shipMesh.children) {
    if (!child.isSprite) toRemove.push(child);
  }
  toRemove.forEach(c => app.shipMesh.remove(c));

  // Also remove old glow sprites and rebuild
  const oldSprites = [];
  for (const child of app.shipMesh.children) {
    if (child.isSprite) oldSprites.push(child);
  }
  oldSprites.forEach(c => app.shipMesh.remove(c));

  // Add new model
  const clone = cached.clone();
  clone.scale.multiplyScalar(meshScale);
  app.shipMesh.add(clone);

  // Rebuild engine glow sprites at correct scale
  const half = meshScale * 0.5;
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
  app.shipMesh.add(makeGlow(0, 0, -half * 0.9, half * 0.35));
  app.shipMesh.add(makeGlow(half * 0.25, 0, -half * 0.8, half * 0.22));
  app.shipMesh.add(makeGlow(-half * 0.25, 0, -half * 0.8, half * 0.22));
}

export function clearShip() {
  app.shipMesh = null;
  app.shipThrusterPoints = null;
  app.shipOrbit = null;
}

export function getShipPosition() {
  return app.shipMesh ? app.shipMesh.position : null;
}
