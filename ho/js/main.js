import * as THREE from 'three';
import { CONFIG } from './config.js?v=3.7';
import { generateGalaxy, generatePlanets, starDistance } from './data.js?v=3.7';
import { camera, controls, composer, clock, galaxyGroup, systemGroup, bloomPass,
         bloomTintPass, grainPass } from './engine.js?v=3.7';
import { createState, saveState, loadState } from './state.js?v=3.7';
import { app } from './app.js?v=3.7';
import { easeInOutCubic } from './utils.js?v=3.7';
import { hideTooltip, hideInfoCard, updateHUD, hudLocation, backBtn, overlay,
         renderJournal, showJournalNotice } from './ui.js?v=3.7';
import { buildGalaxyView } from './galaxy-view.js?v=3.7';
import { buildSystemView, clearSystemView, updateSystemView } from './system-view.js?v=3.7';
import { setupInput } from './input.js?v=3.7';
import { drawMinimap } from './minimap.js?v=3.7';

// ── Transition state ──
let transAnim = null;

function init() {
  const saved = loadState();
  app.state = saved || createState(CONFIG.galaxy.seed);
  app.galaxy = generateGalaxy(app.state.galaxySeed);

  for (const star of app.galaxy.stars) {
    if (app.state.visitedStars.has(star.id)) star.visited = true;
  }

  const star0 = app.galaxy.stars[0];
  app.state.reachableStars.add(0);
  for (const adjId of star0.adjacentIds) {
    app.state.reachableStars.add(adjId);
  }

  if (!saved) {
    app.state.visitedStars.add(0);
    star0.visited = true;
    const planets = generatePlanets(star0);
    const terran = planets.filter(p => p.type === 'terran').sort((a, b) => b.habitability - a.habitability)[0];
    app.state.shipPlanetId = terran ? terran.id : 0;
    addJournal({ type: 'start', starId: 0, planetId: app.state.shipPlanetId });
    saveState(app.state);
  }

  buildGalaxyView(app.galaxy, app.state);
  updateHUD(app.galaxy, app.state);
  hudLocation.textContent = 'Galaxy View';

  setupInput({ enterSystem, exitSystem, jumpToStar, scanPlanet });
  drawMinimap(app.galaxy, app.state, app.selectedStar);
  animate();
}

// ── Journal ──

function addJournal(entry) {
  entry.timestamp = Date.now();
  app.state.journal.push(entry);
  showJournalNotice();
}

export function getJournal() { return app.state.journal; }

// ── Planet scanning ──

function scanPlanet(planet) {
  const key = app.state.currentStarId + '-' + planet.id;
  if (app.state.scannedPlanets.has(key)) return;
  app.state.scannedPlanets.add(key);
  addJournal({ type: 'scan_planet', starId: app.state.currentStarId, planetId: planet.id, planetName: planet.name, planetType: planet.label });
  if (planet.special) {
    addJournal({ type: 'discovery', starId: app.state.currentStarId, planetId: planet.id, special: planet.special });
  }
  saveState(app.state);
}

// ── Jump to a different star ──

function jumpToStar(star) {
  if (app.transitioning) return;
  if (star.id === app.state.shipStarId) {
    enterSystem(star);
    return;
  }

  const fromStar = app.galaxy.stars[app.state.shipStarId];
  const dist = starDistance(fromStar, star);

  addJournal({ type: 'jump', fromStarId: app.state.shipStarId, toStarId: star.id, distance: Math.round(dist * 10) / 10 });

  app.state.shipStarId = star.id;
  app.state.shipPlanetId = null;

  if (!app.state.visitedStars.has(star.id)) {
    app.state.visitedStars.add(star.id);
    star.visited = true;
    for (const adjId of star.adjacentIds) {
      app.state.reachableStars.add(adjId);
    }
  }
  saveState(app.state);

  enterSystem(star);
}

// ── Enter system view (camera fly-in) ──

function enterSystem(star) {
  if (app.transitioning) return;
  if (app.state.currentView !== 'galaxy') return;
  hideTooltip();
  app.state.currentView = 'system';
  app.state.currentStarId = star.id;
  app.transitioning = true;

  if (!app.state.visitedStars.has(star.id)) {
    app.state.visitedStars.add(star.id);
    star.visited = true;
    for (const adjId of star.adjacentIds) {
      app.state.reachableStars.add(adjId);
    }
    saveState(app.state);
  }

  addJournal({ type: 'enter_system', starId: star.id });

  const tc = CONFIG.transition;
  const starPos = new THREE.Vector3(star.position.x, star.position.y, star.position.z);

  transAnim = {
    startTime: clock.getElapsedTime(),
    duration: tc.enterDuration,
    fromPos: camera.position.clone(),
    toPos: starPos.clone(),
    fromTarget: controls.target.clone(),
    toTarget: starPos.clone(),
    fadePoint: tc.fadePoint,
    swapped: false,
    star,
    exitAnim: false,
  };
}

// ── Exit system view ──

