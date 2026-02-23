import * as THREE from 'three';
import { renderer, camera } from './engine.js?v=3.4';
import { app } from './app.js?v=3.4';
import { showTooltip, hideTooltip, showInfoCard, hideInfoCard, showLockMessage,
         hudLocation, ttEnter, ttJump, backBtn, icClose, journalBtn, journalClose,
         toggleJournal, renderJournal } from './ui.js?v=3.4';
import { starDistance } from './data.js?v=3.4';
import { drawMinimap } from './minimap.js?v=3.4';
import { capturePlanetSnapshot } from './system-view.js?v=3.4';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownTime = 0, pointerDownPos = { x: 0, y: 0 };

function getPointerPos(e) {
  return { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 };
}

function handleTap(e, callbacks) {
  if (app.transitioning) return;
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
      const shipStar = app.galaxy.stars[app.state.shipStarId];
      const dist = closest.id === app.state.shipStarId ? 0 : starDistance(shipStar, closest);
      const isShipHere = closest.id === app.state.shipStarId;
      showTooltip(closest, e.clientX, e.clientY, dist, isShipHere, closest.visited);
      hudLocation.textContent = closest.name;
      drawMinimap(app.galaxy, app.state, app.selectedStar);
    } else {
      app.selectedStar = null;
      hideTooltip();
      hudLocation.textContent = 'Galaxy View';
      drawMinimap(app.galaxy, app.state, null);
    }
  } else if (app.state.currentView === 'system') {
    const meshes = app.systemPlanets.map(p => p.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const planet = hits[0].object.userData.planet;
      const entry = app.systemPlanets.find(p => p.data.id === planet.id);
      const snapshot = entry ? capturePlanetSnapshot(entry) : null;
      showInfoCard(planet, snapshot);
      callbacks.scanPlanet(planet);
    } else {
      hideInfoCard();
    }
  }
}

export function setupInput({ enterSystem, exitSystem, jumpToStar, scanPlanet }) {
  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownTime = Date.now();
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    const dt = Date.now() - pointerDownTime;
    const dx = e.clientX - pointerDownPos.x, dy = e.clientY - pointerDownPos.y;
    if (dt < 350 && Math.sqrt(dx * dx + dy * dy) < 12) {
      handleTap(e, { scanPlanet });
    }
  });

  ttEnter.addEventListener('click', (e) => {
    e.stopPropagation();
    if (app.selectedStar && app.selectedStar.id === app.state.shipStarId) {
      enterSystem(app.selectedStar);
    }
  });

  ttJump.addEventListener('click', (e) => {
    e.stopPropagation();
    if (app.selectedStar && app.selectedStar.id !== app.state.shipStarId) {
      jumpToStar(app.selectedStar);
    }
  });

  backBtn.addEventListener('click', () => exitSystem());
  icClose.addEventListener('click', () => hideInfoCard());

  journalBtn.addEventListener('click', () => {
    toggleJournal();
    if (app.journalVisible) {
      renderJournal(app.state.journal, app.galaxy);
    }
  });
  journalClose.addEventListener('click', () => toggleJournal());
}
