import * as THREE from 'three';
import { CONFIG } from './config.js?v=6.0';
import { app } from './app.js?v=6.0';
import { controls, systemGroup } from './engine.js?v=6.0';
import { getUpgradeEffects } from './gameplay.js?v=6.0';

const _lookAt = new THREE.Vector3();
const _origin = new THREE.Vector3();

// ────────────────────────────────────────────────────────────
// Ship mesh creation (unchanged from v5.2)
// ────────────────────────────────────────────────────────────

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

// ── Gravity simulation helpers ──

function deriveGMStar() {
  if (app.systemPlanets.length === 0) return 50;
  let ref = app.systemPlanets[0];
  for (const p of app.systemPlanets) {
    if (p.data.orbitRadius < ref.data.orbitRadius) ref = p;
  }
  const r = ref.data.orbitRadius;
  const omega = ref.data.orbitSpeed;
  return omega * omega * r * r * r;
}

function computeGravAccel(px, pz, GM_star, time) {
  const gc = CONFIG.ship.gravity;
  let ax = 0, az = 0;

  // Star gravity (at origin)
  const r2star = px * px + pz * pz;
  const rStar = Math.sqrt(r2star);
  if (rStar > gc.starSoftening) {
    const rStar3 = r2star * rStar;
    ax -= GM_star * px / rStar3;
    az -= GM_star * pz / rStar3;
  }

  // Planet gravity
  for (const p of app.systemPlanets) {
    const pa = p.data.orbitPhase + time * p.data.orbitSpeed;
    const ppx = Math.cos(pa) * p.data.orbitRadius;
    const ppz = Math.sin(pa) * p.data.orbitRadius;

    const dx = px - ppx;
    const dz = pz - ppz;
    const dist2 = dx * dx + dz * dz;
    const soft = p.data.visualSize * gc.planetSofteningMult;
    const dist2Soft = dist2 + soft * soft;
    const dist = Math.sqrt(dist2Soft);
    const dist3 = dist2Soft * dist;

    const gm = gc.planetMassFactor * p.data.visualSize * p.data.visualSize * p.data.visualSize;
    ax -= gm * dx / dist3;
    az -= gm * dz / dist3;
  }

  return { ax, az };
}

