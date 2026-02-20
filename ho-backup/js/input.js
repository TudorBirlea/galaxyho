import * as THREE from 'three';
import { renderer, camera } from './engine.js';
import { app } from './app.js';
import { showTooltip, hideTooltip, showInfoCard, hideInfoCard, showLockMessage, hudLocation, ttEnter, backBtn, icClose } from './ui.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownTime = 0, pointerDownPos = { x: 0, y: 0 };
let lastTapTime = 0;

function getPointerPos(e) {
  return { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 };
}

function handleTap(e, isDouble, enterSystem) {
  const p = getPointerPos(e);
  pointer.set(p.x, p.y);
  raycaster.setFromCamera(pointer, camera);

  if (app.state.currentView === 'galaxy') {
    let closest = null, closestDist = Infinity;
    const _v = new THREE.Vector3();
    for (let i = 0; i < app.starSprites.length; i++) {
      const { star } = app.starSprites[i];
      _v.set(star.position.x, star.position.y, star.position.z).project(camera);
      if (_v.z > 1) continue;
      const sx = (_v.x + 1) * window.innerWidth / 2;
      const sy = (-_v.y + 1) * window.innerHeight / 2;
      const dist = Math.sqrt((sx - e.clientX) ** 2 + (sy - e.clientY) ** 2);
      if (dist < closestDist && dist < 30) {
        closest = star; closestDist = dist;
      }
    }
    if (closest) {
      if (!app.state.reachableStars.has(closest.id)) {
        showLockMessage();
        return;
      }
      app.selectedStar = closest;
      showTooltip(closest, e.clientX, e.clientY);
      hudLocation.textContent = closest.name;
      if (isDouble) enterSystem(closest);
    } else {
      app.selectedStar = null;
      hideTooltip();
      hudLocation.textContent = 'Galaxy View';
    }
  } else if (app.state.currentView === 'system') {
    const meshes = app.systemPlanets.map(p => p.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const planet = hits[0].object.userData.planet;
      showInfoCard(planet);
    } else {
      hideInfoCard();
    }
  }
}

export function setupInput({ enterSystem, exitSystem }) {
  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownTime = Date.now();
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    const dt = Date.now() - pointerDownTime;
    const dx = e.clientX - pointerDownPos.x, dy = e.clientY - pointerDownPos.y;
    if (dt < 350 && Math.sqrt(dx * dx + dy * dy) < 12) {
      const now = Date.now();
      const isDouble = (now - lastTapTime) < 350;
      lastTapTime = now;
      handleTap(e, isDouble, enterSystem);
    }
  });

  ttEnter.addEventListener('click', (e) => {
    e.stopPropagation();
    if (app.selectedStar) enterSystem(app.selectedStar);
  });

  backBtn.addEventListener('click', () => exitSystem());
  icClose.addEventListener('click', () => hideInfoCard());
}