function exitSystem() {
  if (app.transitioning) return;
  if (app.state.currentView !== 'system') return;
  hideInfoCard();
  app.state.currentView = 'galaxy';
  const prevStarId = app.state.currentStarId;
  app.state.currentStarId = null;
  app.transitioning = true;

  const tc = CONFIG.transition;
  const gc = CONFIG.camera.galaxy;
  const star = app.galaxy.stars[prevStarId];
  const starPos = new THREE.Vector3(star.position.x, star.position.y, star.position.z);

  overlay.style.transition = 'opacity 0.3s';
  overlay.style.opacity = '1';

  setTimeout(() => {
    clearSystemView();
    systemGroup.visible = false;
    galaxyGroup.visible = true;
    buildGalaxyView(app.galaxy, app.state);
    updateHUD(app.galaxy, app.state);

    camera.fov = gc.fov;
    camera.near = gc.near;
    camera.far = gc.far;
    camera.updateProjectionMatrix();
    controls.minDistance = gc.minDist;
    controls.maxDistance = gc.maxDist;

    camera.position.copy(starPos).add(new THREE.Vector3(0, 15, 20));
    controls.target.copy(starPos);
    controls.update();

    backBtn.style.display = 'none';
    document.getElementById('tune-panel').style.display = 'none';
    hudLocation.textContent = 'Galaxy View';
    saveState(app.state);
    drawMinimap(app.galaxy, app.state, app.selectedStar);

    // Restore bloom for galaxy view
    bloomPass.threshold = CONFIG.bloom.threshold;
    bloomPass.strength = CONFIG.bloom.strength;
    // v2: enable bloom tint in galaxy view
    bloomTintPass.uniforms.u_enabled.value = 1.0;

    overlay.style.opacity = '0';

    transAnim = {
      startTime: clock.getElapsedTime(),
      duration: tc.exitDuration,
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(...gc.pos),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...gc.target),
      fadePoint: 2,
      swapped: true,
      star: null,
      exitAnim: true,
    };
  }, 350);
}

// ── Animation loop ──

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (transAnim) {
    const elapsed = t - transAnim.startTime;
    const progress = Math.min(elapsed / transAnim.duration, 1);
    const eased = easeInOutCubic(progress);

    camera.position.lerpVectors(transAnim.fromPos, transAnim.toPos, eased);
    controls.target.lerpVectors(transAnim.fromTarget, transAnim.toTarget, eased);

    if (!transAnim.swapped && progress >= transAnim.fadePoint) {
      transAnim.swapped = true;
      overlay.style.transition = 'opacity 0.25s';
      overlay.style.opacity = '1';

      setTimeout(() => {
        galaxyGroup.visible = false;
        systemGroup.visible = true;
        buildSystemView(transAnim.star);

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
        document.getElementById('tune-panel').style.display = 'block';
        hudLocation.textContent = transAnim.star.name;
        updateHUD(app.galaxy, app.state);
        drawMinimap(app.galaxy, app.state, app.selectedStar);

        // Disable bloom in system view (star shader handles its own glow)
        bloomPass.strength = 0;
        // v2: disable bloom tint in system view (nothing to tint)
        bloomTintPass.uniforms.u_enabled.value = 0.0;

        transAnim = null;
        app.transitioning = false;

        setTimeout(() => { overlay.style.opacity = '0'; }, 50);
      }, 280);
    }

    if (transAnim && transAnim.exitAnim && progress >= 1) {
      transAnim = null;
      app.transitioning = false;
      controls.update();
    }
  }

  controls.update();

  // v2: Update film grain time
  grainPass.uniforms.u_time.value = t;

  if (app.state.currentView === 'system') {
    updateSystemView(t);
  } else if (app.galaxyStarsMat) {
    app.galaxyStarsMat.uniforms.u_time.value = t;
    if (app.shipMarkerMat) app.shipMarkerMat.uniforms.u_time.value = t;

    // Update nebula time + billboarding
    for (const mesh of app.nebulaMeshes) {
      mesh.material.uniforms.u_time.value = t;
      // v2: billboard nebulae toward camera
      mesh.lookAt(camera.position);
    }

    // v3: Update dust lane time
    for (const mesh of app.dustLaneMeshes) {
      mesh.material.uniforms.u_time.value = t;
    }
    // v3: Update warp trail time
    for (const trail of app.warpTrailEntries) {
      trail.material.uniforms.u_time.value = t;
    }

    // v2: Update background star parallax
    if (app.camOrigin && app.bgStarLayers.length > 0) {
      const dx = camera.position.x - app.camOrigin.x;
      const dy = camera.position.y - app.camOrigin.y;
      const dz = camera.position.z - app.camOrigin.z;
      for (const layer of app.bgStarLayers) {
        layer.points.position.set(dx * layer.drift, dy * layer.drift, dz * layer.drift);
      }
    }
  }

  composer.render();
}

// ── Tuning panel controls ──
function setupTuneSlider(id, valId, onChange) {
  const inp = document.getElementById(id);
  const val = document.getElementById(valId);
  inp.addEventListener('input', () => {
    val.textContent = inp.value;
    onChange(parseFloat(inp.value));
  });
}
setupTuneSlider('tune-glow-size', 'tune-glow-size-val', v => {
  if (app.starGlowSprite) {
    const sr = app.systemStarMesh ? app.systemStarMesh.material.uniforms.u_starRadius.value : 4;
    app.starGlowSprite.scale.setScalar(sr * v);
  }
});
setupTuneSlider('tune-glow-int', 'tune-glow-int-val', v => {
  if (app.starGlowSprite) app.starGlowSprite.material.opacity = v;
});
setupTuneSlider('tune-stars', 'tune-stars-val', v => {
  if (app.starfieldMat) app.starfieldMat.uniforms.u_boost.value = v;
});

init();