function computeGuidance(px, pz, transfer, simTime) {
  const gc = CONFIG.ship.gravity;
  const te = transfer.targetEntry;

  const elapsed = simTime - transfer.startTime;
  const progress = Math.min(elapsed / transfer.duration, 1);
  const timeToArrival = Math.max(transfer.duration - elapsed, 0.5);
  const arrivalTime = simTime + timeToArrival;
  const targetAngle = te.data.orbitPhase + arrivalTime * te.data.orbitSpeed;
  const targetX = Math.cos(targetAngle) * te.data.orbitRadius;
  const targetZ = Math.sin(targetAngle) * te.data.orbitRadius;

  const dx = targetX - px;
  const dz = targetZ - pz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return { ax: 0, az: 0 };

  // Ramps up quadratically with progress
  const ramp = progress * progress;
  const strength = gc.guidanceStrength * ramp;

  return {
    ax: (dx / dist) * strength,
    az: (dz / dist) * strength,
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

  // Duration estimate from Kepler (for timeout safety and guidance pacing)
  const semiMajor = (r1 + r2) / 2;
  const rawDuration = Math.PI * Math.sqrt(semiMajor * semiMajor * semiMajor) * sc.transferSpeedScale;
  const duration = Math.max(0.8, Math.min(4.0, rawDuration)) / speedMult;

  orb.transfer = {
    r1,
    r2,
    targetEntry,
    onArrive,
    goingInward: r2 < r1,
    duration,
    startTime: performance.now() / 1000,
    // Gravity sim state (seeded at BURN_DEPART→TRANSFER transition)
    posX: 0, posZ: 0,
    velX: 0, velZ: 0,
    GM_star: 0,
    maxDuration: duration * CONFIG.ship.gravity.maxDurationMult,
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

      // Ship stays roughly at current position, slight drift outward/inward
      const driftDir = orb.transfer.goingInward ? -1 : 1;
      const r = orb.orbitRadius + driftDir * bt * 0.3;
      orb.orbitAngle += deltaTime * orb.orbitSpeed;
      app.shipMesh.position.set(
        Math.cos(orb.orbitAngle) * r,
        0,
        Math.sin(orb.orbitAngle) * r
      );
      // Face slightly into transfer direction
      const lookAngle = orb.orbitAngle + 0.1 + driftDir * bt * 0.05;
      _lookAt.set(Math.cos(lookAngle) * r, 0, Math.sin(lookAngle) * r);
      app.shipMesh.lookAt(_lookAt);

      // Heavy thruster particles during burn
      spawnThrusterParticle(app.shipMesh.position, deltaTime, 5);

      controls.target.lerp(_origin, 0.05);

      if (bt >= 1) {
        // Seed gravity simulation
        const GM = deriveGMStar();
        const r1 = orb.transfer.r1;
        const r2 = orb.transfer.r2;
        const a = (r1 + r2) / 2;
        const vTransfer = Math.sqrt(Math.abs(GM * (2 / r1 - 1 / a)));

        const angle = orb.orbitAngle;
        const shipX = Math.cos(angle) * r1;
        const shipZ = Math.sin(angle) * r1;
        // Prograde tangent (counterclockwise)
        const tangentX = -Math.sin(angle);
        const tangentZ = Math.cos(angle);

        orb.transfer.startTime = time;
        orb.transfer.posX = shipX;
        orb.transfer.posZ = shipZ;
        orb.transfer.velX = tangentX * vTransfer;
        orb.transfer.velZ = tangentZ * vTransfer;
        orb.transfer.GM_star = GM;
        orb.state = 'transfer';
      }
      break;
    }

    // ── TRANSFER: gravity simulation (Velocity Verlet) ──
    case 'transfer': {
      const tr = orb.transfer;
      const gc = sc.gravity;
      const dt_sim = Math.min(deltaTime, 0.05);
      const numSteps = Math.ceil(dt_sim / gc.substepDt);
      const h = dt_sim / numSteps;

      let { posX, posZ, velX, velZ } = tr;
      let simTime = time - dt_sim;

      for (let step = 0; step < numSteps; step++) {
        // Acceleration at current position
        const a1 = computeGravAccel(posX, posZ, tr.GM_star, simTime);
        const g1 = computeGuidance(posX, posZ, tr, simTime);
        const ax1 = a1.ax + g1.ax;
        const az1 = a1.az + g1.az;

        // Update position
        posX += velX * h + 0.5 * ax1 * h * h;
        posZ += velZ * h + 0.5 * az1 * h * h;

        // Acceleration at new position
        const a2 = computeGravAccel(posX, posZ, tr.GM_star, simTime + h);
        const g2 = computeGuidance(posX, posZ, tr, simTime + h);

        // Update velocity
        velX += 0.5 * (ax1 + a2.ax + g2.ax) * h;
        velZ += 0.5 * (az1 + a2.az + g2.az) * h;

        simTime += h;
      }

      tr.posX = posX;
      tr.posZ = posZ;
      tr.velX = velX;
      tr.velZ = velZ;

      app.shipMesh.position.set(posX, 0, posZ);

      // Face velocity direction
      const speed = Math.sqrt(velX * velX + velZ * velZ);
      if (speed > 0.01) {
        _lookAt.set(posX + velX * 0.5, 0, posZ + velZ * 0.5);
        app.shipMesh.lookAt(_lookAt);
      }

      orb.orbitAngle = Math.atan2(posZ, posX);

      // Thruster intensity scales with planet proximity
      let thrusterIntensity = 0.5;
      for (const p of app.systemPlanets) {
        const pa = p.data.orbitPhase + time * p.data.orbitSpeed;
        const ppx = Math.cos(pa) * p.data.orbitRadius;
        const ppz = Math.sin(pa) * p.data.orbitRadius;
        const dx = posX - ppx, dz = posZ - ppz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const influence = p.data.visualSize * 3;
        if (dist < influence) {
          thrusterIntensity = Math.max(thrusterIntensity,
            2 + 3 * (1 - dist / influence));
        }
      }
      spawnThrusterParticle(app.shipMesh.position, deltaTime, thrusterIntensity);

      controls.target.lerp(_origin, 0.05);

      // Arrival detection
      const r = Math.sqrt(posX * posX + posZ * posZ);
      const elapsed = time - tr.startTime;
      const arrivedAtOrbit = tr.goingInward ? (r <= tr.r2) : (r >= tr.r2);
      const timedOut = elapsed > tr.maxDuration;

      if (arrivedAtOrbit || timedOut) {
        orb.state = 'burn_arrive';
        orb.transfer.burnStart = time;
        orb.orbitRadius = tr.r2;
        // Snap to target orbit radius at current angle
        const snapAngle = Math.atan2(posZ, posX);
        app.shipMesh.position.set(
          Math.cos(snapAngle) * tr.r2, 0, Math.sin(snapAngle) * tr.r2
        );
        orb.orbitAngle = snapAngle;
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

      // Advance ship slightly faster than planet to catch up
      let angleDiff = normalizeAngle(planetAngle - orb.orbitAngle);
      const catchupStep = sc.approachSpeed * deltaTime;
      if (Math.abs(angleDiff) < catchupStep * 2) {
        // Close enough — snap and dock
        orb.orbitAngle = planetAngle;
        orb.state = 'docked';
        orb.dockedPlanetId = te.data.id;
        orb.dockedAngle = 0;

        // Fire arrival callback
        if (orb.transfer.onArrive) {
          orb.transfer.onArrive(te);
        }
      } else {
        // Approach: add catchup to base orbital speed
        orb.orbitAngle += (te.data.orbitSpeed + sc.approachSpeed * Math.sign(angleDiff)) * deltaTime;
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

export function clearShip() {
  app.shipMesh = null;
  app.shipThrusterPoints = null;
  app.shipOrbit = null;
}

export function getShipPosition() {
  return app.shipMesh ? app.shipMesh.position : null;
}
