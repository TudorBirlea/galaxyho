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

export function createShipMesh() {
  const group = new THREE.Group();

  // Hull — cone pointing +Z
  const hullGeo = new THREE.ConeGeometry(0.12, 0.35, 6);
  hullGeo.rotateX(Math.PI / 2); // point along +Z
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x88bbcc });
  group.add(new THREE.Mesh(hullGeo, hullMat));

  // Wings — two small angled planes
  const wingGeo = new THREE.PlaneGeometry(0.24, 0.08);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0x6699aa, side: THREE.DoubleSide });
  const wing1 = new THREE.Mesh(wingGeo, wingMat);
  wing1.position.set(0.08, 0, -0.04);
  wing1.rotation.z = -0.5;
  group.add(wing1);
  const wing2 = new THREE.Mesh(wingGeo, wingMat.clone());
  wing2.position.set(-0.08, 0, -0.04);
  wing2.rotation.z = 0.5;
  group.add(wing2);

  // Engine glow sprite
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 64; glowCanvas.height = 64;
  const gCtx = glowCanvas.getContext('2d');
  const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(100,200,255,1)');
  grad.addColorStop(0.15, 'rgba(80,180,255,0.7)');
  grad.addColorStop(0.4, 'rgba(60,140,220,0.2)');
  grad.addColorStop(1, 'rgba(40,100,180,0)');
  gCtx.fillStyle = grad;
  gCtx.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glowSprite.scale.setScalar(0.18);
  glowSprite.position.set(0, 0, -0.2); // behind hull
  group.add(glowSprite);

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
  app.shipMesh.position.set(starRadius + 2, 0.5, 0);
  app.shipMesh.lookAt(0, 0.5, 0); // face star initially
}

export function flyShipToPlanet(targetEntry, onArrive) {
  if (!app.shipMesh || !targetEntry) return;
  if (app.shipFlightAnim) return; // already flying

  const startPos = app.shipMesh.position.clone();
  const endPos = targetEntry.mesh.position.clone();
  endPos.y += targetEntry.data.visualSize * 1.5; // hover slightly above planet

  const dist = startPos.distanceTo(endPos);
  const arcHeight = dist * CONFIG.ship.arcHeightFactor;
  const controlPos = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
  controlPos.y += arcHeight;

  const effects = getUpgradeEffects(app.state);
  const speedMult = effects.systemSpeedMult;
  const duration = Math.max(CONFIG.ship.flightSpeedMin, Math.min(CONFIG.ship.flightSpeedMax, dist * 0.4)) / speedMult;

  app.shipFlightAnim = {
    startPos, endPos, controlPos,
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

    // Current position on bezier
    evalBezier(anim.startPos, anim.controlPos, anim.endPos, t, app.shipMesh.position);

    // Look along curve tangent
    const tNext = Math.min(t + 0.02, 1);
    evalBezier(anim.startPos, anim.controlPos, anim.endPos, tNext, _tangent);
    _lookAt.copy(_tangent);
    if (_lookAt.distanceTo(app.shipMesh.position) > 0.001) {
      app.shipMesh.lookAt(_lookAt);
    }

    // Camera follow during flight
    const sc = CONFIG.ship;
    _desiredTarget.copy(app.shipMesh.position);
    _desiredCam.set(
      app.shipMesh.position.x + sc.cameraOffset[0],
      app.shipMesh.position.y + sc.cameraOffset[1],
      app.shipMesh.position.z + sc.cameraOffset[2]
    );
    controls.target.lerp(_desiredTarget, sc.cameraFollowLerp);
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
    // If docked at a planet, follow its orbit
    const dockedId = app.shipMesh.userData.dockedPlanetId;
    if (dockedId !== undefined && dockedId !== null) {
      const entry = app.systemPlanets.find(p => p.data.id === dockedId);
      if (entry) {
        const pos = entry.mesh.position;
        app.shipMesh.position.set(pos.x, pos.y + entry.data.visualSize * 1.5, pos.z);
      }
    }
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
