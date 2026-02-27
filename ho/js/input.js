import * as THREE from 'three';
import { renderer, camera } from './engine.js?v=5.0';
import { app } from './app.js?v=5.0';
import { showTooltip, hideTooltip, showInfoCard, hideInfoCard, showLockMessage,
         hudLocation, ttEnter, ttJump, backBtn, icClose, journalBtn, journalClose,
         toggleJournal, renderJournal } from './ui.js?v=5.0';
import { starDistance } from './data.js?v=5.0';
import { drawMinimap } from './minimap.js?v=5.0';
import { capturePlanetSnapshot } from './system-view.js?v=5.0';
import { flyShipToPlanet, isShipFlying, getDockedPlanetId } from './ship.js?v=5.0';
import { getUpgradeEffects } from './gameplay.js?v=5.0';

function isStarReachable(starId) {
  if (app.state.reachableStars.has(starId)) return true;
  // Extended Range upgrade: 2-hop jumps from ship's current star
  const effects = getUpgradeEffects(app.state);
  if (effects.jumpRange >= 2) {
    const shipStar = app.galaxy.stars[app.state.shipStarId];
    for (const adjId of shipStar.adjacentIds) {
      const adjStar = app.galaxy.stars[adjId];
      if (adjStar.adjacentIds.includes(starId)) return true;
    }
  }
  return false;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownTime = 0, pointerDownPos = { x: 0, y: 0 };

function getPointerPos(e) {
  return { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 };
}

function handleTap(e) {
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
      if (!isStarReachable(closest.id)) {
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
    // Ignore taps while ship is flying or event card is open
    if (isShipFlying() || app.eventCardVisible) return;

    const meshes = app.systemPlanets.map(p => p.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const planet = hits[0].object.userData.planet;
      const entry = app.systemPlanets.find(p => p.data.id === planet.id);

      if (app.selectedPlanetId === planet.id) {
        // Second click on same planet → fly ship (unless already docked there)
        const dockedId = getDockedPlanetId();
        if (dockedId !== planet.id) {
          flyShipToPlanet(entry, (arrivedEntry) => {
            // Refresh info card now that ship is docked
            const snapshot = capturePlanetSnapshot(arrivedEntry);
            showInfoCard(arrivedEntry.data, snapshot);
          });
        }
      } else {
        // First click → show info card
        app.selectedPlanetId = planet.id;
        const snapshot = capturePlanetSnapshot(entry);
        showInfoCard(entry.data, snapshot);
      }
    } else {
      hideInfoCard();
      app.selectedPlanetId = null;
      if (app.selectionRing) app.selectionRing.visible = false;
    }
  }
}

export function setupInput({ enterSystem, exitSystem, jumpToStar }) {
  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownTime = Date.now();
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    const dt = Date.now() - pointerDownTime;
    const dx = e.clientX - pointerDownPos.x, dy = e.clientY - pointerDownPos.y;
    if (dt < 350 && Math.sqrt(dx * dx + dy * dy) < 12) {
      handleTap(e);
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

  backBtn.addEventListener('click', () => {
    if (app.eventCardVisible) return; // v5: don't exit during event
    exitSystem();
  });
  icClose.addEventListener('click', () => hideInfoCard());

  journalBtn.addEventListener('click', () => {
    toggleJournal();
    if (app.journalVisible) {
      renderJournal(app.state.journal, app.galaxy);
    }
  });
  journalClose.addEventListener('click', () => toggleJournal());
}
