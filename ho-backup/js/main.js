import { CONFIG } from './config.js';
import { generateGalaxy } from './data.js';
import { camera, controls, composer, clock, galaxyGroup, systemGroup } from './engine.js';
import { createState, saveState, loadState } from './state.js';
import { app } from './app.js';
import { hideTooltip, hideInfoCard, updateHUD, hudLocation, backBtn, overlay } from './ui.js';
import { buildGalaxyView } from './galaxy-view.js';
import { buildSystemView, clearSystemView, updateSystemView } from './system-view.js';
import { setupInput } from './input.js';

function init() {
  const saved = loadState();
  app.state = saved || createState(CONFIG.galaxy.seed);
  app.galaxy = generateGalaxy(app.state.galaxySeed);

  // Restore visited state into galaxy data
  for (const star of app.galaxy.stars) {
    if (app.state.visitedStars.has(star.id)) star.visited = true;
  }

  // Ensure home star's neighbors are always reachable
  const star0 = app.galaxy.stars[0];
  app.state.reachableStars.add(0);
  for (const adjId of star0.adjacentIds) {
    app.state.reachableStars.add(adjId);
  }

  buildGalaxyView(app.galaxy, app.state);
  updateHUD(app.galaxy, app.state);
  hudLocation.textContent = 'Galaxy View';

  setupInput({ enterSystem, exitSystem });
  animate();
}

function enterSystem(star) {
  if (app.state.currentView !== 'galaxy') return;
  hideTooltip();
  app.state.currentView = 'system';
  app.state.currentStarId = star.id;

  // Mark visited and unlock neighbors
  if (!app.state.visitedStars.has(star.id)) {
    app.state.visitedStars.add(star.id);
    star.visited = true;
    for (const adjId of star.adjacentIds) {
      app.state.reachableStars.add(adjId);
    }
    saveState(app.state);
  }

  // Transition
  overlay.classList.add('active');
  setTimeout(() => {
    galaxyGroup.visible = false;
    systemGroup.visible = true;
    buildSystemView(star);

    // Reconfigure camera for system view
    const sc = CONFIG.camera.system;
    camera.fov = sc.fov;
    camera.near = sc.near;
    camera.far = sc.far;
    camera.updateProjectionMatrix();
    camera.position.set(...sc.pos);
    controls.target.set(...sc.target);
    controls.minDistance = sc.minDist;
    controls.maxDistance = sc.maxDist;
    controls.update();

    backBtn.style.display = 'block';
    hudLocation.textContent = star.name;
    updateHUD(app.galaxy, app.state);

    setTimeout(() => overlay.classList.remove('active'), 50);
  }, 400);
}

function exitSystem() {
  if (app.state.currentView !== 'system') return;
  hideInfoCard();
  app.state.currentView = 'galaxy';
  app.state.currentStarId = null;

  overlay.classList.add('active');
  setTimeout(() => {
    clearSystemView();
    systemGroup.visible = false;
    galaxyGroup.visible = true;
    buildGalaxyView(app.galaxy, app.state);

    // Reconfigure camera for galaxy view
    const gc = CONFIG.camera.galaxy;
    camera.fov = gc.fov;
    camera.near = gc.near;
    camera.far = gc.far;
    camera.updateProjectionMatrix();
    camera.position.set(...gc.pos);
    controls.target.set(...gc.target);
    controls.minDistance = gc.minDist;
    controls.maxDistance = gc.maxDist;
    controls.update();

    backBtn.style.display = 'none';
    hudLocation.textContent = 'Galaxy View';
    saveState(app.state);

    setTimeout(() => overlay.classList.remove('active'), 50);
  }, 400);
}

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  controls.update();

  if (app.state.currentView === 'system') {
    updateSystemView(t);
  } else if (app.galaxyStarsMat) {
    app.galaxyStarsMat.uniforms.u_time.value = t;
  }

  composer.render();
}

init();
